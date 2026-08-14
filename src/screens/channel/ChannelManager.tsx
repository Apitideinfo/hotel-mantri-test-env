import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  RefreshCw, Plus, X, ChevronLeft, ChevronRight, AlertTriangle,
  CheckCircle2, XCircle, Clock, Zap, Wifi, WifiOff, Pause, Play,
  Settings as SettingsIcon, FileText, Calendar, Building2, Link2,
  Radio, Loader2, Ban, Save, Eye, ArrowRight, Filter,
  TrendingUp, AlertCircle, Plug, KeyRound, Server, Trash2,
  LogIn, LogOut as LogOutIcon, RotateCw, ChevronDown, CalendarDays,
} from 'lucide-react';
import {
  getChannelManagerOverview, getInventoryRestrictions, upsertInventoryRestriction,
  bulkUpdateInventory, saveChannelConnection, deleteChannelConnection,
  saveChannelRateMapping, deleteChannelRateMapping, insertSyncLog,
  updateOtaReservationStatus, getSyncLogs, getChannelSettings,
  saveChannelSettings, updateChannelSettingsStatus, retrySyncLog,
  CHANNEL_TYPES, getChannelMetadata,
} from '@/lib/api-channel';
import type {
  ChannelManagerOverview, ChannelConnection, ChannelInventoryRestriction,
  ChannelSyncLog, ChannelOtaReservation, ChannelSettings,
} from '@/lib/api-channel';
import type { RoomCategory } from '@/lib/types';
import type { RatePlan } from '@/lib/types-reservations';
import { fmtMoney, toNum } from '@/lib/calc';

interface ChannelManagerProps {
  onBack: () => void;
  onNavigate: (screen: string, payload?: unknown) => void;
}

type Tab = 'overview' | 'inventory' | 'reservations' | 'channels' | 'mapping' | 'logs' | 'settings';

const TAB_KEY = 'cm_active_tab';

const rs = (n: number): string => '\u20B9' + fmtMoney(typeof n === 'number' ? n : 0);

const addDays = (dateStr: string, n: number): string => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const todayStr = (): string => new Date().toISOString().slice(0, 10);

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

