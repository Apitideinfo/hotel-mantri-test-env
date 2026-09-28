import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar, List, LogIn, LogOut, Clock, AlertCircle, Plus, X,
  ChevronLeft, ChevronRight, Loader2, Users, Phone, Star, RefreshCw,
  ArrowRight, CheckCircle2, Ban, Filter, BedDouble, AlertTriangle,
  Search, SlidersHorizontal, Tag, MoreHorizontal, ChevronDown, Check,
} from 'lucide-react';
import type { RoomChartEntry, Room, RoomCategory, CompanySource, HotelSettings } from '@/lib/types';
import type { Reservation, ReservationStatus, ReservationAlert } from '@/lib/types-reservations';
import {
  getReservationsForDateRange, getActiveRoomChartEntries, moveReservation, quickReservation,
  getReservationAlerts, bulkCheckIn, bulkCheckOut, bulkCancel,
  getRoomAvailabilityForDate, type RoomAvailability,
  getReservationsPaginated, getReservationConflicts,
  updateReservationStatus, checkInReservation, saveReservation,
} from '@/lib/api-reservations';
import { getRooms, getRoomCategories, getCompanySources, getSettings } from '@/lib/api';
import { getHotSeasons, isHotSeasonDate } from '@/lib/api-calendar';
import type { HotSeason } from '@/lib/types';
import { AssignRoomModal, ExtendStayModal } from './ReservationModals';
import { ReservationConflictsModal } from './ReservationConflictsModal';
import { NewBookingModal } from '@/components/NewBookingModal';

type ViewMode = 'list' | 'timeline' | 'calendar' | 'arrival' | 'departure';

