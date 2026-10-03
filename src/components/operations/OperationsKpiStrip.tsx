import React from 'react';
import {
  BedDouble, LogIn, LogOut, Calendar, IndianRupee,
  AlertCircle, Sparkles, Play, ClipboardCheck, Wrench, Ban,
  CheckCircle2, ArrowUpRight, ShieldAlert, TrendingUp, Users,
} from 'lucide-react';
import type { Room } from '@/lib/types';
import type { TodayStats } from './types';
import { fmtMoney, fmtInt } from '@/lib/calc';

interface OperationsKpiStripProps {
  stats: TodayStats;
  totalActiveRooms: number;
  rooms: Room[];
}

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
    <div className="px-4 sm:px-6 py-3 space-y-2.5 max-w-[1920px] mx-auto">
      
      {/* ── 8-Card Semantic KPI Grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2.5 sm:gap-3">
        
        {/* 1. Occupied + Visual Progress Bar */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all duration-200 relative overflow-hidden group">
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Occupied</span>
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/80">
              {occupancyPct}%
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {fmtInt(stats.occupied)}
              <span className="text-xs font-semibold text-slate-400 ml-1">/ {totalActiveRooms}</span>
            </div>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100/90 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
              <BedDouble className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          {/* Mini Progress Bar */}
          <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, occupancyPct)}%` }}
            />
          </div>
        </div>

        {/* 2. Vacant Available */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 group">
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Vacant</span>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60">
              Available
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {fmtInt(stats.vacant)}
            </div>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 border border-slate-200/80 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
              <Sparkles className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="text-[11px] font-semibold text-slate-500 mt-2.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-slate-700 font-bold">{hkCounts['Vacant Clean'] ?? 0}</span> Clean & Ready
          </div>
        </div>

        {/* 3. Today's Arrivals */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all duration-200 group">
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Arrivals</span>
            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/80">
              Today
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-xl sm:text-2xl font-black text-blue-700 tracking-tight">
              {fmtInt(stats.arrivals)}
            </div>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 border border-blue-100/90 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
              <LogIn className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="text-[11px] font-medium text-slate-500 mt-2.5 truncate">
            <span>Expected Check-Ins</span>
          </div>
        </div>

        {/* 4. Today's Departures */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-sm hover:shadow-md hover:border-amber-300 transition-all duration-200 group">
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Departures</span>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/80">
              Today
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-xl sm:text-2xl font-black text-amber-700 tracking-tight">
              {fmtInt(stats.departures)}
            </div>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-100/90 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
              <LogOut className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="text-[11px] font-medium text-slate-500 mt-2.5 truncate">
            <span>Expected Check-Outs</span>
          </div>
        </div>

        {/* 5. Nightly Revenue */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all duration-200 group">
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Nightly Rev</span>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/80">
              Active
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-lg sm:text-xl font-black text-slate-900 tracking-tight truncate">
              ₹{fmtMoney(stats.todayRevenue)}
            </div>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100/90 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
              <IndianRupee className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="text-[11px] font-medium text-slate-500 mt-2.5 truncate">
            <span>Room Tariff Today</span>
          </div>
        </div>

        {/* 6. Missing Tariff Exception Alert */}
        <div className={`rounded-2xl border p-3.5 shadow-sm hover:shadow-md transition-all duration-200 group ${
          stats.missingTariff > 0
            ? 'bg-rose-50/60 border-rose-200 hover:border-rose-300'
            : 'bg-white border-slate-200/90 hover:border-slate-300'
        }`}>
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Zero Tariff</span>
            {stats.missingTariff > 0 && (
              <span className="text-[10px] font-black text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded border border-rose-200 animate-pulse">
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
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs group-hover:scale-105 transition-transform ${
              stats.missingTariff > 0
                ? 'bg-rose-100 text-rose-600 border-rose-200'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}>
              <AlertCircle className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="text-[11px] font-medium text-slate-500 mt-2.5 truncate">
            <span>{stats.missingTariff > 0 ? '₹0 Rate entries detected' : 'All tariffs mapped'}</span>
          </div>
        </div>

        {/* 7. Unpaid Stays Alert */}
        <div className={`rounded-2xl border p-3.5 shadow-sm hover:shadow-md transition-all duration-200 group ${
          stats.missingPayment > 0
            ? 'bg-amber-50/50 border-amber-200 hover:border-amber-300'
            : 'bg-white border-slate-200/90 hover:border-slate-300'
        }`}>
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Unpaid Stays</span>
            {stats.missingPayment > 0 && (
              <span className="text-[10px] font-black text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">
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
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs group-hover:scale-105 transition-transform ${
              stats.missingPayment > 0
                ? 'bg-amber-100 text-amber-700 border-amber-200'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}>
              <ShieldAlert className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="text-[11px] font-medium text-slate-500 mt-2.5 truncate">
            <span>{stats.missingPayment > 0 ? 'Pending non-OTA folio' : 'All balances settled'}</span>
          </div>
        </div>

        {/* 8. Advance Future Pipeline */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all duration-200 group">
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Future</span>
            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200/80">
              Pipeline
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-xl sm:text-2xl font-black text-indigo-700 tracking-tight">
              {fmtInt(stats.futureBookings)}
            </div>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100/90 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
              <Calendar className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="text-[11px] font-medium text-slate-500 mt-2.5 truncate">
            <span>Advance Bookings</span>
          </div>
        </div>

      </div>

      {/* ── Housekeeping Status Command Pill Strip ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-2.5 flex items-center justify-between gap-4 overflow-x-auto shadow-2xs">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            Housekeeping Status:
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 shrink-0 text-xs">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50/80 border border-emerald-200/60" title="Vacant Clean">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-emerald-900 font-medium text-[11px]">Clean:</span>
            <strong className="text-emerald-950 font-black">{hkCounts['Vacant Clean'] ?? 0}</strong>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-50/80 border border-amber-200/60" title="Vacant Dirty">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-amber-900 font-medium text-[11px]">Dirty:</span>
            <strong className="text-amber-950 font-black">{hkCounts['Vacant Dirty'] ?? 0}</strong>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-sky-50/80 border border-sky-200/60" title="Cleaning In Progress">
            <span className="w-2 h-2 rounded-full bg-sky-500" />
            <span className="text-sky-900 font-medium text-[11px]">In Progress:</span>
            <strong className="text-sky-950 font-black">{hkCounts['Cleaning In Progress'] ?? 0}</strong>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-violet-50/80 border border-violet-200/60" title="Ready for Inspection">
            <span className="w-2 h-2 rounded-full bg-violet-500" />
            <span className="text-violet-900 font-medium text-[11px]">Inspect:</span>
            <strong className="text-violet-950 font-black">{hkCounts['Ready for Inspection'] ?? 0}</strong>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-rose-50/80 border border-rose-200/60" title="Out Of Order">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span className="text-rose-900 font-medium text-[11px]">OOO:</span>
            <strong className="text-rose-950 font-black">{hkCounts['Out Of Order'] ?? 0}</strong>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 border border-slate-200/80" title="Blocked">
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            <span className="text-slate-700 font-medium text-[11px]">Blocked:</span>
            <strong className="text-slate-900 font-black">{hkCounts['Blocked'] ?? 0}</strong>
          </div>
        </div>
      </div>

    </div>
  );
};
