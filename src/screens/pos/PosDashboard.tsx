import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, LayoutDashboard, UtensilsCrossed, Armchair, ArrowRight, ChefHat, Receipt,
  TrendingUp, ShoppingBag, BedDouble, Banknote, Smartphone, CreditCard, Building2,
  Percent, Ban, Clock, Receipt as ReceiptIcon, BarChart3,
} from 'lucide-react';
import { getPosDashboardStats, removePosTestData } from '@/lib/api-pos';
import type { PosDashboardStats } from '@/lib/api-pos';
import { AreaChart, BarChart, DonutChart } from '@/components/charts';

interface PosDashboardProps {
  onBack: () => void;
  onNavigate: (screen: string) => void;
}

const fmt = (n: number): string => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmt2 = (n: number): string => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const orderTypeIcon = (type: string) => {
  if (type === 'dine_in') return <Armchair className="w-3.5 h-3.5" />;
  if (type === 'room_service') return <BedDouble className="w-3.5 h-3.5" />;
  return <ShoppingBag className="w-3.5 h-3.5" />;
};
const orderTypeLabel = (type: string) =>
  type === 'dine_in' ? 'Dine-In' : type === 'room_service' ? 'Room Svc' : 'Takeaway';

const statusCls: Record<string, string> = {
  open: 'bg-slate-100 text-slate-500',
  kot_sent: 'bg-blue-50 text-blue-600',
  completed: 'bg-emerald-50 text-emerald-600',
  cancelled: 'bg-red-50 text-red-500',
  draft: 'bg-slate-100 text-slate-400',
};