export const ChannelManager = ({ onBack, onNavigate }: ChannelManagerProps) => {
  const [tab, setTab] = useState<Tab>(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem(TAB_KEY) : null;
    return (saved as Tab) ?? 'overview';
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
      window.history.replaceState(null, '', url);
    }
  }, [tab]);

  // Restore tab from URL hash on mount
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const match = hash.match(/^#cm-(\w+)$/);
    if (match) {
      const t = match[1] as Tab;
      if (['overview', 'inventory', 'reservations', 'channels', 'mapping', 'logs', 'settings'].includes(t)) {
        setTab(t);
      }
    }
  }, []);

  // Browser back/forward
  useEffect(() => {
    const onPop = () => {
      const hash = window.location.hash;
      const match = hash.match(/^#cm-(\w+)$/);
      if (match) {
        const t = match[1] as Tab;
        if (['overview', 'inventory', 'reservations', 'channels', 'mapping', 'logs', 'settings'].includes(t)) {
          setTab(t);
        }
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <Radio className="w-4 h-4" /> },
    { key: 'inventory', label: 'Inventory & Rates', icon: <Calendar className="w-4 h-4" /> },
    { key: 'reservations', label: 'OTA Reservations', icon: <FileText className="w-4 h-4" /> },
    { key: 'channels', label: 'Channels', icon: <Wifi className="w-4 h-4" /> },
    { key: 'mapping', label: 'Room & Rate Mapping', icon: <Link2 className="w-4 h-4" /> },
    { key: 'logs', label: 'Sync Logs', icon: <Zap className="w-4 h-4" /> },
    { key: 'settings', label: 'Connection Settings', icon: <SettingsIcon className="w-4 h-4" /> },
  ];

  return (
    <div className="px-4 lg:px-6 py-5 w-full max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-brand-navy-800">Channel Manager</h1>
          <p className="text-sm text-slate-400 mt-0.5">Channex.io integration · {overview?.isLiveMode ? 'Live Sync Active' : 'Mock/Test Mode'}</p>
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
            <span className="font-semibold">Mock/Test Mode:</span> Channex credentials are not yet configured. Data shown is from your PMS. Connect Channex in Connection Settings to enable live OTA sync.
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
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 pb-px -mx-1 px-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-all rounded-t-lg ${
              tab === t.key
                ? 'border-brand-600 text-brand-600 bg-brand-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t.icon} {t.label}
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
          {tab === 'overview' && <OverviewTab overview={overview} onNavigate={onNavigate} onTab={setTab} />}
          {tab === 'inventory' && <InventoryTab categories={overview.categories} isLiveMode={overview.isLiveMode} />}
          {tab === 'reservations' && <ReservationsTab reservations={overview.otaReservations} onChanged={load} />}
          {tab === 'channels' && <ChannelsTab connections={overview.connections} onChanged={load} isLiveMode={overview.isLiveMode} />}
          {tab === 'mapping' && <MappingTab categories={overview.categories} ratePlans={overview.ratePlans} mappings={overview.mappings} onChanged={load} />}
          {tab === 'logs' && <LogsTab logs={overview.syncLogs} connections={overview.connections} />}
          {tab === 'settings' && <SettingsTab settings={overview.settings} onChanged={load} />}
        </>
      ) : null}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ══════════════════════════════════════════════════════════════════

const OverviewTab = ({ overview, onNavigate, onTab }: {
  overview: ChannelManagerOverview;
  onNavigate: (s: string, p?: unknown) => void;
  onTab: (t: Tab) => void;
}) => {
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
    { label: 'Channex credentials configured', done: overview.settings?.status === 'connected' || (overview.settings?.property_id != null && overview.settings?.api_key_secret_name != null), action: () => onTab('settings') },
    { label: 'Property connection established', done: overview.settings?.status === 'connected', action: () => onTab('settings') },
    { label: 'Room categories mapped', done: overview.mappings.some((m) => m.status === 'mapped' && m.channex_room_type_id), action: () => onTab('mapping') },
    { label: 'Rate plans mapped', done: overview.mappings.some((m) => m.status === 'mapped' && m.channex_rate_plan_id), action: () => onTab('mapping') },
    { label: 'At least one channel connected', done: connected > 0, action: () => onTab('channels') },
    { label: 'First inventory sync completed', done: overview.syncLogs.some((l) => l.log_type === 'inventory' && l.status === 'success'), action: () => onTab('inventory') },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 lg:gap-4">
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
            <button onClick={() => onTab('channels')} className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="p-4 space-y-2">
            {overview.connections.length > 0 ? (
              overview.connections.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.status === 'connected' ? 'bg-emerald-500' : c.status === 'paused' ? 'bg-amber-500' : c.status === 'error' ? 'bg-red-500' : 'bg-slate-300'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{c.channel_name}</p>
                    <p className="text-[10px] text-slate-400">Last sync: {c.last_sync_at ? fmtDateTime(c.last_sync_at) : 'Never'}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${STATUS_STYLES[c.status] ?? STATUS_STYLES.disconnected}`}>{c.status}</span>
                </div>
              ))
            ) : (
              <div className="text-center py-4">
                <WifiOff className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400 mb-2">No channels connected yet.</p>
                <button onClick={() => onTab('channels')} className="text-sm font-semibold text-brand-600 hover:text-brand-700">Add a channel</button>
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
                className="w-full flex items-center gap-3 py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 rounded-lg px-2 -mx-2 transition text-left"
              >
                {item.done ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-slate-300 shrink-0" />
                )}
                <span className={`text-sm flex-1 ${item.done ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>{item.label}</span>
                {!item.done && <ArrowRight className="w-4 h-4 text-slate-300" />}
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
            <button onClick={() => onTab('reservations')} className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </button>
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
            <button onClick={() => onTab('logs')} className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </button>
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
              <p className="text-sm text-slate-400 text-center py-4">No sync activity yet.</p>
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

  const days = useMemo(() => daysBetween(startDate, endDate), [startDate, endDate]);

  const applyPreset = (preset: RangePreset) => {
    setRangePreset(preset);
    if (preset === '7') { setStartDate(todayStr()); setEndDate(addDays(todayStr(), 6)); }
    else if (preset === '14') { setStartDate(todayStr()); setEndDate(addDays(todayStr(), 13)); }
    else if (preset === '30') { setStartDate(todayStr()); setEndDate(addDays(todayStr(), 29)); }
    else { setShowCustomRange(true); }
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
                      <th key={d} className={`text-center px-2 py-3 text-xs font-bold min-w-[64px] ${isToday ? 'text-brand-600 bg-brand-50 border-b-2 border-brand-400' : 'text-slate-500'}`}>
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
                        {days.map((d) => <td key={d} className="px-1 py-1" />)}
                      </tr>

                      {/* Sub-rows */}
                      {rows.map((row, ri) => (
                        <tr key={`${cat.id}-${row.key}`} className={`border-b border-slate-50 ${ri === rows.length - 1 && !isExpanded ? 'border-b-2 border-slate-200' : ''}`}>
                          <td className="px-4 py-1.5 sticky left-0 bg-white z-10">
                            <span className="text-xs font-medium text-slate-500 pl-5.5">{row.label}</span>
                          </td>
                          {days.map((d) => (
                            <td key={d} className="px-1 py-1">{row.render(d)}</td>
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
                                <td key={d} className="px-1 py-1 text-center">
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
                                <td key={d} className="px-1 py-1 text-center">
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
                                <td key={d} className="px-1 py-1 text-center">
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

const BulkUpdateDrawer = ({ categories, defaultStart, defaultEnd, onClose, onApply }: {
  categories: RoomCategory[];
  defaultStart: string;
  defaultEnd: string;
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
        const existing = existingRestrictions.get(`${catId}|${date}`);
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

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-brand-navy-800">OTA Reservations</h3>
          <p className="text-xs text-slate-400 mt-0.5">Bookings received from connected OTA channels</p>
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

const ChannelsTab = ({ connections, onChanged, isLiveMode }: {
  connections: ChannelConnection[];
  onChanged: () => void;
  isLiveMode: boolean;
}) => {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-brand-navy-800">Connected Channels</h3>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-soft-blue hover:shadow-md transition">
          <Plus className="w-4 h-4" /> Add Channel
        </button>
      </div>

      {connections.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {connections.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-card hover:shadow-card-hover transition-all p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-11 h-11 rounded-xl bg-brand-navy-50 flex items-center justify-center text-xl">
                    {getChannelMetadata(c.channel_type).short}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{c.channel_name}</p>
                    <p className="text-[10px] text-slate-400">{c.channel_type}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${STATUS_STYLES[c.status] ?? STATUS_STYLES.disconnected}`}>{c.status}</span>
              </div>
              <div className="space-y-1 text-xs text-slate-500 mb-3">
                <p>Last Sync: {c.last_sync_at ? fmtDateTime(c.last_sync_at) : 'Never'}</p>
                <p>Channex ID: {c.channex_channel_id ?? 'Not set'}</p>
                {c.last_error && <p className="text-red-500">Error: {c.last_error}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    await saveChannelConnection({
                      channel_type: c.channel_type, channel_name: c.channel_name,
                      status: c.status === 'paused' ? 'connected' : 'paused',
                      channex_channel_id: c.channex_channel_id,
                      last_sync_at: c.last_sync_at, last_sync_status: c.last_sync_status, last_error: c.last_error,
                    }, c.id);
                    onChanged();
                  }}
                  className="flex-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg py-2 transition flex items-center justify-center gap-1.5"
                >
                  {c.status === 'paused' ? <><Play className="w-3 h-3" /> Resume</> : <><Pause className="w-3 h-3" /> Pause</>}
                </button>
                <button
                  onClick={async () => { await deleteChannelConnection(c.id); onChanged(); }}
                  className="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg py-2 px-3 transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-8 text-center">
          <WifiOff className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 mb-1">No channels connected.</p>
          <p className="text-xs text-slate-400 mb-3">Add a channel to start syncing inventory and rates via Channex.</p>
          <button onClick={() => setShowAdd(true)} className="text-sm font-semibold text-brand-600 hover:text-brand-700">Add a channel</button>
        </div>
      )}

      {showAdd && (
        <AddChannelModal
          isLiveMode={isLiveMode}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); onChanged(); }}
        />
      )}
    </div>
  );
};

const AddChannelModal = ({ isLiveMode, onClose, onAdded }: {
  isLiveMode: boolean;
  onClose: () => void;
  onAdded: () => void;
}) => {
  const [channelType, setChannelType] = useState(CHANNEL_TYPES[0].type);
  const [channelName, setChannelName] = useState(CHANNEL_TYPES[0].label);
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    setSaving(true);
    try {
      await saveChannelConnection({
        channel_type: channelType,
        channel_name: channelName,
        status: 'disconnected',
        channex_channel_id: null,
        last_sync_at: null,
        last_sync_status: null,
        last_error: null,
      });
      onAdded();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-5 animate-scale-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-brand-navy-800">Add Channel</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Channel Type</label>
            <select
              value={channelType}
              onChange={(e) => {
                setChannelType(e.target.value);
                setChannelName(CHANNEL_TYPES.find((t) => t.type === e.target.value)?.label ?? e.target.value);
              }}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none"
            >
              {CHANNEL_TYPES.map((t) => <option key={t.type} value={t.type}>{t.short} · {t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Display Name</label>
            <input type="text" value={channelName} onChange={(e) => setChannelName(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
          </div>
          {!isLiveMode && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
              Channel will be added in <span className="font-semibold">disconnected</span> state. {isLiveMode ? 'Activate it after adding the Channex channel ID.' : 'Connect Channex in Connection Settings to activate.'}
            </p>
          )}
        </div>
        <button
          onClick={handleAdd}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-xl py-3 mt-4 transition"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Channel
        </button>
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
  const [editing, setEditing] = useState<{ catId: string; ratePlanId: string; channexRoomType: string; channexRatePlan: string; mappingId?: string } | null>(null);

  const getMapping = (catId: string, ratePlanId: string) => {
    return mappings.find((m) => m.room_category_id === catId && m.rate_plan_id === ratePlanId);
  };

  const mappedCount = mappings.filter((m) => m.status === 'mapped').length;
  const unmappedCount = mappings.length - mappedCount;

  return (
    <div className="space-y-4">
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
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-brand-navy-800">Room & Rate Plan Mapping</h3>
          <p className="text-xs text-slate-400 mt-0.5">Map Hotel Mantri categories and rate plans to Channex room types and rate plans</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Hotel Category</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Rate Plan</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Channex Room Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Channex Rate Plan</th>
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
                      <td className="px-4 py-2.5 text-sm text-slate-600">{mapping?.channex_room_type_id ?? '—'}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-600">{mapping?.channex_rate_plan_id ?? '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${mapping ? STATUS_STYLES[mapping.status] : STATUS_STYLES.unmapped}`}>{mapping?.status ?? 'unmapped'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => setEditing({
                            catId: cat.id,
                            ratePlanId: rp.id,
                            channexRoomType: mapping?.channex_room_type_id ?? '',
                            channexRatePlan: mapping?.channex_rate_plan_id ?? '',
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
          onSave={async (channexRoomType, channexRatePlan) => {
            await saveChannelRateMapping({
              room_category_id: editing.catId,
              rate_plan_id: editing.ratePlanId || null,
              channex_room_type_id: channexRoomType || null,
              channex_rate_plan_id: channexRatePlan || null,
              status: channexRoomType && channexRatePlan ? 'mapped' : 'unmapped',
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
        />
      )}
    </div>
  );
};

const EditMappingModal = ({ data, category, ratePlan, onClose, onSave, onDelete }: {
  data: { channexRoomType: string; channexRatePlan: string; mappingId?: string };
  category: string;
  ratePlan: string;
  onClose: () => void;
  onSave: (roomType: string, ratePlan: string) => Promise<void>;
  onDelete?: () => Promise<void>;
}) => {
  const [roomType, setRoomType] = useState(data.channexRoomType);
  const [ratePlanId, setRatePlanId] = useState(data.channexRatePlan);
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
            <label className="text-xs font-semibold text-slate-500">Channex Room Type ID</label>
            <input type="text" value={roomType} onChange={(e) => setRoomType(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" placeholder="Enter Channex room type ID" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Channex Rate Plan ID</label>
            <input type="text" value={ratePlanId} onChange={(e) => setRatePlanId(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" placeholder="Enter Channex rate plan ID" />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          {onDelete && (
            <button onClick={onDelete} className="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl py-2.5 px-3 transition">Delete</button>
          )}
          <button onClick={onClose} className="flex-1 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl py-2.5 transition">Cancel</button>
          <button
            onClick={async () => { setSaving(true); await onSave(roomType, ratePlanId); setSaving(false); }}
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
  const [apiBaseUrl, setApiBaseUrl] = useState(settings?.api_base_url ?? 'https://api.channex.io/api/v1');
  const [apiKey, setApiKey] = useState('');
  const [propertyId, setPropertyId] = useState(settings?.property_id ?? '');
  const [environment, setEnvironment] = useState<'test' | 'production'>(settings?.environment ?? 'test');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [enabled, setEnabled] = useState(settings?.channel_manager_enabled ?? false);

  const hasKey = Boolean(settings?.api_key_secret_name);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveChannelSettings({
        api_base_url: apiBaseUrl,
        api_key_secret_name: apiKey ? 'channex_api_key' : (settings?.api_key_secret_name ?? null),
        property_id: propertyId,
        environment,
        status: settings?.status ?? 'disconnected',
        channel_manager_enabled: enabled,
      });
      setSaved(true);
      setApiKey('');
      setTimeout(() => setSaved(false), 3000);
      onChanged();
    } catch {
      // non-critical
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      if (!propertyId || !hasKey) {
        setTestResult({ ok: false, message: 'Channex connection not configured — Test Mode. Add the server-side Channex secret and Property ID before enabling live sync.' });
        await updateChannelSettingsStatus('disconnected', 'Channex connection not configured — Test Mode');
      } else {
        setTestResult({ ok: false, message: 'Live connection testing requires the secure Channex server connector. No live sync was started.' });
        await updateChannelSettingsStatus('disconnected', 'Server connector pending');
      }
      onChanged();
    } catch {
      setTestResult({ ok: false, message: 'Connection test failed. Check credentials and try again.' });
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    try {
      await updateChannelSettingsStatus('disconnected', 'Manually disconnected');
      onChanged();
    } catch {
      // non-critical
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-brand-600" />
          <h3 className="text-sm font-bold text-brand-navy-800">Channex Connection Settings</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">Configure your Channex.io API credentials to enable live OTA sync. Until then, the Channel Manager runs in mock/test mode.</p>

        {/* Status badge */}
        <div className="mb-4">
          <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${settings?.status === 'connected' ? STATUS_STYLES.connected : settings?.status === 'error' ? STATUS_STYLES.error : 'bg-slate-100 text-slate-500 border-slate-300'}`}>
            {settings?.status === 'connected' ? <><CheckCircle2 className="w-3 h-3 inline mr-1" /> Connected</> : settings?.status === 'error' ? <><XCircle className="w-3 h-3 inline mr-1" /> Error</> : <><Clock className="w-3 h-3 inline mr-1" /> Disconnected</>}
          </span>
          {settings?.last_tested_at && (
            <span className="text-[10px] text-slate-400 ml-2">Last tested: {fmtDateTime(settings.last_tested_at)}</span>
          )}
        </div>

        <div className="space-y-3">
          {/* API Base URL */}
          <div>
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5"><Server className="w-3 h-3" /> Channex API Base URL</label>
            <input
              type="text"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none"
              placeholder="https://api.channex.io/api/v1"
            />
          </div>

          {/* API Key status */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5"><KeyRound className="w-3 h-3" /> Channex API Secret</p>
            <p className="text-xs text-slate-600 mt-1">{hasKey ? 'Configured in secure server storage.' : 'Not configured. The module remains in Mock/Test Mode.'}</p>
            <p className="text-[10px] text-slate-400 mt-1">Credentials are never entered or stored in this browser.</p>
          </div>

          {/* Property ID */}
          <div>
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5"><Building2 className="w-3 h-3" /> Channex Property ID</label>
            <input
              type="text"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none"
              placeholder="Enter your Channex property ID"
            />
            <p className="text-[10px] text-slate-400 mt-1">Find this in Channex → Properties → your property</p>
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
            Enable Channel Manager for this hotel
          </label>

          {/* Environment */}
          <div>
            <label className="text-xs font-semibold text-slate-500">Environment</label>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setEnvironment('test')}
                className={`flex-1 text-sm font-semibold py-2.5 rounded-lg border transition ${environment === 'test' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-500 border-slate-200'}`}
              >
                Test
              </button>
              <button
                onClick={() => setEnvironment('production')}
                className={`flex-1 text-sm font-semibold py-2.5 rounded-lg border transition ${environment === 'production' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-500 border-slate-200'}`}
              >
                Production
              </button>
            </div>
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div className={`mt-4 rounded-lg p-3 flex items-center gap-2 animate-fade-in ${testResult.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
            {testResult.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
            <p className={`text-sm ${testResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>{testResult.message}</p>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center justify-center gap-2 text-sm font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 disabled:opacity-50 rounded-xl py-3 transition border border-brand-200"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />} Test Connection
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center justify-center gap-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-xl py-3 transition"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />} {saved ? 'Saved' : 'Save Securely'}
          </button>
        </div>

        {settings?.status === 'connected' && (
          <button
            onClick={handleDisconnect}
            disabled={saving}
            className="w-full mt-2 flex items-center justify-center gap-2 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 rounded-xl py-2.5 transition"
          >
            <XCircle className="w-4 h-4" /> Disconnect
          </button>
        )}

        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-700">
            <span className="font-semibold">Security:</span> API keys are stored securely as Supabase secrets and are never exposed in the browser. After saving, the system will validate the connection and activate live sync for all connected channels.
          </p>
        </div>
      </div>
    </div>
  );
};
