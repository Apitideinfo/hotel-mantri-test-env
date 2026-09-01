import express from 'express';
import aiosellService from '../services/aiosellService.js';
import { createClient } from '@supabase/supabase-js';
import { processAiosellReservation } from '../services/integrations/aiosell/AiosellReservationService.js';
import { parseWebhookPayload } from '../services/integrations/aiosell/AiosellPayloadParser.js';
const router = express.Router();

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
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseKey) {
      throw new Error("VITE_SUPABASE_ANON_KEY is not set in environment variables");
    }
    supabaseInstance = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseInstance;
};

// Helper to log to Supabase channel_sync_logs
const logSync = async (hotelId, operation, direction, status, message, errorDetail = null, roomCategory = null) => {
  try {
    const supabase = getSupabase();
    await supabase.from('channel_sync_logs').insert({
      hotel_id: hotelId || '00000000-0000-0000-0000-000000000000', // Default fallback
      log_type: operation,
      direction,
      status,
      message,
      error_detail: errorDetail,
      room_category_id: roomCategory,
      retry_status: 'not_retried',
      retry_count: 0
    });
  } catch (err) {
    console.error('Failed to write sync log:', err);
  }
};

// Helper to fetch hotel-specific aiosell configuration
const getHotelAiosellConfig = async (hotelId) => {
  if (!hotelId) throw new Error("x-hotel-id header is required");
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('channel_settings')
    .select('aiosell_hotel_code, aiosell_partner_id, aiosell_environment')
    .eq('hotel_id', hotelId)
    .single();

  if (error || !data || !data.aiosell_hotel_code || !data.aiosell_partner_id) {
    const err = new Error("Aiosell credentials (partner ID or hotel code) are not configured for this hotel.");
    err.status = 400;
    err.code = 'AIOSELL_NOT_CONFIGURED';
    throw err;
  }
  
  return {
    hotelCode: data.aiosell_hotel_code,
    partnerId: data.aiosell_partner_id,
    environment: data.aiosell_environment || 'production'
  };
};

router.all('/health', async (req, res) => {
  const start = Date.now();
  try {
    const hotelId = req.headers['x-hotel-id'];
    if (!hotelId) return res.status(400).json({ connected: false, error: 'x-hotel-id missing' });
    const hotelConfig = await getHotelAiosellConfig(hotelId);
    
    const result = await aiosellService.testConnection(hotelConfig);
    
    res.json({
      connected: result.success,
      environment: hotelConfig.environment,
      partnerConfigured: !!hotelConfig.partnerId,
      hotelConfigured: !!hotelConfig.hotelCode,
      authentication: result.success ? 'success' : 'failure',
      hotelMapping: result.mapping ? 'success' : 'failure',
      latencyMs: Date.now() - start,
      errorCode: result.error?.code || null,
      errorMessage: result.error?.message || null
    });
  } catch (err) {
    res.json({
      connected: false,
      environment: 'unknown',
      partnerConfigured: false,
      hotelConfigured: false,
      authentication: 'failure',
      hotelMapping: 'failure',
      latencyMs: Date.now() - start,
      errorCode: err.code || 'UNKNOWN_ERROR',
      errorMessage: err.message
    });
  }
});

router.get('/status', async (req, res) => {
  try {
    const hotelId = req.headers['x-hotel-id'];
    const hotelConfig = await getHotelAiosellConfig(hotelId);
    
    const result = await aiosellService.testConnection(hotelConfig);
    if (result.success) {
      res.json({ success: true, status: 'connected', hotelCode: hotelConfig.hotelCode });
    } else {
      res.json({
        success: false,
        status: 'error',
        error: result.error
      });
    }
  } catch (err) {
    res.json({ success: false, status: 'not_configured', error: { message: err.message, code: err.code } });
  }
});

router.get('/mapping', async (req, res) => {
  try {
    const hotelId = req.headers['x-hotel-id'];
    const hotelConfig = await getHotelAiosellConfig(hotelId);
    
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const result = await aiosellService.getPropertyMapping(hotelConfig);
    await logSync(hotelId, 'AIOSELL_FETCH_MAPPING', 'inbound', 'success', 'Successfully fetched property mapping from Aiosell');
    res.json(result);
  } catch (err) {
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_FETCH_MAPPING', 'inbound', 'failure', 'Failed to fetch mapping', err.message || err.error?.message);
    res.status(err.status || 500).json({ error: err.message || err.error?.message, code: err.code || err.error?.code });
  }
});

