import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Plus, Trash2, Save, FileText, Loader2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  getEnterpriseHotel, getEnterpriseHotels, getPlans, getHotelFeatures, createInvoice,
  getBillingSettings, issueInvoice, getInvoices,
} from '../api';
import type { EnterpriseHotel, SubscriptionPlan, HotelFeature, BillingSettings, Invoice } from '../types';
import { MODULE_KEYS, MODULE_LABELS } from '../types';
import { hasPermission } from '../permissions';
import { Card, Badge, LoadingState, ErrorState, TextInput, SelectInput, NumInput, fmtMoney } from '../ui';

interface Props {
  hotelId: string;
  onBack: () => void;
  onCreated: (invoiceId: string) => void;
}

interface LineItem {
  description: string;
  hsn_sac: string;
  quantity: number;
  rate: number;
  discount: number;
  gst_rate: number;
  item_type: string;
}

export const InvoiceCreateScreen = ({ hotelId, onBack, onCreated }: Props) => {
  const { companyRole } = useAuth();
  const canWrite = hasPermission(companyRole, 'invoices.write');
  const canIssue = hasPermission(companyRole, 'invoices.issue');

  const [hotel, setHotel] = useState<EnterpriseHotel | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [features, setFeatures] = useState<HotelFeature[]>([]);
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);

  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [billingPeriod, setBillingPeriod] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  const [allHotels, setAllHotels] = useState<EnterpriseHotel[]>([]);

  const load = useCallback(async () => {
    if (!hotelId) {
      try {
        setLoading(true);
        const [hotels, s] = await Promise.all([getEnterpriseHotels(), getBillingSettings()]);
        setAllHotels(hotels.filter((h) => !h.archived_at));
        setSettings(s);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
      return;
    }
    try {
      setLoading(true);
      const [h, p, f, s] = await Promise.all([
        getEnterpriseHotel(hotelId),
        getPlans(),
        getHotelFeatures(hotelId),
        getBillingSettings(),
      ]);
      setHotel(h);
      setPlans(p.filter((x) => x.is_active));
      setFeatures(f);
      setSettings(s);

      const isInterstate = (s.company_details.state || '').trim().toLowerCase() !== (h?.state || '').trim().toLowerCase();
      const gstRate = s.gst.default_gst_rate;

      const plan = h ? p.find((x) => x.id === h.plan_id) : undefined;
      if (plan) {
        setSelectedPlanId(plan.id);
        setBillingCycle(plan.billing_period === 'yearly' ? 'yearly' : 'monthly');
        const price = plan.billing_period === 'yearly' ? plan.yearly_price : plan.price;
        setLineItems([{
          description: `${plan.name} — ${plan.billing_period === 'yearly' ? 'Yearly' : 'Monthly'} Subscription`,
          hsn_sac: s.gst.hsn_sac,
          quantity: 1,
          rate: price,
          discount: 0,
          gst_rate: gstRate,
          item_type: 'subscription',
        }]);
      } else {
        setLineItems([{
          description: 'Subscription — Monthly',
          hsn_sac: s.gst.hsn_sac,
          quantity: 1,
          rate: 0,
          discount: 0,
          gst_rate: gstRate,
          item_type: 'subscription',
        }]);
      }

      const today = new Date();
      const periodLabel = billingCycle === 'yearly'
        ? `${today.getFullYear()} Annual`
        : `${today.toLocaleString('en-US', { month: 'short' })} ${today.getFullYear()}`;
      setBillingPeriod(periodLabel);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [hotelId]);

  useEffect(() => { load(); }, [load]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const isInterstate = settings ? (settings.company_details.state || '').trim().toLowerCase() !== (hotel?.state || '').trim().toLowerCase() : false;

  const updateItem = (idx: number, patch: Partial<LineItem>) =>
    setLineItems(lineItems.map((item, i) => i === idx ? { ...item, ...patch } : item));
  const addItem = () => setLineItems([...lineItems, {
    description: '', hsn_sac: settings?.gst.hsn_sac ?? '', quantity: 1, rate: 0, discount: 0,
    gst_rate: settings?.gst.default_gst_rate ?? 18, item_type: 'addon',
  }]);
  const removeItem = (idx: number) => setLineItems(lineItems.filter((_, i) => i !== idx));

  const handlePlanChange = (planId: string) => {
    setSelectedPlanId(planId);
    const plan = plans.find((p) => p.id === planId);
    if (plan) {
      const price = plan.billing_period === 'yearly' ? plan.yearly_price : plan.price;
      setBillingCycle(plan.billing_period === 'yearly' ? 'yearly' : 'monthly');
      setLineItems((prev) => {
        const updated = [...prev];
        if (updated.length > 0) {
          updated[0] = {
            ...updated[0],
            description: `${plan.name} — ${plan.billing_period === 'yearly' ? 'Yearly' : 'Monthly'} Subscription`,
            rate: price,
          };
        }
        return updated;
      });
    }
  };

  // ── Calculations ──
  const calc = () => {
    let subtotal = 0, totalDiscount = 0, totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
    lineItems.forEach((item) => {
      const lineTotal = item.quantity * item.rate;
      const taxable = lineTotal - item.discount;
      const tax = (taxable * item.gst_rate) / 100;
      subtotal += lineTotal;
      totalDiscount += item.discount;
      totalTaxable += taxable;
      if (isInterstate) { totalIgst += tax; } else { totalCgst += tax / 2; totalSgst += tax / 2; }
    });
    let total = totalTaxable + totalCgst + totalSgst + totalIgst;
    let roundOff = 0;
    if (settings?.gst.round_off) { const r = Math.round(total); roundOff = r - total; total = r; }
    return { subtotal, totalDiscount, totalTaxable, totalCgst, totalSgst, totalIgst, roundOff, total };
  };

  const totals = calc();

  const amountInWords = (amount: number): string => {
    if (amount === 0) return 'Zero Rupees Only';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const helper = (n: number): string => {
      if (n === 0) return '';
      if (n < 20) return ones[n] + ' ';
      if (n < 100) return tens[Math.floor(n / 10)] + ' ' + ones[n % 10] + ' ';
      if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred ' + helper(n % 100);
      if (n < 100000) return helper(Math.floor(n / 1000)) + 'Thousand ' + helper(n % 1000);
      if (n < 10000000) return helper(Math.floor(n / 100000)) + 'Lakh ' + helper(n % 100000);
      return helper(Math.floor(n / 10000000)) + 'Crore ' + helper(n % 10000000);
    };
    const rupees = Math.floor(amount);
    const paise = Math.round((amount - rupees) * 100);
    let words = 'Rupees ' + helper(rupees).trim() + ' Only';
    if (paise > 0) words = 'Rupees ' + helper(rupees).trim() + ' and ' + helper(paise).trim() + ' Paise Only';
    return words;
  };

  const handleSaveDraft = async () => {
    if (!hotel || lineItems.length === 0) return;
    setSaving(true); setError(null);
    try {
      const enabledModules = MODULE_KEYS.filter((k) => features.find((f) => f.module_key === k)?.is_enabled ?? true);
      const invoice = await createInvoice({
        hotel_id: hotelId,
        plan_id: selectedPlanId || null,
        billing_period: billingPeriod,
        billing_cycle: billingCycle,
        number_of_rooms: hotel.total_rooms,
        number_of_users: 1,
        enabled_modules: enabledModules,
        is_interstate: isInterstate,
        place_of_supply: hotel.state || '',
        notes,
        due_date: dueDate,
        items: lineItems.map((item) => ({
          description: item.description,
          hsn_sac: item.hsn_sac,
          quantity: item.quantity,
          rate: item.rate,
          discount: item.discount,
          gst_rate: item.gst_rate,
          item_type: item.item_type,
        })),
      });
      onCreated(invoice.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create invoice'); }
    finally { setSaving(false); }
  };

  const handleSaveAndIssue = async () => {
    if (!hotel || lineItems.length === 0) return;
    setIssuing(true); setError(null);
    try {
      const enabledModules = MODULE_KEYS.filter((k) => features.find((f) => f.module_key === k)?.is_enabled ?? true);
      const invoice = await createInvoice({
        hotel_id: hotelId,
        plan_id: selectedPlanId || null,
        billing_period: billingPeriod,
        billing_cycle: billingCycle,
        number_of_rooms: hotel.total_rooms,
        number_of_users: 1,
        enabled_modules: enabledModules,
        is_interstate: isInterstate,
        place_of_supply: hotel.state || '',
        notes,
        due_date: dueDate,
        items: lineItems.map((item) => ({
          description: item.description,
          hsn_sac: item.hsn_sac,
          quantity: item.quantity,
          rate: item.rate,
          discount: item.discount,
          gst_rate: item.gst_rate,
          item_type: item.item_type,
        })),
      });
      await issueInvoice(invoice.id);
      onCreated(invoice.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create and issue invoice'); }
    finally { setIssuing(false); }
  };

  if (loading) return <LoadingState label="Loading invoice form…" />;
  if (error) return <ErrorState message={error} />;
  if (!settings) return <ErrorState message="Missing settings" />;

  // Hotel picker when no hotelId is provided
  if (!hotelId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Create Invoice</h1>
        </div>
        <Card className="p-5">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Select a Hotel</h3>
          <p className="text-sm text-slate-500 mb-4">Choose a hotel to create an invoice for. You can also create an invoice directly from the Hotel Detail page.</p>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {allHotels.map((h) => (
              <button key={h.id} onClick={() => onCreated('')}
                className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-sky-50 rounded-lg transition text-left">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{h.hotel_name}</p>
                  <p className="text-xs text-slate-400">{h.property_code ?? 'No code'} · {h.city}, {h.state}</p>
                </div>
                <Badge color={h.subscription_status === 'Active' ? 'green' : 'slate'}>{h.subscription_status}</Badge>
              </button>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (!hotel) return <ErrorState message="Hotel not found" />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Create Invoice</h1>
          <p className="text-sm text-slate-500">{hotel.hotel_name} · {hotel.property_code ?? 'No code'}</p>
        </div>
      </div>

      {/* Prefilled hotel info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5 space-y-2">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">Bill To (Hotel)</h3>
          <div className="text-sm"><span className="text-slate-500">Name: </span><span className="font-semibold text-slate-800">{hotel.hotel_name}</span></div>
          <div className="text-sm"><span className="text-slate-500">Property Code: </span><span className="font-semibold text-slate-800">{hotel.property_code ?? '—'}</span></div>
          <div className="text-sm"><span className="text-slate-500">Address: </span><span className="font-semibold text-slate-800">{hotel.address || '—'}</span></div>
          <div className="text-sm"><span className="text-slate-500">City/State: </span><span className="font-semibold text-slate-800">{hotel.city}, {hotel.state}</span></div>
          <div className="text-sm"><span className="text-slate-500">Contact: </span><span className="font-semibold text-slate-800">{hotel.owner_name}</span></div>
          <div className="text-sm"><span className="text-slate-500">Mobile: </span><span className="font-semibold text-slate-800">{hotel.mobile || '—'}</span></div>
          <div className="text-sm"><span className="text-slate-500">Email: </span><span className="font-semibold text-slate-800">{hotel.admin_email}</span></div>
        </Card>
        <Card className="p-5 space-y-2">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">Subscription Details</h3>
          <div className="grid grid-cols-2 gap-3">
            <SelectInput label="Plan" value={selectedPlanId} onChange={handlePlanChange}
              options={[{ value: '', label: '— Select Plan —' }, ...plans.map((p) => ({ value: p.id, label: p.name }))]} />
            <SelectInput label="Billing Cycle" value={billingCycle} onChange={setBillingCycle}
              options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }, { value: 'quarterly', label: 'Quarterly' }]} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Invoice Date" value={invoiceDate} onChange={setInvoiceDate} type="date" />
            <TextInput label="Due Date" value={dueDate} onChange={setDueDate} type="date" />
          </div>
          <TextInput label="Billing Period" value={billingPeriod} onChange={setBillingPeriod} placeholder="e.g. Aug 2026" />
          <div className="text-sm flex items-center gap-2">
            <Badge color={isInterstate ? 'orange' : 'green'}>{isInterstate ? 'IGST (Interstate)' : 'CGST + SGST (Intrastate)'}</Badge>
          </div>
          <div className="text-xs text-slate-500">Rooms: {hotel.total_rooms} · Modules: {MODULE_KEYS.filter((k) => features.find((f) => f.module_key === k)?.is_enabled ?? true).length} enabled</div>
        </Card>
      </div>

      {/* Line items */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Line Items</h3>
          <button onClick={addItem} className="flex items-center gap-1 text-sm text-sky-600 font-medium hover:underline"><Plus className="w-4 h-4" /> Add Line Item</button>
        </div>
        <div className="space-y-2">
          {lineItems.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end p-2 bg-slate-50 rounded-lg">
              <div className="col-span-12 md:col-span-4">
                {idx === 0 && <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>}
                <input type="text" value={item.description} onChange={(e) => updateItem(idx, { description: e.target.value })}
                  placeholder="Item description" className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div className="col-span-3 md:col-span-2">
                {idx === 0 && <label className="block text-xs font-medium text-slate-600 mb-1">HSN/SAC</label>}
                <input type="text" value={item.hsn_sac} onChange={(e) => updateItem(idx, { hsn_sac: e.target.value })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div className="col-span-3 md:col-span-1">
                {idx === 0 && <label className="block text-xs font-medium text-slate-600 mb-1">Qty</label>}
                <input type="number" value={item.quantity} onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div className="col-span-3 md:col-span-2">
                {idx === 0 && <label className="block text-xs font-medium text-slate-600 mb-1">Rate (₹)</label>}
                <input type="number" value={item.rate} onChange={(e) => updateItem(idx, { rate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div className="col-span-3 md:col-span-1">
                {idx === 0 && <label className="block text-xs font-medium text-slate-600 mb-1">Disc (₹)</label>}
                <input type="number" value={item.discount} onChange={(e) => updateItem(idx, { discount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div className="col-span-3 md:col-span-1">
                {idx === 0 && <label className="block text-xs font-medium text-slate-600 mb-1">GST%</label>}
                <input type="number" value={item.gst_rate} onChange={(e) => updateItem(idx, { gst_rate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div className="col-span-1 flex justify-end">
                {lineItems.length > 1 && (
                  <button onClick={() => removeItem(idx)} className="p-1.5 text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="Invoice notes (optional)" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
          </div>
          <div className="bg-slate-50 rounded-xl p-4 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Subtotal:</span><span className="font-semibold tabular-nums">{fmtMoney(totals.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Discount:</span><span className="font-semibold tabular-nums text-red-600">−{fmtMoney(totals.totalDiscount)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Taxable Amount:</span><span className="font-semibold tabular-nums">{fmtMoney(totals.totalTaxable)}</span></div>
            {!isInterstate ? (
              <>
                <div className="flex justify-between"><span className="text-slate-500">CGST:</span><span className="font-semibold tabular-nums">{fmtMoney(totals.totalCgst)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">SGST:</span><span className="font-semibold tabular-nums">{fmtMoney(totals.totalSgst)}</span></div>
              </>
            ) : (
              <div className="flex justify-between"><span className="text-slate-500">IGST:</span><span className="font-semibold tabular-nums">{fmtMoney(totals.totalIgst)}</span></div>
            )}
            <div className="flex justify-between"><span className="text-slate-500">Round Off:</span><span className="font-semibold tabular-nums">{fmtMoney(totals.roundOff)}</span></div>
            <div className="border-t border-slate-300 pt-1.5 flex justify-between">
              <span className="font-bold text-slate-700">Total Payable:</span>
              <span className="font-bold text-lg text-slate-900 tabular-nums">{fmtMoney(totals.total)}</span>
            </div>
            <div className="text-xs text-slate-500 italic mt-1">{amountInWords(totals.total)}</div>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button onClick={handleSaveDraft} disabled={saving || issuing || !canWrite}
          className="flex items-center gap-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Draft
        </button>
        <button onClick={handleSaveAndIssue} disabled={saving || issuing || !canIssue}
          className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm">
          {issuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Save & Issue
        </button>
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-700 font-medium">Cancel</button>
      </div>
    </div>
  );
};
