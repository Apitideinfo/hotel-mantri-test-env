/**
 * GST Statement PDF + Excel export.
 * Uses the same jsPDF + jspdf-autotable engine as the rest of the app.
 * Excel export uses the xlsx (SheetJS) library.
 */

import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { HotelSettings, GstType } from './types';
import { fmtMoney, toNum } from './calc';

// ── Colour palette (matches pdf.ts) ──────────────────────────────────────────
const C = {
  headerBg:    [13, 71, 109]  as [number, number, number],
  headerText:  [255, 255, 255] as [number, number, number],
  sectionBg:   [32, 101, 149] as [number, number, number],
  sectionText: [255, 255, 255] as [number, number, number],
  altRow:      [240, 247, 253] as [number, number, number],
  footBg:      [230, 242, 250] as [number, number, number],
  footText:    [13, 71, 109]  as [number, number, number],
  border:      [189, 215, 235] as [number, number, number],
  text:        [30, 30, 30]   as [number, number, number],
  muted:       [100, 100, 100] as [number, number, number],
};

const rs = (n: number): string => `Rs.${fmtMoney(n)}`;

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const slugify = (s: string) => s.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');

const nowStr = () => {
  const d = new Date();
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
       + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// ── Data types for the GST statement ─────────────────────────────────────────
export interface GstStatementRow {
  srNo: number;
  businessDate: string;
  roomNo: string;
  guestName: string;
  bookingSource: string;
  gstType: string;
  gstRate: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  invoiceTotal: number;
}

export interface GstSlabRow {
  gstRate: number;
  bookings: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  grossAmount: number;
}

export interface GstStatementData {
  rows: GstStatementRow[];
  bySlab: GstSlabRow[];
  totalBookings: number;
  totalTaxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalGst: number;
  netRevenue: number;
}

// ── State-based GST split ────────────────────────────────────────────────────
// Same state → CGST + SGST (half each), IGST = 0
// Different state → IGST = total GST, CGST = SGST = 0
// No Scope → all zero
function splitGstByState(
  gstAmount: number,
  gstType: string,
  hotelState: string | undefined,
  placeOfSupply: string | undefined,
): { cgst: number; sgst: number; igst: number } {
  if (gstType === 'No Scope' || gstAmount <= 0) {
    return { cgst: 0, sgst: 0, igst: 0 };
  }
  const sameState =
    hotelState && placeOfSupply &&
    hotelState.trim().toLowerCase() === placeOfSupply.trim().toLowerCase();
  if (sameState) {
    return { cgst: gstAmount / 2, sgst: gstAmount / 2, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: gstAmount };
}

// ── Build statement data from room chart entries ────────────────────────────
interface GstEntryLike {
  report_date: string;
  business_date: string | null;
  guest_name: string;
  room_no: string;
  company: string;
  source_category: string;
  is_complimentary: boolean;
  gst_type: GstType;
  gst_slab: number;
  gst_amount: number;
  taxable_amount: number;
  invoice_total: number;
  total: number;
  room_rate: number;
}

export function buildGstStatement(
  entries: GstEntryLike[],
  hotelState?: string,
): GstStatementData {
  const rows: GstStatementRow[] = [];
  const slabMap = new Map<number, GstSlabRow>();
  let totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalGst = 0;

  const sorted = [...entries].sort((a, b) => {
    const da = a.business_date || a.report_date;
    const db = b.business_date || b.report_date;
    return da < db ? -1 : da > db ? 1 : 0;
  });

  let sr = 0;
  for (const e of sorted) {
    if (e.is_complimentary) continue;

    const gstType = e.gst_type || 'No Scope';
    const gstAmt = toNum(e.gst_amount);
    const slab = toNum(e.gst_slab);

    // Skip entries with no GST and no taxable amount
    if (gstAmt === 0 && toNum(e.taxable_amount) === 0 && slab === 0) continue;

    const taxable = toNum(e.taxable_amount) || (toNum(e.total) > 0 ? toNum(e.total) : toNum(e.room_rate));
    const invoiceTotal = toNum(e.invoice_total) || (taxable + gstAmt);

    // Place of supply defaults to hotel state (same-state unless we have guest state info)
    const { cgst, sgst, igst } = splitGstByState(gstAmt, gstType, hotelState, hotelState);

    sr++;
    rows.push({
      srNo: sr,
      businessDate: e.business_date || e.report_date,
      roomNo: e.room_no || '—',
      guestName: e.guest_name || '—',
      bookingSource: e.company || e.source_category || '—',
      gstType,
      gstRate: slab,
      taxableAmount: taxable,
      cgst,
      sgst,
      igst,
      totalGst: gstAmt,
      invoiceTotal,
    });

    totalTaxable += taxable;
    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;
    totalGst += gstAmt;

    const existing = slabMap.get(slab) ?? {
      gstRate: slab, bookings: 0, taxableAmount: 0,
      cgst: 0, sgst: 0, igst: 0, totalGst: 0, grossAmount: 0,
    };
    existing.bookings += 1;
    existing.taxableAmount += taxable;
    existing.cgst += cgst;
    existing.sgst += sgst;
    existing.igst += igst;
    existing.totalGst += gstAmt;
    existing.grossAmount += invoiceTotal;
    slabMap.set(slab, existing);
  }

  const bySlab = Array.from(slabMap.values()).sort((a, b) => a.gstRate - b.gstRate);

  return {
    rows,
    bySlab,
    totalBookings: rows.length,
    totalTaxable,
    totalCgst,
    totalSgst,
    totalIgst,
    totalGst,
    netRevenue: totalTaxable,
  };
}

// ── Image loader ─────────────────────────────────────────────────────────────
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

// ── Page header ──────────────────────────────────────────────────────────────
async function drawPageHeader(
  doc: jsPDF,
  settings: HotelSettings,
  reportTitle: string,
  reportSubtitle: string,
) {
  const pw = 210;
  const lm = 14;
  const LOGO_SIZE = 18;
  const logoX = lm;
  const textX = settings.logo_url ? lm + LOGO_SIZE + 3 : lm;

  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, pw, 32, 'F');

  if (settings.logo_url) {
    try {
      const dataUrl = await loadImageDataUrl(settings.logo_url);
      if (dataUrl) doc.addImage(dataUrl, logoX, 7, LOGO_SIZE, LOGO_SIZE);
    } catch { /* skip logo */ }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...C.headerText);
  doc.text(settings.hotel_name || 'Hotel', textX, 12);

  const addrParts: string[] = [];
  if (settings.address) addrParts.push(settings.address);
  if (settings.city) addrParts.push(settings.city);
  if (settings.state_name) addrParts.push(settings.state_name);
  if (settings.pin_code) addrParts.push(settings.pin_code);
  const addrLine = addrParts.join(', ');

  const contactParts: string[] = [];
  if (settings.phone) contactParts.push(`Ph: ${settings.phone}`);
  if (settings.email) contactParts.push(settings.email);
  if (settings.gst_number) contactParts.push(`GSTIN: ${settings.gst_number}`);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C.headerText);
  if (addrLine) doc.text(addrLine, textX, 18);
  if (contactParts.length) doc.text(contactParts.join('  |  '), textX, addrLine ? 23 : 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.headerText);
  doc.text(reportTitle, pw - lm, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(reportSubtitle, pw - lm, 18, { align: 'right' });
  doc.text(`Generated: ${nowStr()}`, pw - lm, 24, { align: 'right' });

  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.4);
  doc.line(0, 32, pw, 32);
}

