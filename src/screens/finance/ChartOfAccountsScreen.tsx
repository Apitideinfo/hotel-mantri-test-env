import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Edit3, Trash2, Loader2, AlertCircle, Wallet } from 'lucide-react';
import { ScreenHeader } from '@/components/finance-ui';
import {
  getChartOfAccounts, saveChartOfAccount, toggleChartOfAccount, deleteChartOfAccount, seedDefaultAccounts,
} from '@/lib/api-accounting';
import type { ChartOfAccount, AccountGroup, ChartOfAccountInput } from '@/lib/types-accounting';
import { ACCOUNT_GROUP_COLORS } from '@/lib/types-accounting';

const GROUPS: AccountGroup[] = ['ASSETS', 'LIABILITIES', 'INCOME', 'EXPENSES', 'EQUITY'];

export const ChartOfAccountsScreen = ({ onBack }: { onBack: () => void }) => {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ChartOfAccountInput>({ account_code: '', account_name: '', account_group: 'ASSETS', account_subgroup: '', is_active: true, sort_order: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let data = await getChartOfAccounts(true);
      if (data.length === 0) {
        await seedDefaultAccounts();
        data = await getChartOfAccounts(true);
      }
      setAccounts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.account_code.trim() || !form.account_name.trim()) { setError('Code and name are required.'); return; }
    try {
      await saveChartOfAccount(form, editingId ?? undefined);
      await load();
      setShowForm(false);
      setEditingId(null);
      setForm({ account_code: '', account_name: '', account_group: 'ASSETS', account_subgroup: '', is_active: true, sort_order: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteChartOfAccount(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const grouped = GROUPS.map((g) => ({ group: g, items: accounts.filter((a) => a.account_group === g) }));

  return (
    <div className="min-h-screen bg-slate-50">
      <ScreenHeader title="Chart of Accounts" subtitle="Configurable account master" onBack={onBack}
        icon={<Wallet className="w-5 h-5 text-sky-300" />} />

      <div className="px-4 py-3 flex items-center justify-between">
        <p className="text-xs text-slate-400">{accounts.length} accounts</p>
        <button onClick={() => { setEditingId(null); setForm({ account_code: '', account_name: '', account_group: 'ASSETS', account_subgroup: '', is_active: true, sort_order: 0 }); setShowForm(true); }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl">
          <Plus className="w-4 h-4" /> Add Account
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Code *</label>
              <input type="text" value={form.account_code} onChange={(e) => setForm({ ...form, account_code: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Name *</label>
              <input type="text" value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Group</label>
              <select value={form.account_group} onChange={(e) => setForm({ ...form, account_group: e.target.value as AccountGroup })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Subgroup</label>
              <input type="text" value={form.account_subgroup} onChange={(e) => setForm({ ...form, account_subgroup: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 rounded-xl text-sm">Save</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-200 rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…</div>
      ) : (
        <div className="px-4 pb-4 space-y-4">
          {grouped.map(({ group, items }) => items.length > 0 && (
            <div key={group} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-700">{group}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ACCOUNT_GROUP_COLORS[group]}`}>{items.length}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-bold text-slate-400 uppercase border-b">
                    <th className="px-4 py-2">Code</th><th className="px-4 py-2">Name</th><th className="px-4 py-2">Subgroup</th><th className="px-4 py-2">Status</th><th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono font-bold text-slate-600">{a.account_code}</td>
                      <td className="px-4 py-2 font-semibold text-slate-800">{a.account_name}</td>
                      <td className="px-4 py-2 text-slate-500">{a.account_subgroup || '—'}</td>
                      <td className="px-4 py-2">
                        <button onClick={() => toggleChartOfAccount(a.id, !a.is_active).then(load)}
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${a.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                          {a.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => { setEditingId(a.id); setForm({ account_code: a.account_code, account_name: a.account_name, account_group: a.account_group, account_subgroup: a.account_subgroup, is_active: a.is_active, sort_order: a.sort_order }); setShowForm(true); }}
                            className="p-1 text-slate-400 hover:text-sky-600"><Edit3 className="w-3.5 h-3.5" /></button>
                          {!a.is_system && (
                            <button onClick={() => handleDelete(a.id)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
