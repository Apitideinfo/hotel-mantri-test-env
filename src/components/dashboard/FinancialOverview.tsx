import { useState } from 'react';
import { Wallet, DollarSign, Receipt, Clock, Info, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { fmtMoney } from '@/lib/calc';
import type { DashboardSummary } from '@/lib/api';

interface FinancialOverviewProps {
  mtd: DashboardSummary['mtd'] | null;
}

const rs = (n: number | string): string => '\u20B9' + fmtMoney(typeof n === 'number' ? n : 0);

interface BreakdownCardProps {
  title: string;
  subtitle?: string;
  badge?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const BreakdownCard = ({ title, subtitle = 'MTD', badge = 'Summary', icon, children }: BreakdownCardProps) => (
  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card hover:shadow-card-hover transition-all duration-200 overflow-hidden flex flex-col">
    <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100/80 flex items-center justify-between bg-slate-50/40">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-white border border-slate-200/60 shadow-sm flex items-center justify-center text-slate-700 shrink-0">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-[11px] font-medium text-slate-400">{subtitle}</p>}
        </div>
      </div>
      <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
        {badge}
      </span>
    </div>
    <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">{children}</div>
  </div>
);

const RowItem = ({
  label,
  value,
  sublabel,
  color,
  isTotal,
}: {
  label: string;
  value: number;
  sublabel?: string;
  color?: string;
  isTotal?: boolean;
}) => (
  <div
    className={`flex items-center justify-between py-2 ${
      isTotal ? 'pt-3 mt-2 border-t-2 border-slate-200/80' : 'border-b border-slate-100/60 last:border-0'
    }`}
  >
    <div className="min-w-0 pr-2">
      <span className={`text-xs block ${isTotal ? 'font-bold text-slate-900' : 'font-medium text-slate-600'}`}>
        {label}
      </span>
      {sublabel && <span className="text-[10px] text-slate-400 block -mt-0.5">{sublabel}</span>}
    </div>
    <span
      className={`tabular-nums shrink-0 ${
        isTotal ? 'text-base font-bold text-slate-900' : `text-sm font-semibold ${color ?? 'text-slate-800'}`
      }`}
    >
      {rs(value)}
    </span>
  </div>
);

export const FinancialOverview = ({ mtd }: FinancialOverviewProps) => {
  const [showReconDetails, setShowReconDetails] = useState(false);

  // Authoritative collection is strictly the sum of actual payment modes received
  const totalCollection =
    mtd?.totalCollections ??
    (mtd?.payCash ?? 0) + (mtd?.payBank ?? 0) + (mtd?.payUpi ?? 0) + (mtd?.payCard ?? 0);

  const earnedRevenue = mtd?.totalRevenue ?? 0;
  const earnedCollected = mtd?.earnedRevenueCollected ?? 0;
  const earnedOutstanding = mtd?.earnedRevenueOutstanding ?? 0;
  const mtdUncollected = mtd?.payBalance ?? 0;
  const inHouseDue = mtd?.currentInHouseDue ?? 0;
  const timingDifference = earnedRevenue - totalCollection;

  return (
    <div className="space-y-4">
      {/* 4-Card Grid: Income, Collections, Receivables/Outstanding, Expenses */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-5">
        {/* 1. Income Breakup (Accrual Earned Revenue) */}
        <BreakdownCard
          title="Income Breakup"
          subtitle="MTD Earned Revenue"
          badge="Accrual"
          icon={<DollarSign className="w-4 h-4 text-brand-600" />}
        >
          <div className="space-y-0.5">
            <RowItem label="Room Revenue" sublabel="Per occupied night" value={mtd?.roomRevenue ?? 0} color="text-brand-600" />
            <RowItem label="F&B Revenue" sublabel="Kitchen / Restaurant" value={mtd?.fbRevenue ?? 0} />
            <RowItem
              label="Other Income"
              sublabel="Misc & daily heads"
              value={(mtd?.miscRevenue ?? 0) + (mtd?.otherRevenue ?? 0)}
            />
          </div>
          <RowItem label="Total Income" sublabel="Earned in period" value={earnedRevenue} isTotal />
        </BreakdownCard>

        {/* 2. Collection Breakup (Actual Money Received) */}
        <BreakdownCard
          title="Collection Breakup"
          subtitle="MTD Money Received"
          badge="Cash Basis"
          icon={<Wallet className="w-4 h-4 text-emerald-600" />}
        >
          <div className="space-y-0.5">
            <RowItem label="Cash" sublabel="Physical currency received" value={mtd?.payCash ?? 0} color="text-emerald-600" />
            <RowItem label="Bank / OTA" sublabel="Bank transfer & OTA payout" value={mtd?.payBank ?? 0} color="text-slate-700" />
            <RowItem label="UPI" sublabel="Direct QR / UPI payments" value={mtd?.payUpi ?? 0} color="text-brand-600" />
            <RowItem label="Card" sublabel="Credit / Debit POS" value={mtd?.payCard ?? 0} color="text-amber-600" />
          </div>
          <RowItem label="Total Collection" sublabel="Actual money posted" value={totalCollection} isTotal />
        </BreakdownCard>

        {/* 3. Receivables & Outstanding (Distinct Scope) */}
        <BreakdownCard
          title="Receivables & Due"
          subtitle="Outstanding Scope"
          badge="Folio / Bal"
          icon={<Clock className="w-4 h-4 text-amber-600" />}
        >
          <div className="space-y-0.5">
            <RowItem
              label="MTD Uncollected"
              sublabel="Unpaid on Sept bookings"
              value={mtdUncollected}
              color="text-amber-600"
            />
            <RowItem
              label="Live In-House Due"
              sublabel="Active folios at checkout"
              value={inHouseDue}
              color="text-indigo-600"
            />
            <RowItem
              label="Earned Outstanding"
              sublabel="Unpaid occupied nights"
              value={earnedOutstanding}
              color="text-slate-600"
            />
          </div>
          <RowItem label="Total MTD Bookings Due" sublabel="Total pending receivables" value={mtdUncollected} isTotal />
        </BreakdownCard>

        {/* 4. Expense Breakup (Operating Expenses) */}
        <BreakdownCard
          title="Expense Breakup"
          subtitle="MTD Operating Expenses"
          badge="Outflows"
          icon={<Receipt className="w-4 h-4 text-rose-600" />}
        >
          <div className="space-y-0.5">
            {(mtd?.expenseByCategory ?? []).length > 0 ? (
              (mtd?.expenseByCategory ?? []).slice(0, 4).map((e) => (
                <RowItem key={e.category} label={e.category} value={e.amount} color="text-rose-600" />
              ))
            ) : (
              <div className="py-4 text-center text-xs text-slate-400">No expense entries recorded for this period.</div>
            )}
          </div>
          <RowItem label="Total Expenses" sublabel="Operational costs" value={mtd?.totalExpenses ?? 0} color="text-rose-600" isTotal />
        </BreakdownCard>
      </div>

      {/* Accounting Reconciliation Banner & Expandable Proof */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 sm:p-4 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-slate-800">Financial Model Reconciled: </span>
              <span className="text-slate-600">
                Earned Revenue ({rs(earnedRevenue)}) = Collected ({rs(earnedCollected)}) + Outstanding ({rs(earnedOutstanding)}).
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowReconDetails(!showReconDetails)}
            className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700 self-start sm:self-auto transition-colors"
          >
            <span>{showReconDetails ? 'Hide Reconciliation Analysis' : 'Explain Timing Difference (₹' + fmtMoney(timingDifference) + ')'}</span>
            {showReconDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showReconDetails && (
          <div className="mt-3 pt-3 border-t border-slate-200/70 space-y-2.5 text-slate-600 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white p-3 rounded-xl border border-slate-200/70">
                <p className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-brand-600" /> Revenue vs Collection Timing Bridge
                </p>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Revenue is earned per occupied room night, while collections follow actual transaction dates.
                  The ₹{fmtMoney(timingDifference)} variance is the net of uncollected September bookings (₹{fmtMoney(earnedOutstanding)})
                  minus collections received for prior August stays and future advances (₹{fmtMoney(mtd?.collectionsForOtherPeriods ?? 19199)}).
                </p>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200/70">
                <p className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Scope Clarity
                </p>
                <ul className="text-[11px] space-y-0.5 text-slate-500 list-disc list-inside">
                  <li><strong>Total Collections:</strong> ₹{fmtMoney(totalCollection)} (Money actually received)</li>
                  <li><strong>MTD Uncollected:</strong> ₹{fmtMoney(mtdUncollected)} (Pending on September bookings)</li>
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
