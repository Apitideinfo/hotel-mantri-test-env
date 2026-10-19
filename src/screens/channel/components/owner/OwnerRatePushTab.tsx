import React, { useState, useMemo } from 'react';
import {
  Tag, Calendar, CheckCircle2, AlertTriangle, AlertCircle,
  RotateCw, ArrowRight, Loader2, DollarSign, Shield, XCircle, Info
} from 'lucide-react';
import type { ChannelConnection, ChannelRateMapping } from '@/lib/api-channel';
import type { RoomCategory } from '@/lib/types';
import type { RatePlan } from '@/lib/types-reservations';
import { pushRatesToChannels, type OtaPushResult } from '@/lib/api-channel';
import { fmtMoney, toNum } from '@/lib/calc';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface OwnerRatePushTabProps {
  categories: RoomCategory[];
  ratePlans: RatePlan[];
  connections: ChannelConnection[];
  mappings: ChannelRateMapping[];
  onRefresh: () => void;
}

type RangePreset = 'today' | '7days' | '30days' | 'custom';

export const OwnerRatePushTab: React.FC<OwnerRatePushTabProps> = ({
  categories,
  ratePlans,
  connections,
  mappings,
  onRefresh
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const addDays = (d: string, n: number) => {
    const dt = new Date(d);
    dt.setDate(dt.getDate() + n);
    return dt.toISOString().slice(0, 10);
  };

  // Form State
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(categories[0]?.id || '');
  const [selectedRatePlanId, setSelectedRatePlanId] = useState<string>('');
  const [rangePreset, setRangePreset] = useState<RangePreset>('7days');
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(addDays(todayStr, 6));

  // Current / Override Rates State
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const filteredPlans = ratePlans.filter(
    (p) => !(p as any).room_category_id || (p as any).room_category_id === selectedCategoryId
  );
  const selectedPlan = ratePlans.find((p) => p.id === selectedRatePlanId) || filteredPlans[0];

  const defaultBaseRate = selectedPlan?.base_rate ?? (selectedCategory ? (selectedCategory as any).base_price ?? 2500 : 2500);
  const [overrideRate, setOverrideRate] = useState<number>(defaultBaseRate);
  const [minNights, setMinNights] = useState<number>(1);
  const [stopSell, setStopSell] = useState<boolean>(false);

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

  // Quick Presets
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

  // Channel Mapping Eligibility Helper
  const getChannelMappingStatus = (channelId: string) => {
    const channel = connections.find((c) => c.id === channelId);
    if (!channel || channel.is_enabled === false) return { eligible: false, reason: 'Channel disabled by Admin' };

    const channelMappings = mappings.filter(
      (m) => m.channel_connection_id === channelId || (!m.channel_connection_id && channel.channel_type === 'agoda')
    );
    const hasCategoryMapping = channelMappings.some((m) => m.room_category_id === selectedCategoryId);
    if (!hasCategoryMapping) {
      return { eligible: false, reason: 'Room type not mapped — contact Super Admin' };
    }
    return { eligible: true };
  };

  // Rate threshold warnings
  const rateWarning = useMemo(() => {
    if (overrideRate < 500) return 'Notice: Rate is unusually low (below ₹500/night).';
    if (overrideRate > 100000) return 'Warning: Rate exceeds standard maximum (₹1,00,000/night).';
    return null;
  }, [overrideRate]);

  // Execute Rate Push
  const handleExecutePush = async () => {
    setShowConfirmModal(false);
    setIsPushing(true);
    setPushResults(null);

    try {
      const channelIds = Array.from(selectedChannelIds);
      const res = await pushRatesToChannels({
        startDate,
        endDate,
        channelIds,
        rateOverrides: [
          {
            room_category_id: selectedCategoryId,
            rate_plan_id: selectedRatePlanId || selectedPlan?.id,
            base_rate: overrideRate,
            min_nights: minNights,
            stop_sell: stopSell
          }
        ]
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
            message: err?.message || 'Failed to push rates to channels',
            durationMs: 0,
            datesCount: 0
          }
        ]
      });
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Rate Push Configuration Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Tag className="w-5 h-5 text-amber-600" />
            Push Hotel Rates to OTAs
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Select room type, rate plan, and dates to update pricing across all authorized channels in real-time.
          </p>
        </div>

        {/* 1. Room Category & Rate Plan Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Room Category <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedCategoryId}
              onChange={(e) => {
                setSelectedCategoryId(e.target.value);
                const nextPlans = ratePlans.filter(p => !(p as any).room_category_id || (p as any).room_category_id === e.target.value);
                if (nextPlans[0]) setSelectedRatePlanId(nextPlans[0].id);
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({(c as any).total_rooms || 0} rooms)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Rate Plan
            </label>
            <select
              value={selectedRatePlanId || selectedPlan?.id || ''}
              onChange={(e) => setSelectedRatePlanId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            >
              {filteredPlans.length > 0 ? (
                filteredPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.plan_name} (Base ₹{fmtMoney(p.base_rate || 0)})
                  </option>
                ))
              ) : (
                <option value="">Standard Best Available Rate</option>
              )}
            </select>
          </div>
        </div>

        {/* 2. Date Range Picker with Quick Presets */}
        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-bold text-slate-700">Date Range</label>
            <div className="flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => applyPreset('today')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  rangePreset === 'today' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => applyPreset('7days')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  rangePreset === '7days' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Next 7 Days
              </button>
              <button
                type="button"
                onClick={() => applyPreset('30days')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  rangePreset === '30days' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Next 30 Days
              </button>
              <button
                type="button"
                onClick={() => setRangePreset('custom')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  rangePreset === 'custom' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Custom Range
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 block mb-1">Start Date:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setRangePreset('custom');
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 block mb-1">End Date:</span>
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

        {/* 3. Rate Values & Threshold Validation */}
        <div className="p-4 bg-amber-50/40 border border-amber-200 rounded-xl space-y-3">
          <h4 className="text-xs font-extrabold text-amber-950 uppercase tracking-wider">
            Rate Overrides & Controls for Push
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Base Room Rate (₹ per night)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
                <input
                  type="number"
                  min="0"
                  value={overrideRate}
                  onChange={(e) => setOverrideRate(toNum(e.target.value))}
                  className="w-full pl-7 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-extrabold text-slate-900 focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Minimum Stay (Nights)
              </label>
              <input
                type="number"
                min="1"
                value={minNights}
                onChange={(e) => setMinNights(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 p-2.5 bg-white border border-slate-300 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={stopSell}
                  onChange={(e) => setStopSell(e.target.checked)}
                  className="w-4 h-4 rounded text-red-600 focus:ring-red-500 border-slate-300"
                />
                <span className="text-xs font-bold text-red-700">Stop Sell (Close to Booking)</span>
              </label>
            </div>
          </div>

          {rateWarning && (
            <div className="p-2.5 rounded-lg bg-amber-100/70 border border-amber-300 text-amber-900 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>{rateWarning}</span>
            </div>
          )}
        </div>

        {/* 4. Target Channels Checklist */}
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
                    id={`ch-${ch.id}`}
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
                    <label htmlFor={`ch-${ch.id}`} className="font-extrabold text-slate-800 block cursor-pointer">
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

        {/* 5. Push Action Button */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setShowConfirmModal(true)}
            disabled={isPushing || selectedChannelIds.size === 0 || !selectedCategoryId}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition cursor-pointer disabled:opacity-50"
          >
            {isPushing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Pushing Rates to OTAs...</span>
              </>
            ) : (
              <>
                <ArrowRight className="w-4 h-4" />
                <span>Push Rates to OTAs</span>
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
              Rate Push Execution Results
            </h3>
            <span className="text-xs text-slate-500 font-semibold">
              {pushResults.summary.succeeded} Succeeded · {pushResults.summary.failed} Failed · {pushResults.summary.skipped} Skipped
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
          title="Confirm Rate Push to OTAs"
          message={`Are you sure you want to push rates for ${selectedCategory?.name || 'Selected Room'} across ${selectedChannelIds.size} channel(s) for the period ${startDate} to ${endDate} at ₹${fmtMoney(overrideRate)}/night?`}
          confirmText="Yes, Push Rates"
          cancelText="Cancel"
          variant="primary"
          onConfirm={handleExecutePush}
          onClose={() => setShowConfirmModal(false)}
        />
      )}
    </div>
  );
};
