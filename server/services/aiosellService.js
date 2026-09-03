import crypto from 'crypto';
import dotenv from 'dotenv';
import { 
  getChannelProviderConfig, 
  logProviderDiagnostic, 
  createProviderError 
} from './providerConfig.js';

dotenv.config();

/**
 * Resolves configuration from either hotelId or hotelConfig object.
 */
export const resolveConfig = async (hotelConfig = {}) => {
  if (typeof hotelConfig === 'string') {
    return getChannelProviderConfig(hotelConfig);
  }
  if (hotelConfig?.hotelId && (!hotelConfig.hotelCode || !hotelConfig.partnerId || !hotelConfig.username || !hotelConfig.password)) {
    return getChannelProviderConfig(hotelConfig.hotelId);
  }

  const partnerId = hotelConfig.partnerId || hotelConfig.aiosell_partner_id || process.env.AIOSELL_PARTNER_ID || 'hotel-mantri-pms';
  const hotelCode = hotelConfig.hotelCode || hotelConfig.aiosell_hotel_code || process.env.AIOSELL_HOTEL_CODE;
  const environment = hotelConfig.environment || hotelConfig.aiosell_environment || process.env.AIOSELL_ENVIRONMENT || 'production';
  const username = hotelConfig.username || process.env.AIOSELL_USERNAME || '';
  const password = hotelConfig.password || process.env.AIOSELL_PASSWORD || '';
  const baseUrl = (hotelConfig.baseUrl || process.env.AIOSELL_BASE_URL || 'https://live.aiosell.com/api/v2/cm').replace(/\/+$/, '');

  return {
    hotelId: hotelConfig.hotelId || null,
    hotelCode,
    partnerId,
    environment,
    username,
    password,
    baseUrl,
    credentialPresent: Boolean(username && password)
  };
};

export const getConfig = (hotelConfig = {}) => {
  return {
    baseUrl: (hotelConfig.baseUrl || process.env.AIOSELL_BASE_URL || 'https://live.aiosell.com/api/v2/cm').replace(/\/+$/, ''),
    username: hotelConfig.username || process.env.AIOSELL_USERNAME || '',
    password: hotelConfig.password || process.env.AIOSELL_PASSWORD || '',
    partnerId: hotelConfig.partnerId || hotelConfig.aiosell_partner_id || process.env.AIOSELL_PARTNER_ID || 'hotel-mantri-pms',
    hotelCode: hotelConfig.hotelCode || hotelConfig.aiosell_hotel_code || process.env.AIOSELL_HOTEL_CODE,
    environment: hotelConfig.environment || hotelConfig.aiosell_environment || process.env.AIOSELL_ENVIRONMENT || 'production',
  };
};

