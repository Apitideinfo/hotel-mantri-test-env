import { useState, useEffect, useMemo } from 'react';
import {
  X, Loader2, AlertCircle, CheckCircle2, ArrowRight, BedDouble,
} from 'lucide-react';
import type { Room, RoomCategory, FrontOfficeRole } from '@/lib/types';
import { groupRoomsByCategory, compareRoomNo, canRoomShift } from '@/lib/types';
import { getVacantRooms, shiftRoom } from '@/lib/api-frontoffice';
import { fmtMoney } from '@/lib/calc';
import { brand } from '@/lib/theme';

interface RoomShiftModalProps {
  entryId: string;
  fromRoom: string;
  rooms: Room[];
  categories: RoomCategory[];
  role: FrontOfficeRole | null;
  onClose: () => void;
  onShifted: () => void;
}

export const RoomShiftModal = ({
  entryId, fromRoom, rooms, categories, role, onClose, onShifted,
}: RoomShiftModalProps) => {
  const [vacantRooms, setVacantRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetRoom, setTargetRoom] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getVacantRooms(fromRoom).then((r) => {
      setVacantRooms(r);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [fromRoom]);

  const fromRoomData = useMemo(
    () => rooms.find((r) => r.room_no === fromRoom),
    [rooms, fromRoom],
  );
  const fromCategory = useMemo(
    () => categories.find((c) => c.id === fromRoomData?.category_id),
    [categories, fromRoomData],
  );

  const groupedVacant = useMemo(() => {
    const sorted = [...vacantRooms].sort((a, b) => compareRoomNo(a.room_no, b.room_no));
    return groupRoomsByCategory(sorted, categories);
  }, [vacantRooms, categories]);

  const handleShift = async () => {
    setError(null);
    if (!targetRoom) { setError('Please select a target room.'); return; }
    if (!canRoomShift(role)) { setError('You do not have permission to shift rooms. Manager or Admin required.'); return; }
    setSaving(true);
    try {
      await shiftRoom({ entryId, fromRoom, toRoom: targetRoom, reason });
      setSuccess(true);
      setTimeout(() => { onShifted(); }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Room shift failed');
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <>
        <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm pointer-events-auto">
            <div className="px-6 py-8 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Room Shifted!</h2>
              <p className="text-sm text-slate-400 mt-1">{fromRoom} → {targetRoom}</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col pointer-events-auto">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between" style={{ background: brand.navy }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <ArrowRight className="w-5 h-5 text-brand-gold-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Room Shift</h2>
                <p className="text-xs text-brand-navy-300">From {fromRoom} to a vacant room</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-brand-navy-300">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            {/* From room display */}
            <div className="bg-brand-50 rounded-xl p-3 border border-brand-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
                <BedDouble className="w-5 h-5 text-brand-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Current Room</p>
                <p className="text-sm font-bold text-brand-navy-800">{fromRoom} {fromCategory ? `· ${fromCategory.name}` : ''}</p>
              </div>
            </div>

            {/* Vacant rooms */}
            {loading ? (
              <p className="text-sm text-slate-400 text-center py-4">Loading vacant rooms…</p>
            ) : vacantRooms.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No vacant rooms available.</p>
            ) : (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">Select Vacant Room *</p>
                <div className="space-y-3 max-h-56 overflow-y-auto">
                  {groupedVacant.map((group) => {
                    const isSameCategory = group.cat?.id === fromCategory?.id;
                    return (
                      <div key={group.cat?.id ?? '__uncat'}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`h-3 w-1 rounded-full ${isSameCategory ? 'bg-brand-gold-500' : 'bg-brand-500'}`} />
                          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                            {group.cat?.name ?? 'Uncategorized'}
                          </span>
                          {isSameCategory && <span className="text-[10px] text-brand-gold-600 font-bold">Same Category</span>}
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                          {group.rooms.map((r) => {
                            const isSelected = targetRoom === r.room_no;
                            return (
                              <button key={r.id} onClick={() => setTargetRoom(r.room_no)}
                                className={`px-2 py-2 text-xs rounded-lg border transition font-semibold ${
                                  isSelected
                                    ? 'bg-brand-600 text-white border-brand-600 shadow-soft-blue'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300 hover:bg-brand-50'
                                }`}>
                                {r.room_no}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">Reason (optional)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                placeholder="Reason for shift" />
            </label>
          </div>

          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50">
            <button onClick={handleShift} disabled={saving || !targetRoom}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-lg disabled:opacity-60 transition shadow-soft-blue">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Shift to {targetRoom || '…'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