// ── Section heading ──────────────────────────────────────────────────────────
function sectionHead(doc: jsPDF, text: string, y: number): number {
  doc.setFillColor(...C.sectionBg);
  doc.rect(14, y, 210 - 28, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.sectionText);
  doc.text(text, 17, y + 4.8);
  doc.setTextColor(...C.text);
  return y + 10;
}

// ── Page footers ─────────────────────────────────────────────────────────────
function addPageFooters(doc: jsPDF, hotelName: string) {
  const totalPages = (doc as jsPDF & { internal: { getNumberOfPages: () => number } })
    .internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pw = (doc as any).getPageWidth ? (doc as any).getPageWidth() : doc.internal.pageSize.getWidth();
    const ph = (doc as any).getPageHeight ? (doc as any).getPageHeight() : doc.internal.pageSize.getHeight();
    doc.setFillColor(...C.footBg);
    doc.rect(0, ph - 12, pw, 12, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.text(`Generated: ${nowStr()}`, 14, ph - 4);
    doc.text(`Page ${i} of ${totalPages}`, pw - 14, ph - 4, { align: 'right' });
    doc.text(`Generated by Hotel Mantri  |  ${hotelName}`, pw / 2, ph - 4, { align: 'center' });
  }
}

// ── KV table ─────────────────────────────────────────────────────────────────
function kvTable(doc: jsPDF, rows: [string, string][], startY: number): number {
  autoTable(doc, {
    startY,
    margin: { left: 14, right: 14 },
    tableWidth: 210 - 28,
    body: rows.map(([l, v]) => [l, v]),
    columnStyles: {
      0: { cellWidth: 80, fontStyle: 'normal', textColor: C.muted, fontSize: 8.5 },
      1: { fontStyle: 'bold', textColor: C.text, fontSize: 8.5, halign: 'right' },
    },
    styles: { cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 }, lineColor: C.border, lineWidth: 0.2 },
    alternateRowStyles: { fillColor: C.altRow },
    theme: 'plain',
    didParseCell(data) {
      if (typeof data.cell.raw === 'string' &&
          /^(Total|Net|Total GST)/i.test(data.cell.raw as string)) {
        data.cell.styles.fillColor = C.footBg;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = C.footText;
      }
    },
  });
  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
}

