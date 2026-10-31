/**
 * Hotel Mantri — Official WhatsApp Service (Direct Meta Cloud API)
 *
 * Exclusively powered by Meta WhatsApp Business Cloud API.
 * Third-party gateways are completely removed.
 *
 * Features:
 *   - Direct official Meta Cloud API client (Graph API v22.0 configurable)
 *   - Pre-approved Meta templates for reservation confirmations and daily reports
 *   - Dynamic PDF generation and document delivery
 *   - wa.me click-to-chat fallback link generation
 *   - Safe error codes and transient retry logic with exponential backoff
 */

import dotenv from 'dotenv';
import {
  META_WHATSAPP_ERRORS,
  normalizeWhatsAppPhone,
  buildWhatsAppDirectUrl,
  getMetaWhatsAppConfig,
  getMetaWhatsAppDiagnostics,
  verifyMetaConnection,
  fetchApprovedTemplates,
  dispatchMetaGraphApiMessage,
  uploadMetaMedia,
  buildApprovedReservationConfirmationTemplate,
  buildApprovedDailyReportTemplate,
  sendMetaReservationConfirmation,
  sendMetaDocumentMessage,
  sendMetaDailyReport,
  sendMetaTestMessage,
} from './metaWhatsAppService.js';

dotenv.config();

export const WHATSAPP_ERRORS = META_WHATSAPP_ERRORS;

export {
  normalizeWhatsAppPhone,
  buildWhatsAppDirectUrl,
  getMetaWhatsAppConfig,
  getMetaWhatsAppDiagnostics,
  verifyMetaConnection,
  fetchApprovedTemplates,
  buildApprovedReservationConfirmationTemplate,
  buildApprovedDailyReportTemplate,
  sendMetaReservationConfirmation,
  sendMetaDocumentMessage,
  sendMetaDailyReport,
  sendMetaTestMessage,
};

/**
 * Returns safe provider configuration status WITHOUT exposing secrets.
 * Exclusively checks Meta WhatsApp Business Cloud API.
 */
export const getWhatsAppProviderConfig = () => {
  const metaCfg = getMetaWhatsAppConfig();
  if (metaCfg.isConfigured) {
    return {
      configured: true,
      enabled: true,
      active: true,
      provider: 'META',
      graphApiVersion: metaCfg.graphApiVersion,
      templateName: metaCfg.reservationTemplate,
      templateLanguage: metaCfg.reservationLanguage,
      dailyReportTemplate: metaCfg.dailyReportTemplate,
      dailyReportLanguage: metaCfg.dailyReportLanguage,
      hasAccessToken: Boolean(metaCfg.accessToken),
      hasPhoneNumberId: Boolean(metaCfg.phoneNumberId),
      hasBusinessAccountId: Boolean(metaCfg.businessAccountId),
      isTemplateApproved: metaCfg.isTemplateApproved,
    };
  }

  return {
    configured: false,
    enabled: false,
    active: false,
    provider: 'META',
    message: 'Meta WhatsApp Cloud API is not configured. Set META_WHATSAPP_ACCESS_TOKEN and META_WHATSAPP_PHONE_NUMBER_ID in your environment.',
  };
};

/**
 * Constructs standard WhatsApp Business Cloud API template payload components
 * for reservation booking confirmations (alias for buildApprovedReservationConfirmationTemplate).
 */
export const buildMetaBookingConfirmationTemplate = (params = {}) => {
  return buildApprovedReservationConfirmationTemplate(params);
};

/**
 * Constructs standard WhatsApp Business Cloud API template payload components
 * for automated daily hotel reports (alias for buildApprovedDailyReportTemplate).
 */
