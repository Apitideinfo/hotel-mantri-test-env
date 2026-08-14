import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { fmtMoney, toNum } from './calc';
import type { HotelSettings, PosOrder, PosOrderItem, PosBill, PosPayment, PosOrderType } from './types';

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
  accent:      [215, 38, 38]  as [number, number, number],
};

const rs = (n: number): string => `Rs.${fmtMoney(n)}`;

const now = (): string => new Date().toLocaleString('en-IN');

export interface RestaurantBillPdfInput {
  settings: HotelSettings;
  bill: PosBill;
  order: PosOrder;
  items: PosOrderItem[];
  payments: PosPayment[];
  restaurantName?: string;
}

export const buildRestaurantBillPDF = (input: RestaurantBillPdfInput): jsPDF => {
  const { settings, bill, order, items, payments, restaurantName } = input;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = 210;
  const ph = 297;
  const lm = 14;

  // ── Header band ──
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, pw, 30, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...C.headerText);
  doc.text(settings.hotel_name || 'Hotel Mantri', lm, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const addrParts = [settings.address, settings.city, settings.state_name, settings.pin_code].filter(Boolean);
  if (addrParts.length > 0) doc.text(addrParts.join(', '), lm, 18);
  const contactParts = [
    settings.gst_registered && settings.gst_number ? `GSTIN: ${settings.gst_number}` : '',
    settings.phone ? `Ph: ${settings.phone}` : '',
    settings.email ? settings.email : '',
  ].filter(Boolean);
  if (contactParts.length > 0) doc.text(contactParts.join('  |  '), lm, 23);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Restaurant Bill', pw - lm, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(bill.bill_number, pw - lm, 18, { align: 'right' });
  doc.text(new Date(bill.created_at).toLocaleString('en-IN'), pw - lm, 23, { align: 'right' });

  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.4);
  doc.line(0, 30, pw, 30);
  doc.setTextColor(...C.text);
  doc.setFont('helvetica', 'normal');

  // ── Bill metadata block ──
  let y = 36;
  const orderTypeLabel = (t: PosOrderType) =>
    t === 'dine_in' ? 'Dine-In' : t === 'room_service' ? 'Room Service' : 'Takeaway';

  const metaRows: [string, string][] = [
    ['Bill No.', bill.bill_number],
    ['Date', new Date(bill.created_at).toLocaleString('en-IN')],
    ['Order No.', order.order_number],
    ['Order Type', orderTypeLabel(order.order_type)],
    ...(order.table_id ? [['Table', order.table_id] as [string, string]] : []),
    ...(order.room_no ? [['Room', order.room_no] as [string, string]] : []),
    ...(order.guest_name ? [['Guest', order.guest_name] as [string, string]] : []),
    ...(order.guest_phone ? [['Phone', order.guest_phone] as [string, string]] : []),
    ...(restaurantName ? [['Restaurant', restaurantName] as [string, string]] : []),
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: lm, right: lm },
    body: metaRows.map(([k, v]) => [k, v]),
    theme: 'plain',
    columnStyles: {
      0: { cellWidth: 30, fontStyle: 'bold' as const, textColor: C.muted, fontSize: 8 },
      1: { cellWidth: 'auto', textColor: C.text, fontSize: 8.5 },
    },
    styles: { cellPadding: { top: 1, bottom: 1, left: 0, right: 2 } },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // ── Items table ──
  autoTable(doc, {
    startY: y,
    margin: { left: lm, right: lm },
    head: [['Item', 'Qty', 'Rate', 'GST%', 'Amount']],
    body: items.map((it) => [
      it.name + (it.note ? `\nNote: ${it.note}` : ''),
      String(it.quantity),
      rs(it.rate),
      `${toNum(it.gst_percent)}%`,
      rs(toNum(it.line_total)),
    ]),
    theme: 'grid',
    columnStyles: {
      0: { cellWidth: 'auto', overflow: 'linebreak' as const },
      1: { cellWidth: 14, halign: 'center' as const },
      2: { cellWidth: 28, halign: 'right' as const },
      3: { cellWidth: 18, halign: 'center' as const },
      4: { cellWidth: 30, halign: 'right' as const },
    },
    styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: C.border, lineWidth: 0.2, textColor: C.text, overflow: 'linebreak' as const },
    headStyles: { fillColor: C.sectionBg, textColor: C.sectionText, fontSize: 8.5, fontStyle: 'bold' as const },
    alternateRowStyles: { fillColor: C.altRow },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // ── Totals block ──
  const totalsRows: [string, string][] = [
    ['Subtotal', rs(bill.subtotal)],
  ];
  if (toNum(bill.discount_amount) > 0) {
    const discDesc = bill.discount_reason
      ? `Discount (${bill.discount_reason})`
      : `Discount (${bill.discount_type === 'percent' ? `${bill.discount_value}%` : 'Flat'})`;
    totalsRows.push([discDesc, `- ${rs(bill.discount_amount)}`]);
  }
  totalsRows.push(['GST', rs(bill.gst_amount)]);
  totalsRows.push(['Grand Total', rs(bill.grand_total)]);

  autoTable(doc, {
    startY: y,
    margin: { left: pw / 2, right: lm },
    body: totalsRows,
    theme: 'plain',
    columnStyles: {
      0: { cellWidth: 'auto', textColor: C.muted, fontSize: 9 },
      1: { cellWidth: 40, halign: 'right' as const, textColor: C.text, fontSize: 9, fontStyle: 'bold' as const },
    },
    styles: { cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 0 } },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // Grand total accent line
  doc.setDrawColor(...C.accent);
  doc.setLineWidth(0.5);
  doc.line(pw / 2, y, pw - lm, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.accent);
  doc.text(`Grand Total: ${rs(bill.grand_total)}`, pw - lm, y, { align: 'right' });
  doc.setTextColor(...C.text);
  doc.setFont('helvetica', 'normal');

  // ── Payment summary ──
  y += 8;
  if (payments.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Payment Details', lm, y);
    doc.setFont('helvetica', 'normal');
    y += 2;

    const payRows = payments.map((p) => {
      const modeLabel = p.payment_mode === 'post_to_room' ? 'Post to Room' : p.payment_mode.toUpperCase();
      const ref = p.reference_no ? ` (${p.reference_no})` : '';
      return [modeLabel + ref, rs(p.amount)];
    });

    autoTable(doc, {
      startY: y,
      margin: { left: lm, right: lm },
      body: payRows,
      theme: 'plain',
      columnStyles: {
        0: { cellWidth: 'auto', textColor: C.muted, fontSize: 8 },
        1: { cellWidth: 40, halign: 'right' as const, textColor: C.text, fontSize: 8 },
      },
      styles: { cellPadding: { top: 1, bottom: 1, left: 0, right: 0 } },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // ── Thank you ──
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...C.muted);
  doc.text('Thank You! Visit Again.', pw / 2, y + 4, { align: 'center' });

  // ── Footer ──
  doc.setFillColor(...C.footBg);
  doc.rect(0, ph - 10, pw, 10, 'F');
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(...C.muted);
  doc.text(`Generated: ${now()}`, lm, ph - 3.5);
  doc.text('Generated by Hotel Mantri  |  Your Hotel\'s Digital Manager', pw / 2, ph - 3.5, { align: 'center' });

  return doc;
};

export const restaurantBillFilename = (billNumber: string): string =>
  `Bill_${billNumber}.pdf`;
