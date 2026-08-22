import { useEffect, useState } from 'react';
import { ArrowLeft, MessageCircle, Pencil, BedDouble, Info, FileText, Calendar, TrendingUp, DollarSign, ShieldCheck } from 'lucide-react';
import type { HotelSettings, DerivedReport } from '@/lib/types';
import { getSettings, getDerivedReport, getDerivedReportsForMonth } from '@/lib/api';
import { calcArr, calcOcc, calcTotalRevenue, calcTotalExpenses, calcClosingRooms, aggregateDerived, fmtMoney, fmtInt, toNum } from '@/lib/calc';
import { ScreenHeader } from '@/components/finance-ui';

interface ReportViewProps {
  date: string;
  onBack: () => void;
  onNavigate: (screen: string, payload?: unknown) => void;
}

export const ReportView = ({ date, onBack, onNavigate }: ReportViewProps) => {
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [report, setReport] = useState<DerivedReport | null>(null);
  const [mtd, setMtd] = useState<{ revenue: number; occupancy: number }>({ revenue: 0, occupancy: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await getSettings().catch(() => null);
        if (!mounted) return;
        setSettings(s);
        const totalRooms = s?.total_rooms ?? 20;
        const openingCash = s?.opening_cash_balance ?? 10000;

        const r = await getDerivedReport(date, totalRooms, openingCash).catch(() => null);
        if (!mounted) return;
        setReport(r);

        const d = new Date(date + 'T00:00:00');
        const mtdReports = await getDerivedReportsForMonth(d.getFullYear(), d.getMonth() + 1, totalRooms, openingCash).catch(() => []);
        const mtdAgg = aggregateDerived(mtdReports, totalRooms, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
        if (mounted) setMtd({ revenue: mtdAgg.totalRevenue, occupancy: mtdAgg.roomsSold });
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Unable to load daily report');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [date]);

  const [y, m, d] = date.split('-');
  const displayDate = `${d}/${m}/${y}`;
  const totalRooms = settings?.total_rooms ?? 20;

  const defaultReport: DerivedReport = {
    report_date: date,
    rooms_occupied: 0,
    complimentary_room: 0,
    room_sale_amount: 0,
    ota: 0,
    direct_walking: 0,
    corporate_agent: 0,
    phonebook: 0,
    kitchen: 0,
    other_income: 0,
    other_revenue_entries: 0,
    housekeeping_supply: 0,
    other_expense: 0,
    maintenance_bill: 0,
    finance_expenses: 0,
    salary_advance: 0,
    cash_handover_md: 0,
    bank_cash_deposit: 0,
    pay_cash: 0,
    pay_upi: 0,
    pay_card: 0,
    pay_bank: 0,
    pay_advance: 0,
    pay_balance: 0,
    cash_closing: 0,
    bank: 0,
    taxable_revenue: 0,
    gst_collected: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    invoice_total: 0,
    net_revenue: 0,
    room_revenue: 0,
    fb_revenue: 0,
    misc_revenue: 0,
    departure: 0,
    expected_arrival: 0,
    expected_arr: 0,
    cash: 0,
    day_status: 'open',
    report_version: 1,
    finance_expense_by_category: [],
    other_revenue_by_category: [],
  };


  const activeReport = report ?? defaultReport;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <ScreenHeader title="Daily Report" subtitle={displayDate} onBack={onBack}
          icon={<FileText className="w-5 h-5 text-brand-600" />} />
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
          <div className="w-8 h-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin" />
          <p className="text-sm font-semibold text-slate-600">Generating daily operational report…</p>
        </div>
      </div>
    );
  }

  const hasData = report && (report.rooms_occupied > 0 || report.room_sale_amount > 0 || report.kitchen > 0 || report.other_income > 0);

  return (
    <div className="min-h-screen bg-slate-50 pb-36">
      <ScreenHeader
        title="Daily Report"
        subtitle={`Operational & Financial Summary · ${displayDate}`}
        onBack={onBack}
        icon={<FileText className="w-5 h-5 text-brand-600" />}
      />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {error && (
          <div className="bg-rose-50 border border-rose-200/80 text-rose-800 text-sm rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <Info className="w-5 h-5 shrink-0 text-rose-600" />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        {/* Informational Banner */}
        <div className="bg-brand-50/80 border border-brand-200/80 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center text-brand-700 shrink-0">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-brand-900">Auto-Calculated Report</p>
              <p className="text-xs text-brand-700 font-medium">All figures are aggregated in real-time from Room Chart and Front Office entries.</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('roomchart', { date })}
            className="hidden sm:flex items-center gap-2 px-3.5 py-2 bg-white border border-brand-200 text-brand-700 hover:bg-brand-50 rounded-xl text-xs font-bold shadow-xs transition"
          >
            <BedDouble className="w-4 h-4" /> Room Chart
          </button>
        </div>

        {/* 2-Column Grid for Analytics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Room Occupancy & Revenue Summary */}
          <ReportCard title="Room Occupancy & Revenue" icon={<BedDouble className="w-4 h-4 text-brand-600" />}>
            <ReportRow label="Total Rooms" value={fmtInt(totalRooms)} />
            <ReportRow label="Rooms Occupied" value={fmtInt(activeReport.rooms_occupied)} />
            <ReportRow label="Complimentary Room" value={fmtInt(activeReport.complimentary_room)} />
            <ReportRow label="ARR (Average Room Rate)" value={`₹${fmtMoney(calcArr(activeReport.room_sale_amount, activeReport.rooms_occupied - activeReport.complimentary_room))}`} />
            <ReportRow label="OCC %" value={`${calcOcc(activeReport.rooms_occupied, totalRooms).toFixed(0)}%`} />
            <ReportRow label="RevPAR" value={`₹${fmtMoney(totalRooms > 0 ? activeReport.room_sale_amount / totalRooms : 0)}`} />
            <ReportRow label="Room Sale Amount" value={`₹${fmtMoney(activeReport.room_sale_amount)}`} strong />
          </ReportCard>

          {/* Room Revenue Breakdown */}
          <ReportCard title="Channel Revenue Breakdown" icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}>
            <ReportRow label="OTA Channels" value={`₹${fmtMoney(activeReport.ota)}`} />
            <ReportRow label="Direct / Walk-in" value={`₹${fmtMoney(activeReport.direct_walking)}`} />
            <ReportRow label="Corporate / Agent" value={`₹${fmtMoney(activeReport.corporate_agent)}`} />
            <ReportRow label="Phonebook" value={`₹${fmtMoney(activeReport.phonebook)}`} />
            <ReportRow label="Kitchen / F&B" value={`₹${fmtMoney(activeReport.kitchen)}`} />
            <ReportRow label="Other Income" value={`₹${fmtMoney(activeReport.other_income)}`} />
            <ReportRow label="Total Gross Revenue" value={`₹${fmtMoney(calcTotalRevenue(activeReport))}`} strong />
          </ReportCard>

          {/* MTD & Operational Performance */}
          <ReportCard title="MTD Month-to-Date Summary" icon={<Calendar className="w-4 h-4 text-sky-600" />}>
            <ReportRow label="MTD Total Revenue" value={`₹${fmtMoney(mtd.revenue)}`} strong />
            <ReportRow label="MTD Total Occupancy" value={`${fmtInt(mtd.occupancy)} Rooms`} />
            <ReportRow label="Expected Tomorrow Arrival" value={fmtInt(activeReport.expected_arrival)} />
            <ReportRow label="Expected Tomorrow Departure" value={fmtInt(activeReport.departure)} />
            <ReportRow label="Closing Rooms Available" value={fmtInt(calcClosingRooms(activeReport.rooms_occupied, totalRooms))} />
          </ReportCard>

          {/* Expenses & Cash Flow Audit */}
          <ReportCard title="Expenses & Cash Audit" icon={<DollarSign className="w-4 h-4 text-amber-600" />}>
            <ReportRow label="Housekeeping Supplies" value={`₹${fmtMoney(activeReport.housekeeping_supply)}`} />
            <ReportRow label="Maintenance & Utilities" value={`₹${fmtMoney(activeReport.maintenance_bill)}`} />
            <ReportRow label="Other Operating Expenses" value={`₹${fmtMoney(activeReport.other_expense)}`} />
            <ReportRow label="Total Expenses" value={`₹${fmtMoney(calcTotalExpenses(activeReport))}`} strong />
            <div className="pt-2 mt-2 border-t border-slate-100 space-y-1">
              <ReportRow label="+ Cash Collection" value={`₹${fmtMoney(toNum(activeReport.pay_cash))}`} />
              <ReportRow label="= Cash Closing Balance" value={`₹${fmtMoney(toNum(activeReport.cash_closing))}`} strong />
            </div>
          </ReportCard>

          {/* Payment Mode Breakup */}
          <ReportCard title="Payment Mode Breakup" icon={<ShieldCheck className="w-4 h-4 text-teal-600" />}>
            <ReportRow label="Cash" value={`₹${fmtMoney(toNum(activeReport.pay_cash))}`} />
            <ReportRow label="UPI" value={`₹${fmtMoney(toNum(activeReport.pay_upi))}`} />
            <ReportRow label="Card" value={`₹${fmtMoney(toNum(activeReport.pay_card))}`} />
            <ReportRow label="Bank Transfer" value={`₹${fmtMoney(toNum(activeReport.pay_bank))}`} />
            <ReportRow label="Advance" value={`₹${fmtMoney(toNum(activeReport.pay_advance))}`} />
            <ReportRow label="Pending Balance" value={`₹${fmtMoney(toNum(activeReport.pay_balance))}`} />
          </ReportCard>

          {/* GST Summary */}
          <ReportCard title="GST Compliance Summary" icon={<FileText className="w-4 h-4 text-indigo-600" />}>
            <ReportRow label="Taxable Revenue" value={`₹${fmtMoney(toNum(activeReport.taxable_revenue))}`} />
            <ReportRow label="CGST" value={`₹${fmtMoney(toNum(activeReport.cgst))}`} />
            <ReportRow label="SGST" value={`₹${fmtMoney(toNum(activeReport.sgst))}`} />
            <ReportRow label="IGST" value={`₹${fmtMoney(toNum(activeReport.igst))}`} />
            <ReportRow label="Total GST Collected" value={`₹${fmtMoney(toNum(activeReport.gst_collected))}`} strong />
            <ReportRow label="Invoice Total (incl. GST)" value={`₹${fmtMoney(toNum(activeReport.invoice_total))}`} />
            <ReportRow label="Net Revenue (excl. GST)" value={`₹${fmtMoney(toNum(activeReport.net_revenue))}`} strong />
          </ReportCard>
        </div>
      </main>

      {/* Sticky Bottom Action Toolbar */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 p-4 sm:p-5 z-20 shadow-lg mt-6 -mx-4 sm:-mx-6 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto flex gap-3">
          <button
            onClick={() => onNavigate('roomchart', { date })}
            className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 font-bold py-3.5 rounded-2xl shadow-xs transition active:scale-[0.99]"
          >
            <Pencil className="w-4 h-4 text-slate-600" /> Edit Room Chart
          </button>
          <button
            onClick={() => onNavigate('whatsapp', { date })}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl shadow-sm transition active:scale-[0.99]"
          >
            <MessageCircle className="w-4 h-4" /> Share on WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
};

const ReportCard = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card hover:shadow-card-hover transition space-y-3 flex flex-col justify-between">
    <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
      <div className="p-1.5 rounded-xl bg-slate-50 border border-slate-100">
        {icon}
      </div>
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
    </div>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const ReportRow = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={`flex items-baseline justify-between py-1 ${strong ? 'pt-2 mt-1 border-t border-slate-200' : 'border-b border-slate-100/80 last:border-0'}`}>
    <span className={`text-xs ${strong ? 'font-bold text-slate-900' : 'font-medium text-slate-600'}`}>{label}</span>
    <span className={`text-xs font-bold tabular-nums ${strong ? 'text-brand-700 text-sm' : 'text-slate-800'}`}>{value}</span>
  </div>
);
