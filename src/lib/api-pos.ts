import { supabase } from './supabase';
import { getCurrentHotelId } from './api';
import type {
  PosMenuCategory, PosMenuCategoryInput, PosMenuItem, PosMenuItemInput,
  PosArea, PosAreaInput, PosTable, PosTableInput, PosTableStatus,
  PosOrder, PosOrderItem, PosKot, PosKotItem, PosOrderType, PosOrderStatus,
  PosBill, PosPayment, BillStatus, PaymentMode,
} from './types';
import type { RoomChartEntry } from './types-reservations';

// ── Menu Categories ──

export const getPosCategories = async (): Promise<PosMenuCategory[]> => {
  const { data, error } = await supabase
    .from('pos_menu_categories')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('display_order', { ascending: true });
  if (error) throw error;
  return (data as PosMenuCategory[]) ?? [];
};

export const upsertPosCategory = async (
  input: PosMenuCategoryInput,
  id?: string,
): Promise<PosMenuCategory> => {
  if (id) {
    const { data, error } = await supabase
      .from('pos_menu_categories')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as PosMenuCategory;
  }
  const { data, error } = await supabase
    .from('pos_menu_categories')
    .insert({ ...input, hotel_id: getCurrentHotelId() })
    .select('*')
    .single();
  if (error) throw error;
  return data as PosMenuCategory;
};

export const deletePosCategory = async (id: string): Promise<void> => {
  const { error } = await supabase.from('pos_menu_categories').delete().eq('id', id);
  if (error) throw error;
};

// ── Menu Items ──

export const getPosItems = async (): Promise<PosMenuItem[]> => {
  const { data, error } = await supabase
    .from('pos_menu_items')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('display_order', { ascending: true });
  if (error) throw error;
  return (data as PosMenuItem[]) ?? [];
};

export const upsertPosItem = async (
  input: PosMenuItemInput,
  id?: string,
): Promise<PosMenuItem> => {
  if (id) {
    const { data, error } = await supabase
      .from('pos_menu_items')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as PosMenuItem;
  }
  const { data, error } = await supabase
    .from('pos_menu_items')
    .insert({ ...input, hotel_id: getCurrentHotelId() })
    .select('*')
    .single();
  if (error) throw error;
  return data as PosMenuItem;
};

export const deletePosItem = async (id: string): Promise<void> => {
  const { error } = await supabase.from('pos_menu_items').delete().eq('id', id);
  if (error) throw error;
};

// ── Areas ──

export const getPosAreas = async (): Promise<PosArea[]> => {
  const { data, error } = await supabase
    .from('pos_areas')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('display_order', { ascending: true });
  if (error) throw error;
  return (data as PosArea[]) ?? [];
};

export const upsertPosArea = async (
  input: PosAreaInput,
  id?: string,
): Promise<PosArea> => {
  if (id) {
    const { data, error } = await supabase
      .from('pos_areas')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as PosArea;
  }
  const { data, error } = await supabase
    .from('pos_areas')
    .insert({ ...input, hotel_id: getCurrentHotelId() })
    .select('*')
    .single();
  if (error) throw error;
  return data as PosArea;
};

export const deletePosArea = async (id: string): Promise<void> => {
  const { error } = await supabase.from('pos_areas').delete().eq('id', id);
  if (error) throw error;
};

// ── Tables ──

export const getPosTables = async (): Promise<PosTable[]> => {
  const { data, error } = await supabase
    .from('pos_tables')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('display_order', { ascending: true });
  if (error) throw error;
  return (data as PosTable[]) ?? [];
};

export const upsertPosTable = async (
  input: PosTableInput,
  id?: string,
): Promise<PosTable> => {
  if (id) {
    const { data, error } = await supabase
      .from('pos_tables')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as PosTable;
  }
  const { data, error } = await supabase
    .from('pos_tables')
    .insert({ ...input, hotel_id: getCurrentHotelId() })
    .select('*')
    .single();
  if (error) throw error;
  return data as PosTable;
};

export const deletePosTable = async (id: string): Promise<void> => {
  const { error } = await supabase.from('pos_tables').delete().eq('id', id);
  if (error) throw error;
};

export const setPosTableStatus = async (id: string, status: PosTableStatus): Promise<PosTable> => {
  const { data, error } = await supabase
    .from('pos_tables')
    .update({ current_status: status })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as PosTable;
};

// ── POS setting ──

export const getPosEnabled = async (): Promise<boolean> => {
  const { data, error } = await supabase
    .from('hotel_settings')
    .select('restaurant_pos_enabled')
    .eq('id', getCurrentHotelId())
    .maybeSingle();
  if (error) throw error;
  return (data as { restaurant_pos_enabled: boolean } | null)?.restaurant_pos_enabled ?? false;
};

