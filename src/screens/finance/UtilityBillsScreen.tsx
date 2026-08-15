import { useEffect, useState } from 'react';
import { Droplets, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import type { UtilityBill, UtilityBillInput, PaymentMode, BillStatus, UtilityBillType } from '@/lib/types-finance';
import { PAYMENT_MODES, BILL_STATUSES, UTILITY_BILL_TYPES } from '@/lib/types-finance';
import { getUtilityBills, saveUtilityBill, deleteUtilityBill } from '@/lib/api-finance';
import {
  ScreenHeader, SectionCard, NumInput, SelectInput, DateInput, TextInput, TextArea,
  Banner, fmtMoney,
} from '@/components/finance-ui';

interface UtilityBillsScreenProps {
  onBack: () => void;
}

const emptyForm: UtilityBillInput = {
  bill_type: 'Water', vendor: '', bill_date: null, due_date: null,
  amount: 0, payment_date: null, payment_mode: 'Cash', status: 'Pending', remarks: '',
};

export const UtilityBillsScreen = ({ onBack }: UtilityBillsScreenProps) => {
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<UtilityBillInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getUtilityBills();
      setBills(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const handleSave = async () => {
    setError(null);
    if (form.amount <= 0) { setError('Enter a valid amount.'); return; }
    try {
      setSaving(true);
      const saved = await saveUtilityBill(form, editingId ?? undefined);
      setBills((prev) => {
        const idx = prev.findIndex((b) => b.id === saved.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
        return [saved, ...prev];
      });
      setForm(emptyForm);
      setShowForm(false);
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (b: UtilityBill) => {
    setEditingId(b.id);
    setForm({
      bill_type: b.bill_type, vendor: b.vendor, bill_date: b.bill_date, due_date: b.due_date,
      amount: b.amount, payment_date: b.payment_date, payment_mode: b.payment_mode,
      status: b.status, remarks: b.remarks,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this bill?')) return;
    try {
      await deleteUtilityBill(id);
      setBills((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const handleCancel = () => {
    setForm(emptyForm);
    setShowForm(false);
    setEditingId(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <ScreenHeader title="Utility Bills" subtitle="Water · Internet · Gas · Other" onBack={onBack}
        icon={<Droplets className="w-5 h-5 text-sky-300" />} />

      <main className="px-4 py-4 space-y-4 w-full">
        {error && <Banner kind="error">{error}</Banner>}

        {!showForm ? (
          <button onClick={() => { setForm(emptyForm); setShowForm(true); setEditingId(null); }}
            className="w-full flex items-center justify-center gap-2 bg-sky-700 hover:bg-sky-800 text-white font-semibold py-3.5 rounded-xl shadow-sm transition">
            <Plus className="w-5 h-5" /> Add Utility Bill
          </button>
        ) : (
          <SectionCard title={editingId ? 'Edit Bill' : 'New Utility Bill'} icon={<Droplets className="w-4 h-4" />}>
            <SelectInput label="Bill Type" value={form.bill_type}
              options={[...UTILITY_BILL_TYPES]}
              onChange={(v) => setForm({ ...form, bill_type: v as UtilityBillType })} />
            <TextInput label="Vendor" value={form.vendor} onChange={(v) => setForm({ ...form, vendor: v })} placeholder="Vendor / Provider" />
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
                <DateInput label="Payment Date" value={form.payment_date ?? ''} onChange={(v) => setForm({ ...form, payment_date: v || null })} />
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
        <SectionCard title="All Bills" icon={<Droplets className="w-4 h-4" />}>
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
          ) : bills.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No bills recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {bills.map((b) => (
                <div key={b.id} className="flex items-start justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{b.bill_type}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        b.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                        b.status === 'PartiallyPaid' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>{b.status}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {b.vendor || '—'}{b.bill_date ? ` · ${b.bill_date}` : ''}
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
