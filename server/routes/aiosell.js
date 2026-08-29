import express from 'express';
import aiosellService from '../services/aiosellService.js';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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

router.get('/test', async (req, res) => {
  try {
    const result = await aiosellService.testConnection();
    if (result.success) {
      res.json(result);
    } else {
      res.status(result.error?.status || 500).json({
        ...result.error,
        diagnostic: result.diagnostic
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/mapping', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const result = await aiosellService.getPropertyMapping();
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_FETCH_MAPPING', 'inbound', 'success', 'Successfully fetched property mapping from Aiosell');
    res.json(result);
  } catch (err) {
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_FETCH_MAPPING', 'inbound', 'failure', 'Failed to fetch mapping', err.message || err.error?.message);
    res.status(err.status || 500).json(err);
  }
});

router.post('/inventory/push', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const hotelId = req.headers['x-hotel-id'];
    const supabase = getSupabase();
    const config = aiosellService.getConfig();

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

    // 2. Get inventory restrictions
    const categoryIds = mappings.map(m => m.room_category_id);
    const { data: restrictions } = await supabase
      .from('channel_inventory_restrictions')
      .select('date, room_category_id, availability')
      .eq('hotel_id', hotelId)
      .in('room_category_id', categoryIds)
      .gte('date', startDate)
      .lte('date', endDate);

    // 3. Build payload
    const dates = getDates(startDate, endDate);
    const updates = dates.map(date => {
      const rooms = [];
      
      // We only want unique external room codes (since multiple rate plans might map to the same room)
      const uniqueRoomCodes = new Set();
      
      for (const mapping of mappings) {
        if (!mapping.external_room_code || uniqueRoomCodes.has(mapping.external_room_code)) continue;
        uniqueRoomCodes.add(mapping.external_room_code);
        
        const restriction = (restrictions || []).find(r => r.date === date && r.room_category_id === mapping.room_category_id);
        const available = restriction ? (restriction.availability || 0) : 0; // Default to 0 if no record
        
        rooms.push({
          roomCode: mapping.external_room_code,
          available: available
        });
      }
      
      return {
        startDate: date,
        endDate: date,
        rooms
      };
    }).filter(u => u.rooms.length > 0);

    const payload = {
      hotelCode: config.hotelCode,
      updates
    };

    const result = await aiosellService.pushInventory(payload);
    await logSync(hotelId, 'AIOSELL_INVENTORY_PUSH', 'outbound', 'success', 'Inventory pushed successfully');
    res.json(result);
  } catch (err) {
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_INVENTORY_PUSH', 'outbound', 'failure', 'Inventory push failed', err.message);
    res.status(err.status || 500).json(err);
  }
});
      }
      return { startDate: date, endDate: date, rooms };
    }).filter(u => u.rooms.length > 0);

    const payload = { hotelCode: config.hotelCode, updates };
    const result = await aiosellService.pushInventory(payload);
    await logSync(hotelId, 'AIOSELL_INVENTORY_PUSH', 'outbound', 'success', 'Inventory pushed successfully');
    res.json(result);
  } catch (err) {
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_INVENTORY_PUSH', 'outbound', 'failure', 'Inventory push failed', err.message);
    res.status(err.status || 500).json(err);
  }
});

router.post('/inventory/fetch', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const result = await aiosellService.fetchInventory(startDate, endDate);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json(err);
  }
});

router.post('/rates/push', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const hotelId = req.headers['x-hotel-id'];
    const supabase = getSupabase();
    const config = aiosellService.getConfig();

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
      hotelCode: config.hotelCode,
      updates
    };

    const result = await aiosellService.pushRates(payload);
    await logSync(hotelId, 'AIOSELL_RATE_PUSH', 'outbound', 'success', 'Rates pushed successfully');
    res.json(result);
  } catch (err) {
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_RATE_PUSH', 'outbound', 'failure', 'Rates push failed', err.message);
    res.status(err.status || 500).json(err);
  }
});
      }
      return { startDate: date, endDate: date, rates };
    }).filter(u => u.rates.length > 0);

    const payload = { hotelCode: config.hotelCode, updates };
    const result = await aiosellService.pushRates(payload);
    await logSync(hotelId, 'AIOSELL_RATE_PUSH', 'outbound', 'success', 'Rates pushed successfully');
    res.json(result);
  } catch (err) {
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_RATE_PUSH', 'outbound', 'failure', 'Rates push failed', err.message);
    res.status(err.status || 500).json(err);
  }
});

router.post('/rates/fetch', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const result = await aiosellService.fetchRates(startDate, endDate);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json(err);
  }
});

router.post('/inventory-restrictions/push', async (req, res) => {
  try {
    const result = await aiosellService.pushInventoryRestrictions(req.body);
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_INVENTORY_RESTRICTION_PUSH', 'outbound', 'success', 'Restrictions pushed');
    res.json(result);
  } catch (err) {
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_INVENTORY_RESTRICTION_PUSH', 'outbound', 'failure', 'Push failed', err.message);
    res.status(err.status || 500).json(err);
  }
});

