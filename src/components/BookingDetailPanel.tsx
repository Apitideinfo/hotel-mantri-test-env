import { useState, useMemo } from 'react';
import {
  X, Phone, Mail, BedDouble, Calendar, MoonStar, IndianRupee,
  Wallet, Banknote, Smartphone, CreditCard, Edit3, LogIn, LogOut,
  FileText, MessageCircle, Trash2, AlertCircle, Loader2, MapPin,
  Users, UtensilsCrossed, Receipt, Clock, User, Building2,
  ArrowRight, CalendarPlus, Printer, Download, Zap,
} from 'lucide-react';
import type {
  RoomChartEntry, RoomChartEntryInput, HotelSettings,
  CompanySource, RoomCategory, Room, SourceCategory, PayMode, MealPlan, GstType, GstSlab,
  FrontOfficeRole,
} from '@/lib/types';
import { GST_TYPES, GST_SLABS, MEAL_PLANS, SOURCE_CATEGORIES, canCheckoutAnyway, canRoomShift, canDeleteBooking, normalizePayMode } from '@/lib/types';
import type { Reservation, ReservationInput } from '@/lib/types-reservations';
import { fmtMoney, toNum, calcGstFull, calcStayNights } from '@/lib/calc';
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
import { brand } from '@/lib/theme';


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
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const STATUS_LABELS: Record<string, string> = {
  occupied: 'Checked In',
  vacant: 'Vacant',
  complimentary: 'Complimentary',
  confirmed: 'Confirmed Reservation',
  checked_in: 'Checked In',
  checked_out: 'Checked Out',
  cancelled: 'Cancelled',
  no_show: 'No Show',
};

const STATUS_COLORS: Record<string, string> = {
  occupied: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  complimentary: 'bg-amber-100 text-amber-700 border-amber-200',
  confirmed: 'bg-brand-100 text-brand-700 border-brand-200',
  checked_in: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  checked_out: 'bg-slate-100 text-slate-600 border-slate-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
  no_show: 'bg-red-100 text-red-700 border-red-200',
};

