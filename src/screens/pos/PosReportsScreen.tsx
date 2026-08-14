import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, BarChart3, Calendar, Download, Printer, FileText,
  TrendingUp, CreditCard, Armchair, BedDouble, ShoppingBag, Percent, Ban,
  UtensilsCrossed, Layers,
} from 'lucide-react';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { getPosReportData, posDateRange } from '@/lib/api-pos';
import type { PosReportData, DateRange } from '@/lib/api-pos';
import { getSettings } from '@/lib/api';
import type { HotelSettings } from '@/lib/types';

interface PosReportsScreenProps {
  onBack: () => void;
}

const fmt2 = (n: number): string => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rs = (n: number): string => `Rs.${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const RANGES: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'custom', label: 'Custom' },
];

type ReportTab = 'sales' | 'payment' | 'order_type' | 'items' | 'category' | 'table' | 'room_service' | 'discount' | 'void';

const TABS: { key: ReportTab; label: string; icon: React.ReactNode }[] = [
  { key: 'sales', label: 'Sales Summary', icon: <TrendingUp className="w-4 h-4" /> },
  { key: 'payment', label: 'Payment Modes', icon: <CreditCard className="w-4 h-4" /> },
  { key: 'order_type', label: 'Order Types', icon: <ShoppingBag className="w-4 h-4" /> },
  { key: 'items', label: 'Item Sales', icon: <UtensilsCrossed className="w-4 h-4" /> },
  { key: 'category', label: 'Category Sales', icon: <Layers className="w-4 h-4" /> },
  { key: 'table', label: 'Table Sales', icon: <Armchair className="w-4 h-4" /> },
  { key: 'room_service', label: 'Room Service', icon: <BedDouble className="w-4 h-4" /> },
  { key: 'discount', label: 'Discounts', icon: <Percent className="w-4 h-4" /> },
  { key: 'void', label: 'Voids', icon: <Ban className="w-4 h-4" /> },
];

export const PosReportsScreen = ({ onBack }: PosReportsScreenProps) => {
  const [range, setRange] = useState<DateRange>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [tab, setTab] = useState<ReportTab>('sales');
  const [data, setData] = useState<PosReportData | null>(null);
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dateRange = useCallback(() => {
    return posDateRange(range, customStart, customEnd);
  }, [range, customStart, customEnd]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dr = dateRange();
      const d = await getPosReportData(dr);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    getSettings().then(setSettings).catch(() => {});
  }, []);

  useEffect(() => {
    if (range !== 'custom' || (customStart && customEnd)) {
      load();
    }
  }, [range, customStart, customEnd, load]);

  const rangeLabel = () => {
    const dr = dateRange();
    return `${dr.start.slice(0, 10)} to ${dr.end.slice(0, 10)}`;
  };

  // ── CSV export ──
  const exportCsv = () => {
    if (!data) return;
    let rows: string[][] = [];
    let filename = `POS-Report-${rangeLabel()}`;

    switch (tab) {
      case 'sales':
        rows = [
          ['Metric', 'Amount'],
          ['Gross Sales', rs(data.salesSummary.grossSales)],
          ['Discount', rs(data.salesSummary.discount)],
          ['Tax (GST)', rs(data.salesSummary.tax)],
          ['Net Sales', rs(data.salesSummary.netSales)],
          ['Paid Amount', rs(data.salesSummary.paidAmount)],
          ['Posted to Room', rs(data.salesSummary.postedToRoom)],
          ['Void Amount', rs(data.salesSummary.voidAmount)],
        ];
        filename = `POS-Sales-Summary-${rangeLabel()}`;
        break;
      case 'payment':
        rows = [
          ['Payment Mode', 'Amount'],
          ['Cash', rs(data.paymentModeReport.cash)],
          ['UPI', rs(data.paymentModeReport.upi)],
          ['Card', rs(data.paymentModeReport.card)],
          ['Bank Transfer', rs(data.paymentModeReport.bank)],
          ['Posted to Room', rs(data.paymentModeReport.postToRoom)],
        ];
        filename = `POS-Payment-Modes-${rangeLabel()}`;
        break;
      case 'order_type':
        rows = [
          ['Order Type', 'Revenue'],
          ['Dine-In', rs(data.orderTypeReport.dineIn)],
          ['Room Service', rs(data.orderTypeReport.roomService)],
          ['Takeaway', rs(data.orderTypeReport.takeaway)],
        ];
        filename = `POS-Order-Types-${rangeLabel()}`;
        break;
      case 'items':
        rows = [['Item', 'Category', 'Qty Sold', 'Gross Revenue', 'Net Revenue']];
        rows.push(...data.itemSales.map((i) => [i.name, i.category ?? '', String(i.qtySold), rs(i.grossRevenue), rs(i.netRevenue)]));
        filename = `POS-Item-Sales-${rangeLabel()}`;
        break;
      case 'category':
        rows = [['Category', 'Qty Sold', 'Revenue']];
        rows.push(...data.categorySales.map((c) => [c.category, String(c.qtySold), rs(c.revenue)]));
        filename = `POS-Category-Sales-${rangeLabel()}`;
        break;
      case 'table':
        rows = [['Table', 'Orders', 'Sales', 'Avg Bill']];
        rows.push(...data.tableSales.map((t) => [t.table, String(t.orders), rs(t.sales), rs(t.avgBill)]));
        filename = `POS-Table-Sales-${rangeLabel()}`;
        break;
      case 'room_service':
        rows = [['Room No', 'Guest', 'Order Count', 'Amount', 'Paid Now', 'Posted to Room']];
        rows.push(...data.roomServiceReport.map((r) => [r.roomNo, r.guest, String(r.orderCount), rs(r.amount), rs(r.paidNow), rs(r.postedToRoom)]));
        filename = `POS-Room-Service-${rangeLabel()}`;
        break;
      case 'discount':
        rows = [['Bill No', 'Discount', 'Reason', 'Date/Time']];
        rows.push(...data.discountReport.map((d) => [d.billNumber, rs(d.discount), d.reason ?? '', new Date(d.dateTime).toLocaleString('en-IN')]));
        filename = `POS-Discounts-${rangeLabel()}`;
        break;
      case 'void':
        rows = [['Bill No', 'Order No', 'Amount', 'Reason', 'User', 'Date/Time']];
        rows.push(...data.voidReport.map((v) => [v.billNumber, v.orderNumber, rs(v.amount), v.reason ?? '', v.user ?? '', new Date(v.dateTime).toLocaleString('en-IN')]));
        filename = `POS-Voids-${rangeLabel()}`;
        break;
    }

    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── PDF export ──
  const exportPdf = (mode: 'preview' | 'download') => {
    if (!data || !settings) return;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = 210;
    const lm = 14;
    const headerBg: [number, number, number] = [13, 71, 109];
    const sectionBg: [number, number, number] = [32, 101, 149];
    const border: [number, number, number] = [189, 215, 235];
    const footBg: [number, number, number] = [230, 242, 250];
    const muted: [number, number, number] = [100, 100, 100];
    const text: [number, number, number] = [30, 30, 30];

    // Header
    doc.setFillColor(...headerBg);
    doc.rect(0, 0, pw, 30, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(settings.hotel_name || 'Hotel Mantri', lm, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`POS Report — ${TABS.find((t) => t.key === tab)?.label}`, lm, 18);
    doc.text(rangeLabel(), lm, 23);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(new Date().toLocaleString('en-IN'), pw - lm, 12, { align: 'right' });
    doc.setDrawColor(...border);
    doc.setLineWidth(0.4);
    doc.line(0, 30, pw, 30);
    doc.setTextColor(...text);

    let y = 38;
    const head = (t: string) => {
      doc.setFillColor(...sectionBg);
      doc.rect(lm, y, pw - 28, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(t, lm + 3, y + 4.8);
      doc.setTextColor(...text);
      y += 10;
    };

    const tbl = (headers: string[], body: string[][], colWidths?: number[]) => {
      autoTable(doc, {
        startY: y,
        margin: { left: lm, right: lm },
        head: [headers],
        body,
        theme: 'grid',
        columnStyles: colWidths
          ? Object.fromEntries(colWidths.map((w, i) => [i, { cellWidth: w, overflow: 'linebreak' as const }]))
          : undefined,
        styles: { fontSize: 8, cellPadding: 2.5, lineColor: border, lineWidth: 0.2, textColor: text, overflow: 'linebreak' as const },
        headStyles: { fillColor: sectionBg, textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold' as const },
        alternateRowStyles: { fillColor: [240, 247, 253] },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    };

    switch (tab) {
      case 'sales':
        head('Sales Summary');
        tbl(['Metric', 'Amount'], [
          ['Gross Sales', rs(data.salesSummary.grossSales)],
          ['Discount', rs(data.salesSummary.discount)],
          ['Tax (GST)', rs(data.salesSummary.tax)],
          ['Net Sales', rs(data.salesSummary.netSales)],
          ['Paid Amount', rs(data.salesSummary.paidAmount)],
          ['Posted to Room', rs(data.salesSummary.postedToRoom)],
          ['Void Amount', rs(data.salesSummary.voidAmount)],
        ], [120, 50]);
        break;
      case 'payment':
        head('Payment Mode Report');
        tbl(['Payment Mode', 'Amount'], [
          ['Cash', rs(data.paymentModeReport.cash)],
          ['UPI', rs(data.paymentModeReport.upi)],
          ['Card', rs(data.paymentModeReport.card)],
          ['Bank Transfer', rs(data.paymentModeReport.bank)],
          ['Posted to Room', rs(data.paymentModeReport.postToRoom)],
        ], [120, 50]);
        break;
      case 'order_type':
        head('Order Type Report');
        tbl(['Order Type', 'Revenue'], [
          ['Dine-In', rs(data.orderTypeReport.dineIn)],
          ['Room Service', rs(data.orderTypeReport.roomService)],
          ['Takeaway', rs(data.orderTypeReport.takeaway)],
        ], [120, 50]);
        break;
      case 'items':
        head('Item Sales Report');
        tbl(['Item', 'Category', 'Qty', 'Gross Rev', 'Net Rev'],
          data.itemSales.map((i) => [i.name, i.category ?? '', String(i.qtySold), rs(i.grossRevenue), rs(i.netRevenue)]),
          [50, 40, 20, 35, 35]);
        break;
      case 'category':
        head('Category Sales Report');
        tbl(['Category', 'Qty Sold', 'Revenue'],
          data.categorySales.map((c) => [c.category, String(c.qtySold), rs(c.revenue)]),
          [80, 40, 50]);
        break;
      case 'table':
        head('Table Sales Report');
        tbl(['Table', 'Orders', 'Sales', 'Avg Bill'],
          data.tableSales.map((t) => [t.table, String(t.orders), rs(t.sales), rs(t.avgBill)]),
          [50, 30, 45, 45]);
        break;
      case 'room_service':
        head('Room Service Report');
        tbl(['Room No', 'Guest', 'Orders', 'Amount', 'Paid Now', 'Posted to Room'],
          data.roomServiceReport.map((r) => [r.roomNo, r.guest, String(r.orderCount), rs(r.amount), rs(r.paidNow), rs(r.postedToRoom)]),
          [25, 40, 20, 35, 30, 40]);
        break;
      case 'discount':
        head('Discount Report');
        tbl(['Bill No', 'Discount', 'Reason', 'Date/Time'],
          data.discountReport.map((d) => [d.billNumber, rs(d.discount), d.reason ?? '', new Date(d.dateTime).toLocaleString('en-IN')]),
          [35, 30, 55, 50]);
        break;
      case 'void':
        head('Void / Cancellation Report');
        tbl(['Bill No', 'Order No', 'Amount', 'Reason', 'User', 'Date/Time'],
          data.voidReport.map((v) => [v.billNumber, v.orderNumber, rs(v.amount), v.reason ?? '', v.user ?? '', new Date(v.dateTime).toLocaleString('en-IN')]),
          [30, 30, 30, 45, 30, 45]);
        break;
    }

    // Footer
    const ph = 297;
    doc.setFillColor(...footBg);
    doc.rect(0, ph - 10, pw, 10, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(...muted);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, lm, ph - 3.5);
    doc.text('Generated by Hotel Mantri  |  Your Hotel\'s Digital Manager', pw / 2, ph - 3.5, { align: 'center' });

    if (mode === 'preview') {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else {
      doc.save(`POS-Report-${tab}-${rangeLabel()}.pdf`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-brand-600" />
            <h1 className="text-lg font-bold text-brand-navy-800">POS Reports</h1>
          </div>
        </div>

        {/* Date filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="w-4 h-4 text-slate-400" />
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${range === r.value ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {r.label}
            </button>
          ))}
          {range === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600" />
              <span className="text-xs text-slate-400">to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600" />
            </div>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => exportPdf('preview')} disabled={!data} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button onClick={() => exportPdf('download')} disabled={!data} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <FileText className="w-3.5 h-3.5" /> PDF
            </button>
            <button onClick={exportCsv} disabled={!data} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="sticky top-[73px] z-[5] bg-white border-b border-slate-200 px-4 py-2 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${tab === t.key ? 'bg-brand-50 text-brand-600 border border-brand-200' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 max-w-5xl mx-auto">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600 mb-3">
            {error}
          </div>
        )}

        {loading && !data ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data ? (
          <ReportContent tab={tab} data={data} />
        ) : null}
      </div>
    </div>
  );
};

// ── Report content renderer ──

const ReportContent = ({ tab, data }: { tab: ReportTab; data: PosReportData }) => {
  const cardCls = 'rounded-xl bg-white border border-slate-200 overflow-hidden shadow-sm';
  const thCls = 'bg-slate-50 text-xs text-slate-500 uppercase font-semibold';

  switch (tab) {
    case 'sales':
      return (
        <div className={cardCls}>
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Sales Summary</h2>
          </div>
          <div className="p-4 space-y-2">
            <SummaryRow label="Gross Sales" value={fmt2(data.salesSummary.grossSales)} />
            <SummaryRow label="Discount" value={`- ${fmt2(data.salesSummary.discount)}`} color="text-red-500" />
            <SummaryRow label="Tax (GST)" value={fmt2(data.salesSummary.tax)} />
            <div className="border-t border-slate-100 pt-2">
              <SummaryRow label="Net Sales" value={fmt2(data.salesSummary.netSales)} bold />
            </div>
            <div className="border-t border-slate-100 pt-2 mt-2">
              <SummaryRow label="Paid Amount (Cash+UPI+Card+Bank)" value={fmt2(data.salesSummary.paidAmount)} color="text-emerald-600" />
              <SummaryRow label="Posted to Room (Folio, not collected)" value={fmt2(data.salesSummary.postedToRoom)} color="text-violet-600" />
              <SummaryRow label="Void Amount" value={fmt2(data.salesSummary.voidAmount)} color="text-red-500" />
            </div>
          </div>
        </div>
      );

    case 'payment':
      return (
        <div className={cardCls}>
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Payment Mode Report</h2>
          </div>
          <div className="p-4 space-y-2">
            <SummaryRow label="Cash" value={fmt2(data.paymentModeReport.cash)} color="text-emerald-600" />
            <SummaryRow label="UPI" value={fmt2(data.paymentModeReport.upi)} color="text-blue-600" />
            <SummaryRow label="Card" value={fmt2(data.paymentModeReport.card)} color="text-violet-600" />
            <SummaryRow label="Bank Transfer" value={fmt2(data.paymentModeReport.bank)} color="text-amber-600" />
            <SummaryRow label="Posted to Room" value={fmt2(data.paymentModeReport.postToRoom)} color="text-pink-600" />
            <div className="border-t border-slate-100 pt-2">
              <SummaryRow label="Total Collected (excl. Post to Room)" value={fmt2(data.paymentModeReport.cash + data.paymentModeReport.upi + data.paymentModeReport.card + data.paymentModeReport.bank)} bold />
            </div>
          </div>
        </div>
      );

    case 'order_type':
      return (
        <div className={cardCls}>
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Order Type Report</h2>
          </div>
          <div className="p-4 space-y-2">
            <SummaryRow label="Dine-In" value={fmt2(data.orderTypeReport.dineIn)} />
            <SummaryRow label="Room Service" value={fmt2(data.orderTypeReport.roomService)} />
            <SummaryRow label="Takeaway" value={fmt2(data.orderTypeReport.takeaway)} />
            <div className="border-t border-slate-100 pt-2">
              <SummaryRow label="Total" value={fmt2(data.orderTypeReport.dineIn + data.orderTypeReport.roomService + data.orderTypeReport.takeaway)} bold />
            </div>
          </div>
        </div>
      );

    case 'items':
      return (
        <div className={cardCls}>
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Item Sales Report</h2>
          </div>
          {data.itemSales.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className={thCls}><th className="text-left px-4 py-2">Item</th><th className="text-left px-2 py-2">Category</th><th className="text-right px-2 py-2">Qty</th><th className="text-right px-2 py-2">Gross Rev</th><th className="text-right px-4 py-2">Net Rev</th></tr></thead>
                <tbody>
                  {data.itemSales.map((it, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{it.name}</td>
                      <td className="px-2 py-2.5 text-slate-500">{it.category ?? '—'}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{it.qtySold}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-500">{fmt2(it.grossRevenue)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-800">{fmt2(it.netRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );

    case 'category':
      return (
        <div className={cardCls}>
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Category Sales Report</h2>
          </div>
          {data.categorySales.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className={thCls}><th className="text-left px-4 py-2">Category</th><th className="text-right px-2 py-2">Qty Sold</th><th className="text-right px-4 py-2">Revenue</th></tr></thead>
                <tbody>
                  {data.categorySales.map((c, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{c.category}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{c.qtySold}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-800">{fmt2(c.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );

    case 'table':
      return (
        <div className={cardCls}>
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Table Sales Report</h2>
          </div>
          {data.tableSales.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className={thCls}><th className="text-left px-4 py-2">Table</th><th className="text-right px-2 py-2">Orders</th><th className="text-right px-2 py-2">Sales</th><th className="text-right px-4 py-2">Avg Bill</th></tr></thead>
                <tbody>
                  {data.tableSales.map((t, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{t.table}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{t.orders}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums font-semibold text-slate-800">{fmt2(t.sales)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{fmt2(t.avgBill)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );

    case 'room_service':
      return (
        <div className={cardCls}>
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Room Service Report</h2>
          </div>
          {data.roomServiceReport.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className={thCls}><th className="text-left px-4 py-2">Room No</th><th className="text-left px-2 py-2">Guest</th><th className="text-right px-2 py-2">Orders</th><th className="text-right px-2 py-2">Amount</th><th className="text-right px-2 py-2">Paid Now</th><th className="text-right px-4 py-2">Posted to Room</th></tr></thead>
                <tbody>
                  {data.roomServiceReport.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{r.roomNo}</td>
                      <td className="px-2 py-2.5 text-slate-600">{r.guest || '—'}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{r.orderCount}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums font-semibold text-slate-800">{fmt2(r.amount)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-emerald-600">{fmt2(r.paidNow)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-violet-600">{fmt2(r.postedToRoom)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );

    case 'discount':
      return (
        <div className={cardCls}>
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Discount Report</h2>
          </div>
          {data.discountReport.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className={thCls}><th className="text-left px-4 py-2">Bill No</th><th className="text-right px-2 py-2">Discount</th><th className="text-left px-2 py-2">Reason</th><th className="text-right px-4 py-2">Date/Time</th></tr></thead>
                <tbody>
                  {data.discountReport.map((d, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{d.billNumber}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-red-500 font-semibold">{fmt2(d.discount)}</td>
                      <td className="px-2 py-2.5 text-slate-500">{d.reason || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-slate-400">{new Date(d.dateTime).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );

    case 'void':
      return (
        <div className={cardCls}>
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Void / Cancellation Report</h2>
          </div>
          {data.voidReport.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className={thCls}><th className="text-left px-4 py-2">Bill No</th><th className="text-left px-2 py-2">Order No</th><th className="text-right px-2 py-2">Amount</th><th className="text-left px-2 py-2">Reason</th><th className="text-left px-2 py-2">User</th><th className="text-right px-4 py-2">Date/Time</th></tr></thead>
                <tbody>
                  {data.voidReport.map((v, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{v.billNumber}</td>
                      <td className="px-2 py-2.5 text-slate-600">{v.orderNumber}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-red-500 font-semibold">{fmt2(v.amount)}</td>
                      <td className="px-2 py-2.5 text-slate-500">{v.reason || '—'}</td>
                      <td className="px-2 py-2.5 text-slate-500">{v.user || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-slate-400">{new Date(v.dateTime).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
  }
};

const SummaryRow = ({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) => (
  <div className="flex items-center justify-between text-sm">
    <span className={bold ? 'font-bold text-slate-800' : 'text-slate-500'}>{label}</span>
    <span className={`tabular-nums ${bold ? 'font-bold text-slate-800' : 'font-semibold'} ${color ?? 'text-slate-700'}`}>{value}</span>
  </div>
);

const Empty = () => (
  <div className="flex flex-col items-center justify-center py-10 text-center">
    <BarChart3 className="w-10 h-10 text-slate-200 mb-2" />
    <p className="text-sm text-slate-400">No data for this period.</p>
  </div>
);
