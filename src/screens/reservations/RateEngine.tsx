import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Plus, X, Loader2, AlertCircle, Edit3, Trash2, Save,
  IndianRupee, Calendar, Tag,
} from 'lucide-react';
import type { RatePlan, RatePlanType, RatePlanInput } from '@/lib/types-reservations';
import { RATE_PLAN_TYPES } from '@/lib/types-reservations';
import { getRatePlans, saveRatePlan, deleteRatePlan } from '@/lib/api-reservations';

const PLAN_TYPE_COLORS: Record<RatePlanType, string> = {
  'Base': 'bg-slate-100 text-slate-600',
  'Weekend': 'bg-blue-100 text-blue-700',
  'Season': 'bg-emerald-100 text-emerald-700',
  'Corporate': 'bg-violet-100 text-violet-700',
  'OTA': 'bg-amber-100 text-amber-700',
  'Walk-in': 'bg-teal-100 text-teal-700',
  'Special': 'bg-rose-100 text-rose-700',
  'Package': 'bg-cyan-100 text-cyan-700',
};

const fmtMoney = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

export const RateEngine = ({ onBack }: { onBack: () => void }) => {
  const [plans, setPlans] = useState<RatePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<RatePlan>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRatePlans();
      setPlans(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.plan_name?.trim()) { setError('Plan name is required.'); return; }
    setSaving(true);
    try {
      const input: RatePlanInput = {
        plan_name: form.plan_name,
        plan_type: form.plan_type ?? 'Base',
        base_rate: form.base_rate ?? 0,
        weekend_rate: form.weekend_rate ?? 0,
        season_rate: form.season_rate ?? 0,
        start_date: form.start_date ?? null,
        end_date: form.end_date ?? null,
        is_active: form.is_active ?? true,
      };
      await saveRatePlan(input, editingId ?? undefined);
      await load();
      setShowForm(false);
      setEditingId(null);
      setForm({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const emptyForm: Partial<RatePlan> = { plan_name: '', plan_type: 'Base', base_rate: 0, weekend_rate: 0, season_rate: 0, is_active: true };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-brand-navy-800">Rate Engine</h1>
            <p className="text-xs text-slate-400">{plans.length} rate plans</p>
          </div>
        </div>
        <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl">
          <Plus className="w-4 h-4" /> Add Rate Plan
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-800">{editingId ? 'Edit Rate Plan' : 'New Rate Plan'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Plan Name *</label>
              <input type="text" value={form.plan_name ?? ''} onChange={(e) => setForm({ ...form, plan_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Plan Type</label>
              <select value={form.plan_type ?? 'Base'} onChange={(e) => setForm({ ...form, plan_type: e.target.value as RatePlanType })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                {RATE_PLAN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Base Rate (₹)</label>
              <input type="number" value={form.base_rate ?? 0} onChange={(e) => setForm({ ...form, base_rate: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Weekend Rate (₹)</label>
              <input type="number" value={form.weekend_rate ?? 0} onChange={(e) => setForm({ ...form, weekend_rate: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Season Rate (₹)</label>
              <input type="number" value={form.season_rate ?? 0} onChange={(e) => setForm({ ...form, season_rate: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Season Start</label>
              <input type="date" value={form.start_date ?? ''} onChange={(e) => setForm({ ...form, start_date: e.target.value || null })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Season End</label>
              <input type="date" value={form.end_date ?? ''} onChange={(e) => setForm({ ...form, end_date: e.target.value || null })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-200 rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      ) : plans.length === 0 && !showForm ? (
        <div className="text-center py-16 text-slate-400">
          <Tag className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No rate plans yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {plans.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-bold text-brand-navy-800">{p.plan_name}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${PLAN_TYPE_COLORS[p.plan_type]}`}>
                    {p.plan_type}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditingId(p.id); setForm(p); setShowForm(true); }}
                    className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded"><Edit3 className="w-3.5 h-3.5" /></button>
                  <button onClick={async () => { await deleteRatePlan(p.id); await load(); }}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="space-y-1 text-xs text-slate-600">
                <p className="flex items-center gap-1.5"><IndianRupee className="w-3 h-3 text-slate-400" /> Base: {fmtMoney(p.base_rate)}</p>
                {p.weekend_rate > 0 && <p className="flex items-center gap-1.5"><IndianRupee className="w-3 h-3 text-slate-400" /> Weekend: {fmtMoney(p.weekend_rate)}</p>}
                {p.season_rate > 0 && <p className="flex items-center gap-1.5"><IndianRupee className="w-3 h-3 text-slate-400" /> Season: {fmtMoney(p.season_rate)}</p>}
                {p.start_date && p.end_date && (
                  <p className="flex items-center gap-1.5"><Calendar className="w-3 h-3 text-slate-400" /> {new Date(p.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} — {new Date(p.end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                )}
                <p className={`text-[10px] font-semibold ${p.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {p.is_active ? 'Active' : 'Inactive'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
