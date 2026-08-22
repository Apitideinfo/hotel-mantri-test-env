/**
 * PDF engine for Hotel MIS.
 * Uses jsPDF + jspdf-autotable.
 * All hotel details come from HotelSettings — nothing is hardcoded.
 */

import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { HotelSettings, DerivedReport, RoomChartEntry, SourceCategory } from './types';
import type { ExpenseEntry, RevenueEntry } from './types-finance';
import {
  calcArr, calcOcc, calcTotalRevenue, calcTotalExpenses, calcClosingRooms,
  aggregateDerived, aggregateRoomChart, buildCompanyLedger, buildCashFlow,
  fmtMoney, toNum,
} from './calc';

// ── Colour palette ─────────────────────────────────────────────────────────
const C = {
  headerBg:    [13, 71, 109]  as [number, number, number], // deep navy
  headerText:  [255, 255, 255] as [number, number, number],
  sectionBg:   [32, 101, 149] as [number, number, number], // section heading blue
  sectionText: [255, 255, 255] as [number, number, number],
  altRow:      [240, 247, 253] as [number, number, number],
  footBg:      [230, 242, 250] as [number, number, number],
  footText:    [13, 71, 109]  as [number, number, number],
  border:      [189, 215, 235] as [number, number, number],
  text:        [30, 30, 30]   as [number, number, number],
  muted:       [100, 100, 100] as [number, number, number],
  accent:      [215, 38, 38]  as [number, number, number], // red accent for totals
};

// ── Currency helper ────────────────────────────────────────────────────────
// jsPDF's built-in Helvetica font does not contain the Rupee glyph (U+20B9).
// It silently substitutes character 0x20B9 in the Latin encoding, which prints
// as "1". Using "Rs." is the correct approach for PDF output with standard fonts.
const rs = (n: number): string => `Rs.${fmtMoney(n)}`;

// ── Helpers ─────────────────────────────────────────────────────────────────
const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const slugify = (s: string) => s.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');

const now = () => {
  const d = new Date();
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
       + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

// ── Shared page header ───────────────────────────────────────────────────────
async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function drawPageHeader(
  doc: jsPDF,
  settings: HotelSettings,
  reportTitle: string,
  reportSubtitle: string,
  landscape: boolean,
) {
  const pw = landscape ? 297 : 210;
  const lm = 14;
  const LOGO_SIZE = 18; // mm square in header
  const logoX = lm;
  const textX = settings.logo_url ? lm + LOGO_SIZE + 3 : lm;

  // Navy header band
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, pw, 30, 'F');

  // Logo (if configured)
  if (settings.logo_url) {
    try {
      const dataUrl = await loadImageDataUrl(settings.logo_url);
      if (dataUrl) {
        doc.addImage(dataUrl, logoX, 6, LOGO_SIZE, LOGO_SIZE);
      }
    } catch {
      // Logo load failed — continue without it
    }
  }

  // Hotel name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...C.headerText);
  doc.text(settings.hotel_name || 'Hotel', textX, 12);

  // Address line
  const addrParts: string[] = [];
  if (settings.address) addrParts.push(settings.address);
  if (settings.city) addrParts.push(settings.city);
  if (settings.state_name) addrParts.push(settings.state_name);
  if (settings.pin_code) addrParts.push(settings.pin_code);
  const addrLine = addrParts.join(', ');

  // Contact line — GSTIN, Phone, Email (never blank)
  const contactParts: string[] = [];
  if (settings.gst_number) contactParts.push(`GSTIN: ${settings.gst_number}`);
  if (settings.phone) contactParts.push(`Ph: ${settings.phone}`);
  if (settings.email) contactParts.push(settings.email);
  if (settings.website) contactParts.push(settings.website);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C.headerText);
  if (addrLine) doc.text(addrLine, textX, 18.5);
  const contactLine = contactParts.join('  |  ') || '—';
  doc.text(contactLine, textX, addrLine ? 23 : 18.5);

  // Report title (right-aligned)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.headerText);
  doc.text(reportTitle, pw - lm, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(reportSubtitle, pw - lm, 18.5, { align: 'right' });

  // Accent line
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.4);
  doc.line(0, 30, pw, 30);

  // Reset text color to dark so subsequent content doesn't inherit white
  doc.setTextColor(...C.text);
  doc.setFont('helvetica', 'normal');
}

// ── Shared page footer ───────────────────────────────────────────────────────
function addPageFooters(doc: jsPDF, _landscape?: boolean) {
  const totalPages = (doc as jsPDF & { internal: { getNumberOfPages: () => number } })
    .internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pw = (doc as any).getPageWidth ? (doc as any).getPageWidth() : doc.internal.pageSize.getWidth();
    const ph = (doc as any).getPageHeight ? (doc as any).getPageHeight() : doc.internal.pageSize.getHeight();
    doc.setFillColor(...C.footBg);
    doc.rect(0, ph - 10, pw, 10, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.text(`Generated: ${now()}`, 14, ph - 3.5);
    doc.text(`Page ${i} of ${totalPages}`, pw - 14, ph - 3.5, { align: 'right' });
    doc.text('Generated by Hotel Mantri  |  Your Hotel\'s Digital Manager', pw / 2, ph - 3.5, { align: 'center' });
  }
}

