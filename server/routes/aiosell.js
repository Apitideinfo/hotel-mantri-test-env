import express from 'express';
import aiosellService from '../services/aiosellService.js';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const router = express.Router();

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
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json(err);
  }
});

router.get('/mapping', async (req, res) => {
  try {
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
    const result = await aiosellService.pushInventory(req.body);
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_INVENTORY_PUSH', 'outbound', 'success', 'Inventory pushed successfully');
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
    const result = await aiosellService.pushRates(req.body);
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_RATE_PUSH', 'outbound', 'success', 'Rates pushed successfully');
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

    const payload = aiosellService.parseWebhookPayload(req.body);
    const hotelCode = payload.hotelCode;
    const supabase = getSupabase();

    // Resolve hotel_id based on aiosell hotel code
    const { data: settings, error: settingsError } = await supabase
      .from('channel_settings')
      .select('hotel_id')
      .eq('aiosell_hotel_code', hotelCode)
      .maybeSingle();

    if (settingsError || !settings) {
      return res.status(400).json({ error: 'Invalid hotel code' });
    }
    
    const hotelId = settings.hotel_id;
    const idempotencyKey = payload.bookingId;

    if (payload.action === 'book') {
      const { data: existing } = await supabase
        .from('channel_ota_reservations')
        .select('id')
        .eq('hotel_id', hotelId)
        .eq('ota_booking_id', idempotencyKey)
        .maybeSingle();

      if (existing) {
        await logSync(hotelId, 'AIOSELL_RESERVATION_BOOK', 'inbound', 'success', 'Duplicate booking ignored');
        return res.json({ success: true, message: 'Already imported' });
      }

      await supabase.from('channel_ota_reservations').insert({
        hotel_id: hotelId,
        ota_booking_id: idempotencyKey,
        channel_name: 'aiosell',
        guest_name: payload.guestName,
        guest_mobile: payload.guestPhone,
        room_category: payload.roomCode,
        rate_plan: payload.rateplanCode,
        check_in_date: payload.checkIn,
        check_out_date: payload.checkOut,
        amount: payload.amount,
        payment_status: payload.paymentStatus,
        reservation_status: 'confirmed',
        booking_status: 'confirmed',
        import_status: 'pending',
        received_at: new Date().toISOString(),
        retry_count: 0
      });

      await logSync(hotelId, 'AIOSELL_RESERVATION_BOOK', 'inbound', 'success', 'Booking imported successfully');
    } else if (payload.action === 'modify') {
      await supabase.from('channel_ota_reservations')
        .update({
          guest_name: payload.guestName,
          check_in_date: payload.checkIn,
          check_out_date: payload.checkOut,
          amount: payload.amount,
          import_status: 'modified',
          updated_at: new Date().toISOString()
        })
        .eq('hotel_id', hotelId)
        .eq('ota_booking_id', idempotencyKey);
        
      await logSync(hotelId, 'AIOSELL_RESERVATION_MODIFY', 'inbound', 'success', 'Booking modified');
    } else if (payload.action === 'cancel') {
      await supabase.from('channel_ota_reservations')
        .update({
          booking_status: 'cancelled',
          reservation_status: 'cancelled',
          import_status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('hotel_id', hotelId)
        .eq('ota_booking_id', idempotencyKey);
        
      await logSync(hotelId, 'AIOSELL_RESERVATION_CANCEL', 'inbound', 'success', 'Booking cancelled');
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
