import { supabase } from './supabase';
import { getCurrentHotelId } from './api';

// ── Types ──

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
  created_at: string;
  updated_at: string;
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
  status: 'Sent' | 'Partially Received' | 'Completed' | 'Short/Lost';
  total_amount: number;
  created_at: string;
  updated_at: string;
  items?: LaundryDispatchItem[];
}

export interface ReceiptItemEntry {
  item_name: string;
  linen_item_id: string | null;
  sent_qty: number;
  received_now: number;
  damaged_lost: number;
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
  total_sent: number;
  total_received: number;
  total_damaged: number;
  total_pending: number;
}

// ── Vendors ──

export const getLaundryVendors = async (): Promise<LaundryVendor[]> => {
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
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  if (id) {
    const { data, error } = await supabase
      .from('laundry_vendors')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as LaundryVendor;
  }
  const { data, error } = await supabase
    .from('laundry_vendors')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as LaundryVendor;
};

export const deleteLaundryVendor = async (id: string): Promise<void> => {
  const { error } = await supabase.from('laundry_vendors').delete().eq('id', id);
  if (error) throw error;
};

// ── Linen Items ──

export const getLinenItems = async (): Promise<LinenItem[]> => {
  const { data, error } = await supabase
    .from('linen_items')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('item_name', { ascending: true });
  if (error) throw error;
  return (data as LinenItem[]) ?? [];
};

export const saveLinenItem = async (
  input: Omit<LinenItem, 'id' | 'hotel_id' | 'created_at' | 'updated_at'>,
  id?: string
): Promise<LinenItem> => {
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  if (id) {
    const { data, error } = await supabase
      .from('linen_items')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as LinenItem;
  }
  const { data, error } = await supabase
    .from('linen_items')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as LinenItem;
};

export const deleteLinenItem = async (id: string): Promise<void> => {
  const { error } = await supabase.from('linen_items').delete().eq('id', id);
  if (error) throw error;
};

// ── Dispatches ──

export const getDispatches = async (fromDate?: string, toDate?: string): Promise<LaundryDispatch[]> => {
  let query = supabase
    .from('laundry_dispatches')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('dispatch_date', { ascending: false });
  if (fromDate) query = query.gte('dispatch_date', fromDate);
  if (toDate) query = query.lte('dispatch_date', toDate);
  const { data, error } = await query;
  if (error) throw error;
  return (data as LaundryDispatch[]) ?? [];
};

