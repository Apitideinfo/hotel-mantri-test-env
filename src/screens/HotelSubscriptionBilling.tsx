import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, CreditCard, Download, FileText, AlertTriangle, Phone, Mail, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const fmtMoney = (n: number): string => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string | null): string => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

interface HotelInvoice {
  id: string;
  invoice_number: string | null;
  status: string;
  invoice_date: string | null;
  due_date: string | null;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  billing_period: string;
  created_at: string;
}

interface HotelPayment {
  id: string;
  receipt_number: string | null;
  amount: number;
  payment_date: string;
  payment_mode: string;
  transaction_reference: string;
  invoice_id: string;
}

export const HotelSubscriptionBilling = ({ onBack }: { onBack: () => void }) => {
  const { hotelId, hotelName, subscriptionStatus } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hotel, setHotel] = useState<Record<string, unknown> | null>(null);
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
  const [invoices, setInvoices] = useState<HotelInvoice[]>([]);
  const [payments, setPayments] = useState<HotelPayment[]>([]);

  const load = useCallback(async () => {
    if (!hotelId) return;
    try {
      setLoading(true);
      const { data: h, error: hErr } = await supabase
        .from('hotels').select('*').eq('id', hotelId).maybeSingle();
      if (hErr) throw hErr;
      setHotel(h);
      if (h?.plan_id) {
        const { data: p } = await supabase
          .from('subscription_plans').select('*').eq('id', h.plan_id).maybeSingle();
        setPlan(p);
      }
      const { data: invs } = await supabase
        .from('invoices').select('*').eq('hotel_id', hotelId)
        .order('created_at', { ascending: false });
      setInvoices((invs ?? []) as HotelInvoice[]);
      const { data: pays } = await supabase
        .from('invoice_payments').select('*').eq('invoice_id', 'in(' + (invs ?? []).map((i) => `'${i.id}'`).join(',') + ')')
        .order('created_at', { ascending: false });
      setPayments((pays ?? []) as HotelPayment[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [hotelId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  );

  const daysRemaining = hotel?.subscription_expiry
    ? Math.max(0, Math.ceil((new Date(hotel.subscription_expiry as string).getTime() - Date.now()) / 86400000))
    : null;

  const statusColor = (s: string) => {
    switch (s) {
      case 'Active': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Trial': case 'Trial Expiring': return 'bg-sky-100 text-sky-700 border-sky-200';
      case 'Grace Period': case 'Partially Paid': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Overdue': case 'Suspended': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      <header className="sticky top-0 z-10 bg-sky-800 text-white px-4 py-3 flex items-center gap-3 shadow-md">
        <button onClick={onBack} className="p-1.5 -ml-1.5 hover:bg-sky-700 rounded-lg transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold leading-tight">Subscription & Billing</h1>
          <p className="text-sky-300 text-xs">Plan · Invoices · Payments</p>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 max-w-3xl mx-auto">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{error}</div>
        )}

        {/* Warning banner for grace/overdue */}
        {subscriptionStatus && !['Active', 'Trial'].includes(subscriptionStatus) && (
          <div className={`flex items-center gap-2 rounded-xl p-3 text-sm border ${statusColor(subscriptionStatus)}`}>
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {subscriptionStatus === 'Expired' && 'Your subscription has expired. Please renew to restore access.'}
            {subscriptionStatus === 'Suspended' && 'Your subscription is suspended. Contact billing support to reactivate.'}
          </div>
        )}

        {/* Current Plan Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2 mb-4">
            <CreditCard className="w-4 h-4" /> Current Subscription
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <InfoRow label="Hotel" value={hotelName ?? '—'} />
            <InfoRow label="Plan" value={(plan?.name as string) ?? 'Trial'} />
            <InfoRow label="Status" value={
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${statusColor(subscriptionStatus ?? 'Active')}`}>
                {subscriptionStatus ?? 'Active'}
              </span>
            } />
            <InfoRow label="Billing Cycle" value={(hotel?.billing_cycle as string) ?? '—'} />
            <InfoRow label="Start Date" value={fmtDate((hotel?.subscription_start as string) ?? null)} />
            <InfoRow label="Expiry Date" value={fmtDate((hotel?.subscription_expiry as string) ?? null)} />
            <InfoRow label="Days Remaining" value={daysRemaining !== null ? `${daysRemaining} days` : '—'} />
            <InfoRow label="Next Renewal" value={fmtDate((hotel?.renewal_date as string) ?? null)} />
            <InfoRow label="Total Payable" value={fmtMoney((hotel?.total_payable as number) ?? 0)} />
            <InfoRow label="Amount Paid" value={fmtMoney((hotel?.amount_paid as number) ?? 0)} />
            <InfoRow label="Outstanding" value={
              <span className="font-bold text-red-600">{fmtMoney((hotel?.outstanding_amount as number) ?? 0)}</span>
            } />
            <InfoRow label="Auto Renew" value={(hotel?.auto_renew as boolean) ? 'On' : 'Off'} />
          </div>
        </div>

        {/* Invoice History */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4" /> Invoice History
          </h2>
          {invoices.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No invoices yet</p>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{inv.invoice_number ?? 'Draft'}</p>
                    <p className="text-xs text-slate-400">{fmtDate(inv.invoice_date)} · {inv.billing_period}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-800">{fmtMoney(inv.total_amount)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                        inv.status === 'Draft' ? 'bg-slate-100 text-slate-600' :
                        inv.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                        'bg-sky-100 text-sky-700'
                      }`}>{inv.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment History */}
        {payments.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2 mb-4">
              <CreditCard className="w-4 h-4" /> Payment History
            </h2>
            <div className="space-y-2">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{p.receipt_number ?? '—'}</p>
                    <p className="text-xs text-slate-400">{fmtDate(p.payment_date)} · {p.payment_mode} · {p.transaction_reference || ''}</p>
                  </div>
                  <p className="text-sm font-bold text-emerald-600">{fmtMoney(p.amount)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contact Billing Support */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Contact Billing Support</h2>
          <div className="flex flex-col gap-2 text-sm text-slate-600">
            <a href="tel:+919999999999" className="flex items-center gap-2 text-sky-700 hover:underline">
              <Phone className="w-4 h-4" /> +91 99999 99999
            </a>
            <a href="mailto:billing@hotelmantri.com" className="flex items-center gap-2 text-sky-700 hover:underline">
              <Mail className="w-4 h-4" /> billing@hotelmantri.com
            </a>
          </div>
        </div>
      </main>
    </div>
  );
};

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <p className="text-xs text-slate-400 mb-0.5">{label}</p>
    <p className="text-sm font-semibold text-slate-800">{value}</p>
  </div>
);
