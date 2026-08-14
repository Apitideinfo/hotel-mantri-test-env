import { useEffect, useState } from 'react';
import { Zap, Plus, Pencil, Check, X } from 'lucide-react';
import type { ElectricityReading, ElectricityInput, PaymentMode, BillStatus } from '@/lib/types-finance';
import { PAYMENT_MODES, BILL_STATUSES } from '@/lib/types-finance';
import { getElectricityReadings, saveElectricityReading } from '@/lib/api-finance';
import {
  ScreenHeader, SectionCard, NumInput, SelectInput, DateInput, TextArea,
  Banner, fmtMoney, fmtInt, monthKeyFrom, monthLabel,
} from '@/components/finance-ui';

interface ElectricityScreenProps {
  onBack: () => void;
}

const now = new Date();
const defaultMonth = monthKeyFrom(now.getFullYear(), now.getMonth() + 1);

const emptyForm: ElectricityInput = {
  month_key: defaultMonth,
  prev_reading: 0, curr_reading: 0,
  bill_amount: 0, bill_date: null, due_date: null,
  payment_date: null, payment_mode: 'Cash', status: 'Pending', remarks: '',
};

export const ElectricityScreen = ({ onBack }: ElectricityScreenProps) => {
  const [readings, setReadings] = useState<ElectricityReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ElectricityInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getElectricityReadings();
      setReadings(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const units = form.curr_reading - form.prev_reading;

  const handleSave = async () => {
    setError(null);
    if (!form.month_key) { setError('Select a month.'); return; }
    try {
      setSaving(true);
      const saved = await saveElectricityReading(form, editingId ?? undefined);
      setReadings((prev) => {
        const idx = prev.findIndex((r) => r.id === saved.id);
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

  const handleEdit = (r: ElectricityReading) => {
    setEditingId(r.id);
    setForm({
      month_key: r.month_key, prev_reading: r.prev_reading, curr_reading: r.curr_reading,
      bill_amount: r.bill_amount, bill_date: r.bill_date, due_date: r.due_date,
      payment_date: r.payment_date, payment_mode: r.payment_mode, status: r.status, remarks: r.remarks,
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setForm(emptyForm);
    setShowForm(false);
    setEditingId(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <ScreenHeader title="Electricity" subtitle="Track meter readings and bills" onBack={onBack}
        icon={<Zap className="w-5 h-5 text-sky-300" />} />

      <main className="px-4 py-4 space-y-4 w-full">
        {error && <Banner kind="error">{error}</Banner>}

        {!showForm ? (
          <button onClick={() => { setForm({ ...emptyForm, month_key: defaultMonth }); setShowForm(true); setEditingId(null); }}
            className="w-full flex items-center justify-center gap-2 bg-sky-700 hover:bg-sky-800 text-white font-semibold py-3.5 rounded-xl shadow-sm transition">
            <Plus className="w-5 h-5" /> Add Electricity Reading
          </button>
        ) : (
          <SectionCard title={editingId ? 'Edit Reading' : 'New Electricity Reading'} icon={<Zap className="w-4 h-4" />}>
            <Field label="Month">
              <input type="month" value={form.month_key} onChange={(e) => setForm({ ...form, month_key: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <NumInput label="Previous Reading" value={form.prev_reading} onChange={(v) => setForm({ ...form, prev_reading: v })} allowDecimal={false} />
              <NumInput label="Current Reading" value={form.curr_reading} onChange={(v) => setForm({ ...form, curr_reading: v })} allowDecimal={false} />
            </div>
            <div className="bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 text-sm text-sky-800">
              Units Consumed: <span className="font-bold tabular-nums">{fmtInt(units)}</span>
            </div>
            <NumInput label="Bill Amount" prefix="₹" value={form.bill_amount} onChange={(v) => setForm({ ...form, bill_amount: v })} />
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

        {/* Readings list */}
        <SectionCard title="Electricity History" icon={<Zap className="w-4 h-4" />}>
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
          ) : readings.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No readings recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {readings.map((r) => (
                <div key={r.id} className="border border-slate-200 rounded-lg p-3 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{monthLabel(r.month_key)}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {r.prev_reading} → {r.curr_reading} = <span className="font-semibold text-sky-700">{fmtInt(r.units_consumed)} units</span>
                      </p>
                      <p className="text-sm font-bold text-slate-900 mt-1 tabular-nums">₹{fmtMoney(r.bill_amount)}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          r.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                          r.status === 'PartiallyPaid' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>{r.status}</span>
                        {r.payment_date && <span className="text-xs text-slate-400">Paid: {r.payment_date}</span>}
                      </div>
                      {r.remarks && <p className="text-xs text-slate-400 mt-1 italic">{r.remarks}</p>}
                    </div>
                    <button onClick={() => handleEdit(r)} className="p-1.5 text-slate-400 hover:text-sky-600 transition">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
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
