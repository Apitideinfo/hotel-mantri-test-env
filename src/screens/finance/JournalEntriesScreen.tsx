import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Loader2, AlertCircle, Activity, ChevronDown, ChevronRight } from 'lucide-react';
import { ScreenHeader, fmtMoney } from '@/components/finance-ui';
import { getJournalEntries, getJournalLines, postJournal, reverseJournal } from '@/lib/api-accounting';
import type { JournalEntry, JournalLine, JournalInput } from '@/lib/types-accounting';
import { getChartOfAccounts } from '@/lib/api-accounting';
import type { ChartOfAccount } from '@/lib/types-accounting';

const today = () => new Date().toISOString().slice(0, 10);

export const JournalEntriesScreen = ({ onBack }: { onBack: () => void }) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lines, setLines] = useState<JournalLine[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<JournalInput>({ business_date: today(), narration: '', lines: [{ account_id: '', account_code: '', account_name: '', debit: 0, credit: 0 }] });
  const [saving, setSaving] = useState(false);
  const [fromDate, setFromDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [toDate, setToDate] = useState(today);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, accts] = await Promise.all([
        getJournalEntries(fromDate, toDate),
        getChartOfAccounts(),
      ]);
      setEntries(data);
      setAccounts(accts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const handleExpand = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    try {
      const l = await getJournalLines(id);
      setLines(l);
    } catch { /* ignore */ }
  };

  const handlePost = async () => {
    setError(null);
    const totalDebit = form.lines.reduce((s, l) => s + Number(l.debit), 0);
    const totalCredit = form.lines.reduce((s, l) => s + Number(l.credit), 0);
    if (totalDebit !== totalCredit) { setError(`Not balanced. Debit: ${totalDebit}, Credit: ${totalCredit}`); return; }
    if (!form.narration.trim()) { setError('Narration is required.'); return; }

    setSaving(true);
    try {
      await postJournal(form);
      setShowForm(false);
      setForm({ business_date: today(), narration: '', lines: [{ account_id: '', account_code: '', account_name: '', debit: 0, credit: 0 }] });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Post failed');
    } finally {
      setSaving(false);
    }
  };

  const handleReverse = async (id: string) => {
    const reason = prompt('Reason for reversal:');
    if (!reason) return;
    try {
      await reverseJournal(id, reason, 'user');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reversal failed');
    }
  };

  const updateLine = (idx: number, field: string, value: string | number) => {
    const newLines = [...form.lines];
    if (field === 'account_id') {
      const acct = accounts.find((a) => a.id === value);
      newLines[idx] = { ...newLines[idx], account_id: value as string, account_code: acct?.account_code ?? '', account_name: acct?.account_name ?? '' };
    } else {
      newLines[idx] = { ...newLines[idx], [field]: value };
    }
    setForm({ ...form, lines: newLines });
  };

  const addLine = () => setForm({ ...form, lines: [...form.lines, { account_id: '', account_code: '', account_name: '', debit: 0, credit: 0 }] });
  const removeLine = (idx: number) => setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) });

  const totalDebit = form.lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = form.lines.reduce((s, l) => s + Number(l.credit), 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <ScreenHeader title="Journal Entries" subtitle="Double-entry accounting" onBack={onBack}
        icon={<Activity className="w-5 h-5 text-sky-300" />} />

      <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
        <button onClick={() => setShowForm(true)} className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl">
          <Plus className="w-4 h-4" /> New Journal
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
          <h3 className="text-sm font-bold text-slate-800">New Journal Entry</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Business Date</label>
              <input type="date" value={form.business_date} onChange={(e) => setForm({ ...form, business_date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Narration</label>
              <input type="text" value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
          </div>
          <div className="space-y-2">
            {form.lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select value={line.account_id} onChange={(e) => updateLine(idx, 'account_id', e.target.value)}
                  className="col-span-5 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white">
                  <option value="">Select account…</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
                </select>
                <input type="number" placeholder="Debit" value={line.debit || ''} onChange={(e) => updateLine(idx, 'debit', Number(e.target.value))}
                  className="col-span-3 px-2 py-1.5 text-xs border border-slate-200 rounded-lg text-right" />
                <input type="number" placeholder="Credit" value={line.credit || ''} onChange={(e) => updateLine(idx, 'credit', Number(e.target.value))}
                  className="col-span-3 px-2 py-1.5 text-xs border border-slate-200 rounded-lg text-right" />
                <button onClick={() => removeLine(idx)} className="col-span-1 p-1 text-slate-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={addLine} className="text-xs font-semibold text-sky-600 hover:text-sky-700"><Plus className="w-3.5 h-3.5 inline mr-1" />Add Line</button>
            <div className="ml-auto flex items-center gap-4 text-xs">
              <span className="font-semibold text-slate-600">Debit: <span className={totalDebit === totalCredit ? 'text-emerald-600' : 'text-red-600'}>{fmtMoney(totalDebit)}</span></span>
              <span className="font-semibold text-slate-600">Credit: <span className={totalDebit === totalCredit ? 'text-emerald-600' : 'text-red-600'}>{fmtMoney(totalCredit)}</span></span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handlePost} disabled={saving} className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
              {saving ? 'Posting…' : 'Post Journal'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-200 rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…</div>
      ) : (
        <div className="px-4 pb-4 space-y-2">
          {entries.length === 0 ? (
            <div className="text-center py-16 text-slate-400"><Activity className="w-12 h-12 mx-auto mb-3 opacity-40" /><p className="text-sm">No journal entries.</p></div>
          ) : entries.map((je) => (
            <div key={je.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <button onClick={() => handleExpand(je.id)} className="w-full p-3 text-left hover:bg-slate-50 flex items-center gap-3">
                {expanded === je.id ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">{je.journal_number}</p>
                  <p className="text-xs text-slate-400">{je.narration}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  je.status === 'posted' ? 'bg-emerald-100 text-emerald-700' :
                  je.status === 'reversed' ? 'bg-orange-100 text-orange-700' :
                  je.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                }`}>{je.status}</span>
                <span className="text-xs text-slate-400">{je.business_date}</span>
              </button>
              {expanded === je.id && (
                <div className="border-t border-slate-100 bg-slate-50 p-3">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-[10px] font-bold text-slate-400 uppercase"><th className="pb-1">Account</th><th className="pb-1 text-right">Debit</th><th className="pb-1 text-right">Credit</th></tr></thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className="py-1.5 font-semibold text-slate-700">{l.account_code} — {l.account_name}</td>
                          <td className="py-1.5 text-right tabular-nums">{l.debit > 0 ? fmtMoney(l.debit) : '—'}</td>
                          <td className="py-1.5 text-right tabular-nums">{l.credit > 0 ? fmtMoney(l.credit) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {je.status === 'posted' && (
                    <button onClick={() => handleReverse(je.id)} className="mt-2 text-xs font-semibold text-red-600 hover:text-red-700">
                      Reverse this journal
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
