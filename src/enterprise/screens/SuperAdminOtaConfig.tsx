import React, { useState, useEffect, useCallback } from 'react';
import {
  Radio, Building2, RefreshCw, CheckCircle2, AlertTriangle,
  Clock, ChevronLeft, Plus, Eye, EyeOff, Save, Trash2,
  Shield, Settings, Link2, ExternalLink, Activity, Check,
  X, Copy, Zap, Info, Lock, Play, Pause, Power, Loader2,
  Tag, BedDouble, ArrowRight, History, KeyRound
} from 'lucide-react';
import type { EnterpriseHotel } from '../types';
import {
  getChannelManagerOverview,
  saveChannelSettings,
  addChannel,
  updateChannel,
  deleteChannel,
  fetchChannelMappings,
  saveChannelMappings,
  testChannelConnectionDirect,
  fetchMappingValidation,
  fetchChannelAuditHistory,
  getExtranetCodes,
  CHANNEL_TYPES,
  getChannelMetadata,
  type ChannelConnection,
  type ChannelSettings as ChannelSettingsType,
  type ChannelRateMapping,
  type ChannelManagerOverview,
  type HotelExtranetCode
} from '@/lib/api-channel';
import type { RoomCategory } from '@/lib/types';
import type { RatePlan } from '@/lib/types-reservations';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface SuperAdminOtaConfigProps {
  hotel: EnterpriseHotel;
  allHotels: EnterpriseHotel[];
  onSelectHotel: (hotelId: string) => void;
  onBackToProperties: () => void;
}

