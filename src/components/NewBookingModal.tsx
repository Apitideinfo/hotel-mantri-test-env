import { useState, useMemo, useEffect } from 'react';
import {
  X, Loader2, Calendar, BedDouble, ChevronDown, Check,
  Users, Wallet, Banknote, Smartphone, CreditCard, AlertCircle,
  User, Phone, Mail, MapPin, FileText, Settings,
  CheckCircle2, MessageCircle, Mail as MailIcon, PlusCircle, Lock, RefreshCw,
  Sparkles, ShieldCheck, Tag, ArrowRight, IndianRupee,
} from 'lucide-react';
import { CelebrationBurst } from './ui/CelebrationBurst';
import type {
  HotelSettings, CompanySource, RoomCategory, Room, SourceCategory,
  MealPlan, GstType, GstSlab,
} from '@/lib/types';
import { SOURCE_CATEGORIES, MEAL_PLANS, GST_TYPES, GST_SLABS, groupRoomsByCategory, compareRoomNo } from '@/lib/types';
import { isValidEmail, type ReservationInput } from '@/lib/types-reservations';
import { fmtMoney, fmtInt, toNum, calcGstFull, addDays, calcStayNights } from '@/lib/calc';
import { apiFetch } from '@/lib/api-fetch';

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
  onSave: (input: ReservationInput | ReservationInput[]) => Promise<any> | any;
}

