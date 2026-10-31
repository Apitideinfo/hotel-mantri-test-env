/**
 * Hotel Mantri — Meta Compliance & Data Deletion Routes
 *
 * Endpoints:
 *   POST /api/meta/data-deletion-callback   — Meta User Data Deletion Callback
 *   GET  /api/meta/deletion-status/:code    — Status check endpoint for Meta/guests
 *   POST /api/compliance/deletion-request  — Public interactive web deletion request form
 */

import express from 'express';
import {
  parseAndVerifyMetaSignedRequest,
  recordDeletionRequest,
  findDeletionRequest,
  generateConfirmationCode,
} from '../services/metaComplianceService.js';

const router = express.Router();

// Simple in-memory rate-limiter for web form submissions (max 5 requests per 15 minutes per IP)
const submissionRateMap = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

const cleanupRateLimitMap = () => {
  const now = Date.now();
  for (const [ip, data] of submissionRateMap.entries()) {
    if (now - data.firstRequest > RATE_LIMIT_WINDOW_MS) {
      submissionRateMap.delete(ip);
    }
  }
};
setInterval(cleanupRateLimitMap, 5 * 60 * 1000).unref();

const webFormRateLimiter = (req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown-ip';
  const now = Date.now();
  const current = submissionRateMap.get(ip);

  if (!current || now - current.firstRequest > RATE_LIMIT_WINDOW_MS) {
    submissionRateMap.set(ip, { count: 1, firstRequest: now });
    return next();
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
      error: 'Too many deletion requests submitted from this IP. Please wait a few minutes or contact privacy@hotelmantri.com directly.',
    });
  }

  current.count++;
  next();
};

/**
 * 1. Meta User Data Deletion Callback
 * Official Meta documentation specification:
 * URL: https://www.hotelmantri.com/api/meta/data-deletion-callback
 * HTTP Method: POST
 * Body parameter: signed_request
 *
 * Expected Response:
 * {
 *   "url": "https://www.hotelmantri.com/data-deletion?code=<confirmation_code>",
 *   "confirmation_code": "<confirmation_code>"
 * }
 */
router.post('/data-deletion-callback', async (req, res) => {
  const requestId = req.requestId || `HM-META-${Date.now().toString(36).toUpperCase()}`;

  try {
    const signedRequest = req.body?.signed_request || req.query?.signed_request;
    const appSecret =
      process.env.META_APP_SECRET ||
      process.env.WHATSAPP_APP_SECRET ||
      '';

    if (!signedRequest) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing signed_request parameter in request body or query.',
        requestId,
      });
    }

    if (!appSecret) {
      return res.status(503).json({
        error: 'Service Unavailable',
        code: 'APP_SECRET_NOT_CONFIGURED',
        message: 'Meta App Secret is not configured on server.',
        requestId,
      });
    }

    let verification;
    try {
      verification = parseAndVerifyMetaSignedRequest(signedRequest, appSecret);
    } catch (err) {
      if (err.statusCode === 503 || err.code === 'APP_SECRET_NOT_CONFIGURED') {
        return res.status(503).json({
          error: 'Service Unavailable',
          code: 'APP_SECRET_NOT_CONFIGURED',
          message: 'Meta App Secret is not configured on server.',
          requestId,
        });
      }
      throw err;
    }

    if (!verification.valid) {
      console.warn(`[MetaCompliance] Signed request rejected (${verification.error}) [${requestId}]`);
      return res.status(401).json({
        error: 'Unauthorized',
        code: verification.error || 'INVALID_SIGNATURE',
        message: 'The signature in the signed_request does not match the configured Meta App Secret or payload is invalid.',
        requestId,
      });
    }

    const payload = verification.data || {};
    const metaUserId = payload.user_id || 'unknown_meta_user';
    const confirmationCode = generateConfirmationCode('HM-DEL-META');

    await recordDeletionRequest({
      confirmationCode,
      source: 'meta_callback',
      metaUserId,
      requestType: 'meta_app_data_deletion',
      reason: 'User removed Hotel Mantri Meta/WhatsApp app permissions or triggered Meta Data Deletion.',
      ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
    });

    const statusUrl = `https://www.hotelmantri.com/data-deletion?code=${encodeURIComponent(confirmationCode)}`;

    console.log(`[MetaCompliance] Processed Meta deletion callback for user_id=${metaUserId}, code=${confirmationCode} [${requestId}]`);

    // Meta strictly expects JSON with url and confirmation_code
    return res.status(200).json({
      url: statusUrl,
      confirmation_code: confirmationCode,
    });
  } catch (err) {
    console.error(`[MetaCompliance] Internal error handling Meta deletion callback:`, err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to record Meta deletion request.',
      requestId,
    });
  }
});

