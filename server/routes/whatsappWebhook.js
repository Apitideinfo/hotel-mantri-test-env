/**
 * Hotel Mantri — Official Meta WhatsApp Cloud API Controller
 *
 * Exposes:
 * - GET  /api/whatsapp/webhook           (Meta verification handshake)
 * - POST /api/whatsapp/webhook           (Meta event notifications & delivery status)
 * - GET  /api/whatsapp/status            (Non-sensitive operational diagnostics)
 * - GET  /api/whatsapp/config            (Safe public provider status)
 * - POST /api/whatsapp/verify-connection (Live Meta Cloud API connection check)
 * - GET  /api/whatsapp/templates         (Fetch approved templates from Meta WABA)
 * - POST /api/whatsapp/test              (Send test WhatsApp message)
 * - GET  /api/whatsapp/logs              (Delivery outbox history)
 * - GET  /api/whatsapp/history           (Delivery outbox history)
 * - POST /api/whatsapp/retry-send        (Retry failed messages)
 */

import express from 'express';
import {
  verifyMetaWebhookGet,
  verifyMetaWebhookSignature,
  processMetaWebhookEvents,
  getMetaWhatsAppDiagnostics,
  verifyMetaConnection,
  fetchApprovedTemplates,
  syncMetaTemplates,
  sendMetaTestMessage,
} from '../services/metaWhatsAppService.js';
import {
  sendWhatsAppMessage,
  normalizeWhatsAppPhone,
  buildWhatsAppDirectUrl,
} from '../services/whatsappService.js';
import {
  getWhatsAppHistory,
  recordWhatsAppOutboxEvent,
  updateWhatsAppOutboxEvent,
  OUTBOX_STATUS,
  REPORT_TYPES,
  DELIVERY_TYPES,
} from '../services/whatsappOutboxService.js';
import { resolveHotelOwnerWhatsApp, calculateDailySummary, buildDailySummaryText } from '../services/dailySummaryService.js';
import { requireHotelAccess, forbidRoles } from '../middleware/auth.js';

const router = express.Router();

// ─── Webhook Endpoints (Meta calls these, no user auth required) ─────────────

/**
 * GET /api/whatsapp/webhook
 * Meta verification handshake
 */
const handleWebhookVerification = (req, res) => {
  const result = verifyMetaWebhookGet(req.query);

  if (!result.valid) {
    return res.status(result.statusCode).type('text/plain').send(result.error);
  }

  return res.status(200).type('text/plain').send(result.challenge);
};

router.get('/webhook', handleWebhookVerification);
router.get('/', handleWebhookVerification);

/**
 * POST /api/whatsapp/webhook
 * Meta event notifications & delivery status receipts
 */
