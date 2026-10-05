import React from 'react';
import {
  ChevronLeft, ChevronRight, Calendar, RefreshCw,
  LayoutGrid, CalendarDays, ArrowLeft, Sparkles, Activity,
  Plus, LogIn, LogOut, Sliders, FileText, Wallet,
  ArrowRightLeft, CalendarPlus, X, User, Search, RotateCcw,
  SlidersHorizontal, CheckCircle2, MoreVertical,
} from 'lucide-react';
import { BrandIcon } from '@/components/BrandLogo';
import type { RoomCategory } from '@/lib/types';
import { SOURCE_CATEGORIES } from '@/lib/types';
import type { BoardBooking, ViewMode } from './types';
import { fmtMoney, fmtInt, toNum } from '@/lib/calc';

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

  // Actions
  selectedBooking: BoardBooking | null;
  onClearSelection: () => void;
  onNewReservation: () => void;
  onWalkIn: () => void;
  onAdjustAvailability: () => void;
  onDailyEntry: () => void;
  onCheckIn: (booking: BoardBooking) => void;
  onCheckOut: (booking: BoardBooking) => void;
  onCollectPayment: (booking: BoardBooking) => void;
  onRoomShift: (booking: BoardBooking) => void;
  onExtendStay: (booking: BoardBooking) => void;
  onViewDetails: (booking: BoardBooking) => void;

  // Filters
  search: string;
  onSearchChange: (val: string) => void;
  categories: RoomCategory[];
  filterCategory: string;
  onCategoryChange: (val: string) => void;
  floors: string[];
  filterFloor: string;
  onFloorChange: (val: string) => void;
  filterSource: string;
  onSourceChange: (val: string) => void;
  filterStatus: string;
  onStatusChange: (val: string) => void;
  filterPayment: string;
  onPaymentChange: (val: string) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  totalFilteredCount: number;
  totalBookingsCount: number;
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

  selectedBooking,
  onClearSelection,
  onNewReservation,
  onWalkIn,
  onAdjustAvailability,
  onDailyEntry,
  onCheckIn,
  onCheckOut,
  onCollectPayment,
  onRoomShift,
  onExtendStay,
  onViewDetails,

  search,
  onSearchChange,
  categories,
  filterCategory,
  onCategoryChange,
  floors,
  filterFloor,
  onFloorChange,
  filterSource,
  onSourceChange,
  filterStatus,
  onStatusChange,
  filterPayment,
  onPaymentChange,
  onClearFilters,
  hasActiveFilters,
  totalFilteredCount,
  totalBookingsCount,
}) => {
  const total = selectedBooking ? selectedBooking.rate * selectedBooking.nights : 0;
  const advance = selectedBooking && selectedBooking.type === 'reservation'
    ? toNum((selectedBooking.raw as any).advance_paid)
    : 0;
  const balance = Math.max(0, total - advance);

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/90 sticky top-0 z-30 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-2.5 space-y-2.5">
        
        {/* ── TIER 1: Unified Navigation & Primary Actions ── */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          
          {/* Left: Back Arrow + Property Identity */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onBack}
              className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-900 transition-all active:scale-95 cursor-pointer border border-transparent hover:border-slate-200"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <BrandIcon size={36} className="shrink-0 shadow-2xs" />

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-tight truncate max-w-[180px] sm:max-w-xs" title={hotelName}>
                  {hotelName}
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
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

          {/* Center: View Switcher & Timeline Date Navigator */}
          <div className="flex items-center flex-wrap sm:flex-nowrap gap-2 sm:gap-2.5 self-start xl:self-center">
            {/* Day / Week Switcher */}
            <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 shadow-2xs">
              <button
                type="button"
                onClick={() => onViewModeChange('day')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-bold transition-all cursor-pointer ${
                  viewMode === 'day'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80'
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
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>Week</span>
              </button>
            </div>

            {/* Timeline Date Picker Bar */}
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
                  title="Click to choose date"
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
              className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50/90 hover:bg-indigo-100 border border-indigo-200/90 rounded-xl transition-all active:scale-95 shadow-2xs cursor-pointer flex items-center gap-1.5"
              title="Jump to Today's Date"
            >
              <Calendar className="w-3.5 h-3.5 text-indigo-600 stroke-[2.2]" />
              <span>Today</span>
            </button>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-600 hover:text-slate-900 border border-slate-200/80 transition-all active:rotate-180 duration-300 disabled:opacity-50 cursor-pointer shadow-2xs"
              title="Refresh Matrix"
            >
              <RefreshCw className={`w-4 h-4 stroke-[2.2] ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>

          {/* Right: Primary Action Buttons Strip */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* New Reservation CTA */}
            <button
              type="button"
              onClick={onNewReservation}
              className="flex items-center gap-1.5 h-9 px-3.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-black rounded-xl shadow-xs shadow-indigo-200 transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>New Reservation</span>
            </button>

            {/* Walk-In CTA */}
            <button
              type="button"
              onClick={onWalkIn}
              className="flex items-center gap-1.5 h-9 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-2xs transition active:scale-95 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 stroke-[2.2]" />
              <span>Walk-In</span>
            </button>

            {/* Adjust Availability */}
            <button
              type="button"
              onClick={onAdjustAvailability}
              className="flex items-center gap-1.5 h-9 px-3 bg-indigo-50/90 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl shadow-2xs transition active:scale-95 cursor-pointer"
              title="Adjust sellable inventory & channel restrictions"
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-600 stroke-[2.2]" />
              <span className="hidden sm:inline">Adjust Availability</span>
              <span className="sm:hidden">Adjust</span>
            </button>

            {/* Daily Entry */}
            <button
              type="button"
              onClick={onDailyEntry}
              className="flex items-center gap-1.5 h-9 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200/80 shadow-2xs transition active:scale-95 cursor-pointer"
              title="Open Daily Room Chart Entry"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500 stroke-[2.2]" />
              <span className="hidden md:inline">Daily Entry</span>
            </button>
          </div>

        </div>

        {/* ── TIER 2: Contextual Selection Dock OR Integrated Filter Toolbar ── */}
        {selectedBooking ? (
          /* Contextual Selected Booking Action Dock */
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 text-white p-3 sm:px-4 sm:py-2.5 rounded-2xl shadow-xl border border-slate-800 animate-slide-up">
            
            {/* Selected Booking Summary */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0 shadow-sm">
                <User className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-black text-white tracking-tight truncate max-w-[180px] sm:max-w-xs">
                    {selectedBooking.guestName || 'Guest'}
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 uppercase tracking-wider">
                    Room {selectedBooking.roomNo}
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                    {selectedBooking.sourceName || selectedBooking.sourceCategory}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-300 mt-0.5">
                  <span>{selectedBooking.checkIn} → {selectedBooking.checkOut}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-300 font-bold">{selectedBooking.nights} Night{selectedBooking.nights > 1 ? 's' : ''}</span>
                  {balance >= 1.0 && !selectedBooking.isComplimentary && (
                    <>
                      <span className="text-slate-600">•</span>
                      <span className="text-amber-400 font-extrabold bg-amber-950/80 px-1.5 py-0.2 rounded border border-amber-800/80">
                        Due ₹{fmtInt(balance)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
              {selectedBooking.status === 'confirmed' && (
                <button
                  type="button"
                  onClick={() => onCheckIn(selectedBooking)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Check-In</span>
                </button>
              )}

              {(selectedBooking.status === 'checked_in' || selectedBooking.status === 'occupied') && (
                <button
                  type="button"
                  onClick={() => onCheckOut(selectedBooking)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Check-Out</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onCollectPayment(selectedBooking)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>Folio & Pay</span>
              </button>

              {(selectedBooking.status === 'checked_in' || selectedBooking.status === 'occupied') && (
                <>
                  <button
                    type="button"
                    onClick={() => onRoomShift(selectedBooking)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition active:scale-95 cursor-pointer"
                    title="Shift to Another Room"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Shift</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onExtendStay(selectedBooking)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition active:scale-95 cursor-pointer"
                    title="Extend Stay Dates"
                  >
                    <CalendarPlus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Extend</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => onViewDetails(selectedBooking)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition active:scale-95 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Details</span>
              </button>

              <button
                type="button"
                onClick={onClearSelection}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer ml-1"
                title="Deselect Booking"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          /* Integrated Filter & Search Toolbar */
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-1 border-t border-slate-100">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search guest, room #, phone, OTA source…"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200/90 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-2xs"
              />
              {search && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200/70 transition cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Filter Dropdowns Strip */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0 flex-wrap sm:flex-nowrap">
              {/* Room Category */}
              <div className="relative shrink-0">
                <select
                  value={filterCategory}
                  onChange={(e) => onCategoryChange(e.target.value)}
                  className={`text-xs font-bold border rounded-xl px-2.5 py-1.5 bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:border-indigo-500 transition-all cursor-pointer shadow-2xs appearance-none pr-6 ${
                    filterCategory
                      ? 'border-indigo-500 text-indigo-900 bg-indigo-50/80 ring-1 ring-indigo-500/30'
                      : 'border-slate-200/90 text-slate-700'
                  }`}
                >
                  <option value="">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-[8px]">
                  ▼
                </div>
              </div>

              {/* Floor */}
              <div className="relative shrink-0">
                <select
                  value={filterFloor}
                  onChange={(e) => onFloorChange(e.target.value)}
                  className={`text-xs font-bold border rounded-xl px-2.5 py-1.5 bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:border-indigo-500 transition-all cursor-pointer shadow-2xs appearance-none pr-6 ${
                    filterFloor
                      ? 'border-indigo-500 text-indigo-900 bg-indigo-50/80 ring-1 ring-indigo-500/30'
                      : 'border-slate-200/90 text-slate-700'
                  }`}
                >
                  <option value="">All Floors</option>
                  {floors.map((f) => (
                    <option key={f} value={f}>Floor {f}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-[8px]">
                  ▼
                </div>
              </div>

              {/* Booking Source */}
              <div className="relative shrink-0">
                <select
                  value={filterSource}
                  onChange={(e) => onSourceChange(e.target.value)}
                  className={`text-xs font-bold border rounded-xl px-2.5 py-1.5 bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:border-indigo-500 transition-all cursor-pointer shadow-2xs appearance-none pr-6 ${
                    filterSource
                      ? 'border-indigo-500 text-indigo-900 bg-indigo-50/80 ring-1 ring-indigo-500/30'
                      : 'border-slate-200/90 text-slate-700'
                  }`}
                >
                  <option value="">All Sources</option>
                  {SOURCE_CATEGORIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-[8px]">
                  ▼
                </div>
              </div>

              {/* Reservation Status */}
              <div className="relative shrink-0">
                <select
                  value={filterStatus}
                  onChange={(e) => onStatusChange(e.target.value)}
                  className={`text-xs font-bold border rounded-xl px-2.5 py-1.5 bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:border-indigo-500 transition-all cursor-pointer shadow-2xs appearance-none pr-6 ${
                    filterStatus
                      ? 'border-indigo-500 text-indigo-900 bg-indigo-50/80 ring-1 ring-indigo-500/30'
                      : 'border-slate-200/90 text-slate-700'
                  }`}
                >
                  <option value="">All Statuses</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="checked_in">Checked In</option>
                  <option value="occupied">Occupied</option>
                  <option value="complimentary">Complimentary</option>
                  <option value="checked_out">Checked Out</option>
                </select>
                <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-[8px]">
                  ▼
                </div>
              </div>

              {/* Payment Status */}
              <div className="relative shrink-0">
                <select
                  value={filterPayment}
                  onChange={(e) => onPaymentChange(e.target.value)}
                  className={`text-xs font-bold border rounded-xl px-2.5 py-1.5 bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:border-indigo-500 transition-all cursor-pointer shadow-2xs appearance-none pr-6 ${
                    filterPayment
                      ? 'border-indigo-500 text-indigo-900 bg-indigo-50/80 ring-1 ring-indigo-500/30'
                      : 'border-slate-200/90 text-slate-700'
                  }`}
                >
                  <option value="">All Payment</option>
                  <option value="paid">Paid / Advance</option>
                  <option value="unpaid">Unpaid / Due</option>
                </select>
                <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-[8px]">
                  ▼
                </div>
              </div>

              {/* Reset Filters */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-black text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition active:scale-95 shrink-0 cursor-pointer shadow-2xs"
                  title="Reset filters"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}

              {/* Filter Count */}
              {hasActiveFilters && (
                <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-600 shrink-0">
                  <span>{totalFilteredCount}</span>
                  <span className="text-slate-400">/</span>
                  <span>{totalBookingsCount}</span>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </header>
  );
};
