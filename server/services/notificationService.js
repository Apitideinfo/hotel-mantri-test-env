/**
 * Hotel Mantri — Notification Outbox Service
 *
 * Durable, database-backed notification system for OTA reservation emails.
 * Prevents duplicate emails even when OTA webhooks are retried multiple times.
 *
 * Uses the `notification_outbox` table in Supabase with a unique constraint on:
 *   (hotel_id, reservation_id, event_type)
 *
 * This ensures ONE email per OTA booking event, even across serverless restarts.
 */

import { supabaseServiceRole } from '../supabaseClient.js';
import { sendEmail } from './emailService.js';
import { buildOtaReservationEmail } from './emailTemplates.js';
import { resolveHotelOwnerWhatsApp, buildOtaReservationWhatsAppText } from './dailySummaryService.js';
import { sendWhatsAppMessage, buildMetaBookingConfirmationTemplate } from './whatsappService.js';
import { buildReservationConfirmationWhatsAppText } from './reservationDeliveryService.js';
import {
  isOtaReservationAlertSent,
  recordWhatsAppOutboxEvent,
  updateWhatsAppOutboxEvent,
  REPORT_TYPES,
  DELIVERY_TYPES,
  OUTBOX_STATUS,
} from './whatsappOutboxService.js';

const supabase = supabaseServiceRole;

// ─── Event Types ──────────────────────────────────────────────────────────────

export const EVENT_TYPES = {
  OTA_NEW_RESERVATION_OWNER_EMAIL: 'OTA_NEW_RESERVATION_OWNER_EMAIL',
  OTA_NEW_RESERVATION_OWNER_WHATSAPP: 'OTA_NEW_RESERVATION_OWNER_WHATSAPP',
};

// ─── Status Values ────────────────────────────────────────────────────────────

const STATUS = {
  QUEUED: 'queued',
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
  NOT_CONFIGURED: 'not_configured',
  DUPLICATE: 'duplicate',
};

const MAX_RETRY_ATTEMPTS = 3;

// ─── Create Notification Outbox Record ────────────────────────────────────────

/**
 * Inserts a notification_outbox record, respecting the unique constraint
 * (hotel_id, reservation_id, event_type) to prevent duplicates.
 *
 * Returns:
 *   { created: true, notificationId } if a new record was created
 *   { created: false, duplicate: true } if already exists (idempotent)
 *   { created: false, error } on DB error
 */