export const buildBasicAuthHeader = (username, password) => {
  if (!username || !password) return null;
  const token = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${token}`;
};

export const sanitizeAiosellError = (error, status, reqId = null) => {
  const rawMessage = typeof error === 'string' 
    ? error 
    : (error?.message || error?.error || error?.msg || (typeof error === 'object' ? JSON.stringify(error) : ''));

  const msgLower = String(rawMessage).toLowerCase();

  // 1. Partner is disabled detection
  if (msgLower.includes('partner is disabled') || msgLower.includes('partner disabled')) {
    return {
      provider: 'channel_integration',
      status: 502,
      code: 'PROVIDER_PARTNER_DISABLED',
      message: 'The channel integration partner account is disabled. Please contact the channel provider to activate the partner account.',
      requestId: reqId,
      retryable: false
    };
  }

  // 2. Authentication failure
  const isAuthError = status === 401 || status === 403 || msgLower.includes('authentication') || msgLower.includes('unauthorized') || msgLower.includes('invalid credentials');
  if (isAuthError) {
    return {
      provider: 'channel_integration',
      status: 401,
      code: 'PROVIDER_AUTHENTICATION_FAILED',
      message: 'Channel integration authentication failed. Verify the server-side integration credentials.',
      requestId: reqId,
      retryable: false
    };
  }

  // 3. Not Found
  if (status === 404 || msgLower.includes('not found')) {
    return {
      provider: 'channel_integration',
      status: 404,
      code: 'PROVIDER_PROPERTY_NOT_FOUND',
      message: 'External property or endpoint could not be found.',
      requestId: reqId,
      retryable: false
    };
  }

  // 4. Rate limit
  if (status === 429) {
    return {
      provider: 'channel_integration',
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Channel integration rate limit reached. Please wait before retrying.',
      requestId: reqId,
      retryable: true
    };
  }

  // 5. Upstream server error / network error
  if (status >= 500 || !status || msgLower.includes('fetch failed')) {
    return {
      provider: 'channel_integration',
      status: status && status >= 500 ? status : 503,
      code: 'PROVIDER_UNAVAILABLE',
      message: 'The channel distribution provider is temporarily unavailable. Please retry shortly.',
      requestId: reqId,
      retryable: true
    };
  }

  return {
    provider: 'channel_integration',
    status: status || 500,
    code: 'API_ERROR',
    message: rawMessage || 'An error occurred while communicating with the channel integration provider.',
    requestId: reqId,
    retryable: false
  };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const request = async (endpoint, options = {}, hotelConfig = {}, retries = 2) => {
  const config = await resolveConfig(hotelConfig);
  const url = `${config.baseUrl}${endpoint}`;
  const authHeader = buildBasicAuthHeader(config.username, config.password);

  const reqId = options.requestId || `HM-CH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  if (!authHeader) {
    logProviderDiagnostic({
      operation: 'AUTH_CHECK',
      hotelId: config.hotelId,
      hotelCode: config.hotelCode,
      partnerId: config.partnerId,
      endpoint: url,
      method: options.method || 'GET',
      status: 401,
      credentialPresent: false,
      environment: config.environment,
      requestId: reqId,
      message: 'Missing server-side credentials'
    });
    throw sanitizeAiosellError('Server credentials are missing', 401, reqId);
  }

  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Authorization': authHeader,
  };

  const fetchOptions = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  logProviderDiagnostic({
    operation: 'OUTBOUND_REQUEST',
    hotelId: config.hotelId,
    hotelCode: config.hotelCode,
    partnerId: config.partnerId,
    endpoint: url,
    method: options.method || 'GET',
    status: null,
    credentialPresent: true,
    environment: config.environment,
    requestId: reqId,
    message: options.body ? `Payload size: ${options.body.length} bytes` : 'No payload'
  });

  let attempt = 0;
  const backoffs = [1500, 3500];

  while (attempt <= retries) {
    try {
      const response = await fetch(url, fetchOptions);
      const status = response.status;
      
      let responseText = await response.text();
      let responseData;
      
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        responseData = responseText;
      }

      logProviderDiagnostic({
        operation: 'OUTBOUND_RESPONSE',
        hotelId: config.hotelId,
        hotelCode: config.hotelCode,
        partnerId: config.partnerId,
        endpoint: url,
        method: options.method || 'GET',
        status,
        credentialPresent: true,
        environment: config.environment,
        requestId: reqId,
        message: `Attempt ${attempt + 1}/${retries + 1}`
      });

      // Check if upstream response payload itself reports failure (e.g. { success: false, message: 'Partner is disabled!' })
      if (responseData && typeof responseData === 'object' && responseData.success === false) {
        const sanitized = sanitizeAiosellError(responseData, status || 400, reqId);
        throw sanitized;
      }

      if (response.ok) {
        return responseData;
      }

      if ([401, 403, 400, 404].includes(status) || attempt === retries) {
        throw sanitizeAiosellError(responseData, status, reqId);
      }

      if ([429, 500, 502, 503, 504].includes(status)) {
        await sleep(backoffs[attempt] || 5000);
        attempt++;
      } else {
        throw sanitizeAiosellError(responseData, status, reqId);
      }
    } catch (error) {
      if (error.provider === 'channel_integration') throw error;
      if (attempt === retries) {
        throw sanitizeAiosellError(error.message, 500, reqId);
      }
      await sleep(backoffs[attempt] || 5000);
      attempt++;
    }
  }
};

export const testConnection = async (hotelConfig) => {
  const config = await resolveConfig(hotelConfig);
  const start = Date.now();

  const debugDiagnostic = {
    baseUrlConfigured: !!config.baseUrl,
    usernameConfigured: !!config.username,
    passwordConfigured: !!config.password,
    partnerId: config.partnerId,
    hotelCode: config.hotelCode,
    environment: config.environment
  };

  if (!config.partnerId || !config.hotelCode) {
    return {
      success: false,
      error: sanitizeAiosellError('Channel credentials (partner ID or hotel code) are not configured for this hotel.', 400),
      diagnostic: debugDiagnostic
    };
  }

  if (!config.username || !config.password) {
    return {
      success: false,
      error: {
        provider: 'channel_integration',
        status: 401,
        code: 'PROVIDER_CONFIGURATION_MISSING',
        message: 'Server integration credentials are unavailable.'
      },
      diagnostic: debugDiagnostic
    };
  }

  try {
    const data = await request(`/property_details/${config.hotelCode}?partnerId=${config.partnerId}`, {}, config);
    const responseTimeMs = Date.now() - start;

    return {
      success: true,
      provider: 'channel_integration',
      environment: config.environment,
      hotelCode: config.hotelCode,
      partnerId: config.partnerId,
      status: 200,
      responseTimeMs,
      message: 'Channel integration connection successful',
      mapping: {
        rooms: (data.rooms || []).map(r => ({
          description: r.description || '',
          count: parseInt(r.count) || 1,
          active: r.active !== false,
          type: r.type || 'primary',
          rateplans: (r.rateplans || []).map(rp => ({
            description: rp.description || '',
            occupancy: rp.occupancy || 1,
            rateplan_id: rp.rateplan_id || rp.rateplanCode || rp.ratePlanId || '',
            rateplan_name: rp.rateplan_name || rp.rateplanName || rp.ratePlanName || '',
            no_of_meals: rp.no_of_meals || 0,
            extra_adult: rp.extra_adult || 0
          })),
          room_id: r.room_id || r.roomId || r.roomCode || '',
          room_name: r.room_name || r.roomName || r.description || '',
          min_occ: r.min_occ || 1,
          max_occ: r.max_occ || 3
        })),
        ratePlans: []
      }
    };
  } catch (err) {
    const responseTimeMs = Date.now() - start;
    return {
      success: false,
      status: err.status || 500,
      responseTimeMs,
      error: err,
      diagnostic: debugDiagnostic
    };
  }
};

