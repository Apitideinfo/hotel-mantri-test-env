import React, { useState, useRef, useEffect } from 'react';
import {
  Wallet, Banknote, Smartphone, Star, AlertCircle,
  CreditCard, Sparkles, GripVertical, ArrowRightLeft,
  MoreVertical, CheckCircle2, LogIn, LogOut, Receipt,
  Clock, ArrowUpRight, ArrowDownLeft, ShieldCheck, ChevronRight,
} from 'lucide-react';
import type { BoardBooking } from './types';
import type { Reservation } from '@/lib/types-reservations';
import { VIP_BADGE_COLORS } from '@/lib/types-crm';
import { fmtMoney, fmtInt, toNum } from '@/lib/calc';

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
  onQuickAction?: (action: 'checkin' | 'checkout' | 'folio' | 'shift' | 'extend' | 'details', booking: BoardBooking) => void;
}

interface SourceBadgeConfig {
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  railColor: string;
}

const getSourceBadge = (sourceName?: string, sourceCat?: string): SourceBadgeConfig => {
  const s = (sourceName || sourceCat || '').toLowerCase().trim();
  
  if (s.includes('makemytrip') || s.includes('mmt')) {
    return { label: 'MMT', badgeBg: 'bg-rose-50', badgeText: 'text-rose-700', badgeBorder: 'border-rose-200', railColor: 'bg-rose-500' };
  }
  if (s.includes('goibibo') || s.includes('ibibo')) {
    return { label: 'Goibibo', badgeBg: 'bg-orange-50', badgeText: 'text-orange-700', badgeBorder: 'border-orange-200', railColor: 'bg-orange-500' };
  }
  if (s.includes('agoda')) {
    return { label: 'Agoda', badgeBg: 'bg-emerald-50', badgeText: 'text-emerald-800', badgeBorder: 'border-emerald-300', railColor: 'bg-emerald-600' };
  }
  if (s.includes('cleartrip')) {
    return { label: 'Cleartrip', badgeBg: 'bg-sky-50', badgeText: 'text-sky-800', badgeBorder: 'border-sky-300', railColor: 'bg-sky-500' };
  }
  if (s.includes('booking')) {
    return { label: 'Booking.com', badgeBg: 'bg-blue-50', badgeText: 'text-blue-800', badgeBorder: 'border-blue-300', railColor: 'bg-blue-600' };
  }
  if (s.includes('travelguru')) {
    return { label: 'Travelguru', badgeBg: 'bg-amber-50', badgeText: 'text-amber-800', badgeBorder: 'border-amber-300', railColor: 'bg-amber-500' };
  }
  if (s.includes('airbnb')) {
    return { label: 'Airbnb', badgeBg: 'bg-pink-50', badgeText: 'text-pink-700', badgeBorder: 'border-pink-300', railColor: 'bg-pink-500' };
  }
  if (s.includes('direct') || s.includes('walk')) {
    return { label: 'Direct', badgeBg: 'bg-teal-50', badgeText: 'text-teal-800', badgeBorder: 'border-teal-300', railColor: 'bg-teal-600' };
  }
  if (s.includes('corporate') || s.includes('agent') || s.includes('company')) {
    return { label: 'Corporate', badgeBg: 'bg-indigo-50', badgeText: 'text-indigo-800', badgeBorder: 'border-indigo-300', railColor: 'bg-indigo-600' };
  }
  if (s.includes('phone')) {
    return { label: 'Phone', badgeBg: 'bg-violet-50', badgeText: 'text-violet-800', badgeBorder: 'border-violet-300', railColor: 'bg-violet-600' };
  }

  // Fallback
  const display = sourceName && sourceName.length <= 10 ? sourceName : sourceCat || 'OTA';
  return { label: display, badgeBg: 'bg-slate-100', badgeText: 'text-slate-700', badgeBorder: 'border-slate-200', railColor: 'bg-slate-500' };
};

