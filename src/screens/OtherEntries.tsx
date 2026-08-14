import { useEffect, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import type { HotelSettings, OtherDailyEntriesInput } from '@/lib/types';
import { getSettings, getOtherEntries, saveOtherEntries } from '@/lib/api';
import { emptyOtherEntries } from '@/lib/types';
import { NumberField, SectionCard } from '@/components/FormFields';

interface OtherEntriesProps {
  date: string;
  onBack: () => void;
  onSaved: () => void;
}

export const OtherEntries = ({ date: initialDate, onBack, onSaved }: OtherEntriesProps) => {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [entries, setEntries] = useState<OtherDailyEntriesInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = async (d: string) => {
    try {
      const s = await getSettings();
      setSettings(s);
      const e = await getOtherEntries(d);
      setEntries(e ?? emptyOtherEntries(d));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  };

  useEffect(() => { load(initialDate); /* eslint-disable-next-line */ }, []);

  const set = <K extends keyof OtherDailyEntriesInput>(key: K, v: number) => {
    setEntries((prev) => prev ? { ...prev, [key]: v } : prev);
  };

  const handleSave = async () => {
    if (!entries) return;
    setError(null);
    setSaved(false);
    try {
      setSaving(true);
      await saveOtherEntries({ ...entries, report_date: selectedDate });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDateChange = (newDate: string) => {
    if (!newDate) return;
    setSelectedDate(newDate);
    load(newDate);
  };

  if (!entries) return <div className="p-6 text-center text-slate-400 text-sm">Loading…</div>;

  const [y, m, d] = selectedDate.split('-');
  const displayDate = `${d}/${m}/${y}`;

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <header className="sticky top-0 z-10 bg-sky-800 text-white px-4 py-3 flex items-center gap-3 shadow">
        <button onClick={onBack} className="p-1.5 -ml-1.5 hover:bg-sky-700 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-semibold leading-tight">Other Daily Entries</h1>
          <p className="text-sky-200 text-xs">{displayDate}</p>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 w-full">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
        {saved && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg p-3">Saved. MIS updated automatically.</div>}

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <label className="block">
            <span className="block text-sm font-medium text-slate-700 mb-1">Report Date</span>
            <input type="date" value={selectedDate} max={initialDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
            <span className="block text-xs text-slate-400 mt-1">Room revenue, cash, and bank come from the Room Chart. Enter only the items below.</span>
          </label>
        </div>

        <SectionCard title="Other Revenue" accent="bg-amber-50">
          <NumberField label="Kitchen" value={entries.kitchen} prefix="₹" onChange={(v) => set('kitchen', v)} />
          <NumberField label="Other Revenue" value={entries.other_income} prefix="₹" onChange={(v) => set('other_income', v)} />
        </SectionCard>

        <SectionCard title="Expenses" accent="bg-rose-50">
          <NumberField label="Housekeeping Supply" value={entries.housekeeping_supply} prefix="₹" onChange={(v) => set('housekeeping_supply', v)} />
          <NumberField label="Other Expense" value={entries.other_expense} prefix="₹" onChange={(v) => set('other_expense', v)} />
        </SectionCard>

        <SectionCard title="Cash Adjustments" accent="bg-slate-100">
          <NumberField label="Salary Advance" value={entries.salary_advance} prefix="₹" onChange={(v) => set('salary_advance', v)} />
          <NumberField label="Maintenance Bill Total AMT" value={entries.maintenance_bill} prefix="₹" onChange={(v) => set('maintenance_bill', v)} />
          <NumberField label="Cash Handover MD Sir" value={entries.cash_handover_md} prefix="₹" onChange={(v) => set('cash_handover_md', v)} />
          <NumberField label="Bank Cash Deposit" value={entries.bank_cash_deposit} prefix="₹" onChange={(v) => set('bank_cash_deposit', v)} />
        </SectionCard>
      </main>

      <div className="fixed bottom-0 inset-x-0 w-full bg-white border-t border-slate-200 p-3 flex gap-2.5">
        <button onClick={handleSave} disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl shadow-sm transition">
          <Save className="w-5 h-5" /> {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onSaved}
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 px-4 rounded-xl shadow-sm transition">
          Done
        </button>
      </div>
    </div>
  );
};