const fmtDate = (d?: string | null): string => {
  if (!d) return '—';
  try {
    return new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
};

const fmtMoney = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

const addDays = (date: string, n: number): string => {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export const ReservationBoard = ({ onBack, initialView }: { onBack: () => void; initialView?: ViewMode }) => {
  // Default view is LIST (All Reservations) per Master Prompt Requirement 25
  const [view, setView] = useState<ViewMode>(initialView ?? 'list');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [days, setDays] = useState(7);

  // List View Pagination & Filters
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
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
  const [showNewBookingModal, setShowNewBookingModal] = useState(false);
  const [showQuickRes, setShowQuickRes] = useState<{ roomNo: string; date: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkBar, setShowBulkBar] = useState(false);
  const [busy, setBusy] = useState(false);

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
        return { room_no: r.room_no, category: cat?.name || 'Standard', floor: r.floor || '1' };
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

  // Actions
  const handleCheckIn = async (res: Reservation) => {
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

  const handleCancel = async (res: Reservation) => {
    if (!window.confirm(`Are you sure you want to cancel reservation for ${res.guest_name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await updateReservationStatus(res.id, 'cancelled');
      setSuccessMsg('Reservation cancelled.');
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

  return (
    <div className="space-y-4">
      {/* ── Top Header ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">All Reservations</h1>
            <p className="text-xs sm:text-sm font-medium text-slate-400 mt-0.5">
              {view === 'list'
                ? `${paginatedData.totalCount} total bookings found`
                : `${timelineReservations.length} reservations · ${roomsList.length} physical rooms`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Admin Conflict Diagnostic Review Button */}
          {conflicts.length > 0 && (
            <button
              onClick={() => setShowConflictsModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold transition shadow-2xs animate-pulse"
              title="Review physical room conflicts"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>{conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} require review</span>
              <span className="underline ml-0.5">Review</span>
            </button>
          )}

          <button
            onClick={() => setShowNewBookingModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-soft-blue transition active:scale-95"
          >
            <Plus className="w-4 h-4" /> New Booking
          </button>

          <button
            onClick={refreshAll}
            disabled={busy || loading}
            aria-label="Refresh reservations"
            className="flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl shadow-2xs transition active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${busy || loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Operational Success Banner ── */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-2xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-2xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Views Switcher Bar ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-100/90 border border-slate-200/80 rounded-xl p-1 overflow-x-auto max-w-full">
          {(['list', 'timeline', 'calendar', 'arrival', 'departure'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => { setView(v); setPage(1); }}
              className={`px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all capitalize whitespace-nowrap ${
                view === v
                  ? 'bg-brand-600 text-white font-bold shadow-soft-blue'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {v === 'list' && <List className="w-3.5 h-3.5 inline mr-1.5" />}
              {v === 'timeline' && <Clock className="w-3.5 h-3.5 inline mr-1.5" />}
              {v === 'calendar' && <Calendar className="w-3.5 h-3.5 inline mr-1.5" />}
              {v === 'arrival' && <LogIn className="w-3.5 h-3.5 inline mr-1.5" />}
              {v === 'departure' && <LogOut className="w-3.5 h-3.5 inline mr-1.5" />}
              {v === 'list' ? 'All Reservations' : v}
            </button>
          ))}
        </div>

        {/* Matrix Date Controls (Only for timeline/calendar/arrival/departure) */}
        {view !== 'list' && (
          <div className="flex items-center gap-2 bg-white border border-slate-200/80 px-3 py-1.5 rounded-xl shadow-2xs">
            <button
              onClick={() => setStartDate(addDays(startDate, -days))}
              aria-label="Previous date range"
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs sm:text-sm font-bold text-slate-800 whitespace-nowrap px-1">
              {fmtDate(startDate)} — {fmtDate(endDate)}
            </span>
            <button
              onClick={() => setStartDate(addDays(startDate, days))}
              aria-label="Next date range"
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg bg-slate-50 text-slate-800 focus:outline-none"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>
        )}

        {/* List View Quick Search & Filter Toggle */}
        {view === 'list' && (
          <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
            <div className="relative min-w-[220px] max-w-xs w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search guest, mobile, room, ID…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition ${
                showFilters || filterStatus !== 'all' || filterSource !== 'all' || filterAssigned !== 'all' || filterFromDate
                  ? 'bg-brand-50 text-brand-700 border-brand-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filters</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Advanced Filter Drawer for List View ── */}
      {view === 'list' && showFilters && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card space-y-3 animate-fadeIn">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Stay From Date</label>
              <input
                type="date"
                value={filterFromDate}
                onChange={(e) => { setFilterFromDate(e.target.value); setPage(1); }}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Stay To Date</label>
              <input
                type="date"
                value={filterToDate}
                onChange={(e) => { setFilterToDate(e.target.value); setPage(1); }}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Booking Status</label>
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium capitalize"
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
              <label className="block font-semibold text-slate-600 mb-1">Channel / Source</label>
              <select
                value={filterSource}
                onChange={(e) => { setFilterSource(e.target.value); setPage(1); }}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium"
              >
                <option value="all">All Sources</option>
                <option value="Direct/Walking">Direct / Walk-in</option>
                <option value="OTA">OTA Channels</option>
                <option value="Corporate">Corporate</option>
                <option value="Travel Agent">Travel Agent</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Room Assignment</label>
              <select
                value={filterAssigned}
                onChange={(e) => { setFilterAssigned(e.target.value as any); setPage(1); }}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium"
              >
                <option value="all">All Bookings</option>
                <option value="assigned">Assigned Only</option>
                <option value="unassigned">Unassigned Only</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Room Number</label>
              <select
                value={filterRoomNo}
                onChange={(e) => { setFilterRoomNo(e.target.value); setPage(1); }}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium"
              >
                <option value="all">All Rooms</option>
                {roomsList.map((r) => (
                  <option key={r.room_no} value={r.room_no}>Room {r.room_no}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-1">
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
              className="px-3 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              Reset Filters
            </button>
          </div>
        </div>
      )}

      {/* ── Bulk Operations Bar ── */}
      {showBulkBar && (
        <div className="bg-brand-navy-700 text-white rounded-2xl p-4 shadow-card flex items-center justify-between gap-3 flex-wrap animate-fadeIn">
          <span className="text-sm font-bold">{selected.size} selected</span>
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleBulkCheckInAction}
              disabled={busy}
              className="px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm disabled:opacity-50 transition active:scale-95"
            >
              <LogIn className="w-3.5 h-3.5 inline mr-1.5" /> Bulk Check-in
            </button>
            <button
              onClick={handleBulkCheckOutAction}
              disabled={busy}
              className="px-3.5 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-xl shadow-sm disabled:opacity-50 transition active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5 inline mr-1.5" /> Bulk Check-out
            </button>
            <button
              onClick={handleBulkCancelAction}
              disabled={busy}
              className="px-3.5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-sm disabled:opacity-50 transition active:scale-95"
            >
              <Ban className="w-3.5 h-3.5 inline mr-1.5" /> Bulk Cancel
            </button>
            <button
              onClick={() => { setSelected(new Set()); setShowBulkBar(false); }}
              className="px-3 py-2 text-xs font-bold text-slate-300 hover:text-white transition"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* ── Primary View: All Reservations (List) ── */}
      {view === 'list' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
          {loading ? (
            <div className="p-16 text-center flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
              <p className="text-sm font-semibold text-slate-600">Loading reservations table…</p>
            </div>
          ) : paginatedData.reservations.length === 0 ? (
            <div className="p-16 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                <List className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">No reservations found</h3>
              <p className="text-xs text-slate-400 max-w-sm">
                No bookings match your current search and filter criteria. Try adjusting dates or filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3 min-w-[110px]">Booking ID</th>
                    <th className="px-3 py-3 min-w-[110px]">Source</th>
                    <th className="px-3 py-3 min-w-[100px]">Booked On</th>
                    <th className="px-4 py-3 min-w-[150px]">Guest Name</th>
                    <th className="px-3 py-3 min-w-[120px]">Guest Mobile</th>
                    <th className="px-3 py-3 min-w-[100px]">Check-In</th>
                    <th className="px-3 py-3 min-w-[110px]">Check-Out</th>
                    <th className="px-3 py-3 min-w-[100px]">Room</th>
                    <th className="px-3 py-3 min-w-[110px]">Room Category</th>
                    <th className="px-3 py-3 min-w-[100px] text-right">Total (₹)</th>
                    <th className="px-3 py-3 min-w-[100px] text-center">Payment</th>
                    <th className="px-3 py-3 min-w-[110px] text-center">Status</th>
                    <th className="px-4 py-3 min-w-[120px] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {paginatedData.reservations.map((r) => {
                    const isUnassigned = !r.room_no || r.room_no.toLowerCase() === 'unassigned' || r.room_no.toLowerCase() === 'tbd';
                    const nights = r.nights || 1;
                    const totalVal = r.invoice_total > 0 ? r.invoice_total : (r.rate * nights);
                    const isPaid = r.advance_paid >= totalVal && totalVal > 0;
                    const isPartial = r.advance_paid > 0 && r.advance_paid < totalVal;

                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70 transition">
                        {/* Booking ID */}
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          #{r.id.slice(0, 8)}
                        </td>

                        {/* Source */}
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.source_category === 'OTA'
                              ? 'bg-purple-100 text-purple-800'
                              : r.source_category === 'Corporate'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {r.source_name || r.source_category || 'Direct'}
                          </span>
                        </td>

                        {/* Booking Date */}
                        <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                          {fmtDate(r.created_at)}
                        </td>

                        {/* Guest Name */}
                        <td className="px-4 py-3 font-bold text-slate-900">
                          {r.guest_name}
                        </td>

                        {/* Guest Mobile */}
                        <td className="px-3 py-3 text-slate-600 whitespace-nowrap font-mono text-[11px]">
                          {r.guest_phone || '—'}
                        </td>

                        {/* Check-In */}
                        <td className="px-3 py-3 whitespace-nowrap text-slate-900 font-semibold">
                          {fmtDate(r.check_in_date)}
                        </td>

                        {/* Check-Out */}
                        <td className="px-3 py-3 whitespace-nowrap text-slate-900 font-semibold">
                          {fmtDate(r.check_out_date)}
                          <span className="text-[10px] text-slate-400 block font-normal">({nights} night{nights > 1 ? 's' : ''})</span>
                        </td>

                        {/* Room */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          {isUnassigned ? (
                            <span className="px-2 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-[10px] font-bold">
                              Unassigned
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-brand-50 text-brand-800 border border-brand-200 rounded-lg text-xs font-bold">
                              Room {r.room_no}
                            </span>
                          )}
                        </td>

                        {/* Room Category */}
                        <td className="px-3 py-3 text-slate-600 truncate max-w-[120px]" title={r.room_id ? 'Assigned' : 'Standard'}>
                          {allRooms.find(rm => rm.room_no === r.room_no)?.category_id
                            ? categories.find(c => c.id === allRooms.find(rm => rm.room_no === r.room_no)?.category_id)?.name
                            : 'Standard Room'}
                        </td>

                        {/* Total Amount */}
                        <td className="px-3 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                          {fmtMoney(totalVal)}
                        </td>

                        {/* Payment Status */}
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isPaid
                              ? 'bg-emerald-100 text-emerald-800'
                              : isPartial
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {isPaid ? 'Paid' : isPartial ? 'Partial' : 'Pending'}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                            r.status === 'confirmed'
                              ? 'bg-sky-100 text-sky-800'
                              : r.status === 'checked_in'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.status === 'checked_out'
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {r.status.replace('_', ' ')}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Assign or Change Room */}
                            <button
                              onClick={() => setSelectedForAssign(r)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px] transition"
                              title="Assign or Change Physical Room"
                            >
                              {isUnassigned ? 'Assign Room' : 'Change Room'}
                            </button>

                            {/* Extend Stay */}
                            <button
                              onClick={() => setSelectedForExtend(r)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px] transition"
                              title="Extend Stay Dates"
                            >
                              Extend
                            </button>

                            {/* Check-In if confirmed */}
                            {r.status === 'confirmed' && (
                              <button
                                onClick={() => handleCheckIn(r)}
                                disabled={busy}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[11px] transition disabled:opacity-50"
                                title="Check In Guest"
                              >
                                Check-in
                              </button>
                            )}

                            {/* Check-Out if checked_in */}
                            {r.status === 'checked_in' && (
                              <button
                                onClick={() => handleCheckOut(r)}
                                disabled={busy}
                                className="px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg text-[11px] transition disabled:opacity-50"
                                title="Check Out Guest"
                              >
                                Check-out
                              </button>
                            )}

                            {/* Cancel if confirmed */}
                            {r.status === 'confirmed' && (
                              <button
                                onClick={() => handleCancel(r)}
                                disabled={busy}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition"
                                title="Cancel Reservation"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
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
          <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-200/80 flex items-center justify-between gap-4 flex-wrap text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="px-2 py-1 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-slate-400 ml-2">
                Showing {paginatedData.reservations.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, paginatedData.totalCount)} of {paginatedData.totalCount}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="p-1.5 border border-slate-200 rounded-lg hover:bg-white text-slate-700 disabled:opacity-40 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold text-slate-800">
                Page {page} of {Math.max(1, paginatedData.totalPages)}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(paginatedData.totalPages, p + 1))}
                disabled={page >= paginatedData.totalPages || loading}
                className="p-1.5 border border-slate-200 rounded-lg hover:bg-white text-slate-700 disabled:opacity-40 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Timeline View ── */}
      {view === 'timeline' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200/80">
                  <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 z-20 min-w-[140px] sm:min-w-[160px] border-r border-slate-200/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    ROOM
                  </th>
                  {dateColumns.map((d) => {
                    const dt = new Date(d + 'T00:00:00');
                    const isToday = d === new Date().toISOString().slice(0, 10);
                    const isHot = isHotSeasonDate(d, hotSeasons);
                    return (
                      <th
                        key={d}
                        className={`px-3 py-2.5 text-center font-bold min-w-[90px] sm:min-w-[110px] border-r border-slate-200/80 ${
                          isHot
                            ? 'bg-rose-50 text-rose-700'
                            : isToday
                            ? 'bg-brand-50 text-brand-700'
                            : 'text-slate-600'
                        }`}
                      >
                        <span className="text-[11px] uppercase block font-semibold">{dt.toLocaleDateString('en-IN', { weekday: 'short' })}</span>
                        <span className={`text-sm font-bold block mt-0.5 ${isToday ? 'bg-brand-600 text-white rounded-full w-6 h-6 leading-6 mx-auto shadow-sm' : ''}`}>
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
                    <td className="px-4 py-2.5 sticky left-0 bg-white z-10 border-r border-slate-200/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      <p className="font-bold text-slate-900 text-sm">{room.room_no}</p>
                      <p className="text-[10px] font-medium text-slate-400 truncate max-w-[130px]">{room.category}</p>
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
                              className={`group relative rounded-xl px-2 py-1.5 text-left cursor-pointer transition select-none shadow-sm ${
                                selected.has(res.id) ? 'ring-2 ring-brand-500' : ''
                              } ${
                                res.status === 'checked_in'
                                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-brand-50 text-brand-900 border border-brand-200 hover:bg-brand-100'
                              }`}
                            >
                              <p className="font-bold text-xs truncate" title={res.guest_name}>
                                {res.guest_name}
                              </p>
                              <div className="flex items-center justify-between text-[10px] font-semibold opacity-75 mt-0.5">
                                <span className="truncate">{isStart ? `${fmtMoney(res.rate)}/n` : 'staying'}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="h-7 flex items-center justify-center text-slate-300 hover:text-brand-600 transition">
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

      {/* ── Calendar View ── */}
      {view === 'calendar' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 space-y-4">
          <div className="grid grid-cols-7 gap-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="text-center text-xs font-bold text-slate-400 uppercase tracking-wider">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {dateColumns.map((d) => {
              const dt = new Date(d + 'T00:00:00');
              const dayRes = timelineReservations.filter((r) =>
                r.check_in_date === d && (r.status === 'confirmed' || r.status === 'checked_in'),
              );
              const isToday = d === new Date().toISOString().slice(0, 10);
              const isHot = isHotSeasonDate(d, hotSeasons);
              return (
                <div key={d} className={`min-h-[80px] rounded-xl border p-2 flex flex-col justify-between transition ${isHot ? 'border-rose-300 bg-rose-50/80' : isToday ? 'border-brand-300 bg-brand-50/80' : 'border-slate-200/80 hover:border-slate-300'}`}>
                  <div className="flex items-center justify-between">
                    <p className={`text-xs font-bold ${isHot ? 'text-rose-700' : isToday ? 'text-brand-700' : 'text-slate-700'}`}>{dt.getDate()}</p>
                    {isToday && <span className="text-[9px] font-bold bg-brand-600 text-white px-1.5 py-0.5 rounded-full">Today</span>}
                  </div>
                  <div className="space-y-1 my-1">
                    {dayRes.slice(0, 3).map((r) => (
                      <div key={r.id} className={`text-[10px] rounded-lg px-2 py-1 truncate font-semibold shadow-2xs ${
                        r.status === 'checked_in' ? 'bg-emerald-100 text-emerald-800' : 'bg-brand-100 text-brand-800'
                      }`}>
                        {r.guest_name}
                      </div>
                    ))}
                  </div>
                  {dayRes.length > 3 && (
                    <p className="text-[10px] font-bold text-slate-400">+{dayRes.length - 3} more</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Arrival View ── */}
      {view === 'arrival' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 space-y-4">
          <h3 className="text-base font-bold text-slate-900">Expected Arrivals ({startDate})</h3>
          {timelineReservations.filter((r) => r.check_in_date === startDate).length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm font-medium">No arrivals scheduled for {fmtDate(startDate)}.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {timelineReservations.filter((r) => r.check_in_date === startDate).map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xs">
                      {r.room_no || 'TBD'}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{r.guest_name}</p>
                      <p className="text-xs text-slate-400">Phone: {r.guest_phone || 'N/A'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCheckIn(r)}
                    disabled={busy}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                  >
                    Check In
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Departure View ── */}
      {view === 'departure' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 space-y-4">
          <h3 className="text-base font-bold text-slate-900">Expected Departures ({startDate})</h3>
          {timelineReservations.filter((r) => r.check_out_date === startDate).length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm font-medium">No departures scheduled for {fmtDate(startDate)}.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {timelineReservations.filter((r) => r.check_out_date === startDate).map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 font-bold text-xs">
                      {r.room_no || 'TBD'}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{r.guest_name}</p>
                      <p className="text-xs text-slate-400">Check-out Today</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCheckOut(r)}
                    disabled={busy}
                    className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                  >
                    Check Out
                  </button>
                </div>
              ))}
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
            for (const item of list) {
              await saveReservation(item);
            }
            refreshAll();
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
            setSuccessMsg('Stay extended successfully.');
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

      {/* ── Quick Reservation Modal (from Timeline click) ── */}
      {showQuickRes && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Quick Reservation — Room {showQuickRes.roomNo}</h3>
              <button onClick={() => setShowQuickRes(null)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={async (e) => {
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
            }} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Guest Name *</label>
                <input name="guestName" required type="text" placeholder="e.g. Rahul Sharma" className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
                <input name="guestPhone" type="tel" placeholder="e.g. 9876543210" className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nights</label>
                  <input name="nights" type="number" defaultValue={1} min={1} className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nightly Rate (₹)</label>
                  <input name="rate" type="number" defaultValue={2500} min={0} className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowQuickRes(null)} className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-semibold">Cancel</button>
                <button type="submit" disabled={busy} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold shadow-soft-blue">Save Reservation</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReservationBoard;