const STATUS_CONFIG: Record<string, {
  dot: string;
  beaconRing: string;
  border: string;
  hoverBorder: string;
  cardBg: string;
  text: string;
  statusLabel: string;
  avatarBg: string;
}> = {
  occupied: {
    dot: 'bg-emerald-500',
    beaconRing: 'ring-emerald-300/60',
    border: 'border-emerald-300/90',
    hoverBorder: 'hover:border-emerald-500 hover:shadow-emerald-100/60',
    cardBg: 'bg-gradient-to-br from-emerald-50/90 via-white to-emerald-50/40',
    text: 'text-emerald-950',
    statusLabel: 'In-House',
    avatarBg: 'bg-emerald-600 text-white',
  },
  checked_in: {
    dot: 'bg-emerald-500',
    beaconRing: 'ring-emerald-300/60',
    border: 'border-emerald-300/90',
    hoverBorder: 'hover:border-emerald-500 hover:shadow-emerald-100/60',
    cardBg: 'bg-gradient-to-br from-emerald-50/90 via-white to-emerald-50/40',
    text: 'text-emerald-950',
    statusLabel: 'In-House',
    avatarBg: 'bg-emerald-600 text-white',
  },
  confirmed: {
    dot: 'bg-indigo-600',
    beaconRing: 'ring-indigo-300/60',
    border: 'border-indigo-200/90',
    hoverBorder: 'hover:border-indigo-500 hover:shadow-indigo-100/60',
    cardBg: 'bg-gradient-to-br from-indigo-50/80 via-white to-blue-50/30',
    text: 'text-indigo-950',
    statusLabel: 'Reserved',
    avatarBg: 'bg-indigo-600 text-white',
  },
  complimentary: {
    dot: 'bg-purple-600',
    beaconRing: 'ring-purple-300/60',
    border: 'border-purple-200/90',
    hoverBorder: 'hover:border-purple-500 hover:shadow-purple-100/60',
    cardBg: 'bg-gradient-to-br from-purple-50/90 via-white to-purple-50/40',
    text: 'text-purple-950',
    statusLabel: 'Comp',
    avatarBg: 'bg-purple-600 text-white',
  },
  checked_out: {
    dot: 'bg-slate-400',
    beaconRing: 'ring-slate-300/40',
    border: 'border-slate-200',
    hoverBorder: 'hover:border-slate-400 hover:shadow-slate-100',
    cardBg: 'bg-slate-50/90',
    text: 'text-slate-700',
    statusLabel: 'Checked Out',
    avatarBg: 'bg-slate-500 text-white',
  },
  cancelled: {
    dot: 'bg-rose-500',
    beaconRing: 'ring-rose-300/50',
    border: 'border-rose-200',
    hoverBorder: 'hover:border-rose-400',
    cardBg: 'bg-rose-50/50',
    text: 'text-rose-950',
    statusLabel: 'Cancelled',
    avatarBg: 'bg-rose-600 text-white',
  },
  no_show: {
    dot: 'bg-rose-600',
    beaconRing: 'ring-rose-300/50',
    border: 'border-rose-300',
    hoverBorder: 'hover:border-rose-500',
    cardBg: 'bg-rose-50/60',
    text: 'text-rose-950',
    statusLabel: 'No Show',
    avatarBg: 'bg-rose-700 text-white',
  },
};

const PAY_INDICATOR: Record<string, { icon: typeof Wallet; color: string; label: string }> = {
  Cash: { icon: Wallet, color: 'text-emerald-600', label: 'Cash' },
  Bank: { icon: Banknote, color: 'text-indigo-600', label: 'Bank' },
  UPI: { icon: Smartphone, color: 'text-blue-600', label: 'UPI' },
  Card: { icon: CreditCard, color: 'text-amber-600', label: 'Card' },
};

