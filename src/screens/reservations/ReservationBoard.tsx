import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar, List, LogIn, LogOut, Clock, AlertCircle, Plus, X,
  ChevronLeft, ChevronRight, Loader2, Users, Phone, Star, RefreshCw,
  GripVertical, ArrowRight, CheckCircle2, Ban, Filter,
} from 'lucide-react';
import type { RoomChartEntry } from '@/lib/types';
import type { Reservation, ReservationStatus, ReservationAlert } from '@/lib/types-reservations';
import {
  getReservationsForDateRange, getActiveRoomChartEntries, moveReservation, quickReservation,
  getReservationAlerts, bulkCheckIn, bulkCheckOut, bulkCancel,
  checkRoomAvailability, getRoomAvailabilityForDate, type RoomAvailability, extendReservation,
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
  const [extendModalRes, setExtendModalRes] = useState<Reservation | null>(null);
  const [stretchingRes, setStretchingRes] = useState<Reservation | null>(null);
  const [stretchTargetDate, setStretchTargetDate] = useState<string | null>(null);

  const endDate = useMemo(() => addDays(startDate, days - 1), [startDate, days]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, avail, stays, hs] = await Promise.all([
        getReservationsForDateRange(startDate, endDate),
        getRoomAvailabilityForDate(startDate),
        initialView === 'list' ? getActiveRoomChartEntries(startDate) : Promise.resolve([] as RoomChartEntry[]),
        getHotSeasons(),
      ]);
      setReservations(res);
      setInHouseStays(stays);
      setAvailability(avail);
      setHotSeasons(hs);
      const al = await getReservationAlerts(res);
      setAlerts(al);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

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

  const handleDrop = async (e: React.DragEvent, roomNo: string, date: string) => {
    e.preventDefault();
    setDragOverRoom(null);
    if (!draggedRes) return;

    const res = reservations.find((r) => r.id === draggedRes);
    if (!res) return;

    setBusy(true);
    try {
      if (res.room_no === roomNo) {
        if (res.status === 'checked_in' || date >= res.check_in_date) {
          const targetCheckOut = addDays(date, 1);
          if (targetCheckOut > res.check_in_date) {
            await extendReservation({
              reservationId: draggedRes,
              newCheckOut: targetCheckOut,
            });
            await load();
            return;
          }
        }
      }

      if (res.status === 'checked_in') {
        throw new Error('Checked-in guests cannot change room via drag. Use Room Shift or Extend Stay.');
      }

      const newCheckOut = addDays(date, res.nights);
      await moveReservation({
        reservationId: draggedRes,
        newRoomNo: roomNo,
        newCheckIn: date,
        newCheckOut: newCheckOut,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
      setDraggedRes(null);
    }
  };

  const handleExtendRes = async (newCheckOut: string) => {
    if (!extendModalRes) return;
    setBusy(true);
    try {
      await extendReservation({
        reservationId: extendModalRes.id,
        newCheckOut,
      });
      setExtendModalRes(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to extend stay');
    } finally {
      setBusy(false);
    }
  };

  const commitStretch = useCallback(async (res: Reservation, targetDate: string) => {
    const newCheckOut = addDays(targetDate, 1);
    if (newCheckOut <= res.check_in_date || newCheckOut === res.check_out_date) {
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
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-brand-navy-800">Reservation Board</h1>
            <p className="text-xs text-slate-400">{initialView === 'list' ? `${inHouseStays.length} in-house guests` : `${reservations.length} reservations`} · {rooms.length} rooms</p>
          </div>
        </div>
        <button onClick={load} disabled={busy}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-1.5">
          {alerts.slice(0, 5).map((a, i) => (
            <div key={i} className={`text-xs rounded-lg p-2.5 flex items-center gap-2 ${
              a.severity === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
              a.severity === 'warning' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
              'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1">{a.message}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* View mode tabs + date controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
          {(['timeline', 'calendar', 'list', 'arrival', 'departure'] as ViewMode[]).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition capitalize whitespace-nowrap ${view === v ? 'bg-white text-brand-navy-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {v === 'timeline' && <Clock className="w-3 h-3 inline mr-1" />}
              {v === 'calendar' && <Calendar className="w-3 h-3 inline mr-1" />}
              {v === 'list' && <List className="w-3 h-3 inline mr-1" />}
              {v === 'arrival' && <LogIn className="w-3 h-3 inline mr-1" />}
              {v === 'departure' && <LogOut className="w-3 h-3 inline mr-1" />}
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setStartDate(addDays(startDate, -days))} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
            {fmtDate(startDate)} — {fmtDate(endDate)}
          </span>
          <button onClick={() => setStartDate(addDays(startDate, days))} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
            <ChevronRight className="w-4 h-4" />
          </button>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white">
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </div>
      </div>

      {/* Bulk operations bar */}
      {showBulkBar && (
        <div className="bg-brand-navy-700 text-white rounded-xl p-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold">{selected.size} selected</span>
          <div className="flex gap-2 ml-auto">
            <button onClick={handleBulkCheckIn} disabled={busy}
              className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 rounded-lg disabled:opacity-50">
              <LogIn className="w-3 h-3 inline mr-1" /> Bulk Check-in
            </button>
            <button onClick={handleBulkCheckOut} disabled={busy}
              className="px-3 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-600 rounded-lg disabled:opacity-50">
              <LogOut className="w-3 h-3 inline mr-1" /> Bulk Check-out
            </button>
            <button onClick={handleBulkCancel} disabled={busy}
              className="px-3 py-1.5 text-xs font-semibold bg-red-500 hover:bg-red-600 rounded-lg disabled:opacity-50">
              <Ban className="w-3 h-3 inline mr-1" /> Bulk Cancel
            </button>
            <button onClick={() => { setSelected(new Set()); setShowBulkBar(false); }}
              className="px-3 py-1.5 text-xs text-brand-navy-200 hover:text-white">
              Clear
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          {/* Timeline View */}
          {view === 'timeline' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b">
                    <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase sticky left-0 bg-slate-50 z-10 min-w-[100px]">Room</th>
                    {dateColumns.map((d) => {
                      const dt = new Date(d + 'T00:00:00');
                      const isToday = d === new Date().toISOString().slice(0, 10);
                      const isHot = isHotSeasonDate(d, hotSeasons);
                      return (
                        <th key={d} className={`px-2 py-2 text-center font-bold min-w-[80px] ${isHot ? 'bg-rose-50 text-rose-700' : isToday ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}>
                          {dt.toLocaleDateString('en-IN', { weekday: 'short' })}
                          <br />
                          <span className="text-[10px]">{dt.getDate()}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rooms.map((room) => (
                    <tr key={room.room_no} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2 sticky left-0 bg-white z-10 border-r">
                        <p className="font-bold text-brand-navy-700">{room.room_no}</p>
                        <p className="text-[10px] text-slate-400">{room.category}</p>
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
                            className={`px-1 py-1 text-center border-l border-slate-50 cursor-pointer transition relative ${
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
                                className={`group relative rounded-lg px-1.5 py-1 text-left cursor-move transition select-none ${
                                  selected.has(res.id) ? 'ring-2 ring-brand-500' : ''
                                } ${
                                  res.status === 'checked_in'
                                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-200/60'
                                    : 'bg-blue-100 text-blue-800 hover:bg-blue-200 border border-blue-200/60'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-0.5 min-w-0">
                                  <div className="flex items-center gap-0.5 min-w-0 flex-1">
                                    {isStart && <GripVertical className="w-2.5 h-2.5 opacity-50 shrink-0" />}
                                    <p className="font-bold text-[10px] truncate" title={res.guest_name}>
                                      {res.guest_name}
                                    </p>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExtendModalRes(res);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/60 rounded text-[9px] font-extrabold shrink-0 transition text-emerald-900 pr-3"
                                    title="Extend Stay"
                                  >
                                    +Extend
                                  </button>
                                </div>
                                
                                <div className="flex items-center justify-between text-[9px] opacity-75 mt-0.5">
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
                                    className="absolute right-0 top-0 bottom-0 w-3.5 cursor-ew-resize flex items-center justify-center bg-emerald-400/40 hover:bg-emerald-500/80 rounded-r z-20 transition group/handle"
                                    title="Click & Drag cursor right to stretch stay check-out date"
                                  >
                                    <div className="w-1 h-3 bg-emerald-800/80 rounded-full group-hover/handle:bg-white shrink-0" />
                                  </div>
                                )}
                              </div>
                            ) : isStretchPreview ? (
                              <div className="h-6 rounded-lg bg-emerald-200/90 border border-emerald-400 text-emerald-900 text-[9px] font-bold flex items-center justify-center shadow-inner animate-pulse">
                                Release to stretch →
                              </div>
                            ) : (
                              <div className="h-6 flex items-center justify-center text-slate-200 hover:text-brand-400">
                                <Plus className="w-3 h-3 opacity-0 hover:opacity-100" />
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-[11px]">
                  {/* Occupied Row */}
                  <tr className="border-b border-slate-200">
                    <td className="px-3 py-2 sticky left-0 bg-slate-50 z-10 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      Occupied
                    </td>
                    {dateColumns.map((d) => {
                      const occCount = rooms.filter((r) => getResForRoomDate(r.room_no, d)).length;
                      return (
                        <td key={d} className="px-2 py-2 text-center font-bold text-brand-navy-800 border-l border-slate-200">
                          {occCount}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Available Row */}
                  <tr className="border-b border-slate-200">
                    <td className="px-3 py-2 sticky left-0 bg-slate-50 z-10 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      Available
                    </td>
                    {dateColumns.map((d) => {
                      const occCount = rooms.filter((r) => getResForRoomDate(r.room_no, d)).length;
                      const availCount = Math.max(0, rooms.length - occCount);
                      return (
                        <td key={d} className="px-2 py-2 text-center font-bold text-emerald-600 border-l border-slate-200">
                          {availCount}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Occupancy % Row */}
                  <tr className="border-b border-slate-200">
                    <td className="px-3 py-2 sticky left-0 bg-slate-50 z-10 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      Occupancy %
                    </td>
                    {dateColumns.map((d) => {
                      const occCount = rooms.filter((r) => getResForRoomDate(r.room_no, d)).length;
                      const pct = rooms.length > 0 ? Math.round((occCount / rooms.length) * 100) : 0;
                      return (
                        <td key={d} className="px-2 py-2 text-center font-semibold text-slate-600 border-l border-slate-200">
                          {pct}%
                        </td>
                      );
                    })}
                  </tr>
                  {/* Daily Tariff Row */}
                  <tr>
                    <td className="px-3 py-2 sticky left-0 bg-slate-50 z-10 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      Daily Tariff
                    </td>
                    {dateColumns.map((d) => {
                      const rev = rooms.reduce((sum, r) => {
                        const res = getResForRoomDate(r.room_no, d);
                        return sum + (res ? (res.rate || 0) : 0);
                      }, 0);
                      return (
                        <td key={d} className="px-2 py-2 text-center font-bold text-brand-600 border-l border-slate-200">
                          {fmtMoney(rev)}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
              {rooms.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-sm">No rooms configured.</div>
              )}
            </div>
          )}

          {/* Calendar View */}
          {view === 'calendar' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {dateColumns.map((d) => {
                  const dt = new Date(d + 'T00:00:00');
                  const dayRes = reservations.filter((r) =>
                    r.check_in_date === d && (r.status === 'confirmed' || r.status === 'checked_in'),
                  );
                  const isToday = d === new Date().toISOString().slice(0, 10);
                  const isHot = isHotSeasonDate(d, hotSeasons);
                  return (
                    <div key={d} className={`min-h-[60px] rounded-lg border p-1.5 ${isHot ? 'border-rose-300 bg-rose-50' : isToday ? 'border-brand-300 bg-brand-50' : 'border-slate-100'}`}>
                      <p className={`text-xs font-bold ${isHot ? 'text-rose-700' : isToday ? 'text-brand-700' : 'text-slate-600'}`}>{dt.getDate()}</p>
                      {dayRes.slice(0, 3).map((r) => (
                        <div key={r.id} className={`text-[9px] rounded px-1 py-0.5 mt-0.5 truncate ${
                          r.status === 'checked_in' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {r.guest_name} · {r.room_no}
                        </div>
                      ))}
                      {dayRes.length > 3 && <p className="text-[9px] text-slate-400 mt-0.5">+{dayRes.length - 3} more</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* List View */}
          {view === 'list' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              {initialView === 'list' ? (
                inHouseStays.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">No in-house guests for this date.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b text-left text-xs font-bold text-slate-500 uppercase">
                        <th className="px-3 py-2">Guest</th>
                        <th className="px-3 py-2">Room</th>
                        <th className="px-3 py-2">Check-in</th>
                        <th className="px-3 py-2">Check-out</th>
                        <th className="px-3 py-2">Nights</th>
                        <th className="px-3 py-2">Rate</th>
                        <th className="px-3 py-2">Source</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inHouseStays.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-semibold text-brand-navy-700">{entry.guest_name}</td>
                          <td className="px-3 py-2">{entry.room_no}</td>
                          <td className="px-3 py-2 text-slate-600">{fmtDate(entry.arrival ?? entry.report_date)}</td>
                          <td className="px-3 py-2 text-slate-600">{fmtDate(entry.departure ?? entry.report_date)}</td>
                          <td className="px-3 py-2 tabular-nums">{entry.nights}</td>
                          <td className="px-3 py-2 tabular-nums">{fmtMoney(entry.room_rate)}</td>
                          <td className="px-3 py-2 text-slate-600">{entry.source_category}</td>
                          <td className="px-3 py-2"><span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">in house</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : reservations.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">No reservations for this period.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b text-left text-xs font-bold text-slate-500 uppercase">
                      <th className="px-3 py-2"><input type="checkbox" onChange={(e) => {
                        if (e.target.checked) { setSelected(new Set(reservations.map((r) => r.id))); setShowBulkBar(true); }
                        else { setSelected(new Set()); setShowBulkBar(false); }
                      }} /></th>
                      <th className="px-3 py-2">Guest</th>
                      <th className="px-3 py-2">Room</th>
                      <th className="px-3 py-2">Check-in</th>
                      <th className="px-3 py-2">Check-out</th>
                      <th className="px-3 py-2">Nights</th>
                      <th className="px-3 py-2">Rate</th>
                      <th className="px-3 py-2">Source</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reservations.map((r) => (
                      <tr key={r.id} className={`hover:bg-slate-50 ${selected.has(r.id) ? 'bg-brand-50/30' : ''}`}>
                        <td className="px-3 py-2"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                        <td className="px-3 py-2 font-semibold text-brand-navy-700">{r.guest_name}</td>
                        <td className="px-3 py-2">{r.room_no}</td>
                        <td className="px-3 py-2 text-slate-600">{fmtDate(r.check_in_date)}</td>
                        <td className="px-3 py-2 text-slate-600">{fmtDate(r.check_out_date)}</td>
                        <td className="px-3 py-2 tabular-nums">{r.nights}</td>
                        <td className="px-3 py-2 tabular-nums">{fmtMoney(r.rate)}</td>
                        <td className="px-3 py-2 text-slate-600">{r.source_category}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${RESERVATION_STATUS_COLORS[r.status]}`}>
                            {r.status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Arrival View */}
          {view === 'arrival' && (
            <ArrivalDepartureView
              reservations={reservations.filter((r) => r.check_in_date >= startDate && r.check_in_date <= endDate)}
              type="arrival"
              onCheckIn={async (id) => { await bulkCheckIn([id]); await load(); }}
              onCheckOut={async () => {}}
            />
          )}

          {/* Departure View */}
          {view === 'departure' && (
            <ArrivalDepartureView
              reservations={reservations.filter((r) => r.check_out_date >= startDate && r.check_out_date <= endDate)}
              type="departure"
              onCheckIn={async () => {}}
              onCheckOut={async (id) => { await bulkCheckOut([id]); await load(); }}
            />
          )}
        </>
      )}

      {/* Extend Stay Modal */}
      {extendModalRes && (
        <ExtendResModal
          res={extendModalRes}
          onClose={() => setExtendModalRes(null)}
          onSave={handleExtendRes}
          busy={busy}
        />
      )}

      {/* Quick Reservation Modal */}
      {showQuickRes && (
        <QuickResModal
          roomNo={showQuickRes.roomNo}
          defaultDate={showQuickRes.date}
          onClose={() => setShowQuickRes(null)}
          onSave={handleQuickRes}
          busy={busy}
        />
      )}
    </div>
  );
};

// ── Arrival/Departure View ──
const ArrivalDepartureView = ({ reservations, type, onCheckIn, onCheckOut }: {
  reservations: Reservation[];
  type: 'arrival' | 'departure';
  onCheckIn: (id: string) => Promise<void>;
  onCheckOut: (id: string) => Promise<void>;
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...reservations].sort((a, b) =>
    type === 'arrival' ? a.check_in_date.localeCompare(b.check_in_date) : a.check_out_date.localeCompare(b.check_out_date),
  );

  if (sorted.length === 0) {
    return <div className="p-8 text-center text-slate-400 text-sm">No {type}s for this period.</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {sorted.map((r) => {
        const isToday = (type === 'arrival' ? r.check_in_date : r.check_out_date) === today;
        return (
          <div key={r.id} className={`bg-white rounded-xl border shadow-sm p-4 ${isToday ? 'border-brand-300 ring-1 ring-brand-200' : 'border-slate-200'}`}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-bold text-brand-navy-800">{r.guest_name}</p>
                <p className="text-xs text-slate-400">Room {r.room_no}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${RESERVATION_STATUS_COLORS[r.status]}`}>
                {r.status.replace('_', ' ')}
              </span>
            </div>
            <div className="space-y-1 text-xs text-slate-600">
              <p className="flex items-center gap-1.5">
                <LogIn className="w-3 h-3 text-slate-400" /> {fmtDate(r.check_in_date)}
              </p>
              <p className="flex items-center gap-1.5">
                <LogOut className="w-3 h-3 text-slate-400" /> {fmtDate(r.check_out_date)}
              </p>
              <p className="flex items-center gap-1.5">
                <Phone className="w-3 h-3 text-slate-400" /> {r.guest_phone || '—'}
              </p>
              <p className="flex items-center gap-1.5">
                <Users className="w-3 h-3 text-slate-400" /> {r.adults} adults, {r.children} children
              </p>
              <p className="flex items-center gap-1.5 font-semibold text-slate-700">
                {fmtMoney(r.rate)}/night · {r.nights} nights
              </p>
            </div>
            {type === 'arrival' && r.status === 'confirmed' && (
              <button onClick={() => onCheckIn(r.id)}
                className="w-full mt-3 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg">
                <LogIn className="w-3 h-3 inline mr-1" /> Check In
              </button>
            )}
            {type === 'departure' && r.status === 'checked_in' && (
              <button onClick={() => onCheckOut(r.id)}
                className="w-full mt-3 px-3 py-1.5 text-xs font-semibold text-white bg-sky-500 hover:bg-sky-600 rounded-lg">
                <LogOut className="w-3 h-3 inline mr-1" /> Check Out
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── Quick Reservation Modal ──
const QuickResModal = ({ roomNo, defaultDate, onClose, onSave, busy }: {
  roomNo: string;
  defaultDate: string;
  onClose: () => void;
  onSave: (params: { roomNo: string; guestName: string; guestPhone?: string; checkIn: string; checkOut: string; rate: number }) => Promise<void>;
  busy: boolean;
}) => {
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [checkIn, setCheckIn] = useState(defaultDate);
  const [checkOut, setCheckOut] = useState(addDays(defaultDate, 1));
  const [rate, setRate] = useState(0);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-navy-800">Quick Reservation · Room {roomNo}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Guest Name *</label>
            <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Mobile</label>
            <input type="text" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Check-in</label>
              <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Check-out</label>
              <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Rate (₹/night)</label>
            <input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-200 flex gap-2">
          <button onClick={() => onSave({ roomNo, guestName, guestPhone: guestPhone || undefined, checkIn, checkOut, rate })}
            disabled={busy || !guestName.trim()}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl disabled:opacity-50">
            {busy ? 'Saving…' : 'Create Reservation'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-200 rounded-xl">Cancel</button>
        </div>
      </div>
    </div>
  );
};

// ── Extend Reservation Modal ──
const ExtendResModal = ({ res, onClose, onSave, busy }: {
  res: Reservation;
  onClose: () => void;
  onSave: (newCheckOut: string) => Promise<void>;
  busy: boolean;
}) => {
  const [newCheckOut, setNewCheckOut] = useState(res.check_out_date);

  const addNights = (n: number) => {
    setNewCheckOut(addDays(res.check_out_date, n));
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-brand-navy-800">Extend Stay · Room {res.room_no}</h2>
            <p className="text-xs text-slate-500">{res.guest_name}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs space-y-1">
            <p className="text-slate-600"><span className="font-semibold text-slate-700">Check-in:</span> {fmtDate(res.check_in_date)}</p>
            <p className="text-slate-600"><span className="font-semibold text-slate-700">Current Check-out:</span> {fmtDate(res.check_out_date)} ({res.nights} Nights)</p>
            <p className="text-slate-600"><span className="font-semibold text-slate-700">Status:</span> <span className="capitalize font-medium text-emerald-700">{res.status.replace('_', ' ')}</span></p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Quick Add Nights</label>
            <div className="flex gap-2">
              {[1, 2, 3, 7].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => addNights(num)}
                  className="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 hover:border-brand-500 hover:bg-brand-50 text-slate-700 transition"
                >
                  +{num} Day{num > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">New Check-out Date *</label>
            <input
              type="date"
              value={newCheckOut}
              onChange={(e) => setNewCheckOut(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-200 flex gap-2">
          <button
            onClick={() => onSave(newCheckOut)}
            disabled={busy || newCheckOut <= res.check_in_date}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50 transition"
          >
            {busy ? 'Extending…' : 'Confirm Extension'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
        </div>
      </div>
    </div>
  );
};
