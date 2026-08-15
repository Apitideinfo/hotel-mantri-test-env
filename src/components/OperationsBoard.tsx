import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Plus, Search, X, Calendar, ChevronLeft, ChevronRight,
  BedDouble, Users, LogIn, LogOut, TrendingUp, Wallet, Banknote,
  Smartphone, AlertCircle, Filter, RefreshCw, Loader2, CheckCircle2,
  Clock, Phone, Mail, IndianRupee, MessageCircle, Edit3, FileText,
  Sparkles, Play, ClipboardCheck, Wrench, Ban, Star,
  ArrowRightLeft, CalendarPlus,
} from 'lucide-react';
import type {
  RoomChartEntry, RoomChartEntryInput, HotelSettings,
  CompanySource, RoomCategory, Room, SourceCategory, PayMode, GstType, GstSlab,
  FrontOfficeRole,
} from '@/lib/types';
import { SOURCE_CATEGORIES, GST_TYPES, GST_SLABS, groupRoomsByCategory, compareRoomNo, mapAuthRoleToFrontOffice } from '@/lib/types';
import type { Reservation, ReservationInput } from '@/lib/types-reservations';
import {
  getSettings, getRoomChartForDateRange, saveRoomChartRow, deleteRoomChartRow,
  getCompanySources, classifyCompany, getRoomCategories, getRooms,
} from '@/lib/api';
import {
  getReservationsForDateRange, saveReservation, deleteReservation,
  updateReservationStatus, checkRoomAvailability,
} from '@/lib/api-reservations';
import { getGuests } from '@/lib/api-crm';
import type { Guest } from '@/lib/types-crm';
import { VIP_BADGE_COLORS } from '@/lib/types-crm';
import { fmtMoney, fmtInt, toNum, getTodayLocal } from '@/lib/calc';
import { BookingDetailPanel } from '@/components/BookingDetailPanel';
import { NewBookingModal } from '@/components/NewBookingModal';
import { CheckInModal } from '@/components/frontoffice/CheckInModal';
import { WalkInModal } from '@/components/frontoffice/WalkInModal';
import { CheckOutModal } from '@/components/frontoffice/CheckOutModal';
import { RoomShiftModal } from '@/components/frontoffice/RoomShiftModal';
import { ExtendStayModal } from '@/components/frontoffice/ExtendStayModal';
import { GuestFolio } from '@/components/frontoffice/GuestFolio';
import { useAuth } from '@/lib/auth';

interface OperationsBoardProps {
  date: string;
  onBack: () => void;
  onSaved: () => void;
  onNavigate?: (screen: string) => void;
}

type ViewMode = 'day' | 'week';

interface BoardBooking {
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
}

const SOURCE_COLORS: Record<string, string> = {
  'OTA': 'bg-brand-600',
  'Direct/Walking': 'bg-emerald-500',
  'Corporate/Agent': 'bg-brand-navy-500',
  'Phonebook': 'bg-brand-gold-500',
};

// Per Phase 2 spec: Confirmed=Blue, Checked In=Green, Arrival Today=Cyan,
// Departure Today=Orange, Hold=Gold, Blocked=Grey, OOO=Red, House Use=Teal, Comp=Gold accent
const STATUS_COLORS: Record<string, string> = {
  occupied: 'bg-emerald-500',
  vacant: 'bg-slate-300',
  complimentary: 'bg-brand-gold-500',
  confirmed: 'bg-brand-600',
  checked_in: 'bg-emerald-500',
  checked_out: 'bg-slate-400',
  cancelled: 'bg-red-400',
  no_show: 'bg-red-500',
};

const STATUS_TEXT_COLORS: Record<string, string> = {
  occupied: 'text-emerald-700',
  vacant: 'text-slate-500',
  complimentary: 'text-brand-gold-600',
  confirmed: 'text-brand-600',
  checked_in: 'text-emerald-700',
  checked_out: 'text-slate-500',
  cancelled: 'text-red-600',
  no_show: 'text-red-600',
};

