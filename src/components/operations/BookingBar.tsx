import React from 'react';
import {
  Wallet, Banknote, Smartphone, Star, AlertCircle,
  CreditCard, Sparkles, GripVertical, ArrowRightLeft,
} from 'lucide-react';
import type { BoardBooking } from './types';
import type { Reservation } from '@/lib/types-reservations';
import { VIP_BADGE_COLORS } from '@/lib/types-crm';
import { fmtMoney, toNum } from '@/lib/calc';

interface BookingBarProps {
  booking: BoardBooking;
  onClick: () => void;
  isStart?: boolean;
  isEnd?: boolean;
  isStretching?: boolean;
  isMoving?: boolean;
  onMouseDownMove?: (e: React.MouseEvent) => void;
  onMouseDownStretchRight?: (e: React.MouseEvent) => void;
  onMouseDownStretchLeft?: (e: React.MouseEvent) => void;
}

const SOURCE_COLORS: Record<string, string> = {
  'OTA': 'bg-sky-500',
  'Direct/Walking': 'bg-emerald-500',
  'Corporate/Agent': 'bg-indigo-600',
  'Phonebook': 'bg-amber-500',
};

const STATUS_COLORS: Record<string, string> = {
  occupied: 'bg-emerald-500',
  vacant: 'bg-slate-300',
  complimentary: 'bg-amber-500',
  confirmed: 'bg-brand-600',
  checked_in: 'bg-emerald-500',
  checked_out: 'bg-slate-400',
  cancelled: 'bg-rose-500',
  no_show: 'bg-rose-600',
};

const STATUS_TEXT_COLORS: Record<string, string> = {
  occupied: 'text-emerald-800',
  vacant: 'text-slate-500',
  complimentary: 'text-amber-800',
  confirmed: 'text-brand-800',
  checked_in: 'text-emerald-800',
  checked_out: 'text-slate-500',
  cancelled: 'text-rose-700',
  no_show: 'text-rose-700',
};

const PAY_INDICATOR: Record<string, { icon: typeof Wallet; color: string; label: string }> = {
  Cash: { icon: Wallet, color: 'text-emerald-600', label: 'Cash' },
  Bank: { icon: Banknote, color: 'text-brand-navy-600', label: 'Bank' },
  UPI: { icon: Smartphone, color: 'text-brand-600', label: 'UPI' },
  Card: { icon: CreditCard, color: 'text-amber-600', label: 'Card' },
};

