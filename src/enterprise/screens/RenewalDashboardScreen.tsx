import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, AlertTriangle, Clock, CalendarClock, Pause, Play,
  FileText, DollarSign, Bell, MoreVertical, Loader2, ChevronDown,
  Search, Eye, Send,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  getRenewalDashboard, generateRenewalInvoice, extendGracePeriod,
  suspendSubscription, reactivateSubscription, sendSubscriptionReminder,
  recordSubscriptionPayment,
} from '../api';
import type { RenewalDashboardData, RenewalHotelData } from '../types';
import { hasPermission } from '../permissions';
import { Card, Badge, LoadingState, ErrorState, EmptyState, PageHeader, fmtMoney, fmtDate } from '../ui';

interface Props {
  onViewHotel: (id: string) => void;
  onViewInvoice: (id: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  Active: 'green',
  Trial: 'sky',
  'Trial Expiring': 'amber',
  'Renewal Due': 'orange',
  'Grace Period': 'amber',
  'Partially Paid': 'teal',
  Overdue: 'red',
  Suspended: 'red',
  Cancelled: 'slate',
  Archived: 'slate',
};

export const RenewalDashboardScreen = ({ onViewHotel, onViewInvoice }: Props) => {
  const { companyRole } = useAuth();
  const [data, setData] = useState<RenewalDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState<string | null>(null);
  const [showGrace, setShowGrace] = useState<string | null>(null);
  const [showSuspend, setShowSuspend] = useState<string | null>(null);

  const canWrite = hasPermission(companyRole, 'subscriptions.write');
  const canPayment = hasPermission(companyRole, 'invoices.payment');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const d = await getRenewalDashboard();
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load renewals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (action: string, hotel: RenewalHotelData) => {
    setActionMenu(null);
    setActing(hotel.hotel_id);
    try {
      if (action === 'generate' && canWrite) {
        await generateRenewalInvoice(hotel.hotel_id);
        await load();
      } else if (action === 'view') {
        onViewHotel(hotel.hotel_id);
      } else if (action === 'view-invoice' && hotel.latest_invoice_id) {
        onViewInvoice(hotel.latest_invoice_id);
      } else if (action === 'reactivate' && canWrite) {
        await reactivateSubscription(hotel.hotel_id);
        await load();
      } else if (action === 'reminder' && canWrite) {
        const days = hotel.days_to_expiry ?? 0;
        await sendSubscriptionReminder(hotel.hotel_id, days, 'in_app');
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActing(null);
    }
  };

  if (loading) return <LoadingState label="Loading renewal dashboard…" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <ErrorState message="No data" />;

  const filtered = data.hotels.filter((h) => {
    if (!search && !statusFilter) return true;
    const matchSearch = !search || h.hotel_name.toLowerCase().includes(search.toLowerCase()) || (h.property_code ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || h.subscription_status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Renewal Dashboard" subtitle="Track and manage all subscription renewals" />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Due Today" value={data.counts.due_today} icon={<CalendarClock className="w-4 h-4" />} color="orange" />
        <KpiCard label="Due in 3 Days" value={data.counts.due_3_days} icon={<Clock className="w-4 h-4" />} color="amber" />
        <KpiCard label="Due in 7 Days" value={data.counts.due_7_days} icon={<Clock className="w-4 h-4" />} color="sky" />
        <KpiCard label="Due in 15 Days" value={data.counts.due_15_days} icon={<Clock className="w-4 h-4" />} color="slate" />
        <KpiCard label="Overdue" value={data.counts.overdue} icon={<AlertTriangle className="w-4 h-4" />} color="red" />
        <KpiCard label="Grace Period" value={data.counts.grace_period} icon={<Pause className="w-4 h-4" />} color="amber" />
        <KpiCard label="Suspended" value={data.counts.suspended} icon={<Pause className="w-4 h-4" />} color="red" />
        <KpiCard label="Total Outstanding" value={fmtMoney(data.counts.total_outstanding)} icon={<DollarSign className="w-4 h-4" />} color="sky" />
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search hotels…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white">
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Trial">Trial</option>
          <option value="Trial Expiring">Trial Expiring</option>
          <option value="Renewal Due">Renewal Due</option>
          <option value="Grace Period">Grace Period</option>
          <option value="Partially Paid">Partially Paid</option>
          <option value="Overdue">Overdue</option>
          <option value="Suspended">Suspended</option>
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState title="No renewals found" subtitle="All subscriptions are up to date" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-left text-xs font-bold text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Hotel</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Cycle</th>
                  <th className="px-4 py-3">Renewal Date</th>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((h) => (
                  <tr key={h.hotel_id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <button onClick={() => onViewHotel(h.hotel_id)} className="font-semibold text-sky-700 hover:underline">{h.hotel_name}</button>
                      <p className="text-xs text-slate-400">{h.property_code ?? 'No code'}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{h.plan_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 capitalize">{h.billing_cycle ?? '—'}</td>
                    <td className="px-4 py-3">
                      <p className="text-slate-600">{fmtDate(h.renewal_date ?? h.subscription_expiry)}</p>
                      {h.days_to_expiry !== null && (
                        <p className={`text-xs ${h.days_to_expiry < 0 ? 'text-red-600' : h.days_to_expiry <= 3 ? 'text-orange-600' : 'text-slate-400'}`}>
                          {h.days_to_expiry < 0 ? `${Math.abs(h.days_to_expiry)} days overdue` : `${h.days_to_expiry} days left`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {h.latest_invoice_number ? (
                        <button onClick={() => h.latest_invoice_id && onViewInvoice(h.latest_invoice_id)} className="font-mono text-xs text-sky-600 hover:underline">{h.latest_invoice_number}</button>
                      ) : <span className="text-slate-400 text-xs">No invoice</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-700">{fmtMoney(h.total_payable)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{fmtMoney(h.amount_paid)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-red-600">{fmtMoney(h.outstanding_amount)}</td>
                    <td className="px-4 py-3"><Badge color={STATUS_COLORS[h.subscription_status] ?? 'slate'}>{h.subscription_status}</Badge></td>
                    <td className="px-4 py-3 text-right relative">
                      {acting === h.hotel_id ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (
                        <button onClick={() => setActionMenu(actionMenu === h.hotel_id ? null : h.hotel_id)} className="p-1 rounded hover:bg-slate-200">
                          <MoreVertical className="w-4 h-4 text-slate-500" />
                        </button>
                      )}
                      {actionMenu === h.hotel_id && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setActionMenu(null)} />
                          <div className="absolute right-4 top-full mt-1 w-52 bg-white rounded-xl shadow-2xl border border-slate-200 z-40 py-1">
                            <MenuBtn icon={<Eye className="w-3.5 h-3.5" />} label="View Subscription" onClick={() => handleAction('view', h)} />
                            {h.latest_invoice_id && <MenuBtn icon={<FileText className="w-3.5 h-3.5" />} label="View Invoice" onClick={() => handleAction('view-invoice', h)} />}
                            {canWrite && !h.latest_invoice_id && <MenuBtn icon={<FileText className="w-3.5 h-3.5" />} label="Generate Invoice" onClick={() => handleAction('generate', h)} />}
                            {canPayment && h.outstanding_amount > 0 && h.subscription_status !== 'Suspended' && <MenuBtn icon={<DollarSign className="w-3.5 h-3.5" />} label="Record Payment" onClick={() => setShowPayment(h.hotel_id)} />}
                            {canWrite && <MenuBtn icon={<Bell className="w-3.5 h-3.5" />} label="Send Reminder" onClick={() => handleAction('reminder', h)} />}
                            {canWrite && h.subscription_status !== 'Suspended' && <MenuBtn icon={<Pause className="w-3.5 h-3.5" />} label="Suspend" danger onClick={() => setShowSuspend(h.hotel_id)} />}
                            {canWrite && h.subscription_status === 'Suspended' && <MenuBtn icon={<Play className="w-3.5 h-3.5" />} label="Reactivate" onClick={() => handleAction('reactivate', h)} />}
                            {canWrite && (h.subscription_status === 'Overdue' || h.subscription_status === 'Grace Period') && <MenuBtn icon={<Clock className="w-3.5 h-3.5" />} label="Extend Grace" onClick={() => setShowGrace(h.hotel_id)} />}
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          hotelId={showPayment}
          hotelName={data.hotels.find((h) => h.hotel_id === showPayment)?.hotel_name ?? ''}
          outstanding={data.hotels.find((h) => h.hotel_id === showPayment)?.outstanding_amount ?? 0}
          onClose={() => setShowPayment(null)}
          onSuccess={() => { setShowPayment(null); load(); }}
        />
      )}

      {/* Grace Period Modal */}
      {showGrace && (
        <GraceModal
          hotelName={data.hotels.find((h) => h.hotel_id === showGrace)?.hotel_name ?? ''}
          onClose={() => setShowGrace(null)}
          onConfirm={async (days) => { await extendGracePeriod(showGrace, days); setShowGrace(null); load(); }}
        />
      )}

      {/* Suspend Modal */}
      {showSuspend && (
        <SuspendModal
          hotelName={data.hotels.find((h) => h.hotel_id === showSuspend)?.hotel_name ?? ''}
          onClose={() => setShowSuspend(null)}
          onConfirm={async (reason) => { await suspendSubscription(showSuspend, reason); setShowSuspend(null); load(); }}
        />
      )}
    </div>
  );
};

const KpiCard = ({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) => {
  const colors: Record<string, string> = {
    red: 'bg-red-50 text-red-600', orange: 'bg-orange-50 text-orange-600',
    amber: 'bg-amber-50 text-amber-600', sky: 'bg-sky-50 text-sky-600',
    slate: 'bg-slate-100 text-slate-600', green: 'bg-emerald-50 text-emerald-600',
  };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colors[color] ?? colors.slate}`}>{icon}</div>
      </div>
      <p className="text-xl font-bold text-slate-900 tabular-nums">{value}</p>
    </Card>
  );
};

const MenuBtn = ({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 ${danger ? 'text-red-600' : 'text-slate-700'}`}>
    {icon} {label}
  </button>
);

const PaymentModal = ({ hotelId, hotelName, outstanding, onClose, onSuccess }: {
  hotelId: string; hotelName: string; outstanding: number; onClose: () => void; onSuccess: () => void;
}) => {
  const [amount, setAmount] = useState(String(outstanding));
  const [mode, setMode] = useState('Bank');
  const [ref, setRef] = useState('');
  const [notes, setNotes] = useState('');
  const [extend, setExtend] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    setSaving(true); setError(null);
    try {
      await recordSubscriptionPayment({ hotelId, amount: amt, paymentMode: mode, transactionReference: ref, notes, extendSubscription: extend });
      onSuccess();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Record Payment — {hotelName}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Outstanding:</span><span className="font-bold text-red-600">{fmtMoney(outstanding)}</span></div>
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-2">{error}</div>}
        <label className="block"><span className="block text-sm font-medium text-slate-700 mb-1">Amount (₹)</span>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></label>
        <label className="block"><span className="block text-sm font-medium text-slate-700 mb-1">Payment Mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="Bank">Bank Transfer</option><option value="UPI">UPI</option><option value="Cash">Cash</option>
            <option value="Card">Card</option><option value="Gateway">Payment Gateway</option><option value="Cheque">Cheque</option>
          </select></label>
        <input type="text" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Transaction Reference / UTR" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={extend} onChange={(e) => setExtend(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-sky-600" />
          Extend subscription end date after full payment
        </label>
        <div className="flex gap-2">
          <button onClick={handleSubmit} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Record Payment'}
          </button>
          <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
};

const GraceModal = ({ hotelName, onClose, onConfirm }: { hotelName: string; onClose: () => void; onConfirm: (days: number) => void }) => {
  const [days, setDays] = useState('7');
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <h3 className="text-lg font-bold text-amber-700">Extend Grace Period — {hotelName}</h3>
        <p className="text-sm text-slate-600">Add extra days to the grace period. The hotel can continue operating during this time.</p>
        <label className="block"><span className="block text-sm font-medium text-slate-700 mb-1">Days to Extend</span>
          <input type="number" value={days} onChange={(e) => setDays(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></label>
        <div className="flex gap-2">
          <button onClick={() => onConfirm(parseInt(days || '0', 10))} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 rounded-xl text-sm">Extend</button>
          <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
};

const SuspendModal = ({ hotelName, onClose, onConfirm }: { hotelName: string; onClose: () => void; onConfirm: (reason: string) => void }) => {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <h3 className="text-lg font-bold text-red-700">Suspend Subscription — {hotelName}</h3>
        <p className="text-sm text-slate-600">The hotel will lose access to operational features. Data remains safe.</p>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for suspension" rows={3} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
        <div className="flex gap-2">
          <button onClick={() => reason && onConfirm(reason)} disabled={!reason} className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm">Suspend</button>
          <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
};
