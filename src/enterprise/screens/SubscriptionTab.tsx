import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, FileText, DollarSign, RefreshCw, ArrowUpCircle, ArrowDownCircle,
  Pause, Play, CalendarClock, Plus, Loader2, X, AlertTriangle, History, ScrollText,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  getPlans, getHotelFeatures, getInvoices, getInvoicePayments,
  convertTrialToPaid, changePlan, suspendSubscription, reactivateSubscription,
  extendGracePeriod, generateRenewalInvoice, recordSubscriptionPayment,
  getSubscriptionNotes, addSubscriptionNote, logAudit,
} from '../api';
import type { SubscriptionPlan, HotelFeature, InvoiceWithDetails, InvoicePayment, EnterpriseHotel } from '../types';
import { MODULE_KEYS, MODULE_LABELS } from '../types';
import { hasPermission } from '../permissions';
import { Card, Badge, LoadingState, ErrorState, fmtMoney, fmtDate, fmtDateTime } from '../ui';

interface Props {
  hotel: EnterpriseHotel;
  onReload: () => void;
  onCreateInvoice: () => void;
  onViewInvoice: (id: string) => void;
}

export const SubscriptionTab = ({ hotel, onReload, onCreateInvoice, onViewInvoice }: Props) => {
  const { companyRole, user } = useAuth();
  const canWrite = hasPermission(companyRole, 'subscriptions.write');
  const canPayment = hasPermission(companyRole, 'invoices.payment');
  const canIssue = hasPermission(companyRole, 'invoices.issue');

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [features, setFeatures] = useState<HotelFeature[]>([]);
  const [invoices, setInvoices] = useState<InvoiceWithDetails[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [notes, setNotes] = useState<{ id: string; note: string; created_by_email: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [modal, setModal] = useState<null | 'assignPlan' | 'convertTrial' | 'changePlan' | 'suspend' | 'extendGrace' | 'payment' | 'addNote'>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [p, f, invs] = await Promise.all([
        getPlans(),
        getHotelFeatures(hotel.id),
        getInvoices({ hotelId: hotel.id }),
      ]);
      setPlans(p);
      setFeatures(f);
      setInvoices(invs);

      // Load payments for all invoices
      const allPays: InvoicePayment[] = [];
      for (const inv of invs) {
        try {
          const pays = await getInvoicePayments(inv.id);
          allPays.push(...pays);
        } catch { /* skip */ }
      }
      setPayments(allPays);

      try {
        const n = await getSubscriptionNotes(hotel.id);
        setNotes(n as typeof notes);
      } catch { /* table may not exist */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load subscription');
    } finally {
      setLoading(false);
    }
  }, [hotel.id]);

  useEffect(() => { load(); }, [load]);

  const currentPlan = plans.find((p) => p.id === hotel.plan_id);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const outstandingAmount = invoices
    .filter((i) => i.status !== 'Cancelled' && i.status !== 'Draft')
    .reduce((s, i) => s + i.balance_due, 0);

  const handleConvertTrial = async (planId: string, billingCycle: string) => {
    setActing(true); setError(null);
    try {
      await convertTrialToPaid(hotel.id, planId, billingCycle);
      setModal(null); onReload(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setActing(false); }
  };

  const handleChangePlan = async (planId: string, mode: 'immediate' | 'next_renewal') => {
    setActing(true); setError(null);
    try {
      await changePlan(hotel.id, planId, mode);
      setModal(null); onReload(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setActing(false); }
  };

  const handleSuspend = async (reason: string) => {
    setActing(true); setError(null);
    try {
      await suspendSubscription(hotel.id, reason);
      setModal(null); onReload(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setActing(false); }
  };

  const handleReactivate = async () => {
    setActing(true); setError(null);
    try {
      await reactivateSubscription(hotel.id);
      onReload(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setActing(false); }
  };

  const handleExtendGrace = async (days: number) => {
    setActing(true); setError(null);
    try {
      await extendGracePeriod(hotel.id, days);
      setModal(null); onReload(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setActing(false); }
  };

  const handleGenerateRenewal = async () => {
    if (!hotel.plan_id) {
      setError('This hotel does not have an active subscription plan. Assign a subscription plan before renewing.');
      return;
    }
    setActing(true); setError(null);
    try {
      await generateRenewalInvoice(hotel.id);
      onReload(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setActing(false); }
  };

  const handleRecordPayment = async (amount: number, mode: string, ref: string, notes: string, extend: boolean) => {
    setActing(true); setError(null);
    try {
      await recordSubscriptionPayment({
        hotelId: hotel.id, amount, paymentMode: mode,
        transactionReference: ref, notes, extendSubscription: extend,
      });
      setModal(null); onReload(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setActing(false); }
  };

  const handleAddNote = async (note: string) => {
    setActing(true); setError(null);
    try {
      await addSubscriptionNote(hotel.id, note);
      setModal(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setActing(false); }
  };

  if (loading) return <LoadingState label="Loading subscription…" />;
  if (error) return <ErrorState message={error} />;

  const statusColor = (status: string): string => {
    const map: Record<string, string> = {
      Active: 'green', Trial: 'sky', Expired: 'amber', Suspended: 'red',
      'Grace Period': 'amber', 'Trial Expiring': 'amber', 'Renewal Due': 'orange',
    };
    return map[status] ?? 'slate';
  };

  return (
    <div className="space-y-4">
      {error && <ErrorState message={error} />}

      {/* Top section: Left = summary, Right = actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Subscription Summary */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Current Subscription
              </h3>
              <Badge color={statusColor(hotel.subscription_status)}>{hotel.subscription_status}</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Current Plan" value={currentPlan?.name ?? 'Trial'} />
              <Field label="Billing Cycle" value={currentPlan?.billing_period ?? '—'} />
              <Field label="Status" value={hotel.subscription_status} />
              <Field label="Start Date" value={fmtDate(hotel.subscription_start)} />
              <Field label="End Date" value={fmtDate(hotel.subscription_expiry)} />
              <Field label="Renewal Date" value={fmtDate(hotel.subscription_expiry)} />
              <Field label="Trial Start" value={fmtDate(hotel.trial_start)} />
              <Field label="Trial End" value={fmtDate(hotel.trial_end)} />
              <Field label="Grace Period End" value={fmtDate(hotel.grace_period_end)} />
              <Field label="Base Amount" value={fmtMoney(currentPlan?.price ?? 0)} />
              <Field label="Discount" value={fmtMoney(0)} />
              <Field label="Tax" value={fmtMoney(0)} />
              <Field label="Total Payable" value={fmtMoney(currentPlan?.price ?? 0)} />
              <Field label="Paid Amount" value={fmtMoney(totalPaid)} />
              <Field label="Outstanding" value={fmtMoney(outstandingAmount)} />
              <Field label="Sales Exec" value={hotel.assigned_sales_exec ?? '—'} />
              <Field label="Finance Exec" value={hotel.assigned_finance_exec ?? '—'} />
            </div>
          </Card>

          {/* Plan details */}
          {currentPlan && (
            <Card className="p-5">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Plan Details</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Monthly Price" value={fmtMoney(currentPlan.price)} />
                <Field label="Yearly Price" value={fmtMoney(currentPlan.yearly_price)} />
                <Field label="Trial Days" value={String(currentPlan.trial_days)} />
                <Field label="Grace Period" value={`${currentPlan.grace_period} days`} />
                <Field label="Room Limit" value={currentPlan.room_limit ? String(currentPlan.room_limit) : 'Unlimited'} />
                <Field label="User Limit" value={currentPlan.user_limit ? String(currentPlan.user_limit) : 'Unlimited'} />
                <Field label="Hotel Limit" value={currentPlan.hotel_limit ? String(currentPlan.hotel_limit) : 'Unlimited'} />
                <Field label="Active" value={currentPlan.is_active ? 'Yes' : 'No'} />
              </div>
              <div className="mt-3">
                <p className="text-xs font-semibold text-slate-600 mb-1">Enabled Modules:</p>
                <div className="flex flex-wrap gap-1.5">
                  {(currentPlan.enabled_modules || '').split(',').filter(Boolean).map((m) => (
                    <span key={m} className="text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded-md">{MODULE_LABELS[m] || m}</span>
                  ))}
                  {!currentPlan.enabled_modules && <span className="text-xs text-slate-400">All modules</span>}
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Right: Quick Actions */}
        <div className="space-y-3">
          <Card className="p-4">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Quick Actions</h3>
            <div className="space-y-2">
              {canWrite && (
                <ActionButton icon={<ArrowUpCircle className="w-4 h-4" />} label="Assign Plan" onClick={() => setModal('assignPlan')} />
              )}
              {canWrite && hotel.subscription_status === 'Trial' && (
                <ActionButton icon={<CreditCard className="w-4 h-4" />} label="Convert Trial to Paid" onClick={() => setModal('convertTrial')} />
              )}
              {canWrite && (
                <ActionButton icon={<ArrowUpCircle className="w-4 h-4" />} label="Upgrade / Change Plan" onClick={() => setModal('changePlan')} />
              )}
              {canIssue && (
                <ActionButton icon={<FileText className="w-4 h-4" />} label="Create Invoice" onClick={onCreateInvoice} />
              )}
              {canWrite && (
                <ActionButton icon={<RefreshCw className="w-4 h-4" />} label="Generate Renewal Invoice" onClick={handleGenerateRenewal} disabled={acting || !hotel.plan_id} />
              )}
              {canPayment && outstandingAmount > 0 && (
                <ActionButton icon={<DollarSign className="w-4 h-4" />} label="Record Payment" onClick={() => setModal('payment')} />
              )}
              {canWrite && (
                <ActionButton icon={<CalendarClock className="w-4 h-4" />} label="Extend Grace Period" onClick={() => setModal('extendGrace')} />
              )}
              {canWrite && hotel.subscription_status !== 'Suspended' && (
                <ActionButton icon={<Pause className="w-4 h-4" />} label="Suspend" danger onClick={() => setModal('suspend')} />
              )}
              {canWrite && hotel.subscription_status === 'Suspended' && (
                <ActionButton icon={<Play className="w-4 h-4" />} label="Reactivate" onClick={handleReactivate} disabled={acting} />
              )}
              {canWrite && (
                <ActionButton icon={<Plus className="w-4 h-4" />} label="Add Internal Note" onClick={() => setModal('addNote')} />
              )}
            </div>
          </Card>

          {/* Outstanding summary */}
          {outstandingAmount > 0 && (
            <Card className="p-4 bg-red-50 border border-red-200">
              <p className="text-xs text-red-600 font-semibold uppercase">Outstanding Balance</p>
              <p className="text-2xl font-bold text-red-700 tabular-nums">{fmtMoney(outstandingAmount)}</p>
              <p className="text-xs text-red-500 mt-1">{invoices.filter((i) => i.balance_due > 0 && i.status !== 'Cancelled').length} unpaid invoice(s)</p>
            </Card>
          )}
        </div>
      </div>

      {/* Below: Invoice History */}
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
            <FileText className="w-4 h-4" /> Invoice History
          </h3>
        </div>
        {invoices.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No invoices yet. Click "Create Invoice" to generate one.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-left text-xs font-bold text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onViewInvoice(inv.id)}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-sky-600">{inv.invoice_number ?? 'Draft'}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(inv.invoice_date ?? inv.created_at)}</td>
                    <td className="px-4 py-3 text-slate-600">{inv.plan_name ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtMoney(inv.total_amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{fmtMoney(inv.amount_paid)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-red-600">{fmtMoney(inv.balance_due)}</td>
                    <td className="px-4 py-3">
                      <Badge color={inv.status === 'Paid' ? 'green' : inv.status === 'Draft' ? 'slate' : inv.status === 'Cancelled' ? 'red' : inv.status === 'Partially Paid' ? 'amber' : 'sky'}>{inv.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(inv.due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Payment History */}
      {payments.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
              <History className="w-4 h-4" /> Payment History
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {payments.map((p) => (
              <div key={p.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{p.receipt_number ?? '—'}</p>
                  <p className="text-xs text-slate-400">{fmtDate(p.payment_date)} · {p.payment_mode} · {p.transaction_reference || ''}</p>
                  {p.notes && <p className="text-xs text-slate-500 mt-0.5">{p.notes}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums">{fmtMoney(p.amount)}</p>
                  <p className="text-xs text-slate-400">{p.entered_by_email || ''}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Internal Notes */}
      {notes.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2 mb-3">
            <ScrollText className="w-4 h-4" /> Internal Notes
          </h3>
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="p-3 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-700">{n.note}</p>
                <p className="text-xs text-slate-400 mt-1">{n.created_by_email} · {fmtDateTime(n.created_at)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Modals */}
      {modal === 'assignPlan' && (
        <PlanSelectModal title="Assign Plan" plans={plans} onConfirm={(planId, cycle) => handleChangePlan(planId, 'immediate')} onClose={() => setModal(null)} acting={acting} />
      )}
      {modal === 'convertTrial' && (
        <PlanSelectModal title="Convert Trial to Paid" plans={plans} onConfirm={handleConvertTrial} onClose={() => setModal(null)} acting={acting} />
      )}
      {modal === 'changePlan' && (
        <PlanSelectModal title="Upgrade / Change Plan" plans={plans} onConfirm={(planId, cycle) => handleChangePlan(planId, 'immediate')} onClose={() => setModal(null)} acting={acting} />
      )}
      {modal === 'suspend' && (
        <ReasonModal title="Suspend Subscription" onConfirm={handleSuspend} onClose={() => setModal(null)} acting={acting} />
      )}
      {modal === 'extendGrace' && (
        <DaysModal title="Extend Grace Period" onConfirm={handleExtendGrace} onClose={() => setModal(null)} acting={acting} />
      )}
      {modal === 'payment' && (
        <PaymentModal outstanding={outstandingAmount} onConfirm={handleRecordPayment} onClose={() => setModal(null)} acting={acting} />
      )}
      {modal === 'addNote' && (
        <NoteModal onConfirm={handleAddNote} onClose={() => setModal(null)} acting={acting} />
      )}
    </div>
  );
};

// ── Sub-components ──

const Field = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs text-slate-400 font-medium">{label}</p>
    <p className="text-sm font-semibold text-slate-800">{value}</p>
  </div>
);

const ActionButton = ({ icon, label, onClick, danger, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) => (
  <button onClick={onClick} disabled={disabled}
    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50 ${
      danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-100'
    }`}>
    {icon} {label}
  </button>
);

const PlanSelectModal = ({ title, plans, onConfirm, onClose, acting }: {
  title: string;
  plans: SubscriptionPlan[];
  onConfirm: (planId: string, cycle: string) => void;
  onClose: () => void;
  acting: boolean;
}) => {
  const [planId, setPlanId] = useState('');
  const [cycle, setCycle] = useState('monthly');
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Select Plan</label>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">— Select —</option>
            {plans.filter((p) => p.is_active).map((p) => (
              <option key={p.id} value={p.id}>{p.name} — ₹{p.price}/mo</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Billing Cycle</label>
          <select value={cycle} onChange={(e) => setCycle(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => planId && onConfirm(planId, cycle)} disabled={!planId || acting}
            className="flex-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm">
            {acting ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Confirm'}
          </button>
          <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
};

const ReasonModal = ({ title, onConfirm, onClose, acting }: { title: string; onConfirm: (reason: string) => void; onClose: () => void; acting: boolean }) => {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <h3 className="text-lg font-bold text-red-700">{title}</h3>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" rows={3}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
        <div className="flex gap-2">
          <button onClick={() => reason && onConfirm(reason)} disabled={!reason || acting}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm">
            {acting ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Confirm'}
          </button>
          <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
};

const DaysModal = ({ title, onConfirm, onClose, acting }: { title: string; onConfirm: (days: number) => void; onClose: () => void; acting: boolean }) => {
  const [days, setDays] = useState('7');
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <h3 className="text-lg font-bold text-amber-700">{title}</h3>
        <label className="block"><span className="block text-sm font-medium text-slate-700 mb-1">Days to Extend</span>
          <input type="number" value={days} onChange={(e) => setDays(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></label>
        <div className="flex gap-2">
          <button onClick={() => onConfirm(parseInt(days || '0', 10))} disabled={acting}
            className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm">
            {acting ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Extend'}
          </button>
          <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
};

const PaymentModal = ({ outstanding, onConfirm, onClose, acting }: {
  outstanding: number;
  onConfirm: (amount: number, mode: string, ref: string, notes: string, extend: boolean) => void;
  onClose: () => void;
  acting: boolean;
}) => {
  const [amount, setAmount] = useState(String(outstanding));
  const [mode, setMode] = useState('Bank');
  const [ref, setRef] = useState('');
  const [notes, setNotes] = useState('');
  const [extend, setExtend] = useState(true);
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Record Payment</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Outstanding:</span><span className="font-bold text-red-600">{fmtMoney(outstanding)}</span></div>
        </div>
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
          Extend subscription after full payment
        </label>
        <div className="flex gap-2">
          <button onClick={() => onConfirm(parseFloat(amount) || 0, mode, ref, notes, extend)} disabled={acting}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm">
            {acting ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Record Payment'}
          </button>
          <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
};

const NoteModal = ({ onConfirm, onClose, acting }: { onConfirm: (note: string) => void; onClose: () => void; acting: boolean }) => {
  const [note, setNote] = useState('');
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <h3 className="text-lg font-bold text-slate-900">Add Internal Note</h3>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note about this hotel's subscription…" rows={4}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
        <div className="flex gap-2">
          <button onClick={() => note && onConfirm(note)} disabled={!note || acting}
            className="flex-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm">
            {acting ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Save Note'}
          </button>
          <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
};