// ── Section heading row helper ───────────────────────────────────────────────
function sectionHead(doc: jsPDF, text: string, y: number, landscape: boolean): number {
  const pw = landscape ? 297 : 210;
  doc.setFillColor(...C.sectionBg);
  doc.rect(14, y, pw - 28, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.sectionText);
  doc.text(text, 17, y + 4.8);
  doc.setTextColor(...C.text);
  return y + 10;
}

// ── KV table (label / value pairs, 2-col) ────────────────────────────────────
function kvTable(
  doc: jsPDF,
  rows: [string, string][],
  startY: number,
  landscape: boolean,
): number {
  const pw = landscape ? 297 : 210;
  autoTable(doc, {
    startY,
    margin: { left: 14, right: 14 },
    tableWidth: pw - 28,
    head: [],
    body: rows.map(([l, v]) => [l, v]),
    columnStyles: {
      0: { cellWidth: landscape ? 100 : 80, fontStyle: 'normal', textColor: C.muted, fontSize: 8.5 },
      1: { fontStyle: 'bold', textColor: C.text, fontSize: 8.5, halign: 'right' },
    },
    styles: { cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 }, lineColor: C.border, lineWidth: 0.2 },
    alternateRowStyles: { fillColor: C.altRow },
    theme: 'plain',
    didParseCell(data) {
      // Highlight Total/Closing rows
      if (typeof data.cell.raw === 'string' &&
          /^(Total|Cash Closing|Net Operating)/i.test(data.cell.raw as string)) {
        data.cell.styles.fillColor = C.footBg;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = C.footText;
      }
    },
  });
  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
}

// ────────────────────────────────────────────────────────────────────────────
// 1. DAILY MIS PDF
// ────────────────────────────────────────────────────────────────────────────
export interface DailyMISOpts {
  settings: HotelSettings;
  report: DerivedReport;
  mtdRevenue: number;
  mtdOccupancy: number;
}

export async function buildDailyMISPDF(opts: DailyMISOpts): Promise<jsPDF> {
  const { settings, report: r, mtdRevenue, mtdOccupancy } = opts;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const totalRooms = settings.total_rooms;
  const occupied = r.rooms_occupied - r.complimentary_room;
  const arr = calcArr(r.room_sale_amount, occupied);
  const occ = calcOcc(r.rooms_occupied, totalRooms);
  const totalRevenue = calcTotalRevenue(r);
  const totalExpenses = calcTotalExpenses(r);
  const closingRooms = calcClosingRooms(r.rooms_occupied, totalRooms);

  await drawPageHeader(doc, settings, 'Daily MIS Report', `Date: ${fmtDate(r.report_date)}`, false);

  let y = 36;

  const revpar = totalRooms > 0 ? toNum(r.room_sale_amount) / totalRooms : 0;
  const cashExpenses = toNum(r.housekeeping_supply) + toNum(r.other_expense) + toNum(r.maintenance_bill) + toNum(r.finance_expenses);
  const cashCollection = toNum(r.pay_cash);
  const openingCash = toNum(r.cash_closing) - cashCollection + cashExpenses + toNum(r.salary_advance) + toNum(r.cash_handover_md) + toNum(r.bank_cash_deposit);
  const tomorrowOpening = toNum(r.cash_closing);

  y = sectionHead(doc, 'Room Occupancy & Revenue Summary', y, false);
  y = kvTable(doc, [
    ['Total Rooms',               String(totalRooms)],
    ['Rooms Occupied',            String(r.rooms_occupied)],
    ['Complimentary Rooms',       String(r.complimentary_room)],
    ['Paying Rooms',              String(occupied)],
    ['ARR (Average Room Rate)',   rs(arr)],
    ['OCC %',                     `${occ.toFixed(1)} %`],
    ['RevPAR',                    rs(revpar)],
    ['Room Sale Amount',          rs(r.room_sale_amount)],
  ], y, false);

  y = sectionHead(doc, 'Room Revenue Details', y, false);
  y = kvTable(doc, [
    ['OTA',              rs(r.ota)],
    ['Direct / Walking', rs(r.direct_walking)],
    ['Corporate / Agent',rs(r.corporate_agent)],
    ['Phonebook',        rs(r.phonebook)],
  ], y, false);

  y = sectionHead(doc, 'Other Revenue', y, false);
  const otherRevRows: [string, string][] = [
    ['Kitchen',        rs(r.kitchen)],
    ['Other Revenue',  rs(r.other_income)],
  ];
  for (const c of r.other_revenue_by_category ?? []) {
    otherRevRows.push([c.category, rs(c.amount)]);
  }
  otherRevRows.push(['Total Revenue',  rs(totalRevenue)]);
  y = kvTable(doc, otherRevRows, y, false);

  y = sectionHead(doc, 'MTD Summary', y, false);
  y = kvTable(doc, [
    ['MTD Revenue',    rs(mtdRevenue)],
    ['MTD Occupancy',  `${Math.round(mtdOccupancy)} Rooms`],
  ], y, false);

  y = sectionHead(doc, 'Expenses Summary', y, false);
  const expRows: [string, string][] = [
    ['Housekeeping Supply',  rs(r.housekeeping_supply)],
    ['Maintenance Bill',     rs(r.maintenance_bill)],
    ['Other Expense',        rs(r.other_expense)],
  ];
  for (const c of r.finance_expense_by_category ?? []) {
    expRows.push([c.category, rs(c.amount)]);
  }
  expRows.push(['Total Expenses',       rs(totalExpenses)]);
  y = kvTable(doc, expRows, y, false);

  // New page if near bottom
  if (y > 220) { doc.addPage(); y = 34; }

  y = sectionHead(doc, 'Cash Summary', y, false);
  y = kvTable(doc, [
    ['Opening Cash',            rs(openingCash)],
    ['+ Cash Collection',       rs(cashCollection)],
    ['- Cash Expenses',         rs(cashExpenses)],
    ['- Salary Advance',        rs(r.salary_advance)],
    ['- Cash Handover MD Sir',  rs(r.cash_handover_md)],
    ['- Bank Cash Deposit',     rs(r.bank_cash_deposit)],
    ['= Cash Closing',          rs(toNum(r.cash_closing))],
    ['Tomorrow Opening Cash',   rs(tomorrowOpening)],
    ['Bank Collection',         rs(r.bank)],
  ], y, false);

  y = sectionHead(doc, 'Tomorrow Status', y, false);
  y = kvTable(doc, [
    ['Departure',       String(r.departure)],
    ['Expected Arrival',String(r.expected_arrival)],
    ['Closing Rooms',   String(closingRooms)],
    ['Expected ARR',    rs(r.expected_arr)],
  ], y, false);

  addPageFooters(doc, false);
  return doc;
}

