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
      message,
      error_detail: typeof errorDetail === 'object' ? JSON.stringify(errorDetail) : errorDetail,
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
export const executeInventoryPush = async (hotelId, arg2, arg3, arg4) => {
  let channelId = null;
  let startDate = null;
  let endDate = null;

  if (arg4 !== undefined) {
    channelId = arg2;
    startDate = arg3;
    endDate = arg4;
  } else {
    // 3 args: hotelId, startDate, endDate
    startDate = arg2;
    endDate = arg3;
  }

  const supabase = getSupabase();
  const hotelConfig = await getHotelAiosellConfig(hotelId);

  // 1. Get active room mappings
  let mappingQuery = supabase
    .from('channel_rate_mappings')
    .select('room_category_id, external_room_code, channel_connection_id, status')
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
    const err = new Error('No active room mappings found for this channel. Please configure room mapping first.');
    err.status = 422;
    err.code = 'MAPPING_REQUIRED';
    throw err;
  }

  // 2. Get physical rooms
  const { data: physicalRooms } = await supabase
    .from('rooms')
    .select('room_category_id')
    .eq('hotel_id', hotelId);

  const physicalCounts = {};
  (physicalRooms || []).forEach(r => {
    physicalCounts[r.room_category_id] = (physicalCounts[r.room_category_id] || 0) + 1;
  });

  // 3. Get active overlapping reservations
  const { data: reservations } = await supabase
    .from('reservations')
    .select('room_categories!inner(id), check_in_date, check_out_date, status')
    .eq('hotel_id', hotelId)
    .in('status', ['confirmed', 'checked_in'])
    .lte('check_in_date', endDate + 'T23:59:59')
    .gte('check_out_date', startDate + 'T00:00:00');

  // 4. Get inventory restrictions
  const categoryIds = [...new Set(mappings.map(m => m.room_category_id).filter(Boolean))];
  const { data: restrictions } = await supabase
    .from('channel_inventory_restrictions')
    .select('date, room_category_id, availability, stop_sell')
    .eq('hotel_id', hotelId)
    .in('room_category_id', categoryIds)
    .gte('date', startDate)
    .lte('date', endDate);

  // 5. Build payload
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
      
      rooms.push({ roomCode: mapping.external_room_code, available: sellable });
    }
    return { startDate: date, endDate: date, rooms };
  }).filter(u => u.rooms.length > 0);

  const payload = { hotelCode: hotelConfig.hotelCode, updates };
  const result = await aiosellService.pushInventory(payload, hotelConfig);
  await logSync(hotelId, 'INVENTORY_PUSH', 'outbound', 'success', 'Inventory pushed successfully', null, null, channelId);
  return result;
};

router.post('/inventory/push', async (req, res) => {
  try {
    const { startDate, endDate, channelId } = req.body;
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const result = await executeInventoryPush(hotelId, channelId, startDate, endDate);
    res.json({ success: true, result });
  } catch (err) {
    await logSync((req.hotelId || req.auth?.hotelId), 'INVENTORY_PUSH', 'outbound', 'failure', 'Inventory push failed', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message, code: err.code || 'API_ERROR', requestId: req.requestId });
  }
});

router.post('/inventory/fetch', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId);
    
    const result = await aiosellService.fetchInventory(startDate, endDate, hotelConfig);
    res.json({ success: true, result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message, code: err.code || 'API_ERROR', requestId: req.requestId });
  }
});

/**
 * Executes rate push for a hotel.
 * Supports signature:
 *   executeRatePush(hotelId, channelId, startDate, endDate)
 *   executeRatePush(hotelId, startDate, endDate)
 */
export const executeRatePush = async (hotelId, arg2, arg3, arg4) => {
  let channelId = null;
  let startDate = null;
  let endDate = null;

  if (arg4 !== undefined) {
    channelId = arg2;
    startDate = arg3;
    endDate = arg4;
  } else {
    startDate = arg2;
    endDate = arg3;
  }

  const supabase = getSupabase();
  const hotelConfig = await getHotelAiosellConfig(hotelId);

  // 1. Get active rate mappings
  let mappingQuery = supabase
    .from('channel_rate_mappings')
    .select('room_category_id, rate_plan_id, external_room_code, external_rate_plan_code, channel_connection_id, status')
    .eq('hotel_id', hotelId)
    .eq('status', 'mapped')
    .not('external_room_code', 'is', null)
    .not('external_rate_plan_code', 'is', null);

  if (channelId) {
    mappingQuery = mappingQuery.or(`channel_connection_id.eq.${channelId},channel_connection_id.is.null`);
  }

  const { data: mappings, error: mappingError } = await mappingQuery;

  if (mappingError) {
    console.error('[executeRatePush] Error querying mappings:', mappingError);
  }

  if (!mappings || mappings.length === 0) {
    const err = new Error('No active room and rate mappings found for this channel. Please configure rate mapping first.');
    err.status = 422;
    err.code = 'RATE_MAPPING_REQUIRED';
    throw err;
  }

  // 2. Get categories and rate plans to find default tariffs
  const categoryIds = [...new Set(mappings.map(m => m.room_category_id).filter(Boolean))];
  const { data: categories } = await supabase.from('room_categories').select('id, default_tariff').in('id', categoryIds);
  
  // 3. Get inventory restrictions (which store overridden rates)
  const { data: restrictions } = await supabase
    .from('channel_inventory_restrictions')
    .select('date, room_category_id, channel_rate, base_rate')
    .eq('hotel_id', hotelId)
    .in('room_category_id', categoryIds)
    .gte('date', startDate)
    .lte('date', endDate);

  // 4. Build Payload
  const dates = getDates(startDate, endDate);
  const updates = dates.map(date => {
    const rates = [];
    
    for (const mapping of mappings) {
      if (!mapping.external_room_code || !mapping.external_rate_plan_code) continue;
      
      const restriction = (restrictions || []).find(r => r.date === date && r.room_category_id === mapping.room_category_id);
      const category = (categories || []).find(c => c.id === mapping.room_category_id);
      
      let rateValue = category ? (category.default_tariff || 0) : 0;
      if (restriction && restriction.channel_rate > 0) rateValue = restriction.channel_rate;
      else if (restriction && restriction.base_rate > 0) rateValue = restriction.base_rate;
      
      rates.push({
        roomCode: mapping.external_room_code,
        rateplanCode: mapping.external_rate_plan_code,
        rate: rateValue
      });
    }
    
    return {
      startDate: date,
      endDate: date,
      rates
    };
  }).filter(u => u.rates.length > 0);

  const payload = {
    hotelCode: hotelConfig.hotelCode,
    updates
  };

  const result = await aiosellService.pushRates(payload, hotelConfig);
  await logSync(hotelId, 'RATE_PUSH', 'outbound', 'success', 'Rates pushed successfully', null, null, channelId);
  return result;
};

router.post('/rates/push', async (req, res) => {
  try {
    const { startDate, endDate, channelId } = req.body;
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const result = await executeRatePush(hotelId, channelId, startDate, endDate);
    res.json({ success: true, result });
  } catch (err) {
    await logSync((req.hotelId || req.auth?.hotelId), 'RATE_PUSH', 'outbound', 'failure', 'Rates push failed', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message, code: err.code || 'API_ERROR', requestId: req.requestId });
  }
});

router.post('/rates/fetch', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId);
    
    const result = await aiosellService.fetchRates(startDate, endDate, hotelConfig);
    res.json({ success: true, result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message, code: err.code || 'API_ERROR', requestId: req.requestId });
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
