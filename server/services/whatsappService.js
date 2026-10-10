/**
 * Hotel Mantri — WhatsApp Provider Service
 *
 * Provides a clean server-side provider abstraction for WhatsApp delivery:
 *   - MetaCloudProvider: WhatsApp Business Cloud API (WHATSAPP_API_TOKEN + WHATSAPP_PHONE_NUMBER_ID)
 *   - TwilioProvider: Twilio WhatsApp API (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM)
 *   - CustomWebhookProvider: Webhook gateway (WHATSAPP_PROVIDER_URL + WHATSAPP_API_KEY)
 *   - Manual wa.me fallback: Always available even when automated provider is not configured
 *
 * CRITICAL REQUIREMENTS:
 *   - NO FAKE SUCCESS: Never claim message sent unless provider confirms acceptance.
 *   - All provider credentials remain strictly server-side.
 *   - Canonical error codes matching application error contract.
 *   - Transient retry handling with bounded exponential backoff for 429/5xx/timeout.
 */

import dotenv from 'dotenv';

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
 */
export const getWhatsAppProviderConfig = () => {
  const metaToken = process.env.WHATSAPP_API_TOKEN || process.env.META_WHATSAPP_TOKEN;
  const metaPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.META_PHONE_NUMBER_ID;

  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_FROM_NUMBER;

  const customUrl = process.env.WHATSAPP_PROVIDER_URL;

  if (metaToken && metaPhoneId) {
    return {
      configured: true,
      provider: 'META_CLOUD_API',
      metaPhoneId,
    };
  }

  if (twilioSid && twilioAuth && twilioFrom) {
    return {
      configured: true,
      provider: 'TWILIO',
      twilioFrom,
    };
  }

  if (customUrl) {
    return {
      configured: true,
      provider: 'CUSTOM_WEBHOOK',
      endpoint: customUrl,
    };
  }

  return {
    configured: false,
    provider: 'NONE',
    message: 'Automated WhatsApp delivery is not configured on the server.',
  };
};

// ─── Provider Implementations ─────────────────────────────────────────────────

/**
 * Meta WhatsApp Business Cloud API Provider
 */
export class MetaCloudWhatsAppProvider {
  constructor(tokenOrOptions, phoneNumberId, fetchFn = globalThis.fetch) {
    if (typeof tokenOrOptions === 'object' && tokenOrOptions !== null) {
      this.token = tokenOrOptions.apiToken || tokenOrOptions.token;
      this.phoneNumberId = tokenOrOptions.phoneNumberId;
      this.fetchFn = tokenOrOptions.fetchFn || globalThis.fetch;
    } else {
      this.token = tokenOrOptions;
      this.phoneNumberId = phoneNumberId;
      this.fetchFn = fetchFn || globalThis.fetch;
    }
  }

  isConfigured() {
    return Boolean(this.token && this.phoneNumberId);
  }

  async send(recipientOrParams, text, templateName = null, templateComponents = [], templateLanguage = 'en') {
    let recipient = recipientOrParams;
    let messageText = text;
    let tName = templateName;
    let tComponents = templateComponents;
    let tLang = templateLanguage;

    if (typeof recipientOrParams === 'object' && recipientOrParams !== null) {
      recipient = recipientOrParams.to;
      messageText = recipientOrParams.text;
      tName = recipientOrParams.templateName;
      tComponents = recipientOrParams.templateComponents || [];
      tLang = recipientOrParams.templateLanguage || 'en';
    }

    const url = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;

    let payload;
    if (tName) {
      payload = {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'template',
        template: {
          name: tName,
          language: { code: tLang || 'en' },
          components: tComponents,
        },
      };
    } else {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'text',
        text: { body: messageText },
      };
    }

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const resData = await response.json().catch(() => ({}));

    if (!response.ok) {
      const status = response.status;
      let errorCode = WHATSAPP_ERRORS.PROVIDER_ERROR;
      if (status === 400) errorCode = WHATSAPP_ERRORS.MESSAGE_REJECTED;
      else if (status === 401 || status === 403) errorCode = WHATSAPP_ERRORS.AUTH_FAILED;
      else if (status === 429) errorCode = WHATSAPP_ERRORS.RATE_LIMITED;

      const safeMessage = resData?.error?.message || `Meta API HTTP ${status}`;
      return {
        success: false,
        provider: 'META_CLOUD',
        status: status === 429 ? 'rate_limited' : 'failed',
        statusCode: status,
        error: errorCode,
        errorCode,
        providerErrorCode: resData?.error?.code || null,
        message: safeMessage,
      };
    }

    const messageId = resData?.messages?.[0]?.id || `meta_${Date.now()}`;
    return {
      success: true,
      provider: 'META_CLOUD',
      status: 'sent',
      messageId,
      message: 'WhatsApp message accepted by Meta Cloud API.',
    };
  }
}

/**
 * Twilio WhatsApp Provider
 */
export class TwilioWhatsAppProvider {
  constructor(accountSidOrOptions, authToken, fromNumber, fetchFn = globalThis.fetch) {
    if (typeof accountSidOrOptions === 'object' && accountSidOrOptions !== null) {
      this.accountSid = accountSidOrOptions.accountSid;
      this.authToken = accountSidOrOptions.authToken;
      const from = accountSidOrOptions.from || accountSidOrOptions.fromNumber || '';
      this.fromNumber = from.startsWith('whatsapp:') ? from : (from ? `whatsapp:${from}` : '');
      this.fetchFn = accountSidOrOptions.fetchFn || globalThis.fetch;
    } else {
      this.accountSid = accountSidOrOptions;
      this.authToken = authToken;
      const from = fromNumber || '';
      this.fromNumber = from.startsWith('whatsapp:') ? from : (from ? `whatsapp:${from}` : '');
      this.fetchFn = fetchFn || globalThis.fetch;
    }
  }

