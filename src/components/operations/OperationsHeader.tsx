import React from 'react';
import {
  ChevronLeft, ChevronRight, Calendar, RefreshCw, Radio,
  LayoutGrid, CalendarDays, ArrowLeft,
} from 'lucide-react';
import { BrandIcon } from '@/components/BrandLogo';
import type { ViewMode } from './types';

interface OperationsHeaderProps {
  hotelName: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  timelineDates: string[];
  businessDate: string;
  loading: boolean;
  onShiftTimeline: (delta: number) => void;
  onGoToToday: () => void;
  onRefresh: () => void;
  onBack: () => void;
}

const fmtDateFull = (d: string): string => {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  return dt.toLocaleDateString('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
};

export const OperationsHeader: React.FC<OperationsHeaderProps> = ({
  hotelName,
  viewMode,
  onViewModeChange,
  timelineDates,
  businessDate,
  loading,
  onShiftTimeline,
  onGoToToday,
  onRefresh,
  onBack,
}) => {
  return (
    <header className="bg-white border-b border-slate-200/90 px-4 sm:px-6 py-3 sticky top-0 z-30 shadow-xs">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
        {/* Left: Property branding & Context */}
        <div className="flex items-center justify-between lg:justify-start gap-3">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onBack}
              className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-800 transition active:scale-95 cursor-pointer"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center p-1 shadow-sm shrink-0">
              <BrandIcon size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight leading-tight">
                  {hotelName}
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                <span>Operations Board</span>
                <span className="text-slate-300">•</span>
                <span className="text-brand-600 font-semibold">Weekly Room Chart</span>
              </p>
            </div>
          </div>

          {/* Refresh button (Mobile) */}
          <div className="flex items-center gap-1.5 lg:hidden">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition active:rotate-180 duration-300 disabled:opacity-50"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-brand-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Center / Right: Navigation controls */}
        <div className="flex items-center flex-wrap sm:flex-nowrap gap-2 sm:gap-3">
          {/* Segmented Day / Week switcher */}
          <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 shadow-2xs">
            <button
              type="button"
              onClick={() => onViewModeChange('day')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-bold transition-all cursor-pointer ${
                viewMode === 'day'
                  ? 'bg-white text-brand-700 shadow-sm border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Day</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('week')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-bold transition-all cursor-pointer ${
                viewMode === 'week'
                  ? 'bg-white text-brand-700 shadow-sm border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Week</span>
            </button>
          </div>

          {/* Date Navigator Strip */}
          <div className="flex items-center bg-white border border-slate-200/90 rounded-xl p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => onShiftTimeline(viewMode === 'day' ? -1 : -7)}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition active:scale-95 cursor-pointer"
              title="Previous Period"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-2.5 py-0.5 text-center min-w-[140px] sm:min-w-[170px]">
              <span className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight block">
                {fmtDateFull(timelineDates[0])}
                {viewMode === 'week' && timelineDates.length > 1 && (
                  <>
                    <span className="text-slate-400 font-normal mx-1">–</span>
                    {fmtDateFull(timelineDates[timelineDates.length - 1])}
                  </>
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onShiftTimeline(viewMode === 'day' ? 1 : 7)}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition active:scale-95 cursor-pointer"
              title="Next Period"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Today Button */}
          <button
            type="button"
            onClick={onGoToToday}
            className="px-3 py-1.5 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200/80 rounded-xl transition active:scale-95 shadow-2xs cursor-pointer flex items-center gap-1.5"
            title="Jump to Today's Business Date"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Today</span>
          </button>

          {/* Refresh Desktop */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="hidden lg:flex p-2 hover:bg-slate-100 rounded-xl text-slate-600 hover:text-slate-900 border border-slate-200/80 transition active:rotate-180 duration-300 disabled:opacity-50 cursor-pointer shadow-2xs"
            title="Refresh Operations Board"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-brand-600' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
};
