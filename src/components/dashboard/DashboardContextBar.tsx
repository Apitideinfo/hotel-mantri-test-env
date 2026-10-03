import { CalendarDays, History, RefreshCw, Building2, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { addDays, getTodayLocal } from '@/lib/calc';

interface DashboardContextBarProps {
  monthName: string;
  selectedDate: string;
  onDateChange: (date: string) => void;
  viewScope: 'daily' | 'mtd';
  onToggleScope: (scope: 'daily' | 'mtd') => void;
  lastClosedDate: string | null;
  hotelName?: string | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const DashboardContextBar = ({
  monthName,
  selectedDate,
  onDateChange,
  viewScope,
  onToggleScope,
  lastClosedDate,
  hotelName,
  onRefresh,
  isRefreshing = false,
}: DashboardContextBarProps) => {
  const todayStr = getTodayLocal();
  const yesterdayStr = addDays(todayStr, -1);

  // Format friendly readable date string
  const formatFriendlyDate = (dStr: string) => {
    try {
      const [y, m, d] = dStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      return dateObj.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dStr;
    }
  };

  const isToday = selectedDate === todayStr;
  const isYesterday = selectedDate === yesterdayStr;

  const handlePrevDay = () => {
    onDateChange(addDays(selectedDate, -1));
  };

  const handleNextDay = () => {
    onDateChange(addDays(selectedDate, 1));
  };

  return (
    <div className="bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-card space-y-4 transition-all">
      {/* Top Row: Property & Welcome context + Action Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Property context */}
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-brand-600 to-sky-500 text-white flex items-center justify-center shrink-0 shadow-soft-blue">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight truncate">
                {hotelName ?? 'Hotel Property'}
              </h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-[11px] font-bold text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Operations
              </span>
            </div>
            <p className="text-xs font-medium text-slate-500 mt-0.5 flex items-center gap-1.5 truncate">
              <span>Executive Performance Dashboard</span>
              <span className="text-slate-300">•</span>
              <span className="text-brand-700 font-semibold">{monthName}</span>
            </p>
          </div>
        </div>

        {/* Right: View Scope Switcher + Closed Audit + Refresh */}
        <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
          {/* Scope Segmented Pill (Daily Earned vs MTD Month) */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200/80 shadow-2xs">
            <button
              onClick={() => onToggleScope('daily')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewScope === 'daily'
                  ? 'bg-white text-brand-700 shadow-xs ring-1 ring-black/5'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daily View
            </button>
            <button
              onClick={() => onToggleScope('mtd')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewScope === 'mtd'
                  ? 'bg-white text-brand-700 shadow-xs ring-1 ring-black/5'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              MTD Month View
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 bg-slate-50/80 border border-slate-200/80 px-3 py-1.5 rounded-xl text-slate-700 text-xs font-medium shadow-xs">
            <History className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>
              Closed Audit: <strong className="font-bold text-slate-900">{lastClosedDate ?? 'Pending Close'}</strong>
            </span>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh dashboard data"
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-xs hover:border-slate-300 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-brand-600 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Date Filter Strip: Interactive Calendar, Stepper & Quick Presets ── */}
      <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left: Interactive Date Stepper & Picker */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1">
            <CalendarDays className="w-3.5 h-3.5 text-brand-600" />
            <span>Date Filter:</span>
          </span>

          {/* Stepper Container */}
          <div className="flex items-center bg-slate-50 border border-slate-200/90 rounded-xl overflow-hidden shadow-2xs">
            <button
              onClick={handlePrevDay}
              title="Previous Day"
              className="px-2 py-1.5 hover:bg-slate-200 text-slate-600 transition-colors border-r border-slate-200 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Native Date Input with formatted text overlay */}
            <div className="relative px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-white transition-colors">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) onDateChange(e.target.value);
                }}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
              />
              <span className="text-xs font-extrabold text-slate-900 tracking-tight select-none">
                {formatFriendlyDate(selectedDate)}
              </span>
            </div>

            <button
              onClick={handleNextDay}
              title="Next Day"
              className="px-2 py-1.5 hover:bg-slate-200 text-slate-600 transition-colors border-l border-slate-200 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onDateChange(todayStr)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                isToday
                  ? 'bg-brand-600 text-white border-brand-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              Today
            </button>

            <button
              onClick={() => onDateChange(yesterdayStr)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                isYesterday
                  ? 'bg-brand-600 text-white border-brand-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              Yesterday
            </button>
          </div>
        </div>

        {/* Right: Active Mode Context Badge */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Displaying:</span>
          {viewScope === 'daily' ? (
            <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2.5 py-0.5 rounded-md flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-600" />
              Daily Earned Revenue ({selectedDate})
            </span>
          ) : (
            <span className="font-bold text-brand-700 bg-blue-50 border border-blue-200/70 px-2.5 py-0.5 rounded-md">
              MTD Cumulative Month ({monthName})
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
