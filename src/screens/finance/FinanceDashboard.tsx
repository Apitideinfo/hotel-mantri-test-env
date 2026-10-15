import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Wallet, TrendingUp, TrendingDown, IndianRupee,
  Banknote, CreditCard, Clock, AlertCircle, Loader2,
  BarChart3, PieChart, Activity,
} from 'lucide-react';
import { ScreenHeader, fmtMoney } from '@/components/finance-ui';
import { getFinanceKPIs, type FinanceDashboardKPIs } from '@/lib/api-accounting';

interface FinanceDashboardProps {
  onBack: () => void;
  onNavigate: (screen: string) => void;
}

export const FinanceDashboard = ({ onBack, onNavigate }: FinanceDashboardProps) => {
  const [kpis, setKpis] = useState<FinanceDashboardKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getFinanceKPIs();
      setKpis(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const navItems = [
    { id: 'chart-of-accounts', label: 'Chart of Accounts', icon: <Wallet className="w-4 h-4" /> },
    { id: 'journals', label: 'Journal Entries', icon: <Activity className="w-4 h-4" /> },
    { id: 'vouchers', label: 'Vouchers', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'cash-book', label: 'Cash Book', icon: <Banknote className="w-4 h-4" /> },
    { id: 'bank-book', label: 'Bank Book', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'receivables', label: 'Receivables', icon: <Clock className="w-4 h-4" /> },
    { id: 'payables', label: 'Payables', icon: <Clock className="w-4 h-4" /> },
    { id: 'guest-ledger', label: 'Guest Ledger', icon: <Wallet className="w-4 h-4" /> },
    { id: 'corporate-ledger', label: 'Corporate Ledger', icon: <Wallet className="w-4 h-4" /> },
    { id: 'ota-ledger', label: 'OTA Ledger', icon: <Wallet className="w-4 h-4" /> },
    { id: 'vendor-ledger', label: 'Vendor Ledger', icon: <Wallet className="w-4 h-4" /> },
    { id: 'pl-report', label: 'Profit & Loss', icon: <PieChart className="w-4 h-4" /> },
    { id: 'trial-balance', label: 'Trial Balance', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'balance-sheet', label: 'Balance Sheet', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'reconciliation', label: 'Reconciliation', icon: <Activity className="w-4 h-4" /> },
    { id: 'finance-exceptions', label: 'Exceptions', icon: <AlertCircle className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <ScreenHeader title="Finance Dashboard" subtitle="Enterprise Accounting Control" onBack={onBack}
        icon={<Wallet className="w-5 h-5 text-sky-300" />} />

      {error && (
        <div className="m-4 bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}. <button onClick={load} className="font-semibold underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      ) : kpis ? (
        <>
          {/* KPI Cards */}
          <div className="px-4 lg:px-6 py-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3.5">
            <KPICard label="Today's Collection" value={fmtMoney(kpis.todayCollection)} icon={<IndianRupee className="w-4 h-4" />} color="text-emerald-600 bg-emerald-50 border-emerald-100" />
            <KPICard label="Cash Collection" value={fmtMoney(kpis.todayCashCollection)} icon={<Banknote className="w-4 h-4" />} color="text-amber-600 bg-amber-50 border-amber-100" />
            <KPICard label="Bank/UPI/Card" value={fmtMoney(kpis.todayBankCollection)} icon={<CreditCard className="w-4 h-4" />} color="text-sky-600 bg-sky-50 border-sky-100" />
            <KPICard label="Today's Expenses" value={fmtMoney(kpis.todayExpenses)} icon={<TrendingDown className="w-4 h-4" />} color="text-rose-600 bg-rose-50 border-rose-100" />
            <KPICard label="Cash Closing" value={fmtMoney(kpis.cashClosing)} icon={<Wallet className="w-4 h-4" />} color="text-slate-700 bg-slate-100 border-slate-200" />
            <KPICard label="Total Receivables" value={fmtMoney(kpis.totalReceivables)} icon={<Clock className="w-4 h-4" />} color="text-violet-600 bg-violet-50 border-violet-100" />
            <KPICard label="Total Payables" value={fmtMoney(kpis.totalPayables)} icon={<Clock className="w-4 h-4" />} color="text-rose-600 bg-rose-50 border-rose-100" />
            <KPICard label="MTD Revenue" value={fmtMoney(kpis.mtdRevenue)} icon={<TrendingUp className="w-4 h-4" />} color="text-emerald-600 bg-emerald-50 border-emerald-100" />
            <KPICard label="MTD Expenses" value={fmtMoney(kpis.mtdExpenses)} icon={<TrendingDown className="w-4 h-4" />} color="text-rose-600 bg-rose-50 border-rose-100" />
            <KPICard label="MTD Operating Profit" value={fmtMoney(kpis.mtdOperatingProfit)} icon={<PieChart className="w-4 h-4" />} color={kpis.mtdOperatingProfit >= 0 ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-rose-600 bg-rose-50 border-rose-100'} />
            <KPICard label="OTA Outstanding" value={fmtMoney(kpis.outstandingOTA)} icon={<AlertCircle className="w-4 h-4" />} color="text-orange-600 bg-orange-50 border-orange-100" />
            <KPICard label="Corporate Outstanding" value={fmtMoney(kpis.outstandingCorporate)} icon={<AlertCircle className="w-4 h-4" />} color="text-indigo-600 bg-indigo-50 border-indigo-100" />
          </div>

          {/* Quick Navigation */}
          <div className="px-4 lg:px-6 pb-8">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Accounting Control Modules</h3>
              <span className="text-[11px] text-slate-400 font-medium">16 modules configured</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className="group flex items-center gap-3 bg-white hover:bg-slate-50/80 border border-slate-200/80 hover:border-sky-300/80 rounded-2xl p-3.5 shadow-2xs hover:shadow-xs transition-all duration-200 text-left cursor-pointer active:scale-[0.99]"
                >
                  <span className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-100/80 group-hover:bg-sky-100 flex items-center justify-center text-sky-600 shrink-0 transition-colors">
                    {item.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-sky-900 transition-colors truncate">{item.label}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">Manage</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

const KPICard = ({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) => (
  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300/90 hover:shadow-card-hover transition-all duration-200 p-4">
    <div className="flex items-center justify-between mb-3">
      <span className={`w-8 h-8 rounded-xl border flex items-center justify-center ${color}`}>{icon}</span>
    </div>
    <p className="text-lg sm:text-xl font-black text-slate-900 tabular-nums tracking-tight">{value}</p>
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1 truncate">{label}</p>
  </div>
);
