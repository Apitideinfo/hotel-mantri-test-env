/**
 * Hotel Mantri — Official Meta WhatsApp Cloud API Service
 *
 * Implements:
 * 1. Meta Cloud API configuration & Graph API client (Graph API v22.0 configurable)
 * 2. Meta connection testing & phone number status diagnostics
 * 3. Fetching approved templates from Meta Business Account (WABA)
 * 4. Official Approved Reservation Confirmation Template payload builder & delivery (7 variables + PDF)
 * 5. Official Approved Daily Hotel Report Template payload builder & delivery (10 variables + PDF)
 * 6. Standalone PDF Document Message dispatch
 * 7. Test WhatsApp message dispatch
 * 8. GET Webhook verification (hub.mode, hub.verify_token, hub.challenge)
 * 9. POST Webhook HMAC-SHA256 signature verification (X-Hub-Signature-256)
 * 10. Multi-tenant Supabase persistence (notification_outbox & whatsapp_webhook_events) & idempotency
 *
 * Security:
 * - Credentials remain strictly server-side (never exposed to client, browser, or logs)
 * - Timing-safe HMAC-SHA256 signature verification
 * - Sanitized logging (no tokens, app secrets, or guest PII)
 */

import crypto from 'crypto';
import dotenv from 'dotenv';
import { supabaseServiceRole } from '../supabaseClient.js';

dotenv.config();

// ─── Canonical Error Constants ────────────────────────────────────────────────

export const META_WHATSAPP_ERRORS = {
  INVALID_RECIPIENT: 'WHATSAPP_INVALID_RECIPIENT',
  PROVIDER_NOT_CONFIGURED: 'WHATSAPP_PROVIDER_NOT_CONFIGURED',
  AUTH_FAILED: 'WHATSAPP_AUTH_FAILED',
  RATE_LIMITED: 'WHATSAPP_RATE_LIMITED',
  PROVIDER_ERROR: 'WHATSAPP_PROVIDER_ERROR',
  MESSAGE_REJECTED: 'WHATSAPP_MESSAGE_REJECTED',
  TIMEOUT: 'WHATSAPP_TIMEOUT',
  TEMPLATE_IN_REVIEW: 'WHATSAPP_TEMPLATE_IN_REVIEW',
  NETWORK_ERROR: 'WHATSAPP_NETWORK_ERROR',
};

// ─── Phone Normalization Helper ───────────────────────────────────────────────

/**
 * Normalizes phone numbers for WhatsApp.
 * - Strips whitespace, dashes, parens, and non-digits
 * - Handles Indian 10-digit mobile numbers by prepending 91
 * - Preserves existing country code if 11-15 digits
 *
 * @param {string} phone
 * @returns {{ valid: boolean, normalized: string, raw: string, error?: string }}
 */
export const normalizeWhatsAppPhone = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return {
      valid: false,
      normalized: '',
      raw: '',
      error: 'Phone number is empty or invalid',
    };
  }

  const raw = phone.trim();
  let digits = raw.replace(/\D/g, '');

  // Strip leading 0
  if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }

  // 10 digits = Standard Indian mobile number -> prepend 91
  if (digits.length === 10) {
    digits = `91${digits}`;
  }

  // Validate E.164 length (10 to 15 digits)
  if (digits.length < 10 || digits.length > 15) {
    return {
      valid: false,
      normalized: digits,
      raw,
      error: `Invalid phone number length (${digits.length} digits). Expected 10-15 digits.`,
    };
  }

  return {
    valid: true,
    normalized: digits,
    raw,
  };
};

/**
 * Builds authoritative WhatsApp click-to-chat URL (wa.me)
 */
export const buildWhatsAppDirectUrl = (phone, text) => {
  const norm = normalizeWhatsAppPhone(phone);
  const targetPhone = norm.valid ? norm.normalized : (phone ? String(phone).replace(/\D/g, '') : '');
  return `https://wa.me/${targetPhone}?text=${encodeURIComponent(text || '')}`;
};

// ─── Environment & Configuration ─────────────────────────────────────────────

