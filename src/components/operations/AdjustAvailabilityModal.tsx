import React, { useEffect } from 'react';
import { Sliders, X, AlertCircle, Loader2, Check } from 'lucide-react';
import type { RoomCategory, Room } from '@/lib/types';
import type { AuthoritativeMatrixItem } from '@/lib/api-channel';

interface AdjustAvailabilityModalProps {
  data: {
    categoryId: string;
    categoryName: string;
    startDate: string;
    endDate: string;
    availability: number;
    stopSell: boolean;
  };
  categories: RoomCategory[];
  activeRooms: Room[];
  categoryAvailability: Map<string, AuthoritativeMatrixItem>;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (data: {
    categoryId: string;
    startDate: string;
    endDate: string;
    availability: number;
    stopSell: boolean;
  }) => Promise<void>;
  onChangeData: (data: {
    categoryId: string;
    categoryName: string;
    startDate: string;
    endDate: string;
    availability: number;
    stopSell: boolean;
  }) => void;
}

export const AdjustAvailabilityModal: React.FC<AdjustAvailabilityModalProps> = ({
  data,
  categories,
  activeRooms,
  categoryAvailability,
  saving,
  error,
  onClose,
  onSave,
  onChangeData,
}) => {
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  const physicalTotal = activeRooms.filter((r) => r.category_id === data.categoryId).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-scale-in">
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-brand-gold-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Adjust Room Availability</h3>
              <p className="text-xs text-slate-400">Update sellable rooms & restrictions</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onSave({
              categoryId: data.categoryId,
              startDate: data.startDate,
              endDate: data.endDate,
              availability: data.availability,
              stopSell: data.stopSell,
            });
          }}
          className="p-5 space-y-4"
        >
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Room Category */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Room Category
            </label>
            <select
              value={data.categoryId}
              onChange={(e) => {
                const newCatId = e.target.value;
                const catObj = categories.find((c) => c.id === newCatId);
                const item = categoryAvailability.get(`${newCatId}_${data.startDate}`);
                const fallbackAvail = activeRooms.filter((r) => r.category_id === newCatId).length;
                onChangeData({
                  ...data,
                  categoryId: newCatId,
                  categoryName: catObj?.name ?? 'Category',
                  availability: item !== undefined ? item.available : fallbackAvail,
                  stopSell: Boolean(item?.stop_sell),
                });
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:border-brand-500 focus:outline-none transition"
            >
              {categories.map((c) => {
                const roomCount = activeRooms.filter((r) => r.category_id === c.id).length;
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} ({roomCount} physical rooms)
                  </option>
                );
              })}
            </select>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Start Date
              </label>
              <input
                type="date"
                required
                value={data.startDate}
                onChange={(e) => {
                  const newStart = e.target.value;
                  onChangeData({
                    ...data,
                    startDate: newStart,
                    endDate: data.endDate < newStart ? newStart : data.endDate,
                  });
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:border-brand-500 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                End Date
              </label>
              <input
                type="date"
                required
                min={data.startDate}
                value={data.endDate}
                onChange={(e) =>
                  onChangeData({
                    ...data,
                    endDate: e.target.value,
                  })
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:border-brand-500 focus:outline-none transition"
              />
            </div>
          </div>

          {/* Sellable Availability Count */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Sellable Availability
              </label>
              <span className="text-[11px] font-semibold text-slate-500">
                Max Physical: {physicalTotal} rooms
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onChangeData({
                    ...data,
                    availability: Math.max(0, data.availability - 1),
                  })
                }
                className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-lg flex items-center justify-center transition active:scale-95 cursor-pointer"
              >
                -
              </button>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={data.availability}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  onChangeData({
                    ...data,
                    availability: isNaN(v) ? 0 : Math.max(0, v),
                  });
                }}
                className="flex-1 text-center py-2 bg-slate-50 border border-slate-200 rounded-xl text-base font-bold text-slate-900 focus:bg-white focus:border-brand-500 focus:outline-none transition tabular-nums"
              />
              <button
                type="button"
                onClick={() =>
                  onChangeData({
                    ...data,
                    availability: data.availability + 1,
                  })
                }
                className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-lg flex items-center justify-center transition active:scale-95 cursor-pointer"
              >
                +
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Enter the number of rooms to make available for booking across all channels.
            </p>
          </div>

          {/* Stop Sell Toggle */}
          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={data.stopSell}
                onChange={(e) =>
                  onChangeData({
                    ...data,
                    stopSell: e.target.checked,
                  })
                }
                className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
              />
              <div>
                <span className="text-xs font-bold text-slate-800">Stop Sell (Close Room Category)</span>
                <p className="text-[11px] text-slate-500">
                  Forces sellable availability to 0 and blocks incoming reservations.
                </p>
              </div>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-soft-blue transition active:scale-95 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Save Availability</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
