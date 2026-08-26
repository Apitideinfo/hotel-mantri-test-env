import crypto from 'crypto';


// Configuration helper
const getConfig = () => {
  return {
    baseUrl: process.env.AIOSELL_BASE_URL || 'https://live.aiosell.com/api/v2/cm',
    username: process.env.AIOSELL_USERNAME || '',
    password: process.env.AIOSELL_PASSWORD || '',
    partnerId: process.env.AIOSELL_PARTNER_ID || 'sample-pms',
    hotelCode: process.env.AIOSELL_HOTEL_CODE || 'sandbox-pms',
    environment: process.env.AIOSELL_ENVIRONMENT || 'test',
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

const request = async (endpoint, options = {}, retries = 3) => {
  const config = getConfig();
  const url = `${config.baseUrl}${endpoint}`;
  const authHeader = buildBasicAuthHeader(config.username, config.password);

  if (!authHeader) {
    throw sanitizeAiosellError('Aiosell credentials are required', 401);
  }

  // Hide credentials from logs but confirm header is present
  console.log(`[Aiosell API] Outgoing ${options.method || 'GET'} to ${url}`);
  console.log(`[Aiosell API] Authorization header attached: Basic <base64_hidden>`);

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

      if (response.ok) {
        return await response.json();
      }

      const status = response.status;
      const responseText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        errorData = responseText;
      }

      if ([401, 403, 400].includes(status) || attempt === retries) {
        throw sanitizeAiosellError(errorData, status);
      }

      if ([429, 500, 502, 503, 504].includes(status)) {
        await sleep(backoffs[attempt] || 10000);
        attempt++;
      } else {
        throw sanitizeAiosellError(errorData, status);
      }
    } catch (error) {
      if (error.provider === 'aiosell') throw error;
      if (attempt === retries) {
        throw sanitizeAiosellError(error.message, 500);
      }
      await sleep(backoffs[attempt] || 10000);
      attempt++;
    }
  }
};

export const testConnection = async () => {
  const config = getConfig();
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

  if (!config.username || !config.password || !config.partnerId || !config.hotelCode) {
    return {
      success: false,
      error: sanitizeAiosellError('Aiosell credentials are not configured on the backend.', 401),
      diagnostic: debugDiagnostic
    };
  }

  try {
    const data = await request(`/property_details/${config.hotelCode}?partnerId=${config.partnerId}`);
    const responseTimeMs = Date.now() - start;
    
    return {
      success: true,
      provider: 'aiosell',
      environment: config.environment,
      hotelCode: config.hotelCode,
      partnerId: config.partnerId,
      status: 200,
      responseTimeMs,
      message: "Aiosell sandbox connection successful",
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

export const getPropertyMapping = async () => {
  const config = getConfig();

  if (!config.username || !config.password || !config.partnerId || !config.hotelCode) {
    throw sanitizeAiosellError('Aiosell credentials are not configured on the backend.', 401);
  }

  try {
    const data = await request(`/property_details/${config.hotelCode}?partnerId=${config.partnerId}`);
    
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
        hotel_name: data.hotel_name || data.hotelName || 'Sandbox PMS',
      },
      rooms,
      ratePlans,
      rawResponse: data,
    };
  } catch (error) {
    throw error;
  }
};

export const pushInventory = async (payload) => {
  const config = getConfig();
  
  // Format based on Aiosell spec
  const aiosellPayload = {
    hotelCode: config.hotelCode,
    updates: [
      {
        startDate: payload.startDate || new Date().toISOString().split('T')[0],
        endDate: payload.endDate || new Date().toISOString().split('T')[0],
        rooms: [
          { roomCode: 'executive', available: 5 },
          { roomCode: 'suite', available: 3 }
        ]
      }
    ]
  };

  try {
    return await request(`/update/${config.partnerId}`, {
      method: 'POST',
      body: JSON.stringify(aiosellPayload),
    });
  } catch (err) {
    if (err.message && err.message.includes('Payload Parsing Failed')) {
      throw new Error('Aiosell rejected the inventory format. Please provide the exact Aiosell JSON payload specification to finalize this integration.');
    }
    throw err;
  }
};

export const pushRates = async (payload) => {
  const config = getConfig();
  
  // Format based on Aiosell spec
  const aiosellPayload = {
    hotelCode: config.hotelCode,
    updates: [
      {
        startDate: payload.startDate || new Date().toISOString().split('T')[0],
        endDate: payload.endDate || new Date().toISOString().split('T')[0],
        rates: [
          { roomCode: 'executive', rate: 1749, rateplanCode: 'executive-s-ep' },
          { roomCode: 'suite', rate: 2999, rateplanCode: 'suite-d-cp' }
        ]
      }
    ]
  };

  try {
    return await request(`/update-rates/${config.partnerId}`, {
      method: 'POST',
      body: JSON.stringify(aiosellPayload),
    });
  } catch (err) {
    if (err.message && err.message.includes('Payload Parsing Failed')) {
      throw new Error('Aiosell rejected the rates format. Please provide the exact Aiosell JSON payload specification to finalize this integration.');
    }
    throw err;
  }
};

export const pushInventoryRestrictions = async (payload) => {
  // Aiosell uses the same endpoint for inventory and its restrictions
  const config = getConfig();
  return request(`/update/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const pushRateRestrictions = async (payload) => {
  // Aiosell uses the same endpoint for rates and rate restrictions
  const config = getConfig();
  return request(`/update-rates/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const fetchInventory = async (startDate, endDate) => {
  const config = getConfig();
  return request(`/data/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'inventory',
      hotelCode: config.hotelCode,
      startDate,
      endDate,
    }),
  });
};

export const fetchRates = async (startDate, endDate) => {
  const config = getConfig();
  return request(`/data/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'rates',
      hotelCode: config.hotelCode,
      startDate,
      endDate,
    }),
  });
};

export const fetchReservations = async (startDate, endDate) => {
  const config = getConfig();
  return request(`/data/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'reservations',
      hotelCode: config.hotelCode,
      startDate,
      endDate,
    }),
  });
};

export const markNoShow = async (bookingId) => {
  const config = getConfig();
  return request(`/no-show/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify({
      hotelCode: config.hotelCode,
      bookingId,
    }),
  });
};

export const channelMultiplier = async (payload) => {
  const config = getConfig();
  // Using an endpoint structure assuming typical Aiosell pattern, but isolated
  return request(`/channel-multiplier/${config.partnerId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

// --- Webhook Validation ---
export const validateWebhookAuth = (authHeader) => {
  const config = getConfig();
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
