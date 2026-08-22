import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar, List, LogIn, LogOut, Clock, AlertCircle, Plus, X,
  ChevronLeft, ChevronRight, Loader2, Users, Phone, Star, RefreshCw,
  GripVertical, ArrowRight, CheckCircle2, Ban, Filter, BedDouble, AlertTriangle,
} from 'lucide-react';
import type { RoomChartEntry } from '@/lib/types';
import type { Reservation, ReservationStatus, ReservationAlert } from '@/lib/types-reservations';
import {
  getReservationsForDateRange, getActiveRoomChartEntries, moveReservation, quickReservation,
  getReservationAlerts, bulkCheckIn, bulkCheckOut, bulkCancel,
  getRoomAvailabilityForDate, type RoomAvailability, extendReservation,
} from '@/lib/api-reservations';
import { getHotSeasons, isHotSeasonDate } from '@/lib/api-calendar';
import type { HotSeason } from '@/lib/types';
import { RESERVATION_STATUS_COLORS, ROOM_STATUS_COLORS } from '@/lib/types-reservations';

type ViewMode = 'timeline' | 'calendar' | 'list' | 'arrival' | 'departure';

const fmtDate = (d: string): string => {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const fmtMoney = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

const addDays = (date: string, n: number): string => {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export const ReservationBoard = ({ onBack, initialView }: { onBack: () => void; initialView?: ViewMode }) => {
  const [view, setView] = useState<ViewMode>(initialView ?? 'timeline');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [days, setDays] = useState(7);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [inHouseStays, setInHouseStays] = useState<RoomChartEntry[]>([]);
  const [availability, setAvailability] = useState<RoomAvailability[]>([]);
  const [hotSeasons, setHotSeasons] = useState<HotSeason[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<ReservationAlert[]>([]);
  const [showQuickRes, setShowQuickRes] = useState<{ roomNo: string; date: string } | null>(null);
  const [draggedRes, setDraggedRes] = useState<string | null>(null);
  const [dragOverRoom, setDragOverRoom] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkBar, setShowBulkBar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stretchingRes, setStretchingRes] = useState<Reservation | null>(null);
  const [stretchTargetDate, setStretchTargetDate] = useState<string | null>(null);

  const endDate = useMemo(() => addDays(startDate, days - 1), [startDate, days]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, avail, stays, hs] = await Promise.all([
        getReservationsForDateRange(startDate, endDate).catch(() => []),
        getRoomAvailabilityForDate(startDate).catch(() => []),
        initialView === 'list' ? getActiveRoomChartEntries(startDate).catch(() => []) : Promise.resolve([] as RoomChartEntry[]),
        getHotSeasons().catch(() => []),
      ]);
      setReservations(res);
      setInHouseStays(stays);
      setAvailability(avail);
      setHotSeasons(hs);
      try {
        const al = await getReservationAlerts(res);
        setAlerts(al);
      } catch { /* non-critical */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load reservation data');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, initialView]);

  useEffect(() => { load(); }, [load]);

  // Get unique room numbers from availability
  const rooms = useMemo(() => {
    const seen = new Set<string>();
    const result: { room_no: string; category: string; floor: string }[] = [];
    for (const a of availability) {
      if (!seen.has(a.room_no)) {
        seen.add(a.room_no);
        result.push({ room_no: a.room_no, category: a.category, floor: a.floor });
      }
    }
    return result.sort((a, b) => a.room_no.localeCompare(b.room_no, undefined, { numeric: true }));
  }, [availability]);

  // Date columns
  const dateColumns = useMemo(() => {
    const cols: string[] = [];
    for (let i = 0; i < days; i++) {
      cols.push(addDays(startDate, i));
    }
    return cols;
  }, [startDate, days]);

  // Get reservation for a room on a date
  const getResForRoomDate = (roomNo: string, date: string): Reservation | undefined => {
    return reservations.find((r) =>
      r.room_no === roomNo &&
      r.check_in_date <= date &&
      r.check_out_date > date &&
      (r.status === 'confirmed' || r.status === 'checked_in'),
    );
  };

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, reservationId: string) => {
    setDraggedRes(reservationId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, roomNo: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverRoom(roomNo);
  };

  const handleDrop = async (e: React.DragEvent, targetRoomNo: string, targetDate: string) => {
    e.preventDefault();
    setDragOverRoom(null);
    if (!draggedRes) return;
    setBusy(true);
    try {
      await moveReservation({ reservationId: draggedRes, newRoomNo: targetRoomNo, newCheckIn: targetDate });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move reservation');
    } finally {
      setBusy(false);
      setDraggedRes(null);
    }
  };

  const commitStretch = useCallback(async (res: Reservation, targetDate: string) => {
    const newCheckOut = addDays(targetDate, 1);
    if (newCheckOut === res.check_out_date) {
      setStretchingRes(null);
      setStretchTargetDate(null);
      return;
    }
    setBusy(true);
    try {
      await extendReservation({
        reservationId: res.id,
        newCheckOut,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to stretch reservation');
    } finally {
      setBusy(false);
      setStretchingRes(null);
      setStretchTargetDate(null);
    }
  }, [load]);

  useEffect(() => {
    if (!stretchingRes) return;

    const handleGlobalMouseUp = () => {
      if (stretchingRes && stretchTargetDate) {
        commitStretch(stretchingRes, stretchTargetDate);
      } else {
        setStretchingRes(null);
        setStretchTargetDate(null);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [stretchingRes, stretchTargetDate, commitStretch]);

  const handleQuickRes = async (params: { roomNo: string; guestName: string; guestPhone?: string; checkIn: string; checkOut: string; rate: number }) => {
    setBusy(true);
    try {
      await quickReservation(params);
      setShowQuickRes(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
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

  const handleBulkCheckIn = async () => {
    setBusy(true);
    try {
      await bulkCheckIn([...selected]);
      setSelected(new Set());
      setShowBulkBar(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkCheckOut = async () => {
    setBusy(true);
    try {
      await bulkCheckOut([...selected]);
      setSelected(new Set());
      setShowBulkBar(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkCancel = async () => {
    setBusy(true);
    try {
      await bulkCancel([...selected]);
      setSelected(new Set());
      setShowBulkBar(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Reservation Board</h1>
            <p className="text-xs sm:text-sm font-medium text-slate-400 mt-0.5">
              {initialView === 'list' ? `${inHouseStays.length} in-house guests` : `${reservations.length} reservations`} · {rooms.length} rooms
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={busy}
          aria-label="Refresh reservations"
          className="flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl shadow-sm transition active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.slice(0, 5).map((a, i) => (
            <div key={i} className={`text-xs rounded-xl p-3 flex items-center gap-2.5 shadow-sm ${
              a.severity === 'error' ? 'bg-rose-50 text-rose-800 border border-rose-200/80' :
              a.severity === 'warning' ? 'bg-amber-50 text-amber-800 border border-amber-200/80' :
              'bg-sky-50 text-sky-800 border border-sky-200/80'
            }`}>
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="flex-1 font-medium">{a.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Error Alert Banner */}
      {error && (
        <div className="bg-rose-50 border border-rose-200/80 text-rose-800 text-sm rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <div className="flex-1">
            <p className="font-semibold text-rose-900">Unable to load reservation data</p>
            <p className="text-xs text-rose-700 mt-0.5">{error}</p>
          </div>
          <button
            onClick={load}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition"
          >
            Retry
          </button>
          <button onClick={() => setError(null)} className="p-1 hover:bg-rose-100 rounded-lg text-rose-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* View Switcher Tabs & Date Range Controls */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card flex items-center justify-between gap-4 flex-wrap">
        {/* Segmented View Switcher */}
        <div className="flex items-center gap-1 bg-slate-100/90 border border-slate-200/80 rounded-xl p-1 overflow-x-auto max-w-full">
          {(['timeline', 'calendar', 'list', 'arrival', 'departure'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all capitalize whitespace-nowrap ${
                view === v
                  ? 'bg-brand-600 text-white font-bold shadow-soft-blue'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {v === 'timeline' && <Clock className="w-3.5 h-3.5 inline mr-1.5" />}
              {v === 'calendar' && <Calendar className="w-3.5 h-3.5 inline mr-1.5" />}
              {v === 'list' && <List className="w-3.5 h-3.5 inline mr-1.5" />}
              {v === 'arrival' && <LogIn className="w-3.5 h-3.5 inline mr-1.5" />}
              {v === 'departure' && <LogOut className="w-3.5 h-3.5 inline mr-1.5" />}
              {v}
            </button>
          ))}
        </div>

        {/* Date Controls */}
        <div className="flex items-center gap-2 bg-white border border-slate-200/80 px-3 py-1.5 rounded-xl shadow-sm">
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
            className="px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </div>
      </div>

      {/* Bulk Operations Bar */}
      {showBulkBar && (
        <div className="bg-brand-navy-700 text-white rounded-2xl p-4 shadow-card flex items-center justify-between gap-3 flex-wrap animate-fadeIn">
          <span className="text-sm font-bold">{selected.size} selected</span>
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleBulkCheckIn}
              disabled={busy}
              className="px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm disabled:opacity-50 transition active:scale-95"
            >
              <LogIn className="w-3.5 h-3.5 inline mr-1.5" /> Bulk Check-in
            </button>
            <button
              onClick={handleBulkCheckOut}
              disabled={busy}
              className="px-3.5 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-xl shadow-sm disabled:opacity-50 transition active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5 inline mr-1.5" /> Bulk Check-out
            </button>
            <button
              onClick={handleBulkCancel}
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

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400 shadow-card flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm font-semibold text-slate-600">Loading reservation matrix…</p>
        </div>
      ) : (
        <>
          {/* Timeline View */}
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
                    {rooms.map((room) => (
                      <tr key={room.room_no} className="hover:bg-slate-50/50 transition">
                        <td className="px-4 py-2.5 sticky left-0 bg-white z-10 border-r border-slate-200/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                          <p className="font-bold text-slate-900 text-sm">{room.room_no}</p>
                          <p className="text-[10px] font-medium text-slate-400 truncate max-w-[130px]">{room.category}</p>
                        </td>
                        {dateColumns.map((d) => {
                          const res = getResForRoomDate(room.room_no, d);
                          const isDragOver = dragOverRoom === room.room_no;
                          const isStart = res?.check_in_date === d;
                          const isEnd = res && addDays(res.check_out_date, -1) === d;
                          const isStretchPreview = Boolean(
                            stretchingRes &&
                            stretchingRes.room_no === room.room_no &&
                            stretchTargetDate &&
                            d > addDays(stretchingRes.check_out_date, -1) &&
                            d <= stretchTargetDate
                          );

                          return (
                            <td
                              key={d}
                              onDragOver={(e) => handleDragOver(e, room.room_no)}
                              onDragLeave={() => setDragOverRoom(null)}
                              onDrop={(e) => handleDrop(e, room.room_no, d)}
                              onMouseEnter={() => {
                                if (stretchingRes && stretchingRes.room_no === room.room_no && d >= stretchingRes.check_in_date) {
                                  setStretchTargetDate(d);
                                }
                              }}
                              onClick={() => !res && !stretchingRes && setShowQuickRes({ roomNo: room.room_no, date: d })}
                              className={`px-1.5 py-1.5 text-center border-r border-slate-100 cursor-pointer transition relative ${
                                isDragOver
                                  ? 'bg-brand-100'
                                  : isStretchPreview
                                  ? 'bg-emerald-100/80 ring-1 ring-emerald-400'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              {res ? (
                                <div
                                  draggable={!stretchingRes}
                                  onDragStart={(e) => handleDragStart(e, res.id)}
                                  onClick={(e) => { e.stopPropagation(); toggleSelect(res.id); }}
                                  className={`group relative rounded-xl px-2 py-1.5 text-left cursor-move transition select-none shadow-sm ${
                                    selected.has(res.id) ? 'ring-2 ring-brand-500' : ''
                                  } ${
                                    res.status === 'checked_in'
                                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100'
                                      : 'bg-brand-50 text-brand-900 border border-brand-200 hover:bg-brand-100'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1 min-w-0">
                                    <div className="flex items-center gap-1 min-w-0 flex-1">
                                      {isStart && <GripVertical className="w-3 h-3 opacity-50 shrink-0" />}
                                      <p className="font-bold text-xs truncate" title={res.guest_name}>
                                        {res.guest_name}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center justify-between text-[10px] font-semibold opacity-75 mt-0.5">
                                    <span className="truncate">{isStart ? `${fmtMoney(res.rate)}/n` : 'staying'}</span>
                                  </div>

                                  {/* Cursor Click-Drag Stretch Handle on right edge */}
                                  {isEnd && (
                                    <div
                                      onMouseDown={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        setStretchingRes(res);
                                        setStretchTargetDate(d);
                                      }}
                                      className="absolute right-0 top-0 bottom-0 w-3.5 cursor-ew-resize flex items-center justify-center bg-emerald-400/40 hover:bg-emerald-500/80 rounded-r-xl z-20 transition group/handle"
                                      title="Click & Drag cursor right to stretch stay check-out date"
                                    >
                                      <div className="w-1 h-3 bg-emerald-800/80 rounded-full group-hover/handle:bg-white shrink-0" />
                                    </div>
                                  )}
                                </div>
                              ) : isStretchPreview ? (
                                <div className="h-7 rounded-xl bg-emerald-200/90 border border-emerald-400 text-emerald-900 text-[10px] font-bold flex items-center justify-center shadow-inner animate-pulse">
                                  Release to stretch →
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
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50/90 text-xs">
                    {/* Occupied Row */}
                    <tr className="border-b border-slate-200/80">
                      <td className="px-4 py-2.5 sticky left-0 bg-slate-50 z-10 border-r border-slate-200/80 font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        Occupied
                      </td>
                      {dateColumns.map((d) => {
                        const occCount = rooms.filter((r) => getResForRoomDate(r.room_no, d)).length;
                        return (
                          <td key={d} className="px-3 py-2.5 text-center font-bold text-slate-900 border-r border-slate-200/80 tabular-nums">
                            {occCount}
                          </td>
                        );
                      })}
                    </tr>
                    {/* Available Row */}
                    <tr className="border-b border-slate-200/80">
                      <td className="px-4 py-2.5 sticky left-0 bg-slate-50 z-10 border-r border-slate-200/80 font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        Available
                      </td>
                      {dateColumns.map((d) => {
                        const occCount = rooms.filter((r) => getResForRoomDate(r.room_no, d)).length;
                        const availCount = Math.max(0, rooms.length - occCount);
                        return (
                          <td key={d} className="px-3 py-2.5 text-center font-bold text-emerald-600 border-r border-slate-200/80 tabular-nums">
                            {availCount}
                          </td>
                        );
                      })}
                    </tr>
                    {/* Occupancy % Row */}
                    <tr className="border-b border-slate-200/80">
                      <td className="px-4 py-2.5 sticky left-0 bg-slate-50 z-10 border-r border-slate-200/80 font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        Occupancy %
                      </td>
                      {dateColumns.map((d) => {
                        const occCount = rooms.filter((r) => getResForRoomDate(r.room_no, d)).length;
                        const pct = rooms.length > 0 ? Math.round((occCount / rooms.length) * 100) : 0;
                        return (
                          <td key={d} className="px-3 py-2.5 text-center font-bold text-brand-600 border-r border-slate-200/80 tabular-nums">
                            {pct}%
                          </td>
                        );
                      })}
                    </tr>
                    {/* Daily Tariff Row */}
                    <tr>
                      <td className="px-4 py-2.5 sticky left-0 bg-slate-50 z-10 border-r border-slate-200/80 font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        Daily Tariff
                      </td>
                      {dateColumns.map((d) => {
                        const rev = rooms.reduce((sum, r) => {
                          const res = getResForRoomDate(r.room_no, d);
                          return sum + (res ? (res.rate || 0) : 0);
                        }, 0);
                        return (
                          <td key={d} className="px-3 py-2.5 text-center font-bold text-emerald-700 border-r border-slate-200/80 tabular-nums">
                            {fmtMoney(rev)}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Empty State */}
              {rooms.length === 0 && (
                <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600">
                    <BedDouble className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">No rooms configured</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      Configure room inventory in Property Master to start creating and managing reservations.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Calendar View */}
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
                  const dayRes = reservations.filter((r) =>
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

          {/* List View */}
          {view === 'list' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 space-y-4">
              <h3 className="text-base font-bold text-slate-900">Active In-House Stays & Reservations</h3>
              {reservations.length === 0 && inHouseStays.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm font-medium">No active stays or reservations found for this period.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {reservations.map((r) => (
                    <div key={r.id} className="py-3 flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 font-bold text-xs">
                          {r.room_no}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{r.guest_name}</p>
                          <p className="text-xs text-slate-400">{r.check_in_date} → {r.check_out_date} · {r.status}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-emerald-600">{fmtMoney(r.rate)}</p>
                        <p className="text-[11px] text-slate-400">{r.payment_mode || 'Cash'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Arrival View */}
          {view === 'arrival' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 space-y-4">
              <h3 className="text-base font-bold text-slate-900">Expected Arrivals ({startDate})</h3>
              {reservations.filter((r) => r.check_in_date === startDate).length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm font-medium">No arrivals scheduled for {fmtDate(startDate)}.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {reservations.filter((r) => r.check_in_date === startDate).map((r) => (
                    <div key={r.id} className="py-3 flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xs">
                          {r.room_no}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{r.guest_name}</p>
                          <p className="text-xs text-slate-400">Phone: {r.guest_phone || 'N/A'}</p>
                        </div>
                      </div>
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold">Arrival Expected</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Departure View */}
          {view === 'departure' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 space-y-4">
              <h3 className="text-base font-bold text-slate-900">Expected Departures ({startDate})</h3>
              {reservations.filter((r) => r.check_out_date === startDate).length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm font-medium">No departures scheduled for {fmtDate(startDate)}.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {reservations.filter((r) => r.check_out_date === startDate).map((r) => (
                    <div key={r.id} className="py-3 flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 font-bold text-xs">
                          {r.room_no}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{r.guest_name}</p>
                          <p className="text-xs text-slate-400">Check-out Today</p>
                        </div>
                      </div>
                      <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-lg text-xs font-bold">Departure Due</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Quick Reservation Modal */}
      {showQuickRes && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Quick Reservation — Room {showQuickRes.roomNo}</h3>
              <button onClick={() => setShowQuickRes(null)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleQuickRes({
                roomNo: showQuickRes.roomNo,
                guestName: fd.get('guestName') as string,
                guestPhone: fd.get('guestPhone') as string,
                checkIn: showQuickRes.date,
                checkOut: addDays(showQuickRes.date, Number(fd.get('nights'))),
                rate: Number(fd.get('rate')),
              });
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
