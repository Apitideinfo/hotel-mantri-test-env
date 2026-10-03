import { useEffect, useState, useMemo } from 'react';
import {
  X, Loader2, User, Phone, BedDouble, Calendar, Clock,
  FileCheck, AlertCircle, CheckCircle2, ChevronRight, ChevronLeft,
  CreditCard, ShieldCheck, LogIn, Search, Plus, Trash2,
  Mail, Sparkles, Moon, ArrowRight, IndianRupee, Tag,
  Building2, Check, AlertTriangle, ShieldAlert
} from 'lucide-react';
import type {
  Room, RoomCategory, CompanySource, HotelSettings,
  SourceCategory, PayMode, MealPlan, GstType, GstSlab,
  FrontOfficeRole,
} from '@/lib/types';
import { compareRoomNo, normalizePayMode } from '@/lib/types';
import { isValidEmail, type Reservation } from '@/lib/types-reservations';
import { fmtMoney, toNum, calcGstFull, calcStayNights, addDays } from '@/lib/calc';
import { checkInGuest, validateCheckIn } from '@/lib/api-frontoffice';
import { checkRoomAvailability } from '@/lib/api-reservations';

interface CheckInModalProps {
  reservation?: Reservation;
  rooms: Room[];
  categories: RoomCategory[];
  sources: CompanySource[];
  settings: HotelSettings | null;
  role: FrontOfficeRole | null;
  defaultDate: string;
  onClose: () => void;
  onCheckedIn: () => void;
}

const ID_PROOF_TYPES = ['Aadhaar Card', 'Passport', 'Driving License', 'Voter ID', 'Govt Employee ID', 'Other Valid ID'];
const UNAVAILABLE_HOUSEKEEPING = new Set(['Occupied', 'Occupied Clean', 'Occupied Service Due', 'Out Of Order', 'OutOfOrder', 'Blocked']);
interface CheckInRoomRow { roomNo: string; rate: number | '' }

