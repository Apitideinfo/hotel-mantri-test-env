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

// ══════════════════════════════════════════════════════════════════
// VENDOR LEDGER PDF ENGINE
// ══════════════════════════════════════════════════════════════════

export interface VendorLedgerPdfData {
  hotel?: {
    id?: string;
    name?: string;
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
    address?: string;
  };
  generatedDate?: string;
  statementPeriod?: {
    fromDate?: string;
    toDate?: string;
  };
  physical_pending_pieces: number;
  total_billed_amount: number;
  total_paid_amount: number;
  financial_due_amount: number;
  daily_ledger?: Array<{
    date: string;
    sent_qty: number;
    received_qty: number;
    pending_qty: number;
    bill_amount: number;
    paid_amount: number;
    payment_due: number;
    details?: string;
  }>;
  transactions?: Array<{
    date: string;
    type: string;
    reference: string;
    description: string;
    sent_qty: number;
    received_qty: number;
    pending_qty?: number;
    bill_amount: number;
    paid_amount: number;
    balance_due: number;
  }>;
  viewMode?: 'daily' | 'transactions' | 'both';
}

const fmtDatePdf = (d?: string): string => {
  if (!d) return '—';
  const clean = String(d).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mIdx = parseInt(parts[1], 10) - 1;
    return `${parts[2]}-${months[mIdx] || parts[1]}-${parts[0]}`;
  }
  return clean;
};

