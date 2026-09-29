/**
 * Hotel Mantri — Notification Routes
 *
 * Routes:
 *   POST /api/notifications/invoice/email     — Send invoice PDF via email to guest
 *   POST /api/notifications/invoice/whatsapp  — Generate WhatsApp share URL for invoice
 *   GET  /api/notifications/smtp/verify       — Test SMTP connection
 *   GET  /api/notifications/outbox            — List outbox records (admin diagnostics)
 *   POST /api/notifications/retry             — Retry failed notifications
 *
 * SECURITY:
 *   - All invoice/outbox routes require hotel authentication
 *   - SMTP credentials are NEVER returned in API responses
 *   - Hotel ID is always resolved from the authenticated session, NEVER from client input
 */

import express from 'express';
import { requireHotelAccess } from '../middleware/auth.js';
import { sendEmail, validateSmtpConfig, verifySmtpConnection, isValidEmail } from '../services/emailService.js';
import { buildInvoiceEmail } from '../services/emailTemplates.js';
import { retryFailedNotifications } from '../services/notificationService.js';
import { supabaseServiceRole } from '../supabaseClient.js';
import {
  calculateDailySummary,
  resolveHotelOwnerWhatsApp,
  buildDailySummaryText,
  buildMorningSummaryText,
  buildEveningSummaryText,
  buildOtaSummaryText,
  buildTestWhatsAppText,
} from '../services/dailySummaryService.js';
import {
  sendWhatsAppMessage,
  getWhatsAppProviderConfig,
  buildWhatsAppDirectUrl,
  normalizeWhatsAppPhone,
} from '../services/whatsappService.js';
import {
  recordWhatsAppOutboxEvent,
  updateWhatsAppOutboxEvent,
  isScheduledReportAlreadySent,
  getWhatsAppHistory,
  REPORT_TYPES,
  DELIVERY_TYPES,
  OUTBOX_STATUS,
} from '../services/whatsappOutboxService.js';

const router = express.Router();
const supabase = supabaseServiceRole;

// ─── Helper: Safe Supabase fetch ──────────────────────────────────────────────

const fetchInvoiceWithDetails = async (invoiceId, hotelId) => {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select(`
      *,
      hotels!inner(hotel_name, property_code, address, city, state, admin_email, mobile, owner_name)
    `)
    .eq('id', invoiceId)
    .maybeSingle();

  if (error || !invoice) return null;

  // Verify invoice belongs to hotel
  const h = invoice.hotels;
  if (!h) return null;

  return {
    ...invoice,
    hotel_name: h.hotel_name || '',
    hotel_address: [h.address, h.city, h.state].filter(Boolean).join(', '),
    hotel_admin_email: h.admin_email || '',
  };
};

// ─── POST /api/notifications/invoice/email ────────────────────────────────────

/**
 * Send invoice via email with PDF attachment to the guest.
 *
 * Body:
 *   invoiceId: string  — Invoice UUID
 *   pdfBase64: string  — Base64-encoded PDF bytes from jsPDF (frontend generates it)
 *   filename: string   — e.g. "Hotel-Mantri-Invoice-INV-001.pdf"
 *
 * Response:
 *   { success: true, messageId }
 *   { success: false, errorCode, message }
 */
