import crypto from 'crypto';


// Configuration helper
const getConfig = (hotelConfig = {}) => {
  return {
    baseUrl: process.env.AIOSELL_BASE_URL || 'https://live.aiosell.com/api/v2/cm',
    username: process.env.AIOSELL_USERNAME || '',
    password: process.env.AIOSELL_PASSWORD || '',
    partnerId: hotelConfig.partnerId || process.env.AIOSELL_PARTNER_ID,
    hotelCode: hotelConfig.hotelCode || process.env.AIOSELL_HOTEL_CODE,
    environment: hotelConfig.environment || process.env.AIOSELL_ENVIRONMENT || 'test',
  };
};

// Build Basic Auth header
const buildBasicAuthHeader = (username, password) => {
  if (!username || !password) return null;
  const token = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${token}`;
};

const sanitizeAiosellError = (error, status) => {
  let message = error?.message || error || 'Aiosell Server Error';
  
  const isAuthError = status === 401 || status === 403 || (status === 400 && String(message).toLowerCase().includes('authentication'));
  
  if (isAuthError) {
    message = "Aiosell authentication failed. Verify the sandbox username and password.";
  } else if (status === 404) {
    message = "Aiosell API endpoint not found.";
  } else if (status >= 500) {
    message = "Aiosell server error.";
  } else if (!status) {
    message = "Hotel Mantri backend could not reach Aiosell.";
  }

  return {
    provider: 'aiosell',
    status: isAuthError ? 401 : (status || 500),
    code: isAuthError ? 'AUTHENTICATION_ERROR' : status === 429 ? 'RATE_LIMIT_EXCEEDED' : 'API_ERROR',
    message: message,
    retryable: [429, 500, 502, 503, 504].includes(status),
  };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const request = async (endpoint, options = {}, hotelConfig = {}, retries = 3) => {
  const config = getConfig(hotelConfig);
  const url = `${config.baseUrl}${endpoint}`;
  const authHeader = buildBasicAuthHeader(config.username, config.password);

  if (!authHeader) {
    throw sanitizeAiosellError('Aiosell credentials are required', 401);
  }

  const reqId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();
  
  console.log(`[Aiosell API - ${reqId}] ${options.method || 'GET'} ${url} | Hotel: ${config.hotelCode} | Partner: ${config.partnerId}`);
  console.log(`[Aiosell API - ${reqId}] Authorization header attached: Basic <base64_hidden>`);
  
  if (options.body) {
    try {
      const parsed = JSON.parse(options.body);
      console.log(`[Aiosell API - ${reqId}] Payload:`, JSON.stringify(parsed));
    } catch (e) {
      console.log(`[Aiosell API - ${reqId}] Payload (raw):`, options.body);
    }
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

  let attempt = 0;
  const backoffs = [2000, 5000, 10000];

  while (attempt <= retries) {
    try {
      const response = await fetch(url, fetchOptions);
      const duration = Date.now() - startTime;
      const status = response.status;
      
      let responseText = await response.text();
      let responseData;
      
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        responseData = responseText; // It might be HTML
      }

      console.log(`[Aiosell API - ${reqId}] Status: ${status} | Duration: ${duration}ms`);
      
      if (response.ok) {
        console.log(`[Aiosell API - ${reqId}] Success Response:`, JSON.stringify(responseData).substring(0, 500));
        return responseData;
      }

      console.error(`[Aiosell API - ${reqId}] Failure Response:`, typeof responseData === 'string' ? responseData.substring(0, 500) : JSON.stringify(responseData));

      if ([401, 403, 400].includes(status) || attempt === retries) {
        throw sanitizeAiosellError(responseData, status);
      }

      if ([429, 500, 502, 503, 504].includes(status)) {
        console.log(`[Aiosell API - ${reqId}] Retrying in ${backoffs[attempt]}ms...`);
        await sleep(backoffs[attempt] || 10000);
        attempt++;
      } else {
        throw sanitizeAiosellError(responseData, status);
      }
    } catch (error) {
      if (error.provider === 'aiosell') throw error;
      if (attempt === retries) {
        console.error(`[Aiosell API - ${reqId}] Final Error:`, error.message);
        throw sanitizeAiosellError(error.message, 500);
      }
      console.log(`[Aiosell API - ${reqId}] Retrying in ${backoffs[attempt]}ms due to network error: ${error.message}`);
      await sleep(backoffs[attempt] || 10000);
      attempt++;
    }
  }
};

export const testConnection = async (hotelConfig) => {
  const config = getConfig(hotelConfig);
  const start = Date.now();
  
  // Check backend environment variable presence
  console.log(`AIOSELL_BASE_URL configured: ${!!config.baseUrl}`);
  console.log(`AIOSELL_USERNAME configured: ${!!config.username}`);
  console.log(`AIOSELL_PASSWORD configured: ${!!config.password}`);
  console.log(`AIOSELL_PARTNER_ID configured: ${!!config.partnerId}`);
  console.log(`AIOSELL_HOTEL_CODE configured: ${!!config.hotelCode}`);

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
      error: sanitizeAiosellError('Aiosell credentials (partner ID or hotel code) are not configured for this hotel.', 401),
      diagnostic: debugDiagnostic
    };
  }

  if (!config.username || !config.password) {
    return {
      success: false,
      error: {
        provider: 'aiosell',
        status: 401,
        code: 'BACKEND_CREDENTIALS_MISSING',
        message: 'Configuration exists, but backend Aiosell credentials are unavailable.'
      },
      diagnostic: debugDiagnostic
    };
  }

  try {
    const data = await request(`/property_details/${config.hotelCode}?partnerId=${config.partnerId}`, {}, hotelConfig);
    const responseTimeMs = Date.now() - start;
    
    return {
      success: true,
      provider: 'aiosell',
      environment: config.environment,
      hotelCode: config.hotelCode,
      partnerId: config.partnerId,
      status: 200,
      responseTimeMs,
      message: "Aiosell connection successful",
      mapping: {
        rooms: data?.rooms || [],
        ratePlans: data?.ratePlans || [],
      }
    };
  } catch (error) {
    if (error.provider === 'aiosell') {
      return { success: false, error, diagnostic: debugDiagnostic };
    }
    return { 
      success: false, 
      error: sanitizeAiosellError(error.message, 500),
      diagnostic: debugDiagnostic
    };
  }
};

export const getPropertyMapping = async (hotelConfig) => {
  const config = getConfig(hotelConfig);

  if (!config.username || !config.password || !config.partnerId || !config.hotelCode) {
    throw sanitizeAiosellError('Aiosell credentials are not configured for this hotel.', 401);
  }

  try {
    const data = await request(`/property_details/${config.hotelCode}?partnerId=${config.partnerId}`, {}, hotelConfig);
    
    const rooms = (data.rooms || []).map(r => ({
      room_id: r.room_id || r.roomId || r.roomCode || '',
      room_name: r.room_name || r.roomName || r.roomCode || '',
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

    // Fallback if rate plans are top-level
    if (ratePlans.length === 0) {
      if (Array.isArray(data.rate_plans)) {
        data.rate_plans.forEach(rp => ratePlans.push({
          rate_plan_id: rp.rate_plan_id || rp.ratePlanId || rp.rateplanCode || '',
          rate_plan_name: rp.rate_plan_name || rp.ratePlanName || rp.rateplanCode || '',
          room_id: rp.room_id || rp.roomId || rp.roomCode || ''
        }));
      } else if (Array.isArray(data.ratePlans)) {
        data.ratePlans.forEach(rp => ratePlans.push({
          rate_plan_id: rp.rate_plan_id || rp.ratePlanId || rp.rateplanCode || '',
          rate_plan_name: rp.rate_plan_name || rp.ratePlanName || rp.rateplanCode || '',
          room_id: rp.room_id || rp.roomId || rp.roomCode || ''
        }));
      }
    }

    console.log("Parsed rate plans:", JSON.stringify(ratePlans));

    return {
      hotel: {
        hotel_id: data.hotel_id || data.hotelId || data.hotelCode || config.hotelCode,
        hotel_name: data.hotel_name || data.hotelName || 'Aiosell Property',
      },
      rooms,
      ratePlans,
      rawResponse: data,
    };
  } catch (error) {
    throw error;
  }
};

export const pushInventory = async (payload, hotelConfig) => {
  const config = getConfig(hotelConfig);
  
  // payload is already constructed in the route (based on Aiosell spec)
  const aiosellPayload = payload;

  try {
    return await request(`/update/${config.partnerId}`, {
      method: 'POST',
      body: JSON.stringify(aiosellPayload),
    }, hotelConfig);
  } catch (err) {
    if (err.message && err.message.includes('Payload Parsing Failed')) {
      throw new Error('Aiosell rejected the inventory format. Please provide the exact Aiosell JSON payload specification to finalize this integration.');
    }
    throw err;
  }
};

export const pushRates = async (payload, hotelConfig) => {
  const config = getConfig(hotelConfig);
  
  // payload is already constructed in the route (based on Aiosell spec)
  const aiosellPayload = payload;

  try {
    return await request(`/update-rates/${config.partnerId}`, {
      method: 'POST',
      body: JSON.stringify(aiosellPayload),
    }, hotelConfig);
  } catch (err) {
    if (err.message && err.message.includes('Payload Parsing Failed')) {
      throw new Error('Aiosell rejected the rates format. Please provide the exact Aiosell JSON payload specification to finalize this integration.');
    }
    throw err;
  }
};

export const pushInventoryRestrictions = async (payload, hotelConfig) => {
  // Aiosell uses the same endpoint for inventory and its restrictions
  const config = getConfig(hotelConfig);
  return request(`/update/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, hotelConfig);
};

