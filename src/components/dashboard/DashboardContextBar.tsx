import { useState } from 'react';
import { CalendarDays, History, RefreshCw, Building2, Calendar, BarChart3, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { addDays, getTodayLocal } from '@/lib/calc';

export type RevenueDateFilter = 'today' | 'yesterday' | 'custom_date' | 'range' | 'mtd' | 'last_month';

interface DashboardContextBarProps {
  monthName: string;
  lastClosedDate: string | null;
  hotelName?: string | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
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
  hotelName,
  onRefresh,
  isRefreshing = false,
  activeFilter = 'today',
  onFilterChange,
  selectedDate = getTodayLocal(),
  rangeStart = getTodayLocal().slice(0, 7) + '-01',
  rangeEnd = getTodayLocal(),
  onOpenHistory,
  isOpenBusinessDate = true,
}: DashboardContextBarProps) => {
  const todayStr = getTodayLocal();
  const yesterdayStr = addDays(todayStr, -1);

  const [showCustomDate, setShowCustomDate] = useState(false);
  const [showRange, setShowRange] = useState(false);
  const [tempDate, setTempDate] = useState(selectedDate);
  const [tempStart, setTempStart] = useState(rangeStart);
  const [tempEnd, setTempEnd] = useState(rangeEnd);

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

  const handlePrevDay = () => {
    const prevDay = addDays(selectedDate, -1);
    setTempDate(prevDay);
    onFilterChange?.('custom_date', { date: prevDay });
  };

  const handleNextDay = () => {
    const nextDay = addDays(selectedDate, 1);
    setTempDate(nextDay);
    onFilterChange?.('custom_date', { date: nextDay });
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
              {activeFilter === 'today' && (
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${
                    isOpenBusinessDate
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}
                >
                  {isOpenBusinessDate ? 'Current / Open Business Date' : 'Closed Business Date'}
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-slate-500 mt-0.5 flex items-center gap-1.5 truncate">
              <span>Executive Performance Dashboard</span>
              <span className="text-slate-300">•</span>
              <span className="text-brand-700 font-semibold">{monthName}</span>
            </p>
          </div>
        </div>

        {/* Right: Closed Audit + Daily History + Refresh */}
        <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
          <div className="hidden sm:flex items-center gap-2 bg-slate-50/80 border border-slate-200/80 px-3 py-1.5 rounded-xl text-slate-700 text-xs font-medium shadow-xs">
            <History className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>
              Closed Audit: <strong className="font-bold text-slate-900">{lastClosedDate ?? 'No closed business date yet'}</strong>
            </span>
          </div>

          {onOpenHistory && (
            <button
              onClick={() => onOpenHistory(selectedDate)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-[0.98] cursor-pointer"
            >
              <BarChart3 className="w-3.5 h-3.5 text-brand-400" />
              <span>View Daily Revenue</span>
            </button>
          )}

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

      {/* ── Date Filter Strip: Interactive Stepper, Quick Presets & Range Filters ── */}
      <div className="pt-3 border-t border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        {/* Left: Filter Buttons & Stepper */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1">
            <CalendarDays className="w-3.5 h-3.5 text-brand-600" />
            <span>Revenue View:</span>
          </span>

          {/* Stepper Container for single date navigation */}
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
                  if (e.target.value) {
                    setTempDate(e.target.value);
                    onFilterChange?.('custom_date', { date: e.target.value });
                  }
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
          <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
            <button
              onClick={() => handleSelectFilter('today')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                activeFilter === 'today'
                  ? 'bg-brand-600 text-white border-brand-600 shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-transparent'
              }`}
            >
              Today
            </button>

            <button
              onClick={() => handleSelectFilter('yesterday')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                activeFilter === 'yesterday'
                  ? 'bg-brand-600 text-white border-brand-600 shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-transparent'
              }`}
            >
              Yesterday
            </button>

            <button
              onClick={() => handleSelectFilter('custom_date')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 border ${
                activeFilter === 'custom_date'
                  ? 'bg-brand-600 text-white border-brand-600 shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-transparent'
              }`}
            >
              <Calendar className="w-3 h-3" />
              <span>{activeFilter === 'custom_date' ? selectedDate : 'Custom Date'}</span>
            </button>

            <button
              onClick={() => handleSelectFilter('range')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                activeFilter === 'range'
                  ? 'bg-brand-600 text-white border-brand-600 shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-transparent'
              }`}
            >
              {activeFilter === 'range' ? `${rangeStart} → ${rangeEnd}` : 'Date Range'}
            </button>

            <button
              onClick={() => handleSelectFilter('mtd')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                activeFilter === 'mtd'
                  ? 'bg-brand-600 text-white border-brand-600 shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-transparent'
              }`}
            >
              This Month (MTD)
            </button>

            <button
              onClick={() => handleSelectFilter('last_month')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                activeFilter === 'last_month'
                  ? 'bg-brand-600 text-white border-brand-600 shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-transparent'
              }`}
            >
              Last Month
            </button>
          </div>
        </div>

        {/* Right: Active Mode Context Badge */}
        <div className="flex items-center gap-2 text-xs self-start xl:self-center">
          <span className="text-slate-400">Displaying:</span>
          {activeFilter === 'mtd' || activeFilter === 'last_month' ? (
            <span className="font-bold text-brand-700 bg-blue-50 border border-blue-200/70 px-2.5 py-0.5 rounded-md">
              MTD Cumulative ({monthName})
            </span>
          ) : activeFilter === 'range' ? (
            <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/70 px-2.5 py-0.5 rounded-md">
              Range: {rangeStart} to {rangeEnd}
            </span>
          ) : (
            <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2.5 py-0.5 rounded-md flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-600" />
              Daily Earned Revenue ({selectedDate})
            </span>
          )}
        </div>
      </div>

      {/* Inline custom date picker */}
      {showCustomDate && (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2 rounded-xl animate-fade-in flex-wrap">
          <span className="text-xs font-semibold text-slate-600">Select Date:</span>
          <input
            type="date"
            value={tempDate}
            onChange={(e) => setTempDate(e.target.value)}
            className="border border-slate-300 rounded px-2.5 py-1 text-xs bg-white text-slate-800"
          />
          <button
            onClick={applyCustomDate}
            className="px-3 py-1 bg-brand-600 text-white font-bold rounded-lg text-xs hover:bg-brand-700 cursor-pointer shadow-xs"
          >
            Apply
          </button>
        </div>
      )}

      {/* Inline range picker */}
      {showRange && (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2 rounded-xl animate-fade-in flex-wrap">
          <span className="text-xs font-semibold text-slate-600">From:</span>
          <input
            type="date"
            value={tempStart}
            onChange={(e) => setTempStart(e.target.value)}
            className="border border-slate-300 rounded px-2.5 py-1 text-xs bg-white text-slate-800"
          />
          <span className="text-xs font-semibold text-slate-600">To:</span>
          <input
            type="date"
            value={tempEnd}
            onChange={(e) => setTempEnd(e.target.value)}
            className="border border-slate-300 rounded px-2.5 py-1 text-xs bg-white text-slate-800"
          />
          <button
            onClick={applyRange}
            className="px-3 py-1 bg-brand-600 text-white font-bold rounded-lg text-xs hover:bg-brand-700 cursor-pointer shadow-xs"
          >
            Apply Range
          </button>
        </div>
      )}
    </div>
  );
};