const handleWebhookNotification = async (req, res) => {
  const signatureHeader = req.headers['x-hub-signature-256'] || req.headers['x-hub-signature'];
  const rawBody = req.rawBody;

  // H2: Webhook signature verification runs unconditionally (fail-closed, no dev bypass)
  if (!rawBody) {
    return res.status(400).json({
      success: false,
      code: 'RAW_BODY_MISSING',
      error: 'Missing raw request body for webhook signature verification.',
    });
  }

  const appSecret = (process.env.WHATSAPP_APP_SECRET || process.env.META_WHATSAPP_APP_SECRET || '').trim();

  const sigResult = verifyMetaWebhookSignature({
    rawBody,
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

  // Meta expects an immediate HTTP 200 response
  res.status(200).json({ success: true, received: true });

  try {
    const payload = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    await processMetaWebhookEvents(payload);
  } catch (err) {
    console.error('[MetaWhatsAppWebhook] Error while processing webhook events:', err.message);
  }
};

router.post('/webhook', handleWebhookNotification);
router.post('/', handleWebhookNotification);

// ─── Status & Connection Verification ────────────────────────────────────────

/**
 * GET /api/whatsapp/status & /api/whatsapp/config
 * Non-sensitive operational diagnostics for administrators
 */
router.get(['/status', '/config'], (req, res) => {
  const diagnostics = getMetaWhatsAppDiagnostics();
  return res.status(200).json({
    success: true,
    provider: 'META',
    configured: diagnostics.configured,
    diagnostics,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/whatsapp/verify-connection
 * Tests connection with Meta WhatsApp Cloud API
 */
router.post('/verify-connection', requireHotelAccess, async (req, res) => {
  try {
    const result = await verifyMetaConnection();
    const httpStatus = result.success ? 200 : (result.statusCode === 401 || result.statusCode === 403 ? 401 : 400);
    return res.status(httpStatus).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      configured: true,
      connected: false,
      error: 'SERVER_ERROR',
      message: 'Failed to verify Meta WhatsApp connection: ' + err.message,
    });
  }
});

/**
 * GET /api/whatsapp/templates
 * Fetches approved templates from Meta WhatsApp Business Account or database
 */
router.get('/templates', requireHotelAccess, async (req, res) => {
  const hotelId = req.query.hotelId || req.hotelId || req.auth?.hotelId;
  const force = req.query.force === 'true' || req.query.forceSync === 'true';
  try {
    const result = await fetchApprovedTemplates({ hotelId, forceSync: force });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'TEMPLATE_FETCH_FAILED',
      message: 'Failed to fetch templates from Meta: ' + err.message,
    });
  }
});

/**
 * POST /api/whatsapp/templates/sync & /api/whatsapp/sync-templates
 * Explicitly synchronizes templates from Meta WhatsApp Business Account (WABA) into Supabase
 */
router.post(['/templates/sync', '/sync-templates'], requireHotelAccess, async (req, res) => {
  const hotelId = req.body?.hotelId || req.hotelId || req.auth?.hotelId;
  try {
    const result = await syncMetaTemplates({ hotelId, force: true });
    return res.status(result.success ? 200 : 502).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'TEMPLATE_SYNC_FAILED',
      message: 'Failed to synchronize templates from Meta: ' + err.message,
    });
  }
});

/**
 * POST /api/whatsapp/test
 * Sends a test message via Meta WhatsApp Cloud API
 */
router.post('/test', requireHotelAccess, async (req, res) => {
  const hotelId = req.body?.hotelId || req.hotelId || req.auth?.hotelId;
  const { testPhone } = req.body;

  try {
    const owner = await resolveHotelOwnerWhatsApp(hotelId);
    let targetPhone = owner.valid ? owner.phone : '';

    if (testPhone) {
      const norm = normalizeWhatsAppPhone(testPhone);
      if (!norm.valid) {
        return res.status(400).json({
          success: false,
          status: 'invalid_recipient',
          error: 'WHATSAPP_RECIPIENT_INVALID',
          errorCode: 'WHATSAPP_RECIPIENT_INVALID',
          message: norm.error || 'The test recipient phone number is invalid.',
        });
      }
      targetPhone = norm.normalized;
    }

    if (!targetPhone) {
      return res.status(400).json({
        success: false,
        status: 'invalid_recipient',
        error: 'WHATSAPP_RECIPIENT_INVALID',
        errorCode: 'WHATSAPP_RECIPIENT_INVALID',
        message: 'No valid recipient WhatsApp number is configured for this hotel.',
      });
    }

    const testText = `🧪 *[TEST MESSAGE - HOTEL MANTRI]*\n\nOfficial Meta WhatsApp Business Cloud API connected successfully for ${owner.hotelName || 'Hotel Mantri'}.\n\n📅 Date: ${new Date().toLocaleDateString('en-IN')}\n⏰ Time: ${new Date().toLocaleTimeString('en-IN')}`;

    const outboxRecord = await recordWhatsAppOutboxEvent({
      hotelId,
      businessDate: new Date().toISOString().slice(0, 10),
      reportType: REPORT_TYPES.TEST_MESSAGE,
      deliveryType: DELIVERY_TYPES.TEST,
      recipient: targetPhone,
      provider: 'META',
      status: OUTBOX_STATUS.SENDING,
    });

    const sendResult = await sendMetaTestMessage({
      to: targetPhone,
      messageText: testText,
    });

    await updateWhatsAppOutboxEvent(outboxRecord.id, {
      status: sendResult.success ? OUTBOX_STATUS.SENT : OUTBOX_STATUS.FAILED,
      providerMessageId: sendResult.messageId || null,
      lastError: sendResult.success ? null : (sendResult.errorCode || sendResult.error || sendResult.message),
    });

    if (!sendResult.success) {
      const httpCode = sendResult.errorCode === 'WHATSAPP_PROVIDER_NOT_CONFIGURED' ? 422 : (sendResult.statusCode || 502);
      return res.status(httpCode).json({
        success: false,
        status: sendResult.status || 'failed',
        error: sendResult.error || sendResult.errorCode,
        errorCode: sendResult.errorCode || sendResult.error,
        notificationId: outboxRecord.id,
        message: sendResult.message,
        provider: 'META',
        whatsappDirectUrl: buildWhatsAppDirectUrl(targetPhone, testText),
      });
    }

    return res.json({
      success: true,
      status: 'sent',
      notificationId: outboxRecord.id,
      messageId: sendResult.messageId,
      provider: 'META',
      recipient: `+${targetPhone}`,
      message: 'Test WhatsApp message sent successfully via Meta Cloud API.',
      whatsappDirectUrl: buildWhatsAppDirectUrl(targetPhone, testText),
    });
  } catch (err) {
    console.error('[MetaWhatsAppTestRoute] Error:', err.message);
    return res.status(500).json({
      success: false,
      status: 'failed',
      error: 'SERVER_ERROR',
      errorCode: 'SERVER_ERROR',
      message: 'Failed to send test message: ' + err.message,
    });
  }
});