export const BookingDetailPanel = ({
  booking, settings, sources, categories, rooms, date, role, saving,
  onClose, onEditEntry, onDeleteEntry, onEditReservation, onDeleteReservation,
  onCheckIn, onCheckOut, onRoomShift, onExtendStay, onViewFolio, onSaved,
}: BookingDetailPanelProps) => {
  const [editMode, setEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  // Document action state (Sections 8-16, 19)
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

  const handleDocWhatsApp = async () => {
    if (activeDocAction) return;
    setActiveDocAction('whatsapp');
    setDocError(null);
    setDocSuccess(null);
    try {
      const data = await getReservationConfirmationData(targetResId);
      openWhatsAppConfirmation(data);
      setDocSuccess('Opened WhatsApp confirmation.');
    } catch (err: any) {
      setDocError(err.message || 'No valid phone number for WhatsApp.');
    } finally {
      setActiveDocAction(null);
      setTimeout(() => setDocSuccess(null), 4000);
    }
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
        source_category: editSourceCat,
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

  const handleWhatsApp = () => {
    const phone = (booking.phone || '').replace(/\D/g, '');
    if (!phone) return;
    const msg = `Dear ${booking.guestName},\n\nYour booking at ${settings?.hotel_name ?? 'Hotel Mantri'}:\nRoom: ${booking.roomNo}\nCheck-in: ${fmtDate(booking.checkIn)}\nCheck-out: ${fmtDate(booking.checkOut)}\nNights: ${booking.nights}\nRate: ₹${fmtMoney(booking.rate)}/night\nTotal: ₹${fmtMoney(booking.rate * booking.nights)}\n\nThank you!`;
    const waPhone = phone.length === 10 ? `91${phone}` : phone;
    window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const canCheckIn = isReservation && reservation?.status === 'confirmed';
  const canCheckOut = isReservation && reservation?.status === 'checked_in';

  const statusLabel = STATUS_LABELS[booking.status] ?? booking.status;
  const statusColor = STATUS_COLORS[booking.status] ?? 'bg-slate-100 text-slate-600 border-slate-200';

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      {/* Desktop: right drawer · Mobile: bottom sheet */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col animate-slide-in lg:rounded-l-2xl lg:max-w-md
        max-sm:rounded-t-2xl max-sm:bottom-0 max-sm:top-auto max-sm:max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between" style={{ background: brand.navy }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <BedDouble className="w-5 h-5 text-brand-gold-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                {editMode ? 'Edit Booking' : (booking.guestName || 'Guest')}
              </h2>
              <p className="text-xs text-brand-navy-300">
                Room {booking.roomNo}{category ? ` · ${category.name}` : ''}{isReservation ? ' · Reservation' : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-brand-navy-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status badge & Unassigned reason */}
        {!editMode && (
          <div className="px-5 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${statusColor}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {statusLabel}
            </span>
            {isUnassigned && unassignedReason && unassignedReason !== 'UNASSIGNED' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                {unassignedReason}
              </span>
            )}
          </div>
        )}

        {/* Unassigned status banner */}
        {!editMode && isUnassigned && (
          <div className="mx-5 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-bold text-amber-900">Room Not Allocated</div>
              <div className="text-[11px] text-amber-700 truncate">
                {unassignedReason === 'NO_ELIGIBLE_ROOM' ? 'No active rooms found in category' :
                 unassignedReason === 'ROOM_CATEGORY_NOT_MAPPED' ? 'Room category mapping required' :
                 unassignedReason === 'NO_ROOM_FOR_FULL_STAY' ? 'All category rooms booked for these dates' :
                 'Physical room allocation pending in backend'}
              </div>
            </div>
            {unassignedReason && unassignedReason !== 'UNASSIGNED' && (
              <span className="text-[10px] font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded shrink-0">
                Allocation blocked: {unassignedReason}
              </span>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
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
            <ViewFields booking={booking} settings={settings} category={category} />
          )}
        </div>

        {/* Action buttons */}
        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 space-y-2">
          {editMode ? (
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save Changes
              </button>
              <button onClick={() => setEditMode(false)}
                className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition">
                Cancel
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2">
                <ActionButton icon={Edit3} label="Edit" onClick={() => setEditMode(true)} />
                {canCheckIn && <ActionButton icon={LogIn} label="Check In" onClick={() => onCheckIn(booking)} primary />}
                {(booking.status === 'checked_in' || booking.status === 'occupied') && (
                  <ActionButton icon={LogOut} label="Check Out" onClick={() => onCheckOut(booking)} primary />
                )}
                {booking.status === 'checked_out' && (
                  <ActionButton icon={LogOut} label="Checked Out" onClick={() => {}} />
                )}
                <ActionButton icon={Trash2} label="Cancel" onClick={() => setShowDeleteConfirm(true)} danger={!canDeleteBooking(role)} />
              </div>

              {/* Confirmation Documents (Sections 8-16, 19) */}
              <div className="pt-2 border-t border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Documents & Confirmation</div>
                <div className="grid grid-cols-4 gap-2">
                  <DocActionBtn
                    icon={activeDocAction === 'pdf' ? Loader2 : Download}
                    label={activeDocAction === 'pdf' ? 'Loading…' : 'PDF'}
                    loading={activeDocAction === 'pdf'}
                    disabled={!!activeDocAction}
                    onClick={handleDocPdf}
                  />
                  <DocActionBtn
                    icon={activeDocAction === 'print' ? Loader2 : Printer}
                    label={activeDocAction === 'print' ? 'Loading…' : 'Print'}
                    loading={activeDocAction === 'print'}
                    disabled={!!activeDocAction}
                    onClick={handleDocPrint}
                  />
                  <DocActionBtn
                    icon={activeDocAction === 'email' ? Loader2 : Mail}
                    label={activeDocAction === 'email' ? 'Sending…' : 'Email'}
                    loading={activeDocAction === 'email'}
                    disabled={!!activeDocAction}
                    onClick={handleDocEmail}
                  />
                  <DocActionBtn
                    icon={activeDocAction === 'whatsapp' ? Loader2 : MessageCircle}
                    label={activeDocAction === 'whatsapp' ? 'Opening…' : 'WhatsApp'}
                    loading={activeDocAction === 'whatsapp'}
                    disabled={!!activeDocAction}
                    onClick={handleDocWhatsApp}
                  />
                </div>
              </div>

              {/* Status banners */}
              {docSuccess && (
                <div className="px-3 py-2 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-200 flex items-center justify-between animate-fadeIn">
                  <span>✓ {docSuccess}</span>
                  <button onClick={() => setDocSuccess(null)} className="text-emerald-700 hover:text-emerald-900 font-bold ml-1">✕</button>
                </div>
              )}
              {docError && (
                <div className="px-3 py-2 bg-rose-50 text-rose-800 text-xs font-semibold rounded-lg border border-rose-200 flex items-center justify-between animate-fadeIn">
                  <span>⚠ {docError}</span>
                  <button onClick={() => setDocError(null)} className="text-rose-700 hover:text-rose-900 font-bold ml-1">✕</button>
                </div>
              )}

              {(booking.status === 'checked_in' || booking.status === 'occupied') && (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => onRoomShift(booking)}
                    disabled={!canRoomShift(role)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-brand-navy-700 bg-brand-navy-50 hover:bg-brand-navy-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                    title={canRoomShift(role) ? 'Shift room' : 'Requires Manager permission'}
                  >
                    <ArrowRight className="w-4 h-4" /> Room Shift
                  </button>
                  <button
                    onClick={() => onExtendStay(booking)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition"
                  >
                    <CalendarPlus className="w-4 h-4" /> Extend Stay
                  </button>
                  <button
                    onClick={() => onViewFolio(booking)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                  >
                    <FileText className="w-4 h-4" /> Folio
                  </button>
                </div>
              )}
              {booking.status === 'checked_out' && (
                <button
                  onClick={() => onViewFolio(booking)}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-brand-navy-700 hover:bg-brand-navy-800 text-white text-sm font-medium rounded-lg transition"
                >
                  <FileText className="w-4 h-4" /> View Guest Folio
                </button>
              )}
              {isReservation && reservation && (
                <button
                  onClick={() => onViewFolio(booking)}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-brand-navy-700 hover:bg-brand-navy-800 text-white text-sm font-medium rounded-lg transition"
                >
                  <FileText className="w-4 h-4" /> View Folio
                </button>
              )}
              <ViewFields booking={booking} settings={settings} category={category} />
            </>
          )}
        </div>

        {/* Delete confirm */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10">
            <div className="bg-white rounded-xl shadow-xl p-5 m-4 max-w-xs">
              <div className="flex items-center gap-2 text-red-600 mb-2">
                <AlertCircle className="w-5 h-5" />
                <span className="font-semibold">Delete Booking?</span>
              </div>
              <p className="text-sm text-slate-500 mb-4">
                This will permanently remove the {isReservation ? 'reservation' : 'room entry'}.
                {isReservation ? ' No financial data is affected.' : ' This affects today\'s report.'}
              </p>
              <div className="flex gap-2">
                <button onClick={handleDelete} disabled={saving}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition">
                  {saving ? 'Deleting…' : 'Delete'}
                </button>
                <button onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

// ── View Fields ──────────────────────────────────────────

const ViewFields = ({
  booking, settings, category,
}: { booking: BoardBooking; settings: HotelSettings | null; category?: RoomCategory }) => {
  const total = booking.rate * booking.nights;
  const entry = booking.type === 'entry' ? booking.raw as RoomChartEntry : null;
  const reservation = booking.type === 'reservation' ? booking.raw as Reservation : null;
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
    <>
      <Section title="Guest Details" icon={User}>
        <DetailRow icon={User} label="Guest Name" value={booking.guestName || '—'} />
        <DetailRow icon={Phone} label="Mobile" value={booking.phone || '—'} />
        <DetailRow icon={Mail} label="Email" value={booking.email || '—'} />
        {reservation?.guest_address && <DetailRow icon={MapPin} label="Address" value={reservation.guest_address} />}
        {entry?.id_proof_type && entry.id_proof_type !== 'None' && (
          <DetailRow icon={FileText} label="ID Proof" value={`${entry.id_proof_type}${entry.id_proof_number ? ` · ${entry.id_proof_number}` : ''}${entry.id_proof_verified ? ' (Verified)' : ''}`} />
        )}
      </Section>

      <Section title="Stay Details" icon={Calendar}>
        <DetailRow icon={BedDouble} label="Room" value={`${booking.roomNo}${category ? ` · ${category.name}` : ''}`} />
        <DetailRow icon={Calendar} label="Check-in" value={fmtDate(booking.checkIn)} />
        <DetailRow icon={Calendar} label="Check-out" value={fmtDate(booking.checkOut)} />
        <DetailRow icon={MoonStar} label="Nights" value={String(booking.nights)} />
        <DetailRow icon={Users} label="Guests" value={`${adults} Adult${adults !== 1 ? 's' : ''}${children > 0 ? ` · ${children} Child${children !== 1 ? 'ren' : ''}` : ''}`} />
        <DetailRow icon={UtensilsCrossed} label="Meal Plan" value={mealPlan} />
      </Section>

      <Section title="Booking Source" icon={Building2}>
        <DetailRow icon={Building2} label="Source" value={booking.sourceName || booking.sourceCategory || '—'} />
        <DetailRow icon={Receipt} label="Category" value={booking.sourceCategory || '—'} />
      </Section>

      <Section title="Charges & Payment" icon={IndianRupee}>
        <DetailRow icon={IndianRupee} label="Room Rate" value={`₹${fmtMoney(booking.rate)}/night`} />
        <DetailRow icon={IndianRupee} label="Subtotal" value={`₹${fmtMoney(total)}`} />
        {gstType !== 'No Scope' && gstAmount > 0 && (
          <DetailRow icon={Receipt} label={`GST (${gstType})`} value={`₹${fmtMoney(gstAmount)}`} />
        )}
        <div className="flex items-center justify-between py-2 border-t border-slate-100">
          <span className="text-sm font-bold text-brand-navy-800">Total Amount</span>
          <span className="text-sm font-bold text-brand-navy-800">₹{fmtMoney(total + gstAmount)}</span>
        </div>
        <DetailRow icon={Wallet} label="Amount Received" value={`₹${fmtMoney(advance)}`} />
        <div className="flex items-center justify-between py-2 bg-amber-50 rounded-lg px-3">
          <span className="text-sm font-semibold text-amber-700">Balance Due</span>
          <span className="text-sm font-bold text-amber-700">₹{fmtMoney(balance)}</span>
        </div>
        <DetailRow icon={CreditCard} label="Payment Mode" value={booking.paymentMode || '—'} />
      </Section>

      {booking.remarks && (
        <Section title="Remarks" icon={FileText}>
          <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{booking.remarks}</p>
        </Section>
      )}
    </>
  );
};

// ── Edit Fields ──

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
  <div className="space-y-3">
    <EditField label="Guest Name">
      <input value={props.guest} onChange={(e) => props.setGuest(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
    </EditField>
    <div className="grid grid-cols-2 gap-3">
      <EditField label="Phone">
        <input value={props.phone} onChange={(e) => props.setPhone(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
      </EditField>
      <EditField label="Email">
        <input value={props.email} onChange={(e) => props.setEmail(e.target.value)} type="email"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
      </EditField>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <EditField label="Check-in">
        <input type="date" value={props.checkIn} onChange={(e) => props.setCheckIn(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
      </EditField>
      <EditField label="Check-out">
        <input type="date" value={props.checkOut} onChange={(e) => props.setCheckOut(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
      </EditField>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <EditField label="Rate / Night">
        <input type="number" value={props.rate} onChange={(e) => props.setRate(Number(e.target.value))}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
      </EditField>
      <EditField label="Nights">
        <input value={props.nights} disabled
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500 font-medium" />
      </EditField>
    </div>
    <EditField label="Booking Source">
      <input list="edit-source-list" value={props.source} onChange={(e) => props.setSource(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
      <datalist id="edit-source-list">
        {props.sources.map((s) => <option key={s.id} value={s.name} />)}
      </datalist>
    </EditField>
    <div className="grid grid-cols-2 gap-3">
      <EditField label="Source Category">
        <select value={props.sourceCat} onChange={(e) => props.setSourceCat(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30">
          {SOURCE_CATEGORIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </EditField>
      <EditField label="Payment Mode">
        <select value={props.payMode} onChange={(e) => props.setPayMode(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30">
          <option value="Cash">Cash</option>
          <option value="Bank">Bank</option>
          <option value="UPI">UPI</option>
          <option value="Card">Card</option>
        </select>
      </EditField>
    </div>
    <EditField label="Advance Paid">
      <input type="number" value={props.advance} onChange={(e) => props.setAdvance(Number(e.target.value))}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
    </EditField>
    <div className="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
      <span className="text-sm font-semibold text-amber-700">Balance</span>
      <span className="text-sm font-bold text-amber-700">₹{fmtMoney(props.balance)}</span>
    </div>
    <EditField label="Remarks">
      <textarea value={props.remarks} onChange={(e) => props.setRemarks(e.target.value)} rows={2}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-none" />
    </EditField>
  </div>
);

// ── Small components ──

const Section = ({ title, icon: Icon, children }: { title: string; icon: typeof User; children: React.ReactNode }) => (
  <div>
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className="w-3.5 h-3.5 text-slate-400" />
      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{title}</h3>
    </div>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const DetailRow = ({ icon: Icon, label, value }: { icon: typeof User | null; label: string; value: string }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="flex items-center gap-1.5 text-xs text-slate-500">
      {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" />}
      {label}
    </span>
    <span className="text-sm font-medium text-slate-800 text-right truncate">{value}</span>
  </div>
);

const EditField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
    {children}
  </label>
);

const ActionButton = ({ icon: Icon, label, onClick, primary, danger }: {
  icon: typeof Edit3; label: string; onClick: () => void; primary?: boolean; danger?: boolean;
}) => (
  <button onClick={onClick}
    className={`flex flex-col items-center gap-1 py-2.5 rounded-lg text-xs font-medium transition border ${
      danger
        ? 'text-red-600 border-red-200 hover:bg-red-50'
        : primary
        ? 'text-white bg-brand-600 hover:bg-brand-700 border-brand-600'
        : 'text-slate-600 border-slate-200 hover:bg-slate-100'
    }`}>
    <Icon className="w-4 h-4" />
    {label}
  </button>
);

const DocActionBtn = ({
  icon: Icon,
  label,
  onClick,
  loading = false,
  disabled = false,
}: {
  icon: typeof FileText;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled || loading}
    className="flex flex-col items-center gap-1 py-2.5 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-xs"
  >
    <Icon className={`w-4 h-4 ${loading ? 'animate-spin text-brand-600' : 'text-slate-600'}`} />
    <span>{label}</span>
  </button>
);

