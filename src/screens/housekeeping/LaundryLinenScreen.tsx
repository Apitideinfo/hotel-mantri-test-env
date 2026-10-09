import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Shirt, Plus, X, RefreshCw, Loader2, AlertTriangle, CheckCircle2, Clock,
  ArrowDownToLine, ArrowUpFromLine, Trash2, Eye, Save, Building2, Package,
  ChevronDown, ChevronLeft, Calendar, IndianRupee, Phone, MapPin, Filter,
  AlertCircle, Ban, Send, FileText, Check, Layers, History as HistoryIcon,
  DollarSign, Receipt, CreditCard, ShieldCheck, CheckCheck, Sparkles,
} from 'lucide-react';
import {
  getLaundryDashboard, getLaundryVendors, getLinenItems, saveLaundryVendor,
  saveLinenItem, deleteLaundryVendor, deleteLinenItem, saveDispatch, deleteDispatch,
  getDispatchDetail, saveReceipt, getStockMovements, recordStockMovement,
  getVendorLedger, recordVendorPayment, generateDailyBill, approveDailyBill,
  resolvePendingLinen, getDailyStatementData, sendDailyWhatsAppStatement,
  seedStandardLinenItems, getVendorRates, DEFAULT_LINEN_ITEMS, LINEN_CATEGORIES,
} from '@/lib/api-laundry-linen';
import type {
  LaundryDashboardData, LaundryVendor, LinenItem, LaundryDispatch,
  LaundryDispatchItem, LaundryReceipt, DispatchWithReceipts, ReceiptItemEntry,
  LinenStockMovement, VendorLedgerResult, DailyLedgerRow, VendorLedgerTransaction,
} from '@/lib/api-laundry-linen';
import { fmtMoney, toNum } from '@/lib/calc';
import { downloadLaundryStatementPdf } from '@/lib/pdf-laundry';

interface LaundryLinenScreenProps {
  onBack: () => void;
}

type Tab = 'overview' | 'stock' | 'dispatches' | 'pending' | 'ledger' | 'history';

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
  'OPEN': 'bg-blue-100 text-blue-700 border-blue-200',
  'PARTIALLY_RECEIVED': 'bg-amber-100 text-amber-700 border-amber-200',
  'CLOSED': 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

// ══════════════════════════════════════════════════════════════════
// MAIN LAUNDRY & LINEN SCREEN
// ══════════════════════════════════════════════════════════════════

