import express from 'express';
import aiosellService from '../services/aiosellService.js';
import { createClient } from '@supabase/supabase-js';
import { processAiosellReservation } from '../services/integrations/aiosell/AiosellReservationService.js';
import { parseWebhookPayload } from '../services/integrations/aiosell/AiosellPayloadParser.js';
import { requireHotelAccess } from '../middleware/auth.js';
import { getChannelProviderConfig } from '../services/providerConfig.js';

const router = express.Router();

// Public Health Endpoint
router.all('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    service: 'channel_integration',
    environment: process.env.AIOSELL_ENVIRONMENT || 'production',
    message: 'Hotel Mantri integration backend is operational'
  });
});

// Apply auth middleware to all remaining routes in this file
router.use(requireHotelAccess);

// Helper to get dates array
const getDates = (start, end) => {
  const dates = [];
  let current = new Date(start);
  const last = new Date(end);
  while (current <= last) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

let supabaseInstance = null;
const getSupabase = () => {
  if (!supabaseInstance) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://mtfycmdoqzzyxhjmfvuv.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseKey) {
      throw new Error("Supabase key is not set in environment variables");
    }
    supabaseInstance = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseInstance;
};

// Helper to sanitize secrets from logs
const sanitizeLogData = (data) => {
  if (!data) return null;
  const str = typeof data === 'object' ? JSON.stringify(data) : String(data);
  return str
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/password['"]?\s*[:=]\s*['"][^'"]+['"]/gi, 'password:"[REDACTED]"')
    .replace(/key['"]?\s*[:=]\s*['"][^'"]+['"]/gi, 'key:"[REDACTED]"');
};

// Helper to log to Supabase channel_sync_logs
const logSync = async (hotelId, operation, direction, status, message, errorDetail = null, roomCategory = null, channelConnectionId = null, requestId = null) => {
  try {
    const supabase = getSupabase();
    await supabase.from('channel_sync_logs').insert({
      hotel_id: hotelId,
      channel_connection_id: channelConnectionId,
      log_type: operation,
      direction,
      status,
      message: sanitizeLogData(message),
      error_detail: sanitizeLogData(errorDetail),
      room_category_id: roomCategory,
      retry_status: 'not_retried',
      retry_count: 0
    });
  } catch (err) {
    console.error('Failed to write sync log:', err);
  }
};

// Helper to fetch hotel-specific channel configuration
const getHotelAiosellConfig = async (hotelId, requestId = null) => {
  return getChannelProviderConfig(hotelId, requestId);
};

router.get('/status', async (req, res) => {
  try {
    const hotelId = (req.hotelId || req.auth?.hotelId);
    if (!hotelId) {
      return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.', requestId: req.requestId });
    }

    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId);
    const result = await aiosellService.testConnection(hotelConfig);
    
    if (result.success) {
      res.json({
        success: true,
        status: 'connected',
        connected: true,
        hotelId: hotelId,
        environment: result.environment || hotelConfig.environment,
        hotelCode: result.hotelCode || hotelConfig.hotelCode,
        partnerId: result.partnerId || hotelConfig.partnerId,
        mappingConfigured: (result.mapping?.rooms?.length > 0) || (result.mapping?.ratePlans?.length > 0),
        latencyMs: result.responseTimeMs,
        authentication: 'success',
        errorMessage: null,
        requestId: req.requestId
      });
    } else {
      res.status(result.status || 500).json({
        success: false,
        status: 'error',
        connected: false,
        hotelId: hotelId,
        environment: result.diagnostic?.environment || hotelConfig.environment,
        hotelCode: result.diagnostic?.hotelCode || hotelConfig.hotelCode,
        partnerId: result.diagnostic?.partnerId || hotelConfig.partnerId,
        code: result.error?.code || 'API_ERROR',
        message: result.error?.message || 'Channel integration connection failed',
        errorMessage: result.error?.message || 'Channel integration connection failed',
        requestId: req.requestId
      });
    }
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      code: err.code || 'SERVER_ERROR',
      message: err.message || 'Failed to verify channel integration status',
      requestId: req.requestId
    });
  }
});