export const getMetaWhatsAppConfig = () => {
  const accessToken = (process.env.META_WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = (process.env.META_WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const businessAccountId = (process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '').trim();
  const graphApiVersion = (process.env.META_GRAPH_API_VERSION || process.env.WHATSAPP_GRAPH_API_VERSION || 'v22.0').trim();
  const reservationTemplate = (process.env.META_WHATSAPP_RESERVATION_TEMPLATE || process.env.WHATSAPP_RESERVATION_TEMPLATE || 'reservation_confirmation').trim();
  const reservationLanguage = (process.env.META_WHATSAPP_RESERVATION_LANGUAGE || process.env.WHATSAPP_RESERVATION_LANGUAGE || process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en').trim();
  const dailyReportTemplate = (process.env.META_WHATSAPP_DAILY_REPORT_TEMPLATE || process.env.WHATSAPP_DAILY_REPORT_TEMPLATE || 'daily_hotel_report').trim();
  const dailyReportLanguage = (process.env.META_WHATSAPP_DAILY_REPORT_LANGUAGE || process.env.WHATSAPP_DAILY_REPORT_LANGUAGE || process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en').trim();
  const dailyReportPhone = (process.env.META_WHATSAPP_DAILY_REPORT_PHONE || process.env.WHATSAPP_DAILY_REPORT_PHONE || '').trim();
  const testMode = String(process.env.WHATSAPP_TEST_MODE || 'false').toLowerCase() === 'true';
  const verifyToken = (process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_WHATSAPP_VERIFY_TOKEN || '').trim();
  const appSecret = (process.env.META_WHATSAPP_APP_SECRET || process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || '').trim();
  const isTemplateApproved = String(process.env.WHATSAPP_TEMPLATE_APPROVED || 'false').toLowerCase() === 'true';

  return {
    accessToken,
    phoneNumberId,
    businessAccountId,
    graphApiVersion,
    reservationTemplate,
    templateName: reservationTemplate,
    reservationLanguage,
    templateLanguage: reservationLanguage,
    dailyReportTemplate,
    dailyReportLanguage,
    dailyReportPhone,
    testMode,
    verifyToken,
    appSecret,
    isTemplateApproved,
    isConfigured: Boolean(accessToken && phoneNumberId),
  };
};

/**
 * Returns safe public diagnostics without revealing secrets or access tokens
 */
export const getMetaWhatsAppDiagnostics = () => {
  const cfg = getMetaWhatsAppConfig();
  return {
    provider: 'META_WHATSAPP_CLOUD_API',
    configured: cfg.isConfigured,
    graphApiVersion: cfg.graphApiVersion,
    hasAccessToken: Boolean(cfg.accessToken),
    hasPhoneNumberId: Boolean(cfg.phoneNumberId),
    hasBusinessAccountId: Boolean(cfg.businessAccountId),
    phoneNumberIdSuffix: cfg.phoneNumberId ? `...${cfg.phoneNumberId.slice(-4)}` : null,
    businessAccountIdSuffix: cfg.businessAccountId ? `...${cfg.businessAccountId.slice(-4)}` : null,
    hasVerifyToken: Boolean(cfg.verifyToken),
    hasAppSecret: Boolean(cfg.appSecret),
    reservationTemplate: cfg.reservationTemplate,
    reservationLanguage: cfg.reservationLanguage,
    dailyReportTemplate: cfg.dailyReportTemplate,
    dailyReportLanguage: cfg.dailyReportLanguage,
    dailyReportPhone: cfg.dailyReportPhone ? `...${cfg.dailyReportPhone.slice(-4)}` : null,
    testMode: cfg.testMode,
    isTemplateApproved: cfg.isTemplateApproved,
  };
};

// ─── Connection Verification & Template Queries ──────────────────────────────

/**
 * Verifies connection to Meta WhatsApp Cloud API by querying the phone number endpoint.
 * GET https://graph.facebook.com/{version}/{phone_number_id}
 */
export const verifyMetaConnection = async () => {
  const cfg = getMetaWhatsAppConfig();

  if (!cfg.accessToken || !cfg.phoneNumberId) {
    return {
      success: false,
      configured: false,
      connected: false,
      error: META_WHATSAPP_ERRORS.PROVIDER_NOT_CONFIGURED,
      errorCode: META_WHATSAPP_ERRORS.PROVIDER_NOT_CONFIGURED,
      message: 'Meta WhatsApp Cloud API credentials (META_WHATSAPP_ACCESS_TOKEN and META_WHATSAPP_PHONE_NUMBER_ID) are not configured.',
    };
  }

  const endpoint = `https://graph.facebook.com/${cfg.graphApiVersion}/${cfg.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status,name_status`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok && data.id) {
      return {
        success: true,
        configured: true,
        connected: true,
        provider: 'META_WHATSAPP_CLOUD_API',
        graphApiVersion: cfg.graphApiVersion,
        phoneNumberId: data.id,
        displayPhoneNumber: data.display_phone_number || null,
        verifiedName: data.verified_name || null,
        qualityRating: data.quality_rating || 'UNKNOWN',
        codeVerificationStatus: data.code_verification_status || 'VERIFIED',
        nameStatus: data.name_status || 'APPROVED',
        message: 'Successfully connected to official Meta WhatsApp Cloud API.',
      };
    }

    const metaError = data.error || {};
    const errorCode = metaError.code || response.status;
    const errorMessage = metaError.message || `Meta API HTTP ${response.status}`;

    return {
      success: false,
      configured: true,
      connected: false,
      error: `META_API_${errorCode}`,
      errorCode: `META_API_${errorCode}`,
      message: errorMessage,
      details: metaError.error_data?.details || metaError.error_user_msg || null,
      statusCode: response.status,
    };
  } catch (err) {
    return {
      success: false,
      configured: true,
      connected: false,
      error: META_WHATSAPP_ERRORS.NETWORK_ERROR,
      errorCode: META_WHATSAPP_ERRORS.NETWORK_ERROR,
      message: `Failed to connect to Meta WhatsApp Cloud API: ${err.message}`,
    };
  }
};

/**
 * Fetches approved WhatsApp message templates from Meta WABA.
 * GET https://graph.facebook.com/{version}/{business_account_id}/message_templates
 */
export const fetchApprovedTemplates = async ({ hotelId = null, forceSync = false } = {}) => {
  const cfg = getMetaWhatsAppConfig();

  // Try fetching synced templates from Supabase first if not forceSync
  if (!forceSync && hotelId) {
    try {
      const { data: dbTemplates } = await supabaseServiceRole
        .from('whatsapp_templates')
        .select('*')
        .or(`hotel_id.eq.${hotelId},hotel_id.is.null`)
        .order('name');

      if (dbTemplates && dbTemplates.length > 0) {
        const formatted = dbTemplates.map((t) => ({
          templateId: t.template_id,
          name: t.name,
          language: t.language,
          status: t.status,
          category: t.category,
          headerType: t.header_type,
          headerFormat: t.header_format,
          bodyText: t.body_text,
          bodyVariables: t.body_variables || [],
          footerText: t.footer_text,
          buttons: t.buttons || [],
          components: t.components || [],
        }));

        return {
          success: true,
          fromCatalog: true,
          fromDatabase: true,
          count: formatted.length,
          templates: formatted,
        };
      }
    } catch (_) {}
  }

  // Otherwise, synchronize directly with Meta
  return syncMetaTemplates({ hotelId, force: forceSync });
};


/**
 * Uploads media (PDF documents, images) directly to Meta WhatsApp Cloud API media endpoint.
 * POST https://graph.facebook.com/{version}/{phone_number_id}/media
 *
 * @param {Object} options
 * @param {Buffer|Uint8Array} options.buffer - Raw binary buffer
 * @param {string} options.filename - Filename with extension (e.g. Reservation-HM1234.pdf)
 * @param {string} options.mimeType - MIME type (default application/pdf)
 * @returns {Promise<{ success: boolean, mediaId?: string, error?: string, errorCode?: string }>}
 */
export const uploadMetaMedia = async ({
  buffer,
  filename = 'document.pdf',
  mimeType = 'application/pdf',
}) => {
  const cfg = getMetaWhatsAppConfig();
  if (!cfg.accessToken || !cfg.phoneNumberId) {
    return {
      success: false,
      errorCode: META_WHATSAPP_ERRORS.PROVIDER_NOT_CONFIGURED,
      message: 'Meta WhatsApp credentials (access token and phone number ID) are missing for media upload.',
    };
  }

  if (!buffer || (Buffer.isBuffer(buffer) && buffer.length === 0)) {
    return {
      success: false,
      errorCode: 'INVALID_MEDIA_BUFFER',
      message: 'Media buffer is empty or missing.',
    };
  }

  const endpoint = `https://graph.facebook.com/${cfg.graphApiVersion}/${cfg.phoneNumberId}/media`;
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', new Blob([buffer], { type: mimeType }), filename);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
      },
      body: form,
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok && data.id) {
      return {
        success: true,
        mediaId: data.id,
      };
    }

    const metaError = data.error || {};
    return {
      success: false,
      errorCode: `META_UPLOAD_${metaError.code || response.status}`,
      error: metaError.message || `Media upload failed with HTTP ${response.status}`,
      details: metaError,
      statusCode: response.status,
    };
  } catch (err) {
    return {
      success: false,
      errorCode: META_WHATSAPP_ERRORS.NETWORK_ERROR,
      error: err.message,
    };
  }
};

