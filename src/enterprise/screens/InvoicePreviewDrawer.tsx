import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Download, Send, CheckCircle2, XCircle, Printer, Loader2,
  DollarSign, History, FileText, Share2, Mail, Copy, AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  getInvoice, getInvoiceItems, getInvoicePayments, getBillingSettings,
  issueInvoice, recordInvoicePayment, cancelInvoice, updateInvoiceStatus,
  duplicateInvoice, deleteDraftInvoice,
} from '../api';
import type { InvoiceWithDetails, InvoiceItem, InvoicePayment, BillingSettings } from '../types';
import { hasPermission } from '../permissions';
import { Badge, LoadingState, ErrorState, fmtMoney, fmtDate, fmtDateTime } from '../ui';
import { InvoicePreview } from './InvoicePreview';

interface Props {
  invoiceId: string;
  onClose: () => void;
  onChanged: () => void;
  onDuplicate: (newId: string) => void;
}

export const InvoicePreviewDrawer = ({ invoiceId, onClose, onChanged, onDuplicate }: Props) => {
  const { companyRole, user } = useAuth();
  const [invoice, setInvoice] = useState<InvoiceWithDetails | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showShare, setShowShare] = useState(false);
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

  const [issuing, setIssuing] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const extractError = (e: unknown): string => {
    if (e && typeof e === 'object' && 'message' in e) {
      const msg = (e as { message: string }).message;
      const code = 'code' in e ? (e as { code: string }).code : '';
      const details = 'details' in e ? (e as { details: string }).details : '';
      return code ? `${msg} (code: ${code}${details ? `, ${details}` : ''})` : msg;
    }
    return e instanceof Error ? e.message : String(e ?? 'Unknown error');
  };

  const handleIssue = async () => {
    setIssuing(true); setActing(true); setError(null); setSuccessMsg(null);
    try {
      const result = await issueInvoice(invoiceId);
      const num = (result as { invoice_number?: string })?.invoice_number ?? '';
      setSuccessMsg(`Invoice ${num} issued successfully`);
      await load(); onChanged();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e) { setError(`Failed to issue invoice: ${extractError(e)}`); }
    finally { setIssuing(false); setActing(false); }
  };
  const handleSend = async () => {
    setActing(true);
    try { await updateInvoiceStatus(invoiceId, 'Sent'); await load(); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setActing(false); }
  };
  const handleDuplicate = async () => {
    setActing(true);
    try { const newId = await duplicateInvoice(invoiceId); onDuplicate(newId); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setActing(false); }
  };
  const handleDelete = async () => {
    setActing(true);
    try { await deleteDraftInvoice(invoiceId); onClose(); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setActing(false); }
  };

  const handleDownloadPDF = async () => {
    if (!previewRef.current || !invoice) return;
    setActing(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const { default: jsPDF } = await import('jspdf');
      const canvas = await html2canvas(previewRef.current, { scale: 2, useCORS: true, backgroundColor: '#fff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
      while (heightLeft > 0) {
        position -= pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }
      pdf.save(`${invoice.invoice_number ?? 'draft'}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF export failed');
    } finally {
      setActing(false);
    }
  };

  const handlePrint = () => window.print();

  if (loading) return <DrawerShell onClose={onClose}><LoadingState label="Loading invoice…" /></DrawerShell>;
  if (error) return <DrawerShell onClose={onClose}><ErrorState message={error} /></DrawerShell>;
  if (!invoice || !settings) return <DrawerShell onClose={onClose}><ErrorState message="Invoice not found" /></DrawerShell>;

  const isIssued = invoice.status !== 'Draft';
  const snapshot = invoice.snapshot as Record<string, unknown> | null;
  const effectiveSettings: BillingSettings = snapshot ? {
    company_details: (snapshot.company_details as BillingSettings['company_details']) ?? settings.company_details,
    branding: (snapshot.branding as BillingSettings['branding']) ?? settings.branding,
    invoice_numbering: settings.invoice_numbering,
    gst: (snapshot.gst as BillingSettings['gst']) ?? settings.gst,
    payment: (snapshot.payment as BillingSettings['payment']) ?? settings.payment,
    terms: (snapshot.terms as BillingSettings['terms']) ?? settings.terms,
  } : settings;

  const hotelData = invoice as unknown as Record<string, unknown>;

  return (
    <DrawerShell onClose={onClose}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">{invoice.invoice_number ?? 'Draft'}</h2>
            <Badge color={invoice.status === 'Paid' ? 'green' : invoice.status === 'Draft' ? 'slate' : invoice.status === 'Cancelled' ? 'red' : invoice.status === 'Overdue' ? 'red' : invoice.status === 'Partially Paid' ? 'amber' : 'sky'}>{invoice.status}</Badge>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50 overflow-x-auto shrink-0">
          {invoice.status === 'Draft' && canIssue && (
            <ActionPill icon={issuing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} label={issuing ? 'Issuing…' : 'Issue'} onClick={handleIssue} disabled={acting || issuing} color="sky" />
          )}
          {invoice.status === 'Issued' && canWrite && (
            <ActionPill icon={<Send className="w-3.5 h-3.5" />} label="Mark Sent" onClick={handleSend} disabled={acting} color="violet" />
          )}
          {isIssued && invoice.status !== 'Cancelled' && invoice.status !== 'Paid' && canPayment && (
            <ActionPill icon={<DollarSign className="w-3.5 h-3.5" />} label="Payment" onClick={() => setShowPayment(true)} color="green" />
          )}
          <ActionPill icon={<Download className="w-3.5 h-3.5" />} label="PDF" onClick={handleDownloadPDF} disabled={acting} color="slate" />
          <ActionPill icon={<Printer className="w-3.5 h-3.5" />} label="Print" onClick={handlePrint} color="slate" />
          <ActionPill icon={<Share2 className="w-3.5 h-3.5" />} label="WhatsApp" onClick={() => setShowShare(true)} color="green" />
          <ActionPill icon={<Copy className="w-3.5 h-3.5" />} label="Duplicate" onClick={handleDuplicate} disabled={acting} color="slate" />
          {isIssued && invoice.status !== 'Cancelled' && invoice.status !== 'Paid' && canCancel && (
            <ActionPill icon={<XCircle className="w-3.5 h-3.5" />} label="Cancel" onClick={() => setShowCancel(true)} color="red" />
          )}
          {invoice.status === 'Draft' && canWrite && (
            <ActionPill icon={<XCircle className="w-3.5 h-3.5" />} label="Delete" onClick={handleDelete} disabled={acting} color="red" />
          )}
        </div>

        {/* Success / Error banner */}
        {successMsg && (
          <div className="mx-5 mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-3 py-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> {successMsg}
          </div>
        )}
        {error && !loading && (
          <div className="mx-5 mt-3 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> <span className="break-words">{error}</span>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-2 px-5 py-3 border-b border-slate-100 bg-white shrink-0">
          <MiniStat label="Total" value={fmtMoney(invoice.total_amount)} />
          <MiniStat label="Paid" value={fmtMoney(invoice.amount_paid)} color="text-emerald-600" />
          <MiniStat label="Balance" value={fmtMoney(invoice.balance_due)} color="text-red-600" />
          <MiniStat label="Due Date" value={fmtDate(invoice.due_date)} />
        </div>

        {/* Scrollable preview area */}
        <div className="flex-1 overflow-y-auto bg-slate-100 p-4 md:p-6">
          <div className="flex justify-center">
            <InvoicePreview
              ref={previewRef}
              invoice={invoice}
              items={items}
              settings={effectiveSettings}
              hotelName={invoice.hotel_name}
              hotelAddress={hotelData.address as string ?? ''}
              hotelCity={hotelData.city as string ?? ''}
              hotelState={hotelData.state as string ?? ''}
              hotelPropertyCode={invoice.property_code}
              hotelAdminEmail={hotelData.admin_email as string ?? ''}
              hotelMobile={hotelData.mobile as string ?? ''}
              hotelOwnerName={hotelData.owner_name as string ?? ''}
              planName={invoice.plan_name}
              preview
              scale={1}
            />
          </div>

          {/* Payment history */}
          {payments.length > 0 && (
            <div className="max-w-3xl mx-auto mt-4 bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2 mb-3">
                <History className="w-4 h-4" /> Payment History
              </h3>
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
            </div>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment && invoice && (
        <PaymentModal
          invoice={invoice}
          onClose={() => setShowPayment(false)}
          onSuccess={(receipt, status) => { setShowPayment(false); setSuccessMsg(`Payment recorded successfully. Receipt: ${receipt}`); load(); onChanged(); setTimeout(() => setSuccessMsg(null), 4000); }}
          userEmail={user?.email ?? ''}
        />
      )}

      {/* Cancel Modal */}
      {showCancel && (
        <CancelModal
          onClose={() => setShowCancel(false)}
          onConfirm={async (reason) => { await cancelInvoice(invoiceId, reason); setShowCancel(false); load(); onChanged(); }}
        />
      )}

      {/* Share Modal */}
      {showShare && invoice && (
        <ShareModal invoice={invoice} hotelName={invoice.hotel_name ?? ''} onClose={() => setShowShare(false)} />
      )}
    </DrawerShell>
  );
};

const DrawerShell = ({ onClose, children }: { onClose: () => void; children: React.ReactNode }) => (
  <div className="fixed inset-0 z-50 flex">
    <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
    <div className="relative ml-auto w-full max-w-4xl bg-white shadow-2xl flex flex-col animate-slide-in">
      {children}
    </div>
  </div>
);

const ActionPill = ({ icon, label, onClick, disabled, color = 'slate' }: {
  icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; color?: string;
}) => {
  const colors: Record<string, string> = {
    sky: 'bg-sky-600 hover:bg-sky-700 text-white',
    green: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    red: 'bg-red-50 hover:bg-red-100 text-red-600',
    violet: 'bg-violet-600 hover:bg-violet-700 text-white',
    slate: 'bg-slate-100 hover:bg-slate-200 text-slate-700',
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition disabled:opacity-50 ${colors[color] ?? colors.slate}`}>
      {icon} {label}
    </button>
  );
};

const MiniStat = ({ label, value, color = 'text-slate-800' }: { label: string; value: string; color?: string }) => (
  <div>
    <p className="text-xs text-slate-400 uppercase font-semibold">{label}</p>
    <p className={`text-sm font-bold tabular-nums ${color}`}>{value}</p>
  </div>
);

const PaymentModal = ({ invoice, onClose, onSuccess, userEmail }: {
  invoice: InvoiceWithDetails; onClose: () => void; onSuccess: (receipt: string, status: string) => void; userEmail: string;
}) => {
  const [amount, setAmount] = useState(String(invoice.balance_due));
  const [mode, setMode] = useState('Bank');
  const [ref, setRef] = useState('');
  const [bankUpi, setBankUpi] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const extractError = (e: unknown): string => {
    if (e && typeof e === 'object' && 'message' in e) {
      const msg = (e as { message: string }).message;
      const code = 'code' in e ? (e as { code: string }).code : '';
      return code ? `${msg} (code: ${code})` : msg;
    }
    return e instanceof Error ? e.message : String(e ?? 'Unknown error');
  };

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    if (amt > invoice.balance_due + 0.01) {
      setError(`Payment amount ₹${amt.toFixed(2)} cannot exceed outstanding balance ₹${invoice.balance_due.toFixed(2)}.`);
      return;
    }
    setSaving(true); setError(null); setSuccess(null);
    try {
      const result = await recordInvoicePayment({ invoiceId: invoice.id, amount: amt, paymentMode: mode, transactionReference: ref, bankOrUpi: bankUpi, notes });
      setSuccess(`Payment recorded successfully. Receipt: ${result.receipt_number}`);
      setTimeout(() => onSuccess(result.receipt_number, result.new_status), 1500);
    } catch (e) { setError(`Failed to record payment: ${extractError(e)}`); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Record Payment</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-slate-500">Invoice Total:</span><span className="font-bold">{fmtMoney(invoice.total_amount)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Already Paid:</span><span className="font-semibold text-emerald-600">{fmtMoney(invoice.amount_paid)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Balance Due:</span><span className="font-bold text-red-600">{fmtMoney(invoice.balance_due)}</span></div>
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-2 break-words">{error}</div>}
        {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg p-2 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /> {success}</div>}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="block text-sm font-medium text-slate-700">Amount (₹)</span>
            <button onClick={() => setAmount(String(invoice.balance_due))} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
              Pay Full Balance
            </button>
          </div>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        </div>
        <label className="block"><span className="block text-sm font-medium text-slate-700 mb-1">Payment Mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="Bank">Bank Transfer</option><option value="UPI">UPI</option><option value="Cash">Cash</option>
            <option value="Card">Card</option><option value="Gateway">Payment Gateway</option><option value="Cheque">Cheque</option>
          </select></label>
        <input type="text" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Transaction Reference / UTR" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        <input type="text" value={bankUpi} onChange={(e) => setBankUpi(e.target.value)} placeholder="Bank / UPI ID" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
        <div className="flex gap-2">
          <button onClick={handleSubmit} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Recording payment…</> : 'Record Payment'}
          </button>
          <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
};

const CancelModal = ({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string) => void }) => {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-[60] flex items-center justify-center p-4">
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

const ShareModal = ({ invoice, hotelName, onClose }: { invoice: InvoiceWithDetails; hotelName: string; onClose: () => void }) => {
  const msg = `Invoice ${invoice.invoice_number ?? 'Draft'} for ${hotelName}\nTotal: ${fmtMoney(invoice.total_amount)}\nBalance Due: ${fmtMoney(invoice.balance_due)}\nDue Date: ${fmtDate(invoice.due_date)}`;
  const [copied, setCopied] = useState(false);
  const handleCopy = () => { navigator.clipboard.writeText(msg); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Share Invoice</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <textarea readOnly value={msg} rows={5} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none bg-slate-50" />
        <div className="flex gap-2">
          <a href={waUrl} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-sm">
            <Share2 className="w-4 h-4" /> Open WhatsApp
          </a>
          <button onClick={handleCopy} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl text-sm">
            {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
};