// ────────────────────────────────────────────────────────────────────────────
// 2. ROOM CHART PDF  (A4 landscape)
// ────────────────────────────────────────────────────────────────────────────
export interface RoomChartPDFOpts {
  settings: HotelSettings;
  entries: RoomChartEntry[];
  date: string;
  expenses?: ExpenseEntry[];
  revenues?: RevenueEntry[];
  derivedReport?: DerivedReport;
}

export async function buildRoomChartPDF(opts: RoomChartPDFOpts): Promise<jsPDF> {
  const { settings, entries, date, expenses = [], revenues = [], derivedReport } = opts;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // ── PAGE 1 (LANDSCAPE): Room Chart + compact summary ────────────────────
  await drawPageHeader(doc, settings, 'Daily Room Chart', `Date: ${fmtDate(date)}`, true);

  const agg = aggregateRoomChart(entries);
  const occupied = agg.roomsOccupied + agg.complimentary;

  autoTable(doc, {
    startY: 36,
    margin: { left: 10, right: 10 },
    head: [[
      'Room No.', 'Category', 'Guest Name', 'Meal Plan', 'Arrival', 'Departure', 'Nights',
      'Room Rate', 'GST %', 'GST Amt', 'Final Amt', 'Source', 'Pay Mode',
    ]],
    body: entries.map((e) => {
      const amt = e.is_complimentary ? 0 : (toNum(e.total) > 0 ? toNum(e.total) : toNum(e.room_rate));
      const gstAmt = toNum(e.gst_amount);
      const finalAmt = toNum((e as RoomChartEntry & { invoice_total?: number }).invoice_total) || (amt + gstAmt);
      const gstType = (e as RoomChartEntry & { gst_type?: string }).gst_type;
      return [
        e.room_no || '—',
        e.room_category || 'Standard',
        e.guest_name || '—',
        (e.meal_plan ?? 'EP'),
        fmtDate(e.arrival),
        fmtDate(e.departure),
        String(e.nights),
        rs(e.room_rate),
        gstType === 'No Scope' ? 'No Scope' : (toNum(e.gst_slab) > 0 ? `${toNum(e.gst_slab)}%` : '—'),
        gstAmt > 0 ? rs(gstAmt) : '—',
        e.is_complimentary ? 'COMP' : rs(finalAmt),
        e.company || e.source_category,
        e.pay_mode,
      ];
    }),
    styles: { fontSize: 7, cellPadding: 2, lineColor: C.border, lineWidth: 0.2 },
    headStyles: { fillColor: C.headerBg, textColor: C.headerText, fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: C.altRow },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 20 },
      2: { cellWidth: 30 },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 16 },
      5: { cellWidth: 16 },
      6: { cellWidth: 10, halign: 'center' },
      7: { cellWidth: 18, halign: 'right' },
      8: { cellWidth: 12, halign: 'center' },
      9: { cellWidth: 18, halign: 'right' },
      10: { cellWidth: 20, halign: 'right' },
      11: { cellWidth: 28 },
      12: { cellWidth: 14, halign: 'center' },
    },
    theme: 'grid',
  });

  // Compact 4-item summary strip at the bottom of page 1
  const summaryY = Math.min(
    (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8,
    185,
  );
  const occPct = calcOcc(occupied, settings.total_rooms).toFixed(0);
  const arrVal = agg.roomsOccupied > 0 ? agg.roomRevenue / agg.roomsOccupied : 0;
  const stripItems: [string, string][] = [
    ['Occupied Rooms', `${occupied} / ${settings.total_rooms}`],
    ['Room Revenue', rs(agg.roomRevenue)],
    ['GST Collected', rs(agg.gstCollected)],
    ['ARR', rs(arrVal)],
    ['OCC %', `${occPct}%`],
  ];
  const stripW = (297 - 20) / 5;
  doc.setFillColor(...C.footBg);
  doc.setDrawColor(...C.footBg);
  doc.roundedRect(10, summaryY, 297 - 20, 14, 2, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.footText);
  stripItems.forEach(([label, value], i) => {
    const cx = 10 + stripW * i + stripW / 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(label, cx, summaryY + 5, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(value, cx, summaryY + 11.5, { align: 'center' });
  });
  doc.setTextColor(...C.text);

  // ── PAGE 2 (PORTRAIT): Expense Register + Revenue Register + Daily Summary
  doc.addPage('a4', 'portrait');
  await drawPageHeader(doc, settings, 'Daily Operations Register', `Date: ${fmtDate(date)}`, false);

  const expenseTotal = expenses.reduce((s, e) => s + toNum(e.amount), 0);
  const revenueTotal = revenues.reduce((s, r) => s + toNum(r.amount), 0);

  let py = 36;

  // ── Section 1: Daily Expense Register ───────────────────────────────────
  py = sectionHead(doc, 'Daily Expense Register', py, false);
  autoTable(doc, {
    startY: py,
    margin: { left: 14, right: 14 },
    head: [['Sr No', 'Category', 'Description', 'Payment Mode', 'Amount']],
    body: expenses.length > 0
      ? expenses.map((e, i) => [
          String(i + 1),
          e.category_name || '—',
          e.description || '—',
          e.payment_mode,
          rs(e.amount),
        ] as [string, string, string, string, string])
      : [['—', 'No expenses recorded', '—', '—', '—'] as [string, string, string, string, string]],
    foot: expenses.length > 0 ? [['', '', '', 'Total Expenses', rs(expenseTotal)]] : undefined,
    showFoot: 'lastPage',
    columnStyles: {
      0: { cellWidth: 16, halign: 'center' },
      1: { cellWidth: 42 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 34, halign: 'center' },
      4: { cellWidth: 34, halign: 'right' },
    },
    styles: { fontSize: 9, cellPadding: 3, lineColor: C.border, lineWidth: 0.2 },
    headStyles: { fillColor: C.sectionBg, textColor: C.sectionText, fontStyle: 'bold', fontSize: 9 },
    footStyles: { fillColor: C.footBg, textColor: C.footText, fontStyle: 'bold', fontSize: 10 },
    alternateRowStyles: { fillColor: C.altRow },
    theme: 'grid',
  });
  py = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── Section 2: Other Revenue Register ────────────────────────────────────
  py = sectionHead(doc, 'Other Revenue Register', py, false);
  autoTable(doc, {
    startY: py,
    margin: { left: 14, right: 14 },
    head: [['Sr No', 'Revenue Head', 'Description', 'Amount']],
    body: revenues.length > 0
      ? revenues.map((r, i) => [
          String(i + 1),
          r.revenue_head || '—',
          r.description || '—',
          rs(r.amount),
        ] as [string, string, string, string])
      : [['—', 'No other revenue recorded', '—', '—'] as [string, string, string, string]],
    foot: revenues.length > 0 ? [['', '', 'Total Other Revenue', rs(revenueTotal)]] : undefined,
    showFoot: 'lastPage',
    columnStyles: {
      0: { cellWidth: 16, halign: 'center' },
      1: { cellWidth: 42 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 34, halign: 'right' },
    },
    styles: { fontSize: 9, cellPadding: 3, lineColor: C.border, lineWidth: 0.2 },
    headStyles: { fillColor: C.sectionBg, textColor: C.sectionText, fontStyle: 'bold', fontSize: 9 },
    footStyles: { fillColor: C.footBg, textColor: C.footText, fontStyle: 'bold', fontSize: 10 },
    alternateRowStyles: { fillColor: C.altRow },
    theme: 'grid',
  });
  py = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── Section 3: Daily Summary ─────────────────────────────────────────────
  const roomRevenue = agg.roomRevenue;
  const otherRev = revenueTotal + (derivedReport ? toNum(derivedReport.kitchen) + toNum(derivedReport.other_income) : 0);
  const grossRevenue = roomRevenue + otherRev;
  const totalExp = expenseTotal + (derivedReport ? toNum(derivedReport.housekeeping_supply) + toNum(derivedReport.other_expense) + toNum(derivedReport.maintenance_bill) : 0);
  const netOp = grossRevenue - totalExp;

  py = sectionHead(doc, 'Daily Summary', py, false);
  const summaryRows: [string, string, boolean][] = [
    ['Room Revenue (Before GST)', rs(agg.taxableRevenue || roomRevenue), false],
    ['+ GST Collected', rs(agg.gstCollected), false],
    ['= Invoice Total (incl. GST)', rs((agg.taxableRevenue || roomRevenue) + agg.gstCollected), true],
    ['= Room Revenue (After GST)', rs((agg.taxableRevenue || roomRevenue) + agg.gstCollected), false],
    ['+ Other Revenue', rs(otherRev), false],
    ['= Gross Revenue', rs(grossRevenue + agg.gstCollected), true],
    ['- Total Expenses', rs(totalExp), false],
    ['= Net Operating Profit', rs(netOp + agg.gstCollected), true],
  ];
  if (derivedReport) {
    const dr = derivedReport;
    const drCashExp = toNum(dr.housekeeping_supply) + toNum(dr.other_expense) + toNum(dr.maintenance_bill) + toNum(dr.finance_expenses);
    const drCashCol = toNum(dr.pay_cash);
    const drOpenCash = toNum(dr.cash_closing) - drCashCol + drCashExp + toNum(dr.salary_advance) + toNum(dr.cash_handover_md) + toNum(dr.bank_cash_deposit);
    summaryRows.push(['Opening Cash', rs(drOpenCash), false]);
    summaryRows.push(['+ Cash Collection', rs(drCashCol), false]);
    summaryRows.push(['- Cash Expenses', rs(drCashExp), false]);
    summaryRows.push(['= Cash Closing', rs(toNum(dr.cash_closing)), true]);
    summaryRows.push(['Tomorrow Opening Cash', rs(toNum(dr.cash_closing)), true]);
  }
  autoTable(doc, {
    startY: py,
    margin: { left: 14, right: 14 },
    body: summaryRows.map(([label, val, bold]) => [label, val]),
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 62, halign: 'right' },
    },
    styles: { fontSize: 10, cellPadding: 4, lineColor: C.border, lineWidth: 0.1, textColor: C.text },
    theme: 'plain',
    didParseCell(d) {
      const row = summaryRows[d.row.index];
      if (row && row[2]) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = C.footBg;
        d.cell.styles.textColor = C.footText;
        d.cell.styles.fontSize = 11;
      }
    },
  });

  addPageFooters(doc, false);
  return doc;
}

