import React, { useState, useMemo, useEffect } from 'react';
import {
  X, ArrowRight, BedDouble, Calendar, Users, DollarSign,
  AlertCircle, AlertTriangle, CheckCircle2, Loader2, Sparkles, ShieldAlert,
  ArrowRightLeft, Clock, Phone, Mail, Tag,
} from 'lucide-react';
import type { Room, RoomCategory, FrontOfficeRole } from '@/lib/types';
import type { BoardBooking } from './types';
import { groupRoomsByCategory, compareRoomNo } from '@/lib/types';
import { fmtMoney, calcStayNights, addDays, toNum } from '@/lib/calc';
import { brand } from '@/lib/theme';

export interface RoomMovePayload {
  booking: BoardBooking;
  targetRoomNo: string;
  targetCheckIn: string;
  targetCheckOut: string;
  newRate?: number;
  reason?: string;
}

interface RoomMoveModalProps {
  payload: RoomMovePayload;
  rooms: Room[];
  categories: RoomCategory[];
  role: FrontOfficeRole | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (payload: RoomMovePayload) => Promise<void>;
}

export const RoomMoveModal: React.FC<RoomMoveModalProps> = ({
  payload,
  rooms,
  categories,
  role,
  saving,
  error: parentError,
  onClose,
  onConfirm,
}) => {
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  const { booking } = payload;
  const [targetRoomNo, setTargetRoomNo] = useState(payload.targetRoomNo || booking.roomNo);
  const [targetCheckIn, setTargetCheckIn] = useState(payload.targetCheckIn || booking.checkIn);
  const [targetCheckOut, setTargetCheckOut] = useState(payload.targetCheckOut || booking.checkOut);
  const [customRate, setCustomRate] = useState<number>(booking.rate);
  const [reason, setReason] = useState(payload.reason || 'Guest requested room / date shift');
  const [localError, setLocalError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const activeRooms = useMemo(() => rooms.filter((r) => r.is_active), [rooms]);

  const originRoomData = useMemo(
    () => rooms.find((r) => r.room_no.trim().toLowerCase() === booking.roomNo.trim().toLowerCase()),
    [rooms, booking.roomNo],
  );
  const originCat = useMemo(
    () => categories.find((c) => c.id === originRoomData?.category_id),
    [categories, originRoomData],
  );

  const targetRoomData = useMemo(
    () => rooms.find((r) => r.room_no.trim().toLowerCase() === targetRoomNo.trim().toLowerCase()),
    [rooms, targetRoomNo],
  );
  const targetCat = useMemo(
    () => categories.find((c) => c.id === targetRoomData?.category_id),
    [categories, targetRoomData],
  );

  const newNights = useMemo(() => {
    return Math.max(1, calcStayNights(targetCheckIn, targetCheckOut));
  }, [targetCheckIn, targetCheckOut]);

  const newTotal = useMemo(() => {
    return customRate * newNights;
  }, [customRate, newNights]);

  const advancePaid = booking.type === 'reservation' ? toNum((booking.raw as any).advance_paid) : toNum((booking.raw as any).pay_advance);
  const newBalance = Math.max(0, newTotal - advancePaid);

  const isRoomChanged = targetRoomNo.trim().toLowerCase() !== booking.roomNo.trim().toLowerCase();
  const isDatesChanged = targetCheckIn !== booking.checkIn || targetCheckOut !== booking.checkOut;
  const isRateChanged = customRate !== booking.rate;

  const groupedRooms = useMemo(() => {
    const sorted = [...activeRooms].sort((a, b) => compareRoomNo(a.room_no, b.room_no));
    return groupRoomsByCategory(sorted, categories);
  }, [activeRooms, categories]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLocalError(null);

    if (!targetRoomNo || !targetRoomNo.trim()) {
      setLocalError('Please select a destination room.');
      return;
    }
    if (!targetCheckIn || !targetCheckOut) {
      setLocalError('Please select valid check-in and check-out dates.');
      return;
    }
    if (targetCheckIn >= targetCheckOut) {
      setLocalError('Check-out date must be strictly after check-in date.');
      return;
    }

    try {
      await onConfirm({
        booking,
        targetRoomNo: targetRoomNo.trim(),
        targetCheckIn,
        targetCheckOut,
        newRate: customRate,
        reason,
      });
    } catch (err: any) {
      setLocalError(err?.message || 'Failed to update booking');
    }
  };

  const statusBadge = useMemo(() => {
    const s = (booking.status || '').toLowerCase();
    const isCheckedIn = s === 'checked_in' || booking.type === 'entry';
    if (isCheckedIn) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Checked-In
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
        Confirmed
      </span>
    );
  }, [booking.status, booking.type]);

  const errorMessage = localError || parentError;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-50 transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Modal Dialog — Centered with comfortable viewport margins */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 pointer-events-none overflow-y-auto">
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-2xl max-h-[88vh] flex flex-col pointer-events-auto overflow-hidden animate-scale-in my-auto">
          
          {/* Header — Spacious Navy Banner */}
          <div className="px-5 sm:px-6 py-3.5 sm:py-4 bg-slate-900 text-white flex items-center justify-between shrink-0 shadow-xs border-b border-slate-800">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-400/30 flex items-center justify-center shrink-0">
                <ArrowRightLeft className="w-4.5 h-4.5 text-blue-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base font-bold text-white tracking-tight leading-tight">
                    {booking.type === 'entry' || booking.status === 'checked_in'
                      ? 'Shift Room & Stay Adjustment'
                      : 'Move / Shift Reservation'}
                  </h2>
                  {statusBadge}
                </div>
                <p className="text-[11px] sm:text-xs text-slate-300 font-medium mt-0.5 truncate">
                  Guest: <strong className="text-white">{booking.guestName || 'Guest'}</strong> · Room {booking.roomNo} · Ref #{booking.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0 ml-2"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Form */}
          <form onSubmit={handleSave} className="flex-1 overflow-y-auto modal-scroll px-5 sm:px-6 py-3.5 sm:py-4 space-y-3.5 sm:space-y-4">
            {errorMessage && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm rounded-xl p-3 flex items-center gap-2.5 shadow-2xs">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-semibold">{errorMessage}</span>
              </div>
            )}

            {/* Current vs Target Comparison Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Origin */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Current Stay</span>
                  <span className="text-[10px] font-bold text-slate-700 bg-slate-200/70 px-1.5 py-0.5 rounded">{booking.nights} Night{booking.nights > 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs sm:text-sm mb-0.5">
                  <BedDouble className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>Room {booking.roomNo || 'TBD'}</span>
                  {originCat && <span className="text-[11px] font-normal text-slate-500">({originCat.name})</span>}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-600 mt-1">
                  <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>{booking.checkIn} → {booking.checkOut}</span>
                </div>
              </div>

              {/* Destination */}
              <div className={`p-3 rounded-xl border flex flex-col justify-between transition-colors ${
                isRoomChanged || isDatesChanged
                  ? 'bg-blue-50/80 border-blue-200 text-blue-950'
                  : 'bg-slate-50 border-slate-200/90 text-slate-900'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-blue-600" /> Target Destination
                  </span>
                  <span className="text-[10px] font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">
                    {newNights} Night{newNights > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-blue-950 font-bold text-xs sm:text-sm mb-0.5">
                  <BedDouble className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Room {targetRoomNo}</span>
                  {targetCat && <span className="text-[11px] font-semibold text-blue-700">({targetCat.name})</span>}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-blue-800 font-medium mt-1">
                  <Calendar className="w-3 h-3 text-blue-600 shrink-0" />
                  <span>{targetCheckIn} → {targetCheckOut}</span>
                </div>
              </div>
            </div>

            {/* Target Room Selection Grid */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Select Destination Room <span className="text-rose-500">*</span>
              </label>
              <div className="max-h-36 overflow-y-auto modal-scroll border border-slate-200 rounded-xl p-2.5 bg-slate-50/50 space-y-2">
                {groupedRooms.map((group) => {
                  const isCurrentGroup = group.cat?.id === originCat?.id;
                  return (
                    <div key={group.cat?.id ?? '__uncat'}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                          {group.cat?.name ?? 'Standard Rooms'}
                        </span>
                        {isCurrentGroup && (
                          <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded">
                            Same Category
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                        {group.rooms.map((r) => {
                          const isSelected = targetRoomNo === r.room_no;
                          const isCurrent = booking.roomNo === r.room_no;
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => setTargetRoomNo(r.room_no)}
                              className={`px-2 py-1.5 text-xs rounded-lg font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-600 text-white shadow-xs shadow-blue-500/20 scale-[1.02]'
                                  : isCurrent
                                  ? 'bg-slate-200 text-slate-700 border border-slate-300'
                                  : 'bg-white text-slate-700 border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50'
                              }`}
                            >
                              <span>{r.room_no}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dates & Tariff Adjustments */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Check-In Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={targetCheckIn}
                  onChange={(e) => setTargetCheckIn(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs sm:text-sm font-semibold border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Check-Out Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={targetCheckOut}
                  onChange={(e) => setTargetCheckOut(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs sm:text-sm font-semibold border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Rate / Night (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={customRate}
                  onChange={(e) => setCustomRate(Math.max(0, toNum(e.target.value)))}
                  className="w-full px-2.5 py-1.5 text-xs sm:text-sm font-bold border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>
            </div>

            {/* Live Financial Summary */}
            <div className="p-3 rounded-xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Calculated Total</span>
                <span className="text-base sm:text-lg font-black text-white">₹{fmtMoney(newTotal)}</span>
                <span className="text-[11px] text-slate-400 ml-1.5 font-medium">({newNights} nights @ ₹{fmtMoney(customRate)})</span>
              </div>
              <div className="flex items-center gap-3 text-right">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Advance Paid</span>
                  <span className="text-xs sm:text-sm font-bold text-emerald-400">₹{fmtMoney(advancePaid)}</span>
                </div>
                <div className="border-l border-slate-700 pl-3">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Balance Due</span>
                  <span className={`text-xs sm:text-sm font-black ${newBalance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    ₹{fmtMoney(newBalance)}
                  </span>
                </div>
              </div>
            </div>

            {/* Reason / Notes */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Reason for Move / Modification
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Guest requested AC upgrade, extended holiday stay, etc."
                className="w-full px-2.5 py-1.5 text-xs sm:text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
              />
            </div>
          </form>

          {/* Footer Actions */}
          <div className="px-5 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs sm:text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={saving || !targetRoomNo}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs sm:text-sm font-extrabold rounded-xl shadow-md shadow-blue-500/20 transition disabled:opacity-60 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Changes…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm Move & Save</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
