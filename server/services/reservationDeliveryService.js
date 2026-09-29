/**
 * Hotel Mantri — Reservation Delivery Service
 *
 * Coordinates:
 * 1. Persistent PDF confirmation generation (DocumentService)
 * 2. Source classification & recipient resolution:
 *    - OTA reservations (MakeMyTrip, Goibibo, Booking.com, Agoda, etc.) -> Hotel Owner email
 *    - Manual reservations (Direct, Walk-in, Agent, Phone, Website) -> Customer/Guest email
 *    - Walk-in without email -> No email dispatch attempted (PDF generated & stored, print/download ready)
 * 3. Asynchronous email delivery via SMTP with attached PDF
 * 4. WhatsApp delivery (Owner alert for OTA / Direct link for staff)
 * 5. Durable tracking in notification_outbox and reservation_documents
 * 6. Strict idempotency across duplicate webhooks, page refreshes, and retries
 */

import { supabaseServiceRole } from '../supabaseClient.js';
import { sendEmail, isValidEmail, escapeHtml } from './emailService.js';
import { sendWhatsAppMessage, buildWhatsAppDirectUrl } from './whatsappService.js';
import { resolveHotelOwnerWhatsApp } from './dailySummaryService.js';
import { resolveHotelOwnerEmail } from './notificationService.js';
import {
  generateAndStoreReservationConfirmation,
  updateDocumentDeliveryStatus,
  readPdfFromStorage,
  getReservationDocuments,
  DOCUMENT_TYPES,
  DELIVERY_STATUS,
} from './documentService.js';

// ─── Event Types ──────────────────────────────────────────────────────────────

export const DELIVERY_EVENT_TYPES = {
  RESERVATION_CONFIRMATION_EMAIL: 'RESERVATION_CONFIRMATION_EMAIL',
  RESERVATION_CONFIRMATION_WHATSAPP: 'RESERVATION_CONFIRMATION_WHATSAPP',
};

// ─── OTA Classification Patterns ──────────────────────────────────────────────

const OTA_PATTERNS = [
  /makemytrip/i,
  /\bmmt\b/i,
  /goibibo/i,
  /cleartrip/i,
  /easemytrip/i,
  /booking\.com/i,
  /booking_com/i,
  /bookingcom/i,
  /\bagoda\b/i,
  /\bexpedia\b/i,
  /\bairbnb\b/i,
  /hotels\.com/i,
  /hotelscom/i,
  /\byatra\b/i,
  /trip\.com/i,
  /tripadvisor/i,
  /happyeasygo/i,
  /\bixigo\b/i,
  /via\.com/i,
  /\baiosell\b/i,
  /channel_manager/i,
  /channelmanager/i,
  /\bota\b/i,
];

/**
 * Checks if a reservation or source string belongs to an OTA / Channel Manager.
 * @param {Object|string} sourceOrReservation
 * @returns {boolean}
 */
export const isOTAReservation = (sourceOrReservation) => {
  if (!sourceOrReservation) return false;

  if (typeof sourceOrReservation === 'string') {
    const s = sourceOrReservation.trim().toLowerCase();
    if (s === 'ota') return true;
    return OTA_PATTERNS.some((pat) => pat.test(s));
  }

  if (typeof sourceOrReservation === 'object') {
    const r = sourceOrReservation;
    if (String(r.source_category || '').toUpperCase() === 'OTA') return true;
    if (String(r.guest_type || '').toUpperCase() === 'OTA') return true;
    if (String(r.payment_mode || '').toUpperCase() === 'OTA') return true;

    const sourceName = String(r.source_name || '');
    if (OTA_PATTERNS.some((pat) => pat.test(sourceName))) return true;

    const note = `${r.internal_note || ''} ${r.remarks || ''}`;
    if (/\[(OTA_BOOKING_ID|AIOSELL_BOOKING_ID):/i.test(note)) return true;
  }

  return false;
};

/**
 * Checks if a reservation is a Manual / Direct / Walk-in / Agent / Phone / Website booking.
 * @param {Object|string} sourceOrReservation
 * @returns {boolean}
 */
export const isManualReservation = (sourceOrReservation) => !isOTAReservation(sourceOrReservation);

/**
 * Normalizes booking source information.
 * @param {Object|string} sourceOrReservation
 * @returns {{ sourceType: 'OTA' | 'MANUAL', sourceName: string, otaBookingId: string }}
 */
export const normalizeBookingSource = (sourceOrReservation) => {
  const isOta = isOTAReservation(sourceOrReservation);
  if (typeof sourceOrReservation === 'string') {
    return {
      sourceType: isOta ? 'OTA' : 'MANUAL',
      sourceName: sourceOrReservation.trim(),
      otaBookingId: '',
    };
  }

  const r = sourceOrReservation || {};
  const rawNote = `${r.internal_note || ''} ${r.remarks || ''}`;
  const otaMatch = rawNote.match(/\[OTA_BOOKING_ID:\s*([^\]]+)\]/i) || rawNote.match(/\[AIOSELL_BOOKING_ID:\s*([^\]]+)\]/i);
  const otaBookingId = otaMatch && otaMatch[1] ? otaMatch[1].trim() : '';
  const sourceName = r.source_name || r.source_category || (isOta ? 'OTA' : 'Direct / Walk-in');

  return {
    sourceType: isOta ? 'OTA' : 'MANUAL',
    sourceName,
    otaBookingId,
  };
};

