import { CalendarDays, History, Info } from 'lucide-react';

interface DashboardContextBarProps {
  monthName: string;
  lastClosedDate: string | null;
}

export const DashboardContextBar = ({ monthName, lastClosedDate }: DashboardContextBarProps) => {
  return (
    <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl px-4 sm:px-5 py-3 shadow-card flex items-center justify-between flex-wrap gap-3.5 transition-all">
      {/* Left cluster */}
      <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-brand-50 border border-brand-100/80 px-3 py-1.5 rounded-xl text-brand-700 text-xs font-semibold">
          <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-600 shrink-0" />
          <span>{monthName}</span>
        </div>

        <div className="h-4 w-px bg-slate-200 hidden sm:block" />

        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 px-3 py-1.5 rounded-xl text-slate-700 text-xs font-medium">
          <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 shrink-0" />
          <span>
            Data as of: <strong className="font-semibold text-slate-900">{lastClosedDate ?? 'No closed business date yet'}</strong>
          </span>
        </div>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>MTD totals include only closed business dates</span>
      </div>
    </div>
  );
};
