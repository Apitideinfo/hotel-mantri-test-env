import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Loader2, AlertCircle, CreditCard } from 'lucide-react';
import { ScreenHeader, fmtMoney } from '@/components/finance-ui';
import { getVouchers, saveVoucher, getChartOfAccounts } from '@/lib/api-accounting';
import type { Voucher, VoucherType, VoucherInput } from '@/lib/types-accounting';
import { VOUCHER_TYPE_LABELS } from '@/lib/types-accounting';
import type { ChartOfAccount } from '@/lib/types-accounting';

const today = () => new Date().toISOString().slice(0, 10);

export const VouchersScreen = ({ onBack }: { onBack: () => void }) => {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<VoucherInput>({ voucher_type: 'receipt', voucher_date: today(), amount: 0, party_name: '', party_type: '', narration: '' });
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState<VoucherType | ''>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, a] = await Promise.all([
        getVouchers(today().slice(0, 8) + '01', today(), filterType || undefined),
        getChartOfAccounts(),
      ]);
      setVouchers(v);
      setAccounts(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (form.amount <= 0) { setError('Amount must be positive.'); return; }
    if (!form.debit_account_id || !form.credit_account_id) { setError('Both debit and credit accounts are required.'); return; }
    setSaving(true);
    try {
      await saveVoucher(form);
      setShowForm(false);
      setForm({ voucher_type: 'receipt', voucher_date: today(), amount: 0, party_name: '', party_type: '', narration: '' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <ScreenHeader title="Vouchers" subtitle="Receipt · Payment · Contra · Journal · Notes" onBack={onBack}
        icon={<CreditCard className="w-5 h-5 text-sky-300" />} />

      <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value as VoucherType | '')}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
          <option value="">All Types</option>
          {(Object.keys(VOUCHER_TYPE_LABELS) as VoucherType[]).map((t) => <option key={t} value={t}>{VOUCHER_TYPE_LABELS[t]}</option>)}
        </select>
        <button onClick={() => setShowForm(true)} className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl">
          <Plus className="w-4 h-4" /> New Voucher
        </button>
      </div>

      {error && (
        <div className="mx-4 mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {showForm && (
        <div className="mx-4 mb-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-800">New Voucher</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Type</label>
              <select value={form.voucher_type} onChange={(e) => setForm({ ...form, voucher_type: e.target.value as VoucherType })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                {(Object.keys(VOUCHER_TYPE_LABELS) as VoucherType[]).map((t) => <option key={t} value={t}>{VOUCHER_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Date</label>
              <input type="date" value={form.voucher_date} onChange={(e) => setForm({ ...form, voucher_date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Amount (₹)</label>
              <input type="number" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Party Name</label>
              <input type="text" value={form.party_name} onChange={(e) => setForm({ ...form, party_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Debit Account</label>
              <select value={form.debit_account_id ?? ''} onChange={(e) => setForm({ ...form, debit_account_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="">Select…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Credit Account</label>
              <select value={form.credit_account_id ?? ''} onChange={(e) => setForm({ ...form, credit_account_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="">Select…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Narration</label>
            <input type="text" value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
              {saving ? 'Saving…' : 'Create Voucher'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-200 rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…</div>
      ) : vouchers.length === 0 ? (
        <div className="text-center py-16 text-slate-400"><CreditCard className="w-12 h-12 mx-auto mb-3 opacity-40" /><p className="text-sm">No vouchers this month.</p></div>
      ) : (
        <div className="px-4 pb-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-left text-[10px] font-bold text-slate-400 uppercase">
                  <th className="px-4 py-2">Number</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Party</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vouchers.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs font-bold text-slate-600">{v.voucher_number}</td>
                    <td className="px-4 py-2"><span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 font-medium">{VOUCHER_TYPE_LABELS[v.voucher_type]}</span></td>
                    <td className="px-4 py-2 text-slate-600">{v.voucher_date}</td>
                    <td className="px-4 py-2 text-slate-700">{v.party_name || '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-bold text-slate-800">{fmtMoney(v.amount)}</td>
                    <td className="px-4 py-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${v.status === 'posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{v.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
