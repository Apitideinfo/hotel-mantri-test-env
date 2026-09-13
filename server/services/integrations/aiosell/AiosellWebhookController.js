import express from 'express';
import { processAiosellReservation } from './AiosellReservationService.js';
import { parseWebhookPayload } from './AiosellPayloadParser.js';
import { getSupabase } from './HotelMantriReservationService.js';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

/**
 * Basic Auth Middleware for Webhooks
 */
const webhookAuthMiddleware = (req, res, next) => {
  const enabled = process.env.AIOSELL_WEBHOOK_ENABLED === 'true';
  if (!enabled) {
    return res.status(403).json({ error: 'Webhooks are disabled' });
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized: Missing Authorization header' });
  }

  const username = process.env.AIOSELL_WEBHOOK_USERNAME;
  const password = process.env.AIOSELL_WEBHOOK_PASSWORD;

  if (!username || !password) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const expectedAuth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

  if (authHeader !== expectedAuth) {
    return res.status(401).json({ error: 'Unauthorized: Invalid credentials' });
  }

  next();
};

/**
 * GET /health
 * Returns the health and configuration status.
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    integration: "aiosell",
    enabled: true,
    environment: process.env.AIOSELL_ENVIRONMENT || "test",
    configured: !!(process.env.AIOSELL_USERNAME && process.env.AIOSELL_PASSWORD),
    authenticated: true, // We assume if it's configured, it's capable of authenticating (Test Connection handles the actual check)
    webhookEnabled: process.env.AIOSELL_WEBHOOK_ENABLED === 'true'
  });
});

/**
 * GET /webhook-info
 * Returns the absolute callback URL to provide to Aiosell.
 */
router.get('/webhook-info', (req, res) => {
  const baseUrl = process.env.APP_BASE_URL || `http://${req.hostname}:${process.env.PORT || 5000}`;
  res.json({
    success: true,
    environment: process.env.AIOSELL_ENVIRONMENT || "test",
    reservationEndpoint: `${baseUrl}/api/integrations/aiosell/reservations`
  });
});

/**
 * POST /reservations
 * The main Aiosell reservation webhook.
 */
router.post('/reservations', webhookAuthMiddleware, async (req, res) => {
  try {
    let parsedPayload = parseWebhookPayload(req.body);
    const supabase = getSupabase();
    
    // Resolve hotelId from channel_settings or channel_connections
    let hotelId = null;
    const { data: config } = await supabase
      .from('channel_settings')
      .select('hotel_id')
      .eq('aiosell_hotel_code', parsedPayload.hotelCode)
      .maybeSingle();

    if (config?.hotel_id) {
      hotelId = config.hotel_id;
    } else {
      const { data: conn } = await supabase
        .from('channel_connections')
        .select('hotel_id')
        .eq('external_hotel_code', parsedPayload.hotelCode)
        .maybeSingle();
      if (conn?.hotel_id) hotelId = conn.hotel_id;
    }

    if (!hotelId) {
      const err = new Error(`Hotel with channel code ${parsedPayload.hotelCode} is not configured.`);
      err.status = 404;
      throw err;
    }

    // If payload is incomplete and action is not cancel, fetch complete booking from provider
    if (!parsedPayload.isCompletePayload && parsedPayload.action !== 'cancel') {
      try {
        const { getChannelProviderConfig } = await import('../../providerConfig.js');
        const aiosellService = (await import('../../aiosellService.js')).default;
        const hotelConfig = await getChannelProviderConfig(hotelId);
        
        const today = new Date();
        const start = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
        const end = new Date(today.getTime() + 60 * 86400000).toISOString().slice(0, 10);
        
        const fetchedBookings = await aiosellService.fetchReservations(start, end, hotelConfig);
        const list = Array.isArray(fetchedBookings) ? fetchedBookings : (fetchedBookings?.data || []);
        
        const match = list.find(b => 
          String(b.bookingId || b.booking_id || b.cmBookingId) === String(parsedPayload.bookingId)
        );

        if (match) {
          parsedPayload = parseWebhookPayload({
            ...match,
            hotelCode: parsedPayload.hotelCode,
            action: parsedPayload.action
          });
        }
      } catch (fetchErr) {
        console.warn(`[Webhook] Could not fetch complete reservation details for ${parsedPayload.bookingId}:`, fetchErr.message);
      }
    }

    const result = await processAiosellReservation(parsedPayload, hotelId);
    res.status(200).json(result);
  } catch (error) {
    console.error('Webhook Error:', error);
    const status = error.status || 500;
    const message = error.message || 'Internal Server Error';
    res.status(status).json({ success: false, error: message });
  }
});

export default router;
