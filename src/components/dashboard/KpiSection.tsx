import { ReactNode } from 'react';
import { DollarSign, Wallet, Banknote, Receipt, TrendingUp, Percent, BarChart3, Activity } from 'lucide-react';
import { fmtMoney } from '@/lib/calc';
import type { DashboardSummary } from '@/lib/api';

interface KpiSectionProps {
  mtd: DashboardSummary['mtd'] | null;
}

const rs = (n: number | string): string => '\u20B9' + fmtMoney(typeof n === 'number' ? n : 0);

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  color: string;
  iconBg: string;
  index: number;
}

const KpiCardItem = ({ label, value, sub, icon, color, iconBg, index }: KpiCardProps) => (
  <div
    className="bg-white rounded-2xl border border-slate-200/80 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 p-4 sm:p-5 flex flex-col justify-between gap-2.5 animate-kpi group min-w-0"
    style={{ animationDelay: `${index * 40}ms` }}
  >
    {/* Top: Label + Icon */}
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate group-hover:text-slate-600 transition-colors">
        {label}
      </span>
      <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center ${iconBg} shrink-0 transition-transform group-hover:scale-105`}>
        {icon}
      </div>
    </div>

    {/* Middle: Value (Strongest Visual Element, Never Clipped) */}
    <div className="min-w-0 overflow-hidden">
      <p className={`text-lg sm:text-xl xl:text-[22px] font-bold tabular-nums leading-tight tracking-tight whitespace-nowrap truncate ${color}`}>
        {value}
      </p>
    </div>

    {/* Bottom: Sub-metadata */}
    {sub && (
      <p className="text-[11px] font-medium text-slate-400 truncate border-t border-slate-100/60 pt-1.5 mt-0.5">
        {sub}
      </p>
    )}
  </div>
);

export const KpiSection = ({ mtd }: KpiSectionProps) => {
  const isPositiveNet = (mtd?.netIncome ?? 0) >= 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-8 gap-3.5 sm:gap-4">
      <KpiCardItem
        label="Total Income"
        value={rs(mtd?.totalRevenue ?? 0)}
        sub="MTD Total"
        icon={<DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />}
        color="text-brand-600"
        iconBg="bg-brand-50 text-brand-600"
        index={0}
      />
      <KpiCardItem
        label="Cash"
        value={rs(mtd?.cash ?? 0)}
        sub="MTD Collection"
        icon={<Wallet className="w-4 h-4 sm:w-5 sm:h-5" />}
        color="text-emerald-600"
        iconBg="bg-emerald-50 text-emerald-600"
        index={1}
      />
      <KpiCardItem
        label="Bank / OTA"
        value={rs(mtd?.bank ?? 0)}
        sub="MTD Collection"
        icon={<Banknote className="w-4 h-4 sm:w-5 sm:h-5" />}
        color="text-slate-800"
        iconBg="bg-slate-100 text-slate-700"
        index={2}
      />
      <KpiCardItem
        label="Total Expenses"
        value={rs(mtd?.totalExpenses ?? 0)}
        sub="MTD Expenses"
        icon={<Receipt className="w-4 h-4 sm:w-5 sm:h-5" />}
        color="text-rose-600"
        iconBg="bg-rose-50 text-rose-600"
        index={3}
      />
      <KpiCardItem
        label="Net Income"
        value={rs(mtd?.netIncome ?? 0)}
        sub="MTD Net Profit"
        icon={<TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />}
        color={isPositiveNet ? 'text-emerald-600' : 'text-rose-600'}
        iconBg={isPositiveNet ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}
        index={4}
      />
      <KpiCardItem
        label="Occupancy"
        value={`${(mtd?.occ ?? 0).toFixed(0)}%`}
        sub="MTD Average"
        icon={<Percent className="w-4 h-4 sm:w-5 sm:h-5" />}
        color="text-brand-600"
        iconBg="bg-brand-50 text-brand-600"
        index={5}
      />
      <KpiCardItem
        label="ARR (ADR)"
        value={rs(mtd?.arr ?? 0)}
        sub="Avg Daily Rate"
        icon={<BarChart3 className="w-4 h-4 sm:w-5 sm:h-5" />}
        color="text-amber-600"
        iconBg="bg-amber-50 text-amber-600"
        index={6}
      />
      <KpiCardItem
        label="RevPAR"
        value={rs(mtd?.revpar ?? 0)}
        sub="Per Available Room"
        icon={<Activity className="w-4 h-4 sm:w-5 sm:h-5" />}
        color="text-teal-600"
        iconBg="bg-teal-50 text-teal-600"
        index={7}
      />
    </div>
  );
};