export const getDispatchDetail = async (dispatchId: string): Promise<DispatchWithReceipts> => {
  const [dispRes, itemsRes, receiptsRes] = await Promise.all([
    supabase.from('laundry_dispatches').select('*').eq('id', dispatchId).maybeSingle(),
    supabase.from('laundry_dispatch_items').select('*').eq('dispatch_id', dispatchId).order('created_at', { ascending: true }),
    supabase.from('laundry_receipts').select('*').eq('dispatch_id', dispatchId).order('receipt_date', { ascending: true }),
  ]);
  if (dispRes.error) throw dispRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (receiptsRes.error) throw receiptsRes.error;
  const dispatch = dispRes.data as LaundryDispatch;
  const items = (itemsRes.data as LaundryDispatchItem[]) ?? [];
  const receipts = (receiptsRes.data as LaundryReceipt[]) ?? [];

  const received_totals: Record<string, number> = {};
  const damaged_totals: Record<string, number> = {};
  for (const r of receipts) {
    for (const it of r.items_json ?? []) {
      received_totals[it.item_name] = (received_totals[it.item_name] ?? 0) + (it.received_now ?? 0);
      damaged_totals[it.item_name] = (damaged_totals[it.item_name] ?? 0) + (it.damaged_lost ?? 0);
    }
  }
  let total_sent = 0, total_received = 0, total_damaged = 0, total_pending = 0;
  for (const it of items) {
    total_sent += it.sent_qty;
    const recv = received_totals[it.item_name] ?? 0;
    const dmg = damaged_totals[it.item_name] ?? 0;
    total_received += recv;
    total_damaged += dmg;
    total_pending += Math.max(0, it.sent_qty - recv - dmg);
  }
  return { ...dispatch, items, receipts, received_totals, damaged_totals, total_sent, total_received, total_damaged, total_pending };
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
  const hotelId = getCurrentHotelId();
  const total_amount = params.items.reduce((s, i) => s + (i.amount ?? 0), 0);

  // Generate dispatch_no: LD-YYYYMMDD-XXX
  const datePart = params.dispatch_date.replace(/-/g, '');
  const { count } = await supabase
    .from('laundry_dispatches')
    .select('id', { count: 'exact', head: true })
    .eq('hotel_id', hotelId)
    .eq('dispatch_date', params.dispatch_date);
  const seq = String((count ?? 0) + 1).padStart(3, '0');
  const dispatch_no = `LD-${datePart}-${seq}`;

  const { data: dispatch, error: dispErr } = await supabase
    .from('laundry_dispatches')
    .insert({
      hotel_id: hotelId,
      dispatch_no,
      dispatch_date: params.dispatch_date,
      vendor_id: params.vendor_id,
      vendor_name: params.vendor_name,
      challan_no: params.challan_no,
      expected_return_date: params.expected_return_date,
      remarks: params.remarks,
      sent_by: params.sent_by,
      status: 'Sent',
      total_amount,
    })
    .select('*')
    .single();
  if (dispErr) throw dispErr;
  const disp = dispatch as LaundryDispatch;

  if (params.items.length > 0) {
    const itemPayloads = params.items.map((i) => ({
      hotel_id: hotelId,
      dispatch_id: disp.id,
      linen_item_id: i.linen_item_id,
      item_name: i.item_name,
      sent_qty: i.sent_qty,
      rate_per_piece: i.rate_per_piece,
      amount: i.amount,
    }));
    const { error: itemErr } = await supabase.from('laundry_dispatch_items').insert(itemPayloads);
    if (itemErr) throw itemErr;
  }
  return disp;
};

export const deleteDispatch = async (id: string): Promise<void> => {
  await supabase.from('laundry_dispatch_items').delete().eq('dispatch_id', id);
  await supabase.from('laundry_receipts').delete().eq('dispatch_id', id);
  const { error } = await supabase.from('laundry_dispatches').delete().eq('id', id);
  if (error) throw error;
};

// ── Receipts ──

export const saveReceipt = async (params: {
  dispatch_id: string;
  receipt_date: string;
  items: ReceiptItemEntry[];
  remarks: string;
  received_by: string;
}): Promise<void> => {
  const hotelId = getCurrentHotelId();
  const { error } = await supabase.from('laundry_receipts').insert({
    hotel_id: hotelId,
    dispatch_id: params.dispatch_id,
    receipt_date: params.receipt_date,
    items_json: params.items,
    remarks: params.remarks,
    received_by: params.received_by,
  });
  if (error) throw error;

  // Recompute dispatch status
  const detail = await getDispatchDetail(params.dispatch_id);
  let newStatus: 'Sent' | 'Partially Received' | 'Completed' | 'Short/Lost' = 'Sent';
  const hasDamage = detail.total_damaged > 0;
  const allAccounted = detail.items.every((it) => {
    const recv = detail.received_totals[it.item_name] ?? 0;
    const dmg = detail.damaged_totals[it.item_name] ?? 0;
    return recv + dmg >= it.sent_qty;
  });
  if (allAccounted) {
    newStatus = hasDamage ? 'Short/Lost' : 'Completed';
  } else if (detail.total_received > 0 || hasDamage) {
    newStatus = 'Partially Received';
  }
  await supabase
    .from('laundry_dispatches')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', params.dispatch_id);
};

// ── Dashboard composite ──

export interface LaundryDashboardData {
  dispatches: LaundryDispatch[];
  dispatchItems: LaundryDispatchItem[];
  receipts: LaundryReceipt[];
  vendors: LaundryVendor[];
  linenItems: LinenItem[];
  totalSent: number;
  totalReceived: number;
  totalPending: number;
  totalDamaged: number;
  dateCost: number;
  mtdCost: number;
  vendorOutstanding: number;
}