const PAY_INDICATOR: Record<string, { icon: typeof Wallet; color: string; label: string }> = {
  Cash: { icon: Wallet, color: 'text-emerald-600', label: 'Cash' },
  Bank: { icon: Banknote, color: 'text-brand-navy-600', label: 'Bank' },
  UPI: { icon: Smartphone, color: 'text-brand-600', label: 'UPI' },
  Card: { icon: Banknote, color: 'text-brand-gold-600', label: 'Card' },
};

const addDays = (dateStr: string, n: number): string => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const fmtDay = (d: string): string => {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
};

const fmtDateFull = (d: string): string => {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const OperationsBoard = ({ date, onBack, onSaved, onNavigate }: OperationsBoardProps) => {
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [sources, setSources] = useState<CompanySource[]>([]);
  const [categories, setCategories] = useState<RoomCategory[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [entries, setEntries] = useState<RoomChartEntry[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [centerDate, setCenterDate] = useState(date);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterFloor, setFilterFloor] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<BoardBooking | null>(null);
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [preselectRoom, setPreselectRoom] = useState<string | undefined>(undefined);
  const [preselectCheckIn, setPreselectCheckIn] = useState<string | undefined>(undefined);
  const [preselectCheckOut, setPreselectCheckOut] = useState<string | undefined>(undefined);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [showCheckOut, setShowCheckOut] = useState(false);
  const [showRoomShift, setShowRoomShift] = useState(false);
  const [showExtendStay, setShowExtendStay] = useState(false);
  const [showFolio, setShowFolio] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vipGuests, setVipGuests] = useState<Guest[]>([]);

  const { role: authRole } = useAuth();
  const foRole: FrontOfficeRole | null = authRole ? mapAuthRoleToFrontOffice(authRole) : null;

  const daysToShow = viewMode === 'day' ? 1 : 7;
  const timelineStart = viewMode === 'day' ? centerDate : addDays(centerDate, -3);
  const timelineDates = useMemo(
    () => Array.from({ length: daysToShow }, (_, i) => addDays(timelineStart, i)),
    [timelineStart, daysToShow],
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [s, srcs, cats, rms] = await Promise.all([
        getSettings(),
        getCompanySources(),
        getRoomCategories(),
        getRooms(),
      ]);
      setSettings(s);
      setSources(srcs);
      setCategories(cats);
      setRooms(rms);

      const rangeStart = timelineDates[0];
      const rangeEnd = addDays(timelineDates[timelineDates.length - 1], 1);

      const [es, resvs] = await Promise.all([
        getRoomChartForDateRange(rangeStart, rangeEnd),
        getReservationsForDateRange(rangeStart, rangeEnd),
      ]);
      setEntries(es);
      setReservations(resvs);

      // Fetch VIP guests for badge display
      try {
        const allGuests = await getGuests();
        setVipGuests(allGuests.filter((g) => g.vip_type !== ''));
      } catch { /* non-critical */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [timelineDates]);

  useEffect(() => { load(); }, [load]);

  const activeRooms = useMemo(() => rooms.filter((r) => r.is_active), [rooms]);
  const floors = useMemo(
    () => [...new Set(activeRooms.map((r) => r.floor).filter((f): f is string => Boolean(f)))].sort(),
    [activeRooms],
  );

  const allBookings = useMemo((): BoardBooking[] => {
    const result: BoardBooking[] = [];
    for (const e of entries) {
      const hasPay = toNum(e.pay_cash) + toNum(e.pay_upi) + toNum(e.pay_card) + toNum(e.pay_bank) + toNum(e.pay_advance) > 0;
      result.push({
        id: e.id,
        type: 'entry',
        roomNo: e.room_no,
        guestName: e.guest_name,
        sourceCategory: e.source_category,
        sourceName: e.company,
        status: e.is_complimentary ? 'complimentary' : 'occupied',
        paymentMode: e.pay_mode,
        checkIn: e.arrival ?? e.report_date,
        checkOut: e.departure ?? e.report_date,
        rate: e.room_rate,
        nights: e.nights,
        phone: '',
        email: '',
        remarks: e.remarks,
        isComplimentary: e.is_complimentary,
        hasPayment: hasPay,
        vipType: '',
        raw: e,
      });
    }
    for (const r of reservations) {
      if (r.status === 'cancelled' || r.status === 'no_show') continue;
      result.push({
        id: r.id,
        type: 'reservation',
        roomNo: r.room_no,
        guestName: r.guest_name,
        sourceCategory: r.source_category,
        sourceName: r.source_name,
        status: r.status,
        paymentMode: r.payment_mode,
        checkIn: r.check_in_date,
        checkOut: r.check_out_date,
        rate: r.rate,
        nights: r.nights,
        phone: r.guest_phone,
        email: r.guest_email,
        remarks: r.remarks,
        isComplimentary: false,
        hasPayment: toNum(r.advance_paid) > 0,
        vipType: vipGuests.find((g) => g.mobile && g.mobile === r.guest_phone)?.vip_type ?? '',
        raw: r,
      });
    }
    return result;
  }, [entries, reservations, vipGuests]);

  const filteredBookings = useMemo(() => {
    let result = allBookings;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (b) =>
          b.guestName.toLowerCase().includes(q) ||
          b.roomNo.toLowerCase().includes(q) ||
          b.phone.toLowerCase().includes(q) ||
          b.id.toLowerCase().includes(q),
      );
    }
    if (filterCategory) result = result.filter((b) => {
      const room = activeRooms.find((r) => r.room_no === b.roomNo);
      if (!room) return false;
      const cat = categories.find((c) => c.id === room.category_id);
      return cat?.name === filterCategory;
    });
    if (filterFloor) result = result.filter((b) => {
      const room = activeRooms.find((r) => r.room_no === b.roomNo);
      return room?.floor === filterFloor;
    });
    if (filterSource) result = result.filter((b) => b.sourceCategory === filterSource);
    if (filterStatus) result = result.filter((b) => b.status === filterStatus);
    if (filterPayment) {
      if (filterPayment === 'paid') result = result.filter((b) => b.hasPayment);
      else if (filterPayment === 'unpaid') result = result.filter((b) => !b.hasPayment);
    }
    return result;
  }, [allBookings, search, filterCategory, filterFloor, filterSource, filterStatus, filterPayment, activeRooms, categories]);

  const bookingByRoom = useMemo(() => {
    const map = new Map<string, BoardBooking[]>();
    for (const b of filteredBookings) {
      const key = b.roomNo.trim().toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return map;
  }, [filteredBookings]);

  const todayStats = useMemo(() => {
    const occupied = entries.filter((e) => !e.is_complimentary).length;
    const vacant = activeRooms.length - occupied;
    const arrivals = allBookings.filter((b) => b.checkIn === date).length;
    const departures = allBookings.filter((b) => b.checkOut === date).length;
    const futureBookings = reservations.filter(
      (r) => r.status === 'confirmed' && r.check_in_date > date,
    ).length;
    const todayRevenue = entries.reduce((s, e) => s + toNum(e.room_rate) * toNum(e.nights), 0);
    const cashTotal = entries.reduce((s, e) => s + toNum(e.pay_cash), 0);
    const bankTotal = entries.reduce((s, e) => s + toNum(e.pay_bank), 0);
    const upiTotal = entries.reduce((s, e) => s + toNum(e.pay_upi), 0);
    const missingTariff = entries.filter((e) => toNum(e.room_rate) === 0).length;
    const missingPayment = entries.filter(
      (e) => toNum(e.pay_cash) + toNum(e.pay_upi) + toNum(e.pay_card) + toNum(e.pay_bank) === 0 && !e.is_complimentary,
    ).length;
    const missingGst = entries.filter(
      (e) => (e.gst_type !== 'No Scope' && toNum(e.gst_amount) === 0),
    ).length;
    return {
      occupied, vacant, arrivals, departures, futureBookings,
      todayRevenue, cashTotal, bankTotal, upiTotal,
      missingTariff, missingPayment, missingGst,
    };
  }, [entries, reservations, date, allBookings, activeRooms.length]);

  const handleSaveEntry = async (row: RoomChartEntryInput, existingId?: string) => {
    setSaving(true);
    try {
      await saveRoomChartRow(row, sources, existingId);
      await load();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    setSaving(true);
    try {
      await deleteRoomChartRow(id);
      await load();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveReservation = async (input: ReservationInput, id?: string) => {
    setSaving(true);
    try {
      const available = await checkRoomAvailability(
        input.room_no, input.check_in_date, input.check_out_date, id,
      );
      if (!available) {
        setError('Room is already booked for the selected dates. Please choose different dates or room.');
        return;
      }
      await saveReservation(input, id);
      await load();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReservation = async (id: string) => {
    setSaving(true);
    try {
      await deleteReservation(id);
      await load();
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleCheckIn = (booking: BoardBooking) => {
    setSelectedBooking(booking);
    setShowCheckIn(true);
  };

  const handleCheckOut = (booking: BoardBooking) => {
    setSelectedBooking(booking);
    setShowCheckOut(true);
  };

  const handleRoomShift = (booking: BoardBooking) => {
    setSelectedBooking(booking);
    setShowRoomShift(true);
  };

  const handleExtendStay = (booking: BoardBooking) => {
    setSelectedBooking(booking);
    setShowExtendStay(true);
  };

  const handleViewFolio = (booking: BoardBooking) => {
    setSelectedBooking(booking);
    setShowFolio(true);
  };

  const handleCheckInComplete = async () => {
    setShowCheckIn(false);
    setSelectedBooking(null);
    await load();
    onSaved();
  };

  const handleCheckOutComplete = async () => {
    setShowCheckOut(false);
    setSelectedBooking(null);
    await load();
    onSaved();
  };

  const handleRoomShiftComplete = async () => {
    setShowRoomShift(false);
    setSelectedBooking(null);
    await load();
    onSaved();
  };

  const handleExtendStayComplete = async () => {
    setShowExtendStay(false);
    setSelectedBooking(null);
    await load();
    onSaved();
  };

  const shiftTimeline = (delta: number) => {
    setCenterDate((d) => addDays(d, delta));
  };

  const clearFilters = () => {
    setSearch('');
    setFilterCategory('');
    setFilterFloor('');
    setFilterSource('');
    setFilterStatus('');
    setFilterPayment('');
  };

  const hasActiveFilters = search || filterCategory || filterFloor || filterSource || filterStatus || filterPayment;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <BedDouble className="w-5 h-5 text-brand-600" />
          <h1 className="text-lg font-bold text-brand-navy-800">Operations Board</h1>
        </div>
        <div className="flex items-center gap-1 ml-2 bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('day')}
            className={`px-3 py-1 text-sm rounded-md transition ${viewMode === 'day' ? 'bg-white text-brand-navy-800 shadow-sm font-medium' : 'text-slate-500'}`}
          >Day</button>
          <button
            onClick={() => setViewMode('week')}
            className={`px-3 py-1 text-sm rounded-md transition ${viewMode === 'week' ? 'bg-white text-brand-navy-800 shadow-sm font-medium' : 'text-slate-500'}`}
          >Week</button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => shiftTimeline(viewMode === 'day' ? -1 : -7)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-slate-600 font-medium min-w-[120px] text-center">
            {fmtDateFull(timelineDates[0])}
            {viewMode === 'week' && ` – ${fmtDateFull(timelineDates[6])}`}
          </span>
          <button onClick={() => shiftTimeline(viewMode === 'day' ? 1 : 7)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCenterDate(getTodayLocal())}
            className="ml-1 px-2 py-1 text-xs text-brand-600 hover:bg-brand-50 rounded-md font-medium"
          >Today</button>
        </div>
        <div className="flex-1" />
        <button
          onClick={load}
          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Actions */}
      <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center gap-2 overflow-x-auto">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Quick Actions</span>
        <button
          onClick={() => setShowNewBooking(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg transition shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> New Reservation
        </button>
        <button
          onClick={() => setShowWalkIn(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-navy-600 hover:bg-brand-navy-700 text-white text-xs font-semibold rounded-lg transition shrink-0"
        >
          <LogIn className="w-3.5 h-3.5" /> Walk-In
        </button>
        <button
          onClick={() => selectedBooking && handleCheckIn(selectedBooking)}
          disabled={!selectedBooking || selectedBooking.type !== 'reservation'}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition shrink-0"
        >
          <LogIn className="w-3.5 h-3.5" /> Check-In
        </button>
        <button
          onClick={() => selectedBooking && handleCheckOut(selectedBooking)}
          disabled={!selectedBooking || selectedBooking.type !== 'entry'}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" /> Check-Out
        </button>
        <button
          onClick={() => onNavigate?.('roomchart')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-navy-700 hover:bg-brand-navy-800 text-white text-xs font-semibold rounded-lg transition shrink-0"
        >
          <FileText className="w-3.5 h-3.5" /> Daily Entry
        </button>
        <button
          onClick={() => selectedBooking && handleViewFolio(selectedBooking)}
          disabled={!selectedBooking || selectedBooking.type !== 'entry'}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition shrink-0"
        >
          <Wallet className="w-3.5 h-3.5" /> Collect Payment
        </button>
        <button
          onClick={() => selectedBooking && handleRoomShift(selectedBooking)}
          disabled={!selectedBooking || selectedBooking.type !== 'entry'}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition shrink-0"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" /> Room Shift
        </button>
        <button
          onClick={() => selectedBooking && handleExtendStay(selectedBooking)}
          disabled={!selectedBooking || selectedBooking.type !== 'entry'}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-gold-600 hover:bg-brand-gold-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition shrink-0"
        >
          <CalendarPlus className="w-3.5 h-3.5" /> Extend Stay
        </button>
      </div>

      {/* KPI Cards */}
      <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        <KpiCard icon={BedDouble} label="Occupied" value={fmtInt(todayStats.occupied)} color="text-emerald-600 bg-emerald-50" />
        <KpiCard icon={BedDouble} label="Vacant" value={fmtInt(todayStats.vacant)} color="text-slate-600 bg-slate-100" />
        <KpiCard icon={LogIn} label="Arrivals" value={fmtInt(todayStats.arrivals)} color="text-brand-600 bg-brand-50" />
        <KpiCard icon={LogOut} label="Departures" value={fmtInt(todayStats.departures)} color="text-orange-600 bg-orange-50" />
        <KpiCard icon={Calendar} label="Future" value={fmtInt(todayStats.futureBookings)} color="text-brand-navy-600 bg-brand-navy-50" />
        <KpiCard icon={IndianRupee} label="Revenue" value={`₹${fmtMoney(todayStats.todayRevenue)}`} color="text-emerald-600 bg-emerald-50" />
        <KpiCard icon={AlertCircle} label="Missing Tariff" value={fmtInt(todayStats.missingTariff)} color="text-red-600 bg-red-50" />
        <KpiCard icon={AlertCircle} label="Missing Pay" value={fmtInt(todayStats.missingPayment)} color="text-red-600 bg-red-50" />
        {/* Housekeeping indicators */}
        <HkIndicator rooms={activeRooms} />
      </div>

      {/* Search + Filters */}
      <div className="px-4 pb-2 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search guest, room, phone, booking ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400"
          />
        </div>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white">
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select value={filterFloor} onChange={(e) => setFilterFloor(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white">
          <option value="">All Floors</option>
          {floors.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white">
          <option value="">All Sources</option>
          {SOURCE_CATEGORIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white">
          <option value="">All Status</option>
          <option value="occupied">Occupied</option>
          <option value="vacant">Vacant</option>
          <option value="complimentary">Complimentary</option>
          <option value="confirmed">Confirmed</option>
          <option value="checked_in">Checked In</option>
          <option value="checked_out">Checked Out</option>
        </select>
        <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white">
          <option value="">All Payments</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
        </select>
        {hasActiveFilters && (
          <button onClick={clearFilters} className="text-sm text-red-500 hover:text-red-700 px-2 py-1 flex items-center gap-1">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Timeline Grid */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading board…
          </div>
        ) : activeRooms.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
            No rooms configured. Add rooms in Property Master first.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
            {/* Date header row */}
            <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
              <div className="w-28 sm:w-32 flex-shrink-0 px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wide border-r border-slate-200">
                Room
              </div>
              {timelineDates.map((d) => {
                const isToday = d === date;
                const isWeekend = [0, 6].includes(new Date(d + 'T00:00:00').getDay());
                return (
                  <div
                    key={d}
                    className={`flex-1 min-w-[90px] sm:min-w-[100px] px-2 py-2 text-center text-xs font-bold border-r border-slate-200 ${
                      isToday ? 'bg-brand-100 text-brand-700' : isWeekend ? 'bg-slate-100 text-slate-500' : 'text-slate-600'
                    }`}
                  >
                    {fmtDay(d)}
                  </div>
                );
              })}
            </div>
            {/* Room rows grouped by category */}
            {(() => {
              const sortedRooms = [...activeRooms].sort((a, b) => compareRoomNo(a.room_no, b.room_no));
              const grouped = groupRoomsByCategory(sortedRooms, categories);
              return grouped.map((group) => (
                <div key={group.cat?.id ?? '__uncategorized'}>
                  {/* Category header row */}
                  <div className="flex border-b border-slate-200 bg-brand-navy-50 sticky left-0 z-[6]">
                    <div className="w-28 sm:w-32 flex-shrink-0 px-3 py-2 border-r border-slate-200 bg-brand-navy-50 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-brand-navy-700 uppercase tracking-wider">
                        {group.cat?.name ?? 'Uncategorized'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 flex items-center px-3">
                      <span className="text-[10px] font-semibold text-brand-navy-600">
                        {group.cat?.name ?? 'Uncategorized'} — {group.rooms.length} Room{group.rooms.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  {/* Room rows */}
                  {group.rooms.map((room) => {
                    const roomKey = room.room_no.trim().toLowerCase();
                    const roomBookings = bookingByRoom.get(roomKey) ?? [];
                    const cat = categories.find((c) => c.id === room.category_id);
                    return (
                      <div key={room.id} className="flex border-b border-slate-100 hover:bg-slate-50/50 transition">
                        {/* Sticky room label */}
                        <div className="w-28 sm:w-32 flex-shrink-0 px-3 py-2 border-r border-slate-200 bg-white sticky left-0 z-[5] flex flex-col justify-center">
                          <div className="flex items-center gap-1.5">
                            <HkDot status={room.housekeeping_status} />
                            <span className="text-sm font-bold text-brand-navy-700">{room.room_no}</span>
                          </div>
                          {cat && <span className="text-[10px] text-slate-400 truncate">{cat.name}</span>}
                        </div>
                        {/* Timeline cells */}
                        {timelineDates.map((d) => {
                          const dayBookings = roomBookings.filter(
                            (b) => (d >= b.checkIn && d < b.checkOut) || (d === b.checkIn && b.checkIn === b.checkOut),
                          );
                          return (
                            <div
                              key={d}
                              className={`flex-1 min-w-[90px] sm:min-w-[100px] px-1 py-1.5 border-r border-slate-100 ${d === date ? 'bg-brand-50/40' : ''}`}
                            >
                              {dayBookings.length === 0 ? (
                                <button
                                  onClick={() => {
                                    setPreselectRoom(room.room_no);
                                    setPreselectCheckIn(d);
                                    setPreselectCheckOut(addDays(d, 1));
                                    setShowNewBooking(true);
                                  }}
                                  className="w-full h-full min-h-[28px] rounded-md border border-dashed border-slate-200 hover:border-brand-400 hover:bg-brand-50/30 transition flex items-center justify-center group"
                                >
                                  <Plus className="w-3 h-3 text-slate-300 group-hover:text-brand-500 transition" />
                                </button>
                              ) : (
                                dayBookings.map((b) => (
                                  <BookingBar key={b.id} booking={b} onClick={() => setSelectedBooking(b)} />
                                ))
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        )}
      </div>

      {/* Booking Detail Panel */}
      {selectedBooking && !showCheckIn && !showCheckOut && !showRoomShift && !showExtendStay && !showFolio && (
        <BookingDetailPanel
          booking={selectedBooking}
          settings={settings}
          sources={sources}
          categories={categories}
          rooms={activeRooms}
          date={date}
          role={foRole}
          saving={saving}
          onClose={() => setSelectedBooking(null)}
          onEditEntry={handleSaveEntry}
          onDeleteEntry={handleDeleteEntry}
          onEditReservation={handleSaveReservation}
          onDeleteReservation={handleDeleteReservation}
          onCheckIn={handleCheckIn}
          onCheckOut={handleCheckOut}
          onRoomShift={handleRoomShift}
          onExtendStay={handleExtendStay}
          onViewFolio={handleViewFolio}
        />
      )}

      {/* Check-In Modal */}
      {showCheckIn && selectedBooking && selectedBooking.type === 'reservation' && (
        <CheckInModal
          reservation={selectedBooking.raw as Reservation}
          rooms={activeRooms}
          categories={categories}
          sources={sources}
          settings={settings}
          role={foRole}
          defaultDate={date}
          onClose={() => { setShowCheckIn(false); setSelectedBooking(null); }}
          onCheckedIn={handleCheckInComplete}
        />
      )}

      {/* Walk-In Modal */}
      {showWalkIn && (
        <WalkInModal
          rooms={activeRooms}
          categories={categories}
          sources={sources}
          settings={settings}
          role={foRole}
          defaultDate={date}
          onClose={() => setShowWalkIn(false)}
          onCheckedIn={async () => { setShowWalkIn(false); await load(); onSaved(); }}
        />
      )}

      {/* Check-Out Modal */}
      {showCheckOut && selectedBooking && selectedBooking.type === 'entry' && (
        <CheckOutModal
          entry={selectedBooking.raw as RoomChartEntry}
          roomNo={selectedBooking.roomNo}
          role={foRole}
          onClose={() => { setShowCheckOut(false); setSelectedBooking(null); }}
          onCheckedOut={handleCheckOutComplete}
        />
      )}

      {/* Room Shift Modal */}
      {showRoomShift && selectedBooking && selectedBooking.type === 'entry' && (
        <RoomShiftModal
          entryId={(selectedBooking.raw as RoomChartEntry).id}
          fromRoom={selectedBooking.roomNo}
          rooms={activeRooms}
          categories={categories}
          role={foRole}
          onClose={() => { setShowRoomShift(false); setSelectedBooking(null); }}
          onShifted={handleRoomShiftComplete}
        />
      )}

      {/* Extend Stay Modal */}
      {showExtendStay && selectedBooking && selectedBooking.type === 'entry' && (
        <ExtendStayModal
          entry={selectedBooking.raw as RoomChartEntry}
          role={foRole}
          onClose={() => { setShowExtendStay(false); setSelectedBooking(null); }}
          onExtended={handleExtendStayComplete}
        />
      )}

      {/* Guest Folio */}
      {showFolio && selectedBooking && selectedBooking.type === 'entry' && (
        <GuestFolio
          entry={selectedBooking.raw as RoomChartEntry}
          roomNo={selectedBooking.roomNo}
          rooms={activeRooms}
          categories={categories}
          settings={settings}
          onClose={() => { setShowFolio(false); setSelectedBooking(null); }}
        />
      )}

      {/* New Booking Modal */}
      {showNewBooking && (
        <NewBookingModal
          rooms={activeRooms}
          categories={categories}
          sources={sources}
          settings={settings}
          defaultDate={date}
          saving={saving}
          preselectRoom={preselectRoom}
          preselectCheckIn={preselectCheckIn}
          preselectCheckOut={preselectCheckOut}
          onClose={() => { setShowNewBooking(false); setPreselectRoom(undefined); setPreselectCheckIn(undefined); setPreselectCheckOut(undefined); }}
          onSave={handleSaveReservation}
        />
      )}
    </div>
  );
};

// ── Sub-components ──────────────────────────────────────────

const KpiCard = ({
  icon: Icon, label, value, color,
}: { icon: typeof BedDouble; label: string; value: string; color: string }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-2.5 flex items-center gap-2.5 shadow-card">
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
      <Icon className="w-4 h-4" />
    </div>
    <div className="min-w-0">
      <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">{label}</p>
      <p className="text-sm font-bold text-brand-navy-800 truncate">{value}</p>
    </div>
  </div>
);

const BookingBar = ({
  booking, onClick,
}: { booking: BoardBooking; onClick: () => void }) => {
  const sourceColor = SOURCE_COLORS[booking.sourceCategory] ?? 'bg-slate-400';
  const statusColor = STATUS_COLORS[booking.status] ?? 'bg-slate-400';
  const statusText = STATUS_TEXT_COLORS[booking.status] ?? 'text-slate-600';
  const payInfo = PAY_INDICATOR[booking.paymentMode];
  const total = booking.rate * booking.nights;
  const balance = Math.max(0, total - (booking.type === 'reservation' ? toNum((booking.raw as Reservation).advance_paid) : 0));

  return (
    <button
      onClick={onClick}
      title={`${booking.guestName || 'Guest'} · ${booking.sourceCategory} · ₹${fmtMoney(booking.rate)}/night${balance > 0 ? ` · Bal ₹${fmtMoney(balance)}` : ''}`}
      className="w-full text-left rounded-md px-2 py-1 mb-1 text-xs transition hover:shadow-md hover:z-20 relative group border border-slate-200 bg-white"
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l ${sourceColor}`} />
      <div className="pl-1.5">
        <div className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${statusColor} flex-shrink-0`} />
          <span className={`font-semibold truncate ${statusText}`}>{booking.guestName || 'Guest'}</span>
          {booking.vipType && (
            <span className={`ml-1 inline-flex items-center gap-0.5 text-[8px] px-1 py-0 rounded-full font-bold border ${VIP_BADGE_COLORS[booking.vipType] ?? 'bg-slate-100 text-slate-600 border-slate-300'}`}>
              <Star className="w-2 h-2" /> {booking.vipType}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-400">
          <span className="truncate">{booking.sourceName || booking.sourceCategory}</span>
          {payInfo && booking.hasPayment && (
            <span className={`flex items-center gap-0.5 ${payInfo.color}`}>
              <payInfo.icon className="w-2.5 h-2.5" />
            </span>
          )}
          {booking.isComplimentary && (
            <span className="text-brand-gold-600 font-bold">COMP</span>
          )}
          {balance > 0 && !booking.isComplimentary && (
            <span className="text-amber-600 font-medium">₹{fmtMoney(balance)}</span>
          )}
        </div>
      </div>
    </button>
  );
};

// ── Housekeeping indicators ──

const HK_DOT_COLORS: Record<string, string> = {
  'Vacant Clean': 'bg-emerald-500',
  'Vacant Dirty': 'bg-amber-500',
  'Occupied': 'bg-brand-500',
  'Occupied Clean': 'bg-teal-500',
  'Occupied Service Due': 'bg-orange-500',
  'Cleaning In Progress': 'bg-sky-500',
  'Ready for Inspection': 'bg-violet-500',
  'Inspected / Ready': 'bg-indigo-500',
  'Out Of Order': 'bg-red-500',
  'Blocked': 'bg-slate-500',
};

const HkDot = ({ status }: { status: string }) => (
  <span
    className={`w-2 h-2 rounded-full shrink-0 ${HK_DOT_COLORS[status] ?? 'bg-slate-300'}`}
    title={`Housekeeping: ${status}`}
  />
);

const HkIndicator = ({ rooms }: { rooms: Room[] }) => {
  const counts: Record<string, number> = {};
  for (const r of rooms) {
    counts[r.housekeeping_status] = (counts[r.housekeeping_status] ?? 0) + 1;
  }
  const indicators: { status: string; icon: typeof BedDouble }[] = [
    { status: 'Vacant Clean', icon: Sparkles },
    { status: 'Vacant Dirty', icon: BedDouble },
    { status: 'Cleaning In Progress', icon: Play },
    { status: 'Ready for Inspection', icon: ClipboardCheck },
    { status: 'Out Of Order', icon: Wrench },
    { status: 'Blocked', icon: Ban },
  ];
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-2.5 flex items-center gap-3 shadow-card overflow-x-auto">
      {indicators.map(({ status, icon: Icon }) => (
        <div key={status} className="flex items-center gap-1.5 shrink-0" title={status}>
          <Icon className={`w-3.5 h-3.5 ${HK_DOT_COLORS[status]?.replace('bg-', 'text-') ?? 'text-slate-400'}`} />
          <span className="text-sm font-bold text-brand-navy-800 tabular-nums">{counts[status] ?? 0}</span>
        </div>
      ))}
    </div>
  );
};