export const LaundryLinenScreen = ({ onBack }: LaundryLinenScreenProps) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [data, setData] = useState<LaundryDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals state
  const [showDispatch, setShowDispatch] = useState(false);
  const [showVendor, setShowVendor] = useState(false);
  const [showLinen, setShowLinen] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [showCloseDayModal, setShowCloseDayModal] = useState(false);
  const [showReceiveSelect, setShowReceiveSelect] = useState(false);
  const [receiveDispatch, setReceiveDispatch] = useState<LaundryDispatch | null>(null);
  const [viewDispatch, setViewDispatch] = useState<LaundryDispatch | null>(null);
  const [resolveItem, setResolveItem] = useState<{
    dispatch_id: string;
    dispatch_item_id: string;
    item_name: string;
    pending_qty: number;
    dispatch_no: string;
  } | null>(null);

  const handleOpenReceive = () => {
    if (!data) return;
    const activeDispatches = (data.dispatches || []).filter(
      (d) => d.status !== 'Completed' && d.status !== 'CLOSED'
    );
    if (activeDispatches.length === 0) {
      alert('No active dispatches found with pending linen. All laundry has been received back!');
      return;
    }
    if (activeDispatches.length === 1) {
      setReceiveDispatch(activeDispatches[0]);
      return;
    }
    setShowReceiveSelect(true);
  };

  const showNotification = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const d = await getLaundryDashboard(selectedDate);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load laundry data');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { load(); }, [load]);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'stock', label: 'Stock Master' },
    { key: 'dispatches', label: 'Dispatch & Receive', count: data?.dispatches.length },
    { key: 'pending', label: 'Pending Linen', count: data?.at_laundry },
    { key: 'ledger', label: 'Vendor Ledger' },
    { key: 'history', label: 'Audit History' },
  ];

  return (
    <div className="px-4 lg:px-6 py-5 w-full max-w-[1500px] mx-auto space-y-5">
      {/* ── Top Notifications ── */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-sm font-medium">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white rounded-2xl border border-slate-200 p-4 lg:p-5 shadow-card">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-500 hover:text-brand-navy-800 hover:bg-slate-100 rounded-xl transition"
            title="Back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-brand-600 flex items-center justify-center text-white shadow-md">
            <Shirt className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg lg:text-xl font-bold text-brand-navy-900 tracking-tight">Laundry & Linen Management</h1>
            <p className="text-xs text-slate-500">Production Linen Stock • Partial Receiving • Vendor Ledger • WhatsApp Statements</p>
          </div>
        </div>

        {/* Date Selector & Primary Actions */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-inner">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none"
            />
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-xl transition"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setShowCloseDayModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Close Day & WhatsApp</span>
          </button>

          <button
            onClick={handleOpenReceive}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-sm"
            title="Update that vendor has returned linen back"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Receive from Vendor</span>
          </button>

          <button
            onClick={() => setShowDispatch(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl transition shadow-sm"
          >
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            <span>New Dispatch</span>
          </button>
        </div>
      </div>

      {/* ── Executive KPI Cards (Row 1: Physical Stock) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Active Stock</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900 tabular-nums">{data?.total_linen_stock ?? 0}</span>
            <span className="text-xs text-slate-400 font-medium">pcs</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Opening + additions − discards</p>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-100 bg-gradient-to-b from-white to-emerald-50/20 p-4 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Available in Hotel</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-700 tabular-nums">{data?.available_in_hotel ?? 0}</span>
            <span className="text-xs text-emerald-600 font-medium">pcs</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Ready for housekeeping usage</p>
        </div>

        <div className="bg-white rounded-2xl border border-amber-100 bg-gradient-to-b from-white to-amber-50/20 p-4 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">At Laundry / Pending</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-amber-700 tabular-nums">{data?.at_laundry ?? 0}</span>
            <span className="text-xs text-amber-600 font-medium">pcs</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Dispatched, awaiting return</p>
        </div>

        <div className="bg-white rounded-2xl border border-rose-100 bg-gradient-to-b from-white to-rose-50/20 p-4 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">Damaged / Lost</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-rose-700 tabular-nums">{data?.damaged_lost ?? 0}</span>
            <span className="text-xs text-rose-600 font-medium">pcs</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Resolved missing or discarded</p>
        </div>
      </div>

      {/* ── Daily Activity Strip (Row 2: Physical & Financial Activity) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <div className="bg-slate-900 text-white rounded-2xl p-3.5 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Today Sent</div>
          <div className="text-xl font-bold mt-1 tabular-nums">{data?.today_sent ?? 0} <span className="text-xs font-normal text-slate-400">pcs</span></div>
        </div>

        <div className="bg-slate-900 text-white rounded-2xl p-3.5 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Today Received</div>
          <div className="text-xl font-bold mt-1 text-emerald-400 tabular-nums">{data?.today_received ?? 0} <span className="text-xs font-normal text-slate-400">pcs</span></div>
        </div>

        <div className="bg-slate-900 text-white rounded-2xl p-3.5 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Today's Billable</div>
          <div className="text-xl font-bold mt-1 text-amber-400 tabular-nums">{rs(data?.today_bill ?? 0)}</div>
        </div>

        <div className="bg-slate-900 text-white rounded-2xl p-3.5 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vendor Payment Due</div>
          <div className="text-xl font-bold mt-1 text-rose-400 tabular-nums">{rs(data?.vendor_due ?? 0)}</div>
        </div>
      </div>

      {/* ── Tabs Navigation ── */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition whitespace-nowrap ${
              tab === t.key
                ? 'bg-brand-navy-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>{t.label}</span>
            {t.count !== undefined && t.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                tab === t.key ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Active Tab Content ── */}
      {loading && !data ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      ) : data ? (
        <>
          {tab === 'overview' && (
            <OverviewTab
              data={data}
              onNewDispatch={() => setShowDispatch(true)}
              onOpenReceive={handleOpenReceive}
              onManageStock={() => setShowStockModal(true)}
              onCloseDay={() => setShowCloseDayModal(true)}
              onManageVendors={() => setShowVendor(true)}
              onManageLinen={() => setShowLinen(true)}
              onViewDispatch={(d) => setViewDispatch(d)}
              onReceiveDispatch={(d) => setReceiveDispatch(d)}
            />
          )}

          {tab === 'stock' && (
            <StockTab
              linenItems={data.linen_items}
              onAddStock={() => setShowStockModal(true)}
              onManageLinen={() => setShowLinen(true)}
              onReload={load}
            />
          )}

          {tab === 'dispatches' && (
            <DispatchesTab
              dispatches={data.dispatches}
              vendors={data.vendors}
              onNewDispatch={() => setShowDispatch(true)}
              onOpenReceive={handleOpenReceive}
              onView={(d) => setViewDispatch(d)}
              onReceive={(d) => setReceiveDispatch(d)}
              onDeleted={() => {
                showNotification('Dispatch deleted successfully.');
                load();
              }}
            />
          )}

          {tab === 'pending' && (
            <PendingTab
              dispatches={data.dispatches}
              vendors={data.vendors}
              onView={(d) => setViewDispatch(d)}
              onReceive={(d) => setReceiveDispatch(d)}
              onResolve={(item) => setResolveItem(item)}
            />
          )}

          {tab === 'ledger' && (
            <VendorLedgerTab
              vendors={data.vendors}
              selectedDate={selectedDate}
              onRecordPayment={() => setShowPaymentModal(true)}
              onOpenStatement={(vId) => setShowStatementModal(true)}
              onBillApproved={() => {
                showNotification('Laundry bill approved and synced to Finance Expense!');
                load();
              }}
            />
          )}

          {tab === 'history' && (
            <AuditHistoryTab
              dispatches={data.dispatches}
              vendors={data.vendors}
              onView={(d) => setViewDispatch(d)}
            />
          )}
        </>
      ) : null}

      {/* ── Modals ── */}
      {showReceiveSelect && data && (
        <SelectDispatchToReceiveModal
          dispatches={(data.dispatches || []).filter((d) => d.status !== 'Completed' && d.status !== 'CLOSED')}
          onSelect={(d) => {
            setShowReceiveSelect(false);
            setReceiveDispatch(d);
          }}
          onClose={() => setShowReceiveSelect(false)}
        />
      )}

      {showDispatch && data && (
        <NewDispatchModal
          vendors={data.vendors}
          linenItems={data.linen_items}
          defaultDate={selectedDate}
          onClose={() => setShowDispatch(false)}
          onSaved={() => {
            setShowDispatch(false);
            showNotification('Dispatch created successfully.');
            load();
          }}
        />
      )}

      {receiveDispatch && data && (
        <ReceiveModal
          dispatch={receiveDispatch}
          onClose={() => setReceiveDispatch(null)}
          onSaved={() => {
            setReceiveDispatch(null);
            showNotification('Linen receiving recorded successfully.');
            load();
          }}
        />
      )}

      {viewDispatch && (
        <DispatchDetailModal
          dispatchId={viewDispatch.id}
          onClose={() => setViewDispatch(null)}
          onReceiveAgain={() => {
            const d = viewDispatch;
            setViewDispatch(null);
            setReceiveDispatch(d);
          }}
        />
      )}

      {showStockModal && data && (
        <StockMovementModal
          linenItems={data.linen_items}
          onClose={() => setShowStockModal(false)}
          onOpenLinenMaster={() => {
            setShowStockModal(false);
            setShowLinen(true);
          }}
          onReload={load}
          onSaved={() => {
            setShowStockModal(false);
            showNotification('Stock movement ledger entry recorded successfully.');
            load();
          }}
        />
      )}

      {showVendor && (
        <VendorMasterModal
          onClose={() => setShowVendor(false)}
          onSaved={() => {
            showNotification('Vendors updated.');
            load();
          }}
        />
      )}

      {showLinen && (
        <LinenMasterModal
          onClose={() => setShowLinen(false)}
          onSaved={() => {
            showNotification('Linen items updated.');
            load();
          }}
        />
      )}

      {resolveItem && (
        <ResolveLostDamagedModal
          item={resolveItem}
          onClose={() => setResolveItem(null)}
          onResolved={() => {
            setResolveItem(null);
            showNotification('Missing linen pieces resolved successfully.');
            load();
          }}
        />
      )}

      {showPaymentModal && data && (
        <VendorPaymentModal
          vendors={data.vendors}
          defaultDate={selectedDate}
          onClose={() => setShowPaymentModal(false)}
          onSaved={() => {
            setShowPaymentModal(false);
            showNotification('Vendor payment recorded successfully.');
            load();
          }}
        />
      )}

      {showCloseDayModal && data && (
        <CloseLaundryDayModal
          vendors={data.vendors}
          selectedDate={selectedDate}
          onClose={() => setShowCloseDayModal(false)}
          onDayClosed={() => {
            setShowCloseDayModal(false);
            showNotification('Laundry day closed and WhatsApp statement ready!');
            load();
          }}
        />
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// 1. OVERVIEW TAB
// ══════════════════════════════════════════════════════════════════

const OverviewTab = ({
  data,
  onNewDispatch,
  onOpenReceive,
  onManageStock,
  onCloseDay,
  onManageVendors,
  onManageLinen,
  onViewDispatch,
  onReceiveDispatch,
}: {
  data: LaundryDashboardData;
  onNewDispatch: () => void;
  onOpenReceive: () => void;
  onManageStock: () => void;
  onCloseDay: () => void;
  onManageVendors: () => void;
  onManageLinen: () => void;
  onViewDispatch: (d: LaundryDispatch) => void;
  onReceiveDispatch: (d: LaundryDispatch) => void;
}) => {
  return (
    <div className="space-y-5">
      {/* Quick Actions Deck */}
      <div className="bg-gradient-to-r from-slate-900 to-brand-navy-950 text-white rounded-2xl p-4 lg:p-5 shadow-card flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold">Linen Operations Deck</h2>
          <p className="text-xs text-slate-400 mt-0.5">Authoritative stock tracking, partial returns, and vendor billing reconciliation.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onNewDispatch}
            className="flex items-center gap-1.5 px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-xl transition shadow-sm"
          >
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            <span>Send to Laundry</span>
          </button>
          <button
            onClick={onOpenReceive}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-sm"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Receive from Vendor</span>
          </button>
          <button
            onClick={onManageStock}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition"
          >
            <Package className="w-3.5 h-3.5" />
            <span>Add / Adjust Stock</span>
          </button>
          <button
            onClick={onCloseDay}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Close Laundry Day</span>
          </button>
          <button
            onClick={onManageVendors}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Vendors</span>
          </button>
          <button
            onClick={onManageLinen}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition"
          >
            <Shirt className="w-3.5 h-3.5" />
            <span>Linen Master</span>
          </button>
        </div>
      </div>

      {/* Linen Position Matrix */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-brand-navy-900">Current Linen Stock Position</h3>
            <p className="text-[11px] text-slate-400">Reconciled breakdown per linen item.</p>
          </div>
          <button onClick={onManageStock} className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" />
            <span>Update Stock</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase">
                <th className="text-left px-4 py-2.5">Item Name</th>
                <th className="text-left px-4 py-2.5">Category</th>
                <th className="text-right px-4 py-2.5">Total Active Stock</th>
                <th className="text-right px-4 py-2.5 text-emerald-600">Available in Hotel</th>
                <th className="text-right px-4 py-2.5 text-amber-600">At Laundry / Pending</th>
                <th className="text-right px-4 py-2.5 text-rose-600">Damaged / Lost</th>
                <th className="text-center px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.linen_items.map((item) => {
                const total = item.total_active_stock ?? 0;
                const avail = item.available_in_hotel ?? 0;
                const atLnd = item.at_laundry ?? 0;
                const dmg = item.damaged_lost ?? 0;
                const pctAvail = total > 0 ? Math.round((avail / total) * 100) : 0;

                return (
                  <tr key={item.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-xs font-bold text-slate-800">{item.item_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.category}</td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-700 text-right tabular-nums">{total} pcs</td>
                    <td className="px-4 py-3 text-xs font-bold text-emerald-600 text-right tabular-nums">{avail} pcs</td>
                    <td className="px-4 py-3 text-xs font-bold text-amber-600 text-right tabular-nums">{atLnd} pcs</td>
                    <td className="px-4 py-3 text-xs font-bold text-rose-600 text-right tabular-nums">{dmg} pcs</td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                        <span>{pctAvail}% Avail</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Dispatches Deck */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-brand-navy-900">Recent Laundry Dispatches</h3>
          <span className="text-xs text-slate-400">Latest 5 dispatches</span>
        </div>
        <div className="divide-y divide-slate-100">
          {data.dispatches.slice(0, 5).map((d) => (
            <div key={d.id} className="p-3.5 lg:px-4 flex items-center justify-between hover:bg-slate-50/50 transition">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                  {d.dispatch_no.slice(-3)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">{d.vendor_name || 'Vendor'}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[d.status] || STATUS_STYLES['Sent']}`}>
                      {d.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {d.dispatch_no} • {fmtDate(d.dispatch_date)} • Sent by {d.sent_by || 'Staff'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onViewDispatch(d)}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition"
                >
                  View
                </button>
                {d.status !== 'Completed' && d.status !== 'CLOSED' && (
                  <button
                    onClick={() => onReceiveDispatch(d)}
                    className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition"
                  >
                    Receive
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// 2. STOCK MASTER TAB
// ══════════════════════════════════════════════════════════════════

const StockTab = ({
  linenItems,
  onAddStock,
  onManageLinen,
  onReload,
}: {
  linenItems: LinenItem[];
  onAddStock: () => void;
  onManageLinen: () => void;
  onReload: () => void;
}) => {
  const [movements, setMovements] = useState<LinenStockMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    getStockMovements()
      .then(setMovements)
      .catch((err) => console.warn('[StockMasterTab] Stock movements fetch note:', err?.message || err))
      .finally(() => setLoadingMovements(false));
  }, []);

  const handleSeedDefaults = async () => {
    try {
      setSeeding(true);
      await seedStandardLinenItems();
      onReload();
    } catch (e: any) {
      alert(e.message || 'Failed to seed linen items');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Stock Master Header */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 p-4 shadow-card">
        <div>
          <h2 className="text-sm font-bold text-brand-navy-900">Authoritative Linen Stock Ledger</h2>
          <p className="text-xs text-slate-500">Every piece added or discarded creates a permanent audit movement record.</p>
        </div>
        <div className="flex items-center gap-2">
          {linenItems.length < 5 && (
            <button
              onClick={handleSeedDefaults}
              disabled={seeding}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-xl border border-indigo-200 transition shadow-sm"
              title="Add standard hotel items (Pillows, Towels, Mats, Blankets, Duvets)"
            >
              {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-indigo-600" />}
              <span>{seeding ? 'Adding Items...' : 'Add Standard Items'}</span>
            </button>
          )}
          <button
            onClick={onAddStock}
            className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl transition shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add / Adjust Stock</span>
          </button>
          <button
            onClick={onManageLinen}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
          >
            <Shirt className="w-3.5 h-3.5" />
            <span>Linen Items ({linenItems.length})</span>
          </button>
        </div>
      </div>

      {/* Quick Setup banner if fewer than 5 items configured */}
      {linenItems.length < 5 && (
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-50/90 to-indigo-50/90 border border-blue-200/80 rounded-2xl p-3.5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">
                {linenItems.length === 1 ? `Only 1 item configured ("${linenItems[0]?.item_name}")` : 'Setup Standard Hotel Linen Master'}
              </h4>
              <p className="text-[11px] text-slate-500">
                Instantly populate standard hotel items (Pillow Covers, Bath Towels, Hand Towels, Bath Mats, Duvets, Blankets) so they appear in all selection dropdowns.
              </p>
            </div>
          </div>
          <button
            onClick={handleSeedDefaults}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition shrink-0"
          >
            {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>{seeding ? 'Adding...' : 'Populate Standard Items'}</span>
          </button>
        </div>
      )}

      {/* Stock Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {linenItems.map((item) => (
          <div key={item.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900">{item.item_name}</h4>
                <span className="text-[10px] text-slate-400">{item.category}</span>
              </div>
              <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-lg">
                Rs.{item.standard_rate}/pc
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-xl p-2.5 text-center">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold">Total</div>
                <div className="text-sm font-extrabold text-slate-800 tabular-nums">{item.total_active_stock ?? 0}</div>
              </div>
              <div>
                <div className="text-[10px] text-emerald-600 uppercase font-bold">In Hotel</div>
                <div className="text-sm font-extrabold text-emerald-600 tabular-nums">{item.available_in_hotel ?? 0}</div>
              </div>
              <div>
                <div className="text-[10px] text-amber-600 uppercase font-bold">At Laundry</div>
                <div className="text-sm font-extrabold text-amber-600 tabular-nums">{item.at_laundry ?? 0}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stock Movements Audit Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-brand-navy-900">Stock Movement Audit Trail</h3>
          <span className="text-xs text-slate-400">Chronological history</span>
        </div>

        {loadingMovements ? (
          <div className="p-8 text-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-600" />
          </div>
        ) : movements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase">
                  <th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-left px-4 py-2.5">Linen Item</th>
                  <th className="text-left px-4 py-2.5">Movement Type</th>
                  <th className="text-right px-4 py-2.5">Qty</th>
                  <th className="text-right px-4 py-2.5">Before</th>
                  <th className="text-right px-4 py-2.5">After</th>
                  <th className="text-left px-4 py-2.5">Reason</th>
                  <th className="text-left px-4 py-2.5">Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 text-xs">
                    <td className="px-4 py-2.5 text-slate-500 font-mono">{fmtDate(m.movement_date)}</td>
                    <td className="px-4 py-2.5 font-bold text-slate-800">{m.linen_items?.item_name || 'Linen'}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 capitalize">
                        {m.movement_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-brand-600 tabular-nums">+{m.quantity}</td>
                    <td className="px-4 py-2.5 text-right text-slate-400 tabular-nums">{m.before_qty}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-800 tabular-nums">{m.after_qty}</td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate">{m.reason || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-400">{m.created_by || 'Staff'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 text-xs">
            No stock movements recorded yet. Click "Add / Adjust Stock" to initialize stock.
          </div>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// 3. DISPATCHES TAB (Dispatch & Receive)
// ══════════════════════════════════════════════════════════════════

const DispatchesTab = ({
  dispatches,
  vendors,
  onNewDispatch,
  onOpenReceive,
  onView,
  onReceive,
  onDeleted,
}: {
  dispatches: LaundryDispatch[];
  vendors: LaundryVendor[];
  onNewDispatch: () => void;
  onOpenReceive: () => void;
  onView: (d: LaundryDispatch) => void;
  onReceive: (d: LaundryDispatch) => void;
  onDeleted: () => void;
}) => {
  const [filterStatus, setFilterStatus] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('all');

  const filtered = useMemo(() => {
    return dispatches.filter((d) => {
      if (filterStatus !== 'all' && d.status !== filterStatus) return false;
      if (vendorFilter !== 'all' && d.vendor_id !== vendorFilter) return false;
      return true;
    });
  }, [dispatches, filterStatus, vendorFilter]);

  return (
    <div className="space-y-4">
      {/* Header and Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="Sent">Sent (Open)</option>
            <option value="Partially Received">Partially Received</option>
            <option value="Completed">Completed</option>
            <option value="Short/Lost">Short/Lost</option>
          </select>

          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
          >
            <option value="all">All Vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.vendor_name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenReceive}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition shadow-sm"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Receive from Vendor</span>
          </button>
          <button
            onClick={onNewDispatch}
            className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl transition shadow-sm"
          >
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            <span>New Dispatch</span>
          </button>
        </div>
      </div>

      {/* Dispatches Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase">
                  <th className="text-left px-4 py-2.5">Dispatch No.</th>
                  <th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-left px-4 py-2.5">Vendor</th>
                  <th className="text-left px-4 py-2.5">Challan</th>
                  <th className="text-center px-4 py-2.5">Status</th>
                  <th className="text-right px-4 py-2.5">Items Sent</th>
                  <th className="text-center px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 text-xs">
                    <td className="px-4 py-3 font-mono font-bold text-slate-700">{d.dispatch_no}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(d.dispatch_date)}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">{d.vendor_name}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono">{d.challan_no || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[d.status] || STATUS_STYLES['Sent']}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">
                      {(d.items || []).reduce((s, i) => s + (Number(i.sent_qty) || 0), 0)} pcs
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onView(d)}
                          className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {d.status !== 'Completed' && d.status !== 'CLOSED' && (
                          <button
                            onClick={() => onReceive(d)}
                            className="px-2.5 py-1 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg shadow-sm flex items-center gap-1 transition"
                            title="Receive Linen Return"
                          >
                            <ArrowDownToLine className="w-3.5 h-3.5" />
                            <span>Receive</span>
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (window.confirm(`Delete dispatch ${d.dispatch_no}? This is only allowed if no receipts exist.`)) {
                              try {
                                await deleteDispatch(d.id);
                                onDeleted();
                              } catch (err: any) {
                                alert(err.message);
                              }
                            }
                          }}
                          className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Delete Dispatch"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 text-xs">
            No dispatches found for selected filter.
          </div>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// 4. PENDING LINEN TAB
// ══════════════════════════════════════════════════════════════════

const PendingTab = ({
  dispatches,
  vendors,
  onView,
  onReceive,
  onResolve,
}: {
  dispatches: LaundryDispatch[];
  vendors: LaundryVendor[];
  onView: (d: LaundryDispatch) => void;
  onReceive: (d: LaundryDispatch) => void;
  onResolve: (item: any) => void;
}) => {
  // Extract all pending items across dispatches
  const pendingItems = useMemo(() => {
    const list: Array<{
      dispatch_id: string;
      dispatch_no: string;
      dispatch_date: string;
      vendor_id: string | null;
      vendor_name: string;
      dispatch_item_id: string;
      item_name: string;
      sent_qty: number;
      received_qty: number;
      damaged_qty: number;
      pending_qty: number;
      days_pending: number;
    }> = [];

    const today = new Date();

    for (const d of dispatches) {
      if (d.status === 'Completed' || d.status === 'CLOSED') continue;
      const dDate = new Date(d.dispatch_date + 'T00:00:00');
      const days = Math.max(0, Math.floor((today.getTime() - dDate.getTime()) / (1000 * 60 * 60 * 24)));

      for (const it of d.items || []) {
        const sent = Number(it.sent_qty) || 0;
        const recv = Number(it.total_received) || 0;
        const dmg = (Number(it.total_damaged) || 0) + (Number(it.total_lost) || 0);
        const pending = Math.max(0, sent - recv - dmg);

        if (pending > 0) {
          list.push({
            dispatch_id: d.id,
            dispatch_no: d.dispatch_no,
            dispatch_date: d.dispatch_date,
            vendor_id: d.vendor_id,
            vendor_name: d.vendor_name,
            dispatch_item_id: it.id,
            item_name: it.item_name,
            sent_qty: sent,
            received_qty: recv,
            damaged_qty: dmg,
            pending_qty: pending,
            days_pending: days,
          });
        }
      }
    }

    return list;
  }, [dispatches]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-card flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-brand-navy-900">Pending Linen at Laundry</h2>
          <p className="text-xs text-slate-500">Items still outstanding from vendors. Can be received or explicitly resolved as lost/damaged.</p>
        </div>
        <span className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
          {pendingItems.reduce((s, i) => s + i.pending_qty, 0)} Total Pending Pieces
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        {pendingItems.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase">
                  <th className="text-left px-4 py-2.5">Linen Item</th>
                  <th className="text-left px-4 py-2.5">Vendor</th>
                  <th className="text-left px-4 py-2.5">Dispatch Ref</th>
                  <th className="text-left px-4 py-2.5">Dispatch Date</th>
                  <th className="text-right px-4 py-2.5">Sent</th>
                  <th className="text-right px-4 py-2.5">Received</th>
                  <th className="text-right px-4 py-2.5 text-amber-600">Pending</th>
                  <th className="text-center px-4 py-2.5">Age</th>
                  <th className="text-center px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingItems.map((p, idx) => (
                  <tr key={idx} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 text-xs">
                    <td className="px-4 py-3 font-bold text-slate-800">{p.item_name}</td>
                    <td className="px-4 py-3 text-slate-600">{p.vendor_name}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">{p.dispatch_no}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(p.dispatch_date)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{p.sent_qty}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{p.received_qty}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-amber-600">{p.pending_qty} pcs</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        p.days_pending > 3 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {p.days_pending} {p.days_pending === 1 ? 'day' : 'days'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            const d = dispatches.find((disp) => disp.id === p.dispatch_id);
                            if (d) onReceive(d);
                          }}
                          className="px-2.5 py-1 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg shadow-sm flex items-center gap-1 transition"
                          title="Receive Linen Return"
                        >
                          <ArrowDownToLine className="w-3.5 h-3.5" />
                          <span>Receive Return</span>
                        </button>
                        <button
                          onClick={() => onResolve(p)}
                          className="px-2.5 py-1 text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg transition"
                        >
                          Resolve Missing
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 text-xs">
            <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-2" />
            No pending linen pieces at laundry! All dispatches are reconciled.
          </div>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// 5. VENDOR LEDGER TAB
// ══════════════════════════════════════════════════════════════════

const VendorLedgerTab = ({
  vendors,
  selectedDate,
  onRecordPayment,
  onOpenStatement,
  onBillApproved,
}: {
  vendors: LaundryVendor[];
  selectedDate: string;
  onRecordPayment: () => void;
  onOpenStatement: (vId: string) => void;
  onBillApproved: () => void;
}) => {
  const [selectedVendorId, setSelectedVendorId] = useState<string>(vendors[0]?.id || '');
  const [ledger, setLedger] = useState<VendorLedgerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [viewMode, setViewMode] = useState<'daily' | 'transactions'>('daily');

  const loadLedger = useCallback(async () => {
    if (!selectedVendorId) return;
    try {
      setLoading(true);
      const res = await getVendorLedger(selectedVendorId);
      setLedger(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedVendorId]);

  useEffect(() => { loadLedger(); }, [loadLedger]);

  const handleGenerateAndApproveBill = async () => {
    if (!selectedVendorId) return;
    try {
      setApproving(true);
      // Generate draft bill for selected date
      const bill = await generateDailyBill(selectedVendorId, selectedDate);
      if (bill.total_amount <= 0) {
        alert('Today has no approved received linen for this vendor. Bill amount is ₹0.');
        return;
      }
      // Approve bill and sync to Finance
      await approveDailyBill(bill.id);
      onBillApproved();
      loadLedger();
    } catch (e: any) {
      alert(e.message || 'Failed to approve bill');
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Vendor Selector & Action Deck */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 p-4 shadow-card">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Vendor:</label>
          <select
            value={selectedVendorId}
            onChange={(e) => setSelectedVendorId(e.target.value)}
            className="text-xs font-semibold border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none"
          >
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.vendor_name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRecordPayment}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition shadow-sm"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Record Payment</span>
          </button>
          <button
            onClick={handleGenerateAndApproveBill}
            disabled={approving}
            className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl transition shadow-sm"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{approving ? 'Syncing...' : "Approve Today's Bill"}</span>
          </button>
        </div>
      </div>

      {/* Separate Metrics: Physical Linen Pending vs Financial Payment Due */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-amber-50/80 to-amber-100/30 rounded-2xl border-2 border-amber-300 p-4 lg:p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
              <Package className="w-4 h-4 text-amber-600" />
              Physical Linen Pending
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
              Physical Stock
            </span>
          </div>
          <div className="text-3xl font-black text-amber-900 mt-2 tabular-nums">
            {ledger?.physical_pending_pieces ?? 0} <span className="text-sm font-semibold text-amber-700">pieces</span>
          </div>
          <p className="text-xs text-amber-700/80 mt-1">
            Physical items still with vendor. Incurs <strong className="font-bold text-amber-900">₹0 billing</strong> until received back.
          </p>
        </div>

        <div className="bg-gradient-to-br from-rose-50/80 to-rose-100/30 rounded-2xl border-2 border-rose-300 p-4 lg:p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wider flex items-center gap-1.5">
              <IndianRupee className="w-4 h-4 text-rose-600" />
              Vendor Payment Due
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-200 text-rose-900">
              Financial Liability
            </span>
          </div>
          <div className="text-3xl font-black text-rose-900 mt-2 tabular-nums">
            {rs(ledger?.financial_due_amount ?? 0)}
          </div>
          <p className="text-xs text-rose-700/80 mt-1">
            Total Approved Bills: <strong>{rs(ledger?.total_billed_amount ?? 0)}</strong> • Total Paid: <strong>{rs(ledger?.total_paid_amount ?? 0)}</strong>
          </p>
        </div>
      </div>

      {/* Explicit Distinction Callout */}
      <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-blue-900">
        <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <strong className="font-bold">Important: </strong>
          <span>
            <strong>Linen Pending</strong> ({ledger?.physical_pending_pieces ?? 0} pcs) and <strong>Payment Due</strong> ({rs(ledger?.financial_due_amount ?? 0)}) are two completely different things and are tracked separately. Pending laundry pieces have ₹0 billing until actually returned and approved.
          </span>
        </div>
      </div>

      {/* Ledger Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-brand-navy-900">
              {viewMode === 'daily' ? 'Vendor-Wise Date Ledger' : 'Vendor Transaction Audit Trail'}
            </h3>
            <p className="text-[11px] text-slate-400">
              {viewMode === 'daily'
                ? 'Chronological balance: Sent Qty, Received Qty, Pending Qty, Bills, Payments, and Payment Due'
                : 'Individual invoices, payment receipts, and dispatch entries'}
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
            <button
              onClick={() => setViewMode('daily')}
              className={`px-2.5 py-1 rounded-md transition ${
                viewMode === 'daily' ? 'bg-white text-brand-navy-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Date-Wise Ledger
            </button>
            <button
              onClick={() => setViewMode('transactions')}
              className={`px-2.5 py-1 rounded-md transition ${
                viewMode === 'transactions' ? 'bg-white text-brand-navy-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Transaction Trail
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-600" />
          </div>
        ) : viewMode === 'daily' ? (
          /* ── 1. DATE-WISE LEDGER TABLE (Exact Requested Columns) ── */
          ledger?.daily_ledger && ledger.daily_ledger.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase">
                    <th className="text-left px-4 py-2.5">Date</th>
                    <th className="text-right px-4 py-2.5">Sent Qty</th>
                    <th className="text-right px-4 py-2.5 text-emerald-600">Received Qty</th>
                    <th className="text-right px-4 py-2.5 text-amber-600">Pending Qty</th>
                    <th className="text-right px-4 py-2.5">Bill Amount</th>
                    <th className="text-right px-4 py-2.5 text-emerald-600">Paid Amount</th>
                    <th className="text-right px-4 py-2.5 font-black text-brand-navy-900">Payment Due</th>
                    <th className="text-left px-4 py-2.5">Activity Details</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.daily_ledger.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 text-xs">
                      <td className="px-4 py-3 text-slate-600 font-mono font-medium">{fmtDate(row.date)}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-700 tabular-nums">
                        {row.sent_qty > 0 ? `${row.sent_qty} pcs` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600 tabular-nums">
                        {row.received_qty > 0 ? `${row.received_qty} pcs` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                          row.pending_qty > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {row.pending_qty} pcs
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">
                        {row.bill_amount > 0 ? rs(row.bill_amount) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600 tabular-nums">
                        {row.paid_amount > 0 ? rs(row.paid_amount) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-brand-navy-900 tabular-nums">
                        {rs(row.payment_due)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-[11px] max-w-xs truncate" title={row.details}>
                        {row.details || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs">
              No ledger activity recorded yet for this vendor.
            </div>
          )
        ) : (
          /* ── 2. INDIVIDUAL TRANSACTION AUDIT TRAIL ── */
          ledger?.transactions && ledger.transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[750px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase">
                    <th className="text-left px-4 py-2.5">Date</th>
                    <th className="text-left px-4 py-2.5">Type</th>
                    <th className="text-left px-4 py-2.5">Reference</th>
                    <th className="text-left px-4 py-2.5">Description</th>
                    <th className="text-right px-4 py-2.5">Bill Amount</th>
                    <th className="text-right px-4 py-2.5">Paid Amount</th>
                    <th className="text-right px-4 py-2.5 font-black text-brand-navy-900">Balance Due</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.transactions.map((t, idx) => (
                    <tr key={idx} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 text-xs">
                      <td className="px-4 py-3 text-slate-500 font-mono">{fmtDate(t.date)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          t.type === 'BILL' ? 'bg-amber-100 text-amber-800'
                          : t.type === 'PAYMENT' ? 'bg-emerald-100 text-emerald-800'
                          : t.type === 'DISPATCH' ? 'bg-blue-100 text-blue-800'
                          : 'bg-teal-100 text-teal-800'
                        }`}>
                          {t.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">{t.reference}</td>
                      <td className="px-4 py-3 text-slate-700">{t.description}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">
                        {t.bill_amount > 0 ? rs(t.bill_amount) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600 tabular-nums">
                        {t.paid_amount > 0 ? rs(t.paid_amount) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-slate-900 tabular-nums">
                        {rs(t.balance_due)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs">
              No transactions found for this vendor.
            </div>
          )
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// 6. AUDIT HISTORY TAB
// ══════════════════════════════════════════════════════════════════

const AuditHistoryTab = ({
  dispatches,
  vendors,
  onView,
}: {
  dispatches: LaundryDispatch[];
  vendors: LaundryVendor[];
  onView: (d: LaundryDispatch) => void;
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-brand-navy-900">Historical Dispatches & Receipts Audit</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase">
              <th className="text-left px-4 py-2.5">Date</th>
              <th className="text-left px-4 py-2.5">Dispatch No</th>
              <th className="text-left px-4 py-2.5">Vendor</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-right px-4 py-2.5">Amount</th>
              <th className="text-center px-4 py-2.5">View</th>
            </tr>
          </thead>
          <tbody>
            {dispatches.map((d) => (
              <tr key={d.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 text-xs">
                <td className="px-4 py-3 text-slate-500 font-mono">{fmtDate(d.dispatch_date)}</td>
                <td className="px-4 py-3 font-mono font-bold text-slate-700">{d.dispatch_no}</td>
                <td className="px-4 py-3 font-semibold text-slate-800">{d.vendor_name}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[d.status] || STATUS_STYLES['Sent']}`}>
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-bold text-slate-700 tabular-nums">{rs(d.total_amount)}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => onView(d)} className="p-1.5 text-slate-400 hover:text-brand-600 rounded-lg">
                    <Eye className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════════════════════════════

// ── New Dispatch Modal ──
// ── Select Dispatch to Receive Modal (Direct Entry) ──
const SelectDispatchToReceiveModal = ({
  dispatches,
  onSelect,
  onClose,
}: {
  dispatches: LaundryDispatch[];
  onSelect: (d: LaundryDispatch) => void;
  onClose: () => void;
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = dispatches.filter((d) => {
    const q = searchTerm.toLowerCase();
    return (
      d.dispatch_no.toLowerCase().includes(q) ||
      (d.vendor_name || '').toLowerCase().includes(q) ||
      (d.challan_no || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
          <div>
            <h3 className="text-base font-bold text-brand-navy-900 flex items-center gap-2">
              <ArrowDownToLine className="w-5 h-5 text-emerald-600" />
              Receive Linen from Vendor
            </h3>
            <p className="text-xs text-slate-500">Select an active dispatch to record returned laundry items.</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="shrink-0">
          <input
            type="text"
            placeholder="Search vendor name, dispatch number (e.g. LD-2026...), or challan..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <div className="overflow-y-auto space-y-2.5 flex-1 pr-1">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              No active dispatches waiting for receipt.
            </div>
          ) : (
            filtered.map((d) => {
              const totalSent = (d.items || []).reduce((s, i) => s + (Number(i.sent_qty) || 0), 0);
              const totalRecv = (d.items || []).reduce((s, i) => s + (Number(i.total_received) || 0), 0);
              const totalDmg = (d.items || []).reduce((s, i) => s + ((Number(i.total_damaged) || 0) + (Number(i.total_lost) || 0)), 0);
              const pending = Math.max(0, totalSent - totalRecv - totalDmg);

              return (
                <div
                  key={d.id}
                  className="p-3.5 border border-slate-200 hover:border-emerald-500 rounded-xl bg-slate-50/50 hover:bg-white transition flex items-center justify-between gap-3 shadow-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">{d.vendor_name || 'Vendor'}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[d.status] || STATUS_STYLES['Sent']}`}>
                        {d.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {d.dispatch_no} • {fmtDate(d.dispatch_date)}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-600">Sent: <strong>{totalSent} pcs</strong></span>
                      <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                        {pending} pcs pending
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => onSelect(d)}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5 shrink-0"
                  >
                    <ArrowDownToLine className="w-3.5 h-3.5" />
                    <span>Receive Return</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-slate-100 pt-3 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ── New Dispatch Modal (With Vendor Pricing / Charges) ──
const NewDispatchModal = ({
  vendors,
  linenItems,
  defaultDate,
  onClose,
  onSaved,
}: {
  vendors: LaundryVendor[];
  linenItems: LinenItem[];
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [dispatchDate, setDispatchDate] = useState(defaultDate);
  const [vendorId, setVendorId] = useState(vendors[0]?.id || '');
  const [challanNo, setChallanNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [rows, setRows] = useState<Array<{
    linen_item_id: string;
    item_name: string;
    sent_qty: number;
    rate_per_piece: number;
    amount: number;
  }>>([
    {
      linen_item_id: linenItems[0]?.id || '',
      item_name: linenItems[0]?.item_name || '',
      sent_qty: 1,
      rate_per_piece: linenItems[0]?.standard_rate || 0,
      amount: linenItems[0]?.standard_rate || 0,
    },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When vendor changes, load vendor-specific rates
  useEffect(() => {
    if (!vendorId) return;
    getVendorRates(vendorId)
      .then((rates) => {
        if (!rates || rates.length === 0) return;
        const rateMap = new Map(rates.map((r) => [r.linen_item_id, r.rate_per_piece]));
        setRows((prev) =>
          prev.map((r) => {
            if (r.linen_item_id && rateMap.has(r.linen_item_id)) {
              const rate = rateMap.get(r.linen_item_id)!;
              return {
                ...r,
                rate_per_piece: rate,
                amount: (r.sent_qty || 1) * rate,
              };
            }
            return r;
          })
        );
      })
      .catch((e) => console.warn('Vendor rates lookup note:', e?.message));
  }, [vendorId]);

  const addRow = () => {
    const item = linenItems[0];
    if (!item) return;
    setRows([
      ...rows,
      {
        linen_item_id: item.id,
        item_name: item.item_name,
        sent_qty: 1,
        rate_per_piece: item.standard_rate || 0,
        amount: item.standard_rate || 0,
      },
    ]);
  };

  const totalPieces = rows.reduce((s, r) => s + (Number(r.sent_qty) || 0), 0);
  const totalCost = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const v = vendors.find((vend) => vend.id === vendorId);
      await saveDispatch({
        dispatch_date: dispatchDate,
        vendor_id: vendorId,
        vendor_name: v?.vendor_name || '',
        challan_no: challanNo,
        expected_return_date: null,
        remarks,
        sent_by: 'Staff',
        items: rows.map((r) => ({
          linen_item_id: r.linen_item_id || null,
          item_name: r.item_name,
          sent_qty: Number(r.sent_qty),
          rate_per_piece: Number(r.rate_per_piece),
          amount: Number(r.sent_qty) * Number(r.rate_per_piece),
        })),
      });
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Failed to dispatch linen');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-5 lg:p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-800">New Laundry Dispatch</h3>
            <p className="text-xs text-slate-400">Specify linen quantities and vendor washing charges per piece.</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        {error && <div className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg shrink-0">{error}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">Dispatch Date</label>
            <input
              type="date"
              value={dispatchDate}
              onChange={(e) => setDispatchDate(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg p-2 font-medium"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">Vendor</label>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg p-2 font-medium"
            >
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">Challan / Slip No. (Optional)</label>
            <input
              type="text"
              placeholder="e.g. CH-9901"
              value={challanNo}
              onChange={(e) => setChallanNo(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg p-2 font-medium"
            />
          </div>
        </div>

        {/* Linen Items Table */}
        <div className="space-y-2 flex-1 overflow-y-auto pr-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">Linen Items & Washing Rates</span>
            <button
              onClick={addRow}
              className="text-xs text-brand-600 hover:text-brand-700 font-bold hover:underline flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Item</span>
            </button>
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 uppercase px-3 py-1 bg-slate-50 rounded-lg border border-slate-200">
            <div className="col-span-5">Linen Item</div>
            <div className="col-span-2 text-right">Sent Qty (Pcs)</div>
            <div className="col-span-2 text-right">Vendor Rate (₹/pc)</div>
            <div className="col-span-2 text-right">Est. Charge (₹)</div>
            <div className="col-span-1 text-center"></div>
          </div>

          {/* Rows */}
          <div className="space-y-2">
            {rows.map((r, i) => {
              const selectedLinen = linenItems.find((l) => l.id === r.linen_item_id);
              return (
                <div key={i} className="grid grid-cols-12 gap-2 items-center bg-slate-50/70 p-2.5 rounded-xl border border-slate-200">
                  <div className="col-span-5">
                    <select
                      value={r.linen_item_id}
                      onChange={(e) => {
                        const it = linenItems.find((l) => l.id === e.target.value);
                        const updated = [...rows];
                        const rate = it?.standard_rate || 0;
                        const qty = updated[i].sent_qty || 1;
                        updated[i] = {
                          ...updated[i],
                          linen_item_id: e.target.value,
                          item_name: it?.item_name || '',
                          rate_per_piece: rate,
                          amount: qty * rate,
                        };
                        setRows(updated);
                      }}
                      className="w-full text-xs border border-slate-200 rounded-lg p-2 font-medium bg-white"
                    >
                      <option value="">-- Select Linen Item --</option>
                      {linenItems.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.item_name} ({l.category} • In Hotel: {l.available_in_hotel ?? 0} pcs)
                        </option>
                      ))}
                    </select>
                    {selectedLinen && (
                      <span className="text-[10px] text-slate-400 block px-1 mt-0.5">
                        In Hotel Stock: <strong className="text-emerald-700">{selectedLinen.available_in_hotel ?? 0} pcs</strong>
                      </span>
                    )}
                  </div>

                  <div className="col-span-2">
                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={r.sent_qty}
                      onChange={(e) => {
                        const qty = Number(e.target.value);
                        const updated = [...rows];
                        updated[i].sent_qty = qty;
                        updated[i].amount = qty * updated[i].rate_per_piece;
                        setRows(updated);
                      }}
                      className="w-full text-xs border border-slate-200 rounded-lg p-2 text-right font-bold"
                    />
                  </div>

                  <div className="col-span-2">
                    <div className="relative">
                      <span className="absolute left-2 top-2 text-xs text-slate-400">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        placeholder="Rate"
                        value={r.rate_per_piece}
                        onChange={(e) => {
                          const rate = Number(e.target.value);
                          const updated = [...rows];
                          updated[i].rate_per_piece = rate;
                          updated[i].amount = (updated[i].sent_qty || 0) * rate;
                          setRows(updated);
                        }}
                        className="w-full text-xs border border-slate-200 rounded-lg p-2 pl-5 text-right font-semibold"
                        title="Vendor washing charge per piece"
                      />
                    </div>
                  </div>

                  <div className="col-span-2 text-right font-extrabold text-xs text-slate-800 pr-1 tabular-nums">
                    {rs(r.amount)}
                  </div>

                  <div className="col-span-1 text-center">
                    <button
                      onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                      disabled={rows.length === 1}
                      className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 rounded-lg transition"
                      title="Remove Item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pricing & Estimation Card */}
        <div className="bg-gradient-to-r from-slate-50 to-indigo-50/40 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <span className="text-xs font-bold text-slate-700">Total Estimated Laundry Charge: </span>
            <span className="text-sm font-black text-brand-600">{rs(totalCost)}</span>
            <span className="text-xs text-slate-400 ml-2">({totalPieces} pieces total)</span>
          </div>
          <div className="text-[11px] text-slate-500 max-w-sm">
            💡 The washing rate set here is used when linen is received back. Pending linen is billed at ₹0 until returned.
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 text-xs font-semibold bg-brand-600 text-white rounded-lg shadow-sm">
            {saving ? 'Saving...' : 'Confirm Dispatch'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Receive Modal (With Full Accounting: Received Clean, Damaged, Lost & Remaining Pending) ──
const ReceiveModal = ({
  dispatch,
  onClose,
  onSaved,
}: {
  dispatch: LaundryDispatch;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [receiptDate, setReceiptDate] = useState(todayStr());
  const [remarks, setRemarks] = useState('');
  const [items, setItems] = useState<Array<{
    dispatch_item_id: string;
    linen_item_id: string | null;
    item_name: string;
    sent_qty: number;
    pending_before: number;
    received_now: number;
    damaged_qty: number;
    lost_qty: number;
    is_billable: boolean;
    rate_applied: number;
  }>>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initItems = (sourceList: any[]) => {
      const list = sourceList.map((it) => {
        const sent = Number(it.sent_qty) || 0;
        const recv = Number(it.total_received) || 0;
        const dmg = Number(it.total_damaged) || 0;
        const lost = Number(it.total_lost) || 0;
        const pending = Math.max(0, sent - recv - dmg - lost);

        return {
          dispatch_item_id: it.id,
          linen_item_id: it.linen_item_id,
          item_name: it.item_name,
          sent_qty: sent,
          pending_before: pending,
          received_now: pending, // Default: full remaining clean
          damaged_qty: 0,
          lost_qty: 0,
          is_billable: true,
          rate_applied: Number(it.rate_per_piece) || 0,
        };
      });
      setItems(list);
    };

    const directItems = dispatch.items || (dispatch as any).laundry_dispatch_items;
    if (directItems && directItems.length > 0) {
      initItems(directItems);
    } else if (dispatch.id) {
      setLoadingItems(true);
      getDispatchDetail(dispatch.id)
        .then((detail) => {
          if (detail && detail.items && detail.items.length > 0) {
            initItems(detail.items);
          }
        })
        .catch((err) => {
          console.error('Failed to load dispatch items:', err);
          setError('Failed to load items for this dispatch.');
        })
        .finally(() => setLoadingItems(false));
    }
  }, [dispatch]);

  // Quick Action: Fill all as Clean Received
  const handleReceiveAllClean = () => {
    setItems((prev) =>
      prev.map((i) => ({
        ...i,
        received_now: i.pending_before,
        damaged_qty: 0,
        lost_qty: 0,
      }))
    );
  };

  // Quick Action: Clear all inputs to 0
  const handleClearAll = () => {
    setItems((prev) =>
      prev.map((i) => ({
        ...i,
        received_now: 0,
        damaged_qty: 0,
        lost_qty: 0,
      }))
    );
  };

  // Derived totals
  const totalCleanReceived = items.reduce((s, i) => s + (Number(i.received_now) || 0), 0);
  const totalDamaged = items.reduce((s, i) => s + (Number(i.damaged_qty) || 0), 0);
  const totalLost = items.reduce((s, i) => s + (Number(i.lost_qty) || 0), 0);
  const totalStillPending = items.reduce(
    (s, i) =>
      s +
      Math.max(
        0,
        i.pending_before -
          (Number(i.received_now) || 0) -
          (Number(i.damaged_qty) || 0) -
          (Number(i.lost_qty) || 0)
      ),
    0
  );
  const totalBillableAmount = items.reduce(
    (s, i) =>
      s +
      (i.is_billable
        ? (Number(i.received_now) || 0) * (Number(i.rate_applied) || 0)
        : 0),
    0
  );

  const handleSave = async () => {
    try {
      if (items.length === 0) {
        setError('No items available in this dispatch.');
        return;
      }
      const totalAccountedNow = totalCleanReceived + totalDamaged + totalLost;
      if (totalAccountedNow === 0) {
        setError('Please enter at least one quantity for Received Clean, Damaged, or Lost.');
        return;
      }

      setSaving(true);
      setError(null);
      await saveReceipt({
        dispatch_id: dispatch.id,
        receipt_date: receiptDate,
        remarks,
        received_by: 'Staff',
        items: items.map((i) => ({
          dispatch_item_id: i.dispatch_item_id,
          item_name: i.item_name,
          linen_item_id: i.linen_item_id,
          sent_qty: i.sent_qty,
          received_now: Number(i.received_now) || 0,
          damaged_qty: Number(i.damaged_qty) || 0,
          lost_qty: Number(i.lost_qty) || 0,
          damaged_lost: (Number(i.damaged_qty) || 0) + (Number(i.lost_qty) || 0),
          remaining_pending: Math.max(
            0,
            i.pending_before -
              (Number(i.received_now) || 0) -
              (Number(i.damaged_qty) || 0) -
              (Number(i.lost_qty) || 0)
          ),
          is_billable: i.is_billable,
          rate_applied: Number(i.rate_applied) || 0,
        })),
      });
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Failed to record receipt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-5xl w-full p-5 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ArrowDownToLine className="w-5 h-5 text-emerald-600" />
              Receive from Laundry Vendor
            </h3>
            <p className="text-xs text-slate-500">
              Dispatch <span className="font-mono font-bold text-slate-700">{dispatch.dispatch_no}</span> •{' '}
              <span className="font-semibold text-slate-800">{dispatch.vendor_name}</span> •{' '}
              Sent on {fmtDate(dispatch.dispatch_date)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-2.5 rounded-xl shrink-0 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Date, Remarks, & Quick Fill Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 shrink-0 items-end bg-slate-50/60 p-3 rounded-xl border border-slate-200">
          <div className="sm:col-span-3">
            <label className="text-[11px] font-bold text-slate-700 block mb-1">Return Date</label>
            <input
              type="date"
              value={receiptDate}
              onChange={(e) => setReceiptDate(e.target.value)}
              className="w-full text-xs border border-slate-200 bg-white rounded-lg p-2 font-medium focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div className="sm:col-span-5">
            <label className="text-[11px] font-bold text-slate-700 block mb-1">Remarks / Notes</label>
            <input
              type="text"
              placeholder="e.g. Received clean linen, 1 pc damaged, 1 pc pending"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full text-xs border border-slate-200 bg-white rounded-lg p-2 font-medium focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div className="sm:col-span-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleReceiveAllClean}
              className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 rounded-lg transition"
            >
              Receive All Clean
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg transition"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Real-Time Accounting Breakdown Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-2.5">
            <div className="text-[11px] font-semibold text-emerald-800 flex items-center justify-between">
              <span>🧺 Received Clean</span>
              <span className="text-[10px] bg-emerald-200/70 text-emerald-900 px-1.5 py-0.2 rounded font-mono">Billable</span>
            </div>
            <div className="text-lg font-black text-emerald-700 mt-0.5">{totalCleanReceived} pcs</div>
            <div className="text-[10px] text-emerald-600">Back in active hotel stock</div>
          </div>

          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-2.5">
            <div className="text-[11px] font-semibold text-amber-900 flex items-center justify-between">
              <span>⚠️ Damaged</span>
              <span className="text-[10px] bg-amber-200/70 text-amber-900 px-1.5 py-0.2 rounded font-mono">₹0 Bill</span>
            </div>
            <div className="text-lg font-black text-amber-700 mt-0.5">{totalDamaged} pcs</div>
            <div className="text-[10px] text-amber-600">Recorded as damaged</div>
          </div>

          <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-2.5">
            <div className="text-[11px] font-semibold text-rose-900 flex items-center justify-between">
              <span>❌ Lost / Missing</span>
              <span className="text-[10px] bg-rose-200/70 text-rose-900 px-1.5 py-0.2 rounded font-mono">₹0 Bill</span>
            </div>
            <div className="text-lg font-black text-rose-700 mt-0.5">{totalLost} pcs</div>
            <div className="text-[10px] text-rose-600">Subtracted from linen stock</div>
          </div>

          <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-2.5">
            <div className="text-[11px] font-semibold text-indigo-900 flex items-center justify-between">
              <span>⏳ Remaining Pending</span>
              <span className="text-[10px] bg-indigo-200/70 text-indigo-900 px-1.5 py-0.2 rounded font-mono">OPEN</span>
            </div>
            <div className="text-lg font-black text-indigo-700 mt-0.5">{totalStillPending} pcs</div>
            <div className="text-[10px] text-indigo-600">Still with laundry vendor</div>
          </div>
        </div>

        {/* Partial Receiving Guidance Alert */}
        {totalStillPending > 0 ? (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-2.5 flex items-start gap-2.5 text-xs text-amber-950 shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold">Partial Return In Progress: </strong>
              <span>
                <strong>{totalStillPending} piece(s)</strong> will remain PENDING with the vendor.
                This dispatch stays <em>Partially Received (OPEN)</em>. When the vendor returns the remaining piece(s) later, receive against this same dispatch to close it.
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-2 flex items-center gap-2 text-xs text-emerald-950 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>All dispatched items will be fully accounted for. This dispatch will be completed.</span>
          </div>
        )}

        {/* Items Table */}
        <div className="overflow-x-auto flex-1 overflow-y-auto border border-slate-200 rounded-xl">
          {loadingItems ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <span className="text-xs">Loading dispatch linen items...</span>
            </div>
          ) : (
            <table className="w-full text-xs min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-600 uppercase sticky top-0">
                  <th className="text-left p-2.5">Item Name</th>
                  <th className="text-right p-2.5">Sent</th>
                  <th className="text-right p-2.5">Outstanding</th>
                  <th className="text-right p-2.5 text-emerald-700 font-bold bg-emerald-50/50">Received (Clean)</th>
                  <th className="text-right p-2.5 text-amber-700 font-bold bg-amber-50/50">Damaged</th>
                  <th className="text-right p-2.5 text-rose-700 font-bold bg-rose-50/50">Lost</th>
                  <th className="text-right p-2.5 text-indigo-700 font-bold">Remaining Pending</th>
                  <th className="text-center p-2.5">Billable?</th>
                  <th className="text-right p-2.5">Rate</th>
                  <th className="text-right p-2.5 font-bold">Bill (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it, idx) => {
                  const recv = Number(it.received_now) || 0;
                  const dmg = Number(it.damaged_qty) || 0;
                  const lost = Number(it.lost_qty) || 0;
                  const remaining = Math.max(0, it.pending_before - recv - dmg - lost);
                  const lineBill = it.is_billable ? recv * (it.rate_applied || 0) : 0;

                  return (
                    <tr key={idx} className="hover:bg-slate-50/60">
                      <td className="p-2.5 font-bold text-slate-800">{it.item_name}</td>
                      <td className="p-2.5 text-right tabular-nums text-slate-500">{it.sent_qty}</td>
                      <td className="p-2.5 text-right font-bold text-slate-700 tabular-nums">{it.pending_before}</td>
                      
                      {/* Received Clean */}
                      <td className="p-2.5 text-right bg-emerald-50/20">
                        <input
                          type="number"
                          min="0"
                          max={Math.max(0, it.pending_before - dmg - lost)}
                          value={it.received_now}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value));
                            const updated = [...items];
                            updated[idx].received_now = val;
                            setItems(updated);
                          }}
                          className="w-18 border border-emerald-300 rounded-lg p-1 text-right font-bold text-emerald-700 bg-white focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </td>

                      {/* Damaged */}
                      <td className="p-2.5 text-right bg-amber-50/20">
                        <input
                          type="number"
                          min="0"
                          max={Math.max(0, it.pending_before - recv - lost)}
                          value={it.damaged_qty}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value));
                            const updated = [...items];
                            updated[idx].damaged_qty = val;
                            setItems(updated);
                          }}
                          className="w-16 border border-amber-300 rounded-lg p-1 text-right font-bold text-amber-700 bg-white focus:ring-2 focus:ring-amber-500/20"
                        />
                      </td>

                      {/* Lost */}
                      <td className="p-2.5 text-right bg-rose-50/20">
                        <input
                          type="number"
                          min="0"
                          max={Math.max(0, it.pending_before - recv - dmg)}
                          value={it.lost_qty}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value));
                            const updated = [...items];
                            updated[idx].lost_qty = val;
                            setItems(updated);
                          }}
                          className="w-16 border border-rose-300 rounded-lg p-1 text-right font-bold text-rose-700 bg-white focus:ring-2 focus:ring-rose-500/20"
                        />
                      </td>

                      {/* Remaining Pending */}
                      <td className="p-2.5 text-right tabular-nums">
                        {remaining > 0 ? (
                          <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full text-[11px]">
                            {remaining} pcs
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-semibold text-[11px]">0 pcs ✓</span>
                        )}
                      </td>

                      {/* Billable Checkbox */}
                      <td className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={it.is_billable}
                          onChange={(e) => {
                            const updated = [...items];
                            updated[idx].is_billable = e.target.checked;
                            setItems(updated);
                          }}
                          title="Include in laundry washing billing"
                          className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                        />
                      </td>

                      {/* Rate */}
                      <td className="p-2.5 text-right tabular-nums text-slate-500 font-mono">
                        ₹{it.rate_applied}
                      </td>

                      {/* Bill (₹) */}
                      <td className="p-2.5 text-right tabular-nums font-bold text-slate-800">
                        {rs(lineBill)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Billing Rule Summary Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <span className="text-xs font-bold text-slate-700">Receipt Billable Amount: </span>
            <span className="text-sm font-black text-emerald-600">{rs(totalBillableAmount)}</span>
            <span className="text-xs text-slate-400 ml-2">({totalCleanReceived} clean returned pieces approved as billable)</span>
          </div>
          <div className="text-[11px] text-slate-500 max-w-sm">
            🛡️ <strong>Rule:</strong> Pending pieces ({totalStillPending} pcs), damaged ({totalDamaged} pcs), and lost ({totalLost} pcs) have <strong>₹0 washing billing</strong>.
          </div>
        </div>

        {/* Modal Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="px-3.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition">
            {saving ? 'Processing...' : 'Confirm Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Dispatch Detail Modal ──
const DispatchDetailModal = ({
  dispatchId,
  onClose,
  onReceiveAgain,
}: {
  dispatchId: string;
  onClose: () => void;
  onReceiveAgain: () => void;
}) => {
  const [detail, setDetail] = useState<DispatchWithReceipts | null>(null);

  useEffect(() => {
    getDispatchDetail(dispatchId).then(setDetail);
  }, [dispatchId]);

  if (!detail) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-800">Dispatch Details: {detail.dispatch_no}</h3>
            <p className="text-xs text-slate-400">{detail.vendor_name} • {fmtDate(detail.dispatch_date)} • Status: <span className="font-semibold">{detail.status}</span></p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="space-y-3 flex-1 overflow-y-auto">
          <h4 className="text-xs font-bold uppercase text-slate-500">Items Dispatched & Current Accounting</h4>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-[10px] uppercase font-bold text-slate-600">
                  <th className="text-left p-2.5">Item</th>
                  <th className="text-right p-2.5">Sent</th>
                  <th className="text-right p-2.5 text-emerald-600">Clean Received</th>
                  <th className="text-right p-2.5 text-amber-600">Damaged</th>
                  <th className="text-right p-2.5 text-rose-600">Lost</th>
                  <th className="text-right p-2.5 text-indigo-600 font-bold">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.items.map((it) => {
                  const recv = it.total_received !== undefined ? Number(it.total_received) : (detail.received_totals[it.item_name] || 0);
                  const dmg = it.total_damaged !== undefined ? Number(it.total_damaged) : (detail.damaged_totals[it.item_name] || 0);
                  const lost = it.total_lost !== undefined ? Number(it.total_lost) : ((detail.lost_totals && detail.lost_totals[it.item_name]) || 0);
                  const pend = Math.max(0, it.sent_qty - recv - dmg - lost);
                  return (
                    <tr key={it.id} className="hover:bg-slate-50/50">
                      <td className="p-2.5 font-bold text-slate-800">{it.item_name}</td>
                      <td className="p-2.5 text-right text-slate-500 tabular-nums">{it.sent_qty}</td>
                      <td className="p-2.5 text-right text-emerald-600 font-semibold tabular-nums">{recv}</td>
                      <td className="p-2.5 text-right text-amber-600 tabular-nums">{dmg}</td>
                      <td className="p-2.5 text-right text-rose-600 tabular-nums">{lost}</td>
                      <td className="p-2.5 text-right font-bold text-indigo-600 tabular-nums">{pend}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Receipt History */}
          {detail.receipts && detail.receipts.length > 0 && (
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-bold uppercase text-slate-500">Return Receipts Recorded ({detail.receipts.length})</h4>
              <div className="space-y-2">
                {detail.receipts.map((r) => (
                  <div key={r.id} className="p-3 border border-slate-200 rounded-xl bg-slate-50/50 text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-semibold">
                      <span className="text-slate-800">Date: {fmtDate(r.receipt_date)}</span>
                      <span className="text-slate-500">Received By: {r.received_by || 'Staff'}</span>
                    </div>
                    {r.remarks && <p className="text-[11px] text-slate-500 italic">"{r.remarks}"</p>}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(r.items_json || []).map((entry, idx) => (
                        <span key={idx} className="bg-white border border-slate-200 px-2 py-0.5 rounded text-[11px] text-slate-700">
                          <strong>{entry.item_name}:</strong> {entry.received_now || 0} clean
                          {(Number(entry.damaged_qty) || 0) > 0 && `, ${entry.damaged_qty} damaged`}
                          {(Number(entry.lost_qty) || 0) > 0 && `, ${entry.lost_qty} lost`}
                          {entry.bill_amount ? ` (₹${entry.bill_amount})` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="px-3.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg">Close</button>
          {detail.status !== 'Completed' && detail.status !== 'CLOSED' && (
            <button onClick={onReceiveAgain} className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm">Receive Linen</button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Stock Movement Modal (Add / Adjust Stock) ──
const StockMovementModal = ({
  linenItems,
  onClose,
  onSaved,
  onOpenLinenMaster,
  onReload,
}: {
  linenItems: LinenItem[];
  onClose: () => void;
  onSaved: () => void;
  onOpenLinenMaster?: () => void;
  onReload?: () => void;
}) => {
  const [itemId, setItemId] = useState(linenItems[0]?.id || '');
  const [movementType, setMovementType] = useState<LinenStockMovement['movement_type']>('addition');
  const [quantity, setQuantity] = useState(10);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedItem = linenItems.find((l) => l.id === itemId);
  const currentTotal = selectedItem?.total_active_stock || 0;
  const currentAvail = selectedItem?.available_in_hotel || 0;

  let afterPreview = currentTotal;
  if (['addition', 'opening', 'adjustment_add', 'correction'].includes(movementType)) {
    afterPreview = currentTotal + Number(quantity);
  } else {
    afterPreview = Math.max(0, currentTotal - Number(quantity));
  }

  const handleSeedDefaults = async () => {
    try {
      setSeeding(true);
      setError(null);
      await seedStandardLinenItems();
      if (onReload) await onReload();
    } catch (e: any) {
      setError(e.message || 'Failed to seed linen items');
    } finally {
      setSeeding(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await recordStockMovement({
        linen_item_id: itemId,
        movement_date: todayStr(),
        movement_type: movementType,
        quantity: Number(quantity),
        reason,
      });
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Failed to record stock movement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-800">Add or Adjust Linen Stock</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        {error && <div className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg">{error}</div>}

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-slate-500 font-bold block">Select Linen Item</label>
              {onOpenLinenMaster && (
                <button
                  type="button"
                  onClick={onOpenLinenMaster}
                  className="text-[10px] text-brand-600 font-semibold hover:underline"
                >
                  + Add New Linen Master Item
                </button>
              )}
            </div>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg p-2.5 font-medium bg-white"
            >
              <option value="" disabled>-- Select Linen Item --</option>
              {linenItems.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.item_name} ({l.category} • Total Stock: {l.total_active_stock} pcs)
                </option>
              ))}
            </select>
          </div>

          {linenItems.length <= 1 && (
            <div className="p-3 bg-blue-50/90 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
              <div>
                <span className="text-[11px] font-semibold text-blue-900 block">
                  Only {linenItems.length === 1 ? `"${linenItems[0]?.item_name}"` : '0 items'} configured
                </span>
                <span className="text-[10px] text-blue-700">Need Pillow Covers, Towels, Mats, Blankets?</span>
              </div>
              <button
                type="button"
                onClick={handleSeedDefaults}
                disabled={seeding || saving}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] rounded-lg shrink-0 shadow-sm transition"
              >
                {seeding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                <span>{seeding ? 'Adding...' : 'Add Standard Items'}</span>
              </button>
            </div>
          )}

          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Movement Type</label>
            <select value={movementType} onChange={(e) => setMovementType(e.target.value as any)} className="w-full text-xs border border-slate-200 rounded-lg p-2">
              <option value="addition">New Purchase / Addition (+)</option>
              <option value="adjustment_add">Physical Audit Surplus (+)</option>
              <option value="discard">Permanent Discard / Torn (-)</option>
              <option value="adjustment_sub">Physical Audit Deficit (-)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Quantity (Pieces)</label>
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full text-xs border border-slate-200 rounded-lg p-2 font-bold" />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Reason / Notes</label>
            <input type="text" placeholder="e.g. Purchased 50 new pieces from supplier" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg p-2" />
          </div>

          <div className="bg-slate-50 rounded-xl p-3 text-xs space-y-1">
            <div className="flex justify-between text-slate-500">
              <span>Current Total Stock:</span>
              <span className="font-bold">{currentTotal} pcs</span>
            </div>
            <div className="flex justify-between font-bold text-brand-navy-900 border-t pt-1">
              <span>Stock After Movement:</span>
              <span className="text-brand-600">{afterPreview} pcs</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 text-xs font-semibold bg-brand-600 text-white rounded-lg shadow-sm">
            {saving ? 'Recording...' : 'Commit Stock Movement'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Resolve Missing Linen Modal ──
const ResolveLostDamagedModal = ({
  item,
  onClose,
  onResolved,
}: {
  item: { dispatch_id: string; dispatch_item_id: string; item_name: string; pending_qty: number; dispatch_no: string };
  onClose: () => void;
  onResolved: () => void;
}) => {
  const [type, setType] = useState<'lost' | 'damaged'>('lost');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleResolve = async () => {
    try {
      setSaving(true);
      await resolvePendingLinen({
        dispatch_id: item.dispatch_id,
        dispatch_item_id: item.dispatch_item_id,
        resolution_type: type,
        quantity: qty,
        reason,
      });
      onResolved();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-sm font-bold">Resolve Missing Linen</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <p className="text-xs text-slate-500">Dispatch {item.dispatch_no} • Item: {item.item_name} (Pending: {item.pending_qty})</p>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Resolution Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as any)} className="w-full text-xs border rounded p-2">
              <option value="lost">Mark Permanently Lost at Laundry</option>
              <option value="damaged">Mark Damaged beyond repair</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Quantity</label>
            <input type="number" min="1" max={item.pending_qty} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="w-full text-xs border rounded p-2 font-bold" />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Reason</label>
            <input type="text" placeholder="Vendor admitted lost during washing" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full text-xs border rounded p-2" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500">Cancel</button>
          <button onClick={handleResolve} disabled={saving} className="px-4 py-1.5 text-xs font-semibold bg-rose-600 text-white rounded-lg">
            {saving ? 'Processing...' : 'Confirm Resolution'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Vendor Payment Modal ──
const VendorPaymentModal = ({
  vendors,
  defaultDate,
  onClose,
  onSaved,
}: {
  vendors: LaundryVendor[];
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [vendorId, setVendorId] = useState(vendors[0]?.id || '');
  const [amount, setAmount] = useState(500);
  const [mode, setMode] = useState<'Cash' | 'Bank' | 'UPI' | 'Credit'>('Cash');
  const [refNo, setRefNo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      await recordVendorPayment({
        vendor_id: vendorId,
        payment_date: defaultDate,
        amount: Number(amount),
        payment_mode: mode,
        reference_no: refNo,
        notes,
      });
      onSaved();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-sm font-bold">Record Vendor Payment</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Vendor</label>
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="w-full text-xs border rounded p-2">
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Amount (₹)</label>
            <input type="number" min="1" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full text-xs border rounded p-2 font-bold" />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Payment Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="w-full text-xs border rounded p-2">
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Bank">Bank Transfer</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Reference / UTR</label>
            <input type="text" placeholder="UPI ref / cheque no" value={refNo} onChange={(e) => setRefNo(e.target.value)} className="w-full text-xs border rounded p-2" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg">
            {saving ? 'Recording...' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Close Laundry Day & WhatsApp Modal ──
const CloseLaundryDayModal = ({
  vendors,
  selectedDate,
  onClose,
  onDayClosed,
}: {
  vendors: LaundryVendor[];
  selectedDate: string;
  onClose: () => void;
  onDayClosed: () => void;
}) => {
  const [vendorId, setVendorId] = useState(vendors[0]?.id || '');
  const [statement, setStatement] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!vendorId) return;
    setLoading(true);
    getDailyStatementData(vendorId, selectedDate)
      .then(setStatement)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [vendorId, selectedDate]);

  const handleSendWhatsApp = async () => {
    try {
      setSending(true);
      const res = await sendDailyWhatsAppStatement({
        vendor_id: vendorId,
        date: selectedDate,
      });
      if (res?.whatsappDirectUrl && !res?.success) {
        // Open manual fallback
        window.open(res.whatsappDirectUrl, '_blank');
      }
      onDayClosed();
    } catch (e: any) {
      alert(e.message || 'Failed to dispatch statement');
    } finally {
      setSending(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!statement) return;
    await downloadLaundryStatementPdf(statement);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">Close Laundry Day & WhatsApp Statement</h3>
            <p className="text-xs text-slate-400">Date: {fmtDate(selectedDate)}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div>
          <label className="text-[10px] text-slate-400 block mb-1">Select Vendor</label>
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="w-full text-xs border rounded p-2">
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-600" />
          </div>
        ) : statement ? (
          <div className="space-y-3">
            {/* Reconciliation Box */}
            <div className="grid grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded-xl text-center text-xs">
              <div>
                <div className="text-[9px] text-slate-400 uppercase font-bold">Opening</div>
                <div className="font-bold text-slate-700">{statement.opening_pending} pcs</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-400 uppercase font-bold">Sent Today</div>
                <div className="font-bold text-blue-600">{statement.sent_today} pcs</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-400 uppercase font-bold">Received</div>
                <div className="font-bold text-emerald-600">{statement.received_today} pcs</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-400 uppercase font-bold">Closing</div>
                <div className="font-bold text-amber-600">{statement.closing_pending} pcs</div>
              </div>
            </div>

            {/* Bill Preview */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex justify-between items-center text-xs">
              <span className="font-medium text-amber-900">Today's Approved Billable Amount:</span>
              <span className="text-base font-black text-amber-900">{rs(statement.today_billable_amount)}</span>
            </div>

            {/* WhatsApp Text Preview */}
            <div className="bg-slate-900 text-slate-200 font-mono text-[11px] p-3 rounded-xl max-h-48 overflow-y-auto whitespace-pre-wrap">
              {statement.whatsapp_text}
            </div>
          </div>
        ) : null}

        <div className="flex justify-between items-center pt-2 border-t">
          <button
            onClick={handleDownloadPdf}
            disabled={!statement}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Download PDF</span>
          </button>

          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500">Cancel</button>
            <button
              onClick={handleSendWhatsApp}
              disabled={sending || !statement}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sending ? 'Sending...' : 'Send WhatsApp & Close'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Vendor Master Modal ──
const VendorMasterModal = ({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) => {
  const [vendors, setVendors] = useState<LaundryVendor[]>([]);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [mobile, setMobile] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { getLaundryVendors().then(setVendors); }, []);

  const handleAdd = async () => {
    if (!name.trim()) return;
    try {
      setSaving(true);
      await saveLaundryVendor({
        vendor_name: name.trim(),
        contact_person: contact,
        mobile_number: mobile,
        address: '',
        gstin: '',
        default_rate_type: 'Per Piece',
        notes: '',
        is_active: true,
      });
      setName('');
      setContact('');
      setMobile('');
      const updated = await getLaundryVendors();
      setVendors(updated);
      onSaved();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-sm font-bold">Laundry Vendors Master</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>

        <div className="flex gap-2">
          <input type="text" placeholder="Vendor Name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 text-xs border rounded p-2" />
          <input type="text" placeholder="Mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} className="w-28 text-xs border rounded p-2" />
          <button onClick={handleAdd} disabled={saving} className="px-3 py-2 bg-brand-600 text-white text-xs font-semibold rounded-lg">Add</button>
        </div>

        <div className="divide-y max-h-60 overflow-y-auto">
          {vendors.map((v) => (
            <div key={v.id} className="py-2 flex justify-between items-center text-xs">
              <div>
                <div className="font-bold text-slate-800">{v.vendor_name}</div>
                <div className="text-[10px] text-slate-400">{v.mobile_number || 'No phone'}</div>
              </div>
              <button
                onClick={async () => {
                  if (window.confirm(`Delete ${v.vendor_name}?`)) {
                    await deleteLaundryVendor(v.id);
                    setVendors(await getLaundryVendors());
                    onSaved();
                  }
                }}
                className="text-rose-500 hover:text-rose-700 p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2 border-t">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500">Close</button>
        </div>
      </div>
    </div>
  );
};

// ── Linen Item Master Modal ──
const LinenMasterModal = ({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) => {
  const [items, setItems] = useState<LinenItem[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(LINEN_CATEGORIES[0]);
  const [rate, setRate] = useState(15);
  const [initialStock, setInitialStock] = useState(50);
  const [saving, setSaving] = useState(false);

  useEffect(() => { getLinenItems().then(setItems); }, []);

  const handleAdd = async () => {
    if (!name.trim()) return;
    try {
      setSaving(true);
      await saveLinenItem({
        item_name: name.trim(),
        category,
        unit: 'Pieces',
        standard_rate: Number(rate),
        is_active: true,
        initial_stock: Number(initialStock),
      });
      setName('');
      setItems(await getLinenItems());
      onSaved();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-sm font-bold">Linen Master Configuration</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input type="text" placeholder="Item Name (e.g. Duvet)" value={name} onChange={(e) => setName(e.target.value)} className="text-xs border rounded p-2" />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="text-xs border rounded p-2">
            {LINEN_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="number" placeholder="Std Rate (₹)" value={rate} onChange={(e) => setRate(Number(e.target.value))} className="text-xs border rounded p-2" />
          <input type="number" placeholder="Initial Stock (pcs)" value={initialStock} onChange={(e) => setInitialStock(Number(e.target.value))} className="text-xs border rounded p-2" />
        </div>

        <div className="flex justify-end">
          <button onClick={handleAdd} disabled={saving} className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg">
            Add Linen Item
          </button>
        </div>

        <div className="divide-y max-h-56 overflow-y-auto">
          {items.map((it) => (
            <div key={it.id} className="py-2 flex justify-between items-center text-xs">
              <div>
                <div className="font-bold text-slate-800">{it.item_name}</div>
                <div className="text-[10px] text-slate-400">{it.category} • Rs.{it.standard_rate}/pc</div>
              </div>
              <button
                onClick={async () => {
                  if (window.confirm(`Delete ${it.item_name}?`)) {
                    await deleteLinenItem(it.id);
                    setItems(await getLinenItems());
                    onSaved();
                  }
                }}
                className="text-rose-500 hover:text-rose-700 p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2 border-t">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500">Close</button>
        </div>
      </div>
    </div>
  );
};

export default LaundryLinenScreen;
