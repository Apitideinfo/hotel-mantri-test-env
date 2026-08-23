import { useState, useMemo } from 'react';
import {
  X, Loader2, User, Phone, BedDouble, Calendar, Clock,
  AlertCircle, CheckCircle2, ChevronRight, ChevronLeft, Wallet,
  Smartphone, CreditCard, Banknote, IndianRupee,
} from 'lucide-react';
import type {
  Room, RoomCategory, CompanySource, HotelSettings,
  SourceCategory, PayMode, MealPlan, GstType, GstSlab,
  FrontOfficeRole,
} from '@/lib/types';
import { SOURCE_CATEGORIES, MEAL_PLANS, GST_TYPES, GST_SLABS, groupRoomsByCategory, compareRoomNo } from '@/lib/types';
import { fmtMoney, toNum, calcGstFull } from '@/lib/calc';
import { walkInCheckIn, validateCheckIn, getVacantRooms } from '@/lib/api-frontoffice';
import { brand } from '@/lib/theme';

interface WalkInModalProps {
  rooms: Room[];
  categories: RoomCategory[];
  sources: CompanySource[];
  settings: HotelSettings | null;
  role: FrontOfficeRole | null;
  defaultDate: string;
  preselectRoom?: string;
  onClose: () => void;
  onCheckedIn: () => void;
}

const addDays = (d: string, n: number): string => {
  const dt = new Date(d + 'T00:00:00');
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};

