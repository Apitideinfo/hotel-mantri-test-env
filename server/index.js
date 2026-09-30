import express from 'express';
import cors from 'cors';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';
import aiosellRoutes from './routes/aiosell.js';
import aiosellIntegrationRoutes from './services/integrations/aiosell/AiosellWebhookController.js';

dotenv.config();

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

  const start = Date.now();
  res.on('finish', () => {
    console.log(`[HTTP ${requestId}] ${req.method} ${req.originalUrl || req.url} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

app.use('/api/aiosell', aiosellRoutes);
app.use('/api/integrations/aiosell', aiosellIntegrationRoutes);

import channelRoutes from './routes/channels.js';
app.use('/api/channels', channelRoutes);

import reservationRoutes from './routes/reservations.js';
app.use('/api/reservations', reservationRoutes);

import hotelBrandingRoutes from './routes/hotelBranding.js';
app.use('/api/hotel-branding', hotelBrandingRoutes);

import notificationRoutes from './routes/notifications.js';
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports/whatsapp', notificationRoutes);
app.use('/api/reports', notificationRoutes);

const KEY_ID = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_TRihoeKVwQzktg';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'o8NGFcph9x0SBD03Jirx5bai';

const razorpay = new Razorpay({
  key_id: KEY_ID,
  key_secret: KEY_SECRET,
});

/**
 * STEP 1: Backend Endpoint to Create Order
 * POST /api/create-order
 */
app.post('/api/create-order', async (req, res) => {
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
app.post('/api/verify-payment', (req, res) => {
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

// Global 404 handler for API routes
app.use('/api', (req, res) => {
  const requestId = req.requestId || `HM-REQ-${Date.now().toString(36).toUpperCase()}`;
  res.status(404).json({
    success: false,
    error: {
      code: 'API_ROUTE_NOT_FOUND',
      message: `The requested API route ${req.method} ${req.originalUrl || req.url} does not exist.`,
      requestId
    }
  });
});

// Global Error handler
app.use((err, req, res, next) => {
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

if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Backend Server running on http://localhost:${PORT}`);
  });
}

export default app;

