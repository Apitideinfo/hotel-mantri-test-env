import { ReactNode } from 'react';
import { IndianRupee, Wallet, Banknote, Receipt, TrendingUp, TrendingDown, Percent, BarChart3, Activity, Sparkles, Calendar } from 'lucide-react';
import { fmtMoney, fmtInt } from '@/lib/calc';
import type { DashboardSummary } from '@/lib/api';
import type { DerivedReport } from '@/lib/types';

interface KpiSectionProps {
  mtd: DashboardSummary['mtd'] | null;
  today?: DerivedReport | null;
  viewScope?: 'daily' | 'mtd';
  selectedDate?: string;
  totalRooms?: number;
  onToggleScope?: (scope: 'daily' | 'mtd') => void;
}

const rs = (n: number | string): string => '\u20B9' + fmtMoney(typeof n === 'number' ? n : 0);

interface PrimaryKpiProps {
  label: string;
  value: string;
  sublabel: string;
  pillText?: string;
  pillColor?: string;
  icon: ReactNode;
  iconBg: string;
  accentBorder: string;
  progressValue?: number;
  index: number;
}

const PrimaryKpiCard = ({
  label,
  value,
  sublabel,
  pillText,
  pillColor = 'bg-slate-100 text-slate-700',
  icon,
  iconBg,
  accentBorder,
  progressValue,
  index,
}: PrimaryKpiProps) => (
  <div
    className={`bg-white rounded-2xl border border-slate-200/80 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 p-5 flex flex-col justify-between space-y-4 group relative overflow-hidden min-w-0 ${accentBorder}`}
    style={{ animationDelay: `${index * 50}ms` }}
  >
    {/* Top Row: Label + Icon */}
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-slate-700 transition-colors truncate">
        {label}
      </span>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg} shrink-0 shadow-xs transition-transform group-hover:scale-105`}>
        {icon}
      </div>
    </div>

    {/* Center Value */}
    <div className="space-y-1">
      <p className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-slate-900 truncate" title={value}>
        {value}
      </p>
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <p className="text-xs font-medium text-slate-500 truncate">{sublabel}</p>
        {pillText && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-2xs ${pillColor}`}>
            {pillText}
          </span>
        )}
      </div>
    </div>

    {/* Optional Visual Mini Meter */}
    {progressValue !== undefined && (
      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div
          className="bg-brand-600 h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(2, progressValue))}%` }}
        />
      </div>
    )}
  </div>
);

interface SecondaryKpiProps {
  label: string;
  value: string;
  sub: string;
  icon: ReactNode;
  iconBg: string;
  textColor?: string;
  index: number;
}

