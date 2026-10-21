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

// ─── Welcome Email for New Hotel Owners ────────────────────────────────────────

/**
 * Generates HTML for the welcome email sent to a hotel owner
 * when a Super Admin creates their hotel.
 *
 * @param {Object} params
 * @param {string} params.hotelName
 * @param {string} params.ownerName
 * @param {string} params.ownerEmail
 * @param {string} params.loginUrl - URL to the Hotel Mantri login page
 * @param {string} [params.passwordSetupUrl] - URL for password setup/reset (if using invite flow)
 * @param {string} [params.trialEndDate] - When the trial expires
 * @param {number} [params.totalRooms]
 * @param {number} [params.categoryCount]
 * @param {string} [params.supportEmail]
 * @param {string} [params.planName]
 * @returns {{ subject: string, html: string, text: string }}
 */
export const buildWelcomeEmail = ({
  hotelName,
  ownerName,
  ownerEmail,
  loginUrl,
  passwordSetupUrl,
  trialEndDate,
  totalRooms,
  categoryCount,
  supportEmail,
  planName,
}) => {
  const hn = escapeHtml(hotelName || 'Your Hotel');
  const on = escapeHtml(ownerName || 'Hotel Owner');
  const oe = escapeHtml(ownerEmail || '');
  const lu = escapeHtml(loginUrl || '');
  const psu = passwordSetupUrl ? escapeHtml(passwordSetupUrl) : '';
  const se = escapeHtml(supportEmail || 'support@hotelmantri.com');
  const te = escapeHtml(trialEndDate || '');
  const pn = escapeHtml(planName || 'Trial (14 days)');

  const subject = `Welcome to Hotel Mantri — ${hotelName || 'Your Hotel'} is Ready!`;

  const bodyContent = `
    <!-- Welcome Banner -->
    <div style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border:1px solid #93c5fd;border-radius:12px;padding:24px;margin-bottom:28px;text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">🏨</div>
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#1e3a5f;letter-spacing:-0.5px;">Welcome to Hotel Mantri!</h1>
      <p style="margin:0;font-size:15px;color:#3b82f6;font-weight:600;">Your hotel <strong>${hn}</strong> has been set up and is ready for you.</p>
    </div>

    <!-- Greeting -->
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:15px;color:#1e293b;">Dear <strong>${on}</strong>,</p>
      <p style="margin:0;font-size:14px;color:#475569;line-height:1.6;">
        Congratulations! Your property <strong>${hn}</strong> has been successfully onboarded to
        <strong>Hotel Mantri PMS</strong> — a modern property management system designed to streamline
        your hotel operations, manage reservations, track revenue, and much more.
      </p>
    </div>

    <!-- Account Details Card -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:24px;">
      <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:14px 20px;">
        <span style="font-size:13px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:1px;">🔐 Your Account Details</span>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:4px 0;">
        ${infoRow('Hotel Name', `<strong>${hn}</strong>`)}
        ${infoRow('Login Email', `<code style="background:#eff6ff;padding:3px 8px;border-radius:4px;font-size:13px;color:#1e40af;">${oe}</code>`)}
        ${infoRow('Subscription', pn)}
        ${te ? infoRow('Trial Expires', te) : ''}
        ${totalRooms ? infoRow('Rooms Configured', `${totalRooms} rooms`) : ''}
        ${categoryCount ? infoRow('Room Categories', `${categoryCount} categories`) : ''}
      </table>
    </div>

    <!-- Password Setup / Login CTA -->
    ${psu ? `
    <div style="background:linear-gradient(135deg,#fef3c7,#fde68a);border:1px solid #f59e0b;border-radius:10px;padding:18px 20px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#92400e;">⚠️ ACTION REQUIRED: Set Your Password</p>
      <p style="margin:0 0 14px;font-size:13px;color:#78350f;line-height:1.5;">
        For security, you must set your own password before logging in.
        Click the button below to create your password. This link expires in <strong>72 hours</strong>.
      </p>
      <div style="text-align:center;">
        <a href="${psu}"
          style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#ffffff;font-size:14px;font-weight:700;padding:14px 36px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">
          🔑 Set Your Password Now
        </a>
      </div>
    </div>
    ` : `
    <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #86efac;border-radius:10px;padding:18px 20px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#166534;">✅ Your Account is Ready</p>
      <p style="margin:0 0:14px;font-size:13px;color:#15803d;line-height:1.5;">
        A temporary password has been set for your account. Please log in and change it immediately
        for security. If you did not receive a separate password communication, contact your administrator.
      </p>
    </div>
    `}

    <!-- Login Button -->
    ${lu ? `
    <div style="text-align:center;margin:28px 0;">
      <a href="${lu}"
        style="display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#ffffff;font-size:15px;font-weight:700;padding:16px 40px;border-radius:10px;text-decoration:none;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(37,99,235,0.25);">
        🚀 Log In to Hotel Mantri
      </a>
    </div>
    ` : ''}

    <!-- What's Next Section -->
    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:24px;">
      <h3 style="margin:0 0 14px;font-size:14px;font-weight:700;color:#1e293b;">📋 Getting Started — What's Next?</h3>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#475569;vertical-align:top;width:28px;">1.</td>
          <td style="padding:8px 0;font-size:13px;color:#475569;">Log in with your email and set a strong, unique password</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#475569;vertical-align:top;">2.</td>
          <td style="padding:8px 0;font-size:13px;color:#475569;">Review your hotel settings, room categories, and room inventory</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#475569;vertical-align:top;">3.</td>
          <td style="padding:8px 0;font-size:13px;color:#475569;">Create your first reservation using the Daily Entry Room Chart</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#475569;vertical-align:top;">4.</td>
          <td style="padding:8px 0;font-size:13px;color:#475569;">Explore Reports, Revenue tracking, and Channel Manager integration</td>
        </tr>
      </table>
    </div>

    <!-- Support -->
    <div style="background:#f1f5f9;border-radius:8px;padding:16px;text-align:center;">
      <p style="margin:0 0 4px;font-size:12px;color:#64748b;">Need help? Contact our support team:</p>
      <a href="mailto:${se}" style="font-size:13px;color:#2563eb;font-weight:600;text-decoration:none;">${se}</a>
    </div>
  `;

  const text = `
Welcome to Hotel Mantri!

Dear ${ownerName || 'Hotel Owner'},

Your hotel "${hotelName}" has been successfully onboarded to Hotel Mantri PMS.

ACCOUNT DETAILS
─────────────────
Hotel Name: ${hotelName}
Login Email: ${ownerEmail}
Subscription: ${planName || 'Trial (14 days)'}
${trialEndDate ? `Trial Expires: ${trialEndDate}` : ''}
${totalRooms ? `Rooms: ${totalRooms}` : ''}

${passwordSetupUrl ? `SET YOUR PASSWORD
─────────────────
For security, set your own password before logging in:
${passwordSetupUrl}
This link expires in 72 hours.
` : `A temporary password has been set for your account.
Please log in and change it immediately.
`}

LOGIN
─────────────────
${loginUrl || 'Visit Hotel Mantri to log in'}

GETTING STARTED
─────────────────
1. Log in and set a strong password
2. Review hotel settings and room inventory
3. Create your first reservation
4. Explore Reports and Channel Manager

Need help? Contact: ${supportEmail || 'support@hotelmantri.com'}
  `.trim();

  return {
    subject,
    html: emailLayout(subject, bodyContent),
    text,
  };
};

export default { buildOtaReservationEmail, buildInvoiceEmail, buildWelcomeEmail };
