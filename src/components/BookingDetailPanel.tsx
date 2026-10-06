import { useState, useMemo, useEffect } from 'react';
import {
  X, Phone, Mail, BedDouble, Calendar, MoonStar, IndianRupee,
  Wallet, Banknote, Smartphone, CreditCard, Edit3, LogIn, LogOut,
  FileText, MessageCircle, Trash2, AlertCircle, Loader2, MapPin,
  Users, UtensilsCrossed, Receipt, Clock, User, Building2,
  ArrowRight, CalendarPlus, Printer, Download, Sparkles, CheckCircle2,
  PhoneCall, ExternalLink, ShieldCheck, Tag, Star,
} from 'lucide-react';
import type {
  RoomChartEntry, RoomChartEntryInput, HotelSettings,
  CompanySource, RoomCategory, Room, SourceCategory, PayMode, MealPlan, GstType, GstSlab,
  FrontOfficeRole,
} from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { GST_TYPES, GST_SLABS, MEAL_PLANS, SOURCE_CATEGORIES, canCheckoutAnyway, canRoomShift, canDeleteBooking, normalizePayMode } from '@/lib/types';
import type { Reservation, ReservationInput } from '@/lib/types-reservations';
import { fmtMoney, fmtInt, toNum, calcGstFull, calcStayNights } from '@/lib/calc';
import { classifyCompany } from '@/lib/api';
import {
  getReservationConfirmationData,
  sendReservationConfirmationEmail,
  openWhatsAppConfirmation,
  extractUnassignedReason,
} from '@/lib/api-reservations';
import {
  downloadReservationConfirmationPdf,
  printReservationConfirmationPdf,
} from '@/lib/pdf-reservation';
import { VIP_BADGE_COLORS } from '@/lib/types-crm';

export interface BoardBooking {
  id: string;
  type: 'entry' | 'reservation';
  roomNo: string;
  guestName: string;
  sourceCategory: string;
  sourceName: string;
  status: string;
  paymentMode: string;
  checkIn: string;
  checkOut: string;
  rate: number;
  nights: number;
  phone: string;
  email: string;
  remarks: string;
  isComplimentary: boolean;
  hasPayment: boolean;
  vipType: string;
  raw: RoomChartEntry | Reservation;
  rawReservation?: Reservation | null;
  rawEntry?: RoomChartEntry | null;
}

interface BookingDetailPanelProps {
  booking: BoardBooking;
  settings: HotelSettings | null;
  sources: CompanySource[];
  categories: RoomCategory[];
  rooms: Room[];
  date: string;
  role: FrontOfficeRole | null;
  saving: boolean;
  onClose: () => void;
  onEditEntry: (row: RoomChartEntryInput, existingId?: string) => void;
  onDeleteEntry: (id: string) => void;
  onEditReservation: (input: ReservationInput, id?: string) => void;
  onDeleteReservation: (id: string) => void;
  onCheckIn: (booking: BoardBooking) => void;
  onCheckOut: (booking: BoardBooking) => void;
  onRoomShift: (booking: BoardBooking) => void;
  onExtendStay: (booking: BoardBooking) => void;
  onViewFolio: (booking: BoardBooking) => void;
  onSaved?: () => void;
}

