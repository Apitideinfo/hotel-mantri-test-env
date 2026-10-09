/**
 * HOTEL MANTRI — PRODUCTION LAUNDRY & LINEN API CLIENT
 * 
 * Provides client-side methods calling the authoritative backend routes:
 * - Linen item stock master & auditable stock movements
 * - Laundry dispatches & partial receiving
 * - Pending linen & lost/damaged resolution
 * - Laundry billing & Finance expense synchronization
 * - Vendor ledger & payments
 * - WhatsApp daily statements & PDF downloads
 */

import { apiFetch } from './api-fetch';
import { supabase } from './supabase';
import { getCurrentHotelId } from './api';

// ── Types ───────────────────────────────────────────────────────────────────

export interface LaundryVendor {
  id: string;
  hotel_id: string;
  vendor_name: string;
  contact_person: string;
  mobile_number: string;
  address: string;
  gstin: string;
  default_rate_type: 'Per Piece' | 'Per Kg';
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LinenItem {
  id: string;
  hotel_id: string;
  item_name: string;
  category: string;
  unit: 'Pieces' | 'Kg';
  standard_rate: number;
  is_active: boolean;
  total_stock?: number;
  total_active_stock?: number;
  available_in_hotel?: number;
  at_laundry?: number;
  damaged_lost?: number;
  total_sent?: number;
  total_received?: number;
  created_at: string;
  updated_at: string;
}

export interface LinenStockMovement {
  id: string;
  hotel_id: string;
  linen_item_id: string;
  movement_date: string;
  movement_type: 'opening' | 'addition' | 'adjustment_add' | 'adjustment_sub' | 'discard' | 'lost_at_laundry' | 'damaged_at_laundry' | 'correction';
  quantity: number;
  before_qty: number;
  after_qty: number;
  reason: string;
  reference_id?: string | null;
  reference_type?: string;
  created_by: string;
  created_at: string;
  linen_items?: {
    item_name: string;
    category: string;
    unit: string;
  };
}

export interface LaundryVendorRate {
  id: string;
  hotel_id: string;
  vendor_id: string;
  linen_item_id: string;
  rate_per_piece: number;
  effective_from: string;
  effective_to?: string | null;
  is_active: boolean;
  linen_items?: {
    item_name: string;
    category: string;
  };
}

export interface LaundryDispatchItem {
  id: string;
  hotel_id: string;
  dispatch_id: string;
  linen_item_id: string | null;
  item_name: string;
  sent_qty: number;
  rate_per_piece: number;
  amount: number;
  total_received?: number;
  total_damaged?: number;
  total_lost?: number;
  created_at: string;
}

export interface LaundryDispatch {
  id: string;
  hotel_id: string;
  dispatch_no: string;
  dispatch_date: string;
  vendor_id: string | null;
  vendor_name: string;
  challan_no: string;
  expected_return_date: string | null;
  remarks: string;
  sent_by: string;
  status: 'Sent' | 'Partially Received' | 'Completed' | 'Short/Lost' | 'OPEN' | 'PARTIALLY_RECEIVED' | 'CLOSED';
  total_amount: number;
  created_at: string;
  updated_at: string;
  items?: LaundryDispatchItem[];
}

export interface ReceiptItemEntry {
  dispatch_item_id?: string;
  item_name: string;
  linen_item_id: string | null;
  sent_qty: number;
  received_now: number;
  damaged_qty?: number;
  lost_qty?: number;
  damaged_lost?: number;
  remaining_pending?: number;
  is_billable?: boolean;
  rate_applied?: number;
  bill_amount?: number;
}

export interface LaundryReceipt {
  id: string;
  hotel_id: string;
  dispatch_id: string;
  receipt_date: string;
  items_json: ReceiptItemEntry[];
  remarks: string;
  received_by: string;
  created_at: string;
}

export interface DispatchWithReceipts extends LaundryDispatch {
  items: LaundryDispatchItem[];
  receipts: LaundryReceipt[];
  received_totals: Record<string, number>;
  damaged_totals: Record<string, number>;
  lost_totals: Record<string, number>;
  total_sent: number;
  total_received: number;
  total_damaged: number;
  total_lost: number;
  total_pending: number;
}

export interface LaundryBillItem {
  id?: string;
  linen_item_id?: string | null;
  item_name: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface LaundryBill {
  id: string;
  hotel_id: string;
  bill_no: string;
  bill_date: string;
  vendor_id: string;
  vendor_name: string;
  total_qty: number;
  total_amount: number;
  status: 'draft' | 'approved' | 'paid' | 'cancelled';
  approved_by?: string;
  approved_at?: string;
  expense_entry_id?: string;
  notes?: string;
  items?: LaundryBillItem[];
  created_at: string;
}

export interface LaundryVendorPayment {
  id: string;
  hotel_id: string;
  vendor_id: string;
  payment_date: string;
  amount: number;
  payment_mode: 'Cash' | 'Bank' | 'UPI' | 'Credit';
  reference_no: string;
  notes: string;
  created_by: string;
  created_at: string;
}

export interface DailyLedgerRow {
  date: string;
  sent_qty: number;
  received_qty: number;
  pending_qty: number;
  bill_amount: number;
  paid_amount: number;
  payment_due: number;
  details?: string;
}

export interface VendorLedgerTransaction {
  date: string;
  type: 'BILL' | 'PAYMENT' | 'DISPATCH' | 'RECEIPT';
  reference: string;
  description: string;
  sent_qty: number;
  received_qty: number;
  pending_qty?: number;
  bill_amount: number;
  paid_amount: number;
  balance_due: number;
  timestamp: string;
}

export interface VendorLedgerResult {
  vendor_id: string;
  physical_pending_pieces: number;
  total_billed_amount: number;
  total_paid_amount: number;
  financial_due_amount: number;
  daily_ledger?: DailyLedgerRow[];
  transactions: VendorLedgerTransaction[];
}


export interface LaundryDashboardData {
  selected_date: string;
  total_linen_stock: number;
  available_in_hotel: number;
  at_laundry: number;
  damaged_lost: number;
  today_sent: number;
  today_received: number;
  today_bill: number;
  vendor_due: number;
  linen_items: LinenItem[];
  vendors: LaundryVendor[];
  dispatches: LaundryDispatch[];
}

// ── Vendors ─────────────────────────────────────────────────────────────────

export const getLaundryVendors = async (): Promise<LaundryVendor[]> => {
  try {
    const res = await apiFetch('/api/laundry/vendors');
    if (res?.success && Array.isArray(res.vendors)) return res.vendors;
  } catch {
    // fallback to Supabase query
  }
  const { data, error } = await supabase
    .from('laundry_vendors')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('vendor_name', { ascending: true });
  if (error) throw error;
  return (data as LaundryVendor[]) ?? [];
};

export const saveLaundryVendor = async (
  input: Omit<LaundryVendor, 'id' | 'hotel_id' | 'created_at' | 'updated_at'>,
  id?: string
): Promise<LaundryVendor> => {
  const payload = { ...input, id };
  const res = await apiFetch('/api/laundry/vendors', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res?.success && res.vendor) return res.vendor;
  throw new Error(res?.error || 'Failed to save vendor');
};

export const deleteLaundryVendor = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('laundry_vendors')
    .delete()
    .eq('id', id)
    .eq('hotel_id', getCurrentHotelId());
  if (error) throw error;
};

// ── Linen Items & Stock Master ──────────────────────────────────────────────

export const getLinenItems = async (): Promise<LinenItem[]> => {
  try {
    const res = await apiFetch('/api/laundry/linen-items');
    if (res?.success && Array.isArray(res.items)) return res.items;
  } catch {
    // fallback
  }
  const { data, error } = await supabase
    .from('linen_items')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('item_name', { ascending: true });
  if (error) throw error;
  return (data as LinenItem[]) ?? [];
};

export const saveLinenItem = async (
  input: Omit<LinenItem, 'id' | 'hotel_id' | 'created_at' | 'updated_at'> & { initial_stock?: number },
  id?: string
): Promise<LinenItem> => {
  const payload = { ...input, id };
  const res = await apiFetch('/api/laundry/linen-items', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res?.success && res.item) return res.item;
  throw new Error(res?.error || 'Failed to save linen item');
};

export const deleteLinenItem = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('linen_items')
    .delete()
    .eq('id', id)
    .eq('hotel_id', getCurrentHotelId());
  if (error) throw error;
};

