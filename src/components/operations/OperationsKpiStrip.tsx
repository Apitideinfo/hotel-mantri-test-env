import React from 'react';
import {
  BedDouble, LogIn, LogOut, Calendar, IndianRupee,
  AlertCircle, Sparkles, Play, ClipboardCheck, Wrench, Ban,
  CheckCircle2, ArrowUpRight, ShieldAlert,
} from 'lucide-react';
import type { Room } from '@/lib/types';
import type { TodayStats } from './types';
import { fmtMoney, fmtInt } from '@/lib/calc';

interface OperationsKpiStripProps {
  stats: TodayStats;
  totalActiveRooms: number;
  rooms: Room[];
}

const HK_DOT_COLORS: Record<string, string> = {
  'Vacant Clean': 'bg-emerald-500',
  'Vacant Dirty': 'bg-amber-500',
  'Occupied': 'bg-brand-500',
  'Occupied Clean': 'bg-teal-500',
  'Occupied Service Due': 'bg-orange-500',
  'Cleaning In Progress': 'bg-sky-500',
  'Ready for Inspection': 'bg-violet-500',
  'Inspected / Ready': 'bg-indigo-500',
  'Out Of Order': 'bg-red-500',
  'Blocked': 'bg-slate-500',
};

export const OperationsKpiStrip: React.FC<OperationsKpiStripProps> = ({
  stats,
  totalActiveRooms,
  rooms,
}) => {
  const occupancyPct = totalActiveRooms > 0
    ? Math.round((stats.occupied / totalActiveRooms) * 100)
    : 0;

  const hkCounts: Record<string, number> = {};
  for (const r of rooms) {
    hkCounts[r.housekeeping_status] = (hkCounts[r.housekeeping_status] ?? 0) + 1;
  }

  return (
    <div className="px-4 sm:px-6 py-3 space-y-2.5">
      {/* 2-Group KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2.5 sm:gap-3">
        {/* GROUP A: TODAY'S OPERATIONS VELOCITY */}

        {/* 1. Occupied + Gauge */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-card hover:shadow-card-hover transition relative overflow-hidden group">
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Occupied</span>
            <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/80">
              {occupancyPct}%
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {fmtInt(stats.occupied)}
              <span className="text-xs font-semibold text-slate-400 ml-1">/ {totalActiveRooms}</span>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
              <BedDouble className="w-4 h-4" />
            </div>
          </div>
          {/* Mini progress bar */}
          <div className="w-full h-1 bg-slate-100 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, occupancyPct)}%` }}
            />
          </div>
        </div>

        {/* 2. Vacant */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-card hover:shadow-card-hover transition group">
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vacant</span>
            <span className="text-[10px] font-semibold text-slate-500">Available</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {fmtInt(stats.vacant)}
            </div>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-[11px] font-medium text-slate-500 mt-2 flex items-center gap-1">
            <span>{hkCounts['Vacant Clean'] ?? 0} Clean & Ready</span>
          </div>
        </div>

        {/* 3. Arrivals */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-card hover:shadow-card-hover transition group">
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Arrivals</span>
            <span className="text-[10px] font-bold text-brand-600 bg-brand-50 px-1.5 py-0.2 rounded border border-brand-100">
              Today
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-xl sm:text-2xl font-black text-brand-700 tracking-tight">
              {fmtInt(stats.arrivals)}
            </div>
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 border border-brand-100 flex items-center justify-center shrink-0">
              <LogIn className="w-4 h-4" />
            </div>
          </div>
          <div className="text-[11px] font-medium text-slate-500 mt-2">
            <span>Expected Check-Ins</span>
          </div>
        </div>

        {/* 4. Departures */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-card hover:shadow-card-hover transition group">
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Departures</span>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-100">
              Today
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-xl sm:text-2xl font-black text-amber-700 tracking-tight">
              {fmtInt(stats.departures)}
            </div>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
              <LogOut className="w-4 h-4" />
            </div>
          </div>
          <div className="text-[11px] font-medium text-slate-500 mt-2">
            <span>Expected Check-Outs</span>
          </div>
        </div>

        {/* GROUP B: FINANCIAL & EXCEPTION ALERTS */}

        {/* 5. Revenue */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-card hover:shadow-card-hover transition group">
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nightly Revenue</span>
            <span className="text-[10px] font-semibold text-emerald-600">Active</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-lg sm:text-xl font-black text-slate-900 tracking-tight truncate">
              ₹{fmtMoney(stats.todayRevenue)}
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="text-[11px] font-medium text-slate-500 mt-2 truncate">
            <span>Room Tariff Today</span>
          </div>
        </div>

        {/* 6. Missing Tariff Alert */}
        <div className={`rounded-xl border p-3 shadow-card hover:shadow-card-hover transition group ${
          stats.missingTariff > 0
            ? 'bg-rose-50/50 border-rose-200'
            : 'bg-white border-slate-200/90'
        }`}>
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Missing Tariff</span>
            {stats.missingTariff > 0 && (
              <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.2 rounded border border-rose-200">
                Action Req
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between">
            <div className={`text-xl sm:text-2xl font-black tracking-tight ${
              stats.missingTariff > 0 ? 'text-rose-700' : 'text-slate-900'
            }`}>
              {fmtInt(stats.missingTariff)}
            </div>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
              stats.missingTariff > 0
                ? 'bg-rose-100 text-rose-600 border-rose-200'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}>
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-[11px] font-medium text-slate-500 mt-2 truncate">
            <span>{stats.missingTariff > 0 ? '₹0 Rate entries detected' : 'All tariffs mapped'}</span>
          </div>
        </div>

        {/* 7. Missing Payment Alert */}
        <div className={`rounded-xl border p-3 shadow-card hover:shadow-card-hover transition group ${
          stats.missingPayment > 0
            ? 'bg-amber-50/40 border-amber-200'
            : 'bg-white border-slate-200/90'
        }`}>
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unpaid Stays</span>
            {stats.missingPayment > 0 && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                Due
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between">
            <div className={`text-xl sm:text-2xl font-black tracking-tight ${
              stats.missingPayment > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}>
              {fmtInt(stats.missingPayment)}
            </div>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
              stats.missingPayment > 0
                ? 'bg-amber-100 text-amber-600 border-amber-200'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}>
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-[11px] font-medium text-slate-500 mt-2 truncate">
            <span>{stats.missingPayment > 0 ? 'Pending non-OTA folio' : 'All balances settled'}</span>
          </div>
        </div>

        {/* 8. Future Bookings */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-card hover:shadow-card-hover transition group">
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Future</span>
            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
              Pipeline
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-xl sm:text-2xl font-black text-indigo-700 tracking-tight">
              {fmtInt(stats.futureBookings)}
            </div>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-[11px] font-medium text-slate-500 mt-2 truncate">
            <span>Confirmed Advance Stays</span>
          </div>
        </div>
      </div>

      {/* Housekeeping Quick Glance Pill Strip */}
      <div className="bg-white rounded-xl border border-slate-200/90 px-3.5 py-2 flex items-center justify-between gap-4 overflow-x-auto shadow-2xs">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Housekeeping:</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 shrink-0 text-xs">
          <div className="flex items-center gap-1.5" title="Vacant Clean">
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-slate-600 text-[11px]">Clean:</span>
            <strong className="text-slate-900 font-bold">{hkCounts['Vacant Clean'] ?? 0}</strong>
          </div>
          <div className="flex items-center gap-1.5" title="Vacant Dirty">
            <BedDouble className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-slate-600 text-[11px]">Dirty:</span>
            <strong className="text-slate-900 font-bold">{hkCounts['Vacant Dirty'] ?? 0}</strong>
          </div>
          <div className="flex items-center gap-1.5" title="Cleaning In Progress">
            <Play className="w-3.5 h-3.5 text-sky-500" />
            <span className="text-slate-600 text-[11px]">In Progress:</span>
            <strong className="text-slate-900 font-bold">{hkCounts['Cleaning In Progress'] ?? 0}</strong>
          </div>
          <div className="flex items-center gap-1.5" title="Ready for Inspection">
            <ClipboardCheck className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-slate-600 text-[11px]">Inspect:</span>
            <strong className="text-slate-900 font-bold">{hkCounts['Ready for Inspection'] ?? 0}</strong>
          </div>
          <div className="flex items-center gap-1.5" title="Out Of Order">
            <Wrench className="w-3.5 h-3.5 text-rose-500" />
            <span className="text-slate-600 text-[11px]">OOO:</span>
            <strong className="text-slate-900 font-bold">{hkCounts['Out Of Order'] ?? 0}</strong>
          </div>
          <div className="flex items-center gap-1.5" title="Blocked">
            <Ban className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-600 text-[11px]">Blocked:</span>
            <strong className="text-slate-900 font-bold">{hkCounts['Blocked'] ?? 0}</strong>
          </div>
        </div>
      </div>
    </div>
  );
};
