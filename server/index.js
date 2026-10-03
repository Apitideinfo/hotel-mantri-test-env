import express from 'express';
import cors from 'cors';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import aiosellRoutes from './routes/aiosell.js';
import aiosellIntegrationRoutes from './services/integrations/aiosell/AiosellWebhookController.js';
import { processPendingRoomAllocations } from './services/RoomAssignmentService.js';

dotenv.config();

process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled Promise Rejection (non-fatal):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception (non-fatal):', err);
});

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  const incomingReqId = req.headers['x-request-id'];
  const requestId = incomingReqId || `HM-REQ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  // URL Normalization Middleware: ensure /Test/api and /test/api, or stripped /api routes reach their handlers
  const original = req.url || '';
  if (req.url === '/api/index.js' || req.url.startsWith('/api/index.js?')) {
    const matched = req.headers['x-forwarded-uri'] || req.headers['x-invoke-path'] || req.headers['x-vercel-matched-path'] || req.headers['x-matched-path'];
    if (matched && matched.startsWith('/api') && !matched.startsWith('/api/index.js')) {
      req.url = matched;
    }
  } else if (req.url.startsWith('/Test/api')) {
    req.url = req.url.replace(/^\/Test\/api/, '/api');
  } else if (req.url.startsWith('/test/api')) {
    req.url = req.url.replace(/^\/test\/api/, '/api');
  } else if (!req.url.startsWith('/api') && req.url !== '/' && !req.url.startsWith('/index.html') && !req.url.startsWith('/assets/')) {
    req.url = `/api${req.url.startsWith('/') ? req.url : `/${req.url}`}`;
  }

  const start = Date.now();
  res.on('finish', () => {
    console.log(`[HTTP ${requestId}] ${req.method} ${original}${original !== req.url ? ` (rewritten: ${req.url})` : ''} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

import channelRoutes from './routes/channels.js';
import reservationRoutes from './routes/reservations.js';
import hotelBrandingRoutes from './routes/hotelBranding.js';
import notificationRoutes from './routes/notifications.js';
import revenueRoutes from './routes/revenue.js';

// Root / Health check endpoints
app.get(['/', '/api', '/api/health', '/health'], (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Hotel Mantri Backend API Server is running',
    version: '1.0.0',
    frontendUrl: 'http://localhost:5173',
    endpoints: [
      '/api/reservations',
      '/api/channels',
      '/api/hotel-branding',
      '/api/notifications',
      '/api/aiosell',
      '/api/create-order',
      '/api/verify-payment'
    ]
  });
});

// Mount API routes with both /api prefix and direct path for total serverless compatibility
app.use('/api/aiosell', aiosellRoutes);
app.use('/aiosell', aiosellRoutes);

app.use('/api/integrations/aiosell', aiosellIntegrationRoutes);
app.use('/integrations/aiosell', aiosellIntegrationRoutes);

app.use('/api/channels', channelRoutes);
app.use('/channels', channelRoutes);

app.use('/api/reservations', reservationRoutes);
app.use('/reservations', reservationRoutes);

app.use('/api/revenue', revenueRoutes);
app.use('/revenue', revenueRoutes);
app.use('/api/reservations/revenue', revenueRoutes);

app.use('/api/hotel-branding', hotelBrandingRoutes);
app.use('/hotel-branding', hotelBrandingRoutes);

app.use('/api/notifications', notificationRoutes);
app.use('/notifications', notificationRoutes);
app.use('/api/reports/whatsapp', notificationRoutes);
app.use('/reports/whatsapp', notificationRoutes);
app.use('/api/reports', notificationRoutes);
app.use('/reports', notificationRoutes);

const KEY_ID = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

const razorpay = KEY_ID && KEY_SECRET ? new Razorpay({
  key_id: KEY_ID,
  key_secret: KEY_SECRET,
}) : null;

/**
 * STEP 1: Backend Endpoint to Create Order
 * POST /api/create-order
 */
app.post(['/api/create-order', '/create-order'], async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;

    if (!amount || typeof amount !== 'number' || amount < 100) {
      return res.status(400).json({ error: 'Amount must be at least 100 paise (₹1).' });
    }

    const options = {
      amount: Math.round(amount),
      currency,
      receipt: receipt || `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      notes: notes || { platform: 'HotelMantri' },
    };

    if (!razorpay) {
      return res.status(503).json({ error: 'Razorpay payment gateway is not configured on server.' });
    }

    const order = await razorpay.orders.create(options);

    return res.status(200).json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: KEY_ID,
    });
  } catch (err) {
    console.error('Razorpay Create Order Error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to create Razorpay order' });
  }
});

/**
 * STEP 3: Backend Endpoint to Verify Signature
 * POST /api/verify-payment
 */
app.post(['/api/verify-payment', '/verify-payment'], (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters (razorpay_order_id, razorpay_payment_id, razorpay_signature)',
      });
    }

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    const isMatch = expectedSignature === razorpay_signature;

    if (isMatch) {
      return res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment signature. Verification failed.',
      });
    }
  } catch (err) {
    console.error('Razorpay Verify Payment Error:', err);
    return res.status(500).json({ error: err?.message || 'Server error during signature verification' });
  }
});

// Global 404 handler for all unmatched API routes
app.use((req, res) => {
  const requestId = req.requestId || `HM-REQ-${Date.now().toString(36).toUpperCase()}`;
  res.status(404).json({
    success: false,
    error: {
      code: 'API_ROUTE_NOT_FOUND',
      message: `The requested route ${req.method} ${req.originalUrl || req.url} does not exist.`,
      requestId
    }
  });
});

// Global Error handler
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const requestId = req.requestId || `HM-REQ-${Date.now().toString(36).toUpperCase()}`;
  console.error('[Unhandled Server Error]', {
    requestId,
    route: req.originalUrl || req.url,
    method: req.method,
    error: err?.message || String(err),
    code: err?.code || 'INTERNAL_SERVER_ERROR',
    stack: err?.stack
  });

  const statusCode = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(statusCode).json({
    success: false,
    error: {
      code: err?.code || 'INTERNAL_SERVER_ERROR',
      message: err?.message || 'An unexpected internal server error occurred.',
      requestId
    }
  });
});

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun && !process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Backend Server running on http://localhost:${PORT}`);
    // Run background reconciliation on startup for active property if configured
    const targetHotelId = process.env.HOTEL_ID || process.env.DEFAULT_HOTEL_ID;
    if (targetHotelId) {
      processPendingRoomAllocations(targetHotelId).catch(e => {
        console.warn('[Startup] Automatic allocation reconciliation warning:', e.message);
      });
    }
  });
}

export default app;

