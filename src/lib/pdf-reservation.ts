/**
 * Hotel Mantri — Client-Side Reservation Confirmation PDF Engine
 *
 * Generates authoritative, beautifully styled Reservation Confirmation PDFs
 * directly in the browser matching the server's PDF layout and dynamic branding.
 *
 * Features:
 * - 100% Dynamic Hotel Branding: Logo, Hotel Name, City, State, Address, Contacts, GSTIN
 * - 100% Dynamic Check-in/Out Times (e.g. 12:00 Hrs, 10:00 Hrs in gold clock panel)
 * - 100% Dynamic Cancellation Policy & Important Notes from hotel configuration
 * - Multi-night stay formatting (e.g. 31-08-2026 -> 02-09-2026 = 2 Nights)
 * - Multi-room table breakdown (SR No., Category, Adults+Bed, Child+Infant, Meal Plan, Unit Rate, Total)
 * - Authoritative financial source of truth: Grand Total, Paid Amount, Due Amount (Pay Later)
 * - Full vector iconography: Calendar, ID Badge, Chain Link, Globe, User, Envelope, Phone,
 *   Document, Moon, Building, Rupee (₹), Location Pin, Bell, Clock, and HotelMantri logo.
 * - Clean fallbacks: clean dash '—' when fields are empty, never 'undefined', 'null', or 'NaN'
 */

import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { Reservation } from './types-reservations';
import type { HotelSettings } from './types';
import { previewPDF, downloadPDF } from './pdf';

// ─── Color Palette ────────────────────────────────────────────────────────────

const C = {
  navyDark:    [10, 46, 76] as [number, number, number],      // Deep Midnight Navy #0a2e4c
  navySoft:    [26, 92, 138] as [number, number, number],     // Secondary Navy #1a5c8a
  gold:        [201, 151, 54] as [number, number, number],    // Hotel Mantri Gold #c99736
  goldLight:   [254, 243, 199] as [number, number, number],   // Soft gold background
  goldBorder:  [218, 178, 102] as [number, number, number],   // Soft gold border #dab266
  goldIcon:    [194, 141, 52] as [number, number, number],    // Golden-brown icon stroke #c28d34
  goldText:    [180, 120, 24] as [number, number, number],    // Golden text #b47818
  textMain:    [15, 23, 42] as [number, number, number],      // Slate-900 #0f172a
  textMuted:   [100, 116, 139] as [number, number, number],   // Slate-500 #64748b
  cardBg:      [255, 255, 255] as [number, number, number],   // White
  cardBorder:  [226, 232, 240] as [number, number, number],   // Slate-200 #e2e8f0
  blueLink:    [2, 132, 199] as [number, number, number],     // Sky-600 #0284c7
  emeraldText: [22, 101, 52] as [number, number, number],     // Emerald-800 #166534
  roseText:    [185, 28, 28] as [number, number, number],     // Rose-700 #b91c1c
};

// ─── Formatting Helpers ───────────────────────────────────────────────────────

const fmtRs = (n: number | string | undefined | null) => {
  const num = Number(n) || 0;
  return `Rs.${Math.round(num).toLocaleString('en-IN')}`;
};

