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
          <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <KPICard label="Today's Collection" value={fmtMoney(kpis.todayCollection)} icon={<IndianRupee className="w-4 h-4" />} color="text-emerald-600 bg-emerald-50" />
            <KPICard label="Cash Collection" value={fmtMoney(kpis.todayCashCollection)} icon={<Banknote className="w-4 h-4" />} color="text-amber-600 bg-amber-50" />
            <KPICard label="Bank/UPI/Card" value={fmtMoney(kpis.todayBankCollection)} icon={<CreditCard className="w-4 h-4" />} color="text-blue-600 bg-blue-50" />
            <KPICard label="Today's Expenses" value={fmtMoney(kpis.todayExpenses)} icon={<TrendingDown className="w-4 h-4" />} color="text-red-600 bg-red-50" />
            <KPICard label="Cash Closing" value={fmtMoney(kpis.cashClosing)} icon={<Wallet className="w-4 h-4" />} color="text-slate-700 bg-slate-100" />
            <KPICard label="Total Receivables" value={fmtMoney(kpis.totalReceivables)} icon={<Clock className="w-4 h-4" />} color="text-violet-600 bg-violet-50" />
            <KPICard label="Total Payables" value={fmtMoney(kpis.totalPayables)} icon={<Clock className="w-4 h-4" />} color="text-rose-600 bg-rose-50" />
            <KPICard label="MTD Revenue" value={fmtMoney(kpis.mtdRevenue)} icon={<TrendingUp className="w-4 h-4" />} color="text-emerald-600 bg-emerald-50" />
            <KPICard label="MTD Expenses" value={fmtMoney(kpis.mtdExpenses)} icon={<TrendingDown className="w-4 h-4" />} color="text-red-600 bg-red-50" />
            <KPICard label="MTD Operating Profit" value={fmtMoney(kpis.mtdOperatingProfit)} icon={<PieChart className="w-4 h-4" />} color={kpis.mtdOperatingProfit >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'} />
            <KPICard label="OTA Outstanding" value={fmtMoney(kpis.outstandingOTA)} icon={<AlertCircle className="w-4 h-4" />} color="text-orange-600 bg-orange-50" />
            <KPICard label="Corporate Outstanding" value={fmtMoney(kpis.outstandingCorporate)} icon={<AlertCircle className="w-4 h-4" />} color="text-indigo-600 bg-indigo-50" />
          </div>

          {/* Quick Navigation */}
          <div className="px-4 pb-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Accounting Modules</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
              {navItems.map((item) => (
                <button key={item.id} onClick={() => onNavigate(item.id)}
                  className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl p-2.5 shadow-sm transition text-left">
                  <span className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center text-sky-600 shrink-0">
                    {item.icon}
                  </span>
                  <span className="text-xs font-semibold text-slate-700">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

const KPICard = ({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
    <div className="flex items-center justify-between mb-2">
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>{icon}</span>
    </div>
    <p className="text-lg font-bold text-slate-800 tabular-nums">{value}</p>
    <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">{label}</p>
  </div>
);
