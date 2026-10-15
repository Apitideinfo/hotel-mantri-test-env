/**
 * Hotel Mantri — Email Templates
 * Professional HTML email templates for OTA notifications and invoice emails.
 * All dynamic user data is HTML-escaped before insertion.
 */

import { escapeHtml } from './emailService.js';

// ─── Shared Layout Wrapper ─────────────────────────────────────────────────────

const emailLayout = (title, bodyContent) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:28px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">🏨 Hotel Mantri</div>
                    <div style="font-size:13px;color:#93c5fd;margin-top:4px;">Property Management System</div>
                  </td>
                  <td align="right">
                    <div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:8px 14px;font-size:11px;color:#dbeafe;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Automated Notification</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">This is an automated notification from Hotel Mantri PMS.</p>
              <p style="margin:4px 0 0;font-size:11px;color:#cbd5e1;">Do not reply to this email. For support, contact your Hotel Mantri administrator.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

// ─── Info Row Helper ───────────────────────────────────────────────────────────

const infoRow = (label, value) => `
<tr>
  <td style="padding:8px 12px;font-size:13px;color:#64748b;font-weight:600;white-space:nowrap;vertical-align:top;width:38%;">${escapeHtml(label)}</td>
  <td style="padding:8px 12px;font-size:13px;color:#1e293b;font-weight:500;vertical-align:top;">${value || '<span style="color:#94a3b8;">—</span>'}</td>
</tr>`;

const sectionHeader = (text) => `
<tr>
  <td colspan="2" style="padding:14px 12px 6px;font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;">${escapeHtml(text)}</td>
</tr>`;

// ─── OTA New Reservation Email ─────────────────────────────────────────────────

/**
 * Generates HTML for new OTA reservation owner notification.
 *
 * @param {Object} params
 * @param {string} params.hotelName
 * @param {string} params.reservationId
 * @param {string} params.otaBookingId
 * @param {string} params.bookingSource
 * @param {string} params.guestName
 * @param {string} params.guestPhone
 * @param {string} params.guestEmail
 * @param {string} params.checkIn
 * @param {string} params.checkOut
 * @param {number} params.nights
 * @param {string} params.roomCategory
 * @param {string} params.roomNo
 * @param {number} params.roomsCount
 * @param {string} params.mealPlan
 * @param {number} params.rate
 * @param {number} params.totalAmount
 * @param {string} params.paymentStatus
 * @param {string} params.reservationStatus
 * @param {string} params.createdAt
 * @param {string} params.viewReservationUrl
 * @returns {{ subject: string, html: string, text: string }}
 */
