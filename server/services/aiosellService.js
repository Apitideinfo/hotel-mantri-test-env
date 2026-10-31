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
  const hotelCode = hotelConfig.hotelCode || hotelConfig.aiosell_hotel_code || null;
  const environment = hotelConfig.environment || hotelConfig.aiosell_environment || process.env.AIOSELL_ENVIRONMENT || 'production';
  const username = hotelConfig.username || process.env.AIOSELL_USERNAME || 'hotel-mantri-pms';
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
    hotelCode: hotelConfig.hotelCode || hotelConfig.aiosell_hotel_code || null,
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
      success: false,
      provider: 'external_channel_manager',
      status: 502,
      errorCode: 'PROVIDER_PARTNER_DISABLED',
      code: 'PROVIDER_PARTNER_DISABLED',
      message: 'The channel integration partner account is disabled. Please contact the channel provider to activate the partner account.',
      requestId: reqId,
      retryable: false
    };
  }

  // 2. Authentication failure: ONLY for HTTP 401 or explicit credentials rejection
  const isAuthError = status === 401 || msgLower.includes('authentication required') || msgLower.includes('invalid credentials') || msgLower.includes('unauthorized');
  if (isAuthError) {
    return {
      success: false,
      provider: 'external_channel_manager',
      status: 401,
      errorCode: 'AIOSSELL_AUTH_FAILED',
      code: 'AIOSSELL_AUTH_FAILED',
      message: 'The channel manager rejected the server-side integration credentials.',
      requestId: reqId,
      retryable: false
    };
  }

  // 3. Hotel Not Found: 404
  if (status === 404 || msgLower.includes('not found') || msgLower.includes('hotel not found') || msgLower.includes('property not found')) {
    return {
      success: false,
      provider: 'external_channel_manager',
      status: 404,
      errorCode: 'AIOSSELL_HOTEL_NOT_FOUND',
      code: 'AIOSSELL_HOTEL_NOT_FOUND',
      message: 'The configured hotel code was not found by the channel manager.',
      requestId: reqId,
      retryable: false
    };
  }

  // 4. Access Denied / Property Code Invalid or Not Authorized
  if (status === 403 || msgLower.includes('access denied')) {
    return {
      success: false,
      provider: 'external_channel_manager',
      status: 403,
      errorCode: 'AIOSSELL_HOTEL_CODE_INVALID',
      code: 'AIOSSELL_HOTEL_CODE_INVALID',
      message: 'The channel manager denied access to this property code. Please verify the external hotel code or ensure the property is mapped to partner "hotel-mantri-pms" in Aiosell Connect.',
      requestId: reqId,
      retryable: false
    };
  }

  // 5. Mapping failure
  if (msgLower.includes('mapping failed') || msgLower.includes('room mapping') || msgLower.includes('rate mapping')) {
    return {
      success: false,
      provider: 'external_channel_manager',
      status: 422,
      errorCode: 'AIOSSELL_MAPPING_FAILED',
      code: 'AIOSSELL_MAPPING_FAILED',
      message: 'The property was authenticated but its room/rate mapping could not be retrieved.',
      requestId: reqId,
      retryable: false
    };
  }

  // 6. Rate limit
  if (status === 429) {
    return {
      success: false,
      provider: 'external_channel_manager',
      status: 429,
      errorCode: 'RATE_LIMIT_EXCEEDED',
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Channel integration rate limit reached. Please wait before retrying.',
      requestId: reqId,
      retryable: true
    };
  }

  // 7. Upstream server error / network error
  if (status >= 500 || !status || msgLower.includes('fetch failed')) {
    return {
      success: false,
      provider: 'external_channel_manager',
      status: status && status >= 500 ? status : 503,
      errorCode: 'PROVIDER_UNAVAILABLE',
      code: 'PROVIDER_UNAVAILABLE',
      message: 'The channel distribution provider is temporarily unavailable. Please retry shortly.',
      requestId: reqId,
      retryable: true
    };
  }

  return {
    success: false,
    provider: 'external_channel_manager',
    status: status || 500,
    errorCode: 'AIOSSELL_API_ERROR',
    code: 'AIOSSELL_API_ERROR',
    message: rawMessage || 'An error occurred while communicating with the channel integration provider.',
    requestId: reqId,
    retryable: false
  };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const request = async (endpoint, options = {}, hotelConfig = {}, retries = 1) => {
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
    signal: options.signal || AbortSignal.timeout(8000),
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
      if (error.provider === 'channel_integration' || error.provider === 'external_channel_manager') throw error;
      if (attempt === retries) {
        throw sanitizeAiosellError(error.message, 500, reqId);
      }
      await sleep(backoffs[attempt] || 5000);
      attempt++;
    }
  }
};

