import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Plus, Search, X, Calendar, ChevronLeft, ChevronRight,
  BedDouble, Users, LogIn, LogOut, TrendingUp, Wallet, Banknote,
  Smartphone, AlertCircle, Filter, RefreshCw, Loader2, CheckCircle2,
  Clock, Phone, Mail, IndianRupee, MessageCircle, Edit3, FileText,
  Sparkles, Play, ClipboardCheck, Wrench, Ban, Star,
  ArrowRightLeft, CalendarPlus, AlertTriangle, Sliders, Check, Zap,
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
import { SOURCE_CATEGORIES, GST_TYPES, GST_SLABS, groupRoomsByCategory, compareRoomNo, mapAuthRoleToFrontOffice, normalizePayMode } from '@/lib/types';
import { getHotSeasons, isHotSeasonDate } from '@/lib/api-calendar';
import type { Reservation, ReservationInput } from '@/lib/types-reservations';
import {
  getSettings, getRoomChartForDateRange, saveRoomChartRow, deleteRoomChartRow,
  getCompanySources, classifyCompany, getRoomCategories, getRooms,
} from '@/lib/api';
import {
  getReservationsForDateRange, getFutureReservationsCount, saveReservation, saveReservations, deleteReservation,
  updateReservationStatus, checkRoomAvailability, extendReservation,
  extractUnassignedReason,
} from '@/lib/api-reservations';
import { extendStay, shiftRoom } from '@/lib/api-frontoffice';
import { getGuests } from '@/lib/api-crm';
import type { Guest } from '@/lib/types-crm';
import { addDays, calcStayNights, fmtMoney, fmtInt, toNum, getTodayLocal, isStayOverlapping, calcGstFull } from '@/lib/calc';
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

// Modular Subcomponents
import type { BoardBooking, ViewMode, TodayStats } from './operations/types';
import { OperationsHeader } from './operations/OperationsHeader';
import { OperationsActions } from './operations/OperationsActions';
import { OperationsKpiStrip } from './operations/OperationsKpiStrip';
import { OperationsFilterBar } from './operations/OperationsFilterBar';
import { BookingBar } from './operations/BookingBar';
import { UnassignedBookingsBanner } from './operations/UnassignedBookingsBanner';
import { AdjustAvailabilityModal } from './operations/AdjustAvailabilityModal';
import { RoomMoveModal, type RoomMovePayload } from './operations/RoomMoveModal';

interface OperationsBoardProps {
  date: string;
  onBack: () => void;
  onSaved: () => void;
  onNavigate?: (screen: string) => void;
}

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