export const setPosEnabled = async (enabled: boolean): Promise<void> => {
  const { error } = await supabase
    .from('hotel_settings')
    .update({ restaurant_pos_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('id', getCurrentHotelId());
  if (error) throw error;
};

// ── In-house rooms for Room Service ──

export interface InHouseRoom {
  entry_id: string;
  room_no: string;
  guest_name: string;
}

export const getInHouseRooms = async (): Promise<InHouseRoom[]> => {
  const { data, error } = await supabase
    .from('room_chart_entries')
    .select('id, room_no, guest_name')
    .eq('hotel_id', getCurrentHotelId())
    .is('checked_out_at', null)
    .order('room_no', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Pick<RoomChartEntry, 'id' | 'room_no' | 'guest_name'>[]).map((r) => ({
    entry_id: r.id,
    room_no: r.room_no,
    guest_name: r.guest_name ?? '',
  }));
};

// ── Running order for a table (to avoid duplicates) ──

export const getRunningOrderByTable = async (tableId: string): Promise<PosOrder | null> => {
  const { data, error } = await supabase
    .from('pos_orders')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .eq('table_id', tableId)
    .in('status', ['draft', 'open', 'kot_sent'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as PosOrder) ?? null;
};

export const getOrderItems = async (orderId: string): Promise<PosOrderItem[]> => {
  const { data, error } = await supabase
    .from('pos_order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as PosOrderItem[]) ?? [];
};

// ── Order number & KOT number generation ──

async function nextOrderNumber(): Promise<string> {
  const { data, error } = await supabase
    .from('pos_orders')
    .select('order_number')
    .eq('hotel_id', getCurrentHotelId())
    .order('order_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const last = (data as { order_number: string } | null)?.order_number;
  const n = last ? parseInt(last.replace(/\D/g, ''), 10) || 0 : 0;
  return `ORD-${String(n + 1).padStart(4, '0')}`;
}

async function nextKotNumber(): Promise<string> {
  const { data, error } = await supabase
    .from('pos_kots')
    .select('kot_number')
    .eq('hotel_id', getCurrentHotelId())
    .order('kot_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const last = (data as { kot_number: string } | null)?.kot_number;
  const n = last ? parseInt(last.replace(/\D/g, ''), 10) || 0 : 0;
  return `KOT-${String(n + 1).padStart(4, '0')}`;
}

// ── Save order + items ──

export interface SaveOrderInput {
  order_type: PosOrderType;
  table_id?: string | null;
  room_chart_entry_id?: string | null;
  room_no?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  guest_count?: number | null;
  waiter_name?: string | null;
  subtotal: number;
  discount_amount: number;
  discount_type?: string | null;
  discount_value?: number | null;
  gst_amount: number;
  grand_total: number;
  notes?: string | null;
  items: Array<{
    menu_item_id: string | null;
    name: string;
    is_veg: boolean;
    rate: number;
    gst_percent: number;
    quantity: number;
    line_total: number;
    note?: string | null;
  }>;
  status?: PosOrderStatus;
  existing_order_id?: string;
}

export const savePosOrder = async (input: SaveOrderInput): Promise<PosOrder> => {
  const hotelId = getCurrentHotelId();
  const status = input.status ?? 'open';
  let orderId = input.existing_order_id;

  const orderPayload = {
    hotel_id: hotelId,
    order_number: orderId ? undefined : await nextOrderNumber(),
    order_type: input.order_type,
    status,
    table_id: input.table_id ?? null,
    room_chart_entry_id: input.room_chart_entry_id ?? null,
    room_no: input.room_no ?? null,
    guest_name: input.guest_name ?? null,
    guest_phone: input.guest_phone ?? null,
    guest_count: input.guest_count ?? null,
    waiter_name: input.waiter_name ?? null,
    subtotal: input.subtotal,
    discount_amount: input.discount_amount,
    discount_type: input.discount_type ?? null,
    discount_value: input.discount_value ?? null,
    gst_amount: input.gst_amount,
    grand_total: input.grand_total,
    notes: input.notes ?? null,
  };

  if (orderId) {
    const { data, error } = await supabase
      .from('pos_orders')
      .update({ ...orderPayload, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select('*')
      .single();
    if (error) throw error;
    // Replace items: delete old, insert new
    await supabase.from('pos_order_items').delete().eq('order_id', orderId);
  } else {
    const { data, error } = await supabase
      .from('pos_orders')
      .insert(orderPayload)
      .select('*')
      .single();
    if (error) throw error;
    orderId = (data as PosOrder).id;
    return data as PosOrder;
  }

  // Fetch back the order
  const { data: orderData, error: orderErr } = await supabase
    .from('pos_orders')
    .select('*')
    .eq('id', orderId)
    .single();
  if (orderErr) throw orderErr;
  return orderData as PosOrder;
};

// ── Send KOT ──

export interface SendKotResult {
  order: PosOrder;
  kot: PosKot;
}

export const sendKot = async (
  orderId: string,
  items: Array<{
    order_item_id: string;
    name: string;
    quantity: number;
    note?: string | null;
    is_veg: boolean;
  }>,
): Promise<SendKotResult> => {
  const hotelId = getCurrentHotelId();
  const kotNum = await nextKotNumber();

  // 1. Create KOT record
  const { data: kotData, error: kotErr } = await supabase
    .from('pos_kots')
    .insert({ hotel_id: hotelId, kot_number: kotNum, order_id: orderId, kot_status: 'sent' })
    .select('*')
    .single();
  if (kotErr) throw kotErr;
  const kot = kotData as PosKot;

  // 2. Create KOT items
  if (items.length > 0) {
    const kotItems = items.map((it) => ({
      hotel_id: hotelId,
      kot_id: kot.id,
      order_item_id: it.order_item_id,
      name: it.name,
      quantity: it.quantity,
      note: it.note ?? null,
      is_veg: it.is_veg,
    }));
    const { error: kiErr } = await supabase.from('pos_kot_items').insert(kotItems);
    if (kiErr) throw kiErr;

    // 3. Mark order items with kot_id
    const itemIds = items.map((it) => it.order_item_id);
    const { error: updErr } = await supabase
      .from('pos_order_items')
      .update({ kot_id: kot.id })
      .in('id', itemIds);
    if (updErr) throw updErr;
  }

  // 4. Update order status to kot_sent
  const { data: orderData, error: orderErr } = await supabase
    .from('pos_orders')
    .update({ status: 'kot_sent', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .select('*')
    .single();
  if (orderErr) throw orderErr;

  return { order: orderData as PosOrder, kot };
};

// ── Save order with items (combined) ──

export const saveOrderWithItems = async (
  input: SaveOrderInput,
): Promise<PosOrder> => {
  const hotelId = getCurrentHotelId();
  let orderId = input.existing_order_id;
  const status = input.status ?? 'open';

  const orderPayload = {
    hotel_id: hotelId,
    order_type: input.order_type,
    status,
    table_id: input.table_id ?? null,
    room_chart_entry_id: input.room_chart_entry_id ?? null,
    room_no: input.room_no ?? null,
    guest_name: input.guest_name ?? null,
    guest_phone: input.guest_phone ?? null,
    guest_count: input.guest_count ?? null,
    waiter_name: input.waiter_name ?? null,
    subtotal: input.subtotal,
    discount_amount: input.discount_amount,
    discount_type: input.discount_type ?? null,
    discount_value: input.discount_value ?? null,
    gst_amount: input.gst_amount,
    grand_total: input.grand_total,
    notes: input.notes ?? null,
  };

  if (orderId) {
    const { error } = await supabase
      .from('pos_orders')
      .update({ ...orderPayload, updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) throw error;
    // Replace items
    await supabase.from('pos_order_items').delete().eq('order_id', orderId);
  } else {
    const orderNumber = await nextOrderNumber();
    const { data, error } = await supabase
      .from('pos_orders')
      .insert({ ...orderPayload, order_number: orderNumber })
      .select('*')
      .single();
    if (error) throw error;
    orderId = (data as PosOrder).id;
  }

  // Insert items
  if (input.items.length > 0) {
    const itemRows = input.items.map((it) => ({
      hotel_id: hotelId,
      order_id: orderId,
      menu_item_id: it.menu_item_id,
      name: it.name,
      is_veg: it.is_veg,
      rate: it.rate,
      gst_percent: it.gst_percent,
      quantity: it.quantity,
      line_total: it.line_total,
      note: it.note ?? null,
    }));
    const { error: itemErr } = await supabase.from('pos_order_items').insert(itemRows);
    if (itemErr) throw itemErr;
  }

  // Fetch back
  const { data: saved, error: fetchErr } = await supabase
    .from('pos_orders')
    .select('*')
    .eq('id', orderId)
    .single();
  if (fetchErr) throw fetchErr;
  return saved as PosOrder;
};

// ── Send KOT for new order (save + KOT in one flow) ──

export const saveAndSendKot = async (
  input: SaveOrderInput,
): Promise<SendKotResult> => {
  const order = await saveOrderWithItems(input);

  // Fetch the saved items to get their IDs
  const savedItems = await getOrderItems(order.id);

  const kotItems = savedItems.map((it) => ({
    order_item_id: it.id,
    name: it.name,
    quantity: it.quantity,
    note: it.note,
    is_veg: it.is_veg,
  }));

  const { kot } = await sendKot(order.id, kotItems);

  // Update order status to kot_sent (sendKot already does this)
  return { order: { ...order, status: 'kot_sent' }, kot };
};

// ── KDS: Kitchen Display System ──

import type { KotStatus } from './types';

export interface KotWithDetails extends PosKot {
  order_type: PosOrderType;
  table_name: string | null;
  room_no: string | null;
  guest_name: string | null;
  items: PosKotItem[];
}

export const getActiveKots = async (): Promise<KotWithDetails[]> => {
  const hotelId = getCurrentHotelId();
  // Fetch active KOTs (not served, not cancelled)
  const { data: kots, error } = await supabase
    .from('pos_kots')
    .select('*')
    .eq('hotel_id', hotelId)
    .in('kot_status', ['sent', 'preparing', 'ready'])
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!kots || kots.length === 0) return [];

  const kotList = kots as PosKot[];

  // Fetch related orders
  const orderIds = [...new Set(kotList.map((k) => k.order_id))];
  const { data: orders, error: orderErr } = await supabase
    .from('pos_orders')
    .select('id, order_type, table_id, room_no, guest_name')
    .in('id', orderIds);
  if (orderErr) throw orderErr;
  const orderMap = new Map((orders ?? []).map((o: any) => [o.id, o]));

  // Fetch table names for dine-in
  const tableIds = [...new Set((orders ?? []).filter((o: any) => o.table_id).map((o: any) => o.table_id))];
  let tableMap = new Map<string, string>();
  if (tableIds.length > 0) {
    const { data: tbls } = await supabase.from('pos_tables').select('id, name').in('id', tableIds);
    tableMap = new Map((tbls ?? []).map((t: any) => [t.id, t.name]));
  }

  // Fetch KOT items
  const kotIds = kotList.map((k) => k.id);
  const { data: allItems, error: itemErr } = await supabase
    .from('pos_kot_items')
    .select('*')
    .in('kot_id', kotIds)
    .order('created_at', { ascending: true });
  if (itemErr) throw itemErr;
  const itemsByKot = new Map<string, PosKotItem[]>();
  for (const it of (allItems as PosKotItem[]) ?? []) {
    const arr = itemsByKot.get(it.kot_id) ?? [];
    arr.push(it);
    itemsByKot.set(it.kot_id, arr);
  }

  return kotList.map((k) => {
    const o = orderMap.get(k.order_id) as any;
    return {
      ...k,
      order_type: o?.order_type ?? 'dine_in',
      table_name: o?.table_id ? tableMap.get(o.table_id) ?? null : null,
      room_no: o?.room_no ?? null,
      guest_name: o?.guest_name ?? null,
      items: itemsByKot.get(k.id) ?? [],
    };
  });
};

export const updateKotStatus = async (kotId: string, status: KotStatus): Promise<PosKot> => {
  const { data, error } = await supabase
    .from('pos_kots')
    .update({ kot_status: status, kitchen_status_updated_at: new Date().toISOString() })
    .eq('id', kotId)
    .select('*')
    .single();
  if (error) throw error;
  return data as PosKot;
};

export const cancelKot = async (kotId: string, reason: string): Promise<PosKot> => {
  const { data, error } = await supabase
    .from('pos_kots')
    .update({ kot_status: 'cancelled', cancelled_reason: reason, kitchen_status_updated_at: new Date().toISOString() })
    .eq('id', kotId)
    .select('*')
    .single();
  if (error) throw error;
  return data as PosKot;
};

export const setKotPriority = async (kotId: string, priority: 'normal' | 'urgent'): Promise<PosKot> => {
  const { data, error } = await supabase
    .from('pos_kots')
    .update({ priority })
    .eq('id', kotId)
    .select('*')
    .single();
  if (error) throw error;
  return data as PosKot;
};

// ── Additional KOT for an existing order ──

export const sendAdditionalKot = async (
  orderId: string,
  items: Array<{
    order_item_id: string;
    name: string;
    quantity: number;
    note?: string | null;
    is_veg: boolean;
  }>,
): Promise<SendKotResult> => {
  // Reuse sendKot — it creates a new KOT record under the same order
  return sendKot(orderId, items);
};

// ── KOT history for an order ──

export const getKotsForOrder = async (orderId: string): Promise<PosKot[]> => {
  const { data, error } = await supabase
    .from('pos_kots')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as PosKot[]) ?? [];
};

// ── Kitchen summary stats ──

export interface KitchenSummary {
  newCount: number;
  preparingCount: number;
  readyCount: number;
  avgPrepMinutes: number | null;
}

export const getKitchenSummary = async (): Promise<KitchenSummary> => {
  const hotelId = getCurrentHotelId();
  const { data, error } = await supabase
    .from('pos_kots')
    .select('kot_status, kitchen_status_updated_at, created_at')
    .eq('hotel_id', hotelId)
    .in('kot_status', ['sent', 'preparing', 'ready', 'served']);
  if (error) throw error;

  const kots = (data ?? []) as any[];
  const newCount = kots.filter((k) => k.kot_status === 'sent').length;
  const preparingCount = kots.filter((k) => k.kot_status === 'preparing').length;
  const readyCount = kots.filter((k) => k.kot_status === 'ready').length;

  // Avg prep time: from created_at to kitchen_status_updated_at for served/ready/preparing
  const completed = kots.filter((k) => k.kitchen_status_updated_at && ['served', 'ready', 'preparing'].includes(k.kot_status));
  let avgPrepMinutes: number | null = null;
  if (completed.length > 0) {
    const totalMs = completed.reduce((sum, k) => {
      const ms = new Date(k.kitchen_status_updated_at).getTime() - new Date(k.created_at).getTime();
      return sum + Math.max(0, ms);
    }, 0);
    avgPrepMinutes = Math.round((totalMs / completed.length) / 60000);
  }

  return { newCount, preparingCount, readyCount, avgPrepMinutes };
};

// ── Billing & Payment ──

import { addFolioCharge } from './api-frontoffice';
import type { FolioChargeInput } from './types';

// ── Bill number generation (property-unique, retry-safe) ──

async function nextBillNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `POS-${year}-`;
  const { data, error } = await supabase
    .from('pos_bills')
    .select('bill_number')
    .eq('hotel_id', getCurrentHotelId())
    .like('bill_number', `${prefix}%`)
    .order('bill_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const last = (data as { bill_number: string } | null)?.bill_number;
  const n = last ? parseInt(last.replace(prefix, ''), 10) || 0 : 0;
  return `${prefix}${String(n + 1).padStart(6, '0')}`;
}

// ── Running orders (open bills / unbilled orders) ──

export interface RunningOrder {
  id: string;
  order_number: string;
  order_type: PosOrderType;
  status: PosOrderStatus;
  table_name: string | null;
  room_no: string | null;
  guest_name: string | null;
  grand_total: number;
  created_at: string;
  bill_id: string | null;
  bill_number: string | null;
  bill_status: BillStatus | null;
}

export const getRunningOrders = async (): Promise<RunningOrder[]> => {
  const hotelId = getCurrentHotelId();
  // Fetch orders that are open or kot_sent (not completed/cancelled)
  const { data: orders, error } = await supabase
    .from('pos_orders')
    .select('*')
    .eq('hotel_id', hotelId)
    .in('status', ['open', 'kot_sent'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!orders || orders.length === 0) return [];

  const orderList = orders as PosOrder[];

  // Fetch table names
  const tableIds = [...new Set(orderList.map((o) => o.table_id).filter(Boolean))] as string[];
  let tableMap = new Map<string, string>();
  if (tableIds.length > 0) {
    const { data: tbls } = await supabase.from('pos_tables').select('id, name').in('id', tableIds);
    tableMap = new Map((tbls ?? []).map((t: any) => [t.id, t.name]));
  }

  // Fetch bills for these orders
  const orderIds = orderList.map((o) => o.id);
  const { data: bills, error: billErr } = await supabase
    .from('pos_bills')
    .select('*')
    .in('order_id', orderIds)
    .order('created_at', { ascending: false });
  if (billErr) throw billErr;
  const billByOrder = new Map<string, PosBill>();
  for (const b of (bills as PosBill[]) ?? []) {
    if (!billByOrder.has(b.order_id)) billByOrder.set(b.order_id, b);
  }

  return orderList.map((o) => {
    const bill = billByOrder.get(o.id);
    return {
      id: o.id,
      order_number: o.order_number,
      order_type: o.order_type,
      status: o.status,
      table_name: o.table_id ? tableMap.get(o.table_id) ?? null : null,
      room_no: o.room_no,
      guest_name: o.guest_name,
      grand_total: o.grand_total,
      created_at: o.created_at,
      bill_id: bill?.id ?? null,
      bill_number: bill?.bill_number ?? null,
      bill_status: bill?.status ?? null,
    };
  });
};

// ── Get bill for an order ──

export const getBillForOrder = async (orderId: string): Promise<PosBill | null> => {
  const { data, error } = await supabase
    .from('pos_bills')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as PosBill) ?? null;
};

// ── Get payments for a bill ──

export const getPaymentsForBill = async (billId: string): Promise<PosPayment[]> => {
  const { data, error } = await supabase
    .from('pos_payments')
    .select('*')
    .eq('bill_id', billId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as PosPayment[]) ?? [];
};

// ── Create or update bill ──

export interface SaveBillInput {
  order_id: string;
  subtotal: number;
  discount_amount: number;
  discount_type: 'flat' | 'percent' | null;
  discount_value: number | null;
  discount_reason: string | null;
  gst_amount: number;
  grand_total: number;
  existing_bill_id?: string;
}

export const saveBill = async (input: SaveBillInput): Promise<PosBill> => {
  const hotelId = getCurrentHotelId();
  const payload = {
    hotel_id: hotelId,
    order_id: input.order_id,
    status: 'billed' as BillStatus,
    subtotal: input.subtotal,
    discount_amount: input.discount_amount,
    discount_type: input.discount_type,
    discount_value: input.discount_value,
    discount_reason: input.discount_reason,
    gst_amount: input.gst_amount,
    grand_total: input.grand_total,
  };

  if (input.existing_bill_id) {
    const { data, error } = await supabase
      .from('pos_bills')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', input.existing_bill_id)
      .select('*')
      .single();
    if (error) throw error;
    return data as PosBill;
  }

  // Retry loop for bill_number collision (concurrent inserts)
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const billNumber = await nextBillNumber();
    const { data, error } = await supabase
      .from('pos_bills')
      .insert({ ...payload, bill_number: billNumber })
      .select('*')
      .single();
    if (!error) return data as PosBill;
    lastErr = error;
    // If it's a unique violation, retry with next number
    if (error.code !== '23505') throw error;
  }
  throw lastErr instanceof Error ? lastErr : new Error('Failed to generate unique bill number');
};

// ── Record payment ──

export interface RecordPaymentInput {
  bill_id: string;
  order_id: string;
  payment_mode: PaymentMode;
  amount: number;
  reference_no?: string | null;
  room_chart_entry_id?: string | null;
}

export const recordPayment = async (input: RecordPaymentInput): Promise<PosPayment> => {
  const hotelId = getCurrentHotelId();
  const { data, error } = await supabase
    .from('pos_payments')
    .insert({
      hotel_id: hotelId,
      bill_id: input.bill_id,
      order_id: input.order_id,
      payment_mode: input.payment_mode,
      amount: input.amount,
      reference_no: input.reference_no ?? null,
      room_chart_entry_id: input.room_chart_entry_id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as PosPayment;
};

// ── Post to Room (creates folio charge, no cash collection) ──

export const postToRoom = async (
  billId: string,
  orderId: string,
  billNumber: string,
  amount: number,
  roomChartEntryId: string,
  guestName: string,
  roomNo: string,
): Promise<{ payment: PosPayment; folioChargeId: string }> => {
  const hotelId = getCurrentHotelId();

  // 1. Create folio charge via existing PMS path
  const folioInput: FolioChargeInput = {
    entry_id: roomChartEntryId,
    charge_type: 'Room Service',
    description: `Restaurant POS Bill ${billNumber} — Room ${roomNo} — ${guestName}`,
    amount,
    quantity: 1,
  };
  const folioCharge = await addFolioCharge(folioInput);

  // 2. Record pos_payment with post_to_room mode, linked to folio
  const { data, error } = await supabase
    .from('pos_payments')
    .insert({
      hotel_id: hotelId,
      bill_id: billId,
      order_id: orderId,
      payment_mode: 'post_to_room',
      amount,
      room_chart_entry_id: roomChartEntryId,
      folio_charge_id: folioCharge.id,
    })
    .select('*')
    .single();
  if (error) throw error;

  return { payment: data as PosPayment, folioChargeId: folioCharge.id };
};

// ── Complete bill (mark paid, update order + table) ──

export const completeBill = async (
  billId: string,
  orderId: string,
  tableId: string | null,
): Promise<void> => {
  // 1. Mark bill as paid
  const { error: billErr } = await supabase
    .from('pos_bills')
    .update({ status: 'paid', updated_at: new Date().toISOString() })
    .eq('id', billId);
  if (billErr) throw billErr;

  // 2. Mark order as completed
  const { error: orderErr } = await supabase
    .from('pos_orders')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', orderId);
  if (orderErr) throw orderErr;

  // 3. Set table to cleaning (will be set to available by staff)
  if (tableId) {
    try {
      await setPosTableStatus(tableId, 'cleaning');
    } catch { /* non-fatal */ }
  }
};

// ── Complete bill as posted to room ──

export const completeBillPostedToRoom = async (
  billId: string,
  orderId: string,
): Promise<void> => {
  const { error: billErr } = await supabase
    .from('pos_bills')
    .update({ status: 'posted_to_room', updated_at: new Date().toISOString() })
    .eq('id', billId);
  if (billErr) throw billErr;

  const { error: orderErr } = await supabase
    .from('pos_orders')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', orderId);
  if (orderErr) throw orderErr;
};

// ── Void bill ──

export const voidBill = async (billId: string, reason: string, userName: string): Promise<PosBill> => {
  const { data, error } = await supabase
    .from('pos_bills')
    .update({
      status: 'void',
      void_reason: reason,
      voided_by: userName,
      voided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', billId)
    .select('*')
    .single();
  if (error) throw error;
  return data as PosBill;
};

// ── Delete payments for a bill (for re-editing before completion) ──

export const deletePaymentsForBill = async (billId: string): Promise<void> => {
  const { error } = await supabase
    .from('pos_payments')
    .delete()
    .eq('bill_id', billId);
  if (error) throw error;
};

// ── POS Analytics & Reporting ──

export type DateRange = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';

export interface PosDateRange { start: string; end: string; }

export const posDateRange = (range: DateRange, customStart?: string, customEnd?: string): PosDateRange => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const startOfDay = (d: Date) => d.toISOString().slice(0, 10) + 'T00:00:00';
  const endOfDay = (d: Date) => d.toISOString().slice(0, 10) + 'T23:59:59';

  switch (range) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case 'this_week': {
      const ws = new Date(now); ws.setDate(ws.getDate() - ws.getDay());
      return { start: startOfDay(ws), end: endOfDay(now) };
    }
    case 'this_month': {
      const ms = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: startOfDay(ms), end: endOfDay(now) };
    }
    case 'custom': {
      const s = customStart ? new Date(customStart) : new Date(now);
      const e = customEnd ? new Date(customEnd) : new Date(now);
      return { start: startOfDay(s), end: endOfDay(e) };
    }
  }
};

// ── Dashboard summary (today only, efficient) ──

export interface PosDashboardStats {
  todaySales: number;
  todayOrders: number;
  avgOrderValue: number;
  openOrders: number;
  occupiedTables: number;
  roomServiceOrders: number;
  takeawayOrders: number;
  discountAmount: number;
  voidAmount: number;
  paymentBreakdown: { cash: number; upi: number; card: number; bank: number; postToRoom: number };
  orderTypeBreakdown: { dineIn: number; roomService: number; takeaway: number };
  hourlySales: { hour: string; sales: number }[];
  topItemsByQty: { name: string; quantity: number; revenue: number }[];
  topItemsByRevenue: { name: string; quantity: number; revenue: number }[];
  recentOrders: {
    id: string; order_number: string; table_name: string | null; room_no: string | null;
    order_type: PosOrderType; grand_total: number; status: PosOrderStatus; created_at: string;
  }[];
}

export const getPosDashboardStats = async (): Promise<PosDashboardStats> => {
  const hotelId = getCurrentHotelId();
  const now = new Date();
  const todayStart = now.toISOString().slice(0, 10) + 'T00:00:00';
  const todayEnd = now.toISOString().slice(0, 10) + 'T23:59:59';

  // 1. Today's orders (not cancelled) — select only needed columns
  const { data: todayOrderRows, error: orderErr } = await supabase
    .from('pos_orders')
    .select('id, order_number, order_type, status, table_id, room_no, grand_total, discount_amount, created_at')
    .eq('hotel_id', hotelId)
    .gte('created_at', todayStart)
    .lte('created_at', todayEnd)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });
  if (orderErr) throw orderErr;
  const todayOrders = (todayOrderRows ?? []) as any[];

  // 2. Open orders (all time, not completed/cancelled)
  const { data: openOrderRows, error: openErr } = await supabase
    .from('pos_orders')
    .select('id')
    .eq('hotel_id', hotelId)
    .in('status', ['open', 'kot_sent']);
  if (openErr) throw openErr;
  const openOrders = (openOrderRows ?? []).length;

  // 3. Occupied tables
  const { data: tableRows, error: tblErr } = await supabase
    .from('pos_tables')
    .select('current_status')
    .eq('hotel_id', hotelId)
    .eq('current_status', 'occupied');
  if (tblErr) throw tblErr;
  const occupiedTables = (tableRows ?? []).length;

  // 4. Today's bills (for void amount, discount, payment data)
  const todayOrderIds = todayOrders.map((o) => o.id);
  let todayBills: any[] = [];
  let todayPayments: any[] = [];
  if (todayOrderIds.length > 0) {
    const [billsRes, paysRes] = await Promise.all([
      supabase.from('pos_bills').select('id, order_id, status, discount_amount, grand_total, void_reason')
        .in('order_id', todayOrderIds),
      supabase.from('pos_payments').select('id, bill_id, payment_mode, amount')
        .in('order_id', todayOrderIds),
    ]);
    if (billsRes.error) throw billsRes.error;
    if (paysRes.error) throw paysRes.error;
    todayBills = (billsRes.data ?? []) as any[];
    todayPayments = (paysRes.data ?? []) as any[];
  }

  // 5. Table names for recent orders
  const tableIds = [...new Set(todayOrders.map((o) => o.table_id).filter(Boolean))] as string[];
  let tableMap = new Map<string, string>();
  if (tableIds.length > 0) {
    const { data: tbls } = await supabase.from('pos_tables').select('id, name').in('id', tableIds);
    tableMap = new Map((tbls ?? []).map((t: any) => [t.id, t.name]));
  }

  // ── Compute stats ──
  const voidBills = todayBills.filter((b) => b.status === 'void');
  const voidAmount = voidBills.reduce((s, b) => s + (b.grand_total ?? 0), 0);
  const activeBills = todayBills.filter((b) => b.status !== 'void');
  const billByOrder = new Map<string, any>();
  for (const b of activeBills) if (!billByOrder.has(b.order_id)) billByOrder.set(b.order_id, b);

  // Today sales = sum of grand_total from non-voided bills (billed/paid/posted_to_room)
  const todaySales = activeBills.reduce((s, b) => s + (b.grand_total ?? 0), 0);
  const discountAmount = activeBills.reduce((s, b) => s + (b.discount_amount ?? 0), 0);

  // Payment breakdown — only from non-voided bills
  const activeBillIds = new Set(activeBills.map((b) => b.id));
  const relevantPayments = todayPayments.filter((p) => activeBillIds.has(p.bill_id));
  const paymentBreakdown = {
    cash: relevantPayments.filter((p) => p.payment_mode === 'cash').reduce((s, p) => s + p.amount, 0),
    upi: relevantPayments.filter((p) => p.payment_mode === 'upi').reduce((s, p) => s + p.amount, 0),
    card: relevantPayments.filter((p) => p.payment_mode === 'card').reduce((s, p) => s + p.amount, 0),
    bank: relevantPayments.filter((p) => p.payment_mode === 'bank').reduce((s, p) => s + p.amount, 0),
    postToRoom: relevantPayments.filter((p) => p.payment_mode === 'post_to_room').reduce((s, p) => s + p.amount, 0),
  };

  // Order type breakdown (today, non-cancelled)
  const orderTypeBreakdown = {
    dineIn: todayOrders.filter((o) => o.order_type === 'dine_in').length,
    roomService: todayOrders.filter((o) => o.order_type === 'room_service').length,
    takeaway: todayOrders.filter((o) => o.order_type === 'takeaway').length,
  };

  // Hourly sales
  const hourlyMap = new Map<string, number>();
  for (const b of activeBills) {
    const hour = new Date(b.created_at ?? todayOrders.find((o) => o.id === b.order_id)?.created_at).getHours();
    const key = `${hour}:00`;
    hourlyMap.set(key, (hourlyMap.get(key) ?? 0) + (b.grand_total ?? 0));
  }
  // Fill all hours from 6am to midnight for restaurant hours
  const hourlySales: { hour: string; sales: number }[] = [];
  for (let h = 6; h <= 23; h++) {
    const key = `${h}:00`;
    hourlySales.push({ hour: key, sales: hourlyMap.get(key) ?? 0 });
  }

  // Top items — fetch today's order items
  let topItemsByQty: { name: string; quantity: number; revenue: number }[] = [];
  let topItemsByRevenue: { name: string; quantity: number; revenue: number }[] = [];
  if (todayOrderIds.length > 0) {
    const { data: itemRows, error: itemErr } = await supabase
      .from('pos_order_items')
      .select('name, quantity, line_total, order_id')
      .in('order_id', todayOrderIds);
    if (itemErr) throw itemErr;
    // Filter to items from non-voided bills only
    const voidedOrderIds = new Set(voidBills.map((b) => b.order_id));
    const activeItems = (itemRows ?? []).filter((it: any) => !voidedOrderIds.has(it.order_id));
    const itemMap = new Map<string, { quantity: number; revenue: number }>();
    for (const it of activeItems as any[]) {
      const ex = itemMap.get(it.name) ?? { quantity: 0, revenue: 0 };
      ex.quantity += it.quantity;
      ex.revenue += it.line_total;
      itemMap.set(it.name, ex);
    }
    const itemArr = Array.from(itemMap.entries()).map(([name, v]) => ({ name, ...v }));
    topItemsByQty = [...itemArr].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    topItemsByRevenue = [...itemArr].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }

  // Recent orders (latest 8)
  const recentOrders = todayOrders.slice(0, 8).map((o) => ({
    id: o.id,
    order_number: o.order_number,
    table_name: o.table_id ? tableMap.get(o.table_id) ?? null : null,
    room_no: o.room_no ?? null,
    order_type: o.order_type as PosOrderType,
    grand_total: o.grand_total ?? 0,
    status: o.status as PosOrderStatus,
    created_at: o.created_at,
  }));

  return {
    todaySales,
    todayOrders: todayOrders.length,
    avgOrderValue: todayOrders.length > 0 ? todaySales / todayOrders.length : 0,
    openOrders,
    occupiedTables,
    roomServiceOrders: orderTypeBreakdown.roomService,
    takeawayOrders: orderTypeBreakdown.takeaway,
    discountAmount,
    voidAmount,
    paymentBreakdown,
    orderTypeBreakdown,
    hourlySales,
    topItemsByQty,
    topItemsByRevenue,
    recentOrders,
  };
};

// ── Report data (date-range filtered) ──

export interface PosReportData {
  salesSummary: {
    grossSales: number; discount: number; tax: number; netSales: number;
    paidAmount: number; postedToRoom: number; voidAmount: number;
  };
  paymentModeReport: { cash: number; upi: number; card: number; bank: number; postToRoom: number };
  orderTypeReport: { dineIn: number; roomService: number; takeaway: number };
  itemSales: { name: string; category: string | null; qtySold: number; grossRevenue: number; netRevenue: number }[];
  categorySales: { category: string; qtySold: number; revenue: number }[];
  tableSales: { table: string; orders: number; sales: number; avgBill: number }[];
  roomServiceReport: { roomNo: string; guest: string; orderCount: number; amount: number; paidNow: number; postedToRoom: number }[];
  discountReport: { billNumber: string; discount: number; reason: string | null; user: string | null; dateTime: string }[];
  voidReport: { billNumber: string; orderNumber: string; amount: number; reason: string | null; user: string | null; dateTime: string }[];
}

export const getPosReportData = async (range: PosDateRange): Promise<PosReportData> => {
  const hotelId = getCurrentHotelId();

  // 1. Fetch orders in range (non-cancelled)
  const { data: orderRows, error: orderErr } = await supabase
    .from('pos_orders')
    .select('id, order_number, order_type, status, table_id, room_no, guest_name, grand_total, discount_amount, gst_amount, created_at')
    .eq('hotel_id', hotelId)
    .gte('created_at', range.start)
    .lte('created_at', range.end)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });
  if (orderErr) throw orderErr;
  const orders = (orderRows ?? []) as any[];

  // 2. Fetch bills for these orders
  const orderIds = orders.map((o) => o.id);
  let bills: any[] = [];
  let payments: any[] = [];
  let itemRows: any[] = [];
  if (orderIds.length > 0) {
    const [billsRes, paysRes, itemsRes] = await Promise.all([
      supabase.from('pos_bills').select('id, bill_number, order_id, status, subtotal, discount_amount, discount_type, discount_value, discount_reason, gst_amount, grand_total, void_reason, voided_by, voided_at, created_at')
        .in('order_id', orderIds),
      supabase.from('pos_payments').select('id, bill_id, order_id, payment_mode, amount, reference_no')
        .in('order_id', orderIds),
      supabase.from('pos_order_items').select('id, order_id, menu_item_id, name, quantity, line_total, rate, gst_percent')
        .in('order_id', orderIds),
    ]);
    if (billsRes.error) throw billsRes.error;
    if (paysRes.error) throw paysRes.error;
    if (itemsRes.error) throw itemsRes.error;
    bills = (billsRes.data ?? []) as any[];
    payments = (paysRes.data ?? []) as any[];
    itemRows = (itemsRes.data ?? []) as any[];
  }

  // 3. Fetch menu items for category join
  const menuItemIds = [...new Set(itemRows.map((it) => it.menu_item_id).filter(Boolean))] as string[];
  let menuItemMap = new Map<string, string>();
  if (menuItemIds.length > 0) {
    const { data: menuItems } = await supabase.from('pos_menu_items')
      .select('id, category_id').in('id', menuItemIds);
    const catIds = [...new Set((menuItems ?? []).map((m: any) => m.category_id).filter(Boolean))] as string[];
    let catMap = new Map<string, string>();
    if (catIds.length > 0) {
      const { data: cats } = await supabase.from('pos_menu_categories').select('id, name').in('id', catIds);
      catMap = new Map((cats ?? []).map((c: any) => [c.id, c.name]));
    }
    menuItemMap = new Map((menuItems ?? []).map((m: any) => [m.id, catMap.get(m.category_id) ?? 'Uncategorized']));
  }

  // 4. Fetch table names
  const tableIds = [...new Set(orders.map((o) => o.table_id).filter(Boolean))] as string[];
  let tableMap = new Map<string, string>();
  if (tableIds.length > 0) {
    const { data: tbls } = await supabase.from('pos_tables').select('id, name').in('id', tableIds);
    tableMap = new Map((tbls ?? []).map((t: any) => [t.id, t.name]));
  }

  // ── Compute ──
  const voidBills = bills.filter((b) => b.status === 'void');
  const activeBills = bills.filter((b) => b.status !== 'void');
  const voidedOrderIds = new Set(voidBills.map((b) => b.order_id));
  const activeBillIds = new Set(activeBills.map((b) => b.id));
  const relevantPayments = payments.filter((p) => activeBillIds.has(p.bill_id));

  // Sales summary
  const grossSales = activeBills.reduce((s, b) => s + (b.subtotal ?? 0), 0);
  const discount = activeBills.reduce((s, b) => s + (b.discount_amount ?? 0), 0);
  const tax = activeBills.reduce((s, b) => s + (b.gst_amount ?? 0), 0);
  const netSales = grossSales - discount + tax;
  const paidAmount = relevantPayments.filter((p) => p.payment_mode !== 'post_to_room').reduce((s, p) => s + p.amount, 0);
  const postedToRoom = relevantPayments.filter((p) => p.payment_mode === 'post_to_room').reduce((s, p) => s + p.amount, 0);
  const voidAmount = voidBills.reduce((s, b) => s + (b.grand_total ?? 0), 0);

  // Payment mode report
  const paymentModeReport = {
    cash: relevantPayments.filter((p) => p.payment_mode === 'cash').reduce((s, p) => s + p.amount, 0),
    upi: relevantPayments.filter((p) => p.payment_mode === 'upi').reduce((s, p) => s + p.amount, 0),
    card: relevantPayments.filter((p) => p.payment_mode === 'card').reduce((s, p) => s + p.amount, 0),
    bank: relevantPayments.filter((p) => p.payment_mode === 'bank').reduce((s, p) => s + p.amount, 0),
    postToRoom: relevantPayments.filter((p) => p.payment_mode === 'post_to_room').reduce((s, p) => s + p.amount, 0),
  };

  // Order type report (by revenue from active bills)
  const orderTypeMap = new Map<string, number>();
  for (const b of activeBills) {
    const o = orders.find((o) => o.id === b.order_id);
    if (!o) continue;
    orderTypeMap.set(o.order_type, (orderTypeMap.get(o.order_type) ?? 0) + (b.grand_total ?? 0));
  }
  const orderTypeReport = {
    dineIn: orderTypeMap.get('dine_in') ?? 0,
    roomService: orderTypeMap.get('room_service') ?? 0,
    takeaway: orderTypeMap.get('takeaway') ?? 0,
  };

  // Item sales (exclude voided orders)
  const itemAgg = new Map<string, { name: string; category: string | null; qtySold: number; grossRevenue: number; netRevenue: number }>();
  for (const it of itemRows) {
    if (voidedOrderIds.has(it.order_id)) continue;
    const cat = it.menu_item_id ? menuItemMap.get(it.menu_item_id) ?? 'Uncategorized' : 'Uncategorized';
    const ex = itemAgg.get(it.name) ?? { name: it.name, category: cat, qtySold: 0, grossRevenue: 0, netRevenue: 0 };
    ex.qtySold += it.quantity;
    ex.grossRevenue += it.rate * it.quantity;
    ex.netRevenue += it.line_total;
    itemAgg.set(it.name, ex);
  }
  const itemSales = Array.from(itemAgg.values()).sort((a, b) => b.netRevenue - a.netRevenue);

  // Category sales
  const catAgg = new Map<string, { category: string; qtySold: number; revenue: number }>();
  for (const it of itemRows) {
    if (voidedOrderIds.has(it.order_id)) continue;
    const cat = it.menu_item_id ? menuItemMap.get(it.menu_item_id) ?? 'Uncategorized' : 'Uncategorized';
    const ex = catAgg.get(cat) ?? { category: cat, qtySold: 0, revenue: 0 };
    ex.qtySold += it.quantity;
    ex.revenue += it.line_total;
    catAgg.set(cat, ex);
  }
  const categorySales = Array.from(catAgg.values()).sort((a, b) => b.revenue - a.revenue);

  // Table sales
  const tableAgg = new Map<string, { table: string; orders: number; sales: number }>();
  for (const b of activeBills) {
    const o = orders.find((o) => o.id === b.order_id);
    if (!o || !o.table_id) continue;
    const tname = tableMap.get(o.table_id) ?? 'Unknown';
    const ex = tableAgg.get(tname) ?? { table: tname, orders: 0, sales: 0 };
    ex.orders += 1;
    ex.sales += b.grand_total ?? 0;
    tableAgg.set(tname, ex);
  }
  const tableSales = Array.from(tableAgg.values()).map((t) => ({
    ...t, avgBill: t.orders > 0 ? t.sales / t.orders : 0,
  })).sort((a, b) => b.sales - a.sales);

  // Room service report
  const rsAgg = new Map<string, { roomNo: string; guest: string; orderCount: number; amount: number; paidNow: number; postedToRoom: number }>();
  for (const o of orders) {
    if (o.order_type !== 'room_service' || !o.room_no) continue;
    const key = o.room_no;
    const ob = activeBills.find((b) => b.order_id === o.id);
    const amt = ob?.grand_total ?? o.grand_total ?? 0;
    const ex = rsAgg.get(key) ?? { roomNo: o.room_no, guest: o.guest_name ?? '', orderCount: 0, amount: 0, paidNow: 0, postedToRoom: 0 };
    ex.orderCount += 1;
    ex.amount += amt;
    // Check payments for this order
    const opays = relevantPayments.filter((p) => p.order_id === o.id);
    ex.paidNow += opays.filter((p) => p.payment_mode !== 'post_to_room').reduce((s, p) => s + p.amount, 0);
    ex.postedToRoom += opays.filter((p) => p.payment_mode === 'post_to_room').reduce((s, p) => s + p.amount, 0);
    rsAgg.set(key, ex);
  }
  const roomServiceReport = Array.from(rsAgg.values()).sort((a, b) => b.amount - a.amount);

  // Discount report
  const discountReport = activeBills
    .filter((b) => (b.discount_amount ?? 0) > 0)
    .map((b) => ({
      billNumber: b.bill_number,
      discount: b.discount_amount ?? 0,
      reason: b.discount_reason ?? null,
      user: null as string | null, // bill doesn't store user; voided_by only for voids
      dateTime: b.created_at,
    }))
    .sort((a, b) => b.discount - a.discount);

  // Void report
  const voidReport = voidBills.map((b) => ({
    billNumber: b.bill_number,
    orderNumber: orders.find((o) => o.id === b.order_id)?.order_number ?? '',
    amount: b.grand_total ?? 0,
    reason: b.void_reason ?? null,
    user: b.voided_by ?? null,
    dateTime: b.voided_at ?? b.created_at,
  })).sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

  return {
    salesSummary: { grossSales, discount, tax, netSales, paidAmount, postedToRoom, voidAmount },
    paymentModeReport,
    orderTypeReport,
    itemSales,
    categorySales,
    tableSales,
    roomServiceReport,
    discountReport,
    voidReport,
  };
};

// ── Remove all POS test data for the current hotel ──
// Deletes only rows where is_test_data = true; real POS data is untouched.
// Order matters: child tables first, then parent tables.

export const removePosTestData = async (): Promise<{ deleted: Record<string, number> }> => {
  const hotelId = getCurrentHotelId();
  const deleted: Record<string, number> = {};

  const tables = [
    'pos_kot_items',
    'pos_kots',
    'pos_payments',
    'pos_bills',
    'pos_order_items',
    'pos_orders',
    'pos_tables',
    'pos_areas',
    'pos_menu_items',
    'pos_menu_categories',
  ] as const;

  for (const t of tables) {
    const { count, error } = await supabase
      .from(t)
      .delete({ count: 'exact' })
      .eq('hotel_id', hotelId)
      .eq('is_test_data', true);
    if (error) throw error;
    deleted[t] = count ?? 0;
  }

  return { deleted };
};
