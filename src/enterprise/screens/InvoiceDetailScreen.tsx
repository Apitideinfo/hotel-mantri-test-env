import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, Download, Send, CheckCircle2, XCircle, Printer,
  Loader2, DollarSign, History, Share2, FileText,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  getInvoice, getInvoiceItems, getInvoicePayments, getBillingSettings,
  issueInvoice, recordInvoicePayment, cancelInvoice, updateInvoiceStatus,
} from '../api';
import type { InvoiceWithDetails, InvoiceItem, InvoicePayment, BillingSettings } from '../types';
import { hasPermission } from '../permissions';
import { Card, Badge, LoadingState, ErrorState, fmtMoney, fmtDate, fmtDateTime } from '../ui';
import { InvoicePreview } from './InvoicePreview';

interface Props {
  invoiceId: string;
  onBack: () => void;
}

export const InvoiceDetailScreen = ({ invoiceId, onBack }: Props) => {
  const { companyRole, user } = useAuth();
  const [invoice, setInvoice] = useState<InvoiceWithDetails | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const canWrite = hasPermission(companyRole, 'invoices.write');
  const canIssue = hasPermission(companyRole, 'invoices.issue');
  const canPayment = hasPermission(companyRole, 'invoices.payment');
  const canCancel = hasPermission(companyRole, 'invoices.cancel');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [inv, itms, pays, sett] = await Promise.all([
        getInvoice(invoiceId),
        getInvoiceItems(invoiceId),
        getInvoicePayments(invoiceId),
        getBillingSettings(),
      ]);
      setInvoice(inv);
      setItems(itms);
      setPayments(pays);
      setSettings(sett);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const handlePrint = () => {
    window.print();
  };

  const handleIssue = async () => {
    setActing(true);
    try { await issueInvoice(invoiceId); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setActing(false); }
  };

  const handleSend = async () => {
    setActing(true);
    try { await updateInvoiceStatus(invoiceId, 'Sent'); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setActing(false); }
  };

  if (loading) return <LoadingState label="Loading invoice…" />;
  if (error) return <ErrorState message={error} />;
  if (!invoice || !settings) return <ErrorState message="Invoice not found" />;

  const isIssued = invoice.status !== 'Draft';
  const snapshot = invoice.snapshot as Record<string, unknown> | null;
  // Use snapshot settings if available (for issued invoices), otherwise live settings
  const effectiveSettings: BillingSettings = snapshot ? {
    company_details: (snapshot.company_details as BillingSettings['company_details']) ?? settings.company_details,
    branding: (snapshot.branding as BillingSettings['branding']) ?? settings.branding,
    invoice_numbering: settings.invoice_numbering,
    gst: (snapshot.gst as BillingSettings['gst']) ?? settings.gst,
    payment: (snapshot.payment as BillingSettings['payment']) ?? settings.payment,
    terms: (snapshot.terms as BillingSettings['terms']) ?? settings.terms,
  } : settings;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 print:hidden">
        <button onClick={onBack} className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl lg:text-2xl font-bold text-slate-900">
              {invoice.invoice_number ?? 'Draft Invoice'}
            </h1>
            <Badge color={invoice.status === 'Paid' ? 'green' : invoice.status === 'Draft' ? 'slate' : invoice.status === 'Cancelled' ? 'red' : 'sky'}>
              {invoice.status}
            </Badge>
          </div>
          <p className="text-sm text-slate-500">{invoice.hotel_name} · {invoice.property_code ?? 'No property code'}</p>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-2">
          {invoice.status === 'Draft' && canIssue && (
            <button onClick={handleIssue} disabled={acting} className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold px-3 py-2 rounded-lg text-sm transition">
              {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Issue
            </button>
          )}
          {invoice.status === 'Issued' && canWrite && (
            <button onClick={handleSend} disabled={acting} className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold px-3 py-2 rounded-lg text-sm transition">
              <Send className="w-4 h-4" /> Mark Sent
            </button>
          )}
          {isIssued && invoice.status !== 'Cancelled' && invoice.status !== 'Paid' && canPayment && (
            <button onClick={() => setShowPaymentModal(true)} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-2 rounded-lg text-sm transition">
              <DollarSign className="w-4 h-4" /> Record Payment
            </button>
          )}
          {isIssued && invoice.status !== 'Cancelled' && invoice.status !== 'Paid' && canCancel && (
            <button onClick={() => setShowCancelModal(true)} className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-semibold px-3 py-2 rounded-lg text-sm transition">
              <XCircle className="w-4 h-4" /> Cancel
            </button>
          )}
          <button onClick={handlePrint} className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-2 rounded-lg text-sm transition">
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:hidden">
        <Card className="p-4">
          <p className="text-xs text-slate-400 uppercase font-semibold">Total Amount</p>
          <p className="text-lg font-bold text-slate-900 tabular-nums">{fmtMoney(invoice.total_amount)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-400 uppercase font-semibold">Amount Paid</p>
          <p className="text-lg font-bold text-emerald-600 tabular-nums">{fmtMoney(invoice.amount_paid)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-400 uppercase font-semibold">Balance Due</p>
          <p className="text-lg font-bold text-red-600 tabular-nums">{fmtMoney(invoice.balance_due)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-400 uppercase font-semibold">Due Date</p>
          <p className="text-lg font-bold text-slate-700">{fmtDate(invoice.due_date)}</p>
        </Card>
      </div>

      {/* Invoice preview */}
      <div className="bg-slate-100 rounded-2xl p-4 md:p-8 print:bg-white print:p-0">
        <div className="flex justify-center print:block">
          <InvoicePreview
            ref={previewRef}
            invoice={invoice}
            items={items}
            settings={effectiveSettings}
            hotelName={invoice.hotel_name}
            hotelAddress={invoice.address ?? ''}
            hotelCity={invoice.city ?? ''}
            hotelState={invoice.state ?? ''}
            hotelPropertyCode={invoice.property_code}
            hotelAdminEmail={invoice.admin_email ?? ''}
            hotelMobile={invoice.mobile ?? ''}
            hotelOwnerName={invoice.owner_name ?? ''}
            planName={invoice.plan_name || (items[0]?.description ? items[0].description.split(' — ')[0] : undefined)}
            preview
            scale={1}
          />
        </div>
      </div>

      {/* Payment history */}
      {payments.length > 0 && (
        <Card className="p-5 print:hidden">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2 mb-3"><History className="w-4 h-4" /> Payment History</h3>
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{p.receipt_number ?? '—'}</p>
                  <p className="text-xs text-slate-400">{fmtDate(p.payment_date)} · {p.payment_mode} · {p.transaction_reference || ''}</p>
                  {p.notes && <p className="text-xs text-slate-500 mt-0.5">{p.notes}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-800 tabular-nums">{fmtMoney(p.amount)}</p>
                  <p className="text-xs text-slate-400">{p.entered_by_email || ''}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal
          invoice={invoice}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => { setShowPaymentModal(false); load(); }}
          userEmail={user?.email ?? ''}
        />
      )}

      {/* Cancel Modal */}
      {showCancelModal && (
        <CancelModal
          onClose={() => setShowCancelModal(false)}
          onConfirm={async (reason) => { await cancelInvoice(invoiceId, reason); setShowCancelModal(false); load(); }}
        />
      )}
    </div>
  );
};

// ── Payment Modal ──
const PaymentModal = ({ invoice, onClose, onSuccess, userEmail }: {
  invoice: InvoiceWithDetails;
  onClose: () => void;
  onSuccess: () => void;
  userEmail: string;
}) => {
  const [amount, setAmount] = useState(String(invoice.balance_due));
  const [mode, setMode] = useState('Bank');
  const [ref, setRef] = useState('');
  const [bankUpi, setBankUpi] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    setSaving(true); setError(null);
    try {
      await recordInvoicePayment({ invoiceId: invoice.id, amount: amt, paymentMode: mode, transactionReference: ref, bankOrUpi: bankUpi, notes });
      onSuccess();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Record Payment</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Invoice Total:</span><span className="font-bold">{fmtMoney(invoice.total_amount)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Already Paid:</span><span className="font-semibold text-emerald-600">{fmtMoney(invoice.amount_paid)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Balance Due:</span><span className="font-bold text-red-600">{fmtMoney(invoice.balance_due)}</span></div>
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
        <input type="text" value={bankUpi} onChange={(e) => setBankUpi(e.target.value)} placeholder="Bank / UPI ID" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
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

// ── Cancel Modal ──
const CancelModal = ({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string) => void }) => {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <h3 className="text-lg font-bold text-red-700">Cancel Invoice</h3>
        <p className="text-sm text-slate-600">This will cancel the invoice. This action is logged and cannot be undone.</p>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for cancellation" rows={3} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
        <div className="flex gap-2">
          <button onClick={() => reason && onConfirm(reason)} disabled={!reason} className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm">Cancel Invoice</button>
          <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl text-sm">Close</button>
        </div>
      </div>
    </div>
  );
};