export const buildOtaReservationEmail = ({
  hotelName,
  reservationId,
  otaBookingId,
  bookingSource,
  guestName,
  guestPhone,
  guestEmail,
  checkIn,
  checkOut,
  nights,
  roomCategory,
  roomNo,
  roomsCount,
  mealPlan,
  rate,
  totalAmount,
  paymentStatus,
  reservationStatus,
  createdAt,
  viewReservationUrl,
}) => {
  const hn = escapeHtml(hotelName || 'Hotel');
  const gn = escapeHtml(guestName || 'Guest');
  const ci = escapeHtml(checkIn || '');
  const src = escapeHtml(bookingSource || 'OTA');

  const subject = `New OTA Reservation – ${gn} – ${hn} – Check-in ${ci}`;

  const bodyContent = `
    <!-- Alert Banner -->
    <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:24px;display:flex;align-items:center;gap:12px;">
      <div style="font-size:28px;">🎉</div>
      <div>
        <div style="font-size:15px;font-weight:700;color:#15803d;">New OTA Booking Received!</div>
        <div style="font-size:13px;color:#166534;margin-top:3px;">A new reservation from <strong>${src}</strong> has been created in Hotel Mantri.</div>
      </div>
    </div>

    <!-- Booking Info -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      ${sectionHeader('Hotel & Reservation')}
      ${infoRow('Hotel', escapeHtml(hotelName))}
      ${infoRow('Reservation ID', escapeHtml(reservationId))}
      ${infoRow('OTA Booking ID', escapeHtml(otaBookingId))}
      ${infoRow('Booking Source', escapeHtml(bookingSource))}
      ${infoRow('Created in PMS', escapeHtml(createdAt))}

      ${sectionHeader('Guest Information')}
      ${infoRow('Guest Name', escapeHtml(guestName))}
      ${infoRow('Phone', escapeHtml(guestPhone) || '<span style="color:#94a3b8;">Not provided</span>')}
      ${infoRow('Email', escapeHtml(guestEmail) || '<span style="color:#94a3b8;">Not provided</span>')}

      ${sectionHeader('Stay Details')}
      ${infoRow('Check-in', escapeHtml(checkIn))}
      ${infoRow('Check-out', escapeHtml(checkOut))}
      ${infoRow('Nights', escapeHtml(String(nights || 1)))}
      ${infoRow('Room Category', escapeHtml(roomCategory))}
      ${infoRow('Assigned Room', escapeHtml(roomNo) || '<span style="color:#f59e0b;font-weight:700;">⚠ Unassigned — Assign in PMS</span>')}
      ${infoRow('No. of Rooms', escapeHtml(String(roomsCount || 1)))}
      ${infoRow('Meal Plan', escapeHtml(mealPlan))}

      ${sectionHeader('Financials')}
      ${infoRow('Rate per Night', `₹${Number(rate || 0).toLocaleString('en-IN')}`)}
      ${infoRow('Total Amount', `<strong style="color:#1e293b;font-size:15px;">₹${Number(totalAmount || 0).toLocaleString('en-IN')}</strong>`)}
      ${infoRow('Payment Status', escapeHtml(paymentStatus))}
      ${infoRow('Reservation Status', escapeHtml(reservationStatus))}
    </table>

    <!-- CTA Button -->
    ${viewReservationUrl ? `
    <div style="text-align:center;margin-top:24px;">
      <a href="${escapeHtml(viewReservationUrl)}"
         style="display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#ffffff;font-size:14px;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">
        👁 View Reservation in Hotel Mantri
      </a>
    </div>
    ` : ''}

    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;text-align:center;">
      This notification was sent because a new OTA reservation was successfully created in Hotel Mantri PMS for <strong>${hn}</strong>.
    </p>
  `;

  const text = `
New OTA Reservation – Hotel Mantri

Hotel: ${hotelName}
Reservation ID: ${reservationId}
OTA Booking ID: ${otaBookingId}
Booking Source: ${bookingSource}

Guest: ${guestName}
Phone: ${guestPhone || 'N/A'}
Email: ${guestEmail || 'N/A'}

Check-in: ${checkIn}
Check-out: ${checkOut}
Nights: ${nights}
Room: ${roomCategory} | ${roomNo || 'Unassigned'}
Meal Plan: ${mealPlan}
Total: INR ${Number(totalAmount || 0).toLocaleString('en-IN')}
Payment: ${paymentStatus}
Status: ${reservationStatus}

Created: ${createdAt}

${viewReservationUrl ? `View reservation: ${viewReservationUrl}` : ''}
  `.trim();

  return {
    subject,
    html: emailLayout(subject, bodyContent),
    text,
  };
};

// ─── Invoice Email ─────────────────────────────────────────────────────────────

/**
 * Generates HTML for invoice email to guest/customer.
 *
 * @param {Object} params
 * @param {string} params.hotelName
 * @param {string} params.guestName
 * @param {string} params.invoiceNumber
 * @param {string} params.invoiceDate
 * @param {string} params.dueDate
 * @param {number} params.totalAmount
 * @param {number} params.amountPaid
 * @param {number} params.balanceDue
 * @param {string} params.status
 * @param {string} params.hotelAddress
 * @param {string} params.pdfFilename - Name for the attached PDF
 * @returns {{ subject: string, html: string, text: string }}
 */
