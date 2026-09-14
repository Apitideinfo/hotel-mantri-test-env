import { useMemo } from 'react';
import { TrendingUp, PieChart, BarChart2 } from 'lucide-react';
import { DonutChart, LineChart } from '@/components/charts';
import { calcTotalRevenue, calcTotalExpenses, calcOcc, fmtInt, fmtMoney, addDays, getTodayLocal } from '@/lib/calc';
import type { DashboardSummary } from '@/lib/api';

interface AnalyticsOverviewProps {
  summary: DashboardSummary | null;
}

const COLORS = {
  blue: '#2563eb',
  navy: '#1f3559',
  gold: '#f59e0b',
  emerald: '#16a34a',
  red: '#dc2626',
  teal: '#0d9488',
  slate: '#64748b',
};

const rs = (n: number | string): string => '\u20B9' + fmtMoney(typeof n === 'number' ? n : 0);

interface AnalyticsCardProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const AnalyticsCard = ({ title, subtitle, icon, children }: AnalyticsCardProps) => (
  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card hover:shadow-card-hover transition-all duration-200 overflow-hidden flex flex-col justify-between">
    <div className="px-5 py-4 border-b border-slate-100/80 flex items-center justify-between bg-slate-50/40">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-white border border-slate-200/60 shadow-sm flex items-center justify-center text-slate-700 shrink-0">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-[11px] font-medium text-slate-400">{subtitle}</p>}
        </div>
      </div>
    </div>
    <div className="p-5 flex-1 flex flex-col justify-center">{children}</div>
  </div>
);

const EmptyChartState = () => (
  <div className="py-12 text-center text-xs font-medium text-slate-400">
    No collection data recorded for this period yet.
  </div>
);

export const AnalyticsOverview = ({ summary }: AnalyticsOverviewProps) => {
  const mtd = summary?.mtd ?? null;
  const weekReports = summary?.weekReports ?? [];
  const totalRooms = summary?.settings?.total_rooms ?? 20;

  // Build continuous 7-day trend leading up to current business date
  const full7DaySeries = useMemo(() => {
    const anchorStr = summary?.today?.report_date ?? getTodayLocal();
    const result = [];
    const reportMap = new Map();
    weekReports.forEach((r) => {
      if (r?.report_date) reportMap.set(r.report_date, r);
    });

    for (let i = 6; i >= 0; i--) {
      const iso = addDays(anchorStr, -i);
      const [y, m, day] = iso.split('-').map(Number);
      void y;
      const monthDay = `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}`;

      const report = reportMap.get(iso);
      const rev = report ? calcTotalRevenue(report) : 0;
      const exp = report ? calcTotalExpenses(report) : 0;
      const occ = report ? calcOcc(report.rooms_occupied, totalRooms) : 0;

      result.push({
        iso,
        label: monthDay,
        revenue: Math.max(0, Math.round(rev)),
        expenses: Math.max(0, Math.round(exp)),
        occupancy: Math.min(100, Math.max(0, Math.round(occ))),
      });
    }
    return result;
  }, [weekReports, summary?.today?.report_date, totalRooms]);

  const revExpBar = useMemo(() => {
    return [
      {
        name: 'Revenue',
        color: COLORS.blue,
        points: full7DaySeries.map((d) => ({ label: d.label, value: d.revenue })),
      },
      {
        name: 'Expenses',
        color: COLORS.red,
        points: full7DaySeries.map((d) => ({ label: d.label, value: d.expenses })),
      },
    ];
  }, [full7DaySeries]);

  const occTrend = useMemo(() => {
    return full7DaySeries.map((d) => ({
      label: d.label,
      value: d.occupancy,
    }));
  }, [full7DaySeries]);

  const mtdCollectionDonut = useMemo(() => {
    if (!mtd) return [];
    const cash = Math.round(mtd.payCash || 0);
    const bank = Math.round(mtd.payBank || 0);
    const upi = Math.round(mtd.payUpi || 0);
    const card = Math.round(mtd.payCard || 0);
    return [
      { label: 'Cash', value: cash, color: COLORS.emerald },
      { label: 'Bank Direct', value: bank, color: COLORS.navy },
      { label: 'UPI', value: upi, color: COLORS.blue },
      { label: 'Card', value: card, color: COLORS.gold },
    ].filter((s) => s.value > 0);
  }, [mtd]);

  const totalCollected = (mtd?.payCash || 0) + (mtd?.payBank || 0) + (mtd?.payUpi || 0) + (mtd?.payCard || 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
      {/* Revenue vs Expenses Line Chart */}
      <AnalyticsCard title="Revenue vs Expenses" subtitle="Last 7 days" icon={<TrendingUp className="w-4 h-4 text-brand-600" />}>
        <LineChart series={revExpBar} yFormat={(v: number) => '\u20B9' + fmtInt(v)} height={220} />
      </AnalyticsCard>

      {/* Collection Breakup Donut Chart */}
      <AnalyticsCard title="Collection Breakup" subtitle="MTD Method Split" icon={<PieChart className="w-4 h-4 text-emerald-600" />}>
        {mtdCollectionDonut.length > 0 ? (
          <DonutChart
            slices={mtdCollectionDonut}
            size={180}
            centerValue={rs(totalCollected)}
            centerLabel="Collected"
          />
        ) : (
          <EmptyChartState />
        )}
      </AnalyticsCard>

      {/* Occupancy Trend Line Chart */}
      <AnalyticsCard title="Occupancy Trend" subtitle="Last 7 days (%)" icon={<BarChart2 className="w-4 h-4 text-amber-600" />}>
        <LineChart
          series={[{ name: 'Occupancy', color: COLORS.gold, points: occTrend }]}
          yFormat={(v: number) => `${v.toFixed(0)}%`}
          height={220}
        />
      </AnalyticsCard>

    </div>
  );
};
