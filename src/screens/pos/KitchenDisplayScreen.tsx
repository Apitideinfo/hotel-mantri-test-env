import { useEffect, useState, useCallback, useRef } from 'react';
import {
  ArrowLeft, Search, Clock, X, ChefHat, CheckCircle2, AlertTriangle,
  Flame, UtensilsCrossed, BedDouble, ShoppingBag, Armchair, Printer,
  Zap, ArrowRight,
} from 'lucide-react';
import type { KotStatus, PosOrderType } from '@/lib/types';
import { KOT_COLUMNS } from '@/lib/types';
import {
  getActiveKots, updateKotStatus, cancelKot, setKotPriority,
  getKitchenSummary,
} from '@/lib/api-pos';
import type { KotWithDetails, KitchenSummary } from '@/lib/api-pos';

interface KitchenDisplayScreenProps {
  onBack: () => void;
}

type OrderTypeFilter = 'all' | PosOrderType;

const STATUS_FLOW: KotStatus[] = ['sent', 'preparing', 'ready', 'served'];

const NEXT_STATUS: Record<string, { status: KotStatus; label: string; icon: React.ReactNode; cls: string }> = {
  sent: { status: 'preparing', label: 'Start Preparing', icon: <ChefHat className="w-3.5 h-3.5" />, cls: 'bg-amber-500 hover:bg-amber-600' },
  preparing: { status: 'ready', label: 'Mark Ready', icon: <CheckCircle2 className="w-3.5 h-3.5" />, cls: 'bg-emerald-500 hover:bg-emerald-600' },
  ready: { status: 'served', label: 'Mark Served', icon: <CheckCircle2 className="w-3.5 h-3.5" />, cls: 'bg-slate-500 hover:bg-slate-600' },
};

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function isUrgent(isoDate: string): boolean {
  const mins = (Date.now() - new Date(isoDate).getTime()) / 60000;
  return mins >= 15;
}