export const NewBookingModal = ({
  rooms, categories, sources, settings: _settings, defaultDate,
  preselectRoom, preselectCheckIn, preselectCheckOut,
  saving, onClose, onSave,
}: NewBookingModalProps) => {
  // Prevent background page from scrolling while modal is open
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  const initialRoomNos = useMemo<string[]>(() => {
    if (!preselectRoom || !preselectRoom.trim()) return [];
    return [preselectRoom.trim()];
  }, [preselectRoom]);

  const [roomNos, setRoomNos] = useState<string[]>(initialRoomNos);
  const [guestName, setGuestName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [email, setEmail] = useState('');
  const [checkIn, setCheckIn] = useState(preselectCheckIn ?? defaultDate);
  const [checkOut, setCheckOut] = useState(preselectCheckOut ?? addDays(preselectCheckIn ?? defaultDate, 1));
  const [rate, setRate] = useState<number | ''>('');
  const [roomRates, setRoomRates] = useState<Record<string, number>>({});
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
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<ReservationInput[] | null>(null);
  const [savedReservationId, setSavedReservationId] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<'EMAIL_SENT' | 'EMAIL_FAILED' | 'EMAIL_NOT_CONFIGURED' | null>(null);
  const [emailDelivery, setEmailDelivery] = useState<{ recipientEmail?: string; error?: string } | null>(null);

  const selectedRooms = useMemo(
    () => rooms.filter((r) => roomNos.some(n => n.trim().toLowerCase() === r.room_no.trim().toLowerCase())),
    [rooms, roomNos],
  );

  const nights = useMemo(() => {
    return calcStayNights(checkIn, checkOut);
  }, [checkIn, checkOut]);

  const subtotal = roomNos.reduce((sum, no) => {
    const cleanNo = (no || '').trim();
    const rRate = roomRates[cleanNo] !== undefined ? roomRates[cleanNo] : toNum(rate);
    return sum + rRate * nights;
  }, 0);
  const afterDiscount = Math.max(0, subtotal - toNum(discount));
  const { taxable: _taxable, gst, invoiceTotal } = calcGstFull(afterDiscount, gstType, gstSlab);
  const totalReceived = toNum(payCash) + toNum(payUpi) + toNum(payCard) + toNum(payBank);
  const balance = Math.max(0, invoiceTotal - totalReceived);

  const toggleRoom = (rawNo: string) => {
    const no = (rawNo || '').trim();
    if (!no) return;

    setRoomNos(prev => {
      const cleanPrev = Array.from(new Set(prev.map(n => (n || '').trim()).filter(Boolean)));
      const isRemoving = cleanPrev.some(n => n.toLowerCase() === no.toLowerCase());
      const newNos = isRemoving
        ? cleanPrev.filter(n => n.toLowerCase() !== no.toLowerCase())
        : [...cleanPrev, no];

      if (isRemoving) {
        setRoomRates(rates => {
          const next = { ...rates };
          delete next[no];
          Object.keys(next).forEach(k => {
            if (k.toLowerCase() === no.toLowerCase()) delete next[k];
          });
          return next;
        });
      } else {
        const r = rooms.find((rm) => (rm.room_no || '').trim().toLowerCase() === no.toLowerCase());
        const cat = categories.find((c) => c.id === r?.category_id);
        const rTariff = toNum(rate) > 0 ? toNum(rate) : (cat?.default_tariff ?? r?.default_tariff ?? 0);
        if (newNos.length === 1 && rate === '') {
          setRate(rTariff);
        }
        setRoomRates(rates => ({ ...rates, [no]: rTariff }));
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
    setEmailError(null);
    if (!guestName.trim()) { setError('Please enter guest name.'); return false; }
    // Mandatory email validation
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      const msg = 'Guest email is required.';
      setEmailError(msg);
      setError(msg);
      return false;
    }
    if (!isValidEmail(cleanEmail)) {
      const msg = 'Please enter a valid email address.';
      setEmailError(msg);
      setError(msg);
      return false;
    }
    if (roomNos.length === 0) { setError('Please select at least one room.'); return false; }
    if (!checkIn || !checkOut) { setError('Please select check-in and check-out dates.'); return false; }
    if (new Date(checkOut + 'T00:00:00') <= new Date(checkIn + 'T00:00:00')) {
      setError('Check-out date must be after check-in date.'); return false;
    }
    return true;
  };

  const buildInputs = (): ReservationInput[] => {
    // Strictly deduplicate room numbers
    const cleanRoomNos = Array.from(
      new Set(roomNos.map((no) => (no || '').trim()).filter(Boolean))
    );
    const groupId = cleanRoomNos.length > 1 ? crypto.randomUUID() : undefined;
    const fullPhone = phone.trim() ? `${countryCode} ${phone.trim()}` : '';
    
    return cleanRoomNos.map((no, idx) => {
      const room = rooms.find(r => (r.room_no || '').trim().toLowerCase() === no.toLowerCase());
      const advancePaid = idx === 0 ? totalReceived : 0;
      const rPayCash = idx === 0 ? toNum(payCash) : 0;
      const rPayUpi = idx === 0 ? toNum(payUpi) : 0;
      const rPayCard = idx === 0 ? toNum(payCard) : 0;
      const rPayBank = idx === 0 ? toNum(payBank) : 0;
      
      const roomCat = categories.find(c => c.id === room?.category_id);
      const fallbackTariff = toNum(rate) > 0 ? toNum(rate) : (roomCat?.default_tariff ?? room?.default_tariff ?? 0);
      const individualRate = (roomRates[no] !== undefined && toNum(roomRates[no]) > 0) ? toNum(roomRates[no]) : fallbackTariff;
      const roomSubtotal = individualRate * nights;
      const roomDiscount = toNum(discount) / (cleanRoomNos.length || 1);
      const roomAfterDiscount = Math.max(0, roomSubtotal - roomDiscount);
      const { taxable: rTaxable, gst: rGst, invoiceTotal: rInvoiceTotal } = calcGstFull(roomAfterDiscount, gstType, gstSlab);
      
      return {
        room_id: room?.id ?? null,
        room_no: room?.room_no?.trim() || no,
        guest_name: guestName.trim(),
        guest_phone: fullPhone,
        guest_email: email.trim(),
        guest_address: guestAddress.trim(),
        guest_type: guestType.trim(),
        company_gst: companyGst.trim(),
        check_in_date: checkIn,
        check_out_date: checkOut,
        rate: individualRate,
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

  const [retryingEmail, setRetryingEmail] = useState(false);

  const handleRetryEmail = async () => {
    if (!savedReservationId) return;
    setRetryingEmail(true);
    try {
      const res = await apiFetch(`/api/reservations/${savedReservationId}/confirmation/send-email`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.success) {
        setEmailStatus('EMAIL_SENT');
        setEmailDelivery({ recipientEmail: email.trim() });
      } else {
        setEmailStatus('EMAIL_FAILED');
        setEmailDelivery({ recipientEmail: email.trim(), error: res.message });
      }
    } catch (err: any) {
      setEmailStatus('EMAIL_FAILED');
      setEmailDelivery({ recipientEmail: email.trim(), error: err?.message });
    } finally {
      setRetryingEmail(false);
    }
  };

  const handleConfirm = async () => {
    if (!validateForm()) return;
    const inputs = buildInputs();
    setSubmitting(true);
    setError(null);
    try {
      const result = await onSave(inputs);
      const savedList = Array.isArray(result) ? result : [];
      const firstSaved = savedList[0];
      if (firstSaved?.id) setSavedReservationId(firstSaved.id);
      if (firstSaved?._emailStatus) {
        setEmailStatus(firstSaved._emailStatus as any);
        setEmailDelivery(firstSaved._emailDelivery || { recipientEmail: email.trim() });
      }
      setSuccess(inputs);
    } catch (err: any) {
      console.error('[NewBookingModal] Save error:', err);
      setError(err?.message || 'Failed to create reservation. Please verify room availability.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success Modal View (Celebratory Congratulations Popup) ──
  if (success) {
    const bookingIdentifier = savedReservationId || success[0].group_id || '';
    const shortId = bookingIdentifier ? bookingIdentifier.slice(0, 8).toUpperCase() : '';
    const confirmNo = shortId ? `HM-RES-${shortId}` : '';
    const recipientEmail = emailDelivery?.recipientEmail || email.trim();
    const isMultiRoom = success.length > 1;

    return (
      <>
        {/* Celebration Particle Fountains (Phuljhadiyan Effect) */}
        <CelebrationBurst active={true} durationMs={5000} />

        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-50 transition-opacity animate-in fade-in duration-200" onClick={onClose} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg pointer-events-auto overflow-hidden border border-slate-200/80 animate-in zoom-in-95 duration-200">
            {/* Top decorative gradient banner (Deep Navy + Blue Sapphire) */}
            <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-6 pt-7 pb-6 text-white text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 -mr-6 -mt-6 w-32 h-32 rounded-full bg-blue-500/20 blur-2xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 -ml-6 -mb-6 w-32 h-32 rounded-full bg-indigo-500/20 blur-2xl pointer-events-none" />
              
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 border border-white/20 text-white flex items-center justify-center mx-auto mb-3 shadow-xl ring-4 ring-white/10 animate-bounce">
                <Sparkles className="w-8 h-8 text-amber-300 drop-shadow-md" />
              </div>
              
              <span className="px-3.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-widest bg-blue-500/20 border border-blue-400/30 text-blue-200 inline-block mb-1.5 shadow-xs">
                {isMultiRoom ? `Multi-Room Group Booking (${success.length} Rooms)` : 'Confirmed Reservation'}
              </span>
              <h2 className="text-2xl font-black text-white tracking-tight">
                🎉 Congratulations!
              </h2>
              <p className="text-xs text-blue-100/90 font-medium mt-0.5">
                Reservation created and registered successfully in hotel records
              </p>
            </div>

            <div className="px-6 py-5 text-center">
              {confirmNo && (
                <div className="flex items-center justify-center gap-2 mb-3.5">
                  <span className="text-xs font-mono text-blue-700 font-extrabold bg-blue-50 border border-blue-200/80 px-3.5 py-1 rounded-xl shadow-xs">
                    Booking ID: {confirmNo}
                  </span>
                  {isMultiRoom && (
                    <span className="text-[11px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-1 rounded-xl">
                      {success.length} Rooms
                    </span>
                  )}
                </div>
              )}

              {/* Email delivery status badge */}
              {emailStatus && (
                <div className={`mb-4 mx-auto max-w-sm rounded-xl px-3.5 py-2 text-xs font-bold flex items-center gap-2 text-left ${
                  emailStatus === 'EMAIL_SENT'
                    ? 'bg-emerald-50 border border-emerald-300 text-emerald-800'
                    : emailStatus === 'EMAIL_NOT_CONFIGURED'
                    ? 'bg-amber-50 border border-amber-300 text-amber-800'
                    : 'bg-rose-50 border border-rose-300 text-rose-800'
                }`}>
                  {emailStatus === 'EMAIL_SENT' ? (
                    <><CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /><span>Confirmation email sent to {recipientEmail}</span></>
                  ) : emailStatus === 'EMAIL_NOT_CONFIGURED' ? (
                    <><AlertCircle className="w-4 h-4 shrink-0 text-amber-600" /><span>Email not configured — PDF voucher ready to download</span></>
                  ) : (
                    <><AlertCircle className="w-4 h-4 shrink-0 text-rose-600" /><span>Confirmation email could not be sent to {recipientEmail}</span></>
                  )}
                </div>
              )}

              <div className="bg-slate-50/80 rounded-2xl p-4 text-left space-y-2.5 border border-slate-200 text-xs shadow-inner">
                <SuccessRow label="Guest Name" value={success[0].guest_name} bold />
                <SuccessRow label="Allocated Rooms" value={success.map(s => `Room ${s.room_no}`).join(', ')} bold color="blue" />
                <SuccessRow label="Check-In" value={success[0].check_in_date} />
                <SuccessRow label="Check-Out" value={success[0].check_out_date} />
                <SuccessRow label="Stay Duration" value={`${nights} ${nights === 1 ? 'Night' : 'Nights'}`} />
                <SuccessRow label="Total Amount" value={`₹${fmtInt(invoiceTotal)}`} bold />
                <SuccessRow label="Advance Received" value={`₹${fmtInt(totalReceived)}`} color="emerald" />
                <SuccessRow label="Balance Due" value={`₹${fmtInt(balance)}`} color={balance > 0 ? 'amber' : 'slate'} bold />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2.5">
                {savedReservationId && (
                  <a
                    href={`/api/reservations/${savedReservationId}/confirmation/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition shadow-xs active:scale-95"
                  >
                    <FileText className="w-4 h-4 text-blue-600" /> Download Voucher
                  </a>
                )}
                {(emailStatus === 'EMAIL_FAILED' || emailStatus === 'EMAIL_NOT_CONFIGURED') && savedReservationId && (
                  <button
                    onClick={handleRetryEmail}
                    disabled={retryingEmail}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-rose-700 border border-rose-200 rounded-xl hover:bg-rose-50 transition disabled:opacity-60 shadow-xs cursor-pointer active:scale-95"
                  >
                    {retryingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {emailStatus === 'EMAIL_NOT_CONFIGURED' ? 'Configure Email' : 'Retry Email'}
                  </button>
                )}
                <button 
                  onClick={onClose}
                  className={`${savedReservationId ? '' : 'col-span-2'} flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition active:scale-95 cursor-pointer`}
                >
                  <Check className="w-4 h-4" /> Done & View Board
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
      <div 
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 transition-opacity" 
        onClick={onClose} 
      />

      {/* Centered Modal Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 pointer-events-none overflow-y-auto">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col pointer-events-auto border border-slate-200/90 overflow-hidden animate-scale-in my-auto">
          
          {/* ── Modal Header ── */}
          <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white flex items-center justify-between shrink-0 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 text-indigo-300 border border-indigo-400/30 flex items-center justify-center shrink-0 shadow-inner">
                <PlusCircle className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-base font-black text-white leading-tight">Create New Reservation</h2>
                <p className="text-xs text-slate-300 font-medium">Quick front-desk booking entry & room allocation</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ── Scrollable Form Body ── */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-slate-50/40">
            
            {error && (
              <div className="bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold rounded-2xl p-3.5 flex items-center gap-2 shadow-2xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {/* ── SECTION 1: Guest & Stay ── */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <User className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                  <span className="text-indigo-600 font-black mr-1">1.</span> Guest & Stay Details
                </h3>
              </div>

              {/* Row 1: Guest Name & Mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Guest Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Enter guest name"
                    className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mobile Number <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="px-2.5 py-2.5 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 shrink-0"
                    >
                      <option value="+91">+91 (IN)</option>
                      <option value="+1">+1 (US)</option>
                      <option value="+44">+44 (UK)</option>
                      <option value="+971">+971 (UAE)</option>
                    </select>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="10-digit mobile number"
                      className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition font-semibold"
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Guest Email — MANDATORY */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Guest Email <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) {
                        const v = e.target.value.trim();
                        if (v && isValidEmail(v)) setEmailError(null);
                      }
                    }}
                    onBlur={() => {
                      const v = email.trim();
                      if (!v) setEmailError('Guest email is required.');
                      else if (!isValidEmail(v)) setEmailError('Please enter a valid email address.');
                      else setEmailError(null);
                    }}
                    placeholder="guest@example.com"
                    className={`w-full pl-9 pr-3.5 py-2.5 text-xs text-slate-900 bg-white border ${
                      emailError ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-200 focus:ring-indigo-500/30 focus:border-indigo-500'
                    } rounded-xl focus:outline-none focus:ring-2 transition font-semibold`}
                  />
                </div>
                {emailError && (
                  <p className="text-xs text-rose-600 mt-1 flex items-center gap-1 font-bold">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />{emailError}
                  </p>
                )}
              </div>

              {/* Row 3: Check-in, Check-out, Nights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Check-in Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={checkIn}
                    onChange={(e) => {
                      const newCi = e.target.value;
                      setCheckIn(newCi);
                      if (newCi) {
                        setCheckOut(addDays(newCi, nights));
                      }
                    }}
                    className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Check-out Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={checkOut}
                    min={addDays(checkIn, 1)}
                    onChange={(e) => {
                      const newCo = e.target.value;
                      if (newCo && newCo <= checkIn) {
                        setCheckOut(addDays(checkIn, 1));
                      } else {
                        setCheckOut(newCo);
                      }
                    }}
                    className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
                  />
                </div>

                {/* Auto Nights Display Card */}
                <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-3 flex items-center justify-between h-[42px]">
                  <span className="text-xs font-bold text-indigo-900">Duration:</span>
                  <span className="text-sm font-black text-indigo-700">{nights} Night{nights > 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Row 4: Room Selection & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Select Room(s) <span className="text-rose-500">*</span>
                    </label>
                    {roomNos.length > 0 && (
                      <span className="text-[11px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                        {roomNos.length} Selected
                      </span>
                    )}
                  </div>

                  {/* Room pills grid */}
                  <div className="max-h-40 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    {groupedRooms.map((group) => (
                      <div key={group.cat?.id ?? '__uncat'}>
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">
                          {group.cat?.name ?? 'Uncategorized'} ({group.rooms.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {group.rooms.map((r) => {
                            const isSelected = roomNos.some(n => (n || '').trim().toLowerCase() === (r.room_no || '').trim().toLowerCase());
                            return (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => toggleRoom(r.room_no)}
                                className={`px-3 py-1.5 text-xs rounded-xl border font-black transition cursor-pointer ${
                                  isSelected
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs scale-105'
                                    : 'bg-white text-slate-800 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50'
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

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Room Type / Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedCategoryFilter}
                    onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold mb-3"
                  >
                    <option value="all">Select room category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Default: ₹{fmtInt(c.default_tariff)}/night)
                      </option>
                    ))}
                  </select>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700">
                        {roomNos.length > 1 ? 'Default Rate / Night (₹)' : 'Rate / Night (₹)'}
                      </label>
                      {roomNos.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (rate === '') return;
                            const r = toNum(rate);
                            setRoomRates(() => {
                              const next: Record<string, number> = {};
                              for (const no of roomNos) next[no] = r;
                              return next;
                            });
                          }}
                          className="px-2 py-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition cursor-pointer"
                        >
                          Apply to All Rooms
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={rate}
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : Number(e.target.value);
                        setRate(val);
                        if (val !== '') {
                          const num = Number(val);
                          setRoomRates((prev) => {
                            const next = { ...prev };
                            for (const no of roomNos) {
                              next[no] = num;
                            }
                            return next;
                          });
                        }
                      }}
                      placeholder="Enter rate per night"
                      className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-black"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ── SECTION 2: Source & Payment ── */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                  <span className="text-emerald-600 font-black mr-1">2.</span> Channel Source & Advance Payment
                </h3>
              </div>

              {/* Row 1: Source & Meal Plan */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Booking Source <span className="text-rose-500">*</span>
                  </label>
                  <input
                    list="booking-sources-list"
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    placeholder="e.g. MakeMyTrip, Walk-In"
                    className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
                  />
                  <datalist id="booking-sources-list">
                    {sources.map((s) => <option key={s.id} value={s.name} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Source Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={sourceCat}
                    onChange={(e) => setSourceCat(e.target.value as SourceCategory)}
                    className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
                  >
                    {SOURCE_CATEGORIES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Meal Plan
                  </label>
                  <select
                    value={mealPlan}
                    onChange={(e) => setMealPlan(e.target.value as MealPlan)}
                    className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
                  >
                    {MEAL_PLANS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Financial Calculation Summary Bar */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
                <div>
                  <span className="block text-[11px] font-bold text-slate-500">Rooms & Nights</span>
                  <span className="text-xs font-black text-slate-800 mt-0.5 block">{roomNos.length || 1} Rooms · {nights} Nights</span>
                </div>
                <div>
                  <span className="block text-[11px] font-bold text-slate-500">Stay Subtotal</span>
                  <span className="text-xs font-black text-slate-900 mt-0.5 block">₹{fmtInt(subtotal)}</span>
                </div>
                <div>
                  <span className="block text-[11px] font-bold text-slate-500">Advance Paid</span>
                  <span className="text-xs font-black text-emerald-700 mt-0.5 block">₹{fmtInt(totalReceived)}</span>
                </div>
                <div>
                  <span className="block text-[11px] font-bold text-slate-500">Balance Due</span>
                  <span className={`text-xs font-black mt-0.5 block ${balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    ₹{fmtInt(balance)}
                  </span>
                </div>
              </div>

              {/* Split Payment Inputs */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Advance Payment Entry
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <SplitPayInput icon={Wallet} label="Cash" value={payCash} onChange={setPayCash} />
                  <SplitPayInput icon={Smartphone} label="UPI" value={payUpi} onChange={setPayUpi} />
                  <SplitPayInput icon={CreditCard} label="Card" value={payCard} onChange={setPayCard} />
                  <SplitPayInput icon={Banknote} label="Bank Transfer" value={payBank} onChange={setPayBank} />
                </div>
              </div>
            </div>

            {/* ── SECTION 3: Advanced Options Accordion ── */}
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-500" />
                  <div>
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      Additional Guest Details & GST Settings
                    </h3>
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
              </button>

              {showAdvanced && (
                <div className="p-5 border-t border-slate-100 bg-slate-50/50 space-y-3.5 text-xs">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Discount (₹)</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                        className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Adults Count</label>
                      <input
                        type="number"
                        min={1}
                        value={adults}
                        onChange={(e) => setAdults(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
                        className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Children Count</label>
                      <input
                        type="number"
                        min={0}
                        value={children}
                        onChange={(e) => setChildren(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                        className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Primary Pay Mode</label>
                      <select
                        value={payMode}
                        onChange={(e) => setPayMode(e.target.value)}
                        className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
                      >
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Card">Card</option>
                        <option value="Bank">Bank Transfer</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">GST Scope</label>
                      <select
                        value={gstType}
                        onChange={(e) => setGstType(e.target.value as GstType)}
                        className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
                      >
                        {GST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    {gstType !== 'No Scope' && (
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">GST Rate</label>
                        <select
                          value={String(gstSlab)}
                          onChange={(e) => setGstSlab(Number(e.target.value) as GstSlab)}
                          className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
                        >
                          {GST_SLABS.map((s) => <option key={s} value={String(s)}>{s}%</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Company GSTIN</label>
                      <input
                        type="text"
                        value={companyGst}
                        onChange={(e) => setCompanyGst(e.target.value)}
                        placeholder="Company GSTIN"
                        className="w-full px-3.5 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Payment Reference / UTR</label>
                      <input
                        type="text"
                        value={paymentRef}
                        onChange={(e) => setPaymentRef(e.target.value)}
                        placeholder="UTR / transaction ref"
                        className="w-full px-3.5 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Special Remarks / Requests</label>
                    <textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      rows={2}
                      placeholder="Add guest special requests or front-desk notes..."
                      className="w-full px-3.5 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none font-medium"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Modal Footer ── */}
          <div className="px-6 py-4 border-t border-slate-200/90 bg-white shrink-0 flex items-center justify-between gap-3 shadow-2xs">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl border border-slate-200 transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving || submitting}
              className="px-6 py-2.5 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition flex items-center gap-2 disabled:opacity-60 active:scale-95 cursor-pointer"
            >
              {saving || submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <PlusCircle className="w-4 h-4" />
              )}
              {submitting ? 'Creating Reservation…' : 'Create Booking'}
            </button>
          </div>

        </div>
      </div>
    </>
  );
};

const SplitPayInput = ({ icon: Icon, label, value, onChange }: {
  icon: typeof Wallet; label: string; value: number | ''; onChange: (v: number | '') => void;
}) => (
  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1">
      <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
    <div className="relative flex items-center bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus-within:ring-2 focus-within:ring-indigo-500/30">
      <span className="text-xs font-bold text-slate-400 mr-1">₹</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
        placeholder="0.00"
        className="w-full text-xs font-black text-slate-900 bg-transparent focus:outline-none"
      />
    </div>
  </div>
);

const SuccessRow = ({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: 'emerald' | 'amber' | 'slate' }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-slate-500 font-medium">{label}</span>
    <span className={`font-semibold ${
      bold ? 'font-black text-slate-900' : ''
    } ${
      color === 'emerald' ? 'text-emerald-700 font-black' : color === 'amber' ? 'text-amber-700 font-black' : 'text-slate-800'
    }`}>
      {value}
    </span>
  </div>
);
