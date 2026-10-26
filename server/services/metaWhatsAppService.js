/**
 * Hotel Mantri — Official Meta WhatsApp Cloud API Service
 *
 * Implements:
 * 1. GET Webhook verification (hub.mode, hub.verify_token, hub.challenge)
 * 2. POST Webhook HMAC-SHA256 signature verification (X-Hub-Signature-256)
 * 3. Official Meta Cloud API Client (Graph API v22.0)
 * 4. Approved Template `reservation_confirmation` payload builder with 7 variables
 * 5. Template review / approval safety guard (prevents sending unapproved template)
 * 6. Reservation confirmation PDF document message delivery
 * 7. Multi-tenant Supabase persistence & idempotency
 *
 * Security:
 * - Credentials remain strictly server-side (never exposed to client or logs)
 * - Timing-safe HMAC-SHA256 signature verification
 * - Sanitized logging (no tokens, app secrets, or guest PII)
 */

import crypto from 'crypto';
import dotenv from 'dotenv';
import { supabaseServiceRole } from '../supabaseClient.js';
import { normalizeWhatsAppPhone } from './whatsappService.js';

dotenv.config();

// ─── Environment & Configuration ─────────────────────────────────────────────

export const getMetaWhatsAppConfig = () => {
  const verifyToken = (process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
  const appSecret = (process.env.WHATSAPP_APP_SECRET || '').trim();
  const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const businessAccountId = (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '').trim();
  const graphApiVersion = (process.env.WHATSAPP_GRAPH_API_VERSION || 'v22.0').trim();
  const templateName = (process.env.WHATSAPP_RESERVATION_TEMPLATE || 'reservation_confirmation').trim();
  const templateLanguage = (process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en').trim();
  const isTemplateApproved = String(process.env.WHATSAPP_TEMPLATE_APPROVED || 'false').toLowerCase() === 'true';

  return {
    verifyToken,
    appSecret,
    accessToken,
    phoneNumberId,
    businessAccountId,
    graphApiVersion,
    templateName,
    templateLanguage,
    isTemplateApproved,
    isConfigured: Boolean(verifyToken && appSecret && accessToken && phoneNumberId),
  };
};

/**
 * Returns safe public diagnostics (never reveals secrets or tokens)
 */
export const getMetaWhatsAppDiagnostics = () => {
  const cfg = getMetaWhatsAppConfig();
  return {
    provider: 'META_WHATSAPP_CLOUD_API',
    configured: cfg.isConfigured,
    graphApiVersion: cfg.graphApiVersion,
    hasVerifyToken: Boolean(cfg.verifyToken),
    hasAppSecret: Boolean(cfg.appSecret),
    hasAccessToken: Boolean(cfg.accessToken),
    hasPhoneNumberId: Boolean(cfg.phoneNumberId),
    hasBusinessAccountId: Boolean(cfg.businessAccountId),
    phoneNumberIdSuffix: cfg.phoneNumberId ? `...${cfg.phoneNumberId.slice(-4)}` : null,
    templateName: cfg.templateName,
    templateLanguage: cfg.templateLanguage,
    isTemplateApproved: cfg.isTemplateApproved,
  };
};

// ─── GET Webhook Verification ────────────────────────────────────────────────

/**
 * Verifies Meta webhook registration challenge.
 *
 * @param {Object} query - req.query
 * @param {string} [serverVerifyToken] - Optional override, defaults to process.env.WHATSAPP_VERIFY_TOKEN
 * @returns {{ valid: boolean, statusCode: number, challenge?: string, error?: string }}
 */
export const verifyMetaWebhookGet = (query = {}, serverVerifyToken = null) => {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  const expectedToken = serverVerifyToken !== null
    ? serverVerifyToken
    : (process.env.WHATSAPP_VERIFY_TOKEN || '').trim();

  // If server has no verify token configured, fail closed
  if (!expectedToken) {
    console.error('[MetaWhatsAppWebhook] Verification failed: WHATSAPP_VERIFY_TOKEN is not configured on server.');
    return {
      valid: false,
      statusCode: 500,
      error: 'SERVER_CONFIGURATION_MISSING: Verification token is not configured on server.',
    };
  }

  // Missing parameters
  if (!mode || !token) {
    return {
      valid: false,
      statusCode: 400,
      error: 'BAD_REQUEST: Missing required hub parameters (hub.mode, hub.verify_token).',
    };
  }

  // Must be 'subscribe' mode and token must match
  if (mode === 'subscribe' && token === expectedToken) {
    return {
      valid: true,
      statusCode: 200,
      challenge: challenge !== undefined ? String(challenge) : '',
    };
  }

  // Token mismatch or invalid mode
  console.warn('[MetaWhatsAppWebhook] Verification token mismatch or invalid mode.');
  return {
    valid: false,
    statusCode: 403,
    error: 'FORBIDDEN: Verification token mismatch.',
  };
};

// ─── POST Webhook Signature Verification ────────────────────────────────────

/**
 * Validates Meta's X-Hub-Signature-256 header using timingSafeEqual HMAC-SHA256.
 *
 * @param {Object} params
 * @param {Buffer|string} params.rawBody - Raw unparsed request body
 * @param {string} params.signatureHeader - Value of 'X-Hub-Signature-256' header
 * @param {string} [params.appSecret] - Meta App Secret
 * @returns {{ valid: boolean, statusCode: number, error?: string }}
 */
export const verifyMetaWebhookSignature = ({
  rawBody,
  signatureHeader,
  appSecret = null,
}) => {
  const secret = appSecret !== null ? appSecret : (process.env.WHATSAPP_APP_SECRET || '').trim();

  if (!secret) {
    // Fail closed in production; in non-prod return 500
    console.error('[MetaWhatsAppWebhook] Signature verification failed: WHATSAPP_APP_SECRET is not configured on server.');
    return {
      valid: false,
      statusCode: 500,
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

    const expectedBuf = Buffer.from(expectedHash, 'utf8');
    const providedBuf = Buffer.from(providedHash, 'utf8');

    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      console.warn('[MetaWhatsAppWebhook] Signature verification failed: HMAC mismatch.');
      return {
        valid: false,
        statusCode: 403,
        error: 'FORBIDDEN: Invalid webhook signature.',
      };
    }

    return { valid: true, statusCode: 200 };
  } catch (err) {
    console.error('[MetaWhatsAppWebhook] Error during signature verification:', err.message);
    return {
      valid: false,
      statusCode: 403,
      error: 'FORBIDDEN: Cryptographic verification failed.',
    };
  }
};

// ─── Template Payload Builder (Official Approved Variables) ──────────────────

/**
 * Builds the official Meta template payload for `reservation_confirmation`.
 *
 * Approved Meta Template Variables (Exact Order):
 *   {{1}}: Guest name
 *   {{2}}: Hotel/property name
 *   {{3}}: Reservation ID
 *   {{4}}: Check-in date
 *   {{5}}: Check-out date
 *   {{6}}: Room category
 *   {{7}}: Number of guests
 *
 * Header (Optional Document):
 *   document: { link, filename }
 *
 * @param {Object} params
 * @returns {{ name: string, language: { code: string }, components: Array }}
 */
export const buildApprovedReservationConfirmationTemplate = ({
  guestName = 'Valued Guest',
  hotelName = 'Hotel Mantri',
  reservationId = '',
  confirmationNumber = '',
  checkIn = '',
  checkOut = '',
  roomCategory = 'Standard Room',
  guestCount = 1,
  templateLanguage = null,
  documentUrl = null,
  documentFilename = null,
}) => {
  const cfg = getMetaWhatsAppConfig();
  const name = cfg.templateName;
  const lang = templateLanguage || cfg.templateLanguage || 'en';

  const ref = reservationId || confirmationNumber || 'HM-RES';
  const cleanGuestName = String(guestName || 'Valued Guest').trim().slice(0, 60);
  const cleanHotelName = String(hotelName || 'Hotel Mantri').trim().slice(0, 60);
  const cleanReservationId = String(ref).trim().slice(0, 40);
  const cleanCheckIn = String(checkIn || '—').trim().slice(0, 30);
  const cleanCheckOut = String(checkOut || '—').trim().slice(0, 30);
  const cleanRoomCategory = String(roomCategory || 'Standard Room').trim().slice(0, 40);
  const cleanGuestCount = String(Math.max(1, Number(guestCount) || 1));

  const components = [];

  // 1. Dynamic PDF Header Document (if provided)
  if (documentUrl) {
    components.push({
      type: 'header',
      parameters: [
        {
          type: 'document',
          document: {
            link: documentUrl,
            filename: documentFilename || `HotelMantri-Reservation-${cleanReservationId}.pdf`,
          },
        },
      ],
    });
  }

  // 2. Body Component: 7 parameters in EXACT Meta approved order
  components.push({
    type: 'body',
    parameters: [
      { type: 'text', text: cleanGuestName },        // {{1}}: Guest name
      { type: 'text', text: cleanHotelName },        // {{2}}: Hotel/property name
      { type: 'text', text: cleanReservationId },    // {{3}}: Reservation ID
      { type: 'text', text: cleanCheckIn },          // {{4}}: Check-in date
      { type: 'text', text: cleanCheckOut },         // {{5}}: Check-out date
      { type: 'text', text: cleanRoomCategory },     // {{6}}: Room category
      { type: 'text', text: cleanGuestCount },       // {{7}}: Number of guests
    ],
  });

  return {
    name,
    language: { code: lang },
    components,
    // Metadata for outbox logging & audit
    meta: {
      guestName: cleanGuestName,
      hotelName: cleanHotelName,
      reservationId: cleanReservationId,
      checkIn: cleanCheckIn,
      checkOut: cleanCheckOut,
      roomCategory: cleanRoomCategory,
      guestCount: cleanGuestCount,
      documentUrl,
      documentFilename,
    },
  };
};

// ─── Meta WhatsApp Cloud API Client ──────────────────────────────────────────

/**
 * Sends a message via Meta WhatsApp Cloud API.
 * Uses official Graph API endpoint: POST https://graph.facebook.com/{version}/{phone_number_id}/messages
 *
 * @param {Object} messagePayload - Complete Meta message payload
 * @returns {Promise<{ success: boolean, messageId?: string, status?: string, error?: string, rawResponse?: Object }>}
 */
export const dispatchMetaGraphApiMessage = async (messagePayload) => {
  const cfg = getMetaWhatsAppConfig();

  if (!cfg.accessToken || !cfg.phoneNumberId) {
    return {
      success: false,
      status: 'not_configured',
      error: 'WHATSAPP_CONFIG_MISSING: Access token or Phone Number ID is missing.',
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
      };
    }

    // Handle Meta Graph API errors safely (never log access token)
    const metaError = data.error || {};
    const errorCode = metaError.code || response.status;
    const errorMessage = metaError.message || `Meta API HTTP ${response.status}`;
    const errorDetails = metaError.error_data?.details || metaError.error_subcode || null;

    console.warn(`[MetaWhatsAppApi] API rejected message to ...${String(messagePayload.to).slice(-4)}: [Code ${errorCode}] ${errorMessage}`);

    return {
      success: false,
      status: 'failed',
      errorCode: `META_API_${errorCode}`,
      error: errorMessage,
      details: errorDetails,
      statusCode: response.status,
      rawResponse: data,
    };
  } catch (err) {
    console.error('[MetaWhatsAppApi] Network or connection error:', err.message);
    return {
      success: false,
      status: 'failed',
      errorCode: 'META_NETWORK_ERROR',
      error: err.message,
    };
  }
};

/**
 * Sends the official approved reservation confirmation template via Meta Cloud API.
 * Strictly respects template approval status: if template is 'In review', prevents dispatch.
 *
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export const sendMetaReservationConfirmation = async ({
  to,
  guestName,
  hotelName,
  reservationId,
  checkIn,
  checkOut,
  roomCategory,
  guestCount,
  documentUrl = null,
  documentFilename = null,
  forceSend = false,
}) => {
  const cfg = getMetaWhatsAppConfig();

  // 1. Validate Recipient
  const norm = normalizeWhatsAppPhone(to);
  if (!norm.valid) {
    return {
      success: false,
      status: 'invalid_recipient',
      error: norm.error || 'Invalid recipient phone number',
    };
  }
  const recipient = norm.normalized;

  // 2. Safety Guard: Check Template Approval Status
  // The template is currently in review. Prevent sending unless approved or forceSend is enabled for testing.
  if (!cfg.isTemplateApproved && !forceSend) {
    console.warn(`[MetaWhatsApp] Template "${cfg.templateName}" is currently IN REVIEW in Meta. Automated dispatch is paused until approved.`);
    return {
      success: false,
      status: 'template_in_review',
      templateName: cfg.templateName,
      message: `Meta template "${cfg.templateName}" is currently in review. Set WHATSAPP_TEMPLATE_APPROVED=true once approved by Meta.`,
      requiresApproval: true,
    };
  }

  // 3. Build Template Payload
  const templatePayload = buildApprovedReservationConfirmationTemplate({
    guestName,
    hotelName,
    reservationId,
    checkIn,
    checkOut,
    roomCategory,
    guestCount,
    documentUrl,
    documentFilename,
  });

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'template',
    template: {
      name: templatePayload.name,
      language: templatePayload.language,
      components: templatePayload.components,
    },
  };

  // 4. Dispatch to Meta Cloud API
  return dispatchMetaGraphApiMessage(payload);
};

/**
 * Sends a PDF reservation confirmation as a standalone WhatsApp document message.
 *
 * @param {Object} params
 * @param {string} params.to - Recipient phone
 * @param {string} params.documentUrl - Authoritative URL of the PDF (signed Supabase Storage link)
 * @param {string} params.filename - Display filename (e.g. HotelMantri-Booking-HM-RES-123.pdf)
 * @param {string} [params.caption] - Document caption
 * @returns {Promise<Object>}
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
      error: norm.error || 'Invalid recipient phone number',
    };
  }

  if (!documentUrl || typeof documentUrl !== 'string') {
    return {
      success: false,
      status: 'invalid_document',
      error: 'Document URL is required to send a PDF document message.',
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
      caption: caption || `Reservation Confirmation Document`,
    },
  };

  return dispatchMetaGraphApiMessage(payload);
};

// ─── Webhook Event Processing & Persistence ──────────────────────────────────

/**
 * Sanitizes errors from Meta webhook status payloads
 */
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

/**
 * Processes incoming Meta WhatsApp Webhook notification events.
 * Safe, idempotent, and updates outbox + document statuses.
 *
 * @param {Object} payload - Parsed JSON body
 * @returns {Promise<{ processed: boolean, eventCount: number, results: Array }>}
 */
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

      // ── Process Status Updates (sent, delivered, read, failed) ──
      const statuses = value.statuses || [];
      for (const statusObj of statuses) {
        const wamid = statusObj.id; // WhatsApp Message ID (wamid.HBgL...)
        const rawStatus = (statusObj.status || '').toLowerCase(); // sent | delivered | read | failed
        const timestamp = statusObj.timestamp ? new Date(Number(statusObj.timestamp) * 1000).toISOString() : new Date().toISOString();
        const recipientPhone = statusObj.recipient_id || null;
        const statusError = sanitizeMetaStatusError(statusObj.errors);

        const idempotencyKey = `meta_status_${wamid}_${rawStatus}_${statusObj.timestamp || ''}`;

        // 1. Persist to whatsapp_webhook_events if table exists
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
          // Non-fatal if table not migrated yet or duplicate key
          if (!String(dbErr.message).includes('duplicate key') && !String(dbErr.message).includes('relation')) {
            console.warn('[MetaWhatsAppWebhook] Webhook event logging note:', dbErr.message);
          }
        }

        // 2. Update notification_outbox and reservation_documents
        try {
          // Normalize status
          let outboxStatus = 'submitted';
          if (rawStatus === 'delivered') outboxStatus = 'delivered';
          else if (rawStatus === 'read') outboxStatus = 'delivered';
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

          // Find outbox row by provider_message_id (wamid)
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

              // Update reservation_documents if associated
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

      // ── Process Incoming Messages (from guest) ──
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
              // Never store full message bodies if not necessary, only safe structural metadata
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
  getMetaWhatsAppConfig,
  getMetaWhatsAppDiagnostics,
  verifyMetaWebhookGet,
  verifyMetaWebhookSignature,
  buildApprovedReservationConfirmationTemplate,
  dispatchMetaGraphApiMessage,
  sendMetaReservationConfirmation,
  sendMetaDocumentMessage,
  processMetaWebhookEvents,
};