// ────────────────────────────────────────────────────────────────────────────
// PDF BUILDER
// ────────────────────────────────────────────────────────────────────────────
export interface GstPdfOpts {
  settings: HotelSettings;
  data: GstStatementData;
  monthKey: string; // "2026-08"
}

export async function buildGstStatementPDF(opts: GstPdfOpts): Promise<jsPDF> {
  const { settings, data, monthKey } = opts;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const [y, m] = monthKey.split('-').map(Number);
  const monthName = MONTHS[m - 1];
  const subtitle = `${monthName} ${y}`;

  await drawPageHeader(doc, settings, 'Monthly GST Statement', subtitle);

  let yy = 38;

  // ── Summary section ──
  yy = sectionHead(doc, 'Summary', yy);
  yy = kvTable(doc, [
    ['Total Bookings',           String(data.totalBookings)],
    ['Taxable Revenue',          rs(data.totalTaxable)],
    ['CGST Collected',           rs(data.totalCgst)],
    ['SGST Collected',           rs(data.totalSgst)],
    ['IGST Collected',           rs(data.totalIgst)],
    ['Total GST Collected',      rs(data.totalGst)],
    ['Net Revenue (excl. GST)',  rs(data.netRevenue)],
  ], yy);

  // ── GST by Slab section ──
  if (yy > 230) { doc.addPage(); yy = 38; }
  yy = sectionHead(doc, 'GST by Slab', yy);
  autoTable(doc, {
    startY: yy,
    margin: { left: 14, right: 14 },
    head: [['GST Rate', 'Bookings', 'Taxable Amount', 'CGST', 'SGST', 'IGST', 'Total GST', 'Gross Amount']],
    body: data.bySlab.map((s) => [
      `${s.gstRate}%`,
      String(s.bookings),
      rs(s.taxableAmount),
      rs(s.cgst),
      rs(s.sgst),
      rs(s.igst),
      rs(s.totalGst),
      rs(s.grossAmount),
    ]),
    foot: data.bySlab.length > 0 ? [['TOTAL', String(data.totalBookings), rs(data.totalTaxable), rs(data.totalCgst), rs(data.totalSgst), rs(data.totalIgst), rs(data.totalGst), '']] : undefined,
    showFoot: 'lastPage',
    styles: { fontSize: 7.5, cellPadding: 2, lineColor: C.border, lineWidth: 0.2 },
    headStyles: { fillColor: C.headerBg, textColor: C.headerText, fontStyle: 'bold', fontSize: 7.5 },
    footStyles: { fillColor: C.footBg, textColor: C.footText, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: C.altRow },
    columnStyles: {
      0: { cellWidth: 18, halign: 'center' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 26, halign: 'right' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 24, halign: 'right' },
      7: { cellWidth: 26, halign: 'right' },
    },
    theme: 'grid',
  });
  yy = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // ── Booking-wise detail section ──
  if (data.rows.length > 0) {
    if (yy > 240) { doc.addPage(); yy = 38; }
    yy = sectionHead(doc, 'Booking-wise Detail', yy);
    autoTable(doc, {
      startY: yy,
      margin: { left: 10, right: 10 },
      head: [[
        'Sr', 'Date', 'Room', 'Guest', 'Source', 'GST Type', 'Rate',
        'Taxable', 'CGST', 'SGST', 'IGST', 'Total GST', 'Invoice',
      ]],
      body: data.rows.map((r) => [
        String(r.srNo),
        fmtDate(r.businessDate),
        r.roomNo,
        r.guestName,
        r.bookingSource,
        r.gstType,
        r.gstType === 'No Scope' ? '—' : `${r.gstRate}%`,
        rs(r.taxableAmount),
        rs(r.cgst),
        rs(r.sgst),
        rs(r.igst),
        rs(r.totalGst),
        rs(r.invoiceTotal),
      ]),
      foot: [[
        '', '', '', '', '', '', 'TOTAL',
        rs(data.totalTaxable), rs(data.totalCgst), rs(data.totalSgst),
        rs(data.totalIgst), rs(data.totalGst), '',
      ]],
      showFoot: 'lastPage',
      styles: { fontSize: 6, cellPadding: 1.5, lineColor: C.border, lineWidth: 0.15 },
      headStyles: { fillColor: C.headerBg, textColor: C.headerText, fontStyle: 'bold', fontSize: 6 },
      footStyles: { fillColor: C.footBg, textColor: C.footText, fontStyle: 'bold', fontSize: 6 },
      alternateRowStyles: { fillColor: C.altRow },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 16 },
        2: { cellWidth: 12 },
        3: { cellWidth: 24 },
        4: { cellWidth: 20 },
        5: { cellWidth: 16 },
        6: { cellWidth: 10, halign: 'center' },
        7: { cellWidth: 20, halign: 'right' },
        8: { cellWidth: 18, halign: 'right' },
        9: { cellWidth: 18, halign: 'right' },
        10: { cellWidth: 18, halign: 'right' },
        11: { cellWidth: 20, halign: 'right' },
        12: { cellWidth: 20, halign: 'right' },
      },
      theme: 'grid',
      didDrawPage: (d) => {
        // Repeat section heading on each new page
        if (d.pageNumber > 1) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(...C.sectionText);
          doc.setFillColor(...C.sectionBg);
          doc.rect(10, d.settings.startY - 4, 190, 6, 'F');
          doc.text('Booking-wise Detail (continued)', 13, d.settings.startY - 0.5);
          doc.setTextColor(...C.text);
        }
      },
    });
  }

  // ── Signature area ──
  const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const ph = (doc as any).getPageHeight ? (doc as any).getPageHeight() : doc.internal.pageSize.getHeight();
  if (finalY < ph - 40) {
    doc.setDrawColor(...C.muted);
    doc.setLineWidth(0.2);
    doc.line(140, ph - 30, 196, ph - 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text('Authorized Signature', 168, ph - 25, { align: 'center' });
  }

  addPageFooters(doc, settings.hotel_name || 'Hotel');
  return doc;
}