export const PosDashboard = ({ onBack, onNavigate }: PosDashboardProps) => {
  const [stats, setStats] = useState<PosDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTestCleanup, setShowTestCleanup] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null);

  const handleCleanup = async () => {
    setCleanupLoading(true);
    setCleanupMsg(null);
    try {
      const { deleted } = await removePosTestData();
      const total = Object.values(deleted).reduce((a, b) => a + b, 0);
      setCleanupMsg(`Removed ${total} test records (categories, items, areas, tables, orders, KOTs, bills, payments).`);
      setShowTestCleanup(false);
      await load();
    } catch (e) {
      setCleanupMsg(e instanceof Error ? e.message : 'Failed to remove test data');
    } finally {
      setCleanupLoading(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const s = await getPosDashboardStats();
      setStats(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const cards = [
    { key: 'pos-new-order', label: 'New Order', desc: 'Create a dine-in, room service, or takeaway order', icon: <UtensilsCrossed className="w-6 h-6" /> },
    { key: 'pos-kds', label: 'Kitchen Display', desc: 'Live KOT board for kitchen staff', icon: <ChefHat className="w-6 h-6" /> },
    { key: 'pos-billing', label: 'Billing & Payment', desc: 'Generate bills, collect payments, post to room', icon: <Receipt className="w-6 h-6" /> },
    { key: 'pos-tables', label: 'Tables', desc: 'Manage restaurant tables & floor view', icon: <Armchair className="w-6 h-6" /> },
    { key: 'pos-menu', label: 'Menu Management', desc: 'Manage menu items & categories', icon: <UtensilsCrossed className="w-6 h-6" /> },
    { key: 'pos-reports', label: 'Reports', desc: 'Sales summary, payments, items, voids & more', icon: <BarChart3 className="w-6 h-6" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-brand-600" />
            <h1 className="text-lg font-bold text-brand-navy-800">POS Dashboard</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowTestCleanup(true)}
              className="text-xs font-semibold text-red-500 hover:text-red-600 border border-red-200 hover:border-red-300 rounded-lg px-2.5 py-1 transition"
              title="Remove all POS test/demo data"
            >
              Remove Test Data
            </button>
            <button onClick={load} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="px-4 py-4 max-w-5xl mx-auto space-y-4">
        {/* KPI cards */}
        {loading && !stats ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : stats ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Today Sales" value={fmt(stats.todaySales)} icon={<TrendingUp className="w-4 h-4" />} color="brand" />
              <KpiCard label="Today Orders" value={String(stats.todayOrders)} icon={<ReceiptIcon className="w-4 h-4" />} color="blue" />
              <KpiCard label="Avg Order Value" value={fmt(stats.avgOrderValue)} icon={<BarChart3 className="w-4 h-4" />} color="emerald" />
              <KpiCard label="Open Orders" value={String(stats.openOrders)} icon={<Clock className="w-4 h-4" />} color="amber" />
              <KpiCard label="Occupied Tables" value={String(stats.occupiedTables)} icon={<Armchair className="w-4 h-4" />} color="violet" />
              <KpiCard label="Room Service" value={String(stats.roomServiceOrders)} icon={<BedDouble className="w-4 h-4" />} color="sky" />
              <KpiCard label="Takeaway" value={String(stats.takeawayOrders)} icon={<ShoppingBag className="w-4 h-4" />} color="slate" />
              <KpiCard label="Discount" value={fmt(stats.discountAmount)} icon={<Percent className="w-4 h-4" />} color="orange" />
            </div>

            {/* Void amount banner */}
            {stats.voidAmount > 0 && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm">
                <Ban className="w-4 h-4 text-red-500" />
                <span className="text-red-600 font-semibold">Void Amount Today: {fmt2(stats.voidAmount)}</span>
              </div>
            )}

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Hourly sales */}
              <div className="rounded-xl bg-white border border-slate-200 p-4">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Hourly Sales Trend</h3>
                {stats.hourlySales.every((h) => h.sales === 0) ? (
                  <EmptyChart />
                ) : (
                  <AreaChart
                    points={stats.hourlySales.map((h) => ({ label: h.hour, value: h.sales }))}
                    color="#2563eb"
                    height={180}
                    yFormat={(v) => `₹${Math.round(v)}`}
                  />
                )}
              </div>

              {/* Payment breakdown donut */}
              <div className="rounded-xl bg-white border border-slate-200 p-4">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Payment Breakdown</h3>
                <DonutChart
                  slices={[
                    { label: 'Cash', value: stats.paymentBreakdown.cash, color: '#10b981' },
                    { label: 'UPI', value: stats.paymentBreakdown.upi, color: '#3b82f6' },
                    { label: 'Card', value: stats.paymentBreakdown.card, color: '#8b5cf6' },
                    { label: 'Bank', value: stats.paymentBreakdown.bank, color: '#f59e0b' },
                    { label: 'Post to Room', value: stats.paymentBreakdown.postToRoom, color: '#ec4899' },
                  ].filter((s) => s.value > 0)}
                  size={180}
                  centerLabel="Total"
                  centerValue={fmt(stats.paymentBreakdown.cash + stats.paymentBreakdown.upi + stats.paymentBreakdown.card + stats.paymentBreakdown.bank + stats.paymentBreakdown.postToRoom)}
                />
                <div className="mt-3 space-y-1">
                  <PaymentRow icon={<Banknote className="w-3.5 h-3.5" />} label="Cash" value={stats.paymentBreakdown.cash} color="text-emerald-600" />
                  <PaymentRow icon={<Smartphone className="w-3.5 h-3.5" />} label="UPI" value={stats.paymentBreakdown.upi} color="text-blue-600" />
                  <PaymentRow icon={<CreditCard className="w-3.5 h-3.5" />} label="Card" value={stats.paymentBreakdown.card} color="text-violet-600" />
                  <PaymentRow icon={<Building2 className="w-3.5 h-3.5" />} label="Bank Transfer" value={stats.paymentBreakdown.bank} color="text-amber-600" />
                  <PaymentRow icon={<BedDouble className="w-3.5 h-3.5" />} label="Posted to Room" value={stats.paymentBreakdown.postToRoom} color="text-pink-600" />
                </div>
              </div>
            </div>

            {/* Order type + Top items */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Order type breakdown */}
              <div className="rounded-xl bg-white border border-slate-200 p-4">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Order Type Breakdown</h3>
                <div className="space-y-2">
                  <TypeRow icon={<Armchair className="w-4 h-4" />} label="Dine-In" value={stats.orderTypeBreakdown.dineIn} />
                  <TypeRow icon={<BedDouble className="w-4 h-4" />} label="Room Service" value={stats.orderTypeBreakdown.roomService} />
                  <TypeRow icon={<ShoppingBag className="w-4 h-4" />} label="Takeaway" value={stats.orderTypeBreakdown.takeaway} />
                </div>
              </div>

              {/* Top selling items */}
              <div className="rounded-xl bg-white border border-slate-200 p-4">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Top Selling Items</h3>
                {stats.topItemsByQty.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No items sold today.</p>
                ) : (
                  <div className="space-y-2">
                    {stats.topItemsByQty.map((it, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-brand-50 text-brand-600 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                          <span className="font-semibold text-slate-700 truncate">{it.name}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-slate-400">{it.quantity} qty</span>
                          <span className="font-bold text-slate-800 tabular-nums">{fmt(it.revenue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recent orders */}
            <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Recent Orders</h3>
                <button onClick={() => onNavigate('pos-billing')} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                  View all →
                </button>
              </div>
              {stats.recentOrders.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No orders today.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-xs text-slate-500 uppercase">
                        <th className="text-left px-4 py-2 font-semibold">Order No.</th>
                        <th className="text-left px-2 py-2 font-semibold">Table/Room</th>
                        <th className="text-left px-2 py-2 font-semibold">Type</th>
                        <th className="text-right px-2 py-2 font-semibold">Amount</th>
                        <th className="text-center px-2 py-2 font-semibold">Status</th>
                        <th className="text-right px-4 py-2 font-semibold">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentOrders.map((o) => (
                        <tr key={o.id} className="border-t border-slate-100">
                          <td className="px-4 py-2.5 font-semibold text-slate-800">{o.order_number}</td>
                          <td className="px-2 py-2.5 text-slate-600">{o.table_name ?? (o.room_no ? `Room ${o.room_no}` : '—')}</td>
                          <td className="px-2 py-2.5">
                            <span className="flex items-center gap-1 text-slate-500">{orderTypeIcon(o.order_type)} {orderTypeLabel(o.order_type)}</span>
                          </td>
                          <td className="px-2 py-2.5 text-right font-semibold text-slate-800 tabular-nums">{fmt2(o.grand_total)}</td>
                          <td className="px-2 py-2.5 text-center">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusCls[o.status] ?? 'bg-slate-100 text-slate-500'}`}>{o.status}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-slate-400">{new Date(o.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}

        {/* Cleanup result message */}
        {cleanupMsg && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700 flex items-center justify-between">
            <span>{cleanupMsg}</span>
            <button onClick={() => setCleanupMsg(null)} className="text-emerald-400 hover:text-emerald-600 text-sm">✕</button>
          </div>
        )}

        {/* Test data cleanup confirmation modal */}
        {showTestCleanup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTestCleanup(false)}>
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-bold text-slate-800 mb-2">Remove POS Test Data?</h3>
              <p className="text-sm text-slate-500 mb-4">
                This will permanently delete all POS records marked as test data — categories, menu items, areas, tables, orders, KOTs, bills, and payments. Real POS data and all other modules (PMS, Finance, Reservations) are not affected.
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowTestCleanup(false)} className="px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition">Cancel</button>
                <button
                  onClick={handleCleanup}
                  disabled={cleanupLoading}
                  className="px-3 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-lg transition"
                >
                  {cleanupLoading ? 'Removing…' : 'Remove Test Data'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Navigation cards */}
        <div className="pt-2">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">Modules</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cards.map((c) => (
              <button
                key={c.key}
                onClick={() => onNavigate(c.key)}
                className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:shadow-md hover:border-brand-300"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-brand-50 text-brand-600 group-hover:bg-brand-100 transition shrink-0">
                  {c.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800">{c.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{c.desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition shrink-0 mt-1" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const KpiCard = ({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) => {
  const colorMap: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
    sky: 'bg-sky-50 text-sky-600',
    slate: 'bg-slate-100 text-slate-600',
    orange: 'bg-orange-50 text-orange-600',
  };
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-3 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${colorMap[color] ?? colorMap.brand}`}>{icon}</span>
      </div>
      <p className="text-lg font-bold text-slate-800 tabular-nums">{value}</p>
    </div>
  );
};

const PaymentRow = ({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="flex items-center gap-1.5 text-slate-500">
      <span className={color}>{icon}</span>
      {label}
    </span>
    <span className="font-bold text-slate-700 tabular-nums">{fmt2(value)}</span>
  </div>
);

const TypeRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
    <span className="flex items-center gap-2 text-sm text-slate-600 font-medium">
      <span className="text-brand-500">{icon}</span>
      {label}
    </span>
    <span className="text-sm font-bold text-slate-800">{value}</span>
  </div>
);

const EmptyChart = () => (
  <div className="flex items-center justify-center h-[180px] text-sm text-slate-400">No sales data yet today.</div>
);