// ────────────────────────────────────────────────────────────────────────────
// 3. MTD PDF  (A4 portrait)
// ────────────────────────────────────────────────────────────────────────────
export interface PeriodPDFOpts {
  settings: HotelSettings;
  reports: DerivedReport[];
  year: number;
  month?: number; // omit for YTD
}

export async function buildMTDPDF(opts: PeriodPDFOpts): Promise<jsPDF> {
  const { settings, reports, year, month } = opts;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const monthName = month ? MONTHS[month - 1] : '';
  const subtitle = `${monthName} ${year}`;
  const daysInMonth = month ? new Date(year, month, 0).getDate() : 365;

  await drawPageHeader(doc, settings, 'MTD Report', subtitle, false);

  const agg = aggregateDerived(reports, settings.total_rooms, daysInMonth);
  const totalExpenses = reports.reduce((s, r) => s + calcTotalExpenses(r), 0);
  const cashSum = reports.reduce(
    (acc, r) => ({
      cash: acc.cash + toNum(r.cash),
      bank: acc.bank + toNum(r.bank),
      salary_advance: acc.salary_advance + toNum(r.salary_advance),
      maintenance_bill: acc.maintenance_bill + toNum(r.maintenance_bill),
      cash_handover_md: acc.cash_handover_md + toNum(r.cash_handover_md),
      bank_cash_deposit: acc.bank_cash_deposit + toNum(r.bank_cash_deposit),
      cash_closing: toNum(r.cash_closing),
      housekeeping_supply: acc.housekeeping_supply + toNum(r.housekeeping_supply),
      other_expense: acc.other_expense + toNum(r.other_expense),
    }),
    { cash: 0, bank: 0, salary_advance: 0, maintenance_bill: 0, cash_handover_md: 0, bank_cash_deposit: 0, cash_closing: 0, housekeeping_supply: 0, other_expense: 0 },
  );
  const netOp = agg.totalRevenue - totalExpenses;

  let y = 36;

  y = sectionHead(doc, `Month to Date — ${subtitle}`, y, false);
  y = kvTable(doc, [
    ['Total Number of Rooms',     String(settings.total_rooms)],
    ['Rooms Sold (Paying)',        String(agg.roomsSold)],
    ['Complimentary Rooms',        String(agg.complimentary)],
    ['Total Room Nights',          String(agg.roomsSold + agg.complimentary)],
    ['ARR (Average Room Rate)',    rs(agg.arr)],
    ['OCC %',                      `${agg.occ.toFixed(1)} %`],
    ['RevPAR',                     rs(agg.revpar)],
  ], y, false);

  y = sectionHead(doc, 'Revenue Breakdown', y, false);
  const revRows: [string, string][] = [
    ['Room Revenue',          rs(agg.roomRevenue)],
    ['F&B Revenue (Kitchen)', rs(agg.fbRevenue)],
    ['Misc Revenue (Other)',  rs(agg.miscRevenue)],
  ];
  for (const c of agg.otherRevenueByCategory ?? []) {
    revRows.push([c.category, rs(c.amount)] as [string, string]);
  }
  revRows.push(['Total Revenue', rs(agg.totalRevenue)] as [string, string]);
  y = kvTable(doc, revRows, y, false);

  y = sectionHead(doc, 'Source Breakdown', y, false);
  y = kvTable(doc, [
    ['OTA Revenue',              rs(agg.ota)],
    ['Direct / Walking Revenue', rs(agg.direct)],
    ['Corporate / Agent Revenue',rs(agg.corp)],
    ['Phonebook Revenue',        rs(agg.phone)],
  ], y, false);

  y = sectionHead(doc, 'Expenses Summary', y, false);
  const expRows: [string, string][] = [
    ['Housekeeping Supply',  rs(cashSum.housekeeping_supply)],
    ['Maintenance Bill',     rs(cashSum.maintenance_bill)],
    ['Other Expense',        rs(cashSum.other_expense)],
  ];
  for (const c of agg.financeExpenseByCategory ?? []) {
    expRows.push([c.category, rs(c.amount)] as [string, string]);
  }
  expRows.push(['Total Expenses', rs(totalExpenses)] as [string, string]);
  y = kvTable(doc, expRows, y, false);

  // New page if near bottom
  if (y > 220) { doc.addPage(); y = 34; }

  const mtdCashCollection = reports.reduce((s, r) => s + toNum(r.pay_cash), 0);
  const mtdCashExpenses = reports.reduce((s, r) => s + toNum(r.housekeeping_supply) + toNum(r.other_expense) + toNum(r.maintenance_bill) + toNum(r.finance_expenses), 0);
  const mtdSalaryAdvance = reports.reduce((s, r) => s + toNum(r.salary_advance), 0);
  const mtdCashHandover = reports.reduce((s, r) => s + toNum(r.cash_handover_md), 0);
  const mtdBankDeposit = reports.reduce((s, r) => s + toNum(r.bank_cash_deposit), 0);

  y = sectionHead(doc, 'Cash Summary', y, false);
  y = kvTable(doc, [
    ['Cash Collection',         rs(mtdCashCollection)],
    ['Cash Expenses',          rs(mtdCashExpenses)],
    ['Salary Advance',         rs(mtdSalaryAdvance)],
    ['Cash Handover MD Sir',   rs(mtdCashHandover)],
    ['Bank Cash Deposit',      rs(mtdBankDeposit)],
    ['Cash Closing (Last Day)', rs(cashSum.cash_closing)],
    ['Bank Collection',        rs(cashSum.bank)],
  ], y, false);

  y = sectionHead(doc, 'Operating Result', y, false);
  y = kvTable(doc, [
    ['Total Revenue',         rs(agg.totalRevenue)],
    ['Total Expenses',        rs(totalExpenses)],
    ['Net Operating Result',  rs(netOp)],
  ], y, false);

  // Day-wise table
  if (reports.length > 0) {
    if (y > 200) { doc.addPage(); y = 34; }
    y = sectionHead(doc, 'Day-wise Summary', y, false);
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      head: [['Date', 'Rooms', 'OCC%', 'ARR', 'Room Rev', 'Other Rev', 'Total Rev', 'Cash', 'Bank', 'Expenses', 'Cash Closing']],
      body: reports.map((r) => {
        const occ = calcOcc(r.rooms_occupied, settings.total_rooms);
        const arr = calcArr(r.room_sale_amount, r.rooms_occupied - r.complimentary_room);
        const exp = calcTotalExpenses(r);
        return [
          fmtDate(r.report_date),
          String(r.rooms_occupied),
          `${occ.toFixed(0)}%`,
          rs(arr),
          rs(r.room_sale_amount),
          rs(r.kitchen + r.other_income),
          rs(calcTotalRevenue(r)),
          rs(r.cash),
          rs(r.bank),
          rs(exp),
          rs(r.cash_closing),
        ];
      }),
      foot: [[
        'TOTAL', String(agg.roomsSold + agg.complimentary), `${agg.occ.toFixed(0)}%`,
        rs(agg.arr),
        rs(agg.roomRevenue),
        rs(agg.fbRevenue + agg.miscRevenue),
        rs(agg.totalRevenue),
        rs(agg.cash),
        rs(agg.bank),
        rs(totalExpenses),
        '',
      ]],
      showFoot: 'lastPage',
      styles: { fontSize: 7, cellPadding: 2, lineColor: C.border, lineWidth: 0.2 },
      headStyles: { fillColor: C.headerBg, textColor: C.headerText, fontStyle: 'bold', fontSize: 7 },
      footStyles: { fillColor: C.footBg, textColor: C.footText, fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: C.altRow },
      theme: 'grid',
    });
  }

  addPageFooters(doc, false);
  return doc;
}

