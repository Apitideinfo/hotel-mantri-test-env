import { useState, useMemo } from 'react';
import {
  X, Loader2, Calendar, BedDouble, ChevronDown, Check,
  Users, Wallet, Banknote, Smartphone, CreditCard, AlertCircle,
  User, Phone, Mail, MapPin, FileText, Settings,
  CheckCircle2, MessageCircle, Mail as MailIcon, PlusCircle, Lock,
} from 'lucide-react';
import type {
  HotelSettings, CompanySource, RoomCategory, Room, SourceCategory,
  MealPlan, GstType, GstSlab,
} from '@/lib/types';
import { SOURCE_CATEGORIES, MEAL_PLANS, GST_TYPES, GST_SLABS, groupRoomsByCategory, compareRoomNo } from '@/lib/types';
import type { ReservationInput } from '@/lib/types-reservations';
import { fmtMoney, toNum, calcGstFull } from '@/lib/calc';

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
  onSave: (input: ReservationInput | ReservationInput[]) => void;
}

const addDays = (dateStr: string, n: number): string => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export const NewBookingModal = ({
  rooms, categories, sources, settings: _settings, defaultDate,
  preselectRoom, preselectCheckIn, preselectCheckOut,
  saving, onClose, onSave,
}: NewBookingModalProps) => {
  const [roomNos, setRoomNos] = useState<string[]>(preselectRoom ? [preselectRoom] : []);
  const [guestName, setGuestName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [email, setEmail] = useState('');
  const [checkIn, setCheckIn] = useState(preselectCheckIn ?? defaultDate);
  const [checkOut, setCheckOut] = useState(preselectCheckOut ?? addDays(preselectCheckIn ?? defaultDate, 1));
  const [rate, setRate] = useState<number | ''>('');
  const [sourceName, setSourceName] = useState('');
  const [sourceCat, setSourceCat] = useState<SourceCategory>('Direct/Walking');
  const [payMode, setPayMode] = useState('Cash');
  const [payCash, setPayCash] = useState<number | ''>('');
  const [payUpi, setPayUpi] = useState<number | ''>('');
  const [payCard, setPayCard] = useState<number | ''>('');
  const [payBank, setPayBank] = useState<number | ''>('');
  const [paymentRef, setPaymentRef] = useState('');
  const [discount, setDiscount] = useState<number | ''>('');
  const [mealPlan, setMealPlan] = useState<MealPlan>('EP');
  const [gstType, setGstType] = useState<GstType>('No Scope');
  const [gstSlab, setGstSlab] = useState<GstSlab>(0);
  const [adults, setAdults] = useState<number | ''>('');
  const [children, setChildren] = useState<number | ''>('');
  const [remarks, setRemarks] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [guestAddress, setGuestAddress] = useState('');
  const [guestType, setGuestType] = useState('');
  const [companyGst, setCompanyGst] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ReservationInput[] | null>(null);

  const selectedRooms = useMemo(
    () => rooms.filter((r) => roomNos.includes(r.room_no.trim())),
    [rooms, roomNos],
  );

  const nights = useMemo(() => {
    const ci = new Date(checkIn + 'T00:00:00');
    const co = new Date(checkOut + 'T00:00:00');
    return Math.max(1, Math.round((co.getTime() - ci.getTime()) / 86400000));
  }, [checkIn, checkOut]);

  const subtotal = toNum(rate) * nights * Math.max(1, roomNos.length);
  const afterDiscount = Math.max(0, subtotal - toNum(discount));
  const { taxable: _taxable, gst, invoiceTotal } = calcGstFull(afterDiscount, gstType, gstSlab);
  const totalReceived = toNum(payCash) + toNum(payUpi) + toNum(payCard) + toNum(payBank);
  const balance = Math.max(0, invoiceTotal - totalReceived);

  const toggleRoom = (no: string) => {
    setRoomNos(prev => {
      const newNos = prev.includes(no) ? prev.filter(n => n !== no) : [...prev, no];
      if (newNos.length > 0 && rate === '' && newNos.length > prev.length) {
        const r = rooms.find((rm) => rm.room_no === no);
        if (r) {
          const cat = categories.find((c) => c.id === r.category_id);
          setRate(cat?.default_tariff ?? r.default_tariff ?? 0);
        }
      }
      return newNos;
    });
  };

  const groupedRooms = useMemo(() => {
    const active = rooms.filter((r) => r.is_active);
    const sorted = [...active].sort((a, b) => compareRoomNo(a.room_no, b.room_no));
    return groupRoomsByCategory(sorted, categories);
  }, [rooms, categories]);

  const validateForm = (): boolean => {
    setError(null);
    if (!guestName.trim()) { setError('Please enter guest name.'); return false; }
    if (roomNos.length === 0) { setError('Please select at least one room.'); return false; }
    if (!checkIn || !checkOut) { setError('Please select check-in and check-out dates.'); return false; }
    if (new Date(checkOut + 'T00:00:00') <= new Date(checkIn + 'T00:00:00')) {
      setError('Check-out date must be after check-in date.'); return false;
    }
    return true;
  };

  const buildInputs = (): ReservationInput[] => {
    const groupId = roomNos.length > 1 ? crypto.randomUUID() : undefined;
    const fullPhone = phone.trim() ? `${countryCode} ${phone.trim()}` : '';
    
    return roomNos.map((no, idx) => {
      const room = rooms.find(r => r.room_no === no);
      const advancePaid = idx === 0 ? totalReceived : 0;
      const rPayCash = idx === 0 ? toNum(payCash) : 0;
      const rPayUpi = idx === 0 ? toNum(payUpi) : 0;
      const rPayCard = idx === 0 ? toNum(payCard) : 0;
      const rPayBank = idx === 0 ? toNum(payBank) : 0;
      
      const roomSubtotal = toNum(rate) * nights;
      const roomDiscount = toNum(discount) / roomNos.length;
      const roomAfterDiscount = Math.max(0, roomSubtotal - roomDiscount);
      const { taxable: rTaxable, gst: rGst, invoiceTotal: rInvoiceTotal } = calcGstFull(roomAfterDiscount, gstType, gstSlab);
      
      return {
        room_id: room?.id ?? null,
        room_no: no,
        guest_name: guestName.trim(),
        guest_phone: fullPhone,
        guest_email: email.trim(),
        guest_address: guestAddress.trim(),
        guest_type: guestType.trim(),
        company_gst: companyGst.trim(),
        check_in_date: checkIn,
        check_out_date: checkOut,
        rate: toNum(rate),
        source_category: sourceCat,
        source_name: sourceName.trim(),
        payment_mode: payMode,
        advance_paid: advancePaid,
        pay_cash: rPayCash,
        pay_upi: rPayUpi,
        pay_card: rPayCard,
        pay_bank: rPayBank,
        payment_ref: paymentRef.trim(),
        discount: roomDiscount,
        meal_plan: mealPlan,
        gst_type: gstType,
        gst_slab: gstSlab,
        gst_amount: rGst,
        taxable_amount: rTaxable,
        invoice_total: rInvoiceTotal,
        adults: toNum(adults),
        children: toNum(children),
        remarks: remarks.trim(),
        internal_note: internalNote.trim(),
        created_by: createdBy.trim(),
        status: 'confirmed',
        group_id: groupId,
      };
    });
  };

  const handleConfirm = () => {
    if (!validateForm()) return;
    const inputs = buildInputs();
    onSave(inputs);
    setSuccess(inputs);
  };

  // ── Success Modal View ──
  if (success) {
    return (
      <>
        <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md pointer-events-auto overflow-hidden">
            <div className="px-6 py-6 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-sm">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Booking Created Successfully!</h2>
              <p className="text-xs text-slate-500 mt-1">
                Reservation for <span className="font-semibold text-slate-800">{success[0].guest_name}</span> · Room {success.map(s => s.room_no).join(', ')}
              </p>
              <div className="mt-4 bg-slate-50 rounded-2xl p-4 text-left space-y-2 border border-slate-200/80 text-xs">
                <SuccessRow label="Check-in" value={success[0].check_in_date} />
                <SuccessRow label="Check-out" value={success[0].check_out_date} />
                <SuccessRow label="Nights" value={String(nights)} />
                <SuccessRow label="Rate (per room)" value={`₹${fmtMoney(toNum(rate))}/night`} />
                <SuccessRow label="Total Amount" value={`₹${fmtMoney(invoiceTotal)}`} bold />
                <SuccessRow label="Advance Received" value={`₹${fmtMoney(totalReceived)}`} color="emerald" />
                <SuccessRow label="Balance Due" value={`₹${fmtMoney(balance)}`} color={balance > 0 ? 'amber' : 'slate'} />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
                  <FileText className="w-4 h-4 text-slate-500" /> Confirmation PDF
                </button>
                <button className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
                  <MailIcon className="w-4 h-4 text-slate-500" /> Email
                </button>
                <button className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-emerald-700 border border-emerald-200 rounded-xl hover:bg-emerald-50 transition">
                  <MessageCircle className="w-4 h-4 text-emerald-600" /> WhatsApp
                </button>
                <button onClick={onClose}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-soft-blue transition">
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
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 pointer-events-none">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col pointer-events-auto border border-slate-200/80 overflow-hidden">
          
          {/* ── Modal Header ── */}
          <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between bg-white shrink-0">
            <div>
              <h2 className="text-lg font-bold text-slate-900 leading-tight">New Booking</h2>
              <p className="text-xs text-slate-400 font-medium">Quick reservation entry</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ── Scrollable Form Body ── */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-slate-50/50 sidebar-scroll">
            
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl p-3.5 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{error}</span>
              </div>
            )}

            {/* ── SECTION 1: Guest & Stay ── */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
                <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
                  <User className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  <span className="text-sky-600 font-bold mr-1">1</span> Guest & Stay
                </h3>
              </div>

              {/* Row 1: Guest Name & Mobile */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Guest Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Enter guest name"
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mobile Number <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="px-3 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30 shrink-0"
                    >
                      <option value="+91">+91</option>
                      <option value="+1">+1</option>
                      <option value="+44">+44</option>
                      <option value="+971">+971</option>
                    </select>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Enter mobile number"
                      className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition"
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Check-in, Check-out, Nights Widget */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Check-in <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={checkIn}
                      onChange={(e) => {
                        const newCi = e.target.value;
                        setCheckIn(newCi);
                        const ciDate = new Date(newCi + 'T00:00:00');
                        ciDate.setDate(ciDate.getDate() + nights);
                        setCheckOut(ciDate.toISOString().split('T')[0]);
                      }}
                      className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Check-out <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition"
                  />
                </div>

                {/* Auto Nights Display Card */}
                <div className="bg-sky-50/70 border border-sky-100 rounded-xl p-3 flex flex-col justify-between h-[42px] sm:h-[66px] text-left">
                  <span className="text-[11px] font-semibold text-slate-500 leading-none">Nights</span>
                  <div className="flex items-baseline justify-between mt-0.5">
                    <span className="text-lg font-extrabold text-slate-900 leading-none">{nights}</span>
                    <span className="text-[10px] text-slate-400 font-medium">(Auto)</span>
                  </div>
                </div>
              </div>

              {/* Row 3: Rooms Selection & Room Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rooms <span className="text-rose-500">*</span>
                  </label>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                      <span className="font-semibold text-slate-700">
                        {roomNos.length === 0 ? 'Select room(s)' : `${roomNos.length} Room${roomNos.length > 1 ? 's' : ''} Selected`}
                      </span>
                      {roomNos.length > 0 && (
                        <span className="text-[11px] font-bold text-sky-700 bg-sky-100/80 px-2 py-0.5 rounded-md">
                          {roomNos.join(', ')}
                        </span>
                      )}
                    </div>

                    {/* Room pills grid */}
                    <div className="max-h-36 overflow-y-auto p-2 bg-slate-50/50 rounded-xl border border-slate-200/60 space-y-2">
                      {groupedRooms.map((group) => (
                        <div key={group.cat?.id ?? '__uncat'}>
                          <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
                            {group.cat?.name ?? 'Uncategorized'} ({group.rooms.length})
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {group.rooms.map((r) => {
                              const isSelected = roomNos.includes(r.room_no);
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => toggleRoom(r.room_no)}
                                  className={`px-2.5 py-1 text-xs rounded-lg border font-bold transition ${
                                    isSelected
                                      ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                                      : 'bg-white text-slate-700 border-slate-200 hover:border-sky-300 hover:bg-sky-50/50'
                                  }`}
                                >
                                  {r.room_no}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Room Type / Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedCategoryFilter}
                    onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition mb-2"
                  >
                    <option value="all">Select room type / category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Default: ₹{c.default_tariff}/night)
                      </option>
                    ))}
                  </select>

                  <div className="pt-1">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Rate / Night per Room (₹)
                    </label>
                    <input
                      type="number"
                      value={rate}
                      onChange={(e) => setRate(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="Enter rate per night"
                      className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ── SECTION 2: Booking Details ── */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
                <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  <span className="text-sky-600 font-bold mr-1">2</span> Booking Details
                </h3>
              </div>

              {/* Row 1: Booking Source, Source Category, Meal Plan */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Booking Source <span className="text-rose-500">*</span>
                  </label>
                  <input
                    list="booking-sources-list"
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    placeholder="Select source"
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition"
                  />
                  <datalist id="booking-sources-list">
                    {sources.map((s) => <option key={s.id} value={s.name} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Source Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={sourceCat}
                    onChange={(e) => setSourceCat(e.target.value as SourceCategory)}
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition"
                  >
                    {SOURCE_CATEGORIES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Meal Plan
                  </label>
                  <select
                    value={mealPlan}
                    onChange={(e) => setMealPlan(e.target.value as MealPlan)}
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition"
                  >
                    {MEAL_PLANS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Remarks (optional) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  placeholder="Add any special requests or notes..."
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition resize-none"
                />
              </div>
            </div>

            {/* ── SECTION 3: Payment Summary ── */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
                <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
                  <CreditCard className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  <span className="text-sky-600 font-bold mr-1">3</span> Payment Summary
                </h3>
              </div>

              {/* Calculation Summary Bar */}
              <div className="bg-sky-50/50 border border-sky-100 rounded-xl p-3.5 grid grid-cols-2 md:grid-cols-5 gap-3 text-left divide-y md:divide-y-0 md:divide-x divide-sky-100/80">
                <div className="pr-2">
                  <span className="block text-[11px] font-semibold text-slate-500">Rooms Count</span>
                  <span className="text-sm font-extrabold text-slate-900 mt-0.5 block">{roomNos.length || 1}</span>
                </div>
                <div className="md:pl-3 pr-2 pt-2 md:pt-0">
                  <span className="block text-[11px] font-semibold text-slate-500">Room Amount</span>
                  <span className="text-sm font-extrabold text-slate-900 mt-0.5 block">₹{fmtMoney(subtotal)}</span>
                </div>
                <div className="md:pl-3 pr-2 pt-2 md:pt-0">
                  <span className="block text-[11px] font-semibold text-slate-500">Discount</span>
                  <span className="text-sm font-extrabold text-slate-900 mt-0.5 block">₹{fmtMoney(toNum(discount))}</span>
                </div>
                <div className="md:pl-3 pr-2 pt-2 md:pt-0">
                  <span className="block text-[11px] font-semibold text-slate-500">Tax</span>
                  <span className="text-sm font-extrabold text-slate-900 mt-0.5 block">₹{fmtMoney(gst)}</span>
                </div>
                <div className="md:pl-3 pt-2 md:pt-0 col-span-2 md:col-span-1">
                  <span className="block text-[11px] font-semibold text-slate-500">Grand Total</span>
                  <span className="text-base font-extrabold text-sky-700 mt-0.5 block">₹{fmtMoney(invoiceTotal)}</span>
                </div>
              </div>

              {/* Split Payment */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Split Payment
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <SplitPayInput icon={Wallet} label="Cash" value={payCash} onChange={setPayCash} />
                  <SplitPayInput icon={Smartphone} label="UPI" value={payUpi} onChange={setPayUpi} />
                  <SplitPayInput icon={CreditCard} label="Card" value={payCard} onChange={setPayCard} />
                  <SplitPayInput icon={Banknote} label="Bank Transfer" value={payBank} onChange={setPayBank} />
                </div>
              </div>

              {/* Summary Totals Bar */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 grid grid-cols-2 gap-4 text-left">
                <div>
                  <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">Advance Received</span>
                  <span className="text-base font-extrabold text-emerald-600 block">₹{fmtMoney(totalReceived)}</span>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">Balance</span>
                  <span className={`text-base font-extrabold block ${balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    ₹{fmtMoney(balance)}
                  </span>
                </div>
              </div>
            </div>

            {/* ── SECTION 4: Advanced Details (Optional Accordion) ── */}
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full p-4.5 flex items-center justify-between hover:bg-slate-50 transition text-left"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
                    <Settings className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      <span className="text-sky-600 font-bold mr-1">4</span> Advanced Details <span className="text-slate-400 font-normal">(Optional)</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">GST details and additional settings</p>
                  </div>
                </div>
                <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
              </button>

              {showAdvanced && (
                <div className="p-5 border-t border-slate-100 bg-slate-50/30 space-y-4 text-xs">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Discount Amount (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Adults Count</label>
                      <input
                        type="number"
                        min={1}
                        value={adults}
                        onChange={(e) => setAdults(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Children Count</label>
                      <input
                        type="number"
                        min={0}
                        value={children}
                        onChange={(e) => setChildren(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Payment Mode</label>
                      <select
                        value={payMode}
                        onChange={(e) => setPayMode(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                      >
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Card">Card</option>
                        <option value="Bank">Bank Transfer</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">GST Type</label>
                      <select
                        value={gstType}
                        onChange={(e) => setGstType(e.target.value as GstType)}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                      >
                        {GST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    {gstType !== 'No Scope' && (
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">GST Rate</label>
                        <select
                          value={String(gstSlab)}
                          onChange={(e) => setGstSlab(Number(e.target.value) as GstSlab)}
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                        >
                          {GST_SLABS.map((s) => <option key={s} value={String(s)}>{s}%</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="guest@example.com"
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Company GSTIN</label>
                      <input
                        type="text"
                        value={companyGst}
                        onChange={(e) => setCompanyGst(e.target.value)}
                        placeholder="Company GST number"
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Payment Ref / UTR</label>
                      <input
                        type="text"
                        value={paymentRef}
                        onChange={(e) => setPaymentRef(e.target.value)}
                        placeholder="UTR / transaction ref number"
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Created By Staff</label>
                      <input
                        type="text"
                        value={createdBy}
                        onChange={(e) => setCreatedBy(e.target.value)}
                        placeholder="Staff name"
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Guest Address</label>
                    <textarea
                      value={guestAddress}
                      onChange={(e) => setGuestAddress(e.target.value)}
                      rows={2}
                      placeholder="Guest full address"
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30 resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* ── Modal Footer ── */}
          <div className="px-6 py-4 border-t border-slate-200/80 bg-white shrink-0 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-100 rounded-xl border border-slate-200 transition"
              >
                Save Draft
              </button>

              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving}
                className="px-6 py-2.5 text-xs sm:text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-soft-blue transition flex items-center gap-2 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PlusCircle className="w-4 h-4" />
                )}
                Create Booking
              </button>
            </div>

            <div className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5 pt-0.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>Your data is secure and encrypted</span>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

// ── Sub-components ──

const SplitPayInput = ({ icon: Icon, label, value, onChange }: {
  icon: typeof Wallet; label: string; value: number | ''; onChange: (v: number | '') => void;
}) => (
  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5">
    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 mb-1">
      <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
    <div className="relative flex items-center bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus-within:ring-2 focus-within:ring-sky-500/30">
      <span className="text-xs font-semibold text-slate-400 mr-1">₹</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
        placeholder="0.00"
        className="w-full text-xs font-bold text-slate-900 bg-transparent focus:outline-none"
      />
    </div>
  </div>
);

const SuccessRow = ({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: 'emerald' | 'amber' | 'slate' }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-slate-500 font-medium">{label}</span>
    <span className={`font-semibold ${
      bold ? 'font-extrabold text-slate-900' : ''
    } ${
      color === 'emerald' ? 'text-emerald-600 font-bold' : color === 'amber' ? 'text-amber-600 font-bold' : 'text-slate-800'
    }`}>
      {value}
    </span>
  </div>
);
