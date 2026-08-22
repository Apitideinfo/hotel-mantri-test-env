import { BedDouble, ClipboardList } from 'lucide-react';
import type { DashboardSummary } from '@/lib/api';

interface RoomChartPreviewSectionProps {
  roomPreview: DashboardSummary['roomPreview'] | null;
  todayStr: string;
  onNavigate: (screen: string, payload?: unknown) => void;
}

const StatusChip = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div
    className={`h-[36px] flex items-center px-3 rounded-[10px] border transition-all ${
      value === 0 ? 'opacity-65 bg-slate-50 border-slate-200/80 text-slate-500' : color
    }`}
  >
    <span className="text-xs sm:text-[13px] font-medium mr-1.5">{label}:</span>
    <strong className="text-xs sm:text-[13px] font-bold tabular-nums">{value}</strong>
  </div>
);

export const RoomChartPreviewSection = ({ roomPreview, todayStr, onNavigate }: RoomChartPreviewSectionProps) => {
  const categories = roomPreview?.categories ?? [
    { name: 'Deluxe Suite', total: 10, occupied: 4, reserved: 2, blocked: 0, maintenance: 0, outOfOrder: 0 },
    { name: 'Executive Room', total: 10, occupied: 4, reserved: 1, blocked: 0, maintenance: 0, outOfOrder: 0 },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100/80 pb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
            <BedDouble className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Room Chart Preview</h3>
            <p className="text-xs font-medium text-slate-400">Inventory Status Matrix</p>
          </div>
        </div>
        <button
          onClick={() => onNavigate('operations', { date: todayStr })}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xl shadow-soft-blue hover:shadow-md transition-all active:scale-95"
        >
          <ClipboardList className="w-4 h-4" /> Operations Board
        </button>
      </div>

      {/* Categories Status Matrix */}
      {categories.length > 0 ? (
        <div className="space-y-3.5">
          {categories.map((cat) => {
            const avail = cat.total - cat.occupied - cat.reserved - cat.blocked - cat.maintenance - cat.outOfOrder;
            return (
              <div
                key={cat.name}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4.5 rounded-2xl border border-slate-200/80 bg-slate-50/40 hover:bg-white hover:border-slate-300 hover:shadow-card transition-all"
              >
                {/* Left: Category name + Total count */}
                <div className="w-44 shrink-0">
                  <p className="text-base font-bold text-slate-900 truncate">{cat.name}</p>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">{cat.total} Total Rooms</p>
                </div>

                {/* Right: Status chips matrix (all 6 statuses preserved including 0-values) */}
                <div className="flex-1 flex items-center gap-2 flex-wrap">
                  <StatusChip label="Occupied" value={cat.occupied} color="bg-rose-50/90 text-rose-700 border-rose-200" />
                  <StatusChip label="Reserved" value={cat.reserved} color="bg-brand-50/90 text-brand-700 border-brand-200" />
                  <StatusChip label="Blocked" value={cat.blocked} color="bg-slate-100/90 text-slate-700 border-slate-200" />
                  <StatusChip label="Maintenance" value={cat.maintenance} color="bg-amber-50/90 text-amber-700 border-amber-200" />
                  <StatusChip label="Out of Order" value={cat.outOfOrder} color="bg-red-50/90 text-red-700 border-red-200" />
                  <StatusChip label="Available" value={avail < 0 ? 0 : avail} color="bg-emerald-50/90 text-emerald-700 border-emerald-200" />
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
