import { ReactNode } from 'react';
import { CalendarRange, UserPlus, LogIn, LogOut, Wallet, Receipt, ClipboardList, FileText, Zap } from 'lucide-react';

interface QuickActionsToolbarProps {
  onNavigate: (screen: string, payload?: unknown) => void;
  todayStr: string;
}

interface ActionBtnProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}

const ActionBtn = ({ icon, label, onClick, primary }: ActionBtnProps) => (
  <button
    onClick={onClick}
    className={`h-[52px] flex items-center justify-center gap-2.5 text-xs sm:text-sm font-semibold px-4 sm:px-5 rounded-xl transition-all duration-200 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-500/50 ${
      primary
        ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-soft-blue hover:shadow-md'
        : 'bg-white hover:bg-slate-50/80 text-slate-800 border border-slate-200/80 hover:border-slate-300 shadow-card hover:shadow-card-hover'
    }`}
  >
    <span className="shrink-0 transition-transform group-hover:scale-110">{icon}</span>
    <span className="whitespace-nowrap select-none">{label}</span>
  </button>
);

export const QuickActionsToolbar = ({ onNavigate, todayStr }: QuickActionsToolbarProps) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Quick Actions</h3>
            <p className="text-xs font-medium text-slate-400">Common Front Office Tasks</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 sm:gap-4">
        <ActionBtn
          icon={<CalendarRange className="w-4 h-4 sm:w-5 sm:h-5 text-white" />}
          label="Make Reservation"
          onClick={() => onNavigate('reservations')}
          primary
        />
        <ActionBtn
          icon={<UserPlus className="w-4 h-4 sm:w-5 sm:h-5 text-brand-600" />}
          label="Walk-in"
          onClick={() => onNavigate('operations', { date: todayStr })}
        />
        <ActionBtn
          icon={<LogIn className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />}
          label="Check-in"
          onClick={() => onNavigate('arrivals')}
        />
        <ActionBtn
          icon={<LogOut className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />}
          label="Check-out"
          onClick={() => onNavigate('departures')}
        />
        <ActionBtn
          icon={<Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />}
          label="Add Payment"
          onClick={() => onNavigate('finance')}
        />
        <ActionBtn
          icon={<Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-rose-600" />}
          label="Add Expense"
          onClick={() => onNavigate('expense-entry')}
        />
        <ActionBtn
          icon={<ClipboardList className="w-4 h-4 sm:w-5 sm:h-5 text-brand-600" />}
          label="Operations Board"
          onClick={() => onNavigate('operations', { date: todayStr })}
        />
        <ActionBtn
          icon={<FileText className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" />}
          label="Reports"
          onClick={() => onNavigate('report', { date: todayStr })}
        />
      </div>

    </div>
  );
};