/**
 * Synchronizes message templates directly from Meta WhatsApp Business Account (WABA).
 * Iterates through all paginated results via GET /{WABA_ID}/message_templates.
 * Extracts comprehensive metadata (name, id, language, status, category, header_type,
 * body_variables, buttons) and upserts them into Supabase `whatsapp_templates`.
 *
 * @param {Object} options
 * @param {string} [options.hotelId] - Optional hotel ID scoping
 * @param {boolean} [options.force] - Force fresh sync ignoring cache
 * @returns {Promise<{ success: boolean, count: number, templates: Array, message?: string, error?: string }>}
 */
export const syncMetaTemplates = async ({ hotelId = null, force = false } = {}) => {
  const cfg = getMetaWhatsAppConfig();

  if (!cfg.accessToken || !cfg.businessAccountId) {
    // Return known approved templates configured locally
    const fallbackTemplates = [
      {
        templateId: 'local_res_tpl',
        name: cfg.reservationTemplate,
        status: 'APPROVED',
        language: cfg.reservationLanguage,
        category: 'UTILITY',
        headerType: 'DOCUMENT',
        headerFormat: 'DOCUMENT',
        bodyText: 'Reservation confirmation template',
        bodyVariables: ['1', '2', '3', '4', '5', '6', '7'],
        buttons: [],
        components: [],
      },
      {
        templateId: 'local_rep_tpl',
        name: cfg.dailyReportTemplate,
        status: 'APPROVED',
        language: cfg.dailyReportLanguage,
        category: 'UTILITY',
        headerType: 'DOCUMENT',
        headerFormat: 'DOCUMENT',
        bodyText: 'Daily hotel report template',
        bodyVariables: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
        buttons: [],
        components: [],
      },
    ];

    return {
      success: true,
      fromCatalog: false,
      count: fallbackTemplates.length,
      templates: fallbackTemplates,
      message: 'Business Account ID not configured; displaying locally configured templates.',
    };
  }

  const allRawTemplates = [];
  let nextUrl = `https://graph.facebook.com/${cfg.graphApiVersion}/${cfg.businessAccountId}/message_templates?fields=name,status,language,category,components,id&limit=100`;

  try {
    while (nextUrl) {
      const resp = await fetch(nextUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cfg.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        const metaError = data.error || {};
        return {
          success: false,
          fromCatalog: false,
          error: metaError.message || `Meta API HTTP ${resp.status}`,
          details: metaError,
        };
      }

      if (Array.isArray(data.data)) {
        allRawTemplates.push(...data.data);
      }

      nextUrl = data.paging?.next || null;
    }

    // Parse and extract complete metadata for every template
    const parsedTemplates = allRawTemplates.map((t) => {
      const components = Array.isArray(t.components) ? t.components : [];
      const headerComp = components.find((c) => String(c.type).toUpperCase() === 'HEADER');
      const bodyComp = components.find((c) => String(c.type).toUpperCase() === 'BODY');
      const footerComp = components.find((c) => String(c.type).toUpperCase() === 'FOOTER');
      const buttonsComp = components.find((c) => String(c.type).toUpperCase() === 'BUTTONS');

      const headerType = headerComp?.format ? String(headerComp.format).toUpperCase() : (headerComp ? 'TEXT' : 'NONE');
      const bodyText = bodyComp?.text || '';

      // Extract {{1}}, {{2}}, etc.
      const variableMatches = Array.from(bodyText.matchAll(/\{\{(\d+)\}\}/g)).map((m) => m[1]);
      const bodyVariables = Array.from(new Set(variableMatches)).sort((a, b) => Number(a) - Number(b));

      return {
        templateId: String(t.id || ''),
        name: t.name,
        language: t.language || 'en',
        status: String(t.status || 'APPROVED').toUpperCase(),
        category: String(t.category || 'UTILITY').toUpperCase(),
        headerType,
        headerFormat: headerComp?.format || null,
        bodyText,
        bodyVariables,
        footerText: footerComp?.text || null,
        buttons: buttonsComp?.buttons || [],
        components,
      };
    });

    // Persist parsed templates to Supabase whatsapp_templates table
    if (parsedTemplates.length > 0) {
      try {
        const rowsToUpsert = parsedTemplates.map((p) => ({
          hotel_id: hotelId || null,
          template_id: p.templateId,
          name: p.name,
          language: p.language,
          status: p.status,
          category: p.category,
          header_type: p.headerType,
          header_format: p.headerFormat,
          body_text: p.bodyText,
          body_variables: p.bodyVariables,
          footer_text: p.footerText,
          buttons: p.buttons,
          components: p.components,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));

        await supabaseServiceRole
          .from('whatsapp_templates')
          .upsert(rowsToUpsert, { onConflict: 'hotel_id,name,language' });

        if (hotelId) {
          await supabaseServiceRole
            .from('hotel_settings')
            .update({
              whatsapp_templates_last_synced_at: new Date().toISOString(),
            })
            .eq('hotel_id', hotelId);
        }
      } catch (dbErr) {
        console.warn('[MetaWhatsApp] Supabase templates upsert warning (non-fatal):', dbErr.message);
      }
    }

    return {
      success: true,
      fromCatalog: true,
      count: parsedTemplates.length,
      templates: parsedTemplates,
      message: `Successfully synchronized ${parsedTemplates.length} templates from Meta WhatsApp Business Account.`,
    };
  } catch (err) {
    return {
      success: false,
      fromCatalog: false,
      error: err.message,
    };
  }
};

// ─── GET Webhook Verification ────────────────────────────────────────────────

export const verifyMetaWebhookGet = (query = {}, serverVerifyToken = null) => {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  const expectedToken = serverVerifyToken !== null
    ? serverVerifyToken
    : (process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.META_WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN || '').trim();

  if (!expectedToken) {
    console.error('[MetaWhatsAppWebhook] Verification failed: WHATSAPP_VERIFY_TOKEN is not configured on server.');
    return {
      valid: false,
      statusCode: 500,
      error: 'SERVER_CONFIGURATION_MISSING: Verification token is not configured on server.',
    };
  }

  if (!mode || !token) {
    return {
      valid: false,
      statusCode: 400,
      error: 'BAD_REQUEST: Missing required hub parameters (hub.mode, hub.verify_token).',
    };
  }

  if (mode === 'subscribe' && token === expectedToken) {
    return {
      valid: true,
      statusCode: 200,
      challenge: challenge !== undefined ? String(challenge) : '',
    };
  }

  console.warn('[MetaWhatsAppWebhook] Verification token mismatch or invalid mode.');
  return {
    valid: false,
    statusCode: 403,
    error: 'FORBIDDEN: Verification token mismatch.',
  };
};

// ─── POST Webhook Signature Verification ────────────────────────────────────

export const verifyMetaWebhookSignature = ({
  rawBody,
  signatureHeader,
  appSecret = null,
}) => {
  const secret = appSecret !== null ? appSecret : (process.env.WHATSAPP_APP_SECRET || process.env.META_WHATSAPP_APP_SECRET || '').trim();

  if (!secret) {
    return {
      valid: false,
      statusCode: 503,
      error: 'SERVER_CONFIGURATION_MISSING: App secret is not configured on server.',
    };
  }

  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return {
      valid: false,
      statusCode: 401,
      error: 'UNAUTHORIZED: Missing X-Hub-Signature-256 header.',
    };
  }

  if (!signatureHeader.startsWith('sha256=')) {
    return {
      valid: false,
      statusCode: 401,
      error: 'UNAUTHORIZED: Malformed signature header, must start with sha256=.',
    };
  }

  const providedHash = signatureHeader.slice(7).trim();
  if (!providedHash || providedHash.length !== 64) {
    return {
      valid: false,
      statusCode: 401,
      error: 'UNAUTHORIZED: Invalid signature length, expected 64-hex SHA-256.',
    };
  }

  if (!rawBody) {
    return {
      valid: false,
      statusCode: 400,
      error: 'BAD_REQUEST: Missing request body for signature calculation.',
    };
  }

  try {
    const rawBuffer = Buffer.isBuffer(rawBody)
      ? rawBody
      : Buffer.from(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody), 'utf8');

    const expectedHash = crypto
      .createHmac('sha256', secret)
      .update(rawBuffer)
      .digest('hex');

    const expDigest = crypto.createHash('sha256').update(expectedHash).digest();
    const actDigest = crypto.createHash('sha256').update(providedHash).digest();

    if (!crypto.timingSafeEqual(expDigest, actDigest)) {
      console.warn('[MetaWhatsAppWebhook] Signature verification failed: HMAC mismatch.');
      return {
        valid: false,
        statusCode: 401,
        error: 'UNAUTHORIZED: Invalid webhook signature.',
      };
    }

    return { valid: true, statusCode: 200 };
  } catch (err) {
    console.error('[MetaWhatsAppWebhook] Error during signature verification:', err.message);
    return {
      valid: false,
      statusCode: 401,
      error: 'UNAUTHORIZED: Cryptographic verification failed.',
    };
  }
};

