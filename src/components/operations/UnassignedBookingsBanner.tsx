import React from 'react';
import { AlertTriangle, ChevronRight, User, Calendar, Sparkles, ArrowRight } from 'lucide-react';
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
    <div className="mx-4 sm:mx-6 mb-3 bg-gradient-to-r from-amber-500/10 via-amber-50 to-orange-500/10 border border-amber-300/90 rounded-2xl p-3.5 shadow-sm max-w-[1920px] mx-auto animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
            <AlertTriangle className="w-4 h-4 stroke-[2.5]" />
          </div>
          <div>
            <span className="text-xs sm:text-sm font-black text-amber-950 tracking-tight block">
              {unassignedBookings.length} Unallocated Online Reservation{unassignedBookings.length > 1 ? 's' : ''} (Action Required)
            </span>
            <span className="text-[11px] font-semibold text-amber-800/90">
              Direct or OTA bookings requiring immediate physical room allocation.
            </span>
          </div>
        </div>

        <span className="text-[11px] font-bold text-amber-900 bg-amber-200/70 border border-amber-300/80 px-2.5 py-1 rounded-lg shrink-0 self-start sm:self-center">
          Click reservation below to assign room
        </span>
      </div>

      <div className="flex items-center gap-3 overflow-x-auto pb-1 pt-0.5">
        {unassignedBookings.map((b) => {
          const reason = extractUnassignedReason(b.rawReservation);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onSelectBooking(b)}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-white border border-amber-200/90 text-xs text-slate-800 hover:border-amber-400 hover:shadow-md hover:bg-amber-50/40 transition-all shrink-0 shadow-2xs text-left cursor-pointer group"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 animate-ping" />
              <div>
                <div className="font-extrabold text-slate-900 text-xs tracking-tight group-hover:text-amber-900 transition flex items-center gap-1.5">
                  <span>{b.guestName || 'Guest'}</span>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                    {b.sourceName || b.sourceCategory}
                  </span>
                </div>
                <div className="text-[11px] font-medium text-slate-500 mt-0.5 flex items-center gap-1">
                  <span>{b.checkIn} → {b.checkOut}</span>
                  <span className="text-slate-300">•</span>
                  <span className="font-bold text-slate-700">{b.nights}n</span>
                </div>
              </div>

              {reason && reason !== 'UNASSIGNED' ? (
                <span className="text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded-lg shrink-0">
                  {reason}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-800 bg-amber-100 group-hover:bg-amber-200 border border-amber-200 px-2.5 py-1 rounded-lg shrink-0 transition">
                  <span>Assign Room</span>
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