/**
 * Authoritative recipient resolution based on booking source.
 *
 * Rules:
 * 1. OTA Reservation -> Hotel Owner / Hotelier email (NEVER automatically send to OTA guest)
 * 2. Manual Reservation (Direct, Walk-in, Agent, Phone, Website) -> Customer / Guest email
 * 3. Walk-in / Manual without email -> No email dispatch attempted (recipientType: 'NONE')
 *
 * @param {Object} params
 * @param {string} params.hotelId - UUID
 * @param {Object} params.reservation - Reservation record
 * @returns {Promise<{
 *   recipientType: 'HOTEL_OWNER' | 'CUSTOMER' | 'NONE',
 *   email: string | null,
 *   name: string,
 *   sourceType: 'OTA' | 'MANUAL',
 *   sourceName: string,
 *   otaBookingId?: string,
 *   reason?: string
 * }>}
 */
export const resolveReservationNotificationRecipient = async ({ hotelId, reservation }) => {
  if (!reservation) {
    return {
      recipientType: 'NONE',
      email: null,
      name: 'Unknown',
      sourceType: 'MANUAL',
      sourceName: 'Direct',
      reason: 'RESERVATION_NOT_PROVIDED',
    };
  }

  const { sourceType, sourceName, otaBookingId } = normalizeBookingSource(reservation);

  if (sourceType === 'OTA') {
    // OTA Flow: Recipient is authoritative Hotel Owner
    const ownerInfo = await resolveHotelOwnerEmail(hotelId);
    const ownerEmail = ownerInfo?.email ? String(ownerInfo.email).trim() : null;

    if (ownerEmail && isValidEmail(ownerEmail)) {
      return {
        recipientType: 'HOTEL_OWNER',
        email: ownerEmail,
        name: ownerInfo.hotelName || 'Hotel Owner',
        sourceType: 'OTA',
        sourceName,
        otaBookingId,
      };
    } else {
      return {
        recipientType: 'HOTEL_OWNER',
        email: null,
        name: ownerInfo?.hotelName || 'Hotel Owner',
        sourceType: 'OTA',
        sourceName,
        otaBookingId,
        reason: 'OWNER_EMAIL_NOT_CONFIGURED',
      };
    }
  } else {
    // Manual Flow: Recipient is Customer / Guest
    let guestEmail = (reservation.guest_email || '').trim();

    // Look up in guests table if guest_email was omitted from reservation row
    if (!guestEmail && reservation.guest_id) {
      try {
        const { data: guest } = await supabaseServiceRole
          .from('guests')
          .select('email, name')
          .eq('id', reservation.guest_id)
          .maybeSingle();

        if (guest?.email) {
          guestEmail = String(guest.email).trim();
        }
      } catch (err) {
        console.warn('[DELIVERY_SERVICE] Failed to query guest by guest_id:', err.message);
      }
    }

    if (guestEmail && isValidEmail(guestEmail)) {
      return {
        recipientType: 'CUSTOMER',
        email: guestEmail,
        name: reservation.guest_name || 'Guest',
        sourceType: 'MANUAL',
        sourceName,
      };
    } else {
      // Walk-in or direct booking without email: DO NOT ATTEMPT EMAIL
      return {
        recipientType: 'NONE',
        email: null,
        name: reservation.guest_name || 'Walk-in Guest',
        sourceType: 'MANUAL',
        sourceName,
        reason: 'CUSTOMER_EMAIL_NOT_AVAILABLE',
      };
    }
  }
};

// ─── Format Helpers ──────────────────────────────────────────────────────────

