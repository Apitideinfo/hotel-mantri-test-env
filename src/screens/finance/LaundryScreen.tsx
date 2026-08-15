import { useEffect, useState, useMemo } from 'react';
import { Shirt, Plus, Trash2 } from 'lucide-react';
import type { LaundryEntry, LaundryEntryInput, LaundryDirection, LaundryType } from '@/lib/types-finance';
import { LAUNDRY_ITEMS } from '@/lib/types-finance';
import { getLaundryEntries, saveLaundryEntry, deleteLaundryEntry } from '@/lib/api-finance';
import {
  ScreenHeader, SectionCard, SelectInput, NumInput, TextInput, TextArea, DateInput,
  Banner, StickySaveBar, fmtMoney, fmtInt,
} from '@/components/finance-ui';

interface LaundryScreenProps {
  onBack: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm: LaundryEntryInput = {
  entry_date: today(), transaction_type: 'Expense', direction: 'Out',
  room_dept: '', item: 'Bedsheet', quantity: 0, rate: 0, amount: 0,
  vendor: '', payment_status: 'Pending', remarks: '',
};

export const LaundryScreen = ({ onBack }: LaundryScreenProps) => {
  const [entries, setEntries] = useState<LaundryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const [fromDate, setFromDate] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
  const [toDate, setToDate] = useState(today());

  const [form, setForm] = useState<LaundryEntryInput>(emptyForm);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getLaundryEntries(fromDate, toDate);
      setEntries(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [fromDate, toDate]);

  const amount = form.quantity * form.rate;

  const handleSave = async () => {
    setError(null);
    if (form.quantity <= 0) { setError('Enter quantity.'); return; }
    try {
      setSaving(true);
      const payload = { ...form, amount };
      const saved = await saveLaundryEntry(payload);
      setEntries((prev) => [saved, ...prev]);
      setForm({ ...emptyForm, entry_date: today() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this laundry entry?')) return;
    try {
      await deleteLaundryEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const summary = useMemo(() => {
    let revenue = 0, expense = 0;
    for (const e of entries) {
      if (e.transaction_type === 'Revenue') revenue += e.amount;
      else expense += e.amount;
    }
    return { revenue, expense };
  }, [entries]);

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <ScreenHeader title="Laundry" subtitle="Track laundry in/out and costs" onBack={onBack}
        icon={<Shirt className="w-5 h-5 text-sky-300" />} />

      <main className="px-4 py-4 space-y-4 w-full">
        {error && <Banner kind="error">{error}</Banner>}

        {/* Date range */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 grid grid-cols-2 gap-3">
          <Field label="From">
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </Field>
          <Field label="To">
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </Field>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200">
            <p className="text-xs text-slate-500">Laundry Revenue</p>
            <p className="text-lg font-bold text-emerald-700 tabular-nums">₹{fmtMoney(summary.revenue)}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
            <p className="text-xs text-slate-500">Laundry Expense</p>
            <p className="text-lg font-bold text-amber-700 tabular-nums">₹{fmtMoney(summary.expense)}</p>
          </div>
        </div>

        {/* Add form */}
        <SectionCard title="New Laundry Entry" icon={<Plus className="w-4 h-4" />}>
          <DateInput label="Date" value={form.entry_date} onChange={(v) => setForm({ ...form, entry_date: v })} />
          <div className="grid grid-cols-2 gap-3">
            <SelectInput label="Transaction Type" value={form.transaction_type}
              options={[{ value: 'Expense', label: 'Expense' }, { value: 'Revenue', label: 'Revenue' }]}
              onChange={(v) => setForm({ ...form, transaction_type: v as LaundryType })} />
            <SelectInput label="Direction" value={form.direction}
              options={[{ value: 'Out', label: 'Out (to vendor)' }, { value: 'In', label: 'In (from vendor)' }]}
              onChange={(v) => setForm({ ...form, direction: v as LaundryDirection })} />
          </div>
          <TextInput label="Room / Department" value={form.room_dept} onChange={(v) => setForm({ ...form, room_dept: v })} placeholder="e.g. Room 201 / Housekeeping" />
          <SelectInput label="Item" value={form.item}
            options={[...LAUNDRY_ITEMS]}
            onChange={(v) => setForm({ ...form, item: v })} />
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Quantity" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} allowDecimal={false} />
            <NumInput label="Rate" prefix="₹" value={form.rate} onChange={(v) => setForm({ ...form, rate: v })} />
          </div>
          <div className="bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 text-sm text-sky-800">
            Amount: <span className="font-bold tabular-nums">₹{fmtMoney(amount)}</span>
          </div>
          <TextInput label="Vendor / Laundry Provider" value={form.vendor} onChange={(v) => setForm({ ...form, vendor: v })} />
          <SelectInput label="Payment Status" value={form.payment_status}
            options={[{ value: 'Pending', label: 'Pending' }, { value: 'Paid', label: 'Paid' }]}
            onChange={(v) => setForm({ ...form, payment_status: v as 'Pending' | 'Paid' })} />
          <TextArea label="Remarks" value={form.remarks} onChange={(v) => setForm({ ...form, remarks: v })} />
        </SectionCard>

        {/* Entries list */}
        <SectionCard title={`Entries (${entries.length})`} icon={<Shirt className="w-4 h-4" />}>
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No laundry entries for this period.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {entries.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{e.item}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${e.transaction_type === 'Revenue' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {e.transaction_type}
                      </span>
                      <span className="text-[10px] text-slate-400">{e.direction}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {e.entry_date} · {fmtInt(e.quantity)} × ₹{fmtMoney(e.rate)}
                    </p>
                    {e.room_dept && <p className="text-xs text-slate-400 mt-0.5">{e.room_dept}</p>}
                    {e.vendor && <p className="text-xs text-slate-400">Vendor: {e.vendor}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-sm font-bold text-slate-900 tabular-nums">₹{fmtMoney(e.amount)}</span>
                    <button onClick={() => handleDelete(e.id)} className="p-1 text-slate-300 hover:text-red-500 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </main>

      <StickySaveBar onSave={handleSave} saving={saving} label="Save Laundry Entry" />
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{label}</span>
    {children}
  </label>
);