export const KitchenDisplayScreen = ({ onBack }: KitchenDisplayScreenProps) => {
  const [kots, setKots] = useState<KotWithDetails[]>([]);
  const [summary, setSummary] = useState<KitchenSummary>({ newCount: 0, preparingCount: 0, readyCount: 0, avgPrepMinutes: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderTypeFilter>('all');
  const [search, setSearch] = useState('');

  const [cancelModalKot, setCancelModalKot] = useState<KotWithDetails | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const [printKot, setPrintKot] = useState<KotWithDetails | null>(null);

  const [tick, setTick] = useState(0); // forces re-render for timeAgo

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [activeKots, sum] = await Promise.all([getActiveKots(), getKitchenSummary()]);
      setKots(activeKots);
      setSummary(sum);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load kitchen data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + safe auto-refresh (30s polling — no realtime subscriptions to avoid loops)
  useEffect(() => {
    loadData();
    pollRef.current = setInterval(loadData, 30000);
    tickRef.current = setInterval(() => setTick((t) => t + 1), 30000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [loadData]);

  // Filtered KOTs
  const filteredKots = kots.filter((k) => {
    if (orderTypeFilter !== 'all' && k.order_type !== orderTypeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchKot = k.kot_number.toLowerCase().includes(q);
      const matchTable = k.table_name?.toLowerCase().includes(q);
      const matchRoom = k.room_no?.toLowerCase().includes(q);
      if (!matchKot && !matchTable && !matchRoom) return false;
    }
    return true;
  });

  const kotsByStatus = (status: KotStatus) => filteredKots.filter((k) => k.kot_status === status);

  const handleAdvance = async (kot: KotWithDetails) => {
    const next = NEXT_STATUS[kot.kot_status];
    if (!next) return;
    try {
      await updateKotStatus(kot.id, next.status);
      setKots((prev) => prev.map((k) => (k.id === kot.id ? { ...k, kot_status: next.status } : k)));
      // Update summary counts
      setSummary((prev) => {
        const adjust: Record<string, number> = { sent: 0, preparing: 0, ready: 0 };
        adjust[kot.kot_status] = -1;
        adjust[next.status] = 1;
        return {
          ...prev,
          newCount: Math.max(0, prev.newCount + (adjust['sent'] || 0)),
          preparingCount: Math.max(0, prev.preparingCount + (adjust['preparing'] || 0)),
          readyCount: Math.max(0, prev.readyCount + (adjust['ready'] || 0)),
        };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update KOT status');
    }
  };

  const handleBackwards = async (kot: KotWithDetails, targetStatus: KotStatus) => {
    if (!confirm(`Move this KOT back to "${KOT_COLUMNS.find((c) => c.status === targetStatus)?.label}"?`)) return;
    try {
      await updateKotStatus(kot.id, targetStatus);
      setKots((prev) => prev.map((k) => (k.id === kot.id ? { ...k, kot_status: targetStatus } : k)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update KOT status');
    }
  };

  const handleCancel = async () => {
    if (!cancelModalKot || !cancelReason.trim()) return;
    setCancelling(true);
    try {
      await cancelKot(cancelModalKot.id, cancelReason.trim());
      setKots((prev) => prev.filter((k) => k.id !== cancelModalKot.id));
      setCancelModalKot(null);
      setCancelReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel KOT');
    } finally {
      setCancelling(false);
    }
  };

  const handleTogglePriority = async (kot: KotWithDetails) => {
    const newPriority = kot.priority === 'urgent' ? 'normal' : 'urgent';
    try {
      await setKotPriority(kot.id, newPriority);
      setKots((prev) => prev.map((k) => (k.id === kot.id ? { ...k, priority: newPriority } : k)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update priority');
    }
  };

  const orderTypeIcon = (type: PosOrderType) => {
    if (type === 'dine_in') return <Armchair className="w-3.5 h-3.5" />;
    if (type === 'room_service') return <BedDouble className="w-3.5 h-3.5" />;
    return <ShoppingBag className="w-3.5 h-3.5" />;
  };

  const orderTypeLabel = (type: PosOrderType) =>
    type === 'dine_in' ? 'Dine-In' : type === 'room_service' ? 'Room Service' : 'Takeaway';

  // Summary cards
  const summaryCards = [
    { label: 'New', value: summary.newCount, color: 'text-blue-600', bg: 'bg-blue-50', icon: <ChefHat className="w-5 h-5" /> },
    { label: 'Preparing', value: summary.preparingCount, color: 'text-amber-600', bg: 'bg-amber-50', icon: <Flame className="w-5 h-5" /> },
    { label: 'Ready', value: summary.readyCount, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: <CheckCircle2 className="w-5 h-5" /> },
    { label: 'Avg Prep Time', value: summary.avgPrepMinutes !== null ? `${summary.avgPrepMinutes}m` : '—', color: 'text-slate-600', bg: 'bg-slate-50', icon: <Clock className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-brand-600" />
            <h1 className="text-lg font-bold text-brand-navy-800">Kitchen Display</h1>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {summaryCards.map((card) => (
            <div key={card.label} className={`rounded-xl ${card.bg} p-2.5 flex items-center gap-2`}>
              <div className={`${card.color}`}>{card.icon}</div>
              <div>
                <p className="text-lg font-bold text-slate-800 tabular-nums leading-none">{card.value}</p>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mt-0.5">{card.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 flex-1 min-w-[140px]">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search KOT no, table, room…"
              className="bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none w-full"
            />
          </div>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(['all', 'dine_in', 'room_service', 'takeaway'] as OrderTypeFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setOrderTypeFilter(f)}
                className={`px-3 py-2 text-xs font-semibold transition ${orderTypeFilter === f ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                {f === 'all' ? 'All' : f === 'dine_in' ? 'Dine-In' : f === 'room_service' ? 'Room' : 'Takeaway'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* KDS Board */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4" data-tick={tick}>
            {KOT_COLUMNS.map((col) => {
              const colKots = kotsByStatus(col.status);
              return (
                <div key={col.status} className="flex flex-col">
                  {/* Column header */}
                  <div className={`rounded-xl border-2 ${col.color} px-3 py-2 mb-3 flex items-center justify-between sticky top-[140px]`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                      <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{col.label}</h2>
                    </div>
                    <span className="text-xs font-bold text-slate-500 bg-white rounded-full px-2 py-0.5 tabular-nums">{colKots.length}</span>
                  </div>

                  {/* KOT cards */}
                  <div className="space-y-3 min-h-[100px]">
                    {colKots.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-300">No KOTs</div>
                    ) : (
                      colKots.map((kot) => {
                        const urgent = kot.priority === 'urgent' || isUrgent(kot.created_at);
                        return (
                          <div
                            key={kot.id}
                            className={`rounded-xl border-2 bg-white p-3 shadow-sm transition ${urgent && kot.kot_status !== 'served' ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200'}`}
                          >
                            {/* KOT header */}
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-bold text-slate-800">{kot.kot_number}</p>
                                  {kot.priority === 'urgent' && (
                                    <span className="flex items-center gap-0.5 rounded-full bg-red-50 border border-red-200 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-500">
                                      <Zap className="w-2.5 h-2.5" /> Urgent
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500">
                                  <span className="flex items-center gap-0.5">{orderTypeIcon(kot.order_type)} {orderTypeLabel(kot.order_type)}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-slate-400">
                                <Clock className="w-3 h-3" />
                                <span className={urgent && kot.kot_status !== 'served' ? 'text-red-500 font-semibold' : ''}>{timeAgo(kot.created_at)}</span>
                              </div>
                            </div>

                            {/* Table / Room */}
                            <div className="flex items-center gap-1.5 mb-2 text-xs">
                              {kot.table_name && (
                                <span className="rounded-md bg-brand-50 text-brand-700 font-semibold px-2 py-0.5 flex items-center gap-1">
                                  <Armchair className="w-3 h-3" /> {kot.table_name}
                                </span>
                              )}
                              {kot.room_no && (
                                <span className="rounded-md bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 flex items-center gap-1">
                                  <BedDouble className="w-3 h-3" /> Room {kot.room_no}
                                </span>
                              )}
                              {kot.guest_name && (
                                <span className="text-slate-400 truncate">{kot.guest_name}</span>
                              )}
                            </div>

                            {/* Items */}
                            <div className="space-y-1 mb-3 border-t border-slate-100 pt-2">
                              {kot.items.map((item) => (
                                <div key={item.id} className="flex items-start gap-1.5 text-sm">
                                  <span className="font-bold text-slate-700 tabular-nums shrink-0">{item.quantity}×</span>
                                  <span className="flex items-center gap-1">
                                    {item.is_veg ? <span className="w-2 h-2 rounded-sm border border-emerald-500 bg-emerald-50 shrink-0" /> : <span className="w-2 h-2 rounded-sm border border-red-400 bg-red-50 shrink-0" />}
                                    <span className="text-slate-700">{item.name}</span>
                                  </span>
                                  {item.note && (
                                    <span className="text-xs text-amber-600 font-medium ml-auto">Note: {item.note}</span>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Actions */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                              {NEXT_STATUS[kot.kot_status] && (
                                <button
                                  onClick={() => handleAdvance(kot)}
                                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition ${NEXT_STATUS[kot.kot_status].cls}`}
                                >
                                  {NEXT_STATUS[kot.kot_status].icon}
                                  {NEXT_STATUS[kot.kot_status].label}
                                </button>
                              )}

                              {/* Backward status (with confirmation) */}
                              {kot.kot_status !== 'sent' && (
                                <button
                                  onClick={() => {
                                    const idx = STATUS_FLOW.indexOf(kot.kot_status);
                                    if (idx > 0) handleBackwards(kot, STATUS_FLOW[idx - 1]);
                  }}
                                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600 transition"
                                  title="Move back (requires confirmation)"
                                >
                                  ←
                                </button>
                              )}

                              <button
                                onClick={() => setPrintKot(kot)}
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-brand-600 transition"
                                title="View / Print KOT"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleTogglePriority(kot)}
                                className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${kot.priority === 'urgent' ? 'border-red-200 bg-red-50 text-red-500' : 'border-slate-200 text-slate-400 hover:text-amber-500'}`}
                                title="Toggle urgent priority"
                              >
                                <Zap className="w-3.5 h-3.5" />
                              </button>

                              {kot.kot_status !== 'served' && (
                                <button
                                  onClick={() => { setCancelModalKot(kot); setCancelReason(''); }}
                                  className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-red-500 transition ml-auto"
                                  title="Cancel KOT"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cancel modal */}
      {cancelModalKot && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-navy/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setCancelModalKot(null); }}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h2 className="text-base font-bold text-brand-navy-800">Cancel {cancelModalKot.kot_number}</h2>
              </div>
              <button onClick={() => setCancelModalKot(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              This KOT will be marked as cancelled and kept in history. It will not be hard-deleted.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation (required)…"
              rows={3}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent transition placeholder:text-slate-400 resize-none"
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setCancelModalKot(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Close</button>
              <button
                onClick={handleCancel}
                disabled={!cancelReason.trim() || cancelling}
                className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-60"
              >
                {cancelling ? 'Cancelling…' : 'Cancel KOT'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print / View modal */}
      {printKot && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-navy/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setPrintKot(null); }}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-brand-navy-800">KOT Print View</h2>
              <div className="flex items-center gap-1">
                <button onClick={() => window.print()} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:text-brand-600 transition" title="Print">
                  <Printer className="w-4 h-4" />
                </button>
                <button onClick={() => setPrintKot(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>
            </div>

            {/* Thermal-friendly KOT format */}
            <div className="font-mono text-sm text-slate-800 border border-dashed border-slate-300 rounded-lg p-4">
              <div className="text-center mb-3">
                <p className="font-bold text-base">Hotel Mantri</p>
                <p className="text-xs text-slate-500">Kitchen Order Ticket</p>
              </div>
              <div className="border-t border-dashed border-slate-300 pt-2 mb-2 space-y-0.5">
                <div className="flex justify-between">
                  <span className="font-bold">{printKot.kot_number}</span>
                  <span className="text-xs">{new Date(printKot.created_at).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>{orderTypeLabel(printKot.order_type)}</span>
                  {printKot.table_name && <span>Table: {printKot.table_name}</span>}
                  {printKot.room_no && <span>Room: {printKot.room_no}</span>}
                </div>
                {printKot.guest_name && (
                  <div className="text-xs text-slate-500">Guest: {printKot.guest_name}</div>
                )}
              </div>
              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
                {printKot.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="font-bold tabular-nums">{item.quantity} × {item.name}</span>
                  </div>
                ))}
                {printKot.items.some((it) => it.note) && (
                  <div className="border-t border-dashed border-slate-300 pt-1 mt-1 space-y-0.5">
                    {printKot.items.filter((it) => it.note).map((it) => (
                      <div key={it.id} className="text-xs text-slate-500">
                        {it.name}: {it.note}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-dashed border-slate-300 pt-2 mt-3 text-center text-xs text-slate-400">
                — No prices on kitchen KOT —
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