export const buildInvoiceEmail = ({
  hotelName,
  guestName,
  invoiceNumber,
  invoiceDate,
  dueDate,
  totalAmount,
  amountPaid,
  balanceDue,
  status,
  hotelAddress,
  pdfFilename,
}) => {
  const hn = escapeHtml(hotelName || 'Hotel');
  const gn = escapeHtml(guestName || 'Guest');
  const inv = escapeHtml(invoiceNumber || 'DRAFT');

  const subject = `Invoice ${inv} – ${hn} – ${gn}`;

  const bodyContent = `
    <!-- Greeting -->
    <div style="margin-bottom:24px;">
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1e293b;">Dear ${gn},</h2>
      <p style="margin:0;font-size:14px;color:#64748b;">
        Please find your invoice from <strong>${hn}</strong> attached to this email.
        You can also review the details below.
      </p>
    </div>

    <!-- Invoice Summary -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:13px;color:#64748b;padding-bottom:6px;">Invoice Number</td>
          <td style="font-size:13px;color:#64748b;text-align:right;padding-bottom:6px;">Invoice Date</td>
        </tr>
        <tr>
          <td style="font-size:20px;font-weight:800;color:#1e293b;">${inv}</td>
          <td style="font-size:14px;font-weight:600;color:#475569;text-align:right;">${escapeHtml(invoiceDate || '')}</td>
        </tr>
      </table>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;" />

      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:13px;color:#64748b;padding:4px 0;">Invoice Total</td>
          <td style="font-size:15px;font-weight:700;color:#1e293b;text-align:right;padding:4px 0;">₹${Number(totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#64748b;padding:4px 0;">Amount Paid</td>
          <td style="font-size:14px;font-weight:600;color:#16a34a;text-align:right;padding:4px 0;">₹${Number(amountPaid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#64748b;padding:4px 0;">Balance Due</td>
          <td style="font-size:15px;font-weight:800;color:${Number(balanceDue || 0) > 0 ? '#dc2626' : '#16a34a'};text-align:right;padding:4px 0;">₹${Number(balanceDue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
        ${dueDate ? `<tr>
          <td style="font-size:13px;color:#64748b;padding:4px 0;">Due Date</td>
          <td style="font-size:13px;font-weight:600;color:#475569;text-align:right;padding:4px 0;">${escapeHtml(dueDate)}</td>
        </tr>` : ''}
      </table>
    </div>

    <!-- PDF Note -->
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#1d4ed8;">
        📎 <strong>Invoice PDF attached</strong> — Your invoice PDF is attached to this email as <code>${escapeHtml(pdfFilename || 'invoice.pdf')}</code>.
        If you cannot view the attachment, please contact <strong>${hn}</strong>.
      </p>
    </div>

    <!-- Hotel Info -->
    ${hotelAddress ? `
    <div style="font-size:12px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:16px;margin-top:8px;">
      <strong style="color:#64748b;">${hn}</strong><br />
      ${escapeHtml(hotelAddress)}
    </div>
    ` : ''}
  `;

  const text = `
Dear ${guestName},

Please find your invoice from ${hotelName} attached to this email.

Invoice Number: ${invoiceNumber}
Invoice Date: ${invoiceDate}
Total Amount: INR ${Number(totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
Amount Paid: INR ${Number(amountPaid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
Balance Due: INR ${Number(balanceDue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
${dueDate ? `Due Date: ${dueDate}` : ''}
Status: ${status}

Your invoice PDF is attached to this email.

${hotelName}
${hotelAddress || ''}
  `.trim();

  return {
    subject,
    html: emailLayout(subject, bodyContent),
    text,
  };
};

export default { buildOtaReservationEmail, buildInvoiceEmail };
