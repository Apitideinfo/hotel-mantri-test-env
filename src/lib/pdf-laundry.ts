/**
 * HOTEL MANTRI — DAILY LAUNDRY STATEMENT PDF ENGINE
 * 
 * Generates an authoritative, beautifully formatted daily vendor statement PDF:
 * - Hotel branding (Name, Location, Contact)
 * - Vendor details & Statement reference
 * - Full line-item breakdown (Sent, Received, Pending, Rate, Billable Qty, Amount)
 * - Activity Summary (Opening Pending, Sent Today, Received Today, Closing Pending, Today's Billable Amount)
 * - Explicit note: "Pending quantity is not included in billing."
 */

import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';

export interface LaundryStatementData {
  hotel: {
    id: string;
    name: string;
    city?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  vendor: {
    id: string;
    vendor_name: string;
    contact_person?: string;
    mobile_number?: string;
    gstin?: string;
  };
  date: string;
  statement_no?: string;
  opening_pending: number;
  sent_today: number;
  received_today: number;
  closing_pending: number;
  today_billable_amount: number;
  items: Array<{
    item_name: string;
    sent_qty: number;
    received_qty: number;
    pending_qty: number;
    rate: number;
    billable_qty: number;
    amount: number;
  }>;
}

const C = {
  headerBg:    [13, 71, 109]   as [number, number, number],
  headerText:  [255, 255, 255] as [number, number, number],
  sectionBg:   [32, 101, 149]  as [number, number, number],
  sectionText: [255, 255, 255] as [number, number, number],
  altRow:      [245, 250, 255] as [number, number, number],
  footBg:      [232, 244, 253] as [number, number, number],
  footText:    [13, 71, 109]   as [number, number, number],
  border:      [189, 215, 235] as [number, number, number],
  text:        [30, 30, 30]    as [number, number, number],
  muted:       [100, 100, 100] as [number, number, number],
  accent:      [215, 38, 38]   as [number, number, number],
};

const rs = (n: number): string => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const generateLaundryStatementPdf = async (data: LaundryStatementData): Promise<Blob> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  // ── Header Box ──
  doc.setFillColor(...C.headerBg);
  doc.rect(margin, y, pageWidth - margin * 2, 28, 'F');

  // Hotel Title & Info
  doc.setTextColor(...C.headerText);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text((data.hotel.name || 'HOTEL MANTRI').toUpperCase(), margin + 6, y + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const locationText = [data.hotel.address, data.hotel.city].filter(Boolean).join(', ');
  if (locationText) {
    doc.text(locationText, margin + 6, y + 15);
  }
  if (data.hotel.phone || data.hotel.email) {
    const contactText = [data.hotel.phone ? `Tel: ${data.hotel.phone}` : '', data.hotel.email ? `Email: ${data.hotel.email}` : ''].filter(Boolean).join(' | ');
    doc.text(contactText, margin + 6, y + 21);
  }

  // Right-aligned Statement Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('DAILY LAUNDRY STATEMENT', pageWidth - margin - 6, y + 10, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Date: ${data.date}`, pageWidth - margin - 6, y + 16, { align: 'right' });
  if (data.statement_no) {
    doc.text(`Ref: ${data.statement_no}`, pageWidth - margin - 6, y + 21, { align: 'right' });
  }

  y += 34;

  // ── Vendor & Date Info Banner ──
  doc.setFillColor(245, 248, 252);
  doc.setDrawColor(...C.border);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 18, 2, 2, 'FD');

  doc.setTextColor(...C.text);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Vendor Information:', margin + 6, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Vendor: ${data.vendor.vendor_name}`, margin + 6, y + 12);

  if (data.vendor.contact_person || data.vendor.mobile_number) {
    const vContact = [
      data.vendor.contact_person ? `Contact: ${data.vendor.contact_person}` : '',
      data.vendor.mobile_number ? `Mobile: ${data.vendor.mobile_number}` : '',
    ].filter(Boolean).join(' | ');
    doc.text(vContact, margin + 80, y + 12);
  }

