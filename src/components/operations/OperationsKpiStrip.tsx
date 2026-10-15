import React from 'react';
import { Sparkles } from 'lucide-react';
import type { Room } from '@/lib/types';
import type { TodayStats } from './types';

interface OperationsKpiStripProps {
  stats?: TodayStats;
  totalActiveRooms?: number;
  rooms: Room[];
}

export const OperationsKpiStrip: React.FC<OperationsKpiStripProps> = ({
  rooms,
}) => {
  const hkCounts: Record<string, number> = {};
  for (const r of rooms) {
    hkCounts[r.housekeeping_status] = (hkCounts[r.housekeeping_status] ?? 0) + 1;
  }

  return (
    <div className="px-4 sm:px-6 pb-4 max-w-[1920px] mx-auto w-full">
      {/* ── Housekeeping Status Command Footer Strip ── */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 px-4 py-2.5 flex items-center justify-between gap-4 overflow-x-auto shadow-xs">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            Housekeeping Status:
          </span>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200/80 shadow-2xs hover:border-emerald-300 transition" title="Vacant Clean">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-emerald-900 font-semibold text-[11px]">Clean:</span>
            <strong className="text-emerald-950 font-black text-xs">{hkCounts['Vacant Clean'] ?? 0}</strong>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200/80 shadow-2xs hover:border-amber-300 transition" title="Vacant Dirty">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            <span className="text-amber-900 font-semibold text-[11px]">Dirty:</span>
            <strong className="text-amber-950 font-black text-xs">{hkCounts['Vacant Dirty'] ?? 0}</strong>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-sky-50 border border-sky-200/80 shadow-2xs hover:border-sky-300 transition" title="Cleaning In Progress">
            <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
            <span className="text-sky-900 font-semibold text-[11px]">In Progress:</span>
            <strong className="text-sky-950 font-black text-xs">{hkCounts['Cleaning In Progress'] ?? 0}</strong>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-violet-50 border border-violet-200/80 shadow-2xs hover:border-violet-300 transition" title="Ready for Inspection">
            <span className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
            <span className="text-violet-900 font-semibold text-[11px]">Inspect:</span>
            <strong className="text-violet-950 font-black text-xs">{hkCounts['Ready for Inspection'] ?? 0}</strong>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-50 border border-rose-200/80 shadow-2xs hover:border-rose-300 transition" title="Out Of Order">
            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
            <span className="text-rose-900 font-semibold text-[11px]">OOO:</span>
            <strong className="text-rose-950 font-black text-xs">{hkCounts['Out Of Order'] ?? 0}</strong>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200/80 shadow-2xs hover:border-slate-300 transition" title="Blocked">
            <span className="w-2 h-2 rounded-full bg-slate-500 shrink-0" />
            <span className="text-slate-700 font-semibold text-[11px]">Blocked:</span>
            <strong className="text-slate-900 font-black text-xs">{hkCounts['Blocked'] ?? 0}</strong>
          </div>
        </div>
      </div>
    </div>
  );
};
