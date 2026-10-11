/**
 * Hotel Mantri — WhatsApp Provider Service
 *
 * Provides a clean server-side provider abstraction for WhatsApp delivery
 * using Whinta as the exclusive WhatsApp Business API provider.
 *
 *   - WhintaProvider: Whinta Web API (WHINTA_ACCESS_TOKEN)
 *   - Manual wa.me fallback: Always available even when automated provider is not configured
 *
 * CRITICAL REQUIREMENTS:
 *   - NO FAKE SUCCESS: Never claim message sent unless provider confirms acceptance.
 *   - All provider credentials remain strictly server-side.
 *   - Canonical error codes matching application error contract.
 *   - Transient retry handling with bounded exponential backoff for 429/5xx/timeout.
 */

import dotenv from 'dotenv';
import { WhintaProvider, getWhintaConfig, formatWhintaPhone } from './whintaService.js';

dotenv.config();

// ─── Canonical Error Constants ────────────────────────────────────────────────

export const WHATSAPP_ERRORS = {
  INVALID_RECIPIENT: 'WHATSAPP_INVALID_RECIPIENT',
  PROVIDER_NOT_CONFIGURED: 'WHATSAPP_PROVIDER_NOT_CONFIGURED',
  AUTH_FAILED: 'WHATSAPP_AUTH_FAILED',
  RATE_LIMITED: 'WHATSAPP_RATE_LIMITED',
  PROVIDER_ERROR: 'WHATSAPP_PROVIDER_ERROR',
  MESSAGE_REJECTED: 'WHATSAPP_MESSAGE_REJECTED',
  TIMEOUT: 'WHATSAPP_TIMEOUT',
};

// ─── Phone Normalization & Validation ─────────────────────────────────────────

/**
 * Normalizes phone numbers for WhatsApp.
 * - Strips whitespace, dashes, parens, and non-digits
 * - Does NOT blindly prepend +91 if country code already present
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

  // Strip leading 0 (common local format)
  if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }

  // 10 digits = Standard Indian mobile number
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

// ─── Build wa.me Direct URL ───────────────────────────────────────────────────

/**
 * Generates an authoritative WhatsApp click-to-chat URL.
 */
export const buildWhatsAppDirectUrl = (phone, text) => {
  const norm = normalizeWhatsAppPhone(phone);
  const targetPhone = norm.valid ? norm.normalized : (phone ? String(phone).replace(/\D/g, '') : '');
  return `https://wa.me/${targetPhone}?text=${encodeURIComponent(text || '')}`;
};

// ─── Provider Configuration Detection ─────────────────────────────────────────

/**
 * Returns safe provider configuration status WITHOUT exposing secrets.
 * Exclusively checks for Whinta provider configuration.
 */
export const getWhatsAppProviderConfig = () => {
  const whintaCfg = getWhintaConfig();
  if (whintaCfg.configured) {
    return {
      configured: true,
      enabled: whintaCfg.enabled,
      active: whintaCfg.active,
      provider: 'WHINTA',
      baseUrl: whintaCfg.baseUrl,
      defaultCountryCode: whintaCfg.defaultCountryCode,
    };
  }

  return {
    configured: false,
    provider: 'NONE',
    message: 'Automated WhatsApp delivery is not configured. Set WHINTA_ACCESS_TOKEN and WHINTA_ENABLED=true in your environment.',
  };
};

// ─── Meta WhatsApp Booking Confirmation Template Builder ──────────────────────

/**
 * Constructs standard WhatsApp Business Cloud API template payload components
 * for reservation booking confirmations.
 *
 * Template convention for `booking_confirmation`:
 * Body parameters:
 *   {{1}} = Guest Name
 *   {{2}} = Hotel Name
 *   {{3}} = Reservation Reference (HM-RES-...)
 *   {{4}} = Room Category & Number
 *   {{5}} = Check-in Date
 *   {{6}} = Check-out Date
 *   {{7}} = Total Amount
 *
 * @param {Object} params
 * @param {string} [params.guestName]
 * @param {string} [params.hotelName]
 * @param {string} [params.confirmationNumber]
 * @param {string} [params.roomDetails]
 * @param {string} [params.checkIn]
 * @param {string} [params.checkOut]
 * @param {string|number} [params.totalAmount]
 * @param {string} [params.templateName]
 * @param {string} [params.templateLanguage]
 * @returns {{ templateName: string, templateLanguage: string, templateComponents: Array }}
 */
export const buildMetaBookingConfirmationTemplate = ({
  guestName = 'Guest',
  hotelName = 'Hotel Mantri',
  confirmationNumber = '',
  reservationReference = '',
  roomDetails = '',
  roomCategory = '',
  roomNo = '',
  checkIn = '',
  checkOut = '',
  totalAmount = '0',
  templateName = null,
  templateLanguage = null,
} = {}) => {
  const name = templateName || process.env.WHATSAPP_CONFIRMATION_TEMPLATE || 'booking_confirmation';
  const lang = templateLanguage || process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en';

  const ref = confirmationNumber || reservationReference || 'HM-RES';
  const room = roomDetails || (roomCategory ? `${roomCategory}${roomNo ? ` (Room ${roomNo})` : ''}` : 'Standard Room');

  const formattedAmount = typeof totalAmount === 'number'
    ? `₹${Math.round(totalAmount).toLocaleString('en-IN')}`
    : String(totalAmount).startsWith('₹')
    ? totalAmount
    : `₹${totalAmount}`;

  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: String(guestName || 'Guest').slice(0, 60) },
        { type: 'text', text: String(hotelName || 'Hotel Mantri').slice(0, 60) },
        { type: 'text', text: String(ref).slice(0, 30) },
        { type: 'text', text: String(room).slice(0, 60) },
        { type: 'text', text: String(checkIn || '—').slice(0, 30) },
        { type: 'text', text: String(checkOut || '—').slice(0, 30) },
        { type: 'text', text: formattedAmount.slice(0, 30) },
      ],
    },
  ];

  return {
    name,
    language: { code: lang },
    components,
    templateName: name,
    templateLanguage: lang,
    templateComponents: components,
  };
};

