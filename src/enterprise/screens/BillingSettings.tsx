import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Save, Building2, Palette, Hash, Percent, CreditCard, FileText,
  Upload, Monitor, Smartphone, Printer, Download, CheckCircle2, Loader2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  getBillingSettings, updateBillingSettings, previewNextInvoiceNumber,
} from '../api';
import type { BillingSettings as BillingSettingsType, Invoice, InvoiceItem } from '../types';
import { Card, Badge, TextInput, TextArea, SelectInput } from '../ui';
import { InvoicePreview } from './InvoicePreview';

type Tab = 'company' | 'branding' | 'numbering' | 'gst' | 'payment' | 'terms';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'company', label: 'Company Details', icon: <Building2 className="w-4 h-4" /> },
  { key: 'branding', label: 'Branding', icon: <Palette className="w-4 h-4" /> },
  { key: 'numbering', label: 'Invoice Numbering', icon: <Hash className="w-4 h-4" /> },
  { key: 'gst', label: 'GST & Tax', icon: <Percent className="w-4 h-4" /> },
  { key: 'payment', label: 'Payment Details', icon: <CreditCard className="w-4 h-4" /> },
  { key: 'terms', label: 'Terms & Footer', icon: <FileText className="w-4 h-4" /> },
];

const DEFAULT_SETTINGS: BillingSettingsType = {
  company_details: { brand_name: 'Hotel Mantri', legal_name: '', tagline: '', address: '', city: '', state: '', pin_code: '', country: 'India', gstin: '', pan: '', cin: '', support_email: '', support_phone: '', website: '' },
  branding: { logo_url: '', invoice_logo_url: '', watermark_url: '', signature_url: '', seal_url: '', primary_color: '#0f172a', secondary_color: '#1e3a5f', accent_color: '#d4af37', invoice_theme: 'navy_gold', logo_size: 'medium', watermark_opacity: 0.05 },
  invoice_numbering: { prefix: 'HM', fy_format: 'YYYY-YY', starting_number: 1, padding_length: 6, next_preview: '' },
  gst: { default_gst_rate: 18, cgst_rate: 9, sgst_rate: 9, igst_rate: 18, hsn_sac: '9983', place_of_supply: '', tax_inclusive: false, reverse_charge: false, round_off: true },
  payment: { bank_name: '', account_holder: '', account_number: '', ifsc: '', branch: '', upi_id: '', qr_code_url: '', payment_link: '', payment_instructions: '' },
  terms: { invoice_notes: '', terms_conditions: '', late_payment_terms: '', refund_policy: '', jurisdiction: '', footer_message: '', thank_you_message: '' },
};

