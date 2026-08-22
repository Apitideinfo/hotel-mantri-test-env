import { Wallet, DollarSign, Receipt } from 'lucide-react';
import { fmtMoney } from '@/lib/calc';
import type { DashboardSummary } from '@/lib/api';

interface FinancialOverviewProps {
  mtd: DashboardSummary['mtd'] | null;
}

const rs = (n: number | string): string => '\u20B9' + fmtMoney(typeof n === 'number' ? n : 0);

interface BreakdownCardProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const BreakdownCard = ({ title, subtitle = 'MTD', icon, children }: BreakdownCardProps) => (
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
        Summary
      </span>
    </div>
    <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">{children}</div>
  </div>
);

const RowItem = ({ label, value, color, isTotal }: { label: string; value: number; color?: string; isTotal?: boolean }) => (
  <div className={`flex items-center justify-between py-2 ${isTotal ? 'pt-3 mt-2 border-t-2 border-slate-200/80' : 'border-b border-slate-100/60 last:border-0'}`}>
    <span className={`text-xs ${isTotal ? 'font-bold text-slate-900' : 'font-medium text-slate-600'}`}>{label}</span>
    <span className={`tabular-nums ${isTotal ? 'text-base font-bold text-slate-900' : `text-sm font-semibold ${color ?? 'text-slate-800'}`}`}>
      {rs(value)}
    </span>
  </div>
);

export const FinancialOverview = ({ mtd }: FinancialOverviewProps) => {
  const totalCollection = (mtd?.payCash ?? 0) + (mtd?.payBank ?? 0) + (mtd?.payUpi ?? 0) + (mtd?.payCard ?? 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
      {/* Income Breakup */}
      <BreakdownCard title="Income Breakup" icon={<DollarSign className="w-4 h-4 text-brand-600" />}>
        <div className="space-y-0.5">
          <RowItem label="Room Revenue" value={mtd?.roomRevenue ?? 0} color="text-brand-600" />
          <RowItem label="F&B Revenue" value={mtd?.fbRevenue ?? 0} />
          <RowItem label="Other Income" value={(mtd?.miscRevenue ?? 0) + (mtd?.otherRevenue ?? 0)} />
        </div>
        <RowItem label="Total Income" value={mtd?.totalRevenue ?? 0} isTotal />
      </BreakdownCard>

      {/* Collection Breakup */}
      <BreakdownCard title="Collection Breakup" icon={<Wallet className="w-4 h-4 text-emerald-600" />}>
        <div className="space-y-0.5">
          <RowItem label="Cash" value={mtd?.payCash ?? 0} color="text-emerald-600" />
          <RowItem label="Bank Direct" value={mtd?.payBank ?? 0} color="text-slate-700" />
          <RowItem label="UPI" value={mtd?.payUpi ?? 0} color="text-brand-600" />
          <RowItem label="Card" value={mtd?.payCard ?? 0} color="text-amber-600" />
        </div>
        <RowItem label="Total Collection" value={totalCollection} isTotal />
      </BreakdownCard>

      {/* Expense Breakup */}
      <BreakdownCard title="Expense Breakup" icon={<Receipt className="w-4 h-4 text-rose-600" />}>
        <div className="space-y-0.5">
          {(mtd?.expenseByCategory ?? []).length > 0 ? (
            (mtd?.expenseByCategory ?? []).slice(0, 4).map((e) => (
              <RowItem key={e.category} label={e.category} value={e.amount} color="text-rose-600" />
            ))
          ) : (
            <div className="py-4 text-center text-xs text-slate-400">No expense entries recorded for this period.</div>
          )}
        </div>
        <RowItem label="Total Expenses" value={mtd?.totalExpenses ?? 0} color="text-rose-600" isTotal />
      </BreakdownCard>
    </div>
  );
};