const formatDateReadable = (iso) => {
  if (!iso) return '—';
  const clean = String(iso).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const [y, m, d] = parts;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d} ${months[parseInt(m, 10) - 1] || m} ${y}`;
  }
  return clean;
};

const calculateNights = (ci, co) => {
  if (!ci || !co) return 1;
  const d1 = new Date(ci.slice(0, 10) + 'T00:00:00');
  const d2 = new Date(co.slice(0, 10) + 'T00:00:00');
  return Math.max(1, Math.round((d2 - d1) / (1000 * 3600 * 24)));
};

// ─── Email Template: OTA -> Hotel Owner ──────────────────────────────────────

export const buildOtaOwnerConfirmationEmail = ({
  hotelName,
  reservationId,
  confirmationNumber,
  otaBookingId,
  bookingSource,
  guestName,
  guestPhone,
  checkIn,
  checkOut,
  nights,
  roomCategory,
  roomsCount = 1,
  roomNo,
  ratePlan,
  totalAmount,
  advancePaid,
  balanceDue,
  paymentStatus,
  specialRequests,
  pdfFilename,
  isModification = false,
  isCancellation = false,
  version = 1,
}) => {
  const shortId = (reservationId || '').slice(0, 8).toUpperCase();
  const titlePrefix = isCancellation
    ? 'OTA Reservation Cancelled'
    : isModification
    ? `OTA Reservation Modified (v${version})`
    : 'New OTA Reservation';

  const subject = `${titlePrefix} – ${hotelName} – Reservation #${confirmationNumber || `HM-${shortId}`}`;

  const text = `
Dear Hotel Owner,

A new reservation has been received through ${bookingSource}.

Reservation Details
-------------------
Reservation ID: HM-${shortId}
OTA: ${bookingSource}${otaBookingId ? ` (ID: ${otaBookingId})` : ''}
Guest: ${guestName}
Check-in: ${formatDateReadable(checkIn)}
Check-out: ${formatDateReadable(checkOut)}
Nights: ${nights} Night${nights > 1 ? 's' : ''}
Room: ${roomCategory || 'Standard'}${roomNo && roomNo !== 'Not Assigned' ? ` (Room ${roomNo})` : ''}
Rooms: ${roomsCount}
Rate Plan: ${ratePlan || 'Standard'}
${specialRequests ? `Special Requests: ${specialRequests}\n` : ''}
Financial Details
-----------------
Total: Rs.${Math.round(totalAmount).toLocaleString('en-IN')}
Paid: Rs.${Math.round(advancePaid).toLocaleString('en-IN')}
Due: Rs.${Math.round(balanceDue).toLocaleString('en-IN')}
Payment Status: ${paymentStatus || 'OTA Channel Collect'}

Please find the official Reservation Confirmation attached.

Regards,
Hotel Mantri PMS
${hotelName}
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <div style="background-color: #0d476d; padding: 24px; text-align: left;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">${hotelName}</h1>
      <p style="color: #93c5fd; margin: 6px 0 0 0; font-size: 13px; font-weight: 500;">
        ${titlePrefix} &bull; #${confirmationNumber || `HM-${shortId}`}
      </p>
    </div>
    <div style="background-color: #c99736; height: 3px;"></div>

    <div style="padding: 24px;">
      <p style="margin-top: 0; font-size: 14px; line-height: 1.5; color: #334155;">
        Dear <strong>${hotelName}</strong> Owner / Team,
      </p>
      <p style="font-size: 14px; line-height: 1.5; color: #334155;">
        A new reservation has been received through <strong>${bookingSource}</strong>.
      </p>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600; width: 35%;">Reservation ID</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 700; color: #0d476d;">HM-${shortId}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600;">OTA / Channel</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a;">${bookingSource}${otaBookingId ? ` (ID: ${otaBookingId})` : ''}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600;">Guest Name</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #0f172a;">${guestName} ${guestPhone ? `(${guestPhone})` : ''}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600;">Stay Dates</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a;">
            ${formatDateReadable(checkIn)} &rarr; ${formatDateReadable(checkOut)} (<strong>${nights} Night${nights > 1 ? 's' : ''}</strong>)
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600;">Room / Category</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a;">
            ${roomCategory || 'Standard'}${roomNo && roomNo !== 'Not Assigned' ? ` &bull; <strong>Room ${roomNo}</strong>` : ' &bull; Not Assigned'}
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600;">Financial Details</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 700; color: #0d476d;">
            Rs.${Math.round(totalAmount).toLocaleString('en-IN')}
            <span style="font-size: 11px; font-weight: normal; color: #64748b;">(Paid: Rs.${Math.round(advancePaid).toLocaleString('en-IN')} | Due: Rs.${Math.round(balanceDue).toLocaleString('en-IN')})</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-size: 12px; color: #64748b; font-weight: 600;">Payment Status</td>
          <td style="padding: 10px 14px; font-size: 13px; color: #0f172a;">${paymentStatus || 'OTA Channel Collect'}</td>
        </tr>
      </table>

      ${specialRequests ? `
      <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px;">
        <span style="font-size: 11px; font-weight: 700; color: #92400e;">SPECIAL REQUESTS:</span>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #78350f;">${specialRequests}</p>
      </div>` : ''}

      <div style="background-color: #eff6ff; border: 1px dashed #3b82f6; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
        <p style="margin: 0; font-size: 12px; color: #1e40af; font-weight: 600;">
          &#128196; Attached: <strong>${pdfFilename || 'Reservation-Confirmation.pdf'}</strong>
        </p>
        <p style="margin: 4px 0 0 0; font-size: 11px; color: #3b82f6;">
          Official Reservation Confirmation document generated by Hotel Mantri PMS.
        </p>
      </div>

      <p style="font-size: 11px; color: #94a3b8; margin-top: 24px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px;">
        Hotel Mantri PMS &bull; Authoritative OTA Reservation Alert
      </p>
    </div>
  </div>
</body>
</html>
`.trim();

  return { subject, text, html };
};

// ─── Email Template: Manual/Direct -> Customer/Guest ─────────────────────────

