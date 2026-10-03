import React from 'react';
import {
  Plus, LogIn, LogOut, Sliders, FileText, Wallet,
  ArrowRightLeft, CalendarPlus, X, User, BedDouble,
  CreditCard, ChevronRight, CheckCircle2, MoreHorizontal,
} from 'lucide-react';
import type { BoardBooking } from './types';
import { fmtMoney, toNum } from '@/lib/calc';

interface OperationsActionsProps {
  selectedBooking: BoardBooking | null;
  onClearSelection: () => void;
  onNewReservation: () => void;
  onWalkIn: () => void;
  onAdjustAvailability: () => void;
  onDailyEntry: () => void;
  onCheckIn: (booking: BoardBooking) => void;
  onCheckOut: (booking: BoardBooking) => void;
  onCollectPayment: (booking: BoardBooking) => void;
  onRoomShift: (booking: BoardBooking) => void;
  onExtendStay: (booking: BoardBooking) => void;
  onViewDetails: (booking: BoardBooking) => void;
}

export const OperationsActions: React.FC<OperationsActionsProps> = ({
  selectedBooking,
  onClearSelection,
  onNewReservation,
  onWalkIn,
  onAdjustAvailability,
  onDailyEntry,
  onCheckIn,
  onCheckOut,
  onCollectPayment,
  onRoomShift,
  onExtendStay,
  onViewDetails,
}) => {
  const total = selectedBooking ? selectedBooking.rate * selectedBooking.nights : 0;
  const advance = selectedBooking && selectedBooking.type === 'reservation'
    ? toNum((selectedBooking.raw as any).advance_paid)
    : 0;
  const balance = Math.max(0, total - advance);

  return (
    <div className="bg-white border-b border-slate-200/90 px-4 sm:px-6 py-2.5 transition-all">
      {selectedBooking ? (
        /* Contextual Selected Booking Action Dock */
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900 text-white p-3 sm:px-4 sm:py-2.5 rounded-2xl shadow-lg border border-slate-800 animate-slide-up">
          {/* Selected Booking Summary */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30 flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm font-bold text-white truncate max-w-[180px] sm:max-w-xs">
                  {selectedBooking.guestName || 'Guest'}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-brand-500/30 text-brand-300 border border-brand-500/40 uppercase tracking-wider">
                  Room {selectedBooking.roomNo}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  {selectedBooking.sourceName || selectedBooking.sourceCategory}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-300 mt-0.5">
                <span>{selectedBooking.checkIn} → {selectedBooking.checkOut}</span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-300 font-medium">{selectedBooking.nights} Night{selectedBooking.nights > 1 ? 's' : ''}</span>
                {balance >= 1.0 && !selectedBooking.isComplimentary && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span className="text-amber-400 font-bold bg-amber-950/80 px-1.5 py-0.2 rounded border border-amber-800/80">
                      Due ₹{fmtMoney(balance)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Contextual Action Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            {selectedBooking.status === 'confirmed' && (
              <button
                type="button"
                onClick={() => onCheckIn(selectedBooking)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-sm transition active:scale-95 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Check-In</span>
              </button>
            )}

            {(selectedBooking.status === 'checked_in' || selectedBooking.status === 'occupied') && (
              <button
                type="button"
                onClick={() => onCheckOut(selectedBooking)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl shadow-sm transition active:scale-95 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Check-Out</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onCollectPayment(selectedBooking)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl shadow-sm transition active:scale-95 cursor-pointer"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Folio & Pay</span>
            </button>

            {(selectedBooking.status === 'checked_in' || selectedBooking.status === 'occupied') && (
              <>
                <button
                  type="button"
                  onClick={() => onRoomShift(selectedBooking)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition active:scale-95 cursor-pointer"
                  title="Shift to Another Room"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Shift</span>
                </button>

                <button
                  type="button"
                  onClick={() => onExtendStay(selectedBooking)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition active:scale-95 cursor-pointer"
                  title="Extend Stay Dates"
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Extend</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => onViewDetails(selectedBooking)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition active:scale-95 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Details</span>
            </button>

            <button
              type="button"
              onClick={onClearSelection}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer ml-1"
              title="Deselect Booking"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* Default Primary Front-Desk Actions Bar */
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* New Reservation Button */}
            <button
              type="button"
              onClick={onNewReservation}
              className="flex items-center gap-2 h-9 px-4 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl shadow-soft-blue transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Reservation</span>
            </button>

            {/* Walk-In Button */}
            <button
              type="button"
              onClick={onWalkIn}
              className="flex items-center gap-2 h-9 px-3.5 bg-brand-navy-600 hover:bg-brand-navy-700 text-white text-xs font-bold rounded-xl shadow-sm transition active:scale-95 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Walk-In</span>
            </button>

            {/* Adjust Availability */}
            <button
              type="button"
              onClick={onAdjustAvailability}
              className="flex items-center gap-2 h-9 px-3.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 text-xs font-bold rounded-xl shadow-2xs transition active:scale-95 cursor-pointer"
              title="Adjust sellable inventory & channel restrictions"
            >
              <Sliders className="w-4 h-4 text-indigo-600" />
              <span>Adjust Availability</span>
            </button>

            {/* Daily Entry */}
            <button
              type="button"
              onClick={onDailyEntry}
              className="flex items-center gap-2 h-9 px-3.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200/80 shadow-2xs transition active:scale-95 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-slate-500" />
              <span>Daily Entry</span>
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
            <span>Select any booking card for instant front-desk workflows or drag edge to extend stay</span>
          </div>
        </div>
      )}
    </div>
  );
};
