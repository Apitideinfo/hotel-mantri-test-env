import { useState, useMemo } from 'react';
import {
  X, Loader2, Calendar, BedDouble, ChevronRight, ChevronLeft, Check,
  Users, IndianRupee, Wallet, Banknote, Smartphone, CreditCard, AlertCircle,
  UtensilsCrossed, Receipt, User, Phone, Mail, MapPin, Building2, FileText,
  CheckCircle2, MessageCircle, Mail as MailIcon,
} from 'lucide-react';
import type {
  HotelSettings, CompanySource, RoomCategory, Room, SourceCategory,
  MealPlan, GstType, GstSlab,
} from '@/lib/types';
import { SOURCE_CATEGORIES, MEAL_PLANS, GST_TYPES, GST_SLABS, groupRoomsByCategory, compareRoomNo } from '@/lib/types';
import type { ReservationInput } from '@/lib/types-reservations';
import { fmtMoney, toNum, calcGstFull } from '@/lib/calc';
import { brand } from '@/lib/theme';

interface NewBookingModalProps {
  rooms: Room[];
  categories: RoomCategory[];
  sources: CompanySource[];
  settings: HotelSettings | null;
  defaultDate: string;
  preselectRoom?: string;
  preselectCheckIn?: string;
  preselectCheckOut?: string;
  saving: boolean;
  onClose: () => void;
  onSave: (input: ReservationInput) => void;
}

const addDays = (dateStr: string, n: number): string => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

type Step = 0 | 1 | 2 | 3;