// ─── Official Meta Template Payload Builders ─────────────────────────────────

/**
 * Builds the official Meta template payload for reservation confirmation.
 *
 * Primary Approved Meta Template: `reservation_confirmation`
 * {{1}}: Guest name
 * {{2}}: Hotel/property name
 * {{3}}: Reservation ID
 * {{4}}: Check-in date
 * {{5}}: Check-out date
 * {{6}}: Room category
 * {{7}}: Number of guests
 * Header: Optional dynamic PDF document
 *
 * Alternate Template: `hotel_mantri_reservation_confirmation_` or `booking_confirmation`
 * {{1}}: Guest name
 * {{2}}: Booking ID
 * {{3}}: Room number
 * {{4}}: Check-in date
 * {{5}}: Check-out date
 * {{6}}: Total amount
 * {{7}}: Invoice URL
 */
export const buildApprovedReservationConfirmationTemplate = ({
  guestName = 'Valued Guest',
  hotelName = 'Hotel Mantri',
  reservationId = '',
  reservationReference = '',
  confirmationNumber = '',
  checkIn = '',
  checkOut = '',
  roomCategory = 'Standard Room',
  roomNo = '',
  guestCount = 1,
  totalAmount = '0',
  currency = '₹',
  templateName = null,
  templateLanguage = null,
  headerType = null,
  bodyVariables = null,
  documentMediaId = null,
  documentUrl = null,
  documentFilename = null,
}) => {
  const cfg = getMetaWhatsAppConfig();
  const name = templateName || cfg.reservationTemplate || 'reservation_confirmation';
  const lang = templateLanguage || cfg.reservationLanguage || 'en';

  const ref = reservationId || reservationReference || confirmationNumber || 'HM-RES';
  const cleanGuestName = String(guestName || 'Valued Guest').trim().slice(0, 60);
  const cleanHotelName = String(hotelName || 'Hotel Mantri').trim().slice(0, 60);
  const cleanReservationId = String(ref).trim().slice(0, 40);
  const cleanCheckIn = String(checkIn || '—').trim().slice(0, 30);
  const cleanCheckOut = String(checkOut || '—').trim().slice(0, 30);
  const cleanRoomCategory = String(roomCategory || (roomNo ? `Room ${roomNo}` : 'Standard Room')).trim().slice(0, 40);
  const cleanGuestCount = String(Math.max(1, Number(guestCount) || 1));

  const curr = currency || '₹';
  const formattedAmount = typeof totalAmount === 'number'
    ? `${curr}${Math.round(totalAmount).toLocaleString('en-IN')}`
    : String(totalAmount).startsWith(curr) ? totalAmount : `${curr}${totalAmount}`;

  const resolvedDocumentUrl = documentUrl || 'https://www.hotelmantri.com';
  const resolvedFilename = documentFilename || `HotelMantri-Reservation-${cleanReservationId}.pdf`;

  const components = [];

  // Dynamic PDF Header Document (supports Meta media ID or signed URL, unless template has no header)
  const shouldIncludeHeader = headerType !== 'NONE' && (documentMediaId || documentUrl);
  if (shouldIncludeHeader) {
    if (documentMediaId) {
      components.push({
        type: 'header',
        parameters: [
          {
            type: 'document',
            document: {
              id: documentMediaId,
              filename: resolvedFilename,
            },
          },
        ],
      });
    } else if (documentUrl) {
      components.push({
        type: 'header',
        parameters: [
          {
            type: 'document',
            document: {
              link: documentUrl,
              filename: resolvedFilename,
            },
          },
        ],
      });
    }
  }

  if (name.includes('hotel_mantri') || name.includes('booking_confirmation')) {
    // 7 Body parameters for booking_confirmation style
    components.push({
      type: 'body',
      parameters: [
        { type: 'text', text: cleanGuestName },
        { type: 'text', text: cleanReservationId },
        { type: 'text', text: String(roomNo || cleanRoomCategory).slice(0, 30) },
        { type: 'text', text: cleanCheckIn },
        { type: 'text', text: cleanCheckOut },
        { type: 'text', text: formattedAmount.slice(0, 30) },
        { type: 'text', text: resolvedDocumentUrl.slice(0, 500) },
      ],
    });
  } else {
    // Official Approved Meta Template variables (exact order):
    const standardParams = [
      { type: 'text', text: cleanGuestName },        // {{1}}: Guest name
      { type: 'text', text: cleanHotelName },        // {{2}}: Hotel/property name
      { type: 'text', text: cleanReservationId },    // {{3}}: Reservation ID
      { type: 'text', text: cleanCheckIn },          // {{4}}: Check-in date
      { type: 'text', text: cleanCheckOut },         // {{5}}: Check-out date
      { type: 'text', text: cleanRoomCategory },     // {{6}}: Room category
      { type: 'text', text: cleanGuestCount },       // {{7}}: Number of guests
    ];

    const paramCount = Array.isArray(bodyVariables) && bodyVariables.length > 0
      ? bodyVariables.length
      : 7;

    components.push({
      type: 'body',
      parameters: standardParams.slice(0, paramCount),
    });
  }

  return {
    name,
    language: { code: lang },
    components,
    meta: {
      guestName: cleanGuestName,
      hotelName: cleanHotelName,
      reservationId: cleanReservationId,
      checkIn: cleanCheckIn,
      checkOut: cleanCheckOut,
      roomCategory: cleanRoomCategory,
      guestCount: cleanGuestCount,
      documentUrl,
      documentFilename: resolvedFilename,
    },
  };
};