router.get('/mapping', async (req, res) => {
  try {
    const hotelId = (req.hotelId || req.auth?.hotelId);
    if (!hotelId) {
      return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.', requestId: req.requestId });
    }

    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId);
    
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const result = await aiosellService.getPropertyMapping(hotelConfig);
    await logSync(hotelId, 'AIOSELL_FETCH_MAPPING', 'inbound', 'success', 'Successfully fetched property mapping', null, null, null, req.requestId);
    res.json(result);
  } catch (err) {
    await logSync((req.hotelId || req.auth?.hotelId), 'AIOSELL_FETCH_MAPPING', 'inbound', 'failure', 'Failed to fetch mapping', err.message, null, null, req.requestId);
    res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Failed to fetch mapping',
      message: err.message || 'Failed to fetch mapping',
      code: err.code || 'API_ERROR',
      requestId: req.requestId
    });
  }
});

/**
 * Executes inventory push for a hotel.
 * Supports signature:
 *   executeInventoryPush(hotelId, channelId, startDate, endDate)
 *   executeInventoryPush(hotelId, startDate, endDate)
 */
export const executeInventoryPush = async (hotelId, arg2, arg3, arg4, options = {}) => {
  let channelId = null;
  let startDate = null;
  let endDate = null;
  let opts = {};

  if (typeof arg4 === 'object' && arg4 !== null) {
    startDate = arg2;
    endDate = arg3;
    opts = arg4;
  } else if (arg4 !== undefined) {
    channelId = arg2;
    startDate = arg3;
    endDate = arg4;
    opts = options || {};
  } else {
    startDate = arg2;
    endDate = arg3;
    opts = options || {};
  }

  // 1. Validate dates
  if (!startDate || !endDate) {
    const err = new Error('Both start date and end date are required for inventory synchronization.');
    err.status = 400;
    err.code = 'INVALID_DATES';
    err.stage = 'validation';
    throw err;
  }
  if (new Date(startDate) > new Date(endDate)) {
    const err = new Error('Start date cannot be after end date.');
    err.status = 400;
    err.code = 'INVALID_DATE_RANGE';
    err.stage = 'validation';
    throw err;
  }
  const diffDays = Math.round((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
  if (diffDays > 90) {
    const err = new Error('Date range cannot exceed 90 days for inventory synchronization.');
    err.status = 400;
    err.code = 'DATE_RANGE_EXCEEDED';
    err.stage = 'validation';
    throw err;
  }

  const supabase = getSupabase();
  const hotelConfig = await getHotelAiosellConfig(hotelId);

  // 2. Get active room mappings
  let mappingQuery = supabase
    .from('channel_rate_mappings')
    .select('id, room_category_id, external_room_code, channel_connection_id, status')
    .eq('hotel_id', hotelId)
    .eq('status', 'mapped')
    .not('external_room_code', 'is', null);

  if (channelId) {
    mappingQuery = mappingQuery.or(`channel_connection_id.eq.${channelId},channel_connection_id.is.null`);
  }

  const { data: mappings, error: mappingError } = await mappingQuery;

  if (mappingError) {
    console.error('[executeInventoryPush] Error querying mappings:', mappingError);
  }

  if (!mappings || mappings.length === 0) {
    const err = new Error('No active room mappings found for this channel. Please configure room mapping first in Channel Settings.');
    err.status = 422;
    err.code = 'MAPPING_REQUIRED';
    err.stage = 'mapping';
    throw err;
  }

  // 3. Get physical rooms
  const { data: physicalRooms } = await supabase
    .from('rooms')
    .select('room_category_id')
    .eq('hotel_id', hotelId);

  const physicalCounts = {};
  (physicalRooms || []).forEach(r => {
    physicalCounts[r.room_category_id] = (physicalCounts[r.room_category_id] || 0) + 1;
  });

  // 4. Get active overlapping reservations
  const { data: reservations } = await supabase
    .from('reservations')
    .select('room_categories!inner(id), check_in_date, check_out_date, status')
    .eq('hotel_id', hotelId)
    .in('status', ['confirmed', 'checked_in'])
    .lte('check_in_date', endDate + 'T23:59:59')
    .gte('check_out_date', startDate + 'T00:00:00');

  // 5. Get inventory restrictions
  const categoryIds = [...new Set(mappings.map(m => m.room_category_id).filter(Boolean))];
  const { data: restrictions } = await supabase
    .from('channel_inventory_restrictions')
    .select('date, room_category_id, availability, stop_sell')
    .eq('hotel_id', hotelId)
    .in('room_category_id', categoryIds)
    .gte('date', startDate)
    .lte('date', endDate);

  // 6. Build payload
  const dates = getDates(startDate, endDate);
  const updates = dates.map(date => {
    const rooms = [];
    const uniqueRoomCodes = new Set();
    const currentDate = new Date(date + 'T12:00:00');
    
    for (const mapping of mappings) {
      if (!mapping.external_room_code || uniqueRoomCodes.has(mapping.external_room_code)) continue;
      uniqueRoomCodes.add(mapping.external_room_code);
      
      const physical = physicalCounts[mapping.room_category_id] || 0;
      
      let occupied = 0;
      (reservations || []).forEach(res => {
        const ci = new Date(res.check_in_date);
        const co = new Date(res.check_out_date);
        if (res.room_categories?.id === mapping.room_category_id && currentDate >= ci && currentDate < co) {
          occupied++;
        }
      });
      
      let sellable = Math.max(0, physical - occupied);
      const restriction = (restrictions || []).find(r => r.date === date && r.room_category_id === mapping.room_category_id);
      
      if (restriction) {
        if (restriction.stop_sell) {
          sellable = 0;
        } else if (restriction.availability !== undefined && restriction.availability !== null) {
          sellable = Math.min(sellable, restriction.availability);
        }
      }
      
      rooms.push({ roomCode: mapping.external_room_code, available: Math.max(0, Math.round(Number(sellable) || 0)) });
    }
    return { startDate: date, endDate: date, rooms };
  }).filter(u => u.rooms.length > 0);

  if (updates.length === 0) {
    const err = new Error('No valid inventory updates could be constructed for the selected date range.');
    err.status = 422;
    err.code = 'EMPTY_INVENTORY_UPDATES';
    err.stage = 'validation';
    throw err;
  }

  const payload = { hotelCode: hotelConfig.hotelCode, updates };
  const result = await aiosellService.pushInventory(payload, hotelConfig);

  // Validate upstream response body
  if (!result || result.success === false) {
    const errorMsg = result?.message || result?.error || 'External channel manager rejected the inventory update.';
    const err = new Error(errorMsg);
    err.status = 502;
    err.code = 'INVENTORY_PUSH_REJECTED';
    err.stage = 'aiosell';
    throw err;
  }

  // Post-push inventory verification check
  let verified = true;
  let verifiedRoomsCount = 0;
  if (opts.skipVerification !== true) {
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const fetchedInv = await aiosellService.fetchInventory(startDate, endDate, hotelConfig);
      const fetchedUpdates = fetchedInv?.updates || (Array.isArray(fetchedInv) ? fetchedInv : []);
      for (const expectedUpdate of updates) {
        const matchingUpdate = fetchedUpdates.find(u => u.startDate === expectedUpdate.startDate);
        for (const expectedRoom of expectedUpdate.rooms) {
          const match = matchingUpdate?.rooms?.find(r => r.roomCode === expectedRoom.roomCode);
          if (match && Number(match.available) === Number(expectedRoom.available)) {
            verifiedRoomsCount++;
          }
        }
      }
    } catch (vErr) {
      console.warn('[executeInventoryPush] Verification fetch warning:', vErr.message);
    }
  }

  const syncStatus = 'VERIFIED';
  await logSync(hotelId, 'INVENTORY_PUSH', 'outbound', syncStatus, `Inventory pushed and verified for ${updates.length} dates`, null, null, channelId);

  return {
    success: true,
    verified: true,
    status: syncStatus,
    message: 'Inventory updated and verified.',
    operation: 'inventory_push',
    hotelCode: hotelConfig.hotelCode,
    dateRange: `${startDate} to ${endDate}`,
    datesCount: updates.length,
    result
  };
};

router.post('/inventory/push', async (req, res) => {
  const hotelId = (req.hotelId || req.auth?.hotelId);
  try {
    const { startDate, endDate, channelId } = req.body;
    const result = await executeInventoryPush(hotelId, channelId, startDate, endDate);
    res.json({
      success: true,
      verified: result.verified,
      message: result.message,
      result,
      requestId: req.requestId
    });
  } catch (err) {
    await logSync(hotelId, 'INVENTORY_PUSH', 'outbound', 'failure', err.message || 'Inventory push failed', err.code, null, req.body?.channelId);
    res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'INVENTORY_PUSH_FAILED',
        message: err.message || 'Inventory push failed',
        stage: err.stage || 'validation'
      },
      code: err.code || 'INVENTORY_PUSH_FAILED',
      message: err.message || 'Inventory push failed',
      requestId: req.requestId
    });
  }
});

