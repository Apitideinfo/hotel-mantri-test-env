import { useEffect, useState, useMemo } from 'react';
import { Receipt, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import type { MonthlyBill, MonthlyBillInput, PaymentMode, BillStatus } from '@/lib/types-finance';
import { PAYMENT_MODES, BILL_STATUSES } from '@/lib/types-finance';
import { getMonthlyBills, saveMonthlyBill, deleteMonthlyBill } from '@/lib/api-finance';
import {
  ScreenHeader, SectionCard, NumInput, SelectInput, DateInput, TextInput, TextArea,
  Banner, fmtMoney, monthKeyFrom, monthLabel,
} from '@/components/finance-ui';

interface MonthlyBillsScreenProps {
  onBack: () => void;
}

const now = new Date();
const defaultMonth = monthKeyFrom(now.getFullYear(), now.getMonth() + 1);

const emptyForm: MonthlyBillInput = {
  bill_name: '', vendor: '', bill_date: null, due_date: null,
  amount: 0, payment_mode: 'Cash', status: 'Pending', paid_date: null, remarks: '',
  month_key: defaultMonth,
};

export const MonthlyBillsScreen = ({ onBack }: MonthlyBillsScreenProps) => {
  const [bills, setBills] = useState<MonthlyBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState(defaultMonth);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<MonthlyBillInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getMonthlyBills(monthKey);
      setBills(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [monthKey]);

  const handleSave = async () => {
    setError(null);
    if (!form.bill_name.trim()) { setError('Enter bill name.'); return; }
    if (form.amount <= 0) { setError('Enter a valid amount.'); return; }
    try {
      setSaving(true);
      const payload = { ...form, month_key: monthKey };
      const saved = await saveMonthlyBill(payload, editingId ?? undefined);
      setBills((prev) => {
        const idx = prev.findIndex((b) => b.id === saved.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
        return [...prev, saved];
      });
      setForm({ ...emptyForm, month_key: monthKey });
      setShowForm(false);
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (b: MonthlyBill) => {
    setEditingId(b.id);
    setForm({
      bill_name: b.bill_name, vendor: b.vendor, bill_date: b.bill_date, due_date: b.due_date,
      amount: b.amount, payment_mode: b.payment_mode, status: b.status, paid_date: b.paid_date, remarks: b.remarks,
      month_key: b.month_key,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this bill?')) return;
    try {
      await deleteMonthlyBill(id);
      setBills((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const handleCancel = () => {
    setForm({ ...emptyForm, month_key: monthKey });
    setShowForm(false);
    setEditingId(null);
  };

  const summary = useMemo(() => {
    let due = 0, paid = 0, pending = 0;
    for (const b of bills) {
      due += b.amount;
      if (b.status === 'Paid') paid += b.amount;
      else pending += b.amount;
    }
    return { due, paid, pending };
  }, [bills]);

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <ScreenHeader title="Monthly Bills" subtitle="Track recurring monthly bills" onBack={onBack}
        icon={<Receipt className="w-5 h-5 text-sky-300" />} />

      <main className="px-4 py-4 space-y-4 w-full">
        {error && <Banner kind="error">{error}</Banner>}

        {/* Month selector */}
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <Field label="Month">
            <input type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </Field>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-sky-50 rounded-xl p-3 border border-sky-200 text-center">
            <p className="text-xs text-slate-500">Due</p>
            <p className="text-base font-bold text-sky-700 tabular-nums">₹{fmtMoney(summary.due)}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200 text-center">
            <p className="text-xs text-slate-500">Paid</p>
            <p className="text-base font-bold text-emerald-700 tabular-nums">₹{fmtMoney(summary.paid)}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 text-center">
            <p className="text-xs text-slate-500">Pending</p>
            <p className="text-base font-bold text-amber-700 tabular-nums">₹{fmtMoney(summary.pending)}</p>
          </div>
        </div>

        {!showForm ? (
          <button onClick={() => { setForm({ ...emptyForm, month_key: monthKey }); setShowForm(true); setEditingId(null); }}
            className="w-full flex items-center justify-center gap-2 bg-sky-700 hover:bg-sky-800 text-white font-semibold py-3.5 rounded-xl shadow-sm transition">
            <Plus className="w-5 h-5" /> Add Monthly Bill
          </button>
        ) : (
          <SectionCard title={editingId ? 'Edit Bill' : 'New Monthly Bill'} icon={<Receipt className="w-4 h-4" />}>
            <TextInput label="Bill Name" value={form.bill_name} onChange={(v) => setForm({ ...form, bill_name: v })} placeholder="e.g. Electricity, Internet, Insurance" />
            <TextInput label="Vendor" value={form.vendor} onChange={(v) => setForm({ ...form, vendor: v })} />
            <NumInput label="Amount" prefix="₹" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
            <div className="grid grid-cols-2 gap-3">
              <DateInput label="Bill Date" value={form.bill_date ?? ''} onChange={(v) => setForm({ ...form, bill_date: v || null })} />
              <DateInput label="Due Date" value={form.due_date ?? ''} onChange={(v) => setForm({ ...form, due_date: v || null })} />
            </div>
            <SelectInput label="Status" value={form.status}
              options={[...BILL_STATUSES]}
              onChange={(v) => setForm({ ...form, status: v as BillStatus })} />
            {form.status !== 'Pending' && (
              <>
                <DateInput label="Paid Date" value={form.paid_date ?? ''} onChange={(v) => setForm({ ...form, paid_date: v || null })} />
                <SelectInput label="Payment Mode" value={form.payment_mode}
                  options={[...PAYMENT_MODES]}
                  onChange={(v) => setForm({ ...form, payment_mode: v as PaymentMode })} />
              </>
            )}
            <TextArea label="Remarks" value={form.remarks} onChange={(v) => setForm({ ...form, remarks: v })} />
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition">
                <Check className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={handleCancel}
                className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-xl transition">
                <X className="w-4 h-4" /> Cancel
              </button>
            </div>
          </SectionCard>
        )}

        {/* Bills list */}
        <SectionCard title={`Bills — ${monthLabel(monthKey)} (${bills.length})`} icon={<Receipt className="w-4 h-4" />}>
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
          ) : bills.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No bills recorded for this month.</p>
          ) : (
            <div className="space-y-2">
              {bills.map((b) => (
                <div key={b.id} className="flex items-start justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{b.bill_name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        b.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                        b.status === 'PartiallyPaid' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>{b.status}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {b.vendor || '—'}{b.due_date ? ` · Due: ${b.due_date}` : ''}
                    </p>
                    {b.remarks && <p className="text-xs text-slate-400 mt-0.5 italic truncate">{b.remarks}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-sm font-bold text-slate-900 tabular-nums">₹{fmtMoney(b.amount)}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleEdit(b)} className="p-1 text-slate-300 hover:text-sky-600 transition">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(b.id)} className="p-1 text-slate-300 hover:text-red-500 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </main>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{label}</span>
    {children}
  </label>
);