export const buildCustomerConfirmationEmail = ({
  hotelName,
  hotelPhone,
  hotelEmail,
  hotelAddress,
  reservationId,
  confirmationNumber,
  bookingDate,
  bookingSource = 'Walk-in',
  guestName,
  guestPhone,
  guestEmail,
  checkIn,
  checkOut,
  nights,
  roomCategory,
  roomsCount = 1,
  roomNo,
  mealPlan = 'EP',
  ratePlan,
  totalAmount,
  advancePaid,
  balanceDue,
  paymentStatus,
  pdfFilename,
  isModification = false,
  isCancellation = false,
  version = 1,
}) => {
  const shortId = (reservationId || '').slice(0, 8).toUpperCase();
  const bookingId = confirmationNumber || `HM-RES-${shortId}`;
  const subject = `Booking Confirmation — ${hotelName} — ${bookingId}`;

  const text = `
Dear ${guestName},

Thank you for choosing ${hotelName}.
Your reservation has been successfully confirmed.

Booking Details
Booking ID: ${bookingId}
Booking Date: ${formatDateReadable(bookingDate || new Date().toISOString())}
Check-in: ${formatDateReadable(checkIn)}
Check-out: ${formatDateReadable(checkOut)}
Number of Nights: ${nights}
Number of Rooms: ${roomsCount}
Room: ${roomCategory || 'Standard'}${roomNo && roomNo !== 'Not Assigned' ? ` (Room ${roomNo})` : ''}
Meal Plan: ${mealPlan || 'EP'}
Booking Source: ${bookingSource || 'Walk-in'}

Guest Details
Name: ${guestName}
Mobile: ${guestPhone || '—'}
Email: ${guestEmail || '—'}

Payment Summary
Total Amount: ₹${Math.round(totalAmount).toLocaleString('en-IN')}
Paid Amount: ₹${Math.round(advancePaid).toLocaleString('en-IN')}
Due Amount: ₹${Math.round(balanceDue).toLocaleString('en-IN')}

The reservation confirmation PDF is attached to this email.

We look forward to welcoming you.

Regards,
${hotelName}
${hotelPhone ? `${hotelPhone}\n` : ''}${hotelEmail ? `${hotelEmail}\n` : ''}
Powered by HotelMantri
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <div style="background-color: #0d476d; padding: 24px; text-align: left;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">${escapeHtml(hotelName)}</h1>
      <p style="color: #93c5fd; margin: 6px 0 0 0; font-size: 13px; font-weight: 500;">
        Booking Confirmation &bull; ${escapeHtml(bookingId)}
      </p>
    </div>
    <div style="background-color: #c99736; height: 3px;"></div>

    <div style="padding: 24px;">
      <p style="margin-top: 0; font-size: 14px; line-height: 1.5; color: #334155;">
        Dear <strong>${escapeHtml(guestName)}</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.5; color: #334155;">
        Thank you for choosing <strong>${escapeHtml(hotelName)}</strong>.<br />
        Your reservation has been successfully confirmed.
      </p>

      <h3 style="margin: 20px 0 10px 0; font-size: 13px; font-weight: 700; color: #0d476d; text-transform: uppercase; letter-spacing: 0.5px;">
        Booking Details
      </h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
        <tr>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600; width: 38%;">Booking ID</td>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 700; color: #0d476d;">${escapeHtml(bookingId)}</td>
        </tr>
        <tr>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600;">Booking Date</td>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a;">${formatDateReadable(bookingDate || new Date().toISOString())}</td>
        </tr>
        <tr>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600;">Check-in</td>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a; font-weight: 600;">${formatDateReadable(checkIn)}</td>
        </tr>
        <tr>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600;">Check-out</td>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a; font-weight: 600;">${formatDateReadable(checkOut)}</td>
        </tr>
        <tr>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600;">Number of Nights</td>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a;">${nights}</td>
        </tr>
        <tr>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600;">Number of Rooms</td>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a;">${roomsCount}</td>
        </tr>
        <tr>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600;">Room</td>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a;">
            ${escapeHtml(roomCategory || 'Standard')}${roomNo && roomNo !== 'Not Assigned' ? ` (Room ${escapeHtml(roomNo)})` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600;">Meal Plan</td>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a;">${escapeHtml(mealPlan || 'EP')}</td>
        </tr>
        <tr>
          <td style="padding: 9px 14px; font-size: 12px; color: #64748b; font-weight: 600;">Booking Source</td>
          <td style="padding: 9px 14px; font-size: 13px; color: #0f172a;">${escapeHtml(bookingSource || 'Walk-in')}</td>
        </tr>
      </table>

      <h3 style="margin: 20px 0 10px 0; font-size: 13px; font-weight: 700; color: #0d476d; text-transform: uppercase; letter-spacing: 0.5px;">
        Guest Details
      </h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
        <tr>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600; width: 38%;">Name</td>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a; font-weight: 600;">${escapeHtml(guestName)}</td>
        </tr>
        <tr>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600;">Mobile</td>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a;">${escapeHtml(guestPhone || '—')}</td>
        </tr>
        <tr>
          <td style="padding: 9px 14px; font-size: 12px; color: #64748b; font-weight: 600;">Email</td>
          <td style="padding: 9px 14px; font-size: 13px; color: #0f172a;">${escapeHtml(guestEmail || '—')}</td>
        </tr>
      </table>

      <h3 style="margin: 20px 0 10px 0; font-size: 13px; font-weight: 700; color: #0d476d; text-transform: uppercase; letter-spacing: 0.5px;">
        Payment Summary
      </h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
        <tr>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600; width: 38%;">Total Amount</td>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 700; color: #0d476d;">
            ₹${Math.round(totalAmount).toLocaleString('en-IN')}
          </td>
        </tr>
        <tr>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600;">Paid Amount</td>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #16a34a; font-weight: 600;">
            ₹${Math.round(advancePaid).toLocaleString('en-IN')}
          </td>
        </tr>
        <tr>
          <td style="padding: 9px 14px; font-size: 12px; color: #64748b; font-weight: 600;">Due Amount</td>
          <td style="padding: 9px 14px; font-size: 13px; color: ${balanceDue > 0 ? '#b91c1c' : '#16a34a'}; font-weight: 700;">
            ₹${Math.round(balanceDue).toLocaleString('en-IN')}
          </td>
        </tr>
      </table>

      <div style="background-color: #eff6ff; border: 1px dashed #3b82f6; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
        <p style="margin: 0; font-size: 12px; color: #1e40af; font-weight: 600;">
          &#128196; Attached: <strong>${escapeHtml(pdfFilename || 'Reservation-Confirmation.pdf')}</strong>
        </p>
        <p style="margin: 4px 0 0 0; font-size: 11px; color: #3b82f6;">
          The reservation confirmation PDF is attached to this email.
        </p>
      </div>

      <p style="font-size: 13px; color: #334155; margin: 16px 0 8px 0;">
        We look forward to welcoming you.
      </p>

      <div style="margin-top: 20px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.5;">
        <p style="margin: 0 0 4px 0;">Regards,</p>
        <strong style="color: #0f172a; font-size: 13px;">${escapeHtml(hotelName)}</strong><br />
        ${hotelPhone ? `Phone: ${escapeHtml(hotelPhone)}<br />` : ''}
        ${hotelEmail ? `Email: ${escapeHtml(hotelEmail)}<br />` : ''}
        <p style="margin: 12px 0 0 0; font-size: 11px; color: #94a3b8; font-style: italic;">
          Powered by HotelMantri
        </p>
      </div>
    </div>
  </div>
</body>
</html>
`.trim();

  return { subject, text, html };
};

