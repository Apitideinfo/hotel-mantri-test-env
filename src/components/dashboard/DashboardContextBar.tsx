import { useState } from 'react';
import { CalendarDays, History, Info, Calendar, BarChart3, ChevronDown, Check } from 'lucide-react';

export type RevenueDateFilter = 'today' | 'yesterday' | 'custom_date' | 'range' | 'mtd' | 'last_month';

interface DashboardContextBarProps {
  monthName: string;
  lastClosedDate: string | null;
  activeFilter?: RevenueDateFilter;
  onFilterChange?: (filter: RevenueDateFilter, custom?: { date?: string; start?: string; end?: string }) => void;
  selectedDate?: string;
  rangeStart?: string;
  rangeEnd?: string;
  onOpenHistory?: (date?: string) => void;
  isOpenBusinessDate?: boolean;
}

export const DashboardContextBar = ({
  monthName,
  lastClosedDate,
  activeFilter = 'today',
  onFilterChange,
  selectedDate = new Date().toISOString().slice(0, 10),
  rangeStart = new Date().toISOString().slice(0, 7) + '-01',
  rangeEnd = new Date().toISOString().slice(0, 10),
  onOpenHistory,
  isOpenBusinessDate = true,
}: DashboardContextBarProps) => {
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [showRange, setShowRange] = useState(false);
  const [tempDate, setTempDate] = useState(selectedDate);
  const [tempStart, setTempStart] = useState(rangeStart);
  const [tempEnd, setTempEnd] = useState(rangeEnd);

  const handleSelectFilter = (filter: RevenueDateFilter) => {
    if (filter === 'custom_date') {
      setShowCustomDate(true);
      setShowRange(false);
      return;
    }
    if (filter === 'range') {
      setShowRange(true);
      setShowCustomDate(false);
      return;
    }
    setShowCustomDate(false);
    setShowRange(false);
    onFilterChange?.(filter);
  };

  const applyCustomDate = () => {
    setShowCustomDate(false);
    onFilterChange?.('custom_date', { date: tempDate });
  };

  const applyRange = () => {
    setShowRange(false);
    onFilterChange?.('range', { start: tempStart, end: tempEnd });
  };

  return (
    <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl px-4 sm:px-5 py-3 shadow-card flex flex-col gap-3 transition-all">
      {/* Top Row: Context & Actions */}
      <div className="flex items-center justify-between flex-wrap gap-2.5">
        {/* Left: Month + Status */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          <div className="flex items-center gap-2 bg-brand-50 border border-brand-100/80 px-3 py-1.5 rounded-xl text-brand-700 text-xs font-semibold">
            <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-600 shrink-0" />
            <span>{monthName}</span>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 px-3 py-1.5 rounded-xl text-slate-700 text-xs font-medium">
            <History className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>
              Data as of: <strong className="font-semibold text-slate-900">{lastClosedDate ?? 'No closed business date yet'}</strong>
            </span>
          </div>

          {activeFilter === 'today' && (
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${
              isOpenBusinessDate
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}>
              {isOpenBusinessDate ? 'Current / Open Business Date' : 'Closed Business Date'}
            </span>
          )}
        </div>

        {/* Right: History View Action & Accounting Note */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onOpenHistory?.(selectedDate)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-[0.98] cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>View Daily Revenue</span>
          </button>

          <div className="hidden xl:flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>MTD includes closed dates</span>
          </div>
        </div>
      </div>

      {/* Bottom Row: Date Selector Tabs */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
            Revenue View:
          </span>

          <button
            onClick={() => handleSelectFilter('today')}
            className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
              activeFilter === 'today'
                ? 'bg-brand-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Today
          </button>

          <button
            onClick={() => handleSelectFilter('yesterday')}
            className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
              activeFilter === 'yesterday'
                ? 'bg-brand-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Yesterday
          </button>

          <button
            onClick={() => handleSelectFilter('custom_date')}
            className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1 ${
              activeFilter === 'custom_date'
                ? 'bg-brand-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Calendar className="w-3 h-3" />
            <span>{activeFilter === 'custom_date' ? selectedDate : 'Custom Date'}</span>
          </button>

          <button
            onClick={() => handleSelectFilter('range')}
            className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
              activeFilter === 'range'
                ? 'bg-brand-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            {activeFilter === 'range' ? `${rangeStart} → ${rangeEnd}` : 'Date Range'}
          </button>

          <button
            onClick={() => handleSelectFilter('mtd')}
            className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
              activeFilter === 'mtd'
                ? 'bg-brand-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            This Month (MTD)
          </button>

          <button
            onClick={() => handleSelectFilter('last_month')}
            className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
              activeFilter === 'last_month'
                ? 'bg-brand-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Last Month
          </button>
        </div>

        {/* Custom date inline picker if open */}
        {showCustomDate && (
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-1.5 rounded-xl animate-fade-in">
            <span className="text-[11px] font-semibold text-slate-600">Date:</span>
            <input
              type="date"
              value={tempDate}
              onChange={(e) => setTempDate(e.target.value)}
              className="border border-slate-300 rounded px-2 py-0.5 text-xs bg-white text-slate-800"
            />
            <button
              onClick={applyCustomDate}
              className="px-2 py-0.5 bg-brand-600 text-white font-bold rounded text-xs hover:bg-brand-700 cursor-pointer"
            >
              Apply
            </button>
          </div>
        )}

        {/* Range inline picker if open */}
        {showRange && (
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-1.5 rounded-xl animate-fade-in">
            <span className="text-[11px] font-semibold text-slate-600">From:</span>
            <input
              type="date"
              value={tempStart}
              onChange={(e) => setTempStart(e.target.value)}
              className="border border-slate-300 rounded px-2 py-0.5 text-xs bg-white text-slate-800"
            />
            <span className="text-[11px] font-semibold text-slate-600">To:</span>
            <input
              type="date"
              value={tempEnd}
              onChange={(e) => setTempEnd(e.target.value)}
              className="border border-slate-300 rounded px-2 py-0.5 text-xs bg-white text-slate-800"
            />
            <button
              onClick={applyRange}
              className="px-2 py-0.5 bg-brand-600 text-white font-bold rounded text-xs hover:bg-brand-700 cursor-pointer"
            >
              Apply
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
