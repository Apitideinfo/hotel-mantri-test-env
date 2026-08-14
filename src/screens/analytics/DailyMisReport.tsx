import { useEffect, useState, useMemo } from 'react';
import {
  FileText, Download, Printer, MessageCircle, Mail, Loader2,
  Building2, BedDouble, TrendingUp, Receipt, Wallet, Percent,
} from 'lucide-react';
import type { HotelSettings, DerivedReport, RoomChartEntry } from '@/lib/types';
import { getSettings, getDerivedReport, getRoomChart, getMtdYtd } from '@/lib/api';
import { toNum, fmtMoney, fmtInt, calcArr, calcOcc, calcTotalRevenue, calcTotalExpenses, splitGst, aggregateRoomChart, derivedToDaily } from '@/lib/calc';
import { generateWhatsAppReport } from '@/lib/whatsapp';
import { ScreenHeader, SectionCard, Banner } from '@/components/finance-ui';

export const DailyMisReport = ({ onBack }: { onBack: () => void }) => {
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [report, setReport] = useState<DerivedReport | null>(null);
  const [entries, setEntries] = useState<RoomChartEntry[]>([]);
  const [mtdData, setMtdData] = useState<{ mtd_data: { total_revenue: number; rooms_sold: number; arr: number; occupancy: number } } | null>(null);
  const [businessDate, setBusinessDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managerRemarks, setManagerRemarks] = useState('');
  const [ownerRemarks, setOwnerRemarks] = useState('');
  const [operationalNotes, setOperationalNotes] = useState('');
  const [whatsappCopied, setWhatsappCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const s = await getSettings();
        setSettings(s);
        const [r, ents, mtd] = await Promise.all([
          getDerivedReport(businessDate, s.total_rooms, s.opening_cash_balance),
          getRoomChart(businessDate),
          getMtdYtd(businessDate),
        ]);
        setReport(r);
        setEntries(ents);
        setMtdData(mtd as typeof mtdData);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [businessDate]);

  const agg = useMemo(() => aggregateRoomChart(entries), [entries]);

  const handlePrint = () => window.print();

  const handleWhatsApp = async () => {
    if (!report || !settings) return;
    const daily = derivedToDaily(report);
    const mtd = { revenue: mtdData?.mtd_data?.total_revenue ?? 0, occupancy: mtdData?.mtd_data?.rooms_sold ?? 0 };
    const text = generateWhatsAppReport(daily, settings.total_rooms, mtd, settings.hotel_name);
    try {
      await navigator.clipboard.writeText(text);
      setWhatsappCopied(true);
      setTimeout(() => setWhatsappCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const handleExcel = () => {
    if (!report || !settings) return;
    const rows: [string, string][] = [
      ['Hotel Summary', ''],
      ['Hotel Name', settings.hotel_name],
      ['Business Date', businessDate],
      ['Total Rooms', String(settings.total_rooms)],
      ['', ''],
      ['Room Summary', ''],
      ['Rooms Occupied', String(report.rooms_occupied)],
      ['Complimentary', String(report.complimentary_room)],
      ['Occupancy %', calcOcc(report.rooms_occupied, settings.total_rooms).toFixed(1)],
      ['ARR', fmtMoney(calcArr(report.room_sale_amount, report.rooms_occupied))],
      ['Departures', String(report.departure)],
      ['Expected Arrivals', String(report.expected_arrival)],
      ['', ''],
      ['Revenue Summary', ''],
      ['Room Revenue', fmtMoney(report.room_revenue)],
      ['F&B Revenue', fmtMoney(report.fb_revenue)],
      ['Misc Revenue', fmtMoney(report.misc_revenue)],
      ['Other Revenue', fmtMoney(toNum(report.other_revenue_entries))],
      ['Total Revenue', fmtMoney(calcTotalRevenue(report))],
      ['', ''],
      ['Booking Source Summary', ''],
      ['OTA', fmtMoney(report.ota)],
      ['Direct/Walking', fmtMoney(report.direct_walking)],
      ['Corporate/Agent', fmtMoney(report.corporate_agent)],
      ['Phonebook', fmtMoney(report.phonebook)],
      ['', ''],
      ['Payment Summary', ''],
      ['Cash', fmtMoney(toNum(report.pay_cash))],
      ['UPI', fmtMoney(toNum(report.pay_upi))],
      ['Card', fmtMoney(toNum(report.pay_card))],
      ['Bank', fmtMoney(toNum(report.pay_bank))],
      ['Advance', fmtMoney(toNum(report.pay_advance))],
      ['Balance', fmtMoney(toNum(report.pay_balance))],
      ['', ''],
      ['GST Summary', ''],
      ['Taxable Revenue', fmtMoney(toNum(report.taxable_revenue))],
      ['GST Collected', fmtMoney(toNum(report.gst_collected))],
      ['CGST', fmtMoney(splitGst(toNum(report.gst_collected)).cgst)],
      ['SGST', fmtMoney(splitGst(toNum(report.gst_collected)).sgst)],
      ['IGST', fmtMoney(splitGst(toNum(report.gst_collected)).igst)],
      ['', ''],
      ['Expense Summary', ''],
      ['Housekeeping', fmtMoney(toNum(report.housekeeping_supply))],
      ['Maintenance', fmtMoney(toNum(report.maintenance_bill))],
      ['Other', fmtMoney(toNum(report.other_expense))],
      ['Finance Expenses', fmtMoney(toNum(report.finance_expenses))],
      ['Total Expenses', fmtMoney(calcTotalExpenses(report))],
      ['', ''],
      ['Cash Summary', ''],
      ['Cash Closing', fmtMoney(toNum(report.cash_closing))],
      ['Cash Handover', fmtMoney(toNum(report.cash_handover_md))],
      ['Bank Deposit', fmtMoney(toNum(report.bank_cash_deposit))],
      ['', ''],
      ['MTD Summary', ''],
      ['MTD Revenue', fmtMoney(mtdData?.mtd_data?.total_revenue ?? 0)],
      ['MTD Rooms Sold', String(mtdData?.mtd_data?.rooms_sold ?? 0)],
      ['MTD ARR', fmtMoney(mtdData?.mtd_data?.arr ?? 0)],
      ['MTD Occupancy', `${(mtdData?.mtd_data?.occupancy ?? 0).toFixed(0)}%`],
      ['', ''],
      ['Remarks', ''],
      ['Operational Notes', operationalNotes],
      ['Manager Remarks', managerRemarks],
      ['Owner Remarks', ownerRemarks],
    ];
    const csv = rows.map(([k, v]) => `"${k}","${v}"`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MIS-${businessDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePDF = async () => {
    if (!report || !settings) return;
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    let y = 15;

    // Header
    doc.setFillColor(15, 28, 48);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(settings.hotel_name ?? 'Hotel', 14, 12);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Daily MIS Report — ${businessDate}`, 14, 20);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, pageW - 14, 20, { align: 'right' });
    y = 36;

    const addSection = (title: string, rows: [string, string][]) => {
      doc.setFillColor(238, 242, 247);
      doc.rect(14, y - 4, pageW - 28, 8, 'F');
      doc.setTextColor(15, 28, 48);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text(title.toUpperCase(), 16, y + 1);
      y += 8;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(44, 62, 80);
      for (const [k, v] of rows) {
        doc.text(k, 16, y);
        doc.text(v, pageW - 16, y, { align: 'right' });
        y += 5;
        if (y > 270) { doc.addPage(); y = 15; }
      }
      y += 3;
    };

    addSection('Hotel Summary', [
      ['Total Rooms', String(settings.total_rooms)],
      ['Rooms Occupied', String(report.rooms_occupied)],
      ['Complimentary', String(report.complimentary_room)],
      ['Occupancy %', `${calcOcc(report.rooms_occupied, settings.total_rooms).toFixed(1)}%`],
      ['ARR', `Rs. ${fmtMoney(calcArr(report.room_sale_amount, report.rooms_occupied))}`],
    ]);
    addSection('Revenue Summary', [
      ['Room Revenue', `Rs. ${fmtMoney(report.room_revenue)}`],
      ['F&B Revenue', `Rs. ${fmtMoney(report.fb_revenue)}`],
      ['Misc Revenue', `Rs. ${fmtMoney(report.misc_revenue)}`],
      ['Other Revenue', `Rs. ${fmtMoney(toNum(report.other_revenue_entries))}`],
      ['Total Revenue', `Rs. ${fmtMoney(calcTotalRevenue(report))}`],
    ]);
    addSection('Booking Source Summary', [
      ['OTA', `Rs. ${fmtMoney(report.ota)}`],
      ['Direct/Walking', `Rs. ${fmtMoney(report.direct_walking)}`],
      ['Corporate/Agent', `Rs. ${fmtMoney(report.corporate_agent)}`],
      ['Phonebook', `Rs. ${fmtMoney(report.phonebook)}`],
    ]);
    addSection('Payment Summary', [
      ['Cash', `Rs. ${fmtMoney(toNum(report.pay_cash))}`],
      ['UPI', `Rs. ${fmtMoney(toNum(report.pay_upi))}`],
      ['Card', `Rs. ${fmtMoney(toNum(report.pay_card))}`],
      ['Bank', `Rs. ${fmtMoney(toNum(report.pay_bank))}`],
      ['Pending Balance', `Rs. ${fmtMoney(toNum(report.pay_balance))}`],
    ]);
    const gst = splitGst(toNum(report.gst_collected));
    addSection('GST Summary', [
      ['Taxable Revenue', `Rs. ${fmtMoney(toNum(report.taxable_revenue))}`],
      ['GST Collected', `Rs. ${fmtMoney(toNum(report.gst_collected))}`],
      ['CGST', `Rs. ${fmtMoney(gst.cgst)}`],
      ['SGST', `Rs. ${fmtMoney(gst.sgst)}`],
      ['IGST', `Rs. ${fmtMoney(gst.igst)}`],
    ]);
    addSection('Expense Summary', [
      ['Housekeeping', `Rs. ${fmtMoney(toNum(report.housekeeping_supply))}`],
      ['Maintenance', `Rs. ${fmtMoney(toNum(report.maintenance_bill))}`],
      ['Other', `Rs. ${fmtMoney(toNum(report.other_expense))}`],
      ['Finance Expenses', `Rs. ${fmtMoney(toNum(report.finance_expenses))}`],
      ['Total Expenses', `Rs. ${fmtMoney(calcTotalExpenses(report))}`],
    ]);
    addSection('Cash Summary', [
      ['Cash Closing', `Rs. ${fmtMoney(toNum(report.cash_closing))}`],
      ['Cash Handover MD', `Rs. ${fmtMoney(toNum(report.cash_handover_md))}`],
      ['Bank Cash Deposit', `Rs. ${fmtMoney(toNum(report.bank_cash_deposit))}`],
    ]);
    addSection('MTD Summary', [
      ['MTD Revenue', `Rs. ${fmtMoney(mtdData?.mtd_data?.total_revenue ?? 0)}`],
      ['MTD Rooms Sold', String(mtdData?.mtd_data?.rooms_sold ?? 0)],
      ['MTD ARR', `Rs. ${fmtMoney(mtdData?.mtd_data?.arr ?? 0)}`],
      ['MTD Occupancy', `${(mtdData?.mtd_data?.occupancy ?? 0).toFixed(0)}%`],
    ]);

    doc.save(`MIS-Report-${businessDate}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <ScreenHeader title="Daily MIS Report" subtitle="" onBack={onBack} icon={<FileText className="w-5 h-5 text-sky-300" />} />
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-sky-600" /></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <ScreenHeader title="Daily MIS Report" subtitle="Professional report with all sections" onBack={onBack} icon={<FileText className="w-5 h-5 text-sky-300" />} />

      <main className="px-4 py-4 space-y-4 max-w-4xl mx-auto">
        {error && <Banner kind="error">{error}</Banner>}

        {/* Date + Export buttons */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-3">
          <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          <div className="flex gap-2 ml-auto">
            <ExportBtn icon={<Download className="w-4 h-4" />} label="PDF" onClick={handlePDF} />
            <ExportBtn icon={<Download className="w-4 h-4" />} label="Excel" onClick={handleExcel} />
            <ExportBtn icon={<Printer className="w-4 h-4" />} label="Print" onClick={handlePrint} />
            <ExportBtn icon={<MessageCircle className="w-4 h-4" />} label={whatsappCopied ? 'Copied!' : 'WhatsApp'} onClick={handleWhatsApp} />
          </div>
        </div>

        {report && settings && (
          <>
            {/* Hotel Summary */}
            <SectionCard title="Hotel Summary" icon={<Building2 className="w-4 h-4 text-brand-navy-700" />}>
              <Row label="Hotel Name" value={settings.hotel_name ?? '—'} />
              <Row label="Business Date" value={new Date(businessDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
              <Row label="Total Rooms" value={fmtInt(settings.total_rooms)} />
            </SectionCard>

            {/* Room Summary */}
            <SectionCard title="Room Summary" icon={<BedDouble className="w-4 h-4 text-brand-600" />}>
              <Row label="Rooms Occupied" value={fmtInt(report.rooms_occupied)} />
              <Row label="Complimentary" value={fmtInt(report.complimentary_room)} />
              <Row label="Occupancy %" value={`${calcOcc(report.rooms_occupied, settings.total_rooms).toFixed(1)}%`} />
              <Row label="ARR" value={`₹${fmtMoney(calcArr(report.room_sale_amount, report.rooms_occupied))}`} />
              <Row label="Departures" value={fmtInt(report.departure)} />
              <Row label="Expected Arrivals" value={fmtInt(report.expected_arrival)} />
            </SectionCard>

            {/* Revenue Summary */}
            <SectionCard title="Revenue Summary" icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}>
              <Row label="Room Revenue" value={`₹${fmtMoney(report.room_revenue)}`} />
              <Row label="F&B Revenue" value={`₹${fmtMoney(report.fb_revenue)}`} />
              <Row label="Misc Revenue" value={`₹${fmtMoney(report.misc_revenue)}`} />
              <Row label="Other Revenue" value={`₹${fmtMoney(toNum(report.other_revenue_entries))}`} />
              <Row label="Total Revenue" value={`₹${fmtMoney(calcTotalRevenue(report))}`} strong />
            </SectionCard>

            {/* Booking Source Summary */}
            <SectionCard title="Booking Source Summary" icon={<TrendingUp className="w-4 h-4 text-blue-600" />}>
              <Row label="OTA" value={`₹${fmtMoney(report.ota)}`} />
              <Row label="Direct/Walking" value={`₹${fmtMoney(report.direct_walking)}`} />
              <Row label="Corporate/Agent" value={`₹${fmtMoney(report.corporate_agent)}`} />
              <Row label="Phonebook" value={`₹${fmtMoney(report.phonebook)}`} />
            </SectionCard>

            {/* Payment Summary */}
            <SectionCard title="Payment Summary" icon={<Wallet className="w-4 h-4 text-teal-600" />}>
              <Row label="Cash" value={`₹${fmtMoney(toNum(report.pay_cash))}`} />
              <Row label="UPI" value={`₹${fmtMoney(toNum(report.pay_upi))}`} />
              <Row label="Card" value={`₹${fmtMoney(toNum(report.pay_card))}`} />
              <Row label="Bank" value={`₹${fmtMoney(toNum(report.pay_bank))}`} />
              <Row label="Advance" value={`₹${fmtMoney(toNum(report.pay_advance))}`} />
              <Row label="Pending Balance" value={`₹${fmtMoney(toNum(report.pay_balance))}`} />
            </SectionCard>

            {/* GST Summary */}
            <SectionCard title="GST Summary" icon={<Percent className="w-4 h-4 text-indigo-600" />}>
              <Row label="Taxable Revenue" value={`₹${fmtMoney(toNum(report.taxable_revenue))}`} />
              <Row label="GST Collected" value={`₹${fmtMoney(toNum(report.gst_collected))}`} />
              {(() => { const g = splitGst(toNum(report.gst_collected)); return (
                <>
                  <Row label="CGST" value={`₹${fmtMoney(g.cgst)}`} />
                  <Row label="SGST" value={`₹${fmtMoney(g.sgst)}`} />
                  <Row label="IGST" value={`₹${fmtMoney(g.igst)}`} />
                </>
              ); })()}
            </SectionCard>

            {/* Expense Summary */}
            <SectionCard title="Expense Summary" icon={<Receipt className="w-4 h-4 text-red-600" />}>
              <Row label="Housekeeping" value={`₹${fmtMoney(toNum(report.housekeeping_supply))}`} />
              <Row label="Maintenance" value={`₹${fmtMoney(toNum(report.maintenance_bill))}`} />
              <Row label="Other" value={`₹${fmtMoney(toNum(report.other_expense))}`} />
              {(report.finance_expense_by_category ?? []).map((c) => (
                <Row key={c.category} label={c.category} value={`₹${fmtMoney(toNum(c.amount))}`} />
              ))}
              <Row label="Total Expenses" value={`₹${fmtMoney(calcTotalExpenses(report))}`} strong />
            </SectionCard>

            {/* Cash Summary */}
            <SectionCard title="Cash Summary" icon={<Wallet className="w-4 h-4 text-emerald-600" />}>
              <Row label="Cash Closing" value={`₹${fmtMoney(toNum(report.cash_closing))}`} />
              <Row label="Cash Handover MD" value={`₹${fmtMoney(toNum(report.cash_handover_md))}`} />
              <Row label="Bank Cash Deposit" value={`₹${fmtMoney(toNum(report.bank_cash_deposit))}`} />
            </SectionCard>

            {/* KPI Summary */}
            <SectionCard title="KPI Summary" icon={<TrendingUp className="w-4 h-4 text-brand-gold-600" />}>
              <Row label="Occupancy" value={`${calcOcc(report.rooms_occupied, settings.total_rooms).toFixed(1)}%`} />
              <Row label="ARR" value={`₹${fmtMoney(calcArr(report.room_sale_amount, report.rooms_occupied))}`} />
              <Row label="RevPAR" value={`₹${fmtMoney(settings.total_rooms > 0 ? report.room_sale_amount / settings.total_rooms : 0)}`} />
              <Row label="Profit Estimate" value={`₹${fmtMoney(calcTotalRevenue(report) - calcTotalExpenses(report))}`} />
            </SectionCard>

            {/* MTD Summary */}
            <SectionCard title="MTD Summary" icon={<TrendingUp className="w-4 h-4 text-brand-600" />}>
              <Row label="MTD Revenue" value={`₹${fmtMoney(mtdData?.mtd_data?.total_revenue ?? 0)}`} />
              <Row label="MTD Rooms Sold" value={fmtInt(mtdData?.mtd_data?.rooms_sold ?? 0)} />
              <Row label="MTD ARR" value={`₹${fmtMoney(mtdData?.mtd_data?.arr ?? 0)}`} />
              <Row label="MTD Occupancy" value={`${(mtdData?.mtd_data?.occupancy ?? 0).toFixed(0)}%`} />
            </SectionCard>

            {/* Remarks */}
            <SectionCard title="Operational Notes" icon={<FileText className="w-4 h-4 text-slate-600" />}>
              <textarea value={operationalNotes} onChange={(e) => setOperationalNotes(e.target.value)}
                placeholder="Add operational notes for the day…"
                rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-900 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </SectionCard>
            <SectionCard title="Manager Remarks" icon={<FileText className="w-4 h-4 text-slate-600" />}>
              <textarea value={managerRemarks} onChange={(e) => setManagerRemarks(e.target.value)}
                placeholder="Manager remarks…"
                rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-900 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </SectionCard>
            <SectionCard title="Owner Remarks" icon={<FileText className="w-4 h-4 text-slate-600" />}>
              <textarea value={ownerRemarks} onChange={(e) => setOwnerRemarks(e.target.value)}
                placeholder="Owner remarks…"
                rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-900 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </SectionCard>
          </>
        )}
      </main>
    </div>
  );
};

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={`flex items-baseline justify-between py-1.5 ${strong ? 'pt-2 mt-1 border-t border-slate-200' : 'border-b border-slate-100 last:border-0'}`}>
    <span className={`text-sm ${strong ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{label}</span>
    <span className={`text-sm font-semibold tabular-nums ${strong ? 'text-brand-navy-800' : 'text-slate-800'}`}>{value}</span>
  </div>
);

const ExportBtn = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) => (
  <button onClick={onClick} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm border border-slate-200 transition">
    {icon} {label}
  </button>
);
