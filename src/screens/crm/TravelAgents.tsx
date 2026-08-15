import { useState, useEffect, useCallback } from 'react';
import {
  Plane, Plus, Phone, Mail, X, Loader2, AlertCircle, Edit3, Trash2,
  User, Percent, Save,
} from 'lucide-react';
import type { TravelAgent } from '@/lib/types-crm';
import { getTravelAgents, saveTravelAgent, deleteTravelAgent } from '@/lib/api-crm';

export const TravelAgents = ({ onBack }: { onBack: () => void }) => {
  const [agents, setAgents] = useState<TravelAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<TravelAgent>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTravelAgents();
      setAgents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.agent_name?.trim()) { setError('Agent name is required.'); return; }
    setSaving(true);
    try {
      await saveTravelAgent(form, editingId ?? undefined);
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

  const emptyForm: Partial<TravelAgent> = { agent_name: '', contact_person: '', phone: '', email: '', commission_rate: 0 };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
            <X className="w-5 h-5 rotate-45" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-brand-navy-800">Travel Agents</h1>
            <p className="text-xs text-slate-400">{agents.length} agents</p>
          </div>
        </div>
        <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl">
          <Plus className="w-4 h-4" /> Add Agent
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
          <h3 className="text-sm font-bold text-slate-800">{editingId ? 'Edit Agent' : 'New Travel Agent'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <FormField label="Agent Name *" value={form.agent_name ?? ''} onChange={(v) => setForm({ ...form, agent_name: v })} />
            <FormField label="Contact Person" value={form.contact_person ?? ''} onChange={(v) => setForm({ ...form, contact_person: v })} />
            <FormField label="Phone" value={form.phone ?? ''} onChange={(v) => setForm({ ...form, phone: v })} />
            <FormField label="Email" value={form.email ?? ''} onChange={(v) => setForm({ ...form, email: v })} />
            <FormField label="Commission Rate (%)" value={(form.commission_rate ?? 0).toString()} onChange={(v) => setForm({ ...form, commission_rate: Number(v) || 0 })} type="number" />
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
      ) : agents.length === 0 && !showForm ? (
        <div className="text-center py-16 text-slate-400">
          <Plane className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No travel agents yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((a) => (
            <div key={a.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 shrink-0">
                    <Plane className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-brand-navy-800 truncate">{a.agent_name}</p>
                    {a.commission_rate > 0 && <p className="text-[10px] text-slate-400 flex items-center gap-0.5"><Percent className="w-2.5 h-2.5" /> {a.commission_rate}% commission</p>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditingId(a.id); setForm(a); setShowForm(true); }}
                    className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded"><Edit3 className="w-3.5 h-3.5" /></button>
                  <button onClick={async () => { await deleteTravelAgent(a.id); await load(); }}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="space-y-1 text-xs text-slate-600">
                {a.contact_person && <p className="flex items-center gap-1.5"><User className="w-3 h-3 text-slate-400" /> {a.contact_person}</p>}
                {a.phone && <p className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400" /> {a.phone}</p>}
                {a.email && <p className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-slate-400" /> {a.email}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const FormField = ({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) => (
  <div>
    <label className="text-xs font-semibold text-slate-500 mb-1 block">{label}</label>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
  </div>
);
