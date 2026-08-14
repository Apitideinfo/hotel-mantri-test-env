import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  BedDouble, Wallet, FileText, MessageCircle, CalendarRange, TrendingUp,
  History, BookOpen, FileBarChart, Building2, Trophy, AlertTriangle,
  LogIn, LogOut, DollarSign, Percent, BarChart3, Sparkles,
  ArrowUp, ArrowDown, Search, Bell, ChevronRight, Activity,
  Receipt, CheckCircle2, XCircle, MinusCircle, RefreshCw,
  Banknote, Smartphone, CreditCard, Plane, Zap, Wrench, Ban,
  CalendarDays, Users, Plus, UserPlus, ClipboardList, Lock,
} from 'lucide-react';
import type { HotelSettings, DerivedReport } from '@/lib/types';
import { getDashboardSummary } from '@/lib/api';
import type { DashboardSummary } from '@/lib/api';
import { calcArr, calcOcc, calcTotalRevenue, calcTotalExpenses, calcClosingRooms, aggregateDerived, fmtMoney, fmtInt, toNum } from '@/lib/calc';
import { AreaChart, DonutChart, LineChart, BarChart, Sparkline } from '@/components/charts';

interface DashboardProps {
  onNavigate: (screen: string, payload?: unknown) => void;
}

const COLORS = {
  blue: '#2563eb',
  navy: '#1f3559',
  gold: '#f59e0b',
  emerald: '#16a34a',
  red: '#dc2626',
  teal: '#0d9488',
  slate: '#64748b',
  lightBlue: '#bfdbfe',
  orange: '#f97316',
};

const rs = (n: number | string): string => '\u20B9' + fmtMoney(typeof n === 'number' ? n : 0);

