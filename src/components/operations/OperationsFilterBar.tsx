import React from 'react';
import { Search, X, Filter, SlidersHorizontal, RotateCcw, Check } from 'lucide-react';
import type { RoomCategory } from '@/lib/types';
import { SOURCE_CATEGORIES } from '@/lib/types';

interface OperationsFilterBarProps {
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

export const OperationsFilterBar: React.FC<OperationsFilterBarProps> = ({
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
  return (
    <div className="px-4 sm:px-6 pb-2.5 max-w-[1920px] mx-auto">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-2.5 sm:p-3 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        
        {/* ── Search Input ── */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search guest name, room no, phone, OTA source…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-9 py-2 bg-slate-50 border border-slate-200/90 rounded-xl text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-2xs"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* ── Filter Dropdowns Strip ── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 flex-wrap sm:flex-nowrap">
          
          {/* Room Category */}
          <select
            value={filterCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className={`text-xs font-bold border rounded-xl px-3 py-2 bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:border-indigo-500 transition-all shrink-0 cursor-pointer shadow-2xs ${
              filterCategory ? 'border-indigo-400 text-indigo-900 bg-indigo-50/50' : 'border-slate-200/90 text-slate-700'
            }`}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>

          {/* Floor */}
          <select
            value={filterFloor}
            onChange={(e) => onFloorChange(e.target.value)}
            className={`text-xs font-bold border rounded-xl px-3 py-2 bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:border-indigo-500 transition-all shrink-0 cursor-pointer shadow-2xs ${
              filterFloor ? 'border-indigo-400 text-indigo-900 bg-indigo-50/50' : 'border-slate-200/90 text-slate-700'
            }`}
          >
            <option value="">All Floors</option>
            {floors.map((f) => (
              <option key={f} value={f}>Floor {f}</option>
            ))}
          </select>

          {/* Booking Source */}
          <select
            value={filterSource}
            onChange={(e) => onSourceChange(e.target.value)}
            className={`text-xs font-bold border rounded-xl px-3 py-2 bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:border-indigo-500 transition-all shrink-0 cursor-pointer shadow-2xs ${
              filterSource ? 'border-indigo-400 text-indigo-900 bg-indigo-50/50' : 'border-slate-200/90 text-slate-700'
            }`}
          >
            <option value="">All Sources</option>
            {SOURCE_CATEGORIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Reservation Status */}
          <select
            value={filterStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            className={`text-xs font-bold border rounded-xl px-3 py-2 bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:border-indigo-500 transition-all shrink-0 cursor-pointer shadow-2xs ${
              filterStatus ? 'border-indigo-400 text-indigo-900 bg-indigo-50/50' : 'border-slate-200/90 text-slate-700'
            }`}
          >
            <option value="">All Statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="checked_in">Checked In</option>
            <option value="occupied">Occupied</option>
            <option value="complimentary">Complimentary</option>
            <option value="checked_out">Checked Out</option>
          </select>

          {/* Payment Status */}
          <select
            value={filterPayment}
            onChange={(e) => onPaymentChange(e.target.value)}
            className={`text-xs font-bold border rounded-xl px-3 py-2 bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:border-indigo-500 transition-all shrink-0 cursor-pointer shadow-2xs ${
              filterPayment ? 'border-indigo-400 text-indigo-900 bg-indigo-50/50' : 'border-slate-200/90 text-slate-700'
            }`}
          >
            <option value="">All Payment</option>
            <option value="paid">Paid / Advance</option>
            <option value="unpaid">Unpaid / Due</option>
          </select>

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-black text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition active:scale-95 shrink-0 cursor-pointer shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}

        </div>
      </div>
    </div>
  );
};