/**
 * Builds the official Meta template payload for daily hotel report.
 *
 * Approved Meta Template: `daily_hotel_report`
 * Header: Dynamic PDF document
 * Body:
 *   {{1}}: Hotel Name
 *   {{2}}: Report Date
 *   {{3}}: Total Active Rooms
 *   {{4}}: Occupied Rooms
 *   {{5}}: Occupancy Percentage
 *   {{6}}: New Reservations
 *   {{7}}: Check-ins
 *   {{8}}: Check-outs
 *   {{9}}: Daily Revenue
 *   {{10}}: Closing Cash Balance
 */
export const buildApprovedDailyReportTemplate = ({
  hotelName = 'Hotel Mantri',
  reportDate = '',
  totalRooms = 0,
  occupiedRooms = 0,
  occupancyPercentage = '0%',
  newReservations = 0,
  checkIns = 0,
  checkOuts = 0,
  dailyRevenue = '0',
  closingCash = '0',
  currency = '₹',
  templateName = null,
  templateLanguage = null,
  documentUrl = null,
  documentFilename = null,
} = {}) => {
  const cfg = getMetaWhatsAppConfig();
  const name = templateName || cfg.dailyReportTemplate || 'daily_hotel_report';
  const lang = templateLanguage || cfg.dailyReportLanguage || 'en';
  const curr = currency || '₹';

  const formattedRevenue = typeof dailyRevenue === 'number'
    ? `${curr}${Math.round(dailyRevenue).toLocaleString('en-IN')}`
    : String(dailyRevenue).startsWith(curr) ? dailyRevenue : `${curr}${dailyRevenue}`;

  const formattedCash = typeof closingCash === 'number'
    ? `${curr}${Math.round(closingCash).toLocaleString('en-IN')}`
    : String(closingCash).startsWith(curr) ? closingCash : `${curr}${closingCash}`;

  const formattedOccPercent = typeof occupancyPercentage === 'number'
    ? `${occupancyPercentage.toFixed(1)}%`
    : String(occupancyPercentage).includes('%') ? occupancyPercentage : `${occupancyPercentage}%`;

  const components = [];

  // Dynamic Document Header
  if (documentUrl) {
    components.push({
      type: 'header',
      parameters: [
        {
          type: 'document',
          document: {
            link: documentUrl,
            filename: documentFilename || `HotelMantri-Daily-Report-${reportDate || 'Today'}.pdf`,
          },
        },
      ],
    });
  }

  // 10 Body Parameters
  components.push({
    type: 'body',
    parameters: [
      { type: 'text', text: String(hotelName || 'Hotel Property').slice(0, 60) },
      { type: 'text', text: String(reportDate || 'Today').slice(0, 30) },
      { type: 'text', text: String(totalRooms || 0).slice(0, 10) },
      { type: 'text', text: String(occupiedRooms || 0).slice(0, 10) },
      { type: 'text', text: formattedOccPercent.slice(0, 15) },
      { type: 'text', text: String(newReservations || 0).slice(0, 10) },
      { type: 'text', text: String(checkIns || 0).slice(0, 10) },
      { type: 'text', text: String(checkOuts || 0).slice(0, 10) },
      { type: 'text', text: formattedRevenue.slice(0, 30) },
      { type: 'text', text: formattedCash.slice(0, 30) },
    ],
  });

  return {
    name,
    language: { code: lang },
    components,
    documentUrl,
    documentFilename: documentFilename || `HotelMantri-Daily-Report-${reportDate || 'Today'}.pdf`,
  };
};

// ─── Meta WhatsApp Cloud API Dispatcher ───────────────────────────────────────