export const seedStandardLinenItems = async (): Promise<LinenItem[]> => {
  const res = await apiFetch('/api/laundry/linen-items/seed-defaults', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (res?.success && Array.isArray(res.created)) return res.created;
  return [];
};

// ── Stock Movements ─────────────────────────────────────────────────────────

export const getStockMovements = async (filters: {
  linen_item_id?: string;
  fromDate?: string;
  toDate?: string;
} = {}): Promise<LinenStockMovement[]> => {
  const params = new URLSearchParams();
  if (filters.linen_item_id) params.set('linen_item_id', filters.linen_item_id);
  if (filters.fromDate) params.set('fromDate', filters.fromDate);
  if (filters.toDate) params.set('toDate', filters.toDate);

  const res = await apiFetch(`/api/laundry/stock-movements?${params.toString()}`);
  if (res?.success && Array.isArray(res.movements)) return res.movements;
  return [];
};

export const recordStockMovement = async (input: {
  linen_item_id: string;
  movement_date: string;
  movement_type: LinenStockMovement['movement_type'];
  quantity: number;
  reason?: string;
}): Promise<LinenStockMovement> => {
  const res = await apiFetch('/api/laundry/stock-movements', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (res?.success && res.movement) return res.movement;
  throw new Error(res?.error || 'Failed to record stock movement');
};

// ── Vendor Rates ────────────────────────────────────────────────────────────

export const getVendorRates = async (vendorId: string): Promise<LaundryVendorRate[]> => {
  const res = await apiFetch(`/api/laundry/vendor-rates?vendor_id=${vendorId}`);
  if (res?.success && Array.isArray(res.rates)) return res.rates;
  return [];
};

export const saveVendorRate = async (input: {
  vendor_id: string;
  linen_item_id: string;
  rate_per_piece: number;
  effective_from?: string;
}): Promise<LaundryVendorRate> => {
  const res = await apiFetch('/api/laundry/vendor-rates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (res?.success && res.rate) return res.rate;
  throw new Error(res?.error || 'Failed to save vendor rate');
};

// ── Dispatches ──────────────────────────────────────────────────────────────

export const getDispatches = async (fromDate?: string, toDate?: string): Promise<LaundryDispatch[]> => {
  let query = supabase
    .from('laundry_dispatches')
    .select('*, laundry_dispatch_items(*)')
    .eq('hotel_id', getCurrentHotelId())
    .order('dispatch_date', { ascending: false });
  if (fromDate) query = query.gte('dispatch_date', fromDate);
  if (toDate) query = query.lte('dispatch_date', toDate);
  const { data, error } = await query;
  if (error) throw error;
  return (data as LaundryDispatch[]) ?? [];
};

export const getDispatchDetail = async (dispatchId: string): Promise<DispatchWithReceipts> => {
  const hotelId = getCurrentHotelId();
  const [dispRes, itemsRes, receiptsRes] = await Promise.all([
    supabase.from('laundry_dispatches').select('*').eq('id', dispatchId).eq('hotel_id', hotelId).maybeSingle(),
    supabase.from('laundry_dispatch_items').select('*').eq('dispatch_id', dispatchId).eq('hotel_id', hotelId).order('created_at', { ascending: true }),
    supabase.from('laundry_receipts').select('*').eq('dispatch_id', dispatchId).eq('hotel_id', hotelId).order('receipt_date', { ascending: true }),
  ]);
  if (dispRes.error) throw dispRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (receiptsRes.error) throw receiptsRes.error;
  const dispatch = dispRes.data as LaundryDispatch;
  const items = (itemsRes.data as LaundryDispatchItem[]) ?? [];
  const receipts = (receiptsRes.data as LaundryReceipt[]) ?? [];

  const received_totals: Record<string, number> = {};
  const damaged_totals: Record<string, number> = {};
  const lost_totals: Record<string, number> = {};
  for (const r of receipts) {
    for (const it of r.items_json ?? []) {
      received_totals[it.item_name] = (received_totals[it.item_name] ?? 0) + (it.received_now ?? 0);
      const dmg = Number(it.damaged_qty !== undefined ? it.damaged_qty : (it.damaged_lost ?? 0));
      const lost = Number(it.lost_qty ?? 0);
      damaged_totals[it.item_name] = (damaged_totals[it.item_name] ?? 0) + dmg;
      lost_totals[it.item_name] = (lost_totals[it.item_name] ?? 0) + lost;
    }
  }
  let total_sent = 0, total_received = 0, total_damaged = 0, total_lost = 0, total_pending = 0;
  for (const it of items) {
    total_sent += it.sent_qty;
    const recv = it.total_received !== undefined ? Number(it.total_received) : (received_totals[it.item_name] ?? 0);
    const dmg = it.total_damaged !== undefined ? Number(it.total_damaged) : (damaged_totals[it.item_name] ?? 0);
    const lost = it.total_lost !== undefined ? Number(it.total_lost) : (lost_totals[it.item_name] ?? 0);
    total_received += recv;
    total_damaged += dmg;
    total_lost += lost;
    total_pending += Math.max(0, it.sent_qty - recv - dmg - lost);
  }
  return { ...dispatch, items, receipts, received_totals, damaged_totals, lost_totals, total_sent, total_received, total_damaged, total_lost, total_pending };
};

export const saveDispatch = async (params: {
  dispatch_date: string;
  vendor_id: string | null;
  vendor_name: string;
  challan_no: string;
  expected_return_date: string | null;
  remarks: string;
  sent_by: string;
  items: Array<{ linen_item_id: string | null; item_name: string; sent_qty: number; rate_per_piece: number; amount: number }>;
}): Promise<LaundryDispatch> => {
  const res = await apiFetch('/api/laundry/dispatches', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (res?.success && res.dispatch) return res.dispatch;
  throw new Error(res?.error || 'Failed to create dispatch');
};

export const deleteDispatch = async (id: string): Promise<void> => {
  const hotelId = getCurrentHotelId();
  // Ensure no receipts exist
  const { count } = await supabase
    .from('laundry_receipts')
    .select('id', { count: 'exact', head: true })
    .eq('dispatch_id', id)
    .eq('hotel_id', hotelId);
  if (count && count > 0) {
    throw new Error('Cannot delete a dispatch that already has received transactions.');
  }

  await supabase.from('laundry_dispatch_items').delete().eq('dispatch_id', id).eq('hotel_id', hotelId);
  const { error } = await supabase.from('laundry_dispatches').delete().eq('id', id).eq('hotel_id', hotelId);
  if (error) throw error;
};

// ── Receiving & Invariants ──────────────────────────────────────────────────

export const saveReceipt = async (params: {
  dispatch_id: string;
  receipt_date: string;
  items: ReceiptItemEntry[];
  remarks: string;
  received_by: string;
}): Promise<void> => {
  const res = await apiFetch('/api/laundry/receive', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!res?.success) {
    throw new Error(res?.error || 'Failed to record laundry receiving');
  }
};

// ── Resolve Pending Lost/Damaged ────────────────────────────────────────────

export const resolvePendingLinen = async (params: {
  dispatch_id: string;
  dispatch_item_id: string;
  resolution_type: 'lost' | 'damaged' | 'discard';
  quantity: number;
  reason?: string;
}): Promise<void> => {
  const res = await apiFetch('/api/laundry/resolve', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!res?.success) {
    throw new Error(res?.error || 'Failed to resolve pending linen');
  }
};

// ── Billing & Finance Sync ──────────────────────────────────────────────────

export const calculateDailyBill = async (vendorId: string, date: string): Promise<{
  vendor_id: string;
  bill_date: string;
  items: LaundryBillItem[];
  total_qty: number;
  total_amount: number;
}> => {
  const res = await apiFetch(`/api/laundry/bills/calculate?vendor_id=${vendorId}&date=${date}`);
  if (res?.success && res.preview) return res.preview;
  throw new Error(res?.error || 'Failed to calculate daily bill');
};

export const generateDailyBill = async (vendorId: string, billDate: string): Promise<LaundryBill> => {
  const res = await apiFetch('/api/laundry/bills/generate', {
    method: 'POST',
    body: JSON.stringify({ vendor_id: vendorId, bill_date: billDate }),
  });
  if (res?.success && res.bill) return res.bill;
  throw new Error(res?.error || 'Failed to generate daily bill');
};

export const approveDailyBill = async (billId: string): Promise<LaundryBill> => {
  const res = await apiFetch('/api/laundry/bills/approve', {
    method: 'POST',
    body: JSON.stringify({ bill_id: billId }),
  });
  if (res?.success && res.bill) return res.bill;
  throw new Error(res?.error || 'Failed to approve laundry bill');
};

// ── Vendor Ledger & Payments ────────────────────────────────────────────────

export const recordVendorPayment = async (params: {
  vendor_id: string;
  payment_date: string;
  amount: number;
  payment_mode: 'Cash' | 'Bank' | 'UPI' | 'Credit';
  reference_no?: string;
  notes?: string;
}): Promise<LaundryVendorPayment> => {
  const res = await apiFetch('/api/laundry/payments', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (res?.success && res.payment) return res.payment;
  throw new Error(res?.error || 'Failed to record payment');
};

export const getVendorLedger = async (vendorId: string, fromDate?: string, toDate?: string): Promise<VendorLedgerResult> => {
  const params = new URLSearchParams({ vendor_id: vendorId });
  if (fromDate) params.set('fromDate', fromDate);
  if (toDate) params.set('toDate', toDate);

  const res = await apiFetch(`/api/laundry/vendor-ledger?${params.toString()}`);
  if (res?.success && res.ledger) return res.ledger;
  throw new Error(res?.error || 'Failed to load vendor ledger');
};

// ── WhatsApp Daily Statement ────────────────────────────────────────────────

export const getDailyStatementData = async (vendorId: string, date: string): Promise<any> => {
  const res = await apiFetch(`/api/laundry/statement?vendor_id=${vendorId}&date=${date}`);
  if (res?.success && res.statement) return res.statement;
  throw new Error(res?.error || 'Failed to generate statement data');
};

export const sendDailyWhatsAppStatement = async (params: {
  vendor_id: string;
  date: string;
  recipient_phone?: string;
}): Promise<any> => {
  const res = await apiFetch('/api/laundry/statement/whatsapp', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return res;
};

// ── Composite Dashboard ─────────────────────────────────────────────────────

export const getLaundryDashboard = async (selectedDate: string): Promise<LaundryDashboardData> => {
  const res = await apiFetch(`/api/laundry/dashboard?date=${selectedDate}`);
  if (res?.success) {
    return {
      selected_date: res.selected_date,
      total_linen_stock: res.total_linen_stock || 0,
      available_in_hotel: res.available_in_hotel || 0,
      at_laundry: res.at_laundry || 0,
      damaged_lost: res.damaged_lost || 0,
      today_sent: res.today_sent || 0,
      today_received: res.today_received || 0,
      today_bill: res.today_bill || 0,
      vendor_due: res.vendor_due || 0,
      linen_items: res.linen_items || [],
      vendors: res.vendors || [],
      dispatches: res.dispatches || [],
    };
  }
  throw new Error(res?.error || 'Failed to load laundry dashboard');
};

// ── Default linen item master presets ───────────────────────────────────────
export const DEFAULT_LINEN_ITEMS = [
  'Bedsheet', 'Pillow Cover', 'Bath Towel', 'Hand Towel', 'Bath Mat',
  'Duvet Cover', 'Pillow Protector', 'Blanket', 'Curtain', 'Restaurant Napkin', 'Other',
];

export const LINEN_CATEGORIES = ['Bed Linen', 'Bath Linen', 'Restaurant Linen', 'Other'];