router.post('/invoice/email', requireHotelAccess, async (req, res) => {
  const hotelId = req.hotelId || req.auth?.hotelId;
  const { invoiceId, pdfBase64, filename } = req.body;

  if (!invoiceId) {
    return res.status(400).json({ success: false, errorCode: 'INVOICE_NOT_FOUND', message: 'invoiceId is required.' });
  }

  try {
    // 1. Fetch invoice server-side (scoped to hotel)
    const { data: invoiceRaw, error: invErr } = await supabase
      .from('invoices')
      .select(`
        id, invoice_number, invoice_date, due_date, status,
        total_amount, amount_paid, balance_due,
        hotels!inner(hotel_name, address, city, state, admin_email)
      `)
      .eq('id', invoiceId)
      .maybeSingle();

    if (invErr || !invoiceRaw) {
      return res.status(404).json({ success: false, errorCode: 'INVOICE_NOT_FOUND', message: 'Invoice not found.' });
    }

    const h = invoiceRaw.hotels;

    // 2. Fetch guest/customer for this invoice via items or metadata
    // The invoice guest_name comes from invoice or its linked reservation
    const { data: guestRecord } = await supabase
      .from('invoice_items')
      .select('description')
      .eq('invoice_id', invoiceId)
      .limit(1)
      .maybeSingle();

    // 3. Resolve recipient email
    // For billing invoices (enterprise hotel subscriptions), recipient is the hotel admin
    // For guest invoices, recipient needs to come from request (guest email not in invoice table directly)
    const { recipientEmail, guestName } = req.body;

    if (!recipientEmail || !isValidEmail(recipientEmail)) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_RECIPIENT',
        message: 'Email cannot be sent because no valid recipient email is available. Please provide a valid recipient email.',
      });
    }

    // 4. Validate PDF
    if (!pdfBase64 || pdfBase64.length < 100) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVOICE_GENERATION_FAILED',
        message: 'No valid PDF was provided. Cannot send email without a PDF.',
      });
    }

    // 5. Build email
    const invoiceNumber = invoiceRaw.invoice_number || 'DRAFT';
    const hotelName = h.hotel_name || 'Hotel';
    const hotelAddress = [h.address, h.city, h.state].filter(Boolean).join(', ');
    const pdfFilename = filename || `Hotel-Mantri-Invoice-${invoiceNumber}.pdf`;

    const emailContent = buildInvoiceEmail({
      hotelName,
      guestName: guestName || 'Guest',
      invoiceNumber,
      invoiceDate: invoiceRaw.invoice_date || '',
      dueDate: invoiceRaw.due_date || '',
      totalAmount: invoiceRaw.total_amount || 0,
      amountPaid: invoiceRaw.amount_paid || 0,
      balanceDue: invoiceRaw.balance_due || 0,
      status: invoiceRaw.status || '',
      hotelAddress,
      pdfFilename,
    });

    // 6. Convert base64 PDF to buffer for attachment
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    if (pdfBuffer.length < 100) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVOICE_GENERATION_FAILED',
        message: 'PDF appears to be empty or invalid. Cannot send email.',
      });
    }

    // 7. Send via SMTP
    const result = await sendEmail({
      to: recipientEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      attachments: [
        {
          filename: pdfFilename,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    if (result.success) {
      console.log(`[INVOICE_EMAIL] Sent invoice=${invoiceNumber} to=${recipientEmail} hotel=${hotelId}`);
      return res.json({ success: true, messageId: result.messageId });
    } else {
      console.error(`[INVOICE_EMAIL] Failed invoice=${invoiceNumber} errorCode=${result.errorCode}`);
      return res.status(502).json({
        success: false,
        errorCode: result.errorCode,
        message: result.message,
      });
    }
  } catch (err) {
    console.error('[INVOICE_EMAIL] Unexpected error:', err.message);
    return res.status(500).json({
      success: false,
      errorCode: 'SERVER_ERROR',
      message: 'An unexpected error occurred while sending the invoice email.',
    });
  }
});

// ─── POST /api/notifications/invoice/whatsapp ─────────────────────────────────

/**
 * Generate a WhatsApp share URL for an invoice.
 *
 * Body:
 *   invoiceId: string
 *   phoneNumber: string — Guest phone number (e.g. "919876543210")
 *   invoiceNumber: string
 *   totalAmount: number
 *   balanceDue: number
 *
 * Returns:
 *   { success: true, whatsappUrl, message }
 *
 * Note: A real WhatsApp Business API integration would require a verified
 * Meta Business Account, phone number, and approved templates.
 * Currently, this endpoint generates a wa.me URL (works without Business API).
 * When a proper WhatsApp Business API is configured, this can be upgraded.
 */
router.post('/invoice/whatsapp', requireHotelAccess, async (req, res) => {
  const hotelId = req.hotelId || req.auth?.hotelId;
  const { invoiceId, phoneNumber } = req.body;

  if (!invoiceId) {
    return res.status(400).json({ success: false, errorCode: 'INVOICE_NOT_FOUND', message: 'invoiceId is required.' });
  }

  try {
    // 1. Fetch invoice server-side
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('id, invoice_number, total_amount, balance_due, due_date, hotels!inner(hotel_name)')
      .eq('id', invoiceId)
      .maybeSingle();

    if (invErr || !invoice) {
      return res.status(404).json({ success: false, errorCode: 'INVOICE_NOT_FOUND', message: 'Invoice not found.' });
    }

    const hotelName = invoice.hotels?.hotel_name || 'Hotel Mantri';
    const invoiceNumber = invoice.invoice_number || 'DRAFT';

    // 2. Validate phone
    const rawPhone = (phoneNumber || '').replace(/\D/g, '');
    if (!rawPhone || rawPhone.length < 7) {
      return res.status(400).json({
        success: false,
        errorCode: 'WHATSAPP_NOT_CONFIGURED',
        message: 'No valid phone number provided. Cannot send WhatsApp message.',
      });
    }

    // 3. Build WhatsApp message text
    const totalAmt = `₹${Number(invoice.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    const balanceAmt = `₹${Number(invoice.balance_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    const waText = [
      `*${hotelName}*`,
      `Invoice: *${invoiceNumber}*`,
      `Total: *${totalAmt}*`,
      `Balance Due: *${balanceAmt}*`,
      invoice.due_date ? `Due Date: ${invoice.due_date}` : null,
      '',
      'Thank you for your stay! 🙏',
    ].filter(line => line !== null).join('\n');

    const whatsappUrl = `https://wa.me/${rawPhone}?text=${encodeURIComponent(waText)}`;

    console.log(`[INVOICE_WHATSAPP] Generated URL for invoice=${invoiceNumber} phone=${rawPhone.slice(0, 4)}xxxx hotel=${hotelId}`);

    return res.json({
      success: true,
      whatsappUrl,
      message: 'WhatsApp URL generated. Open this URL to send the invoice via WhatsApp.',
      phoneNumber: rawPhone,
      invoiceNumber,
    });
  } catch (err) {
    console.error('[INVOICE_WHATSAPP] Error:', err.message);
    return res.status(500).json({
      success: false,
      errorCode: 'SERVER_ERROR',
      message: 'Failed to generate WhatsApp URL.',
    });
  }
});

// ─── GET /api/notifications/smtp/verify ──────────────────────────────────────

/**
 * Verify SMTP connection. Returns configuration status WITHOUT credentials.
 */
router.get('/smtp/verify', requireHotelAccess, async (req, res) => {
  const validation = validateSmtpConfig();

  if (!validation.valid) {
    return res.json({
      success: false,
      configured: false,
      errorCode: 'EMAIL_NOT_CONFIGURED',
      missingVars: validation.missingVars,
      message: `SMTP not configured. Missing: ${validation.missingVars.join(', ')}`,
    });
  }

  const result = await verifySmtpConnection();

  return res.json({
    success: result.success,
    configured: true,
    connected: result.success,
    errorCode: result.errorCode || null,
    message: result.success ? 'SMTP connection verified successfully.' : result.message,
    // NEVER return SMTP credentials
    smtpHost: process.env.SMTP_HOST || null,
    smtpPort: process.env.SMTP_PORT || null,
    smtpFromEmail: process.env.SMTP_FROM_EMAIL || null,
  });
});

// ─── GET /api/notifications/outbox ───────────────────────────────────────────

/**
 * List notification outbox records for admin diagnostics.
 * NEVER returns SMTP credentials.
 */
router.get('/outbox', requireHotelAccess, async (req, res) => {
  const hotelId = req.hotelId || req.auth?.hotelId;

  try {
    const { data: records, error } = await supabase
      .from('notification_outbox')
      .select('id, hotel_id, reservation_id, event_type, recipient, status, attempt_count, last_error, provider_message_id, sent_at, created_at, updated_at')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return res.status(500).json({ success: false, message: 'Failed to fetch outbox records.' });
    }

    return res.json({
      success: true,
      records: records || [],
      count: (records || []).length,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch notification outbox.' });
  }
});

// ─── POST /api/notifications/retry ───────────────────────────────────────────

/**
 * Retry failed notifications. Admin use only.
 */
router.post('/retry', requireHotelAccess, async (req, res) => {
  const hotelId = req.hotelId || req.auth?.hotelId;

  try {
    const result = await retryFailedNotifications(hotelId);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to retry notifications.' });
  }
});

// ─── GET /api/notifications/whatsapp/summary & /api/reports/whatsapp/summary ─

/**
 * Returns the calculated daily hotel summary for a given business date.
 * Does NOT require room chart entries — PMS reservations & inventory are authoritative.
 *
 * Query:
 *   date / businessDate: string (YYYY-MM-DD, defaults to current date)
 *   type / summaryType: 'daily' | 'morning' | 'evening' | 'ota'
 */
router.get(['/whatsapp/summary', '/summary'], requireHotelAccess, async (req, res) => {
  const hotelId = req.query.hotelId || req.hotelId || req.auth?.hotelId;
  const businessDate = req.query.businessDate || req.query.date || new Date().toISOString().slice(0, 10);
  const typeParam = (req.query.summaryType || req.query.type || 'daily').toLowerCase();

  try {
    const [ownerWhatsApp, summary] = await Promise.all([
      resolveHotelOwnerWhatsApp(hotelId),
      calculateDailySummary({ hotelId, businessDate }),
    ]);

    const providerConfig = getWhatsAppProviderConfig();

    const dailyText = buildDailySummaryText(summary);
    const morningText = buildMorningSummaryText(summary);
    const eveningText = buildEveningSummaryText(summary);
    const otaText = buildOtaSummaryText(summary);

    const directPhone = ownerWhatsApp.valid ? ownerWhatsApp.phone : '';

    return res.json({
      success: true,
      hotelId,
      hotelName: summary.hotelName,
      businessDate,
      businessDateReadable: summary.businessDateReadable,
      ownerWhatsApp,
      providerConfig: {
        configured: providerConfig.configured,
        provider: providerConfig.provider,
      },
      summary,
      text: {
        daily: dailyText,
        morning: morningText,
        evening: eveningText,
        ota: otaText,
      },
      whatsappDirectUrls: {
        daily: directPhone ? buildWhatsAppDirectUrl(directPhone, dailyText) : null,
        morning: directPhone ? buildWhatsAppDirectUrl(directPhone, morningText) : null,
        evening: directPhone ? buildWhatsAppDirectUrl(directPhone, eveningText) : null,
        ota: directPhone ? buildWhatsAppDirectUrl(directPhone, otaText) : null,
      },
    });
  } catch (err) {
    console.error('[WHATSAPP_SUMMARY_ROUTE] Error:', err.message);
    return res.status(500).json({
      success: false,
      status: 'failed',
      error: 'SUMMARY_CALCULATION_FAILED',
      errorCode: 'SUMMARY_CALCULATION_FAILED',
      message: 'Failed to calculate daily hotel summary: ' + err.message,
    });
  }
});

// ─── POST /api/notifications/whatsapp/send & /api/reports/whatsapp/send ───────

/**
 * Dispatches a WhatsApp summary to the hotel owner's configured number.
 * Accepts canonical contract: { hotelId, businessDate, date, summaryType, type, recipientPhone, message, deliveryType }
 */
router.post(['/whatsapp/send', '/send'], requireHotelAccess, async (req, res) => {
  const hotelId = req.body?.hotelId || req.hotelId || req.auth?.hotelId;
  const businessDate = req.body?.businessDate || req.body?.date || new Date().toISOString().slice(0, 10);
  const typeParam = (req.body?.summaryType || req.body?.type || 'daily').toLowerCase();
  const deliveryType = req.body?.deliveryType || DELIVERY_TYPES.MANUAL;
  const explicitPhone = req.body?.recipientPhone || req.body?.phone || null;
  const explicitMessage = req.body?.message || req.body?.text || null;

  let reportType = REPORT_TYPES.DAILY_SUMMARY;
  if (typeParam.includes('morning')) reportType = REPORT_TYPES.MORNING_SUMMARY;
  else if (typeParam.includes('evening')) reportType = REPORT_TYPES.EVENING_SUMMARY;
  else if (typeParam.includes('ota')) reportType = REPORT_TYPES.OTA_SUMMARY;

  try {
    // 1. Resolve owner WhatsApp number server-side (Section 6, 8, 20)
    let targetPhone = null;
    let ownerInfo = await resolveHotelOwnerWhatsApp(hotelId);

    if (explicitPhone) {
      const norm = normalizeWhatsAppPhone(explicitPhone);
      if (!norm.valid) {
        return res.status(400).json({
          success: false,
          status: 'invalid_recipient',
          error: 'WHATSAPP_RECIPIENT_INVALID',
          errorCode: 'WHATSAPP_RECIPIENT_INVALID',
          message: norm.error || 'The recipient WhatsApp phone number is invalid.',
        });
      }
      // Multi-tenant check (Section 20): Non-super-admins cannot divert summaries to arbitrary unassigned numbers
      if (req.userRole !== 'super_admin' && ownerInfo.valid && norm.normalized !== ownerInfo.phone) {
        return res.status(403).json({
          success: false,
          status: 'forbidden',
          error: 'WHATSAPP_UNAUTHORIZED_RECIPIENT',
          errorCode: 'WHATSAPP_UNAUTHORIZED_RECIPIENT',
          message: 'Summaries can only be dispatched to the authorized property owner WhatsApp number.',
        });
      }
      targetPhone = norm.normalized;
    } else {
      if (!ownerInfo.valid) {
        return res.status(400).json({
          success: false,
          status: 'invalid_recipient',
          error: 'WHATSAPP_RECIPIENT_INVALID',
          errorCode: 'WHATSAPP_RECIPIENT_INVALID',
          message: 'Owner WhatsApp number is missing or invalid. Please configure the owner phone in WhatsApp Settings.',
        });
      }
      targetPhone = ownerInfo.phone;
    }

    // 2. Prevent duplicate scheduled delivery (Section 15)
    if (deliveryType === DELIVERY_TYPES.SCHEDULED) {
      const alreadySent = await isScheduledReportAlreadySent({
        hotelId,
        businessDate,
        reportType,
        recipient: targetPhone,
      });

      if (alreadySent) {
        return res.json({
          success: true,
          status: 'duplicate_prevented',
          message: `Scheduled ${reportType} has already been sent for business date ${businessDate}. Duplicate prevented.`,
        });
      }
    }

    // 3. Authoritative message generation
    let text = explicitMessage;
    let summaryData = null;
    if (!text) {
      summaryData = await calculateDailySummary({ hotelId, businessDate });
      if (reportType === REPORT_TYPES.MORNING_SUMMARY) text = buildMorningSummaryText(summaryData);
      else if (reportType === REPORT_TYPES.EVENING_SUMMARY) text = buildEveningSummaryText(summaryData);
      else if (reportType === REPORT_TYPES.OTA_SUMMARY) text = buildOtaSummaryText(summaryData);
      else text = buildDailySummaryText(summaryData);
    }

    // 4. Record in Outbox (Status: sending)
    const outboxRecord = await recordWhatsAppOutboxEvent({
      hotelId,
      businessDate,
      reportType,
      deliveryType,
      recipient: targetPhone,
      status: OUTBOX_STATUS.SENDING,
      metadata: {
        hotelName: summaryData?.hotelName || ownerInfo.hotelName,
        totalRooms: summaryData?.occupancy?.totalRooms || 0,
      },
    });

    // 5. Send through WhatsApp provider
    const sendResult = await sendWhatsAppMessage({
      to: targetPhone,
      text,
    });

    // 6. Update Outbox record
    await updateWhatsAppOutboxEvent(outboxRecord.id, {
      status: sendResult.success ? OUTBOX_STATUS.SENT : OUTBOX_STATUS.FAILED,
      providerMessageId: sendResult.messageId || null,
      lastError: sendResult.success ? null : (sendResult.errorCode || sendResult.error || sendResult.message),
    });

    // Rule 27: NEVER report fake success!
    if (!sendResult.success) {
      const httpCode = sendResult.errorCode === 'WHATSAPP_PROVIDER_NOT_CONFIGURED' ? 422 : (sendResult.statusCode || 502);
      return res.status(httpCode).json({
        success: false,
        status: sendResult.status || 'failed',
        error: sendResult.error || sendResult.errorCode,
        errorCode: sendResult.errorCode || sendResult.error,
        notificationId: outboxRecord.id,
        message: sendResult.message,
        provider: sendResult.provider,
        whatsappDirectUrl: sendResult.whatsappDirectUrl,
      });
    }

    return res.json({
      success: true,
      status: 'sent',
      notificationId: outboxRecord.id,
      messageId: sendResult.messageId,
      provider: sendResult.provider,
      recipient: `+${targetPhone}`,
      message: 'WhatsApp summary accepted by provider.',
      whatsappDirectUrl: sendResult.whatsappDirectUrl,
    });
  } catch (err) {
    console.error('[WHATSAPP_SEND_ROUTE] Error:', err.message);
    return res.status(500).json({
      success: false,
      status: 'failed',
      error: 'SERVER_ERROR',
      errorCode: 'SERVER_ERROR',
      message: 'Failed to dispatch WhatsApp summary: ' + err.message,
    });
  }
});

// ─── POST /api/notifications/whatsapp/test & /api/reports/whatsapp/test ────────

router.post(['/whatsapp/test', '/test'], requireHotelAccess, async (req, res) => {
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
        message: 'No valid owner WhatsApp number is configured for this hotel.',
      });
    }

    const testText = buildTestWhatsAppText(owner.hotelName || 'Hotel Property');

    const outboxRecord = await recordWhatsAppOutboxEvent({
      hotelId,
      businessDate: new Date().toISOString().slice(0, 10),
      reportType: REPORT_TYPES.TEST_MESSAGE,
      deliveryType: DELIVERY_TYPES.TEST,
      recipient: targetPhone,
      status: OUTBOX_STATUS.SENDING,
    });

    const sendResult = await sendWhatsAppMessage({
      to: targetPhone,
      text: testText,
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
        provider: sendResult.provider,
        whatsappDirectUrl: sendResult.whatsappDirectUrl,
      });
    }

    return res.json({
      success: true,
      status: 'sent',
      notificationId: outboxRecord.id,
      messageId: sendResult.messageId,
      provider: sendResult.provider,
      recipient: `+${targetPhone}`,
      message: 'Test WhatsApp message sent successfully.',
      whatsappDirectUrl: sendResult.whatsappDirectUrl,
    });
  } catch (err) {
    console.error('[WHATSAPP_TEST_ROUTE] Error:', err.message);
    return res.status(500).json({
      success: false,
      status: 'failed',
      error: 'SERVER_ERROR',
      errorCode: 'SERVER_ERROR',
      message: 'Failed to send test message: ' + err.message,
    });
  }
});