/**
 * Sends a message via Meta WhatsApp Cloud API.
 * POST https://graph.facebook.com/{version}/{phone_number_id}/messages
 *
 * @param {Object} messagePayload
 * @returns {Promise<Object>}
 */
export const dispatchMetaGraphApiMessage = async (messagePayload) => {
  const cfg = getMetaWhatsAppConfig();

  if (!cfg.accessToken || !cfg.phoneNumberId) {
    return {
      success: false,
      status: 'provider_not_configured',
      error: META_WHATSAPP_ERRORS.PROVIDER_NOT_CONFIGURED,
      errorCode: META_WHATSAPP_ERRORS.PROVIDER_NOT_CONFIGURED,
      message: 'Meta WhatsApp Cloud API credentials are missing. Set META_WHATSAPP_ACCESS_TOKEN and META_WHATSAPP_PHONE_NUMBER_ID in your environment.',
    };
  }

  const endpoint = `https://graph.facebook.com/${cfg.graphApiVersion}/${cfg.phoneNumberId}/messages`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messagePayload),
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok && data.messages?.[0]?.id) {
      const messageId = data.messages[0].id;
      return {
        success: true,
        messageId,
        status: 'sent',
        recipient: messagePayload.to,
        rawResponse: data,
        message: 'WhatsApp message accepted by Meta Cloud API.',
      };
    }

    const metaError = data.error || {};
    const errorCode = metaError.code || response.status;
    const errorMessage = metaError.message || `Meta API HTTP ${response.status}`;
    const errorDetails = metaError.error_data?.details || metaError.error_subcode || null;

    console.warn(`[MetaWhatsAppApi] API rejected message to ...${String(messagePayload.to).slice(-4)}: [Code ${errorCode}] ${errorMessage}`);

    let mappedError = META_WHATSAPP_ERRORS.PROVIDER_ERROR;
    if (errorCode === 190) mappedError = META_WHATSAPP_ERRORS.AUTH_FAILED;
    else if (errorCode === 130429 || errorCode === 80007) mappedError = META_WHATSAPP_ERRORS.RATE_LIMITED;
    else if (errorCode === 132000 || errorCode === 132001) mappedError = META_WHATSAPP_ERRORS.TEMPLATE_IN_REVIEW;
    else if (errorCode === 131026 || errorCode === 131047) mappedError = META_WHATSAPP_ERRORS.MESSAGE_REJECTED;

    return {
      success: false,
      status: 'failed',
      errorCode: mappedError,
      error: `META_API_${errorCode}: ${errorMessage}`,
      details: errorDetails,
      statusCode: response.status,
      rawResponse: data,
      message: errorMessage,
    };
  } catch (err) {
    console.error('[MetaWhatsAppApi] Network or connection error:', err.message);
    return {
      success: false,
      status: 'failed',
      errorCode: META_WHATSAPP_ERRORS.NETWORK_ERROR,
      error: err.message,
      message: `Meta API connection error: ${err.message}`,
    };
  }
};

/**
 * Sends a reservation confirmation using the approved Meta template.
 * Includes dynamic PDF document in header if supported, or falls back to
 * document message if template lacks a document header.
 */
export const sendMetaReservationConfirmation = async ({
  to,
  guestName,
  hotelName,
  reservationId,
  confirmationNumber,
  checkIn,
  checkOut,
  roomCategory,
  roomNo,
  guestCount = 1,
  totalAmount = '0',
  currency = '₹',
  documentBuffer = null,
  documentMediaId = null,
  documentUrl = null,
  documentFilename = null,
  templateName = null,
  templateLanguage = null,
  forceSend = false,
}) => {
  const norm = normalizeWhatsAppPhone(to);
  if (!norm.valid) {
    return {
      success: false,
      status: 'invalid_recipient',
      errorCode: META_WHATSAPP_ERRORS.INVALID_RECIPIENT,
      error: norm.error || 'Invalid recipient phone number',
      message: norm.error || 'Invalid recipient phone number',
    };
  }

  const cfg = getMetaWhatsAppConfig();
  const effectiveTemplateName = templateName || cfg.reservationTemplate || 'reservation_confirmation';

  // Inspect database-stored template metadata from Meta
  let tplDef = null;
  try {
    const { data: dbTpl } = await supabaseServiceRole
      .from('whatsapp_templates')
      .select('*')
      .eq('name', effectiveTemplateName)
      .maybeSingle();
    tplDef = dbTpl;
  } catch (_) {}

  if (tplDef && tplDef.status && tplDef.status.toUpperCase() !== 'APPROVED' && !forceSend) {
    return {
      success: false,
      status: 'template_in_review',
      requiresApproval: true,
      errorCode: META_WHATSAPP_ERRORS.TEMPLATE_IN_REVIEW,
      error: `Template "${effectiveTemplateName}" is currently "${tplDef.status}". Direct sending is paused until approved by Meta.`,
      message: `Template "${effectiveTemplateName}" is currently "${tplDef.status}". Direct sending is paused until approved by Meta.`,
    };
  } else if (!cfg.isTemplateApproved && !forceSend && !tplDef) {
    return {
      success: false,
      status: 'template_in_review',
      requiresApproval: true,
      errorCode: META_WHATSAPP_ERRORS.TEMPLATE_IN_REVIEW,
      error: 'Template is currently in review by Meta. Direct sending is paused until approved.',
      message: 'Template is currently in review by Meta. Direct sending is paused until approval.',
    };
  }

  let resolvedMediaId = documentMediaId;
  if (!resolvedMediaId && documentBuffer) {
    try {
      const uploadRes = await uploadMetaMedia({
        buffer: documentBuffer,
        filename: documentFilename || `HotelMantri-Reservation-${reservationId || 'Booking'}.pdf`,
        mimeType: 'application/pdf',
      });
      if (uploadRes.success && uploadRes.mediaId) {
        resolvedMediaId = uploadRes.mediaId;
      }
    } catch (uploadErr) {
      console.warn('[MetaWhatsApp] Media upload notice, falling back to document link:', uploadErr.message);
    }
  }

  const templatePayload = buildApprovedReservationConfirmationTemplate({
    guestName,
    hotelName,
    reservationId,
    confirmationNumber,
    checkIn,
    checkOut,
    roomCategory,
    roomNo,
    guestCount,
    totalAmount,
    currency,
    templateName: effectiveTemplateName,
    templateLanguage: templateLanguage || tplDef?.language || cfg.reservationLanguage || 'en',
    headerType: tplDef?.header_type || null,
    bodyVariables: tplDef?.body_variables || null,
    documentMediaId: resolvedMediaId,
    documentUrl: !resolvedMediaId ? documentUrl : null,
    documentFilename,
  });

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: norm.normalized,
    type: 'template',
    template: {
      name: templatePayload.name,
      language: templatePayload.language,
      components: templatePayload.components,
    },
  };

  const result = await dispatchMetaGraphApiMessage(payload);

  // If template succeeded but document was not passed in header (or template rejected header),
  // send PDF document as secondary message if URL is provided
  if (result.success && documentUrl && !templatePayload.components.some((c) => c.type === 'header')) {
    await sendMetaDocumentMessage({
      to: norm.normalized,
      documentUrl,
      filename: documentFilename || `HotelMantri-Reservation-${reservationId || 'Booking'}.pdf`,
      caption: `Reservation confirmation for ${guestName || 'Guest'} (${reservationId || ''})`,
    }).catch((e) => console.warn('[MetaWhatsApp] Standalone PDF delivery note:', e.message));
  }

  return result;
};

