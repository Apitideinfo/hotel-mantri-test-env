import { useEffect, useState, useCallback } from 'react';
import { Save, Building2, Globe, Shield, Layers, IndianRupee } from 'lucide-react';
import { getSystemSettings, updateSystemSetting } from '../api';
import type { SystemSetting } from '../types';
import { PageHeader, Card, LoadingState, ErrorState, TextInput, SelectInput, TextArea } from '../ui';

export const SystemSettingsScreen = () => {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Editable values
  const [companyInfo, setCompanyInfo] = useState({ name: '', tagline: '' });
  const [defaults, setDefaults] = useState({ currency: 'INR', country: 'India', timezone: 'Asia/Kolkata', trial_days: 14, grace_period: 7, invoice_prefix: 'HM-INV' });
  const [support, setSupport] = useState({ email: '', phone: '' });
  const [security, setSecurity] = useState({ session_timeout_minutes: 30, password_min_length: 8, maintenance_mode: false });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const s = await getSystemSettings();
      setSettings(s);
      const ci = s.find((x) => x.key === 'company_info')?.value as Record<string, unknown> | undefined;
      if (ci) setCompanyInfo({ name: (ci.name as string) ?? '', tagline: (ci.tagline as string) ?? '' });
      const d = s.find((x) => x.key === 'defaults')?.value as Record<string, unknown> | undefined;
      if (d) setDefaults({ currency: (d.currency as string) ?? 'INR', country: (d.country as string) ?? 'India', timezone: (d.timezone as string) ?? 'Asia/Kolkata', trial_days: (d.trial_days as number) ?? 14, grace_period: (d.grace_period as number) ?? 7, invoice_prefix: (d.invoice_prefix as string) ?? 'HM-INV' });
      const sup = s.find((x) => x.key === 'support')?.value as Record<string, unknown> | undefined;
      if (sup) setSupport({ email: (sup.email as string) ?? '', phone: (sup.phone as string) ?? '' });
      const sec = s.find((x) => x.key === 'security')?.value as Record<string, unknown> | undefined;
      if (sec) setSecurity({ session_timeout_minutes: (sec.session_timeout_minutes as number) ?? 30, password_min_length: (sec.password_min_length as number) ?? 8, maintenance_mode: (sec.maintenance_mode as boolean) ?? false });
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setError(null); setSuccess(false);
    try {
      setSaving(true);
      await Promise.all([
        updateSystemSetting('company_info', companyInfo),
        updateSystemSetting('defaults', defaults),
        updateSystemSetting('support', support),
        updateSystemSetting('security', security),
      ]);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (loading) return <LoadingState label="Loading settings…" />;

  void settings;

  return (
    <div className="space-y-4">
      <PageHeader title="System Settings" subtitle="Global SaaS configuration"
        action={<button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold px-4 py-2.5 rounded-xl transition text-sm"><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Settings'}</button>}
      />

      {error && <ErrorState message={error} />}
      {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl p-3">Settings saved successfully.</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Company Info */}
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2"><Building2 className="w-4 h-4" /> Company Information</h3>
          <TextInput label="Company Name" value={companyInfo.name} onChange={(v) => setCompanyInfo({ ...companyInfo, name: v })} />
          <TextInput label="Tagline" value={companyInfo.tagline} onChange={(v) => setCompanyInfo({ ...companyInfo, tagline: v })} />
        </Card>

        {/* Defaults */}
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2"><Globe className="w-4 h-4" /> Defaults</h3>
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Currency" value={defaults.currency} onChange={(v) => setDefaults({ ...defaults, currency: v })} />
            <TextInput label="Country" value={defaults.country} onChange={(v) => setDefaults({ ...defaults, country: v })} />
            <TextInput label="Time Zone" value={defaults.timezone} onChange={(v) => setDefaults({ ...defaults, timezone: v })} />
            <TextInput label="Invoice Prefix" value={defaults.invoice_prefix} onChange={(v) => setDefaults({ ...defaults, invoice_prefix: v })} />
            <TextInput label="Trial Days" value={String(defaults.trial_days)} onChange={(v) => setDefaults({ ...defaults, trial_days: parseInt(v || '0', 10) })} />
            <TextInput label="Grace Period (days)" value={String(defaults.grace_period)} onChange={(v) => setDefaults({ ...defaults, grace_period: parseInt(v || '0', 10) })} />
          </div>
        </Card>

        {/* Support */}
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2"><IndianRupee className="w-4 h-4" /> Support Contact</h3>
          <TextInput label="Support Email" value={support.email} onChange={(v) => setSupport({ ...support, email: v })} />
          <TextInput label="Support Phone" value={support.phone} onChange={(v) => setSupport({ ...support, phone: v })} />
        </Card>

        {/* Security */}
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2"><Shield className="w-4 h-4" /> Security</h3>
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Session Timeout (min)" value={String(security.session_timeout_minutes)} onChange={(v) => setSecurity({ ...security, session_timeout_minutes: parseInt(v || '0', 10) })} />
            <TextInput label="Password Min Length" value={String(security.password_min_length)} onChange={(v) => setSecurity({ ...security, password_min_length: parseInt(v || '0', 10) })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={security.maintenance_mode} onChange={(e) => setSecurity({ ...security, maintenance_mode: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
            Maintenance Mode
          </label>
        </Card>
      </div>

      {/* Default categories read-only */}
      <Card className="p-5">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2 mb-3"><Layers className="w-4 h-4" /> Default Categories & Heads</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div><p className="text-xs text-slate-400 mb-1">Room Categories</p><p className="text-slate-600">Standard, Deluxe, Super Deluxe, Executive, Suite, Family Room</p></div>
          <div><p className="text-xs text-slate-400 mb-1">Revenue Heads</p><p className="text-slate-600">Kitchen, Restaurant, Banquet, Other Income</p></div>
          <div><p className="text-xs text-slate-400 mb-1">Expense Heads</p><p className="text-slate-600">Housekeeping, Maintenance, Salary, Utilities, Misc</p></div>
          <div><p className="text-xs text-slate-400 mb-1">Payment Modes</p><p className="text-slate-600">Cash, Bank, UPI, Card</p></div>
        </div>
        <p className="text-xs text-slate-400 mt-3">These defaults are applied to new hotels during onboarding. Existing hotel-specific settings are not overwritten.</p>
      </Card>
    </div>
  );
};
