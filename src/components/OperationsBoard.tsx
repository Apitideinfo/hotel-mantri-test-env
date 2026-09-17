import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Plus, Search, X, Calendar, ChevronLeft, ChevronRight,
  BedDouble, Users, LogIn, LogOut, TrendingUp, Wallet, Banknote,
  Smartphone, AlertCircle, Filter, RefreshCw, Loader2, CheckCircle2,
  Clock, Phone, Mail, IndianRupee, MessageCircle, Edit3, FileText,
  Sparkles, Play, ClipboardCheck, Wrench, Ban, Star,
  ArrowRightLeft, CalendarPlus, AlertTriangle, Sliders, Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  getAuthoritativeAvailabilityMatrix,
  upsertInventoryRestriction,
  bulkUpdateInventory,
} from '@/lib/api-channel';
import type { AuthoritativeMatrixItem } from '@/lib/api-channel';
import type {
  RoomChartEntry, RoomChartEntryInput, HotelSettings,
  CompanySource, RoomCategory, Room, SourceCategory, PayMode, GstType, GstSlab,
  FrontOfficeRole, HotSeason, MealPlan,
} from '@/lib/types';
import { SOURCE_CATEGORIES, GST_TYPES, GST_SLABS, groupRoomsByCategory, compareRoomNo, mapAuthRoleToFrontOffice } from '@/lib/types';
import { getHotSeasons, isHotSeasonDate } from '@/lib/api-calendar';
import type { Reservation, ReservationInput } from '@/lib/types-reservations';
import {
  getSettings, getRoomChartForDateRange, saveRoomChartRow, deleteRoomChartRow,
  getCompanySources, classifyCompany, getRoomCategories, getRooms,
} from '@/lib/api';
import {
  getReservationsForDateRange, getFutureReservationsCount, saveReservation, deleteReservation,
  updateReservationStatus, checkRoomAvailability, extendReservation,
} from '@/lib/api-reservations';
import { extendStay } from '@/lib/api-frontoffice';
import { getGuests } from '@/lib/api-crm';
import type { Guest } from '@/lib/types-crm';
import { VIP_BADGE_COLORS } from '@/lib/types-crm';
import { addDays, calcStayNights, fmtMoney, fmtInt, toNum, getTodayLocal } from '@/lib/calc';
import { BookingDetailPanel } from '@/components/BookingDetailPanel';
import { NewBookingModal } from '@/components/NewBookingModal';
import { CheckInModal } from '@/components/frontoffice/CheckInModal';
import { WalkInModal } from '@/components/frontoffice/WalkInModal';
import { CheckOutModal } from '@/components/frontoffice/CheckOutModal';
import { RoomShiftModal } from '@/components/frontoffice/RoomShiftModal';
import { ExtendStayModal } from '@/components/frontoffice/ExtendStayModal';
import { GuestFolio } from '@/components/frontoffice/GuestFolio';
import { useAuth } from '@/lib/auth';
import { useHotel } from '@/lib/hotel-context';

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
  rawReservation?: Reservation | null;
  rawEntry?: RoomChartEntry | null;
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

const fmtDay = (d: string): string => {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  return dt.toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });
};

