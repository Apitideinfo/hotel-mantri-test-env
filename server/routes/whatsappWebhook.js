/**
 * Hotel Mantri — Official Meta WhatsApp Cloud API Webhook Controller
 *
 * Exposes:
 * - GET  /api/whatsapp/webhook (Meta verification handshake)
 * - POST /api/whatsapp/webhook (Meta event notifications & delivery status)
 * - GET  /api/whatsapp/status  (Non-sensitive operational diagnostics)
 */

import express from 'express';
import {
  verifyMetaWebhookGet,
  verifyMetaWebhookSignature,
  processMetaWebhookEvents,
  getMetaWhatsAppDiagnostics,
} from '../services/metaWhatsAppService.js';

const router = express.Router();

/**
 * GET /api/whatsapp/webhook (also handles direct /webhook within router)
 *
 * Meta WhatsApp Cloud API Webhook Verification Endpoint.
 * Meta calls this when configuring the Webhook URL in Meta App Dashboard.
 *
 * Query Parameters from Meta:
 *   - hub.mode: 'subscribe'
 *   - hub.verify_token: Value specified in Meta dashboard
 *   - hub.challenge: Random challenge string to echo back
 */
const handleWebhookVerification = (req, res) => {
  const result = verifyMetaWebhookGet(req.query);

  if (!result.valid) {
    return res.status(result.statusCode).type('text/plain').send(result.error);
  }

  // Meta requires HTTP 200 with the challenge string as plain text
  return res.status(200).type('text/plain').send(result.challenge);
};

router.get('/webhook', handleWebhookVerification);
router.get('/', handleWebhookVerification);

/**
 * POST /api/whatsapp/webhook (also handles direct /webhook within router)
 *
 * Meta WhatsApp Cloud API Webhook Event Receiver.
 * Receives:
 *   - Message delivery statuses: sent, delivered, read, failed
 *   - Incoming messages from guests
 *   - System errors and pricing metadata
 *
 * Security:
 *   - Validates X-Hub-Signature-256 header using timing-safe HMAC-SHA256
 *   - Never prints access tokens or secrets in logs
 */
const handleWebhookNotification = async (req, res) => {
  const signatureHeader = req.headers['x-hub-signature-256'] || req.headers['x-hub-signature'];
  const rawBody = req.rawBody || req.body;

  // In production, signature verification is strictly enforced.
  // In development/test mode, if appSecret is not configured, we allow simulated test events.
  const appSecret = (process.env.WHATSAPP_APP_SECRET || '').trim();
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';

  if (isProduction || appSecret || signatureHeader) {
    const sigResult = verifyMetaWebhookSignature({
      rawBody: req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)),
      signatureHeader,
      appSecret,
    });

    if (!sigResult.valid) {
      console.warn(`[MetaWhatsAppWebhook] Rejected unsigned or invalid webhook POST: ${sigResult.error}`);
      return res.status(sigResult.statusCode).json({
        success: false,
        error: sigResult.error,
      });
    }
  }

  // Meta expects an immediate HTTP 200 response to prevent retry storms
  res.status(200).json({ success: true, received: true });

  // Process events safely without crashing
  try {
    const payload = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    await processMetaWebhookEvents(payload);
  } catch (err) {
    console.error('[MetaWhatsAppWebhook] Error while processing webhook events:', err.message);
  }
};

router.post('/webhook', handleWebhookNotification);
router.post('/', handleWebhookNotification);

/**
 * GET /api/whatsapp/status
 * Non-sensitive operational diagnostics for administrators
 */
router.get('/status', (req, res) => {
  const diagnostics = getMetaWhatsAppDiagnostics();
  return res.status(200).json({
    success: true,
    diagnostics,
    timestamp: new Date().toISOString(),
  });
});

export default router;