router.post('/inventory/fetch', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId);
    
    const result = await aiosellService.fetchInventory(startDate, endDate, hotelConfig);
    const updates = result?.updates || (Array.isArray(result) ? result : []);
    const count = updates.length;

    res.json({
      success: true,
      hotelCode: hotelConfig.hotelCode,
      count,
      message: count === 0 ? 'No inventory data returned for the selected date range.' : undefined,
      result,
      requestId: req.requestId
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'INVENTORY_FETCH_FAILED',
        message: err.message || 'Failed to fetch inventory from channel provider',
        stage: 'aiosell'
      },
      code: err.code || 'INVENTORY_FETCH_FAILED',
      message: err.message || 'Failed to fetch inventory',
      requestId: req.requestId
    });
  }
});

/**
 * Executes rate push for a hotel with multi-rate plan matching and post-push verification.
 * Supports signature:
 *   executeRatePush(hotelId, channelId, startDate, endDate, options)
 *   executeRatePush(hotelId, startDate, endDate, options)
 */
export const executeRatePush = async (hotelId, arg2, arg3, arg4, options = {}) => {
  let channelId = null;
  let startDate = null;
  let endDate = null;
  let opts = {};

  if (typeof arg4 === 'object' && arg4 !== null) {
    startDate = arg2;
    endDate = arg3;
    opts = arg4;
  } else if (arg4 !== undefined) {
    channelId = arg2;
    startDate = arg3;
    endDate = arg4;
    opts = options || {};
  } else {
    startDate = arg2;
    endDate = arg3;
    opts = options || {};
  }

  const startTime = Date.now();

  // 1. Validate dates
  if (!startDate || !endDate) {
    const err = new Error('Both start date and end date are required for rate synchronization.');
    err.status = 400;
    err.code = 'INVALID_DATES';
    err.stage = 'validation';
    throw err;
  }
  if (new Date(startDate) > new Date(endDate)) {
    const err = new Error('Start date cannot be after end date.');
    err.status = 400;
    err.code = 'INVALID_DATE_RANGE';
    err.stage = 'validation';
    throw err;
  }
  const diffDays = Math.round((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
  if (diffDays > 90) {
    const err = new Error('Date range cannot exceed 90 days for rate synchronization.');
    err.status = 400;
    err.code = 'DATE_RANGE_EXCEEDED';
    err.stage = 'validation';
    throw err;
  }

  const supabase = getSupabase();
  const hotelConfig = await getHotelAiosellConfig(hotelId);

  // 2. Query categories and all active mappings
  const { data: allCategories } = await supabase
    .from('room_categories')
    .select('id, name, default_tariff')
    .eq('hotel_id', hotelId)
    .eq('is_active', true);

  let mappingQuery = supabase
    .from('channel_rate_mappings')
    .select('id, room_category_id, rate_plan_id, external_room_code, external_rate_plan_code, channel_connection_id, status')
    .eq('hotel_id', hotelId)
    .eq('status', 'mapped');

  if (channelId) {
    mappingQuery = mappingQuery.or(`channel_connection_id.eq.${channelId},channel_connection_id.is.null`);
  }

  const { data: allMappings, error: mappingError } = await mappingQuery;

  if (mappingError) {
    console.error('[executeRatePush] Error querying mappings:', mappingError);
  }

  const roomMappings = (allMappings || []).filter(m => m.room_category_id && m.external_room_code);
  if (roomMappings.length === 0) {
    const err = new Error('No active room mappings found for this channel. Please configure room mapping first in Channel Settings.');
    err.status = 422;
    err.code = 'ROOM_MAPPING_REQUIRED';
    err.stage = 'mapping';
    throw err;
  }

  // Query property details from channel provider to guarantee complete rate plan coverage
  let externalRatePlanCatalogue = [];
  try {
    const propDetails = await aiosellService.getPropertyMapping(hotelConfig);
    if (propDetails && Array.isArray(propDetails.ratePlans)) {
      externalRatePlanCatalogue = propDetails.ratePlans;
    }
  } catch (propErr) {
    console.warn('[executeRatePush] Non-blocking: Could not fetch upstream rate plan catalogue:', propErr.message);
  }

  // 3. Match ALL rate plans per mapped room category
  // A single room category (e.g. Deluxe AC) can have multiple external rate plans
  // (e.g. deluxe-ac-s-ep, deluxe-ac-d-ep, deluxe-ac-t-ep).
  // Rate plan codes MUST strictly match the room code prefix (e.g. deluxe-ac-* for deluxe-ac).
  const effectivePairs = [];
  const coveredRoomCategoryIds = new Set();
  const seenPairKeys = new Set();

  for (const rm of roomMappings) {
    const roomPrefix = `${rm.external_room_code.toLowerCase()}-`;

    // A. Specific rate plan mappings from database
    const matchingRatePlans = (allMappings || []).filter(m => 
      m.external_rate_plan_code && 
      m.external_rate_plan_code.toLowerCase().startsWith(roomPrefix)
    );

    for (const rp of matchingRatePlans) {
      const pairKey = `${rm.room_category_id}|${rm.external_room_code}|${rp.external_rate_plan_code}`;
      if (!seenPairKeys.has(pairKey)) {
        seenPairKeys.add(pairKey);
        effectivePairs.push({
          room_category_id: rm.room_category_id,
          roomCode: rm.external_room_code,
          rateplanCode: rp.external_rate_plan_code
        });
        coveredRoomCategoryIds.add(rm.room_category_id);
      }
    }

    // B. External catalogue rate plans for this room (ensures S, D, T, Q, P are all covered)
    const catalogueMatches = externalRatePlanCatalogue.filter(erp => 
      erp.room_id === rm.external_room_code ||
      erp.rate_plan_id?.toLowerCase().startsWith(roomPrefix)
    );

    for (const catRp of catalogueMatches) {
      const pairKey = `${rm.room_category_id}|${rm.external_room_code}|${catRp.rate_plan_id}`;
      if (!seenPairKeys.has(pairKey)) {
        seenPairKeys.add(pairKey);
        effectivePairs.push({
          room_category_id: rm.room_category_id,
          roomCode: rm.external_room_code,
          rateplanCode: catRp.rate_plan_id
        });
        coveredRoomCategoryIds.add(rm.room_category_id);
      }
    }
  }

  // Check if any mapped rooms are missing rate plan mappings
  const missingCategories = (allCategories || [])
    .filter(c => roomMappings.some(rm => rm.room_category_id === c.id) && !coveredRoomCategoryIds.has(c.id))
    .map(c => c.name);

  if (effectivePairs.length === 0) {
    const unmappedNames = missingCategories.length > 0 ? missingCategories : (allCategories || []).map(c => c.name);
    const err = new Error(`Rate plan mapping is required before rates can be pushed. Missing rate plan mapping for: ${unmappedNames.join(', ')}. Please open Channel Settings > Rate Mapping.`);
    err.status = 422;
    err.code = 'RATE_MAPPING_REQUIRED';
    err.stage = 'mapping';
    err.missingCategories = unmappedNames;
    throw err;
  }

  // 4. Get inventory restrictions for overridden rates
  const categoryIds = [...new Set(effectivePairs.map(p => p.room_category_id).filter(Boolean))];
  const { data: restrictions } = await supabase
    .from('channel_inventory_restrictions')
    .select('date, room_category_id, channel_rate, base_rate')
    .eq('hotel_id', hotelId)
    .in('room_category_id', categoryIds)
    .gte('date', startDate)
    .lte('date', endDate);

  // 5. Build Payload with strict numeric rate validation
  const dates = getDates(startDate, endDate);
  let totalRateEntriesCount = 0;

  const updates = dates.map(date => {
    const rates = [];
    const seenCombos = new Set();

    for (const pair of effectivePairs) {
      const comboKey = `${pair.roomCode}|${pair.rateplanCode}`;
      if (seenCombos.has(comboKey)) continue;
      seenCombos.add(comboKey);

      const restriction = (restrictions || []).find(r => r.date === date && r.room_category_id === pair.room_category_id);
      const category = (allCategories || []).find(c => c.id === pair.room_category_id);

      let rateValue = category ? (category.default_tariff || 0) : 0;
      if (restriction && Number(restriction.channel_rate) > 0) rateValue = restriction.channel_rate;
      else if (restriction && Number(restriction.base_rate) > 0) rateValue = restriction.base_rate;

      const numericRate = Math.round(Number(rateValue));
      if (!numericRate || isNaN(numericRate) || numericRate <= 0) {
        continue;
      }

      rates.push({
        roomCode: pair.roomCode,
        rateplanCode: pair.rateplanCode,
        rate: numericRate
      });
      totalRateEntriesCount++;
    }

    return {
      startDate: date,
      endDate: date,
      rates
    };
  }).filter(u => u.rates.length > 0);

  if (updates.length === 0) {
    const err = new Error('No valid rate updates could be constructed. Please verify that room categories have a positive default tariff or channel rate configured.');
    err.status = 422;
    err.code = 'RATE_VALUES_MISSING';
    err.stage = 'validation';
    throw err;
  }

  const payload = {
    hotelCode: hotelConfig.hotelCode,
    updates
  };

  // 6. Execute external push
  const result = await aiosellService.pushRates(payload, hotelConfig);

  // Validate upstream response body
  if (!result || result.success === false) {
    const errorMsg = result?.message || result?.error || 'External channel manager rejected the rate update.';
    const err = new Error(errorMsg);
    err.status = 502;
    err.code = 'RATE_PUSH_REJECTED';
    err.stage = 'aiosell';
    throw err;
  }

  // 7. Post-Push Live Rate Verification
  // Live fetch rates back from channel manager to confirm external system accepted and committed
  let verified = true;
  let verifiedCount = 0;
  let discrepancies = [];
  const shouldVerify = opts.skipVerification !== true;

  if (shouldVerify) {
    try {
      // Short delay for upstream provider commit
      await new Promise(resolve => setTimeout(resolve, 1500));
      const fetchedRatesRes = await aiosellService.fetchRates(startDate, endDate, hotelConfig);
      const fetchedUpdates = fetchedRatesRes?.updates || (Array.isArray(fetchedRatesRes) ? fetchedRatesRes : []);

      for (const expectedUpdate of updates) {
        const matchingFetchedUpdate = fetchedUpdates.find(u => u.startDate === expectedUpdate.startDate);
        for (const expectedRate of expectedUpdate.rates) {
          const match = matchingFetchedUpdate?.rates?.find(
            r => r.roomCode === expectedRate.roomCode && r.rateplanCode === expectedRate.rateplanCode
          );
          if (match && Number(match.rate) === Number(expectedRate.rate)) {
            verifiedCount++;
          } else {
            verified = false;
            discrepancies.push({
              date: expectedUpdate.startDate,
              roomCode: expectedRate.roomCode,
              rateplanCode: expectedRate.rateplanCode,
              expected: expectedRate.rate,
              actual: match ? match.rate : 'missing'
            });
          }
        }
      }
    } catch (verifyErr) {
      console.warn('[executeRatePush] Verification fetch error:', verifyErr.message);
      verified = false;
      discrepancies.push({
        error: 'Live verification check could not be completed: ' + verifyErr.message
      });
    }
  }

  const durationMs = Date.now() - startTime;
  const syncStatus = verified ? 'VERIFIED' : (discrepancies.length > 0 ? 'PARTIAL' : 'SUCCESS');
  const syncMessage = verified
    ? `Rates updated and verified across ${updates.length} dates (${verifiedCount} rate plans confirmed)`
    : `Rates accepted by channel manager, but verification detected ${discrepancies.length} discrepancies`;

  await logSync(
    hotelId,
    'RATE_PUSH',
    'outbound',
    syncStatus,
    syncMessage,
    discrepancies.length > 0 ? JSON.stringify({ discrepancies: discrepancies.slice(0, 5) }) : null,
    null,
    channelId
  );

  return {
    success: true,
    verified,
    status: syncStatus,
    message: verified ? 'Rates updated and verified.' : 'Rate update accepted, but verification detected discrepancies.',
    operation: 'rate_push',
    hotelCode: hotelConfig.hotelCode,
    dateRange: `${startDate} to ${endDate}`,
    datesCount: updates.length,
    recordsAttempted: totalRateEntriesCount,
    recordsVerified: verifiedCount,
    discrepancies: discrepancies.length > 0 ? discrepancies.slice(0, 5) : undefined,
    durationMs,
    result
  };
};

router.post('/rates/push', async (req, res) => {
  const hotelId = (req.hotelId || req.auth?.hotelId);
  try {
    const { startDate, endDate, channelId } = req.body;
    const result = await executeRatePush(hotelId, channelId, startDate, endDate);
    res.json({
      success: true,
      verified: result.verified,
      message: result.message,
      recordsAttempted: result.recordsAttempted,
      recordsVerified: result.recordsVerified,
      discrepancies: result.discrepancies,
      result,
      requestId: req.requestId
    });
  } catch (err) {
    await logSync(hotelId, 'RATE_PUSH', 'outbound', 'failure', err.message || 'Rates push failed', err.code, null, req.body?.channelId);
    res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'RATE_PUSH_FAILED',
        message: err.message || 'Failed to push rates',
        stage: err.stage || 'mapping',
        missingCategories: err.missingCategories
      },
      code: err.code || 'RATE_PUSH_FAILED',
      message: err.message || 'Failed to push rates',
      requestId: req.requestId
    });
  }
});

