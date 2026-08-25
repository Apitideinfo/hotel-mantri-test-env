import express from 'express';
import { processWebhook } from './AiosellReservationService.js';
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
    const result = await processWebhook(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error('Webhook Error:', error);
    const status = error.status || 500;
    const message = error.message || 'Internal Server Error';
    res.status(status).json({ success: false, error: message });
  }
});

export default router;