// Backwards-compatible general builder: routes to OTA or Customer template
export const buildReservationConfirmationEmail = (params) => {
  if (params.isOTA || isOTAReservation(params.bookingSource)) {
    return buildOtaOwnerConfirmationEmail(params);
  }
  return buildCustomerConfirmationEmail(params);
};

// ─── Build WhatsApp Message ──────────────────────────────────────────────────

export const buildReservationConfirmationWhatsAppText = ({
  hotelName,
  reservationId,
  confirmationNumber,
  otaBookingId,
  bookingSource,
  guestName,
  checkIn,
  checkOut,
  nights,
  roomCategory,
  roomNo,
  totalAmount,
  advancePaid,
  balanceDue,
  isModification = false,
  isCancellation = false,
  version = 1,
}) => {
  const shortId = (reservationId || '').slice(0, 8).toUpperCase();
  const icon = isCancellation ? '❌' : isModification ? '🔄' : '🏨';
  const title = isCancellation
    ? 'RESERVATION CANCELLED'
    : isModification
    ? `RESERVATION MODIFIED (v${version})`
    : 'NEW RESERVATION CONFIRMED';

  const lines = [
    `${icon} *${hotelName} — ${title}*`,
    '',
    `*Reservation:* HM-${shortId}`,
    otaBookingId ? `*Channel:* ${bookingSource} (ID: ${otaBookingId})` : `*Source:* ${bookingSource}`,
    `*Guest:* ${guestName}`,
    `*Dates:* ${formatDateReadable(checkIn)} → ${formatDateReadable(checkOut)} (${nights} Night${nights > 1 ? 's' : ''})`,
    `*Room:* ${roomNo || 'Not Assigned'} (${roomCategory || 'Standard'})`,
    `*Total:* ₹${Math.round(totalAmount).toLocaleString('en-IN')}`,
    `*Paid:* ₹${Math.round(advancePaid).toLocaleString('en-IN')} | *Due:* ₹${Math.round(balanceDue).toLocaleString('en-IN')}`,
    '',
    '📄 *Reservation confirmation PDF generated & available on PMS dashboard.*',
  ];

  return lines.join('\n');
};

// ─── Core Delivery Function ───────────────────────────────────────────────────

/**
 * Generates Confirmation PDF and Delivers to the appropriate recipient:
 * - OTA reservation -> Hotel Owner Email
 * - Manual reservation -> Customer / Guest Email
 * - Walk-in without email -> Email skipped, PDF generated and persistently stored
 *
 * Idempotent: respects unique constraint in notification_outbox.
 * Fully non-blocking for callers.
 *
 * @param {Object} params
 * @param {string} params.hotelId - UUID
 * @param {string} params.reservationId - UUID
 * @param {Object} [params.reservation] - Authoritative reservation record
 * @param {string} [params.eventType='NEW_RESERVATION']
 * @param {boolean} [params.forceNewVersion=false]
 * @param {string} [params.generatedBy='SYSTEM']
 * @returns {Promise<Object>} Delivery summary { pdf, recipient, email, whatsapp }
 */