export const generateVendorLedgerPdf = async (data: VendorLedgerPdfData): Promise<Blob> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = margin;

  // ── 1. Header Box ──
  doc.setFillColor(...C.headerBg);
  doc.rect(margin, y, pageWidth - margin * 2, 28, 'F');

  // Hotel Title & Info
  doc.setTextColor(...C.headerText);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text((data.hotel?.name || 'HOTEL MANTRI').toUpperCase(), margin + 6, y + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const locationText = [data.hotel?.address, data.hotel?.city].filter(Boolean).join(', ');
  if (locationText) {
    doc.text(locationText, margin + 6, y + 15);
  }
  if (data.hotel?.phone || data.hotel?.email) {
    const contactText = [
      data.hotel?.phone ? `Tel: ${data.hotel.phone}` : '',
      data.hotel?.email ? `Email: ${data.hotel.email}` : '',
    ].filter(Boolean).join(' | ');
    doc.text(contactText, margin + 6, y + 21);
  }

  // Right-aligned Document Title & Metadata
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('VENDOR LEDGER REPORT', pageWidth - margin - 6, y + 9, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const genDate = data.generatedDate || new Date().toISOString().slice(0, 10);
  doc.text(`Generated: ${fmtDatePdf(genDate)}`, pageWidth - margin - 6, y + 15, { align: 'right' });

  let periodStr = 'All-Time Activity';
  if (data.statementPeriod?.fromDate || data.statementPeriod?.toDate) {
    const f = data.statementPeriod.fromDate ? fmtDatePdf(data.statementPeriod.fromDate) : 'Start';
    const t = data.statementPeriod.toDate ? fmtDatePdf(data.statementPeriod.toDate) : 'Current';
    periodStr = `Period: ${f} to ${t}`;
  }
  doc.text(periodStr, pageWidth - margin - 6, y + 21, { align: 'right' });

  y += 33;

  // ── 2. Vendor Information Banner ──
  doc.setFillColor(245, 248, 252);
  doc.setDrawColor(...C.border);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 16, 2, 2, 'FD');

  doc.setTextColor(...C.text);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`Vendor: ${data.vendor.vendor_name}`, margin + 5, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const vContact = [
    data.vendor.contact_person ? `Contact: ${data.vendor.contact_person}` : '',
    data.vendor.mobile_number ? `Mobile: ${data.vendor.mobile_number}` : '',
  ].filter(Boolean).join(' | ');
  if (vContact) {
    doc.text(vContact, margin + 5, y + 11.5);
  }

  if (data.vendor.gstin) {
    doc.text(`GSTIN: ${data.vendor.gstin}`, pageWidth - margin - 5, y + 6, { align: 'right' });
  }
  if (data.vendor.address) {
    doc.text(`Address: ${data.vendor.address}`, pageWidth - margin - 5, y + 11.5, { align: 'right' });
  }

  y += 20;

  // ── 3. Executive Metrics: Physical Stock vs Financial Liability ──
  const boxWidth = (pageWidth - margin * 2 - 6) / 2;

  // Card 1: Physical Linen Pending (Amber)
  doc.setFillColor(254, 252, 232); // light amber
  doc.setDrawColor(245, 158, 11); // amber-500
  doc.roundedRect(margin, y, boxWidth, 23, 2, 2, 'FD');

  doc.setTextColor(180, 83, 9); // amber-700
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('PHYSICAL LINEN PENDING', margin + 5, y + 6);

  doc.setFontSize(14);
  doc.setTextColor(146, 64, 14); // amber-900
  doc.text(`${data.physical_pending_pieces} Pieces`, margin + 5, y + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 83, 9);
  doc.text('Physical linen with vendor • ₹0 billing until returned', margin + 5, y + 19);

  // Card 2: Financial Payment Due (Rose)
  const rightBoxX = margin + boxWidth + 6;
  doc.setFillColor(255, 241, 242); // light rose
  doc.setDrawColor(244, 63, 94); // rose-500
  doc.roundedRect(rightBoxX, y, boxWidth, 23, 2, 2, 'FD');

  doc.setTextColor(190, 18, 60); // rose-700
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('VENDOR PAYMENT DUE', rightBoxX + 5, y + 6);

  doc.setFontSize(14);
  doc.setTextColor(159, 18, 57); // rose-900
  doc.text(rs(data.financial_due_amount), rightBoxX + 5, y + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(190, 18, 60);
  doc.text(`Total Bills: ${rs(data.total_billed_amount)} | Total Paid: ${rs(data.total_paid_amount)}`, rightBoxX + 5, y + 19);

  y += 27;

  // ── 4. Explicit Distinction Callout ──
  const bannerWidth = pageWidth - margin * 2;
  doc.setFillColor(239, 246, 255); // light blue
  doc.setDrawColor(191, 219, 254);
  doc.roundedRect(margin, y, bannerWidth, 10, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 64, 175);
  doc.text('Authoritative Rule:', margin + 4, y + 6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Physical Linen Pending (${data.physical_pending_pieces} pcs) and Payment Due (${rs(data.financial_due_amount)}) are tracked independently. Pending items have ₹0 billing until actually returned.`,
    margin + 33,
    y + 6.5
  );

  y += 14;

  const mode = data.viewMode || 'daily';

  // ── 5. Date-Wise Ledger Table ──
  if (mode === 'daily' || mode === 'both') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...C.headerBg);
    doc.text('DATE-WISE BALANCE LEDGER', margin, y);
    y += 3;

    const dailyRows = (data.daily_ledger || []).map((row) => [
      fmtDatePdf(row.date),
      row.sent_qty > 0 ? `${row.sent_qty} pcs` : '—',
      row.received_qty > 0 ? `${row.received_qty} pcs` : '—',
      `${row.pending_qty} pcs`,
      row.bill_amount > 0 ? rs(row.bill_amount) : '—',
      row.paid_amount > 0 ? rs(row.paid_amount) : '—',
      rs(row.payment_due),
      row.details || '—',
    ]);

    const totalSent = (data.daily_ledger || []).reduce((s, r) => s + (r.sent_qty || 0), 0);
    const totalRecv = (data.daily_ledger || []).reduce((s, r) => s + (r.received_qty || 0), 0);

    const footRow = [
      'TOTAL / CURRENT',
      `${totalSent} pcs`,
      `${totalRecv} pcs`,
      `${data.physical_pending_pieces} pcs`,
      rs(data.total_billed_amount),
      rs(data.total_paid_amount),
      rs(data.financial_due_amount),
      'Closing Balance',
    ];

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Date', 'Sent Qty', 'Recv Qty', 'Pending', 'Bill Amount', 'Paid Amount', 'Payment Due', 'Activity Details']],
      body: dailyRows.length > 0 ? dailyRows : [['No ledger activity recorded for this period', '', '', '', '', '', '', '']],
      foot: dailyRows.length > 0 ? [footRow] : undefined,
      headStyles: {
        fillColor: C.sectionBg,
        textColor: C.sectionText,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
      },
      footStyles: {
        fillColor: C.footBg,
        textColor: C.footText,
        fontStyle: 'bold',
        fontSize: 8,
      },
      bodyStyles: {
        textColor: C.text,
        fontSize: 7.5,
        halign: 'center',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 22, fontStyle: 'bold' },
        1: { halign: 'right', cellWidth: 16 },
        2: { halign: 'right', cellWidth: 16 },
        3: { halign: 'right', cellWidth: 18, fontStyle: 'bold' },
        4: { halign: 'right', cellWidth: 23 },
        5: { halign: 'right', cellWidth: 23 },
        6: { halign: 'right', cellWidth: 25, fontStyle: 'bold' },
        7: { halign: 'left' },
      },
      alternateRowStyles: {
        fillColor: C.altRow,
      },
    });

    y = ((doc as any).lastAutoTable?.finalY || y + 40) + 8;
  }

  // ── 6. Transaction Trail Table (if selected mode or both) ──
  if (mode === 'transactions' || (mode === 'both' && data.transactions && data.transactions.length > 0)) {
    // If not enough room on page for table header + a couple rows, add page
    if (y + 40 > pageHeight - margin) {
      doc.addPage();
      y = margin + 5;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...C.headerBg);
    doc.text('TRANSACTION AUDIT TRAIL', margin, y);
    y += 3;

    const txRows = (data.transactions || []).map((t) => [
      fmtDatePdf(t.date),
      t.type,
      t.reference || '—',
      t.description || '—',
      t.bill_amount > 0 ? rs(t.bill_amount) : '—',
      t.paid_amount > 0 ? rs(t.paid_amount) : '—',
      rs(t.balance_due),
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Date', 'Type', 'Reference', 'Description', 'Bill Amount', 'Paid Amount', 'Balance Due']],
      body: txRows.length > 0 ? txRows : [['No transactions recorded for this period', '', '', '', '', '', '']],
      headStyles: {
        fillColor: [45, 55, 72],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
      },
      bodyStyles: {
        textColor: C.text,
        fontSize: 7.5,
        halign: 'center',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 22, fontStyle: 'bold' },
        1: { halign: 'center', cellWidth: 20 },
        2: { halign: 'center', cellWidth: 25 },
        3: { halign: 'left' },
        4: { halign: 'right', cellWidth: 24 },
        5: { halign: 'right', cellWidth: 24 },
        6: { halign: 'right', cellWidth: 26, fontStyle: 'bold' },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    });

    y = ((doc as any).lastAutoTable?.finalY || y + 40) + 8;
  }

  // ── 7. Signatures & Acknowledgment ──
  if (y + 30 > pageHeight - 15) {
    doc.addPage();
    y = margin + 15;
  } else {
    y += 6;
  }

  doc.setDrawColor(...C.border);
  doc.line(margin + 10, y + 12, margin + 65, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.muted);
  doc.text('Authorized Hotel Signature', margin + 14, y + 17);

  doc.line(pageWidth - margin - 65, y + 12, pageWidth - margin - 10, y + 12);
  doc.text('Laundry Vendor Signature', pageWidth - margin - 60, y + 17);

  // ── 8. Footers on all pages (Timestamp & Page X of Y) ──
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.setDrawColor(...C.border);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
    doc.text(
      `Generated on ${new Date().toLocaleString('en-IN')} • Hotel Mantri Laundry & Linen PMS`,
      margin,
      pageHeight - 6
    );
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
  }

  return doc.output('blob');
};

export const downloadVendorLedgerPdf = async (
  data: VendorLedgerPdfData,
  filename?: string
): Promise<void> => {
  const blob = await generateVendorLedgerPdf(data);
  const vendorNameClean = (data.vendor.vendor_name || 'Vendor').replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateStr = (data.generatedDate || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const fname = filename || `Vendor_Ledger_${vendorNameClean}_${dateStr}.pdf`;
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
  generateVendorLedgerPdf,
  downloadVendorLedgerPdf,
};