export const BookingBar: React.FC<BookingBarProps> = ({
  booking,
  onClick,
  isStart = false,
  isEnd = false,
  isStretching = false,
  isMoving = false,
  onMouseDownMove,
  onMouseDownStretchRight,
  onMouseDownStretchLeft,
}) => {
  const sourceColor = SOURCE_COLORS[booking.sourceCategory] ?? 'bg-slate-400';
  const statusColor = STATUS_COLORS[booking.status] ?? 'bg-slate-400';
  const statusText = STATUS_TEXT_COLORS[booking.status] ?? 'text-slate-700';
  const payInfo = PAY_INDICATOR[booking.paymentMode];
  const total = booking.rate * booking.nights;
  const advance = booking.type === 'reservation' ? toNum((booking.raw as Reservation).advance_paid) : toNum((booking.raw as any).pay_advance);
  const balance = Math.max(0, total - advance);

  const canEdit = booking.status !== 'cancelled' && booking.status !== 'no_show';
  const canExtend = canEdit && booking.status !== 'checked_out';

  return (
    <div
      className={`relative group/bar mb-1 select-none transition-all ${
        isMoving
          ? 'opacity-40 scale-95 ring-2 ring-brand-500 rounded-xl'
          : isStretching
          ? 'opacity-50 ring-2 ring-emerald-500 rounded-xl'
          : ''
      }`}
    >
      <div
        onClick={onClick}
        onMouseDown={(e) => {
          // If clicked directly on the body, start move drag if provided
          if (onMouseDownMove && e.button === 0) {
            onMouseDownMove(e);
          }
        }}
        title={`${booking.guestName || 'Guest'} · ${booking.sourceName || booking.sourceCategory} · ₹${fmtMoney(booking.rate)}/night · ${booking.status.replace('_', ' ').toUpperCase()}${balance >= 1.0 ? ` · Due ₹${fmtMoney(balance)}` : ''}\n(Drag card to move room/dates, drag right edge to extend stay)`}
        className={`w-full text-left rounded-xl p-1.5 transition-all duration-150 relative group border bg-white cursor-grab active:cursor-grabbing overflow-hidden ${
          booking.status === 'checked_in' || booking.status === 'occupied'
            ? 'border-emerald-200/90 shadow-2xs hover:border-emerald-400 hover:shadow-md'
            : booking.status === 'confirmed'
            ? 'border-brand-200/90 shadow-2xs hover:border-brand-400 hover:shadow-md'
            : 'border-slate-200/90 shadow-2xs hover:border-slate-400 hover:shadow-md'
        }`}
      >
        {/* Source indicator vertical bar */}
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl ${sourceColor}`} />

        <div className="pl-1.5 pr-3">
          {/* Guest Name & Status */}
          <div className="flex items-center gap-1 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full ${statusColor} shrink-0 animate-pulse`} />
            <span className={`font-black text-xs truncate tracking-tight ${statusText}`}>
              {booking.guestName || 'Guest'}
            </span>
            {booking.vipType && (
              <span className={`ml-0.5 inline-flex items-center gap-0.5 text-[8px] px-1 py-0 rounded font-black border shrink-0 ${VIP_BADGE_COLORS[booking.vipType] ?? 'bg-slate-100 text-slate-600 border-slate-300'}`}>
                <Star className="w-2 h-2 text-amber-500 fill-amber-500" />
                <span>{booking.vipType}</span>
              </span>
            )}
          </div>

          {/* Source, Rate & Due Badge */}
          <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500 flex-wrap font-medium">
            <span className="truncate text-slate-600 font-semibold max-w-[75px]">
              {booking.sourceName || booking.sourceCategory}
            </span>

            {payInfo && booking.hasPayment && (
              <span className={`flex items-center ${payInfo.color}`} title={`Paid via ${payInfo.label}`}>
                <payInfo.icon className="w-2.5 h-2.5" />
              </span>
            )}

            {booking.isComplimentary ? (
              <span className="text-amber-800 font-black bg-amber-50 px-1 py-0.2 rounded border border-amber-200 text-[9px]">
                COMP
              </span>
            ) : (
              <span className="text-slate-900 font-black">₹{fmtMoney(booking.rate)}</span>
            )}

            {balance >= 1.0 && !booking.isComplimentary && (
              <span className="text-rose-700 font-black bg-rose-50 border border-rose-200/90 px-1 py-0.2 rounded text-[9px]">
                Due ₹{fmtMoney(balance)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Left interactive handle for adjusting check-in date */}
      {isStart && onMouseDownStretchLeft && canEdit && (
        <div
          onMouseDown={(e) => {
            e.stopPropagation();
            onMouseDownStretchLeft(e);
          }}
          className="absolute left-0 top-0 bottom-1 w-3.5 cursor-ew-resize flex items-center justify-center bg-slate-100/90 hover:bg-brand-600 text-slate-400 hover:text-white rounded-l-xl z-30 transition-all group/handle shadow-2xs border-r border-slate-200 hover:border-brand-600 opacity-0 group-hover/bar:opacity-100"
          title="Drag left/right to adjust check-in date"
        >
          <div className="flex flex-col gap-0.5 items-center justify-center pointer-events-none">
            <span className="w-0.5 h-2 rounded-full bg-current opacity-80" />
          </div>
        </div>
      )}

      {/* Right interactive handle for stay extension / check-out date */}
      {isEnd && onMouseDownStretchRight && canExtend && (
        <div
          onMouseDown={(e) => {
            e.stopPropagation();
            onMouseDownStretchRight(e);
          }}
          className="absolute right-0 top-0 bottom-1 w-4.5 cursor-ew-resize flex items-center justify-center bg-slate-100/90 hover:bg-emerald-600 text-slate-400 hover:text-white rounded-r-xl z-30 transition-all group/handle shadow-2xs border-l border-slate-200 hover:border-emerald-600"
          title="Drag right/left to resize stay duration"
        >
          <div className="flex flex-col gap-0.5 items-center justify-center pointer-events-none">
            <span className="w-1 h-1 rounded-full bg-current opacity-70 group-hover/handle:opacity-100" />
            <span className="w-1 h-1 rounded-full bg-current opacity-70 group-hover/handle:opacity-100" />
            <span className="w-1 h-1 rounded-full bg-current opacity-70 group-hover/handle:opacity-100" />
          </div>
        </div>
      )}
    </div>
  );
};