const uploadFile = async (file: File, folder: string): Promise<string> => {
  const ext = file.name.split('.').pop();
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from('hotel-assets').upload(fileName, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('hotel-assets').getPublicUrl(fileName);
  return data.publicUrl;
};

export const BillingSettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<BillingSettingsType>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<Tab>('company');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile' | 'print'>('desktop');
  const [nextNumber, setNextNumber] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string>('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const s = await getBillingSettings();
      setSettings({ ...DEFAULT_SETTINGS, ...s });
      const num = await previewNextInvoiceNumber();
      setNextNumber(num);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setError(null); setSuccess(false);
    try {
      setSaving(true);
      const sections: Array<'company_details' | 'branding' | 'invoice_numbering' | 'gst' | 'payment' | 'terms'> = ['company_details', 'branding', 'invoice_numbering', 'gst', 'payment', 'terms'];
      await Promise.all(sections.map((sec) => updateBillingSettings(sec, settings[sec] as Record<string, unknown>)));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = (target: string) => {
    uploadTarget.current = target;
    fileInputRef.current?.click();
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget.current) return;
    try {
      setError(null);
      const url = await uploadFile(file, 'billing-assets');
      const target = uploadTarget.current;
      if (target.startsWith('branding.')) {
        const field = target.split('.')[1];
        setSettings({ ...settings, branding: { ...settings.branding, [field]: url } });
      } else if (target.startsWith('payment.')) {
        const field = target.split('.')[1];
        setSettings({ ...settings, payment: { ...settings.payment, [field]: url } });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
    uploadTarget.current = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Sample invoice for preview
  const sampleInvoice: Invoice = {
    id: 'preview', invoice_number: nextNumber || 'HM/2026-27/000001',
    hotel_id: '', plan_id: null, status: 'Issued',
    invoice_date: new Date().toISOString(), due_date: new Date(Date.now() + 15 * 86400000).toISOString(),
    billing_period: 'Monthly', billing_cycle: 'Monthly',
    number_of_rooms: 22, number_of_users: 3,
    enabled_modules: ['dashboard', 'daily_entry', 'room_chart', 'finance', 'gst', 'reports', 'mtd_ytd', 'whatsapp_reports', 'multi_user', 'support'],
    subscription_start: new Date().toISOString(),
    subscription_end: new Date(Date.now() + 30 * 86400000).toISOString(),
    subtotal: 12000, discount_amount: 0, taxable_amount: 12000,
    cgst_amount: 540, sgst_amount: 540, igst_amount: 0,
    round_off: 0, total_amount: 13080, amount_paid: 0, balance_due: 13080,
    is_interstate: false, place_of_supply: '', notes: '',
    snapshot: null, issued_at: null, issued_by: null, paid_at: null,
    cancelled_at: null, cancelled_by: null, cancel_reason: '',
    created_by: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };

  const sampleItems: InvoiceItem[] = [
    { id: '1', invoice_id: 'preview', sr_no: 1, description: 'Hotel Mantri Premium Plan — Monthly Subscription', hsn_sac: settings.gst.hsn_sac, quantity: 1, rate: 10000, discount: 0, taxable_value: 10000, gst_rate: settings.gst.default_gst_rate, cgst_amount: 450, sgst_amount: 450, igst_amount: 0, amount: 10900, item_type: 'subscription', created_at: '' },
    { id: '2', invoice_id: 'preview', sr_no: 2, description: 'Additional User Licenses (2 users)', hsn_sac: settings.gst.hsn_sac, quantity: 2, rate: 1000, discount: 0, taxable_value: 2000, gst_rate: settings.gst.default_gst_rate, cgst_amount: 90, sgst_amount: 90, igst_amount: 0, amount: 2180, item_type: 'user_license', created_at: '' },
  ];

  const previewScale = previewMode === 'mobile' ? 0.45 : previewMode === 'print' ? 0.75 : 1;

  if (loading) return <div className="flex items-center justify-center py-12 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading billing settings…</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Billing & Invoice Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">Configure company details, branding, GST, payment, and terms for all invoices</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold px-4 py-2.5 rounded-xl transition text-sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save All Settings'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{error}</div>}
      {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl p-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Settings saved successfully.</div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ── Left: Settings tabs ── */}
        <div className="space-y-4">
          {/* Tab bar */}
          <div className="flex gap-1 overflow-x-auto bg-slate-100 rounded-xl p-1">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition ${
                  tab === t.key ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileSelected} className="hidden" />

          {/* Company Details */}
          {tab === 'company' && (
            <Card className="p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2"><Building2 className="w-4 h-4" /> Company Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextInput label="Brand Name" value={settings.company_details.brand_name} onChange={(v) => setSettings({ ...settings, company_details: { ...settings.company_details, brand_name: v } })} />
                <TextInput label="Legal Company Name" value={settings.company_details.legal_name} onChange={(v) => setSettings({ ...settings, company_details: { ...settings.company_details, legal_name: v } })} />
              </div>
              <TextInput label="Tagline" value={settings.company_details.tagline} onChange={(v) => setSettings({ ...settings, company_details: { ...settings.company_details, tagline: v } })} />
              <TextArea label="Registered Address" value={settings.company_details.address} onChange={(v) => setSettings({ ...settings, company_details: { ...settings.company_details, address: v } })} rows={2} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <TextInput label="City" value={settings.company_details.city} onChange={(v) => setSettings({ ...settings, company_details: { ...settings.company_details, city: v } })} />
                <TextInput label="State" value={settings.company_details.state} onChange={(v) => setSettings({ ...settings, company_details: { ...settings.company_details, state: v } })} />
                <TextInput label="PIN Code" value={settings.company_details.pin_code} onChange={(v) => setSettings({ ...settings, company_details: { ...settings.company_details, pin_code: v } })} />
                <TextInput label="Country" value={settings.company_details.country} onChange={(v) => setSettings({ ...settings, company_details: { ...settings.company_details, country: v } })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TextInput label="GSTIN" value={settings.company_details.gstin} onChange={(v) => setSettings({ ...settings, company_details: { ...settings.company_details, gstin: v } })} />
                <TextInput label="PAN" value={settings.company_details.pan} onChange={(v) => setSettings({ ...settings, company_details: { ...settings.company_details, pan: v } })} />
                <TextInput label="CIN" value={settings.company_details.cin} onChange={(v) => setSettings({ ...settings, company_details: { ...settings.company_details, cin: v } })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TextInput label="Support Email" value={settings.company_details.support_email} onChange={(v) => setSettings({ ...settings, company_details: { ...settings.company_details, support_email: v } })} />
                <TextInput label="Support Phone" value={settings.company_details.support_phone} onChange={(v) => setSettings({ ...settings, company_details: { ...settings.company_details, support_phone: v } })} />
                <TextInput label="Website" value={settings.company_details.website} onChange={(v) => setSettings({ ...settings, company_details: { ...settings.company_details, website: v } })} />
              </div>
            </Card>
          )}

          {/* Branding */}
          {tab === 'branding' && (
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2"><Palette className="w-4 h-4" /> Branding</h3>
              {/* Upload fields */}
              {[
                { key: 'logo_url', label: 'Company Logo' },
                { key: 'invoice_logo_url', label: 'Invoice Logo Variant' },
                { key: 'watermark_url', label: 'Watermark' },
                { key: 'signature_url', label: 'Digital Signature' },
                { key: 'seal_url', label: 'Company Seal' },
              ].map((f) => (
                <div key={f.key} className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50 overflow-hidden shrink-0">
                    {(settings.branding as unknown as Record<string, string>)[f.key] ? (
                      <img src={(settings.branding as unknown as Record<string, string>)[f.key]} alt={f.label} className="w-full h-full object-contain" />
                    ) : (
                      <Upload className="w-5 h-5 text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-700">{f.label}</p>
                    <button onClick={() => handleUpload(`branding.${f.key}`)}
                      className="text-xs text-sky-600 font-semibold hover:underline mt-1">Upload Image</button>
                  </div>
                </div>
              ))}
              {/* Colors */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'primary_color', label: 'Primary Color' },
                  { key: 'secondary_color', label: 'Secondary Color' },
                  { key: 'accent_color', label: 'Accent Color' },
                ].map((c) => (
                  <label key={c.key} className="block">
                    <span className="block text-sm font-medium text-slate-700 mb-1">{c.label}</span>
                    <div className="flex items-center gap-2">
                      <input type="color" value={(settings.branding as unknown as Record<string, string>)[c.key]}
                        onChange={(e) => setSettings({ ...settings, branding: { ...settings.branding, [c.key]: e.target.value } })}
                        className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" />
                      <input type="text" value={(settings.branding as unknown as Record<string, string>)[c.key]}
                        onChange={(e) => setSettings({ ...settings, branding: { ...settings.branding, [c.key]: e.target.value } })}
                        className="flex-1 px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-mono" />
                    </div>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SelectInput label="Invoice Theme" value={settings.branding.invoice_theme}
                  onChange={(v) => setSettings({ ...settings, branding: { ...settings.branding, invoice_theme: v } })}
                  options={[
                    { value: 'navy_gold', label: 'Navy & Gold (Premium)' },
                    { value: 'royal_blue', label: 'Royal Blue' },
                    { value: 'emerald', label: 'Emerald Green' },
                    { value: 'charcoal', label: 'Charcoal' },
                  ]} />
                <SelectInput label="Logo Size" value={settings.branding.logo_size}
                  onChange={(v) => setSettings({ ...settings, branding: { ...settings.branding, logo_size: v } })}
                  options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]} />
              </div>
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 mb-1">Watermark Opacity: {Math.round(settings.branding.watermark_opacity * 100)}%</span>
                <input type="range" min="0" max="0.3" step="0.01" value={settings.branding.watermark_opacity}
                  onChange={(e) => setSettings({ ...settings, branding: { ...settings.branding, watermark_opacity: parseFloat(e.target.value) } })}
                  className="w-full" />
              </label>
            </Card>
          )}

          {/* Invoice Numbering */}
          {tab === 'numbering' && (
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2"><Hash className="w-4 h-4" /> Invoice Numbering</h3>
              <div className="grid grid-cols-2 gap-3">
                <TextInput label="Invoice Prefix" value={settings.invoice_numbering.prefix}
                  onChange={(v) => setSettings({ ...settings, invoice_numbering: { ...settings.invoice_numbering, prefix: v } })} />
                <TextInput label="Starting Number" type="number" value={String(settings.invoice_numbering.starting_number)}
                  onChange={(v) => setSettings({ ...settings, invoice_numbering: { ...settings.invoice_numbering, starting_number: parseInt(v || '1', 10) } })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SelectInput label="Financial Year Format" value={settings.invoice_numbering.fy_format}
                  onChange={(v) => setSettings({ ...settings, invoice_numbering: { ...settings.invoice_numbering, fy_format: v } })}
                  options={[
                    { value: 'YYYY-YY', label: '2026-27' },
                    { value: 'YY-YY', label: '26-27' },
                    { value: 'YYYY', label: '2026' },
                  ]} />
                <SelectInput label="Padding Length" value={String(settings.invoice_numbering.padding_length)}
                  onChange={(v) => setSettings({ ...settings, invoice_numbering: { ...settings.invoice_numbering, padding_length: parseInt(v, 10) } })}
                  options={[{ value: '4', label: '4 digits (0001)' }, { value: '5', label: '5 digits (00001)' }, { value: '6', label: '6 digits (000001)' }]} />
              </div>
              {/* Preview */}
              <div className="bg-slate-900 text-emerald-400 font-mono text-lg px-4 py-3 rounded-xl text-center">
                {nextNumber || 'HM/2026-27/000001'}
              </div>
              <p className="text-xs text-slate-400">Format: PREFIX/FY/SEQUENCE — Invoice numbers are generated server-side and guaranteed unique.</p>
            </Card>
          )}

          {/* GST & Tax */}
          {tab === 'gst' && (
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2"><Percent className="w-4 h-4" /> GST & Tax Configuration</h3>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="block text-sm font-medium text-slate-700 mb-1">Default GST Rate (%)</span>
                  <input type="number" value={String(settings.gst.default_gst_rate)} onChange={(e) => setSettings({ ...settings, gst: { ...settings.gst, default_gst_rate: parseFloat(e.target.value || '0') } })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></label>
                <TextInput label="HSN/SAC Code" value={settings.gst.hsn_sac} onChange={(v) => setSettings({ ...settings, gst: { ...settings.gst, hsn_sac: v } })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="block"><span className="block text-sm font-medium text-slate-700 mb-1">CGST Rate (%)</span>
                  <input type="number" value={String(settings.gst.cgst_rate)} onChange={(e) => setSettings({ ...settings, gst: { ...settings.gst, cgst_rate: parseFloat(e.target.value || '0') } })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></label>
                <label className="block"><span className="block text-sm font-medium text-slate-700 mb-1">SGST Rate (%)</span>
                  <input type="number" value={String(settings.gst.sgst_rate)} onChange={(e) => setSettings({ ...settings, gst: { ...settings.gst, sgst_rate: parseFloat(e.target.value || '0') } })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></label>
                <label className="block"><span className="block text-sm font-medium text-slate-700 mb-1">IGST Rate (%)</span>
                  <input type="number" value={String(settings.gst.igst_rate)} onChange={(e) => setSettings({ ...settings, gst: { ...settings.gst, igst_rate: parseFloat(e.target.value || '0') } })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></label>
              </div>
              <TextInput label="Place of Supply" value={settings.gst.place_of_supply} onChange={(v) => setSettings({ ...settings, gst: { ...settings.gst, place_of_supply: v } })} />
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={settings.gst.tax_inclusive} onChange={(e) => setSettings({ ...settings, gst: { ...settings.gst, tax_inclusive: e.target.checked } })} className="w-4 h-4 rounded border-slate-300 text-sky-600" /> Tax Inclusive Pricing</label>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={settings.gst.reverse_charge} onChange={(e) => setSettings({ ...settings, gst: { ...settings.gst, reverse_charge: e.target.checked } })} className="w-4 h-4 rounded border-slate-300 text-sky-600" /> Reverse Charge Mechanism</label>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={settings.gst.round_off} onChange={(e) => setSettings({ ...settings, gst: { ...settings.gst, round_off: e.target.checked } })} className="w-4 h-4 rounded border-slate-300 text-sky-600" /> Round Off Total Amount</label>
              </div>
            </Card>
          )}

          {/* Payment Details */}
          {tab === 'payment' && (
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2"><CreditCard className="w-4 h-4" /> Payment Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <TextInput label="Bank Name" value={settings.payment.bank_name} onChange={(v) => setSettings({ ...settings, payment: { ...settings.payment, bank_name: v } })} />
                <TextInput label="Account Holder" value={settings.payment.account_holder} onChange={(v) => setSettings({ ...settings, payment: { ...settings.payment, account_holder: v } })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextInput label="Account Number" value={settings.payment.account_number} onChange={(v) => setSettings({ ...settings, payment: { ...settings.payment, account_number: v } })} />
                <TextInput label="IFSC Code" value={settings.payment.ifsc} onChange={(v) => setSettings({ ...settings, payment: { ...settings.payment, ifsc: v } })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextInput label="Branch" value={settings.payment.branch} onChange={(v) => setSettings({ ...settings, payment: { ...settings.payment, branch: v } })} />
                <TextInput label="UPI ID" value={settings.payment.upi_id} onChange={(v) => setSettings({ ...settings, payment: { ...settings.payment, upi_id: v } })} />
              </div>
              {/* QR Code upload */}
              <div className="flex items-center gap-3">
                <div className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50 overflow-hidden shrink-0">
                  {settings.payment.qr_code_url ? <img src={settings.payment.qr_code_url} alt="QR" className="w-full h-full object-contain" /> : <Upload className="w-5 h-5 text-slate-300" />}
                </div>
                <div><p className="text-sm font-medium text-slate-700">Payment QR Code</p><button onClick={() => handleUpload('payment.qr_code_url')} className="text-xs text-sky-600 font-semibold hover:underline mt-1">Upload QR Code Image</button></div>
              </div>
              <TextInput label="Payment Gateway Link" value={settings.payment.payment_link} onChange={(v) => setSettings({ ...settings, payment: { ...settings.payment, payment_link: v } })} />
              <TextArea label="Payment Instructions" value={settings.payment.payment_instructions} onChange={(v) => setSettings({ ...settings, payment: { ...settings.payment, payment_instructions: v } })} rows={2} />
            </Card>
          )}

          {/* Terms & Footer */}
          {tab === 'terms' && (
            <Card className="p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2"><FileText className="w-4 h-4" /> Terms & Footer</h3>
              <TextArea label="Invoice Notes" value={settings.terms.invoice_notes} onChange={(v) => setSettings({ ...settings, terms: { ...settings.terms, invoice_notes: v } })} rows={2} />
              <TextArea label="Terms & Conditions" value={settings.terms.terms_conditions} onChange={(v) => setSettings({ ...settings, terms: { ...settings.terms, terms_conditions: v } })} rows={4} />
              <TextArea label="Late Payment Terms" value={settings.terms.late_payment_terms} onChange={(v) => setSettings({ ...settings, terms: { ...settings.terms, late_payment_terms: v } })} rows={2} />
              <TextArea label="Refund Policy" value={settings.terms.refund_policy} onChange={(v) => setSettings({ ...settings, terms: { ...settings.terms, refund_policy: v } })} rows={2} />
              <TextInput label="Jurisdiction" value={settings.terms.jurisdiction} onChange={(v) => setSettings({ ...settings, terms: { ...settings.terms, jurisdiction: v } })} />
              <TextInput label="Footer Message" value={settings.terms.footer_message} onChange={(v) => setSettings({ ...settings, terms: { ...settings.terms, footer_message: v } })} />
              <TextInput label="Thank You Message" value={settings.terms.thank_you_message} onChange={(v) => setSettings({ ...settings, terms: { ...settings.terms, thank_you_message: v } })} />
            </Card>
          )}
        </div>

        {/* ── Right: Live Preview ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Live Invoice Preview</h3>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              <button onClick={() => setPreviewMode('desktop')} className={`p-1.5 rounded ${previewMode === 'desktop' ? 'bg-white shadow-sm' : 'text-slate-400'}`}><Monitor className="w-4 h-4" /></button>
              <button onClick={() => setPreviewMode('mobile')} className={`p-1.5 rounded ${previewMode === 'mobile' ? 'bg-white shadow-sm' : 'text-slate-400'}`}><Smartphone className="w-4 h-4" /></button>
              <button onClick={() => setPreviewMode('print')} className={`p-1.5 rounded ${previewMode === 'print' ? 'bg-white shadow-sm' : 'text-slate-400'}`}><Printer className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="bg-slate-100 rounded-2xl p-4 overflow-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
            <div className="flex justify-center">
              <InvoicePreview
                ref={previewRef}
                invoice={sampleInvoice}
                items={sampleItems}
                settings={settings}
                hotelName="Hotel Gopal Devbhumi Dwarka"
                hotelAddress="Dwarka, Gujarat"
                hotelCity="Dwarka"
                hotelState="Gujarat"
                hotelPropertyCode="HMGDDW"
                hotelAdminEmail="owner@hotelgopal.com"
                hotelMobile="+91 98765 43210"
                hotelOwnerName="Gopal Patel"
                planName="Premium Plan"
                preview
                scale={previewScale}
              />
            </div>
          </div>
          <p className="text-xs text-slate-400 text-center">Preview updates instantly as you edit settings. Click "Save All Settings" to persist changes.</p>
        </div>
      </div>
    </div>
  );
};