export const executeInventoryPush = async (hotelId, startDate, endDate) => {
  const supabase = getSupabase();
  const hotelConfig = await getHotelAiosellConfig(hotelId);

  // 1. Get active Aiosell mappings
  const { data: mappings } = await supabase
    .from('channel_rate_mappings')
    .select('room_category_id, external_room_code')
    .eq('hotel_id', hotelId)
    .eq('provider', 'aiosell')
    .eq('status', 'mapped');

  if (!mappings || mappings.length === 0) {
    throw new Error('No active Aiosell mappings found');
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
  const categoryIds = mappings.map(m => m.room_category_id);
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
    const currentDate = new Date(date + 'T12:00:00'); // Midday to avoid timezone edge cases
    
    for (const mapping of mappings) {
      if (!mapping.external_room_code || uniqueRoomCodes.has(mapping.external_room_code)) continue;
      uniqueRoomCodes.add(mapping.external_room_code);
      
      const physical = physicalCounts[mapping.room_category_id] || 0;
      
      // Calculate occupied for this date
      let occupied = 0;
      (reservations || []).forEach(res => {
        const ci = new Date(res.check_in_date);
        const co = new Date(res.check_out_date);
        // Reservation occupies room if ci <= date < co
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
  await logSync(hotelId, 'AIOSELL_INVENTORY_PUSH', 'outbound', 'success', 'Inventory pushed successfully');
  return result;
};

router.post('/inventory/push', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const hotelId = req.headers['x-hotel-id'];
    const result = await executeInventoryPush(hotelId, startDate, endDate);
    res.json(result);
  } catch (err) {
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_INVENTORY_PUSH', 'outbound', 'failure', 'Inventory push failed', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

router.post('/inventory/fetch', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const hotelId = req.headers['x-hotel-id'];
    const hotelConfig = await getHotelAiosellConfig(hotelId);
    
    const result = await aiosellService.fetchInventory(startDate, endDate, hotelConfig);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

router.post('/rates/push', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const hotelId = req.headers['x-hotel-id'];
    const supabase = getSupabase();
    
    const hotelConfig = await getHotelAiosellConfig(hotelId);

    // 1. Get mappings
    const { data: mappings } = await supabase
      .from('channel_rate_mappings')
      .select('room_category_id, rate_plan_id, external_room_code, external_rate_plan_code')
      .eq('hotel_id', hotelId)
      .eq('provider', 'aiosell')
      .eq('status', 'mapped');

    if (!mappings || mappings.length === 0) {
      throw new Error('No active Aiosell mappings found');
    }

    // 2. Get categories and rate plans to find default tariffs
    const categoryIds = [...new Set(mappings.map(m => m.room_category_id))];
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
        
        // If channel_rate is set, use it. Otherwise use base_rate. Otherwise fallback to category default_tariff.
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
    await logSync(hotelId, 'AIOSELL_RATE_PUSH', 'outbound', 'success', 'Rates pushed successfully');
    res.json(result);
  } catch (err) {
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_RATE_PUSH', 'outbound', 'failure', 'Rates push failed', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

router.post('/rates/fetch', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const hotelId = req.headers['x-hotel-id'];
    const hotelConfig = await getHotelAiosellConfig(hotelId);
    
    const result = await aiosellService.fetchRates(startDate, endDate, hotelConfig);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

router.post('/inventory-restrictions/push', async (req, res) => {
  try {
    const hotelId = req.headers['x-hotel-id'];
    const hotelConfig = await getHotelAiosellConfig(hotelId);
    const result = await aiosellService.pushInventoryRestrictions(req.body, hotelConfig);
    await logSync(hotelId, 'AIOSELL_INVENTORY_RESTRICTION_PUSH', 'outbound', 'success', 'Restrictions pushed');
    res.json(result);
  } catch (err) {
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_INVENTORY_RESTRICTION_PUSH', 'outbound', 'failure', 'Push failed', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

router.post('/rate-restrictions/push', async (req, res) => {
  try {
    const hotelId = req.headers['x-hotel-id'];
    const hotelConfig = await getHotelAiosellConfig(hotelId);
    const result = await aiosellService.pushRateRestrictions(req.body, hotelConfig);
    await logSync(hotelId, 'AIOSELL_RATE_RESTRICTION_PUSH', 'outbound', 'success', 'Restrictions pushed');
    res.json(result);
  } catch (err) {
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_RATE_RESTRICTION_PUSH', 'outbound', 'failure', 'Push failed', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

router.post('/reservations/fetch', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const hotelId = req.headers['x-hotel-id'];
    const hotelConfig = await getHotelAiosellConfig(hotelId);
    
    console.log(`[AIOSSELL] Fetch started... Hotel: ${hotelConfig.hotelCode}, Partner: ${hotelConfig.partnerId}`);
    
    // 1. Fetch raw reservations from Aiosell
    const result = await aiosellService.fetchReservations(startDate, endDate, hotelConfig);
    
    // Extrapolate reservations array from Aiosell payload
    let reservationsArray = [];
    if (Array.isArray(result)) {
      reservationsArray = result;
    } else if (result && Array.isArray(result.data)) {
      reservationsArray = result.data;
    } else if (result && Array.isArray(result.reservations)) {
      reservationsArray = result.reservations;
    } else if (result && typeof result === 'object' && !result.success) {
      // It's likely an error from Aiosell (e.g. { success: false, message: 'Partner is disabled' })
      throw { status: 400, message: result.message || 'Aiosell rejected the fetch request.' };
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
      
      await logSync(hotelId, 'AIOSELL_RESERVATION_FETCH', 'inbound', 'success', `Fetched ${reservationsArray.length} reservations`, { processed, errors, stats });
      res.json({ success: true, fetched: reservationsArray.length, stats, errors });
    } else {
      await logSync(hotelId, 'AIOSELL_RESERVATION_FETCH', 'inbound', 'success', 'No reservations returned or empty response', result);
      res.json({ success: true, processed: 0, errors: [], rawResult: result });
    }
  } catch (err) {
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_RESERVATION_FETCH', 'inbound', 'failure', 'Fetch failed', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'API_ERROR' });
  }
});

router.post('/reservation/no-show', async (req, res) => {
  try {
    const { bookingId } = req.body;
    const hotelId = req.headers['x-hotel-id'];
    const hotelConfig = await getHotelAiosellConfig(hotelId);
    const result = await aiosellService.markNoShow(bookingId, hotelConfig);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

router.post('/channel-multiplier', async (req, res) => {
  try {
    const hotelId = req.headers['x-hotel-id'];
    const hotelConfig = await getHotelAiosellConfig(hotelId);
    const result = await aiosellService.channelMultiplier(req.body, hotelConfig);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

export default router;
