import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Search, Download, Eye, Send, MoreVertical, Filter,
  FileText, CheckCircle2, XCircle, Copy, Loader2, ChevronDown,
  DollarSign, Share2, Mail, X, SlidersHorizontal, Building2, Calendar, Clock,
  TrendingUp, AlertTriangle, CheckCircle, FileEdit,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  getInvoices, issueInvoice, cancelInvoice, recordInvoicePayment,
  updateInvoiceStatus, deleteDraftInvoice, duplicateInvoice,
  getEnterpriseHotels, getPlans, getBillingSettings,
} from '../api';
import type { InvoiceWithDetails, InvoiceStatus, EnterpriseHotel, SubscriptionPlan } from '../types';
import { hasPermission } from '../permissions';
import { Card, Badge, LoadingState, ErrorState, EmptyState, PageHeader, fmtMoney, fmtDate } from '../ui';

interface Props {
  onOpenDrawer: (id: string) => void;
  onNewInvoice?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  Draft: 'slate',
  Issued: 'sky',
  Sent: 'violet',
  'Partially Paid': 'amber',
  Paid: 'green',
  Overdue: 'red',
  Cancelled: 'slate',
  'Credit Note Issued': 'purple',
};

const ALL_STATUSES: InvoiceStatus[] = ['Draft', 'Issued', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'];

const PAYMENT_STATUSES = ['Unpaid', 'Partially Paid', 'Paid', 'Overdue'] as const;

export const InvoiceListScreen = ({ onOpenDrawer, onNewInvoice }: Props) => {
  const { companyRole } = useAuth();
  const [invoices, setInvoices] = useState<InvoiceWithDetails[]>([]);
  const [hotels, setHotels] = useState<EnterpriseHotel[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const [fStatus, setFStatus] = useState('');
  const [fHotel, setFHotel] = useState('');
  const [fPlan, setFPlan] = useState('');
  const [fDateFrom, setFDateFrom] = useState('');
  const [fDateTo, setFDateTo] = useState('');
  const [fDueFrom, setFDueFrom] = useState('');
  const [fDueTo, setFDueTo] = useState('');
  const [fPayment, setFPayment] = useState('');

  const canWrite = hasPermission(companyRole, 'invoices.write');
  const canIssue = hasPermission(companyRole, 'invoices.issue');
  const canPayment = hasPermission(companyRole, 'invoices.payment');
  const canCancel = hasPermission(companyRole, 'invoices.cancel');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [invData, hotelData, planData] = await Promise.all([
        getInvoices(),
        getEnterpriseHotels(),
        getPlans(),
      ]);
      setInvoices(invData);
      setHotels(hotelData.filter((h) => !h.archived_at));
      setPlans(planData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (search) {
        const q = search.toLowerCase();
        if (!(inv.invoice_number ?? '').toLowerCase().includes(q)
          && !(inv.hotel_name ?? '').toLowerCase().includes(q)
          && !(inv.property_code ?? '').toLowerCase().includes(q)) return false;
      }
      if (fStatus && inv.status !== fStatus) return false;
      if (fHotel && inv.hotel_id !== fHotel) return false;
      if (fPlan && inv.plan_id !== fPlan) return false;
      if (fDateFrom && inv.invoice_date && inv.invoice_date < fDateFrom) return false;
      if (fDateTo && inv.invoice_date && inv.invoice_date > fDateTo) return false;
      if (fDueFrom && inv.due_date && inv.due_date < fDueFrom) return false;
      if (fDueTo && inv.due_date && inv.due_date > fDueTo) return false;
      if (fPayment) {
        if (fPayment === 'Unpaid' && inv.amount_paid > 0) return false;
        if (fPayment === 'Partially Paid' && !(inv.amount_paid > 0 && inv.balance_due > 0)) return false;
        if (fPayment === 'Paid' && inv.balance_due > 0) return false;
        if (fPayment === 'Overdue' && inv.status !== 'Overdue') return false;
      }
      return true;
    });
  }, [invoices, search, fStatus, fHotel, fPlan, fDateFrom, fDateTo, fDueFrom, fDueTo, fPayment]);

  // Summary cards
  const summary = useMemo(() => {
    const total = invoices.length;
    const draft = invoices.filter((i) => i.status === 'Draft').length;
    const outstanding = invoices.filter((i) => i.status !== 'Cancelled' && i.status !== 'Draft').reduce((s, i) => s + i.balance_due, 0);
    const paidCount = invoices.filter((i) => i.status === 'Paid').length;
    const overdue = invoices.filter((i) => i.status === 'Overdue').length;
    const now = new Date();
    const monthlyRevenue = invoices
      .filter((i) => {
        if (i.status === 'Cancelled' || i.status === 'Draft') return false;
        const d = new Date(i.invoice_date ?? i.created_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((s, i) => s + i.total_amount, 0);
    return { total, draft, outstanding, paidCount, overdue, monthlyRevenue };
  }, [invoices]);

  const activeFilterCount = [fStatus, fHotel, fPlan, fDateFrom, fDateTo, fDueFrom, fDueTo, fPayment].filter(Boolean).length;

  const clearFilters = () => {
    setFStatus(''); setFHotel(''); setFPlan(''); setFDateFrom(''); setFDateTo(''); setFDueFrom(''); setFDueTo(''); setFPayment('');
  };

  const handleAction = async (action: string, invoice: InvoiceWithDetails) => {
    setActionMenu(null);
    setActing(invoice.id);
    try {
      if (action === 'issue' && canIssue) { await issueInvoice(invoice.id); await load(); }
      else if (action === 'cancel' && canCancel) {
        const reason = prompt('Reason for cancellation?');
        if (reason) { await cancelInvoice(invoice.id, reason); await load(); }
      } else if (action === 'mark-paid' && canPayment) {
        await recordInvoicePayment({ invoiceId: invoice.id, amount: invoice.balance_due, paymentMode: 'Bank' });
        await load();
      } else if (action === 'send' && canWrite) { await updateInvoiceStatus(invoice.id, 'Sent'); await load(); }
      else if (action === 'delete-draft' && canWrite) {
        if (confirm('Delete this draft invoice?')) { await deleteDraftInvoice(invoice.id); await load(); }
      } else if (action === 'duplicate' && canWrite) {
        const newId = await duplicateInvoice(invoice.id); await load();
        onOpenDrawer(newId);
      } else if (action === 'preview') { onOpenDrawer(invoice.id); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); }
    finally { setActing(null); }
  };

  if (loading) return <LoadingState label="Loading invoices…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-4 w-full">
      <PageHeader title="Invoices" subtitle="Manage all hotel subscription invoices"
        action={canWrite && onNewInvoice ? (
          <button onClick={onNewInvoice} className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-4 py-2.5 rounded-xl transition text-sm">
            <Plus className="w-4 h-4" /> New Invoice
          </button>
        ) : undefined}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="Total Invoices" value={String(summary.total)} icon={<FileText className="w-4 h-4" />} color="sky" />
        <SummaryCard label="Draft" value={String(summary.draft)} icon={<FileEdit className="w-4 h-4" />} color="slate" />
        <SummaryCard label="Outstanding" value={fmtMoney(summary.outstanding)} icon={<AlertTriangle className="w-4 h-4" />} color="amber" />
        <SummaryCard label="Paid" value={String(summary.paidCount)} icon={<CheckCircle className="w-4 h-4" />} color="green" />
        <SummaryCard label="Overdue" value={String(summary.overdue)} icon={<Clock className="w-4 h-4" />} color="red" />
        <SummaryCard label="Monthly Revenue" value={fmtMoney(summary.monthlyRevenue)} icon={<TrendingUp className="w-4 h-4" />} color="violet" />
      </div>

      {/* Search + Filter toggle */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by invoice number, hotel name, property code…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">
          <SlidersHorizontal className="w-4 h-4" /> Filters
          {activeFilterCount > 0 && <Badge color="sky">{activeFilterCount}</Badge>}
        </button>
        {activeFilterCount > 0 && (
          <button onClick={clearFilters} className="text-sm text-slate-500 hover:text-red-600 font-medium flex items-center gap-1">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <FilterSelect label="Status" value={fStatus} onChange={setFStatus} options={[{ value: '', label: 'All Statuses' }, ...ALL_STATUSES.map((s) => ({ value: s, label: s }))]} />
            <FilterSelect label="Hotel" value={fHotel} onChange={setFHotel} options={[{ value: '', label: 'All Hotels' }, ...hotels.map((h) => ({ value: h.id, label: h.hotel_name }))]} />
            <FilterSelect label="Plan" value={fPlan} onChange={setFPlan} options={[{ value: '', label: 'All Plans' }, ...plans.map((p) => ({ value: p.id, label: p.name }))]} />
            <FilterSelect label="Payment Status" value={fPayment} onChange={setFPayment} options={[{ value: '', label: 'All' }, ...PAYMENT_STATUSES.map((s) => ({ value: s, label: s }))]} />
            <FilterDate label="Invoice Date From" value={fDateFrom} onChange={setFDateFrom} />
            <FilterDate label="Invoice Date To" value={fDateTo} onChange={setFDateTo} />
            <FilterDate label="Due Date From" value={fDueFrom} onChange={setFDueFrom} />
            <FilterDate label="Due Date To" value={fDueTo} onChange={setFDueTo} />
          </div>
        </Card>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState title="No invoices found" subtitle="Create a new invoice or adjust filters" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-left text-xs font-bold text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Hotel</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Invoice Date</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition cursor-pointer" onClick={() => onOpenDrawer(inv.id)}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-sky-700">{inv.invoice_number ?? <span className="text-slate-400">Draft</span>}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{inv.hotel_name ?? '—'}</p>
                      <p className="text-xs text-slate-400">{inv.property_code ?? ''}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{inv.plan_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(inv.invoice_date)}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {fmtDate(inv.due_date)}
                      {inv.status === 'Overdue' && <span className="block text-xs text-red-600 font-semibold">Overdue</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-800">{fmtMoney(inv.total_amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{fmtMoney(inv.amount_paid)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-red-600">{fmtMoney(inv.balance_due)}</td>
                    <td className="px-4 py-3"><Badge color={STATUS_COLORS[inv.status] ?? 'slate'}>{inv.status}</Badge></td>
                    <td className="px-4 py-3 text-right relative" onClick={(e) => e.stopPropagation()}>
                      {acting === inv.id ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (
                        <button onClick={() => setActionMenu(actionMenu === inv.id ? null : inv.id)} className="p-1 rounded hover:bg-slate-200">
                          <MoreVertical className="w-4 h-4 text-slate-500" />
                        </button>
                      )}
                      {actionMenu === inv.id && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setActionMenu(null)} />
                          <div className="absolute right-4 top-full mt-1 w-52 bg-white rounded-xl shadow-2xl border border-slate-200 z-40 py-1">
                            <MenuBtn icon={<Eye className="w-3.5 h-3.5" />} label="Preview" onClick={() => handleAction('preview', inv)} />
                            {inv.status === 'Draft' && canIssue && <MenuBtn icon={<FileText className="w-3.5 h-3.5" />} label="Issue Invoice" onClick={() => handleAction('issue', inv)} />}
                            {inv.status === 'Issued' && canWrite && <MenuBtn icon={<Send className="w-3.5 h-3.5" />} label="Mark as Sent" onClick={() => handleAction('send', inv)} />}
                            {inv.status !== 'Paid' && inv.status !== 'Draft' && inv.status !== 'Cancelled' && canPayment && <MenuBtn icon={<DollarSign className="w-3.5 h-3.5" />} label="Record Payment" onClick={() => handleAction('mark-paid', inv)} />}
                            <MenuBtn icon={<Share2 className="w-3.5 h-3.5" />} label="Share WhatsApp" onClick={() => onOpenDrawer(inv.id)} />
                            <MenuBtn icon={<Mail className="w-3.5 h-3.5" />} label="Send Email" onClick={() => onOpenDrawer(inv.id)} />
                            {canWrite && <MenuBtn icon={<Copy className="w-3.5 h-3.5" />} label="Duplicate" onClick={() => handleAction('duplicate', inv)} />}
                            {inv.status !== 'Cancelled' && inv.status !== 'Paid' && canCancel && <MenuBtn icon={<XCircle className="w-3.5 h-3.5" />} label="Cancel" danger onClick={() => handleAction('cancel', inv)} />}
                            {inv.status === 'Draft' && canWrite && <MenuBtn icon={<XCircle className="w-3.5 h-3.5" />} label="Delete" danger onClick={() => handleAction('delete-draft', inv)} />}
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
    </div>
  );
};

const SummaryCard = ({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) => {
  const colors: Record<string, string> = {
    sky: 'bg-sky-50 text-sky-600', slate: 'bg-slate-100 text-slate-600',
    amber: 'bg-amber-50 text-amber-600', green: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600', violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colors[color] ?? colors.sky}`}>{icon}</div>
      </div>
      <p className="text-lg font-bold text-slate-900 tabular-nums">{value}</p>
    </Card>
  );
};

const FilterSelect = ({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) => (
  <label className="block">
    <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </label>
);

const FilterDate = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <label className="block">
    <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
    <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white" />
  </label>
);

const MenuBtn = ({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 ${danger ? 'text-red-600' : 'text-slate-700'}`}>
    {icon} {label}
  </button>
);