const fmtDateFull = (d: string): string => {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  return dt.toLocaleDateString('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
};

const daysBetween = (start: string, end: string): string[] => {
  const days: string[] = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard < 100) {
    days.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return days;
};

export const OperationsBoard = ({ date, onBack, onSaved, onNavigate }: OperationsBoardProps) => {
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [sources, setSources] = useState<CompanySource[]>([]);
  const [categories, setCategories] = useState<RoomCategory[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [entries, setEntries] = useState<RoomChartEntry[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [categoryAvailability, setCategoryAvailability] = useState<Map<string, AuthoritativeMatrixItem>>(new Map());
  const [adjustModalData, setAdjustModalData] = useState<{
    categoryId: string;
    categoryName: string;
    startDate: string;
    endDate: string;
    availability: number;
    stopSell: boolean;
  } | null>(null);
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
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
  const [guests, setGuests] = useState<Guest[]>([]);
  const [hotSeasons, setHotSeasons] = useState<HotSeason[]>([]);
  const [futureCount, setFutureCount] = useState(0);

  // Drag-to-resize state
  const [stretchingBooking, setStretchingBooking] = useState<BoardBooking | null>(null);
  const [stretchTargetDate, setStretchTargetDate] = useState<string | null>(null);

  const { role: authRole } = useAuth();
  const foRole: FrontOfficeRole | null = authRole ? mapAuthRoleToFrontOffice(authRole) : null;
  const { hotelId, status: hotelStatus } = useHotel();

  const daysToShow = viewMode === 'day' ? 1 : 7;
  const timelineStart = viewMode === 'day' ? centerDate : addDays(centerDate, -3);
  const timelineDates = useMemo(
    () => Array.from({ length: daysToShow }, (_, i) => addDays(timelineStart, i)),
    [timelineStart, daysToShow],
  );

  const load = useCallback(async () => {
    if (!hotelId || hotelStatus !== 'HOTEL_CONTEXT_READY') return;
    try {
      setLoading(true);
      setError(null);
      const [s, srcs, cats, rms, hs] = await Promise.all([
        getSettings().catch(() => null),
        getCompanySources().catch(() => []),
        getRoomCategories().catch(() => []),
        getRooms().catch(() => []),
        getHotSeasons().catch(() => []),
      ]);
      setSettings(s);
      setSources(srcs);
      setCategories(cats);
      setRooms(rms);
      setHotSeasons(hs);

      const rangeStart = timelineDates[0];
      const rangeEnd = timelineDates[timelineDates.length - 1];
      const rangeEndInclusive = addDays(rangeEnd, 1);

      const [es, resvs, futCount, matrixData] = await Promise.all([
        getRoomChartForDateRange(rangeStart, rangeEndInclusive),
        getReservationsForDateRange(rangeStart, rangeEndInclusive),
        getFutureReservationsCount(centerDate).catch(() => 0),
        getAuthoritativeAvailabilityMatrix(rangeStart, rangeEnd).catch((err) => {
          console.warn('[OperationsBoard] matrix fetch failed:', err);
          return { matrix: [] as AuthoritativeMatrixItem[], source: 'supabase' as const };
        }),
      ]);
      setEntries(es);
      setReservations(resvs);
      setFutureCount(futCount);

      const map = new Map<string, AuthoritativeMatrixItem>();
      if (matrixData && Array.isArray(matrixData.matrix)) {
        for (const item of matrixData.matrix) {
          map.set(`${item.room_category_id}_${item.date}`, item);
        }
      }
      setCategoryAvailability(map);

      // Fetch VIP guests and all guest profiles for contact resolution
      try {
        const allGuests = await getGuests();
        setGuests(allGuests);
        setVipGuests(allGuests.filter((g) => g.vip_type !== ''));
      } catch { /* non-critical */ }
    } catch (e) {
      console.error('[OperationsBoard] Failed to load board data:', e);
      setError(e instanceof Error ? e.message : 'Failed to load board data');
    } finally {
      setLoading(false);
    }
  }, [timelineDates, centerDate, hotelId, hotelStatus]);

  useEffect(() => { load(); }, [load]);

  // Automatically refresh board when live sync, realtime OTA, or availability updates fire
  useEffect(() => {
    const handleUpdate = () => {
      load();
    };
    window.addEventListener('hotel_mantri_reservations_updated', handleUpdate);
    window.addEventListener('hotel_mantri_availability_updated', handleUpdate);
    return () => {
      window.removeEventListener('hotel_mantri_reservations_updated', handleUpdate);
      window.removeEventListener('hotel_mantri_availability_updated', handleUpdate);
    };
  }, [load]);

  // Realtime postgres_changes subscription for channel_inventory_restrictions
  useEffect(() => {
    if (!hotelId || hotelStatus !== 'HOTEL_CONTEXT_READY') return;
    const channel = supabase
      .channel(`ops-board-restrictions-${hotelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channel_inventory_restrictions',
          filter: `hotel_id=eq.${hotelId}`,
        },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hotelId, hotelStatus, load]);

  const handleSaveAvailability = async (data: {
    categoryId: string;
    startDate: string;
    endDate: string;
    availability: number;
    stopSell: boolean;
  }) => {
    setAdjustSaving(true);
    setAdjustError(null);
    try {
      const dates = daysBetween(data.startDate, data.endDate);
      const safeAvail = Math.max(0, Math.floor(data.availability));
      if (dates.length === 1) {
        await upsertInventoryRestriction({
          room_category_id: data.categoryId,
          date: dates[0],
          availability: safeAvail,
          stop_sell: data.stopSell,
        });
      } else {
        await bulkUpdateInventory(
          dates.map((d) => ({
            room_category_id: data.categoryId,
            date: d,
            availability: safeAvail,
            stop_sell: data.stopSell,
          }))
        );
      }
      await load();
      setAdjustModalData(null);
    } catch (err: any) {
      console.error('[OperationsBoard] Failed to save availability:', err);
      setAdjustError(err.message || 'Failed to update availability');
    } finally {
      setAdjustSaving(false);
    }
  };

  const activeRooms = useMemo(() => rooms.filter((r) => r.is_active), [rooms]);
  const floors = useMemo(
    () => [...new Set(activeRooms.map((r) => r.floor).filter((f): f is string => Boolean(f)))].sort(),
    [activeRooms],
  );

  const allBookings = useMemo((): BoardBooking[] => {
    const result: BoardBooking[] = [];
    const matchedReservationIds = new Set<string>();
    const matchedEntryIds = new Set<string>();

    // 1. Process entries (checked-in / in-house stays and walk-ins)
    for (const e of entries) {
      const hasPay = toNum(e.pay_cash) + toNum(e.pay_upi) + toNum(e.pay_card) + toNum(e.pay_bank) + toNum(e.pay_advance) > 0;
      const res = reservations.find((r) => 
        (e.reservation_id && r.id === e.reservation_id) || 
        (r.room_chart_entry_id && r.room_chart_entry_id === e.id) || 
        (r.room_no.trim().toLowerCase() === e.room_no.trim().toLowerCase() && 
         (r.check_in_date ?? '').slice(0, 10) === (e.arrival ?? e.report_date).slice(0, 10))
      );
      if (res) matchedReservationIds.add(res.id);
      matchedEntryIds.add(e.id);

      const guest = guests.find((g) => (e.guest_id && g.id === e.guest_id) || (res && g.id === res.guest_id) || (g.name && e.guest_name && g.name.trim().toLowerCase() === e.guest_name.trim().toLowerCase()));
      const phone = res?.guest_phone || guest?.mobile || '';
      const email = res?.guest_email || guest?.email || '';
      const vipType = guest?.vip_type || (phone ? vipGuests.find((g) => g.mobile === phone)?.vip_type : '') || '';

      const checkIn = (e.arrival && e.arrival.trim() !== '' ? e.arrival : e.report_date).slice(0, 10);
      const checkOut = (e.departure && e.departure.trim() !== '' ? e.departure : e.report_date).slice(0, 10);
      const isCheckedOut = Boolean(e.checked_out_at);

      result.push({
        id: e.id,
        type: 'entry',
        roomNo: e.room_no,
        guestName: e.guest_name || res?.guest_name || 'Guest',
        sourceCategory: e.source_category || res?.source_category || 'Direct/Walking',
        sourceName: e.company || res?.source_name || '',
        status: isCheckedOut ? 'checked_out' : (e.is_complimentary ? 'complimentary' : 'checked_in'),
        paymentMode: e.pay_mode || res?.payment_mode || 'Cash',
        checkIn,
        checkOut,
        rate: toNum(e.room_rate) > 0 ? toNum(e.room_rate) : (res ? toNum(res.rate) : 0),
        nights: Math.max(1, toNum(e.nights) || calcStayNights(checkIn, checkOut)),
        phone,
        email,
        remarks: e.remarks || res?.remarks || '',
        isComplimentary: e.is_complimentary,
        hasPayment: hasPay || (res ? toNum(res.advance_paid) > 0 : false),
        vipType,
        raw: e,
        rawReservation: res ?? null,
        rawEntry: e,
      });
    }

    // 2. Process reservations not already merged into an entry
    for (const r of reservations) {
      if (r.status === 'cancelled' || r.status === 'no_show') continue;
      if (matchedReservationIds.has(r.id)) continue;
      if (r.room_chart_entry_id && matchedEntryIds.has(r.room_chart_entry_id)) continue;

      const guest = guests.find((g) => g.id === r.guest_id || (r.guest_phone && g.mobile === r.guest_phone));
      const phone = r.guest_phone || guest?.mobile || '';
      const email = r.guest_email || guest?.email || '';
      const vipType = vipGuests.find((g) => g.mobile && g.mobile === phone)?.vip_type ?? guest?.vip_type ?? '';
      const checkIn = (r.check_in_date ?? '').slice(0, 10);
      const checkOut = (r.check_out_date ?? '').slice(0, 10);

      result.push({
        id: r.id,
        type: 'reservation',
        roomNo: r.room_no,
        guestName: r.guest_name || 'Guest',
        sourceCategory: r.source_category || 'Direct/Walking',
        sourceName: r.source_name || '',
        status: r.status,
        paymentMode: r.payment_mode || 'Cash',
        checkIn,
        checkOut,
        rate: toNum(r.rate),
        nights: Math.max(1, toNum(r.nights) || calcStayNights(checkIn, checkOut)),
        phone,
        email,
        remarks: r.remarks || '',
        isComplimentary: false,
        hasPayment: toNum(r.advance_paid) > 0,
        vipType,
        raw: r,
        rawReservation: r,
        rawEntry: null,
      });
    }
    return result;
  }, [entries, reservations, guests, vipGuests]);

  const filteredBookings = useMemo(() => {
    let result = allBookings;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (b) =>
          b.guestName.toLowerCase().includes(q) ||
          b.roomNo.toLowerCase().includes(q) ||
          b.phone.toLowerCase().includes(q) ||
          b.sourceName.toLowerCase().includes(q) ||
          b.sourceCategory.toLowerCase().includes(q) ||
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

  const unassignedBookings = useMemo(() => {
    return filteredBookings.filter((b) => {
      if (!b.roomNo || !b.roomNo.trim()) return true;
      const r = b.roomNo.trim().toUpperCase();
      return r === 'TBD' || r === 'UNASSIGNED';
    });
  }, [filteredBookings]);

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
    const selectedDate = centerDate;
    const occupiedRoomNos = new Set<string>();
    let todayRevenue = 0;
    let missingTariffCount = 0;
    let missingPaymentCount = 0;

    for (const b of allBookings) {
      if (b.status === 'cancelled' || b.status === 'no_show') continue;

      const isIntervalOccupied = (b.checkIn <= selectedDate && b.checkOut > selectedDate) ||
        (b.checkIn === selectedDate && b.checkOut === selectedDate);
      
      if (isIntervalOccupied && b.status !== 'checked_out') {
        const roomKey = b.roomNo.trim().toLowerCase();
        if (roomKey && roomKey !== 'tbd' && roomKey !== 'unassigned') {
          occupiedRoomNos.add(roomKey);
        }
        // Recognize nightly room revenue on this business date
        todayRevenue += toNum(b.rate);

        // Missing tariff check
        if (toNum(b.rate) === 0 && !b.isComplimentary) {
          missingTariffCount++;
        }

        // Missing payment check (exclude OTA/prepaid/complimentary)
        const isOtaOrPrepaid = b.sourceCategory === 'OTA' || b.paymentMode === 'OTA' || b.isComplimentary;
        if (!isOtaOrPrepaid && !b.hasPayment) {
          missingPaymentCount++;
        }
      }
    }

    const occupied = occupiedRoomNos.size;
    const vacant = Math.max(0, activeRooms.length - occupied);

    // Arrivals on selectedDate: eligible confirmed arrivals who have not checked in yet
    const arrivals = allBookings.filter((b) => 
      b.checkIn === selectedDate && 
      b.status === 'confirmed'
    ).length;

    // Departures on selectedDate: staying guests checking out on selectedDate
    const departures = allBookings.filter((b) => 
      b.checkOut === selectedDate && 
      b.status !== 'cancelled' && 
      b.status !== 'no_show' && 
      b.status !== 'checked_out'
    ).length;

    // Future confirmed bookings strictly after selectedDate
    const futureBookings = futureCount > 0 ? futureCount : allBookings.filter(
      (b) => b.status === 'confirmed' && b.checkIn > selectedDate
    ).length;

    return {
      occupied,
      vacant,
      arrivals,
      departures,
      futureBookings,
      todayRevenue,
      missingTariff: missingTariffCount,
      missingPayment: missingPaymentCount,
    };
  }, [allBookings, centerDate, activeRooms.length, futureCount]);

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

  const handleSaveReservation = async (input: ReservationInput | ReservationInput[], id?: string) => {
    setSaving(true);
    try {
      const inputs = Array.isArray(input) ? input : [input];
      
      for (const i of inputs) {
        const available = await checkRoomAvailability(
          i.room_no, i.check_in_date, i.check_out_date, id,
        );
        if (!available) {
          setError(`Room ${i.room_no} is already booked for the selected dates. Please adjust your selection.`);
          return;
        }
      }
      
      for (const i of inputs) {
        await saveReservation(i, id);
      }
      
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
      await updateReservationStatus(id, 'cancelled');
      await load();
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const getResolvedEntry = useCallback((booking: BoardBooking): RoomChartEntry | null => {
    if (booking.type === 'entry') return booking.raw as RoomChartEntry;
    if (booking.rawEntry) return booking.rawEntry;
    const match = entries.find(e => e.reservation_id === booking.id || (booking.raw as Reservation).room_chart_entry_id === e.id);
    if (match) return match;
    if (booking.status === 'checked_in' || booking.status === 'occupied') {
      const res = (booking.rawReservation || booking.raw) as Reservation;
      return {
        id: booking.id,
        hotel_id: res.hotel_id,
        report_date: booking.checkIn,
        room_no: booking.roomNo,
        guest_name: booking.guestName,
        arrival: booking.checkIn,
        departure: booking.checkOut,
        nights: booking.nights,
        room_rate: booking.rate,
        total: booking.rate * booking.nights,
        company: booking.sourceName,
        source_category: (booking.sourceCategory as SourceCategory) || 'Direct/Walking',
        pay_mode: (booking.paymentMode as PayMode) || 'Cash',
        description: '',
        is_complimentary: false,
        meal_plan: (res.meal_plan as MealPlan) || 'EP',
        gst_mode: 'Exclusive',
        gst_type: (res.gst_type as GstType) || 'No Scope',
        gst_slab: (res.gst_slab as GstSlab) || 0,
        gst_amount: toNum(res.gst_amount),
        taxable_amount: toNum(res.taxable_amount),
        invoice_total: toNum(res.invoice_total) || (booking.rate * booking.nights),
        revenue_category: 'Room Revenue',
        remarks: booking.remarks,
        created_by: res.created_by ?? '',
        business_date: booking.checkIn,
        room_category: 'Standard',
        pay_cash: toNum(res.pay_cash),
        pay_upi: toNum(res.pay_upi),
        pay_card: toNum(res.pay_card),
        pay_bank: toNum(res.pay_bank),
        pay_advance: toNum(res.advance_paid),
        pay_balance: Math.max(0, (toNum(res.invoice_total) || (booking.rate * booking.nights)) - toNum(res.advance_paid)),
        id_proof_type: '',
        id_proof_number: '',
        id_proof_verified: false,
        arrival_time: '',
        checkout_time: '',
        checked_in_at: null,
        checked_out_at: null,
        reservation_id: booking.id,
      };
    }
    return null;
  }, [entries]);

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

  const commitStretch = useCallback(async (booking: BoardBooking, targetDate: string) => {
    const newCheckOutStr = addDays(targetDate, 1);
    const currentCheckOut = booking.checkOut;
    
    if (newCheckOutStr === currentCheckOut) {
      setStretchingBooking(null);
      setStretchTargetDate(null);
      return;
    }
    
    // Local validation
    if (newCheckOutStr > currentCheckOut) {
      const roomKey = booking.roomNo.trim().toLowerCase();
      const hasEntryOverlap = entries.some(e => 
        e.id !== booking.id && e.room_no.trim().toLowerCase() === roomKey &&
        !e.checked_out_at &&
        (e.arrival ?? e.report_date) < newCheckOutStr &&
        (e.departure ?? e.report_date) > currentCheckOut
      );
      const hasResOverlap = reservations.some(r => 
        r.id !== booking.id && r.room_no.trim().toLowerCase() === roomKey &&
        (r.status === 'confirmed' || r.status === 'checked_in') &&
        r.check_in_date < newCheckOutStr &&
        r.check_out_date > currentCheckOut
      );
      if (hasEntryOverlap || hasResOverlap) {
        alert('Room unavailable for the selected dates.');
        setStretchingBooking(null);
        setStretchTargetDate(null);
        return;
      }
    }
    
    setSaving(true);
    try {
      if (booking.type === 'entry') {
        await extendStay({ entryId: booking.id, newCheckOut: newCheckOutStr });
      } else {
        await extendReservation({ reservationId: booking.id, newCheckOut: newCheckOutStr });
      }
      await load();
      onSaved?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to resize stay');
    } finally {
      setSaving(false);
      setStretchingBooking(null);
      setStretchTargetDate(null);
    }
  }, [load, onSaved, entries, reservations]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (stretchingBooking && stretchTargetDate) {
        commitStretch(stretchingBooking, stretchTargetDate);
      } else {
        setStretchingBooking(null);
        setStretchTargetDate(null);
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [stretchingBooking, stretchTargetDate, commitStretch]);

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
      <div className="bg-white border-b border-slate-200/80 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
              <BedDouble className="w-4 h-4" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">Operations Board</h1>
          </div>
        </div>

        {/* Segmented Day/Week switcher */}
        <div className="flex items-center gap-1 bg-slate-100/90 border border-slate-200/80 rounded-xl p-1">
          <button
            onClick={() => setViewMode('day')}
            className={`px-3.5 py-1.5 text-xs sm:text-sm rounded-lg transition-all ${viewMode === 'day' ? 'bg-brand-600 text-white font-bold shadow-soft-blue' : 'text-slate-600 hover:text-slate-900 font-semibold'}`}
          >
            Day
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`px-3.5 py-1.5 text-xs sm:text-sm rounded-lg transition-all ${viewMode === 'week' ? 'bg-brand-600 text-white font-bold shadow-soft-blue' : 'text-slate-600 hover:text-slate-900 font-semibold'}`}
          >
            Week
          </button>
        </div>

        {/* Date Navigator */}
        <div className="flex items-center gap-2 bg-white border border-slate-200/80 px-3 py-1.5 rounded-xl shadow-sm">
          <button onClick={() => shiftTimeline(viewMode === 'day' ? -1 : -7)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs sm:text-sm text-slate-800 font-bold min-w-[130px] text-center">
            {fmtDateFull(timelineDates[0])}
            {viewMode === 'week' && ` – ${fmtDateFull(timelineDates[6])}`}
          </span>
          <button onClick={() => shiftTimeline(viewMode === 'day' ? 1 : 7)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCenterDate(getTodayLocal())}
            className="ml-1 px-2.5 py-1 text-xs text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200/80 rounded-lg font-bold transition"
          >
            Today
          </button>
        </div>

        <button
          onClick={load}
          className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition active:rotate-180 duration-300"
          title="Refresh Operations Board"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Actions Toolbar */}
      <div className="px-4 sm:px-6 py-3 bg-white border-b border-slate-200/80 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quick Actions</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-5 2xl:grid-cols-9 gap-2.5">
          <button
            onClick={() => setShowNewBooking(true)}
            className="flex items-center justify-center gap-2 h-[42px] px-3.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl shadow-soft-blue hover:shadow-md transition active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" /> <span className="whitespace-nowrap">New Reservation</span>
          </button>
          <button
            onClick={() => setShowWalkIn(true)}
            className="flex items-center justify-center gap-2 h-[42px] px-3.5 bg-brand-navy-600 hover:bg-brand-navy-700 text-white text-xs font-semibold rounded-xl shadow-sm transition active:scale-95 shrink-0"
          >
            <LogIn className="w-4 h-4" /> <span className="whitespace-nowrap">Walk-In</span>
          </button>
          <button
            onClick={() => {
              if (categories.length > 0) {
                const firstCat = categories[0];
                const item = categoryAvailability.get(`${firstCat.id}_${centerDate}`);
                const fallbackAvail = activeRooms.filter(r => r.category_id === firstCat.id).length;
                setAdjustError(null);
                setAdjustModalData({
                  categoryId: firstCat.id,
                  categoryName: firstCat.name,
                  startDate: centerDate,
                  endDate: centerDate,
                  availability: item !== undefined ? item.available : fallbackAvail,
                  stopSell: Boolean(item?.stop_sell),
                });
              }
            }}
            className="flex items-center justify-center gap-2 h-[42px] px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition active:scale-95 shrink-0"
            title="Adjust sellable room availability & restrictions"
          >
            <Sliders className="w-4 h-4" /> <span className="whitespace-nowrap">Adjust Availability</span>
          </button>
          <button
            onClick={() => selectedBooking && handleCheckIn(selectedBooking)}
            disabled={!selectedBooking || selectedBooking.status !== 'confirmed'}
            className="flex items-center justify-center gap-2 h-[42px] px-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl shadow-sm transition active:scale-95 shrink-0"
          >
            <LogIn className="w-4 h-4" /> <span className="whitespace-nowrap">Check-In</span>
          </button>
          <button
            onClick={() => selectedBooking && handleCheckOut(selectedBooking)}
            disabled={!selectedBooking || (selectedBooking.status !== 'checked_in' && selectedBooking.status !== 'occupied')}
            className="flex items-center justify-center gap-2 h-[42px] px-3.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl shadow-sm transition active:scale-95 shrink-0"
          >
            <LogOut className="w-4 h-4" /> <span className="whitespace-nowrap">Check-Out</span>
          </button>
          <button
            onClick={() => onNavigate?.('roomchart')}
            className="flex items-center justify-center gap-2 h-[42px] px-3.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl shadow-sm transition active:scale-95 shrink-0"
          >
            <FileText className="w-4 h-4" /> <span className="whitespace-nowrap">Daily Entry</span>
          </button>
          <button
            onClick={() => selectedBooking && handleViewFolio(selectedBooking)}
            disabled={!selectedBooking}
            className="flex items-center justify-center gap-2 h-[42px] px-3.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl shadow-sm transition active:scale-95 shrink-0"
          >
            <Wallet className="w-4 h-4" /> <span className="whitespace-nowrap">Collect Payment</span>
          </button>
          <button
            onClick={() => selectedBooking && handleRoomShift(selectedBooking)}
            disabled={!selectedBooking || (selectedBooking.status !== 'checked_in' && selectedBooking.status !== 'occupied')}
            className="flex items-center justify-center gap-2 h-[42px] px-3.5 bg-slate-600 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl shadow-sm transition active:scale-95 shrink-0"
          >
            <ArrowRightLeft className="w-4 h-4" /> <span className="whitespace-nowrap">Room Shift</span>
          </button>
          <button
            onClick={() => selectedBooking && handleExtendStay(selectedBooking)}
            disabled={!selectedBooking || (selectedBooking.status !== 'checked_in' && selectedBooking.status !== 'occupied')}
            className="flex items-center justify-center gap-2 h-[42px] px-3.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl shadow-sm transition active:scale-95 shrink-0"
          >
            <CalendarPlus className="w-4 h-4" /> <span className="whitespace-nowrap">Extend Stay</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="px-4 sm:px-6 py-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 2xl:grid-cols-8 gap-3 sm:gap-4">
        <KpiCard icon={BedDouble} label="Occupied" value={fmtInt(todayStats.occupied)} color="text-emerald-600 bg-emerald-50 border border-emerald-100" />
        <KpiCard icon={BedDouble} label="Vacant" value={fmtInt(todayStats.vacant)} color="text-slate-600 bg-slate-100 border border-slate-200" />
        <KpiCard icon={LogIn} label="Arrivals" value={fmtInt(todayStats.arrivals)} color="text-brand-600 bg-brand-50 border border-brand-100" />
        <KpiCard icon={LogOut} label="Departures" value={fmtInt(todayStats.departures)} color="text-orange-600 bg-orange-50 border border-orange-100" />
        <KpiCard icon={Calendar} label="Future" value={fmtInt(todayStats.futureBookings)} color="text-brand-navy-600 bg-brand-navy-50 border border-brand-navy-100" />
        <KpiCard icon={IndianRupee} label="Revenue" value={`₹${fmtMoney(todayStats.todayRevenue)}`} color="text-emerald-600 bg-emerald-50 border border-emerald-100" />
        <KpiCard icon={AlertCircle} label="Missing Tariff" value={fmtInt(todayStats.missingTariff)} color="text-rose-600 bg-rose-50 border border-rose-100" />
        <KpiCard icon={AlertCircle} label="Missing Pay" value={fmtInt(todayStats.missingPayment)} color="text-rose-600 bg-rose-50 border border-rose-100" />
      </div>

      {/* Housekeeping Indicators Strip */}
      <div className="px-4 sm:px-6 pb-2">
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

      {/* Unassigned Bookings Notification */}
      {unassignedBookings.length > 0 && (
        <div className="mx-4 mb-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-xs font-bold text-amber-900">
                {unassignedBookings.length} Unassigned OTA Reservation{unassignedBookings.length > 1 ? 's' : ''} (Need Room Allocation)
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {unassignedBookings.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBooking(b)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-xs text-slate-800 hover:bg-amber-100/50 transition shrink-0 shadow-xs text-left cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <span className="font-bold text-slate-900">{b.guestName || 'Guest'}</span>
                <span className="text-slate-500">({b.checkIn} → {b.checkOut})</span>
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Assign Room</span>
              </button>
            ))}
          </div>
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
                const isHot = isHotSeasonDate(d, hotSeasons);
                return (
                  <div
                    key={d}
                    className={`flex-1 min-w-[90px] sm:min-w-[100px] px-2 py-2 text-center text-xs font-bold border-r border-slate-200 ${
                      isHot
                        ? isToday
                          ? 'bg-rose-100 text-rose-700 border-b-2 border-rose-500'
                          : 'bg-rose-50 text-rose-700'
                        : isToday
                        ? 'bg-brand-100 text-brand-700'
                        : 'text-slate-600'
                    }`}
                  >
                    {fmtDay(d)}
                  </div>
                );
              })}
            </div>
            {/* Unassigned / Pending Room Allocation Timeline Row */}
            {unassignedBookings.length > 0 && (
              <div className="border-b-2 border-amber-300 bg-amber-50/20">
                <div className="flex border-b border-amber-200 bg-amber-100/70 sticky left-0 z-[6]">
                  <div className="w-28 sm:w-32 flex-shrink-0 px-3 py-2 border-r border-amber-200 bg-amber-100/90 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">
                      UNASSIGNED
                    </span>
                    <span className="text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.2 rounded-full">
                      {unassignedBookings.length}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 flex items-center px-3">
                    <span className="text-[10px] font-semibold text-amber-800">
                      Pending Room Allocation ({unassignedBookings.length} booking{unassignedBookings.length > 1 ? 's' : ''}) — Click card to assign room
                    </span>
                  </div>
                </div>
                <div className="flex border-b border-amber-200/60 hover:bg-amber-100/30 transition">
                  <div className="w-28 sm:w-32 flex-shrink-0 px-3 py-2 border-r border-amber-200 bg-amber-50 sticky left-0 z-[5] flex flex-col justify-center">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                      <span className="text-sm font-bold text-amber-900">TBD</span>
                    </div>
                    <span className="text-[10px] text-amber-700">Unassigned</span>
                  </div>
                  {timelineDates.map((d) => {
                    const dayBookings = unassignedBookings.filter(
                      (b) => (d >= b.checkIn && d < b.checkOut) || (d === b.checkIn && b.checkIn === b.checkOut)
                    );
                    const isToday = d === date;
                    return (
                      <div
                        key={d}
                        className={`flex-1 min-w-[90px] sm:min-w-[100px] px-1 py-1.5 border-r border-amber-100 ${
                          isToday ? 'bg-amber-50/50' : ''
                        }`}
                      >
                        {dayBookings.map((b) => (
                          <BookingBar key={b.id} booking={b} onClick={() => setSelectedBooking(b)} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Room rows grouped by category */}
            {(() => {
              const sortedRooms = [...activeRooms].sort((a, b) => compareRoomNo(a.room_no, b.room_no));
              const grouped = groupRoomsByCategory(sortedRooms, categories);
              return grouped.map((group) => (
                <div key={group.cat?.id ?? '__uncategorized'}>
                  {/* Category header row with authoritative availability & click-to-edit */}
                  <div className="flex border-b border-slate-200 bg-brand-navy-50 sticky left-0 z-[6]">
                    <div className="w-28 sm:w-32 flex-shrink-0 px-3 py-2 border-r border-slate-200 bg-brand-navy-50 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-brand-navy-700 uppercase tracking-wider truncate" title={group.cat?.name ?? 'Uncategorized'}>
                        {group.cat?.name ?? 'Uncategorized'}
                      </span>
                      <span className="text-[10px] font-bold text-brand-navy-600 bg-white/70 px-1.5 py-0.5 rounded border border-brand-navy-200/80 shadow-2xs">
                        {group.rooms.length}
                      </span>
                    </div>
                    {timelineDates.map((d) => {
                      const catId = group.cat?.id;
                      const authItem = catId ? categoryAvailability.get(`${catId}_${d}`) : undefined;
                      const occupiedCount = group.rooms.filter((r) => {
                        const roomKey = r.room_no.trim().toLowerCase();
                        const roomBookings = bookingByRoom.get(roomKey) ?? [];
                        return roomBookings.some((b) => (d >= b.checkIn && d < b.checkOut) || (d === b.checkIn && b.checkIn === b.checkOut));
                      }).length;
                      const fallbackAvail = Math.max(0, group.rooms.length - occupiedCount);
                      const availVal = authItem !== undefined ? authItem.available : fallbackAvail;
                      const isStopSell = Boolean(authItem?.stop_sell);
                      const isOverridden = Boolean(authItem?.is_manual || isStopSell);

                      return (
                        <div
                          key={d}
                          className="flex-1 min-w-[90px] sm:min-w-[100px] px-1.5 py-1 border-r border-brand-navy-100 flex items-center justify-center bg-brand-navy-50/70"
                        >
                          {catId ? (
                            <button
                              type="button"
                              onClick={() => {
                                setAdjustError(null);
                                setAdjustModalData({
                                  categoryId: catId,
                                  categoryName: group.cat?.name ?? 'Room Category',
                                  startDate: d,
                                  endDate: d,
                                  availability: availVal,
                                  stopSell: isStopSell,
                                });
                              }}
                              className={`w-full h-7 px-1.5 rounded-md text-[11px] font-bold transition flex items-center justify-between gap-1 shadow-2xs group cursor-pointer ${
                                isStopSell
                                  ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                                  : availVal === 0
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 hover:bg-emerald-100 hover:border-emerald-300'
                              }`}
                              title={`Category: ${group.cat?.name ?? 'Room'}\nDate: ${d}\nAvailability: ${availVal} sellable (${group.rooms.length} physical)\nStatus: ${isStopSell ? 'Stop Sell' : isOverridden ? 'Manual Override' : 'Standard'}\nClick to adjust`}
                            >
                              <span className="truncate flex items-center gap-1">
                                {isOverridden && <span className="w-1.5 h-1.5 rounded-full bg-brand-600 shrink-0" title="Manual restriction active" />}
                                {isStopSell ? 'Stop Sell' : `${availVal} Avail`}
                              </span>
                              <Edit3 className="w-3 h-3 text-slate-400 group-hover:text-brand-600 shrink-0 opacity-70 group-hover:opacity-100" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400">{availVal} Avail</span>
                          )}
                        </div>
                      );
                    })}
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
                          let dayBookings = roomBookings.filter((b) => {
                            if (stretchingBooking && b.id === stretchingBooking.id && stretchTargetDate) {
                              const newCheckOutStr = addDays(stretchTargetDate, 1);
                              return (d >= b.checkIn && d < newCheckOutStr) || (d === b.checkIn && b.checkIn === newCheckOutStr);
                            }
                            return (d >= b.checkIn && d < b.checkOut) || (d === b.checkIn && b.checkIn === b.checkOut);
                          });
                          const isToday = d === date;
                          const isHot = isHotSeasonDate(d, hotSeasons);
                          
                          const isStretchPreview = Boolean(
                            stretchingBooking &&
                            stretchingBooking.roomNo === room.room_no &&
                            stretchTargetDate &&
                            d > addDays(stretchingBooking.checkOut, -1) &&
                            d <= stretchTargetDate
                          );
                          
                          let isStretchInvalid = false;
                          if (isStretchPreview && stretchingBooking && stretchTargetDate) {
                            const newCheckOutStr = addDays(stretchTargetDate, 1);
                            const currentCheckOut = stretchingBooking.checkOut;
                            const currentRoomBookings = bookingByRoom.get(room.room_no.trim().toLowerCase()) ?? [];
                            isStretchInvalid = currentRoomBookings.some(b => 
                              b.id !== stretchingBooking.id &&
                              b.checkIn < newCheckOutStr && b.checkOut > currentCheckOut
                            );
                          }

                          const isStretchShrinkPreview = Boolean(
                            stretchingBooking &&
                            stretchingBooking.roomNo === room.room_no &&
                            stretchTargetDate &&
                            d > stretchTargetDate &&
                            d <= addDays(stretchingBooking.checkOut, -1)
                          );
                          
                          return (
                            <div
                              key={d}
                              title={isStretchInvalid ? 'Room unavailable' : undefined}
                              onMouseEnter={() => {
                                if (stretchingBooking && stretchingBooking.roomNo === room.room_no) {
                                  if (d >= stretchingBooking.checkIn) {
                                    setStretchTargetDate(d);
                                  }
                                }
                              }}
                              className={`flex-1 min-w-[90px] sm:min-w-[100px] px-1 py-1.5 border-r border-slate-100 transition-colors ${
                                isStretchInvalid ? 'bg-red-50/80 ring-1 ring-red-400 z-10 cursor-not-allowed' :
                                isStretchPreview ? 'bg-emerald-100/80 ring-1 ring-emerald-400 z-10' :
                                isStretchShrinkPreview ? 'bg-rose-50/80 ring-1 ring-rose-400 opacity-60 z-10' :
                                isHot
                                  ? 'bg-rose-50/20'
                                  : isToday
                                  ? 'bg-brand-50/40'
                                  : ''
                              }`}
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
                                dayBookings.map((b) => {
                                  const effectiveCheckOut = (stretchingBooking && b.id === stretchingBooking.id && stretchTargetDate) 
                                    ? addDays(stretchTargetDate, 1) 
                                    : b.checkOut;
                                  const isEnd = addDays(effectiveCheckOut, -1) === d;
                                  const isStretching = stretchingBooking?.id === b.id;
                                  return (
                                    <BookingBar 
                                      key={b.id} 
                                      booking={b} 
                                      onClick={() => setSelectedBooking(b)} 
                                      isEnd={isEnd}
                                      isStretching={isStretching}
                                      onMouseDownStretch={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        setStretchingBooking(b);
                                        setStretchTargetDate(d);
                                      }}
                                    />
                                  );
                                })
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
            
            {/* Daily Summary Footer */}
            <div className="border-t-2 border-slate-200 bg-slate-50/90 flex flex-col text-xs sticky bottom-0 z-[15]">
              {/* Occupied Row */}
              <div className="flex border-b border-slate-200/80">
                <div className="w-28 sm:w-32 flex-shrink-0 px-3 py-2 border-r border-slate-200/80 bg-slate-50 font-bold text-slate-700 sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  Occupied
                </div>
                {timelineDates.map((d) => {
                  const occCount = activeRooms.filter((r) => {
                    const roomKey = r.room_no.trim().toLowerCase();
                    const roomBookings = bookingByRoom.get(roomKey) ?? [];
                    return roomBookings.some((b) => (d >= b.checkIn && d < b.checkOut) || (d === b.checkIn && b.checkIn === b.checkOut));
                  }).length;
                  return (
                    <div key={d} className="flex-1 min-w-[90px] sm:min-w-[100px] px-2 py-2 text-center font-bold text-slate-900 border-r border-slate-200/80 tabular-nums">
                      {occCount}
                    </div>
                  );
                })}
              </div>
              {/* Available Row */}
              <div className="flex border-b border-slate-200/80">
                <div className="w-28 sm:w-32 flex-shrink-0 px-3 py-2 border-r border-slate-200/80 bg-slate-50 font-bold text-slate-700 sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  Available
                </div>
                {timelineDates.map((d) => {
                  let totalAvail = 0;
                  categories.forEach((cat) => {
                    const authItem = categoryAvailability.get(`${cat.id}_${d}`);
                    if (authItem !== undefined) {
                      totalAvail += authItem.available;
                    } else {
                      const catRooms = activeRooms.filter((r) => r.category_id === cat.id);
                      const occCount = catRooms.filter((r) => {
                        const roomKey = r.room_no.trim().toLowerCase();
                        const roomBookings = bookingByRoom.get(roomKey) ?? [];
                        return roomBookings.some((b) => (d >= b.checkIn && d < b.checkOut) || (d === b.checkIn && b.checkIn === b.checkOut));
                      }).length;
                      totalAvail += Math.max(0, catRooms.length - occCount);
                    }
                  });
                  return (
                    <div key={d} className="flex-1 min-w-[90px] sm:min-w-[100px] px-2 py-2 text-center font-bold text-emerald-600 border-r border-slate-200/80 tabular-nums">
                      {totalAvail}
                    </div>
                  );
                })}
              </div>
              {/* Occupancy % Row */}
              <div className="flex border-b border-slate-200/80">
                <div className="w-28 sm:w-32 flex-shrink-0 px-3 py-2 border-r border-slate-200/80 bg-slate-50 font-bold text-slate-700 sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  Occupancy %
                </div>
                {timelineDates.map((d) => {
                  const occCount = activeRooms.filter((r) => {
                    const roomKey = r.room_no.trim().toLowerCase();
                    const roomBookings = bookingByRoom.get(roomKey) ?? [];
                    return roomBookings.some((b) => (d >= b.checkIn && d < b.checkOut) || (d === b.checkIn && b.checkIn === b.checkOut));
                  }).length;
                  const pct = activeRooms.length > 0 ? Math.round((occCount / activeRooms.length) * 100) : 0;
                  return (
                    <div key={d} className="flex-1 min-w-[90px] sm:min-w-[100px] px-2 py-2 text-center font-bold text-brand-600 border-r border-slate-200/80 tabular-nums">
                      {pct}%
                    </div>
                  );
                })}
              </div>
              {/* Daily Tariff Row */}
              <div className="flex">
                <div className="w-28 sm:w-32 flex-shrink-0 px-3 py-2 border-r border-slate-200/80 bg-slate-50 font-bold text-slate-700 sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  Daily Tariff
                </div>
                {timelineDates.map((d) => {
                  const rev = activeRooms.reduce((sum, r) => {
                    const roomKey = r.room_no.trim().toLowerCase();
                    const roomBookings = bookingByRoom.get(roomKey) ?? [];
                    const activeBooking = roomBookings.find((b) => (d >= b.checkIn && d < b.checkOut) || (d === b.checkIn && b.checkIn === b.checkOut));
                    return sum + (activeBooking ? activeBooking.rate : 0);
                  }, 0);
                  return (
                    <div key={d} className="flex-1 min-w-[90px] sm:min-w-[100px] px-2 py-2 text-center font-bold text-emerald-700 border-r border-slate-200/80 tabular-nums">
                      {`₹${Math.round(rev).toLocaleString('en-IN')}`}
                    </div>
                  );
                })}
              </div>
            </div>
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
      {showCheckIn && selectedBooking && (
        <CheckInModal
          reservation={((selectedBooking.rawReservation || selectedBooking.raw) as Reservation)}
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
      {showCheckOut && selectedBooking && getResolvedEntry(selectedBooking) && (
        <CheckOutModal
          entry={getResolvedEntry(selectedBooking)!}
          roomNo={selectedBooking.roomNo}
          role={foRole}
          onClose={() => { setShowCheckOut(false); setSelectedBooking(null); }}
          onCheckedOut={handleCheckOutComplete}
        />
      )}

      {/* Room Shift Modal */}
      {showRoomShift && selectedBooking && getResolvedEntry(selectedBooking) && (
        <RoomShiftModal
          entryId={getResolvedEntry(selectedBooking)!.id}
          fromRoom={selectedBooking.roomNo}
          rooms={activeRooms}
          categories={categories}
          role={foRole}
          onClose={() => { setShowRoomShift(false); setSelectedBooking(null); }}
          onShifted={handleRoomShiftComplete}
        />
      )}

      {/* Extend Stay Modal */}
      {showExtendStay && selectedBooking && getResolvedEntry(selectedBooking) && (
        <ExtendStayModal
          entry={getResolvedEntry(selectedBooking)!}
          role={foRole}
          onClose={() => { setShowExtendStay(false); setSelectedBooking(null); }}
          onExtended={handleExtendStayComplete}
        />
      )}

      {/* Guest Folio */}
      {showFolio && selectedBooking && (
        <GuestFolio
          entry={
            getResolvedEntry(selectedBooking) || {
              id: selectedBooking.id,
              hotel_id: hotelId ?? '',
              report_date: selectedBooking.checkIn,
              room_no: selectedBooking.roomNo,
              guest_name: selectedBooking.guestName,
              arrival: selectedBooking.checkIn,
              departure: selectedBooking.checkOut,
              nights: selectedBooking.nights,
              room_rate: selectedBooking.rate,
              total: selectedBooking.rate * selectedBooking.nights,
              company: selectedBooking.sourceName,
              source_category: (selectedBooking.sourceCategory as SourceCategory) || 'Direct/Walking',
              pay_mode: (selectedBooking.paymentMode as PayMode) || 'Cash',
              description: '',
              is_complimentary: false,
              meal_plan: ((selectedBooking.raw as Reservation)?.meal_plan as MealPlan) || 'EP',
              gst_mode: 'Exclusive',
              gst_type: ((selectedBooking.raw as Reservation)?.gst_type as GstType) || 'No Scope',
              gst_slab: ((selectedBooking.raw as Reservation)?.gst_slab as GstSlab) || 0,
              gst_amount: toNum((selectedBooking.raw as Reservation)?.gst_amount),
              taxable_amount: toNum((selectedBooking.raw as Reservation)?.taxable_amount),
              invoice_total: toNum((selectedBooking.raw as Reservation)?.invoice_total) || (selectedBooking.rate * selectedBooking.nights),
              revenue_category: 'Room Revenue',
              remarks: selectedBooking.remarks,
              created_by: (selectedBooking.raw as Reservation)?.created_by ?? '',
              business_date: selectedBooking.checkIn,
              room_category: 'Standard',
              pay_cash: toNum((selectedBooking.raw as Reservation)?.pay_cash),
              pay_upi: toNum((selectedBooking.raw as Reservation)?.pay_upi),
              pay_card: toNum((selectedBooking.raw as Reservation)?.pay_card),
              pay_bank: toNum((selectedBooking.raw as Reservation)?.pay_bank),
              pay_advance: toNum((selectedBooking.raw as Reservation)?.advance_paid),
              pay_balance: Math.max(0, (toNum((selectedBooking.raw as Reservation)?.invoice_total) || (selectedBooking.rate * selectedBooking.nights)) - toNum((selectedBooking.raw as Reservation)?.advance_paid)),
              id_proof_type: '',
              id_proof_number: '',
              id_proof_verified: false,
              arrival_time: '',
              checkout_time: '',
              checked_in_at: null,
              checked_out_at: null,
              reservation_id: selectedBooking.id,
            }
          }
          roomNo={selectedBooking.roomNo}
          rooms={activeRooms}
          categories={categories}
          settings={settings}
          booking={selectedBooking}
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

      {/* Availability Adjustment Modal */}
      {adjustModalData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-scale-in">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-brand-gold-400">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Adjust Room Availability</h3>
                  <p className="text-xs text-slate-400">Update sellable rooms & restrictions</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdjustModalData(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await handleSaveAvailability({
                  categoryId: adjustModalData.categoryId,
                  startDate: adjustModalData.startDate,
                  endDate: adjustModalData.endDate,
                  availability: adjustModalData.availability,
                  stopSell: adjustModalData.stopSell,
                });
              }}
              className="p-5 space-y-4"
            >
              {adjustError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{adjustError}</span>
                </div>
              )}

              {/* Room Category */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Room Category
                </label>
                <select
                  value={adjustModalData.categoryId}
                  onChange={(e) => {
                    const newCatId = e.target.value;
                    const catObj = categories.find((c) => c.id === newCatId);
                    const item = categoryAvailability.get(`${newCatId}_${adjustModalData.startDate}`);
                    const fallbackAvail = activeRooms.filter((r) => r.category_id === newCatId).length;
                    setAdjustModalData({
                      ...adjustModalData,
                      categoryId: newCatId,
                      categoryName: catObj?.name ?? 'Category',
                      availability: item !== undefined ? item.available : fallbackAvail,
                      stopSell: Boolean(item?.stop_sell),
                    });
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:border-brand-500 focus:outline-none transition"
                >
                  {categories.map((c) => {
                    const roomCount = activeRooms.filter((r) => r.category_id === c.id).length;
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} ({roomCount} physical rooms)
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={adjustModalData.startDate}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      setAdjustModalData({
                        ...adjustModalData,
                        startDate: newStart,
                        endDate: adjustModalData.endDate < newStart ? newStart : adjustModalData.endDate,
                      });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:border-brand-500 focus:outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    min={adjustModalData.startDate}
                    value={adjustModalData.endDate}
                    onChange={(e) =>
                      setAdjustModalData({
                        ...adjustModalData,
                        endDate: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:border-brand-500 focus:outline-none transition"
                  />
                </div>
              </div>

              {/* Availability Count */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Sellable Availability
                  </label>
                  {(() => {
                    const physicalTotal = activeRooms.filter((r) => r.category_id === adjustModalData.categoryId).length;
                    return (
                      <span className="text-[11px] font-semibold text-slate-500">
                        Max Physical: {physicalTotal} rooms
                      </span>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setAdjustModalData({
                        ...adjustModalData,
                        availability: Math.max(0, adjustModalData.availability - 1),
                      })
                    }
                    className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-lg flex items-center justify-center transition active:scale-95 cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={adjustModalData.availability}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setAdjustModalData({
                        ...adjustModalData,
                        availability: isNaN(v) ? 0 : Math.max(0, v),
                      });
                    }}
                    className="flex-1 text-center py-2 bg-slate-50 border border-slate-200 rounded-xl text-base font-bold text-slate-900 focus:bg-white focus:border-brand-500 focus:outline-none transition tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setAdjustModalData({
                        ...adjustModalData,
                        availability: adjustModalData.availability + 1,
                      })
                    }
                    className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-lg flex items-center justify-center transition active:scale-95 cursor-pointer"
                  >
                    +
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Enter the number of rooms to make available for booking across all channels.
                </p>
              </div>

              {/* Stop Sell Toggle */}
              <div className="pt-2 border-t border-slate-100">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={adjustModalData.stopSell}
                    onChange={(e) =>
                      setAdjustModalData({
                        ...adjustModalData,
                        stopSell: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800">Stop Sell (Close Room Category)</span>
                    <p className="text-[11px] text-slate-500">
                      Forces sellable availability to 0 and blocks incoming reservations.
                    </p>
                  </div>
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAdjustModalData(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustSaving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-soft-blue transition active:scale-95 cursor-pointer"
                >
                  {adjustSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save Availability</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
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
  booking, onClick, isEnd = false, isStretching = false, onMouseDownStretch,
}: { booking: BoardBooking; onClick: () => void; isEnd?: boolean; isStretching?: boolean; onMouseDownStretch?: (e: React.MouseEvent) => void }) => {
  const sourceColor = SOURCE_COLORS[booking.sourceCategory] ?? 'bg-slate-400';
  const statusColor = STATUS_COLORS[booking.status] ?? 'bg-slate-400';
  const statusText = STATUS_TEXT_COLORS[booking.status] ?? 'text-slate-600';
  const payInfo = PAY_INDICATOR[booking.paymentMode];
  const total = booking.rate * booking.nights;
  const balance = Math.max(0, total - (booking.type === 'reservation' ? toNum((booking.raw as Reservation).advance_paid) : 0));

  return (
    <div className={`relative ${isStretching ? 'opacity-50' : ''}`}>
      <button
      onClick={onClick}
      title={`${booking.guestName || 'Guest'} · ${booking.sourceCategory} · ₹${fmtMoney(booking.rate)}/night${balance >= 1.0 ? ` · Due ₹${fmtMoney(balance)}` : ''}`}
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
        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
          <span className="truncate">{booking.sourceName || booking.sourceCategory}</span>
          {payInfo && booking.hasPayment && (
            <span className={`flex items-center gap-0.5 ${payInfo.color}`}>
              <payInfo.icon className="w-2.5 h-2.5" />
            </span>
          )}
          {booking.isComplimentary ? (
            <span className="text-brand-gold-600 font-bold">COMP</span>
          ) : (
            <span className="text-slate-700 font-semibold">₹{fmtMoney(booking.rate)}</span>
          )}
          {balance >= 1.0 && !booking.isComplimentary && (
            <span className="text-amber-700 font-bold bg-amber-50 border border-amber-200 px-1 py-0.2 rounded text-[9px]">Due ₹{fmtMoney(balance)}</span>
          )}
        </div>
      </div>
    </button>
    {/* Drag handle for resizing stay */}
    {isEnd && onMouseDownStretch && booking.type === 'entry' && (
      <div
        onMouseDown={onMouseDownStretch}
        className="absolute right-0 top-0 bottom-1 w-3.5 cursor-ew-resize flex items-center justify-center bg-brand-gold-400/40 hover:bg-brand-gold-500/80 rounded-r z-20 transition group/handle"
        title="Drag to extend or shorten stay"
      >
        <div className="w-1 h-3 bg-brand-gold-800/80 rounded-full group-hover/handle:bg-white shrink-0" />
      </div>
    )}
  </div>
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