export const OperationsBoard: React.FC<OperationsBoardProps> = ({
  date,
  onBack,
  onSaved,
  onNavigate,
}) => {
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

  // Drag-to-move booking state (Room shift / Date shift)
  const [movingBooking, setMovingBooking] = useState<BoardBooking | null>(null);
  const [moveTargetRoom, setMoveTargetRoom] = useState<string | null>(null);
  const [moveTargetCheckIn, setMoveTargetCheckIn] = useState<string | null>(null);
  const movingBookingRef = useRef<BoardBooking | null>(null);
  const moveTargetRoomRef = useRef<string | null>(null);
  const moveTargetCheckInRef = useRef<string | null>(null);
  const dragCandidateRef = useRef<{ booking: BoardBooking; startX: number; startY: number } | null>(null);

  // Drag-to-resize stay extension (Check-out)
  const [stretchingBooking, setStretchingBooking] = useState<BoardBooking | null>(null);
  const [stretchTargetDate, setStretchTargetDate] = useState<string | null>(null);
  const stretchingBookingRef = useRef<BoardBooking | null>(null);
  const stretchTargetDateRef = useRef<string | null>(null);

  // Drag-to-resize stay start (Check-in adjustment)
  const [adjustingCheckInBooking, setAdjustingCheckInBooking] = useState<BoardBooking | null>(null);
  const [adjustCheckInTargetDate, setAdjustCheckInTargetDate] = useState<string | null>(null);
  const adjustingCheckInBookingRef = useRef<BoardBooking | null>(null);
  const adjustCheckInTargetDateRef = useRef<string | null>(null);

  // Room Move / Edit Confirmation Modal State
  const [roomMovePayload, setRoomMovePayload] = useState<RoomMovePayload | null>(null);
  const [roomMoveSaving, setRoomMoveSaving] = useState(false);
  const [roomMoveError, setRoomMoveError] = useState<string | null>(null);

  const [actionToast, setActionToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    if (actionToast) {
      const timer = setTimeout(() => setActionToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionToast]);

  const { role: authRole } = useAuth();
  const foRole: FrontOfficeRole | null = authRole ? mapAuthRoleToFrontOffice(authRole) : null;
  const { hotel, hotelId, status: hotelStatus } = useHotel();

  const displayHotelName = hotel?.hotel_name || settings?.hotel_name || 'Hotel Mantri';

  const daysToShow = viewMode === 'day' ? 1 : 7;
  const timelineStart = centerDate;
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
      setActionToast({
        type: 'success',
        message: '✓ Availability and channel restrictions updated successfully.',
      });
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

    const rangeStart = timelineDates[0] || centerDate;

    // 1. Process entries (checked-in / in-house stays and walk-ins)
    for (const e of entries) {
      const hasPay = toNum(e.pay_cash) + toNum(e.pay_upi) + toNum(e.pay_card) + toNum(e.pay_bank) + toNum(e.pay_advance) > 0;
      const res = reservations.find((r) => 
        (e.reservation_id && r.id === e.reservation_id) || 
        (r.room_chart_entry_id && r.room_chart_entry_id === e.id)
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

      // Exclude past bookings: if checkout is strictly before the visible timeline start date
      if (checkOut < rangeStart || (isCheckedOut && checkOut <= rangeStart)) continue;

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

      const checkIn = (r.check_in_date ?? '').slice(0, 10);
      const checkOut = (r.check_out_date ?? '').slice(0, 10);

      // Exclude past reservations ending before rangeStart or checked out on/before rangeStart
      if (checkOut < rangeStart || (r.status === 'checked_out' && checkOut <= rangeStart)) continue;

      const guest = guests.find((g) => g.id === r.guest_id || (r.guest_phone && g.mobile === r.guest_phone));
      const phone = r.guest_phone || guest?.mobile || '';
      const email = r.guest_email || guest?.email || '';
      const vipType = vipGuests.find((g) => g.mobile && g.mobile === phone)?.vip_type ?? guest?.vip_type ?? '';

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
  }, [entries, reservations, guests, vipGuests, timelineDates, centerDate]);

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

  const todayStats: TodayStats = useMemo(() => {
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
          const msg = `Room ${i.room_no} is already booked for part of this stay. Please choose another room or change the dates.`;
          setError(msg);
          throw new Error(msg);
        }
      }
      
      let created = [];
      if (id && id.trim() !== '') {
        const single = await saveReservation(inputs[0], id);
        created = [single];
      } else {
        created = await saveReservations(inputs);
      }

      // If the newly created booking check-in date is not in current view, align centerDate to it
      const firstCheckIn = inputs[0]?.check_in_date?.slice(0, 10);
      if (firstCheckIn) {
        const visibleStart = timelineDates[0];
        const visibleEnd = timelineDates[timelineDates.length - 1];
        if (firstCheckIn < visibleStart || firstCheckIn > visibleEnd) {
          setCenterDate(firstCheckIn);
        }
      }
      
      await load();
      onSaved();
      return created;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setError(msg);
      throw e;
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
        pay_mode: normalizePayMode(booking.paymentMode),
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

  const handleBookingQuickAction = (action: 'checkin' | 'checkout' | 'folio' | 'shift' | 'extend' | 'details', b: BoardBooking) => {
    if (action === 'checkin') handleCheckIn(b);
    else if (action === 'checkout') handleCheckOut(b);
    else if (action === 'folio') handleViewFolio(b);
    else if (action === 'shift') handleRoomShift(b);
    else if (action === 'extend') handleExtendStay(b);
    else if (action === 'details') setSelectedBooking(b);
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
      stretchingBookingRef.current = null;
      stretchTargetDateRef.current = null;
      setStretchingBooking(null);
      setStretchTargetDate(null);
      return;
    }

    if (newCheckOutStr <= booking.checkIn) {
      setActionToast({
        type: 'error',
        message: 'Stay duration must be at least 1 night.',
      });
      stretchingBookingRef.current = null;
      stretchTargetDateRef.current = null;
      setStretchingBooking(null);
      setStretchTargetDate(null);
      return;
    }
    
    // Check overlap validation (exclude self and linked entry/reservation)
    if (newCheckOutStr > currentCheckOut) {
      const roomKey = booking.roomNo.trim().toLowerCase();
      const linkedResId = booking.rawReservation?.id || (booking.type === 'reservation' ? booking.id : (booking.raw as RoomChartEntry)?.reservation_id);
      const linkedEntryId = booking.rawEntry?.id || (booking.type === 'entry' ? booking.id : (booking.raw as Reservation)?.room_chart_entry_id);

      const ci = booking.checkIn;
      const co = newCheckOutStr;

      const hasEntryOverlap = entries.some(e => {
        if (e.id === booking.id || e.id === linkedEntryId || (linkedResId && e.reservation_id === linkedResId)) return false;
        if ((e.room_no || '').trim().toLowerCase() !== roomKey) return false;
        if (e.checked_out_at) return false;
        const eCi = (e.arrival || e.report_date || '').slice(0, 10);
        const eCo = (e.departure || e.report_date || '').slice(0, 10);
        return isStayOverlapping(ci, co, eCi, eCo);
      });

      const hasResOverlap = reservations.some(r => {
        if (r.id === booking.id || r.id === linkedResId || (linkedEntryId && r.room_chart_entry_id === linkedEntryId)) return false;
        if ((r.room_no || '').trim().toLowerCase() !== roomKey) return false;
        if (r.status !== 'confirmed' && r.status !== 'checked_in') return false;
        const rCi = (r.check_in_date || '').slice(0, 10);
        const rCo = (r.check_out_date || '').slice(0, 10);
        return isStayOverlapping(ci, co, rCi, rCo);
      });

      if (hasEntryOverlap || hasResOverlap) {
        setActionToast({
          type: 'error',
          message: `Cannot extend stay: Room ${booking.roomNo} is already occupied or reserved by another guest for these dates.`,
        });
        stretchingBookingRef.current = null;
        stretchTargetDateRef.current = null;
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
      const totalNights = calcStayNights(booking.checkIn, newCheckOutStr);
      setActionToast({
        type: 'success',
        message: `✓ Stay extended for ${booking.guestName || 'Guest'} (Room ${booking.roomNo}) to ${fmtDateFull(newCheckOutStr)} (${totalNights} nights total)!`,
      });
    } catch (e) {
      setActionToast({
        type: 'error',
        message: e instanceof Error ? e.message : 'Failed to resize stay dates.',
      });
    } finally {
      setSaving(false);
      stretchingBookingRef.current = null;
      stretchTargetDateRef.current = null;
      setStretchingBooking(null);
      setStretchTargetDate(null);
    }
  }, [load, onSaved, entries, reservations]);

  const commitAdjustCheckIn = useCallback(async (booking: BoardBooking, targetDate: string) => {
    if (targetDate === booking.checkIn) {
      adjustingCheckInBookingRef.current = null;
      adjustCheckInTargetDateRef.current = null;
      setAdjustingCheckInBooking(null);
      setAdjustCheckInTargetDate(null);
      return;
    }

    if (targetDate >= booking.checkOut) {
      setActionToast({
        type: 'error',
        message: 'Check-in date must be before check-out date.',
      });
      adjustingCheckInBookingRef.current = null;
      adjustCheckInTargetDateRef.current = null;
      setAdjustingCheckInBooking(null);
      setAdjustCheckInTargetDate(null);
      return;
    }

    if (targetDate < booking.checkIn) {
      const isAvail = await checkRoomAvailability(booking.roomNo, targetDate, booking.checkIn, booking.id);
      if (!isAvail) {
        setActionToast({
          type: 'error',
          message: `Cannot adjust check-in: Room ${booking.roomNo} is already occupied on ${targetDate}.`,
        });
        adjustingCheckInBookingRef.current = null;
        adjustCheckInTargetDateRef.current = null;
        setAdjustingCheckInBooking(null);
        setAdjustCheckInTargetDate(null);
        return;
      }
    }

    setSaving(true);
    try {
      const newNights = calcStayNights(targetDate, booking.checkOut);
      if (booking.type === 'reservation') {
        const res = (booking.rawReservation || booking.raw) as Reservation;
        const subtotal = booking.rate * newNights;
        const { taxable, gst, invoiceTotal } = calcGstFull(subtotal, (res.gst_type as GstType) || 'No Scope', (res.gst_slab as GstSlab) || 0);
        await saveReservation({
          ...res,
          check_in_date: targetDate,
          taxable_amount: taxable,
          gst_amount: gst,
          invoice_total: invoiceTotal,
        }, booking.id);
      } else {
        const entry = (booking.rawEntry || booking.raw) as RoomChartEntry;
        const subtotal = booking.rate * newNights;
        const { taxable, gst, invoiceTotal } = calcGstFull(subtotal, entry.gst_type, entry.gst_slab);
        const totalRec = toNum(entry.pay_cash) + toNum(entry.pay_upi) + toNum(entry.pay_card) + toNum(entry.pay_bank);
        await supabase
          .from('room_chart_entries')
          .update({
            arrival: targetDate,
            report_date: targetDate,
            nights: newNights,
            total: subtotal,
            taxable_amount: taxable,
            gst_amount: gst,
            invoice_total: invoiceTotal,
            pay_balance: Math.max(0, invoiceTotal - totalRec),
          })
          .eq('id', entry.id);

        if (entry.reservation_id) {
          await supabase
            .from('reservations')
            .update({
              check_in_date: targetDate,
              updated_at: new Date().toISOString(),
            })
            .eq('id', entry.reservation_id);
        }
      }
      await load();
      onSaved?.();
      setActionToast({
        type: 'success',
        message: `✓ Check-in date updated to ${fmtDateFull(targetDate)} (${newNights} nights total)!`,
      });
    } catch (e) {
      setActionToast({
        type: 'error',
        message: e instanceof Error ? e.message : 'Failed to adjust check-in date.',
      });
    } finally {
      setSaving(false);
      adjustingCheckInBookingRef.current = null;
      adjustCheckInTargetDateRef.current = null;
      setAdjustingCheckInBooking(null);
      setAdjustCheckInTargetDate(null);
    }
  }, [load, onSaved]);

  const handleConfirmRoomMove = async (payload: RoomMovePayload) => {
    setRoomMoveSaving(true);
    setRoomMoveError(null);
    const { booking, targetRoomNo, targetCheckIn, targetCheckOut, newRate, reason } = payload;
    const nights = calcStayNights(targetCheckIn, targetCheckOut);
    const effectiveRate = newRate !== undefined ? newRate : booking.rate;

    try {
      const isPhysical = targetRoomNo && targetRoomNo.trim().toLowerCase() !== 'unassigned' && targetRoomNo.trim().toLowerCase() !== 'tbd';

      if (isPhysical) {
        const isAvail = await checkRoomAvailability(targetRoomNo, targetCheckIn, targetCheckOut, booking.id);
        if (!isAvail) {
          throw new Error(`Room ${targetRoomNo} is already occupied or reserved between ${targetCheckIn} and ${targetCheckOut}.`);
        }
      }

      const roomData = activeRooms.find((r) => r.room_no.trim().toLowerCase() === targetRoomNo.trim().toLowerCase());

      if (booking.type === 'reservation') {
        const currentRes = (booking.rawReservation || booking.raw) as Reservation;
        const subtotal = effectiveRate * nights;
        const discount = toNum(currentRes.discount);
        const afterDiscount = Math.max(0, subtotal - discount);
        const { taxable, gst, invoiceTotal } = calcGstFull(afterDiscount, (currentRes.gst_type as GstType) || 'No Scope', (currentRes.gst_slab as GstSlab) || 0);

        await saveReservation({
          ...currentRes,
          room_no: targetRoomNo,
          room_id: roomData?.id || null,
          check_in_date: targetCheckIn,
          check_out_date: targetCheckOut,
          rate: effectiveRate,
          taxable_amount: taxable,
          gst_amount: gst,
          invoice_total: invoiceTotal,
          remarks: reason ? `${currentRes.remarks ? currentRes.remarks + ' | ' : ''}Moved: ${reason}` : currentRes.remarks,
        }, booking.id);
      } else {
        const entry = (booking.rawEntry || booking.raw) as RoomChartEntry;
        const subtotal = effectiveRate * nights;
        const { taxable, gst, invoiceTotal } = calcGstFull(subtotal, entry.gst_type, entry.gst_slab);
        const totalRec = toNum(entry.pay_cash) + toNum(entry.pay_upi) + toNum(entry.pay_card) + toNum(entry.pay_bank);

        if (entry.room_no.trim().toLowerCase() !== targetRoomNo.trim().toLowerCase()) {
          await shiftRoom({
            entryId: entry.id,
            fromRoom: entry.room_no,
            toRoom: targetRoomNo,
            reason,
          });
        }

        const { error: updErr } = await supabase
          .from('room_chart_entries')
          .update({
            room_no: targetRoomNo,
            arrival: targetCheckIn,
            departure: targetCheckOut,
            report_date: targetCheckIn,
            nights,
            room_rate: effectiveRate,
            total: subtotal,
            taxable_amount: taxable,
            gst_amount: gst,
            invoice_total: invoiceTotal,
            pay_balance: Math.max(0, invoiceTotal - totalRec),
            remarks: reason ? `${entry.remarks ? entry.remarks + ' | ' : ''}${reason}` : entry.remarks,
          })
          .eq('id', entry.id);

        if (updErr) throw updErr;

        if (entry.reservation_id) {
          await supabase
            .from('reservations')
            .update({
              room_no: targetRoomNo,
              room_id: roomData?.id || null,
              check_in_date: targetCheckIn,
              check_out_date: targetCheckOut,
              rate: effectiveRate,
              updated_at: new Date().toISOString(),
            })
            .eq('id', entry.reservation_id);
        }
      }

      await load();
      onSaved?.();
      setRoomMovePayload(null);
      setActionToast({
        type: 'success',
        message: `✓ Successfully moved ${booking.guestName || 'Guest'} to Room ${targetRoomNo} (${fmtDay(targetCheckIn)} – ${fmtDay(targetCheckOut)})!`,
      });
    } catch (err: any) {
      setRoomMoveError(err.message || 'Failed to move booking');
      throw err;
    } finally {
      setRoomMoveSaving(false);
    }
  };

  const handleMouseDownBooking = (b: BoardBooking, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragCandidateRef.current = {
      booking: b,
      startX: e.clientX,
      startY: e.clientY,
    };
  };

  const handleMouseDownStretchRight = (b: BoardBooking, targetDate: string, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    stretchingBookingRef.current = b;
    stretchTargetDateRef.current = targetDate;
    setStretchingBooking(b);
    setStretchTargetDate(targetDate);
  };

  const handleMouseDownStretchLeft = (b: BoardBooking, targetDate: string, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    adjustingCheckInBookingRef.current = b;
    adjustCheckInTargetDateRef.current = targetDate;
    setAdjustingCheckInBooking(b);
    setAdjustCheckInTargetDate(targetDate);
  };

  // Global mousemove and mouseup listeners for seamless drag operations
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      // 1. Activate drag on threshold
      if (dragCandidateRef.current && !movingBookingRef.current) {
        const dx = Math.abs(e.clientX - dragCandidateRef.current.startX);
        const dy = Math.abs(e.clientY - dragCandidateRef.current.startY);
        if (dx > 4 || dy > 4) {
          const b = dragCandidateRef.current.booking;
          movingBookingRef.current = b;
          moveTargetRoomRef.current = b.roomNo;
          moveTargetCheckInRef.current = b.checkIn;
          setMovingBooking(b);
          setMoveTargetRoom(b.roomNo);
          setMoveTargetCheckIn(b.checkIn);
          dragCandidateRef.current = null;
        }
      }

      const activeMoving = movingBookingRef.current;
      const activeStretching = stretchingBookingRef.current;
      const activeAdjusting = adjustingCheckInBookingRef.current;

      if (!activeMoving && !activeStretching && !activeAdjusting) return;

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cellEl = el?.closest('[data-timeline-date]') as HTMLElement | null;
      const cellDate = cellEl?.dataset.timelineDate;
      const cellRoom = cellEl?.dataset.roomNo;

      if (activeMoving && cellDate && cellRoom) {
        moveTargetRoomRef.current = cellRoom;
        moveTargetCheckInRef.current = cellDate;
        setMoveTargetRoom(cellRoom);
        setMoveTargetCheckIn(cellDate);
      } else if (activeStretching && cellDate && cellRoom && cellRoom.trim().toLowerCase() === activeStretching.roomNo.trim().toLowerCase()) {
        if (cellDate >= activeStretching.checkIn) {
          stretchTargetDateRef.current = cellDate;
          setStretchTargetDate(cellDate);
        }
      } else if (activeAdjusting && cellDate && cellRoom && cellRoom.trim().toLowerCase() === activeAdjusting.roomNo.trim().toLowerCase()) {
        if (cellDate < activeAdjusting.checkOut) {
          adjustCheckInTargetDateRef.current = cellDate;
          setAdjustCheckInTargetDate(cellDate);
        }
      }
    };

    const handleGlobalMouseUp = () => {
      dragCandidateRef.current = null;

      const mBooking = movingBookingRef.current;
      const mRoom = moveTargetRoomRef.current;
      const mDate = moveTargetCheckInRef.current;

      const sBooking = stretchingBookingRef.current;
      const sDate = stretchTargetDateRef.current;

      const aBooking = adjustingCheckInBookingRef.current;
      const aDate = adjustCheckInTargetDateRef.current;

      // Reset active drag state
      movingBookingRef.current = null;
      moveTargetRoomRef.current = null;
      moveTargetCheckInRef.current = null;
      setMovingBooking(null);
      setMoveTargetRoom(null);
      setMoveTargetCheckIn(null);

      stretchingBookingRef.current = null;
      stretchTargetDateRef.current = null;
      setStretchingBooking(null);
      setStretchTargetDate(null);

      adjustingCheckInBookingRef.current = null;
      adjustCheckInTargetDateRef.current = null;
      setAdjustingCheckInBooking(null);
      setAdjustCheckInTargetDate(null);

      if (mBooking && mRoom && mDate) {
        const isRoomChanged = mRoom.trim().toLowerCase() !== mBooking.roomNo.trim().toLowerCase();
        const isDateChanged = mDate !== mBooking.checkIn;
        if (isRoomChanged || isDateChanged) {
          const targetCheckOut = addDays(mDate, mBooking.nights);
          setRoomMovePayload({
            booking: mBooking,
            targetRoomNo: mRoom,
            targetCheckIn: mDate,
            targetCheckOut,
            newRate: mBooking.rate,
          });
        }
      } else if (sBooking && sDate) {
        commitStretch(sBooking, sDate);
      } else if (aBooking && aDate) {
        commitAdjustCheckIn(aBooking, aDate);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [commitStretch, commitAdjustCheckIn]);

  const isMoveConflict = useMemo(() => {
    if (!movingBooking || !moveTargetRoom || !moveTargetCheckIn) return false;
    const targetCheckOut = addDays(moveTargetCheckIn, movingBooking.nights);
    const targetRoomKey = moveTargetRoom.trim().toLowerCase();
    if (targetRoomKey === 'tbd' || targetRoomKey === 'unassigned') return false;

    const linkedResId = movingBooking.rawReservation?.id || (movingBooking.type === 'reservation' ? movingBooking.id : (movingBooking.raw as RoomChartEntry)?.reservation_id);
    const linkedEntryId = movingBooking.rawEntry?.id || (movingBooking.type === 'entry' ? movingBooking.id : (movingBooking.raw as Reservation)?.room_chart_entry_id);

    const hasEntryOverlap = entries.some(e => {
      if (e.id === movingBooking.id || e.id === linkedEntryId || (linkedResId && e.reservation_id === linkedResId)) return false;
      if ((e.room_no || '').trim().toLowerCase() !== targetRoomKey) return false;
      if (e.checked_out_at) return false;
      const eCi = (e.arrival || e.report_date || '').slice(0, 10);
      const eCo = (e.departure || e.report_date || '').slice(0, 10);
      return isStayOverlapping(moveTargetCheckIn, targetCheckOut, eCi, eCo);
    });

    const hasResOverlap = reservations.some(r => {
      if (r.id === movingBooking.id || r.id === linkedResId || (linkedEntryId && r.room_chart_entry_id === linkedEntryId)) return false;
      if ((r.room_no || '').trim().toLowerCase() !== targetRoomKey) return false;
      if (r.status !== 'confirmed' && r.status !== 'checked_in') return false;
      const rCi = (r.check_in_date || '').slice(0, 10);
      const rCo = (r.check_out_date || '').slice(0, 10);
      return isStayOverlapping(moveTargetCheckIn, targetCheckOut, rCi, rCo);
    });

    return hasEntryOverlap || hasResOverlap;
  }, [movingBooking, moveTargetRoom, moveTargetCheckIn, entries, reservations]);

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

  const hasActiveFilters = Boolean(search || filterCategory || filterFloor || filterSource || filterStatus || filterPayment);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* 1. Operations Header */}
      <OperationsHeader
        hotelName={displayHotelName}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        timelineDates={timelineDates}
        businessDate={date}
        loading={loading}
        onShiftTimeline={shiftTimeline}
        onDateSelect={(newDate) => setCenterDate(newDate)}
        onGoToToday={() => setCenterDate(getTodayLocal())}
        onRefresh={load}
        onBack={onBack}
      />

      {/* Action Toast Notification */}
      {actionToast && (
        <div className={`px-4 sm:px-6 py-2.5 flex items-center justify-between text-xs font-bold transition-all border-b shadow-2xs ${
          actionToast.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : actionToast.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <div className="flex items-center gap-2">
            {actionToast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {actionToast.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
            {actionToast.type === 'info' && <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />}
            <span>{actionToast.message}</span>
          </div>
          <button
            onClick={() => setActionToast(null)}
            className="p-1 hover:bg-black/5 rounded text-current opacity-70 hover:opacity-100 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Quick Actions Toolbar / Selected Booking Dock */}
      <OperationsActions
        selectedBooking={selectedBooking}
        onClearSelection={() => setSelectedBooking(null)}
        onNewReservation={() => setShowNewBooking(true)}
        onWalkIn={() => setShowWalkIn(true)}
        onAdjustAvailability={() => {
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
        onDailyEntry={() => onNavigate?.('roomchart')}
        onCheckIn={handleCheckIn}
        onCheckOut={handleCheckOut}
        onCollectPayment={handleViewFolio}
        onRoomShift={handleRoomShift}
        onExtendStay={handleExtendStay}
        onViewDetails={(b) => setSelectedBooking(b)}
      />

      {/* 3. Operational KPI Strip (2 Logical Groups) */}
      <OperationsKpiStrip
        stats={todayStats}
        totalActiveRooms={activeRooms.length}
        rooms={activeRooms}
      />

      {/* 4. Filters & Search Toolbar */}
      <OperationsFilterBar
        search={search}
        onSearchChange={setSearch}
        categories={categories}
        filterCategory={filterCategory}
        onCategoryChange={setFilterCategory}
        floors={floors}
        filterFloor={filterFloor}
        onFloorChange={setFilterFloor}
        filterSource={filterSource}
        onSourceChange={setFilterSource}
        filterStatus={filterStatus}
        onStatusChange={setFilterStatus}
        filterPayment={filterPayment}
        onPaymentChange={setFilterPayment}
        onClearFilters={clearFilters}
        hasActiveFilters={hasActiveFilters}
        totalFilteredCount={filteredBookings.length}
        totalBookingsCount={allBookings.length}
      />

      {/* Global Error Banner */}
      {error && (
        <div className="mx-4 sm:mx-6 mb-2 bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm rounded-xl p-3 flex items-center gap-2 shadow-2xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
          <span className="flex-1 font-medium">{error}</span>
          <button onClick={() => setError(null)} className="p-1 hover:bg-rose-100 rounded-lg text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Unassigned OTA Bookings Banner */}
      <UnassignedBookingsBanner
        unassignedBookings={unassignedBookings}
        onSelectBooking={(b) => setSelectedBooking(b)}
      />

      {/* 5. Room Chart Weekly Grid Canvas */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 pb-4 max-w-[1920px] mx-auto w-full">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-8 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">Synchronizing Operations Matrix…</h4>
                  <p className="text-xs font-medium text-slate-400">Loading authoritative availability, reservations & housekeeping</p>
                </div>
              </div>
            </div>
            {/* Skeleton Grid */}
            <div className="space-y-2.5 pt-2 animate-pulse">
              <div className="h-9 bg-slate-100 rounded-xl w-full" />
              <div className="h-12 bg-slate-100/80 rounded-xl w-full" />
              <div className="h-12 bg-slate-100/60 rounded-xl w-full" />
              <div className="h-12 bg-slate-100/80 rounded-xl w-full" />
              <div className="h-12 bg-slate-100/60 rounded-xl w-full" />
            </div>
          </div>
        ) : activeRooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white rounded-2xl border border-slate-200/90 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 shadow-2xs">
              <BedDouble className="w-7 h-7 stroke-[2]" />
            </div>
            <h3 className="text-base font-black text-slate-900">No rooms configured</h3>
            <p className="text-xs font-medium text-slate-500 max-w-sm mt-1 mb-4">
              Add rooms in Property Master to populate and activate the live Operations Matrix.
            </p>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('property-master')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition active:scale-95 cursor-pointer"
              >
                Go to Property Master
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            {/* Date Header Row */}
            <div className="flex border-b border-slate-200/90 bg-slate-50/95 sticky top-0 z-20 backdrop-blur-md">
              <div className="w-28 sm:w-36 flex-shrink-0 px-3.5 py-3 text-xs font-black text-slate-600 uppercase tracking-wider border-r border-slate-200/90 bg-slate-50 flex items-center justify-between sticky left-0 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                <span>Room</span>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-200/60 px-1.5 py-0.2 rounded">{activeRooms.length}</span>
              </div>
              {timelineDates.map((d) => {
                const isToday = d === date;
                const isHot = isHotSeasonDate(d, hotSeasons);
                const [y, m, dayNum] = d.slice(0, 10).split('-').map(Number);
                const dt = new Date(Date.UTC(y, m - 1, dayNum));
                const dayOfWeek = dt.getUTCDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                return (
                  <div
                    key={d}
                    className={`flex-1 min-w-[95px] sm:min-w-[110px] px-2 py-2.5 text-center border-r border-slate-200/90 transition-colors ${
                      isToday
                        ? 'bg-indigo-50/90 border-b-2 border-b-indigo-600'
                        : isHot
                        ? 'bg-rose-50/50'
                        : isWeekend
                        ? 'bg-slate-100/60'
                        : 'bg-slate-50/80'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span className={`text-xs font-black tracking-tight ${isToday ? 'text-indigo-900' : 'text-slate-800'}`}>
                        {fmtDay(d)}
                      </span>
                      {isToday && (
                        <span className="px-1.5 py-0.2 rounded-md text-[9px] font-black bg-indigo-600 text-white uppercase tracking-wider shadow-2xs">
                          Today
                        </span>
                      )}
                      {isHot && !isToday && (
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" title="Hot Season Period" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Unassigned / Pending Allocation Row */}
            {unassignedBookings.length > 0 && (
              <div className="border-b-2 border-amber-300 bg-amber-50/20">
                <div className="flex border-b border-amber-200 bg-amber-100/70 sticky left-0 z-[6]">
                  <div className="w-28 sm:w-36 flex-shrink-0 px-3 py-2 border-r border-amber-200 bg-amber-100/90 flex items-center justify-between sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
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
                  <div className="w-28 sm:w-36 flex-shrink-0 px-3 py-2 border-r border-amber-200 bg-amber-50 sticky left-0 z-[5] flex flex-col justify-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
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
                        data-timeline-date={d}
                        data-room-no="UNASSIGNED"
                        className={`flex-1 min-w-[95px] sm:min-w-[110px] px-1 py-1.5 border-r border-amber-100 ${
                          isToday ? 'bg-amber-50/50' : ''
                        }`}
                      >
                        {dayBookings.map((b) => (
                          <BookingBar
                            key={b.id}
                            booking={b}
                            onClick={() => setSelectedBooking(b)}
                            isStart={b.checkIn === d}
                            isEnd={addDays(b.checkOut, -1) === d}
                            isMoving={movingBooking?.id === b.id}
                            onMouseDownMove={(e) => handleMouseDownBooking(b, e)}
                            onMouseDownStretchRight={(e) => handleMouseDownStretchRight(b, d, e)}
                            onMouseDownStretchLeft={(e) => handleMouseDownStretchLeft(b, d, e)}
                            onQuickAction={handleBookingQuickAction}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Room Rows Grouped by Category */}
            {(() => {
              const sortedRooms = [...activeRooms].sort((a, b) => compareRoomNo(a.room_no, b.room_no));
              const grouped = groupRoomsByCategory(sortedRooms, categories);
              return grouped.map((group) => (
                <div key={group.cat?.id ?? '__uncategorized'}>
                  {/* Category Header Row with Authoritative Availability & Click-to-Edit */}
                  <div className="flex border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white sticky left-0 z-[6]">
                    <div className="w-28 sm:w-36 flex-shrink-0 px-3 py-2 border-r border-slate-800 bg-slate-900 flex items-center justify-between sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.25)]">
                      <span className="text-[11px] font-black text-slate-100 uppercase tracking-wider truncate" title={group.cat?.name ?? 'Uncategorized'}>
                        {group.cat?.name ?? 'Uncategorized'}
                      </span>
                      <span className="text-[10px] font-black text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded-md border border-slate-700 shadow-2xs">
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
                          className="flex-1 min-w-[95px] sm:min-w-[110px] px-1.5 py-1 border-r border-slate-800/80 flex items-center justify-center bg-slate-900/90"
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
                              className={`w-full h-7 px-2 rounded-lg text-[11px] font-extrabold transition flex items-center justify-between gap-1 shadow-2xs group cursor-pointer ${
                                isStopSell
                                  ? 'bg-rose-950/90 text-rose-300 border border-rose-800 hover:bg-rose-900 hover:text-white'
                                  : availVal === 0
                                  ? 'bg-amber-950/90 text-amber-300 border border-amber-800 hover:bg-amber-900 hover:text-white'
                                  : 'bg-slate-800/90 text-emerald-400 border border-slate-700/90 hover:bg-slate-700 hover:border-slate-600 hover:text-emerald-300'
                              }`}
                              title={`Category: ${group.cat?.name ?? 'Room'}\nDate: ${d}\nAvailability: ${availVal} sellable (${group.rooms.length} physical)\nStatus: ${isStopSell ? 'Stop Sell' : isOverridden ? 'Manual Override' : 'Standard'}\nClick to adjust`}
                            >
                              <span className="truncate flex items-center gap-1">
                                {isOverridden && <span className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" title="Manual restriction active" />}
                                {isStopSell ? 'Stop Sell' : `${availVal} Avail`}
                              </span>
                              <Edit3 className="w-3 h-3 text-slate-400 group-hover:text-white shrink-0 opacity-70 group-hover:opacity-100" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-bold">{availVal} Avail</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Room Rows */}
                  {group.rooms.map((room) => {
                    const roomKey = room.room_no.trim().toLowerCase();
                    const roomBookings = bookingByRoom.get(roomKey) ?? [];
                    const cat = categories.find((c) => c.id === room.category_id);
                    return (
                      <div key={room.id} className="flex border-b border-slate-100 hover:bg-slate-50/60 transition group/row">
                        {/* Sticky Room Info Column */}
                        <div className="w-28 sm:w-36 flex-shrink-0 px-3 py-2 border-r border-slate-200/90 bg-white sticky left-0 z-[5] flex flex-col justify-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] group-hover/row:bg-slate-50/80 transition">
                          <div className="flex items-center gap-1.5">
                            <HkDot status={room.housekeeping_status} />
                            <span className="text-sm font-extrabold text-slate-900 tracking-tight">{room.room_no}</span>
                            {room.floor && (
                              <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                F{room.floor}
                              </span>
                            )}
                          </div>
                          {cat && <span className="text-[10px] text-slate-500 font-medium truncate mt-0.5">{cat.name}</span>}
                        </div>

                        {/* Timeline Cells */}
                        {timelineDates.map((d) => {
                          let dayBookings = roomBookings.filter((b) => {
                            if (stretchingBooking && b.id === stretchingBooking.id && stretchTargetDate) {
                              const newCheckOutStr = addDays(stretchTargetDate, 1);
                              return (d >= b.checkIn && d < newCheckOutStr) || (d === b.checkIn && b.checkIn === newCheckOutStr);
                            }
                            if (adjustingCheckInBooking && b.id === adjustingCheckInBooking.id && adjustCheckInTargetDate) {
                              return (d >= adjustCheckInTargetDate && d < b.checkOut) || (d === adjustCheckInTargetDate && adjustCheckInTargetDate === b.checkOut);
                            }
                            return (d >= b.checkIn && d < b.checkOut) || (d === b.checkIn && b.checkIn === b.checkOut);
                          });
                          const isToday = d === date;
                          const isHot = isHotSeasonDate(d, hotSeasons);
                          
                          // Drag move target preview for this cell
                          const isMoveTargetPreview = Boolean(
                            movingBooking &&
                            moveTargetRoom &&
                            moveTargetCheckIn &&
                            moveTargetRoom.trim().toLowerCase() === room.room_no.trim().toLowerCase() &&
                            d >= moveTargetCheckIn &&
                            d < addDays(moveTargetCheckIn, movingBooking.nights)
                          );

                          // Drag stretch checkout preview
                          const isStretchPreview = Boolean(
                            stretchingBooking &&
                            stretchingBooking.roomNo.trim().toLowerCase() === room.room_no.trim().toLowerCase() &&
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
                            stretchingBooking.roomNo.trim().toLowerCase() === room.room_no.trim().toLowerCase() &&
                            stretchTargetDate &&
                            d > stretchTargetDate &&
                            d <= addDays(stretchingBooking.checkOut, -1)
                          );

                          // Drag adjust checkin preview
                          const isCheckInStretchPreview = Boolean(
                            adjustingCheckInBooking &&
                            adjustingCheckInBooking.roomNo.trim().toLowerCase() === room.room_no.trim().toLowerCase() &&
                            adjustCheckInTargetDate &&
                            d >= adjustCheckInTargetDate &&
                            d < adjustingCheckInBooking.checkIn
                          );
                          
                          return (
                            <div
                              key={d}
                              data-timeline-date={d}
                              data-room-no={room.room_no}
                              title={isStretchInvalid ? 'Room unavailable for extension' : undefined}
                              className={`flex-1 min-w-[95px] sm:min-w-[110px] px-1 py-1.5 border-r border-slate-100 transition-colors relative ${
                                isMoveTargetPreview
                                  ? isMoveConflict
                                  ? 'bg-rose-100/90 ring-2 ring-rose-500 z-10'
                                  : 'bg-brand-100/90 ring-2 ring-brand-500 z-10'
                                : isStretchInvalid
                                ? 'bg-rose-50 ring-2 ring-rose-400 z-10 cursor-not-allowed'
                                : isStretchPreview || isCheckInStretchPreview
                                ? 'bg-emerald-100/90 ring-2 ring-emerald-500 ring-dashed z-10'
                                : isStretchShrinkPreview
                                ? 'bg-rose-50/80 ring-1 ring-rose-400 opacity-60 z-10'
                                : isHot
                                ? 'bg-rose-50/20'
                                : isToday
                                ? 'bg-brand-50/30'
                                : ''
                              }`}
                            >
                              {/* Target Move Preview Placeholder */}
                              {isMoveTargetPreview && dayBookings.length === 0 && (
                                <div className={`w-full h-full min-h-[32px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-1 pointer-events-none transition-all shadow-md animate-pulse ${
                                  isMoveConflict
                                    ? 'bg-rose-200/90 border-rose-500 text-rose-900'
                                    : 'bg-brand-200/90 border-brand-600 text-brand-950 ring-2 ring-brand-400/50'
                                }`}>
                                  <div className="flex items-center gap-1 font-black text-[11px] truncate">
                                    {isMoveConflict ? <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" /> : <Sparkles className="w-3 h-3 text-brand-600 shrink-0" />}
                                    <span className="truncate">{movingBooking?.guestName || 'Guest'}</span>
                                  </div>
                                  <span className="text-[9px] font-bold opacity-80">
                                    {isMoveConflict ? 'Room Conflict' : `Move to ${room.room_no}`}
                                  </span>
                                </div>
                              )}

                              {/* Stretch Checkout Preview */}
                              {isStretchPreview && dayBookings.length === 0 && (
                                <div className="w-full h-full min-h-[28px] rounded-lg bg-emerald-200/80 border border-dashed border-emerald-500 text-emerald-900 text-[10px] font-bold flex flex-col items-center justify-center shadow-2xs pointer-events-none animate-pulse">
                                  <span>+ Extend Stay</span>
                                  <span className="text-[8px] text-emerald-700 font-semibold">{fmtDay(d)}</span>
                                </div>
                              )}

                              {/* Stretch Check-In Preview */}
                              {isCheckInStretchPreview && dayBookings.length === 0 && (
                                <div className="w-full h-full min-h-[28px] rounded-lg bg-emerald-200/80 border border-dashed border-emerald-500 text-emerald-900 text-[10px] font-bold flex flex-col items-center justify-center shadow-2xs pointer-events-none animate-pulse">
                                  <span>Early Check-In</span>
                                  <span className="text-[8px] text-emerald-700 font-semibold">{fmtDay(d)}</span>
                                </div>
                              )}

                              {isStretchInvalid && dayBookings.length === 0 && (
                                <div className="w-full h-full min-h-[28px] rounded-lg bg-rose-100 border border-rose-300 text-rose-800 text-[10px] font-bold flex items-center justify-center gap-1 pointer-events-none">
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  <span>Conflict</span>
                                </div>
                              )}

                              {!isMoveTargetPreview && !isStretchPreview && !isCheckInStretchPreview && !isStretchInvalid && dayBookings.length === 0 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreselectRoom(room.room_no);
                                    setPreselectCheckIn(d);
                                    setPreselectCheckOut(addDays(d, 1));
                                    setShowNewBooking(true);
                                  }}
                                  className="w-full h-full min-h-[30px] rounded-lg border border-dashed border-slate-200 hover:border-brand-400 hover:bg-brand-50/40 transition flex items-center justify-center group/empty cursor-pointer"
                                  title={`Book Room ${room.room_no} for ${d}`}
                                >
                                  <Plus className="w-3.5 h-3.5 text-slate-300 group-hover/empty:text-brand-600 transition" />
                                </button>
                              ) : (
                                dayBookings.map((b) => {
                                  const effectiveCheckOut = (stretchingBooking && b.id === stretchingBooking.id && stretchTargetDate) 
                                    ? addDays(stretchTargetDate, 1) 
                                    : b.checkOut;
                                  const effectiveCheckIn = (adjustingCheckInBooking && b.id === adjustingCheckInBooking.id && adjustCheckInTargetDate)
                                    ? adjustCheckInTargetDate
                                    : b.checkIn;
                                  const isStart = effectiveCheckIn === d;
                                  const isEnd = addDays(effectiveCheckOut, -1) === d;
                                  const isStretching = (stretchingBooking?.id === b.id) || (adjustingCheckInBooking?.id === b.id);
                                  const isMoving = movingBooking?.id === b.id;

                                  return (
                                    <BookingBar 
                                      key={b.id} 
                                      booking={b} 
                                      onClick={() => setSelectedBooking(b)} 
                                      isStart={isStart}
                                      isEnd={isEnd}
                                      isStretching={isStretching}
                                      isMoving={isMoving}
                                      onMouseDownMove={(e) => handleMouseDownBooking(b, e)}
                                      onMouseDownStretchRight={(e) => handleMouseDownStretchRight(b, d, e)}
                                      onMouseDownStretchLeft={(e) => handleMouseDownStretchLeft(b, d, e)}
                                      onQuickAction={handleBookingQuickAction}
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
          </div>
        )}
      </div>

      {/* Floating Drag-to-Move HUD Banner */}
      {movingBooking && moveTargetRoom && moveTargetCheckIn && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 backdrop-blur-md text-white px-5 sm:px-6 py-3.5 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 animate-scale-in max-w-lg w-[92vw] pointer-events-none select-none">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
            isMoveConflict 
              ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' 
              : 'bg-brand-500/20 text-brand-400 border-brand-500/30'
          }`}>
            {isMoveConflict ? <AlertTriangle className="w-5 h-5 text-rose-400 animate-bounce" /> : <ArrowRightLeft className="w-5 h-5 text-brand-400 animate-pulse" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white truncate">{movingBooking.guestName || 'Guest'}</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                isMoveConflict
                  ? 'bg-rose-900/80 text-rose-300 border-rose-700'
                  : 'bg-brand-900/80 text-brand-300 border-brand-700'
              }`}>
                {movingBooking.roomNo} → Room {moveTargetRoom}
              </span>
            </div>
            <div className="text-xs text-slate-300 flex items-center gap-1.5 mt-1 flex-wrap">
              <span>Dates: <strong className="text-white">{fmtDay(moveTargetCheckIn)}</strong> → <strong className="text-emerald-400 font-bold">{fmtDay(addDays(moveTargetCheckIn, movingBooking.nights))}</strong></span>
              <span className={`px-1.5 py-0.2 rounded font-bold border text-[10px] ${
                isMoveConflict
                  ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                  : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
              }`}>
                {isMoveConflict ? 'Conflict (Occupied)' : `${movingBooking.nights} Night${movingBooking.nights > 1 ? 's' : ''} (₹${fmtMoney(movingBooking.rate * movingBooking.nights)})`}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0 border-l border-slate-700 pl-3">
            <span className={`text-[11px] font-bold block ${isMoveConflict ? 'text-rose-400' : 'text-emerald-400'}`}>
              {isMoveConflict ? 'Unavailable' : 'Release mouse'}
            </span>
            <span className="text-[10px] text-slate-400">{isMoveConflict ? 'Choose another room' : 'to edit & confirm'}</span>
          </div>
        </div>
      )}

      {/* Floating Drag-to-Extend HUD Banner */}
      {stretchingBooking && stretchTargetDate && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 backdrop-blur-md text-white px-5 sm:px-6 py-3.5 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 animate-scale-in max-w-lg w-[92vw] pointer-events-none select-none">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
            <ArrowRightLeft className="w-5 h-5 text-emerald-400 animate-pulse" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white truncate">{stretchingBooking.guestName || 'Guest'}</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-900/80 text-emerald-300 border border-emerald-700">
                Room {stretchingBooking.roomNo}
              </span>
            </div>
            <div className="text-xs text-slate-300 flex items-center gap-1.5 mt-1 flex-wrap">
              <span>From <strong className="text-white">{fmtDay(stretchingBooking.checkIn)}</strong></span>
              <span>→</span>
              <span>New Checkout: <strong className="text-emerald-400 font-bold">{fmtDay(addDays(stretchTargetDate, 1))}</strong></span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-950/80 text-emerald-300 font-bold border border-emerald-800 text-[10px]">
                {calcStayNights(stretchingBooking.checkIn, addDays(stretchTargetDate, 1))} Night{calcStayNights(stretchingBooking.checkIn, addDays(stretchTargetDate, 1)) > 1 ? 's' : ''} (₹{fmtMoney(stretchingBooking.rate * calcStayNights(stretchingBooking.checkIn, addDays(stretchTargetDate, 1)))})
              </span>
            </div>
          </div>
          <div className="text-right shrink-0 border-l border-slate-700 pl-3">
            <span className="text-[11px] font-bold text-emerald-400 block">Release mouse</span>
            <span className="text-[10px] text-slate-400">to extend stay</span>
          </div>
        </div>
      )}

      {/* Floating Drag-to-Adjust-CheckIn HUD Banner */}
      {adjustingCheckInBooking && adjustCheckInTargetDate && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 backdrop-blur-md text-white px-5 sm:px-6 py-3.5 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 animate-scale-in max-w-lg w-[92vw] pointer-events-none select-none">
          <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center shrink-0 border border-brand-500/30">
            <ArrowRightLeft className="w-5 h-5 text-brand-400 animate-pulse" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white truncate">{adjustingCheckInBooking.guestName || 'Guest'}</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-brand-900/80 text-brand-300 border border-brand-700">
                Room {adjustingCheckInBooking.roomNo}
              </span>
            </div>
            <div className="text-xs text-slate-300 flex items-center gap-1.5 mt-1 flex-wrap">
              <span>New Check-In: <strong className="text-brand-300 font-bold">{fmtDay(adjustCheckInTargetDate)}</strong></span>
              <span>→</span>
              <span>Checkout: <strong className="text-white">{fmtDay(adjustingCheckInBooking.checkOut)}</strong></span>
              <span className="px-1.5 py-0.2 rounded bg-brand-950/80 text-brand-300 font-bold border border-brand-800 text-[10px]">
                {calcStayNights(adjustCheckInTargetDate, adjustingCheckInBooking.checkOut)} Night{calcStayNights(adjustCheckInTargetDate, adjustingCheckInBooking.checkOut) > 1 ? 's' : ''} (₹{fmtMoney(adjustingCheckInBooking.rate * calcStayNights(adjustCheckInTargetDate, adjustingCheckInBooking.checkOut))})
              </span>
            </div>
          </div>
          <div className="text-right shrink-0 border-l border-slate-700 pl-3">
            <span className="text-[11px] font-bold text-brand-400 block">Release mouse</span>
            <span className="text-[10px] text-slate-400">to adjust check-in</span>
          </div>
        </div>
      )}

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
          onSaved={load}
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
              pay_mode: normalizePayMode(selectedBooking.paymentMode),
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
          onClose={() => {
            setShowNewBooking(false);
            setPreselectRoom(undefined);
            setPreselectCheckIn(undefined);
            setPreselectCheckOut(undefined);
            load();
          }}
          onSave={handleSaveReservation}
        />
      )}

      {/* Availability Adjustment Modal */}
      {adjustModalData && (
        <AdjustAvailabilityModal
          data={adjustModalData}
          categories={categories}
          activeRooms={activeRooms}
          categoryAvailability={categoryAvailability}
          saving={adjustSaving}
          error={adjustError}
          onClose={() => setAdjustModalData(null)}
          onSave={handleSaveAvailability}
          onChangeData={setAdjustModalData}
        />
      )}

      {/* Room Move / Date Shift Confirmation Modal */}
      {roomMovePayload && (
        <RoomMoveModal
          payload={roomMovePayload}
          rooms={activeRooms}
          categories={categories}
          role={foRole}
          saving={roomMoveSaving}
          error={roomMoveError}
          onClose={() => {
            setRoomMovePayload(null);
            setRoomMoveError(null);
          }}
          onConfirm={handleConfirmRoomMove}
        />
      )}
    </div>
  );
};
