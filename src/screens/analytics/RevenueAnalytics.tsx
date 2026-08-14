import { useEffect, useState, useMemo } from 'react';
import { TrendingUp, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
import type { HotelSettings, DerivedReport } from '@/lib/types';
import { getSettings, getDerivedReport, getDerivedReportsForMonth, getDerivedReportsForYear } from '@/lib/api';
import { toNum, fmtMoney, fmtInt, calcTotalRevenue } from '@/lib/calc';
import { AreaChart, BarChart, DonutChart, GroupedBarChart } from '@/components/charts';
import { ScreenHeader, SectionCard, Banner } from '@/components/finance-ui';
import { DateRangeFilter, LoadingSpinner, EmptyState } from './BookingSourceAnalytics';

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#dc2626'];

export const RevenueAnalytics = ({ onBack }: { onBack: () => void }) => {
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [monthReports, setMonthReports] = useState<DerivedReport[]>([]);
  const [ytdReports, setYtdReports] = useState<DerivedReport[]>([]);
  const [yesterday, setYesterday] = useState<DerivedReport | null>(null);
  const [lastWeek, setLastWeek] = useState<DerivedReport | null>(null);
  const [lastMonth, setLastMonth] = useState<DerivedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const s = await getSettings();
        setSettings(s);
        const now = new Date();
        const [month, ytd] = await Promise.all([
          getDerivedReportsForMonth(now.getFullYear(), now.getMonth() + 1, s.total_rooms, s.opening_cash_balance),
          getDerivedReportsForYear(now.getFullYear(), s.total_rooms, s.opening_cash_balance),
        ]);
        setMonthReports(month);
        setYtdReports(ytd);
        const todayStr = now.toISOString().slice(0, 10);
        const yStr = prevDate(todayStr);
        const lwStr = prevNDate(todayStr, 7);
        const lmStr = prevMonthDate(todayStr);
        const [y, lw, lm] = await Promise.all([
          getDerivedReport(yStr, s.total_rooms, s.opening_cash_balance).catch(() => null),
          getDerivedReport(lwStr, s.total_rooms, s.opening_cash_balance).catch(() => null),
          getDerivedReport(lmStr, s.total_rooms, s.opening_cash_balance).catch(() => null),
        ]);
        setYesterday(y);
        setLastWeek(lw);
        setLastMonth(lm);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const revenueByType = useMemo(() => {
    let room = 0, fb = 0, misc = 0, other = 0;
    for (const r of monthReports) {
      room += toNum(r.room_revenue) || toNum(r.room_sale_amount);
      fb += toNum(r.fb_revenue) || toNum(r.kitchen);
      misc += toNum(r.misc_revenue) || toNum(r.other_income);
      other += toNum(r.other_revenue_entries);
    }
    return { room, fb, misc, other };
  }, [monthReports]);

  const dailyTrend = useMemo(() => {
    const sorted = [...monthReports].sort((a, b) => a.report_date < b.report_date ? -1 : 1);
    return sorted.map((r) => ({ label: r.report_date.slice(5), value: Math.round(calcTotalRevenue(r)) }));
  }, [monthReports]);

  const monthlyComparison = useMemo(() => {
    const byMonth = new Map<number, { room: number; fb: number; other: number }>();
    for (const r of ytdReports) {
      const m = parseInt(r.report_date.slice(5, 7), 10);
      const existing = byMonth.get(m) ?? { room: 0, fb: 0, other: 0 };
      existing.room += toNum(r.room_revenue) || toNum(r.room_sale_amount);
      existing.fb += toNum(r.fb_revenue) || toNum(r.kitchen);
      existing.other += toNum(r.misc_revenue) || toNum(r.other_income) + toNum(r.other_revenue_entries);
      byMonth.set(m, existing);
    }
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return Array.from(byMonth.entries()).map(([m, v]) => ({
      label: monthNames[m - 1] ?? `M${m}`,
      bars: [
        { name: 'Room', value: Math.round(v.room), color: COLORS[0] },
        { name: 'Other', value: Math.round(v.fb + v.other), color: COLORS[1] },
      ],
    }));
  }, [ytdReports]);

  const todayRev = monthReports.length > 0 ? calcTotalRevenue(monthReports[monthReports.length - 1]) : 0;
  const yRev = yesterday ? calcTotalRevenue(yesterday) : 0;
  const lwRev = lastWeek ? calcTotalRevenue(lastWeek) : 0;
  const lmRev = lastMonth ? calcTotalRevenue(lastMonth) : 0;

  const comparisons = [
    { label: 'Yesterday', today: todayRev, compare: yRev },
    { label: 'Last Week', today: todayRev, compare: lwRev },
    { label: 'Last Month', today: todayRev, compare: lmRev },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <ScreenHeader title="Revenue Analytics" subtitle="Room · F&B · Misc · Comparison" onBack={onBack} icon={<TrendingUp className="w-5 h-5 text-sky-300" />} />
      <main className="px-4 py-4 space-y-4 max-w-4xl mx-auto">
        {error && <Banner kind="error">{error}</Banner>}
        {loading ? <LoadingSpinner /> : (
          <>
            {/* Revenue by type donut */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard title="Revenue Breakup (MTD)" icon={<TrendingUp className="w-4 h-4 text-brand-600" />}>
                {(() => {
                  const donut = [
                    { label: 'Room', value: Math.round(revenueByType.room), color: COLORS[0] },
                    { label: 'F&B', value: Math.round(revenueByType.fb), color: COLORS[1] },
                    { label: 'Misc', value: Math.round(revenueByType.misc), color: COLORS[2] },
                    { label: 'Other', value: Math.round(revenueByType.other), color: COLORS[3] },
                  ].filter((s) => s.value > 0);
                  return donut.length > 0 ? <DonutChartInline slices={donut} total={revenueByType.room + revenueByType.fb + revenueByType.misc + revenueByType.other} /> : <EmptyState />;
                })()}
              </SectionCard>
              <SectionCard title="Comparison vs Previous Periods" icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}>
                <div className="space-y-3">
                  {comparisons.map((c) => {
                    const diff = c.compare > 0 ? ((c.today - c.compare) / c.compare) * 100 : 0;
                    const isUp = diff >= 0;
                    return (
                      <div key={c.label} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                        <span className="text-sm text-slate-600">{c.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800 tabular-nums">₹{fmtMoney(c.compare)}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isUp ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {isUp ? <ArrowUp className="w-3 h-3 inline" /> : <ArrowDown className="w-3 h-3 inline" />}
                            {Math.abs(diff).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            </div>

            <SectionCard title="Daily Revenue Trend (MTD)" icon={<TrendingUp className="w-4 h-4 text-blue-600" />}>
              {dailyTrend.length > 0 ? <AreaChart points={dailyTrend} color={COLORS[0]} yFormat={(v) => `₹${fmtInt(v)}`} height={220} /> : <EmptyState />}
            </SectionCard>

            <SectionCard title="Monthly Revenue Comparison (YTD)" icon={<TrendingUp className="w-4 h-4 text-brand-gold-600" />}>
              {monthlyComparison.length > 0 ? <GroupedBarChart groups={monthlyComparison} yFormat={(v) => `₹${fmtInt(v)}`} height={240} /> : <EmptyState />}
            </SectionCard>
          </>
        )}
      </main>
    </div>
  );
};

const prevDate = (d: string): string => {
  const date = new Date(d + 'T00:00:00');
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
};
const prevNDate = (d: string, n: number): string => {
  const date = new Date(d + 'T00:00:00');
  date.setDate(date.getDate() - n);
  return date.toISOString().slice(0, 10);
};
const prevMonthDate = (d: string): string => {
  const date = new Date(d + 'T00:00:00');
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().slice(0, 10);
};

const DonutChartInline = ({ slices, total }: { slices: { label: string; value: number; color: string }[]; total: number }) => {
  return (
    <div className="flex items-center justify-center">
      <DonutChart slices={slices} size={170} centerValue={`₹${fmtInt(total)}`} centerLabel="Total" />
    </div>
  );
};
