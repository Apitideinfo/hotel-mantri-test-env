import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Shirt, Plus, X, RefreshCw, Loader2, AlertTriangle, CheckCircle2, Clock,
  ArrowDownToLine, ArrowUpFromLine, Trash2, Eye, Save, Building2, Package,
  ChevronDown, ChevronLeft, Calendar, IndianRupee, Phone, MapPin, Filter,
  AlertCircle, Ban,
} from 'lucide-react';
import {
  getLaundryDashboard, getLaundryVendors, getLinenItems, saveLaundryVendor,
  saveLinenItem, deleteLaundryVendor, deleteLinenItem, saveDispatch, deleteDispatch,
  getDispatchDetail, saveReceipt,
  DEFAULT_LINEN_ITEMS, LINEN_CATEGORIES,
} from '@/lib/api-laundry-linen';
import type {
  LaundryDashboardData, LaundryVendor, LinenItem, LaundryDispatch,
  LaundryDispatchItem, LaundryReceipt, DispatchWithReceipts, ReceiptItemEntry,
} from '@/lib/api-laundry-linen';
import { fmtMoney, toNum } from '@/lib/calc';

interface LaundryLinenScreenProps {
  onBack: () => void;
}

type Tab = 'overview' | 'dispatches' | 'pending' | 'history';

const todayStr = (): string => new Date().toISOString().slice(0, 10);

const rs = (n: number): string => '\u20B9' + fmtMoney(typeof n === 'number' ? n : 0);

const fmtDate = (d: string): string => {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const STATUS_STYLES: Record<string, string> = {
  'Sent': 'bg-blue-100 text-blue-700 border-blue-200',
  'Partially Received': 'bg-amber-100 text-amber-700 border-amber-200',
  'Completed': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Short/Lost': 'bg-red-100 text-red-700 border-red-200',
};

const getMonthRange = (date: string): { start: string; end: string } => {
  const d = new Date(date + 'T00:00:00');
  const start = date.slice(0, 7) + '-01';
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { start, end };
};

const getWeekRange = (date: string): { start: string; end: string } => {
  const d = new Date(date + 'T00:00:00');
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
};

// ══════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════

export const LaundryLinenScreen = ({ onBack }: LaundryLinenScreenProps) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [data, setData] = useState<LaundryDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDispatch, setShowDispatch] = useState(false);
  const [showVendor, setShowVendor] = useState(false);
  const [showLinen, setShowLinen] = useState(false);
  const [receiveDispatch, setReceiveDispatch] = useState<LaundryDispatch | null>(null);
  const [viewDispatch, setViewDispatch] = useState<LaundryDispatch | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const d = await getLaundryDashboard(selectedDate);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { load(); }, [load]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'dispatches', label: 'Dispatches' },
    { key: 'pending', label: 'Pending' },
    { key: 'history', label: 'History' },
  ];

  return (
    <div className="px-4 lg:px-6 py-5 w-full max-w-[1400px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-brand-navy-800">Laundry & Linen</h1>
          <p className="text-sm text-slate-400 mt-0.5">Date-wise hotel linen tracking</p>
        </div>
        <button
          onClick={() => setShowDispatch(true)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-soft-blue hover:shadow-md transition-all active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" /> New Laundry Dispatch
        </button>
      </div>

      {/* Date controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-sm font-semibold text-slate-700 focus:outline-none bg-transparent"
          />
        </div>
        <button
          onClick={() => setSelectedDate(todayStr())}
          className="text-xs font-semibold px-3 py-2.5 rounded-xl border bg-white text-slate-600 border-slate-200 hover:border-brand-300 hover:text-brand-600 transition"
        >
          Today
        </button>
        <button
          onClick={() => { const r = getWeekRange(selectedDate); setSelectedDate(r.start); }}
          className="text-xs font-semibold px-3 py-2.5 rounded-xl border bg-white text-slate-600 border-slate-200 hover:border-brand-300 hover:text-brand-600 transition"
        >
          This Week
        </button>
        <button
          onClick={() => { const r = getMonthRange(selectedDate); setSelectedDate(r.start); }}
          className="text-xs font-semibold px-3 py-2.5 rounded-xl border bg-white text-slate-600 border-slate-200 hover:border-brand-300 hover:text-brand-600 transition"
        >
          This Month
        </button>
        <button onClick={load} className="ml-auto p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={load} className="ml-auto text-xs font-semibold text-red-700 hover:text-red-800">Retry</button>
        </div>
      )}

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <SummaryCard label="Sent to Laundry" value={data.totalSent} icon={<ArrowUpFromLine className="w-5 h-5" />} color="text-blue-600" bg="bg-blue-50" />
          <SummaryCard label="Received Back" value={data.totalReceived} icon={<ArrowDownToLine className="w-5 h-5" />} color="text-emerald-600" bg="bg-emerald-50" />
          <SummaryCard label="Pending" value={data.totalPending} icon={<Clock className="w-5 h-5" />} color="text-amber-600" bg="bg-amber-50" />
          <SummaryCard label="Damaged / Lost" value={data.totalDamaged} icon={<AlertCircle className="w-5 h-5" />} color="text-red-600" bg="bg-red-50" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 pb-px">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-all rounded-t-lg ${
              tab === t.key ? 'border-brand-600 text-brand-600 bg-brand-50/50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && !data ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-brand-600 animate-spin" /></div>
      ) : data ? (
        <>
          {tab === 'overview' && (
            <OverviewTab data={data} selectedDate={selectedDate} onReceive={setReceiveDispatch} onView={setViewDispatch} />
          )}
          {tab === 'dispatches' && (
            <DispatchesTab data={data} onReceive={setReceiveDispatch} onView={setViewDispatch} onDelete={async (id) => { await deleteDispatch(id); load(); }} />
          )}
          {tab === 'pending' && <PendingTab data={data} onReceive={setReceiveDispatch} onView={setViewDispatch} />}
          {tab === 'history' && <HistoryTab data={data} onView={setViewDispatch} />}
        </>
      ) : null}

      {/* Quick actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <QuickAction label="New Laundry Dispatch" icon={<Plus className="w-4 h-4" />} onClick={() => setShowDispatch(true)} />
        <QuickAction label="Receive from Laundry" icon={<ArrowDownToLine className="w-4 h-4" />} onClick={() => setTab('pending')} />
        <QuickAction label="Add Laundry Vendor" icon={<Building2 className="w-4 h-4" />} onClick={() => setShowVendor(true)} />
        <QuickAction label="Linen Master" icon={<Package className="w-4 h-4" />} onClick={() => setShowLinen(true)} />
      </div>

      {/* Modals */}
      {showDispatch && (
        <NewDispatchModal
          vendors={data?.vendors ?? []}
          linenItems={data?.linenItems ?? []}
          defaultDate={selectedDate}
          onClose={() => setShowDispatch(false)}
          onSaved={() => { setShowDispatch(false); load(); }}
        />
      )}
      {showVendor && (
        <VendorModal onClose={() => setShowVendor(false)} onSaved={() => { setShowVendor(false); load(); }} />
      )}
      {showLinen && (
        <LinenMasterModal onClose={() => setShowLinen(false)} onSaved={() => { setShowLinen(false); load(); }} />
      )}
      {receiveDispatch && (
        <ReceiveModal
          dispatchId={receiveDispatch.id}
          dispatchNo={receiveDispatch.dispatch_no}
          vendorName={receiveDispatch.vendor_name}
          dispatchDate={receiveDispatch.dispatch_date}
          challanNo={receiveDispatch.challan_no}
          onClose={() => setReceiveDispatch(null)}
          onSaved={() => { setReceiveDispatch(null); load(); }}
        />
      )}
      {viewDispatch && (
        <ViewDispatchModal
          dispatchId={viewDispatch.id}
          onClose={() => setViewDispatch(null)}
          onReceive={() => { setViewDispatch(null); setReceiveDispatch(viewDispatch); }}
        />
      )}
    </div>
  );
};