export const getPropertyMapping = async (hotelConfig) => {
  const config = await resolveConfig(hotelConfig);

  if (!config.username || !config.password || !config.partnerId || !config.hotelCode) {
    throw sanitizeAiosellError('Channel credentials are not configured for this hotel.', 401);
  }

  const data = await request(`/property_details/${config.hotelCode}?partnerId=${config.partnerId}`, {}, config);
  
  const rooms = (data.rooms || []).map(r => ({
    room_id: r.room_id || r.roomId || r.roomCode || '',
    room_name: r.room_name || r.roomName || r.description || r.roomCode || '',
    count: parseInt(r.count) || 1,
  }));

  const ratePlans = [];
  if (Array.isArray(data.rooms)) {
    data.rooms.forEach(r => {
      const roomId = r.room_id || r.roomId || r.roomCode || '';
      if (Array.isArray(r.rateplans)) {
        r.rateplans.forEach(rp => ratePlans.push({
          rate_plan_id: rp.rateplan_id || rp.rateplanCode || rp.ratePlanId || '',
          rate_plan_name: rp.rateplan_name || rp.rateplanName || rp.ratePlanName || rp.rateplanCode || '',
          room_id: roomId
        }));
      }
    });
  }

  return {
    hotelCode: config.hotelCode,
    rooms,
    ratePlans
  };
};

export const pushInventory = async (payload, hotelConfig) => {
  const config = await resolveConfig(hotelConfig);
  return await request(`/update/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, config);
};

export const pushRates = async (payload, hotelConfig) => {
  const config = await resolveConfig(hotelConfig);
  return await request(`/update-rates/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, config);
};

export const pushInventoryRestrictions = async (payload, hotelConfig) => {
  const config = await resolveConfig(hotelConfig);
  return request(`/update/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, config);
};

export const pushRateRestrictions = async (payload, hotelConfig) => {
  const config = await resolveConfig(hotelConfig);
  return request(`/update-rates/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, config);
};

export const fetchInventory = async (startDate, endDate, hotelConfig) => {
  const config = await resolveConfig(hotelConfig);
  return request(`/data/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'inventory',
      hotelCode: config.hotelCode,
      startDate,
      endDate,
    }),
  }, config);
};

export const fetchRates = async (startDate, endDate, hotelConfig) => {
  const config = await resolveConfig(hotelConfig);
  return request(`/data/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'rates',
      hotelCode: config.hotelCode,
      startDate,
      endDate,
    }),
  }, config);
};

export const fetchReservations = async (startDate, endDate, hotelConfig) => {
  const config = await resolveConfig(hotelConfig);
  let allReservations = [];
  let page = 1;
  const limit = 50;
  let hasMore = true;

  while (hasMore) {
    const result = await request(`/data/${config.partnerId}`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'reservation',
        hotelCode: config.hotelCode,
        startDate,
        endDate,
        page,
        limit,
      }),
    }, config);

    let reservationsArray = [];
    if (Array.isArray(result)) {
      reservationsArray = result;
    } else if (result && Array.isArray(result.data)) {
      reservationsArray = result.data;
    } else if (result && Array.isArray(result.reservations)) {
      reservationsArray = result.reservations;
    } else if (result && typeof result === 'object' && !result.success) {
      if (page === 1) throw sanitizeAiosellError(result, 400);
      break;
    }

    allReservations = allReservations.concat(reservationsArray);

    if (reservationsArray.length < limit) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return allReservations;
};

export const markNoShow = async (bookingId, hotelConfig) => {
  const config = await resolveConfig(hotelConfig);
  return request(`/no-show/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify({
      hotelCode: config.hotelCode,
      bookingId,
    }),
  }, config);
};

export const channelMultiplier = async (payload, hotelConfig) => {
  const config = await resolveConfig(hotelConfig);
  return request(`/channel-multiplier/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, config);
};

export default {
  resolveConfig,
  getConfig,
  testConnection,
  getPropertyMapping,
  pushInventory,
  pushRates,
  pushInventoryRestrictions,
  pushRateRestrictions,
  fetchInventory,
  fetchRates,
  fetchReservations,
  markNoShow,
  channelMultiplier,
  sanitizeAiosellError,
};