// ────────────────────────────────────────────────────────────────────────────
// EXCEL BUILDER
// ────────────────────────────────────────────────────────────────────────────
export function buildGstStatementExcel(opts: GstPdfOpts): void {
  const { settings, data, monthKey } = opts;
  const [y, m] = monthKey.split('-').map(Number);
  const monthName = MONTHS[m - 1];
  const period = `${monthName} ${y}`;

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ──
  const summaryData: (string | number)[][] = [
    [settings.hotel_name || 'Hotel', ''],
    ['Monthly GST Statement', ''],
    ['Period', period],
    ['Generated', nowStr()],
    ['GSTIN', settings.gst_number || '—'],
    ['', ''],
    ['Metric', 'Value'],
    ['Total Bookings', data.totalBookings],
    ['Taxable Revenue', Number(data.totalTaxable.toFixed(2))],
    ['CGST Collected', Number(data.totalCgst.toFixed(2))],
    ['SGST Collected', Number(data.totalSgst.toFixed(2))],
    ['IGST Collected', Number(data.totalIgst.toFixed(2))],
    ['Total GST Collected', Number(data.totalGst.toFixed(2))],
    ['Net Revenue (excl. GST)', Number(data.netRevenue.toFixed(2))],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1['!cols'] = [{ wch: 28 }, { wch: 20 }];
  ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

  // ── Sheet 2: GST by Slab ──
  const slabData: (string | number)[][] = [
    ['GST Rate', 'Bookings', 'Taxable Amount', 'CGST', 'SGST', 'IGST', 'Total GST', 'Gross Amount'],
    ...data.bySlab.map((s) => [
      `${s.gstRate}%`,
      s.bookings,
      Number(s.taxableAmount.toFixed(2)),
      Number(s.cgst.toFixed(2)),
      Number(s.sgst.toFixed(2)),
      Number(s.igst.toFixed(2)),
      Number(s.totalGst.toFixed(2)),
      Number(s.grossAmount.toFixed(2)),
    ]),
  ];
  if (data.bySlab.length > 0) {
    slabData.push([
      'TOTAL', data.totalBookings,
      Number(data.totalTaxable.toFixed(2)),
      Number(data.totalCgst.toFixed(2)),
      Number(data.totalSgst.toFixed(2)),
      Number(data.totalIgst.toFixed(2)),
      Number(data.totalGst.toFixed(2)),
      '',
    ]);
  }
  const ws2 = XLSX.utils.aoa_to_sheet(slabData);
  ws2['!cols'] = [
    { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 15 },
    { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 },
  ];
  ws2['!freeze'] = { xSplit: 0, ySplit: 1 };
  ws2['!autofilter'] = { ref: `A1:H${slabData.length}` };
  XLSX.utils.book_append_sheet(wb, ws2, 'GST by Slab');

  // ── Sheet 3: Booking-wise Detail ──
  const detailData: (string | number)[][] = [
    ['Sr No', 'Business Date', 'Room No', 'Guest Name', 'Booking Source', 'GST Type', 'GST Rate',
     'Taxable Amount', 'CGST', 'SGST', 'IGST', 'Total GST', 'Invoice Total'],
    ...data.rows.map((r) => [
      r.srNo,
      r.businessDate,
      r.roomNo,
      r.guestName,
      r.bookingSource,
      r.gstType,
      r.gstType === 'No Scope' ? 'No Scope' : `${r.gstRate}%`,
      Number(r.taxableAmount.toFixed(2)),
      Number(r.cgst.toFixed(2)),
      Number(r.sgst.toFixed(2)),
      Number(r.igst.toFixed(2)),
      Number(r.totalGst.toFixed(2)),
      Number(r.invoiceTotal.toFixed(2)),
    ]),
  ];
  if (data.rows.length > 0) {
    detailData.push([
      '', '', '', '', '', '', 'TOTAL',
      Number(data.totalTaxable.toFixed(2)),
      Number(data.totalCgst.toFixed(2)),
      Number(data.totalSgst.toFixed(2)),
      Number(data.totalIgst.toFixed(2)),
      Number(data.totalGst.toFixed(2)),
      '',
    ]);
  }
  const ws3 = XLSX.utils.aoa_to_sheet(detailData);
  ws3['!cols'] = [
    { wch: 6 }, { wch: 14 }, { wch: 10 }, { wch: 22 }, { wch: 20 },
    { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 16 },
  ];
  ws3['!freeze'] = { xSplit: 0, ySplit: 1 };
  ws3['!autofilter'] = { ref: `A1:M${detailData.length}` };
  XLSX.utils.book_append_sheet(wb, ws3, 'Booking-wise Detail');

  // ── Write file ──
  const hotelSlug = slugify(settings.hotel_name || 'Hotel');
  const monthSlug = `${MONTHS[m - 1]}-${y}`;
  XLSX.writeFile(wb, `HotelMantri_GST_Statement_${hotelSlug}_${monthSlug}.xlsx`);
}

// ── Filename helpers ──
export function gstPdfFilename(settings: HotelSettings, monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `HotelMantri_GST_Statement_${slugify(settings.hotel_name || 'Hotel')}_${MONTHS[m - 1]}-${y}.pdf`;
}
