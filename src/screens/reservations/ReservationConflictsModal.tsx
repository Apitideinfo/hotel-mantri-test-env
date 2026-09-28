import React, { useState } from 'react';
import { X, AlertTriangle, ArrowRight, BedDouble, Calendar, User, CheckCircle2, RefreshCw } from 'lucide-react';
import type { Reservation } from '@/lib/types-reservations';
import { assignPhysicalRoom, updateReservationStatus, checkRoomAvailability } from '@/lib/api-reservations';

interface ConflictItem {
  type: string;
  roomNo: string;
  reservationA: Reservation | { id: string; guest_name?: string; guestName?: string; check_in_date?: string; checkIn?: string; check_out_date?: string; checkOut?: string; status?: string };
  reservationB: Reservation | { id: string; guest_name?: string; guestName?: string; check_in_date?: string; checkIn?: string; check_out_date?: string; checkOut?: string; status?: string };
}

interface ReservationConflictsModalProps {
  conflicts: ConflictItem[];
  availableRooms: { room_no: string; category: string }[];
  onClose: () => void;
  onResolved: () => void;
}

export const ReservationConflictsModal: React.FC<ReservationConflictsModalProps> = ({
  conflicts,
  availableRooms,
  onClose,
  onResolved,
}) => {
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const getGuest = (r: any) => r.guest_name || r.guestName || 'Guest';
  const getDates = (r: any) => `${r.check_in_date || r.checkIn} → ${r.check_out_date || r.checkOut}`;

  const handleReassign = async (resId: string, targetRoom: string) => {
    if (!targetRoom) {
      setError('Please select a room to reassign.');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await assignPhysicalRoom(resId, targetRoom);
      setSuccessMsg(`Reservation reassigned to Room ${targetRoom} successfully.`);
      setResolvingId(null);
      setSelectedRoom('');
      onResolved();
    } catch (err: any) {
      setError(err?.message || 'Failed to reassign room.');
    } finally {
      setBusy(false);
    }
  };

  const handleMakeUnassigned = async (resId: string) => {
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await assignPhysicalRoom(resId, 'Unassigned');
      setSuccessMsg('Reservation moved to Unassigned status.');
      setResolvingId(null);
      onResolved();
    } catch (err: any) {
      setError(err?.message || 'Failed to update reservation.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancelBooking = async (resId: string) => {
    if (!window.confirm('Are you sure you want to cancel this conflicting reservation?')) return;
    setBusy(true);
    setError(null);
    try {
      await updateReservationStatus(resId, 'cancelled');
      setSuccessMsg('Reservation cancelled.');
      onResolved();
    } catch (err: any) {
      setError(err?.message || 'Failed to cancel reservation.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-scale-in">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Reservation Conflicts Review</h3>
              <p className="text-xs text-slate-400">
                {conflicts.length} physical room conflict{conflicts.length > 1 ? 's' : ''} detected
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {conflicts.length === 0 ? (
            <div className="p-8 text-center text-slate-500 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold text-slate-800">No Active Physical Room Conflicts Found</p>
              <p className="text-xs text-slate-400">All physical rooms have independent non-overlapping stays.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                The following active reservations are occupying overlapping dates on the same physical room. Use the resolution actions below to assign a vacant room or move to unassigned.
              </p>

              {conflicts.map((c, idx) => {
                const a = c.reservationA as any;
                const b = c.reservationB as any;
                return (
                  <div key={idx} className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                        <BedDouble className="w-4 h-4 text-brand-600" />
                        Room {c.roomNo} Overlap Conflict
                      </span>
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 font-bold text-[10px] rounded-full">
                        Requires Resolution
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {/* Booking A */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-1.5">
                        <div className="flex items-center justify-between font-bold text-slate-900">
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-400" /> {getGuest(a)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">#{a.id?.slice(0, 6)}</span>
                        </div>
                        <p className="text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" /> {getDates(a)}
                        </p>
                        <div className="pt-2 flex items-center gap-2">
                          <button
                            onClick={() => setResolvingId(resolvingId === a.id ? null : a.id)}
                            className="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 text-[11px] font-bold rounded-lg transition"
                          >
                            Reassign Room
                          </button>
                          <button
                            onClick={() => handleMakeUnassigned(a.id)}
                            disabled={busy}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg transition"
                          >
                            Unassign
                          </button>
                          <button
                            onClick={() => handleCancelBooking(a.id)}
                            disabled={busy}
                            className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 text-[11px] font-semibold rounded-lg transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>

                      {/* Booking B */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-1.5">
                        <div className="flex items-center justify-between font-bold text-slate-900">
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-400" /> {getGuest(b)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">#{b.id?.slice(0, 6)}</span>
                        </div>
                        <p className="text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" /> {getDates(b)}
                        </p>
                        <div className="pt-2 flex items-center gap-2">
                          <button
                            onClick={() => setResolvingId(resolvingId === b.id ? null : b.id)}
                            className="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 text-[11px] font-bold rounded-lg transition"
                          >
                            Reassign Room
                          </button>
                          <button
                            onClick={() => handleMakeUnassigned(b.id)}
                            disabled={busy}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg transition"
                          >
                            Unassign
                          </button>
                          <button
                            onClick={() => handleCancelBooking(b.id)}
                            disabled={busy}
                            className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 text-[11px] font-semibold rounded-lg transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Inline Reassignment Selector */}
                    {resolvingId && (resolvingId === a.id || resolvingId === b.id) && (
                      <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl flex items-center gap-3 flex-wrap animate-fadeIn text-xs">
                        <span className="font-bold text-sky-900">Choose new room:</span>
                        <select
                          value={selectedRoom}
                          onChange={(e) => setSelectedRoom(e.target.value)}
                          className="px-3 py-1.5 border border-sky-300 rounded-lg bg-white font-medium text-slate-800 focus:outline-none"
                        >
                          <option value="">Select available room…</option>
                          {availableRooms
                            .filter((rm) => rm.room_no !== c.roomNo)
                            .map((rm) => (
                              <option key={rm.room_no} value={rm.room_no}>
                                Room {rm.room_no} ({rm.category})
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={() => handleReassign(resolvingId, selectedRoom)}
                          disabled={busy || !selectedRoom}
                          className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg transition disabled:opacity-50"
                        >
                          Confirm Reassignment
                        </button>
                        <button
                          onClick={() => { setResolvingId(null); setSelectedRoom(''); }}
                          className="px-2 py-1 text-slate-500 hover:text-slate-700 font-semibold"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