// ────────────────────────────────────────────────────────────────────────────
// 4. YTD PDF  (A4 portrait)
// ────────────────────────────────────────────────────────────────────────────
export async function buildYTDPDF(opts: PeriodPDFOpts): Promise<jsPDF> {
  const { settings, reports, year } = opts;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const periodLabel = reports.length > 0
    ? `01 Jan ${year} – ${fmtDate(reports[reports.length - 1].report_date)}`
    : `Jan–Dec ${year}`;

  await drawPageHeader(doc, settings, 'YTD Report', `Year: ${year}  |  Period: ${periodLabel}`, false);

  const agg = aggregateDerived(reports, settings.total_rooms, 365);
  const totalExpenses = reports.reduce((s, r) => s + calcTotalExpenses(r), 0);
  const netOp = agg.totalRevenue - totalExpenses;

  let y = 36;

  y = sectionHead(doc, `Year to Date — ${year}`, y, false);
  y = kvTable(doc, [
    ['Year',                      String(year)],
    ['Period',                     periodLabel],
    ['Total Number of Rooms',      String(settings.total_rooms)],
    ['Rooms Sold (Paying)',         String(agg.roomsSold)],
    ['Complimentary Rooms',         String(agg.complimentary)],
    ['Total Room Nights',           String(agg.roomsSold + agg.complimentary)],
    ['ARR (Average Room Rate)',     rs(agg.arr)],
    ['OCC %',                       `${agg.occ.toFixed(1)} %`],
    ['RevPAR',                      rs(agg.revpar)],
  ], y, false);

  y = sectionHead(doc, 'Revenue Breakdown', y, false);
  const ytdRevRows: [string, string][] = [
    ['Room Revenue',           rs(agg.roomRevenue)],
    ['F&B Revenue (Kitchen)',  rs(agg.fbRevenue)],
    ['Misc Revenue (Other)',   rs(agg.miscRevenue)],
  ];
  for (const c of agg.otherRevenueByCategory ?? []) {
    ytdRevRows.push([c.category, rs(c.amount)] as [string, string]);
  }
  ytdRevRows.push(['Total Revenue', rs(agg.totalRevenue)] as [string, string]);
  y = kvTable(doc, ytdRevRows, y, false);

  y = sectionHead(doc, 'Source Breakdown', y, false);
  y = kvTable(doc, [
    ['OTA Revenue',               rs(agg.ota)],
    ['Direct / Walking Revenue',  rs(agg.direct)],
    ['Corporate / Agent Revenue', rs(agg.corp)],
    ['Phonebook Revenue',         rs(agg.phone)],
  ], y, false);

  y = sectionHead(doc, 'Expenses Summary', y, false);
  const ytdExpRows: [string, string][] = [
    ['Housekeeping Supply',  rs(reports.reduce((s, r) => s + toNum(r.housekeeping_supply), 0))],
    ['Maintenance Bill',     rs(reports.reduce((s, r) => s + toNum(r.maintenance_bill), 0))],
    ['Other Expense',        rs(reports.reduce((s, r) => s + toNum(r.other_expense), 0))],
  ];
  for (const c of agg.financeExpenseByCategory ?? []) {
    ytdExpRows.push([c.category, rs(c.amount)] as [string, string]);
  }
  ytdExpRows.push(['Total Expenses', rs(totalExpenses)] as [string, string]);
  y = kvTable(doc, ytdExpRows, y, false);

  y = sectionHead(doc, 'Financial Summary', y, false);
  y = kvTable(doc, [
    ['Cash Collected',         rs(agg.cash)],
    ['Bank Collected',         rs(agg.bank)],
    ['Net Operating Result',   rs(netOp)],
  ], y, false);

  // Month-wise table
  if (reports.length > 0) {
    // Group by month
    const byMonth = new Map<string, DerivedReport[]>();
    for (const r of reports) {
      const key = r.report_date.slice(0, 7);
      const arr = byMonth.get(key) ?? [];
      arr.push(r);
      byMonth.set(key, arr);
    }
    if (y > 200) { doc.addPage(); y = 34; }
    y = sectionHead(doc, 'Month-wise Summary', y, false);
    const mRows: string[][] = [];
    for (const [key, mrs] of byMonth) {
      const magg = aggregateDerived(mrs, settings.total_rooms, new Date(Number(key.slice(0,4)), Number(key.slice(5,7)), 0).getDate());
      const mexp = mrs.reduce((s, r) => s + calcTotalExpenses(r), 0);
      mRows.push([
        MONTHS[Number(key.slice(5,7)) - 1],
        String(magg.roomsSold),
        `${magg.occ.toFixed(0)}%`,
        rs(magg.arr),
        rs(magg.roomRevenue),
        rs(magg.fbRevenue + magg.miscRevenue),
        rs(magg.totalRevenue),
        rs(mexp),
        rs(magg.totalRevenue - mexp),
      ]);
    }
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      head: [['Month','Rooms Sold','OCC%','ARR','Room Rev','Other Rev','Total Rev','Expenses','Net']],
      body: mRows,
      foot: [['TOTAL', String(agg.roomsSold), `${agg.occ.toFixed(0)}%`, rs(agg.arr),
               rs(agg.roomRevenue), rs(agg.fbRevenue + agg.miscRevenue),
               rs(agg.totalRevenue), rs(totalExpenses), rs(netOp)]],
      showFoot: 'lastPage',
      styles: { fontSize: 7.5, cellPadding: 2.5, lineColor: C.border, lineWidth: 0.2 },
      headStyles: { fillColor: C.headerBg, textColor: C.headerText, fontStyle: 'bold', fontSize: 7.5 },
      footStyles: { fillColor: C.footBg, textColor: C.footText, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: C.altRow },
      theme: 'grid',
    });
  }

  addPageFooters(doc, false);
  return doc;
}

