import { useEffect, useState } from 'react';
import { ArrowLeft, Wallet, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import type { ExpenseCategory, ExpenseEntry, ExpenseEntryInput, PaymentMode } from '@/lib/types-finance';
import { PAYMENT_MODES } from '@/lib/types-finance';
import {
  getExpenseCategories, getExpenseEntries, saveExpenseEntry, deleteExpenseEntry,
} from '@/lib/api-finance';
import {
  ScreenHeader, SectionCard, Field, NumInput, SelectInput, TextArea, TextInput,
  StickySaveBar, Banner, fmtMoney,
} from '@/components/finance-ui';

interface ExpenseEntryScreenProps {
  onBack: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export const ExpenseEntryScreen = ({ onBack }: ExpenseEntryScreenProps) => {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [entryDate, setEntryDate] = useState(today());
  const [categoryName, setCategoryName] = useState('');
  const [amount, setAmount] = useState(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [description, setDescription] = useState('');
  const [billNo, setBillNo] = useState('');
  const [isPaid, setIsPaid] = useState(true);
  const [paidDate, setPaidDate] = useState(today());

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [cats, ents] = await Promise.all([
        getExpenseCategories(),
        getExpenseEntries(`${today().slice(0, 8)}01`, today()),
      ]);
      setCategories(cats);
      setEntries(ents);
      if (cats.length > 0 && !categoryName) setCategoryName(cats[0].name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    if (!categoryName) { setError('Select an Expense Head.'); return; }
    if (amount <= 0) { setError('Enter a valid amount.'); return; }
    try {
      setSaving(true);
      const cat = categories.find((c) => c.name === categoryName);
      const input: ExpenseEntryInput = {
        entry_date: entryDate,
        category_id: cat?.id ?? null,
        category_name: categoryName,
        amount,
        payment_mode: paymentMode,
        description: description.trim(),
        bill_no: billNo.trim(),
        is_paid: isPaid,
        paid_date: isPaid ? paidDate : null,
      };
      const saved = await saveExpenseEntry(input);
      setEntries((prev) => [saved, ...prev]);
      setDescription('');
      setBillNo('');
      setAmount(0);
      setSuccess(`₹${fmtMoney(amount)} for ${categoryName} saved.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense entry?')) return;
    try {
      await deleteExpenseEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const showOtherField = categoryName === 'Other';

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <ScreenHeader title="Add Expense" subtitle="Record where money was spent" onBack={onBack}
        icon={<Wallet className="w-5 h-5 text-sky-300" />} />

      <main className="px-4 py-4 space-y-4 w-full">
        {error && <Banner kind="error">{error}</Banner>}
        {success && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl p-3">
            <CheckCircle2 className="w-4 h-4" /> {success}
          </div>
        )}

        {/* Quick add form */}
        <SectionCard title="New Expense Entry" icon={<Plus className="w-4 h-4" />}>
          <Field label="Date">
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </Field>

          <Field label="Expense Head">
            <select value={categoryName} onChange={(e) => setCategoryName(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option value="">— Select Head —</option>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </Field>

          {showOtherField && (
            <TextInput label="Custom Description (Other)" value={description}
              onChange={setDescription} placeholder="Describe the expense" />
          )}

          <NumInput label="Amount" prefix="₹" value={amount} onChange={setAmount} />

          <SelectInput label="Payment Mode" value={paymentMode}
            options={PAYMENT_MODES.map((p) => ({ value: p, label: p === 'Credit' ? 'Credit / Pay Later' : p }))}
            onChange={(v) => setPaymentMode(v as PaymentMode)} />

          {!showOtherField && (
            <TextArea label="Description / Remark" value={description} onChange={setDescription}
              placeholder="Optional note" />
          )}

          <TextInput label="Bill / Voucher No. (optional)" value={billNo} onChange={setBillNo} />

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
            Paid now {paymentMode === 'Credit' ? '(uncheck if still pending)' : ''}
          </label>
          {isPaid && (
            <Field label="Paid Date">
              <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </Field>
          )}
        </SectionCard>

        {/* Recent entries */}
        <SectionCard title="Recent Expenses (This Month)" icon={<Wallet className="w-4 h-4" />}>
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No expenses recorded this month yet.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {entries.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{e.category_name}</span>
                      <span className="text-xs text-slate-400">{e.payment_mode}</span>
                      {!e.is_paid && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">UNPAID</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {e.entry_date}{e.bill_no ? ` · Bill: ${e.bill_no}` : ''}
                    </p>
                    {e.description && <p className="text-xs text-slate-400 mt-0.5 italic truncate">{e.description}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-sm font-bold text-slate-900 tabular-nums">₹{fmtMoney(e.amount)}</span>
                    <button onClick={() => handleDelete(e.id)}
                      className="p-1 text-slate-300 hover:text-red-500 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </main>

      <StickySaveBar onSave={handleSave} saving={saving} label="Save Expense" />
    </div>
  );
};