export const Dashboard = ({ onNavigate }: DashboardProps) => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const todayStr = new Date().toISOString().slice(0, 10);
  const monthName = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getDashboardSummary();
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const settings = summary?.settings ?? null;
  const today = summary?.today ?? null;
  const mtd = summary?.mtd ?? null;
  const ytd = summary?.ytd ?? null;
  const lastClosedDate = summary?.lastClosedDate ?? null;
  const ranking = summary?.ranking ?? [];
  const weekReports = summary?.weekReports ?? [];
  const roomPreview = summary?.roomPreview ?? { categories: [] };
  const opsToday = summary?.opsToday ?? { arrivals: 0, departures: 0, inHouse: 0, available: 0, occupied: 0, dueCheckouts: 0, todayCheckins: 0 };

  const totalRooms = settings?.total_rooms ?? 0;
  const occupied = today?.rooms_occupied ?? 0;
  const arr = today ? calcArr(today.room_sale_amount, today.rooms_occupied) : 0;
  const occ = calcOcc(occupied, totalRooms);
  const roomSale = today?.room_sale_amount ?? 0;
  const totalRev = today ? calcTotalRevenue(today) : 0;
  const closingRooms = calcClosingRooms(occupied, totalRooms);
  const revpar = totalRooms > 0 ? roomSale / totalRooms : 0;
  const vacant = totalRooms - occupied;
  const totalExp = today ? calcTotalExpenses(today) : 0;
  const profit = totalRev - totalExp;
  const cashCol = toNum(today?.pay_cash);
  const bankCol = toNum(today?.pay_bank) + toNum(today?.pay_upi) + toNum(today?.pay_card);

  // Chart data
  const revenueTrend = useMemo(() => {
    const sorted = [...weekReports].sort((a, b) => a.report_date < b.report_date ? -1 : 1);
    return sorted.map((r) => ({ label: r.report_date.slice(5), value: Math.round(calcTotalRevenue(r)) }));
  }, [weekReports]);

  const expenseTrend = useMemo(() => {
    const sorted = [...weekReports].sort((a, b) => a.report_date < b.report_date ? -1 : 1);
    return sorted.map((r) => ({ label: r.report_date.slice(5), value: Math.round(calcTotalExpenses(r)) }));
  }, [weekReports]);

  const occTrend = useMemo(() => {
    const sorted = [...weekReports].sort((a, b) => a.report_date < b.report_date ? -1 : 1);
    return sorted.map((r) => ({ label: r.report_date.slice(5), value: Math.round(calcOcc(r.rooms_occupied, totalRooms)) }));
  }, [weekReports, totalRooms]);

  const paymentDonut = useMemo(() => {
    if (!today) return [];
    return [
      { label: 'Cash', value: Math.round(toNum(today.pay_cash)), color: COLORS.emerald },
      { label: 'UPI', value: Math.round(toNum(today.pay_upi)), color: COLORS.blue },
      { label: 'Card', value: Math.round(toNum(today.pay_card)), color: COLORS.navy },
      { label: 'Bank', value: Math.round(toNum(today.pay_bank)), color: COLORS.gold },
    ].filter((s) => s.value > 0);
  }, [today]);

  const revExpBar = useMemo(() => {
    const sorted = [...weekReports].sort((a, b) => a.report_date < b.report_date ? -1 : 1);
    return [
      { name: 'Revenue', color: COLORS.blue, points: sorted.map((r) => ({ label: r.report_date.slice(5), value: Math.round(calcTotalRevenue(r)) })) },
      { name: 'Expenses', color: COLORS.red, points: sorted.map((r) => ({ label: r.report_date.slice(5), value: Math.round(calcTotalExpenses(r)) })) },
    ];
  }, [weekReports]);

  const mtdCollectionDonut = useMemo(() => {
    if (!mtd) return [];
    return [
      { label: 'Cash', value: Math.round(mtd.payCash), color: COLORS.emerald },
      { label: 'Bank Direct', value: Math.round(mtd.payBank), color: COLORS.navy },
      { label: 'UPI', value: Math.round(mtd.payUpi), color: COLORS.blue },
      { label: 'Card', value: Math.round(mtd.payCard), color: COLORS.gold },
    ].filter((s) => s.value > 0);
  }, [mtd]);

  if (loading && !summary) {
    return (
      <div className="px-4 lg:px-6 py-5 w-full max-w-[1600px] mx-auto space-y-5">
        <div className="rounded-2xl border p-4 flex items-center gap-4 bg-slate-50 border-slate-200 animate-pulse">
          <div className="w-12 h-12 rounded-xl bg-slate-200" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-slate-200 rounded mb-2" />
            <div className="h-2 w-48 bg-slate-200 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 lg:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 animate-pulse">
              <div className="flex items-center justify-between mb-3">
                <div className="h-3 w-16 bg-slate-200 rounded" />
                <div className="w-9 h-9 rounded-xl bg-slate-200" />
              </div>
              <div className="h-7 w-20 bg-slate-200 rounded mb-2" />
              <div className="h-3 w-14 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 animate-pulse">
              <div className="h-4 w-32 bg-slate-200 rounded mb-4" />
              <div className="h-40 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-6 py-5 w-full max-w-[1600px] mx-auto space-y-5">
      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 flex items-center gap-2 animate-fade-in">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={load} className="ml-auto flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-800">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {/* Data as of banner */}
      <div className="bg-brand-navy-50 border border-brand-navy-100 rounded-xl px-4 py-2.5 flex items-center gap-2 flex-wrap">
        <CalendarDays className="w-4 h-4 text-brand-navy-600" />
        <span className="text-sm font-semibold text-brand-navy-700">{monthName}</span>
        <span className="text-slate-300">|</span>
        <History className="w-4 h-4 text-brand-navy-600" />
        <span className="text-sm font-semibold text-brand-navy-700">
          Data as of: {lastClosedDate ?? 'No closed business date yet'}
        </span>
        <span className="text-xs text-slate-400 ml-1">· MTD totals include only closed business dates</span>
      </div>

      {/* === MTD KPI CARDS === */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 lg:gap-4">
        <KpiCard label="Total Income" value={rs(mtd?.totalRevenue ?? 0)} sub="MTD" icon={<DollarSign className="w-5 h-5" />} color="text-brand-600" iconBg="bg-brand-50" index={0} />
        <KpiCard label="Cash" value={rs(mtd?.cash ?? 0)} sub="MTD Collection" icon={<Wallet className="w-5 h-5" />} color="text-emerald-600" iconBg="bg-emerald-50" index={1} />
        <KpiCard label="Bank / OTA" value={rs(mtd?.bank ?? 0)} sub="MTD Collection" icon={<Banknote className="w-5 h-5" />} color="text-brand-navy-700" iconBg="bg-brand-navy-50" index={2} />
        <KpiCard label="Total Expenses" value={rs(mtd?.totalExpenses ?? 0)} sub="MTD" icon={<Receipt className="w-5 h-5" />} color="text-red-600" iconBg="bg-red-50" index={3} />
        <KpiCard label="Net Income" value={rs(mtd?.netIncome ?? 0)} sub="MTD" icon={<TrendingUp className="w-5 h-5" />} color={mtd && mtd.netIncome >= 0 ? 'text-emerald-600' : 'text-red-600'} iconBg={mtd && mtd.netIncome >= 0 ? 'bg-emerald-50' : 'bg-red-50'} index={4} />
        <KpiCard label="Occupancy" value={`${(mtd?.occ ?? 0).toFixed(0)}%`} sub="MTD" icon={<Percent className="w-5 h-5" />} color="text-brand-600" iconBg="bg-brand-50" index={5} />
        <KpiCard label="ARR" value={rs(mtd?.arr ?? 0)} sub="MTD" icon={<BarChart3 className="w-5 h-5" />} color="text-brand-gold-600" iconBg="bg-brand-gold-50" index={6} />
        <KpiCard label="RevPAR" value={rs(mtd?.revpar ?? 0)} sub="MTD" icon={<Activity className="w-5 h-5" />} color="text-teal-600" iconBg="bg-teal-50" index={7} />
      </div>

      {/* === BREAKUP SECTIONS: Income + Collection + Expense === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
        {/* Income Breakup */}
        <ChartCard title="Income Breakup" subtitle="MTD">
          <div className="space-y-1">
            <RevRow label="Room Revenue" value={mtd?.roomRevenue ?? 0} color="text-brand-600" />
            <RevRow label="F&B Revenue" value={mtd?.fbRevenue ?? 0} />
            <RevRow label="Other Income" value={(mtd?.miscRevenue ?? 0) + (mtd?.otherRevenue ?? 0)} />
            <div className="flex items-center justify-between pt-2.5 mt-1 border-t-2 border-slate-200">
              <span className="text-sm font-bold text-brand-navy-800">Total Income</span>
              <span className="text-base font-bold text-brand-navy-800 tabular-nums">{rs(mtd?.totalRevenue ?? 0)}</span>
            </div>
          </div>
        </ChartCard>

        {/* Collection Breakup */}
        <ChartCard title="Collection Breakup" subtitle="MTD">
          <div className="space-y-1">
            <RevRow label="Cash" value={mtd?.payCash ?? 0} color="text-emerald-600" />
            <RevRow label="Bank Direct" value={mtd?.payBank ?? 0} color="text-brand-navy-700" />
            <RevRow label="UPI" value={mtd?.payUpi ?? 0} color="text-brand-600" />
            <RevRow label="Card" value={mtd?.payCard ?? 0} color="text-brand-gold-600" />
            <div className="flex items-center justify-between pt-2.5 mt-1 border-t-2 border-slate-200">
              <span className="text-sm font-bold text-brand-navy-800">Total Collection</span>
              <span className="text-base font-bold text-brand-navy-800 tabular-nums">{rs((mtd?.payCash ?? 0) + (mtd?.payBank ?? 0) + (mtd?.payUpi ?? 0) + (mtd?.payCard ?? 0))}</span>
            </div>
          </div>
        </ChartCard>

        {/* Expense Breakup */}
        <ChartCard title="Expense Breakup" subtitle="MTD">
          <div className="space-y-1">
            {(mtd?.expenseByCategory ?? []).length > 0 ? (
              <>
                {(mtd?.expenseByCategory ?? []).slice(0, 6).map((e) => (
                  <RevRow key={e.category} label={e.category} value={e.amount} color="text-red-600" />
                ))}
                <div className="flex items-center justify-between pt-2.5 mt-1 border-t-2 border-slate-200">
                  <span className="text-sm font-bold text-brand-navy-800">Total Expenses</span>
                  <span className="text-base font-bold text-red-600 tabular-nums">{rs(mtd?.totalExpenses ?? 0)}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">No expense data for this period.</p>
            )}
          </div>
        </ChartCard>
      </div>

      {/* === CHARTS: Revenue vs Expenses + Collection Donut + Occupancy === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
        <ChartCard title="Revenue vs Expenses" subtitle="Last 7 days">
          {revExpBar[0].points.length > 0 ? <LineChart series={revExpBar} yFormat={(v) => '\u20B9' + fmtInt(v)} height={200} /> : <EmptyChart />}
        </ChartCard>
        <ChartCard title="Collection Breakup" subtitle="MTD">
          {mtdCollectionDonut.length > 0 ? <DonutChart slices={mtdCollectionDonut} size={170} centerValue={rs((mtd?.payCash ?? 0) + (mtd?.payBank ?? 0) + (mtd?.payUpi ?? 0) + (mtd?.payCard ?? 0))} centerLabel="Collected" /> : <EmptyChart />}
        </ChartCard>
        <ChartCard title="Occupancy Trend" subtitle="Last 7 days">
          {occTrend.length > 0 ? <LineChart series={[{ name: 'Occupancy', color: COLORS.gold, points: occTrend }]} yFormat={(v) => `${v.toFixed(0)}%`} height={200} /> : <EmptyChart />}
        </ChartCard>
      </div>

      {/* === TODAY OPERATIONAL SUMMARY === */}
      <ChartCard title="Today's Operational Summary" subtitle={todayStr}>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <OpsCard label="Arrivals" value={opsToday.arrivals} icon={<LogIn className="w-4 h-4" />} color="text-emerald-600" bg="bg-emerald-50" />
          <OpsCard label="Departures" value={opsToday.departures} icon={<LogOut className="w-4 h-4" />} color="text-orange-600" bg="bg-orange-50" />
          <OpsCard label="In-house Guests" value={opsToday.inHouse} icon={<Users className="w-4 h-4" />} color="text-brand-600" bg="bg-brand-50" />
          <OpsCard label="Available Rooms" value={opsToday.available} icon={<BedDouble className="w-4 h-4" />} color="text-teal-600" bg="bg-teal-50" />
          <OpsCard label="Occupied Rooms" value={opsToday.occupied} icon={<CheckCircle2 className="w-4 h-4" />} color="text-brand-navy-700" bg="bg-brand-navy-50" />
          <OpsCard label="Due Check-outs" value={opsToday.dueCheckouts} icon={<LogOut className="w-4 h-4" />} color="text-amber-600" bg="bg-amber-50" />
          <OpsCard label="Today Check-ins" value={opsToday.todayCheckins} icon={<LogIn className="w-4 h-4" />} color="text-emerald-600" bg="bg-emerald-50" />
        </div>
      </ChartCard>

      {/* === ROOM CHART PREVIEW === */}
      <ChartCard title="Room Chart Preview" subtitle="Today">
        {roomPreview.categories.length > 0 ? (
          <div className="space-y-3">
            {roomPreview.categories.map((cat) => (
              <div key={cat.name} className="flex items-center gap-3">
                <div className="w-28 sm:w-32 shrink-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{cat.name}</p>
                  <p className="text-[10px] text-slate-400">{cat.total} rooms</p>
                </div>
                <div className="flex-1 flex items-center gap-1.5 flex-wrap">
                  <StatusBadge label="Occupied" value={cat.occupied} color="bg-red-100 text-red-700 border-red-300" />
                  <StatusBadge label="Reserved" value={cat.reserved} color="bg-blue-100 text-blue-700 border-blue-300" />
                  <StatusBadge label="Blocked" value={cat.blocked} color="bg-orange-100 text-orange-700 border-orange-300" />
                  <StatusBadge label="Maintenance" value={cat.maintenance} color="bg-amber-100 text-amber-700 border-amber-300" />
                  <StatusBadge label="Out of Order" value={cat.outOfOrder} color="bg-slate-200 text-slate-600 border-slate-400" />
                  <StatusBadge label="Available" value={cat.total - cat.occupied - cat.reserved - cat.blocked - cat.maintenance - cat.outOfOrder} color="bg-emerald-100 text-emerald-700 border-emerald-300" />
                </div>
              </div>
            ))}
            <button
              onClick={() => onNavigate('operations', { date: todayStr })}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-soft-blue hover:shadow-md transition-all active:scale-[0.98] mt-2"
            >
              <ClipboardList className="w-4 h-4" /> Go to Operations Board
            </button>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-slate-400 mb-3">No room categories configured.</p>
            <button
              onClick={() => onNavigate('property')}
              className="text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              Configure in Property Master
            </button>
          </div>
        )}
      </ChartCard>

      {/* === YTD SUMMARY + TOP SOURCES === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        <ChartCard title="YTD Summary" subtitle="Year to Date">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <MiniStat label="Room Revenue" value={rs(ytd?.roomRevenue ?? 0)} />
            <MiniStat label="Total Revenue" value={rs(ytd?.totalRevenue ?? 0)} />
            <MiniStat label="Occupancy" value={(ytd?.occ ?? 0).toFixed(0) + '%'} />
            <MiniStat label="ARR" value={rs(ytd?.arr ?? 0)} />
            <MiniStat label="Room Nights" value={fmtInt(ytd?.roomNights ?? 0)} />
          </div>
        </ChartCard>
        <ChartCard title="Top Booking Sources" subtitle="YTD">
          {ranking.length > 0 ? (
            <div className="space-y-1.5">
              {ranking.slice(0, 5).map((c, i) => (
                <div key={c.name} className="flex items-center gap-2.5 py-1.5 border-b border-slate-100 last:border-0">
                  <span className={'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ' + (i === 0 ? 'bg-brand-gold-100 text-brand-gold-700' : i === 1 ? 'bg-slate-200 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500')}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-400">{String(c.category)} · {fmtInt(c.bookings)} booking{c.bookings !== 1 ? 's' : ''}</p>
                  </div>
                  <span className="text-sm font-bold text-slate-900 tabular-nums shrink-0">{rs(c.revenue)}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-400 text-center py-4">No company data yet.</p>}
        </ChartCard>
      </div>

      {/* === QUICK ACCESS === */}
      <ChartCard title="Quick Actions" subtitle="">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          <ActionBtn icon={<CalendarRange className="w-4 h-4" />} label="Make Reservation" onClick={() => onNavigate('reservations')} primary />
          <ActionBtn icon={<UserPlus className="w-4 h-4" />} label="Walk-in" onClick={() => onNavigate('operations', { date: todayStr })} />
          <ActionBtn icon={<LogIn className="w-4 h-4" />} label="Check-in" onClick={() => onNavigate('arrivals')} />
          <ActionBtn icon={<LogOut className="w-4 h-4" />} label="Check-out" onClick={() => onNavigate('departures')} />
          <ActionBtn icon={<Wallet className="w-4 h-4" />} label="Add Payment" onClick={() => onNavigate('finance')} />
          <ActionBtn icon={<Receipt className="w-4 h-4" />} label="Add Expense" onClick={() => onNavigate('expense-entry')} />
          <ActionBtn icon={<ClipboardList className="w-4 h-4" />} label="Operations Board" onClick={() => onNavigate('operations', { date: todayStr })} />
          <ActionBtn icon={<FileText className="w-4 h-4" />} label="Reports" onClick={() => onNavigate('report', { date: todayStr })} />
        </div>
      </ChartCard>
    </div>
  );
};

// ── KPI Card ──
const KpiCard = ({ label, value, sub, icon, color, iconBg, index = 0 }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; color: string; iconBg: string;
  index?: number;
}) => (
  <div
    className="bg-white rounded-2xl border border-slate-200 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 p-4 flex flex-col gap-2.5 animate-kpi"
    style={{ animationDelay: `${index * 50}ms` }}
  >
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>{icon}</div>
    </div>
    <div>
      <p className={`text-xl font-bold tabular-nums leading-none ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-1.5">{sub}</p>}
    </div>
  </div>
);

// ── Chart Card wrapper ──
const ChartCard = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-card hover:shadow-card-hover transition-all duration-200 overflow-hidden">
    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
      <h3 className="text-sm font-bold text-brand-navy-800">{title}</h3>
      {subtitle && <span className="text-[10px] text-slate-400 font-medium">{subtitle}</span>}
    </div>
    <div className="p-4">{children}</div>
  </div>
);

const EmptyChart = () => <p className="text-sm text-slate-400 text-center py-8">No data available.</p>;

const RevRow = ({ label, value, color }: { label: string; value: number; color?: string }) => (
  <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
    <span className="text-xs font-medium text-slate-500">{label}</span>
    <span className={`text-sm font-bold tabular-nums ${color ?? 'text-slate-800'}`}>{rs(value)}</span>
  </div>
);

const MiniStat = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between py-1">
    <span className="text-xs text-slate-500">{label}</span>
    <span className="text-sm font-bold text-slate-800 tabular-nums">{value}</span>
  </div>
);

const OpsCard = ({ label, value, icon, color, bg }: { label: string; value: number; icon: React.ReactNode; color: string; bg: string }) => (
  <div className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-100 bg-slate-50/50">
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg} ${color} shrink-0`}>{icon}</div>
    <div className="min-w-0">
      <p className="text-lg font-bold tabular-nums leading-none text-slate-800">{fmtInt(value)}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
    </div>
  </div>
);

const StatusBadge = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${color} ${value === 0 ? 'opacity-40' : ''}`}>
    {label}: {value}
  </span>
);

const ActionBtn = ({ icon, label, onClick, primary }: { icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean }) => (
  <button
    onClick={onClick}
    className={`flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-xl transition-all active:scale-[0.98] ${
      primary
        ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-soft-blue hover:shadow-md'
        : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-card hover:border-slate-300'
    }`}
  >
    {icon} {label}
  </button>
);
