import { useState } from 'react';
import { Wallet, IndianRupee, Receipt, Clock, Info, CheckCircle2, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { fmtMoney } from '@/lib/calc';
import type { DashboardSummary } from '@/lib/api';
import type { DerivedReport } from '@/lib/types';
import type { DayWiseRevenueData } from '@/lib/api-revenue';

interface FinancialOverviewProps {
  mtd: DashboardSummary['mtd'] | null;
  today?: DerivedReport | null;
  periodSummary?: DayWiseRevenueData['summary'] | null;
  periodSubtitle?: string;
  periodBadge?: string;
  viewScope?: 'daily' | 'mtd';
  selectedDate?: string;
  onOpenHistory?: () => void;
  onDrilldownRoomRevenue?: () => void;
}

const rs = (n: number | string): string => '\u20B9' + fmtMoney(typeof n === 'number' ? n : 0);

interface BreakdownCardProps {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  icon: React.ReactNode;
  iconBg?: string;
  children: React.ReactNode;
}

const BreakdownCard = ({
  title,
  subtitle = 'MTD',
  badge = 'Summary',
  badgeColor = 'bg-slate-100 text-slate-600 border-slate-200/60',
  icon,
  iconBg = 'bg-slate-50 text-slate-700',
  children,
}: BreakdownCardProps) => (
  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between group">
    <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100/90 flex items-center justify-between gap-2.5 bg-slate-50/60">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className={`w-8 h-8 rounded-xl border border-slate-200/60 shadow-2xs flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900 leading-tight truncate">{title}</h3>
          {subtitle && (
            <p className="text-[11px] font-medium text-slate-400 leading-tight mt-0.5 truncate" title={subtitle}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {badge && (
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border shrink-0 whitespace-nowrap ${badgeColor}`}>
          {badge}
        </span>
      )}
    </div>
    <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3">{children}</div>
  </div>
);

const RowItem = ({
  label,
  value,
  sublabel,
  color,
  barPercentage,
  barColor = 'bg-brand-500',
  isTotal,
  onClick,
}: {
  label: string;
  value: number;
  sublabel?: string;
  color?: string;
  barPercentage?: number;
  barColor?: string;
  isTotal?: boolean;
  onClick?: () => void;
}) => (
  <div
    onClick={onClick}
    className={`space-y-1 py-1.5 ${
      isTotal ? 'pt-3 mt-2 border-t border-slate-200 bg-slate-50/60 -mx-4 sm:-mx-5 px-4 sm:px-5 rounded-b-2xl' : ''
    } ${onClick ? 'cursor-pointer hover:bg-slate-50/80 -mx-2 px-2 rounded-lg transition-colors' : ''}`}
  >
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0 flex-1 pr-1">
        <span className={`text-xs block truncate ${isTotal ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
          {label}
        </span>
        {sublabel && <span className="text-[10px] text-slate-400 block -mt-0.5 truncate">{sublabel}</span>}
      </div>
      <span
        className={`tabular-nums shrink-0 ${
          isTotal ? 'text-base font-extrabold text-slate-900' : `text-xs sm:text-sm font-bold ${color ?? 'text-slate-800'}`
        }`}
      >
        {rs(value)}
      </span>
    </div>

    {/* Visual distribution mini-meter */}
    {!isTotal && barPercentage !== undefined && barPercentage > 0 && (
      <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(100, Math.max(3, barPercentage))}%` }}
        />
      </div>
    )}
  </div>
);

export const FinancialOverview = ({
  mtd,
  today,
  periodSummary,
  periodSubtitle,
  periodBadge,
  viewScope = 'daily',
  selectedDate,
  onOpenHistory,
  onDrilldownRoomRevenue,
}: FinancialOverviewProps) => {
  const [showReconDetails, setShowReconDetails] = useState(false);
  const isDaily = viewScope === 'daily';

  // ── Daily Values from today ──
  const dailyRoomRev = today?.room_revenue || today?.room_sale_amount || 0;
  const dailyFbRev = today?.fb_revenue || today?.kitchen || 0;
  const dailyMiscRev = (today?.misc_revenue || today?.other_income || 0) + (today?.other_revenue_entries || 0);
  const dailyEarnedRevenue = dailyRoomRev + dailyFbRev + dailyMiscRev || (today?.net_revenue || 0);

  const dailyPayCash = today?.pay_cash || 0;
  const dailyPayBank = today?.pay_bank || 0;
  const dailyPayUpi = today?.pay_upi || 0;
  const dailyPayCard = today?.pay_card || 0;
  const dailyTotalCollection = dailyPayCash + dailyPayBank + dailyPayUpi + dailyPayCard;
  const dailyUncollected = today?.pay_balance || 0;

  const dailyExpenseList = (today?.finance_expense_by_category ?? []).length > 0
    ? today?.finance_expense_by_category ?? []
    : today?.finance_expenses
    ? [{ category: 'Daily Operational Expenses', amount: today.finance_expenses }]
    : [];
  const dailyTotalExpense = today?.finance_expenses || today?.other_expense || 0;

  // ── MTD Values ──
  const mtdTotalCollection =
    mtd?.totalCollections ??
    (mtd?.payCash ?? 0) + (mtd?.payBank ?? 0) + (mtd?.payUpi ?? 0) + (mtd?.payCard ?? 0);

  const mtdEarnedRevenue = mtd?.totalRevenue ?? 0;
  const mtdEarnedCollected = mtd?.earnedRevenueCollected ?? 0;
  const mtdEarnedOutstanding = mtd?.earnedRevenueOutstanding ?? 0;
  const mtdUncollected = mtd?.payBalance ?? 0;
  const inHouseDue = mtd?.currentInHouseDue ?? 0;
  const timingDifference = mtdEarnedRevenue - mtdTotalCollection;

  // Active revenue numbers: prioritize periodSummary when provided, else scope
  const activeRoomRev = periodSummary ? periodSummary.roomRevenue : isDaily ? dailyRoomRev : (mtd?.roomRevenue ?? 0);
  const activeFbRev = periodSummary ? periodSummary.fbRevenue : isDaily ? dailyFbRev : (mtd?.fbRevenue ?? 0);
  const activeMiscRev = periodSummary ? periodSummary.otherIncome : isDaily ? dailyMiscRev : ((mtd?.miscRevenue ?? 0) + (mtd?.otherRevenue ?? 0));
  const activeEarnedRevenue = periodSummary ? periodSummary.totalIncome : isDaily ? dailyEarnedRevenue : mtdEarnedRevenue;

  // Active collections
  const activePayCash = periodSummary ? periodSummary.collections.cash : isDaily ? dailyPayCash : (mtd?.payCash ?? 0);
  const activePayBank = periodSummary ? periodSummary.collections.bank : isDaily ? dailyPayBank : (mtd?.payBank ?? 0);
  const activePayUpi = periodSummary ? periodSummary.collections.upi : isDaily ? dailyPayUpi : (mtd?.payUpi ?? 0);
  const activePayCard = periodSummary ? periodSummary.collections.card : isDaily ? dailyPayCard : (mtd?.payCard ?? 0);
  const activeTotalCollection = periodSummary ? periodSummary.collections.total : isDaily ? dailyTotalCollection : mtdTotalCollection;

  const activeUncollected = isDaily ? dailyUncollected : mtdUncollected;

  return (
    <div className="space-y-4">
      {/* 4-Card Grid: Income, Collections, Receivables/Outstanding, Expenses */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-5">
        {/* 1. Income Breakup (Accrual Earned Revenue) */}
        <BreakdownCard
          title="Income Breakup"
          subtitle={isDaily ? 'Accrual Revenue' : 'MTD Earned Revenue'}
          badge={periodBadge || "Accrual"}
          badgeColor="bg-blue-50 text-brand-700 border-blue-200/60"
          icon={<IndianRupee className="w-4 h-4 text-brand-600" />}
          iconBg="bg-brand-50"
        >
          <div className="space-y-1">
            <RowItem
              label="Room Revenue"
              sublabel={onDrilldownRoomRevenue || onOpenHistory ? "Occupied stay nights · View" : "Occupied stay nights"}
              value={activeRoomRev}
              color="text-brand-600"
              barPercentage={activeEarnedRevenue > 0 ? (activeRoomRev / activeEarnedRevenue) * 100 : 0}
              barColor="bg-brand-600"
              onClick={onDrilldownRoomRevenue || onOpenHistory}
            />
            <RowItem
              label="F&B Revenue"
              sublabel="Kitchen / Restaurant"
              value={activeFbRev}
              color="text-slate-700"
              barPercentage={activeEarnedRevenue > 0 ? (activeFbRev / activeEarnedRevenue) * 100 : 0}
              barColor="bg-amber-500"
            />
            <RowItem
              label="Other Income"
              sublabel="Misc & daily heads"
              value={activeMiscRev}
              color="text-slate-700"
              barPercentage={activeEarnedRevenue > 0 ? (activeMiscRev / activeEarnedRevenue) * 100 : 0}
              barColor="bg-teal-500"
            />
          </div>
          <div>
            <RowItem
              label={isDaily ? 'Total Daily Earned' : 'Total Earned Income'}
              sublabel={isDaily ? `For ${selectedDate}` : 'Cumulative period'}
              value={activeEarnedRevenue}
              isTotal
            />
            {onOpenHistory && (
              <button
                onClick={onOpenHistory}
                className="mt-2 text-[11px] font-bold text-brand-600 hover:text-brand-800 transition flex items-center gap-1 cursor-pointer"
              >
                <span>View Day-Wise Breakdown & History →</span>
              </button>
            )}
          </div>
        </BreakdownCard>

        {/* 2. Collection Breakup (Actual Money Received) */}
        <BreakdownCard
          title="Collection Breakup"
          subtitle={isDaily ? 'Realized Inflow' : 'MTD Realized Funds'}
          badge="Cash Basis"
          badgeColor="bg-emerald-50 text-emerald-700 border-emerald-200/60"
          icon={<Wallet className="w-4 h-4 text-emerald-600" />}
          iconBg="bg-emerald-50"
        >
          <div className="space-y-1">
            <RowItem
              label="Cash"
              sublabel="Physical currency"
              value={activePayCash}
              color="text-emerald-700"
              barPercentage={activeTotalCollection > 0 ? (activePayCash / activeTotalCollection) * 100 : 0}
              barColor="bg-emerald-600"
            />
            <RowItem
              label="Bank & OTA"
              sublabel="Bank payout & direct"
              value={activePayBank}
              color="text-slate-700"
              barPercentage={activeTotalCollection > 0 ? (activePayBank / activeTotalCollection) * 100 : 0}
              barColor="bg-slate-700"
            />
            <RowItem
              label="UPI Digital"
              sublabel="QR & online UPI"
              value={activePayUpi}
              color="text-brand-600"
              barPercentage={activeTotalCollection > 0 ? (activePayUpi / activeTotalCollection) * 100 : 0}
              barColor="bg-brand-600"
            />
            <RowItem
              label="Card POS"
              sublabel="Credit / Debit terminal"
              value={activePayCard}
              color="text-amber-700"
              barPercentage={activeTotalCollection > 0 ? (activePayCard / activeTotalCollection) * 100 : 0}
              barColor="bg-amber-500"
            />
          </div>
          <RowItem
            label={isDaily ? 'Daily Total Collected' : 'Total Collected'}
            sublabel="Actual funds received"
            value={activeTotalCollection}
            isTotal
          />
        </BreakdownCard>

        {/* 3. Receivables & Outstanding (Distinct Scope) */}
        <BreakdownCard
          title="Receivables & Due"
          subtitle={isDaily ? 'Pending & In-House Folios' : 'Outstanding Scope'}
          badge="Receivables"
          badgeColor="bg-amber-50 text-amber-800 border-amber-200/60"
          icon={<Clock className="w-4 h-4 text-amber-600" />}
          iconBg="bg-amber-50"
        >
          <div className="space-y-1">
            <RowItem
              label={isDaily ? 'Daily Uncollected' : 'MTD Uncollected'}
              sublabel="Pending on bookings"
              value={activeUncollected}
              color="text-amber-700"
              barPercentage={activeEarnedRevenue > 0 ? (activeUncollected / activeEarnedRevenue) * 100 : 0}
              barColor="bg-amber-500"
            />
            <RowItem
              label="Live In-House Due"
              sublabel="Active folios at front desk"
              value={inHouseDue}
              color="text-indigo-700"
              barPercentage={inHouseDue > 0 ? 80 : 0}
              barColor="bg-indigo-600"
            />
            {!isDaily && (
              <RowItem
                label="Earned Outstanding"
                sublabel="Unpaid occupied room nights"
                value={mtdEarnedOutstanding}
                color="text-slate-700"
                barPercentage={mtdEarnedRevenue > 0 ? (mtdEarnedOutstanding / mtdEarnedRevenue) * 100 : 0}
                barColor="bg-rose-500"
              />
            )}
          </div>
          <RowItem
            label={isDaily ? 'Pending On Day' : 'Total MTD Pending'}
            sublabel="Receivables balance"
            value={activeUncollected}
            isTotal
          />
        </BreakdownCard>

        {/* 4. Expense Breakup (Operating Expenses) */}
        <BreakdownCard
          title="Expense Breakup"
          subtitle={isDaily ? 'Operational Outflows' : 'MTD Operating Outflows'}
          badge="Expenses"
          badgeColor="bg-rose-50 text-rose-700 border-rose-200/60"
          icon={<Receipt className="w-4 h-4 text-rose-600" />}
          iconBg="bg-rose-50"
        >
          <div className="space-y-1">
            {isDaily ? (
              dailyExpenseList.length > 0 ? (
                dailyExpenseList.slice(0, 3).map((e, idx) => (
                  <RowItem
                    key={idx}
                    label={e.category}
                    value={e.amount}
                    color="text-rose-700"
                    barPercentage={dailyTotalExpense > 0 ? (e.amount / dailyTotalExpense) * 100 : 0}
                    barColor="bg-rose-500"
                  />
                ))
              ) : (
                <div className="py-6 text-center text-xs text-slate-400">No expense entries recorded for this date.</div>
              )
            ) : (mtd?.expenseByCategory ?? []).length > 0 ? (
              (mtd?.expenseByCategory ?? []).slice(0, 3).map((e) => {
                const totalExp = mtd?.totalExpenses ?? 1;
                return (
                  <RowItem
                    key={e.category}
                    label={e.category}
                    value={e.amount}
                    color="text-rose-700"
                    barPercentage={(e.amount / totalExp) * 100}
                    barColor="bg-rose-500"
                  />
                );
              })
            ) : (
              <div className="py-6 text-center text-xs text-slate-400">No expense entries recorded for this period.</div>
            )}
          </div>
          <RowItem
            label={isDaily ? 'Daily Total Expense' : 'Total Expenses'}
            sublabel="Operational overhead"
            value={isDaily ? dailyTotalExpense : (mtd?.totalExpenses ?? 0)}
            color="text-rose-700"
            isTotal
          />
        </BreakdownCard>
      </div>

      {/* Accounting Reconciliation Banner & Expandable Proof */}
      <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3.5 sm:p-4 text-xs transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-slate-900">Financial Audit Status: </span>
              <span className="text-slate-600">
                {isDaily
                  ? `Selected Date (${selectedDate}): Earned Revenue = ${rs(activeEarnedRevenue)}, Collections = ${rs(activeTotalCollection)}, Pending = ${rs(activeUncollected)}.`
                  : `Earned Revenue (${rs(mtdEarnedRevenue)}) = Collected (${rs(mtdEarnedCollected)}) + Outstanding (${rs(mtdEarnedOutstanding)}).`}
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowReconDetails(!showReconDetails)}
            className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700 self-start sm:self-auto transition-colors cursor-pointer"
          >
            <span>{showReconDetails ? 'Hide Audit Proof' : isDaily ? 'View Details' : `Timing Variance (₹${fmtMoney(timingDifference)})`}</span>
            {showReconDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showReconDetails && (
          <div className="mt-3 pt-3 border-t border-slate-200/70 space-y-2.5 text-slate-600 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200/70 shadow-2xs">
                <p className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-brand-600" /> Accrual vs Realized Timing Bridge
                </p>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Revenue is recognized per occupied room night, while collections reflect payment posting dates.
                  {isDaily
                    ? ` On ${selectedDate}, room charges total ₹${fmtMoney(activeRoomRev)} with ₹${fmtMoney(activeTotalCollection)} realized in cash/UPI/card/bank.`
                    : ` The ₹${fmtMoney(timingDifference)} variance is the net of uncollected bookings (₹${fmtMoney(mtdEarnedOutstanding)}) minus receipts for prior stays and advance bookings (₹${fmtMoney(mtd?.collectionsForOtherPeriods ?? 0)}).`}
                </p>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200/70 shadow-2xs">
                <p className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Operational Control Scope
                </p>
                <ul className="text-[11px] space-y-1 text-slate-500 list-disc list-inside">
                  <li><strong>Total Collections:</strong> ₹{fmtMoney(activeTotalCollection)} (Funds posted)</li>
                  <li><strong>Uncollected:</strong> ₹{fmtMoney(activeUncollected)} (Receivables on folios)</li>
                  <li><strong>Live In-House Due:</strong> ₹{fmtMoney(inHouseDue)} (Folios active right now at desk)</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
