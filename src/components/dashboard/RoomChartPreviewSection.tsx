import { BedDouble, ClipboardList, ArrowRight, DoorOpen } from 'lucide-react';
import type { DashboardSummary } from '@/lib/api';

interface RoomChartPreviewSectionProps {
  roomPreview: DashboardSummary['roomPreview'] | null;
  todayStr: string;
  onNavigate: (screen: string, payload?: unknown) => void;
}

const StatusBadge = ({ label, value, color, activeColor }: { label: string; value: number; color: string; activeColor: string }) => (
  <div
    className={`h-[34px] flex items-center px-3 rounded-xl border text-xs font-semibold transition-all ${
      value === 0 ? 'opacity-40 bg-slate-50 border-slate-200/70 text-slate-400' : `${color} ${activeColor} shadow-2xs`
    }`}
  >
    <span className="mr-1.5">{label}:</span>
    <span className="font-extrabold tabular-nums">{value}</span>
  </div>
);

export const RoomChartPreviewSection = ({ roomPreview, todayStr, onNavigate }: RoomChartPreviewSectionProps) => {
  const categories = roomPreview?.categories ?? [
    { name: 'Deluxe Suite', total: 10, occupied: 4, reserved: 2, blocked: 0, maintenance: 0, outOfOrder: 0 },
    { name: 'Executive Room', total: 10, occupied: 4, reserved: 1, blocked: 0, maintenance: 0, outOfOrder: 0 },
  ];

  const totalInventoryRooms = categories.reduce((acc, cat) => acc + cat.total, 0);
  const totalOccupiedRooms = categories.reduce((acc, cat) => acc + cat.occupied, 0);
  const totalAvailableRooms = categories.reduce((acc, cat) => {
    const avail = (cat as { available?: number }).available !== undefined
      ? (cat as { available?: number }).available!
      : Math.max(0, cat.total - cat.occupied - cat.reserved - cat.blocked - cat.maintenance - cat.outOfOrder);
    return acc + avail;
  }, 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100/80 pb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
            <BedDouble className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 leading-tight">Room Inventory & Allocation Matrix</h3>
            <p className="text-xs font-medium text-slate-400 leading-tight mt-0.5">
              Live Room Category Availability • {totalAvailableRooms} of {totalInventoryRooms} Ready
            </p>
          </div>
        </div>
        <button
          onClick={() => onNavigate('operations', { date: todayStr })}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-xl shadow-soft-blue hover:shadow-md transition-all active:scale-95 cursor-pointer"
        >
          <ClipboardList className="w-4 h-4" /> Operations Board
        </button>
      </div>

      {/* Categories Status Matrix */}
      {categories.length > 0 ? (
        <div className="space-y-3">
          {categories.map((cat) => {
            const avail = (cat as { available?: number }).available !== undefined
              ? (cat as { available?: number }).available!
              : Math.max(0, cat.total - cat.occupied - cat.reserved - cat.blocked - cat.maintenance - cat.outOfOrder);

            const total = Math.max(1, cat.total);
            const occPct = (cat.occupied / total) * 100;
            const resPct = (cat.reserved / total) * 100;
            const maintPct = ((cat.maintenance + cat.outOfOrder + cat.blocked) / total) * 100;
            const availPct = (Math.max(0, avail) / total) * 100;

            return (
              <div
                key={cat.name}
                className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200/70 bg-slate-50/40 hover:bg-white hover:border-slate-300 hover:shadow-card transition-all"
              >
                {/* Left: Category name + Mini Visual Utilization Bar */}
                <div className="w-full lg:w-56 shrink-0 space-y-2">
                  <div className="flex items-center justify-between lg:block">
                    <p className="text-sm font-bold text-slate-900 truncate">{cat.name}</p>
                    <p className="text-xs font-medium text-slate-500 mt-0.5">{cat.total} Total Rooms</p>
                  </div>

                  {/* Multi-segment utilization bar */}
                  <div className="w-full bg-slate-200/80 rounded-full h-2 flex overflow-hidden">
                    <div style={{ width: `${occPct}%` }} className="bg-rose-500 h-full" title={`Occupied: ${cat.occupied}`} />
                    <div style={{ width: `${resPct}%` }} className="bg-brand-500 h-full" title={`Reserved: ${cat.reserved}`} />
                    <div style={{ width: `${maintPct}%` }} className="bg-amber-500 h-full" title={`Maintenance/Blocked: ${cat.maintenance + cat.outOfOrder + cat.blocked}`} />
                    <div style={{ width: `${availPct}%` }} className="bg-emerald-500 h-full" title={`Available: ${avail}`} />
                  </div>
                </div>

                {/* Right: Status chips matrix (all 6 statuses preserved including 0-values) */}
                <div className="flex-1 flex items-center gap-2 flex-wrap justify-start lg:justify-end">
                  <StatusBadge label="Occupied" value={cat.occupied} color="bg-rose-50 border-rose-200/80 text-rose-700" activeColor="border-rose-300" />
                  <StatusBadge label="Reserved" value={cat.reserved} color="bg-brand-50 border-brand-200/80 text-brand-700" activeColor="border-brand-300" />
                  <StatusBadge label="Available" value={avail < 0 ? 0 : avail} color="bg-emerald-50 border-emerald-200/80 text-emerald-700 font-bold" activeColor="border-emerald-300" />
                  <StatusBadge label="Blocked" value={cat.blocked} color="bg-slate-100 border-slate-200 text-slate-700" activeColor="border-slate-300" />
                  <StatusBadge label="Maintenance" value={cat.maintenance} color="bg-amber-50 border-amber-200/80 text-amber-700" activeColor="border-amber-300" />
                  <StatusBadge label="Out of Order" value={cat.outOfOrder} color="bg-red-50 border-red-200/80 text-red-700" activeColor="border-red-300" />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
          <p className="text-xs text-slate-400 mb-2">No room categories configured yet.</p>
          <button
            onClick={() => onNavigate('property')}
            className="text-xs font-semibold text-brand-600 hover:underline"
          >
            Configure in Property Master
          </button>
        </div>
      )}
    </div>
  );
};