/**
 * Sends a PDF document message directly via Meta WhatsApp Cloud API.
 */
export const sendMetaDocumentMessage = async ({
  to,
  documentUrl,
  filename = 'Reservation-Confirmation.pdf',
  caption = '',
}) => {
  const norm = normalizeWhatsAppPhone(to);
  if (!norm.valid) {
    return {
      success: false,
      status: 'invalid_recipient',
      errorCode: META_WHATSAPP_ERRORS.INVALID_RECIPIENT,
      error: norm.error || 'Invalid recipient phone number',
      message: norm.error || 'Invalid recipient phone number',
    };
  }

  if (!documentUrl || typeof documentUrl !== 'string') {
    return {
      success: false,
      status: 'invalid_document',
      error: 'Document URL is required to send a PDF document message.',
      message: 'Document URL is required to send a PDF document message.',
    };
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: norm.normalized,
    type: 'document',
    document: {
      link: documentUrl,
      filename,
      caption: caption || 'Hotel Mantri Document',
    },
  };

  return dispatchMetaGraphApiMessage(payload);
};

/**
 * Sends a daily hotel report via Meta WhatsApp Cloud API.
 */
export const sendMetaDailyReport = async ({
  to,
  hotelName,
  reportDate,
  totalRooms,
  occupiedRooms,
  occupancyPercentage,
  newReservations,
  checkIns,
  checkOuts,
  dailyRevenue,
  closingCash,
  documentUrl = null,
  documentFilename = null,
  templateName = null,
  templateLanguage = null,
  textFallback = null,
}) => {
  const norm = normalizeWhatsAppPhone(to);
  if (!norm.valid) {
    return {
      success: false,
      status: 'invalid_recipient',
      errorCode: META_WHATSAPP_ERRORS.INVALID_RECIPIENT,
      error: norm.error || 'Invalid recipient phone number',
      message: norm.error || 'Invalid recipient phone number',
    };
  }

  const cfg = getMetaWhatsAppConfig();
  const effectiveTemplateName = templateName || cfg.dailyReportTemplate || 'daily_hotel_report';

  // Inspect database-stored template metadata from Meta
  let tplDef = null;
  try {
    const { data: dbTpl } = await supabaseServiceRole
      .from('whatsapp_templates')
      .select('*')
      .eq('name', effectiveTemplateName)
      .maybeSingle();
    tplDef = dbTpl;
  } catch (_) {}

  if (tplDef && tplDef.status && tplDef.status.toUpperCase() !== 'APPROVED') {
    return {
      success: false,
      status: 'template_in_review',
      requiresApproval: true,
      errorCode: META_WHATSAPP_ERRORS.TEMPLATE_IN_REVIEW,
      error: `Daily report template "${effectiveTemplateName}" status is "${tplDef.status}". Direct sending is paused until approved by Meta.`,
      message: `Daily report template "${effectiveTemplateName}" status is "${tplDef.status}". Direct sending is paused until approved by Meta.`,
    };
  }

  const templatePayload = buildApprovedDailyReportTemplate({
    hotelName,
    reportDate,
    totalRooms,
    occupiedRooms,
    occupancyPercentage,
    newReservations,
    checkIns,
    checkOuts,
    dailyRevenue,
    closingCash,
    documentUrl,
    documentFilename,
    templateName: effectiveTemplateName,
    templateLanguage: templateLanguage || tplDef?.language || cfg.dailyReportLanguage || 'en',
  });

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: norm.normalized,
    type: 'template',
    template: {
      name: templatePayload.name,
      language: templatePayload.language,
      components: templatePayload.components,
    },
  };

  const result = await dispatchMetaGraphApiMessage(payload);

  // Fallback to text + document if template delivery is rejected
  if (!result.success && textFallback && result.statusCode === 400) {
    const textRes = await dispatchMetaGraphApiMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: norm.normalized,
      type: 'text',
      text: { body: textFallback },
    });

    if (textRes.success && documentUrl) {
      await sendMetaDocumentMessage({
        to: norm.normalized,
        documentUrl,
        filename: documentFilename || `Daily-Report-${reportDate}.pdf`,
        caption: `Executive Daily Report - ${hotelName}`,
      }).catch(() => null);
      return textRes;
    }
  }

  return result;
};

/**
 * Sends a test message via Meta WhatsApp Cloud API.
 */
export const sendMetaTestMessage = async ({ to, messageText = null }) => {
  const norm = normalizeWhatsAppPhone(to);
  if (!norm.valid) {
    return {
      success: false,
      status: 'invalid_recipient',
      errorCode: META_WHATSAPP_ERRORS.INVALID_RECIPIENT,
      error: norm.error || 'Invalid recipient phone number',
      message: norm.error || 'Invalid recipient phone number',
    };
  }

  const cfg = getMetaWhatsAppConfig();
  const text = messageText || `🧪 *[TEST MESSAGE - HOTEL MANTRI]*\n\nThis is a verification message dispatched directly from the official Meta WhatsApp Business Cloud API (Graph API ${cfg.graphApiVersion}).\n\n✅ Phone Number ID: ...${cfg.phoneNumberId.slice(-4)}\n📅 Timestamp: ${new Date().toISOString()}`;

  // If a template is configured, try sending template message first
  // Otherwise send standard text message
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: norm.normalized,
    type: 'text',
    text: { body: text },
  };

  return dispatchMetaGraphApiMessage(payload);
};

