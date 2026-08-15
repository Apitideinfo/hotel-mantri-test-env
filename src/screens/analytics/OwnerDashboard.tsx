import { useEffect, useState, useMemo } from 'react';
import {
  BedDouble, TrendingUp, TrendingDown, Wallet, Landmark, Clock,
  Receipt, Percent, BarChart3, ArrowUp, ArrowDown, AlertTriangle,
  CheckCircle2, Lightbulb, Loader2, Sparkles,
} from 'lucide-react';
import type { HotelSettings, DerivedReport } from '@/lib/types';
import { getSettings, getDerivedReport, getDerivedReportsForMonth, getDerivedReportsForYear } from '@/lib/api';
import { aggregateDerived, toNum, fmtMoney, fmtInt, calcArr, calcOcc, calcTotalRevenue, calcTotalExpenses } from '@/lib/calc';
import { generateInsights, type Insight } from '@/lib/insights';
import { LineChart, AreaChart, BarChart, DonutChart, GroupedBarChart } from '@/components/charts';
import { brand } from '@/lib/theme';

interface OwnerDashboardProps {
  onBack: () => void;
  onNavigate?: (screen: string) => void;
}

const COLORS = {
  blue: '#2563eb',
  navy: '#1f3559',
  gold: '#f59e0b',
  emerald: '#16a34a',
  red: '#dc2626',
  teal: '#0d9488',
  purple: '#7c3aed',
  slate: '#64748b',
  indigo: '#4f46e5',
  cyan: '#0891b2',
  orange: '#ea580c',
};