const fmtDateReadable = (iso?: string | null) => {
  if (!iso) return '—';
  const clean = String(iso).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const [y, m, d] = parts;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d}-${months[parseInt(m, 10) - 1] || m}-${y}`;
  }
  return clean;
};

const calculateNights = (ciStr?: string | null, coStr?: string | null) => {
  if (!ciStr || !coStr) return 1;
  const d1 = new Date(ciStr.slice(0, 10) + 'T00:00:00');
  const d2 = new Date(coStr.slice(0, 10) + 'T00:00:00');
  const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 3600 * 24));
  return Math.max(1, diffDays);
};

const formatMealPlan = (code?: string | null) => {
  if (!code) return 'Room Only';
  const u = String(code).trim().toUpperCase();
  if (u === 'EP' || u.includes('ROOM ONLY')) return 'Room Only';
  if (u === 'CP' || u.includes('BREAKFAST')) return 'Breakfast Included';
  if (u === 'MAP' || u.includes('DINNER')) return 'Breakfast & Dinner';
  if (u === 'AP' || u.includes('ALL MEAL')) return 'All Meals Included';
  return code;
};

// ─── Vector Icon Helpers (Precise Graphical Primitives) ────────────────────────

const drawRupee = (doc: jsPDF, x: number, y: number, size = 3, color: [number, number, number] = C.textMain) => {
  doc.setDrawColor(...color);
  doc.setLineWidth(size * 0.1);
  const w = size * 0.65;
  doc.line(x, y - size, x + w, y - size);
  doc.line(x, y - size * 0.65, x + w * 0.9, y - size * 0.65);
  doc.line(x + w * 0.15, y - size, x + w * 0.15, y - size * 0.3);
  doc.line(x + w * 0.15, y - size * 0.65, x + w * 0.65, y - size * 0.65);
  doc.line(x + w * 0.65, y - size * 0.65, x + w * 0.65, y - size * 0.3);
  doc.line(x + w * 0.65, y - size * 0.3, x + w * 0.15, y - size * 0.3);
  doc.line(x + w * 0.25, y - size * 0.3, x + w * 0.85, y);
};

const drawCalendarIcon = (doc: jsPDF, x: number, y: number, s = 2.8, color = C.goldIcon) => {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y - s, s * 1.1, s * 1.05, 0.4, 0.4, 'D');
  doc.line(x, y - s + 0.9, x + s * 1.1, y - s + 0.9);
  doc.setFillColor(...color);
  doc.rect(x + 0.5, y - s - 0.4, 0.5, 0.6, 'F');
  doc.rect(x + s * 1.1 - 1, y - s - 0.4, 0.5, 0.6, 'F');
  doc.circle(x + s * 0.35, y - s * 0.2, 0.22, 'F');
  doc.circle(x + s * 0.75, y - s * 0.2, 0.22, 'F');
};

const drawIdBadgeIcon = (doc: jsPDF, x: number, y: number, s = 2.8, color = C.goldIcon) => {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y - s, s * 1.2, s * 0.9, 0.4, 0.4, 'D');
  doc.setFillColor(...color);
  doc.circle(x + s * 0.35, y - s * 0.55, 0.4, 'F');
  doc.line(x + s * 0.6, y - s * 0.65, x + s * 1.0, y - s * 0.65);
  doc.line(x + s * 0.6, y - s * 0.4, x + s * 0.95, y - s * 0.4);
};

const drawLinkIcon = (doc: jsPDF, x: number, y: number, s = 2.8, color = C.goldIcon) => {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.35);
  doc.line(x, y - s * 0.5, x + s * 0.5, y - s * 0.9);
  doc.line(x + s * 0.3, y - s * 0.2, x + s * 0.8, y - s * 0.6);
  doc.line(x + s * 0.2, y - s * 0.7, x + s * 0.6, y - s * 0.3);
};

const drawGlobeIcon = (doc: jsPDF, x: number, y: number, s = 2.8, color = C.goldIcon) => {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  const r = s * 0.5;
  doc.circle(x + r, y - r, r, 'D');
  doc.line(x, y - r, x + s, y - r);
  doc.ellipse(x + r, y - r, r * 0.45, r, 'D');
};

const drawUserIcon = (doc: jsPDF, x: number, y: number, s = 2.8, color = C.goldIcon) => {
  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(0.3);
  doc.circle(x + s * 0.5, y - s * 0.7, s * 0.25, 'FD');
  doc.lines([[s * 0.4, s * 0.35], [-s * 0.8, 0]], x + s * 0.1, y - s * 0.35, [1, 1], 'F');
};

const drawMailIcon = (doc: jsPDF, x: number, y: number, s = 2.8, color = C.goldIcon) => {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y - s * 0.9, s * 1.2, s * 0.8, 0.3, 0.3, 'D');
  doc.line(x, y - s * 0.9, x + s * 0.6, y - s * 0.35);
  doc.line(x + s * 1.2, y - s * 0.9, x + s * 0.6, y - s * 0.35);
};

const drawPhoneIcon = (doc: jsPDF, x: number, y: number, s = 2.8, color = C.goldIcon) => {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.35);
  doc.line(x + 0.2, y - s * 0.8, x + s * 0.4, y - s * 0.9);
  doc.line(x + 0.2, y - s * 0.8, x + 0.1, y - s * 0.3);
  doc.line(x + 0.1, y - s * 0.3, x + s * 0.6, y - 0.2);
  doc.line(x + s * 0.6, y - 0.2, x + s * 0.8, y - s * 0.4);
};

const drawNoteIcon = (doc: jsPDF, x: number, y: number, s = 2.8, color = C.goldIcon) => {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y - s, s * 0.9, s * 1.1, 0.3, 0.3, 'D');
  doc.line(x + 0.5, y - s * 0.65, x + s * 0.7, y - s * 0.65);
  doc.line(x + 0.5, y - s * 0.4, x + s * 0.7, y - s * 0.4);
  doc.line(x + 0.5, y - s * 0.15, x + s * 0.55, y - s * 0.15);
};

const drawMoonIcon = (doc: jsPDF, x: number, y: number, s = 2.8, color = C.goldIcon) => {
  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(0.3);
  const r = s * 0.45;
  doc.circle(x + r, y - r, r, 'F');
  doc.setFillColor(255, 255, 255);
  doc.circle(x + r * 1.35, y - r * 1.1, r * 0.8, 'F');
};

const drawBuildingIcon = (doc: jsPDF, x: number, y: number, s = 2.8, color = C.goldIcon) => {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  doc.rect(x, y - s, s * 0.8, s, 'D');
  doc.setFillColor(...color);
  doc.rect(x + 0.4, y - s * 0.75, 0.4, 0.4, 'F');
  doc.rect(x + 1.2, y - s * 0.75, 0.4, 0.4, 'F');
  doc.rect(x + 0.4, y - s * 0.4, 0.4, 0.4, 'F');
  doc.rect(x + 1.2, y - s * 0.4, 0.4, 0.4, 'F');
};

const drawCreditCardIcon = (doc: jsPDF, x: number, y: number, s = 2.8, color = C.goldIcon) => {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y - s * 0.8, s * 1.2, s * 0.8, 0.3, 0.3, 'D');
  doc.line(x, y - s * 0.5, x + s * 1.2, y - s * 0.5);
};

const drawPinIcon = (doc: jsPDF, x: number, y: number, s = 2.8, color = C.goldIcon) => {
  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(0.3);
  const r = s * 0.35;
  doc.circle(x + r, y - s * 0.65, r, 'FD');
  doc.lines([[r * 0.8, s * 0.45], [-r * 1.6, 0]], x + r * 0.2, y - s * 0.4, [1, 1], 'F');
  doc.setFillColor(255, 255, 255);
  doc.circle(x + r, y - s * 0.65, r * 0.35, 'F');
};

const drawBellIcon = (doc: jsPDF, x: number, y: number, s = 2.8, color: [number, number, number] = [255, 255, 255]) => {
  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(0.25);
  doc.circle(x + s * 0.5, y - s * 0.6, s * 0.35, 'FD');
  doc.rect(x + s * 0.15, y - s * 0.35, s * 0.7, 0.5, 'F');
  doc.circle(x + s * 0.5, y - 0.1, 0.35, 'F');
};

const drawCheckCircle = (doc: jsPDF, x: number, y: number, r = 1.6) => {
  doc.setDrawColor(...C.gold);
  doc.setLineWidth(0.35);
  doc.circle(x, y, r, 'D');
  doc.line(x - r * 0.5, y, x - r * 0.1, y + r * 0.4);
  doc.line(x - r * 0.1, y + r * 0.4, x + r * 0.6, y - r * 0.4);
};

const drawClockIcon = (doc: jsPDF, cx: number, cy: number, r = 4.8, color = C.gold) => {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.65);
  doc.circle(cx, cy, r, 'D');
  doc.line(cx, cy, cx, cy - r * 0.62);
  doc.line(cx, cy, cx + r * 0.42, cy - r * 0.15);
  doc.setFillColor(...color);
  doc.circle(cx, cy, 0.55, 'F');
};

const drawScrollFlourish = (doc: jsPDF, x: number, y: number, width = 36, color = C.gold) => {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.45);
  const halfW = width / 2;
  doc.line(x - halfW, y, x - 4, y);
  doc.line(x + 4, y, x + halfW, y);
  doc.setFillColor(...color);
  doc.circle(x, y, 0.85, 'F');
  doc.circle(x - 2.5, y, 0.45, 'F');
  doc.circle(x + 2.5, y, 0.45, 'F');
};

const drawHotelMantriLogo = (doc: jsPDF, x: number, y: number, size = 4) => {
  const blue: [number, number, number] = [14, 116, 224];
  doc.setDrawColor(...blue);
  doc.setLineWidth(0.5);
  doc.line(x, y, x, y - size);
  doc.line(x, y - size, x + size * 0.5, y - size * 0.4);
  doc.line(x + size * 0.5, y - size * 0.4, x + size, y - size);
  doc.line(x + size, y - size, x + size, y);

  doc.setFillColor(...blue);
  doc.circle(x + size * 0.5, y - size * 0.85, 0.55, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(10, 46, 76);
  doc.text('HotelMantri', x + size + 2, y - 0.5);
};

export interface ReservationPdfOptions {
  reservation: Reservation;
  multiRooms?: Reservation[];
  settings?: HotelSettings | null;
  hotelName?: string;
  hotelAddress?: string;
  hotelPhone?: string;
  hotelEmail?: string;
  gstin?: string;
  logoDataUrl?: string;
  checkInTime?: string;
  checkOutTime?: string;
  cancellationPolicy?: string;
  importantNotes?: string;
  version?: number;
  documentType?: 'RESERVATION_CONFIRMATION' | 'RESERVATION_MODIFICATION' | 'RESERVATION_CANCELLATION';
}

export function buildReservationConfirmationPdf(options: ReservationPdfOptions): jsPDF {
  const {
    reservation,
    multiRooms: rawMultiRooms = [],
    settings = null,
    version = 1,
  } = options;

  const isPhysical = (rm?: string | null) => {
    const norm = (rm || '').trim().toLowerCase();
    return Boolean(norm && norm !== 'unassigned' && norm !== 'tbd');
  };
  const multiRooms = rawMultiRooms.filter((rm, idx, arr) => {
    if (isPhysical(rm.room_no)) {
      return arr.findIndex(x => (x.room_no || '').trim().toLowerCase() === (rm.room_no || '').trim().toLowerCase()) === idx;
    }
    return arr.findIndex(x => x.id === rm.id) === idx;
  });

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();   // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const leftM = 14;
  const rightM = 14;
  const contentW = pageWidth - leftM - rightM; // 182mm
  const rightX = pageWidth - rightM; // 196mm

  // ── 1. Dynamic Hotel Branding ───────────────────────────────────────────────
  const hotelName = options.hotelName || settings?.hotel_name || 'Hotel Property';
  const hotelCity = settings?.city || '';
  const hotelState = settings?.state_name || '';
  const hotelLocation = [hotelCity, hotelState].filter(Boolean).join(', ') || hotelCity;
  const hotelAddress = options.hotelAddress || [
    settings?.address,
    settings?.city,
    settings?.state_name,
    settings?.pin_code,
  ].filter(Boolean).join(', ');
  const hotelPhone = options.hotelPhone || settings?.phone || settings?.whatsapp_number || '';
  const hotelEmail = options.hotelEmail || settings?.email || '';
  const gstin = options.gstin || settings?.gst_number || '';

  const checkInTime = options.checkInTime || settings?.check_in_time || '12:00 Hrs';
  const checkOutTime = options.checkOutTime || settings?.check_out_time || '10:00 Hrs';
  const cancellationPolicy = options.cancellationPolicy || settings?.cancellation_policy ||
    'Cancellation requests must be received 24 hours prior to check-in for a full refund. Cancellations made within 24 hours are subject to standard retention charges.';

  // ── 2. Resolve Reservation Details ─────────────────────────────────────────
  const checkIn = String(reservation.check_in_date || '').slice(0, 10);
  const checkOut = String(reservation.check_out_date || '').slice(0, 10);
  const nights = calculateNights(checkIn, checkOut);

  const rawNote = `${reservation.internal_note || ''} ${reservation.remarks || ''}`;
  const otaMatch = rawNote.match(/\[OTA_BOOKING_ID:\s*([^\]]+)\]/i) || rawNote.match(/\[AIOSELL_BOOKING_ID:\s*([^\]]+)\]/i);
  const otaBookingId = otaMatch && otaMatch[1] ? otaMatch[1].trim() : '';

  const shortId = (reservation.id || '').slice(0, 8).toUpperCase();
  const confirmationNumber = otaBookingId || `HM-RES-${shortId}`;
  const bookingDate = fmtDateReadable(reservation.created_at || new Date().toISOString());

  let bookingSource = reservation.source_name || reservation.source_category || (otaBookingId ? 'Online Travel Agent' : 'Direct');
  let sourceType = 'By Phone';

  const catStr = String(reservation.source_category || '').toLowerCase();
  const nameStr = String(reservation.source_name || '').toLowerCase();

  if (otaBookingId || catStr.includes('ota') || String(reservation.guest_type || '').toUpperCase() === 'OTA') {
    sourceType = 'OTA Channel';
    if (!reservation.source_name || reservation.source_name === 'OTA') bookingSource = 'Online Travel Agent';
  } else if (catStr.includes('walk') || nameStr.includes('walk')) {
    sourceType = 'Walk-in';
    bookingSource = 'Direct';
  } else if (catStr.includes('agent') || nameStr.includes('agent')) {
    sourceType = 'Agent Booking';
  } else if (catStr.includes('direct') || catStr.includes('phone') || nameStr.includes('phone')) {
    sourceType = 'By Phone';
    bookingSource = 'Direct';
  }

  // Financial values
  const rateVal = Number(reservation.rate) || 0;
  const totalVal = Number(reservation.invoice_total) || (rateVal * nights);
  const advanceVal = Number(reservation.advance_paid) || 0;
  const dueVal = Math.max(0, totalVal - advanceVal);

  const guestName = reservation.guest_name || 'Valued Guest';
  const guestEmail = reservation.guest_email || '—';
  const guestPhone = reservation.guest_phone || '—';
  const specialRequests = reservation.remarks || (reservation as any).special_requests || '—';

  // ═════════════════════════════════════════════════════════════════════════════
  // 1. TOP HEADER (Deep Navy Curved Crest on Left, Title & Details on Right)
  // ═════════════════════════════════════════════════════════════════════════════

  doc.setFillColor(...C.navyDark);
  doc.lines(
    [
      [118, 0],
      [-14, 15],
      [-26, 17],
      [-34, 11],
      [-44, 5],
      [0, -48],
    ],
    0, 0, [1, 1], 'F', true
  );

  doc.setDrawColor(...C.gold);
  doc.setLineWidth(1.1);
  doc.lines(
    [
      [-14, 15],
      [-26, 17],
      [-34, 11],
      [-44, 5],
    ],
    118, 0, [1, 1], 'D'
  );

  let logoDrawn = false;
  const logoUrl = options.logoDataUrl || settings?.logo_url;
  if (logoUrl) {
    try {
      doc.addImage(logoUrl, 'PNG', 8, 4, 46, 36, undefined, 'FAST');
      logoDrawn = true;
    } catch {
      // Fallback to text
    }
  }

  if (!logoDrawn) {
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(hotelName, 12, 18);

    if (hotelCity) {
      doc.setTextColor(...C.gold);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(`— ${hotelCity.toUpperCase()} —`, 12, 25);
    }

    if (hotelPhone) {
      doc.setTextColor(220, 235, 250);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(`Tel: ${hotelPhone}`, 12, 31);
    }
  }

  doc.setTextColor(...C.navyDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Booking Confirmation', rightX, 13.5, { align: 'right' });

  drawScrollFlourish(doc, rightX - 26, 16.5, 42, C.gold);

  const metaBoxW = 76;
  const metaBoxX = rightX - metaBoxW;
  const metaBoxY = 20;
  const metaBoxH = 22;

  doc.setDrawColor(...C.goldBorder);
  doc.setLineWidth(0.5);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(metaBoxX, metaBoxY, metaBoxW, metaBoxH, 2, 2, 'FD');

  const metaItems = [
    { label: 'Booking Date', val: bookingDate, icon: drawCalendarIcon },
    { label: 'Booking ID', val: confirmationNumber, icon: drawIdBadgeIcon },
    { label: 'Booking Source', val: bookingSource, icon: drawLinkIcon },
    { label: 'Source Type', val: sourceType, icon: drawGlobeIcon },
  ];

  let mY = metaBoxY + 4.5;
  metaItems.forEach(item => {
    item.icon(doc, metaBoxX + 3.5, mY - 0.2, 2.5, C.goldIcon);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textMuted);
    doc.text(item.label, metaBoxX + 8, mY);
    doc.text(':', metaBoxX + 33, mY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.textMain);
    doc.text(String(item.val || '—').slice(0, 22), metaBoxX + 36, mY);
    mY += 4.5;
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 2. GREETING BANNER & ORNAMENTAL DIVIDER
  // ═════════════════════════════════════════════════════════════════════════════
  const greetY = 48;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...C.navyDark);
  doc.text(`Dear ${guestName},`, leftM, greetY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.textMain);
  doc.text(`Thank you for choosing ${hotelName}${hotelLocation ? `, ${hotelLocation}` : ''}.`, leftM, greetY + 5);

  doc.setFontSize(8);
  doc.setTextColor(...C.textMuted);
  doc.text('We are delighted to confirm your booking. Our team looks forward to welcoming you and ensuring you have a comfortable and memorable stay with us.', leftM, greetY + 9.5);

  const divY = greetY + 15;
  doc.setDrawColor(...C.goldBorder);
  doc.setLineWidth(0.4);
  doc.line(leftM, divY, rightX, divY);
  drawScrollFlourish(doc, pageWidth / 2, divY, 40, C.gold);

  // ═════════════════════════════════════════════════════════════════════════════
  // 3. TWO CARDS: GUEST DETAILS & BOOKING DETAILS (Side-by-Side)
  // ═════════════════════════════════════════════════════════════════════════════
  const cardsY = divY + 4;
  const cardW = 88;
  const cardH = 37;

  // Card 1 (Left): GUEST DETAILS
  doc.setDrawColor(...C.cardBorder);
  doc.setLineWidth(0.4);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(leftM, cardsY, cardW, cardH, 2, 2, 'FD');

  doc.setFillColor(...C.navyDark);
  doc.roundedRect(leftM, cardsY, cardW, 6.5, 2, 2, 'F');
  doc.rect(leftM, cardsY + 3.5, cardW, 3, 'F');

  doc.setFillColor(255, 255, 255);
  doc.circle(leftM + 6.5, cardsY + 3.25, 2.0, 'F');
  drawUserIcon(doc, leftM + 5.2, cardsY + 4.5, 2.2, C.navyDark);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('GUEST DETAILS', leftM + cardW / 2 + 2, cardsY + 4.5, { align: 'center' });

  const guestRows = [
    { label: 'Guest Name', val: guestName, isBlue: false, icon: drawUserIcon },
    { label: 'Email', val: guestEmail, isBlue: guestEmail !== '—', icon: drawMailIcon },
    { label: 'Mobile', val: guestPhone, isBlue: false, icon: drawPhoneIcon },
    { label: 'Special Note', val: specialRequests, isBlue: false, icon: drawNoteIcon },
  ];

  let gY = cardsY + 12;
  guestRows.forEach(row => {
    row.icon(doc, leftM + 4, gY - 0.2, 2.6, C.goldIcon);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...C.textMuted);
    doc.text(row.label, leftM + 8.5, gY);
    doc.text(':', leftM + 28, gY);

    doc.setFont('helvetica', row.label === 'Guest Name' ? 'bold' : 'normal');
    doc.setTextColor(...(row.isBlue ? C.blueLink : C.textMain));
    doc.text(String(row.val || '—').slice(0, 30), leftM + 31, gY);
    gY += 6.2;
  });

  // Card 2 (Right): BOOKING DETAILS
  const card2X = rightX - cardW;
  doc.setDrawColor(...C.cardBorder);
  doc.setLineWidth(0.4);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(card2X, cardsY, cardW, cardH, 2, 2, 'FD');

  doc.setFillColor(...C.navyDark);
  doc.roundedRect(card2X, cardsY, cardW, 6.5, 2, 2, 'F');
  doc.rect(card2X, cardsY + 3.5, cardW, 3, 'F');

  doc.setFillColor(255, 255, 255);
  doc.circle(card2X + 6.5, cardsY + 3.25, 2.0, 'F');
  drawCalendarIcon(doc, card2X + 5.2, cardsY + 4.5, 2.2, C.navyDark);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('BOOKING DETAILS', card2X + cardW / 2 + 2, cardsY + 4.5, { align: 'center' });

  const roomsCount = multiRooms.length > 0 ? multiRooms.length : ((reservation as any).rooms_count || 1);
  const paymentMode = reservation.payment_mode || (advanceVal > 0 ? 'Advance Received' : 'Pay at Hotel');
  const createdBy = (reservation as any).created_by || 'Front Desk';

  const bookingRows = [
    { label: 'Check In Date', val: fmtDateReadable(checkIn), icon: drawCalendarIcon },
    { label: 'Check Out Date', val: fmtDateReadable(checkOut), icon: drawCalendarIcon },
    { label: 'Number of Nights', val: `${nights}`, icon: drawMoonIcon },
    { label: 'Number of Rooms', val: `${roomsCount}`, icon: drawBuildingIcon },
    { label: 'Total Amount', val: fmtRs(totalVal), icon: (d: jsPDF, x: number, y: number, s: number, c: [number, number, number]) => drawRupee(d, x, y, 2.8, c) },
    { label: 'Payment Reference', val: paymentMode, icon: drawCreditCardIcon },
    { label: 'Created By', val: createdBy, icon: drawUserIcon },
  ];

  let bY = cardsY + 10.5;
  bookingRows.forEach(row => {
    row.icon(doc, card2X + 4, bY - 0.2, 2.5, C.goldIcon);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textMuted);
    doc.text(row.label, card2X + 8, bY);
    doc.text(':', card2X + 34, bY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.textMain);
    doc.text(String(row.val || '—').slice(0, 24), card2X + 37, bY);
    bY += 3.8;
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 4. BOOKING SUMMARY TABLE & FINANCIAL BREAKDOWN
  // ═════════════════════════════════════════════════════════════════════════════
  const tableBannerY = cardsY + cardH + 5;

  doc.setFillColor(...C.navyDark);
  doc.roundedRect(leftM, tableBannerY, contentW, 5.5, 1.5, 1.5, 'F');

  drawScrollFlourish(doc, leftM + 30, tableBannerY + 2.75, 20, C.gold);
  drawScrollFlourish(doc, rightX - 30, tableBannerY + 2.75, 20, C.gold);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('BOOKING SUMMARY', pageWidth / 2, tableBannerY + 3.8, { align: 'center' });

  const tableRows: string[][] = [];

  if (multiRooms && multiRooms.length > 0) {
    multiRooms.forEach((rm, i) => {
      const catName = (rm as any).room_category || (rm.rate_plan && rm.rate_plan !== 'Base' ? rm.rate_plan : 'Deluxe AC Room');
      const assigned = rm.room_no && rm.room_no.toLowerCase() !== 'unassigned' ? ` (Room ${rm.room_no})` : '';
      const unitRate = Number(rm.rate) || Math.round(Number(rm.invoice_total || 0) / nights);
      const totalRm = Number(rm.invoice_total) || (unitRate * nights);

      tableRows.push([
        String(i + 1),
        `${catName}${assigned}`,
        `${rm.adults || 2} + 0`,
        `${rm.children || 0} + 0`,
        formatMealPlan(rm.meal_plan || reservation.meal_plan),
        Math.round(unitRate).toLocaleString('en-IN'),
        Math.round(totalRm).toLocaleString('en-IN'),
      ]);
    });
  } else {
    const rawCat = (reservation as any).room_category;
    const catName = rawCat && rawCat !== 'Base' ? rawCat : (reservation.rate_plan && reservation.rate_plan !== 'Base' && !reservation.rate_plan.toLowerCase().includes('walk') ? reservation.rate_plan : 'Deluxe AC Room');
    const assigned = reservation.room_no && reservation.room_no.toLowerCase() !== 'unassigned' ? ` (Room ${reservation.room_no})` : '';
    const unitRate = rateVal > 0 ? rateVal : Math.round(totalVal / nights);
    const subtotal = rateVal > 0 ? (rateVal * nights) : totalVal;

    tableRows.push([
      '1',
      `${catName}${assigned}`,
      `${reservation.adults || 2} + 0`,
      `${reservation.children || 0} + 0`,
      formatMealPlan(reservation.meal_plan),
      Math.round(unitRate).toLocaleString('en-IN'),
      Math.round(subtotal).toLocaleString('en-IN'),
    ]);
  }

  autoTable(doc, {
    startY: tableBannerY + 6.5,
    head: [['SR NO.', 'ROOM CATEGORY', 'ADULTS+BED', 'CHILD+INFANT', 'MEAL PLAN', 'UNIT RATE (Rs.)', 'TOTAL (Rs.)']],
    body: tableRows,
    margin: { left: leftM, right: rightM },
    theme: 'grid',
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: C.navyDark,
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'center',
      cellPadding: 2.2,
      lineColor: [200, 210, 225],
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 14 },
      1: { halign: 'left', cellWidth: 50 },
      2: { halign: 'center', cellWidth: 26 },
      3: { halign: 'center', cellWidth: 24 },
      4: { halign: 'center', cellWidth: 28 },
      5: { halign: 'right', cellWidth: 20 },
      6: { halign: 'right', cellWidth: 20 },
    },
    bodyStyles: {
      fontSize: 8,
      textColor: C.textMain,
      cellPadding: 2.5,
      lineColor: [225, 232, 240],
      lineWidth: 0.25,
    },
    alternateRowStyles: {
      fillColor: [252, 253, 255],
    },
  });

  const tableEndY = (doc as any).lastAutoTable.finalY;

  let sumY = tableEndY + 4.5;
  const sumItems = [
    { label: 'GRAND TOTAL', val: fmtRs(totalVal), color: C.navyDark },
    { label: 'PAID AMOUNT', val: fmtRs(advanceVal), color: C.emeraldText },
    { label: 'DUE AMOUNT (PAY LATER)', val: fmtRs(dueVal), color: dueVal > 0 ? C.roseText : C.emeraldText },
  ];

  sumItems.forEach(item => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...item.color);
    doc.text(item.label, rightX - 35, sumY, { align: 'right' });
    doc.text(':', rightX - 32, sumY);
    doc.setFontSize(9);
    doc.text(item.val, rightX, sumY, { align: 'right' });
    sumY += 5;
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 5. BOTTOM 3-PANEL SECTION (Important Notes, Hotel Contact, Check-in Clock)
  // ═════════════════════════════════════════════════════════════════════════════
  const bottomY = Math.max(sumY + 3, 170);
  const bottomH = 52;

  // Column 1 (Left): IMPORTANT NOTES (Width: 61mm)
  const col1W = 61;
  doc.setDrawColor(...C.cardBorder);
  doc.setLineWidth(0.4);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(leftM, bottomY, col1W, bottomH, 2, 2, 'FD');

  doc.setFillColor(...C.navyDark);
  doc.roundedRect(leftM, bottomY, col1W, 5.5, 2, 2, 'F');
  doc.rect(leftM, bottomY + 3, col1W, 2.5, 'F');

  drawBellIcon(doc, leftM + 3.5, bottomY + 4.2, 2.2, [255, 255, 255]);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('IMPORTANT NOTES', leftM + col1W / 2 + 2, bottomY + 3.8, { align: 'center' });

  let nY = bottomY + 9;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...C.textMain);

  const notesList = [
    `You have made a ${bookingSource.toLowerCase()} booking with us.`,
    'Room will be held until check-in time on arrival date.',
    'Please carry a valid photo identity proof at check-in.',
    'Computer-generated confirmation; requires no signature.',
  ];

  notesList.forEach(note => {
    drawCheckCircle(doc, leftM + 4, nY - 0.8, 1.4);
    doc.setTextColor(...C.textMain);
    doc.setFont('helvetica', 'normal');
    const wrappedNote = doc.splitTextToSize(note, col1W - 9);
    doc.text(wrappedNote, leftM + 7, nY);
    nY += (wrappedNote.length * 3.4) + 1;
  });

  if (nY < bottomY + bottomH - 10) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.navyDark);
    doc.text(`CANCELLATION POLICY (${bookingSource.toUpperCase()}):`, leftM + 3, nY + 1);
    nY += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(...C.textMuted);
    const policyLines = doc.splitTextToSize(cancellationPolicy, col1W - 6);
    doc.text(policyLines.slice(0, 4), leftM + 3, nY);
  }

  // Column 2 (Center): HOTEL CONTACT & INFORMATION (Width: 67mm)
  const col2X = leftM + col1W + 4;
  const col2W = 67;
  doc.setDrawColor(...C.cardBorder);
  doc.setLineWidth(0.4);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(col2X, bottomY, col2W, bottomH, 2, 2, 'FD');

  doc.setFillColor(...C.navyDark);
  doc.roundedRect(col2X, bottomY, col2W, 5.5, 2, 2, 'F');
  doc.rect(col2X, bottomY + 3, col2W, 2.5, 'F');

  drawPinIcon(doc, col2X + 3.5, bottomY + 4.2, 2.2, [255, 255, 255]);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('HOTEL CONTACT & INFORMATION', col2X + col2W / 2 + 2, bottomY + 3.8, { align: 'center' });

  let cY = bottomY + 9;
  drawPinIcon(doc, col2X + 3.5, cY - 0.2, 2.5, C.goldIcon);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C.navyDark);
  doc.text(`${hotelName}${hotelCity ? `, ${hotelCity}` : ''}`, col2X + 7.5, cY);
  cY += 4.2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...C.textMuted);
  if (hotelAddress) {
    drawPinIcon(doc, col2X + 3.5, cY - 0.2, 2.5, C.goldIcon);
    const addrLines = doc.splitTextToSize(hotelAddress, col2W - 10);
    doc.text(addrLines.slice(0, 2), col2X + 7.5, cY);
    cY += (Math.min(addrLines.length, 2) * 3.4) + 1.5;
  }

  const contactList = [
    { label: 'Mobile', val: hotelPhone, icon: drawPhoneIcon },
    { label: 'Landline', val: hotelPhone, icon: drawPhoneIcon },
    { label: 'Email', val: hotelEmail, isBlue: true, icon: drawMailIcon },
    { label: 'Website', val: settings?.website || '', icon: drawGlobeIcon },
    { label: 'GST Number', val: gstin, icon: drawIdBadgeIcon },
  ].filter(c => Boolean(c.val));

  contactList.forEach(c => {
    c.icon(doc, col2X + 3.5, cY - 0.2, 2.4, C.goldIcon);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...C.textMuted);
    doc.text(c.label, col2X + 7.5, cY);
    doc.text(':', col2X + 24, cY);

    doc.setTextColor(...(c.isBlue ? C.blueLink : C.textMain));
    doc.text(String(c.val).slice(0, 26), col2X + 26, cY);
    cY += 4.2;
  });

  // Column 3 (Right): CHECK-IN / CHECK-OUT TIME PANEL (Width: 46mm)
  const col3X = rightX - 46;
  const col3W = 46;

  doc.setFillColor(...C.navyDark);
  doc.roundedRect(col3X, bottomY, col3W, bottomH, 2.5, 2.5, 'F');
  doc.setDrawColor(...C.gold);
  doc.setLineWidth(0.8);
  doc.roundedRect(col3X, bottomY, col3W, bottomH, 2.5, 2.5, 'D');

  const col3CenterX = col3X + (col3W / 2);

  drawClockIcon(doc, col3CenterX, bottomY + 9, 4.8, C.gold);

  doc.setTextColor(...C.gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('CHECK-IN TIME', col3CenterX, bottomY + 17.5, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(checkInTime, col3CenterX, bottomY + 23.5, { align: 'center' });

  const clockDivY = bottomY + 27.5;
  drawScrollFlourish(doc, col3CenterX, clockDivY, 26, C.gold);

  doc.setTextColor(...C.gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('CHECK-OUT TIME', col3CenterX, bottomY + 34.5, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(checkOutTime, col3CenterX, bottomY + 40.5, { align: 'center' });

  // ═════════════════════════════════════════════════════════════════════════════
  // 6. FOOTER (Navy Wish Banner + Powered-By Branding)
  // ═════════════════════════════════════════════════════════════════════════════
  const footerBarY = pageHeight - 16;

  doc.setFillColor(...C.navyDark);
  doc.rect(leftM, footerBarY, contentW, 5.5, 'F');

  drawScrollFlourish(doc, leftM + 25, footerBarY + 2.75, 20, C.gold);
  drawScrollFlourish(doc, rightX - 25, footerBarY + 2.75, 20, C.gold);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.8);
  doc.text('Thank you for booking with us. We wish you a wonderful stay!', pageWidth / 2, footerBarY + 3.8, { align: 'center' });

  const hmLogoX = pageWidth / 2 - 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C.textMuted);
  doc.text('Powered by', hmLogoX - 16, pageHeight - 5.5);
  drawHotelMantriLogo(doc, hmLogoX, pageHeight - 5.2, 3.8);

  return doc;
}

export function previewReservationConfirmationPdf(options: ReservationPdfOptions): void {
  const doc = buildReservationConfirmationPdf(options);
  previewPDF(doc);
}

export function downloadReservationConfirmationPdf(options: ReservationPdfOptions): void {
  const doc = buildReservationConfirmationPdf(options);
  const shortId = (options.reservation.id || '').slice(0, 8).toUpperCase();
  const filename = `Hotel-Mantri-Reservation-Confirmation-HM-${shortId}-v${options.version || 1}.pdf`;
  downloadPDF(doc, filename);
}

export function printReservationConfirmationPdf(options: ReservationPdfOptions): void {
  const doc = buildReservationConfirmationPdf(options);
  doc.autoPrint();
  const blobUrl = doc.output('bloburl');

  // Dedicated isolated printing container / iframe:
  // Guarantees ONLY the reservation confirmation document is sent to the printer,
  // never the application shell, navigation, or modals (Section 10).
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = blobUrl as any;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      const printWin = window.open(blobUrl as any, '_blank');
      if (printWin) {
        printWin.focus();
      }
    }
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {}
      URL.revokeObjectURL(blobUrl as any);
    }, 60000);
  };
}