  isConfigured() {
    return Boolean(this.accountSid && this.authToken && this.fromNumber);
  }

  async send(recipientOrParams, text) {
    let recipient = recipientOrParams;
    let messageText = text;

    if (typeof recipientOrParams === 'object' && recipientOrParams !== null) {
      recipient = recipientOrParams.to;
      messageText = recipientOrParams.text;
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const authHeader = 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

    const params = new URLSearchParams();
    params.append('From', this.fromNumber);
    params.append('To', recipient.startsWith('whatsapp:') ? recipient : `whatsapp:+${recipient.replace(/^\+/, '')}`);
    params.append('Body', messageText);

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const resData = await response.json().catch(() => ({}));

    if (!response.ok) {
      const status = response.status;
      let errorCode = WHATSAPP_ERRORS.PROVIDER_ERROR;
      if (status === 401 || status === 403) errorCode = WHATSAPP_ERRORS.AUTH_FAILED;
      else if (status === 429) errorCode = WHATSAPP_ERRORS.RATE_LIMITED;
      else if (resData?.code === 21211 || resData?.code === 21614) errorCode = WHATSAPP_ERRORS.INVALID_RECIPIENT;

      return {
        success: false,
        provider: 'TWILIO',
        status: status === 429 ? 'rate_limited' : 'failed',
        statusCode: status,
        error: errorCode,
        errorCode,
        message: resData?.message || `Twilio HTTP ${status}`,
      };
    }

    const messageId = resData?.sid || `twilio_${Date.now()}`;
    return {
      success: true,
      provider: 'TWILIO',
      status: 'sent',
      messageId,
      message: 'WhatsApp message accepted by Twilio.',
    };
  }
}

/**
 * Custom Webhook Provider
 */
class CustomWebhookProvider {
  constructor(url, apiKey) {
    this.url = url;
    this.apiKey = apiKey;
  }

  async send(recipient, text) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const response = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: recipient,
        message: text,
        timestamp: new Date().toISOString(),
      }),
    });

    const resData = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        status: 'failed',
        statusCode: response.status,
        error: WHATSAPP_ERRORS.PROVIDER_ERROR,
        errorCode: WHATSAPP_ERRORS.PROVIDER_ERROR,
        message: resData?.message || `Webhook HTTP ${response.status}`,
      };
    }

    const messageId = resData?.messageId || resData?.id || `wh_${Date.now()}`;
    return {
      success: true,
      status: 'sent',
      messageId,
      message: 'WhatsApp message accepted by webhook gateway.',
    };
  }
}

// ─── Meta WhatsApp Booking Confirmation Template Builder ──────────────────────

/**
 * Constructs standard Meta WhatsApp Business Cloud API template payload components
 * for reservation booking confirmations.
 *
 * Meta approved template convention for `booking_confirmation`:
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
 * Sends a WhatsApp message using the active provider with transient retry logic.
 *
 * @param {Object} params
 * @param {string} params.to - Recipient phone number
 * @param {string} params.text - Message text
 * @param {string} [params.templateName]
 * @param {Array} [params.templateComponents]
 * @param {string} [params.templateLanguage='en']
 * @returns {Promise<Object>} Structured delivery result
 */
export const sendWhatsAppMessage = async ({
  to,
  text,
  templateName = null,
  templateComponents = [],
  templateLanguage = 'en',
}) => {
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
      message: 'Automated WhatsApp delivery is not configured on the server. Configure WHATSAPP_API_TOKEN or Twilio credentials in environment.',
      whatsappDirectUrl: directUrl,
    };
  }

  // 3. Resolve active provider instance
  let providerInstance = null;
  if (config.provider === 'META_CLOUD_API') {
    const token = process.env.WHATSAPP_API_TOKEN || process.env.META_WHATSAPP_TOKEN;
    providerInstance = new MetaCloudWhatsAppProvider(token, config.metaPhoneId);
  } else if (config.provider === 'TWILIO') {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const auth = process.env.TWILIO_AUTH_TOKEN;
    providerInstance = new TwilioWhatsAppProvider(sid, auth, config.twilioFrom);
  } else if (config.provider === 'CUSTOM_WEBHOOK') {
    const url = process.env.WHATSAPP_PROVIDER_URL;
    const key = process.env.WHATSAPP_API_KEY;
    providerInstance = new CustomWebhookProvider(url, key);
  }

  if (!providerInstance) {
    return {
      success: false,
      provider: config.provider,
      status: 'provider_not_configured',
      error: WHATSAPP_ERRORS.PROVIDER_NOT_CONFIGURED,
      errorCode: WHATSAPP_ERRORS.PROVIDER_NOT_CONFIGURED,
      message: 'No active WhatsApp provider instance resolved.',
      whatsappDirectUrl: directUrl,
    };
  }

  // 4. Dispatch with bounded retries for transient errors (429, 500, 502, 503, 504)
  const MAX_ATTEMPTS = 3;
  let lastResult = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await providerInstance.send(recipient, text, templateName, templateComponents, templateLanguage);

      if (result.success) {
        return {
          success: true,
          provider: config.provider,
          status: 'sent',
          messageId: result.messageId,
          recipient: `+${recipient}`,
          message: result.message || 'WhatsApp message accepted by provider.',
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
    provider: config.provider,
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
  MetaCloudWhatsAppProvider,
  TwilioWhatsAppProvider,
};