/**
 * Automatically provisions partner connection in Aiosell Connect for a hotel property.
 * Enables zero-manual-intervention onboarding for newly created hotels.
 */
export const autoOnboardHotel = async (hotelCode, partnerId = 'hotel-mantri-pms') => {
  const dashUser = process.env.AIOSELL_DASHBOARD_USERNAME;
  const dashPass = process.env.AIOSELL_DASHBOARD_PASSWORD;
  if (!dashUser || !dashPass || !hotelCode) {
    return { success: false, notConfigured: true, reason: 'Dashboard credentials or hotel code missing' };
  }

  try {
    // 1. Authenticate with RMS API
    const authRes = await fetch('https://live.aiosell.com/api/v1/rms/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: dashUser, password: dashPass }),
      signal: AbortSignal.timeout(8000)
    });
    if (!authRes.ok) {
      return { success: false, reason: 'RMS authentication failed' };
    }
    const authData = await authRes.json();
    const token = authData.access_token;
    if (!token) return { success: false, reason: 'No RMS access token received' };

    // 2. Fetch hotel details from RMS
    const hotelRes = await fetch(`https://live.aiosell.com/api/v1/rms/hotels/${hotelCode}`, {
      headers: { 'Authorization': `BZ-JWT ${token}` },
      signal: AbortSignal.timeout(8000)
    });
    if (!hotelRes.ok) {
      return { success: false, reason: `RMS hotel lookup failed: ${hotelRes.status}` };
    }
    const hotelData = await hotelRes.json();
    if (!hotelData || !Array.isArray(hotelData.rooms) || hotelData.rooms.length === 0 || !hotelData.globals?.name) {
      return { success: false, notFound: true, reason: 'Hotel does not exist in Aiosell' };
    }

    // 3. Construct mappings for rooms and rateplans
    const roomsMapped = hotelData.rooms.map(r => ({
      room_id: r.id,
      room_name: r.name || r.displayName || r.description || r.id,
      room_code: r.id,
      rateplans: (hotelData.rateplans || []).filter(rp => rp.roomId === r.id).map(rp => ({
        rateplan_name: rp.displayName || 'Rooms Only',
        occupancy: rp.occupancy || '',
        rateplan_id: rp.rateplanId,
        mealplan_code: rp.mealplan || 'EP',
        rateplan_code: rp.rateplanId
      }))
    }));

    const webhookUrl = process.env.APP_URL 
      ? `${process.env.APP_URL.replace(/\/+$/, '')}/api/integrations/aiosell/reservations`
      : 'https://hotel-mantri-apitide-personal-green.vercel.app/api/integrations/aiosell/reservations';

    const operations = ['inv_in', 'rate_in', 'res_out'];
    const newConfig = operations.map(op => ({
      is_enabled: true,
      partner: partnerId,
      hotel_code: hotelCode,
      hotel_name: hotelData.globals?.name || hotelData.name || 'Hotel Property',
      operation: op,
      configuration: {
        authkey: { type: '', key: '' },
        rooms: roomsMapped,
        auth_type: '',
        commision_inclusive: true,
        auth: {},
        auth_data: { client_secret: '', type: '', client_id: '', issuer: '', key: '' },
        actions: [],
        noshow: {},
        ...(op === 'res_out' ? {
          username: process.env.AIOSELL_WEBHOOK_USERNAME || 'hotel-mantri-webhook',
          password: process.env.AIOSELL_WEBHOOK_PASSWORD || undefined,
          notifyBookings: true,
          base_url: webhookUrl
        } : {})
      }
    }));

    // 4. Submit to Aiosell Connect config
    const postRes = await fetch(`https://live.aiosell.com/api/v2/cm/config?hotelId=${hotelCode}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `BZ-JWT ${token}`
      },
      body: JSON.stringify(newConfig),
      signal: AbortSignal.timeout(8000)
    });

    if (!postRes.ok) {
      return { success: false, reason: `Connect update failed: ${postRes.status}` };
    }

    return { success: true, hotelName: hotelData.globals?.name || hotelData.name };
  } catch (err) {
    return { success: false, reason: err.message };
  }
};

export const testConnection = async (hotelConfig) => {
  const config = await resolveConfig(hotelConfig);
  const start = Date.now();

  const debugDiagnostic = {
    selectedHotelId: config.hotelId,
    hotelCode: config.hotelCode,
    partnerId: config.partnerId,
    environment: config.environment,
    endpointPath: `/property_details/${config.hotelCode}?partnerId=${config.partnerId}`,
    baseUrlConfigured: !!config.baseUrl,
    usernameConfigured: !!config.username,
    passwordConfigured: !!config.password,
  };

  if (!config.partnerId || !config.hotelCode) {
    return {
      success: false,
      status: 400,
      error: sanitizeAiosellError('Channel credentials (partner ID or hotel code) are not configured for this hotel.', 400),
      diagnostic: {
        ...debugDiagnostic,
        status: 400,
        httpStatus: 400,
        errorCategory: 'PROPERTY_NOT_CONFIGURED',
        resolutionGuidance: 'Please enter a valid external hotel code in Channel Settings and save setup.'
      }
    };
  }

  if (!config.username || !config.password) {
    return {
      success: false,
      status: 401,
      error: {
        success: false,
        provider: 'external_channel_manager',
        status: 401,
        errorCode: 'AIOSSELL_AUTH_FAILED',
        code: 'AIOSSELL_AUTH_FAILED',
        message: 'Server integration credentials are unavailable.'
      },
      diagnostic: {
        ...debugDiagnostic,
        status: 401,
        httpStatus: 401,
        errorCategory: 'SERVER_CREDENTIALS_MISSING',
        resolutionGuidance: 'Server integration credentials (AIOSELL_USERNAME / AIOSELL_PASSWORD) are missing from backend environment.'
      }
    };
  }

  try {
    let data;
    try {
      data = await request(`/property_details/${config.hotelCode}?partnerId=${config.partnerId}`, {}, config);
    } catch (firstErr) {
      // If access denied, attempt auto-onboarding for newly created hotel
      if (firstErr.status === 403 || String(firstErr.message).toLowerCase().includes('access denied')) {
        const onboardResult = await autoOnboardHotel(config.hotelCode, config.partnerId);
        if (onboardResult.notFound) {
          throw sanitizeAiosellError('The configured hotel code was not found by the channel manager.', 404);
        }
        if (onboardResult.success) {
          data = await request(`/property_details/${config.hotelCode}?partnerId=${config.partnerId}`, {}, config);
        } else {
          throw firstErr;
        }
      } else {
        throw firstErr;
      }
    }

    const responseTimeMs = Date.now() - start;

    const rooms = (data.rooms || []).map(r => ({
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
      success: true,
      provider: 'external_channel_manager',
      environment: config.environment,
      hotelCode: config.hotelCode,
      partnerId: config.partnerId,
      status: 200,
      responseTimeMs,
      message: 'Channel integration connection successful',
      mapping: {
        rooms,
        ratePlans
      },
      diagnostic: {
        ...debugDiagnostic,
        status: 200,
        httpStatus: 200,
        responseTimeMs,
        roomsCount: rooms.length,
        ratePlansCount: ratePlans.length
      }
    };
  } catch (err) {
    const responseTimeMs = Date.now() - start;
    const upstreamStatus = err.status || 500;
    const errCode = err.errorCode || err.code || 'AIOSSELL_CONNECTION_FAILED';
    const rawUpstreamMessage = err.message || (typeof err === 'string' ? err : 'Unknown error');

    let diagnosticCategory = 'UNKNOWN_FAILURE';
    let resolutionGuidance = '';

    if (upstreamStatus === 403 || String(rawUpstreamMessage).toLowerCase().includes('access denied')) {
      diagnosticCategory = 'PROPERTY_NOT_AUTHORIZED_OR_NOT_MAPPED';
      resolutionGuidance = `Aiosell returned HTTP 403 Access Denied for property '${config.hotelCode}'. The property code exists or is registered, but it has not been mapped to partner account '${config.partnerId}' inside Aiosell Connect. Action needed: Map property '${config.hotelCode}' to partner '${config.partnerId}' in the Aiosell portal, or confirm the assigned code with Aiosell Support.`;
    } else if (upstreamStatus === 404 || String(rawUpstreamMessage).toLowerCase().includes('not found')) {
      diagnosticCategory = 'PROPERTY_CODE_NOT_FOUND';
      resolutionGuidance = `Aiosell returned HTTP 404 Not Found for property '${config.hotelCode}'. This property code does not exist in Aiosell's system. Please verify the code in the Aiosell extranet.`;
    } else if (upstreamStatus === 401) {
      diagnosticCategory = 'CREDENTIALS_REJECTED';
      resolutionGuidance = `Aiosell rejected server Basic Authentication credentials for partner '${config.partnerId}'. Please verify AIOSELL_USERNAME and AIOSELL_PASSWORD in server environment.`;
    } else if (upstreamStatus >= 500) {
      diagnosticCategory = 'UPSTREAM_SERVER_ERROR';
      resolutionGuidance = `Aiosell server returned HTTP ${upstreamStatus}. The distribution provider may be experiencing temporary degradation or maintenance.`;
    }

    logProviderDiagnostic({
      operation: 'TEST_CONNECTION_FAILED',
      hotelId: config.hotelId,
      hotelCode: config.hotelCode,
      partnerId: config.partnerId,
      endpoint: `${config.baseUrl}/property_details/${config.hotelCode}?partnerId=${config.partnerId}`,
      method: 'GET',
      status: upstreamStatus,
      credentialPresent: true,
      environment: config.environment,
      responseTimeMs,
      diagnosticCategory,
      message: resolutionGuidance || rawUpstreamMessage
    });

    return {
      success: false,
      status: upstreamStatus,
      responseTimeMs,
      error: {
        ...err,
        status: upstreamStatus,
        code: errCode,
        errorCode: errCode,
        message: err.message || 'Channel manager integration connection failed',
        resolutionGuidance,
      },
      diagnostic: {
        ...debugDiagnostic,
        responseTimeMs,
        status: upstreamStatus,
        httpStatus: upstreamStatus,
        errorCode: errCode,
        errorCategory: diagnosticCategory,
        resolutionGuidance,
        rawUpstreamMessage
      }
    };
  }
};

export const getPropertyMapping = async (hotelConfig) => {
  const config = await resolveConfig(hotelConfig);

  if (!config.username || !config.password || !config.partnerId || !config.hotelCode) {
    throw sanitizeAiosellError('Channel credentials are not configured for this hotel.', 401);
  }

  let data;
  try {
    data = await request(`/property_details/${config.hotelCode}?partnerId=${config.partnerId}`, {}, config);
  } catch (firstErr) {
    if (firstErr.status === 403 || String(firstErr.message).toLowerCase().includes('access denied')) {
      const onboardResult = await autoOnboardHotel(config.hotelCode, config.partnerId);
      if (onboardResult.notFound) {
        throw sanitizeAiosellError('The configured hotel code was not found by the channel manager.', 404);
      }
      if (onboardResult.success) {
        data = await request(`/property_details/${config.hotelCode}?partnerId=${config.partnerId}`, {}, config);
      } else {
        throw firstErr;
      }
    } else {
      throw firstErr;
    }
  }
  
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

  if (rooms.length === 0) {
    throw sanitizeAiosellError('The property was authenticated but its room/rate mapping could not be retrieved.', 422);
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
  autoOnboardHotel,
  sanitizeAiosellError,
};
