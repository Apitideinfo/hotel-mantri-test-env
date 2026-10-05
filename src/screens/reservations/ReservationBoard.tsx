import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar, List, LogIn, LogOut, Clock, AlertCircle, Plus, X,
  ChevronLeft, ChevronRight, Loader2, Users, Phone, Star, RefreshCw,
  ArrowRight, CheckCircle2, Ban, Filter, BedDouble, AlertTriangle,
  Search, SlidersHorizontal, Tag, MoreHorizontal, ChevronDown, Check,
  FileText, Sparkles, Building2, Moon, IndianRupee, ShieldCheck,
  CheckCheck, UserCheck, UserX, CalendarClock, Plane, HelpCircle,
  Download, Printer, MessageCircle, ExternalLink, Trash2
} from 'lucide-react';
import type { RoomChartEntry, Room, RoomCategory, CompanySource, HotelSettings } from '@/lib/types';
import type { Reservation, ReservationStatus, ReservationAlert } from '@/lib/types-reservations';
import {
  getReservationsForDateRange, getActiveRoomChartEntries, quickReservation,
  getReservationAlerts, bulkCheckIn, bulkCheckOut, bulkCancel,
  getRoomAvailabilityForDate, type RoomAvailability,
  getReservationsPaginated, getReservationConflicts,
  updateReservationStatus, checkInReservation, saveReservation, saveReservations,
  deleteAllReservations, bulkDeleteReservations,
} from '@/lib/api-reservations';
import { getRooms, getRoomCategories, getCompanySources, getSettings } from '@/lib/api';
import { getHotSeasons, isHotSeasonDate } from '@/lib/api-calendar';
import type { HotSeason } from '@/lib/types';
import { AssignRoomModal, ExtendStayModal } from './ReservationModals';
import { ReservationConflictsModal } from './ReservationConflictsModal';
import { NewBookingModal } from '@/components/NewBookingModal';
import { ReservationConfirmationModal } from '@/components/reservations/ReservationConfirmationModal';

type ViewMode = 'list' | 'timeline' | 'calendar' | 'arrival' | 'departure';

const fmtDate = (d?: string | null): string => {
  if (!d) return '—';
  try {
    return new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return d;
  }
};

const fmtDayShort = (d?: string | null): string => {
  if (!d) return '';
  try {
    return new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return d;
  }
};

const fmtMoney = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

