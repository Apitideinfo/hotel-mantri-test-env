import React from 'react';
import { AlertTriangle, ChevronRight, User } from 'lucide-react';
import type { BoardBooking } from './types';
import { extractUnassignedReason } from '@/lib/api-reservations';

interface UnassignedBookingsBannerProps {
  unassignedBookings: BoardBooking[];
  onSelectBooking: (booking: BoardBooking) => void;
}

export const UnassignedBookingsBanner: React.FC<UnassignedBookingsBannerProps> = ({
  unassignedBookings,
  onSelectBooking,
}) => {
  if (unassignedBookings.length === 0) return null;

  return (
    <div className="mx-4 sm:mx-6 mb-3 bg-amber-50/90 border border-amber-200/90 rounded-2xl p-3 shadow-2xs">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold text-amber-950">
            {unassignedBookings.length} Unallocated Online Reservation{unassignedBookings.length > 1 ? 's' : ''} (Action Required)
          </span>
        </div>
        <span className="text-[11px] font-semibold text-amber-800 hidden sm:inline">
          Click a reservation below to assign an available room
        </span>
      </div>

      <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
        {unassignedBookings.map((b) => {
          const reason = extractUnassignedReason(b.rawReservation);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onSelectBooking(b)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white border border-amber-300 text-xs text-slate-800 hover:bg-amber-100/50 transition shrink-0 shadow-2xs text-left cursor-pointer group"
            >
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse" />
              <div>
                <span className="font-bold text-slate-900 block group-hover:text-amber-900 transition">
                  {b.guestName || 'Guest'}
                </span>
                <span className="text-[11px] text-slate-500 block">
                  {b.checkIn} → {b.checkOut} ({b.nights}n)
                </span>
              </div>
              {reason && reason !== 'UNASSIGNED' ? (
                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">
                  {reason}
                </span>
              ) : (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-lg">
                  Assign Room
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