export const WalkInModal = ({
  rooms, categories, sources, settings, role, defaultDate, preselectRoom, onClose, onCheckedIn,
}: WalkInModalProps) => {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [guestName, setGuestName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [roomNo, setRoomNo] = useState(preselectRoom ?? '');
  const [checkIn, setCheckIn] = useState(defaultDate);
  const [checkOut, setCheckOut] = useState(addDays(defaultDate, 1));
  const [rate, setRate] = useState(0);
  const [arrivalTime, setArrivalTime] = useState(new Date().toTimeString().slice(0, 5));
  const [sourceCat, setSourceCat] = useState<SourceCategory>('Direct/Walking');
  const [payCash, setPayCash] = useState(0);
  const [payUpi, setPayUpi] = useState(0);
  const [payCard, setPayCard] = useState(0);
  const [payBank, setPayBank] = useState(0);
  const [performedBy, setPerformedBy] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [vacantRooms, setVacantRooms] = useState<Room[]>([]);

  // Load vacant rooms on mount
  useMemo(() => {
    getVacantRooms().then(setVacantRooms).catch(() => setVacantRooms(rooms.filter((r) => r.is_active)));
  }, [rooms]);

  const selectedRoom = useMemo(
    () => vacantRooms.find((r) => r.room_no.trim().toLowerCase() === roomNo.trim().toLowerCase()),
    [vacantRooms, roomNo],
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
  const { invoiceTotal } = calcGstFull(subtotal, 'No Scope', 0);
  const totalReceived = toNum(payCash) + toNum(payUpi) + toNum(payCard) + toNum(payBank);
  const balance = Math.max(0, invoiceTotal - totalReceived);

  const handleRoomSelect = (no: string) => {
    setRoomNo(no);
    const r = vacantRooms.find((rm) => rm.room_no === no);
    if (r && rate === 0) {
      const cat = categories.find((c) => c.id === r.category_id);
      setRate(cat?.default_tariff ?? r.default_tariff ?? 0);
    }
  };

  const groupedVacant = useMemo(() => {
    const sorted = [...vacantRooms].sort((a, b) => compareRoomNo(a.room_no, b.room_no));
    return groupRoomsByCategory(sorted, categories);
  }, [vacantRooms, categories]);

  const handleCheckIn = async () => {
    setError(null);
    const params = {
      roomNo,
      guestName,
      phone,
      email,
      checkIn,
      checkOut,
      rate,
      sourceCategory: sourceCat,
      paymentMode: 'Cash' as PayMode,
      payCash,
      payUpi,
      payCard,
      payBank,
      arrivalTime,
      performedBy,
    };
    const validationError = validateCheckIn(params);
    if (validationError) { setError(validationError); return; }

    setSaving(true);
    try {
      await walkInCheckIn(params);
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
              <h2 className="text-lg font-bold text-slate-800">Walk-In Checked In!</h2>
              <p className="text-sm text-slate-400 mt-1">{guestName} · Room {roomNo}</p>
              <p className="text-xs text-slate-400 mt-2">Room is now Occupied</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  const stepLabels = ['Guest', 'Room', 'Payment', 'Confirm'];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col pointer-events-auto">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between" style={{ background: brand.navy }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <BedDouble className="w-5 h-5 text-brand-gold-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Walk-In Check-In</h2>
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
                  }`}>{i + 1}</div>
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

            {/* STEP 0: Guest */}
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
                <Field label="Source Category">
                  <select value={sourceCat} onChange={(e) => setSourceCat(e.target.value as SourceCategory)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                    {SOURCE_CATEGORIES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Arrival Time">
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
                  </div>
                </Field>
              </div>
            )}

            {/* STEP 1: Room */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Check-in *">
                    <input type="date" value={checkIn} onChange={(e) => {
                      const newCi = e.target.value;
                      setCheckIn(newCi);
                      const ciDate = new Date(newCi + 'T00:00:00');
                      ciDate.setDate(ciDate.getDate() + nights);
                      setCheckOut(ciDate.toISOString().split('T')[0]);
                    }}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
                  </Field>
                  <Field label="Check-out *">
                    <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Rate / Night">
                    <input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
                  </Field>
                  <Field label="Nights">
                    <input 
                      type="number"
                      min="1"
                      value={nights} 
                      onChange={(e) => {
                        const newNights = Math.max(1, parseInt(e.target.value) || 1);
                        const ciDate = new Date(checkIn + 'T00:00:00');
                        ciDate.setDate(ciDate.getDate() + newNights);
                        setCheckOut(ciDate.toISOString().split('T')[0]);
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 font-medium" />
                  </Field>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
                    <BedDouble className="w-3.5 h-3.5" /> Vacant Rooms Only *
                  </p>
                  {vacantRooms.length === 0 ? (
                    <p className="text-sm text-slate-400 py-2">No vacant rooms available.</p>
                  ) : (
                    <div className="space-y-3 max-h-48 overflow-y-auto">
                      {groupedVacant.map((group) => (
                        <div key={group.cat?.id ?? '__uncat'}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="h-3 w-1 rounded-full bg-brand-500" />
                            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                              {group.cat?.name ?? 'Uncategorized'}
                            </span>
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
              </div>
            )}

            {/* STEP 2: Payment */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Room Charges ({nights} × ₹{fmtMoney(rate)})</span>
                    <span className="font-semibold text-slate-800">₹{fmtMoney(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-200">
                    <span className="font-bold text-brand-navy-800">Total</span>
                    <span className="font-bold text-brand-navy-800 text-base">₹{fmtMoney(invoiceTotal)}</span>
                  </div>
                </div>
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
                  <div className="bg-emerald-50 rounded-xl px-3 py-2.5 border border-emerald-200">
                    <span className="block text-xs font-medium text-emerald-600 mb-0.5">Received</span>
                    <p className="font-bold text-emerald-700 text-base">₹{fmtMoney(totalReceived)}</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl px-3 py-2.5 border border-amber-200">
                    <span className="block text-xs font-medium text-amber-600 mb-0.5">Balance</span>
                    <p className="font-bold text-amber-700 text-base">₹{fmtMoney(balance)}</p>
                  </div>
                </div>
                <Field label="Performed By (Staff Name)">
                  <input value={performedBy} onChange={(e) => setPerformedBy(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    placeholder="Staff name" />
                </Field>
              </div>
            )}

            {/* STEP 3: Confirm */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-brand-navy-50 px-4 py-2.5 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-brand-navy-800 uppercase tracking-wide">Walk-In Summary</h3>
                  </div>
                  <div className="p-4 space-y-2">
                    <Row label="Guest" value={guestName} />
                    <Row label="Phone" value={phone || '—'} />
                    <Row label="Room" value={`${roomNo}${category ? ` · ${category.name}` : ''}`} />
                    <Row label="Check-in" value={`${checkIn} ${arrivalTime}`} />
                    <Row label="Check-out" value={checkOut} />
                    <Row label="Nights" value={String(nights)} />
                    <Row label="Rate" value={`₹${fmtMoney(rate)}/night`} />
                    <Row label="Total" value={`₹${fmtMoney(invoiceTotal)}`} bold />
                    <Row label="Received" value={`₹${fmtMoney(totalReceived)}`} />
                    <Row label="Balance" value={`₹${fmtMoney(balance)}`} />
                  </div>
                </div>
                <button onClick={handleCheckIn} disabled={saving}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-lg disabled:opacity-60 transition shadow-soft-blue">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirm Walk-In Check-In
                </button>
              </div>
            )}
          </div>

          {/* Footer nav */}
          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <button onClick={() => setStep((s) => Math.max(0, s - 1) as 0 | 1 | 2 | 3)} disabled={step === 0}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg disabled:opacity-40 transition">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <span className="text-xs text-slate-400">Step {step + 1} of 4</span>
            {step < 3 ? (
              <button onClick={() => setStep((s) => Math.min(3, s + 1) as 0 | 1 | 2 | 3)}
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

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="text-slate-500">{label}</span>
    <span className={`font-medium ${bold ? 'font-bold text-brand-navy-800' : 'text-slate-800'}`}>{value}</span>
  </div>
);