// Extract clean initials from guest name
const getInitials = (name: string): string => {
  if (!name) return 'G';
  const clean = name.replace(/^(mr\.|mrs\.|ms\.|dr\.|prof\.)\s*/i, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'G';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
  onQuickAction,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const sourceBadge = getSourceBadge(booking.sourceName, booking.sourceCategory);
  const statusCfg = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG.confirmed;
  const payInfo = PAY_INDICATOR[booking.paymentMode];
  
  const total = booking.rate * booking.nights;
  const advance = booking.type === 'reservation' ? toNum((booking.raw as Reservation).advance_paid) : toNum((booking.raw as any).pay_advance);
  const balance = Math.max(0, total - advance);

  const canEdit = booking.status !== 'cancelled' && booking.status !== 'no_show';
  const canExtend = canEdit && booking.status !== 'checked_out';

  const isSingleDay = Boolean(isStart && isEnd);
  const isMultiDay = !isSingleDay;
  const initials = getInitials(booking.guestName);

  // Determine seamless multi-day spanning styles
  const cardShapeClasses = isSingleDay
    ? 'rounded-xl p-1.5'
    : isStart && !isEnd
    ? 'rounded-l-xl rounded-r-none border-r-0 -mr-[9px] z-[2] p-1.5 pr-2'
    : !isStart && !isEnd
    ? 'rounded-none border-x-0 -mx-[9px] z-[2] p-1.5 px-2'
    : 'rounded-r-xl rounded-l-none border-l-0 -ml-[9px] z-[2] p-1.5 pl-2';

  return (
    <div
      className={`relative group/bar mb-1.5 select-none transition-all duration-150 ${
        isMoving
          ? 'opacity-40 scale-95 ring-2 ring-indigo-500 rounded-xl'
          : isStretching
          ? 'opacity-50 ring-2 ring-emerald-500 rounded-xl'
          : ''
      }`}
    >
      <div
        onClick={onClick}
        onMouseDown={(e) => {
          if (onMouseDownMove && e.button === 0 && !(e.target as HTMLElement).closest('.action-menu-btn')) {
            onMouseDownMove(e);
          }
        }}
        title={`${booking.guestName || 'Guest'} · ${booking.sourceName || booking.sourceCategory} · ${booking.nights} Night${booking.nights > 1 ? 's' : ''} (₹${fmtInt(total)}) · ${statusCfg.statusLabel}${balance >= 1.0 ? ` · Due ₹${fmtInt(balance)}` : ' · Fully Settled'}\n(Drag card to move room/dates, drag right edge to extend stay)`}
        className={`w-full min-h-[56px] flex flex-col justify-between text-left transition-all duration-200 relative group border ${statusCfg.cardBg} cursor-grab active:cursor-grabbing shadow-2xs hover:shadow-md ${statusCfg.border} ${statusCfg.hoverBorder} ${cardShapeClasses}`}
      >
        {/* Source / Status Left Ribbon (Only on Start or Single Day) */}
        {(isStart || isSingleDay) && (
          <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${sourceBadge.railColor}`} />
        )}

        {/* ── CASE A: Single Day Card ── */}
        {isSingleDay ? (
          <div className="pl-1 pr-0.5 flex flex-col justify-between h-full gap-1">
            {/* Top Row: Avatar Initial + Guest Name + VIP + Menu */}
            <div className="flex items-center gap-1.5 min-w-0">
              <div className={`w-4 h-4 rounded-md flex items-center justify-center text-[8.5px] font-black shrink-0 shadow-2xs ${statusCfg.avatarBg}`}>
                {initials}
              </div>

              <span className={`font-black text-[11px] truncate tracking-tight flex-1 min-w-0 group-hover/bar:text-brand-700 transition-colors ${statusCfg.text}`}>
                {booking.guestName || 'Guest'}
              </span>

              {booking.vipType && (
                <span className={`inline-flex items-center gap-0.5 text-[7.5px] px-1 py-0.2 rounded font-black border shrink-0 ${VIP_BADGE_COLORS[booking.vipType] ?? 'bg-amber-100 text-amber-900 border-amber-300'}`}>
                  <Star className="w-2 h-2 text-amber-500 fill-amber-500" />
                  <span>{booking.vipType}</span>
                </span>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu((prev) => !prev);
                }}
                className="action-menu-btn p-0.5 text-slate-400 hover:text-slate-800 rounded hover:bg-slate-200/60 transition cursor-pointer opacity-0 group-hover/bar:opacity-100 shrink-0"
                title="Quick Actions"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Bottom Row: Source Pill + Rate / Due Status */}
            <div className="flex items-center justify-between gap-1 text-[10px] text-slate-500 font-semibold min-w-0">
              <span className={`px-1.5 py-0.2 rounded font-extrabold text-[8.5px] border shadow-2xs tracking-wide shrink-0 ${sourceBadge.badgeBg} ${sourceBadge.badgeText} ${sourceBadge.badgeBorder}`}>
                {sourceBadge.label}
              </span>

              <div className="flex items-center gap-1 shrink-0 ml-auto min-w-0">
                {booking.isComplimentary ? (
                  <span className="text-purple-900 font-black bg-purple-100 px-1.5 py-0.2 rounded border border-purple-300 text-[8.5px] shadow-2xs">
                    COMP
                  </span>
                ) : balance >= 1.0 ? (
                  <span className="text-rose-700 font-black bg-rose-50 border border-rose-200/90 px-1.5 py-0.2 rounded text-[8.5px] tracking-tight shadow-2xs whitespace-nowrap">
                    Due ₹{fmtInt(balance)}
                  </span>
                ) : (
                  <span className="text-slate-900 font-black text-[10.5px] tracking-tight whitespace-nowrap">
                    ₹{fmtInt(booking.rate)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : isStart && !isEnd ? (
          /* ── CASE B: Multi-Day Start Day (Spacious & Clean) ── */
          <div className="pl-1 pr-1.5 flex flex-col justify-between h-full gap-1">
            {/* Top Row: Avatar Initial + Full Guest Name + Stay Length Badge */}
            <div className="flex items-center gap-1.5 min-w-0">
              <div className={`w-4 h-4 rounded-md flex items-center justify-center text-[8.5px] font-black shrink-0 shadow-2xs ${statusCfg.avatarBg}`}>
                {initials}
              </div>

              <span className={`font-black text-[11.5px] truncate tracking-tight flex-1 min-w-0 group-hover/bar:text-brand-700 transition-colors ${statusCfg.text}`}>
                {booking.guestName || 'Guest'}
              </span>

              <span className="text-[8px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded shrink-0 shadow-2xs" title={`${booking.nights} Nights Stay`}>
                {booking.nights}N
              </span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu((prev) => !prev);
                }}
                className="action-menu-btn p-0.5 text-slate-400 hover:text-slate-800 rounded hover:bg-slate-200/60 transition cursor-pointer opacity-0 group-hover/bar:opacity-100 shrink-0"
                title="Quick Actions"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Bottom Row: Source Badge + Nightly Tariff */}
            <div className="flex items-center justify-between gap-1 text-[10px] text-slate-500 font-semibold min-w-0">
              <span className={`px-1.5 py-0.2 rounded font-extrabold text-[8.5px] border shadow-2xs tracking-wide shrink-0 ${sourceBadge.badgeBg} ${sourceBadge.badgeText} ${sourceBadge.badgeBorder}`}>
                {sourceBadge.label}
              </span>

              <div className="flex items-center gap-1 shrink-0 ml-auto">
                {booking.isComplimentary ? (
                  <span className="text-purple-900 font-black bg-purple-100 px-1.5 py-0.2 rounded border border-purple-300 text-[8.5px] shadow-2xs">
                    COMP
                  </span>
                ) : (
                  <span className="text-slate-900 font-black text-[10px] tracking-tight whitespace-nowrap">
                    ₹{fmtInt(booking.rate)}/nt
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : !isStart && !isEnd ? (
          /* ── CASE C: Multi-Day Intermediate Bridge ── */
          <div className="flex flex-col justify-between h-full gap-1 px-1.5">
            <div className="flex items-center justify-between gap-1 pt-0.5">
              <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider">
                Stay Active
              </span>
              <span className="text-[8px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/80 shrink-0 shadow-2xs">
                In-House
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[8.5px] font-bold text-slate-400 pb-0.5">
              <div className="h-px flex-1 bg-slate-300/70" />
              <span className="text-[8.5px] tracking-widest text-slate-400 font-black">••••</span>
              <div className="h-px flex-1 bg-slate-300/70" />
            </div>
          </div>
        ) : (
          /* ── CASE D: Multi-Day End / Departure Cap ── */
          <div className="flex flex-col justify-between h-full gap-1 pl-1.5 pr-2">
            {/* Top Row: Departure Label + Out Badge */}
            <div className="flex items-center justify-between gap-1 pt-0.5">
              <span className="text-[8.5px] font-black text-slate-500 uppercase tracking-wider">
                Departure
              </span>
              <span className="text-[8px] font-black text-amber-800 bg-amber-100/90 px-1.5 py-0.2 rounded border border-amber-300 shrink-0 flex items-center gap-0.5 shadow-2xs" title="Check-Out Day">
                <ArrowUpRight className="w-2.5 h-2.5" /> Out
              </span>
            </div>

            {/* Bottom Row: Total Tariff + Payment Due / Paid */}
            <div className="flex items-center justify-between gap-1 text-[9.5px] font-bold pb-0.5 min-w-0">
              <span className="text-slate-700 font-extrabold text-[9.5px] truncate">
                ₹{fmtInt(total)}
              </span>

              {booking.isComplimentary ? (
                <span className="text-purple-900 font-black bg-purple-100 px-1.5 py-0.2 rounded border border-purple-300 text-[8px] shadow-2xs">
                  COMP
                </span>
              ) : balance >= 1.0 ? (
                <span className="text-rose-700 font-black bg-rose-50 border border-rose-200/90 px-1.5 py-0.2 rounded text-[8.5px] tracking-tight shadow-2xs whitespace-nowrap">
                  Due ₹{fmtInt(balance)}
                </span>
              ) : (
                <span className="text-emerald-700 font-black bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded text-[8px] shadow-2xs flex items-center gap-0.5">
                  <CheckCircle2 className="w-2 h-2" /> Paid
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick Action Dropdown Popover */}
      {showMenu && (
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-7 z-40 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 py-1.5 min-w-[170px] animate-scale-in text-xs font-semibold backdrop-blur-md"
        >
          <div className="px-3 py-1 border-b border-slate-800 text-[10px] text-slate-400 font-bold truncate">
            {booking.guestName || 'Guest'} · Room {booking.roomNo}
          </div>
          
          <button
            type="button"
            onClick={() => {
              setShowMenu(false);
              onClick();
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-800 flex items-center gap-2 text-slate-200 hover:text-white transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-brand-400" />
            <span>View Full Details</span>
          </button>

          {onQuickAction && (
            <>
              {booking.status === 'confirmed' && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    onQuickAction('checkin', booking);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-emerald-950/80 flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Quick Check-In</span>
                </button>
              )}

              {(booking.status === 'checked_in' || booking.status === 'occupied') && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    onQuickAction('checkout', booking);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-amber-950/80 flex items-center gap-2 text-amber-400 hover:text-amber-300 transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Check-Out Guest</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  onQuickAction('folio', booking);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 flex items-center gap-2 text-slate-300 hover:text-white transition cursor-pointer"
              >
                <Receipt className="w-3.5 h-3.5 text-indigo-400" />
                <span>Guest Folio & Pay</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  onQuickAction('shift', booking);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 flex items-center gap-2 text-slate-300 hover:text-white transition cursor-pointer"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-blue-400" />
                <span>Shift Room / Dates</span>
              </button>

              {canExtend && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    onQuickAction('extend', booking);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-800 flex items-center gap-2 text-slate-300 hover:text-white transition cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Extend Stay</span>
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Left interactive handle for adjusting check-in date */}
      {isStart && onMouseDownStretchLeft && canEdit && (
        <div
          onMouseDown={(e) => {
            e.stopPropagation();
            onMouseDownStretchLeft(e);
          }}
          className="absolute left-0 top-0 bottom-1 w-3.5 cursor-ew-resize flex items-center justify-center bg-slate-100/95 hover:bg-indigo-600 text-slate-400 hover:text-white rounded-l-xl z-30 transition-all group/handle shadow-2xs border-r border-slate-200 hover:border-indigo-600 opacity-0 group-hover/bar:opacity-100"
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
          className="absolute right-0 top-0 bottom-1 w-4 cursor-ew-resize flex items-center justify-center bg-slate-100/95 hover:bg-emerald-600 text-slate-400 hover:text-white rounded-r-xl z-30 transition-all group/handle shadow-2xs border-l border-slate-200 hover:border-emerald-600 opacity-0 group-hover/bar:opacity-100"
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