router.post('/rate-restrictions/push', async (req, res) => {
  try {
    const result = await aiosellService.pushRateRestrictions(req.body);
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_RATE_RESTRICTION_PUSH', 'outbound', 'success', 'Restrictions pushed');
    res.json(result);
  } catch (err) {
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_RATE_RESTRICTION_PUSH', 'outbound', 'failure', 'Push failed', err.message);
    res.status(err.status || 500).json(err);
  }
});

router.post('/reservations/fetch', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const result = await aiosellService.fetchReservations(startDate, endDate);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json(err);
  }
});

router.post('/reservation/no-show', async (req, res) => {
  try {
    const { bookingId } = req.body;
    const result = await aiosellService.markNoShow(bookingId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json(err);
  }
});

router.post('/channel-multiplier', async (req, res) => {
  try {
    const result = await aiosellService.channelMultiplier(req.body);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json(err);
  }
});

// WEBHOOK
router.post('/reservation-webhook', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!aiosellService.validateWebhookAuth(authHeader)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = req.body;
    const hotelCode = payload.hotelCode;
    const action = payload.action;
    const bookingId = payload.bookingId;
    const supabase = getSupabase();

    let hotelId;
    const { data: settings, error: settingsError } = await supabase
      .from('channel_settings')
      .select('hotel_id')
      .eq('aiosell_hotel_code', hotelCode)
      .maybeSingle();

    if (settingsError || !settings) {
      const { data: hotels } = await supabase.from('hotels').select('id').limit(1);
      if (hotels && hotels.length > 0) {
        hotelId = hotels[0].id;
      } else {
        return res.status(400).json({ error: 'Invalid hotel code' });
      }
    } else {
      hotelId = settings.hotel_id;
    }

    const { data: existing } = await supabase
      .from('channel_ota_reservations')
      .select('id')
      .eq('hotel_id', hotelId)
      .eq('ota_booking_id', bookingId)
      .maybeSingle();

    if (action === 'cancel') {
      if (existing) {
        await supabase
          .from('channel_ota_reservations')
          .update({ booking_status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        await logSync(hotelId, 'AIOSELL_RESERVATION_CANCEL', 'inbound', 'success', `Cancelled booking ${bookingId}`);
      }
      return res.json({ success: true, message: 'Reservation Updated Successfully' });
    }

    const guestName = payload.guest?.firstName 
      ? `${payload.guest.firstName} ${payload.guest.lastName || ''}`.trim() 
      : (payload.rooms?.[0]?.guestName || 'Guest');
      
    const guestMobile = payload.guest?.phone || null;
    const checkIn = payload.checkin;
    const checkOut = payload.checkout;
    const amount = payload.amount?.amountAfterTax || 0;
    
    const roomCode = payload.rooms?.[0]?.roomCode || 'unknown';
    const rateplanCode = payload.rooms?.[0]?.rateplanCode || 'unknown';

    const insertData = {
      hotel_id: hotelId,
      ota_booking_id: bookingId,
      channel_name: payload.channel || 'aiosell',
      guest_name: guestName,
      guest_mobile: guestMobile,
      room_category: roomCode,
      rate_plan: rateplanCode,
      check_in_date: checkIn,
      check_out_date: checkOut,
      amount: amount,
      payment_status: payload.pah ? 'unpaid' : 'paid',
      booking_status: 'confirmed',
      received_at: payload.bookedOn,
      raw_payload: payload
    };

    if (existing) {
      await supabase
        .from('channel_ota_reservations')
        .update(insertData)
        .eq('id', existing.id);
      await logSync(hotelId, 'AIOSELL_RESERVATION_MODIFY', 'inbound', 'success', `Modified booking ${bookingId}`);
    } else {

      await supabase.from('channel_ota_reservations').insert(insertData);
      await logSync(hotelId, 'AIOSELL_RESERVATION_BOOK', 'inbound', 'success', `Created booking ${bookingId}`);

      // Decrement inventory
      try {
        const { data: mapping } = await supabase
          .from('channel_rate_mappings')
          .select('room_category_id')
          .eq('hotel_id', hotelId)
          .eq('external_room_code', roomCode)
          .maybeSingle();

        if (mapping && mapping.room_category_id) {
          const datesToUpdate = getDates(checkIn, new Date(new Date(checkOut).getTime() - 86400000).toISOString().split('T')[0]);
          for (const d of datesToUpdate) {
            const { data: restriction } = await supabase
              .from('channel_inventory_restrictions')
              .select('id, availability')
              .eq('hotel_id', hotelId)
              .eq('room_category_id', mapping.room_category_id)
              .eq('date', d)
              .maybeSingle();
            
            if (restriction) {
               await supabase
                .from('channel_inventory_restrictions')
                .update({ availability: Math.max(0, restriction.availability - 1) })
                .eq('id', restriction.id);
            }
          }
        }
      } catch (e) {
        console.error('Error decrementing inventory:', e);
      }

    }

    return res.json({ success: true, message: 'Reservation Updated Successfully' });

  } catch (error) {
    console.error('Aiosell Webhook Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