// ────────────────────────────────────────────────────────────────────────────
// 5. COMPANY LEDGER PDF  (A4 landscape)
// ────────────────────────────────────────────────────────────────────────────
export interface LedgerPDFOpts {
  settings: HotelSettings;
  companyName: string;
  category: SourceCategory;
  entries: RoomChartEntry[];
  fromDate: string;
  toDate: string;
}

export async function buildCompanyLedgerPDF(opts: LedgerPDFOpts): Promise<jsPDF> {
  const { settings, companyName, category, entries, fromDate, toDate } = opts;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const ledger = buildCompanyLedger(companyName, category, entries);

  const subtitle = `${companyName}  |  ${fmtDate(fromDate)} – ${fmtDate(toDate)}`;
  await drawPageHeader(doc, settings, 'Company Ledger', subtitle, true);

  let y = 36;

  // Summary card
  y = sectionHead(doc, 'Ledger Summary', y, true);
  y = kvTable(doc, [
    ['Company / Booking Source',  companyName],
    ['Source Category',           category],
    ['Report Period',             `${fmtDate(fromDate)} to ${fmtDate(toDate)}`],
    ['Total Bookings',            String(ledger.totalBookings)],
    ['Total Room Nights',         String(ledger.totalRoomNights)],
    ['Total Room Revenue',        rs(ledger.totalRoomRevenue)],
  ], y, true);

  // Cash / Bank split
  let cash = 0, bank = 0;
  for (const e of entries) {
    if (e.is_complimentary) continue;
    const amt = toNum(e.total) > 0 ? toNum(e.total) : toNum(e.room_rate);
    if (e.pay_mode === 'Bank') bank += amt; else cash += amt;
  }
  y = sectionHead(doc, 'Payment Summary', y, true);
  y = kvTable(doc, [
    ['Cash',  rs(cash)],
    ['Bank',  rs(bank)],
    ['Total', rs(cash + bank)],
  ], y, true);

  // Detail table
  if (ledger.rows.length > 0) {
    if (y > 150) { doc.addPage(); y = 34; }
    y = sectionHead(doc, 'Booking History', y, true);
    autoTable(doc, {
      startY: y,
      margin: { left: 10, right: 10 },
      head: [['Date','Guest Name','Room No.','Arrival','Departure','Nights','Room Rate','Total','Pay Mode']],
      body: ledger.rows.map((r) => [
        fmtDate(r.date),
        r.guest || '—',
        r.room || '—',
        fmtDate(r.arrival),
        fmtDate(r.departure),
        String(r.nights),
        rs(r.roomRate),
        rs(r.total),
        r.payMode,
      ]),
      foot: [[
        'TOTAL', `${ledger.totalBookings} bookings`, '', '', '',
        String(ledger.totalRoomNights), '',
        rs(ledger.totalRoomRevenue),
        `Cash ${rs(cash)}  Bank ${rs(bank)}`,
      ]],
      showFoot: 'lastPage',
      styles: { fontSize: 8, cellPadding: 2.5, lineColor: C.border, lineWidth: 0.2 },
      headStyles: { fillColor: C.headerBg, textColor: C.headerText, fontStyle: 'bold', fontSize: 8 },
      footStyles: { fillColor: C.footBg, textColor: C.footText, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: C.altRow },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 52 },
        2: { cellWidth: 20 },
        3: { cellWidth: 22 },
        4: { cellWidth: 22 },
        5: { cellWidth: 15, halign: 'center' },
        6: { cellWidth: 28, halign: 'right' },
        7: { cellWidth: 28, halign: 'right' },
        8: { cellWidth: 22, halign: 'center' },
      },
      theme: 'grid',
    });
  }

  addPageFooters(doc, true);
  return doc;
}