export const createNotificationOutboxRecord = async ({
  hotelId,
  reservationId,
  eventType,
  recipient,
  metadata = {},
}) => {
  try {
    const { data, error } = await supabase
      .from('notification_outbox')
      .insert({
        hotel_id: hotelId,
        reservation_id: reservationId,
        event_type: eventType,
        recipient,
        status: STATUS.QUEUED,
        attempt_count: 0,
        metadata: JSON.stringify(metadata),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      // Unique constraint violation = duplicate (this is expected and safe)
      if (error.code === '23505' || (error.message && error.message.includes('unique'))) {
        console.log(`[NOTIFICATION] Duplicate prevented for event=${eventType} reservation=${reservationId}`);
        return { created: false, duplicate: true };
      }
      console.error('[NOTIFICATION] Failed to create outbox record:', error.message);
      return { created: false, error: error.message };
    }

    return { created: true, notificationId: data.id };
  } catch (err) {
    console.error('[NOTIFICATION] Outbox insert exception:', err.message);
    return { created: false, error: err.message };
  }
};

// ─── Update Notification Status ───────────────────────────────────────────────

const updateNotificationStatus = async (notificationId, { status, providerMessageId, lastError, attemptCount }) => {
  try {
    const updates = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (providerMessageId !== undefined) updates.provider_message_id = providerMessageId;
    if (lastError !== undefined) updates.last_error = lastError;
    if (attemptCount !== undefined) updates.attempt_count = attemptCount;
    if (status === STATUS.SENT) updates.sent_at = new Date().toISOString();

    await supabase
      .from('notification_outbox')
      .update(updates)
      .eq('id', notificationId);
  } catch (err) {
    console.warn('[NOTIFICATION] Failed to update outbox status:', err.message);
  }
};

// ─── Resolve Hotel Owner Email ────────────────────────────────────────────────

/**
 * Resolves the hotel owner/admin email from the hotels table.
 * NEVER trusts client-supplied emails.
 * Returns null if no email is configured.
 */
export const resolveHotelOwnerEmail = async (hotelId) => {
  try {
    const { data: hotel, error } = await supabase
      .from('hotels')
      .select('id, hotel_name, admin_email, owner_name')
      .eq('id', hotelId)
      .maybeSingle();

    if (error || !hotel) {
      console.warn(`[NOTIFICATION] Could not resolve hotel for hotelId=${hotelId}:`, error?.message);
      return null;
    }

    const email = hotel.admin_email?.trim();
    if (!email || !email.includes('@')) {
      console.warn(`[NOTIFICATION] Hotel ${hotelId} has no valid admin_email configured`);
      return null;
    }

    return {
      email,
      hotelName: hotel.hotel_name || 'Hotel',
      ownerName: hotel.owner_name || '',
    };
  } catch (err) {
    console.error('[NOTIFICATION] resolveHotelOwnerEmail failed:', err.message);
    return null;
  }
};

// ─── Send OTA New Reservation Owner Email ─────────────────────────────────────

/**
 * Sends an owner notification email for a new OTA reservation.
 * Handles idempotency via the notification_outbox table.
 *
 * MUST be called AFTER the reservation is confirmed in the DB.
 *
 * @param {Object} params
 * @param {string} params.hotelId
 * @param {string} params.reservationId - Hotel Mantri reservation UUID
 * @param {Object} params.reservation - Full reservation record
 * @param {string} params.otaBookingId - External OTA booking ID
 * @param {string} params.bookingSource - e.g. "Booking.com", "MakeMyTrip"
 * @returns {Promise<{ success: boolean, status: string, notificationId?: string, messageId?: string, message?: string }>}
 */
export const sendOtaNewReservationEmail = async ({
  hotelId,
  reservationId,
  reservation,
  otaBookingId,
  bookingSource,
}) => {
  console.log(`[OTA_NOTIFICATION] Processing event=OTA_NEW_RESERVATION hotel=${hotelId} reservation=${reservationId}`);

  // 1. Resolve hotel owner email server-side
  const ownerInfo = await resolveHotelOwnerEmail(hotelId);
  if (!ownerInfo) {
    console.warn(`[OTA_NOTIFICATION] No owner email for hotel=${hotelId}. status=NOT_CONFIGURED`);
    // Record non-configured state if possible
    try {
      await supabase.from('notification_outbox').insert({
        hotel_id: hotelId,
        reservation_id: reservationId,
        event_type: EVENT_TYPES.OTA_NEW_RESERVATION_OWNER_EMAIL,
        recipient: null,
        status: STATUS.NOT_CONFIGURED,
        last_error: 'Hotel has no admin_email configured',
        attempt_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select('id').single();
    } catch { /* ignore duplicate insert if already exists */ }
    return { success: false, status: STATUS.NOT_CONFIGURED, message: 'Hotel has no owner email configured.' };
  }

  // 2. Create outbox record (idempotent — unique constraint prevents duplicates)
  const outboxResult = await createNotificationOutboxRecord({
    hotelId,
    reservationId,
    eventType: EVENT_TYPES.OTA_NEW_RESERVATION_OWNER_EMAIL,
    recipient: ownerInfo.email,
    metadata: { otaBookingId, bookingSource },
  });

  if (outboxResult.duplicate) {
    return {
      success: true,
      status: STATUS.DUPLICATE,
      message: 'Owner notification already sent for this reservation. Duplicate prevented.',
    };
  }

  if (!outboxResult.created || !outboxResult.notificationId) {
    return {
      success: false,
      status: STATUS.FAILED,
      message: outboxResult.error || 'Failed to create notification record.',
    };
  }

  const notificationId = outboxResult.notificationId;
  console.log(`[OTA_NOTIFICATION] Outbox record created id=${notificationId} recipient=${ownerInfo.email}`);

  // 3. Mark as sending
  await updateNotificationStatus(notificationId, { status: STATUS.SENDING, attemptCount: 1 });

  // 4. Build email
  const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'https://hotel-mantri.vercel.app';
  const checkIn = reservation.check_in_date || '';
  const checkOut = reservation.check_out_date || '';
  const ciDate = checkIn ? new Date(checkIn + 'T00:00:00') : null;
  const coDate = checkOut ? new Date(checkOut + 'T00:00:00') : null;
  const nights = ciDate && coDate ? Math.max(1, Math.round((coDate - ciDate) / 86400000)) : 1;

  const emailContent = buildOtaReservationEmail({
    hotelName: ownerInfo.hotelName,
    reservationId,
    otaBookingId: otaBookingId || reservation.remarks || 'N/A',
    bookingSource: bookingSource || reservation.source_name || 'OTA',
    guestName: reservation.guest_name || 'Guest',
    guestPhone: reservation.guest_phone || '',
    guestEmail: reservation.guest_email || '',
    checkIn: checkIn,
    checkOut: checkOut,
    nights,
    roomCategory: reservation.rate_plan || reservation.room_category || 'N/A',
    roomNo: reservation.room_no || 'Unassigned',
    roomsCount: 1,
    mealPlan: reservation.meal_plan || reservation.rate_plan || 'N/A',
    rate: reservation.rate || 0,
    totalAmount: reservation.invoice_total || reservation.rate || 0,
    paymentStatus: reservation.payment_mode || 'OTA',
    reservationStatus: reservation.status || 'confirmed',
    createdAt: new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC',
    viewReservationUrl: `${appUrl}/reservations/${reservationId}`,
  });

  // 5. Send email
  const result = await sendEmail({
    to: ownerInfo.email,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
  });

  // 6. Update outbox record
  if (result.success) {
    await updateNotificationStatus(notificationId, {
      status: STATUS.SENT,
      providerMessageId: result.messageId,
      attemptCount: 1,
    });
    console.log(`[OTA_NOTIFICATION] Email sent. notificationId=${notificationId} messageId=${result.messageId}`);
    return {
      success: true,
      status: STATUS.SENT,
      notificationId,
      messageId: result.messageId,
    };
  } else {
    await updateNotificationStatus(notificationId, {
      status: STATUS.FAILED,
      lastError: result.errorCode || result.message || 'SMTP_SEND_FAILED',
      attemptCount: 1,
    });
    console.error(`[OTA_NOTIFICATION] Email failed. notificationId=${notificationId} errorCode=${result.errorCode}`);
    return {
      success: false,
      status: STATUS.FAILED,
      notificationId,
      errorCode: result.errorCode,
      message: result.message,
    };
  }
};

// ─── Send OTA New Reservation Owner WhatsApp ──────────────────────────────────

/**
 * Sends an owner notification WhatsApp message for a new OTA reservation.
 * Handles idempotency via the outbox store to prevent duplicate alerts (Section 19, 20).
 *
 * MUST be called AFTER the reservation is confirmed in the DB.
 */
export const sendOtaNewReservationWhatsApp = async ({
  hotelId,
  reservationId,
  reservation,
  otaBookingId,
  bookingSource,
}) => {
  console.log(`[OTA_WHATSAPP] Processing event=OTA_NEW_RESERVATION hotel=${hotelId} reservation=${reservationId}`);

  // 1. Resolve owner WhatsApp number
  const owner = await resolveHotelOwnerWhatsApp(hotelId);
  if (!owner.valid) {
    console.warn(`[OTA_WHATSAPP] No valid owner WhatsApp for hotel=${hotelId}: ${owner.error}`);
    return { success: false, status: 'not_configured', message: 'Owner WhatsApp not configured' };
  }

  // 2. Prevent duplicate alerts (Section 20)
  const alreadySent = await isOtaReservationAlertSent({ hotelId, reservationId });
  if (alreadySent) {
    console.log(`[OTA_WHATSAPP] Duplicate alert prevented for hotel=${hotelId} reservation=${reservationId}`);
    return { success: true, status: 'duplicate', message: 'WhatsApp alert already sent for this reservation' };
  }

  // 3. Record outbox event
  const outboxRecord = await recordWhatsAppOutboxEvent({
    hotelId,
    businessDate: (reservation.check_in_date || '').slice(0, 10),
    reportType: REPORT_TYPES.OTA_NEW_RESERVATION_OWNER_WHATSAPP,
    deliveryType: DELIVERY_TYPES.SCHEDULED,
    recipient: owner.phone,
    status: OUTBOX_STATUS.SENDING,
    reservationId,
    metadata: { otaBookingId, bookingSource },
  });

  // 4. Build message text
  const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'https://hotel-mantri.vercel.app';
  const text = buildOtaReservationWhatsAppText({
    hotelName: owner.hotelName,
    reservation,
    otaBookingId,
    bookingSource,
    viewUrl: `${appUrl}/reservations/${reservationId}`,
  });

  // 5. Send message
  const sendResult = await sendWhatsAppMessage({
    to: owner.phone,
    text,
  });

  // 6. Update outbox record
  await updateWhatsAppOutboxEvent(outboxRecord.id, {
    status: sendResult.success ? OUTBOX_STATUS.SENT : OUTBOX_STATUS.FAILED,
    providerMessageId: sendResult.messageId || null,
    lastError: sendResult.success ? null : (sendResult.errorCode || sendResult.message),
  });

  return sendResult;
};

// ─── Retry Failed Notifications ───────────────────────────────────────────────

/**
 * Retries failed outbox notifications (up to MAX_RETRY_ATTEMPTS).
 * Call this from a scheduled job or on-demand diagnostic endpoint.
 * Returns a summary of retried records.
 */
export const retryFailedNotifications = async (hotelId = null) => {
  try {
    let query = supabase
      .from('notification_outbox')
      .select('*')
      .eq('status', STATUS.FAILED)
      .lt('attempt_count', MAX_RETRY_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(10);

    if (hotelId) query = query.eq('hotel_id', hotelId);

    const { data: records, error } = await query;

    if (error || !records || records.length === 0) {
      return { retried: 0, records: [] };
    }

    const results = [];

    for (const record of records) {
      const attemptCount = (record.attempt_count || 0) + 1;

      if (record.event_type === EVENT_TYPES.OTA_NEW_RESERVATION_OWNER_EMAIL && record.recipient) {
        // Fetch full reservation for retry
        const { data: reservation } = await supabase
          .from('reservations')
          .select('*')
          .eq('id', record.reservation_id)
          .maybeSingle();

        if (!reservation) {
          await updateNotificationStatus(record.id, {
            status: STATUS.FAILED,
            lastError: 'Reservation no longer exists',
            attemptCount,
          });
          results.push({ id: record.id, status: 'skipped', reason: 'reservation_not_found' });
          continue;
        }

        const metadata = typeof record.metadata === 'string'
          ? JSON.parse(record.metadata)
          : (record.metadata || {});

        await updateNotificationStatus(record.id, { status: STATUS.SENDING, attemptCount });

        const emailContent = buildOtaReservationEmail({
          hotelName: record.hotel_name || 'Hotel',
          reservationId: record.reservation_id,
          otaBookingId: metadata.otaBookingId || 'N/A',
          bookingSource: metadata.bookingSource || 'OTA',
          guestName: reservation.guest_name || 'Guest',
          guestPhone: reservation.guest_phone || '',
          guestEmail: reservation.guest_email || '',
          checkIn: reservation.check_in_date || '',
          checkOut: reservation.check_out_date || '',
          nights: 1,
          roomCategory: reservation.rate_plan || 'N/A',
          roomNo: reservation.room_no || 'Unassigned',
          roomsCount: 1,
          mealPlan: reservation.meal_plan || 'N/A',
          rate: reservation.rate || 0,
          totalAmount: reservation.invoice_total || 0,
          paymentStatus: reservation.payment_mode || 'OTA',
          reservationStatus: reservation.status || 'confirmed',
          createdAt: record.created_at || new Date().toISOString(),
          viewReservationUrl: `${process.env.APP_URL || ''}/reservations/${record.reservation_id}`,
        });

        const sendResult = await sendEmail({
          to: record.recipient,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });

        if (sendResult.success) {
          await updateNotificationStatus(record.id, {
            status: STATUS.SENT,
            providerMessageId: sendResult.messageId,
            attemptCount,
          });
          results.push({ id: record.id, status: 'sent' });
        } else {
          const finalStatus = attemptCount >= MAX_RETRY_ATTEMPTS ? STATUS.FAILED : STATUS.FAILED;
          await updateNotificationStatus(record.id, {
            status: finalStatus,
            lastError: sendResult.errorCode || sendResult.message,
            attemptCount,
          });
          results.push({ id: record.id, status: 'failed', errorCode: sendResult.errorCode });
        }
      } else if (record.event_type && record.event_type.startsWith('RESERVATION_CONFIRMATION_WHATSAPP') && record.recipient) {
        // Fetch full reservation for WhatsApp retry
        const { data: reservation } = await supabase
          .from('reservations')
          .select('*')
          .eq('id', record.reservation_id)
          .maybeSingle();

        if (!reservation) {
          await updateNotificationStatus(record.id, {
            status: STATUS.FAILED,
            lastError: 'Reservation no longer exists',
            attemptCount,
          });
          results.push({ id: record.id, status: 'skipped', reason: 'reservation_not_found' });
          continue;
        }

        await updateNotificationStatus(record.id, { status: STATUS.SENDING, attemptCount });

        const hotelObj = (await supabase.from('hotels').select('*').eq('id', record.hotel_id).maybeSingle()).data || {};
        const settingsObj = (await supabase.from('hotel_settings').select('*').eq('id', record.hotel_id).maybeSingle()).data || {};
        const hotelName = settingsObj.hotel_name || hotelObj.hotel_name || 'Hotel Mantri';

        const totalVal = Number(reservation.invoice_total) || 0;
        const advanceVal = Number(reservation.advance_paid) || 0;
        const dueVal = Math.max(0, totalVal - advanceVal);

        const waText = buildReservationConfirmationWhatsAppText({
          hotelName,
          reservationId: reservation.id,
          confirmationNumber: `HM-RES-${reservation.id.slice(0, 8).toUpperCase()}`,
          otaBookingId: reservation.remarks || '',
          bookingSource: reservation.source_name || reservation.source_category || 'Direct',
          guestName: reservation.guest_name || 'Guest',
          checkIn: String(reservation.check_in_date || '').slice(0, 10),
          checkOut: String(reservation.check_out_date || '').slice(0, 10),
          nights: 1,
          roomCategory: reservation.rate_plan || reservation.room_category || 'Standard',
          roomNo: reservation.room_no,
          totalAmount: totalVal,
          advancePaid: advanceVal,
          balanceDue: dueVal,
        });

        const roomInfo = `${reservation.rate_plan || reservation.room_category || 'Standard'}${
          reservation.room_no && reservation.room_no.toLowerCase() !== 'unassigned' ? ` (Room ${reservation.room_no})` : ''
        }`;

        const metaTemplate = buildMetaBookingConfirmationTemplate({
          guestName: reservation.guest_name || 'Guest',
          hotelName,
          confirmationNumber: `HM-RES-${reservation.id.slice(0, 8).toUpperCase()}`,
          roomDetails: roomInfo,
          checkIn: String(reservation.check_in_date || '').slice(0, 10),
          checkOut: String(reservation.check_out_date || '').slice(0, 10),
          totalAmount: totalVal,
        });

        const waSendResult = await sendWhatsAppMessage({
          to: record.recipient,
          text: waText,
          templateName: metaTemplate.templateName,
          templateComponents: metaTemplate.templateComponents,
          templateLanguage: metaTemplate.templateLanguage,
        });

        if (waSendResult.success) {
          await updateNotificationStatus(record.id, {
            status: STATUS.SENT,
            providerMessageId: waSendResult.messageId,
            attemptCount,
          });
          results.push({ id: record.id, status: 'sent', provider: waSendResult.provider });
        } else {
          await updateNotificationStatus(record.id, {
            status: STATUS.FAILED,
            lastError: waSendResult.errorCode || waSendResult.message,
            attemptCount,
          });
          results.push({ id: record.id, status: 'failed', errorCode: waSendResult.errorCode });
        }
      }
    }

    return { retried: results.length, records: results };
  } catch (err) {
    console.error('[NOTIFICATION] retryFailedNotifications error:', err.message);
    return { retried: 0, error: err.message };
  }
};

export default {
  sendOtaNewReservationEmail,
  sendOtaNewReservationWhatsApp,
  createNotificationOutboxRecord,
  resolveHotelOwnerEmail,
  retryFailedNotifications,
  EVENT_TYPES,
};