export const getLaundryDashboard = async (selectedDate: string): Promise<LaundryDashboardData> => {
  const hotelId = getCurrentHotelId();
  const [dispRes, itemsRes, receiptsRes, vendorsRes, linenRes] = await Promise.all([
    supabase.from('laundry_dispatches').select('*').eq('hotel_id', hotelId).order('dispatch_date', { ascending: false }),
    supabase.from('laundry_dispatch_items').select('*').eq('hotel_id', hotelId),
    supabase.from('laundry_receipts').select('*').eq('hotel_id', hotelId),
    supabase.from('laundry_vendors').select('*').eq('hotel_id', hotelId).order('vendor_name', { ascending: true }),
    supabase.from('linen_items').select('*').eq('hotel_id', hotelId).order('item_name', { ascending: true }),
  ]);
  if (dispRes.error) throw dispRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (receiptsRes.error) throw receiptsRes.error;
  if (vendorsRes.error) throw vendorsRes.error;
  if (linenRes.error) throw linenRes.error;

  const dispatches = (dispRes.data as LaundryDispatch[]) ?? [];
  const dispatchItems = (itemsRes.data as LaundryDispatchItem[]) ?? [];
  const receipts = (receiptsRes.data as LaundryReceipt[]) ?? [];
  const vendors = (vendorsRes.data as LaundryVendor[]) ?? [];
  const linenItems = (linenRes.data as LinenItem[]) ?? [];

  // Build received/damaged totals per dispatch item name
  const receivedMap = new Map<string, number>();
  const damagedMap = new Map<string, number>();
  for (const r of receipts) {
    for (const it of r.items_json ?? []) {
      const key = `${r.dispatch_id}|${it.item_name}`;
      receivedMap.set(key, (receivedMap.get(key) ?? 0) + (it.received_now ?? 0));
      damagedMap.set(key, (damagedMap.get(key) ?? 0) + (it.damaged_lost ?? 0));
    }
  }

  let totalSent = 0, totalReceived = 0, totalDamaged = 0;
  for (const it of dispatchItems) {
    totalSent += it.sent_qty;
    const key = `${it.dispatch_id}|${it.item_name}`;
    totalReceived += receivedMap.get(key) ?? 0;
    totalDamaged += damagedMap.get(key) ?? 0;
  }
  const totalPending = Math.max(0, totalSent - totalReceived - totalDamaged);

  // Date cost = total_amount of dispatches on selectedDate
  const dateCost = dispatches
    .filter((d) => d.dispatch_date === selectedDate)
    .reduce((s, d) => s + (d.total_amount ?? 0), 0);

  // MTD cost
  const monthStart = selectedDate.slice(0, 7) + '-01';
  const mtdCost = dispatches
    .filter((d) => d.dispatch_date >= monthStart && d.dispatch_date <= selectedDate)
    .reduce((s, d) => s + (d.total_amount ?? 0), 0);

  // Vendor outstanding = total_amount of dispatches not fully completed
  const vendorOutstanding = dispatches
    .filter((d) => d.status !== 'Completed' && d.status !== 'Short/Lost')
    .reduce((s, d) => s + (d.total_amount ?? 0), 0);

  return {
    dispatches, dispatchItems, receipts, vendors, linenItems,
    totalSent, totalReceived, totalPending, totalDamaged,
    dateCost, mtdCost, vendorOutstanding,
  };
};

// ── Default linen items (seed suggestions) ──
export const DEFAULT_LINEN_ITEMS = [
  'Bedsheet', 'Pillow Cover', 'Bath Towel', 'Hand Towel', 'Bath Mat',
  'Duvet Cover', 'Pillow Protector', 'Blanket', 'Curtain', 'Restaurant Napkin', 'Other',
];

export const LINEN_CATEGORIES = ['Bed Linen', 'Bath Linen', 'Restaurant Linen', 'Other'];