const getInitials = (name?: string): string => {
  if (!name) return 'G';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const addDays = (date: string, n: number): string => {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export interface GroupedReservation {
  bookingKey: string;
  primaryReservation: Reservation;
  reservations: Reservation[];
  isMultiRoom: boolean;
  roomNos: string[];
  totalTariff: number;
  totalAdvance: number;
  totalBalance: number;
  status: ReservationStatus;
  nights: number;
  checkInDate: string;
  checkOutDate: string;
}

export const ReservationBoard = ({ onBack, initialView }: { onBack: () => void; initialView?: ViewMode }) => {
  const [view, setView] = useState<ViewMode>(initialView ?? 'list');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [days, setDays] = useState(7);

  // List View Pagination & Filters
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterAssigned, setFilterAssigned] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [filterRoomNo, setFilterRoomNo] = useState<string>('all');
  const [filterFromDate, setFilterFromDate] = useState<string>('');
  const [filterToDate, setFilterToDate] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // Data states
  const [paginatedData, setPaginatedData] = useState<{ reservations: Reservation[]; totalCount: number; totalPages: number }>({
    reservations: [],
    totalCount: 0,
    totalPages: 1,
  });
  const [timelineReservations, setTimelineReservations] = useState<Reservation[]>([]);
  const [inHouseStays, setInHouseStays] = useState<RoomChartEntry[]>([]);
  const [availability, setAvailability] = useState<RoomAvailability[]>([]);
  const [hotSeasons, setHotSeasons] = useState<HotSeason[]>([]);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [categories, setCategories] = useState<RoomCategory[]>([]);
  const [sources, setSources] = useState<CompanySource[]>([]);
  const [settings, setSettings] = useState<HotelSettings | null>(null);

  // Status & Conflicts
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [showConflictsModal, setShowConflictsModal] = useState(false);

  // Action Modals
  const [selectedForAssign, setSelectedForAssign] = useState<Reservation | null>(null);
  const [selectedForExtend, setSelectedForExtend] = useState<Reservation | null>(null);
  const [selectedForConfirmation, setSelectedForConfirmation] = useState<Reservation | null>(null);
  const [selectedForConfirmationGroup, setSelectedForConfirmationGroup] = useState<Reservation[] | null>(null);
  const [showNewBookingModal, setShowNewBookingModal] = useState(false);
  const [showQuickRes, setShowQuickRes] = useState<{ roomNo: string; date: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkBar, setShowBulkBar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const endDate = useMemo(() => addDays(startDate, days - 1), [startDate, days]);

  // Load master properties
  useEffect(() => {
    Promise.all([
      getRooms().catch(() => []),
      getRoomCategories().catch(() => []),
      getCompanySources().catch(() => []),
      getSettings().catch(() => null),
    ]).then(([rms, cats, srcs, stgs]) => {
      setAllRooms(rms);
      setCategories(cats);
      setSources(srcs);
      setSettings(stgs);
    });
  }, []);

  // Check conflicts quietly for authorized admin badge
  const checkConflicts = useCallback(async () => {
    try {
      const confs = await getReservationConflicts();
      setConflicts(confs || []);
    } catch {
      // non-critical
    }
  }, []);

  // Load List View Data
  const loadListData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getReservationsPaginated({
        page,
        pageSize,
        search,
        status: filterStatus,
        sourceCategory: filterSource,
        assignedStatus: filterAssigned,
        roomNo: filterRoomNo,
        fromDate: filterFromDate || undefined,
        toDate: filterToDate || undefined,
        sortBy: 'check_in_date',
        sortOrder: 'desc',
      });
      setPaginatedData({
        reservations: res.reservations,
        totalCount: res.totalCount,
        totalPages: res.totalPages,
      });
    } catch (e: any) {
      setError(e?.message || 'Unable to load reservations');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, filterStatus, filterSource, filterAssigned, filterRoomNo, filterFromDate, filterToDate]);

  // Load Matrix/Secondary Views Data
  const loadMatrixData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, avail, stays, hs] = await Promise.all([
        getReservationsForDateRange(startDate, endDate).catch(() => []),
        getRoomAvailabilityForDate(startDate).catch(() => []),
        getActiveRoomChartEntries(startDate).catch(() => []),
        getHotSeasons().catch(() => []),
      ]);
      setTimelineReservations(res);
      setInHouseStays(stays);
      setAvailability(avail);
      setHotSeasons(hs);
    } catch (e: any) {
      setError(e?.message || 'Unable to load matrix data');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const refreshAll = useCallback(() => {
    checkConflicts();
    if (view === 'list') {
      loadListData();
    } else {
      loadMatrixData();
    }
  }, [view, checkConflicts, loadListData, loadMatrixData]);

  useEffect(() => {
    checkConflicts();
  }, [checkConflicts]);

  useEffect(() => {
    if (view === 'list') {
      loadListData();
    } else {
      loadMatrixData();
    }
  }, [view, loadListData, loadMatrixData]);

  // Listen to realtime reservation updates
  useEffect(() => {
    const handleUpdate = () => {
      refreshAll();
    };
    window.addEventListener('hotel_mantri_reservations_updated', handleUpdate);
    return () => window.removeEventListener('hotel_mantri_reservations_updated', handleUpdate);
  }, [refreshAll]);

  // Unique rooms list for timeline and room selectors
  const roomsList = useMemo(() => {
    if (allRooms.length > 0) {
      return allRooms.map((r) => {
        const cat = categories.find((c) => c.id === r.category_id);
        return { room_no: r.room_no, category: cat?.name || 'Standard', floor: String(r.floor || '1') };
      }).sort((a, b) => a.room_no.localeCompare(b.room_no, undefined, { numeric: true }));
    }
    const seen = new Set<string>();
    const result: { room_no: string; category: string; floor: string }[] = [];
    for (const a of availability) {
      if (!seen.has(a.room_no)) {
        seen.add(a.room_no);
        result.push({ room_no: a.room_no, category: a.category, floor: a.floor });
      }
    }
    return result.sort((a, b) => a.room_no.localeCompare(b.room_no, undefined, { numeric: true }));
  }, [allRooms, categories, availability]);

  const dateColumns = useMemo(() => {
    const cols: string[] = [];
    for (let i = 0; i < days; i++) {
      cols.push(addDays(startDate, i));
    }
    return cols;
  }, [startDate, days]);

  const getResForRoomDate = (roomNo: string, date: string): Reservation | undefined => {
    return timelineReservations.find((r) =>
      r.room_no === roomNo &&
      r.check_in_date <= date &&
      r.check_out_date > date &&
      (r.status === 'confirmed' || r.status === 'checked_in'),
    );
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filterStatus !== 'all') count++;
    if (filterSource !== 'all') count++;
    if (filterAssigned !== 'all') count++;
    if (filterRoomNo !== 'all') count++;
    if (filterFromDate) count++;
    if (filterToDate) count++;
    if (search.trim()) count++;
    return count;
  }, [filterStatus, filterSource, filterAssigned, filterRoomNo, filterFromDate, filterToDate, search]);

  // Group reservations by group_id (or id if single)
  const groupedReservations = useMemo<GroupedReservation[]>(() => {
    const groupsMap = new Map<string, Reservation[]>();
    const order: string[] = [];

    for (const r of paginatedData.reservations) {
      const key = (r.group_id && r.group_id.trim() !== '') ? r.group_id : r.id;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, []);
        order.push(key);
      }
      groupsMap.get(key)!.push(r);
    }

    return order.map((key) => {
      const resList = groupsMap.get(key)!;
      const primary = resList[0];
      const isMultiRoom = resList.length > 1;
      const roomNos = resList.map((r) => r.room_no || 'Unassigned');

      const totalTariff = resList.reduce((sum, r) => {
        const val = r.invoice_total > 0 ? r.invoice_total : (r.rate * (r.nights || 1));
        return sum + val;
      }, 0);

      const totalAdvance = resList.reduce((sum, r) => sum + (r.advance_paid || 0), 0);
      const totalBalance = Math.max(0, totalTariff - totalAdvance);

      let compositeStatus: ReservationStatus = primary.status;
      if (resList.some((r) => r.status === 'checked_in')) {
        compositeStatus = 'checked_in';
      } else if (resList.every((r) => r.status === 'cancelled')) {
        compositeStatus = 'cancelled';
      } else if (resList.every((r) => r.status === 'checked_out')) {
        compositeStatus = 'checked_out';
      } else {
        compositeStatus = primary.status;
      }

      return {
        bookingKey: key,
        primaryReservation: primary,
        reservations: resList,
        isMultiRoom,
        roomNos,
        totalTariff,
        totalAdvance,
        totalBalance,
        status: compositeStatus,
        nights: primary.nights || 1,
        checkInDate: primary.check_in_date,
        checkOutDate: primary.check_out_date,
      };
    });
  }, [paginatedData.reservations]);

  // KPI calculations
  const kpiStats = useMemo(() => {
    const total = paginatedData.totalCount || paginatedData.reservations.length;
    const confirmed = paginatedData.reservations.filter(r => r.status === 'confirmed').length;
    const checkedIn = paginatedData.reservations.filter(r => r.status === 'checked_in').length;
    const unassigned = paginatedData.reservations.filter(r => !r.room_no || r.room_no.toLowerCase() === 'unassigned' || r.room_no.toLowerCase() === 'tbd').length;
    const totalRevenue = paginatedData.reservations.reduce((sum, r) => sum + (r.invoice_total || (r.rate * (r.nights || 1))), 0);

    return {
      total,
      confirmed,
      checkedIn,
      unassigned,
      totalRevenue,
    };
  }, [paginatedData]);

  // Actions
  const handleCheckIn = async (res: Reservation) => {
    const isUnassigned = !res.room_no || res.room_no.toLowerCase() === 'unassigned' || res.room_no.toLowerCase() === 'tbd';
    if (isUnassigned) {
      setSelectedForAssign(res);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await checkInReservation(res.id);
      setSuccessMsg(`Guest ${res.guest_name} checked into Room ${res.room_no} successfully.`);
      refreshAll();
    } catch (e: any) {
      setError(e?.message || 'Check-in failed due to room conflict.');
    } finally {
      setBusy(false);
    }
  };

  const handleGroupCheckIn = async (group: GroupedReservation) => {
    const unassignedRoom = group.reservations.find(
      (r) => !r.room_no || r.room_no.toLowerCase() === 'unassigned' || r.room_no.toLowerCase() === 'tbd'
    );
    if (unassignedRoom) {
      setSelectedForAssign(unassignedRoom);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await Promise.all(
        group.reservations
          .filter((r) => r.status === 'confirmed')
          .map((r) => checkInReservation(r.id))
      );
      setSuccessMsg(
        group.isMultiRoom
          ? `Guest ${group.primaryReservation.guest_name} checked into ${group.reservations.length} rooms (${group.roomNos.join(', ')}) successfully.`
          : `Guest ${group.primaryReservation.guest_name} checked into Room ${group.primaryReservation.room_no} successfully.`
      );
      refreshAll();
    } catch (e: any) {
      setError(e?.message || 'Check-in failed due to room conflict.');
    } finally {
      setBusy(false);
    }
  };

  const handleCheckOut = async (res: Reservation) => {
    setBusy(true);
    setError(null);
    try {
      await updateReservationStatus(res.id, 'checked_out');
      setSuccessMsg(`Guest ${res.guest_name} checked out successfully.`);
      refreshAll();
    } catch (e: any) {
      setError(e?.message || 'Check-out failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleGroupCheckOut = async (group: GroupedReservation) => {
    setBusy(true);
    setError(null);
    try {
      await Promise.all(
        group.reservations
          .filter((r) => r.status === 'checked_in')
          .map((r) => updateReservationStatus(r.id, 'checked_out'))
      );
      setSuccessMsg(`Guest ${group.primaryReservation.guest_name} checked out successfully.`);
      refreshAll();
    } catch (e: any) {
      setError(e?.message || 'Check-out failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (res: Reservation) => {
    if (!window.confirm(`Are you sure you want to cancel the reservation for ${res.guest_name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await updateReservationStatus(res.id, 'cancelled');
      setSuccessMsg('Reservation cancelled successfully.');
      refreshAll();
    } catch (e: any) {
      setError(e?.message || 'Cancellation failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleGroupCancel = async (group: GroupedReservation) => {
    const desc = group.isMultiRoom
      ? `all ${group.reservations.length} rooms (${group.roomNos.join(', ')}) for ${group.primaryReservation.guest_name}`
      : `Room ${group.primaryReservation.room_no || 'Unassigned'} for ${group.primaryReservation.guest_name}`;
    if (!window.confirm(`Are you sure you want to cancel the reservation for ${desc}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await Promise.all(
        group.reservations
          .filter((r) => r.status === 'confirmed')
          .map((r) => updateReservationStatus(r.id, 'cancelled'))
      );
      setSuccessMsg(`Reservation cancelled successfully.`);
      refreshAll();
    } catch (e: any) {
      setError(e?.message || 'Cancellation failed.');
    } finally {
      setBusy(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setShowBulkBar(next.size > 0);
      return next;
    });
  };

  const toggleSelectGroup = (group: GroupedReservation) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = group.reservations.every((r) => next.has(r.id));
      if (allSelected) {
        group.reservations.forEach((r) => next.delete(r.id));
      } else {
        group.reservations.forEach((r) => next.add(r.id));
      }
      setShowBulkBar(next.size > 0);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === paginatedData.reservations.length && paginatedData.reservations.length > 0) {
      setSelected(new Set());
      setShowBulkBar(false);
    } else {
      const allIds = new Set(paginatedData.reservations.map(r => r.id));
      setSelected(allIds);
      setShowBulkBar(true);
    }
  };

  const handleBulkCheckInAction = async () => {
    setBusy(true);
    try {
      await bulkCheckIn([...selected]);
      setSelected(new Set());
      setShowBulkBar(false);
      refreshAll();
    } catch (e: any) {
      setError(e?.message || 'Bulk check-in failed');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkCheckOutAction = async () => {
    setBusy(true);
    try {
      await bulkCheckOut([...selected]);
      setSelected(new Set());
      setShowBulkBar(false);
      refreshAll();
    } catch (e: any) {
      setError(e?.message || 'Bulk check-out failed');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkCancelAction = async () => {
    setBusy(true);
    try {
      await bulkCancel([...selected]);
      setSelected(new Set());
      setShowBulkBar(false);
      refreshAll();
    } catch (e: any) {
      setError(e?.message || 'Bulk cancel failed');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkDeleteAction = async () => {
    if (!selected.size) return;
    if (!window.confirm(`Are you sure you want to permanently delete the ${selected.size} selected reservation(s)?`)) return;
    setBusy(true);
    try {
      const count = await bulkDeleteReservations([...selected]);
      setSelected(new Set());
      setShowBulkBar(false);
      setSuccessMsg(`Successfully deleted ${count} selected reservation(s).`);
      refreshAll();
    } catch (e: any) {
      setError(e?.message || 'Bulk delete failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAllAction = async () => {
    setDeletingAll(true);
    setError(null);
    try {
      const deletedCount = await deleteAllReservations();
      setShowDeleteAllModal(false);
      setSelected(new Set());
      setShowBulkBar(false);
      setSuccessMsg(`All ${deletedCount} reservation entries have been deleted successfully.`);
      refreshAll();
    } catch (e: any) {
      setError(e?.message || 'Failed to delete all reservations.');
    } finally {
      setDeletingAll(false);
    }
  };

  // Channel Brand Helper
  const getSourceBadge = (source?: string, cat?: string) => {
    const s = (source || cat || 'Direct').toLowerCase();
    if (s.includes('makemytrip') || s.includes('mmt')) {
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">MMT</span>;
    }
    if (s.includes('goibibo')) {
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-orange-50 text-orange-700 border border-orange-200">Goibibo</span>;
    }
    if (s.includes('booking')) {
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-800 border border-blue-200">Booking.com</span>;
    }
    if (s.includes('agoda')) {
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-sky-50 text-sky-700 border border-sky-200">Agoda</span>;
    }
    if (s.includes('cleartrip')) {
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-200">Cleartrip</span>;
    }
    if (s.includes('corporate')) {
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">Corporate</span>;
    }
    if (s.includes('agent')) {
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">Travel Agent</span>;
    }
    return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">Direct</span>;
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
            Confirmed
          </span>
        );
      case 'checked_in':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            Checked-In
          </span>
        );
      case 'checked_out':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Checked-Out
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Cancelled
          </span>
        );
      case 'no_show':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            No Show
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
            {status || 'Unknown'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 select-none pb-12">
      {/* ── Top Header Card ── */}
      <div className="bg-white/95 backdrop-blur-xl rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition cursor-pointer shrink-0 shadow-2xs"
            title="Return to Dashboard"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
                <CalendarClock className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Reservation Command Center
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Matrix
              </span>
            </div>
            <p className="text-xs sm:text-sm font-semibold text-slate-500 mt-1">
              Manage front-desk bookings, channel allocations, room assignments, and confirmations.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {conflicts.length > 0 && (
            <button
              onClick={() => setShowConflictsModal(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-2xl text-xs font-bold transition shadow-2xs animate-pulse cursor-pointer"
              title="Review physical room conflicts"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>{conflicts.length} Room Conflict{conflicts.length > 1 ? 's' : ''}</span>
              <span className="underline ml-0.5">Resolve</span>
            </button>
          )}

          <button
            onClick={() => setShowDeleteAllModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/90 rounded-2xl transition active:scale-95 cursor-pointer shadow-2xs"
            title="Delete all reservation entries"
          >
            <Trash2 className="w-4 h-4 text-rose-600" />
            <span>Delete All Entries</span>
          </button>

          <button
            onClick={() => setShowNewBookingModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 rounded-2xl shadow-lg shadow-indigo-500/25 transition active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> New Reservation
          </button>

          <button
            onClick={refreshAll}
            disabled={busy || loading}
            aria-label="Refresh reservations"
            className="w-10 h-10 flex items-center justify-center text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 rounded-2xl shadow-2xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Refresh All"
          >
            <RefreshCw className={`w-4 h-4 ${busy || loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Operational Success Banner ── */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200/90 text-emerald-900 text-xs font-semibold rounded-2xl p-4 flex items-center justify-between gap-3 shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-bold">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="p-1 text-emerald-700 hover:text-emerald-900 rounded-lg hover:bg-emerald-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold rounded-2xl p-4 flex items-center justify-between gap-3 shadow-2xs animate-in shake">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <p className="font-bold">Reservation Notice</p>
              <p className="text-rose-700 font-medium">{error}</p>
            </div>
          </div>
          <button onClick={() => setError(null)} className="p-1 text-rose-700 hover:text-rose-900 rounded-lg hover:bg-rose-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white/95 rounded-2xl border border-slate-200/80 p-4 shadow-card flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Bookings</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-black text-slate-900 tracking-tight">{kpiStats.total}</span>
            <span className="text-[10px] font-bold text-slate-400">All Statuses</span>
          </div>
        </div>

        <div className="bg-white/95 rounded-2xl border border-slate-200/80 p-4 shadow-card flex flex-col justify-between">
          <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500" /> Confirmed
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-black text-indigo-950 tracking-tight">{kpiStats.confirmed}</span>
            <span className="text-[10px] font-bold text-indigo-600">Upcoming</span>
          </div>
        </div>

        <div className="bg-white/95 rounded-2xl border border-slate-200/80 p-4 shadow-card flex flex-col justify-between">
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> In-House Active
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-black text-emerald-950 tracking-tight">{kpiStats.checkedIn}</span>
            <span className="text-[10px] font-bold text-emerald-600">Checked-In</span>
          </div>
        </div>

        <div
          onClick={() => {
            setFilterAssigned('unassigned');
            setView('list');
            setPage(1);
          }}
          className={`bg-white/95 rounded-2xl border p-4 shadow-card flex flex-col justify-between transition cursor-pointer ${
            kpiStats.unassigned > 0 ? 'border-amber-300 bg-amber-50/40 hover:bg-amber-50/70 ring-2 ring-amber-200/50' : 'border-slate-200/80'
          }`}
        >
          <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Unassigned Rooms
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-black text-amber-950 tracking-tight">{kpiStats.unassigned}</span>
            <span className="text-[10px] font-extrabold text-amber-700 underline">Filter</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-4 shadow-card flex flex-col justify-between col-span-2 sm:col-span-1">
          <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Pipeline Tariff</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl sm:text-2xl font-black text-white tracking-tight">{fmtMoney(kpiStats.totalRevenue)}</span>
            <span className="text-[10px] font-bold text-emerald-400">Estimated</span>
          </div>
        </div>
      </div>

      {/* ── View Switcher & Fast Controls ── */}
      <div className="bg-white/95 backdrop-blur-xl rounded-3xl border border-slate-200/80 p-4 shadow-card flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-slate-100/90 border border-slate-200/80 rounded-2xl p-1 overflow-x-auto max-w-full shrink-0">
          {(
            [
              { key: 'list', label: 'All Reservations', icon: <List className="w-4 h-4" /> },
              { key: 'timeline', label: 'Room Matrix', icon: <Clock className="w-4 h-4" /> },
              { key: 'calendar', label: 'Calendar Grid', icon: <Calendar className="w-4 h-4" /> },
              { key: 'arrival', label: 'Expected Arrivals', icon: <LogIn className="w-4 h-4" /> },
              { key: 'departure', label: 'Expected Departures', icon: <LogOut className="w-4 h-4" /> },
            ] as { key: ViewMode; label: string; icon: React.ReactNode }[]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => { setView(t.key); setPage(1); }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                view === t.key
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Matrix Date Controls (Only for timeline/calendar/arrival/departure) */}
        {view !== 'list' && (
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/90 px-3 py-1.5 rounded-2xl shadow-2xs">
            <button
              onClick={() => setStartDate(addDays(startDate, -days))}
              aria-label="Previous date range"
              className="p-1.5 hover:bg-white rounded-xl text-slate-600 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs sm:text-sm font-bold text-slate-800 whitespace-nowrap px-1">
              {fmtDate(startDate)} — {fmtDate(endDate)}
            </span>
            <button
              onClick={() => setStartDate(addDays(startDate, days))}
              aria-label="Next date range"
              className="p-1.5 hover:bg-white rounded-xl text-slate-600 transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="px-2.5 py-1 text-xs font-bold border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value={7}>7 Days</option>
              <option value={14}>14 Days</option>
              <option value={30}>30 Days</option>
            </select>
          </div>
        )}

        {/* List View Quick Search & Filters */}
        {view === 'list' && (
          <div className="flex items-center gap-2 flex-1 lg:flex-initial justify-end">
            <div className="relative min-w-[240px] max-w-sm w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search guest, mobile, room no, ID…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-8 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 transition shadow-2xs"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-2xl border transition cursor-pointer ${
                showFilters || activeFiltersCount > 0
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-2xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filters</span>
              {activeFiltersCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Advanced Filter Drawer ── */}
      {view === 'list' && showFilters && (
        <div className="bg-white/95 rounded-3xl border border-slate-200/90 p-5 shadow-card space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <Filter className="w-4 h-4 text-indigo-600" />
              Advanced Filters
            </div>
            {activeFiltersCount > 0 && (
              <button
                onClick={() => {
                  setFilterStatus('all');
                  setFilterSource('all');
                  setFilterAssigned('all');
                  setFilterRoomNo('all');
                  setFilterFromDate('');
                  setFilterToDate('');
                  setSearch('');
                  setPage(1);
                }}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
              >
                Reset All Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-600 mb-1">Stay From Date</label>
              <input
                type="date"
                value={filterFromDate}
                onChange={(e) => { setFilterFromDate(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">Stay To Date</label>
              <input
                type="date"
                value={filterToDate}
                onChange={(e) => { setFilterToDate(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">Booking Status</label>
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold capitalize"
              >
                <option value="all">All Statuses</option>
                <option value="confirmed">Confirmed</option>
                <option value="checked_in">Checked In</option>
                <option value="checked_out">Checked Out</option>
                <option value="cancelled">Cancelled</option>
                <option value="no_show">No Show</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">Source / Channel</label>
              <select
                value={filterSource}
                onChange={(e) => { setFilterSource(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold"
              >
                <option value="all">All Channels</option>
                <option value="Direct/Walking">Direct / Walk-In</option>
                <option value="OTA">OTA Channels (MMT, Agoda, etc.)</option>
                <option value="Corporate">Corporate Accounts</option>
                <option value="Travel Agent">Travel Agents</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">Room Assignment</label>
              <select
                value={filterAssigned}
                onChange={(e) => { setFilterAssigned(e.target.value as any); setPage(1); }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold"
              >
                <option value="all">All Reservations</option>
                <option value="assigned">Assigned Rooms Only</option>
                <option value="unassigned">Unassigned (TBD) Only</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">Filter by Room</label>
              <select
                value={filterRoomNo}
                onChange={(e) => { setFilterRoomNo(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold"
              >
                <option value="all">All Rooms</option>
                {roomsList.map((r) => (
                  <option key={r.room_no} value={r.room_no}>Room {r.room_no}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Floating Action Dock (Sleek Single-Line Pill) ── */}
      {showBulkBar && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white pl-4 pr-3 py-2 sm:px-5 sm:py-2.5 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-slate-700/80 backdrop-blur-xl flex items-center flex-nowrap gap-2.5 sm:gap-3.5 animate-in slide-in-from-bottom-5 w-max max-w-[calc(100vw-2rem)] select-none">
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-xs">
              {selected.size}
            </span>
            <span className="text-xs font-bold text-slate-200 whitespace-nowrap">
              {selected.size} {selected.size === 1 ? 'reservation' : 'reservations'} selected
            </span>
          </div>

          <div className="h-5 w-px bg-slate-700/90 shrink-0" />

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={handleBulkCheckInAction}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-xs disabled:opacity-50 transition cursor-pointer shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" /> Bulk Check-In
            </button>
            <button
              type="button"
              onClick={handleBulkCheckOutAction}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-full shadow-xs disabled:opacity-50 transition cursor-pointer shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" /> Bulk Check-Out
            </button>
            <button
              type="button"
              onClick={handleBulkCancelAction}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white rounded-full shadow-xs disabled:opacity-50 transition cursor-pointer shrink-0"
            >
              <Ban className="w-3.5 h-3.5" /> Cancel
            </button>
            <button
              type="button"
              onClick={handleBulkDeleteAction}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-full shadow-xs disabled:opacity-50 transition cursor-pointer shrink-0"
              title="Delete selected reservations"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Selected ({selected.size})
            </button>
          </div>

          <div className="h-5 w-px bg-slate-700/90 shrink-0" />

          <button
            type="button"
            onClick={() => { setSelected(new Set()); setShowBulkBar(false); }}
            className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0"
            title="Deselect all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          1. PRIMARY VIEW: All Reservations Table (List View)
         ══════════════════════════════════════════════════════════════ */}
      {view === 'list' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-card overflow-hidden">
          {loading ? (
            <div className="p-20 text-center flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-9 h-9 animate-spin text-indigo-600" />
              <p className="text-sm font-bold text-slate-700">Loading reservations database…</p>
              <p className="text-xs text-slate-400">Fetching live bookings, OTA channels, and room statuses</p>
            </div>
          ) : paginatedData.reservations.length === 0 ? (
            <div className="p-20 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-400 shadow-inner">
                <List className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900">No matching reservations found</h3>
              <p className="text-xs text-slate-400 max-w-sm">
                No bookings match your current filter parameters. Try clearing filters or search keywords.
              </p>
              <button
                onClick={() => {
                  setFilterStatus('all');
                  setFilterSource('all');
                  setFilterAssigned('all');
                  setFilterRoomNo('all');
                  setFilterFromDate('');
                  setFilterToDate('');
                  setSearch('');
                  setPage(1);
                }}
                className="mt-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Clear All Filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200/90 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="w-10 px-4 py-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={
                          groupedReservations.length > 0 &&
                          groupedReservations.every((g) => g.reservations.every((r) => selected.has(r.id)))
                        }
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </th>
                    <th className="px-3 py-3.5 min-w-[110px]">Booking Ref</th>
                    <th className="px-3 py-3.5 min-w-[110px]">Channel</th>
                    <th className="px-4 py-3.5 min-w-[160px]">Guest Name</th>
                    <th className="px-3 py-3.5 min-w-[120px]">Contact</th>
                    <th className="px-3 py-3.5 min-w-[130px]">Stay Period</th>
                    <th className="px-3 py-3.5 min-w-[140px]">Room Allocation</th>
                    <th className="px-3 py-3.5 min-w-[100px] text-right">Tariff (₹)</th>
                    <th className="px-3 py-3.5 min-w-[95px] text-center">Payment</th>
                    <th className="px-3 py-3.5 min-w-[110px] text-center">Status</th>
                    <th className="px-4 py-3.5 min-w-[270px] text-center">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {groupedReservations.map((group) => {
                    const primary = group.primaryReservation;
                    const isAnyUnassigned = group.reservations.some(
                      (r) => !r.room_no || r.room_no.toLowerCase() === 'unassigned' || r.room_no.toLowerCase() === 'tbd'
                    );
                    const isPaid = group.totalAdvance >= group.totalTariff && group.totalTariff > 0;
                    const isPartial = group.totalAdvance > 0 && group.totalAdvance < group.totalTariff;
                    const isSelected = group.reservations.every((r) => selected.has(r.id));
                    const isPartiallySelected = !isSelected && group.reservations.some((r) => selected.has(r.id));

                    return (
                      <tr
                        key={group.bookingKey}
                        className={`transition hover:bg-slate-50/80 ${
                          isSelected ? 'bg-indigo-50/40' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = isPartiallySelected;
                            }}
                            onChange={() => toggleSelectGroup(group)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>

                        {/* Booking ID */}
                        <td className="px-3 py-3 font-mono font-bold text-slate-900">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>#{group.bookingKey.slice(0, 8)}</span>
                            {group.isMultiRoom && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-extrabold border border-indigo-300">
                                {group.reservations.length} Rooms
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 block font-normal">{fmtDayShort(primary.created_at)}</span>
                        </td>

                        {/* Channel / Source */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          {getSourceBadge(primary.source_name, primary.source_category)}
                        </td>

                        {/* Guest Profile */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 font-black text-xs flex items-center justify-center shrink-0">
                              {getInitials(primary.guest_name)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate max-w-[150px]" title={primary.guest_name}>
                                {primary.guest_name}
                              </p>
                              {primary.source_category === 'Corporate' && (
                                <span className="text-[10px] font-bold text-indigo-600 flex items-center gap-0.5">
                                  <Building2 className="w-3 h-3" /> Corp
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Guest Mobile */}
                        <td className="px-3 py-3 whitespace-nowrap font-mono text-[11px] text-slate-600">
                          {primary.guest_phone || '—'}
                          {primary.guest_email && (
                            <span className="text-[10px] text-slate-400 block truncate max-w-[120px]" title={primary.guest_email}>
                              {primary.guest_email}
                            </span>
                          )}
                        </td>

                        {/* Stay Period */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900">
                            <span>{fmtDayShort(group.checkInDate)}</span>
                            <span className="text-slate-400">→</span>
                            <span>{fmtDayShort(group.checkOutDate)}</span>
                          </div>
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                            <Moon className="w-3 h-3 text-indigo-500" />
                            {group.nights} {group.nights === 1 ? 'Night' : 'Nights'}
                          </span>
                        </td>

                        {/* Room Allocation */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          {group.isMultiRoom ? (
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-900 border border-indigo-200/90 rounded-xl text-xs font-bold w-fit">
                                <BedDouble className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                {group.reservations.length} Rooms ({group.roomNos.join(', ')})
                              </span>
                              {isAnyUnassigned && (
                                <span className="text-[10px] text-amber-600 font-bold">Has unassigned rooms</span>
                              )}
                            </div>
                          ) : isAnyUnassigned ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-[10px] font-black">
                              <AlertTriangle className="w-3 h-3 text-amber-600" /> Unassigned
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-900 border border-slate-200/90 rounded-xl text-xs font-bold">
                              <BedDouble className="w-3.5 h-3.5 text-indigo-600" /> Room {primary.room_no}
                            </span>
                          )}
                        </td>

                        {/* Total Tariff */}
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <span className="font-black text-slate-900 text-sm">{fmtMoney(group.totalTariff)}</span>
                          {group.isMultiRoom ? (
                            <span className="text-[10px] text-indigo-600 font-bold block">{group.reservations.length} Rooms Total</span>
                          ) : (
                            <span className="text-[10px] text-slate-400 block">₹{fmtMoney(primary.rate)}/nt</span>
                          )}
                        </td>

                        {/* Payment Status */}
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              isPaid
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : isPartial
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-rose-50 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {isPaid ? 'Paid' : isPartial ? `Due ₹${fmtMoney(group.totalBalance)}` : 'Due Full'}
                          </span>
                        </td>

                        {/* Booking Status */}
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          {getStatusBadge(group.status)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="inline-flex items-center justify-center gap-1.5">
                            {/* Confirmation PDF / View Multi-Room Details */}
                            <button
                              onClick={() => {
                                setSelectedForConfirmation(group.primaryReservation);
                                setSelectedForConfirmationGroup(group.reservations);
                              }}
                              className="w-7 h-7 flex items-center justify-center rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/90 transition cursor-pointer"
                              title="View Booking Details & Confirmation Voucher"
                            >
                              <FileText className="w-3.5 h-3.5 text-amber-600" />
                            </button>

                            {/* Assign / Change Room */}
                            <button
                              onClick={() => {
                                const unassigned = group.reservations.find(
                                  (r) => !r.room_no || r.room_no.toLowerCase() === 'unassigned' || r.room_no.toLowerCase() === 'tbd'
                                );
                                setSelectedForAssign(unassigned || group.primaryReservation);
                              }}
                              className="w-12 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px] transition cursor-pointer text-center"
                              title="Assign or Reallocate Physical Room"
                            >
                              {isAnyUnassigned ? 'Assign' : 'Shift'}
                            </button>

                            {/* Extend Stay */}
                            <button
                              onClick={() => setSelectedForExtend(group.primaryReservation)}
                              className="w-14 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px] transition cursor-pointer text-center"
                              title="Extend Stay Duration"
                            >
                              Extend
                            </button>

                            {/* Primary Action Button (Uniform 78px Slot) */}
                            {group.status === 'confirmed' ? (
                              <button
                                onClick={() => handleGroupCheckIn(group)}
                                disabled={busy}
                                className="w-[78px] py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[11px] transition shadow-2xs disabled:opacity-50 cursor-pointer text-center"
                                title={group.isMultiRoom ? `Check In All ${group.reservations.length} Rooms` : 'Check In Guest'}
                              >
                                Check-In
                              </button>
                            ) : group.status === 'checked_in' ? (
                              <button
                                onClick={() => handleGroupCheckOut(group)}
                                disabled={busy}
                                className="w-[78px] py-1 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg text-[11px] transition shadow-2xs disabled:opacity-50 cursor-pointer text-center"
                                title={group.isMultiRoom ? `Check Out All ${group.reservations.length} Rooms` : 'Check Out Guest'}
                              >
                                Check-Out
                              </button>
                            ) : group.status === 'checked_out' ? (
                              <span className="w-[78px] py-1 bg-slate-100 text-slate-400 font-bold rounded-lg text-[10px] text-center inline-block">
                                Closed
                              </span>
                            ) : group.status === 'cancelled' ? (
                              <span className="w-[78px] py-1 bg-rose-50 text-rose-400 font-bold rounded-lg text-[10px] text-center inline-block">
                                Cancelled
                              </span>
                            ) : (
                              <div className="w-[78px]" />
                            )}

                            {/* Cancel Action Slot (Uniform 28px Slot) */}
                            {group.status === 'confirmed' ? (
                              <button
                                onClick={() => handleGroupCancel(group)}
                                disabled={busy}
                                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                                title={group.isMultiRoom ? `Cancel all ${group.reservations.length} rooms` : 'Cancel Reservation'}
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <div className="w-7 h-7" />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Server-side Pagination Footer ── */}
          <div className="px-6 py-4 bg-slate-50/90 border-t border-slate-200/80 flex items-center justify-between gap-4 flex-wrap text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-500">Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-slate-400 ml-2">
                Showing {paginatedData.reservations.length === 0 ? 0 : (page - 1) * pageSize + 1} to{' '}
                {Math.min(page * pageSize, paginatedData.totalCount)} of {paginatedData.totalCount} entries
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="p-2 border border-slate-200 rounded-xl hover:bg-white text-slate-700 disabled:opacity-40 transition cursor-pointer shadow-2xs"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold text-slate-800 px-1">
                Page {page} of {Math.max(1, paginatedData.totalPages)}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(paginatedData.totalPages, p + 1))}
                disabled={page >= paginatedData.totalPages || loading}
                className="p-2 border border-slate-200 rounded-xl hover:bg-white text-slate-700 disabled:opacity-40 transition cursor-pointer shadow-2xs"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          2. TIMELINE MATRIX VIEW
         ══════════════════════════════════════════════════════════════ */}
      {view === 'timeline' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200/80">
                  <th className="px-4 py-3.5 text-left font-black text-slate-600 uppercase tracking-wider sticky left-0 bg-slate-50 z-20 min-w-[150px] border-r border-slate-200/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    ROOM
                  </th>
                  {dateColumns.map((d) => {
                    const dt = new Date(d + 'T00:00:00');
                    const isToday = d === new Date().toISOString().slice(0, 10);
                    const isHot = isHotSeasonDate(d, hotSeasons);
                    return (
                      <th
                        key={d}
                        className={`px-3 py-2.5 text-center font-bold min-w-[100px] border-r border-slate-200/80 ${
                          isHot
                            ? 'bg-rose-50 text-rose-700'
                            : isToday
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'text-slate-600'
                        }`}
                      >
                        <span className="text-[11px] uppercase block font-semibold">{dt.toLocaleDateString('en-IN', { weekday: 'short' })}</span>
                        <span className={`text-sm font-black block mt-0.5 ${isToday ? 'bg-indigo-600 text-white rounded-full w-6 h-6 leading-6 mx-auto shadow-sm' : ''}`}>
                          {dt.getDate()}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roomsList.map((room) => (
                  <tr key={room.room_no} className="hover:bg-slate-50/50 transition">
                    <td className="px-4 py-3 sticky left-0 bg-white z-10 border-r border-slate-200/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      <p className="font-bold text-slate-900 text-sm">{room.room_no}</p>
                      <p className="text-[10px] font-semibold text-slate-400 truncate max-w-[130px]">{room.category}</p>
                    </td>
                    {dateColumns.map((d) => {
                      const res = getResForRoomDate(room.room_no, d);
                      const isStart = res?.check_in_date === d;

                      return (
                        <td
                          key={d}
                          onClick={() => !res && setShowQuickRes({ roomNo: room.room_no, date: d })}
                          className="px-1.5 py-1.5 text-center border-r border-slate-100 cursor-pointer transition relative hover:bg-slate-50"
                        >
                          {res ? (
                            <div
                              onClick={(e) => { e.stopPropagation(); toggleSelect(res.id); }}
                              className={`group relative rounded-xl px-2.5 py-2 text-left cursor-pointer transition select-none shadow-2xs ${
                                selected.has(res.id) ? 'ring-2 ring-indigo-500' : ''
                              } ${
                                res.status === 'checked_in'
                                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-indigo-50 text-indigo-900 border border-indigo-200 hover:bg-indigo-100'
                              }`}
                            >
                              <p className="font-bold text-xs truncate" title={res.guest_name}>
                                {res.guest_name}
                              </p>
                              <div className="flex items-center justify-between text-[10px] font-semibold opacity-75 mt-0.5">
                                <span className="truncate">{isStart ? `${fmtMoney(res.rate)}/nt` : 'Staying'}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="h-8 flex items-center justify-center text-slate-300 hover:text-indigo-600 transition">
                              <Plus className="w-4 h-4 opacity-0 hover:opacity-100" />
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          3. CALENDAR OVERVIEW VIEW
         ══════════════════════════════════════════════════════════════ */}
      {view === 'calendar' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-card p-6 space-y-4">
          <div className="grid grid-cols-7 gap-3">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="text-center text-xs font-black text-slate-400 uppercase tracking-wider py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-3">
            {dateColumns.map((d) => {
              const dt = new Date(d + 'T00:00:00');
              const dayRes = timelineReservations.filter((r) =>
                r.check_in_date === d && (r.status === 'confirmed' || r.status === 'checked_in'),
              );
              const isToday = d === new Date().toISOString().slice(0, 10);
              const isHot = isHotSeasonDate(d, hotSeasons);
              return (
                <div
                  key={d}
                  className={`min-h-[90px] rounded-2xl border p-2.5 flex flex-col justify-between transition ${
                    isHot
                      ? 'border-rose-300 bg-rose-50/60'
                      : isToday
                      ? 'border-indigo-400 bg-indigo-50/50 ring-2 ring-indigo-200'
                      : 'border-slate-200/80 hover:border-slate-300 bg-slate-50/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-black ${isHot ? 'text-rose-700' : isToday ? 'text-indigo-700' : 'text-slate-700'}`}>
                      {dt.getDate()}
                    </span>
                    {isToday && <span className="text-[9px] font-extrabold bg-indigo-600 text-white px-1.5 py-0.5 rounded-full shadow-2xs">Today</span>}
                  </div>
                  <div className="space-y-1.5 my-1">
                    {dayRes.slice(0, 3).map((r) => (
                      <div
                        key={r.id}
                        className={`text-[10px] rounded-lg px-2 py-1 truncate font-bold shadow-2xs ${
                          r.status === 'checked_in'
                            ? 'bg-emerald-100/90 text-emerald-900 border border-emerald-200'
                            : 'bg-indigo-100/90 text-indigo-900 border border-indigo-200'
                        }`}
                        title={`${r.guest_name} · Room ${r.room_no}`}
                      >
                        {r.guest_name}
                      </div>
                    ))}
                  </div>
                  {dayRes.length > 3 && (
                    <p className="text-[10px] font-black text-slate-400">+{dayRes.length - 3} more</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          4. EXPECTED ARRIVALS VIEW
         ══════════════════════════════════════════════════════════════ */}
      {view === 'arrival' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <LogIn className="w-5 h-5 text-emerald-600" />
              <h3 className="text-base font-black text-slate-900">
                Scheduled Guest Arrivals ({fmtDate(startDate)})
              </h3>
            </div>
            <span className="text-xs font-bold text-slate-400">
              {timelineReservations.filter((r) => r.check_in_date === startDate).length} Expected
            </span>
          </div>

          {timelineReservations.filter((r) => r.check_in_date === startDate).length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm font-medium">
              No guest arrivals scheduled for {fmtDate(startDate)}.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {timelineReservations.filter((r) => r.check_in_date === startDate).map((r) => {
                const isUnassigned = !r.room_no || r.room_no.toLowerCase() === 'unassigned' || r.room_no.toLowerCase() === 'tbd';
                return (
                  <div
                    key={r.id}
                    className="p-4 rounded-2xl border border-slate-200/90 bg-slate-50/50 hover:bg-white transition flex items-center justify-between gap-4 shadow-2xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-2xl font-black text-xs flex items-center justify-center border shrink-0 ${
                          isUnassigned
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        {isUnassigned ? (
                          <span className="text-[10px] uppercase font-black tracking-tight">TBD</span>
                        ) : (
                          r.room_no
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-bold text-slate-900 truncate">{r.guest_name}</p>
                          {isUnassigned && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold shrink-0">
                              Unassigned
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" /> {r.guest_phone || 'No phone'} · {r.nights || 1}N
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleCheckIn(r)}
                      disabled={busy}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer shrink-0 ${
                        isUnassigned
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      {isUnassigned ? 'Assign Room' : 'Check-In'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          5. EXPECTED DEPARTURES VIEW
         ══════════════════════════════════════════════════════════════ */}
      {view === 'departure' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <LogOut className="w-5 h-5 text-sky-600" />
              <h3 className="text-base font-black text-slate-900">
                Scheduled Guest Check-Outs ({fmtDate(startDate)})
              </h3>
            </div>
            <span className="text-xs font-bold text-slate-400">
              {timelineReservations.filter((r) => r.check_out_date === startDate).length} Expected
            </span>
          </div>

          {timelineReservations.filter((r) => r.check_out_date === startDate).length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm font-medium">
              No check-outs scheduled for {fmtDate(startDate)}.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {timelineReservations.filter((r) => r.check_out_date === startDate).map((r) => {
                const isUnassigned = !r.room_no || r.room_no.toLowerCase() === 'unassigned' || r.room_no.toLowerCase() === 'tbd';
                return (
                  <div
                    key={r.id}
                    className="p-4 rounded-2xl border border-slate-200/90 bg-slate-50/50 hover:bg-white transition flex items-center justify-between gap-4 shadow-2xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-2xl font-black text-xs flex items-center justify-center border shrink-0 ${
                          isUnassigned
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-sky-100 text-sky-800 border-sky-200'
                        }`}
                      >
                        {isUnassigned ? (
                          <span className="text-[10px] uppercase font-black tracking-tight">TBD</span>
                        ) : (
                          r.room_no
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-bold text-slate-900 truncate">{r.guest_name}</p>
                          {isUnassigned && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold shrink-0">
                              Unassigned
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">Due for Departure</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleCheckOut(r)}
                      disabled={busy}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer shrink-0"
                    >
                      Check-Out
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── New Booking Modal ── */}
      {showNewBookingModal && (
        <NewBookingModal
          rooms={allRooms}
          categories={categories}
          sources={sources}
          settings={settings}
          defaultDate={startDate}
          saving={busy}
          onClose={() => setShowNewBookingModal(false)}
          onSave={async (inputs) => {
            const list = Array.isArray(inputs) ? inputs : [inputs];
            const created = await saveReservations(list);
            refreshAll();
            return created;
          }}
        />
      )}

      {/* ── Assign Room Modal ── */}
      {selectedForAssign && (
        <AssignRoomModal
          reservation={selectedForAssign}
          rooms={roomsList}
          onClose={() => setSelectedForAssign(null)}
          onSuccess={() => {
            setSuccessMsg('Room assigned successfully.');
            refreshAll();
          }}
        />
      )}

      {/* ── Extend Stay Modal ── */}
      {selectedForExtend && (
        <ExtendStayModal
          reservation={selectedForExtend}
          onClose={() => setSelectedForExtend(null)}
          onSuccess={() => {
            setSuccessMsg('Stay period extended successfully.');
            refreshAll();
          }}
        />
      )}

      {/* ── Reservation Confirmation Modal ── */}
      {selectedForConfirmation && (
        <ReservationConfirmationModal
          reservation={selectedForConfirmation}
          groupReservations={selectedForConfirmationGroup || undefined}
          settings={settings}
          onClose={() => {
            setSelectedForConfirmation(null);
            setSelectedForConfirmationGroup(null);
          }}
          onUpdated={() => {
            setSuccessMsg('Reservation confirmation updated.');
            refreshAll();
          }}
        />
      )}

      {/* ── Admin Conflicts Review Modal ── */}
      {showConflictsModal && (
        <ReservationConflictsModal
          conflicts={conflicts}
          availableRooms={roomsList}
          onClose={() => setShowConflictsModal(false)}
          onResolved={() => {
            checkConflicts();
            refreshAll();
          }}
        />
      )}

      {/* ── Quick Reservation Modal (from Matrix click) ── */}
      {showQuickRes && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xs">
                  {showQuickRes.roomNo}
                </div>
                <h3 className="text-base font-black text-slate-900">
                  Quick Booking — Room {showQuickRes.roomNo}
                </h3>
              </div>
              <button
                onClick={() => setShowQuickRes(null)}
                className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setBusy(true);
                try {
                  await quickReservation({
                    roomNo: showQuickRes.roomNo,
                    guestName: fd.get('guestName') as string,
                    guestPhone: fd.get('guestPhone') as string,
                    checkIn: showQuickRes.date,
                    checkOut: addDays(showQuickRes.date, Number(fd.get('nights'))),
                    rate: Number(fd.get('rate')),
                  });
                  setShowQuickRes(null);
                  setSuccessMsg(`Reservation for Room ${showQuickRes.roomNo} created successfully.`);
                  refreshAll();
                } catch (err: any) {
                  setError(err?.message || 'Failed to create reservation');
                } finally {
                  setBusy(false);
                }
              }}
              className="space-y-3.5 text-xs font-semibold"
            >
              <div>
                <label className="block text-slate-700 mb-1">Guest Full Name *</label>
                <input
                  name="guestName"
                  required
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Mobile Number</label>
                <input
                  name="guestPhone"
                  type="tel"
                  placeholder="e.g. 9876543210"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1">Nights</label>
                  <input
                    name="nights"
                    type="number"
                    defaultValue={1}
                    min={1}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1">Tariff / Night (₹)</label>
                  <input
                    name="rate"
                    type="number"
                    defaultValue={2500}
                    min={0}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowQuickRes(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-500/25 transition cursor-pointer disabled:opacity-60"
                >
                  Create Reservation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── Delete All Entries Confirmation Modal ── */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl border border-rose-100 p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 shadow-inner">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                  Delete All Reservation Entries?
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  This action will permanently delete <span className="font-bold text-rose-600">all {kpiStats.total} reservation records</span>, unbind room occupancy links, and clear linked alerts from your database.
                </p>
              </div>
            </div>

            <div className="bg-rose-50/80 border border-rose-200/80 rounded-2xl p-4 text-xs space-y-1.5 text-rose-900">
              <div className="flex items-center gap-2 font-bold text-rose-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Permanent & Irreversible</span>
              </div>
              <p className="text-[11px] text-rose-800 leading-normal">
                All confirmed, active, and checked-out bookings for this hotel will be completely removed. Please make sure you have backed up any necessary reports before proceeding.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(false)}
                disabled={deletingAll}
                className="px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAllAction}
                disabled={deletingAll}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-lg shadow-rose-500/25 transition cursor-pointer disabled:opacity-60 active:scale-95"
              >
                {deletingAll ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting Entries…</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Yes, Delete All Entries</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReservationBoard;