// ─── Webhook Event Processing & Persistence ──────────────────────────────────

const sanitizeMetaStatusError = (errorObj) => {
  if (!errorObj) return null;
  if (Array.isArray(errorObj) && errorObj.length > 0) {
    return sanitizeMetaStatusError(errorObj[0]);
  }
  return {
    code: errorObj.code || 'UNKNOWN_ERROR',
    title: errorObj.title || errorObj.message || 'Error reported by Meta WhatsApp API',
    details: errorObj.error_data?.details || null,
  };
};

export const processMetaWebhookEvents = async (payload) => {
  if (!payload || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) {
    return {
      processed: false,
      eventCount: 0,
      reason: 'IGNORED: Not a WhatsApp Business Account webhook payload.',
      results: [],
    };
  }

  const results = [];

  for (const entry of payload.entry) {
    const changes = entry.changes || [];
    for (const change of changes) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};
      const metadata = value.metadata || {};
      const phoneNumberId = metadata.phone_number_id || null;

      const statuses = value.statuses || [];
      for (const statusObj of statuses) {
        const wamid = statusObj.id;
        const rawStatus = (statusObj.status || '').toLowerCase();
        const timestamp = statusObj.timestamp ? new Date(Number(statusObj.timestamp) * 1000).toISOString() : new Date().toISOString();
        const recipientPhone = statusObj.recipient_id || null;
        const statusError = sanitizeMetaStatusError(statusObj.errors);

        const idempotencyKey = `meta_status_${wamid}_${rawStatus}_${statusObj.timestamp || ''}`;

        try {
          await supabaseServiceRole.from('whatsapp_webhook_events').insert({
            event_id: `${wamid}_${rawStatus}`,
            wamid,
            event_type: 'status_update',
            phone_number_id: phoneNumberId,
            recipient_phone: recipientPhone,
            delivery_status: rawStatus,
            event_timestamp: timestamp,
            processing_status: 'PROCESSED',
            error_details: statusError ? JSON.stringify(statusError) : null,
            idempotency_key: idempotencyKey,
            raw_metadata: {
              pricing: statusObj.pricing || null,
              conversation: statusObj.conversation || null,
            },
          });
        } catch (dbErr) {
          if (!String(dbErr.message).includes('duplicate key') && !String(dbErr.message).includes('relation')) {
            console.warn('[MetaWhatsAppWebhook] Webhook event logging note:', dbErr.message);
          }
        }

        try {
          let outboxStatus = 'submitted';
          if (rawStatus === 'delivered' || rawStatus === 'read') outboxStatus = 'delivered';
          else if (rawStatus === 'failed') outboxStatus = 'failed';
          else if (rawStatus === 'sent') outboxStatus = 'sent';

          const updateFields = {
            updated_at: new Date().toISOString(),
          };

          if (outboxStatus === 'delivered') {
            updateFields.delivered_at = timestamp;
            updateFields.status = 'delivered';
          } else if (outboxStatus === 'sent') {
            updateFields.submitted_at = timestamp;
            updateFields.status = 'sent';
          } else if (outboxStatus === 'failed') {
            updateFields.failed_at = timestamp;
            updateFields.status = 'failed';
            updateFields.last_error = statusError ? `${statusError.code}: ${statusError.title}` : 'Delivery failed';
          }

          const { data: outboxRows } = await supabaseServiceRole
            .from('notification_outbox')
            .select('id, hotel_id, reservation_id')
            .eq('provider_message_id', wamid);

          if (outboxRows && outboxRows.length > 0) {
            for (const row of outboxRows) {
              await supabaseServiceRole
                .from('notification_outbox')
                .update(updateFields)
                .eq('id', row.id);

              if (row.reservation_id && row.hotel_id) {
                const docStatus = outboxStatus === 'delivered' ? 'DELIVERED' : outboxStatus === 'failed' ? 'FAILED' : 'SENT';
                await supabaseServiceRole
                  .from('reservation_documents')
                  .update({
                    whatsapp_status: docStatus,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('hotel_id', row.hotel_id)
                  .eq('reservation_id', row.reservation_id);
              }
            }
          }
        } catch (updateErr) {
          console.warn('[MetaWhatsAppWebhook] Non-fatal outbox status update error:', updateErr.message);
        }

        results.push({ type: 'status_update', wamid, status: rawStatus });
      }

      const messages = value.messages || [];
      for (const msg of messages) {
        const wamid = msg.id;
        const senderPhone = msg.from;
        const msgType = msg.type || 'text';
        const timestamp = msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString();
        const idempotencyKey = `meta_msg_${wamid}`;

        try {
          await supabaseServiceRole.from('whatsapp_webhook_events').insert({
            event_id: wamid,
            wamid,
            event_type: 'incoming_message',
            phone_number_id: phoneNumberId,
            sender_phone: senderPhone,
            delivery_status: 'received',
            event_timestamp: timestamp,
            processing_status: 'PROCESSED',
            idempotency_key: idempotencyKey,
            raw_metadata: {
              type: msgType,
              hasText: Boolean(msg.text?.body),
            },
          });
        } catch (dbErr) {
          if (!String(dbErr.message).includes('duplicate key') && !String(dbErr.message).includes('relation')) {
            console.warn('[MetaWhatsAppWebhook] Incoming message logging note:', dbErr.message);
          }
        }

        results.push({ type: 'incoming_message', wamid, from: senderPhone });
      }
    }
  }

  return {
    processed: true,
    eventCount: results.length,
    results,
  };
};

export default {
  META_WHATSAPP_ERRORS,
  normalizeWhatsAppPhone,
  buildWhatsAppDirectUrl,
  getMetaWhatsAppConfig,
  getMetaWhatsAppDiagnostics,
  verifyMetaConnection,
  fetchApprovedTemplates,
  syncMetaTemplates,
  uploadMetaMedia,
  verifyMetaWebhookGet,
  verifyMetaWebhookSignature,
  buildApprovedReservationConfirmationTemplate,
  buildApprovedDailyReportTemplate,
  dispatchMetaGraphApiMessage,
  sendMetaReservationConfirmation,
  sendMetaDocumentMessage,
  sendMetaDailyReport,
  sendMetaTestMessage,
  processMetaWebhookEvents,
};
