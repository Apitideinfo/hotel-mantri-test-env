import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar, CheckCircle2, AlertTriangle, AlertCircle,
  RotateCw, ArrowRight, Loader2, BedDouble, Plus, Minus,
  Shield, XCircle, Info, Lock, Layers
} from 'lucide-react';
import type { ChannelConnection, ChannelRateMapping } from '@/lib/api-channel';
import type { RoomCategory } from '@/lib/types';
import { pushInventoryToChannels, getInventoryMatrix, type OtaPushResult } from '@/lib/api-channel';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface OwnerInventoryPushTabProps {
  categories: RoomCategory[];
  connections: ChannelConnection[];
  mappings: ChannelRateMapping[];
  onRefresh: () => void;
  onBulkUpdate?: () => void;
  totalRegisteredRooms?: number;
  unassignedRooms?: Array<{ id: string; room_no: string; category_id: string | null; reason: string }>;
  onNavigate?: (screen: string) => void;
}

type RangePreset = 'today' | '7days' | '30days' | 'custom';

export const OwnerInventoryPushTab: React.FC<OwnerInventoryPushTabProps> = ({
  categories,
  connections,
  mappings,
  onRefresh,
  onBulkUpdate,
  totalRegisteredRooms,
  unassignedRooms,
  onNavigate
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const addDays = (d: string, n: number) => {
    const dt = new Date(d);
    dt.setDate(dt.getDate() + n);
    return dt.toISOString().slice(0, 10);
  };

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [rangePreset, setRangePreset] = useState<RangePreset>('7days');
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(addDays(todayStr, 6));

  // Inventory Matrix State
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [matrixData, setMatrixData] = useState<any[]>([]);

  // Manual Adjustments map: { `${catId}_${date}`: { delta: number, stopSell: boolean } }
  const [adjustments, setAdjustments] = useState<Record<string, { delta: number; stopSell: boolean }>>({});

  // Reset adjustments whenever date range or category selection changes to avoid stale overrides
  useEffect(() => {
    setAdjustments({});
  }, [startDate, endDate, selectedCategoryId]);

  // Target Channels Selection
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(() => {
    return new Set(connections.filter((c) => c.is_enabled !== false).map((c) => c.id));
  });

  // Push Action State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [pushResults, setPushResults] = useState<{
    success: boolean;
    summary: { total: number; succeeded: number; failed: number; skipped: number };
    perOtaResults: OtaPushResult[];
  } | null>(null);

  // Generate date array
  const dateList = useMemo(() => {
    const dates: string[] = [];
    let cur = new Date(startDate);
    const end = new Date(endDate);
    while (cur <= end && dates.length < 31) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }, [startDate, endDate]);

  const applyPreset = (preset: RangePreset) => {
    setRangePreset(preset);
    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7days') {
      setStartDate(todayStr);
      setEndDate(addDays(todayStr, 6));
    } else if (preset === '30days') {
      setStartDate(todayStr);
      setEndDate(addDays(todayStr, 29));
    }
  };

  // Fetch Authoritative Matrix
  useEffect(() => {
    let active = true;
    const fetchMatrix = async () => {
      setLoadingMatrix(true);
      try {
        const res: any = await getInventoryMatrix(startDate, endDate);
        if (active && res && Array.isArray(res.matrix)) {
          setMatrixData(res.matrix);
        }
      } catch (err) {
        console.warn('[OwnerInventoryPushTab] Failed to fetch matrix:', err);
      } finally {
        if (active) setLoadingMatrix(false);
      }
    };
    fetchMatrix();
    return () => { active = false; };
  }, [startDate, endDate]);

  // Channel Mapping Eligibility Helper
  const getChannelMappingStatus = (channelId: string) => {
    const channel = connections.find((c) => c.id === channelId);
    if (!channel || channel.is_enabled === false) return { eligible: false, reason: 'Channel disabled by Admin' };

    const channelMappings = mappings.filter(
      (m) => m.channel_connection_id === channelId || (!m.channel_connection_id && channel.channel_type === 'agoda')
    );
    if (selectedCategoryId === 'all') {
      const hasAnyMapping = channelMappings.some((m) => m.room_category_id);
      return hasAnyMapping ? { eligible: true } : { eligible: false, reason: 'No mapped rooms — contact Super Admin' };
    }
    const hasCategoryMapping = channelMappings.some((m) => m.room_category_id === selectedCategoryId);
    if (!hasCategoryMapping) {
      return { eligible: false, reason: 'Room type not mapped — contact Super Admin' };
    }
    return { eligible: true };
  };

  const handleAdjustDelta = (catId: string, date: string, diff: number, baseAvail: number, physical: number) => {
    const key = `${catId}_${date}`;
    setAdjustments(prev => {
      const cur = prev[key] || { delta: 0, stopSell: false };
      const nextDelta = cur.delta + diff;
      const targetAvail = baseAvail + nextDelta;
      // Invariant: net sellable availability can never be negative or exceed physical capacity
      if (targetAvail < 0 || targetAvail > physical) {
        return prev;
      }
      return {
        ...prev,
        [key]: { ...cur, delta: nextDelta }
      };
    });
  };

  const handleToggleStopSell = (catId: string, date: string) => {
    const key = `${catId}_${date}`;
    setAdjustments(prev => {
      const cur = prev[key] || { delta: 0, stopSell: false };
      return {
        ...prev,
        [key]: { ...cur, stopSell: !cur.stopSell }
      };
    });
  };

  // Execute Inventory Push
  const handleExecutePush = async () => {
    setShowConfirmModal(false);
    setIsPushing(true);
    setPushResults(null);

    try {
      const channelIds = Array.from(selectedChannelIds);
      const res = await pushInventoryToChannels({
        startDate,
        endDate,
        channelIds,
        roomCategoryId: selectedCategoryId !== 'all' ? selectedCategoryId : undefined,
        adjustments
      });

      setPushResults({
        success: res.success,
        summary: res.summary,
        perOtaResults: res.perOtaResults
      });
      onRefresh();
    } catch (err: any) {
      setPushResults({
        success: false,
        summary: { total: 1, succeeded: 0, failed: 1, skipped: 0 },
        perOtaResults: [
          {
            channelId: 'all',
            channelName: 'Channel Manager',
            channelType: 'all',
            status: 'failed',
            message: err?.message || 'Failed to push inventory to channels',
            durationMs: 0,
            datesCount: 0
          }
        ]
      });
    } finally {
      setIsPushing(false);
    }
  };

  const totalPhysicalRooms = totalRegisteredRooms !== undefined
    ? totalRegisteredRooms
    : categories.reduce((sum, c) => sum + (c.room_count ?? (c as any).total_rooms ?? 0), 0);

  // If property has no room categories or registered physical rooms, show clean empty state
  if (categories.length === 0 || totalPhysicalRooms === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center max-w-xl mx-auto my-8 shadow-xs space-y-4">
        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto text-amber-600">
          <BedDouble className="w-7 h-7" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-base font-extrabold text-slate-900">No Physical Rooms Configured</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            {categories.length === 0
              ? 'This property has no room categories defined yet. To manage channel inventory and push availability to OTAs, first set up your room categories and physical rooms in Property Master.'
              : 'Room categories exist but 0 physical rooms are currently registered. Channel Manager only distributes real, registered inventory. Please add your physical rooms in Property Master.'}
          </p>
        </div>
        {onNavigate && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => onNavigate('property_master')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
            >
              Configure Rooms in Property Master
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  }

  const displayedCategories = selectedCategoryId === 'all'
    ? categories
    : categories.filter((c) => c.id === selectedCategoryId);

  return (
    <div className="space-y-6">
      {/* Validation Warning Banner for Unassigned Rooms */}
      {unassignedRooms && unassignedRooms.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-900 shadow-2xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <div className="font-extrabold flex items-center gap-2 text-amber-950">
              Validation Warning: {unassignedRooms.length} Registered Room{unassignedRooms.length > 1 ? 's' : ''} Missing Category Assignment
            </div>
            <p className="text-amber-800 leading-relaxed">
              The following active physical room{unassignedRooms.length > 1 ? 's are' : ' is'} not assigned to any valid room category:{' '}
              <span className="font-mono font-bold text-amber-950">
                {unassignedRooms.map((r) => r.room_no).join(', ')}
              </span>
              . These rooms are excluded from category availability and cannot be pushed to OTA channels until categorized in Property Master.
            </p>
          </div>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('property_master')}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] shrink-0 transition cursor-pointer"
            >
              Fix in Property Master
            </button>
          )}
        </div>
      )}

      {/* Inventory Push Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <BedDouble className="w-5 h-5 text-amber-600" />
              Push Room Inventory to OTAs
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Review authoritative room availability matrix, apply quick overrides or stop-sells, and push live counts to connected OTAs. Total physical capacity: {totalPhysicalRooms} rooms.
            </p>
          </div>
          {onBulkUpdate && (
            <button
              type="button"
              onClick={onBulkUpdate}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs rounded-xl shadow-sm hover:shadow transition-all active:scale-[0.98] cursor-pointer self-start sm:self-auto"
            >
              <Layers className="w-4 h-4" />
              Bulk Update Rates & Inventory
            </button>
          )}
        </div>

        {/* 1. Category & Date Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Room Category
            </label>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            >
              <option value="all">
                All Room Categories ({categories.length} total, {totalPhysicalRooms} physical rooms)
              </option>
              {categories.map((c) => {
                const count = c.room_count ?? (c as any).total_rooms ?? 0;
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} ({count} registered {count === 1 ? 'room' : 'rooms'})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">Date Range</label>
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => applyPreset('today')}
                  className={`px-2.5 py-0.5 rounded-lg font-bold transition cursor-pointer ${
                    rangePreset === 'today' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('7days')}
                  className={`px-2.5 py-0.5 rounded-lg font-bold transition cursor-pointer ${
                    rangePreset === '7days' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  7 Days
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('30days')}
                  className={`px-2.5 py-0.5 rounded-lg font-bold transition cursor-pointer ${
                    rangePreset === '30days' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  30 Days
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setRangePreset('custom');
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
              />
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setRangePreset('custom');
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* 2. Available Rooms Matrix / Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
              Room Availability Matrix ({dateList.length} dates)
            </h4>
            <span className="text-[11px] text-slate-400 font-semibold">
              Net Available = Total Physical Rooms - Booked - Blocked + Overrides
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600">
                  <th className="p-3 font-extrabold min-w-[160px] sticky left-0 bg-slate-50/95 z-10 border-r border-slate-200">
                    Category
                  </th>
                  {dateList.map((d) => (
                    <th key={d} className="p-2.5 font-bold text-center min-w-[85px] border-r border-slate-200 last:border-r-0">
                      <div className="text-[11px] font-extrabold text-slate-800">
                        {new Date(d).toLocaleDateString('en-IN', { weekday: 'short' })}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedCategories.map((cat) => {
                  const physical = cat.room_count ?? (cat as any).total_rooms ?? 0;

                  return (
                    <tr key={cat.id} className="hover:bg-slate-50/50 transition">
                      <td className="p-3 font-extrabold text-slate-800 sticky left-0 bg-white z-10 border-r border-slate-200">
                        <div>{cat.name}</div>
                        <span className="text-[10px] font-semibold text-slate-400">Total Capacity: {physical}</span>
                      </td>

                      {dateList.map((d) => {
                        const adjKey = `${cat.id}_${d}`;
                        const adj = adjustments[adjKey] || { delta: 0, stopSell: false };
                        const m = matrixData.find((item: any) => item.room_category_id === cat.id && item.date === d);
                        const baseAvailable = m ? Number(m.available) : Math.max(0, physical);
                        const isStopSell = adj.stopSell || Boolean(m?.stop_sell);
                        const netAvail = isStopSell ? 0 : Math.max(0, Math.min(physical, baseAvailable + adj.delta));

                        return (
                          <td
                            key={d}
                            className={`p-2 text-center border-r border-slate-100 last:border-r-0 transition ${
                              isStopSell
                                ? 'bg-red-50/50 text-red-700'
                                : netAvail === 0
                                ? 'bg-amber-50/40 text-amber-800'
                                : 'text-slate-800'
                            }`}
                          >
                            <div className="font-extrabold text-sm mb-1">
                              {isStopSell ? 'CLOSED' : netAvail}
                            </div>

                            {/* Micro Controls */}
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleAdjustDelta(cat.id, d, -1, baseAvailable, physical)}
                                disabled={netAvail <= 0 || physical === 0}
                                className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Decrease availability"
                              >
                                <Minus className="w-2.5 h-2.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAdjustDelta(cat.id, d, 1, baseAvailable, physical)}
                                disabled={netAvail >= physical || physical === 0}
                                className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Increase availability"
                              >
                                <Plus className="w-2.5 h-2.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleStopSell(cat.id, d)}
                                className={`px-1 py-0.5 rounded text-[9px] font-extrabold uppercase transition cursor-pointer ${
                                  isStopSell ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-700'
                                }`}
                                title="Toggle Stop-Sell"
                              >
                                {isStopSell ? 'Stop' : 'Open'}
                              </button>
                            </div>
                            {m && (m.occupied > 0 || m.blocked > 0) && (
                              <div className="text-[9px] text-slate-400 mt-1 font-mono">
                                {m.occupied > 0 ? `${m.occupied} bkd` : ''} {m.blocked > 0 ? `${m.blocked} blk` : ''}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3. Target Channels Checklist */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-700 block">
            Target Channels for Push ({selectedChannelIds.size} selected)
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {connections.map((ch) => {
              const status = getChannelMappingStatus(ch.id);
              const isChecked = selectedChannelIds.has(ch.id);

              return (
                <div
                  key={ch.id}
                  className={`p-3 rounded-xl border flex items-start gap-3 transition ${
                    !status.eligible
                      ? 'bg-slate-50 border-slate-200 opacity-60'
                      : isChecked
                      ? 'bg-amber-50/30 border-amber-300'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    id={`inv-ch-${ch.id}`}
                    disabled={!status.eligible}
                    checked={isChecked && status.eligible}
                    onChange={(e) => {
                      const next = new Set(selectedChannelIds);
                      if (e.target.checked) next.add(ch.id);
                      else next.delete(ch.id);
                      setSelectedChannelIds(next);
                    }}
                    className="w-4 h-4 mt-0.5 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                  />
                  <div className="flex-1 text-xs">
                    <label htmlFor={`inv-ch-${ch.id}`} className="font-extrabold text-slate-800 block cursor-pointer">
                      {ch.channel_name || ch.channel_type}
                    </label>
                    {status.eligible ? (
                      <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="w-3 h-3" /> Mapped & Ready
                      </span>
                    ) : (
                      <span className="text-[11px] text-amber-700 font-semibold flex items-center gap-1 mt-0.5" title={status.reason}>
                        <AlertCircle className="w-3 h-3" /> {status.reason}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. Action Button */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setShowConfirmModal(true)}
            disabled={isPushing || selectedChannelIds.size === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition cursor-pointer disabled:opacity-50"
          >
            {isPushing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Pushing Inventory to OTAs...</span>
              </>
            ) : (
              <>
                <ArrowRight className="w-4 h-4" />
                <span>Push Inventory to OTAs</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Push Results Breakdown Banner */}
      {pushResults && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              {pushResults.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600" />
              )}
              Inventory Push Execution Results
            </h3>
            <span className="text-xs text-slate-500 font-semibold">
              {pushResults.summary?.succeeded ?? 0} Succeeded · {pushResults.summary?.failed ?? 0} Failed · {pushResults.summary?.skipped ?? 0} Skipped
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {pushResults.perOtaResults.map((res, i) => (
              <div
                key={i}
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                  res.status === 'success'
                    ? 'bg-emerald-50/40 border-emerald-200 text-emerald-900'
                    : res.status === 'skipped'
                    ? 'bg-amber-50/40 border-amber-200 text-amber-900'
                    : 'bg-red-50/40 border-red-200 text-red-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  {res.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : res.status === 'skipped' ? (
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <div>
                    <span className="font-extrabold">{res.channelName}:</span>{' '}
                    <span>{res.message}</span>
                  </div>
                </div>

                <div className="text-right text-[11px] font-mono text-slate-500 shrink-0">
                  {res.durationMs > 0 && <span>{res.durationMs}ms</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <ConfirmModal
          open={showConfirmModal}
          title="Confirm Inventory Push"
          message={`Are you sure you want to push room availability across ${selectedChannelIds.size} channel(s) for ${dateList.length} dates (${startDate} to ${endDate})?`}
          confirmText="Yes, Push Inventory"
          cancelText="Cancel"
          variant="primary"
          onConfirm={handleExecutePush}
          onClose={() => setShowConfirmModal(false)}
        />
      )}
    </div>
  );
};