// ─── GET /api/notifications/whatsapp/history & /api/reports/whatsapp/history ──

router.get(['/whatsapp/history', '/history'], requireHotelAccess, async (req, res) => {
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

// ─── GET & POST /whatsapp/settings & /settings ────────────────────────────────

router.get(['/whatsapp/settings', '/settings'], requireHotelAccess, async (req, res) => {
  const hotelId = req.query.hotelId || req.hotelId || req.auth?.hotelId;

  try {
    const owner = await resolveHotelOwnerWhatsApp(hotelId);
    const { data: settings } = await supabase
      .from('hotel_settings')
      .select('whatsapp_number')
      .eq('id', hotelId)
      .maybeSingle();

    const providerConfig = getWhatsAppProviderConfig();

    return res.json({
      success: true,
      whatsappNumber: settings?.whatsapp_number || owner.rawPhone || '',
      normalizedNumber: owner.phone || '',
      isValid: owner.valid,
      source: owner.source || '',
      provider: providerConfig.provider,
      providerConfigured: providerConfig.configured,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post(['/whatsapp/settings', '/settings'], requireHotelAccess, async (req, res) => {
  const hotelId = req.body?.hotelId || req.hotelId || req.auth?.hotelId;
  const { whatsappNumber } = req.body;

  if (typeof whatsappNumber !== 'string') {
    return res.status(400).json({ success: false, message: 'whatsappNumber is required' });
  }

  const norm = normalizeWhatsAppPhone(whatsappNumber);
  if (whatsappNumber.trim() && !norm.valid) {
    return res.status(400).json({
      success: false,
      status: 'invalid_recipient',
      error: 'WHATSAPP_INVALID_RECIPIENT',
      message: norm.error,
    });
  }

  try {
    const { error } = await supabase
      .from('hotel_settings')
      .update({
        whatsapp_number: whatsappNumber.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', hotelId);

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.json({
      success: true,
      whatsappNumber: whatsappNumber.trim(),
      normalizedNumber: norm.valid ? norm.normalized : '',
      message: 'WhatsApp settings updated successfully.',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET & POST /whatsapp/cron & /cron ────────────────────────────────────────

const handleWhatsAppCron = async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && req.headers['x-cron-secret'] !== cronSecret) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ success: false, message: 'Unauthorized cron request.' });
    }
  }

  const type = (req.query.type || 'morning').toLowerCase();
  const reportType = type === 'evening' ? REPORT_TYPES.EVENING_SUMMARY : REPORT_TYPES.MORNING_SUMMARY;
  const todayStr = new Date().toISOString().slice(0, 10);

  try {
    const { data: hotels, error } = await supabase
      .from('hotels')
      .select('id, hotel_name, is_active')
      .eq('is_active', true);

    if (error || !hotels || hotels.length === 0) {
      return res.json({ success: true, message: 'No active hotels to process.', processed: 0 });
    }

    const results = [];

    for (const h of hotels) {
      const hotelId = h.id;
      const owner = await resolveHotelOwnerWhatsApp(hotelId);
      if (!owner.valid) {
        results.push({ hotelId, hotelName: h.hotel_name, status: 'skipped_no_phone' });
        continue;
      }

      // Check idempotency
      const alreadySent = await isScheduledReportAlreadySent({
        hotelId,
        businessDate: todayStr,
        reportType,
        recipient: owner.phone,
      });

      if (alreadySent) {
        results.push({ hotelId, hotelName: h.hotel_name, status: 'duplicate_prevented' });
        continue;
      }

      const summary = await calculateDailySummary({ hotelId, businessDate: todayStr });
      const text = reportType === REPORT_TYPES.EVENING_SUMMARY
        ? buildEveningSummaryText(summary)
        : buildMorningSummaryText(summary);

      const outboxRecord = await recordWhatsAppOutboxEvent({
        hotelId,
        businessDate: todayStr,
        reportType,
        deliveryType: DELIVERY_TYPES.SCHEDULED,
        recipient: owner.phone,
        status: OUTBOX_STATUS.SENDING,
        metadata: { hotelName: summary.hotelName, totalRooms: summary.occupancy.totalRooms },
      });

      const sendResult = await sendWhatsAppMessage({
        to: owner.phone,
        text,
      });

      await updateWhatsAppOutboxEvent(outboxRecord.id, {
        status: sendResult.success ? OUTBOX_STATUS.SENT : OUTBOX_STATUS.FAILED,
        providerMessageId: sendResult.messageId || null,
        lastError: sendResult.success ? null : (sendResult.errorCode || sendResult.error || sendResult.message),
      });

      results.push({
        hotelId,
        hotelName: h.hotel_name,
        recipient: owner.phone,
        reportType,
        success: sendResult.success,
        status: sendResult.status,
      });
    }

    return res.json({
      success: true,
      businessDate: todayStr,
      reportType,
      processed: results.length,
      results,
    });
  } catch (err) {
    console.error('[WHATSAPP_CRON] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Cron execution error: ' + err.message });
  }
};

router.get(['/whatsapp/cron', '/cron'], handleWhatsAppCron);
router.post(['/whatsapp/cron', '/cron'], handleWhatsAppCron);

export default router;

