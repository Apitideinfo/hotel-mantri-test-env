import { useEffect, useState, useMemo } from 'react';
import {
  X, Loader2, User, Phone, BedDouble, Calendar, Clock,
  FileCheck, AlertCircle, CheckCircle2, ChevronRight, ChevronLeft,
  CreditCard, ShieldCheck, LogIn, Search, Plus, Trash2,
} from 'lucide-react';
import type {
  Room, RoomCategory, CompanySource, HotelSettings,
  SourceCategory, PayMode, MealPlan, GstType, GstSlab,
  FrontOfficeRole,
} from '@/lib/types';
import { SOURCE_CATEGORIES, MEAL_PLANS, GST_TYPES, GST_SLABS, groupRoomsByCategory, compareRoomNo } from '@/lib/types';
import type { Reservation } from '@/lib/types-reservations';
import { fmtMoney, toNum, calcGstFull } from '@/lib/calc';
import { checkInGuest, validateCheckIn } from '@/lib/api-frontoffice';
import { checkRoomAvailability } from '@/lib/api-reservations';
import { brand } from '@/lib/theme';

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

const addDays = (d: string, n: number): string => {
  const dt = new Date(d + 'T00:00:00');
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};

const ID_PROOF_TYPES = ['Aadhaar', 'Passport', 'Driving License', 'Voter ID', 'Other'];
const UNAVAILABLE_HOUSEKEEPING = new Set(['Occupied', 'Occupied Clean', 'Occupied Service Due', 'Out Of Order', 'OutOfOrder', 'Blocked']);
interface CheckInRoomRow { roomNo: string; rate: number }