export const buildMetaDailyReportTemplate = (params = {}) => {
  return buildApprovedDailyReportTemplate(params);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends a WhatsApp message directly via Meta WhatsApp Cloud API with transient retry logic.
 *
 * @param {Object} params
 * @returns {Promise<Object>} Structured delivery result
 */
export const sendWhatsAppMessage = async (params) => {
  const to = params?.to || params?.recipientPhone || params?.phone || '';
  const text = params?.text || params?.messageText || params?.message || '';
  const templateName = params?.templateName || null;
  const templateComponents = params?.templateComponents || [];
  const templateLanguage = params?.templateLanguage || null;
  const mediaUrl = params?.mediaUrl || params?.documentUrl || null;
  const fileName = params?.fileName || params?.filename || null;
  const caption = params?.caption || null;
  const mediaType = params?.mediaType || 'document';
  const documentBuffer = params?.documentBuffer || params?.buffer || null;
  let documentMediaId = params?.documentMediaId || null;

  // 1. Phone number validation
  const norm = normalizeWhatsAppPhone(to);
  if (!norm.valid) {
    return {
      success: false,
      provider: 'META',
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

  // 2. Check if configured
  if (!config.configured) {
    return {
      success: false,
      provider: 'META',
      status: 'provider_not_configured',
      error: WHATSAPP_ERRORS.PROVIDER_NOT_CONFIGURED,
      errorCode: WHATSAPP_ERRORS.PROVIDER_NOT_CONFIGURED,
      message: 'Automated WhatsApp delivery is not configured. Set META_WHATSAPP_ACCESS_TOKEN and META_WHATSAPP_PHONE_NUMBER_ID in your environment.',
      whatsappDirectUrl: directUrl,
    };
  }

  const metaCfg = getMetaWhatsAppConfig();
  const effectiveTemplateName = templateName || metaCfg.reservationTemplate;

  // Upload dynamic PDF document buffer to Meta Cloud API media endpoint if present
  if (!documentMediaId && documentBuffer && metaCfg.accessToken && metaCfg.phoneNumberId) {
    try {
      const uploadRes = await uploadMetaMedia({
        buffer: documentBuffer,
        filename: fileName || 'document.pdf',
        mimeType: 'application/pdf',
      });
      if (uploadRes.success && uploadRes.mediaId) {
        documentMediaId = uploadRes.mediaId;
      }
    } catch (e) {
      console.warn('[WhatsAppService] Document buffer upload notice:', e.message);
    }
  }

  // 3. Build payload based on message type
  let payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
  };

  if (templateName || (templateComponents && templateComponents.length > 0)) {
    const finalComponents = Array.isArray(templateComponents) ? [...templateComponents] : [];
    if (documentMediaId) {
      const headerIdx = finalComponents.findIndex((c) => String(c.type).toLowerCase() === 'header');
      if (headerIdx !== -1) {
        finalComponents[headerIdx] = {
          type: 'header',
          parameters: [
            {
              type: 'document',
              document: {
                id: documentMediaId,
                filename: fileName || 'document.pdf',
              },
            },
          ],
        };
      }
    }

    payload.type = 'template';
    payload.template = {
      name: effectiveTemplateName,
      language: { code: templateLanguage || metaCfg.reservationLanguage || 'en' },
      components: finalComponents,
    };
  } else if (documentMediaId || mediaUrl) {
    payload.type = mediaType || 'document';
    payload[mediaType || 'document'] = documentMediaId
      ? { id: documentMediaId, filename: fileName || 'document.pdf', caption: caption || '' }
      : { link: mediaUrl, filename: fileName || 'document.pdf', caption: caption || '' };
  } else {
    payload.type = 'text';
    payload.text = { body: text };
  }

  // 4. Dispatch to Meta Cloud API with bounded retries for transient errors (429, 500, 502, 503, 504)
  const MAX_ATTEMPTS = 3;
  let lastResult = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await dispatchMetaGraphApiMessage(payload);

      if (result.success) {
        return {
          success: true,
          provider: 'META',
          status: 'sent',
          messageId: result.messageId,
          recipient: `+${recipient}`,
          message: result.message || 'WhatsApp message accepted by Meta Cloud API.',
          whatsappDirectUrl: directUrl,
          rawResponse: result.rawResponse,
        };
      }

      lastResult = result;

      // Do NOT retry permanent errors (400, 401, 403, invalid recipient)
      const isTransient = result.statusCode === 429 || (result.statusCode >= 500 && result.statusCode <= 504);
      if (!isTransient || attempt === MAX_ATTEMPTS) {
        break;
      }

      const backoffMs = attempt * 500;
      await sleep(backoffMs);
    } catch (err) {
      lastResult = {
        success: false,
        status: 'failed',
        error: WHATSAPP_ERRORS.TIMEOUT,
        errorCode: WHATSAPP_ERRORS.TIMEOUT,
        message: `Meta API connection error: ${err.message}`,
      };

      if (attempt === MAX_ATTEMPTS) break;
      await sleep(attempt * 500);
    }
  }

  return {
    success: false,
    provider: 'META',
    status: lastResult?.status || 'failed',
    error: lastResult?.error || WHATSAPP_ERRORS.PROVIDER_ERROR,
    errorCode: lastResult?.errorCode || WHATSAPP_ERRORS.PROVIDER_ERROR,
    message: lastResult?.message || 'Meta WhatsApp Cloud API rejected the message.',
    details: lastResult?.details || null,
    statusCode: lastResult?.statusCode || null,
    whatsappDirectUrl: directUrl,
  };
};

/**
 * Sends a PDF reservation confirmation or report as a WhatsApp document message.
 */
export const sendWhatsAppDocumentMessage = async ({ to, documentUrl, filename, caption }) => {
  return sendMetaDocumentMessage({ to, documentUrl, filename, caption });
};

export default {
  WHATSAPP_ERRORS,
  normalizeWhatsAppPhone,
  buildWhatsAppDirectUrl,
  buildMetaBookingConfirmationTemplate,
  buildApprovedReservationConfirmationTemplate,
  buildMetaDailyReportTemplate,
  buildApprovedDailyReportTemplate,
  getWhatsAppProviderConfig,
  verifyMetaConnection,
  fetchApprovedTemplates,
  sendWhatsAppMessage,
  sendWhatsAppDocumentMessage,
  sendMetaReservationConfirmation,
  sendMetaDailyReport,
  sendMetaTestMessage,
};