export const SuperAdminOtaConfig: React.FC<SuperAdminOtaConfigProps> = ({
  hotel,
  allHotels,
  onSelectHotel,
  onBackToProperties
}) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<ChannelManagerOverview | null>(null);
  const [extranetCodes, setExtranetCodes] = useState<HotelExtranetCode[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Master Provider Settings state
  const [masterHotelCode, setMasterHotelCode] = useState('');
  const [masterPartnerId, setMasterPartnerId] = useState('');
  const [masterEnv, setMasterEnv] = useState<'production' | 'sandbox'>('production');
  const [savingMaster, setSavingMaster] = useState(false);
  const [testingMaster, setTestingMaster] = useState(false);
  const [masterTestResult, setMasterTestResult] = useState<{
    success: boolean;
    latencyMs?: number;
    message?: string;
    details?: any;
  } | null>(null);

  // Modals & Panels
  const [showAddChannelModal, setShowAddChannelModal] = useState(false);
  const [selectedChannelForConfig, setSelectedChannelForConfig] = useState<ChannelConnection | null>(null);
  const [selectedChannelForRoomMap, setSelectedChannelForRoomMap] = useState<ChannelConnection | null>(null);
  const [selectedChannelForRateMap, setSelectedChannelForRateMap] = useState<ChannelConnection | null>(null);
  const [validationResult, setValidationResult] = useState<any | null>(null);
  const [validatingChannelId, setValidatingChannelId] = useState<string | null>(null);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Delete confirmation
  const [channelToDelete, setChannelToDelete] = useState<ChannelConnection | null>(null);
  const [isDeletingChannel, setIsDeletingChannel] = useState(false);

  // Notification Banner
  const [bannerNotice, setBannerNotice] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [data, exCodes] = await Promise.all([
        getChannelManagerOverview(hotel.id),
        getExtranetCodes({ hotelId: hotel.id })
      ]);
      setOverview(data);
      setExtranetCodes(exCodes);
      if (data.settings) {
        setMasterHotelCode(data.settings.aiosell_hotel_code || '');
        setMasterPartnerId(data.settings.aiosell_partner_id || '');
        setMasterEnv((data.settings.environment as any) || 'production');
      } else {
        setMasterHotelCode('');
        setMasterPartnerId('');
        setMasterEnv('production');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load OTA configuration data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hotel.id]);

  useEffect(() => {
    setLoading(true);
    // Explicitly reset form state on hotel switch so previous hotel's data never leaks
    setOverview(null);
    setExtranetCodes([]);
    setMasterHotelCode('');
    setMasterPartnerId('');
    setMasterEnv('production');
    setMasterTestResult(null);
    setBannerNotice(null);
    loadData();
  }, [hotel.id, loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  // Save Master Provider Settings
  const handleSaveMasterSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMaster(true);
    setBannerNotice(null);
    try {
      await saveChannelSettings({
        hotelId: hotel.id,
        aiosell_hotel_code: masterHotelCode.trim() || null,
        aiosell_partner_id: masterPartnerId.trim() || undefined,
        environment: masterEnv
      }, hotel.id);
      setBannerNotice({
        type: 'success',
        message: 'Master channel manager property code saved successfully.'
      });
      await loadData();
    } catch (err: any) {
      setBannerNotice({
        type: 'error',
        message: err?.message || 'Failed to save master settings.'
      });
    } finally {
      setSavingMaster(false);
    }
  };

  // Test Master Connection
  const handleTestMasterConnection = async () => {
    setTestingMaster(true);
    setMasterTestResult(null);
    try {
      const res: any = await testChannelConnectionDirect(hotel.id);
      setMasterTestResult({
        success: res.connected ?? res.success,
        latencyMs: res.latencyMs || res.responseTimeMs,
        message: res.message || (res.connected ? 'Master connection healthy.' : 'Connection check failed.'),
        details: res.details
      });
    } catch (err: any) {
      setMasterTestResult({
        success: false,
        message: err?.message || 'Connection test failed',
        details: err?.details || {
          status: err?.status || 500,
          hotelCode: masterHotelCode,
          partnerId: masterPartnerId,
          environment: masterEnv,
          errorCategory: err?.errorCode || err?.code || 'TEST_FAILED',
          resolutionGuidance: err?.details?.resolutionGuidance
        }
      });
    } finally {
      setTestingMaster(false);
    }
  };

  // Toggle Channel Enabled Status
  const handleToggleChannel = async (channel: ChannelConnection, newStatus: boolean) => {
    try {
      await updateChannel(channel.id, { isEnabled: newStatus }, hotel.id);
      setBannerNotice({
        type: 'success',
        message: `${channel.channel_name || channel.channel_type} ${newStatus ? 'enabled' : 'disabled'} successfully.`
      });
      await loadData();
    } catch (err: any) {
      setBannerNotice({
        type: 'error',
        message: err?.message || 'Failed to update channel status.'
      });
    }
  };

  // Run Mapping Validation for Channel
  const handleValidateChannel = async (channel: ChannelConnection) => {
    setValidatingChannelId(channel.id);
    try {
      const res = await fetchMappingValidation(channel.id, hotel.id);
      setValidationResult({ channelName: channel.channel_name || channel.channel_type, ...res });
    } catch (err: any) {
      setBannerNotice({
        type: 'error',
        message: `Validation error: ${err?.message || 'Failed to validate channel mappings'}`
      });
    } finally {
      setValidatingChannelId(null);
    }
  };

  // Open Audit History
  const handleOpenAuditHistory = async () => {
    setShowAuditModal(true);
    setLoadingAudit(true);
    try {
      const logs = await fetchChannelAuditHistory(hotel.id);
      setAuditLogs(logs);
    } catch (err: any) {
      setBannerNotice({
        type: 'error',
        message: err?.message || 'Failed to load audit logs'
      });
    } finally {
      setLoadingAudit(false);
    }
  };

  // Confirm Delete Channel
  const handleConfirmDelete = async () => {
    if (!channelToDelete) return;
    setIsDeletingChannel(true);
    try {
      await deleteChannel(channelToDelete.id, hotel.id);
      setBannerNotice({
        type: 'success',
        message: `Disconnected ${channelToDelete.channel_name || channelToDelete.channel_type}.`
      });
      setChannelToDelete(null);
      await loadData();
    } catch (err: any) {
      setBannerNotice({
        type: 'error',
        message: err?.message || 'Failed to delete channel.'
      });
    } finally {
      setIsDeletingChannel(false);
    }
  };

  if (loading && !overview) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
        <p className="text-sm font-semibold text-slate-500">Loading Super Admin OTA configuration...</p>
      </div>
    );
  }

  const connections = overview?.connections || [];
  const categories = overview?.categories || [];
  const ratePlans = overview?.ratePlans || [];
  const mappings = overview?.mappings || [];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
      {/* 1. Header & Property Switcher Bar */}
      <div className="bg-gradient-to-r from-amber-100/90 via-amber-50/70 to-white border-2 border-amber-300/80 text-slate-900 rounded-2xl p-4.5 shadow-card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToProperties}
            className="px-3.5 py-2 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white hover:from-amber-600 hover:to-amber-800 border border-amber-400/40 rounded-xl transition shadow-gold-glow flex items-center gap-1.5 text-xs font-extrabold cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4 text-white" /> All Properties
          </button>

          <div className="h-6 w-px bg-amber-300/70 hidden sm:block" />

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-amber-950">{hotel.hotel_name}</h2>
              {hotel.property_code && (
                <span className="text-[10px] font-mono bg-gradient-to-r from-amber-500 to-amber-600 text-white px-2.5 py-0.5 rounded-full font-extrabold shadow-xs">
                  {hotel.property_code}
                </span>
              )}
              <span className="text-[10px] uppercase font-black bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                <Shield className="w-3 h-3" /> Super Admin Control
              </span>
            </div>
            <p className="text-xs font-semibold text-amber-800/80">
              {hotel.city}, {hotel.state} · Owner: <span className="font-extrabold text-slate-900">{hotel.owner_name}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          {/* Quick Switch Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-900 font-extrabold hidden md:inline">Switch Property:</span>
            <select
              value={hotel.id}
              onChange={(e) => onSelectHotel(e.target.value)}
              className="bg-amber-50/80 text-slate-900 border border-amber-300 text-xs font-bold rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs max-w-[220px]"
            >
              {allHotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.hotel_name} ({h.city})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleOpenAuditHistory}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
            title="View Configuration Audit History"
          >
            <History className="w-4 h-4 text-slate-600" />
            <span className="hidden sm:inline">Audit History</span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {bannerNotice && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 border ${
          bannerNotice.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : bannerNotice.type === 'error'
            ? 'bg-red-50 text-red-800 border-red-200'
            : 'bg-blue-50 text-blue-800 border-blue-200'
        }`}>
          <div className="flex items-center gap-2">
            {bannerNotice.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
            <span>{bannerNotice.message}</span>
          </div>
          <button onClick={() => setBannerNotice(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">
            &times;
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={handleRefresh} className="text-red-700 underline font-bold">Retry</button>
        </div>
      )}

      {/* 2. Master External Property Code & Provider Configuration */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-600" />
              Master Channel Manager & Property Code Configuration
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure master upstream distribution aggregator credentials. Hotel owners cannot see or modify these parameters.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestMasterConnection}
              disabled={testingMaster || !masterHotelCode}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
            >
              <Activity className={`w-3.5 h-3.5 text-slate-600 ${testingMaster ? 'animate-pulse' : ''}`} />
              {testingMaster ? 'Testing...' : 'Test Master Connection'}
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveMasterSettings} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              External Property Code (Aiosell Hotel Code) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={masterHotelCode}
              onChange={(e) => setMasterHotelCode(e.target.value)}
              placeholder="e.g. AIO_HOTEL_1042"
              required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Partner / Aggregator ID
            </label>
            <input
              type="text"
              value={masterPartnerId}
              onChange={(e) => setMasterPartnerId(e.target.value)}
              placeholder="e.g. PARTNER_991"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Environment
            </label>
            <select
              value={masterEnv}
              onChange={(e) => setMasterEnv(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            >
              <option value="production">Production (Live)</option>
              <option value="sandbox">Sandbox / Staging</option>
            </select>
          </div>

          <div>
            <button
              type="submit"
              disabled={savingMaster}
              className="w-full py-2 px-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {savingMaster ? 'Saving Settings...' : 'Save Master Config'}
            </button>
          </div>
        </form>

        {masterTestResult && (
          <div className={`p-4 rounded-xl text-xs border ${
            masterTestResult.success ? 'bg-emerald-50/90 text-emerald-800 border-emerald-200' : 'bg-red-50/90 text-red-800 border-red-200'
          }`}>
            <div className="flex items-center gap-2 font-bold">
              {masterTestResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
              <span className="text-sm">{masterTestResult.message}</span>
              {masterTestResult.latencyMs && (
                <span className="text-[11px] text-slate-500 ml-auto font-mono">Latency: {masterTestResult.latencyMs}ms</span>
              )}
            </div>
            {masterTestResult.details && (
              <div className="mt-2 pt-2 border-t border-slate-200/60 font-mono space-y-1 text-[11px]">
                <p>HTTP Status: <span className="font-bold">{masterTestResult.details.status || (masterTestResult.success ? 200 : 403)}</span></p>
                <p>Hotel Code Tested: <span className="font-bold">{masterTestResult.details.hotelCode || masterHotelCode || 'N/A'}</span></p>
                <p>Partner ID: <span>{masterTestResult.details.partnerId || masterPartnerId || 'hotel-mantri-pms'}</span></p>
                <p>Environment: <span>{masterTestResult.details.environment || masterEnv}</span></p>
                {masterTestResult.details.errorCategory && (
                  <p>Category: <span className="font-bold text-red-700">{masterTestResult.details.errorCategory}</span></p>
                )}
                {masterTestResult.details.resolutionGuidance && (
                  <div className="mt-2 p-2.5 rounded-lg bg-white/80 border border-red-200 text-slate-700 font-sans text-xs leading-relaxed">
                    <span className="font-bold text-red-700 block mb-0.5">Resolution Required:</span>
                    {masterTestResult.details.resolutionGuidance}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Configured OTA Channels List */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Radio className="w-5 h-5 text-amber-600" />
              Configured OTA Channels ({connections.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage OTA connections, credentials, room mappings, and rate mappings centrally.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddChannelModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add OTA Channel
          </button>
        </div>

        {connections.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl">
            <Radio className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-700">No OTA Channels Configured</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Add your first OTA channel connection (MakeMyTrip, Goibibo, Booking.com, Agoda, Expedia) to enable distribution for this property.
            </p>
            <button
              onClick={() => setShowAddChannelModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add Channel Now
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connections.map((ch) => {
              const meta = getChannelMetadata(ch.channel_type);
              const isEnabled = ch.is_enabled !== false;
              const channelMappings = mappings.filter(
                (m) => m.channel_connection_id === ch.id || (!m.channel_connection_id && ch.channel_type === 'agoda')
              );
              const mappedCategoryIds = new Set(channelMappings.filter((m) => m.room_category_id).map((m) => m.room_category_id));
              const mappedRatePlanIds = new Set(channelMappings.filter((m) => m.rate_plan_id).map((m) => m.rate_plan_id));

              return (
                <div
                  key={ch.id}
                  className={`border-2 rounded-2xl p-5 flex flex-col justify-between transition-all space-y-4 ${
                    !isEnabled
                      ? 'bg-slate-50/70 border-slate-200 opacity-90'
                      : ch.status === 'connected'
                      ? 'bg-white border-emerald-200/80 shadow-xs hover:border-emerald-400'
                      : ch.status === 'error'
                      ? 'bg-red-50/20 border-red-200 shadow-xs'
                      : 'bg-white border-amber-200/80 shadow-xs hover:border-amber-400'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center font-bold text-amber-800 text-sm shadow-xs">
                          {(ch.channel_name || ch.channel_type).slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-sm font-extrabold text-slate-900">
                            {ch.channel_name || meta.label}
                          </h4>
                          {(() => {
                            const savedExtranet = extranetCodes.find((e) => e.ota_type === ch.channel_type);
                            return (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <KeyRound className="w-3 h-3 text-amber-600 shrink-0" />
                                {savedExtranet?.extranet_property_code ? (
                                  <span className="text-[11px] font-mono font-bold text-amber-950 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                    Extranet ID: {savedExtranet.extranet_property_code}
                                  </span>
                                ) : ch.external_channel_id ? (
                                  <span className="text-[11px] font-mono font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                    ID: {ch.external_channel_id}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold text-amber-800 bg-amber-50/70 px-1.5 py-0.5 rounded border border-amber-200">
                                    No extranet code saved
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Enable/Disable Toggle */}
                      <div className="flex items-center gap-1.5" title={isEnabled ? 'Channel is active' : 'Disabled by Admin'}>
                        <button
                          type="button"
                          onClick={() => handleToggleChannel(ch, !isEnabled)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              isEnabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Status & Indicators */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <span className="text-slate-400 block font-semibold">Status:</span>
                        <span className={`font-bold capitalize ${
                          !isEnabled
                            ? 'text-slate-500'
                            : ch.status === 'connected'
                            ? 'text-emerald-700'
                            : ch.status === 'error'
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }`}>
                          {!isEnabled ? 'Disabled by Admin' : ch.status || 'Active'}
                        </span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <span className="text-slate-400 block font-semibold">Last Sync:</span>
                        <span className="font-bold text-slate-700">
                          {ch.last_sync_at ? new Date(ch.last_sync_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                        </span>
                      </div>
                    </div>

                    {/* Mappings summary */}
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-semibold flex items-center gap-1">
                          <BedDouble className="w-3.5 h-3.5 text-slate-400" /> Room Mappings:
                        </span>
                        <span className={`font-bold ${mappedCategoryIds.size > 0 ? 'text-emerald-700' : 'text-amber-600'}`}>
                          {mappedCategoryIds.size} / {categories.length} Mapped
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-semibold flex items-center gap-1">
                          <Tag className="w-3.5 h-3.5 text-slate-400" /> Rate Plan Mappings:
                        </span>
                        <span className={`font-bold ${mappedRatePlanIds.size > 0 ? 'text-emerald-700' : 'text-amber-600'}`}>
                          {mappedRatePlanIds.size} / {ratePlans.length} Mapped
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5 text-xs">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedChannelForRoomMap(ch)}
                        className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold rounded-lg transition border border-amber-200 cursor-pointer"
                        title="Map Room Types"
                      >
                        Map Rooms
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedChannelForRateMap(ch)}
                        className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold rounded-lg transition border border-amber-200 cursor-pointer"
                        title="Map Rate Plans"
                      >
                        Map Rates
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleValidateChannel(ch)}
                        disabled={validatingChannelId === ch.id}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition cursor-pointer"
                        title="Validate Mappings"
                      >
                        <Shield className={`w-3.5 h-3.5 ${validatingChannelId === ch.id ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedChannelForConfig(ch)}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition cursor-pointer"
                        title="Configure Credentials & Settings"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setChannelToDelete(ch)}
                        className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition cursor-pointer"
                        title="Disconnect Channel"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Add Channel Modal */}
      {showAddChannelModal && (
        <AddChannelConfigModal
          existingConnections={connections}
          hotelId={hotel.id}
          onClose={() => setShowAddChannelModal(false)}
          onSuccess={async () => {
            setShowAddChannelModal(false);
            setBannerNotice({
              type: 'success',
              message: 'OTA Channel added successfully.'
            });
            await loadData();
          }}
        />
      )}

      {/* 5. Channel Credentials & Settings Modal */}
      {selectedChannelForConfig && (
        <ChannelCredentialsModal
          channel={selectedChannelForConfig}
          hotelId={hotel.id}
          onClose={() => setSelectedChannelForConfig(null)}
          onSuccess={async () => {
            setSelectedChannelForConfig(null);
            setBannerNotice({
              type: 'success',
              message: 'Channel configuration updated successfully.'
            });
            await loadData();
          }}
        />
      )}

      {/* 6. Room Type Mapping Modal */}
      {selectedChannelForRoomMap && (
        <RoomMappingModal
          channel={selectedChannelForRoomMap}
          categories={categories}
          existingMappings={mappings.filter(m => m.channel_connection_id === selectedChannelForRoomMap.id)}
          savedExtranet={extranetCodes.find(e => e.ota_type === selectedChannelForRoomMap.channel_type)}
          hotelId={hotel.id}
          onClose={() => setSelectedChannelForRoomMap(null)}
          onSuccess={async () => {
            setSelectedChannelForRoomMap(null);
            setBannerNotice({
              type: 'success',
              message: 'Room mappings saved successfully.'
            });
            await loadData();
          }}
        />
      )}

      {/* 7. Rate Plan Mapping Modal */}
      {selectedChannelForRateMap && (
        <RateMappingModal
          channel={selectedChannelForRateMap}
          ratePlans={ratePlans}
          categories={categories}
          existingMappings={mappings.filter(m => m.channel_connection_id === selectedChannelForRateMap.id)}
          savedExtranet={extranetCodes.find(e => e.ota_type === selectedChannelForRateMap.channel_type)}
          hotelId={hotel.id}
          onClose={() => setSelectedChannelForRateMap(null)}
          onSuccess={async () => {
            setSelectedChannelForRateMap(null);
            setBannerNotice({
              type: 'success',
              message: 'Rate plan mappings saved successfully.'
            });
            await loadData();
          }}
        />
      )}

      {/* 8. Mapping Validation Dialog */}
      {validationResult && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-600" />
                Mapping Validation: {validationResult.channelName}
              </h3>
              <button onClick={() => setValidationResult(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className={`p-3.5 rounded-xl font-bold flex items-center gap-2 ${
                validationResult.canPush ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}>
                {validationResult.canPush ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                <span>
                  {validationResult.canPush ? 'Channel is ready for Rate & Inventory Push' : 'Validation Incomplete — Channel cannot safely sync'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Mapped Categories:</span>
                  <span className="font-bold text-slate-800 text-sm">{validationResult.mappedCategories} / {validationResult.totalCategories}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Unmapped:</span>
                  <span className="font-bold text-amber-700 text-sm">{validationResult.unmappedCategories}</span>
                </div>
              </div>

              {validationResult.missingCategories?.length > 0 && (
                <div>
                  <span className="font-bold text-slate-700 block mb-1">Unmapped Room Types:</span>
                  <ul className="list-disc pl-5 text-slate-600 space-y-0.5">
                    {validationResult.missingCategories.map((c: any) => (
                      <li key={c.id}>{c.name}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validationResult.missingRatePlans?.length > 0 && (
                <div>
                  <span className="font-bold text-slate-700 block mb-1">Unmapped Rate Plans:</span>
                  <ul className="list-disc pl-5 text-slate-600 space-y-0.5">
                    {validationResult.missingRatePlans.map((p: any) => (
                      <li key={p.id}>{p.name}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validationResult.validationErrors?.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700">
                  <span className="font-bold block mb-1">Errors:</span>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {validationResult.validationErrors.map((err: string, i: number) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setValidationResult(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Configuration Audit History Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <History className="w-5 h-5 text-amber-600" />
                Configuration Audit History
              </h3>
              <button onClick={() => setShowAuditModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {loadingAudit ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
                </div>
              ) : auditLogs.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No audit logs recorded for this hotel's channels yet.</p>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between flex-wrap gap-2 text-[11px]">
                      <span className="font-extrabold text-slate-800">{log.user_email || 'Super Admin'}</span>
                      <span className="text-slate-400 font-mono">
                        {log.created_at ? new Date(log.created_at).toLocaleString('en-IN') : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-900 font-mono font-bold rounded text-[10px]">
                        {log.action}
                      </span>
                      {log.record_id && (
                        <span className="text-slate-500 text-[11px] font-mono">ID: {log.record_id}</span>
                      )}
                    </div>
                    {log.metadata && (
                      <p className="text-slate-600 text-[11px] bg-white p-2 rounded border border-slate-100">
                        {typeof log.metadata === 'object' ? JSON.stringify(log.metadata) : log.metadata}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowAuditModal(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Channel Confirmation Modal */}
      {channelToDelete && (
        <ConfirmModal
          open={!!channelToDelete}
          title={`Disconnect ${channelToDelete.channel_name || channelToDelete.channel_type}?`}
          message="Are you sure you want to disconnect this OTA channel? All room mappings and rate-plan associations for this channel will be removed."
          confirmText={isDeletingChannel ? 'Deleting...' : 'Disconnect Channel'}
          cancelText="Cancel"
          variant="danger"
          onConfirm={handleConfirmDelete}
          onClose={() => setChannelToDelete(null)}
        />
      )}
    </div>
  );
};

// ── SUB-MODAL 1: Add Channel Modal with Full Provider List & Credentials ──

const AddChannelConfigModal: React.FC<{
  existingConnections: ChannelConnection[];
  hotelId?: string;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ existingConnections, hotelId, onClose, onSuccess }) => {
  const [channelType, setChannelType] = useState('makemytrip');
  const [displayName, setDisplayName] = useState('MakeMyTrip');
  const [externalPropertyId, setExternalPropertyId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [environment, setEnvironment] = useState<'production' | 'sandbox'>('production');
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableProviders = [
    { type: 'makemytrip', label: 'MakeMyTrip' },
    { type: 'goibibo', label: 'Goibibo' },
    { type: 'booking_com', label: 'Booking.com' },
    { type: 'agoda', label: 'Agoda' },
    { type: 'expedia', label: 'Expedia' },
    { type: 'airbnb', label: 'Airbnb' },
    { type: 'custom_ota', label: 'Custom OTA' }
  ];

  const handleProviderChange = (type: string) => {
    setChannelType(type);
    const p = availableProviders.find(x => x.type === type);
    if (p) setDisplayName(p.label);
  };

  const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/channels/webhook/${channelType}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await addChannel(channelType, displayName, externalPropertyId.trim() || undefined, hotelId);
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to add OTA channel.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Add OTA Channel Connection</h3>
            <p className="text-xs text-slate-400 mt-0.5">Configure new distribution partner for this property</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Select OTA Provider</label>
            <select
              value={channelType}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {availableProviders.map((p) => (
                <option key={p.type} value={p.type}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              External Property ID / Hotel Extranet Code
            </label>
            <input
              type="text"
              value={externalPropertyId}
              onChange={(e) => setExternalPropertyId(e.target.value)}
              placeholder="e.g. 50921"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Username / API Key</label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-800"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Password / Secret Token</label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="Optional"
                  className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Webhook URL (Auto-Generated)</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={webhookUrl}
                className="flex-1 px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl font-mono text-[11px] text-slate-600"
              />
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(webhookUrl)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              {loading ? 'Adding Channel...' : 'Add Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── SUB-MODAL 2: Channel Credentials & Settings Modal ──

const ChannelCredentialsModal: React.FC<{
  channel: ChannelConnection;
  hotelId?: string;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ channel, hotelId, onClose, onSuccess }) => {
  const [externalId, setExternalId] = useState(channel.external_channel_id || '');
  const [displayName, setDisplayName] = useState(channel.channel_name || '');
  const [isEnabled, setIsEnabled] = useState(channel.is_enabled !== false);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await updateChannel(channel.id, {
        externalChannelId: externalId.trim() || undefined,
        displayName: displayName.trim() || undefined,
        isEnabled
      }, hotelId);
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to update channel parameters');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-600" />
            Configure: {channel.channel_name || channel.channel_type}
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">External Property / Hotel ID</label>
            <input
              type="text"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="e.g. 10291"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">API Key / Username (Masked)</label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Leave blank to preserve existing credential"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-800"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Secret / Password</label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Leave blank to preserve existing secret"
                className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-800"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300"
              />
              <span>Channel is Enabled for Distribution</span>
            </label>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {loading ? 'Saving...' : 'Save Parameters'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── SUB-MODAL 3: Room Type Mapping Modal ──

const RoomMappingModal: React.FC<{
  channel: ChannelConnection;
  categories: RoomCategory[];
  existingMappings: ChannelRateMapping[];
  savedExtranet?: HotelExtranetCode | null;
  hotelId?: string;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ channel, categories, existingMappings, savedExtranet, hotelId, onClose, onSuccess }) => {
  const [mappingsState, setMappingsState] = useState<Record<string, { code: string; name: string }>>(() => {
    const init: Record<string, { code: string; name: string }> = {};
    for (const cat of categories) {
      const match = existingMappings.find((m) => m.room_category_id === cat.id);
      init[cat.id] = {
        code: match?.channel_room_code || '',
        name: match?.channel_room_name || ''
      };
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFieldChange = (catId: string, field: 'code' | 'name', val: string) => {
    setMappingsState(prev => ({
      ...prev,
      [catId]: { ...prev[catId], [field]: val }
    }));
  };

  const handleAutoDiscover = () => {
    // Generate standard OTA code pattern for ease of setup
    const updated = { ...mappingsState };
    for (const cat of categories) {
      if (!updated[cat.id]?.code) {
        const cleanName = cat.name.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 12);
        updated[cat.id] = {
          code: `${channel.channel_type.toUpperCase().slice(0, 3)}_${cleanName}`,
          name: cat.name
        };
      }
    }
    setMappingsState(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = Object.entries(mappingsState)
        .filter(([_, val]) => val.code.trim())
        .map(([catId, val]) => ({
          room_category_id: catId,
          channel_room_code: val.code.trim(),
          channel_room_name: val.name.trim() || undefined,
          status: 'mapped'
        }));

      await saveChannelMappings(channel.id, payload, hotelId);
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to save room mappings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BedDouble className="w-5 h-5 text-amber-600" />
              Room Type Mapping: {channel.channel_name || channel.channel_type}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Map internal hotel room categories to external OTA room IDs.
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Saved Extranet Code Banner */}
        {savedExtranet ? (
          <div className="p-3 bg-amber-50/70 border border-amber-200/90 rounded-xl text-xs text-amber-950 font-semibold flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Saved Extranet Property Code:</span>
            <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-amber-300 text-slate-900 shadow-xs">
              {savedExtranet.extranet_property_code}
            </span>
            {savedExtranet.ota_property_name && (
              <span className="text-slate-500 text-[11px]">({savedExtranet.ota_property_name})</span>
            )}
          </div>
        ) : (
          <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 font-semibold flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>No extranet code is saved for this hotel and OTA. Add it in Extranet Codes.</span>
          </div>
        )}

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 font-semibold">Categories ({categories.length})</span>
          <button
            type="button"
            onClick={handleAutoDiscover}
            className="text-amber-600 hover:text-amber-800 font-bold underline cursor-pointer"
          >
            Auto-Populate OTA Codes
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
          {categories.map((cat) => {
            const st = mappingsState[cat.id] || { code: '', name: '' };
            const isMapped = !!st.code.trim();

            return (
              <div key={cat.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-800 text-sm">{cat.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                    isMapped ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-200 text-slate-600 border-slate-300'
                  }`}>
                    {isMapped ? 'Mapped' : 'Unmapped'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      External OTA Room ID / Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={st.code}
                      onChange={(e) => handleFieldChange(cat.id, 'code', e.target.value)}
                      placeholder="e.g. DELUXE_KG"
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      External Room Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={st.name}
                      onChange={(e) => handleFieldChange(cat.id, 'name', e.target.value)}
                      placeholder="e.g. Deluxe Room with Balcony"
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-medium"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving Mappings...' : 'Save Room Mappings'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── SUB-MODAL 4: Rate Plan Mapping Modal ──

const RateMappingModal: React.FC<{
  channel: ChannelConnection;
  ratePlans: RatePlan[];
  categories: RoomCategory[];
  existingMappings: ChannelRateMapping[];
  savedExtranet?: HotelExtranetCode | null;
  hotelId?: string;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ channel, ratePlans, categories, existingMappings, savedExtranet, hotelId, onClose, onSuccess }) => {
  const [rateMappings, setRateMappings] = useState<Record<string, { code: string; name: string }>>(() => {
    const init: Record<string, { code: string; name: string }> = {};
    for (const plan of ratePlans) {
      const match = existingMappings.find((m) => m.rate_plan_id === plan.id);
      init[plan.id] = {
        code: match?.channel_rate_plan_code || '',
        name: match?.channel_rate_plan_name || ''
      };
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFieldChange = (planId: string, field: 'code' | 'name', val: string) => {
    setRateMappings(prev => ({
      ...prev,
      [planId]: { ...prev[planId], [field]: val }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = Object.entries(rateMappings)
        .filter(([_, val]) => val.code.trim())
        .map(([planId, val]) => {
          const plan = ratePlans.find((p) => p.id === planId);
          return {
            rate_plan_id: planId,
            room_category_id: (plan as any)?.room_category_id || undefined,
            channel_rate_plan_code: val.code.trim(),
            channel_rate_plan_name: val.name.trim() || undefined,
            status: 'mapped'
          };
        });

      await saveChannelMappings(channel.id, payload, hotelId);
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to save rate plan mappings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Tag className="w-5 h-5 text-amber-600" />
              Rate Plan Mapping: {channel.channel_name || channel.channel_type}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Map internal PMS rate plans to OTA rate plan codes.
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Saved Extranet Code Banner */}
        {savedExtranet ? (
          <div className="p-3 bg-amber-50/70 border border-amber-200/90 rounded-xl text-xs text-amber-950 font-semibold flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Saved Extranet Property Code:</span>
            <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-amber-300 text-slate-900 shadow-xs">
              {savedExtranet.extranet_property_code}
            </span>
            {savedExtranet.ota_property_name && (
              <span className="text-slate-500 text-[11px]">({savedExtranet.ota_property_name})</span>
            )}
          </div>
        ) : (
          <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 font-semibold flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>No extranet code is saved for this hotel and OTA. Add it in Extranet Codes.</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
          {ratePlans.length === 0 ? (
            <p className="text-slate-400 text-center py-6">No rate plans found for this property.</p>
          ) : (
            ratePlans.map((plan) => {
              const st = rateMappings[plan.id] || { code: '', name: '' };
              const category = categories.find((c) => c.id === (plan as any)?.room_category_id);
              const isMapped = !!st.code.trim();

              return (
                <div key={plan.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-extrabold text-slate-800 text-sm">{plan.plan_name}</span>
                      {category && (
                        <span className="text-[11px] text-slate-400 ml-2 font-medium">
                          ({category.name})
                        </span>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                      isMapped ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-200 text-slate-600 border-slate-300'
                    }`}>
                      {isMapped ? 'Mapped' : 'Unmapped'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        OTA Rate Plan Code <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={st.code}
                        onChange={(e) => handleFieldChange(plan.id, 'code', e.target.value)}
                        placeholder="e.g. EP_BAR"
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        OTA Rate Plan Name
                      </label>
                      <input
                        type="text"
                        value={st.name}
                        onChange={(e) => handleFieldChange(plan.id, 'name', e.target.value)}
                        placeholder="e.g. Room Only - Best Available Rate"
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-medium"
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving Mappings...' : 'Save Rate Mappings'}
          </button>
        </div>
      </div>
    </div>
  );
};