export const CheckInModal = ({
  reservation, rooms, categories, sources, settings, role, defaultDate, onClose, onCheckedIn,
}: CheckInModalProps) => {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [guestName, setGuestName] = useState(reservation?.guest_name ?? '');
  const [phone, setPhone] = useState(reservation?.guest_phone ?? '');
  const [email, setEmail] = useState(reservation?.guest_email ?? '');
  const [roomRows, setRoomRows] = useState<CheckInRoomRow[]>([
    { roomNo: reservation?.room_no ?? '', rate: reservation?.rate ?? 0 },
  ]);
  const [checkIn, setCheckIn] = useState(reservation?.check_in_date ?? defaultDate);
  const [checkOut, setCheckOut] = useState(reservation?.check_out_date ?? addDays(defaultDate, 1));
  const [categoryFilter, setCategoryFilter] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [availableRoomNos, setAvailableRoomNos] = useState<Set<string>>(new Set());
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [arrivalTime, setArrivalTime] = useState(new Date().toTimeString().slice(0, 5));
  const [idProofType, setIdProofType] = useState('');
  const [idProofNumber, setIdProofNumber] = useState('');
  const [idVerified, setIdVerified] = useState(false);
  const [performedBy, setPerformedBy] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
  const nights = useMemo(() => {
    const ci = new Date(checkIn + 'T00:00:00');
    const co = new Date(checkOut + 'T00:00:00');
    return Math.max(1, Math.round((co.getTime() - ci.getTime()) / 86400000));
  }, [checkIn, checkOut]);
  const totalAmount = roomRows.reduce((sum, row) => sum + row.rate * nights, 0);
  const { invoiceTotal } = calcGstFull(totalAmount, 'No Scope', 0);

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
    setError(null);
    if (roomRows.some((row) => !row.roomNo)) { setError('Select a room for every room row.'); return; }
    if (selectedRoomNos.size !== roomRows.length) { setError('The same room cannot be selected twice.'); return; }

    const baseParams = {
      guestName,
      phone,
      email,
      checkIn,
      checkOut,
      sourceCategory: reservation?.source_category as SourceCategory,
      sourceName: reservation?.source_name,
      paymentMode: reservation?.payment_mode as PayMode,
      advancePaid: reservation?.advance_paid,
      payCash: reservation?.pay_cash,
      payUpi: reservation?.pay_upi,
      payCard: reservation?.pay_card,
      payBank: reservation?.pay_bank,
      mealPlan: reservation?.meal_plan as MealPlan,
      gstType: reservation?.gst_type as GstType,
      gstSlab: reservation?.gst_slab as GstSlab,
      adults: reservation?.adults,
      children: reservation?.children,
      idProofType,
      idProofNumber,
      idProofVerified: idVerified,
      arrivalTime,
      performedBy,
    };
    const validationError = validateCheckIn({ ...baseParams, roomNo: roomRows[0].roomNo, rate: roomRows[0].rate });
    if (validationError) { setError(validationError); return; }

    setSaving(true);
    try {
      for (const [index, room] of roomRows.entries()) {
        await checkInGuest({
          ...baseParams,
          reservationId: index === 0 ? reservation?.id : undefined,
          roomNo: room.roomNo,
          rate: room.rate,
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
      setError(e instanceof Error ? e.message : 'Check-in failed');
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <>
        <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm pointer-events-auto">
            <div className="px-6 py-8 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Checked In!</h2>
              <p className="text-sm text-slate-400 mt-1">
                {guestName} · {roomRows.length} room{roomRows.length === 1 ? '' : 's'}
              </p>
              <p className="text-xs text-slate-400 mt-2">Room status updated to Occupied</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  const stepLabels = ['Guest & Room', 'ID & Arrival', 'Confirm'];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col pointer-events-auto">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between" style={{ background: brand.navy }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <LogIn className="w-5 h-5 text-brand-gold-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Check-In</h2>
                <p className="text-xs text-brand-navy-300">
                  {reservation ? 'From Reservation' : 'Walk-In Guest'} · Step {step + 1} of 3
                </p>
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
                  }`}>{i + 1}</div>
                  <span className="text-xs font-semibold hidden sm:block">{label}</span>
                </div>
                {i < 2 && <div className={`flex-1 h-0.5 mx-2 rounded ${i < step ? 'bg-brand-600' : 'bg-slate-200'}`} />}
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

            {/* STEP 0: Guest & Room */}
            {step === 0 && (
              <div className="space-y-4">
                <Field label="Guest Name *">
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input value={guestName} onChange={(e) => setGuestName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      placeholder="Guest name" />
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Mobile">
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input value={phone} onChange={(e) => setPhone(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                        placeholder="Phone" />
                    </div>
                  </Field>
                  <Field label="Email">
                    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      placeholder="Email (optional)" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Check-in *">
                    <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
                  </Field>
                  <Field label="Check-out *">
                    <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Rooms"><input value={roomRows.length} disabled className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500 font-medium" /></Field>
                  <Field label="Nights"><input value={nights} disabled className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500 font-medium" /></Field>
                  <Field label="Total Amount"><input value={`₹${fmtMoney(invoiceTotal)}`} disabled className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-700 font-semibold" /></Field>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5"><BedDouble className="w-3.5 h-3.5" /> Assign Rooms *</p>
                  {roomRows.map((row, index) => {
                    const selected = rooms.find((room) => room.room_no.trim().toLowerCase() === row.roomNo.trim().toLowerCase());
                    const category = categories.find((item) => item.id === selected?.category_id);
                    return (
                      <div key={index} className="rounded-xl border border-slate-200 p-3 space-y-2">
                        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                          <Field label="Room Category">
                            <select value={category?.id ?? categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                              <option value="">All categories</option>{categories.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                            </select>
                          </Field>
                          <Field label="Room No.">
                            <select value={row.roomNo} onChange={(e) => { const room = rooms.find((item) => item.room_no === e.target.value); if (room) handleRoomSelect(index, room); }} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                              <option value="">{availabilityLoading ? 'Checking availability…' : 'Select available room'}</option>
                              {filteredRooms.filter((room) => !selectedRoomNos.has(room.room_no.trim().toLowerCase()) || room.room_no === row.roomNo).map((room) => <option key={room.id} value={room.room_no}>{room.room_no}</option>)}
                            </select>
                          </Field>
                          <button type="button" onClick={() => removeRoomRow(index)} disabled={roomRows.length === 1} className="p-2 text-slate-400 hover:text-red-600 disabled:opacity-30" aria-label="Remove room"><Trash2 className="w-4 h-4" /></button>
                        </div>
                        <Field label="Room Rate / Night"><input type="number" min="0" value={row.rate} onChange={(e) => updateRoomRow(index, { rate: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></Field>
                      </div>
                    );
                  })}
                  <div className="flex gap-2">
                    <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={roomSearch} onChange={(e) => setRoomSearch(e.target.value)} placeholder="Search room number" className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                    <button type="button" onClick={addRoomRow} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-brand-700 border border-brand-200 rounded-lg hover:bg-brand-50"><Plus className="w-4 h-4" /> Add Another Room</button>
                  </div>
                  <p className="text-[11px] text-slate-400">Only available rooms for the selected dates are shown. Occupied, reserved, blocked, and out-of-order rooms are excluded.</p>
                </div>
              </div>
            )}

            {/* STEP 1: ID & Arrival */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="bg-brand-50 rounded-xl p-3 border border-brand-100">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-4 h-4 text-brand-600" />
                    <span className="text-sm font-semibold text-brand-navy-800">{guestName}</span>
                    <span className="text-xs text-slate-400">· {roomRows.length} room{roomRows.length === 1 ? '' : 's'} · {nights} nights</span>
                  </div>
                </div>

                <Field label="Arrival Time">
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="ID Proof Type">
                    <select value={idProofType} onChange={(e) => setIdProofType(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                      <option value="">Select…</option>
                      {ID_PROOF_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                  </Field>
                  <Field label="ID Proof Number">
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input value={idProofNumber} onChange={(e) => setIdProofNumber(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                        placeholder="ID number" />
                    </div>
                  </Field>
                </div>

                <button onClick={() => setIdVerified((v) => !v)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition ${
                    idVerified
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}>
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center ${
                    idVerified ? 'bg-emerald-500' : 'border-2 border-slate-300'
                  }`}>
                    {idVerified && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-semibold text-slate-700">ID Proof Verified</p>
                    <p className="text-xs text-slate-400">Confirm that the guest's ID has been checked</p>
                  </div>
                  <ShieldCheck className={`w-5 h-5 ${idVerified ? 'text-emerald-500' : 'text-slate-300'}`} />
                </button>

                <Field label="Performed By (Staff Name)">
                  <input value={performedBy} onChange={(e) => setPerformedBy(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    placeholder="Staff name" />
                </Field>
              </div>
            )}

            {/* STEP 2: Confirm */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-brand-navy-50 px-4 py-2.5 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-brand-navy-800 uppercase tracking-wide">Check-In Summary</h3>
                  </div>
                  <div className="p-4 space-y-2">
                    <Row label="Guest" value={guestName} />
                    <Row label="Rooms" value={roomRows.map((row) => `${row.roomNo} · ₹${fmtMoney(row.rate)}`).join(', ')} />
                    <Row label="Check-in" value={checkIn} />
                    <Row label="Check-out" value={checkOut} />
                    <Row label="Nights" value={String(nights)} />
                    <Row label="Total Amount" value={`₹${fmtMoney(invoiceTotal)}`} />
                    <Row label="Total" value={`₹${fmtMoney(invoiceTotal)}`} bold />
                    <Row label="Arrival Time" value={arrivalTime} />
                    <Row label="ID Proof" value={idProofType ? `${idProofType} ${idProofNumber ? `· ${idProofNumber}` : ''}` : 'Not provided'} />
                    <Row label="ID Verified" value={idVerified ? 'Yes' : 'No'} />
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    Upon check-in, the room will become <strong>Occupied</strong>, a room chart entry will be created,
                    and the Operations Board will update instantly.
                  </p>
                </div>

                <button onClick={handleCheckIn} disabled={saving}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-lg disabled:opacity-60 transition shadow-soft-blue">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirm Check-In
                </button>
              </div>
            )}
          </div>

          {/* Footer nav */}
          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <button onClick={() => setStep((s) => Math.max(0, s - 1) as 0 | 1 | 2)} disabled={step === 0}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg disabled:opacity-40 transition">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <span className="text-xs text-slate-400">Step {step + 1} of 3</span>
            {step < 2 ? (
              <button onClick={() => setStep((s) => Math.min(2, s + 1) as 0 | 1 | 2)}
                className="flex items-center gap-1 px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleCheckIn} disabled={saving}
                className="flex items-center gap-1 px-4 py-2 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60 transition">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Check In
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

// Re-export LogIn icon for the header
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
    {children}
  </label>
);

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="text-slate-500">{label}</span>
    <span className={`font-medium ${bold ? 'font-bold text-brand-navy-800' : 'text-slate-800'}`}>{value}</span>
  </div>
);
