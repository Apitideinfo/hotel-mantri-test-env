import { useState, useEffect, useCallback } from 'react';
import {
  Building2, Plus, Phone, Mail, X, Loader2, AlertCircle, Edit3, Trash2,
  IndianRupee, CreditCard, User, Save,
} from 'lucide-react';
import type { CorporateProfile } from '@/lib/types-crm';
import { getCorporateProfiles, saveCorporateProfile, deleteCorporateProfile } from '@/lib/api-crm';

export const CorporateGuests = ({ onBack }: { onBack: () => void }) => {
  const [profiles, setProfiles] = useState<CorporateProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<CorporateProfile>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCorporateProfiles();
      setProfiles(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.company_name?.trim()) { setError('Company name is required.'); return; }
    setSaving(true);
    try {
      await saveCorporateProfile(form, editingId ?? undefined);
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

  const emptyForm: Partial<CorporateProfile> = { company_name: '', gst: '', billing_address: '', credit_limit: 0, corporate_rate: 0, contact_person: '', contact_phone: '', contact_email: '' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
            <X className="w-5 h-5 rotate-45" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-brand-navy-800">Corporate Profiles</h1>
            <p className="text-xs text-slate-400">{profiles.length} companies</p>
          </div>
        </div>
        <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl">
          <Plus className="w-4 h-4" /> Add Company
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
          <h3 className="text-sm font-bold text-slate-800">{editingId ? 'Edit Company' : 'New Corporate Profile'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <FormField label="Company Name *" value={form.company_name ?? ''} onChange={(v) => setForm({ ...form, company_name: v })} />
            <FormField label="GST Number" value={form.gst ?? ''} onChange={(v) => setForm({ ...form, gst: v })} />
            <FormField label="Contact Person" value={form.contact_person ?? ''} onChange={(v) => setForm({ ...form, contact_person: v })} />
            <FormField label="Contact Phone" value={form.contact_phone ?? ''} onChange={(v) => setForm({ ...form, contact_phone: v })} />
            <FormField label="Contact Email" value={form.contact_email ?? ''} onChange={(v) => setForm({ ...form, contact_email: v })} />
            <FormField label="Credit Limit (₹)" value={(form.credit_limit ?? 0).toString()} onChange={(v) => setForm({ ...form, credit_limit: Number(v) || 0 })} type="number" />
            <FormField label="Corporate Rate (₹)" value={(form.corporate_rate ?? 0).toString()} onChange={(v) => setForm({ ...form, corporate_rate: Number(v) || 0 })} type="number" />
            <div className="sm:col-span-2 lg:col-span-3">
              <FormField label="Billing Address" value={form.billing_address ?? ''} onChange={(v) => setForm({ ...form, billing_address: v })} />
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
      ) : profiles.length === 0 && !showForm ? (
        <div className="text-center py-16 text-slate-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No corporate profiles yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {profiles.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-brand-navy-800 truncate">{p.company_name}</p>
                    {p.gst && <p className="text-[10px] text-slate-400">GST: {p.gst}</p>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditingId(p.id); setForm(p); setShowForm(true); }}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit3 className="w-3.5 h-3.5" /></button>
                  <button onClick={async () => { await deleteCorporateProfile(p.id); await load(); }}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="space-y-1 text-xs text-slate-600">
                {p.contact_person && <p className="flex items-center gap-1.5"><User className="w-3 h-3 text-slate-400" /> {p.contact_person}</p>}
                {p.contact_phone && <p className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400" /> {p.contact_phone}</p>}
                {p.contact_email && <p className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-slate-400" /> {p.contact_email}</p>}
                {p.credit_limit > 0 && <p className="flex items-center gap-1.5"><CreditCard className="w-3 h-3 text-slate-400" /> Credit Limit: ₹{p.credit_limit.toLocaleString('en-IN')}</p>}
                {p.corporate_rate > 0 && <p className="flex items-center gap-1.5"><IndianRupee className="w-3 h-3 text-slate-400" /> Corporate Rate: ₹{p.corporate_rate.toLocaleString('en-IN')}</p>}
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
