import React, { useState, useEffect } from 'react';
import { X, Calendar, BedDouble, AlertCircle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import type { Reservation } from '@/lib/types-reservations';
import { assignPhysicalRoom, extendReservation, checkInReservation, checkRoomAvailability } from '@/lib/api-reservations';

// ── 1. Assign Physical Room Modal ──

interface AssignRoomModalProps {
  reservation: Reservation;
  rooms: { room_no: string; category: string }[];
  onClose: () => void;
  onSuccess: (updated: Reservation) => void;
}

export const AssignRoomModal: React.FC<AssignRoomModalProps> = ({
  reservation,
  rooms,
  onClose,
  onSuccess,
}) => {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const [selectedRoom, setSelectedRoom] = useState(
    reservation.room_no && reservation.room_no.toLowerCase() !== 'unassigned' && reservation.room_no.toLowerCase() !== 'tbd'
      ? reservation.room_no
      : ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom) {
      setError('Please choose a physical room to assign.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await assignPhysicalRoom(reservation.id, selectedRoom);
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to assign room due to conflict.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-scale-in">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-brand-gold-400">
              <BedDouble className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Assign Physical Room</h3>
              <p className="text-xs text-slate-400">
                {reservation.guest_name} · {reservation.check_in_date} to {reservation.check_out_date}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Select Physical Room *</label>
            <select
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              required
            >
              <option value="">Select a room…</option>
              {rooms.map((r) => (
                <option key={r.room_no} value={r.room_no}>
                  Room {r.room_no} ({r.category})
                </option>
              ))}
            </select>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-[11px] text-slate-500 space-y-1">
            <p className="font-semibold text-slate-700">Stay Duration:</p>
            <p>{reservation.check_in_date} to {reservation.check_out_date} ({reservation.nights || 1} nights)</p>
            <p className="text-[10px] text-slate-400">System validates zero overlap on all occupied nights before saving.</p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-soft-blue transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Confirm Assignment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── 2. Extend Stay Modal ──

interface ExtendStayModalProps {
  reservation: Reservation;
  onClose: () => void;
  onSuccess: (updated: Reservation) => void;
}

export const ExtendStayModal: React.FC<ExtendStayModalProps> = ({
  reservation,
  onClose,
  onSuccess,
}) => {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const [newCheckOut, setNewCheckOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentCheckOut = reservation.check_out_date;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCheckOut) {
      setError('Please select a new check-out date.');
      return;
    }
    if (newCheckOut <= currentCheckOut) {
      setError(`New check-out date must be after current check-out date (${currentCheckOut}).`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const updated = await extendReservation({
        reservationId: reservation.id,
        newCheckOut,
      });
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to extend stay due to room conflict.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-scale-in">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-brand-gold-400">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Extend Stay</h3>
              <p className="text-xs text-slate-400">
                Room {reservation.room_no || 'Unassigned'} · {reservation.guest_name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Check-In:</span>
              <span className="font-bold text-slate-900">{reservation.check_in_date}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Current Check-Out:</span>
              <span className="font-bold text-slate-900">{reservation.check_out_date}</span>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">New Extended Check-Out Date *</label>
            <input
              type="date"
              min={currentCheckOut}
              value={newCheckOut}
              onChange={(e) => setNewCheckOut(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Extension
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