/**
 * GET /api/whatsapp/history & /api/whatsapp/logs
 * Recent message delivery logs for the authenticated hotel
 */
router.get(['/history', '/logs'], requireHotelAccess, async (req, res) => {
  const hotelId = req.query.hotelId || req.hotelId || req.auth?.hotelId;
  const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);

  try {
    const history = await getWhatsAppHistory(hotelId, limit);
    return res.json({
      success: true,
      count: history.length,
      history,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: 'failed',
      message: 'Failed to load WhatsApp history: ' + err.message,
    });
  }
});

/**
 * POST /api/whatsapp/retry-send
 * Retries sending a failed notification
 */
router.post('/retry-send', requireHotelAccess, async (req, res) => {
  const hotelId = req.body?.hotelId || req.hotelId || req.auth?.hotelId;
  const { notificationId, messageId } = req.body;

  if (!notificationId && !messageId) {
    return res.status(400).json({ success: false, message: 'notificationId or messageId is required.' });
  }

  try {
    const history = await getWhatsAppHistory(hotelId, 50);
    const target = history.find((h) => h.id === notificationId || h.provider_message_id === messageId);

    if (!target) {
      return res.status(404).json({ success: false, message: 'Notification delivery record not found.' });
    }

    if (target.status === 'delivered' || target.status === 'sent') {
      return res.status(409).json({
        success: false,
        error: 'ALREADY_SENT',
        message: 'This notification has already been accepted by Meta or delivered. Retrying would cause duplicate delivery.',
      });
    }

    if (target.provider_message_id && target.status !== 'failed') {
      return res.status(409).json({
        success: false,
        error: 'ALREADY_HAS_WAMID',
        message: `Message already registered with Meta (ID: ${target.provider_message_id}). Blind retry prevented.`,
      });
    }

    // Check permanent vs transient failure
    const lastErr = (target.last_error || '').toLowerCase();
    if (lastErr.includes('invalid_recipient') || lastErr.includes('unauthorized') || lastErr.includes('auth_failed')) {
      return res.status(422).json({
        success: false,
        error: 'PERMANENT_FAILURE',
        message: 'This message failed due to a permanent recipient or authentication error and cannot be auto-retried. Please verify settings.',
      });
    }

    const businessDate = target.business_date || new Date().toISOString().slice(0, 10);
    const summary = await calculateDailySummary({ hotelId, businessDate });
    const text = buildDailySummaryText(summary);

    const sendResult = await sendWhatsAppMessage({
      to: target.recipient,
      text,
    });

    await updateWhatsAppOutboxEvent(target.id, {
      status: sendResult.success ? OUTBOX_STATUS.SENT : OUTBOX_STATUS.FAILED,
      providerMessageId: sendResult.messageId || null,
      lastError: sendResult.success ? null : (sendResult.errorCode || sendResult.error || sendResult.message),
    });

    return res.json({
      success: sendResult.success,
      status: sendResult.status,
      messageId: sendResult.messageId,
      message: sendResult.message,
      whatsappDirectUrl: sendResult.whatsappDirectUrl,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'RETRY_ERROR', message: 'Internal error retrying notification.' });
  }
});

export default router;