// ─── Dispatch WhatsApp Message with Bounded Retry ─────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends a WhatsApp message using Whinta provider with transient retry logic.
 *
 * @param {Object} params
 * @param {string} params.to - Recipient phone number
 * @param {string} params.text - Message text
 * @param {string} [params.templateName]
 * @param {Array} [params.templateComponents]
 * @param {string} [params.templateLanguage='en']
 * @returns {Promise<Object>} Structured delivery result
 */
export const sendWhatsAppMessage = async (params) => {
  // Support both object destructuring and flexible field names
  const to = params?.to || params?.recipientPhone || params?.phone || '';
  const text = params?.text || params?.messageText || params?.message || '';
  const templateName = params?.templateName || null;
  const templateComponents = params?.templateComponents || [];
  const templateLanguage = params?.templateLanguage || 'en';
  const mediaUrl = params?.mediaUrl || params?.documentUrl || null;
  const fileName = params?.fileName || params?.filename || null;
  const caption = params?.caption || null;
  const mediaType = params?.mediaType || 'document';

  // 1. Phone number validation
  const norm = normalizeWhatsAppPhone(to);
  if (!norm.valid) {
    return {
      success: false,
      provider: 'NONE',
      status: 'invalid_recipient',
      error: WHATSAPP_ERRORS.INVALID_RECIPIENT,
      errorCode: WHATSAPP_ERRORS.INVALID_RECIPIENT,
      message: norm.error || 'The recipient WhatsApp phone number is invalid.',
      whatsappDirectUrl: null,
    };
  }

  const recipient = norm.normalized;
  const directUrl = buildWhatsAppDirectUrl(recipient, text);
  const config = getWhatsAppProviderConfig();

  // 2. If provider is not configured, return clean unconfigured response
  if (!config.configured) {
    return {
      success: false,
      provider: 'NONE',
      status: 'provider_not_configured',
      error: WHATSAPP_ERRORS.PROVIDER_NOT_CONFIGURED,
      errorCode: WHATSAPP_ERRORS.PROVIDER_NOT_CONFIGURED,
      message: 'Automated WhatsApp delivery is not configured. Set WHINTA_ACCESS_TOKEN and WHINTA_ENABLED=true in your environment.',
      whatsappDirectUrl: directUrl,
    };
  }

  // 3. Resolve Whinta provider instance
  const providerInstance = new WhintaProvider();

  if (!providerInstance.isConfigured()) {
    return {
      success: false,
      provider: 'WHINTA',
      status: 'provider_not_configured',
      error: WHATSAPP_ERRORS.PROVIDER_NOT_CONFIGURED,
      errorCode: WHATSAPP_ERRORS.PROVIDER_NOT_CONFIGURED,
      message: 'Whinta access token is missing or invalid.',
      whatsappDirectUrl: directUrl,
    };
  }

  // 4. Dispatch with bounded retries for transient errors (429, 500, 502, 503, 504)
  const MAX_ATTEMPTS = 3;
  let lastResult = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await providerInstance.send({
        to: recipient,
        text,
        templateName,
        templateComponents,
        templateLanguage,
        mediaUrl,
        fileName,
        caption,
        mediaType,
      });

      if (result.success) {
        return {
          success: true,
          provider: 'WHINTA',
          status: result.status || 'submitted',
          messageId: result.messageId,
          recipient: result.recipient || `+${recipient}`,
          message: result.message || 'WhatsApp message accepted by Whinta.',
          whatsappDirectUrl: directUrl,
        };
      }

      lastResult = result;

      // Do NOT retry permanent errors (400, 401, 403, invalid recipient)
      const isTransient = result.statusCode === 429 || (result.statusCode >= 500 && result.statusCode <= 504);
      if (!isTransient || attempt === MAX_ATTEMPTS) {
        break;
      }

      // Exponential backoff: 500ms, 1500ms
      const backoffMs = attempt * 500;
      await sleep(backoffMs);
    } catch (err) {
      lastResult = {
        success: false,
        status: 'failed',
        error: WHATSAPP_ERRORS.TIMEOUT,
        errorCode: WHATSAPP_ERRORS.TIMEOUT,
        message: `Provider connection error: ${err.message}`,
      };

      if (attempt === MAX_ATTEMPTS) break;
      await sleep(attempt * 500);
    }
  }

  return {
    success: false,
    provider: 'WHINTA',
    status: lastResult?.status || 'failed',
    error: lastResult?.error || WHATSAPP_ERRORS.PROVIDER_ERROR,
    errorCode: lastResult?.errorCode || WHATSAPP_ERRORS.PROVIDER_ERROR,
    message: lastResult?.message || 'WhatsApp provider rejected the message.',
    whatsappDirectUrl: directUrl,
  };
};

export default {
  WHATSAPP_ERRORS,
  normalizeWhatsAppPhone,
  buildWhatsAppDirectUrl,
  buildMetaBookingConfirmationTemplate,
  getWhatsAppProviderConfig,
  sendWhatsAppMessage,
  WhintaProvider,
  getWhintaConfig,
  formatWhintaPhone,
};
