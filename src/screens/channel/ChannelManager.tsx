import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { 
  RefreshCw, Plus, X, ChevronLeft, ChevronRight, AlertTriangle,
  CheckCircle2, XCircle, Clock, Zap, Wifi, WifiOff, Pause, Play,
  Settings as SettingsIcon, FileText, Calendar, Building2, Link2,
  Radio, Loader2, Ban, Save, Eye, ArrowRight, Filter, Activity,
  TrendingUp, AlertCircle, Plug, KeyRound, Server, Trash2,
  LogIn, LogOut as LogOutIcon, RotateCw, ChevronDown, CalendarDays,
  RefreshCcw, Download } from 'lucide-react';
import {
  getChannelManagerOverview, getInventoryRestrictions, upsertInventoryRestriction,
  bulkUpdateInventory, saveChannelConnection, deleteChannelConnection,
  saveChannelRateMapping, deleteChannelRateMapping, insertSyncLog,
  updateOtaReservationStatus, getSyncLogs, getChannelSettings,
  saveChannelSettings, updateChannelSettingsStatus, retrySyncLog,
  CHANNEL_TYPES, getChannelMetadata, fetchChannelMapping,
  checkChannelStatus, pushChannelInventory, pushChannelRates,
  testChannelConnection, fetchChannelFutureBookings
} from '@/lib/api-channel';
import type {
  ChannelManagerOverview, ChannelConnection, ChannelInventoryRestriction,
  ChannelSyncLog, ChannelOtaReservation, ChannelSettings,
} from '@/lib/api-channel';
import type { RoomCategory } from '@/lib/types';
import type { RatePlan } from '@/lib/types-reservations';
import { fmtMoney, toNum } from '@/lib/calc';

interface ChannelManagerProps {
  onBack?: () => void;
  onNavigate?: (screen: string, payload?: unknown) => void;
  mode?: 'hotel_owner' | 'super_admin';
}

type Tab = 'overview' | 'inventory' | 'reservations' | 'channels' | 'mapping' | 'logs' | 'settings' | 'diagnostics';

const TAB_KEY = 'cm_active_tab';

const HOTEL_OWNER_TABS: Tab[] = ['overview', 'inventory', 'mapping'];

const rs = (n: number): string => '\u20B9' + fmtMoney(typeof n === 'number' ? n : 0);