export const pushRateRestrictions = async (payload, hotelConfig) => {
  // Aiosell uses the same endpoint for rates and rate restrictions
  const config = getConfig(hotelConfig);
  return request(`/update-rates/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, hotelConfig);
};

export const fetchInventory = async (startDate, endDate, hotelConfig) => {
  const config = getConfig(hotelConfig);
  return request(`/data/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'inventory',
      hotelCode: config.hotelCode,
      startDate,
      endDate,
    }),
  }, hotelConfig);
};

export const fetchRates = async (startDate, endDate, hotelConfig) => {
  const config = getConfig(hotelConfig);
  return request(`/data/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'rates',
      hotelCode: config.hotelCode,
      startDate,
      endDate,
    }),
  }, hotelConfig);
};

export const fetchReservations = async (startDate, endDate, hotelConfig) => {
  const config = getConfig(hotelConfig);
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
    }, hotelConfig);

    let reservationsArray = [];
    if (Array.isArray(result)) {
      reservationsArray = result;
    } else if (result && Array.isArray(result.data)) {
      reservationsArray = result.data;
    } else if (result && Array.isArray(result.reservations)) {
      reservationsArray = result.reservations;
    } else if (result && typeof result === 'object' && !result.success) {
      if (page === 1) throw result; // Only throw if it fails on the first page
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
  const config = getConfig(hotelConfig);
  return request(`/no-show/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify({
      hotelCode: config.hotelCode,
      bookingId,
    }),
  }, hotelConfig);
};