export const NewBookingModal = ({
  rooms, categories, sources, settings, defaultDate,
  preselectRoom, preselectCheckIn, preselectCheckOut,
  saving, onClose, onSave,
}: NewBookingModalProps) => {
  const [step, setStep] = useState<Step>(0);
  const [roomNo, setRoomNo] = useState(preselectRoom ?? '');
  const [guestName, setGuestName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [checkIn, setCheckIn] = useState(preselectCheckIn ?? defaultDate);
  const [checkOut, setCheckOut] = useState(preselectCheckOut ?? addDays(preselectCheckIn ?? defaultDate, 1));
  const [rate, setRate] = useState(0);
  const [sourceName, setSourceName] = useState('');
  const [sourceCat, setSourceCat] = useState<SourceCategory>('Direct/Walking');
  const [payMode, setPayMode] = useState('Cash');
  const [payCash, setPayCash] = useState(0);
  const [payUpi, setPayUpi] = useState(0);
  const [payCard, setPayCard] = useState(0);
  const [payBank, setPayBank] = useState(0);
  const [paymentRef, setPaymentRef] = useState('');
  const [discount, setDiscount] = useState(0);
  const [mealPlan, setMealPlan] = useState<MealPlan>('EP');
  const [gstType, setGstType] = useState<GstType>('No Scope');
  const [gstSlab, setGstSlab] = useState<GstSlab>(0);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [remarks, setRemarks] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [guestAddress, setGuestAddress] = useState('');
  const [guestType, setGuestType] = useState('');
  const [companyGst, setCompanyGst] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ReservationInput | null>(null);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.room_no.trim().toLowerCase() === roomNo.trim().toLowerCase()),
    [rooms, roomNo],
  );
  const category = useMemo(
    () => categories.find((c) => c.id === selectedRoom?.category_id),
    [categories, selectedRoom],
  );

  const nights = useMemo(() => {
    const ci = new Date(checkIn + 'T00:00:00');
    const co = new Date(checkOut + 'T00:00:00');
    return Math.max(1, Math.round((co.getTime() - ci.getTime()) / 86400000));
  }, [checkIn, checkOut]);

  const subtotal = rate * nights;
  const afterDiscount = Math.max(0, subtotal - toNum(discount));
  const { taxable, gst, invoiceTotal } = calcGstFull(afterDiscount, gstType, gstSlab);
  const totalReceived = toNum(payCash) + toNum(payUpi) + toNum(payCard) + toNum(payBank);
  const balance = Math.max(0, invoiceTotal - totalReceived);

  const handleRoomSelect = (no: string) => {
    setRoomNo(no);
    const r = rooms.find((rm) => rm.room_no === no);
    if (r && rate === 0) {
      const cat = categories.find((c) => c.id === r.category_id);
      setRate(cat?.default_tariff ?? r.default_tariff ?? 0);
    }
  };

  const groupedRooms = useMemo(() => {
    const active = rooms.filter((r) => r.is_active);
    const sorted = [...active].sort((a, b) => compareRoomNo(a.room_no, b.room_no));
    return groupRoomsByCategory(sorted, categories);
  }, [rooms, categories]);

  const validateStep = (s: Step): boolean => {
    setError(null);
    if (s === 0) {
      if (!roomNo) { setError('Please select a room.'); return false; }
      if (!checkIn || !checkOut) { setError('Please select check-in and check-out dates.'); return false; }
      if (new Date(checkOut + 'T00:00:00') <= new Date(checkIn + 'T00:00:00')) {
        setError('Check-out must be after check-in.'); return false;
      }
    }
    if (s === 1) {
      if (!guestName.trim()) { setError('Please enter guest name.'); return false; }
    }
    return true;
  };

  const next = () => {
    if (validateStep(step)) setStep((s) => Math.min(3, s + 1) as Step);
  };
  const prev = () => setStep((s) => Math.max(0, s - 1) as Step);

  const buildInput = (): ReservationInput => ({
    room_id: selectedRoom?.id ?? null,
    room_no: roomNo,
    guest_name: guestName.trim(),
    guest_phone: phone.trim(),
    guest_email: email.trim(),
    guest_address: guestAddress.trim(),
    guest_type: guestType.trim(),
    company_gst: companyGst.trim(),
    check_in_date: checkIn,
    check_out_date: checkOut,
    rate,
    source_category: sourceCat,
    source_name: sourceName.trim(),
    payment_mode: payMode,
    advance_paid: totalReceived,
    pay_cash: payCash,
    pay_upi: payUpi,
    pay_card: payCard,
    pay_bank: payBank,
    payment_ref: paymentRef.trim(),
    discount,
    meal_plan: mealPlan,
    gst_type: gstType,
    gst_slab: gstSlab,
    gst_amount: gst,
    taxable_amount: taxable,
    invoice_total: invoiceTotal,
    adults,
    children,
    remarks: remarks.trim(),
    internal_note: internalNote.trim(),
    created_by: createdBy.trim(),
    status: 'confirmed',
  });

  const handleConfirm = () => {
    setError(null);
    if (new Date(checkOut + 'T00:00:00') <= new Date(checkIn + 'T00:00:00')) {
      setError('Check-out must be after check-in.'); return;
    }
    const input = buildInput();
    onSave(input);
    setSuccess(input);
  };

  const stepLabels = ['Stay & Rooms', 'Guest Details', 'Payment', 'Confirm'];

  // ── Success modal ──
  if (success) {
    return (
      <>
        <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto">
            <div className="px-6 py-5 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Booking Confirmed!</h2>
              <p className="text-sm text-slate-400 mt-1">
                Reservation for {success.guest_name} · Room {success.room_no}
              </p>
              <div className="mt-4 bg-slate-50 rounded-xl p-3 text-left space-y-1.5">
                <SuccessRow label="Check-in" value={success.check_in_date} />
                <SuccessRow label="Check-out" value={success.check_out_date} />
                <SuccessRow label="Nights" value={String(success.nights ?? nights)} />
                <SuccessRow label="Rate" value={`₹${fmtMoney(success.rate ?? rate)}/night`} />
                <SuccessRow label="Total" value={`₹${fmtMoney(success.invoice_total ?? invoiceTotal)}`} />
                <SuccessRow label="Received" value={`₹${fmtMoney(success.advance_paid ?? totalReceived)}`} />
                <SuccessRow label="Balance" value={`₹${fmtMoney(balance)}`} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
                  <FileText className="w-4 h-4" /> Confirmation PDF
                </button>
                <button className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
                  <MailIcon className="w-4 h-4" /> Email
                </button>
                <button className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition">
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </button>
                <button onClick={onClose}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition">
                  <BedDouble className="w-4 h-4" /> Go to Board
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col pointer-events-auto">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between" style={{ background: brand.navy }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-brand-gold-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">New Booking</h2>
                <p className="text-xs text-brand-navy-300">Step {step + 1} of 4 · {stepLabels[step]}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-brand-navy-300">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Step indicator */}
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            {stepLabels.map((label, i) => (
              <div key={label} className="flex items-center flex-1">
                <div className={`flex items-center gap-2 ${i <= step ? 'text-brand-600' : 'text-slate-400'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i < step ? 'bg-brand-600 text-white' : i === step ? 'bg-brand-100 text-brand-700 border-2 border-brand-600' : 'bg-slate-200 text-slate-400'
                  }`}>
                    {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className="text-xs font-semibold hidden sm:block">{label}</span>
                </div>
                {i < 3 && <div className={`flex-1 h-0.5 mx-2 rounded ${i < step ? 'bg-brand-600' : 'bg-slate-200'}`} />}
              </div>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            {/* STEP 0: Stay & Rooms */}
            {step === 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field label="Check-in *">
                    <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
                  </Field>
                  <Field label="Check-out *">
                    <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
                  </Field>
                  <Field label="Nights">
                    <input value={nights} disabled
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500 font-medium" />
                  </Field>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
                    <BedDouble className="w-3.5 h-3.5" /> Select Room *
                  </p>
                  {rooms.length === 0 ? (
                    <p className="text-sm text-slate-400 py-2">No rooms configured. Add rooms in Property Master.</p>
                  ) : (
                    <div className="space-y-3 max-h-56 overflow-y-auto">
                      {groupedRooms.map((group) => (
                        <div key={group.cat?.id ?? '__uncat'}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="h-3 w-1 rounded-full bg-brand-500" />
                            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                              {group.cat?.name ?? 'Uncategorized'}
                            </span>
                            <span className="text-[10px] text-slate-400">— {group.rooms.length} Rooms</span>
                          </div>
                          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                            {group.rooms.map((r) => {
                              const isSelected = roomNo === r.room_no;
                              return (
                                <button key={r.id} onClick={() => handleRoomSelect(r.room_no)}
                                  className={`px-2 py-2 text-xs rounded-lg border transition font-semibold ${
                                    isSelected
                                      ? 'bg-brand-600 text-white border-brand-600 shadow-soft-blue'
                                      : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300 hover:bg-brand-50'
                                  }`}>
                                  {r.room_no}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedRoom && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Field label="Rate / Night">
                      <input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
                    </Field>
                    <Field label="Meal Plan">
                      <select value={mealPlan} onChange={(e) => setMealPlan(e.target.value as MealPlan)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                        {MEAL_PLANS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Adults">
                      <input type="number" min={1} value={adults} onChange={(e) => setAdults(Math.max(1, Number(e.target.value)))}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
                    </Field>
                    <Field label="Children">
                      <input type="number" min={0} value={children} onChange={(e) => setChildren(Math.max(0, Number(e.target.value)))}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
                    </Field>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Field label="GST Type">
                    <select value={gstType} onChange={(e) => setGstType(e.target.value as GstType)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                      {GST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </Field>
                  {gstType !== 'No Scope' && (
                    <Field label="GST Rate">
                      <select value={String(gstSlab)} onChange={(e) => setGstSlab(Number(e.target.value) as GstSlab)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                        {GST_SLABS.map((s) => <option key={s} value={String(s)}>{s}%</option>)}
                      </select>
                    </Field>
                  )}
                </div>

                {/* Summary */}
                <div className="bg-brand-50 rounded-xl p-3 border border-brand-100">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Subtotal ({nights} × ₹{fmtMoney(rate)})</span>
                    <span className="font-semibold text-slate-800">₹{fmtMoney(subtotal)}</span>
                  </div>
                  {toNum(discount) > 0 && (
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-slate-600">Discount</span>
                      <span className="font-semibold text-red-600">- ₹{fmtMoney(discount)}</span>
                    </div>
                  )}
                  {gstType !== 'No Scope' && gst > 0 && (
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-slate-600">GST ({gstSlab}%)</span>
                      <span className="font-semibold text-slate-800">₹{fmtMoney(gst)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-brand-200">
                    <span className="font-bold text-brand-navy-800">Total</span>
                    <span className="font-bold text-brand-navy-800 text-base">₹{fmtMoney(invoiceTotal)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 1: Guest Details */}
            {step === 1 && (
              <div className="space-y-4">
                <Field label="Guest Name *">
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input value={guestName} onChange={(e) => setGuestName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      placeholder="Enter guest name" />
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Mobile">
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input value={phone} onChange={(e) => setPhone(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                        placeholder="Phone number" />
                    </div>
                  </Field>
                  <Field label="Email">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                        placeholder="Email (optional)" />
                    </div>
                  </Field>
                </div>

                {/* Advanced toggle */}
                <button onClick={() => setShowAdvanced((v) => !v)}
                  className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
                  <ChevronRight className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
                  More Guest Details
                </button>
                {showAdvanced && (
                  <div className="space-y-3 pl-1 border-l-2 border-brand-100 pl-4">
                    <Field label="Address">
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                        <textarea value={guestAddress} onChange={(e) => setGuestAddress(e.target.value)} rows={2}
                          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-none"
                          placeholder="Guest address (optional)" />
                      </div>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Guest Type">
                        <input value={guestType} onChange={(e) => setGuestType(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                          placeholder="FIT / Corporate / Group" />
                      </Field>
                      <Field label="Company GST">
                        <input value={companyGst} onChange={(e) => setCompanyGst(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                          placeholder="GST number (optional)" />
                      </Field>
                    </div>
                    <Field label="Booking Source">
                      <input list="new-booking-sources" value={sourceName} onChange={(e) => setSourceName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                        placeholder="Source / company name" />
                      <datalist id="new-booking-sources">
                        {sources.map((s) => <option key={s.id} value={s.name} />)}
                      </datalist>
                    </Field>
                    <Field label="Source Category">
                      <select value={sourceCat} onChange={(e) => setSourceCat(e.target.value as SourceCategory)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                        {SOURCE_CATEGORIES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Field>
                    <Field label="Special Notes / Remarks">
                      <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-none"
                        placeholder="Special requests, notes (optional)" />
                    </Field>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: Payment */}
            {step === 2 && (
              <div className="space-y-4">
                {/* Amount summary */}
                <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Booking Amount ({nights} × ₹{fmtMoney(rate)})</span>
                    <span className="font-semibold text-slate-800">₹{fmtMoney(subtotal)}</span>
                  </div>
                  <Field label="Discount">
                    <input type="number" min={0} value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
                  </Field>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">GST {gstType !== 'No Scope' ? `(${gstSlab}%)` : ''}</span>
                    <span className="font-semibold text-slate-800">₹{fmtMoney(gst)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-200">
                    <span className="font-bold text-brand-navy-800">Final Amount</span>
                    <span className="font-bold text-brand-navy-800 text-base">₹{fmtMoney(invoiceTotal)}</span>
                  </div>
                </div>

                {/* Payment received */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">Payment Received</p>
                  <div className="grid grid-cols-2 gap-3">
                    <PayField icon={Wallet} label="Cash" value={payCash} onChange={setPayCash} />
                    <PayField icon={Smartphone} label="UPI" value={payUpi} onChange={setPayUpi} />
                    <PayField icon={CreditCard} label="Card" value={payCard} onChange={setPayCard} />
                    <PayField icon={Banknote} label="Bank" value={payBank} onChange={setPayBank} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Payment Mode">
                    <select value={payMode} onChange={(e) => setPayMode(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                      <option value="Cash">Cash</option>
                      <option value="Bank">Bank</option>
                      <option value="UPI">UPI</option>
                      <option value="Card">Card</option>
                    </select>
                  </Field>
                  <Field label="Payment Reference">
                    <input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      placeholder="UTR / ref (optional)" />
                  </Field>
                </div>

                {/* Balance display */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-50 rounded-xl px-3 py-2.5 border border-emerald-200">
                    <span className="block text-xs font-medium text-emerald-600 mb-0.5">Total Received</span>
                    <p className="font-bold text-emerald-700 text-base">₹{fmtMoney(totalReceived)}</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl px-3 py-2.5 border border-amber-200">
                    <span className="block text-xs font-medium text-amber-600 mb-0.5">Balance</span>
                    <p className="font-bold text-amber-700 text-base">₹{fmtMoney(balance)}</p>
                  </div>
                </div>

                <Field label="Internal Note">
                  <textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={2}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-none"
                    placeholder="Internal note (optional)" />
                </Field>
                <Field label="Booking Created By">
                  <input value={createdBy} onChange={(e) => setCreatedBy(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    placeholder="Staff name (optional)" />
                </Field>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                  <BedDouble className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    This reservation <strong>only blocks room inventory</strong>. It does not affect
                    revenue, GST, cash, or any report until the guest is checked in.
                  </p>
                </div>
              </div>
            )}

            {/* STEP 3: Confirm */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-brand-navy-50 px-4 py-2.5 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-brand-navy-800 uppercase tracking-wide">Booking Preview</h3>
                  </div>
                  <div className="p-4 space-y-3">
                    <PreviewSection title="Guest">
                      <PreviewRow label="Name" value={guestName || '—'} />
                      <PreviewRow label="Mobile" value={phone || '—'} />
                      <PreviewRow label="Email" value={email || '—'} />
                    </PreviewSection>
                    <PreviewSection title="Rooms & Stay">
                      <PreviewRow label="Room" value={`${roomNo} ${category ? `· ${category.name}` : ''}`} />
                      <PreviewRow label="Check-in" value={checkIn} />
                      <PreviewRow label="Check-out" value={checkOut} />
                      <PreviewRow label="Nights" value={String(nights)} />
                      <PreviewRow label="Rate" value={`₹${fmtMoney(rate)}/night`} />
                      <PreviewRow label="Meal Plan" value={mealPlan} />
                    </PreviewSection>
                    <PreviewSection title="Payment">
                      <PreviewRow label="Subtotal" value={`₹${fmtMoney(subtotal)}`} />
                      {toNum(discount) > 0 && <PreviewRow label="Discount" value={`- ₹${fmtMoney(discount)}`} />}
                      {gstType !== 'No Scope' && <PreviewRow label="GST" value={`₹${fmtMoney(gst)}`} />}
                      <PreviewRow label="Total" value={`₹${fmtMoney(invoiceTotal)}`} bold />
                      <PreviewRow label="Received" value={`₹${fmtMoney(totalReceived)}`} />
                      <PreviewRow label="Balance" value={`₹${fmtMoney(balance)}`} />
                      <PreviewRow label="Source" value={`${sourceCat}${sourceName ? ` · ${sourceName}` : ''}`} />
                      <PreviewRow label="Pay Mode" value={payMode} />
                    </PreviewSection>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleConfirm} disabled={saving}
                    className="flex items-center justify-center gap-1.5 px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-lg disabled:opacity-60 transition shadow-soft-blue">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Confirm Booking
                  </button>
                  <button disabled={saving}
                    className="flex items-center justify-center gap-1.5 px-4 py-3 bg-brand-gold-500 hover:bg-brand-gold-600 text-white text-sm font-bold rounded-lg disabled:opacity-60 transition">
                    Hold Booking
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
                    <MailIcon className="w-3.5 h-3.5" /> Send Email
                  </button>
                  <button className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition">
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </button>
                  <button className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
                    <FileText className="w-3.5 h-3.5" /> Confirmation PDF
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer nav */}
          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <button onClick={prev} disabled={step === 0}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg disabled:opacity-40 transition">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <span className="text-xs text-slate-400">Step {step + 1} of 4</span>
            {step < 3 ? (
              <button onClick={next}
                className="flex items-center gap-1 px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleConfirm} disabled={saving}
                className="flex items-center gap-1 px-4 py-2 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60 transition">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirm
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

// ── Sub-components ──

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
    {children}
  </label>
);

const PayField = ({ icon: Icon, label, value, onChange }: {
  icon: typeof Wallet; label: string; value: number; onChange: (v: number) => void;
}) => (
  <label className="block">
    <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input type="number" min={0} value={value === 0 ? '' : value} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        placeholder="0"
        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
    </div>
  </label>
);

const SuccessRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-slate-500">{label}</span>
    <span className="font-semibold text-slate-800">{value}</span>
  </div>
);

const PreviewSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{title}</p>
    <div className="space-y-1">{children}</div>
  </div>
);

const PreviewRow = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="text-slate-500">{label}</span>
    <span className={`font-medium ${bold ? 'font-bold text-brand-navy-800' : 'text-slate-800'}`}>{value}</span>
  </div>
);
