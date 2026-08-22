import React from 'react';
import { ArrowRight, Wallet, BookOpen, Lock, BookMarked, FileText, TrendingUp, ShieldCheck, DollarSign } from 'lucide-react';
import { ScreenHeader } from '@/components/finance-ui';

interface FinanceHubProps {
  onBack: () => void;
  onNavigate: (screen: string) => void;
}

interface NavItem {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  badge?: string;
  isPrimary?: boolean;
}

const items: NavItem[] = [
  {
    id: 'expense-entry',
    label: 'Add Expense',
    desc: 'Record an expense',
    icon: <Wallet className="w-5 h-5" />,
    color: 'text-rose-600 bg-rose-50 border border-rose-100',
    isPrimary: true,
  },
  {
    id: 'expense-ledger',
    label: 'Expense Ledger',
    desc: 'View & filter expenses',
    icon: <BookOpen className="w-5 h-5" />,
    color: 'text-brand-600 bg-brand-50 border border-brand-100',
  },
  {
    id: 'close-day',
    label: 'Cash Closing',
    desc: 'Day close · Cash summary',
    icon: <Lock className="w-5 h-5" />,
    color: 'text-sky-600 bg-sky-50 border border-sky-100',
  },
  {
    id: 'ledgers',
    label: 'Outstanding',
    desc: 'Guest · OTA · Agent · Corporate',
    icon: <BookMarked className="w-5 h-5" />,
    color: 'text-amber-600 bg-amber-50 border border-amber-100',
  },
  {
    id: 'gst-report',
    label: 'GST Report',
    desc: 'Monthly GST with CGST/SGST/IGST',
    icon: <FileText className="w-5 h-5" />,
    color: 'text-indigo-600 bg-indigo-50 border border-indigo-100',
  },
  {
    id: 'profitability',
    label: 'Finance Reports',
    desc: 'Monthly profitability & P&L',
    icon: <TrendingUp className="w-5 h-5" />,
    color: 'text-emerald-600 bg-emerald-50 border border-emerald-100',
  },
];

export const FinanceHub = ({ onBack, onNavigate }: FinanceHubProps) => {
  return (
    <div className="min-h-screen bg-slate-50 space-y-6 pb-12">
      <ScreenHeader
        title="Finance Management"
        subtitle="Expenses · Salary · Bills · Profitability"
        onBack={onBack}
        icon={<Wallet className="w-5 h-5 text-brand-600" />}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
        {/* Section Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Financial Modules</h2>
            <p className="text-xs font-medium text-slate-400">Select a module to manage hotel accounting, ledgers, compliance, and P&L reports</p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-3 py-1.5 rounded-xl">
            <ShieldCheck className="w-4 h-4 text-emerald-600" /> Audit Ready
          </div>
        </div>

        {/* 6 Finance Module Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 sm:gap-5">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`group relative w-full text-left bg-white border rounded-2xl p-5 sm:p-6 shadow-card hover:shadow-card-hover transition-all duration-200 active:scale-[0.99] flex flex-col justify-between min-h-[125px] ${
                item.isPrimary
                  ? 'border-brand-200 hover:border-brand-500 ring-1 ring-brand-500/10'
                  : 'border-slate-200/80 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${item.color}`}>
                  {item.icon}
                </div>
                <div className="p-2 rounded-xl bg-slate-50 group-hover:bg-brand-50 group-hover:text-brand-600 text-slate-400 transition-colors shrink-0">
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </div>
              </div>

              <div className="mt-4 space-y-1">
                <h3 className="text-base font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                  {item.label}
                </h3>
                <p className="text-xs font-medium text-slate-400 line-clamp-2">
                  {item.desc}
                </p>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
};
