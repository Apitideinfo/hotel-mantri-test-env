import React, { useState, useEffect } from 'react';
import {
  ArrowRight, Wallet, BookOpen, Lock, BookMarked, FileText,
  TrendingUp, ShieldCheck, DollarSign, PlusCircle, Users,
  Zap, Receipt, Landmark, Scale, BarChart3, Clock, CheckCircle2,
  AlertCircle, ArrowUpRight, ArrowDownRight, Sparkles, RefreshCw,
  Building2, CreditCard, ChevronRight
} from 'lucide-react';
import { getSettings, getDerivedReport, getDayCloseRecord } from '@/lib/api';
import { toNum, fmtMoney } from '@/lib/calc';
import type { HotelSettings, DerivedReport, DayCloseRecord } from '@/lib/types';

interface FinanceHubProps {
  onBack: () => void;
  onNavigate: (screen: string) => void;
}

interface ModuleCard {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  iconColor: string;
  badge?: string;
  isPrimary?: boolean;
}

export const FinanceHub: React.FC<FinanceHubProps> = ({ onBack, onNavigate }) => {
  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<DerivedReport | null>(null);
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [dayClose, setDayClose] = useState<DayCloseRecord | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadFinancialOverview = async () => {
      setLoading(true);
      try {
        const s = await getSettings().catch(() => null);
        const totalRooms = s?.total_rooms ?? 20;
        const openingBal = s?.opening_cash_balance ?? 10000;

        const [r, dc] = await Promise.all([
          getDerivedReport(todayStr, totalRooms, openingBal).catch(() => null),
          getDayCloseRecord(todayStr).catch(() => null),
        ]);

        if (isMounted) {
          setSettings(s);
          setReport(r);
          setDayClose(dc);
        }
      } catch (err) {
        console.error('Error loading finance hub data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadFinancialOverview();
    return () => { isMounted = false; };
  }, [todayStr]);

  // Derived financial metrics
  const roomRev = report ? toNum(report.room_sale_amount) : 0;
  const fnbRev = report ? toNum(report.kitchen) : 0;
  const otherRev = report ? toNum(report.other_income) + toNum(report.other_revenue_entries) : 0;
  const totalInflow = roomRev + fnbRev + otherRev;

  const expenses = report
    ? toNum(report.housekeeping_supply) + toNum(report.other_expense) + toNum(report.maintenance_bill) + toNum(report.finance_expenses)
    : 0;
  const salaryAdvances = report ? toNum(report.salary_advance) : 0;
  const totalOutflow = expenses + salaryAdvances;

  const netSurplus = totalInflow - totalOutflow;
  const cashClosing = report ? toNum(report.cash_closing) : (settings?.opening_cash_balance ?? 0);
  const isDayClosed = dayClose?.status === 'closed';

  const dailyModules: ModuleCard[] = [
    {
      id: 'expense-entry',
      title: 'Add Expense Voucher',
      category: 'Daily Cash Desk',
      description: 'Record petty cash, vendor payout, maintenance or housekeeping expense with bill upload.',
      icon: PlusCircle,
      gradient: 'from-rose-500/10 to-amber-500/10 hover:from-rose-500/20 hover:to-amber-500/20',
      iconColor: 'bg-rose-500 text-white shadow-rose-500/30',
      badge: 'Quick Action',
      isPrimary: true,
    },
    {
      id: 'close-day',
      title: 'Cash & Day Closing',
      category: 'Audit & Reconciliation',
      description: 'Audit cash drawer against room sales, count physical currency, and freeze daily accounts.',
      icon: Lock,
      gradient: 'from-sky-500/10 to-indigo-500/10 hover:from-sky-500/20 hover:to-indigo-500/20',
      iconColor: 'bg-sky-600 text-white shadow-sky-600/30',
      badge: isDayClosed ? 'Closed & Locked' : 'Daily Reconcile',
    },
    {
      id: 'expense-ledger',
      title: 'Expense Audit Ledger',
      category: 'Expense Register',
      description: 'Filter, view, search, and export categorized hotel operational expenditures.',
      icon: BookOpen,
      gradient: 'from-indigo-500/10 to-blue-500/10 hover:from-indigo-500/20 hover:to-blue-500/20',
      iconColor: 'bg-indigo-600 text-white shadow-indigo-600/30',
    },
    {
      id: 'utility-bills',
      title: 'Utilities & Recurring Bills',
      category: 'Property Overheads',
      description: 'Manage electricity meter logs, laundry contracts, water, internet, and software bills.',
      icon: Zap,
      gradient: 'from-amber-500/10 to-yellow-500/10 hover:from-amber-500/20 hover:to-yellow-500/20',
      iconColor: 'bg-amber-500 text-white shadow-amber-500/30',
    },
  ];

  const ledgerModules: ModuleCard[] = [
    {
      id: 'ledgers',
      title: 'Outstanding Ledgers',
      category: 'Receivables & Payables',
      description: 'Track outstanding dues from Guest City Ledgers, OTAs (MMT, Agoda), Corporate & Travel Agents.',
      icon: BookMarked,
      gradient: 'from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20',
      iconColor: 'bg-amber-600 text-white shadow-amber-600/30',
      badge: 'City Ledger',
    },
    {
      id: 'staff',
      title: 'Staff Payroll & Advances',
      category: 'Human Resources',
      description: 'Maintain staff profiles, disburse monthly advances, deductions, and finalize salary settlement.',
      icon: Users,
      gradient: 'from-emerald-500/10 to-teal-500/10 hover:from-emerald-500/20 hover:to-teal-500/20',
      iconColor: 'bg-emerald-600 text-white shadow-emerald-600/30',
    },
    {
      id: 'receivables',
      title: 'Accounts Receivable (AR)',
      category: 'Credit Monitoring',
      description: 'Aging summary, credit limits, unpaid corporate invoices, and collection pipeline.',
      icon: Receipt,
      gradient: 'from-violet-500/10 to-purple-500/10 hover:from-violet-500/20 hover:to-purple-500/20',
      iconColor: 'bg-violet-600 text-white shadow-violet-600/30',
    },
    {
      id: 'payables',
      title: 'Accounts Payable (AP)',
      category: 'Vendor Management',
      description: 'Vendor bills, supplier invoices, payment scheduling, and pending clearances.',
      icon: CreditCard,
      gradient: 'from-pink-500/10 to-rose-500/10 hover:from-pink-500/20 hover:to-rose-500/20',
      iconColor: 'bg-pink-600 text-white shadow-pink-600/30',
    },
  ];

  const complianceModules: ModuleCard[] = [
    {
      id: 'gst-report',
      title: 'GST Tax Compliance',
      category: 'Statutory Returns',
      description: 'Monthly GSTR-1, GSTR-3B audit sheets with SAC breakdown and CGST/SGST/IGST tax liability.',
      icon: FileText,
      gradient: 'from-blue-500/10 to-cyan-500/10 hover:from-blue-500/20 hover:to-cyan-500/20',
      iconColor: 'bg-blue-600 text-white shadow-blue-600/30',
      badge: 'Govt Compliant',
    },
    {
      id: 'profitability',
      title: 'Monthly P&L & Margins',
      category: 'Financial Intelligence',
      description: 'Comprehensive Profit & Loss statements, departmental gross margins, and Net Operating Income.',
      icon: TrendingUp,
      gradient: 'from-emerald-500/10 to-green-500/10 hover:from-emerald-500/20 hover:to-green-500/20',
      iconColor: 'bg-emerald-600 text-white shadow-emerald-600/30',
    },
    {
      id: 'finance-dashboard',
      title: 'Accounting Dashboard',
      category: 'Enterprise Ledger',
      description: 'Double-entry general journal, Chart of Accounts, Trial Balance, and Cash/Bank books.',
      icon: Scale,
      gradient: 'from-purple-500/10 to-indigo-500/10 hover:from-purple-500/20 hover:to-indigo-500/20',
      iconColor: 'bg-purple-600 text-white shadow-purple-600/30',
      badge: 'Double-Entry',
    },
    {
      id: 'cash-book',
      title: 'Cash & Bank Passbook',
      category: 'Banking Trail',
      description: 'Real-time bank transfers, UPI settlements, cash deposits, and balance reconciliations.',
      icon: Landmark,
      gradient: 'from-teal-500/10 to-emerald-500/10 hover:from-teal-500/20 hover:to-emerald-500/20',
      iconColor: 'bg-teal-600 text-white shadow-teal-600/30',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-900/[0.02] text-slate-800 pb-16">
      {/* ── Top Floating Header ── */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-slate-200/80 shadow-xs px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 -ml-1.5 hover:bg-slate-100 rounded-xl text-slate-600 transition cursor-pointer"
              title="Go Back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  Finance & Accounting Hub
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" /> Audit Ready
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Real-time Cash Flow · Ledgers · GST Compliance · P&L Statements
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('expense-entry')}
              className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Expense</span>
            </button>
            <button
              onClick={() => onNavigate('close-day')}
              className="px-4 py-2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-brand-500/20 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Day Closing</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-7">
        {/* ── Today's Executive Financial Performance Strip ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">
                Today's Live Financial Position ({new Date(todayStr + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })})
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              {isDayClosed ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px]">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Day Closed & Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[11px]">
                  <AlertCircle className="w-3 h-3 text-amber-600" /> Day Open for Transactions
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
            {/* Card 1: Inflow */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-card hover:shadow-card-hover transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gross Inflows</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  ₹{fmtMoney(totalInflow)}
                </h3>
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mt-1">
                  <span>Room: ₹{fmtMoney(roomRev)}</span>
                  <span>F&B: ₹{fmtMoney(fnbRev)}</span>
                </div>
              </div>
            </div>

            {/* Card 2: Outflow */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-card hover:shadow-card-hover transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Outflows</span>
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <ArrowDownRight className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  ₹{fmtMoney(totalOutflow)}
                </h3>
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mt-1">
                  <span>Exp: ₹{fmtMoney(expenses)}</span>
                  <span>Advances: ₹{fmtMoney(salaryAdvances)}</span>
                </div>
              </div>
            </div>

            {/* Card 3: Net Balance */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-card hover:shadow-card-hover transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Net Operating Surplus</span>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${netSurplus >= 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <h3 className={`text-xl sm:text-2xl font-black tracking-tight ${netSurplus >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                  {netSurplus >= 0 ? '+' : ''}₹{fmtMoney(netSurplus)}
                </h3>
                <p className="text-[11px] font-semibold text-slate-400 mt-1">
                  {netSurplus >= 0 ? 'Operating cash positive' : 'Operational deficit today'}
                </p>
              </div>
            </div>

            {/* Card 4: Cash Drawer */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-card hover:shadow-card-hover transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cash In Safe / Drawer</span>
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  ₹{fmtMoney(cashClosing)}
                </h3>
                <p className="text-[11px] font-semibold text-slate-400 mt-1">
                  Physical drawer reconciliation balance
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Group 1: Daily Cash Desk & Operations ── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-brand-600" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">
              1. Daily Cash Desk & Expense Operations
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {dailyModules.map((m) => {
              const Icon = m.icon;
              return (
                <div
                  key={m.id}
                  onClick={() => onNavigate(m.id)}
                  className={`group relative bg-white border rounded-3xl p-5 shadow-card hover:shadow-xl transition-all duration-200 cursor-pointer flex flex-col justify-between hover:-translate-y-0.5 ${
                    m.isPrimary
                      ? 'border-rose-200/90 ring-2 ring-rose-500/10'
                      : 'border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-md transition-transform group-hover:scale-105 ${m.iconColor}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      {m.badge && (
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold">
                          {m.badge}
                        </span>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                        {m.category}
                      </p>
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                        {m.title}
                      </h3>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1.5 line-clamp-2">
                        {m.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-400 group-hover:text-brand-600 transition-colors">
                    <span>Open Module</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Group 2: Receivables, Ledgers & Payroll ── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">
              2. Receivables, City Ledgers & Payroll
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {ledgerModules.map((m) => {
              const Icon = m.icon;
              return (
                <div
                  key={m.id}
                  onClick={() => onNavigate(m.id)}
                  className="group relative bg-white border border-slate-200/80 hover:border-slate-300 rounded-3xl p-5 shadow-card hover:shadow-xl transition-all duration-200 cursor-pointer flex flex-col justify-between hover:-translate-y-0.5"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-md transition-transform group-hover:scale-105 ${m.iconColor}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      {m.badge && (
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold">
                          {m.badge}
                        </span>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                        {m.category}
                      </p>
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
                        {m.title}
                      </h3>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1.5 line-clamp-2">
                        {m.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-400 group-hover:text-amber-600 transition-colors">
                    <span>Manage Ledgers</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Group 3: Statutory Compliance, P&L & Enterprise Accounting ── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">
              3. Statutory GST Returns, P&L Reports & Accounting
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {complianceModules.map((m) => {
              const Icon = m.icon;
              return (
                <div
                  key={m.id}
                  onClick={() => onNavigate(m.id)}
                  className="group relative bg-white border border-slate-200/80 hover:border-slate-300 rounded-3xl p-5 shadow-card hover:shadow-xl transition-all duration-200 cursor-pointer flex flex-col justify-between hover:-translate-y-0.5"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-md transition-transform group-hover:scale-105 ${m.iconColor}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      {m.badge && (
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold">
                          {m.badge}
                        </span>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                        {m.category}
                      </p>
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {m.title}
                      </h3>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1.5 line-clamp-2">
                        {m.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-400 group-hover:text-indigo-600 transition-colors">
                    <span>View Reports</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};
