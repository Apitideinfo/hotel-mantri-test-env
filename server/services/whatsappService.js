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
  guestCount = 1,
  currency = '₹',
  templateName = null,
  templateLanguage = null,
  documentUrl = null,
  documentFilename = null,
} = {}) => {
  const name = templateName || process.env.WHATSAPP_CONFIRMATION_TEMPLATE || 'booking_confirmation';
  const lang = templateLanguage || process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en';

  const ref = confirmationNumber || reservationReference || 'HM-RES';
  const room = roomDetails || (roomCategory ? `${roomCategory}${roomNo ? ` (Room ${roomNo})` : ''}` : 'Standard Room');

  const curr = currency || '₹';
  const formattedAmount = typeof totalAmount === 'number'
    ? `${curr}${Math.round(totalAmount).toLocaleString('en-IN')}`
    : String(totalAmount).startsWith(curr)
    ? totalAmount
    : `${curr}${totalAmount}`;

  const components = [];

  // Dynamic Document Header Component (Whinta / Meta Cloud API format)
  if (documentUrl) {
    components.push({
      type: 'header',
      parameters: [
        {
          type: 'document',
          document: {
            link: documentUrl,
            filename: documentFilename || `HotelMantri-Booking-${ref}.pdf`,
          },
        },
      ],
    });
  }

  // Standard 7 Body Parameters
  components.push({
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
  });

  return {
    name,
    language: { code: lang },
    components,
    templateName: name,
    templateLanguage: lang,
    templateComponents: components,
    guestCount,
    currency: curr,
    documentUrl,
    documentFilename: documentFilename || `HotelMantri-Booking-${ref}.pdf`,
  };
};

// ─── Meta WhatsApp Daily Hotel Report Template Builder ────────────────────────

/**
 * Constructs standard WhatsApp Business Cloud API template payload components
 * for automated daily hotel reports.
 *
 * Variable mapping for `daily_hotel_report`:
 * Header (Optional Dynamic Document):
 *   document: { link, filename }
 * Body parameters:
 *   {{1}}  = Hotel Name
 *   {{2}}  = Report Date
 *   {{3}}  = Total Active Rooms
 *   {{4}}  = Occupied Rooms
 *   {{5}}  = Occupancy Percentage
 *   {{6}}  = New Reservations
 *   {{7}}  = Check-ins
 *   {{8}}  = Check-outs
 *   {{9}}  = Daily Revenue
 *   {{10}} = Closing Cash Balance
 *
 * @param {Object} params
 * @returns {{ templateName: string, templateLanguage: string, templateComponents: Array }}
 */
export const buildMetaDailyReportTemplate = ({
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
  const name = templateName || process.env.WHATSAPP_DAILY_REPORT_TEMPLATE || 'daily_hotel_report';
  const lang = templateLanguage || process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en';
  const curr = currency || '₹';

  const formattedRevenue = typeof dailyRevenue === 'number'
    ? `${curr}${Math.round(dailyRevenue).toLocaleString('en-IN')}`
    : String(dailyRevenue).startsWith(curr)
    ? dailyRevenue
    : `${curr}${dailyRevenue}`;

  const formattedCash = typeof closingCash === 'number'
    ? `${curr}${Math.round(closingCash).toLocaleString('en-IN')}`
    : String(closingCash).startsWith(curr)
    ? closingCash
    : `${curr}${closingCash}`;

  const formattedOccPercent = typeof occupancyPercentage === 'number'
    ? `${occupancyPercentage.toFixed(1)}%`
    : String(occupancyPercentage).includes('%')
    ? occupancyPercentage
    : `${occupancyPercentage}%`;

  const components = [];

  // Dynamic Document Header Component (Whinta / Meta Cloud API format)
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

  // Standard 10 Body Parameters
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
    templateName: name,
    templateLanguage: lang,
    templateComponents: components,
    documentUrl,
    documentFilename: documentFilename || `HotelMantri-Daily-Report-${reportDate || 'Today'}.pdf`,
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
  buildMetaDailyReportTemplate,
  getWhatsAppProviderConfig,
  sendWhatsAppMessage,
  WhintaProvider,
  getWhintaConfig,
  formatWhintaPhone,
};