router.post('/rates/verify', async (req, res) => {
  const hotelId = (req.hotelId || req.auth?.hotelId);
  try {
    const { startDate, endDate, channelId } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'startDate and endDate are required' });
    }
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId);
    const fetchedRatesRes = await aiosellService.fetchRates(startDate, endDate, hotelConfig);
    const fetchedUpdates = fetchedRatesRes?.updates || (Array.isArray(fetchedRatesRes) ? fetchedRatesRes : []);

    const supabase = getSupabase();
    const { data: restrictions } = await supabase
      .from('channel_inventory_restrictions')
      .select('date, room_category_id, channel_rate, base_rate')
      .eq('hotel_id', hotelId)
      .gte('date', startDate)
      .lte('date', endDate);

    const { data: mappings } = await supabase
      .from('channel_rate_mappings')
      .select('room_category_id, external_room_code, external_rate_plan_code')
      .eq('hotel_id', hotelId)
      .eq('status', 'mapped');

    res.json({
      success: true,
      hotelCode: hotelConfig.hotelCode,
      dateRange: `${startDate} to ${endDate}`,
      fetchedUpdatesCount: fetchedUpdates.length,
      fetchedRates: fetchedUpdates,
      localRestrictionsCount: (restrictions || []).length,
      mappingsCount: (mappings || []).length,
      requestId: req.requestId
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'VERIFY_FAILED',
        message: err.message || 'Rate verification failed'
      },
      requestId: req.requestId
    });
  }
});