const SecondaryKpiCard = ({ label, value, sub, icon, iconBg, textColor = 'text-slate-900', index }: SecondaryKpiProps) => (
  <div
    className="bg-slate-50/70 hover:bg-white rounded-xl border border-slate-200/70 hover:border-slate-300 p-3.5 shadow-2xs hover:shadow-card transition-all duration-200 flex items-center justify-between gap-3 group min-w-0"
    style={{ animationDelay: `${(index + 4) * 40}ms` }}
  >
    <div className="min-w-0 space-y-0.5">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">{label}</p>
      <p className={`text-base sm:text-lg font-bold tabular-nums tracking-tight truncate ${textColor}`} title={value}>
        {value}
      </p>
      <p className="text-[10px] font-medium text-slate-400 truncate">{sub}</p>
    </div>
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg} transition-transform group-hover:scale-105`}>
      {icon}
    </div>
  </div>
);

export const KpiSection = ({
  mtd,
  today,
  viewScope = 'daily',
  selectedDate,
  totalRooms = 20,
  onToggleScope,
}: KpiSectionProps) => {
  const isDaily = viewScope === 'daily';

  // ── Daily Calculations for Selected Date ──
  const dailyRoomRev = today?.room_revenue || today?.room_sale_amount || 0;
  const dailyFbRev = today?.fb_revenue || today?.kitchen || 0;
  const dailyMiscRev = (today?.misc_revenue || today?.other_income || 0) + (today?.other_revenue_entries || 0);
  const dailyEarnedRevenue = dailyRoomRev + dailyFbRev + dailyMiscRev || (today?.net_revenue || 0);

  const dailyRoomsOccupied = today?.rooms_occupied || 0;
  const dailyOcc = totalRooms > 0 ? (dailyRoomsOccupied / totalRooms) * 100 : 0;
  const dailyArr = dailyRoomsOccupied > 0 ? dailyRoomRev / dailyRoomsOccupied : 0;
  const dailyRevpar = totalRooms > 0 ? dailyRoomRev / totalRooms : 0;

  const dailyTotalCollections = (today?.pay_cash || 0) + (today?.pay_bank || 0) + (today?.pay_upi || 0) + (today?.pay_card || 0);
  const dailyCash = today?.cash || today?.pay_cash || 0;
  const dailyBank = today?.bank || today?.pay_bank || 0;
  const dailyExpenses = today?.finance_expenses || today?.other_expense || 0;
  const dailyNetIncome = dailyEarnedRevenue - dailyExpenses;

  // ── MTD Calculations ──
  const mtdEarnedRevenue = mtd?.totalRevenue ?? 0;
  const mtdTotalCollections = mtd?.totalCollections ?? (mtd ? (mtd.payCash || 0) + (mtd.payBank || 0) + (mtd.payCard || 0) + (mtd.payUpi || 0) : 0);
  const mtdOcc = mtd?.occ ?? 0;
  const mtdArr = mtd?.arr ?? 0;
  const mtdRevpar = mtd?.revpar ?? 0;
  const mtdNetIncome = mtd?.netIncome ?? 0;

  // Active metrics based on viewScope
  const displayEarnedRevenue = isDaily ? dailyEarnedRevenue : mtdEarnedRevenue;
  const displayRoomRev = isDaily ? dailyRoomRev : (mtd?.roomRevenue ?? 0);
  const displayOcc = isDaily ? dailyOcc : mtdOcc;
  const displayArr = isDaily ? dailyArr : mtdArr;
  const displayRevpar = isDaily ? dailyRevpar : mtdRevpar;
  const displayTotalCollections = isDaily ? dailyTotalCollections : mtdTotalCollections;
  const displayCash = isDaily ? dailyCash : (mtd?.cash ?? 0);
  const displayBank = isDaily ? dailyBank : (mtd?.bank ?? 0);
  const displayNetIncome = isDaily ? dailyNetIncome : mtdNetIncome;
  const displayExpenses = isDaily ? dailyExpenses : (mtd?.totalExpenses ?? 0);

  const isPositiveNet = displayNetIncome >= 0;

  return (
    <div className="space-y-4">
      {/* Scope Header Banner */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
            {isDaily ? 'Daily Performance Key Metrics' : 'MTD Cumulative Key Metrics'}
          </span>
          {isDaily && selectedDate && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <Sparkles className="w-3 h-3 text-emerald-600" />
              {selectedDate}
            </span>
          )}
        </div>

        {onToggleScope && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>View Mode:</span>
            <button
              onClick={() => onToggleScope(isDaily ? 'mtd' : 'daily')}
              className="font-bold text-brand-600 hover:text-brand-700 underline transition-colors cursor-pointer"
            >
              Switch to {isDaily ? 'MTD Month View' : 'Daily Date View'}
            </button>
          </div>
        )}
      </div>

      {/* 1. Primary Executive Metric Pillars (4 Core Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Total Earned Revenue */}
        <PrimaryKpiCard
          label={isDaily ? 'Daily Earned Revenue' : 'Earned Revenue (MTD)'}
          value={rs(displayEarnedRevenue)}
          sublabel={isDaily ? `Room: ${rs(displayRoomRev)} • F&B: ${rs(dailyFbRev)}` : `Room: ${rs(displayRoomRev)}`}
          pillText={isDaily ? `Daily (${selectedDate ?? 'Selected'})` : 'MTD Accrual'}
          pillColor={isDaily ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-blue-50 text-brand-700 border border-blue-200/60'}
          icon={<IndianRupee className="w-5 h-5 text-brand-600" />}
          iconBg="bg-brand-50 text-brand-600"
          accentBorder="hover:border-brand-300"
          progressValue={displayEarnedRevenue > 0 ? (displayRoomRev / displayEarnedRevenue) * 100 : 0}
          index={0}
        />

        {/* Occupancy Rate */}
        <PrimaryKpiCard
          label={isDaily ? 'Daily Occupancy' : 'Occupancy Rate'}
          value={`${displayOcc.toFixed(0)}%`}
          sublabel={isDaily ? `${dailyRoomsOccupied} of ${totalRooms} Rooms Occupied` : `${fmtInt(mtd?.roomNights ?? 0)} Room Nights Sold`}
          pillText={displayOcc >= 70 ? 'High Demand' : displayOcc >= 40 ? 'Moderate' : 'Capacity Available'}
          pillColor={displayOcc >= 70 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-amber-50 text-amber-700 border border-amber-200/60'}
          icon={<Percent className="w-5 h-5 text-amber-600" />}
          iconBg="bg-amber-50 text-amber-600"
          accentBorder="hover:border-amber-300"
          progressValue={displayOcc}
          index={1}
        />

        {/* Average Daily Rate (ADR / ARR) */}
        <PrimaryKpiCard
          label="Average Daily Rate"
          value={rs(displayArr)}
          sublabel={isDaily ? 'Daily Room Tariff Realization' : 'Average Room Realization'}
          pillText="ADR (ARR)"
          pillColor="bg-teal-50 text-teal-700 border border-teal-200/60"
          icon={<BarChart3 className="w-5 h-5 text-teal-600" />}
          iconBg="bg-teal-50 text-teal-600"
          accentBorder="hover:border-teal-300"
          index={2}
        />

        {/* RevPAR */}
        <PrimaryKpiCard
          label="RevPAR"
          value={rs(displayRevpar)}
          sublabel={isDaily ? 'Daily Yield / Available Room' : 'Per Available Room Yield'}
          pillText="Revenue Yield"
          pillColor="bg-indigo-50 text-indigo-700 border border-indigo-200/60"
          icon={<Activity className="w-5 h-5 text-indigo-600" />}
          iconBg="bg-indigo-50 text-indigo-600"
          accentBorder="hover:border-indigo-300"
          index={3}
        />
      </div>

      {/* 2. Secondary Financial Velocity Strip (4 Cash & Operational Metrics) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <SecondaryKpiCard
          label={isDaily ? 'Daily Collection' : 'Total Collection'}
          value={rs(displayTotalCollections)}
          sub={isDaily ? `Realized Funds (${selectedDate})` : 'Realized Cash & Digital'}
          icon={<Wallet className="w-4 h-4 text-emerald-600" />}
          iconBg="bg-emerald-50"
          textColor="text-emerald-700"
          index={0}
        />

        <SecondaryKpiCard
          label={isDaily ? 'Daily Cash' : 'Cash In Hand'}
          value={rs(displayCash)}
          sub={isDaily ? 'Cash Received Today' : 'MTD Cash Received'}
          icon={<Banknote className="w-4 h-4 text-blue-600" />}
          iconBg="bg-blue-50"
          textColor="text-slate-900"
          index={1}
        />

        <SecondaryKpiCard
          label={isDaily ? 'Daily Bank & OTA' : 'Bank & OTA Recv'}
          value={rs(displayBank)}
          sub={isDaily ? 'UPI & Bank Payments' : 'Digital / Channel Recv'}
          icon={<IndianRupee className="w-4 h-4 text-indigo-600" />}
          iconBg="bg-indigo-50"
          textColor="text-slate-900"
          index={2}
        />

        <SecondaryKpiCard
          label={isDaily ? 'Daily Net Margin' : 'Net Profit Margin'}
          value={rs(displayNetIncome)}
          sub={`Expenses: ${rs(displayExpenses)}`}
          icon={isPositiveNet ? <TrendingUp className="w-4 h-4 text-emerald-600" /> : <TrendingDown className="w-4 h-4 text-rose-600" />}
          iconBg={isPositiveNet ? 'bg-emerald-50' : 'bg-rose-50'}
          textColor={isPositiveNet ? 'text-emerald-700' : 'text-rose-700'}
          index={3}
        />
      </div>
    </div>
  );
};