  if (data.vendor.gstin) {
    doc.text(`GSTIN: ${data.vendor.gstin}`, pageWidth - margin - 6, y + 12, { align: 'right' });
  }

  y += 24;

  // ── Line Items Table ──
  const tableRows = (data.items || []).map((it) => [
    it.item_name,
    it.sent_qty.toString(),
    it.received_qty.toString(),
    it.pending_qty.toString(),
    `Rs.${it.rate}`,
    it.billable_qty.toString(),
    rs(it.amount),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Item Name', 'Sent', 'Received', 'Pending', 'Rate', 'Billable Qty', 'Amount']],
    body: tableRows.length > 0 ? tableRows : [['No laundry transactions recorded for this date', '', '', '', '', '', '']],
    headStyles: {
      fillColor: C.sectionBg,
      textColor: C.sectionText,
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'center',
    },
    bodyStyles: {
      textColor: C.text,
      fontSize: 8.5,
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold' },
      6: { halign: 'right', fontStyle: 'bold' },
    },
    alternateRowStyles: {
      fillColor: C.altRow,
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || y + 50;
  y = finalY + 8;

  // ── Daily Activity Summary Box ──
  const summaryWidth = pageWidth - margin * 2;
  doc.setFillColor(...C.footBg);
  doc.setDrawColor(...C.border);
  doc.roundedRect(margin, y, summaryWidth, 38, 2, 2, 'FD');

  doc.setTextColor(...C.headerBg);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DAILY RECONCILIATION & BILLING SUMMARY', margin + 6, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.text);

  // Column 1: Pieces Reconciliation
  doc.text(`Opening Pending:`, margin + 6, y + 15);
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.opening_pending} pcs`, margin + 45, y + 15);

  doc.setFont('helvetica', 'normal');
  doc.text(`Sent Today:`, margin + 6, y + 21);
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.sent_today} pcs`, margin + 45, y + 21);

  doc.setFont('helvetica', 'normal');
  doc.text(`Received Today:`, margin + 6, y + 27);
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.received_today} pcs`, margin + 45, y + 27);

  doc.setFont('helvetica', 'normal');
  doc.text(`Closing Pending:`, margin + 6, y + 33);
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.closing_pending} pcs`, margin + 45, y + 33);

  // Column 2: Financial Billing Box
  const billBoxX = margin + 100;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(billBoxX, y + 8, summaryWidth - 106, 24, 2, 2, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.muted);
  doc.text("Today's Approved Billable Amount:", billBoxX + 6, y + 15);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...C.headerBg);
  doc.text(rs(data.today_billable_amount), billBoxX + 6, y + 25);

  y += 44;

  // ── Authoritative Disclaimer Note ──
  doc.setFillColor(255, 243, 205);
  doc.setDrawColor(255, 222, 173);
  doc.roundedRect(margin, y, summaryWidth, 12, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(133, 100, 4);
  doc.text('Important Notice: Pending quantity is not included in billing.', margin + 6, y + 7.5);

  // ── Footer Signatures ──
  y += 24;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.muted);

  doc.line(margin + 10, y, margin + 60, y);
  doc.text('Authorized Hotel Signature', margin + 15, y + 5);

  doc.line(pageWidth - margin - 60, y, pageWidth - margin - 10, y);
  doc.text('Laundry Vendor Signature', pageWidth - margin - 55, y + 5);

  return doc.output('blob');
};

export const downloadLaundryStatementPdf = async (data: LaundryStatementData, filename?: string): Promise<void> => {
  const blob = await generateLaundryStatementPdf(data);
  const fname = filename || `Laundry_Statement_${data.date}_${data.vendor.vendor_name.replace(/\s+/g, '_')}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export default {
  generateLaundryStatementPdf,
  downloadLaundryStatementPdf,
};
