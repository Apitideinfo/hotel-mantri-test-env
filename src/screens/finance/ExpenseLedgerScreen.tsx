import { useEffect, useState, useMemo } from 'react';
import { BookOpen, Download } from 'lucide-react';
import type { ExpenseEntry, PaymentMode } from '@/lib/types-finance';
import { PAYMENT_MODES } from '@/lib/types-finance';
import { getExpenseEntries, getExpenseCategories } from '@/lib/api-finance';
import type { ExpenseCategory } from '@/lib/types-finance';
import { buildExpenseLedgerPDF } from '@/lib/pdf-finance';
import {
  ScreenHeader, SectionCard, SelectInput, Banner, fmtMoney,
} from '@/components/finance-ui';
import type { HotelSettings } from '@/lib/types';
import { getSettings } from '@/lib/api';

interface ExpenseLedgerScreenProps {
  onBack: () => void;
}

const now = new Date();
const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
const defaultTo = now.toISOString().slice(0, 10);

export const ExpenseLedgerScreen = ({ onBack }: ExpenseLedgerScreenProps) => {
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [filterCat, setFilterCat] = useState('');
  const [filterMode, setFilterMode] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [ents, cats, s] = await Promise.all([
        getExpenseEntries(fromDate, toDate),
        getExpenseCategories(true),
        getSettings(),
      ]);
      setEntries(ents);
      setCategories(cats);
      setSettings(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [fromDate, toDate]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filterCat && e.category_name !== filterCat) return false;
      if (filterMode && e.payment_mode !== filterMode) return false;
      return true;
    });
  }, [entries, filterCat, filterMode]);

  const totals = useMemo(() => {
    let total = 0, cash = 0, bank = 0, upi = 0, credit = 0;
    const catMap = new Map<string, number>();
    for (const e of filtered) {
      const amt = e.amount;
      total += amt;
      if (e.payment_mode === 'Cash') cash += amt;
      else if (e.payment_mode === 'Bank') bank += amt;
      else if (e.payment_mode === 'UPI') upi += amt;
      else if (e.payment_mode === 'Credit') credit += amt;
      catMap.set(e.category_name, (catMap.get(e.category_name) ?? 0) + amt);
    }
    return { total, cash, bank, upi, credit, byCategory: Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]) };
  }, [filtered]);

  const handleExportPDF = async () => {
    if (!settings) return;
    const doc = await buildExpenseLedgerPDF({
      settings, entries: filtered, fromDate, toDate,
    });
    doc.save(`Expense-Ledger-${fromDate}-to-${toDate}.pdf`);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <ScreenHeader title="Expense Ledger" subtitle="View and filter all expenses" onBack={onBack}
        icon={<BookOpen className="w-5 h-5 text-sky-300" />} />

      <main className="px-4 py-4 space-y-4 w-full">
        {error && <Banner kind="error">{error}</Banner>}

        {/* Filters */}
        <SectionCard title="Filters" icon={<BookOpen className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From Date">
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </Field>
            <Field label="To Date" >
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </Field>
          </div>
          <SelectInput label="Expense Head" value={filterCat}
            options={[{ value: '', label: 'All Heads' }, ...categories.map((c) => ({ value: c.name, label: c.name }))]}
            onChange={setFilterCat} />
          <SelectInput label="Payment Mode" value={filterMode}
            options={[{ value: '', label: 'All Modes' }, ...PAYMENT_MODES.map((p) => ({ value: p, label: p }))]}
            onChange={setFilterMode} />
        </SectionCard>

        {/* Totals */}
        <div className="bg-gradient-to-br from-sky-700 to-sky-900 text-white rounded-xl p-4">
          <p className="text-sky-200 text-xs uppercase tracking-wide">Expense Totals</p>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div><p className="text-xs text-sky-200">Total Expenses</p><p className="text-lg font-bold tabular-nums">₹{fmtMoney(totals.total)}</p></div>
            <div><p className="text-xs text-sky-200">Cash</p><p className="text-lg font-bold tabular-nums">₹{fmtMoney(totals.cash)}</p></div>
            <div><p className="text-xs text-sky-200">Bank</p><p className="text-lg font-bold tabular-nums">₹{fmtMoney(totals.bank)}</p></div>
            <div><p className="text-xs text-sky-200">UPI</p><p className="text-lg font-bold tabular-nums">₹{fmtMoney(totals.upi)}</p></div>
            <div><p className="text-xs text-sky-200">Credit</p><p className="text-lg font-bold tabular-nums">₹{fmtMoney(totals.credit)}</p></div>
          </div>
        </div>

        {/* Category summary */}
        {totals.byCategory.length > 0 && (
          <SectionCard title="Category Summary" icon={<BookOpen className="w-4 h-4" />}>
            <div className="space-y-1.5">
              {totals.byCategory.map(([cat, amt]) => (
                <div key={cat} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                  <span className="text-sm text-slate-700">{cat}</span>
                  <span className="text-sm font-bold text-slate-900 tabular-nums">₹{fmtMoney(amt)}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Entries list */}
        <SectionCard title={`Entries (${filtered.length})`} icon={<BookOpen className="w-4 h-4" />}>
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No expenses found for the selected filters.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filtered.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{e.category_name}</span>
                      <span className="text-xs text-slate-400">{e.payment_mode}</span>
                      {!e.is_paid && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">UNPAID</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{e.entry_date}{e.bill_no ? ` · Bill: ${e.bill_no}` : ''}</p>
                    {e.description && <p className="text-xs text-slate-400 mt-0.5 italic truncate">{e.description}</p>}
                  </div>
                  <span className="text-sm font-bold text-slate-900 tabular-nums shrink-0">₹{fmtMoney(e.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Export */}
        <button onClick={handleExportPDF} disabled={!settings || filtered.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-semibold py-3 rounded-xl border border-slate-200 shadow-sm transition">
          <Download className="w-5 h-5 text-sky-600" /> Export PDF
        </button>
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