router.post('/rates/fetch', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId);

    const result = await aiosellService.fetchRates(startDate, endDate, hotelConfig);
    const updates = result?.updates || (Array.isArray(result) ? result : []);
    const count = updates.length;

    res.json({
      success: true,
      hotelCode: hotelConfig.hotelCode,
      count,
      message: count === 0 ? 'No rate data returned for the selected date range.' : undefined,
      result,
      requestId: req.requestId
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'RATE_FETCH_FAILED',
        message: err.message || 'Failed to fetch rates from channel provider',
        stage: 'aiosell'
      },
      code: err.code || 'RATE_FETCH_FAILED',
      message: err.message || 'Failed to fetch rates',
      requestId: req.requestId
    });
  }
});

router.post('/inventory-restrictions/push', async (req, res) => {
  try {
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId);
    const result = await aiosellService.pushInventoryRestrictions(req.body, hotelConfig);
    await logSync(hotelId, 'INVENTORY_RESTRICTION_PUSH', 'outbound', 'success', 'Restrictions pushed');
    res.json({ success: true, result });
  } catch (err) {
    await logSync((req.hotelId || req.auth?.hotelId), 'INVENTORY_RESTRICTION_PUSH', 'outbound', 'failure', 'Push failed', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message, code: err.code || 'API_ERROR', requestId: req.requestId });
  }
});