export const CheckInModal = ({
  reservation, rooms, categories, sources, settings, role, defaultDate, onClose, onCheckedIn,
}: CheckInModalProps) => {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [guestName, setGuestName] = useState(reservation?.guest_name ?? '');
  const [phone, setPhone] = useState(reservation?.guest_phone ?? '');
  const [email, setEmail] = useState(reservation?.guest_email ?? '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [roomRows, setRoomRows] = useState<CheckInRoomRow[]>([
    { roomNo: reservation?.room_no ?? '', rate: reservation?.rate ?? '' },
  ]);
  const [checkIn, setCheckIn] = useState(reservation?.check_in_date ?? defaultDate);
  const [checkOut, setCheckOut] = useState(reservation?.check_out_date ?? addDays(defaultDate, 1));
  const [categoryFilter, setCategoryFilter] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [availableRoomNos, setAvailableRoomNos] = useState<Set<string>>(new Set());
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [defaultRate, setDefaultRate] = useState<number | ''>(reservation?.rate ?? '');
  const [arrivalTime, setArrivalTime] = useState(new Date().toTimeString().slice(0, 5));
  const [idProofType, setIdProofType] = useState('Aadhaar Card');
  const [idProofNumber, setIdProofNumber] = useState('');
  const [idVerified, setIdVerified] = useState(false);
  const [performedBy, setPerformedBy] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Background Scroll Lock & Escape key listener
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Load available rooms for selected dates
  useEffect(() => {
    let cancelled = false;
    setAvailabilityLoading(true);
    Promise.all(rooms.filter((room) => room.is_active && !UNAVAILABLE_HOUSEKEEPING.has(room.housekeeping_status)).map(async (room) => {
      const available = await checkRoomAvailability(room.room_no, checkIn, checkOut, reservation?.id);
      return available ? room.room_no.trim().toLowerCase() : null;
    })).then((roomNos) => {
      if (!cancelled) setAvailableRoomNos(new Set(roomNos.filter((roomNo): roomNo is string => Boolean(roomNo))));
    }).catch(() => {
      if (!cancelled) setAvailableRoomNos(new Set());
    }).finally(() => {
      if (!cancelled) setAvailabilityLoading(false);
    });
    return () => { cancelled = true; };
  }, [checkIn, checkOut, reservation?.id, rooms]);

  const selectedRoomNos = useMemo(() => new Set(roomRows.map((row) => row.roomNo.trim().toLowerCase()).filter(Boolean)), [roomRows]);
  
  const filteredRooms = useMemo(() => rooms
    .filter((room) => {
      const category = categories.find((item) => item.id === room.category_id);
      const matchesCategory = !categoryFilter || room.category_id === categoryFilter;
      const matchesSearch = !roomSearch || room.room_no.toLowerCase().includes(roomSearch.toLowerCase());
      const isReservationRoom = reservation?.room_no.trim().toLowerCase() === room.room_no.trim().toLowerCase();
      return room.is_active && matchesCategory && matchesSearch && (availableRoomNos.has(room.room_no.trim().toLowerCase()) || isReservationRoom);
    })
    .sort((a, b) => compareRoomNo(a.room_no, b.room_no)),
  [rooms, categories, categoryFilter, roomSearch, availableRoomNos, reservation]);

  const nights = useMemo(() => calcStayNights(checkIn, checkOut), [checkIn, checkOut]);
  const totalAmount = roomRows.reduce((sum, row) => sum + toNum(row.rate) * nights, 0);
  const advanceAmount = toNum(reservation?.advance_paid) || (toNum(reservation?.pay_cash) + toNum(reservation?.pay_upi) + toNum(reservation?.pay_card) + toNum(reservation?.pay_bank));
  const dueBalance = Math.max(0, totalAmount - advanceAmount);

  const updateRoomRow = (index: number, changes: Partial<CheckInRoomRow>) => {
    setRoomRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row));
  };

  const addRoomRow = () => setRoomRows((rows) => [...rows, { roomNo: '', rate: 0 }]);
  const removeRoomRow = (index: number) => setRoomRows((rows) => rows.length === 1 ? rows : rows.filter((_, rowIndex) => rowIndex !== index));

  const handleRoomSelect = (index: number, room: Room) => {
    const category = categories.find((item) => item.id === room.category_id);
    updateRoomRow(index, { roomNo: room.room_no, rate: category?.default_tariff ?? room.default_tariff ?? 0 });
  };

  const handleCheckIn = async () => {
    if (saving) return;
    setError(null);
    if (!guestName.trim()) { setError('Guest name is required.'); setStep(0); return; }
    if (!phone.trim()) { setError('Mobile number is required.'); setStep(0); return; }
    const cleanDigits = phone.trim().replace(/\D/g, '');
    if (cleanDigits.length < 10) { setError('Please enter a valid 10-digit mobile number.'); setStep(0); return; }
    if (!email.trim()) { setError('Guest email address is required.'); setStep(0); return; }
    if (!isValidEmail(email.trim())) { setError('Please enter a valid email address (e.g. guest@example.com).'); setStep(0); return; }
    if (roomRows.some((row) => !row.roomNo)) { setError('Please select a room for all room rows.'); setStep(0); return; }
    if (selectedRoomNos.size !== roomRows.length) { setError('The same room cannot be selected twice.'); setStep(0); return; }

    const baseParams = {
      guestName: guestName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      checkIn,
      checkOut,
      sourceCategory: (reservation?.source_category || 'Direct') as SourceCategory,
      sourceName: reservation?.source_name || 'Front Desk Walk-In',
      paymentMode: normalizePayMode(reservation?.payment_mode),
      advancePaid: reservation?.advance_paid,
      payCash: reservation?.pay_cash,
      payUpi: reservation?.pay_upi,
      payCard: reservation?.pay_card,
      payBank: reservation?.pay_bank,
      mealPlan: (reservation?.meal_plan || 'EP') as MealPlan,
      gstType: (reservation?.gst_type || 'No Scope') as GstType,
      gstSlab: (reservation?.gst_slab || '0%') as GstSlab,
      adults: reservation?.adults || 1,
      children: reservation?.children || 0,
      idProofType,
      idProofNumber: idProofNumber.trim(),
      idProofVerified: idVerified,
      arrivalTime,
      performedBy: performedBy.trim(),
    };

    const validationError = validateCheckIn({ ...baseParams, roomNo: roomRows[0].roomNo, rate: toNum(roomRows[0].rate) });
    if (validationError) { setError(validationError); return; }

    setSaving(true);
    try {
      for (const [index, room] of roomRows.entries()) {
        await checkInGuest({
          ...baseParams,
          reservationId: index === 0 ? reservation?.id : undefined,
          roomNo: room.roomNo,
          rate: toNum(room.rate),
          payCash: index === 0 ? reservation?.pay_cash : 0,
          payUpi: index === 0 ? reservation?.pay_upi : 0,
          payCard: index === 0 ? reservation?.pay_card : 0,
          payBank: index === 0 ? reservation?.pay_bank : 0,
          advancePaid: index === 0 ? reservation?.advance_paid : 0,
        });
      }
      setSuccess(true);
      setTimeout(() => { onCheckedIn(); }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to complete check-in because the room occupancy record could not be created.');
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100 animate-in zoom-in-95 duration-200">
          <div className="w-20 h-20 rounded-full bg-emerald-50 border-4 border-emerald-100 flex items-center justify-center mx-auto mb-5 shadow-inner">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 animate-bounce" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Guest Checked In!</h2>
          <p className="text-sm font-medium text-slate-600 mt-2">
            <strong className="text-slate-900 font-bold">{guestName}</strong> is now checked into{' '}
            <span className="text-indigo-600 font-bold">{roomRows.map(r => r.roomNo).join(', ')}</span>
          </p>
          <div className="mt-4 py-2 px-3 bg-emerald-50 border border-emerald-200/80 rounded-xl text-xs font-semibold text-emerald-800 flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            Room status updated to Occupied
          </div>
        </div>
      </div>
    );
  }

  const stepLabels = [
    { title: 'Guest & Rooms', desc: 'Stay details & rates' },
    { title: 'ID & Arrival', desc: 'Verification & staff' },
    { title: 'Review & Confirm', desc: 'Financial summary' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
      {/* Background click dismiss */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Modal Dialog Center Box */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-100 z-10 animate-in zoom-in-95 duration-200">
        
        {/* ── Premium Modern Header ── */}
        <div className="bg-gradient-to-r from-[#0a1b38] via-[#102a5c] to-[#0a1b38] text-white px-6 py-5 flex items-center justify-between border-b border-blue-900/40 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 border border-indigo-300/30">
              <LogIn className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Express Guest Check-In</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-500/30 text-blue-200 border border-blue-400/20">
                  {reservation ? 'Reservation' : 'Walk-In'}
                </span>
              </div>
              <p className="text-xs text-blue-200/80 mt-0.5 font-medium">
                {stepLabels[step].title} — {stepLabels[step].desc}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-blue-200 hover:text-white flex items-center justify-center transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Stepper Navigation Bar ── */}
        <div className="px-6 py-3.5 bg-slate-50/90 border-b border-slate-200/80 flex items-center justify-between shrink-0">
          {stepLabels.map((item, i) => (
            <div key={item.title} className="flex items-center flex-1">
              <button
                type="button"
                onClick={() => { if (i < step) setStep(i as 0 | 1 | 2); }}
                className={`flex items-center gap-2.5 transition text-left cursor-pointer group ${
                  i === step
                    ? 'text-indigo-600 font-bold'
                    : i < step
                    ? 'text-slate-800 font-semibold hover:text-indigo-600'
                    : 'text-slate-400 font-medium cursor-default'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black transition ${
                    i < step
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : i === step
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-4 ring-indigo-100'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {i < step ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs leading-none font-bold">{item.title}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{item.desc}</p>
                </div>
              </button>
              {i < 2 && (
                <div
                  className={`flex-1 h-0.5 mx-3 rounded-full transition ${
                    i < step ? 'bg-emerald-500' : 'bg-slate-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* ── Modal Body Content (Scrollable) ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-2xl p-4 flex items-start gap-3 shadow-sm animate-in shake">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">Check-In Action Notice</p>
                <p className="mt-0.5 text-rose-700 font-normal">{error}</p>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              STEP 0: Guest Profile & Room Allocation
             ══════════════════════════════════════════════════ */}
          {step === 0 && (
            <div className="space-y-5">
              {/* Guest Profile Section */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3.5 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  <User className="w-4 h-4 text-indigo-600" />
                  Primary Guest Information
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Guest Full Name <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm font-semibold text-slate-900 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 transition shadow-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Mobile Number <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex rounded-xl shadow-xs">
                      <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-slate-200 bg-slate-50 text-slate-600 font-bold text-xs">
                        +91
                      </span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPhone(v);
                          if (v.trim().replace(/\D/g, '').length >= 10) setPhoneError(null);
                        }}
                        onBlur={() => {
                          const digits = phone.trim().replace(/\D/g, '');
                          if (!phone.trim()) setPhoneError('Mobile number is required.');
                          else if (digits.length < 10) setPhoneError('Please enter a 10-digit number.');
                          else setPhoneError(null);
                        }}
                        placeholder="9876543210"
                        className={`w-full px-3.5 py-2.5 text-sm font-semibold text-slate-900 border rounded-r-xl focus:outline-none focus:ring-2 transition ${
                          phoneError ? 'border-rose-400 focus:ring-rose-500/25' : 'border-slate-200 focus:ring-indigo-500/25 focus:border-indigo-500'
                        }`}
                      />
                    </div>
                    {phoneError && (
                      <p className="text-[11px] font-semibold text-rose-600 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {phoneError}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Email Address <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEmail(v);
                          if (v.trim() && isValidEmail(v.trim())) setEmailError(null);
                        }}
                        onBlur={() => {
                          if (!email.trim()) setEmailError('Email address is required.');
                          else if (!isValidEmail(email.trim())) setEmailError('Please enter a valid email.');
                          else setEmailError(null);
                        }}
                        placeholder="guest@example.com"
                        className={`w-full pl-10 pr-3.5 py-2.5 text-sm font-semibold text-slate-900 border rounded-xl focus:outline-none focus:ring-2 transition shadow-xs ${
                          emailError ? 'border-rose-400 focus:ring-rose-500/25' : 'border-slate-200 focus:ring-indigo-500/25 focus:border-indigo-500'
                        }`}
                      />
                    </div>
                    {emailError && (
                      <p className="text-[11px] font-semibold text-rose-600 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {emailError}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Stay Dates & Duration */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    Stay Duration
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold text-xs rounded-lg">
                    <Moon className="w-3.5 h-3.5 text-indigo-600" />
                    {nights} {nights === 1 ? 'Night' : 'Nights'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Check-In Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={checkIn}
                      onChange={(e) => {
                        const nextIn = e.target.value;
                        setCheckIn(nextIn);
                        if (nextIn && checkOut <= nextIn) {
                          setCheckOut(addDays(nextIn, 1));
                        }
                      }}
                      className="w-full px-3.5 py-2.5 text-sm font-semibold text-slate-900 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 transition shadow-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Check-Out Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={checkOut}
                      min={addDays(checkIn, 1)}
                      onChange={(e) => {
                        const nextOut = e.target.value;
                        if (nextOut && nextOut <= checkIn) {
                          setCheckOut(addDays(checkIn, 1));
                        } else {
                          setCheckOut(nextOut);
                        }
                      }}
                      className="w-full px-3.5 py-2.5 text-sm font-semibold text-slate-900 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 transition shadow-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Room Allocation Matrix */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3.5 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                    <BedDouble className="w-4 h-4 text-indigo-600" />
                    Assigned Rooms ({roomRows.length})
                  </div>
                  {roomRows.length > 1 && (
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">₹</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="Rate"
                          value={defaultRate}
                          onChange={(e) => setDefaultRate(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                          className="w-24 pl-6 pr-2 py-1 text-xs font-semibold border border-slate-200 rounded-lg text-right"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (defaultRate === '') return;
                          const r = toNum(defaultRate);
                          setRoomRows((rows) => rows.map((row) => ({ ...row, rate: r })));
                        }}
                        className="px-2.5 py-1 text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg transition cursor-pointer"
                      >
                        Apply to All
                      </button>
                    </div>
                  )}
                </div>

                {/* Filter and Search Bar for Rooms */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      value={roomSearch}
                      onChange={(e) => setRoomSearch(e.target.value)}
                      placeholder="Quick filter room no…"
                      className="w-full pl-8 pr-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">All Categories</option>
                    {categories.filter((c) => c.is_active).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Room Row Cards */}
                <div className="space-y-2.5">
                  {roomRows.map((row, index) => {
                    const selected = rooms.find((r) => r.room_no.trim().toLowerCase() === row.roomNo.trim().toLowerCase());
                    const category = categories.find((c) => c.id === selected?.category_id);
                    return (
                      <div
                        key={index}
                        className="rounded-2xl border border-slate-200 p-3.5 bg-slate-50/50 hover:bg-white transition space-y-2.5 shadow-2xs"
                      >
                        <div className="grid grid-cols-[1fr_1fr_auto] gap-2.5 items-end">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">
                              Select Room <span className="text-rose-500">*</span>
                            </label>
                            <select
                              value={row.roomNo}
                              onChange={(e) => {
                                const room = rooms.find((r) => r.room_no === e.target.value);
                                if (room) handleRoomSelect(index, room);
                              }}
                              className="w-full px-3 py-2 text-sm font-bold text-slate-800 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                            >
                              <option value="">
                                {availabilityLoading ? 'Checking availability…' : '— Choose Room —'}
                              </option>
                              {filteredRooms
                                .filter((room) => !selectedRoomNos.has(room.room_no.trim().toLowerCase()) || room.room_no === row.roomNo)
                                .map((room) => {
                                  const cat = categories.find((c) => c.id === room.category_id);
                                  return (
                                    <option key={room.id} value={room.room_no}>
                                      Room {room.room_no} ({cat?.name || 'Standard'})
                                    </option>
                                  );
                                })}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">
                              Nightly Tariff (₹)
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                              <input
                                type="number"
                                min="0"
                                value={row.rate}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  updateRoomRow(index, { rate: raw === '' ? '' : Math.max(0, Number(raw)) });
                                }}
                                onBlur={() => {
                                  if (row.rate === '') updateRoomRow(index, { rate: 0 });
                                }}
                                placeholder="0"
                                className="w-full pl-7 pr-3 py-2 text-sm font-bold text-slate-800 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                              />
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeRoomRow(index)}
                            disabled={roomRows.length === 1}
                            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition disabled:opacity-20 cursor-pointer"
                            title="Remove Room"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {selected && (
                          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                            <span>Category: <strong className="text-slate-700 font-semibold">{category?.name || 'Standard'}</strong></span>
                            <span>Floor: <strong className="text-slate-700 font-semibold">{selected.floor ?? 1}</strong></span>
                            <span className="text-emerald-600 font-bold">✓ Ready for check-in</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={addRoomRow}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100/70 border border-indigo-200/80 rounded-xl transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Add Another Room for this Guest
                </button>
              </div>

              {/* Total Tariff Calculation Strip */}
              <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-4 flex items-center justify-between shadow-md">
                <div>
                  <p className="text-xs text-indigo-200 font-medium">Estimated Stay Tariff</p>
                  <p className="text-[11px] text-slate-300">
                    {roomRows.length} Room{roomRows.length === 1 ? '' : 's'} × {nights} Night{nights === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-white tracking-tight">₹{fmtMoney(totalAmount)}</p>
                  {advanceAmount > 0 && (
                    <p className="text-[11px] text-emerald-300 font-semibold">
                      Advance: ₹{fmtMoney(advanceAmount)} · Due: ₹{fmtMoney(dueBalance)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              STEP 1: ID Proof & Arrival Verification
             ══════════════════════════════════════════════════ */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Guest Overview Card */}
              <div className="bg-indigo-50/80 border border-indigo-100 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-xs">
                    {guestName ? guestName.slice(0, 2).toUpperCase() : 'G'}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{guestName || 'Unnamed Guest'}</h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Rooms: <strong className="text-indigo-700">{roomRows.map(r => r.roomNo).join(', ')}</strong> · {nights} Nights
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-700">₹{fmtMoney(totalAmount)}</span>
                  <p className="text-[10px] text-slate-400">Total Tariff</p>
                </div>
              </div>

              {/* Arrival Time */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Actual Arrival Time
                </label>
                <div className="relative">
                  <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="time"
                    value={arrivalTime}
                    onChange={(e) => setArrivalTime(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm font-semibold text-slate-900 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 transition shadow-xs"
                  />
                </div>
              </div>

              {/* ID Proof Selection */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3.5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  Guest Identity Verification (Government ID)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      ID Document Type
                    </label>
                    <select
                      value={idProofType}
                      onChange={(e) => setIdProofType(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm font-semibold text-slate-900 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                    >
                      {ID_PROOF_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      ID Number / Reference
                    </label>
                    <div className="relative">
                      <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={idProofNumber}
                        onChange={(e) => setIdProofNumber(e.target.value)}
                        placeholder="e.g. 5432-8765-1234"
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm font-semibold text-slate-900 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                      />
                    </div>
                  </div>
                </div>

                {/* ID Verified Toggle Card */}
                <button
                  type="button"
                  onClick={() => setIdVerified((v) => !v)}
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl border-2 transition cursor-pointer text-left ${
                    idVerified
                      ? 'border-emerald-500 bg-emerald-50/70 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center transition ${
                      idVerified ? 'bg-emerald-600 text-white shadow-xs' : 'border-2 border-slate-300'
                    }`}
                  >
                    {idVerified && <Check className="w-4 h-4" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-800">
                      Physical ID Verified by Front Office
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Confirm that the guest's physical ID matches the details entered
                    </p>
                  </div>
                  <ShieldCheck className={`w-5 h-5 ${idVerified ? 'text-emerald-600' : 'text-slate-300'}`} />
                </button>
              </div>

              {/* Performed By Staff */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Duty Manager / Staff Name
                </label>
                <input
                  type="text"
                  value={performedBy}
                  onChange={(e) => setPerformedBy(e.target.value)}
                  placeholder="e.g. Front Desk Executive"
                  className="w-full px-3.5 py-2.5 text-sm font-semibold text-slate-900 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                />
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              STEP 2: Review & Final Confirmation
             ══════════════════════════════════════════════════ */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Receipt Summary Card */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white px-5 py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-indigo-300" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                      Check-In Summary & Folio Initial
                    </h3>
                  </div>
                  <span className="text-xs font-bold text-emerald-400">Ready to commit</span>
                </div>

                <div className="p-5 space-y-3 divide-y divide-slate-100">
                  <div className="flex items-center justify-between text-sm pt-1">
                    <span className="text-slate-500 font-medium">Guest Name</span>
                    <span className="font-bold text-slate-900">{guestName}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm pt-3">
                    <span className="text-slate-500 font-medium">Allocated Rooms</span>
                    <span className="font-bold text-indigo-600">
                      {roomRows.map(r => `Room ${r.roomNo} (₹${fmtMoney(toNum(r.rate))}/nt)`).join(', ')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm pt-3">
                    <span className="text-slate-500 font-medium">Stay Period</span>
                    <span className="font-bold text-slate-800">
                      {checkIn} → {checkOut} ({nights} {nights === 1 ? 'Night' : 'Nights'})
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm pt-3">
                    <span className="text-slate-500 font-medium">Identity Proof</span>
                    <span className="font-bold text-slate-800">
                      {idProofType} {idProofNumber ? `· ${idProofNumber}` : ''}
                      {idVerified ? ' (✓ Verified)' : ' (Unverified)'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm pt-3">
                    <span className="text-slate-500 font-medium">Arrival Time</span>
                    <span className="font-bold text-slate-800">{arrivalTime}</span>
                  </div>

                  <div className="flex items-center justify-between text-base pt-3 font-bold">
                    <span className="text-slate-800">Total Stay Tariff</span>
                    <span className="text-slate-900 text-lg">₹{fmtMoney(totalAmount)}</span>
                  </div>

                  {advanceAmount > 0 && (
                    <div className="flex items-center justify-between text-sm pt-3 font-semibold text-emerald-700">
                      <span>Advance Received</span>
                      <span>₹{fmtMoney(advanceAmount)}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-base pt-3 font-black text-indigo-950">
                    <span>Balance Due</span>
                    <span className="text-lg text-indigo-600">₹{fmtMoney(dueBalance)}</span>
                  </div>
                </div>
              </div>

              {/* System Impact Alert */}
              <div className="bg-amber-50/90 border border-amber-200/80 rounded-2xl p-4 flex items-start gap-3 shadow-2xs">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800 leading-relaxed font-medium">
                  <strong>Instant Operations Board Sync:</strong> Upon confirmation, room{' '}
                  <strong>{roomRows.map(r => r.roomNo).join(', ')}</strong> status will immediately become{' '}
                  <span className="font-bold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.5 rounded">Occupied</span>,
                  occupancy telemetry will update, and a real-time stay entry will be committed.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer Navigation Buttons ── */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/90 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1) as 0 | 1 | 2)}
            disabled={step === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200/80 rounded-xl disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>

          <span className="text-xs font-bold text-slate-400">
            Step {step + 1} of 3
          </span>

          {step < 2 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 0) {
                  if (!guestName.trim()) {
                    setError('Please enter the guest name.');
                    return;
                  }
                  if (!phone.trim()) {
                    setError('Mobile number is mandatory.');
                    setPhoneError('Mobile number is required.');
                    return;
                  }
                  const cleanDigits = phone.trim().replace(/\D/g, '');
                  if (cleanDigits.length < 10) {
                    setError('Please enter a valid 10-digit mobile number.');
                    setPhoneError('10-digit mobile number required.');
                    return;
                  }
                  if (!email.trim()) {
                    setError('Email address is mandatory.');
                    setEmailError('Email address is required.');
                    return;
                  }
                  if (!isValidEmail(email.trim())) {
                    setError('Please enter a valid email address.');
                    setEmailError('Valid email required (e.g. guest@example.com)');
                    return;
                  }
                  if (roomRows.some((r) => !r.roomNo)) {
                    setError('Please select a room for each assigned row.');
                    return;
                  }
                  setError(null);
                  setPhoneError(null);
                  setEmailError(null);
                }
                setStep((s) => Math.min(2, s + 1) as 0 | 1 | 2);
              }}
              className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-md shadow-indigo-500/25 cursor-pointer"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCheckIn}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-md shadow-emerald-600/30 disabled:opacity-60 cursor-pointer"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {saving ? 'Processing Check-In…' : 'Confirm Check-In'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