const fmtDate = (d: string): string => {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const STATUS_CONFIG: Record<string, { label: string; badge: string; dot: string }> = {
  occupied: { label: 'In-House (Occupied)', badge: 'bg-emerald-50 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500' },
  checked_in: { label: 'In-House (Checked In)', badge: 'bg-emerald-50 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500' },
  confirmed: { label: 'Confirmed Reservation', badge: 'bg-indigo-50 text-indigo-800 border-indigo-300', dot: 'bg-indigo-600' },
  complimentary: { label: 'Complimentary Stay', badge: 'bg-purple-50 text-purple-800 border-purple-300', dot: 'bg-purple-600' },
  checked_out: { label: 'Checked Out', badge: 'bg-slate-100 text-slate-700 border-slate-300', dot: 'bg-slate-500' },
  cancelled: { label: 'Cancelled', badge: 'bg-rose-50 text-rose-800 border-rose-300', dot: 'bg-rose-600' },
  no_show: { label: 'No Show', badge: 'bg-rose-50 text-rose-800 border-rose-300', dot: 'bg-rose-600' },
};

const getInitials = (name: string): string => {
  if (!name) return 'G';
  const clean = name.replace(/^(mr\.|mrs\.|ms\.|dr\.|prof\.)\s*/i, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'G';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const BookingDetailPanel = ({
  booking, settings, sources, categories, rooms, date, role, saving,
  onClose, onEditEntry, onDeleteEntry, onEditReservation, onDeleteReservation,
  onCheckIn, onCheckOut, onRoomShift, onExtendStay, onViewFolio, onSaved,
}: BookingDetailPanelProps) => {
  const [editMode, setEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [groupReservations, setGroupReservations] = useState<Reservation[]>([]);
  const [loadingGroup, setLoadingGroup] = useState(false);

  useEffect(() => {
    let active = true;
    const rawRes = booking.rawReservation || (booking.type === 'reservation' ? booking.raw as Reservation : null);
    const groupId = rawRes?.group_id;
    const currentResId = rawRes?.id || booking.id;
    if (groupId && groupId.trim() !== '') {
      setLoadingGroup(true);
      (async () => {
        try {
          const { data, error } = await supabase
            .from('reservations')
            .select('*')
            .eq('group_id', groupId);
          if (!active) return;
          if (!error && data && data.length > 0) {
            const isPhysical = (rm?: string | null) => {
              const norm = (rm || '').trim().toLowerCase();
              return Boolean(norm && norm !== 'unassigned' && norm !== 'tbd');
            };
            const list = data as Reservation[];
            const seenPhysical = new Set<string>();
            const seenIds = new Set<string>();
            const unique: Reservation[] = [];

            // If currentResId exists in list, prioritize it
            const currentItem = list.find((r) => r.id === currentResId);
            if (currentItem) {
              if (isPhysical(currentItem.room_no)) {
                seenPhysical.add((currentItem.room_no || '').trim().toLowerCase());
              }
              seenIds.add(currentItem.id);
              unique.push(currentItem);
            }

            for (const r of list) {
              if (r.id === currentResId) continue;
              const norm = (r.room_no || '').trim().toLowerCase();
              if (isPhysical(r.room_no)) {
                if (seenPhysical.has(norm)) continue;
                seenPhysical.add(norm);
              } else {
                if (seenIds.has(r.id)) continue;
                seenIds.add(r.id);
              }
              unique.push(r);
            }

            // Natural sort by room number
            unique.sort((a, b) => (a.room_no || '').localeCompare(b.room_no || '', undefined, { numeric: true }));

            setGroupReservations(unique.length > 1 ? unique : []);
          } else {
            setGroupReservations([]);
          }
        } catch {
          if (active) setGroupReservations([]);
        } finally {
          if (active) setLoadingGroup(false);
        }
      })();
    } else {
      setGroupReservations([]);
    }
    return () => {
      active = false;
    };
  }, [booking]);

  // Background body scroll lock while modal is open
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  const room = useMemo(
    () => rooms.find((r) => r.room_no.trim().toLowerCase() === booking.roomNo.trim().toLowerCase()),
    [rooms, booking.roomNo],
  );
  const category = useMemo(
    () => categories.find((c) => c.id === room?.category_id),
    [categories, room],
  );

  const isReservation = booking.type === 'reservation';
  const reservation = isReservation ? booking.raw as Reservation : null;
  const entry = !isReservation ? booking.raw as RoomChartEntry : null;

  // Document action state
  const [activeDocAction, setActiveDocAction] = useState<'pdf' | 'print' | 'email' | 'whatsapp' | null>(null);
  const [docSuccess, setDocSuccess] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  const targetResId = reservation?.id || booking.id;

  const handleDocPdf = async () => {
    if (activeDocAction) return;
    setActiveDocAction('pdf');
    setDocError(null);
    setDocSuccess(null);
    try {
      const data = await getReservationConfirmationData(targetResId);
      downloadReservationConfirmationPdf({
        reservation: data.reservation,
        settings: data.hotel as any,
      });
      setDocSuccess('Confirmation PDF downloaded.');
    } catch (err: any) {
      setDocError(err.message || 'Failed to generate confirmation PDF.');
    } finally {
      setActiveDocAction(null);
      setTimeout(() => setDocSuccess(null), 4000);
    }
  };

  const handleDocPrint = async () => {
    if (activeDocAction) return;
    setActiveDocAction('print');
    setDocError(null);
    setDocSuccess(null);
    try {
      const data = await getReservationConfirmationData(targetResId);
      printReservationConfirmationPdf({
        reservation: data.reservation,
        settings: data.hotel as any,
      });
      setDocSuccess('Print dialog opened.');
    } catch (err: any) {
      setDocError(err.message || 'Failed to print confirmation.');
    } finally {
      setActiveDocAction(null);
      setTimeout(() => setDocSuccess(null), 4000);
    }
  };

  const handleDocEmail = async () => {
    if (activeDocAction) return;
    setActiveDocAction('email');
    setDocError(null);
    setDocSuccess(null);
    try {
      const data = await getReservationConfirmationData(targetResId);
      const res = await sendReservationConfirmationEmail(data);
      setDocSuccess(res.message || 'Confirmation email dispatched.');
    } catch (err: any) {
      setDocError(err.message || 'Failed to send confirmation email.');
    } finally {
      setActiveDocAction(null);
      setTimeout(() => setDocSuccess(null), 5000);
    }
  };

  const handleDocWhatsApp = () => {
    const cleanPhone = (booking.phone || '').replace(/\D/g, '');
    if (!cleanPhone) {
      setDocError('Guest has no valid phone number for WhatsApp.');
      setTimeout(() => setDocError(null), 4000);
      return;
    }
    const msg = `Dear ${booking.guestName},\n\nYour reservation details at ${settings?.hotel_name || 'Hotel Mantri'}:\n🏨 Room: ${booking.roomNo} (${category?.name || 'Room'})\n📅 Check-In: ${fmtDate(booking.checkIn)}\n📅 Check-Out: ${fmtDate(booking.checkOut)}\n🌙 Nights: ${booking.nights}\n💰 Rate: ₹${fmtInt(booking.rate)}/night\n💵 Total: ₹${fmtInt(booking.rate * booking.nights)}\n\nWe look forward to hosting you!`;
    const waPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const isUnassigned = useMemo(() => {
    const r = String(booking.roomNo || '').trim().toLowerCase();
    return !r || r === 'unassigned' || r === 'tbd';
  }, [booking.roomNo]);

  const unassignedReason = useMemo(() => {
    return extractUnassignedReason(booking.rawReservation || booking.raw);
  }, [booking]);

  const [editGuest, setEditGuest] = useState(booking.guestName);
  const [editPhone, setEditPhone] = useState(booking.phone);
  const [editEmail, setEditEmail] = useState(booking.email);
  const [editCheckIn, setEditCheckIn] = useState(booking.checkIn);
  const [editCheckOut, setEditCheckOut] = useState(booking.checkOut);
  const [editRate, setEditRate] = useState(booking.rate);
  const [editSource, setEditSource] = useState(booking.sourceName);
  const [editSourceCat, setEditSourceCat] = useState(booking.sourceCategory);
  const [editPayMode, setEditPayMode] = useState(booking.paymentMode);
  const [editRemarks, setEditRemarks] = useState(booking.remarks);
  const [editAdvance, setEditAdvance] = useState(
    isReservation ? toNum(reservation?.advance_paid) : 0,
  );

  const editNights = useMemo(() => {
    return calcStayNights(editCheckIn, editCheckOut);
  }, [editCheckIn, editCheckOut]);

  const editTotal = editRate * editNights;
  const editBalance = isReservation ? editTotal - toNum(editAdvance) : Math.max(0, editTotal - 0);

  const handleSave = () => {
    if (isReservation && reservation) {
      onEditReservation({
        room_id: room?.id ?? null,
        room_no: booking.roomNo,
        guest_name: editGuest,
        guest_phone: editPhone,
        guest_email: editEmail,
        check_in_date: editCheckIn,
        check_out_date: editCheckOut,
        rate: editRate,
        source_category: editSourceCat as SourceCategory,
        source_name: editSource,
        payment_mode: editPayMode,
        advance_paid: editAdvance,
        remarks: editRemarks,
        status: reservation.status as Reservation['status'],
      }, reservation.id);
    } else if (entry) {
      const srcCat = classifyCompany(editSource, sources) as SourceCategory;
      onEditEntry({
        ...entry,
        guest_name: editGuest,
        arrival: editCheckIn,
        departure: editCheckOut,
        nights: editNights,
        room_rate: editRate,
        total: editTotal,
        company: editSource,
        source_category: srcCat,
        pay_mode: normalizePayMode(editPayMode),
        remarks: editRemarks,
        pay_advance: editAdvance,
        pay_balance: editBalance,
      }, entry.id);
    }
    setEditMode(false);
  };

  const handleDelete = () => {
    if (isReservation && reservation) {
      onDeleteReservation(reservation.id);
    } else if (entry) {
      onDeleteEntry(entry.id);
    }
    setShowDeleteConfirm(false);
    onClose();
  };

  const canCheckIn = isReservation && reservation?.status === 'confirmed';
  const canCheckOut = (booking.status === 'checked_in' || booking.status === 'occupied') || (isReservation && reservation?.status === 'checked_in');

  const statusCfg = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG.confirmed;
  const initials = getInitials(booking.guestName);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 transition-opacity" 
        onClick={onClose} 
      />

      {/* Centered Modal Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 pointer-events-none overflow-y-auto">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col pointer-events-auto border border-slate-200/90 overflow-hidden animate-scale-in my-auto">
          
          {/* Header */}
          <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white flex items-center justify-between shrink-0 shadow-xs">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-indigo-600/30 text-indigo-300 border border-indigo-400/30 flex items-center justify-center font-black text-sm shrink-0 shadow-inner">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-white truncate tracking-tight">
                    {editMode ? 'Edit Reservation' : (booking.guestName || 'Guest Details')}
                  </h2>
                  {booking.vipType && (
                    <span className={`inline-flex items-center gap-0.5 text-[8.5px] px-2 py-0.5 rounded-full font-black border shrink-0 ${VIP_BADGE_COLORS[booking.vipType] ?? 'bg-amber-100 text-amber-900 border-amber-300'}`}>
                      <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
                      <span>{booking.vipType}</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 font-medium flex items-center gap-1.5 mt-0.5">
                  <span className="font-bold text-white">Room {booking.roomNo}</span>
                  {category && <span>· {category.name}</span>}
                  <span>· {isReservation ? 'Advance Booking' : 'Checked-In Stay'}</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
              title="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Status Bar & Unassigned Alerts */}
          {!editMode && (
            <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between gap-2 flex-wrap shrink-0">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border shadow-2xs ${statusCfg.badge}`}>
                  <span className={`w-2 h-2 rounded-full ${statusCfg.dot} animate-pulse`} />
                  {statusCfg.label}
                </span>

                <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-full">
                  {booking.sourceName || booking.sourceCategory}
                </span>
              </div>

              {isUnassigned && unassignedReason && unassignedReason !== 'UNASSIGNED' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {unassignedReason}
                </span>
              )}
            </div>
          )}

          {/* Unassigned Warning Banner */}
          {!editMode && isUnassigned && (
            <div className="mx-6 mt-4 p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex items-center justify-between gap-3 shadow-2xs">
              <div className="min-w-0">
                <div className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Physical Room Not Assigned</span>
                </div>
                <div className="text-[11px] text-amber-800 mt-0.5">
                  {unassignedReason === 'NO_ELIGIBLE_ROOM' ? 'No active rooms found in this category' :
                   unassignedReason === 'ROOM_CATEGORY_NOT_MAPPED' ? 'Room category mapping required' :
                   unassignedReason === 'NO_ROOM_FOR_FULL_STAY' ? 'All category rooms are occupied on requested stay dates' :
                   'Please assign a physical room to complete front-office check-in.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRoomShift(booking)}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition shrink-0 cursor-pointer"
              >
                Assign Room
              </button>
            </div>
          )}

          {/* Toast feedback */}
          {docSuccess && (
            <div className="mx-6 mt-3 px-3.5 py-2 bg-emerald-50 text-emerald-900 text-xs font-bold rounded-xl border border-emerald-300 flex items-center justify-between shadow-2xs">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />{docSuccess}</span>
              <button onClick={() => setDocSuccess(null)} className="text-emerald-700 hover:text-emerald-950 font-black">✕</button>
            </div>
          )}
          {docError && (
            <div className="mx-6 mt-3 px-3.5 py-2 bg-rose-50 text-rose-900 text-xs font-bold rounded-xl border border-rose-300 flex items-center justify-between shadow-2xs">
              <span className="flex items-center gap-1.5"><AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />{docError}</span>
              <button onClick={() => setDocError(null)} className="text-rose-700 hover:text-rose-950 font-black">✕</button>
            </div>
          )}

          {/* Scrollable Modal Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-slate-50/40">
            {editMode ? (
              <EditFields
                guest={editGuest} setGuest={setEditGuest}
                phone={editPhone} setPhone={setEditPhone}
                email={editEmail} setEmail={setEditEmail}
                checkIn={editCheckIn} setCheckIn={setEditCheckIn}
                checkOut={editCheckOut} setCheckOut={setEditCheckOut}
                rate={editRate} setRate={setEditRate}
                nights={editNights} total={editTotal}
                source={editSource} setSource={setEditSource}
                sourceCat={editSourceCat} setSourceCat={setEditSourceCat}
                payMode={editPayMode} setPayMode={setEditPayMode}
                advance={editAdvance} setAdvance={setEditAdvance}
                balance={editBalance}
                remarks={editRemarks} setRemarks={setEditRemarks}
                sources={sources}
              />
            ) : (
              <ViewFields 
                booking={booking} 
                settings={settings} 
                category={category} 
                rooms={rooms}
                categories={categories}
                groupReservations={groupReservations}
                onWhatsApp={handleDocWhatsApp}
              />
            )}
          </div>

          {/* Footer Action Buttons */}
          <div className="px-6 py-4 border-t border-slate-200/90 bg-white space-y-3 shrink-0">
            {editMode ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl disabled:opacity-50 transition shadow-sm cursor-pointer"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode(false)}
                  className="px-5 py-2.5 text-xs text-slate-700 hover:bg-slate-100 rounded-xl font-bold transition border border-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                {/* Document Shortcuts Row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    Documents & Actions
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleDocPdf}
                      disabled={!!activeDocAction}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 flex items-center gap-1 transition cursor-pointer"
                      title="Download Confirmation PDF"
                    >
                      {activeDocAction === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" /> : <Download className="w-3.5 h-3.5 text-indigo-600" />}
                      <span>PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDocPrint}
                      disabled={!!activeDocAction}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 flex items-center gap-1 transition cursor-pointer"
                      title="Print Confirmation"
                    >
                      {activeDocAction === 'print' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-600" /> : <Printer className="w-3.5 h-3.5 text-slate-600" />}
                      <span>Print</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDocEmail}
                      disabled={!!activeDocAction}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 flex items-center gap-1 transition cursor-pointer"
                      title="Send Confirmation Email"
                    >
                      {activeDocAction === 'email' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" /> : <Mail className="w-3.5 h-3.5 text-sky-600" />}
                      <span>Email</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDocWhatsApp}
                      className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold border border-emerald-200 flex items-center gap-1 transition cursor-pointer"
                      title="Send WhatsApp Confirmation"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                </div>

                {/* Primary Operations Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  {canCheckIn && (
                    <button
                      type="button"
                      onClick={() => onCheckIn(booking)}
                      className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-sm transition active:scale-95 cursor-pointer"
                    >
                      <LogIn className="w-4 h-4" /> Check In
                    </button>
                  )}

                  {canCheckOut && (
                    <button
                      type="button"
                      onClick={() => onCheckOut(booking)}
                      className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-sm transition active:scale-95 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" /> Check Out
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onViewFolio(booking)}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 transition active:scale-95 cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-indigo-600" /> Folio & Billing
                  </button>

                  <button
                    type="button"
                    onClick={() => onRoomShift(booking)}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 transition active:scale-95 cursor-pointer"
                  >
                    <ArrowRight className="w-4 h-4 text-blue-600" /> Shift Room
                  </button>

                  <button
                    type="button"
                    onClick={() => onExtendStay(booking)}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 transition active:scale-95 cursor-pointer"
                  >
                    <CalendarPlus className="w-4 h-4 text-emerald-600" /> Extend Stay
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditMode(true)}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 transition active:scale-95 cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4 text-slate-600" /> Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold border border-rose-200 transition active:scale-95 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-rose-600" /> Cancel
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Delete confirmation modal */}
          {showDeleteConfirm && (
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
              <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full border border-slate-200 text-center">
                <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="text-base font-black text-slate-900">Cancel this Reservation?</h3>
                <p className="text-xs text-slate-500 mt-1 mb-5">
                  Are you sure you want to cancel the booking for <strong className="text-slate-800">{booking.guestName}</strong>? This will release Room {booking.roomNo} back to inventory.
                </p>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving}
                    className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-50 transition cursor-pointer"
                  >
                    {saving ? 'Cancelling…' : 'Yes, Cancel Booking'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-100 rounded-xl font-bold transition border border-slate-200 cursor-pointer"
                  >
                    Keep Booking
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ── View Fields Component (Rendered ONCE inside scrollable body) ──

const ViewFields = ({
  booking, settings, category, rooms = [], categories = [], groupReservations = [], onWhatsApp,
}: { 
  booking: BoardBooking; 
  settings: HotelSettings | null; 
  category?: RoomCategory;
  rooms?: Room[];
  categories?: RoomCategory[];
  groupReservations?: Reservation[];
  onWhatsApp: () => void;
}) => {
  const entry = booking.type === 'entry' ? booking.raw as RoomChartEntry : null;
  const reservation = booking.type === 'reservation' ? booking.raw as Reservation : null;

  // Auto-resolve rate if 0 from group siblings or category default
  const effectiveRate = booking.rate > 0 
    ? booking.rate 
    : (toNum(reservation?.rate) > 0 
      ? toNum(reservation?.rate) 
      : (groupReservations.find(r => r.id === (reservation?.id || booking.id))?.rate 
        ? toNum(groupReservations.find(r => r.id === (reservation?.id || booking.id))!.rate) 
        : (groupReservations[0]?.rate 
          ? toNum(groupReservations[0].rate) 
          : (category?.default_tariff ?? 0))));

  const total = effectiveRate * booking.nights;
  
  // Group calculations
  const isGroup = groupReservations.length > 1;
  const groupTotalTariff = isGroup 
    ? groupReservations.reduce((sum, r) => {
        const rRate = toNum(r.rate) > 0 ? toNum(r.rate) : effectiveRate;
        const rNights = toNum(r.nights) || booking.nights;
        return sum + (rRate * rNights);
      }, 0)
    : total;

  const groupTotalAdvance = isGroup
    ? groupReservations.reduce((sum, r) => sum + toNum(r.advance_paid), 0)
    : (entry
      ? toNum(entry.pay_cash) + toNum(entry.pay_upi) + toNum(entry.pay_card) + toNum(entry.pay_bank)
      : reservation ? toNum(reservation.advance_paid) : 0);

  const groupTotalBalance = Math.max(0, groupTotalTariff - groupTotalAdvance);

  const advance = entry
    ? toNum(entry.pay_cash) + toNum(entry.pay_upi) + toNum(entry.pay_card) + toNum(entry.pay_bank)
    : reservation ? toNum(reservation.advance_paid) : 0;
  const balance = Math.max(0, total - advance);

  const gstAmount = entry ? toNum(entry.gst_amount) : reservation ? toNum(reservation.gst_amount) : 0;
  const gstType = entry?.gst_type ?? reservation?.gst_type ?? 'No Scope';
  const mealPlan = entry?.meal_plan ?? reservation?.meal_plan ?? 'EP';
  const adults = reservation?.adults ?? 1;
  const children = reservation?.children ?? 0;

  return (
    <div className="space-y-4">
      {/* ── Multi-Room Group Booking Card ── */}
      {isGroup && (
        <div className="bg-gradient-to-br from-indigo-50/90 via-white to-blue-50/60 rounded-2xl p-4 border border-indigo-200/90 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-indigo-100">
            <div className="flex items-center gap-2">
              <BedDouble className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-black uppercase text-indigo-950 tracking-wider">
                Multi-Room Group Booking ({groupReservations.length} Rooms)
              </span>
            </div>
            <span className="text-[10px] font-black bg-indigo-600 text-white px-2.5 py-0.5 rounded-full shadow-2xs">
              {groupReservations.length} Rooms Linked
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {groupReservations.map((r) => {
              const isCurrent = r.id === (reservation?.id || booking.id) || (Boolean(r.room_no) && r.room_no.trim().toLowerCase() === booking.roomNo.trim().toLowerCase());
              const rRoom = rooms.find(rm => rm.room_no === r.room_no);
              const rCat = categories.find(c => c.id === rRoom?.category_id);
              const rNights = toNum(r.nights) || booking.nights;
              const rRate = toNum(r.rate) > 0 ? toNum(r.rate) : effectiveRate;
              const rSubtotal = rRate * rNights;

              return (
                <div
                  key={r.id}
                  className={`p-2.5 rounded-xl border transition ${
                    isCurrent
                      ? 'bg-white border-indigo-500 shadow-xs ring-2 ring-indigo-500/20'
                      : 'bg-slate-50/80 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-xs text-slate-900">Room {r.room_no || 'Unassigned'}</span>
                      {isCurrent && (
                        <span className="text-[8px] font-black bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded border border-indigo-200">
                          Active Selection
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 capitalize">
                      {r.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1 font-semibold">
                    <span>{rCat?.name || 'Category'}</span>
                    <span className="font-extrabold text-slate-900">₹{fmtInt(rRate)}/nt · ₹{fmtInt(rSubtotal)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Group Financial Summary Header */}
          <div className="bg-white rounded-xl p-3 border border-indigo-100 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 block">Total Group Stay</span>
              <span className="font-black text-slate-900 text-xs sm:text-sm">₹{fmtInt(groupTotalTariff)}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 block">Total Advance Paid</span>
              <span className="font-black text-emerald-700 text-xs sm:text-sm">₹{fmtInt(groupTotalAdvance)}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 block">Group Balance Due</span>
              <span className={`font-black text-xs sm:text-sm ${groupTotalBalance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                ₹{fmtInt(groupTotalBalance)}
              </span>
            </div>
          </div>
        </div>
      )}
      {/* 1. Guest & Contact Card */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-black uppercase text-slate-700 tracking-wider">Guest Information</span>
          </div>
          {booking.phone && (
            <button
              type="button"
              onClick={onWhatsApp}
              className="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1 transition cursor-pointer"
            >
              <MessageCircle className="w-3 h-3" /> WhatsApp
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-slate-400 font-medium block text-[11px]">Full Name</span>
            <span className="font-extrabold text-slate-900 text-sm">{booking.guestName || '—'}</span>
          </div>
          <div>
            <span className="text-slate-400 font-medium block text-[11px]">Phone / Mobile</span>
            <span className="font-bold text-slate-900">{booking.phone || '—'}</span>
          </div>
          <div>
            <span className="text-slate-400 font-medium block text-[11px]">Email Address</span>
            <span className="font-bold text-slate-800 truncate block">{booking.email || '—'}</span>
          </div>
          {reservation?.guest_address && (
            <div>
              <span className="text-slate-400 font-medium block text-[11px]">Address</span>
              <span className="font-medium text-slate-700 truncate block">{reservation.guest_address}</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Stay & Room Timeline Card */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <Calendar className="w-4 h-4 text-sky-600" />
          <span className="text-xs font-black uppercase text-slate-700 tracking-wider">Stay & Room Details</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-slate-400 font-medium block text-[10px]">Room Allocated</span>
            <span className="font-black text-slate-900 text-sm">Room {booking.roomNo}</span>
            <span className="text-[10px] text-slate-500 font-medium block truncate">{category?.name || 'Category'}</span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-slate-400 font-medium block text-[10px]">Check-In</span>
            <span className="font-bold text-slate-900">{fmtDate(booking.checkIn)}</span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-slate-400 font-medium block text-[10px]">Check-Out</span>
            <span className="font-bold text-slate-900">{fmtDate(booking.checkOut)}</span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-slate-400 font-medium block text-[10px]">Stay Duration</span>
            <span className="font-black text-indigo-700">{booking.nights} Night{booking.nights > 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1 text-xs">
          <div>
            <span className="text-slate-400 font-medium block text-[11px]">Guests</span>
            <span className="font-bold text-slate-800">{adults} Adult{adults > 1 ? 's' : ''}{children > 0 ? ` · ${children} Child` : ''}</span>
          </div>
          <div>
            <span className="text-slate-400 font-medium block text-[11px]">Meal Plan</span>
            <span className="font-bold text-slate-800">{mealPlan}</span>
          </div>
          <div>
            <span className="text-slate-400 font-medium block text-[11px]">Booking Source</span>
            <span className="font-bold text-slate-800">{booking.sourceName || booking.sourceCategory || 'Direct'}</span>
          </div>
        </div>
      </div>

      {/* 3. Tariff & Financial Breakdown */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <IndianRupee className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-black uppercase text-slate-700 tracking-wider">Charges & Payment</span>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Nightly Rate</span>
            <span className="font-extrabold text-slate-900">₹{fmtInt(booking.rate)}/night</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Stay Subtotal ({booking.nights} nights)</span>
            <span className="font-bold text-slate-900">₹{fmtInt(total)}</span>
          </div>

          {gstType !== 'No Scope' && gstAmount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">GST ({gstType})</span>
              <span className="font-bold text-slate-700">₹{fmtInt(gstAmount)}</span>
            </div>
          )}

          <div className="flex items-center justify-between py-2 border-t border-slate-200">
            <span className="font-extrabold text-slate-900 text-sm">Invoice Total</span>
            <span className="font-black text-slate-900 text-sm">₹{fmtInt(total + gstAmount)}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Advance Received ({booking.paymentMode || 'Cash'})</span>
            <span className="font-extrabold text-emerald-700">₹{fmtInt(advance)}</span>
          </div>

          {/* Balance Pill */}
          <div className={`flex items-center justify-between p-2.5 rounded-xl border ${
            balance >= 1.0 
              ? 'bg-rose-50 border-rose-300 text-rose-900' 
              : 'bg-emerald-50 border-emerald-300 text-emerald-900'
          }`}>
            <span className="font-black">{balance >= 1.0 ? 'Balance Due' : 'Payment Status'}</span>
            <span className="font-black text-sm">
              {balance >= 1.0 ? `Due ₹${fmtInt(balance)}` : '✓ Fully Settled'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Remarks & Notes */}
      {booking.remarks && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs space-y-1.5">
          <span className="text-xs font-black uppercase text-slate-500 tracking-wider">Remarks & Special Requests</span>
          <p className="text-xs text-slate-700 bg-slate-50 rounded-xl p-3 border border-slate-100 leading-relaxed font-medium">
            {booking.remarks}
          </p>
        </div>
      )}
    </div>
  );
};

// ── Edit Fields Component ──

const EditFields = (props: {
  guest: string; setGuest: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  checkIn: string; setCheckIn: (v: string) => void;
  checkOut: string; setCheckOut: (v: string) => void;
  rate: number; setRate: (v: number) => void;
  nights: number; total: number;
  source: string; setSource: (v: string) => void;
  sourceCat: string; setSourceCat: (v: string) => void;
  payMode: string; setPayMode: (v: string) => void;
  advance: number; setAdvance: (v: number) => void;
  balance: number;
  remarks: string; setRemarks: (v: string) => void;
  sources: CompanySource[];
}) => (
  <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs space-y-4 text-xs">
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">Guest Full Name</label>
      <input
        type="text"
        value={props.guest}
        onChange={(e) => props.setGuest(e.target.value)}
        className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
      />
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
        <input
          type="text"
          value={props.phone}
          onChange={(e) => props.setPhone(e.target.value)}
          className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
        <input
          type="email"
          value={props.email}
          onChange={(e) => props.setEmail(e.target.value)}
          className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
        />
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Check-in Date</label>
        <input
          type="date"
          value={props.checkIn}
          onChange={(e) => props.setCheckIn(e.target.value)}
          className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Check-out Date</label>
        <input
          type="date"
          value={props.checkOut}
          onChange={(e) => props.setCheckOut(e.target.value)}
          className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
        />
      </div>
      <div className="bg-slate-50 p-2 rounded-xl border border-slate-200/80 flex flex-col justify-center text-center">
        <span className="text-[10px] text-slate-400 font-bold uppercase">Stay Duration</span>
        <span className="text-sm font-black text-indigo-700">{props.nights} Nights</span>
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Nightly Rate (₹)</label>
        <input
          type="number"
          value={props.rate}
          onChange={(e) => props.setRate(Number(e.target.value))}
          className="w-full px-3.5 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-bold"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Advance Received (₹)</label>
        <input
          type="number"
          value={props.advance}
          onChange={(e) => props.setAdvance(Number(e.target.value))}
          className="w-full px-3.5 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-bold text-emerald-700"
        />
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Booking Source</label>
        <input
          list="edit-source-list"
          value={props.source}
          onChange={(e) => props.setSource(e.target.value)}
          className="w-full px-3.5 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
        />
        <datalist id="edit-source-list">
          {props.sources.map((s) => <option key={s.id} value={s.name} />)}
        </datalist>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Payment Mode</label>
        <select
          value={props.payMode}
          onChange={(e) => props.setPayMode(e.target.value)}
          className="w-full px-3.5 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
        >
          <option value="Cash">Cash</option>
          <option value="Bank">Bank</option>
          <option value="UPI">UPI</option>
          <option value="Card">Card</option>
        </select>
      </div>
    </div>

    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">Remarks</label>
      <textarea
        value={props.remarks}
        onChange={(e) => props.setRemarks(e.target.value)}
        rows={2}
        className="w-full px-3.5 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none font-medium"
      />
    </div>
  </div>
);