/**
 * 2. Status Check Endpoint
 * GET /api/meta/deletion-status/:code
 * GET /api/compliance/deletion-status/:code
 *
 * Publicly accessible without leaking PII. Returns request progression.
 */
const handleStatusCheck = async (req, res) => {
  const code = (req.params.code || req.query.code || '').trim();
  const requestId = req.requestId || `HM-STATUS-${Date.now().toString(36).toUpperCase()}`;

  if (!code) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_CONFIRMATION_CODE',
      message: 'Please provide a valid deletion request confirmation code.',
      requestId,
    });
  }

  try {
    const record = await findDeletionRequest(code);
    if (!record) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: `No active or historical deletion request found for reference "${code}". Please verify the code or contact privacy@hotelmantri.com.`,
        requestId,
      });
    }

    const statusLabels = {
      received: 'Request Received & Acknowledged',
      under_review: 'Identity Verification & Scoping in Progress',
      completed: 'Completed (Personal Data Purged / Anonymized)',
      restricted_retention: 'Restricted Retention Applied (Statutory Tax & Accounting Preservation)',
    };

    return res.status(200).json({
      success: true,
      confirmationCode: record.confirmation_code,
      status: record.status,
      statusLabel: statusLabels[record.status] || 'Processing',
      source: record.source,
      requestType: record.request_type,
      submittedAt: record.created_at,
      updatedAt: record.updated_at,
      dispositionNotes: record.disposition_notes,
      retentionNotice:
        'Under Section 44AA of the Indian Income Tax Act and Section 36 of the CGST Act, statutory financial invoices, payment ledgers, and transaction vouchers must be retained for 6–8 years. Non-financial personal data (contact details, marketing preferences) is purged or pseudonymized.',
      requestId,
    });
  } catch (err) {
    console.error(`[MetaCompliance] Error checking deletion status for ${code}:`, err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to retrieve deletion status.',
      requestId,
    });
  }
};

router.get('/deletion-status/:code', handleStatusCheck);
router.get('/deletion-status', handleStatusCheck);

/**
 * 3. Public Interactive Web Deletion Request Form
 * POST /api/compliance/deletion-request
 *
 * Validates requester details, logs request, generates confirmation code.
 */
router.post('/deletion-request', webFormRateLimiter, async (req, res) => {
  const requestId = req.requestId || `HM-DELREQ-${Date.now().toString(36).toUpperCase()}`;

  try {
    const {
      name,
      email,
      phone,
      role = 'guest',
      hotelName,
      bookingRef,
      requestType = 'full_deletion',
      reason,
      confirmedAccuracy,
    } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_NAME',
        error: 'Please provide your full legal name to identify the relevant records.',
      });
    }

    const emailTrimmed = email ? String(email).trim().toLowerCase() : '';
    const phoneTrimmed = phone ? String(phone).trim() : '';

    if (!emailTrimmed && !phoneTrimmed) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_CONTACT',
        error: 'Please provide at least a valid email address or phone number so we can locate your record and verify your identity.',
      });
    }

    if (emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL',
        error: 'Please provide a valid email address.',
      });
    }

    if (confirmedAccuracy !== true) {
      return res.status(400).json({
        success: false,
        code: 'CONFIRMATION_REQUIRED',
        error: 'Please certify that you are the authorized data subject or acting on their verified behalf.',
      });
    }

    const confirmationCode = generateConfirmationCode('HM-DEL');

    const record = await recordDeletionRequest({
      confirmationCode,
      source: 'web_form',
      requesterName: name.trim(),
      email: emailTrimmed || null,
      phone: phoneTrimmed || null,
      role,
      hotelName: hotelName ? String(hotelName).trim() : null,
      bookingRef: bookingRef ? String(bookingRef).trim() : null,
      requestType,
      reason: reason ? String(reason).trim() : null,
      ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
    });

    console.log(`[MetaCompliance] Web deletion request received from ${name} (${emailTrimmed || phoneTrimmed}), code=${confirmationCode} [${requestId}]`);

    return res.status(200).json({
      success: true,
      confirmationCode: record.confirmation_code,
      message: 'Your personal data deletion request has been registered successfully.',
      status: record.status,
      statusUrl: `https://www.hotelmantri.com/data-deletion?code=${encodeURIComponent(record.confirmation_code)}`,
      statutoryNotice:
        'Your request has been logged into our compliance register. Non-financial personal data will be queued for review and deletion within 30 days. In accordance with applicable taxation and hotel regulations, financial transaction records and tax invoices are preserved under statutory retention rules.',
      requestId,
    });
  } catch (err) {
    console.error(`[MetaCompliance] Error processing web deletion request:`, err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'An unexpected error occurred while processing your deletion request. Please email privacy@hotelmantri.com.',
      requestId,
    });
  }
});

export default router;