export const channelMultiplier = async (payload, hotelConfig) => {
  const config = getConfig(hotelConfig);
  return request(`/channel-multiplier/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, hotelConfig);
};

// --- Webhook Validation ---
export const validateWebhookAuth = (authHeader) => {
  const config = getConfig(); // Webhooks rely on global env user/pass generally
  const expectedHeader = buildBasicAuthHeader(config.username, config.password);
  return authHeader && expectedHeader && authHeader === expectedHeader;
};

// We don't implement the DB logic here, just the parsing.
// The route will handle the database operations using Supabase client.
export const parseWebhookPayload = (payload) => {
  if (!payload || !payload.action || !payload.hotelCode || !payload.bookingId) {
    throw new Error('Invalid webhook payload structure');
  }
  return {
    action: payload.action, // book, modify, cancel
    hotelCode: payload.hotelCode,
    bookingId: payload.bookingId,
    roomCode: payload.roomCode,
    rateplanCode: payload.rateplanCode,
    guestName: payload.guestName || 'Aiosell Guest',
    guestPhone: payload.guestPhone || '',
    checkIn: payload.checkIn,
    checkOut: payload.checkOut,
    roomsCount: payload.roomsCount || 1,
    amount: payload.amount || 0,
    paymentStatus: payload.paymentStatus || 'unpaid',
    raw: payload,
  };
};

export default {
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
  validateWebhookAuth,
  parseWebhookPayload,
  getConfig,
};