// ── Summary Card ──
const SummaryCard = ({ label, value, icon, color, bg }: {
  label: string; value: number; icon: React.ReactNode; color: string; bg: string;
}) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-card hover:shadow-card-hover transition-all p-4">
    <div className="flex items-center justify-between mb-3">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg} ${color}`}>{icon}</div>
    </div>
    <p className={`text-2xl font-bold tabular-nums leading-none ${color}`}>{value}</p>
    <p className="text-[10px] text-slate-400 mt-1.5">pieces</p>
  </div>
);

// ── Quick Action ──
const QuickAction = ({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl p-3.5 hover:border-brand-300 hover:shadow-card transition text-left group"
  >
    <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center group-hover:bg-brand-100 transition">{icon}</div>
    <span className="text-sm font-semibold text-slate-700">{label}</span>
  </button>
);

// ══════════════════════════════════════════════════════════════════
// OVERVIEW TAB — Today's dispatch summary by linen item
// ══════════════════════════════════════════════════════════════════

const OverviewTab = ({ data, selectedDate, onReceive, onView }: {
  data: LaundryDashboardData;
  selectedDate: string;
  onReceive: (d: LaundryDispatch) => void;
  onView: (d: LaundryDispatch) => void;
}) => {
  // Build per-item summary for selected date
  const itemSummary = useMemo(() => {
    const map = new Map<string, { sent: number; received: number; damaged: number }>();
    const dateDispatchIds = new Set(data.dispatches.filter((d) => d.dispatch_date === selectedDate).map((d) => d.id));
    for (const it of data.dispatchItems) {
      if (!dateDispatchIds.has(it.dispatch_id)) continue;
      const cur = map.get(it.item_name) ?? { sent: 0, received: 0, damaged: 0 };
      cur.sent += it.sent_qty;
      map.set(it.item_name, cur);
    }
    for (const r of data.receipts) {
      if (!dateDispatchIds.has(r.dispatch_id)) continue;
      for (const it of r.items_json ?? []) {
        const cur = map.get(it.item_name) ?? { sent: 0, received: 0, damaged: 0 };
        cur.received += it.received_now ?? 0;
        cur.damaged += it.damaged_lost ?? 0;
        map.set(it.item_name, cur);
      }
    }
    const rows = Array.from(map.entries()).map(([item, v]) => ({
      item, sent: v.sent, received: v.received, damaged: v.damaged,
      pending: Math.max(0, v.sent - v.received - v.damaged),
    }));
    return rows;
  }, [data, selectedDate]);

  const getItemStatus = (sent: number, received: number, damaged: number): string => {
    if (sent <= 0) return 'Sent';
    if (received + damaged >= sent) return damaged > 0 ? 'Short/Lost' : 'Completed';
    if (received > 0 || damaged > 0) return 'Partially Received';
    return 'Sent';
  };

  // Cost section
  return (
    <div className="space-y-4">
      {/* Today's dispatch summary */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-brand-navy-800">Dispatch Summary — {fmtDate(selectedDate)}</h3>
        </div>
        {itemSummary.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Linen Item</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Sent Qty</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Received Qty</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Pending</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Damaged/Lost</th>
                  <th className="text-center px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {itemSummary.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 text-sm font-semibold text-slate-800">{r.item}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-600 text-right tabular-nums">{r.sent}</td>
                    <td className="px-4 py-2.5 text-sm text-emerald-600 text-right tabular-nums">{r.received}</td>
                    <td className="px-4 py-2.5 text-sm text-amber-600 text-right tabular-nums font-semibold">{r.pending}</td>
                    <td className="px-4 py-2.5 text-sm text-red-600 text-right tabular-nums">{r.damaged}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${STATUS_STYLES[getItemStatus(r.sent, r.received, r.damaged)]}`}>{getItemStatus(r.sent, r.received, r.damaged)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <Shirt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No linen dispatched on {fmtDate(selectedDate)}.</p>
          </div>
        )}
      </div>

      {/* Laundry cost */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Selected Date Cost</p>
          <p className="text-xl font-bold text-brand-navy-700 mt-2 tabular-nums">{rs(data.dateCost)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">MTD Laundry Cost</p>
          <p className="text-xl font-bold text-brand-600 mt-2 tabular-nums">{rs(data.mtdCost)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vendor Outstanding</p>
          <p className="text-xl font-bold text-amber-600 mt-2 tabular-nums">{rs(data.vendorOutstanding)}</p>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// DISPATCHES TAB
// ══════════════════════════════════════════════════════════════════

const DispatchesTab = ({ data, onReceive, onView, onDelete }: {
  data: LaundryDashboardData;
  onReceive: (d: LaundryDispatch) => void;
  onView: (d: LaundryDispatch) => void;
  onDelete: (id: string) => Promise<void>;
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-brand-navy-800">All Dispatches</h3>
      </div>
      {data.dispatches.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Dispatch No.</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Vendor</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Challan</th>
                <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Amount</th>
                <th className="text-center px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Status</th>
                <th className="text-center px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.dispatches.map((d) => (
                <tr key={d.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 text-sm font-mono font-semibold text-slate-700">{d.dispatch_no || '—'}</td>
                  <td className="px-4 py-2.5 text-sm text-slate-600">{fmtDate(d.dispatch_date)}</td>
                  <td className="px-4 py-2.5 text-sm font-semibold text-slate-800">{d.vendor_name || '—'}</td>
                  <td className="px-4 py-2.5 text-sm text-slate-500">{d.challan_no || '—'}</td>
                  <td className="px-4 py-2.5 text-sm font-bold text-slate-700 text-right tabular-nums">{rs(d.total_amount)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${STATUS_STYLES[d.status]}`}>{d.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => onView(d)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition" title="View"><Eye className="w-4 h-4" /></button>
                      {d.status !== 'Completed' && d.status !== 'Short/Lost' && (
                        <button onClick={() => onReceive(d)} className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition" title="Receive Laundry"><ArrowDownToLine className="w-4 h-4" /></button>
                      )}
                      <button onClick={() => { if (confirm('Delete this dispatch and all its items/receipts?')) onDelete(d.id); }} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Delete"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center">
          <Shirt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No dispatches yet. Click "New Laundry Dispatch" to create one.</p>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// PENDING TAB — Vendor-wise pending
// ══════════════════════════════════════════════════════════════════

const PendingTab = ({ data, onReceive, onView }: {
  data: LaundryDashboardData;
  onReceive: (d: LaundryDispatch) => void;
  onView: (d: LaundryDispatch) => void;
}) => {
  const vendorPending = useMemo(() => {
    const vMap = new Map<string, { vendorName: string; pendingPieces: number; oldestDate: string; expectedReturn: string | null; dispatchIds: string[] }>();
    const recvMap = new Map<string, number>();
    const dmgMap = new Map<string, number>();
    for (const r of data.receipts) {
      for (const it of r.items_json ?? []) {
        const key = `${r.dispatch_id}|${it.item_name}`;
        recvMap.set(key, (recvMap.get(key) ?? 0) + (it.received_now ?? 0));
        dmgMap.set(key, (dmgMap.get(key) ?? 0) + (it.damaged_lost ?? 0));
      }
    }
    for (const d of data.dispatches) {
      if (d.status === 'Completed' || d.status === 'Short/Lost') continue;
      const dItems = data.dispatchItems.filter((it) => it.dispatch_id === d.id);
      let pending = 0;
      for (const it of dItems) {
        const key = `${it.dispatch_id}|${it.item_name}`;
        pending += Math.max(0, it.sent_qty - (recvMap.get(key) ?? 0) - (dmgMap.get(key) ?? 0));
      }
      if (pending <= 0) continue;
      const vKey = d.vendor_id ?? d.vendor_name ?? 'unknown';
      const cur = vMap.get(vKey) ?? { vendorName: d.vendor_name || 'Unknown', pendingPieces: 0, oldestDate: d.dispatch_date, expectedReturn: d.expected_return_date, dispatchIds: [] };
      cur.pendingPieces += pending;
      if (d.dispatch_date < cur.oldestDate) cur.oldestDate = d.dispatch_date;
      if (d.expected_return_date && (!cur.expectedReturn || d.expected_return_date < cur.expectedReturn)) cur.expectedReturn = d.expected_return_date;
      cur.dispatchIds.push(d.id);
      vMap.set(vKey, cur);
    }
    return Array.from(vMap.values()).sort((a, b) => b.pendingPieces - a.pendingPieces);
  }, [data]);

  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-brand-navy-800">Vendor-wise Pending</h3>
        <p className="text-xs text-slate-400 mt-0.5">Linen still with laundry vendors</p>
      </div>
      {vendorPending.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Vendor Name</th>
                <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Pending Pieces</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Oldest Pending Since</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Expected Return</th>
                <th className="text-center px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {vendorPending.map((v, i) => {
                const key = `${v.vendorName}-${i}`;
                const isExpanded = expandedVendor === key;
                const vendorDispatches = data.dispatches.filter((d) => v.dispatchIds.includes(d.id));
                return (
                  <React.Fragment key={key}>
                    <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 cursor-pointer" onClick={() => setExpandedVendor(isExpanded ? null : key)}>
                      <td className="px-4 py-2.5 text-sm font-semibold text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                          {v.vendorName}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-sm font-bold text-amber-600 text-right tabular-nums">{v.pendingPieces}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-500">{fmtDate(v.oldestDate)}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-500">{v.expectedReturn ? fmtDate(v.expectedReturn) : '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <button onClick={(e) => { e.stopPropagation(); setExpandedVendor(isExpanded ? null : key); }} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                          {isExpanded ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && vendorDispatches.map((d) => {
                      const dItems = data.dispatchItems.filter((it) => it.dispatch_id === d.id);
                      let dPending = 0;
                      const recvMap = new Map<string, number>();
                      const dmgMap = new Map<string, number>();
                      for (const r of data.receipts.filter((r) => r.dispatch_id === d.id)) {
                        for (const it of r.items_json ?? []) {
                          recvMap.set(it.item_name, (recvMap.get(it.item_name) ?? 0) + (it.received_now ?? 0));
                          dmgMap.set(it.item_name, (dmgMap.get(it.item_name) ?? 0) + (it.damaged_lost ?? 0));
                        }
                      }
                      for (const it of dItems) dPending += Math.max(0, it.sent_qty - (recvMap.get(it.item_name) ?? 0) - (dmgMap.get(it.item_name) ?? 0));
                      return (
                        <tr key={d.id} className="bg-amber-50/30 border-b border-slate-50">
                          <td className="px-4 py-2 pl-10 text-xs font-mono text-slate-500">{d.dispatch_no}</td>
                          <td className="px-4 py-2 text-xs text-amber-600 text-right font-semibold tabular-nums">{dPending}</td>
                          <td className="px-4 py-2 text-xs text-slate-500">{fmtDate(d.dispatch_date)}</td>
                          <td className="px-4 py-2 text-xs text-slate-500">{d.expected_return_date ? fmtDate(d.expected_return_date) : '—'}</td>
                          <td className="px-4 py-2 text-center">
                            <button onClick={() => onView(d)} className="p-1 text-slate-400 hover:text-brand-600 rounded transition" title="View"><Eye className="w-3.5 h-3.5" /></button>
                            <button onClick={() => onReceive(d)} className="p-1 text-emerald-500 hover:text-emerald-700 rounded transition" title="Receive"><ArrowDownToLine className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No pending linen. All dispatched items have been received.</p>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// HISTORY TAB
// ══════════════════════════════════════════════════════════════════

const HistoryTab = ({ data, onView }: {
  data: LaundryDashboardData;
  onView: (d: LaundryDispatch) => void;
}) => {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let result = data.dispatches;
    if (fromDate) result = result.filter((d) => d.dispatch_date >= fromDate);
    if (toDate) result = result.filter((d) => d.dispatch_date <= toDate);
    if (vendorFilter !== 'all') result = result.filter((d) => (d.vendor_id ?? '') === vendorFilter || d.vendor_name === data.vendors.find((v) => v.id === vendorFilter)?.vendor_name);
    if (statusFilter !== 'all') result = result.filter((d) => d.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((d) => d.dispatch_no.toLowerCase().includes(q) || d.vendor_name.toLowerCase().includes(q) || d.challan_no.toLowerCase().includes(q));
    }
    return result;
  }, [data, fromDate, toDate, vendorFilter, statusFilter, search]);

  // Build per-dispatch received/damaged/pending
  const dispatchStats = useMemo(() => {
    const stats = new Map<string, { sent: number; received: number; damaged: number; pending: number }>();
    const recvMap = new Map<string, number>();
    const dmgMap = new Map<string, number>();
    for (const r of data.receipts) {
      for (const it of r.items_json ?? []) {
        const key = `${r.dispatch_id}|${it.item_name}`;
        recvMap.set(key, (recvMap.get(key) ?? 0) + (it.received_now ?? 0));
        dmgMap.set(key, (dmgMap.get(key) ?? 0) + (it.damaged_lost ?? 0));
      }
    }
    for (const d of data.dispatches) {
      let sent = 0, received = 0, damaged = 0;
      for (const it of data.dispatchItems.filter((i) => i.dispatch_id === d.id)) {
        sent += it.sent_qty;
        const key = `${it.dispatch_id}|${it.item_name}`;
        received += recvMap.get(key) ?? 0;
        damaged += dmgMap.get(key) ?? 0;
      }
      stats.set(d.id, { sent, received, damaged, pending: Math.max(0, sent - received - damaged) });
    }
    return stats;
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">From Date</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">To Date</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Vendor</label>
            <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none">
              <option value="all">All Vendors</option>
              {data.vendors.map((v) => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none">
              <option value="all">All Status</option>
              <option value="Sent">Sent</option>
              <option value="Partially Received">Partially Received</option>
              <option value="Completed">Completed</option>
              <option value="Short/Lost">Short/Lost</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Search</label>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Dispatch no, vendor..." className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
          </div>
        </div>
      </div>

      {/* History table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-brand-navy-800">History ({filtered.length})</h3>
        </div>
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Dispatch No.</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Vendor</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Sent</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Received</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Pending</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Damaged/Lost</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Amount</th>
                  <th className="text-center px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Status</th>
                  <th className="text-center px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">View</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const s = dispatchStats.get(d.id) ?? { sent: 0, received: 0, damaged: 0, pending: 0 };
                  return (
                    <tr key={d.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-sm font-mono font-semibold text-slate-700">{d.dispatch_no || '—'}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-600">{fmtDate(d.dispatch_date)}</td>
                      <td className="px-4 py-2.5 text-sm font-semibold text-slate-800">{d.vendor_name || '—'}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-600 text-right tabular-nums">{s.sent}</td>
                      <td className="px-4 py-2.5 text-sm text-emerald-600 text-right tabular-nums">{s.received}</td>
                      <td className="px-4 py-2.5 text-sm text-amber-600 text-right tabular-nums font-semibold">{s.pending}</td>
                      <td className="px-4 py-2.5 text-sm text-red-600 text-right tabular-nums">{s.damaged}</td>
                      <td className="px-4 py-2.5 text-sm font-bold text-slate-700 text-right tabular-nums">{rs(d.total_amount)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${STATUS_STYLES[d.status]}`}>{d.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button onClick={() => onView(d)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition" title="View"><Eye className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <Shirt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No dispatches match the filters.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// NEW DISPATCH MODAL
// ══════════════════════════════════════════════════════════════════

interface DispatchRow {
  linen_item_id: string | null;
  item_name: string;
  sent_qty: number;
  rate_per_piece: number;
  amount: number;
}

const NewDispatchModal = ({ vendors, linenItems, defaultDate, onClose, onSaved }: {
  vendors: LaundryVendor[];
  linenItems: LinenItem[];
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [dispatchDate, setDispatchDate] = useState(defaultDate);
  const [vendorId, setVendorId] = useState('');
  const [challanNo, setChallanNo] = useState('');
  const [expectedReturn, setExpectedReturn] = useState('');
  const [remarks, setRemarks] = useState('');
  const [sentBy, setSentBy] = useState('');
  const [rows, setRows] = useState<DispatchRow[]>([
    { linen_item_id: null, item_name: '', sent_qty: 0, rate_per_piece: 0, amount: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);

  const updateRow = (idx: number, patch: Partial<DispatchRow>) => {
    setRows((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const next = { ...r, ...patch };
      next.amount = (next.sent_qty ?? 0) * (next.rate_per_piece ?? 0);
      return next;
    }));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { linen_item_id: null, item_name: '', sent_qty: 0, rate_per_piece: 0, amount: 0 }]);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleLinenSelect = (idx: number, itemId: string) => {
    if (itemId === 'custom') {
      updateRow(idx, { linen_item_id: null, item_name: '' });
      return;
    }
    const item = linenItems.find((i) => i.id === itemId);
    if (item) updateRow(idx, { linen_item_id: item.id, item_name: item.item_name, rate_per_piece: item.standard_rate ?? 0 });
  };

  const handleSave = async () => {
    setError(null);
    const validRows = rows.filter((r) => r.item_name.trim() && r.sent_qty > 0);
    if (validRows.length === 0) { setError('Add at least one linen item with quantity > 0.'); return; }
    if (!vendorId && !vendors.some((v) => v.id === vendorId)) { setError('Select a laundry vendor.'); return; }
    try {
      setSaving(true);
      const vendor = vendors.find((v) => v.id === vendorId);
      await saveDispatch({
        dispatch_date: dispatchDate,
        vendor_id: vendorId || null,
        vendor_name: vendor?.vendor_name ?? '',
        challan_no: challanNo,
        expected_return_date: expectedReturn || null,
        remarks,
        sent_by: sentBy,
        items: validRows.map((r) => ({
          linen_item_id: r.linen_item_id,
          item_name: r.item_name,
          sent_qty: r.sent_qty,
          rate_per_piece: r.rate_per_piece,
          amount: r.amount,
        })),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save dispatch');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-brand-navy-800">New Laundry Dispatch</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>}
          {/* Header fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">Dispatch Date</label>
              <input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Laundry Vendor</label>
              <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none">
                <option value="">Select vendor…</option>
                {vendors.filter((v) => v.is_active).map((v) => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
              </select>
              {vendors.length === 0 && <p className="text-[10px] text-amber-600 mt-1">No vendors yet. Add one from Quick Actions.</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Challan / Slip No. (optional)</label>
              <input type="text" value={challanNo} onChange={(e) => setChallanNo(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Expected Return Date (optional)</label>
              <input type="date" value={expectedReturn} onChange={(e) => setExpectedReturn(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Sent By</label>
              <input type="text" value={sentBy} onChange={(e) => setSentBy(e.target.value)} placeholder="Staff name" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Remarks</label>
              <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
            </div>
          </div>

          {/* Linen rows */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Linen Items</label>
              <button onClick={addRow} className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"><Plus className="w-3.5 h-3.5" /> Add Linen Item</button>
            </div>
            <div className="space-y-2">
              {rows.map((r, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 rounded-lg p-2">
                  <div className="col-span-12 sm:col-span-5">
                    <select
                      value={r.linen_item_id ?? (r.item_name ? 'custom' : '')}
                      onChange={(e) => handleLinenSelect(idx, e.target.value)}
                      className="w-full text-sm border border-slate-200 rounded-lg px-2 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none bg-white"
                    >
                      <option value="">Select item…</option>
                      {linenItems.filter((i) => i.is_active).map((i) => <option key={i.id} value={i.id}>{i.item_name}</option>)}
                      <option value="custom">Custom (type below)</option>
                    </select>
                    {(!r.linen_item_id) && (
                      <input
                        type="text"
                        value={r.item_name}
                        onChange={(e) => updateRow(idx, { item_name: e.target.value })}
                        placeholder="Enter item name"
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-2 mt-1 focus:ring-2 focus:ring-brand-400 focus:outline-none"
                      />
                    )}
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <input type="number" min="0" value={r.sent_qty} onChange={(e) => updateRow(idx, { sent_qty: parseInt(e.target.value) || 0 })} placeholder="Qty" className="w-full text-sm border border-slate-200 rounded-lg px-2 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none text-center" />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <input type="number" min="0" step="0.01" value={r.rate_per_piece} onChange={(e) => updateRow(idx, { rate_per_piece: parseFloat(e.target.value) || 0 })} placeholder="Rate" className="w-full text-sm border border-slate-200 rounded-lg px-2 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none text-center" />
                  </div>
                  <div className="col-span-3 sm:col-span-2 text-sm font-bold text-slate-700 text-right tabular-nums">{rs(r.amount)}</div>
                  <div className="col-span-1 flex justify-end">
                    {rows.length > 1 && (
                      <button onClick={() => removeRow(idx)} className="p-1 text-slate-300 hover:text-red-500 rounded transition"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-2">
              <div className="text-sm font-bold text-brand-navy-700">Total: <span className="tabular-nums">{rs(totalAmount)}</span></div>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-4 flex items-center gap-2">
          <button onClick={onClose} className="flex-1 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl py-3 transition">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-xl py-3 transition">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Dispatch
          </button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// RECEIVE MODAL
// ══════════════════════════════════════════════════════════════════

const ReceiveModal = ({ dispatchId, dispatchNo, vendorName, dispatchDate, challanNo, onClose, onSaved }: {
  dispatchId: string;
  dispatchNo: string;
  vendorName: string;
  dispatchDate: string;
  challanNo: string;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [detail, setDetail] = useState<DispatchWithReceipts | null>(null);
  const [loading, setLoading] = useState(true);
  const [receiptDate, setReceiptDate] = useState(todayStr());
  const [receiveNow, setReceiveNow] = useState<Record<string, number>>({});
  const [damagedLost, setDamagedLost] = useState<Record<string, number>>({});
  const [remarks, setRemarks] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await getDispatchDetail(dispatchId);
        setDetail(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load dispatch');
      } finally {
        setLoading(false);
      }
    })();
  }, [dispatchId]);

  const handleSave = async () => {
    if (!detail) return;
    setError(null);
    const items: ReceiptItemEntry[] = detail.items.map((it) => {
      const recvNow = receiveNow[it.item_name] ?? 0;
      const dmg = damagedLost[it.item_name] ?? 0;
      const prevRecv = detail.received_totals[it.item_name] ?? 0;
      const remaining = Math.max(0, it.sent_qty - prevRecv - (detail.damaged_totals[it.item_name] ?? 0));
      return {
        item_name: it.item_name,
        linen_item_id: it.linen_item_id,
        sent_qty: it.sent_qty,
        received_now: Math.min(recvNow, remaining),
        damaged_lost: Math.min(dmg, Math.max(0, it.sent_qty - prevRecv - recvNow)),
      };
    });
    // Validate: received + damaged <= sent - previously received - previously damaged
    for (const it of items) {
      const prevRecv = detail.received_totals[it.item_name] ?? 0;
      const prevDmg = detail.damaged_totals[it.item_name] ?? 0;
      if (it.received_now + it.damaged_lost > it.sent_qty - prevRecv - prevDmg) {
        setError(`Cannot receive more than pending for ${it.item_name}.`);
        return;
      }
    }
    if (items.every((i) => i.received_now === 0 && i.damaged_lost === 0)) {
      setError('Enter at least one receive or damaged quantity.');
      return;
    }
    try {
      setSaving(true);
      await saveReceipt({
        dispatch_id: dispatchId,
        receipt_date: receiptDate,
        items,
        remarks,
        received_by: receivedBy,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save receipt');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl p-8"><Loader2 className="w-6 h-6 text-brand-600 animate-spin" /></div>
    </div>
  );
  if (!detail) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h3 className="text-base font-bold text-brand-navy-800">Receive from Laundry</h3>
            <p className="text-xs text-slate-400 mt-0.5">{dispatchNo} · {vendorName} · {fmtDate(dispatchDate)} {challanNo && `· Challan: ${challanNo}`}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">Receipt Date</label>
              <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Received By</label>
              <input type="text" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Staff name" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Remarks</label>
              <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
            </div>
          </div>

          {/* Items table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-3 py-2 text-xs font-bold text-slate-500 uppercase">Linen Item</th>
                  <th className="text-right px-3 py-2 text-xs font-bold text-slate-500 uppercase">Sent</th>
                  <th className="text-right px-3 py-2 text-xs font-bold text-slate-500 uppercase">Prev. Received</th>
                  <th className="text-center px-3 py-2 text-xs font-bold text-slate-500 uppercase">Receive Now</th>
                  <th className="text-center px-3 py-2 text-xs font-bold text-slate-500 uppercase">Damaged/Lost</th>
                  <th className="text-right px-3 py-2 text-xs font-bold text-slate-500 uppercase">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((it) => {
                  const prevRecv = detail.received_totals[it.item_name] ?? 0;
                  const prevDmg = detail.damaged_totals[it.item_name] ?? 0;
                  const remaining = Math.max(0, it.sent_qty - prevRecv - prevDmg);
                  const recvNow = receiveNow[it.item_name] ?? 0;
                  const dmg = damagedLost[it.item_name] ?? 0;
                  const afterPending = Math.max(0, remaining - recvNow - dmg);
                  return (
                    <tr key={it.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-2 text-sm font-semibold text-slate-800">{it.item_name}</td>
                      <td className="px-3 py-2 text-sm text-slate-600 text-right tabular-nums">{it.sent_qty}</td>
                      <td className="px-3 py-2 text-sm text-emerald-600 text-right tabular-nums">{prevRecv}</td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          min="0"
                          max={remaining}
                          value={recvNow || ''}
                          onChange={(e) => setReceiveNow((prev) => ({ ...prev, [it.item_name]: parseInt(e.target.value) || 0 }))}
                          placeholder="0"
                          className="w-16 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-brand-400 focus:outline-none text-center"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          min="0"
                          max={Math.max(0, remaining - recvNow)}
                          value={dmg || ''}
                          onChange={(e) => setDamagedLost((prev) => ({ ...prev, [it.item_name]: parseInt(e.target.value) || 0 }))}
                          placeholder="0"
                          className="w-16 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-red-400 focus:outline-none text-center"
                        />
                      </td>
                      <td className="px-3 py-2 text-sm text-amber-600 text-right tabular-nums font-semibold">{afterPending}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Previous receipts history */}
          {detail.receipts.length > 0 && (
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Receipt History</p>
              <div className="space-y-1.5">
                {detail.receipts.map((r) => (
                  <div key={r.id} className="text-xs text-slate-500 flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    <span className="font-semibold">{fmtDate(r.receipt_date)}</span>
                    <span>·</span>
                    {r.items_json.map((it, i) => (
                      <span key={i}>{it.item_name}: +{it.received_now}{it.damaged_lost > 0 && <span className="text-red-500"> (DMG: {it.damaged_lost})</span>}{i < r.items_json.length - 1 ? ', ' : ''}</span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-4 flex items-center gap-2">
          <button onClick={onClose} className="flex-1 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl py-3 transition">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl py-3 transition">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />} Save Receipt
          </button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// VIEW DISPATCH MODAL
// ══════════════════════════════════════════════════════════════════

const ViewDispatchModal = ({ dispatchId, onClose, onReceive }: {
  dispatchId: string;
  onClose: () => void;
  onReceive: () => void;
}) => {
  const [detail, setDetail] = useState<DispatchWithReceipts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await getDispatchDetail(dispatchId);
        setDetail(d);
      } catch { /* ignore */ } finally { setLoading(false); }
    })();
  }, [dispatchId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scale-in">
        {loading ? (
          <div className="p-8 flex items-center justify-center"><Loader2 className="w-6 h-6 text-brand-600 animate-spin" /></div>
        ) : detail ? (
          <>
            <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
              <div>
                <h3 className="text-base font-bold text-brand-navy-800">{detail.dispatch_no || 'Dispatch'}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{detail.vendor_name} · {fmtDate(detail.dispatch_date)} {detail.challan_no && `· Challan: ${detail.challan_no}`}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_STYLES[detail.status]}`}>{detail.status}</span>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {/* Items */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-3 py-2 text-xs font-bold text-slate-500 uppercase">Linen Item</th>
                      <th className="text-right px-3 py-2 text-xs font-bold text-slate-500 uppercase">Sent</th>
                      <th className="text-right px-3 py-2 text-xs font-bold text-slate-500 uppercase">Received</th>
                      <th className="text-right px-3 py-2 text-xs font-bold text-slate-500 uppercase">Damaged</th>
                      <th className="text-right px-3 py-2 text-xs font-bold text-slate-500 uppercase">Pending</th>
                      <th className="text-right px-3 py-2 text-xs font-bold text-slate-500 uppercase">Rate</th>
                      <th className="text-right px-3 py-2 text-xs font-bold text-slate-500 uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((it) => {
                      const recv = detail.received_totals[it.item_name] ?? 0;
                      const dmg = detail.damaged_totals[it.item_name] ?? 0;
                      const pending = Math.max(0, it.sent_qty - recv - dmg);
                      return (
                        <tr key={it.id} className="border-b border-slate-50 last:border-0">
                          <td className="px-3 py-2 text-sm font-semibold text-slate-800">{it.item_name}</td>
                          <td className="px-3 py-2 text-sm text-slate-600 text-right tabular-nums">{it.sent_qty}</td>
                          <td className="px-3 py-2 text-sm text-emerald-600 text-right tabular-nums">{recv}</td>
                          <td className="px-3 py-2 text-sm text-red-600 text-right tabular-nums">{dmg}</td>
                          <td className="px-3 py-2 text-sm text-amber-600 text-right tabular-nums font-semibold">{pending}</td>
                          <td className="px-3 py-2 text-sm text-slate-500 text-right tabular-nums">{rs(it.rate_per_piece)}</td>
                          <td className="px-3 py-2 text-sm font-bold text-slate-700 text-right tabular-nums">{rs(it.amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={6} className="px-3 py-2.5 text-sm font-bold text-slate-700 text-right">Total Amount</td>
                      <td className="px-3 py-2.5 text-sm font-bold text-brand-navy-700 text-right tabular-nums">{rs(detail.total_amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-blue-50 rounded-lg p-2.5 text-center"><p className="text-[10px] text-slate-500 uppercase font-semibold">Sent</p><p className="text-lg font-bold text-blue-600 tabular-nums">{detail.total_sent}</p></div>
                <div className="bg-emerald-50 rounded-lg p-2.5 text-center"><p className="text-[10px] text-slate-500 uppercase font-semibold">Received</p><p className="text-lg font-bold text-emerald-600 tabular-nums">{detail.total_received}</p></div>
                <div className="bg-amber-50 rounded-lg p-2.5 text-center"><p className="text-[10px] text-slate-500 uppercase font-semibold">Pending</p><p className="text-lg font-bold text-amber-600 tabular-nums">{detail.total_pending}</p></div>
                <div className="bg-red-50 rounded-lg p-2.5 text-center"><p className="text-[10px] text-slate-500 uppercase font-semibold">Damaged</p><p className="text-lg font-bold text-red-600 tabular-nums">{detail.total_damaged}</p></div>
              </div>

              {/* Receipt history */}
              {detail.receipts.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Receipt History ({detail.receipts.length})</p>
                  <div className="space-y-2">
                    {detail.receipts.map((r) => (
                      <div key={r.id} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-600">{fmtDate(r.receipt_date)} {r.received_by && `· ${r.received_by}`}</span>
                        </div>
                        <div className="text-xs text-slate-500">
                          {r.items_json.map((it, i) => (
                            <span key={i}>{it.item_name}: +{it.received_now}{it.damaged_lost > 0 && <span className="text-red-500"> (DMG: {it.damaged_lost})</span>}{i < r.items_json.length - 1 ? ', ' : ''}</span>
                          ))}
                        </div>
                        {r.remarks && <p className="text-xs text-slate-400 mt-1">{r.remarks}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.remarks && <p className="text-xs text-slate-400"><span className="font-semibold">Dispatch Remarks:</span> {detail.remarks}</p>}
              {detail.sent_by && <p className="text-xs text-slate-400"><span className="font-semibold">Sent By:</span> {detail.sent_by}</p>}
            </div>
            {detail.status !== 'Completed' && detail.status !== 'Short/Lost' && (
              <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-4">
                <button onClick={onReceive} className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl py-3 transition">
                  <ArrowDownToLine className="w-4 h-4" /> Receive Laundry
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// VENDOR MODAL
// ══════════════════════════════════════════════════════════════════

const VendorModal = ({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) => {
  const [vendors, setVendors] = useState<LaundryVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LaundryVendor | null>(null);
  const [vendorName, setVendorName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [rateType, setRateType] = useState<'Per Piece' | 'Per Kg'>('Per Piece');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try { setVendors(await getLaundryVendors()); } catch { /* ignore */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const reset = () => {
    setEditing(null); setVendorName(''); setContactPerson(''); setMobile(''); setAddress(''); setGstin(''); setRateType('Per Piece'); setNotes(''); setIsActive(true);
  };

  const handleEdit = (v: LaundryVendor) => {
    setEditing(v); setVendorName(v.vendor_name); setContactPerson(v.contact_person); setMobile(v.mobile_number); setAddress(v.address); setGstin(v.gstin); setRateType(v.default_rate_type); setNotes(v.notes); setIsActive(v.is_active);
  };

  const handleSave = async () => {
    setError(null);
    if (!vendorName.trim()) { setError('Vendor name is required.'); return; }
    try {
      setSaving(true);
      await saveLaundryVendor({
        vendor_name: vendorName.trim(), contact_person: contactPerson, mobile_number: mobile,
        address, gstin, default_rate_type: rateType, notes, is_active: isActive,
      }, editing?.id);
      reset();
      await load();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save vendor');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this vendor?')) return;
    try { await deleteLaundryVendor(id); await load(); } catch { /* ignore */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-brand-navy-800">Laundry Vendors</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>}
          {/* Form */}
          <div className="space-y-3 bg-slate-50 rounded-xl p-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{editing ? 'Edit Vendor' : 'Add Vendor'}</p>
            <div>
              <label className="text-xs font-semibold text-slate-500">Vendor Name</label>
              <input type="text" value={vendorName} onChange={(e) => setVendorName(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500">Contact Person</label>
                <input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Mobile Number</label>
                <input type="text" value={mobile} onChange={(e) => setMobile(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Address</label>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500">GSTIN (optional)</label>
                <input type="text" value={gstin} onChange={(e) => setGstin(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Default Rate Type</label>
                <select value={rateType} onChange={(e) => setRateType(e.target.value as 'Per Piece' | 'Per Kg')} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none">
                  <option value="Per Piece">Per Piece</option>
                  <option value="Per Kg">Per Kg</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
              <span className="text-sm text-slate-600">Active</span>
            </label>
            <div className="flex items-center gap-2">
              {editing && <button onClick={reset} className="text-sm font-semibold text-slate-500 hover:text-slate-700 px-3 py-2">Cancel Edit</button>}
              <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-lg py-2.5 transition">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {editing ? 'Update' : 'Add'} Vendor
              </button>
            </div>
          </div>

          {/* Vendor list */}
          {loading ? <p className="text-sm text-slate-400 text-center py-4">Loading…</p> : vendors.length > 0 ? (
            <div className="space-y-2">
              {vendors.map((v) => (
                <div key={v.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-3">
                  <div className="w-9 h-9 rounded-lg bg-brand-navy-50 flex items-center justify-center"><Building2 className="w-4 h-4 text-brand-navy-600" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{v.vendor_name}</p>
                    <p className="text-xs text-slate-400 truncate">{v.contact_person || v.mobile_number || 'No contact'}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${v.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{v.is_active ? 'Active' : 'Inactive'}</span>
                  <button onClick={() => handleEdit(v)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition"><Eye className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(v.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-400 text-center py-4">No vendors yet.</p>}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// LINEN MASTER MODAL
// ══════════════════════════════════════════════════════════════════

const LinenMasterModal = ({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) => {
  const [items, setItems] = useState<LinenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LinenItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState('Bed Linen');
  const [unit, setUnit] = useState<'Pieces' | 'Kg'>('Pieces');
  const [standardRate, setStandardRate] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try { setItems(await getLinenItems()); } catch { /* ignore */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const reset = () => { setEditing(null); setItemName(''); setCategory('Bed Linen'); setUnit('Pieces'); setStandardRate('0'); setIsActive(true); };

  const handleEdit = (it: LinenItem) => {
    setEditing(it); setItemName(it.item_name); setCategory(it.category || 'Bed Linen'); setUnit(it.unit); setStandardRate(String(it.standard_rate ?? 0)); setIsActive(it.is_active);
  };

  const handleSave = async () => {
    setError(null);
    if (!itemName.trim()) { setError('Item name is required.'); return; }
    try {
      setSaving(true);
      await saveLinenItem({
        item_name: itemName.trim(), category, unit,
        standard_rate: parseFloat(standardRate) || 0, is_active: isActive,
      }, editing?.id);
      reset();
      await load();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save linen item');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this linen item?')) return;
    try { await deleteLinenItem(id); await load(); } catch { /* ignore */ }
  };

  const handleSeedDefaults = async () => {
    if (!confirm('Add all default linen items (Bedsheet, Pillow Cover, etc.)?')) return;
    try {
      setSaving(true);
      for (const name of DEFAULT_LINEN_ITEMS) {
        await saveLinenItem({ item_name: name, category: 'Bed Linen', unit: 'Pieces', standard_rate: 0, is_active: true });
      }
      await load();
      onSaved();
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-brand-navy-800">Linen Master</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>}
          {/* Form */}
          <div className="space-y-3 bg-slate-50 rounded-xl p-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{editing ? 'Edit Item' : 'Add Linen Item'}</p>
            <div>
              <label className="text-xs font-semibold text-slate-500">Linen Item Name</label>
              <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none">
                  {LINEN_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Unit</label>
                <select value={unit} onChange={(e) => setUnit(e.target.value as 'Pieces' | 'Kg')} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none">
                  <option value="Pieces">Pieces</option>
                  <option value="Kg">Kg</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Standard Laundry Rate (optional)</label>
              <input type="number" min="0" step="0.01" value={standardRate} onChange={(e) => setStandardRate(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-400 focus:outline-none" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
              <span className="text-sm text-slate-600">Active</span>
            </label>
            <div className="flex items-center gap-2">
              {editing && <button onClick={reset} className="text-sm font-semibold text-slate-500 hover:text-slate-700 px-3 py-2">Cancel Edit</button>}
              <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-lg py-2.5 transition">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {editing ? 'Update' : 'Add'} Item
              </button>
            </div>
          </div>

          {/* Item list */}
          {loading ? <p className="text-sm text-slate-400 text-center py-4">Loading…</p> : items.length > 0 ? (
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-3">
                  <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center"><Package className="w-4 h-4 text-brand-600" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{it.item_name}</p>
                    <p className="text-xs text-slate-400 truncate">{it.category} · {it.unit} · {rs(it.standard_rate ?? 0)}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${it.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{it.is_active ? 'Active' : 'Inactive'}</span>
                  <button onClick={() => handleEdit(it)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition"><Eye className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(it.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-slate-400 mb-2">No linen items yet.</p>
              <button onClick={handleSeedDefaults} disabled={saving} className="text-sm font-semibold text-brand-600 hover:text-brand-700">
                Add default items (Bedsheet, Pillow Cover, etc.)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
