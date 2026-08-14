import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, X, Plus, Wallet, BarChart3, History, Settings, Lock } from 'lucide-react';
import { ScreenHeader, fmtMoney } from '@/components/finance-ui';
import {
  getOpeningBalances, saveOpeningBalance, postOpeningBalances,
  getBudgets, saveBudget,
  previewHistoricalPosting, runHistoricalPosting,
  getPostingRules, savePostingRule, deletePostingRule,
  getChartOfAccounts,
} from '@/lib/api-accounting';
import type { OpeningBalance, Budget, PostingRule, ChartOfAccount, MappingType } from '@/lib/types-accounting';

const today = () => new Date().toISOString().slice(0, 10);

// ── Opening Balances ──
export const OpeningBalancesScreen = ({ onBack }: { onBack: () => void }) => {
  const [balances, setBalances] = useState<OpeningBalance[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ account_id: '', effective_date: today(), debit: 0, credit: 0, narration: '' });
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, a] = await Promise.all([getOpeningBalances(), getChartOfAccounts()]);
      setBalances(b); setAccounts(a);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.account_id) { setError('Account is required.'); return; }
    try { await saveOpeningBalance({ ...form, entered_by: 'user', status: 'draft', approved_by: null }); setForm({ account_id: '', effective_date: today(), debit: 0, credit: 0, narration: '' }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
  };

  const handlePost = async () => {
    setPosting(true);
    try { await postOpeningBalances('user'); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Post failed'); } finally { setPosting(false); }
  };

  const totalDebit = balances.filter((b) => b.status === 'draft').reduce((s, b) => s + b.debit, 0);
  const totalCredit = balances.filter((b) => b.status === 'draft').reduce((s, b) => s + b.credit, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <ScreenHeader title="Opening Balances" subtitle="Set up account openings" onBack={onBack} icon={<Wallet className="w-5 h-5 text-sky-300" />} />
      {error && <div className="mx-4 my-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}<button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button></div>}
      <div className="px-4 py-3 bg-white rounded-2xl border border-slate-200 shadow-sm m-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-800">Add Opening Balance</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 mb-1 block">Account</label>
            <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
              <option value="">Select…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Debit</label><input type="number" value={form.debit || ''} onChange={(e) => setForm({ ...form, debit: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
          <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Credit</label><input type="number" value={form.credit || ''} onChange={(e) => setForm({ ...form, credit: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
        </div>
        <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Narration</label><input type="text" value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
        <button onClick={handleAdd} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl"><Plus className="w-4 h-4" /> Add</button>
      </div>

      {balances.length > 0 && (
        <div className="px-4 pb-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b text-left text-[10px] font-bold text-slate-400 uppercase"><th className="px-4 py-2">Account</th><th className="px-4 py-2">Date</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th><th className="px-4 py-2">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {balances.map((b) => { const acct = accounts.find((a) => a.id === b.account_id); return (
                  <tr key={b.id} className="hover:bg-slate-50"><td className="px-4 py-2 font-semibold text-slate-700">{acct?.account_name ?? 'Unknown'}</td><td className="px-4 py-2 text-slate-600">{b.effective_date}</td><td className="px-4 py-2 text-right tabular-nums">{b.debit > 0 ? fmtMoney(b.debit) : '—'}</td><td className="px-4 py-2 text-right tabular-nums">{b.credit > 0 ? fmtMoney(b.credit) : '—'}</td><td className="px-4 py-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${b.status === 'posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{b.status}</span></td></tr>
                ); })}
              </tbody>
              <tfoot><tr className="bg-slate-50 border-t-2 font-bold"><td colSpan={2} className="px-4 py-2 text-slate-700">Draft Total</td><td className="px-4 py-2 text-right tabular-nums">{fmtMoney(totalDebit)}</td><td className="px-4 py-2 text-right tabular-nums">{fmtMoney(totalCredit)}</td><td className="px-4 py-2">{totalDebit === totalCredit ? '✓ Balanced' : '⚠ Imbalanced'}</td></tr></tfoot>
            </table>
          </div>
          {balances.some((b) => b.status === 'draft') && totalDebit === totalCredit && (
            <button onClick={handlePost} disabled={posting} className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50"><Lock className="w-4 h-4 inline mr-1.5" />{posting ? 'Posting…' : 'Post Opening Balances'}</button>
          )}
        </div>
      )}
    </div>
  );
};

// ── Budget vs Actual ──
export const BudgetScreen = ({ onBack }: { onBack: () => void }) => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState(today().slice(0, 7));
  const [form, setForm] = useState({ category: 'room_revenue', amount: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try { setBudgets(await getBudgets(monthKey)); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setLoading(false); }
  }, [monthKey]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    try { await saveBudget(monthKey, form.category, form.amount); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
  };

  const categories = ['room_revenue', 'fb_revenue', 'occupancy', 'arr', 'expenses', 'profit'];

  return (
    <div className="min-h-screen bg-slate-50">
      <ScreenHeader title="Budget vs Actual" subtitle="Monthly budget planning" onBack={onBack} icon={<BarChart3 className="w-5 h-5 text-sky-300" />} />
      <div className="px-4 py-3 flex items-center gap-3">
        <input type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
      </div>
      {error && <div className="mx-4 mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}<button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button></div>}
      <div className="mx-4 mb-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
              {categories.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Amount</label><input type="number" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
        </div>
        <button onClick={handleSave} className="px-3 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl">Set Budget</button>
      </div>
      {loading ? <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…</div> : (
        <div className="px-4 pb-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b text-left text-[10px] font-bold text-slate-400 uppercase"><th className="px-4 py-2">Category</th><th className="px-4 py-2 text-right">Budget</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {budgets.length === 0 ? <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-400">No budgets set for this month.</td></tr> : budgets.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50"><td className="px-4 py-2 font-semibold text-slate-700 capitalize">{b.category.replace('_', ' ')}</td><td className="px-4 py-2 text-right tabular-nums font-bold">{fmtMoney(b.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Historical Posting Utility ──
export const HistoricalPostingScreen = ({ onBack }: { onBack: () => void }) => {
  const [preview, setPreview] = useState<import('@/lib/api-accounting').HistoricalPostingPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [toDate, setToDate] = useState(today());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ posted: number; skipped: number; errors: number } | null>(null);

  const handlePreview = async () => {
    setLoading(true); setError(null); setResult(null);
    try { setPreview(await previewHistoricalPosting(fromDate, toDate)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setLoading(false); }
  };

  const handleRun = async () => {
    if (!confirm(`Post historical transactions from ${fromDate} to ${toDate}? This will create journal entries for existing transactions.`)) return;
    setRunning(true); setError(null);
    try { const r = await runHistoricalPosting(fromDate, toDate, 'user'); setResult(r); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setRunning(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <ScreenHeader title="Historical Posting" subtitle="Generate journals from existing transactions" onBack={onBack} icon={<History className="w-5 h-5 text-sky-300" />} />
      <div className="px-4 py-3 flex items-center gap-3">
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
        <button onClick={handlePreview} disabled={loading} className="ml-auto px-3 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl disabled:opacity-50">{loading ? 'Previewing…' : 'Preview'}</button>
      </div>
      {error && <div className="mx-4 mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}<button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button></div>}
      {preview && (
        <div className="px-4 pb-4 space-y-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Preview Results</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center"><p className="text-2xl font-bold text-slate-700">{preview.roomPayments}</p><p className="text-[10px] text-slate-400 uppercase">Room Payments</p></div>
              <div className="text-center"><p className="text-2xl font-bold text-slate-700">{preview.expenses}</p><p className="text-[10px] text-slate-400 uppercase">Expenses</p></div>
              <div className="text-center"><p className="text-2xl font-bold text-emerald-600">{preview.alreadyPosted}</p><p className="text-[10px] text-slate-400 uppercase">Already Posted</p></div>
              <div className="text-center"><p className="text-2xl font-bold text-amber-600">{preview.toPost}</p><p className="text-[10px] text-slate-400 uppercase">To Post</p></div>
            </div>
            {preview.toPost > 0 && <button onClick={handleRun} disabled={running} className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50">{running ? 'Posting…' : `Post ${preview.toPost} Transactions`}</button>}
          </div>
          {result && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h3 className="text-sm font-bold text-slate-800 mb-2">Posting Complete</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center"><p className="text-xl font-bold text-emerald-600">{result.posted}</p><p className="text-[10px] text-slate-400 uppercase">Posted</p></div>
                <div className="text-center"><p className="text-xl font-bold text-slate-500">{result.skipped}</p><p className="text-[10px] text-slate-400 uppercase">Skipped</p></div>
                <div className="text-center"><p className="text-xl font-bold text-red-600">{result.errors}</p><p className="text-[10px] text-slate-400 uppercase">Errors</p></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Posting Rules ──
export const PostingRulesScreen = ({ onBack }: { onBack: () => void }) => {
  const [rules, setRules] = useState<PostingRule[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ mapping_type: 'payment_mode' as MappingType, source_value: '', debit_account_id: '', credit_account_id: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const [r, a] = await Promise.all([getPostingRules(), getChartOfAccounts()]); setRules(r); setAccounts(a); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.source_value.trim()) { setError('Source value is required.'); return; }
    try { await savePostingRule({ ...form, is_active: true }); setForm({ mapping_type: 'payment_mode', source_value: '', debit_account_id: '', credit_account_id: '' }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
  };

  const mappingTypes: { value: MappingType; label: string }[] = [
    { value: 'revenue_head', label: 'Revenue Head' }, { value: 'expense_head', label: 'Expense Head' },
    { value: 'payment_mode', label: 'Payment Mode' }, { value: 'booking_source', label: 'Booking Source' },
    { value: 'gst_type', label: 'GST Type' }, { value: 'refund', label: 'Refund' },
    { value: 'discount', label: 'Discount' }, { value: 'commission', label: 'Commission' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <ScreenHeader title="Posting Rules" subtitle="Auto-posting account mapping" onBack={onBack} icon={<Settings className="w-5 h-5 text-sky-300" />} />
      {error && <div className="mx-4 my-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}<button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button></div>}
      <div className="mx-4 mb-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-800">Add Posting Rule</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Mapping Type</label>
            <select value={form.mapping_type} onChange={(e) => setForm({ ...form, mapping_type: e.target.value as MappingType })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
              {mappingTypes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Source Value</label><input type="text" value={form.source_value} onChange={(e) => setForm({ ...form, source_value: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
          <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Debit Account</label>
            <select value={form.debit_account_id} onChange={(e) => setForm({ ...form, debit_account_id: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
              <option value="">Select…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Credit Account</label>
            <select value={form.credit_account_id} onChange={(e) => setForm({ ...form, credit_account_id: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
              <option value="">Select…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
            </select>
          </div>
        </div>
        <button onClick={handleSave} className="px-3 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl"><Plus className="w-4 h-4 inline mr-1" />Add Rule</button>
      </div>
      {loading ? <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…</div> : (
        <div className="px-4 pb-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b text-left text-[10px] font-bold text-slate-400 uppercase"><th className="px-4 py-2">Type</th><th className="px-4 py-2">Source</th><th className="px-4 py-2">Debit Account</th><th className="px-4 py-2">Credit Account</th><th className="px-4 py-2"></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rules.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No posting rules configured.</td></tr> : rules.map((r) => {
                  const dr = accounts.find((a) => a.id === r.debit_account_id); const cr = accounts.find((a) => a.id === r.credit_account_id);
                  return <tr key={r.id} className="hover:bg-slate-50"><td className="px-4 py-2 text-slate-600">{r.mapping_type.replace('_', ' ')}</td><td className="px-4 py-2 font-semibold text-slate-700">{r.source_value}</td><td className="px-4 py-2 text-slate-600">{dr?.account_name ?? '—'}</td><td className="px-4 py-2 text-slate-600">{cr?.account_name ?? '—'}</td><td className="px-4 py-2"><button onClick={() => deletePostingRule(r.id).then(load)} className="p-1 text-slate-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button></td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