export const generateAndDeliverConfirmation = async ({
  hotelId,
  reservationId,
  reservation = null,
  eventType = 'NEW_RESERVATION',
  forceNewVersion = false,
  generatedBy = 'SYSTEM',
}) => {
  console.log(`[DELIVERY_SERVICE] Starting confirmation delivery for hotel=${hotelId} reservation=${reservationId} event=${eventType}`);

  // 1. Fetch Reservation Record if not passed
  let resRecord = reservation;
  if (!resRecord) {
    const { data, error } = await supabaseServiceRole
      .from('reservations')
      .select('*')
      .eq('id', reservationId)
      .eq('hotel_id', hotelId)
      .maybeSingle();

    if (error || !data) {
      console.error(`[DELIVERY_SERVICE] Could not find reservation id=${reservationId} hotel=${hotelId}`);
      return { success: false, error: 'RESERVATION_NOT_FOUND' };
    }
    resRecord = data;
  }

  // Determine document type from event
  const isCancellation = eventType === 'RESERVATION_CANCELLED' || resRecord.status === 'cancelled';
  const isModification = eventType === 'RESERVATION_MODIFIED' || forceNewVersion;
  const docType = isCancellation
    ? DOCUMENT_TYPES.RESERVATION_CANCELLATION
    : isModification
    ? DOCUMENT_TYPES.RESERVATION_MODIFICATION
    : DOCUMENT_TYPES.RESERVATION_CONFIRMATION;

  // 2. Step 1: Generate & Store Confirmation PDF (Durable & Persistent)
  let genResult;
  try {
    genResult = await generateAndStoreReservationConfirmation({
      hotelId,
      reservationId,
      reservation: resRecord,
      forceNewVersion,
      documentType: docType,
      generatedBy,
    });
  } catch (genErr) {
    console.error(`[DELIVERY_SERVICE] PDF Generation error for reservation=${reservationId}:`, genErr.message);
    return {
      success: false,
      pdf: { status: 'failed', error: genErr.message },
      recipient: { recipientType: 'NONE', email: null },
      email: { status: 'skipped', reason: 'PDF generation failed' },
      whatsapp: { status: 'skipped', reason: 'PDF generation failed' },
    };
  }

  const { document: docRecord, buffer: pdfBuffer, version, fileName } = genResult;
  console.log(`[DELIVERY_SERVICE] PDF ready version=${version} file=${fileName} size=${pdfBuffer.length}`);

  // 3. Resolve Metrics & Hotel Details
  const checkIn = String(resRecord.check_in_date || '').slice(0, 10);
  const checkOut = String(resRecord.check_out_date || '').slice(0, 10);
  const nights = calculateNights(checkIn, checkOut);
  const rateVal = Number(resRecord.rate) || 0;
  const taxableVal = Number(resRecord.taxable_amount) || (rateVal * nights);
  const gstVal = Number(resRecord.gst_amount) || 0;
  const discountVal = Number(resRecord.discount) || 0;
  const totalVal = Number(resRecord.invoice_total) || (taxableVal + gstVal - discountVal);
  const advanceVal = Number(resRecord.advance_paid) || 0;
  const dueVal = Math.max(0, totalVal - advanceVal);

  const shortId = (resRecord.id || '').slice(0, 8).toUpperCase();
  const confirmationNumber = `HM-RES-${shortId}`;

  // Fetch hotel info for branding
  const hotelObj = (await supabaseServiceRole.from('hotels').select('*').eq('id', hotelId).maybeSingle()).data || {};
  const settingsObj = (await supabaseServiceRole.from('hotel_settings').select('*').eq('id', hotelId).maybeSingle()).data || {};
  const hotelName = settingsObj.hotel_name || hotelObj.hotel_name || 'Hotel Mantri';
  const hotelPhone = settingsObj.phone || hotelObj.phone || '';
  const hotelEmail = settingsObj.email || hotelObj.email || '';
  const hotelAddress = settingsObj.address || hotelObj.address || '';

  // 4. Step 2: Resolve Authoritative Recipient based on Booking Source
  const recipientResolution = await resolveReservationNotificationRecipient({
    hotelId,
    reservation: resRecord,
  });

  console.log(`[DELIVERY_SERVICE] Resolved recipient: type=${recipientResolution.recipientType} email=${recipientResolution.email || 'NONE'} source=${recipientResolution.sourceType} (${recipientResolution.sourceName})`);

  // 5. Step 3: Deliver Email via SMTP with PDF Attachment
  let emailDeliveryResult = { status: 'pending' };

  if (recipientResolution.recipientType === 'NONE') {
    // Walk-in / Direct without email: DO NOT ATTEMPT EMAIL DISPATCH
    console.log(`[DELIVERY_SERVICE] Email skipped: ${recipientResolution.reason} for reservation=${reservationId}`);
    emailDeliveryResult = {
      status: 'skipped',
      recipientType: 'NONE',
      reason: recipientResolution.reason,
      message: 'Customer email not available — confirmation PDF generated successfully.',
    };
    await updateDocumentDeliveryStatus(hotelId, reservationId, version, {
      emailStatus: DELIVERY_STATUS.NOT_AVAILABLE,
      errorDetails: 'Customer email not available',
    });
  } else if (recipientResolution.recipientType === 'HOTEL_OWNER' && !recipientResolution.email) {
    // OTA booking but Owner email not configured
    console.warn(`[DELIVERY_SERVICE] Owner email not configured for OTA booking hotel=${hotelId}`);
    emailDeliveryResult = {
      status: 'not_configured',
      recipientType: 'HOTEL_OWNER',
      reason: 'OWNER_EMAIL_NOT_CONFIGURED',
      message: 'Owner email not configured for this hotel.',
    };
    await updateDocumentDeliveryStatus(hotelId, reservationId, version, {
      emailStatus: DELIVERY_STATUS.NOT_CONFIGURED,
      errorDetails: 'Owner email not configured',
    });
  } else {
    // Valid target email: Hotel Owner (for OTA) or Customer (for Manual)
    const targetEmail = recipientResolution.email;
    const targetType = recipientResolution.recipientType; // 'HOTEL_OWNER' | 'CUSTOMER'
    const emailEventKey = `${DELIVERY_EVENT_TYPES.RESERVATION_CONFIRMATION_EMAIL}_${targetType}_V${version}`;

    try {
      // Idempotency: Outbox check
      const { data: existingOutbox } = await supabaseServiceRole
        .from('notification_outbox')
        .select('id, status')
        .eq('hotel_id', hotelId)
        .eq('reservation_id', reservationId)
        .eq('event_type', emailEventKey)
        .maybeSingle();

      if (existingOutbox && existingOutbox.status === 'sent') {
        console.log(`[DELIVERY_SERVICE] Email already sent for event=${emailEventKey}`);
        emailDeliveryResult = {
          status: 'duplicate',
          recipientType: targetType,
          recipient: targetEmail,
          message: `Confirmation email already sent to ${targetType === 'HOTEL_OWNER' ? 'hotel owner' : 'guest'} for this version.`,
        };
        await updateDocumentDeliveryStatus(hotelId, reservationId, version, { emailStatus: DELIVERY_STATUS.SENT });
      } else {
        // Record outbox row
        let outboxId = existingOutbox?.id;
        if (!outboxId) {
          const { data: newOutbox } = await supabaseServiceRole
            .from('notification_outbox')
            .insert({
              hotel_id: hotelId,
              reservation_id: reservationId,
              event_type: emailEventKey,
              recipient: targetEmail,
              status: 'sending',
              attempt_count: 1,
              metadata: {
                version,
                fileName,
                eventType,
                recipientType: targetType,
                sourceType: recipientResolution.sourceType,
                sourceName: recipientResolution.sourceName,
                otaBookingId: recipientResolution.otaBookingId,
              },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .select('id')
            .maybeSingle();
          outboxId = newOutbox?.id;
        }

        // Build specific email template based on recipient type
        let emailContent;
        if (targetType === 'HOTEL_OWNER') {
          emailContent = buildOtaOwnerConfirmationEmail({
            hotelName,
            reservationId: resRecord.id,
            confirmationNumber,
            otaBookingId: recipientResolution.otaBookingId,
            bookingSource: recipientResolution.sourceName,
            guestName: resRecord.guest_name || 'Guest',
            guestPhone: resRecord.guest_phone || '',
            checkIn,
            checkOut,
            nights,
            roomCategory: resRecord.rate_plan || resRecord.room_category || 'Standard',
            roomNo: resRecord.room_no && resRecord.room_no.toLowerCase() !== 'unassigned' ? resRecord.room_no : 'Not Assigned',
            ratePlan: resRecord.rate_plan || 'Standard',
            totalAmount: totalVal,
            advancePaid: advanceVal,
            balanceDue: dueVal,
            paymentStatus: resRecord.payment_mode === 'OTA' ? 'OTA Channel Collect' : dueVal === 0 ? 'Paid' : 'Pending',
            specialRequests: resRecord.remarks || '',
            pdfFilename: fileName,
            isModification,
            isCancellation,
            version,
          });
        } else {
          emailContent = buildCustomerConfirmationEmail({
            hotelName,
            hotelPhone,
            hotelEmail,
            hotelAddress,
            reservationId: resRecord.id,
            confirmationNumber,
            bookingDate: resRecord.created_at || new Date().toISOString(),
            bookingSource: resRecord.source_name || resRecord.source_category || 'Walk-in',
            guestName: resRecord.guest_name || 'Guest',
            guestPhone: resRecord.guest_phone || '',
            guestEmail: targetEmail,
            checkIn,
            checkOut,
            nights,
            roomCategory: resRecord.rate_plan || resRecord.room_category || 'Standard',
            roomsCount: 1,
            roomNo: resRecord.room_no && resRecord.room_no.toLowerCase() !== 'unassigned' ? resRecord.room_no : 'Not Assigned',
            mealPlan: resRecord.meal_plan || 'EP',
            ratePlan: resRecord.rate_plan || 'Standard',
            totalAmount: totalVal,
            advancePaid: advanceVal,
            balanceDue: dueVal,
            paymentStatus: dueVal === 0 ? 'Paid' : 'Pending',
            pdfFilename: fileName,
            isModification,
            isCancellation,
            version,
          });
        }

        // Dispatch via SMTP with attached PDF
        const sendResult = await sendEmail({
          to: targetEmail,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
          attachments: [
            {
              filename: fileName,
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ],
        });

        if (sendResult.success) {
          console.log(`[DELIVERY_SERVICE] Email SENT to=${targetEmail} (${targetType}) messageId=${sendResult.messageId}`);
          emailDeliveryResult = {
            status: 'sent',
            recipientType: targetType,
            recipient: targetEmail,
            messageId: sendResult.messageId,
          };
          await updateDocumentDeliveryStatus(hotelId, reservationId, version, { emailStatus: DELIVERY_STATUS.SENT });
          if (outboxId) {
            await supabaseServiceRole.from('notification_outbox').update({
              status: 'sent',
              provider_message_id: sendResult.messageId,
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', outboxId);
          }
        } else {
          console.error(`[DELIVERY_SERVICE] Email FAILED to=${targetEmail} errorCode=${sendResult.errorCode}`);
          emailDeliveryResult = {
            status: 'failed',
            recipientType: targetType,
            recipient: targetEmail,
            errorCode: sendResult.errorCode,
            message: sendResult.message,
          };
          await updateDocumentDeliveryStatus(hotelId, reservationId, version, {
            emailStatus: DELIVERY_STATUS.FAILED,
            errorDetails: sendResult.errorCode || sendResult.message,
          });
          if (outboxId) {
            await supabaseServiceRole.from('notification_outbox').update({
              status: 'failed',
              last_error: sendResult.errorCode || sendResult.message,
              updated_at: new Date().toISOString(),
            }).eq('id', outboxId);
          }
        }
      }
    } catch (emailErr) {
      console.error('[DELIVERY_SERVICE] Unexpected error in email dispatch:', emailErr.message);
      emailDeliveryResult = {
        status: 'failed',
        recipientType: targetType,
        recipient: targetEmail,
        error: emailErr.message,
      };
      await updateDocumentDeliveryStatus(hotelId, reservationId, version, {
        emailStatus: DELIVERY_STATUS.FAILED,
        errorDetails: emailErr.message,
      });
    }
  }

  // 6. Step 4: WhatsApp Notification (Hotel Owner for OTA / Guest wa.me link for manual)
  let whatsappDeliveryResult = { status: 'pending' };
  try {
    const ownerWhatsApp = await resolveHotelOwnerWhatsApp(hotelId);
    if (!ownerWhatsApp || !ownerWhatsApp.valid) {
      whatsappDeliveryResult = { status: 'not_configured', message: 'Owner WhatsApp not configured.' };
      await updateDocumentDeliveryStatus(hotelId, reservationId, version, { whatsappStatus: DELIVERY_STATUS.NOT_CONFIGURED });
    } else {
      const waText = buildReservationConfirmationWhatsAppText({
        hotelName: ownerWhatsApp.hotelName || hotelName,
        reservationId: resRecord.id,
        confirmationNumber,
        otaBookingId: recipientResolution.otaBookingId,
        bookingSource: recipientResolution.sourceName,
        guestName: resRecord.guest_name || 'Guest',
        checkIn,
        checkOut,
        nights,
        roomCategory: resRecord.rate_plan || resRecord.room_category || 'Standard',
        roomNo: resRecord.room_no && resRecord.room_no.toLowerCase() !== 'unassigned' ? `Room ${resRecord.room_no}` : 'Not Assigned',
        totalAmount: totalVal,
        advancePaid: advanceVal,
        balanceDue: dueVal,
        isModification,
        isCancellation,
        version,
      });

      const directUrl = buildWhatsAppDirectUrl(ownerWhatsApp.phone, waText);

      // Only attempt automated background WhatsApp send for OTA reservations to notify owner
      if (recipientResolution.sourceType === 'OTA') {
        const waSendResult = await sendWhatsAppMessage({
          to: ownerWhatsApp.phone,
          text: waText,
        });

        if (waSendResult.success) {
          whatsappDeliveryResult = {
            status: 'sent',
            messageId: waSendResult.messageId,
            recipient: ownerWhatsApp.phone,
            whatsappDirectUrl: directUrl,
          };
          await updateDocumentDeliveryStatus(hotelId, reservationId, version, { whatsappStatus: DELIVERY_STATUS.SENT });
        } else {
          whatsappDeliveryResult = {
            status: waSendResult.status === 'provider_not_configured' ? 'not_configured' : 'failed',
            errorCode: waSendResult.errorCode,
            message: waSendResult.message,
            whatsappDirectUrl: directUrl,
          };
          const statusToRecord = waSendResult.status === 'provider_not_configured' ? DELIVERY_STATUS.NOT_CONFIGURED : DELIVERY_STATUS.FAILED;
          await updateDocumentDeliveryStatus(hotelId, reservationId, version, {
            whatsappStatus: statusToRecord,
            errorDetails: waSendResult.message,
          });
        }
      } else {
        // For Manual reservations, provide direct click-to-chat URL for staff
        whatsappDeliveryResult = {
          status: 'ready_manual',
          recipient: resRecord.guest_phone || ownerWhatsApp.phone,
          whatsappDirectUrl: directUrl,
        };
      }
    }
  } catch (waErr) {
    console.error('[DELIVERY_SERVICE] Unexpected error in WhatsApp handling:', waErr.message);
    whatsappDeliveryResult = { status: 'failed', error: waErr.message };
    await updateDocumentDeliveryStatus(hotelId, reservationId, version, {
      whatsappStatus: DELIVERY_STATUS.FAILED,
      errorDetails: waErr.message,
    });
  }

  return {
    success: true,
    pdf: {
      status: 'generated',
      version,
      fileName,
      storagePath: genResult.storagePath,
    },
    recipient: recipientResolution,
    email: emailDeliveryResult,
    whatsapp: whatsappDeliveryResult,
  };
};

export default {
  isOTAReservation,
  isManualReservation,
  normalizeBookingSource,
  resolveReservationNotificationRecipient,
  buildOtaOwnerConfirmationEmail,
  buildCustomerConfirmationEmail,
  buildReservationConfirmationEmail,
  buildReservationConfirmationWhatsAppText,
  generateAndDeliverConfirmation,
  DELIVERY_EVENT_TYPES,
};
