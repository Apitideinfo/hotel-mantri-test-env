import { useEffect, useState, useCallback } from 'react';
import { CreditCard, Plus, Search, IndianRupee } from 'lucide-react';
import { getEnterpriseHotels, getPlans, getPayments, createPayment } from '../api';
import type { EnterpriseHotel, SubscriptionPlan, SubscriptionPayment } from '../types';
import { PageHeader, Card, Badge, LoadingState, ErrorState, EmptyState, TextInput, SelectInput, NumInput, fmtMoney, fmtDate } from '../ui';

export const SubscriptionsScreen = ({ onViewHotel }: { onViewHotel: (id: string) => void }) => {
  const [hotels, setHotels] = useState<EnterpriseHotel[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showPayment, setShowPayment] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [payForm, setPayForm] = useState({ amount: 0, discount: 0, payment_mode: 'Cash', invoice_number: '', billing_cycle: 'monthly', notes: '', payment_date: new Date().toISOString().slice(0, 10) });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [h, p, pay] = await Promise.all([getEnterpriseHotels(), getPlans(), getPayments()]);
      setHotels(h.filter((x) => !x.archived_at)); setPlans(p); setPayments(pay);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = hotels.filter((h) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return h.hotel_name.toLowerCase().includes(q) || h.owner_name.toLowerCase().includes(q);
  });

  const handleRecordPayment = async () => {
    if (!showPayment) return;
    try {
      setSaving(true);
      const hotel = hotels.find((h) => h.id === showPayment);
      await createPayment({
        hotel_id: showPayment,
        plan_id: hotel?.plan_id ?? null,
        amount: payForm.amount,
        discount: payForm.discount,
        payment_mode: payForm.payment_mode,
        invoice_number: payForm.invoice_number,
        billing_cycle: payForm.billing_cycle,
        payment_date: payForm.payment_date,
        notes: payForm.notes,
      });
      await load();
      setShowPayment(null);
      setPayForm({ amount: 0, discount: 0, payment_mode: 'Cash', invoice_number: '', billing_cycle: 'monthly', notes: '', payment_date: new Date().toISOString().slice(0, 10) });
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  if (loading) return <LoadingState label="Loading subscriptions…" />;

  return (
    <div className="space-y-4">
      <PageHeader title="Subscription Management" subtitle={`${hotels.length} hotels · ${plans.length} plans`} />

      {error && <ErrorState message={error} />}

      {/* Plans overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {plans.map((p) => (
          <Card key={p.id} className="p-4">
            <p className="text-sm font-bold text-slate-800">{p.name}</p>
            <p className="text-xl font-bold text-sky-700 tabular-nums">{fmtMoney(p.price)}</p>
            <p className="text-xs text-slate-400">{p.billing_period} · {p.trial_days}d trial</p>
          </Card>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search hotels…"
          className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No hotels found" />
      ) : (
        <div className="hidden lg:block bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 border-b text-left text-xs font-bold text-slate-500 uppercase">
              <th className="px-4 py-3">Hotel</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Start</th><th className="px-4 py-3">Expiry</th><th className="px-4 py-3">Total Paid</th><th className="px-4 py-3">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((h) => {
                const plan = plans.find((p) => p.id === h.plan_id);
                const totalPaid = payments.filter((p) => p.hotel_id === h.id && p.payment_date).reduce((s, p) => s + p.amount, 0);
                return (
                  <tr key={h.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><button onClick={() => onViewHotel(h.id)} className="font-semibold text-sky-700 hover:underline">{h.hotel_name}</button></td>
                    <td className="px-4 py-3 text-slate-600">{plan?.name ?? 'Trial'}</td>
                    <td className="px-4 py-3"><Badge color={h.subscription_status === 'Active' ? 'green' : h.subscription_status === 'Trial' ? 'sky' : h.subscription_status === 'Expired' ? 'amber' : 'red'}>{h.subscription_status}</Badge></td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(h.subscription_start)}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(h.subscription_expiry)}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums">{fmtMoney(totalPaid)}</td>
                    <td className="px-4 py-3"><button onClick={() => setShowPayment(h.id)} className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold px-2.5 py-1.5 rounded-lg"><Plus className="w-3 h-3" /> Payment</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {filtered.map((h) => {
          const plan = plans.find((p) => p.id === h.plan_id);
          const totalPaid = payments.filter((p) => p.hotel_id === h.id && p.payment_date).reduce((s, p) => s + p.amount, 0);
          return (
            <Card key={h.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <button onClick={() => onViewHotel(h.id)} className="font-semibold text-sky-700">{h.hotel_name}</button>
                <Badge color={h.subscription_status === 'Active' ? 'green' : 'slate'}>{h.subscription_status}</Badge>
              </div>
              <p className="text-xs text-slate-500 mb-2">{plan?.name ?? 'Trial'} · {fmtMoney(totalPaid)} paid · Expires {fmtDate(h.subscription_expiry)}</p>
              <button onClick={() => setShowPayment(h.id)} className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 font-semibold px-3 py-1.5 rounded-lg"><Plus className="w-3 h-3" /> Record Payment</button>
            </Card>
          );
        })}
      </div>

      {/* Payment modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-5 space-y-3">
            <h3 className="text-lg font-bold text-slate-900">Record Payment</h3>
            <NumInput label="Amount" value={payForm.amount} onChange={(v) => setPayForm({ ...payForm, amount: v })} />
            <NumInput label="Discount" value={payForm.discount} onChange={(v) => setPayForm({ ...payForm, discount: v })} />
            <div className="grid grid-cols-2 gap-3">
              <SelectInput label="Mode" value={payForm.payment_mode} onChange={(v) => setPayForm({ ...payForm, payment_mode: v })}
                options={[{ value: 'Cash', label: 'Cash' }, { value: 'Bank', label: 'Bank' }, { value: 'UPI', label: 'UPI' }, { value: 'Card', label: 'Card' }]} />
              <TextInput label="Invoice #" value={payForm.invoice_number} onChange={(v) => setPayForm({ ...payForm, invoice_number: v })} />
            </div>
            <TextInput label="Payment Date" value={payForm.payment_date} onChange={(v) => setPayForm({ ...payForm, payment_date: v })} type="date" />
            <TextInput label="Notes" value={payForm.notes} onChange={(v) => setPayForm({ ...payForm, notes: v })} />
            <div className="flex gap-2 pt-2">
              <button onClick={handleRecordPayment} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl">{saving ? 'Saving…' : 'Record'}</button>
              <button onClick={() => setShowPayment(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl">Cancel</button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
