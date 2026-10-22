import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ArrowLeft, Plus, Save, FileText, Loader2, X,
  Building2, AlertTriangle, RefreshCw, Search,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useHotel } from '@/lib/hotel-context';
import {
  getEnterpriseHotel, getEnterpriseHotels, getPlans, getHotelFeatures, createInvoice,
  getBillingSettings, issueInvoice, DEFAULT_BILLING_SETTINGS,
} from '../api';
import type { EnterpriseHotel, SubscriptionPlan, HotelFeature, BillingSettings, Invoice } from '../types';
import { MODULE_KEYS } from '../types';
import { hasPermission } from '../permissions';
import { Card, Badge, LoadingState, ErrorState, TextInput, SelectInput, fmtMoney } from '../ui';

interface Props {
  hotelId?: string | null;
  onBack: () => void;
  onCreated: (invoiceId: string) => void;
  onHotelChange?: (newHotelId: string) => void;
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

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onReset: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Localized Error Boundary protecting invoice creation from blank-screen crashes.
 */
class InvoiceErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[InvoiceErrorBoundary] Caught invoice creation rendering crash:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-white border border-red-200 rounded-2xl shadow-sm space-y-4 max-w-2xl mx-auto my-8">
          <div className="flex items-center gap-3 text-red-600">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <h2 className="text-lg font-bold">Failed to display invoice creation form</h2>
          </div>
          <p className="text-sm text-slate-600">
            {this.state.error?.message || 'An unexpected rendering error occurred while displaying the invoice creation screen.'}
          </p>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                this.props.onReset();
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-xl transition"
            >
              Reset and Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const InvoiceCreateScreenInner: React.FC<Props> = ({
  hotelId: propHotelId,
  onBack,
  onCreated,
  onHotelChange,
}) => {
  const { companyRole } = useAuth();
  const {
    hotelId: globalHotelId,
    availableHotels: globalHotels,
    isSuperAdmin,
    setSelectedHotel: setGlobalHotel,
  } = useHotel();

  const canWrite = hasPermission(companyRole, 'invoices.write');
  const canIssue = hasPermission(companyRole, 'invoices.issue');

  // ── Hotel Resolution & Preselection ──
  // Resolve initial hotel ID: prop hotelId -> global hotel context -> localStorage
  const resolveInitialHotelId = (): string => {
    if (propHotelId && typeof propHotelId === 'string' && propHotelId.trim()) {
      return propHotelId.trim();
    }
    if (globalHotelId && typeof globalHotelId === 'string' && globalHotelId.trim()) {
      return globalHotelId.trim();
    }
    try {
      const stored = localStorage.getItem('hotel_mantri_selected_hotel_id');
      if (stored && typeof stored === 'string' && stored.trim()) {
        return stored.trim();
      }
    } catch {}
    return '';
  };

  const [selectedHotelId, setSelectedHotelId] = useState<string>(resolveInitialHotelId);
  const [hotel, setHotel] = useState<EnterpriseHotel | null>(null);
  const [allHotels, setAllHotels] = useState<EnterpriseHotel[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [features, setFeatures] = useState<HotelFeature[]>([]);
  const [settings, setSettings] = useState<BillingSettings>(DEFAULT_BILLING_SETTINGS);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [hotelSearch, setHotelSearch] = useState('');

  // Form inputs
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [billingPeriod, setBillingPeriod] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // Stale async response tracking
  const reqIdRef = useRef(0);

  // Sync when prop hotelId changes externally
  useEffect(() => {
    if (propHotelId && typeof propHotelId === 'string' && propHotelId.trim() && propHotelId.trim() !== selectedHotelId) {
      setSelectedHotelId(propHotelId.trim());
    }
  }, [propHotelId]);

  // ── Data Loading Logic ──
  const loadHotelData = useCallback(async (targetHotelId: string) => {
    const currentReqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);

    try {
      // 1. Always load hotels list and billing settings so selector is always populated
      const [hList, sett] = await Promise.all([
        getEnterpriseHotels().catch((e) => {
          console.warn('[InvoiceCreateScreen] Failed to load hotel list:', e);
          return [] as EnterpriseHotel[];
        }),
        getBillingSettings().catch(() => DEFAULT_BILLING_SETTINGS),
      ]);

      if (currentReqId !== reqIdRef.current) return; // Stale request, ignore

      const activeHotels = (hList || []).filter((h) => !h.archived_at);
      setAllHotels(activeHotels);
      setSettings(sett || DEFAULT_BILLING_SETTINGS);

      // 2. If no hotel ID selected, stop here in property picker mode
      if (!targetHotelId || !targetHotelId.trim()) {
        setHotel(null);
        setLoading(false);
        return;
      }

      // 3. Load target hotel details, plans, and features
      const [hData, pData, fData] = await Promise.all([
        getEnterpriseHotel(targetHotelId).catch((e) => {
          console.error(`[InvoiceCreateScreen] Error loading hotel ${targetHotelId}:`, e);
          return null;
        }),
        getPlans().catch((e) => {
          console.warn('[InvoiceCreateScreen] Failed to load plans:', e);
          return [] as SubscriptionPlan[];
        }),
        getHotelFeatures(targetHotelId).catch((e) => {
          console.warn(`[InvoiceCreateScreen] Failed to load features for ${targetHotelId}:`, e);
          return [] as HotelFeature[];
        }),
      ]);

      if (currentReqId !== reqIdRef.current) return; // Stale request, ignore

      if (!hData) {
        setError(`Hotel with ID "${targetHotelId}" could not be found or access is restricted. Please select an active hotel.`);
        setHotel(null);
        setLoading(false);
        return;
      }

      setHotel(hData);
      const activePlans = (pData || []).filter((x) => x.is_active);
      setPlans(activePlans);
      setFeatures(fData || []);

      const defaultGstRate = sett?.gst?.default_gst_rate ?? 18;
      const defaultHsnSac = sett?.gst?.hsn_sac ?? '998314';

      // Auto-assign plan if hotel has an existing plan_id
      const assignedPlan = hData.plan_id ? activePlans.find((x) => x.id === hData.plan_id) : undefined;
      if (assignedPlan) {
        setSelectedPlanId(assignedPlan.id);
        const isYearly = assignedPlan.billing_period === 'yearly';
        setBillingCycle(isYearly ? 'yearly' : 'monthly');
        const price = isYearly ? assignedPlan.yearly_price : assignedPlan.price;
        setLineItems([{
          description: `${assignedPlan.name} — ${isYearly ? 'Yearly' : 'Monthly'} Subscription`,
          hsn_sac: defaultHsnSac,
          quantity: 1,
          rate: Number(price) || 0,
          discount: 0,
          gst_rate: defaultGstRate,
          item_type: 'subscription',
        }]);
      } else {
        setSelectedPlanId('');
        setLineItems([{
          description: 'Subscription — Monthly',
          hsn_sac: defaultHsnSac,
          quantity: 1,
          rate: 0,
          discount: 0,
          gst_rate: defaultGstRate,
          item_type: 'subscription',
        }]);
      }

      const today = new Date();
      const periodLabel = `${today.toLocaleString('en-US', { month: 'short' })} ${today.getFullYear()}`;
      setBillingPeriod((prev) => prev || periodLabel);
    } catch (err: any) {
      if (currentReqId === reqIdRef.current) {
        setError(err instanceof Error ? err.message : 'An error occurred while loading invoice details.');
      }
    } finally {
      if (currentReqId === reqIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Trigger load when selectedHotelId changes
  useEffect(() => {
    loadHotelData(selectedHotelId);
  }, [selectedHotelId, loadHotelData]);

  // ── Property Switcher Handler ──
  const handleSwitchHotel = (newHotelId: string) => {
    if (!newHotelId) {
      setSelectedHotelId('');
      setHotel(null);
      return;
    }
    if (newHotelId === selectedHotelId) return;

    setSelectedHotelId(newHotelId);
    onHotelChange?.(newHotelId);

    // Synchronize global hotel context for Super Admin so subsequent pages stay aligned
    if (isSuperAdmin) {
      setGlobalHotel(newHotelId).catch((err) => {
        console.warn('[InvoiceCreateScreen] Could not sync global hotel context:', err);
      });
    }
  };

  // ── Safe Interstate / Intrastate GST Calculation ──
  const isInterstate = useMemo(() => {
    const companyState = (settings?.company_details?.state || '').trim().toLowerCase();
    const hotelState = (hotel?.state || '').trim().toLowerCase();
    return Boolean(companyState && hotelState && companyState !== hotelState);
  }, [settings, hotel]);

  // ── Plan Change ──
  const handlePlanChange = (planId: string) => {
    setSelectedPlanId(planId);
    const plan = plans.find((p) => p.id === planId);
    if (plan) {
      const isYearly = plan.billing_period === 'yearly';
      const price = isYearly ? plan.yearly_price : plan.price;
      setBillingCycle(isYearly ? 'yearly' : 'monthly');
      setLineItems((prev) => {
        const updated = [...prev];
        if (updated.length > 0) {
          updated[0] = {
            ...updated[0],
            description: `${plan.name} — ${isYearly ? 'Yearly' : 'Monthly'} Subscription`,
            rate: Number(price) || 0,
          };
        }
        return updated;
      });
    }
  };

  // ── Line Items Management ──
  const updateItem = (idx: number, patch: Partial<LineItem>) => {
    setLineItems((prev) => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  };

  const addItem = () => {
    const defaultGstRate = settings?.gst?.default_gst_rate ?? 18;
    const defaultHsnSac = settings?.gst?.hsn_sac ?? '998314';
    setLineItems((prev) => [
      ...prev,
      {
        description: '',
        hsn_sac: defaultHsnSac,
        quantity: 1,
        rate: 0,
        discount: 0,
        gst_rate: defaultGstRate,
        item_type: 'addon',
      },
    ]);
  };

  const removeItem = (idx: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Totals Calculation ──
  const totals = useMemo(() => {
    let subtotal = 0, totalDiscount = 0, totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
    lineItems.forEach((item) => {
      const qty = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      const disc = Number(item.discount) || 0;
      const gst = Number(item.gst_rate) || 0;

      const lineTotal = qty * rate;
      const taxable = Math.max(0, lineTotal - disc);
      const tax = (taxable * gst) / 100;

      subtotal += lineTotal;
      totalDiscount += disc;
      totalTaxable += taxable;

      if (isInterstate) {
        totalIgst += tax;
      } else {
        totalCgst += tax / 2;
        totalSgst += tax / 2;
      }
    });

    let total = totalTaxable + totalCgst + totalSgst + totalIgst;
    let roundOff = 0;
    if (settings?.gst?.round_off) {
      const r = Math.round(total);
      roundOff = r - total;
      total = r;
    }

    return { subtotal, totalDiscount, totalTaxable, totalCgst, totalSgst, totalIgst, roundOff, total };
  }, [lineItems, isInterstate, settings]);

  const amountInWords = (amount: number): string => {
    if (isNaN(amount) || amount === 0) return 'Zero Rupees Only';
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

  // ── Validation & Save Operations ──
  const validateBeforeSave = (): string | null => {
    if (!hotel || !hotel.id || typeof hotel.id !== 'string') {
      return 'Please select a valid property/hotel before saving.';
    }
    if (hotel.id !== selectedHotelId) {
      return 'Selected hotel does not match internal property record. Please re-select the hotel.';
    }
    if (lineItems.length === 0) {
      return 'Please add at least one line item to the invoice.';
    }
    const hasEmptyDescription = lineItems.some((it) => !it.description.trim());
    if (hasEmptyDescription) {
      return 'All line items must have a valid description.';
    }
    const hasZeroQuantity = lineItems.some((it) => (Number(it.quantity) || 0) <= 0);
    if (hasZeroQuantity) {
      return 'Quantity for all line items must be greater than zero.';
    }
    if (!dueDate) {
      return 'Please provide a due date for the invoice.';
    }
    return null;
  };

  const handleSaveDraft = async () => {
    const valError = validateBeforeSave();
    if (valError) {
      setError(valError);
      return;
    }
    if (!hotel) return;

    setSaving(true);
    setError(null);

    try {
      const enabledModules = MODULE_KEYS.filter((k) => features.find((f) => f.module_key === k)?.is_enabled ?? true);
      const invoice = await createInvoice({
        hotel_id: hotel.id, // Verified internal UUID
        plan_id: selectedPlanId || null,
        billing_period: billingPeriod,
        billing_cycle: billingCycle,
        number_of_rooms: Number(hotel.total_rooms) || 0,
        number_of_users: 1,
        enabled_modules: enabledModules,
        is_interstate: isInterstate,
        place_of_supply: hotel.state || '',
        notes,
        due_date: dueDate,
        items: lineItems.map((item) => ({
          description: item.description.trim(),
          hsn_sac: item.hsn_sac || settings?.gst?.hsn_sac || '998314',
          quantity: Number(item.quantity) || 1,
          rate: Number(item.rate) || 0,
          discount: Number(item.discount) || 0,
          gst_rate: Number(item.gst_rate) || 0,
          item_type: item.item_type || 'subscription',
        })),
      });

      if (invoice && invoice.id) {
        onCreated(invoice.id);
      } else {
        throw new Error('Invoice was created but no invoice ID was returned by server.');
      }
    } catch (e) {
      console.error('[InvoiceCreateScreen] Failed to create draft invoice:', e);
      setError(e instanceof Error ? e.message : 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndIssue = async () => {
    const valError = validateBeforeSave();
    if (valError) {
      setError(valError);
      return;
    }
    if (!hotel) return;

    setIssuing(true);
    setError(null);

    try {
      const enabledModules = MODULE_KEYS.filter((k) => features.find((f) => f.module_key === k)?.is_enabled ?? true);
      const invoice = await createInvoice({
        hotel_id: hotel.id, // Verified internal UUID
        plan_id: selectedPlanId || null,
        billing_period: billingPeriod,
        billing_cycle: billingCycle,
        number_of_rooms: Number(hotel.total_rooms) || 0,
        number_of_users: 1,
        enabled_modules: enabledModules,
        is_interstate: isInterstate,
        place_of_supply: hotel.state || '',
        notes,
        due_date: dueDate,
        items: lineItems.map((item) => ({
          description: item.description.trim(),
          hsn_sac: item.hsn_sac || settings?.gst?.hsn_sac || '998314',
          quantity: Number(item.quantity) || 1,
          rate: Number(item.rate) || 0,
          discount: Number(item.discount) || 0,
          gst_rate: Number(item.gst_rate) || 0,
          item_type: item.item_type || 'subscription',
        })),
      });

      if (!invoice || !invoice.id) {
        throw new Error('Invoice was created but no invoice ID was returned by server.');
      }

      await issueInvoice(invoice.id);
      onCreated(invoice.id);
    } catch (e) {
      console.error('[InvoiceCreateScreen] Failed to create and issue invoice:', e);
      setError(e instanceof Error ? e.message : 'Failed to create and issue invoice');
    } finally {
      setIssuing(false);
    }
  };

  // ── Render Case 1: Initial Loading ──
  if (loading && !hotel && selectedHotelId) {
    return <LoadingState label="Loading hotel invoice data…" />;
  }

  // ── Render Case 2: No Hotel Selected (Property Picker Mode) ──
  if (!selectedHotelId || !hotel) {
    const filteredHotels = allHotels.filter((h) => {
      if (!hotelSearch.trim()) return true;
      const q = hotelSearch.toLowerCase().trim();
      return (
        (h.hotel_name || '').toLowerCase().includes(q) ||
        (h.property_code || '').toLowerCase().includes(q) ||
        (h.city || '').toLowerCase().includes(q) ||
        (h.state || '').toLowerCase().includes(q)
      );
    });

    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Create Invoice</h1>
            <p className="text-sm text-slate-500">Select a property/hotel to generate an invoice for.</p>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-xs font-semibold underline text-amber-700">
              Dismiss
            </button>
          </div>
        )}

        <Card className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Select a Hotel Property</h3>
              <p className="text-xs text-slate-500 mt-0.5">Choose an active property to load invoice and subscription details.</p>
            </div>
            <div className="w-full sm:w-72 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={hotelSearch}
                onChange={(e) => setHotelSearch(e.target.value)}
                placeholder="Search properties, code, city…"
                className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          {filteredHotels.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <Building2 className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm">No properties found matching your search.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto divide-y divide-slate-100 pr-1">
              {filteredHotels.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => handleSwitchHotel(h.id)}
                  className="w-full flex items-center justify-between p-3.5 hover:bg-sky-50 rounded-xl transition text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 group-hover:text-sky-700 transition">
                        {h.hotel_name}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {h.property_code ? (
                          <span className="font-semibold text-slate-700 mr-1.5">{h.property_code} ·</span>
                        ) : null}
                        {[h.city, h.state].filter(Boolean).join(', ') || 'No location set'}
                        {h.total_rooms ? ` · ${h.total_rooms} rooms` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge color={h.subscription_status === 'Active' ? 'green' : 'slate'}>
                      {h.subscription_status || 'Active'}
                    </Badge>
                    <span className="text-xs font-semibold text-sky-600 group-hover:underline flex items-center gap-1">
                      Select &rarr;
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  }

  // ── Render Case 3: Invoice Form Active ──
  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Create Invoice</h1>
            <p className="text-sm text-slate-500">
              {hotel.hotel_name} {hotel.property_code ? `· ${hotel.property_code}` : ''}
            </p>
          </div>
        </div>

        {/* Property Switcher in Header */}
        {allHotels.length > 1 && canWrite && (
          <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs">
            <Building2 className="w-4 h-4 text-sky-600 shrink-0" />
            <label className="text-xs font-semibold text-slate-600 shrink-0">Property:</label>
            <select
              value={hotel.id}
              onChange={(e) => handleSwitchHotel(e.target.value)}
              className="text-xs font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer max-w-[220px] truncate"
            >
              {allHotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.hotel_name} {h.property_code ? `(${h.property_code})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs font-semibold underline text-red-700">
            Dismiss
          </button>
        </div>
      )}

      {/* Bill To & Subscription Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bill To Card */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
              <Building2 className="w-4 h-4 text-sky-600" /> Bill To (Hotel Property)
            </h3>
            {allHotels.length > 1 && canWrite && (
              <button
                type="button"
                onClick={() => handleSwitchHotel('')}
                className="text-xs font-semibold text-sky-600 hover:text-sky-800 hover:underline"
              >
                Change Property
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-slate-400 block font-medium">Hotel Name</span>
              <span className="font-bold text-slate-900">{hotel.hotel_name}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block font-medium">Property Code</span>
              <span className="font-semibold text-slate-700">{hotel.property_code ?? '—'}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block font-medium">Address</span>
              <span className="text-slate-700">{hotel.address || '—'}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block font-medium">City / State</span>
              <span className="text-slate-700">{[hotel.city, hotel.state].filter(Boolean).join(', ') || '—'}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block font-medium">Contact Person</span>
              <span className="text-slate-700">{hotel.owner_name || '—'}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block font-medium">Mobile / Email</span>
              <span className="text-slate-700 truncate block" title={`${hotel.mobile || ''} · ${hotel.admin_email || ''}`}>
                {hotel.mobile || '—'} · {hotel.admin_email || '—'}
              </span>
            </div>
          </div>
        </Card>

        {/* Subscription Details Card */}
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-2">
            Subscription Details
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <SelectInput
              label="Plan"
              value={selectedPlanId}
              onChange={handlePlanChange}
              options={[{ value: '', label: '— Select Plan —' }, ...plans.map((p) => ({ value: p.id, label: p.name }))]}
            />
            <SelectInput
              label="Billing Cycle"
              value={billingCycle}
              onChange={setBillingCycle}
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'yearly', label: 'Yearly' },
                { value: 'quarterly', label: 'Quarterly' },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Invoice Date" value={invoiceDate} onChange={setInvoiceDate} type="date" />
            <TextInput label="Due Date" value={dueDate} onChange={setDueDate} type="date" />
          </div>
          <TextInput
            label="Billing Period"
            value={billingPeriod}
            onChange={setBillingPeriod}
            placeholder="e.g. Oct 2026"
          />
          <div className="text-sm flex items-center justify-between pt-1">
            <Badge color={isInterstate ? 'orange' : 'green'}>
              {isInterstate ? 'IGST (Interstate)' : 'CGST + SGST (Intrastate)'}
            </Badge>
            <span className="text-xs text-slate-500 font-medium">
              Rooms: {hotel.total_rooms || 0} · Modules: {MODULE_KEYS.filter((k) => features.find((f) => f.module_key === k)?.is_enabled ?? true).length} active
            </span>
          </div>
        </Card>
      </div>

      {/* Line Items Card */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Line Items</h3>
          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-1 text-sm text-sky-600 font-semibold hover:text-sky-700 hover:underline"
          >
            <Plus className="w-4 h-4" /> Add Line Item
          </button>
        </div>

        <div className="space-y-2">
          {lineItems.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end p-2.5 bg-slate-50 rounded-xl border border-slate-200/60">
              <div className="col-span-12 md:col-span-4">
                {idx === 0 && <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>}
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => updateItem(idx, { description: e.target.value })}
                  placeholder="Item description"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div className="col-span-3 md:col-span-2">
                {idx === 0 && <label className="block text-xs font-semibold text-slate-600 mb-1">HSN/SAC</label>}
                <input
                  type="text"
                  value={item.hsn_sac}
                  onChange={(e) => updateItem(idx, { hsn_sac: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div className="col-span-3 md:col-span-1">
                {idx === 0 && <label className="block text-xs font-semibold text-slate-600 mb-1">Qty</label>}
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div className="col-span-3 md:col-span-2">
                {idx === 0 && <label className="block text-xs font-semibold text-slate-600 mb-1">Rate (₹)</label>}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.rate}
                  onChange={(e) => updateItem(idx, { rate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div className="col-span-3 md:col-span-1">
                {idx === 0 && <label className="block text-xs font-semibold text-slate-600 mb-1">Disc (₹)</label>}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.discount}
                  onChange={(e) => updateItem(idx, { discount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div className="col-span-3 md:col-span-1">
                {idx === 0 && <label className="block text-xs font-semibold text-slate-600 mb-1">GST%</label>}
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={item.gst_rate}
                  onChange={(e) => updateItem(idx, { gst_rate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div className="col-span-1 flex justify-end">
                {lineItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="p-1.5 text-slate-400 hover:text-red-600 transition"
                    title="Remove item"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Notes & Totals */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Invoice Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Add any specific notes, reference numbers, or payment terms for this invoice…"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-1.5 text-sm shadow-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal:</span>
              <span className="font-semibold tabular-nums">{fmtMoney(totals.subtotal)}</span>
            </div>
            {totals.totalDiscount > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">Discount:</span>
                <span className="font-semibold tabular-nums text-red-600">−{fmtMoney(totals.totalDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Taxable Amount:</span>
              <span className="font-semibold tabular-nums">{fmtMoney(totals.totalTaxable)}</span>
            </div>
            {!isInterstate ? (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-500">CGST:</span>
                  <span className="font-semibold tabular-nums">{fmtMoney(totals.totalCgst)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">SGST:</span>
                  <span className="font-semibold tabular-nums">{fmtMoney(totals.totalSgst)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span className="text-slate-500">IGST:</span>
                <span className="font-semibold tabular-nums">{fmtMoney(totals.totalIgst)}</span>
              </div>
            )}
            {totals.roundOff !== 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">Round Off:</span>
                <span className="font-semibold tabular-nums">{fmtMoney(totals.roundOff)}</span>
              </div>
            )}
            <div className="border-t border-slate-300 pt-2 flex justify-between items-baseline">
              <span className="font-bold text-slate-800">Total Payable:</span>
              <span className="font-extrabold text-xl text-slate-900 tabular-nums">{fmtMoney(totals.total)}</span>
            </div>
            <div className="text-xs text-slate-500 italic mt-1 font-medium">{amountInWords(totals.total)}</div>
          </div>
        </div>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={saving || issuing || !canWrite || !hotel}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm shadow-xs"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Draft
        </button>
        <button
          type="button"
          onClick={handleSaveAndIssue}
          disabled={saving || issuing || !canIssue || !hotel}
          className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm shadow-xs"
        >
          {issuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Save &amp; Issue
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-slate-600 hover:text-slate-900 font-medium px-3 py-2 rounded-lg hover:bg-slate-100 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export const InvoiceCreateScreen: React.FC<Props> = (props) => {
  return (
    <InvoiceErrorBoundary onReset={() => {}}>
      <InvoiceCreateScreenInner {...props} />
    </InvoiceErrorBoundary>
  );
};
