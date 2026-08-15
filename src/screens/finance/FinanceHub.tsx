import { ArrowLeft, Wallet, Users, HandCoins, CalendarCheck, BookOpen, Zap, Droplets, Shirt, Receipt, TrendingUp, FileText, Lock, BookMarked, PieChart } from 'lucide-react';
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
}

const items: NavItem[] = [
  { id: 'expense-entry', label: 'Add Expense', desc: 'Record an expense', icon: <Wallet className="w-5 h-5" />, color: 'text-red-600 bg-red-50' },
  { id: 'expense-ledger', label: 'Expense Ledger', desc: 'View & filter expenses', icon: <BookOpen className="w-5 h-5" />, color: 'text-sky-600 bg-sky-50' },
  { id: 'close-day', label: 'Cash Closing', desc: 'Day close · Cash summary', icon: <Lock className="w-5 h-5" />, color: 'text-sky-700 bg-sky-100' },
  { id: 'ledgers', label: 'Outstanding', desc: 'Guest · OTA · Agent · Corporate', icon: <BookMarked className="w-5 h-5" />, color: 'text-amber-700 bg-amber-100' },
  { id: 'gst-report', label: 'GST Report', desc: 'Monthly GST with CGST/SGST/IGST', icon: <FileText className="w-5 h-5" />, color: 'text-indigo-600 bg-indigo-50' },
  { id: 'profitability', label: 'Finance Reports', desc: 'Monthly profitability & P&L', icon: <TrendingUp className="w-5 h-5" />, color: 'text-teal-600 bg-teal-50' },
];

export const FinanceHub = ({ onBack, onNavigate }: FinanceHubProps) => {
  return (
    <div className="min-h-screen bg-slate-50">
      <ScreenHeader title="Finance Management" subtitle="Expenses · Salary · Bills · Profitability" onBack={onBack}
        icon={<Wallet className="w-5 h-5 text-sky-300" />} />
      <main className="px-4 py-4 gap-2.5 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => (
          <button key={item.id} onClick={() => onNavigate(item.id)}
            className="w-full flex items-center gap-3 bg-white hover:bg-slate-50 active:scale-[0.99] border border-slate-200 rounded-xl p-3.5 shadow-sm transition text-left">
            <span className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.color}`}>
              {item.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">{item.label}</p>
              <p className="text-xs text-slate-400">{item.desc}</p>
            </div>
            <ArrowLeft className="w-4 h-4 text-slate-300 rotate-180" />
          </button>
        ))}
      </main>
    </div>
  );
};
