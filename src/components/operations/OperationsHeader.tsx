import React from 'react';
import {
  ChevronLeft, ChevronRight, Calendar, RefreshCw,
  LayoutGrid, CalendarDays, ArrowLeft, Sparkles, Activity,
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
  onDateSelect: (date: string) => void;
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
  onDateSelect,
  onGoToToday,
  onRefresh,
  onBack,
}) => {
  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-4 sm:px-6 py-3 sticky top-0 z-30 shadow-[0_1px_8px_rgba(0,0,0,0.03)] transition-all">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 max-w-[1920px] mx-auto">
        
        {/* ── Left: Property Branding & Operational Context ── */}
        <div className="flex items-center justify-between lg:justify-start gap-3">
          <div className="flex items-center gap-3">
            {/* Back to Dashboard Button */}
            <button
              onClick={onBack}
              className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-900 transition-all active:scale-95 cursor-pointer border border-transparent hover:border-slate-200/80"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            {/* Brand Logo Icon */}
            <BrandIcon size={38} className="shrink-0 shadow-xs" />

            {/* Title & Live Status */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-tight truncate max-w-[160px] sm:max-w-[260px] md:max-w-xs xl:max-w-md" title={hotelName}>
                  {hotelName}
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs shrink-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Live Operations</span>
                </span>
              </div>
              <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mt-0.5">
                <span className="text-indigo-600 font-bold flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  Command Center
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-600 font-medium">Room & Stay Matrix</span>
              </div>
            </div>
          </div>

          {/* Refresh button (Mobile) */}
          <div className="flex items-center gap-1.5 lg:hidden">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition active:rotate-180 duration-300 disabled:opacity-50 border border-slate-200/80"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── Right: View Modes & Timeline Navigator ── */}
        <div className="flex items-center flex-wrap sm:flex-nowrap gap-2 sm:gap-3">
          
          {/* Segmented Day / Week View Switcher */}
          <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 shadow-2xs">
            <button
              type="button"
              onClick={() => onViewModeChange('day')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-bold transition-all cursor-pointer ${
                viewMode === 'day'
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
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
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Week</span>
            </button>
          </div>

          {/* Timeline Date Range Picker Bar with Interactive Calendar Selection */}
          <div className="flex items-center bg-white border border-slate-200/90 rounded-xl p-1 shadow-2xs hover:border-slate-300 transition">
            <button
              type="button"
              onClick={() => onShiftTimeline(viewMode === 'day' ? -1 : -7)}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition active:scale-95 cursor-pointer"
              title="Previous Period"
            >
              <ChevronLeft className="w-4 h-4 stroke-[2.2]" />
            </button>
            
            <div className="relative flex items-center">
              <input
                type="date"
                id="ops-timeline-date-picker"
                value={timelineDates[0] || businessDate}
                onChange={(e) => {
                  if (e.target.value) {
                    onDateSelect(e.target.value);
                  }
                }}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                title="Click to choose any past, present, or future date"
              />
              <div className="flex items-center gap-1.5 px-3 py-0.5 text-center min-w-[140px] sm:min-w-[190px] rounded-lg group hover:bg-slate-50 transition cursor-pointer">
                <Calendar className="w-3.5 h-3.5 text-indigo-600 group-hover:scale-110 transition-transform shrink-0" />
                <span className="text-xs sm:text-sm font-black text-slate-800 tracking-tight group-hover:text-indigo-600 transition-colors block">
                  {fmtDateFull(timelineDates[0])}
                  {viewMode === 'week' && timelineDates.length > 1 && (
                    <>
                      <span className="text-slate-400 font-normal mx-1">–</span>
                      {fmtDateFull(timelineDates[timelineDates.length - 1])}
                    </>
                  )}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onShiftTimeline(viewMode === 'day' ? 1 : 7)}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition active:scale-95 cursor-pointer"
              title="Next Period"
            >
              <ChevronRight className="w-4 h-4 stroke-[2.2]" />
            </button>
          </div>

          {/* Jump to Today Button */}
          <button
            type="button"
            onClick={onGoToToday}
            className="px-3.5 py-2 text-xs font-bold text-indigo-700 bg-indigo-50/90 hover:bg-indigo-100 border border-indigo-200/90 rounded-xl transition-all active:scale-95 shadow-2xs cursor-pointer flex items-center gap-1.5 hover:shadow-sm"
            title="Jump to Today's Date"
          >
            <Calendar className="w-3.5 h-3.5 text-indigo-600 stroke-[2.2]" />
            <span>Today</span>
          </button>

          {/* Refresh Desktop Button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="hidden lg:flex p-2 hover:bg-slate-100 rounded-xl text-slate-600 hover:text-slate-900 border border-slate-200/80 transition-all active:rotate-180 duration-300 disabled:opacity-50 cursor-pointer shadow-2xs hover:border-slate-300"
            title="Refresh Operations Board"
          >
            <RefreshCw className={`w-4 h-4 stroke-[2.2] ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

        </div>
      </div>
    </header>
  );
};