const addDays = (dateStr: string, n: number): string => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const todayStr = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fmtDate = (d: string): string => {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const fmtDateLong = (d: string): string => {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
};

const fmtDateTime = (d: string): string => {
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const daysBetween = (start: string, end: string): string[] => {
  const days: string[] = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard < 400) {
    days.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return days;
};

const STATUS_STYLES: Record<string, string> = {
  connected: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  disconnected: 'bg-slate-100 text-slate-500 border-slate-300',
  paused: 'bg-amber-100 text-amber-700 border-amber-300',
  error: 'bg-red-100 text-red-700 border-red-300',
  mapped: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  unmapped: 'bg-slate-100 text-slate-500 border-slate-300',
  new: 'bg-blue-100 text-blue-700 border-blue-300',
  modified: 'bg-amber-100 text-amber-700 border-amber-300',
  cancelled: 'bg-red-100 text-red-700 border-red-300',
  imported: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  failed: 'bg-red-100 text-red-700 border-red-300',
  pending: 'bg-amber-100 text-amber-700 border-amber-300',
  needs_attention: 'bg-orange-100 text-orange-700 border-orange-300',
  mapping_required: 'bg-orange-100 text-orange-700 border-orange-300',
  success: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  retry: 'bg-amber-100 text-amber-700 border-amber-300',
  failure: 'bg-red-100 text-red-700 border-red-300',
};

// ── Availability color helper ──
const availColor = (avail: number, total: number, stopSell: boolean): string => {
  if (stopSell) return 'bg-slate-200 text-slate-500';
  if (avail <= 0) return 'bg-red-50 text-red-700 border-red-200';
  if (total > 0 && avail <= total * 0.25) return 'bg-orange-50 text-orange-700 border-orange-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════

export const ChannelManager = ({ onBack, onNavigate, mode = 'hotel_owner' }: ChannelManagerProps) => {
  const isHotelOwner = mode === 'hotel_owner';

  const [tab, setTab] = useState<Tab>(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem(TAB_KEY) : null;
    const initial = (saved as Tab) ?? 'overview';
    if (isHotelOwner && !HOTEL_OWNER_TABS.includes(initial)) return 'overview';
    return initial;
  });
  const [overview, setOverview] = useState<ChannelManagerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getChannelManagerOverview();
      setOverview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Channel Manager');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Persist tab to sessionStorage + sync with URL hash
  useEffect(() => {
    sessionStorage.setItem(TAB_KEY, tab);
    if (typeof window !== 'undefined' && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.hash = `cm-${tab}`;
      window.history.replaceState(window.history.state, '', url);
    }
  }, [tab]);

  // Restore tab from URL hash on mount
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const match = hash.match(/^#cm-(\w+)$/);
    if (match) {
      const t = match[1] as Tab;
      const validTabs: Tab[] = isHotelOwner
        ? HOTEL_OWNER_TABS
        : ['overview', 'inventory', 'reservations', 'channels', 'mapping', 'logs', 'settings', 'diagnostics'];
      if (validTabs.includes(t)) {
        setTab(t);
      }
    }
  }, [isHotelOwner]);

  // Browser back/forward
  useEffect(() => {
    const onPop = () => {
      const hash = window.location.hash;
      const match = hash.match(/^#cm-(\w+)$/);
      if (match) {
        const t = match[1] as Tab;
        const validTabs: Tab[] = isHotelOwner
          ? HOTEL_OWNER_TABS
          : ['overview', 'inventory', 'reservations', 'channels', 'mapping', 'logs', 'settings', 'diagnostics'];
        if (validTabs.includes(t)) {
          setTab(t);
        }
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isHotelOwner]);

  const allTabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <Radio className="w-4 h-4" /> },
    { key: 'inventory', label: 'Inventory & Rates', icon: <Calendar className="w-4 h-4" /> },
    { key: 'reservations', label: 'OTA Reservations', icon: <FileText className="w-4 h-4" /> },
    { key: 'channels', label: 'Channels', icon: <Wifi className="w-4 h-4" /> },
    { key: 'mapping', label: 'Room & Rate Mapping', icon: <Link2 className="w-4 h-4" /> },
    { key: 'logs', label: 'Sync Logs', icon: <Zap className="w-4 h-4" /> },
    { key: 'diagnostics', label: 'Diagnostics', icon: <Activity className="w-4 h-4" /> },
    { key: 'settings', label: 'Connection Settings', icon: <SettingsIcon className="w-4 h-4" /> },
  ];

  const tabs = isHotelOwner
    ? allTabs.filter((t) => HOTEL_OWNER_TABS.includes(t.key))
    : allTabs;

  return (
    <div className="px-4 lg:px-6 py-5 w-full max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition" title="Back">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold text-brand-navy-800">Channel Manager</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Channel integration · {overview?.isLiveMode ? 'Live Sync Active' : 'Mock/Test Mode'}
              {isHotelOwner && <span className="ml-2 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Owner Access</span>}
              {!isHotelOwner && <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-semibold">Superadmin View</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${overview?.isLiveMode ? STATUS_STYLES.connected : 'bg-amber-100 text-amber-700 border-amber-300'}`}>
            {overview?.isLiveMode ? <><CheckCircle2 className="w-3 h-3 inline mr-1" /> Live Sync</> : <><Clock className="w-3 h-3 inline mr-1" /> Integration Ready</>}
          </span>
          <button onClick={load} className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mock mode banner */}
      {overview && !overview.isLiveMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700">
            <span className="font-semibold">Mock/Test Mode:</span> {isHotelOwner
              ? 'Channel Manager credentials are not yet configured. Please contact Superadmin to configure integration.'
              : 'Channel Manager credentials are not yet configured. Connect your provider in Connection Settings below to enable live OTA sync.'}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={load} className="ml-auto flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-800">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {/* Tabs — horizontally scrollable on mobile */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b-2 border-amber-200/80 pb-px -mx-1 px-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-extrabold whitespace-nowrap border-b-2 transition-all rounded-t-xl ${
              tab === t.key
                ? 'border-amber-500 text-amber-950 bg-gradient-to-r from-amber-100/90 via-amber-50 to-amber-100/60 shadow-sm shadow-amber-500/20'
                : 'border-transparent text-slate-600 hover:text-amber-900 hover:bg-amber-50/50 font-bold'
            }`}
          >
            <span className={tab === t.key ? 'text-amber-600 font-bold' : 'text-slate-400 group-hover:text-amber-600'}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && !overview ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
        </div>
      ) : overview ? (
        <>
          {tab === 'overview' && <OverviewTab overview={overview} onNavigate={onNavigate} onTab={setTab} mode={mode} />}
          {tab === 'inventory' && <InventoryTab categories={overview.categories} isLiveMode={overview.isLiveMode} />}
          {tab === 'reservations' && <ReservationsTab reservations={overview.otaReservations} onChanged={load} />}
          {tab === 'channels' && <ChannelsTab isLiveMode={overview.isLiveMode} />}
          {tab === 'mapping' && <MappingTab categories={overview.categories} ratePlans={overview.ratePlans} mappings={overview.mappings} onChanged={load} />}
          {tab === 'logs' && <LogsTab logs={overview.syncLogs} connections={overview.connections} />}
          {tab === 'diagnostics' && <DiagnosticsTab />}
          {tab === 'settings' && <SettingsTab settings={overview.settings} onChanged={load} />}
        </>
      ) : null}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ══════════════════════════════════════════════════════════════════

const OverviewTab = ({ overview, onNavigate, onTab, mode = 'hotel_owner' }: {
  overview: ChannelManagerOverview;
  onNavigate?: (s: string, p?: unknown) => void;
  onTab: (t: Tab) => void;
  mode?: 'hotel_owner' | 'super_admin';
}) => {
  const isHotelOwner = mode === 'hotel_owner';
  const connected = overview.connections.filter((c) => c.status === 'connected').length;
  const today = todayStr();
  const todayOtaBookings = overview.otaReservations.filter((r) => r.created_at?.slice(0, 10) === today).length;
  const otaRevenueToday = overview.otaReservations
    .filter((r) => r.created_at?.slice(0, 10) === today && r.booking_status !== 'cancelled')
    .reduce((s, r) => s + toNum(r.amount), 0);
  const pendingActions = overview.otaReservations.filter((r) => r.import_status === 'pending' || r.import_status === 'needs_attention').length;
  const lastSync = overview.connections
    .filter((c) => c.last_sync_at)
    .sort((a, b) => (a.last_sync_at! < b.last_sync_at! ? 1 : -1))[0];

  const cards = [
    { label: 'Connected Channels', value: `${connected}`, sub: `${overview.connections.length} total`, icon: <Wifi className="w-5 h-5" />, color: 'text-brand-600', bg: 'bg-brand-50' },
    { label: 'Today OTA Bookings', value: `${todayOtaBookings}`, sub: 'New today', icon: <FileText className="w-5 h-5" />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'OTA Revenue Today', value: rs(otaRevenueToday), sub: 'From OTA bookings', icon: <Zap className="w-5 h-5" />, color: 'text-brand-gold-600', bg: 'bg-brand-gold-50' },
    { label: 'Sync Health', value: overview.isLiveMode ? 'Healthy' : 'Not Connected', sub: overview.isLiveMode ? 'Live' : 'Mock mode', icon: <CheckCircle2 className="w-5 h-5" />, color: overview.isLiveMode ? 'text-emerald-600' : 'text-amber-600', bg: overview.isLiveMode ? 'bg-emerald-50' : 'bg-amber-50' },
    { label: 'Pending Actions', value: `${pendingActions}`, sub: 'Needs attention', icon: <Clock className="w-5 h-5" />, color: pendingActions > 0 ? 'text-orange-600' : 'text-slate-500', bg: pendingActions > 0 ? 'bg-orange-50' : 'bg-slate-100' },
    { label: 'Last Successful Sync', value: lastSync ? fmtDateTime(lastSync.last_sync_at!) : 'Never', sub: lastSync?.channel_name ?? '', icon: <Radio className="w-5 h-5" />, color: 'text-brand-navy-700', bg: 'bg-brand-navy-50' },
  ];

  // Setup checklist
  const checklist = [
    { label: 'Channel credentials configured', done: overview.settings?.aiosell_status === 'connected', action: () => (!isHotelOwner ? onTab('settings') : null) },
    { label: 'Property connection established', done: overview.settings?.aiosell_status === 'connected', action: () => (!isHotelOwner ? onTab('settings') : null) },
    { label: 'Room categories mapped', done: overview.mappings.some((m) => m.status === 'mapped' && m.external_room_code), action: () => onTab('mapping') },
    { label: 'Rate plans mapped', done: overview.mappings.some((m) => m.status === 'mapped' && m.external_rate_plan_code), action: () => onTab('mapping') },
    { label: 'At least one channel connected', done: connected > 0, action: () => (!isHotelOwner ? onTab('channels') : null) },
    { label: 'First inventory sync completed', done: overview.syncLogs.some((l) => l.log_type === 'inventory' && l.status === 'success'), action: () => onTab('inventory') },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 lg:gap-4">
        {cards.map((c, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-card hover:shadow-card-hover transition-all p-4 animate-kpi" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{c.label}</span>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.bg} ${c.color}`}>{c.icon}</div>
            </div>
            <p className={`text-xl font-bold tabular-nums leading-none ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-slate-400 mt-1.5">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        {/* Channel Status */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-brand-navy-800">Channel Status</h3>
            {!isHotelOwner && (
              <button onClick={() => onTab('channels')} className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1">
                View All <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="p-4 space-y-2">
            {overview.connections.length > 0 ? (
              overview.connections.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${c.status === 'connected' ? 'bg-emerald-500' : c.status === 'paused' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{c.channel_name}</p>
                      <p className="text-[10px] text-slate-400">Last sync: {c.last_sync_at ? fmtDateTime(c.last_sync_at) : 'Never'}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${STATUS_STYLES[c.status] ?? STATUS_STYLES.disconnected}`}>
                    {c.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-4">
                <WifiOff className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400 mb-2">No channels connected yet.</p>
                {!isHotelOwner && (
                  <button onClick={() => onTab('channels')} className="text-sm font-semibold text-brand-600 hover:text-brand-700">Add a channel</button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Pending Setup Checklist */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-brand-navy-800">Pending Setup Checklist</h3>
            <span className="text-xs font-semibold text-slate-400">{doneCount}/{checklist.length} done</span>
          </div>
          <div className="p-4 space-y-2">
            {checklist.map((item, i) => (
              <button
                key={i}
                onClick={item.action}
                disabled={isHotelOwner && (i === 0 || i === 1 || i === 4)}
                className="w-full flex items-center gap-3 py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 rounded-lg px-2 -mx-2 transition text-left disabled:cursor-default"
              >
                {item.done ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-slate-300 shrink-0" />
                )}
                <span className={`text-sm flex-1 ${item.done ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>{item.label}</span>
                {isHotelOwner && (i === 0 || i === 1 || i === 4) && !item.done ? (
                  <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Superadmin Setup</span>
                ) : !item.done ? (
                  <ArrowRight className="w-4 h-4 text-slate-300" />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        {/* Recent OTA Reservations */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-brand-navy-800">Recent OTA Reservations</h3>
            {!isHotelOwner && (
              <button onClick={() => onTab('reservations')} className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1">
                View All <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="p-4 space-y-2">
            {overview.otaReservations.length > 0 ? (
              overview.otaReservations.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{r.guest_name ?? '—'}</p>
                    <p className="text-[10px] text-slate-400">{r.ota_booking_id} · {r.check_in_date ?? '—'}</p>
                  </div>
                  <span className="text-sm font-bold text-slate-700 tabular-nums">{rs(toNum(r.amount))}</span>
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${STATUS_STYLES[r.import_status] ?? 'bg-slate-100 text-slate-500 border-slate-300'}`}>{r.import_status.replace('_', ' ')}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">No OTA reservations yet.</p>
            )}
          </div>
        </div>

        {/* Recent Sync Activity */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-brand-navy-800">Recent Sync Activity</h3>
            {!isHotelOwner && (
              <button onClick={() => onTab('logs')} className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1">
                View All <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="p-4 space-y-2">
            {overview.syncLogs.length > 0 ? (
              overview.syncLogs.slice(0, 5).map((l) => (
                <div key={l.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${l.status === 'success' ? 'bg-emerald-500' : l.status === 'failure' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{l.log_type} · {l.message ?? '—'}</p>
                    <p className="text-[10px] text-slate-400">{fmtDateTime(l.created_at)}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${STATUS_STYLES[l.status] ?? 'bg-slate-100 text-slate-500 border-slate-300'}`}>{l.status}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">No sync logs recorded yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// INVENTORY & RATES TAB
// ══════════════════════════════════════════════════════════════════

type RangePreset = '7' | '14' | '30' | 'custom';

const InventoryTab = ({ categories, isLiveMode }: { categories: RoomCategory[]; isLiveMode: boolean }) => {
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(addDays(todayStr(), 6));
  const [rangePreset, setRangePreset] = useState<RangePreset>('7');
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [restrictions, setRestrictions] = useState<Map<string, ChannelInventoryRestriction>>(new Map());
  const [loading, setLoading] = useState(true);
  const [cellEdit, setCellEdit] = useState<{ catId: string; date: string; categoryName: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState<string>("");


  const days = useMemo(() => daysBetween(startDate, endDate), [startDate, endDate]);

  const applyPreset = (preset: RangePreset) => {
    setRangePreset(preset);
    if (preset === '7') { setStartDate(todayStr()); setEndDate(addDays(todayStr(), 6)); }
    else if (preset === '14') { setStartDate(todayStr()); setEndDate(addDays(todayStr(), 13)); }
    else if (preset === '30') { setStartDate(todayStr()); setEndDate(addDays(todayStr(), 29)); }
    else { setShowCustomRange(true); }
  };

  
  const handlePushToChannel = async () => {
    setIsSyncing(true);
    setSyncProgress("Pushing Inventory...");
    try {
      await pushChannelInventory(startDate, endDate);

      setSyncProgress("Pushing Rates...");
      await pushChannelRates(startDate, endDate);

      alert('Successfully synced Inventory & Rates with channels!');
    } catch (err: any) {
      alert(err.message || 'Error syncing with channels');
    } finally {
      setIsSyncing(false);
      setSyncProgress("");
    }
  };

  const shiftRange = (n: number) => {
    const span = days.length;
    setStartDate(addDays(startDate, n * span));
    setEndDate(addDays(endDate, n * span));
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getInventoryRestrictions(startDate, endDate);
      const map = new Map<string, ChannelInventoryRestriction>();
      for (const r of data) {
        map.set(`${r.room_category_id}|${r.date}`, r);
      }
      setRestrictions(map);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const getR = (catId: string, date: string): Partial<ChannelInventoryRestriction> => {
    return restrictions.get(`${catId}|${date}`) ?? {
      base_rate: 0, channel_rate: 0, availability: 0, min_stay: 1, max_stay: 0,
      stop_sell: false, closed_to_arrival: false, closed_to_departure: false,
    };
  };

  const toggleExpand = (catId: string) => {
    const next = new Set(expandedRows);
    if (next.has(catId)) next.delete(catId); else next.add(catId);
    setExpandedRows(next);
  };

  if (categories.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-8 text-center">
        <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500 mb-2">No room categories configured.</p>
        <p className="text-xs text-slate-400">Configure room categories in Property Master to use the Channel Manager inventory calendar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Date range controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => shiftRange(-1)} className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition" title="Previous range">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">{fmtDate(startDate)} – {fmtDate(endDate)}</span>
          <button onClick={() => shiftRange(1)} className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition" title="Next range">
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => { setStartDate(todayStr()); setEndDate(addDays(todayStr(), parseInt(rangePreset === 'custom' ? '7' : rangePreset) - 1)); }}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700 px-2 py-1.5 rounded-lg hover:bg-brand-50 transition"
          >
            Today
          </button>
        </div>

        {/* Range presets */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['7', '14', '30', 'custom'] as RangePreset[]).map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
                rangePreset === p ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {p === 'custom' ? 'Custom' : `${p} Days`}
            </button>
          ))}
          <button
            onClick={() => setBulkOpen(true)}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-soft-blue hover:shadow-md transition-all active:scale-[0.98] ml-2"
          >
            <Zap className="w-4 h-4" /> Bulk Update
          </button>
            <button
              onClick={handlePushToChannel}
              disabled={isSyncing}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-soft-blue hover:shadow-md transition-all active:scale-[0.98] ml-2 disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />} 
              {isSyncing ? 'Syncing...' : 'Push Inventory & Rates'}
            </button>
        </div>
      </div>

      {/* Custom date range picker */}
      {showCustomRange && rangePreset === 'custom' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-end gap-3 flex-wrap animate-fade-in">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setRangePreset('custom'); }}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setRangePreset('custom'); }}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none"
            />
          </div>
          <button
            onClick={() => { setShowCustomRange(false); load(); }}
            className="text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-4 py-2 transition"
          >
            Apply
          </button>
          <button onClick={() => setShowCustomRange(false)} className="text-sm font-semibold text-slate-500 hover:text-slate-700 px-2 py-2">
            Close
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 text-brand-600 animate-spin" />
        </div>
      )}

      {/* Inventory grid */}
      {!loading && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider sticky left-0 bg-slate-50 z-10 min-w-[140px]">Category</th>
                  {days.map((d) => {
                    const isToday = d === todayStr();
                    return (
                      <th key={`header-${d}`} className={`text-center px-2 py-3 text-xs font-bold min-w-[64px] ${isToday ? 'text-brand-600 bg-brand-50 border-b-2 border-brand-400' : 'text-slate-500'}`}>
                        <div className={isToday ? 'text-brand-600' : ''}>{fmtDate(d)}</div>
                        <div className={`text-[9px] font-normal mt-0.5 ${isToday ? 'text-brand-400' : 'text-slate-400'}`}>
                          {new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => {
                  const isExpanded = expandedRows.has(cat.id);
                  const rows: { key: string; label: string; field: string; render: (d: string) => React.ReactNode }[] = [
                    {
                      key: 'avail', label: 'Availability', field: 'availability',
                      render: (d: string) => {
                        const r = getR(cat.id, d);
                        const val = toNum(r.availability);
                        return (
                          <button
                            onClick={() => setCellEdit({ catId: cat.id, date: d, categoryName: cat.name })}
                            className={`w-full text-center text-sm font-bold rounded-lg py-1.5 px-1 border transition hover:ring-2 hover:ring-brand-300 ${availColor(val, 10, Boolean(r.stop_sell))}`}
                          >
                            {val}
                          </button>
                        );
                      },
                    },
                    {
                      key: 'rate', label: 'Base Rate', field: 'base_rate',
                      render: (d: string) => {
                        const r = getR(cat.id, d);
                        const val = toNum(r.base_rate);
                        return (
                          <button
                            onClick={() => setCellEdit({ catId: cat.id, date: d, categoryName: cat.name })}
                            className="w-full text-center text-sm font-semibold text-brand-600 hover:bg-brand-50 rounded-lg py-1.5 px-1 border border-transparent hover:border-brand-200 transition"
                          >
                            {val > 0 ? rs(val) : <span className="text-slate-300">—</span>}
                          </button>
                        );
                      },
                    },
                    {
                      key: 'minstay', label: 'Min Stay', field: 'min_stay',
                      render: (d: string) => {
                        const r = getR(cat.id, d);
                        const val = toNum(r.min_stay);
                        return (
                          <button
                            onClick={() => setCellEdit({ catId: cat.id, date: d, categoryName: cat.name })}
                            className="w-full text-center text-sm text-slate-600 hover:bg-slate-50 rounded-lg py-1.5 px-1 border border-transparent hover:border-slate-200 transition"
                          >
                            {val > 0 ? `${val}n` : <span className="text-slate-300">—</span>}
                          </button>
                        );
                      },
                    },
                    {
                      key: 'stopsell', label: 'Stop Sell', field: 'stop_sell',
                      render: (d: string) => {
                        const r = getR(cat.id, d);
                        const stopped = Boolean(r.stop_sell);
                        return (
                          <button
                            onClick={() => setCellEdit({ catId: cat.id, date: d, categoryName: cat.name })}
                            className={`w-full flex items-center justify-center rounded-lg py-1.5 border transition ${stopped ? 'bg-slate-200 text-slate-600 border-slate-300' : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:ring-2 hover:ring-brand-300'}`}
                          >
                            {stopped ? <Ban className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                          </button>
                        );
                      },
                    },
                  ];

                  return (
                    <React.Fragment key={cat.id}>
                      {/* Category header row */}
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <td className="px-4 py-2 sticky left-0 bg-slate-50/50 z-10">
                          <button
                            onClick={() => toggleExpand(cat.id)}
                            className="flex items-center gap-1.5 text-sm font-bold text-slate-800"
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                            {cat.name}
                          </button>
                          <p className="text-[10px] text-slate-400 ml-5.5">Tariff: {rs(cat.default_tariff)}</p>
                        </td>
                        {days.map((d) => <td key={`${cat.id}-empty-${d}`} className="px-1 py-1" />)}
                      </tr>

                      {/* Sub-rows */}
                      {rows.map((row, ri) => (
                        <tr key={`${cat.id}-${row.key}`} className={`border-b border-slate-50 ${ri === rows.length - 1 && !isExpanded ? 'border-b-2 border-slate-200' : ''}`}>
                          <td className="px-4 py-1.5 sticky left-0 bg-white z-10">
                            <span className="text-xs font-medium text-slate-500 pl-5.5">{row.label}</span>
                          </td>
                          {days.map((d) => (
                            <td key={`${cat.id}-${row.key}-${d}`} className="px-1 py-1">{row.render(d)}</td>
                          ))}
                        </tr>
                      ))}

                      {/* Expanded rows: Max Stay, CTA, CTD */}
                      {isExpanded && (
                        <>
                          <tr className="border-b border-slate-50 bg-amber-50/30">
                            <td className="px-4 py-1.5 sticky left-0 bg-amber-50/30 z-10"><span className="text-xs font-medium text-slate-500 pl-5.5">Max Stay</span></td>
                            {days.map((d) => {
                              const r = getR(cat.id, d);
                              const val = toNum(r.max_stay);
                              return (
                                <td key={`${cat.id}-maxstay-${d}`} className="px-1 py-1 text-center">
                                  <button onClick={() => setCellEdit({ catId: cat.id, date: d, categoryName: cat.name })} className="text-xs text-slate-500 hover:text-slate-700 px-1 py-1">
                                    {val > 0 ? `${val}n` : '—'}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                          <tr className="border-b border-slate-50 bg-amber-50/30">
                            <td className="px-4 py-1.5 sticky left-0 bg-amber-50/30 z-10"><span className="text-xs font-medium text-slate-500 pl-5.5">Closed to Arrival</span></td>
                            {days.map((d) => {
                              const r = getR(cat.id, d);
                              const cta = Boolean(r.closed_to_arrival);
                              return (
                                <td key={`${cat.id}-cta-${d}`} className="px-1 py-1 text-center">
                                  <button onClick={() => setCellEdit({ catId: cat.id, date: d, categoryName: cat.name })} className={`text-xs px-2 py-1 rounded ${cta ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-emerald-50'}`}>
                                    {cta ? 'Closed' : 'Open'}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                          <tr className="border-b-2 border-slate-200 bg-amber-50/30">
                            <td className="px-4 py-1.5 sticky left-0 bg-amber-50/30 z-10"><span className="text-xs font-medium text-slate-500 pl-5.5">Closed to Departure</span></td>
                            {days.map((d) => {
                              const r = getR(cat.id, d);
                              const ctd = Boolean(r.closed_to_departure);
                              return (
                                <td key={`${cat.id}-ctd-${d}`} className="px-1 py-1 text-center">
                                  <button onClick={() => setCellEdit({ catId: cat.id, date: d, categoryName: cat.name })} className={`text-xs px-2 py-1 rounded ${ctd ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-emerald-50'}`}>
                                    {ctd ? 'Closed' : 'Open'}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        </>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200" /> Good availability</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-50 border border-orange-200" /> Low availability</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-50 border border-red-200" /> No availability</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-200" /> Stop Sell</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-brand-50 border border-brand-400" /> Today</span>
      </div>

      {/* Cell edit popover */}
      {cellEdit && (
        <CellEditPopover
          catId={cellEdit.catId}
          date={cellEdit.date}
          categoryName={cellEdit.categoryName}
          restriction={getR(cellEdit.catId, cellEdit.date)}
          onClose={() => setCellEdit(null)}
          onSave={async (data) => {
            await upsertInventoryRestriction({
              room_category_id: cellEdit.catId,
              date: cellEdit.date,
              ...data,
            } as Omit<ChannelInventoryRestriction, 'id' | 'hotel_id' | 'updated_at'>);
            setCellEdit(null);
            await load();
          }}
        />
      )}

      {/* Bulk update drawer */}
      {bulkOpen && (
        <BulkUpdateDrawer
          categories={categories}
          defaultStart={startDate}
          defaultEnd={endDate}
          onClose={() => setBulkOpen(false)}
          onApply={async (updates) => {
            await bulkUpdateInventory(updates);
            setBulkOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
};

// ── Cell Edit Popover ──

const CellEditPopover = ({ catId, date, categoryName, restriction, onClose, onSave }: {
  catId: string;
  date: string;
  categoryName: string;
  restriction: Partial<ChannelInventoryRestriction>;
  onClose: () => void;
  onSave: (data: Partial<ChannelInventoryRestriction>) => Promise<void>;
}) => {
  const [availability, setAvailability] = useState(String(toNum(restriction.availability)));
  const [baseRate, setBaseRate] = useState(String(toNum(restriction.base_rate)));
  const [minStay, setMinStay] = useState(String(toNum(restriction.min_stay)));
  const [maxStay, setMaxStay] = useState(String(toNum(restriction.max_stay)));
  const [stopSell, setStopSell] = useState(Boolean(restriction.stop_sell));
  const [cta, setCta] = useState(Boolean(restriction.closed_to_arrival));
  const [ctd, setCtd] = useState(Boolean(restriction.closed_to_departure));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      availability: parseInt(availability) || 0,
      base_rate: parseFloat(baseRate) || 0,
      channel_rate: 0,
      min_stay: parseInt(minStay) || 1,
      max_stay: parseInt(maxStay) || 0,
      stop_sell: stopSell,
      closed_to_arrival: cta,
      closed_to_departure: ctd,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-5 animate-scale-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-brand-navy-800">Edit Cell</h3>
            <p className="text-xs text-slate-400 mt-0.5">{categoryName} · {fmtDateLong(date)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Availability</label>
            <input type="number" value={availability} onChange={(e) => setAvailability(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Base Rate</label>
            <input type="number" value={baseRate} onChange={(e) => setBaseRate(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Min Stay (nights)</label>
            <input type="number" value={minStay} onChange={(e) => setMinStay(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Max Stay (nights)</label>
            <input type="number" value={maxStay} onChange={(e) => setMaxStay(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <button
            onClick={() => setStopSell(!stopSell)}
            className={`text-xs font-semibold py-2.5 rounded-lg border transition ${stopSell ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-500 border-slate-200'}`}
          >
            {stopSell ? <Ban className="w-3 h-3 inline mr-1" /> : null} Stop Sell {stopSell ? 'On' : 'Off'}
          </button>
          <button
            onClick={() => setCta(!cta)}
            className={`text-xs font-semibold py-2.5 rounded-lg border transition ${cta ? 'bg-red-500 text-white border-red-500' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}
          >
            CTA: {cta ? 'Closed' : 'Open'}
          </button>
          <button
            onClick={() => setCtd(!ctd)}
            className={`text-xs font-semibold py-2.5 rounded-lg border transition ${ctd ? 'bg-red-500 text-white border-red-500' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}
          >
            CTD: {ctd ? 'Closed' : 'Open'}
          </button>
        </div>

        <div className="flex items-center gap-2 mt-5">
          <button onClick={onClose} className="flex-1 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl py-2.5 transition">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-xl py-2.5 transition"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// BULK UPDATE DRAWER
// ══════════════════════════════════════════════════════════════════

type UpdateType = 'availability' | 'base_rate' | 'channel_rate' | 'stop_sell' | 'min_stay' | 'max_stay' | 'cta' | 'ctd';
type RateMode = 'fixed' | 'inc_abs' | 'dec_abs' | 'inc_pct' | 'dec_pct';

const UPDATE_TYPES: { key: UpdateType; label: string }[] = [
  { key: 'availability', label: 'Availability' },
  { key: 'base_rate', label: 'Base Rate' },
  { key: 'channel_rate', label: 'Channel Rate' },
  { key: 'stop_sell', label: 'Stop Sell' },
  { key: 'min_stay', label: 'Minimum Stay' },
  { key: 'max_stay', label: 'Maximum Stay' },
  { key: 'cta', label: 'Closed to Arrival' },
  { key: 'ctd', label: 'Closed to Departure' },
];

const QUICK_RANGES = [
  { label: 'Today', from: 0, to: 0 },
  { label: 'Tomorrow', from: 1, to: 1 },
  { label: 'Next 7 Days', from: 0, to: 6 },
  { label: 'Next 15 Days', from: 0, to: 14 },
  { label: 'Next 30 Days', from: 0, to: 29 },
  { label: 'This Month', from: 0, to: 30, dynamic: true },
  { label: 'Next Month', from: 0, to: 30, dynamic: true },
];

const BulkUpdateDrawer = ({ categories, defaultStart, defaultEnd, existingRestrictions, onClose, onApply }: {
  categories: RoomCategory[];
  defaultStart: string;
  defaultEnd: string;
  existingRestrictions?: Map<string, ChannelInventoryRestriction>;
  onClose: () => void;
  onApply: (updates: Array<Omit<ChannelInventoryRestriction, 'id' | 'hotel_id' | 'updated_at'>>) => Promise<void>;
}) => {
  const [fromDate, setFromDate] = useState(defaultStart);
  const [toDate, setToDate] = useState(defaultEnd);
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set(categories.map((c) => c.id)));
  const [updateType, setUpdateType] = useState<UpdateType>('availability');
  const [rateMode, setRateMode] = useState<RateMode>('fixed');
  const [valueNum, setValueNum] = useState('');
  const [boolVal, setBoolVal] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [applying, setApplying] = useState(false);

  const allDays = useMemo(() => daysBetween(fromDate, toDate), [fromDate, toDate]);

  const toggleCat = (id: string) => {
    const next = new Set(selectedCats);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedCats(next);
  };

  const applyQuickRange = (label: string) => {
    const today = todayStr();
    if (label === 'This Month') {
      const d = new Date();
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - 1;
      setFromDate(today);
      setToDate(addDays(today, last - d.getDate() + 1));
    } else if (label === 'Next Month') {
      const d = new Date();
      const firstNext = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const lastNext = new Date(d.getFullYear(), d.getMonth() + 2, 0);
      setFromDate(firstNext.toISOString().slice(0, 10));
      setToDate(lastNext.toISOString().slice(0, 10));
    } else {
      const qr = QUICK_RANGES.find((q) => q.label === label);
      if (qr) { setFromDate(addDays(today, qr.from)); setToDate(addDays(today, qr.to)); }
    }
  };

  // Compute preview
  const previewData = useMemo(() => {
    const dates = allDays.length;
    const cats = selectedCats.size;
    const total = dates * cats;
    return { dates, cats, total };
  }, [allDays, selectedCats]);

  const computeNewValue = (oldVal: number): number => {
    const v = parseFloat(valueNum) || 0;
    if (updateType === 'base_rate' || updateType === 'channel_rate') {
      switch (rateMode) {
        case 'fixed': return v;
        case 'inc_abs': return oldVal + v;
        case 'dec_abs': return Math.max(0, oldVal - v);
        case 'inc_pct': return Math.round(oldVal * (1 + v / 100));
        case 'dec_pct': return Math.round(oldVal * (1 - v / 100));
      }
    }
    return v;
  };

  const handleApply = async () => {
    setApplying(true);
    const updates: Array<Omit<ChannelInventoryRestriction, 'id' | 'hotel_id' | 'updated_at'>> = [];
    for (const catId of selectedCats) {
      for (const date of allDays) {
        const existing = existingRestrictions?.get(`${catId}|${date}`);
        const oldAvail = toNum(existing?.availability);
        const oldBase = toNum(existing?.base_rate);
        const oldChannel = toNum(existing?.channel_rate);
        const oldMin = toNum(existing?.min_stay);
        const oldMax = toNum(existing?.max_stay);
        const oldStop = Boolean(existing?.stop_sell);
        const oldCta = Boolean(existing?.closed_to_arrival);
        const oldCtd = Boolean(existing?.closed_to_departure);
        updates.push({
          room_category_id: catId,
          date,
          availability: updateType === 'availability' ? (parseInt(valueNum) || 0) : oldAvail,
          base_rate: updateType === 'base_rate' ? computeNewValue(oldBase) : oldBase,
          channel_rate: updateType === 'channel_rate' ? computeNewValue(oldChannel) : oldChannel,
          min_stay: updateType === 'min_stay' ? (parseInt(valueNum) || 1) : oldMin,
          max_stay: updateType === 'max_stay' ? (parseInt(valueNum) || 0) : oldMax,
          stop_sell: updateType === 'stop_sell' ? boolVal : oldStop,
          closed_to_arrival: updateType === 'cta' ? boolVal : oldCta,
          closed_to_departure: updateType === 'ctd' ? boolVal : oldCtd,
        });
      }
    }
    await onApply(updates);
    setApplying(false);
  };

  const needsNumber = updateType === 'availability' || updateType === 'min_stay' || updateType === 'max_stay' || updateType === 'base_rate' || updateType === 'channel_rate';
  const needsBool = updateType === 'stop_sell' || updateType === 'cta' || updateType === 'ctd';
  const needsRateMode = updateType === 'base_rate' || updateType === 'channel_rate';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md h-full overflow-y-auto shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-brand-navy-800">Bulk Update</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Date Range */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Date Range</label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[10px] text-slate-400">From</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-2 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">To</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-2 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_RANGES.map((q) => (
                <button
                  key={q.label}
                  onClick={() => applyQuickRange(q.label)}
                  className="text-[10px] font-semibold px-2.5 py-1.5 rounded-full border bg-white text-slate-500 border-slate-200 hover:border-brand-300 hover:text-brand-600 transition"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {/* Room Categories */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Room Categories</label>
              <button
                onClick={() => setSelectedCats(selectedCats.size === categories.length ? new Set() : new Set(categories.map((c) => c.id)))}
                className="text-[10px] font-semibold text-brand-600 hover:text-brand-700"
              >
                {selectedCats.size === categories.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleCat(c.id)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                    selectedCats.has(c.id) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-500 border-slate-200'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* Update Type */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Update Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {UPDATE_TYPES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setUpdateType(t.key)}
                  className={`text-xs font-semibold px-3 py-2 rounded-lg border transition ${
                    updateType === t.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Value fields */}
          {needsRateMode && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Rate Mode</label>
              <select
                value={rateMode}
                onChange={(e) => setRateMode(e.target.value as RateMode)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none"
              >
                <option value="fixed">Fixed Rate</option>
                <option value="inc_abs">Increase by Amount</option>
                <option value="dec_abs">Decrease by Amount</option>
                <option value="inc_pct">Increase by Percentage</option>
                <option value="dec_pct">Decrease by Percentage</option>
              </select>
            </div>
          )}

          {needsNumber && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                {updateType === 'availability' ? 'Rooms Available' : updateType === 'min_stay' || updateType === 'max_stay' ? 'Nights' : 'Amount'}
              </label>
              <input
                type="number"
                value={valueNum}
                onChange={(e) => setValueNum(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none"
                placeholder={needsRateMode ? 'Enter amount or percentage' : 'Enter value'}
              />
            </div>
          )}

          {needsBool && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Value</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setBoolVal(true)}
                  className={`flex-1 text-sm font-semibold py-2.5 rounded-lg border transition ${boolVal ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-500 border-slate-200'}`}
                >
                  {updateType === 'stop_sell' ? 'On' : 'Closed'}
                </button>
                <button
                  onClick={() => setBoolVal(false)}
                  className={`flex-1 text-sm font-semibold py-2.5 rounded-lg border transition ${!boolVal ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-500 border-slate-200'}`}
                >
                  {updateType === 'stop_sell' ? 'Off' : 'Open'}
                </button>
              </div>
            </div>
          )}

          {/* Preview */}
          {showPreview && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 animate-fade-in">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Summary</h4>
              <div className="text-xs space-y-1">
                <div className="flex justify-between"><span className="text-slate-400">Date Range:</span><span className="font-semibold text-slate-700">{fmtDate(fromDate)} – {fmtDate(toDate)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Dates Affected:</span><span className="font-semibold text-slate-700">{previewData.dates}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Categories:</span><span className="font-semibold text-slate-700">{previewData.cats}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Update Type:</span><span className="font-semibold text-slate-700">{UPDATE_TYPES.find((t) => t.key === updateType)?.label}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">New Value:</span><span className="font-semibold text-slate-700">
                  {needsBool ? (boolVal ? (updateType === 'stop_sell' ? 'On' : 'Closed') : (updateType === 'stop_sell' ? 'Off' : 'Open')) : valueNum || '0'}
                </span></div>
                <div className="flex justify-between border-t border-slate-200 pt-1 mt-1"><span className="text-slate-400">Total Updates:</span><span className="font-bold text-brand-600">{previewData.total}</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-4 flex items-center gap-2">
          <button onClick={onClose} className="flex-1 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl py-3 transition">Cancel</button>
          {!showPreview ? (
            <button
              onClick={() => setShowPreview(true)}
              disabled={selectedCats.size === 0 || allDays.length === 0 || (needsNumber && !valueNum)}
              className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold text-white bg-slate-600 hover:bg-slate-700 disabled:opacity-50 rounded-xl py-3 transition"
            >
              <Eye className="w-4 h-4" /> Preview
            </button>
          ) : (
            <button
              onClick={handleApply}
              disabled={applying}
              className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-xl py-3 transition"
            >
              {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Apply ({previewData.total})
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// OTA RESERVATIONS TAB
// ══════════════════════════════════════════════════════════════════

const ReservationsTab = ({ reservations, onChanged }: {
  reservations: ChannelOtaReservation[];
  onChanged: () => void;
}) => {
  const [viewing, setViewing] = useState<ChannelOtaReservation | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleAction = async (r: ChannelOtaReservation, action: string) => {
    try {
      if (action === 'import') {
        await updateOtaReservationStatus(r.id, 'imported');
      } else if (action === 'retry') {
        await updateOtaReservationStatus(r.id, 'pending');
      } else if (action === 'resolve') {
        await updateOtaReservationStatus(r.id, 'imported');
      }
      onChanged();
    } catch {
      // non-critical
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { fetchChannelReservations } = await import('../../lib/api-aiosell');
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // last 7 days
      const result = await fetchChannelReservations(startDate, endDate);
      
      let msg = 'Sync Complete!\n';
      if (result.stats) {
        msg += `Fetched: ${result.fetched}\n`;
        msg += `Imported: ${result.stats.imported}\n`;
        msg += `Updated: ${result.stats.updated}\n`;
        msg += `Mapping Required: ${result.stats.mapping_required}\n`;
        msg += `Failed: ${result.stats.failed}\n`;
        msg += `Skipped: ${result.stats.skipped}\n`;
      } else {
        msg += `Processed: ${result.processed || 0}\n`;
      }
      if (result.errors?.length > 0) {
         msg += `\nErrors: ${result.errors.length}`;
      }
      alert(msg);
      
      onChanged();
    } catch (err) {
      console.error('Sync failed', err);
      alert('Failed to sync reservations from channels');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-brand-navy-800">OTA Reservations</h3>
            <p className="text-xs text-slate-400 mt-0.5">Bookings received from connected OTA channels</p>
          </div>
          <button 
            onClick={handleSync} 
            disabled={syncing}
            className="flex items-center gap-2 bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
            Sync (7 Days)
          </button>
        </div>
        {reservations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">OTA / Channel</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Booking ID</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Guest / Mobile</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Check-in</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Check-out</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Category</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Amount</th>
                  <th className="text-center px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Booking</th>
                  <th className="text-center px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Import</th>
                  <th className="text-center px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 text-sm text-slate-600">{r.channel_name || 'OTA'}</td>
                    <td className="px-4 py-2.5 text-sm font-mono text-slate-600">{r.ota_booking_id}</td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-slate-800">{r.guest_name ?? '—'}<span className="block text-xs font-normal text-slate-400">{r.guest_mobile || '—'}</span></td>
                    <td className="px-4 py-2.5 text-sm text-slate-600">{r.check_in_date ?? '—'}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-600">{r.check_out_date ?? '—'}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-600">{r.room_category ?? '—'}<span className="block text-xs text-slate-400">{r.rate_plan || '—'}</span></td>
                    <td className="px-4 py-2.5 text-sm font-bold text-slate-800 text-right">{rs(toNum(r.amount))}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${STATUS_STYLES[r.reservation_status] ?? STATUS_STYLES[r.booking_status] ?? 'bg-slate-100 text-slate-500 border-slate-300'}`}>{r.booking_status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${STATUS_STYLES[r.import_status] ?? 'bg-slate-100 text-slate-500 border-slate-300'}`}>{r.import_status.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setViewing(r)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition" title="View"><Eye className="w-4 h-4" /></button>
                        {r.import_status === 'pending' && (
                          <button onClick={() => handleAction(r, 'import')} className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition" title="Import"><LogIn className="w-4 h-4" /></button>
                        )}
                        {r.import_status === 'failed' && (
                          <button onClick={() => handleAction(r, 'retry')} className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition" title="Retry"><RotateCw className="w-4 h-4" /></button>
                        )}
                        {r.import_status === 'needs_attention' && (
                          <button onClick={() => handleAction(r, 'resolve')} className="p-1.5 text-brand-500 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition" title="Mark Resolved"><CheckCircle2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No OTA reservations yet. Bookings from connected channels will appear here.</p>
          </div>
        )}
      </div>

      {/* View modal */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setViewing(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full p-5 animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-brand-navy-800">OTA Reservation Details</h3>
              <button onClick={() => setViewing(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">OTA Booking ID:</span><span className="font-mono font-semibold text-slate-700">{viewing.ota_booking_id}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Guest:</span><span className="font-semibold text-slate-700">{viewing.guest_name ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Room Category:</span><span className="font-semibold text-slate-700">{viewing.room_category ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Check-in:</span><span className="font-semibold text-slate-700">{viewing.check_in_date ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Check-out:</span><span className="font-semibold text-slate-700">{viewing.check_out_date ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Mobile:</span><span className="font-semibold text-slate-700">{viewing.guest_mobile || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Rate Plan:</span><span className="font-semibold text-slate-700">{viewing.rate_plan || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Amount:</span><span className="font-bold text-slate-800">{rs(toNum(viewing.amount))}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Payment:</span><span className="font-semibold text-slate-700">{viewing.payment_status || 'pending'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Booking Status:</span><span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${STATUS_STYLES[viewing.booking_status] ?? 'bg-slate-100 text-slate-500 border-slate-300'}`}>{viewing.booking_status}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Import Status:</span><span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${STATUS_STYLES[viewing.import_status] ?? 'bg-slate-100 text-slate-500 border-slate-300'}`}>{viewing.import_status.replace('_', ' ')}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Received:</span><span className="text-slate-600">{fmtDateTime(viewing.received_at ?? viewing.created_at)}</span></div>
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button onClick={() => setViewing(null)} className="flex-1 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl py-2.5 transition">Close</button>
              {viewing.import_status === 'pending' && (
                <button onClick={async () => { await handleAction(viewing, 'import'); setViewing(null); }} className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl py-2.5 transition">
                  <LogIn className="w-4 h-4" /> Import
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// CHANNELS TAB
// ══════════════════════════════════════════════════════════════════

const ChannelsTab = ({ isLiveMode }: {
  isLiveMode: boolean;
}) => {
  const [showAdd, setShowAdd] = useState(false);
  const [showFutureBookings, setShowFutureBookings] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-brand-navy-800">Connected Channels</h3>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-soft-blue hover:shadow-md transition">
          <Plus className="w-4 h-4" /> Add OTA Channel
        </button>
      </div>

      {isLiveMode ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card hover:shadow-card-hover transition-all p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-11 h-11 rounded-xl bg-brand-navy-50 flex items-center justify-center text-brand-600">
                    <Wifi className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Connected Channels</p>
                    <p className="text-[10px] text-slate-400">Unified API Distribution</p>
                  </div>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${STATUS_STYLES.connected}`}>Connected</span>
              </div>
              <div className="space-y-1 text-xs text-slate-500 mb-3">
                <p>Status: Live Sync Active</p>
                <p>Managed OTAs: See Channel Extranet</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  onClick={() => alert("Channel Discovery API coming soon.")}
                  className="flex-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg py-2 transition flex items-center justify-center gap-1.5"
                >
                  <SettingsIcon className="w-3 h-3" /> Manage Channels
                </a>
                <button
                  onClick={() => setShowFutureBookings(true)}
                  className="flex-1 text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg py-2 transition flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3 h-3" /> Pull Future Bookings
                </button>
              </div>
            </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-8 text-center">
          <WifiOff className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 mb-1">Channel Manager is not configured.</p>
          <p className="text-xs text-slate-400 mb-3">Configure your API credentials in Connection Settings to enable distribution.</p>
        </div>
      )}

      {showAdd && (
        <AddChannelModal
          isLiveMode={isLiveMode}
          onClose={() => setShowAdd(false)}
        />
      )}
      {showFutureBookings && (
        <FutureBookingsModal
          onClose={() => setShowFutureBookings(false)}
        />
      )}
    </div>
  );
};

const FutureBookingsModal = ({ onClose }: { onClose: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<'30' | '60' | '90'>('30');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date();
      const end = new Date();
      end.setDate(today.getDate() + parseInt(range, 10));
      
      const startDate = today.toISOString().split('T')[0];
      const endDate = end.toISOString().split('T')[0];
      
      const data = await fetchChannelFutureBookings(startDate, endDate);
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch future bookings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={!loading ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-5 animate-scale-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-brand-navy-800">Pull Future Bookings</h3>
          {!loading && <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>}
        </div>
        
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Select a date range to fetch and import future reservations from channels into your PMS.
          </p>
          
          <div className="flex flex-col gap-2">
            {[
              { id: '30', label: 'Next 30 Days' },
              { id: '60', label: 'Next 60 Days' },
              { id: '90', label: 'Next 90 Days' },
            ].map((option) => (
              <label key={option.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${range === option.id ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <div className={`w-4 h-4 rounded-full flex items-center justify-center border ${range === option.id ? 'border-brand-600 bg-brand-600' : 'border-slate-300'}`}>
                  {range === option.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <span className={`text-sm font-medium ${range === option.id ? 'text-brand-900' : 'text-slate-700'}`}>{option.label}</span>
              </label>
            ))}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg space-y-1">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Fetch Complete
              </div>
              <p>Fetched: {result.fetched} reservations</p>
              {result.stats && (
                <ul className="list-disc pl-5 mt-1 opacity-80">
                  <li>Imported: {result.stats.imported || 0}</li>
                  <li>Updated: {result.stats.updated || 0}</li>
                  <li>Mapping Required: {result.stats.mapping_required || 0}</li>
                  <li>Failed: {result.stats.failed || 0}</li>
                </ul>
              )}
            </div>
          )}
        </div>
        
        <div className="mt-6 flex items-center justify-end gap-3">
          <button onClick={onClose} disabled={loading} className="text-sm font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50">
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button 
              onClick={handleFetch} 
              disabled={loading}
              className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-soft-blue transition disabled:opacity-70 flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {loading ? 'Fetching...' : 'Start Import'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const AddChannelModal = ({ isLiveMode, onClose }: {
  isLiveMode: boolean;
  onClose: () => void;
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-5 animate-scale-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-brand-navy-800">Add OTA Channel</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-4">
          <div className="bg-brand-50 border border-brand-200 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-brand-800 mb-2">Unified Channel Manager</h4>
            <p className="text-xs text-brand-700 leading-relaxed">
              Your PMS is connected to the Connected Channels. Provider handles all distribution to OTAs (Booking.com, Expedia, Agoda, etc.) automatically.
            </p>
            <p className="text-xs text-brand-700 leading-relaxed mt-2">
              Connect and manage your OTAs seamlessly.
            </p>
          </div>
          
          {!isLiveMode && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
              <span className="font-semibold">Not Connected:</span> You must configure your Provider API credentials in the Connection Settings tab first.
            </p>
          )}
        </div>
        
        <div className="mt-6 flex items-center justify-end gap-3">
          <button onClick={onClose} className="text-sm font-semibold text-slate-500 hover:text-slate-700">Close</button>
          <a onClick={() => alert("Channel Discovery API coming soon.")} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-soft-blue transition">
            Refresh Channels
          </a>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// MAPPING TAB
// ══════════════════════════════════════════════════════════════════

const MappingTab = ({ categories, ratePlans, mappings, onChanged }: {
  categories: RoomCategory[];
  ratePlans: RatePlan[];
  mappings: ChannelManagerOverview['mappings'];
  onChanged: () => void;
}) => {
  const [editing, setEditing] = useState<{ catId: string; ratePlanId: string; externalRoomCode: string; externalRatePlan: string; mappingId?: string } | null>(null);
  const [channelMapping, setChannelMapping] = useState<any>(null);
  const [fetchingMapping, setFetchingMapping] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [mappingSuccess, setMappingSuccess] = useState(false);

  const handleFetchMapping = async () => {
    setFetchingMapping(true);
    setMappingError(null);
    setMappingSuccess(false);
    try {
      const data = await fetchChannelMapping();
      setChannelMapping(data);
      setMappingSuccess(true);
      setTimeout(() => setMappingSuccess(false), 3000);
    } catch (err: any) {
      setMappingError(err.message || 'Failed to fetch mapping');
    } finally {
      setFetchingMapping(false);
    }
  };

  const getMapping = (catId: string, ratePlanId: string) => {
    return mappings.find((m) => 
      m.room_category_id === catId && 
      (m.rate_plan_id === ratePlanId || (!m.rate_plan_id && !ratePlanId))
    );
  };

  const mappedCount = mappings.filter((m) => m.status === 'mapped').length;
  
  // A category is mapped if at least one of its rate plans (or its default rate plan) has a mapping
  const mappedCategoryIds = new Set(mappings.filter((m) => m.status === 'mapped').map((m) => m.room_category_id));
  const unmappedCount = categories.length - mappedCategoryIds.size;

  return (
    <div className="space-y-4">
      {mappingError && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 animate-fade-in">
          <AlertCircle className="w-4 h-4" />
          {mappingError}
        </div>
      )}
      {mappingSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4" />
          Provider mapping fetched successfully
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-3 text-center">
          <p className="text-2xl font-bold text-brand-600">{mappedCount}</p>
          <p className="text-[10px] text-slate-400 uppercase font-semibold mt-1">Mapped</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-3 text-center">
          <p className="text-2xl font-bold text-slate-400">{unmappedCount}</p>
          <p className="text-[10px] text-slate-400 uppercase font-semibold mt-1">Unmapped</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-3 text-center">
          <p className="text-2xl font-bold text-brand-navy-700">{categories.length}</p>
          <p className="text-[10px] text-slate-400 uppercase font-semibold mt-1">Categories</p>
        </div>
      </div>

      {/* Mapping table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-brand-navy-800">Room & Rate Plan Mapping</h3>
            <p className="text-xs text-slate-400 mt-0.5">Map Hotel Mantri categories and rate plans to Provider room types and rate plans</p>
          </div>
          <button 
            onClick={handleFetchMapping}
            disabled={fetchingMapping}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition disabled:opacity-50"
          >
            {fetchingMapping ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Fetching mapping...
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                Fetch Provider Mapping
              </>
            )}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Hotel Category</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Rate Plan</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">External Room</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">External Rate</th>
                <th className="text-center px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Status</th>
                <th className="text-center px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const catRatePlans = ratePlans.length > 0
                  ? ratePlans
                  : [{ id: '', plan_name: 'Default', plan_type: 'Base' as const, base_rate: cat.default_tariff }];
                return catRatePlans.map((rp, idx) => {
                  const mapping = getMapping(cat.id, rp.id);
                  return (
                    <tr key={`${cat.id}-${rp.id ?? 'default'}-${idx}`} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-sm font-semibold text-slate-800">{idx === 0 ? cat.name : ''}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-600">{rp.plan_name}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-600">{mapping?.external_room_code ?? '—'}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-600">{mapping?.external_rate_plan_code ?? '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${mapping ? STATUS_STYLES[mapping.status] : STATUS_STYLES.unmapped}`}>{mapping?.status ?? 'unmapped'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => setEditing({
                            catId: cat.id,
                            ratePlanId: rp.id,
                            externalRoomCode: mapping?.external_room_code ?? '',
                            externalRatePlan: mapping?.external_rate_plan_code ?? '',
                            mappingId: mapping?.id,
                          })}
                          className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                        >
                          {mapping ? 'Edit' : 'Map'}
                        </button>
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EditMappingModal
          data={editing}
          category={categories.find((c) => c.id === editing.catId)?.name ?? ''}
          ratePlan={ratePlans.find((r) => r.id === editing.ratePlanId)?.plan_name ?? 'Default'}
          onClose={() => setEditing(null)}
          onSave={async (aiosellRoom, aiosellRate, aiosellRoomName, aiosellRateName) => {
            await saveChannelRateMapping({
              room_category_id: editing.catId,
              rate_plan_id: editing.ratePlanId || null,
              external_room_code: aiosellRoom || null,
              external_rate_plan_code: aiosellRate || null,
              external_room_name: aiosellRoomName || null,
              external_rate_plan_name: aiosellRateName || null,
              provider: 'aiosell',
              status: (aiosellRoom && aiosellRate) ? 'mapped' : 'unmapped',
              is_active: true,
              mapping_error: null,
              last_sync_at: null,
            }, editing.mappingId);
            setEditing(null);
            onChanged();
          }}
          onDelete={editing.mappingId ? async () => {
            await deleteChannelRateMapping(editing.mappingId!);
            setEditing(null);
            onChanged();
          } : undefined}
          channelMapping={channelMapping}
        />
      )}
    </div>
  );
};

const EditMappingModal = ({ data, category, ratePlan, onClose, onSave, onDelete, channelMapping }: {
  data: { externalRoomCode: string; externalRatePlan: string; mappingId?: string };
  category: string;
  ratePlan: string;
  onClose: () => void;
  onSave: (aiosellRoom: string, aiosellRate: string, aiosellRoomName: string, aiosellRateName: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  channelMapping?: any;
}) => {
  const [externalRoomCode, setExternalRoomCode] = useState(data.externalRoomCode);
  const [externalRatePlan, setExternalRatePlan] = useState(data.externalRatePlan);
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-5 animate-scale-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-brand-navy-800">Edit Mapping</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-400">Hotel Category</p>
            <p className="text-sm font-semibold text-slate-800">{category}</p>
            <p className="text-xs text-slate-400 mt-1">Rate Plan</p>
            <p className="text-sm font-semibold text-slate-800">{ratePlan}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500">External Room Code</label>
            {channelMapping && channelMapping.rooms ? (
              <select value={externalRoomCode} onChange={(e) => setExternalRoomCode(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none">
                <option value="">Select a room...</option>
                {channelMapping.rooms.map((r: any) => (
                  <option key={r.room_id} value={r.room_id}>{r.room_name} ({r.room_id})</option>
                ))}
              </select>
            ) : (
              <input type="text" value={externalRoomCode} onChange={(e) => setExternalRoomCode(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" placeholder="Enter Provider room code (or Fetch Mapping first)" />
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">External Rate Plan Code</label>
            {channelMapping && channelMapping.ratePlans ? (
              <select value={externalRatePlan} onChange={(e) => setExternalRatePlan(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none">
                <option value="">Select a rate plan...</option>
                {channelMapping.ratePlans
                  .filter((rp: any) => !externalRoomCode || rp.room_id === externalRoomCode)
                  .map((rp: any) => (
                  <option key={rp.rate_plan_id} value={rp.rate_plan_id}>{rp.rate_plan_name} ({rp.rate_plan_id})</option>
                ))}
              </select>
            ) : (
              <input type="text" value={externalRatePlan} onChange={(e) => setExternalRatePlan(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" placeholder="Enter Provider rate plan code" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          {onDelete && (
            <button onClick={onDelete} className="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl py-2.5 px-3 transition">Delete</button>
          )}
          <button onClick={onClose} className="flex-1 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl py-2.5 transition">Cancel</button>
          <button
            onClick={async () => { 
              setSaving(true); 
              const rName = channelMapping?.rooms?.find((r:any) => r.room_id === externalRoomCode)?.room_name || '';
              const rpName = channelMapping?.ratePlans?.find((rp:any) => rp.rate_plan_id === externalRatePlan)?.rate_plan_name || '';
              await onSave(externalRoomCode, externalRatePlan, rName, rpName); 
              setSaving(false); 
            }}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-xl py-2.5 transition"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// SYNC LOGS TAB
// ══════════════════════════════════════════════════════════════════

const LOG_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'inventory', label: 'Availability Update' },
  { value: 'rate', label: 'Rate Update' },
  { value: 'restriction', label: 'Restriction Update' },
  { value: 'booking_new', label: 'Reservation Received' },
  { value: 'booking_modified', label: 'Reservation Modified' },
  { value: 'booking_cancelled', label: 'Reservation Cancelled' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All Status' },
  { value: 'success', label: 'Success' },
  { value: 'failure', label: 'Failure' },
  { value: 'retry', label: 'Retry' },
];

const LogsTab = ({ logs, connections }: {
  logs: ChannelSyncLog[];
  connections: ChannelConnection[];
}) => {
  const [filters, setFilters] = useState({ logType: 'all', status: 'all', channelConnectionId: 'all' });
  const [filtered, setFiltered] = useState<ChannelSyncLog[]>(logs);
  const [loading, setLoading] = useState(false);

  const applyFilters = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSyncLogs(100, {
        logType: filters.logType,
        status: filters.status,
        channelConnectionId: filters.channelConnectionId === 'all' ? undefined : filters.channelConnectionId,
      });
      setFiltered(data);
    } catch {
      setFiltered(logs);
    } finally {
      setLoading(false);
    }
  }, [filters, logs]);

  useEffect(() => { setFiltered(logs); }, [logs]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Action Type</label>
            <select
              value={filters.logType}
              onChange={(e) => setFilters({ ...filters, logType: e.target.value })}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none"
            >
              {LOG_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none"
            >
              {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Channel</label>
            <select
              value={filters.channelConnectionId}
              onChange={(e) => setFilters({ ...filters, channelConnectionId: e.target.value })}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none"
            >
              <option value="all">All Channels</option>
              {connections.map((c) => <option key={c.id} value={c.id}>{c.channel_name}</option>)}
            </select>
          </div>
        </div>
        <button
          onClick={applyFilters}
          disabled={loading}
          className="mt-3 flex items-center gap-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-lg px-4 py-2 transition"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />} Apply Filters
        </button>
      </div>

      {/* Logs table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-brand-navy-800">Sync Logs</h3>
        </div>
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Date & Time</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Channel</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Action Type</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Date Range</th>
                  <th className="text-center px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Message</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Error</th>
                  <th className="text-center px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Retry</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => {
                  const channel = connections.find((c) => c.id === l.channel_connection_id);
                  return (
                    <tr key={l.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-600">{channel?.channel_name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-600">{l.log_type}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{l.date_range ?? '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${STATUS_STYLES[l.status] ?? 'bg-slate-100 text-slate-500 border-slate-300'}`}>{l.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-slate-600">{l.message ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-red-500 max-w-[200px] truncate" title={l.error_detail ?? ''}>{l.error_detail ?? '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        {l.status === 'failure' && (
                          <button
                            onClick={async () => {
                              await retrySyncLog(l);
                              applyFilters();
                            }}
                            className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition"
                            title="Retry Sync"
                          >
                            <RotateCw className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <Zap className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No sync activity yet. Logs will appear here after channels are connected and syncing.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// SETTINGS TAB
// ══════════════════════════════════════════════════════════════════
const SettingsTab = ({ settings, onChanged }: {
  settings: ChannelSettings | null;
  onChanged: () => void;
}) => {
  const [enabled, setEnabled] = useState(settings?.channel_manager_enabled ?? false);
  const [hotelCode, setHotelCode] = useState(settings?.aiosell_hotel_code || '');
  const [partnerId, setPartnerId] = useState(settings?.aiosell_partner_id || '');
  const [environment, setEnvironment] = useState<'production' | 'test'>(settings?.aiosell_environment || 'production');
  const [providerTesting, setProviderTesting] = useState(false);
  const [providerTestResult, setProviderTestResult] = useState<{
    ok: boolean;
    message: string;
    details?: {
      status: number;
      responseTimeMs: number;
      hotelCode: string;
      partnerId: string;
      environment: string;
      roomsCount: number;
      ratePlansCount: number;
    }
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveChannelSettings({
        ...settings!,
        channel_manager_enabled: enabled,
        aiosell_hotel_code: hotelCode,
        aiosell_partner_id: partnerId,
        aiosell_environment: environment,
      });
      onChanged();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleTestProvider = async () => {
    setProviderTesting(true);
    setProviderTestResult(null);
    try {
      const res = await testChannelConnection();
      if (res.success) {
        setProviderTestResult({ 
          ok: true, 
          message: "✓ Provider Connected",
          details: {
            status: res.status,
            responseTimeMs: res.responseTimeMs,
            hotelCode: res.hotelCode,
            partnerId: res.partnerId,
            environment: res.environment,
            roomsCount: res.mapping?.rooms?.length || 0,
            ratePlansCount: res.mapping?.ratePlans?.length || 0,
          }
        });
        // Save success status automatically
        if (settings) {
          await saveChannelSettings({
            ...settings,
            aiosell_status: 'connected',
            aiosell_environment: res.environment as 'test' | 'production',
            aiosell_hotel_code: res.hotelCode,
            aiosell_partner_id: res.partnerId,
          });
          onChanged();
        }
      } else {
        const errMsg = typeof res.error === 'string' ? res.error : res.error?.message;
        setProviderTestResult({ ok: false, message: errMsg || "Failed to connect to Provider." });
        if (settings) {
          await saveChannelSettings({
            ...settings,
            aiosell_status: 'error',
          });
          onChanged();
        }
      }
    } catch (err: any) {
      const isAuthError = err?.status === 401 || err?.code === 'AUTHENTICATION_ERROR';
      setProviderTestResult({ 
        ok: false, 
        message: isAuthError ? "✕ Provider Authentication Failed" : (err?.message || "✕ Hotel Mantri Backend Unreachable") 
      });
      if (settings) {
        await saveChannelSettings({
          ...settings,
          aiosell_status: 'error',
        });
        onChanged();
      }
    } finally {
      setProviderTesting(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    try {
      await saveChannelSettings({ ...settings!, aiosell_status: 'disconnected', channel_manager_enabled: false });
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-brand-600" />
          <h3 className="text-sm font-bold text-brand-navy-800">Channel Connection Settings</h3>
          {environment === 'test' && (
            <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded bg-amber-100 text-amber-700">
              CHANNEL SANDBOX / TEST
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-4">Configure your PMS integration parameters.</p>

        <div className="mb-4">
          <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${settings?.aiosell_status === 'connected' ? STATUS_STYLES.connected : settings?.aiosell_status === 'error' ? STATUS_STYLES.error : 'bg-slate-100 text-slate-500 border-slate-300'}`}>
            {settings?.aiosell_status === 'connected' ? <><CheckCircle2 className="w-3 h-3 inline mr-1" /> Connected</> : settings?.aiosell_status === 'error' ? <><XCircle className="w-3 h-3 inline mr-1" /> Error</> : <><Clock className="w-3 h-3 inline mr-1" /> Disconnected</>}
          </span>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 mb-4">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
            Enable Channel Manager for this hotel
          </label>

          <div>
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5"><Building2 className="w-3 h-3" /> External Hotel Code</label>
            <input
              type="text"
              value={hotelCode}
              onChange={(e) => setHotelCode(e.target.value)}
              placeholder="Enter external hotel code"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5"><KeyRound className="w-3 h-3" /> External Partner ID</label>
            <input
              type="text"
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              placeholder="Enter external partner ID"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Environment</label>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setEnvironment('production')}
                className={`flex-1 text-sm font-semibold py-2.5 rounded-lg border transition ${environment === 'production' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                Production
              </button>
              <button
                onClick={() => setEnvironment('test')}
                className={`flex-1 text-sm font-semibold py-2.5 rounded-lg border transition ${environment === 'test' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                Test / Sandbox
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Credentials (username/password) are securely managed on the backend.</p>
          </div>
        </div>

        {providerTestResult && (
          <div className={`mt-4 rounded-lg p-3 flex flex-col gap-2 animate-fade-in ${providerTestResult.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-center gap-2">
              {providerTestResult.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
              <p className={`text-sm font-semibold ${providerTestResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>{providerTestResult.message}</p>
            </div>
            {providerTestResult.details && (
              <div className="text-xs text-emerald-700 ml-6 space-y-1">
                <p>HTTP Status: {providerTestResult.details.status}</p>
                <p>Response Time: {providerTestResult.details.responseTimeMs} ms</p>
                <p>Hotel: {providerTestResult.details.hotelCode}</p>
                <p>Rooms: {providerTestResult.details.roomsCount}</p>
                <p>Rate Plans: {providerTestResult.details.ratePlansCount}</p>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mt-4">
          <button
            onClick={handleTestProvider}
            disabled={providerTesting}
            className="flex items-center justify-center gap-2 text-sm font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 disabled:opacity-50 rounded-xl py-3 transition border border-brand-200"
          >
            {providerTesting ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing Channel Sandbox...</> : <><Plug className="w-4 h-4" /> Test Connection</>}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center justify-center gap-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-xl py-3 transition"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Setup
          </button>
        </div>

        {settings?.aiosell_status === 'connected' && (
          <button
            onClick={handleDisconnect}
            disabled={saving}
            className="w-full mt-2 flex items-center justify-center gap-2 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 rounded-xl py-2.5 transition"
          >
            <XCircle className="w-4 h-4" /> Disconnect
          </button>
        )}
      </div>
    </div>
  );
};


// ══════════════════════════════════════════════════════════════════
// DIAGNOSTICS TAB
// ══════════════════════════════════════════════════════════════════

const DiagnosticsTab = () => {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const runHealthCheck = async () => {
    setLoading(true);
    try {
      const data = await checkChannelStatus();
      setHealth(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePushInventory = async () => {
    setActionLoading('inventory');
    try {
      const today = new Date().toISOString().split('T')[0];
      const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      await pushChannelInventory(today, nextMonth);
      alert('Inventory push successful!');
    } catch (err: any) {
      alert(`Inventory push failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePushRates = async () => {
    setActionLoading('rates');
    try {
      const today = new Date().toISOString().split('T')[0];
      const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      await pushChannelRates(today, nextMonth);
      alert('Rates push successful!');
    } catch (err: any) {
      alert(`Rates push failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    runHealthCheck();
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Activity className="w-5 h-5 text-brand-600" /> System Diagnostics
          </h2>
          <button 
            onClick={runHealthCheck} 
            disabled={loading}
            className="px-4 py-2 bg-brand-50 text-brand-700 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-brand-100"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Run Diagnostics
          </button>
        </div>

        {health ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DiagnosticItem label="API Connection" status={health.connected ? 'pass' : 'fail'} value={health.connected ? 'Connected' : 'Failed'} />
            <DiagnosticItem label="Authentication" status={health.authentication === 'success' ? 'pass' : 'fail'} value={health.authentication === 'success' ? 'Successful' : 'Failed'} />
            <DiagnosticItem label="Partner ID" status={health.partnerId ? 'pass' : 'fail'} value={health.partnerId || 'Missing'} />
            <DiagnosticItem label="Hotel Code" status={health.hotelCode ? 'pass' : 'fail'} value={health.hotelCode || 'Missing'} />
            <DiagnosticItem label="Hotel Mapping" status={health.mappingConfigured ? 'pass' : 'fail'} value={health.mappingConfigured ? 'Configured' : 'Failed'} />
            <DiagnosticItem label="Environment" status="info" value={health.environment || 'Production'} />
            <DiagnosticItem label="Latency" status="info" value={health.latencyMs != null ? `${health.latencyMs} ms` : 'N/A'} />
            {health.errorMessage && (
               <div className="col-span-full mt-2 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
                 <strong>Error:</strong> {health.errorMessage}
               </div>
            )}
          </div>
        ) : (
          <div className="text-center py-10 text-slate-500 text-sm">Loading health check...</div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-6">
          <Server className="w-5 h-5 text-brand-600" /> Manual Sync Triggers
        </h2>
        <div className="flex gap-4">
          <button 
            onClick={handlePushInventory}
            disabled={!!actionLoading}
            className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-brand-700"
          >
            {actionLoading === 'inventory' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
            Push Inventory (30 Days)
          </button>
          <button 
            onClick={handlePushRates}
            disabled={!!actionLoading}
            className="px-5 py-2.5 border border-brand-600 text-brand-700 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-brand-50"
          >
            {actionLoading === 'rates' ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
            Push Rates (30 Days)
          </button>
        </div>
      </div>
    </div>
  );
};

const DiagnosticItem = ({ label, status, value }: { label: string, status: 'pass'|'fail'|'info', value: string }) => (
  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
    <span className="text-sm font-medium text-slate-600">{label}</span>
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-slate-900 capitalize">{value}</span>
      {status === 'pass' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
      {status === 'fail' && <XCircle className="w-4 h-4 text-red-500" />}
      {status === 'info' && <AlertCircle className="w-4 h-4 text-brand-500" />}
    </div>
  </div>
);