export const OwnerDashboard = ({ onBack, onNavigate }: OwnerDashboardProps) => {
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [today, setToday] = useState<DerivedReport | null>(null);
  const [yesterday, setYesterday] = useState<DerivedReport | null>(null);
  const [weekReports, setWeekReports] = useState<DerivedReport[]>([]);
  const [monthReports, setMonthReports] = useState<DerivedReport[]>([]);
  const [ytdReports, setYtdReports] = useState<DerivedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);

  const todayStr = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const s = await getSettings();
        setSettings(s);
        const [t, y, week, month, ytd] = await Promise.all([
          getDerivedReport(todayStr, s.total_rooms, s.opening_cash_balance),
          getDerivedReport(prevDate(todayStr), s.total_rooms, s.opening_cash_balance),
          loadLast7Days(s.total_rooms, s.opening_cash_balance),
          getDerivedReportsForMonth(new Date().getFullYear(), new Date().getMonth() + 1, s.total_rooms, s.opening_cash_balance),
          getDerivedReportsForYear(new Date().getFullYear(), s.total_rooms, s.opening_cash_balance),
        ]);
        setToday(t);
        setYesterday(y);
        setWeekReports(week);
        setMonthReports(month);
        setYtdReports(ytd);
        setInsights(generateInsights(t, y, month, s.total_rooms));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalRooms = settings?.total_rooms ?? 0;
  const occupied = today?.rooms_occupied ?? 0;
  const occ = calcOcc(occupied, totalRooms);
  const arr = today ? calcArr(today.room_sale_amount, today.rooms_occupied) : 0;
  const revpar = totalRooms > 0 ? (today?.room_sale_amount ?? 0) / totalRooms : 0;
  const totalRev = today ? calcTotalRevenue(today) : 0;
  const totalExp = today ? calcTotalExpenses(today) : 0;
  const profit = totalRev - totalExp;
  const cashCol = toNum(today?.pay_cash);
  const bankCol = toNum(today?.pay_bank) + toNum(today?.pay_upi) + toNum(today?.pay_card);
  const pending = toNum(today?.pay_balance);

  const mtdAgg = useMemo(() => aggregateDerived(monthReports, totalRooms, new Date().getDate()), [monthReports, totalRooms]);
  const ytdAgg = useMemo(() => aggregateDerived(ytdReports, totalRooms, 365), [ytdReports, totalRooms]);

  // Chart data
  const revenueTrend = useMemo(() => {
    const sorted = [...weekReports].sort((a, b) => a.report_date < b.report_date ? -1 : 1);
    return sorted.map((r) => ({ label: r.report_date.slice(5), value: Math.round(calcTotalRevenue(r)) }));
  }, [weekReports]);

  const occTrend = useMemo(() => {
    const sorted = [...weekReports].sort((a, b) => a.report_date < b.report_date ? -1 : 1);
    return sorted.map((r) => ({ label: r.report_date.slice(5), value: Math.round(calcOcc(r.rooms_occupied, totalRooms)) }));
  }, [weekReports, totalRooms]);

  const sourceTrend = useMemo(() => {
    const sorted = [...weekReports].sort((a, b) => a.report_date < b.report_date ? -1 : 1);
    return [
      { name: 'OTA', color: COLORS.blue, points: sorted.map((r) => ({ label: r.report_date.slice(5), value: Math.round(toNum(r.ota)) })) },
      { name: 'Direct', color: COLORS.emerald, points: sorted.map((r) => ({ label: r.report_date.slice(5), value: Math.round(toNum(r.direct_walking)) })) },
      { name: 'Corporate', color: COLORS.gold, points: sorted.map((r) => ({ label: r.report_date.slice(5), value: Math.round(toNum(r.corporate_agent)) })) },
    ];
  }, [weekReports]);

  const expTrend = useMemo(() => {
    const sorted = [...weekReports].sort((a, b) => a.report_date < b.report_date ? -1 : 1);
    return sorted.map((r) => ({ label: r.report_date.slice(5), value: Math.round(calcTotalExpenses(r)) }));
  }, [weekReports]);

  const collectionTrend = useMemo(() => {
    const sorted = [...weekReports].sort((a, b) => a.report_date < b.report_date ? -1 : 1);
    return [
      { name: 'Cash', color: COLORS.emerald, points: sorted.map((r) => ({ label: r.report_date.slice(5), value: Math.round(toNum(r.pay_cash)) })) },
      { name: 'Bank/UPI', color: COLORS.blue, points: sorted.map((r) => ({ label: r.report_date.slice(5), value: Math.round(toNum(r.pay_bank) + toNum(r.pay_upi) + toNum(r.pay_card)) })) },
    ];
  }, [weekReports]);

  const monthlyComparison = useMemo(() => {
    const byMonth = new Map<number, { revenue: number; expenses: number }>();
    for (const r of ytdReports) {
      const m = parseInt(r.report_date.slice(5, 7), 10);
      const existing = byMonth.get(m) ?? { revenue: 0, expenses: 0 };
      existing.revenue += calcTotalRevenue(r);
      existing.expenses += calcTotalExpenses(r);
      byMonth.set(m, existing);
    }
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return Array.from(byMonth.entries()).map(([m, v]) => ({
      label: monthNames[m - 1] ?? `M${m}`,
      bars: [
        { name: 'Revenue', value: Math.round(v.revenue), color: COLORS.blue },
        { name: 'Expenses', value: Math.round(v.expenses), color: COLORS.red },
      ],
    }));
  }, [ytdReports]);

  const paymentDonut = useMemo(() => {
    const t = today ?? null;
    if (!t) return [];
    return [
      { label: 'Cash', value: Math.round(toNum(t.pay_cash)), color: COLORS.emerald },
      { label: 'UPI', value: Math.round(toNum(t.pay_upi)), color: COLORS.blue },
      { label: 'Card', value: Math.round(toNum(t.pay_card)), color: COLORS.purple },
      { label: 'Bank', value: Math.round(toNum(t.pay_bank)), color: COLORS.navy },
    ].filter((s) => s.value > 0);
  }, [today]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600 mx-auto" />
          <p className="text-sm text-slate-400 mt-3">Loading Owner Dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-navy-800 to-brand-navy-700 text-white px-4 lg:px-6 py-5">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg transition">
              <ArrowDown className="w-5 h-5 rotate-90" />
            </button>
            <div>
              <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-brand-gold-400" /> Owner Dashboard
              </h1>
              <p className="text-xs text-brand-navy-200 mt-0.5">
                {settings?.hotel_name ?? 'Hotel'} · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="px-4 lg:px-6 py-5 max-w-[1400px] mx-auto space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* === KPI ROW 1 === */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard label="Today's Revenue" value={`₹${fmtMoney(totalRev)}`} icon={<TrendingUp className="w-4 h-4" />} color="text-brand-600" bg="bg-brand-50" />
          <KpiCard label="Occupancy" value={`${occ.toFixed(0)}%`} sub={`${fmtInt(occupied)}/${fmtInt(totalRooms)} rooms`} icon={<Percent className="w-4 h-4" />} color="text-brand-navy-700" bg="bg-brand-navy-50" />
          <KpiCard label="ARR" value={`₹${fmtMoney(arr)}`} sub="Avg Room Rate" icon={<BarChart3 className="w-4 h-4" />} color="text-brand-gold-600" bg="bg-brand-gold-50" />
          <KpiCard label="RevPAR" value={`₹${fmtMoney(revpar)}`} sub="Rev/Available Room" icon={<BarChart3 className="w-4 h-4" />} color="text-teal-600" bg="bg-teal-50" />
          <KpiCard label="Cash Collection" value={`₹${fmtMoney(cashCol)}`} icon={<Wallet className="w-4 h-4" />} color="text-emerald-600" bg="bg-emerald-50" />
          <KpiCard label="Bank Collection" value={`₹${fmtMoney(bankCol)}`} sub="UPI+Card+Bank" icon={<Landmark className="w-4 h-4" />} color="text-blue-600" bg="bg-blue-50" />
        </div>

        {/* === KPI ROW 2 === */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard label="Pending Collection" value={`₹${fmtMoney(pending)}`} icon={<Clock className="w-4 h-4" />} color="text-orange-600" bg="bg-orange-50" />
          <KpiCard label="Today's Expenses" value={`₹${fmtMoney(totalExp)}`} icon={<Receipt className="w-4 h-4" />} color="text-red-600" bg="bg-red-50" />
          <KpiCard label="Profit Estimate" value={`₹${fmtMoney(profit)}`} sub={`${totalRev > 0 ? ((profit / totalRev) * 100).toFixed(0) : 0}% margin`} icon={profit >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />} color={profit >= 0 ? 'text-emerald-600' : 'text-red-600'} bg={profit >= 0 ? 'bg-emerald-50' : 'bg-red-50'} />
          <KpiCard label="MTD Revenue" value={`₹${fmtMoney(mtdAgg.totalRevenue)}`} sub={`${mtdAgg.roomsSold} room nights`} icon={<TrendingUp className="w-4 h-4" />} color="text-brand-600" bg="bg-brand-50" />
          <KpiCard label="MTD Occupancy" value={`${mtdAgg.occ.toFixed(0)}%`} sub={`ARR ₹${fmtMoney(mtdAgg.arr)}`} icon={<Percent className="w-4 h-4" />} color="text-brand-navy-700" bg="bg-brand-navy-50" />
          <KpiCard label="YTD Revenue" value={`₹${fmtMoney(ytdAgg.totalRevenue)}`} sub={`${ytdAgg.roomsSold} room nights`} icon={<TrendingUp className="w-4 h-4" />} color="text-brand-gold-600" bg="bg-brand-gold-50" />
        </div>

        {/* === INSIGHTS PANEL === */}
        {insights.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-brand-gold-500" />
              <h2 className="text-sm font-bold text-brand-navy-800 uppercase tracking-wide">Manager Insights</h2>
              <span className="text-xs text-slate-400 ml-auto">{insights.length} insight{insights.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {insights.map((ins) => <InsightCard key={ins.id} insight={ins} />)}
            </div>
          </div>
        )}

        {/* === CHARTS ROW 1 === */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Revenue Trend" subtitle="Last 7 days">
            <AreaChart points={revenueTrend} color={COLORS.blue} yFormat={(v) => `₹${fmtInt(v)}`} height={200} />
          </ChartCard>
          <ChartCard title="Occupancy Trend" subtitle="Last 7 days">
            <LineChart series={[{ name: 'Occupancy', color: COLORS.gold, points: occTrend }]} yFormat={(v) => `${v.toFixed(0)}%`} height={200} />
          </ChartCard>
        </div>

        {/* === CHARTS ROW 2 === */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Booking Source Trend" subtitle="Last 7 days">
            <LineChart series={sourceTrend} yFormat={(v) => `₹${fmtInt(v)}`} height={200} />
          </ChartCard>
          <ChartCard title="Expense Trend" subtitle="Last 7 days">
            <BarChart points={expTrend} color={COLORS.red} yFormat={(v) => `₹${fmtInt(v)}`} height={200} />
          </ChartCard>
        </div>

        {/* === CHARTS ROW 3 === */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard title="Collection Trend" subtitle="Last 7 days" className="lg:col-span-2">
            <LineChart series={collectionTrend} yFormat={(v) => `₹${fmtInt(v)}`} height={200} />
          </ChartCard>
          <ChartCard title="Payment Mix" subtitle="Today">
            {paymentDonut.length > 0 ? (
              <DonutChart slices={paymentDonut} centerValue={`₹${fmtMoney(cashCol + bankCol)}`} centerLabel="Total" size={160} />
            ) : (
              <p className="text-sm text-slate-400 text-center py-8">No payments today</p>
            )}
          </ChartCard>
        </div>

        {/* === MONTHLY COMPARISON === */}
        <ChartCard title="Monthly Comparison" subtitle="Revenue vs Expenses — Year to Date">
          {monthlyComparison.length > 0 ? (
            <GroupedBarChart groups={monthlyComparison} yFormat={(v) => `₹${fmtInt(v)}`} height={240} />
          ) : (
            <p className="text-sm text-slate-400 text-center py-8">No YTD data available</p>
          )}
        </ChartCard>

        {/* === ANALYTICS NAVIGATION === */}
        {onNavigate && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h2 className="text-sm font-bold text-brand-navy-800 uppercase tracking-wide mb-3">Analytics & Reports</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              <NavBtn label="Daily MIS" onClick={() => onNavigate('mis-report')} />
              <NavBtn label="Booking Sources" onClick={() => onNavigate('analytics-booking')} />
              <NavBtn label="Room Categories" onClick={() => onNavigate('analytics-category')} />
              <NavBtn label="Payments" onClick={() => onNavigate('analytics-payment')} />
              <NavBtn label="GST" onClick={() => onNavigate('analytics-gst')} />
              <NavBtn label="Expenses" onClick={() => onNavigate('analytics-expense')} />
              <NavBtn label="Occupancy" onClick={() => onNavigate('analytics-occupancy')} />
              <NavBtn label="Revenue" onClick={() => onNavigate('analytics-revenue')} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// ── Helpers ──

const prevDate = (d: string): string => {
  const date = new Date(d + 'T00:00:00');
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
};

const loadLast7Days = async (totalRooms: number, openingBalance: number): Promise<DerivedReport[]> => {
  const reports: DerivedReport[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dStr = d.toISOString().slice(0, 10);
    try {
      const r = await getDerivedReport(dStr, totalRooms, openingBalance);
      if (r.rooms_occupied > 0 || calcTotalRevenue(r) > 0) reports.push(r);
    } catch { /* skip days with no data */ }
  }
  return reports;
};

// ── Components ──

const KpiCard = ({ label, value, sub, icon, color, bg }: { label: string; value: string; sub?: string; icon: React.ReactNode; color: string; bg: string }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all p-4 flex flex-col gap-2">
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg}`}>{icon}</div>
    </div>
    <p className={`text-xl font-bold tabular-nums leading-none ${color}`}>{value}</p>
    {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
  </div>
);

const ChartCard = ({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${className ?? ''}`}>
    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
      <div>
        <h3 className="text-sm font-bold text-brand-navy-800">{title}</h3>
        {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    <div className="p-4">{children}</div>
  </div>
);

const InsightCard = ({ insight }: { insight: Insight }) => {
  const colors = {
    positive: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-600', title: 'text-emerald-800' },
    warning: { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'text-amber-600', title: 'text-amber-800' },
    negative: { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-600', title: 'text-red-800' },
    info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600', title: 'text-blue-800' },
  };
  const c = colors[insight.type];
  const Icon = insight.icon === 'trending-up' ? TrendingUp
    : insight.icon === 'trending-down' ? TrendingDown
    : insight.icon === 'alert' ? AlertTriangle
    : insight.icon === 'wallet' ? Wallet
    : insight.icon === 'check-circle' ? CheckCircle2
    : Lightbulb;
  return (
    <div className={`rounded-xl border p-3 ${c.bg} ${c.border}`}>
      <div className="flex items-start gap-2.5">
        <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${c.icon}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${c.title}`}>{insight.title}</p>
          <p className="text-xs text-slate-600 mt-0.5">{insight.detail}</p>
          {insight.action && (
            <p className="text-xs text-slate-500 mt-1 italic">→ {insight.action}</p>
          )}
        </div>
      </div>
    </div>
  );
};

const NavBtn = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button onClick={onClick} className="flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-lg bg-slate-50 hover:bg-brand-50 text-slate-700 hover:text-brand-700 border border-slate-200 hover:border-brand-300 transition">
    {label}
  </button>
);