// ────────────────────────────────────────────────────────────────────────────
// File name helpers
// ────────────────────────────────────────────────────────────────────────────
export function dailyMISFilename(settings: HotelSettings, date: string): string {
  const [y, m, d] = date.split('-');
  return `${slugify(settings.hotel_name)}_DailyMIS_${d}-${m}-${y}.pdf`;
}

export function roomChartFilename(settings: HotelSettings, date: string): string {
  const [y, m, d] = date.split('-');
  return `${slugify(settings.hotel_name)}_RoomChart_${d}-${m}-${y}.pdf`;
}

export function mtdFilename(settings: HotelSettings, year: number, month: number): string {
  return `${slugify(settings.hotel_name)}_MTD_${MONTHS[month - 1]}-${year}.pdf`;
}

export function ytdFilename(settings: HotelSettings, year: number): string {
  return `${slugify(settings.hotel_name)}_YTD_${year}.pdf`;
}

export function ledgerFilename(settings: HotelSettings, company: string, from: string, to: string): string {
  const [, fy, fm] = from.split('-');
  const [, ty, tm] = to.split('-');
  const period = fy === ty && fm === tm
    ? `${MONTHS[Number(fm) - 1]}-${fy}`
    : `${MONTHS[Number(fm) - 1]}${fy}-${MONTHS[Number(tm) - 1]}${ty}`;
  return `${slugify(settings.hotel_name)}_Ledger_${slugify(company)}_${period}.pdf`;
}

// ────────────────────────────────────────────────────────────────────────────
// Open PDF in new tab (preview) or force download
// ────────────────────────────────────────────────────────────────────────────
export function previewPDF(doc: jsPDF): void {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function downloadPDF(doc: jsPDF, filename: string): void {
  doc.save(filename);
}