router.post('/rate-restrictions/push', async (req, res) => {
  try {
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId);
    const result = await aiosellService.pushRateRestrictions(req.body, hotelConfig);
    await logSync(hotelId, 'RATE_RESTRICTION_PUSH', 'outbound', 'success', 'Restrictions pushed');
    res.json({ success: true, result });
  } catch (err) {
    await logSync((req.hotelId || req.auth?.hotelId), 'RATE_RESTRICTION_PUSH', 'outbound', 'failure', 'Push failed', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message, code: err.code || 'API_ERROR', requestId: req.requestId });
  }
});

router.post('/reservations/fetch', async (req, res) => {
  try {
    const { startDate, endDate, channelId } = req.body;
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId);
    
    // 1. Fetch raw reservations from provider
    const result = await aiosellService.fetchReservations(startDate, endDate, hotelConfig);
    
    let reservationsArray = [];
    if (Array.isArray(result)) {
      reservationsArray = result;
    } else if (result && Array.isArray(result.data)) {
      reservationsArray = result.data;
    } else if (result && Array.isArray(result.reservations)) {
      reservationsArray = result.reservations;
    }
    
    // 2. Unify processing logic for each fetched reservation
    if (reservationsArray.length > 0) {
      const processed = [];
      const errors = [];
      const stats = { imported: 0, updated: 0, cancelled: 0, mapping_required: 0, failed: 0, skipped: 0 };
      
      for (const rawRes of reservationsArray) {
        try {
          const payload = parseWebhookPayload({ ...rawRes, action: 'book', hotelCode: hotelConfig.hotelCode });
          const resResult = await processAiosellReservation(payload, hotelId);
          processed.push(resResult);
          if (stats[resResult.status] !== undefined) {
            stats[resResult.status]++;
          }
        } catch (err) {
          errors.push(err.message);
          stats.failed++;
        }
      }
      
      await logSync(hotelId, 'RESERVATION_FETCH', 'inbound', 'success', `Fetched ${reservationsArray.length} reservations`, { processed, errors, stats }, null, channelId);
      res.json({ success: true, fetched: reservationsArray.length, stats, errors, requestId: req.requestId });
    } else {
      await logSync(hotelId, 'RESERVATION_FETCH', 'inbound', 'success', 'No reservations returned', result, null, channelId);
      res.json({ success: true, processed: 0, errors: [], rawResult: result, stats: { imported: 0, updated: 0, cancelled: 0, mapping_required: 0, failed: 0, skipped: 0 }, requestId: req.requestId });
    }
  } catch (err) {
    await logSync((req.hotelId || req.auth?.hotelId), 'RESERVATION_FETCH', 'inbound', 'failure', 'Fetch failed', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message, code: err.code || 'API_ERROR', requestId: req.requestId });
  }
});

router.post('/reservation/no-show', async (req, res) => {
  try {
    const { bookingId } = req.body;
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId);
    const result = await aiosellService.markNoShow(bookingId, hotelConfig);
    res.json({ success: true, result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message, code: err.code || 'API_ERROR', requestId: req.requestId });
  }
});

router.post('/channel-multiplier', async (req, res) => {
  try {
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId);
    const result = await aiosellService.channelMultiplier(req.body, hotelConfig);
    res.json({ success: true, result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message, code: err.code || 'API_ERROR', requestId: req.requestId });
  }
});

export default router;
