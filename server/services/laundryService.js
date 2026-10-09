/**
 * HOTEL MANTRI — PRODUCTION LAUNDRY & LINEN SERVICE
 * 
 * Authoritative business logic, stock ledger, dispatch & partial receiving,
 * billing engine, vendor ledger, Finance expense integration, and WhatsApp statement.
 * 
 * Rules:
 * - 100% hotel scoped (multi-tenant isolation)
 * - Server-side authoritative calculations
 * - Authoritative stock formula:
 *     Total Active Stock = Opening + Stock Added - Permanently Lost/Discarded
 *     At Laundry / Pending = Total Sent - Total Received - Quantity Resolved Lost/Damaged
 *     Available in Hotel = Total Active Stock - At Laundry - Hotel Damaged
 * - Billing strictly based on APPROVED BILLABLE RECEIVED quantity (never sent, never pending)
 * - Financial due and physical pending are completely decoupled
 * - Finance expense integration is idempotent (via reference_type and reference_id)
 * - No fake WhatsApp success
 */

import { supabaseServiceRole } from '../supabaseClient.js';
import whatsappService from './whatsappService.js';

// Helper to sanitize UUID fields (prevents 22P02 on postgres uuid columns)
const toUuidOrNull = (val) => {
  if (typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim())) {
    return val.trim();
  }
  return null;
};

// ── Helper to resolve hotel details ──────────────────────────────────────────
export const getHotelDetails = async (hotelId) => {
  const { data, error } = await supabaseServiceRole
    .from('hotels')
    .select('id, hotel_name, address, mobile, admin_email')
    .eq('id', hotelId)
    .maybeSingle();
  if (error) console.error('[LaundryService] Failed to load hotel:', error);
  return data
    ? {
        id: data.id,
        name: data.hotel_name || 'Hotel Mantri',
        hotel_name: data.hotel_name || 'Hotel Mantri',
        address: data.address || '',
        phone: data.mobile || '',
        email: data.admin_email || '',
      }
    : { id: hotelId, name: 'Hotel Mantri', hotel_name: 'Hotel Mantri', city: '', address: '', phone: '', email: '' };
};

// ══════════════════════════════════════════════════════════════════════════════
// 1. LINEN ITEM MASTER & STOCK METRICS
// ══════════════════════════════════════════════════════════════════════════════

export const getLinenItemsWithStock = async (hotelId) => {
  if (!hotelId) throw new Error('Hotel context is required');

  // 1. Fetch active linen items
  const { data: items, error: itemsErr } = await supabaseServiceRole
    .from('linen_items')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('item_name', { ascending: true });
  if (itemsErr) throw itemsErr;

  // 2. Fetch stock movements for hotel
  const { data: movements, error: movErr } = await supabaseServiceRole
    .from('linen_stock_movements')
    .select('linen_item_id, movement_type, quantity')
    .eq('hotel_id', hotelId);
  if (movErr) throw movErr;

  // 3. Fetch dispatch items
  const { data: dispatchItems, error: dispErr } = await supabaseServiceRole
    .from('laundry_dispatch_items')
    .select('linen_item_id, item_name, sent_qty, total_received, total_damaged, total_lost')
    .eq('hotel_id', hotelId);
  if (dispErr) throw dispErr;

  // 4. Calculate per-item stock metrics
  const stockByItem = new Map();

  for (const item of items || []) {
    stockByItem.set(item.id, {
      total_active_stock: 0,
      stock_added: 0,
      permanently_discarded: 0,
      total_sent: 0,
      total_received: 0,
      total_resolved: 0,
      at_laundry: 0,
      available_in_hotel: 0,
      damaged_lost: 0,
    });
  }

  // Aggregate stock movements
  for (const m of movements || []) {
    let stat = stockByItem.get(m.linen_item_id);
    if (!stat) continue;
    const qty = Number(m.quantity) || 0;

    switch (m.movement_type) {
      case 'opening':
      case 'addition':
      case 'adjustment_add':
        stat.stock_added += qty;
        break;
      case 'adjustment_sub':
      case 'discard':
      case 'lost_at_laundry':
      case 'damaged_at_laundry':
        stat.permanently_discarded += qty;
        stat.damaged_lost += qty;
        break;
      case 'correction':
        // Correction entries adjust directly
        stat.stock_added += qty;
        break;
      default:
        break;
    }
  }

  // Aggregate dispatches
  for (const di of dispatchItems || []) {
    // Match by linen_item_id or fallback to item_name
    let itemId = di.linen_item_id;
    if (!itemId) {
      const match = (items || []).find((i) => i.item_name.toLowerCase() === di.item_name.toLowerCase());
      if (match) itemId = match.id;
    }
    if (!itemId || !stockByItem.has(itemId)) continue;

    const stat = stockByItem.get(itemId);
    const sent = Number(di.sent_qty) || 0;
    const recv = Number(di.total_received) || 0;
    const dmg = Number(di.total_damaged) || 0;
    const lost = Number(di.total_lost) || 0;

    stat.total_sent += sent;
    stat.total_received += recv;
    stat.total_resolved += (dmg + lost);
  }

  // Final authoritative calculation per item
  const result = (items || []).map((item) => {
    const stat = stockByItem.get(item.id) || {
      stock_added: 0,
      permanently_discarded: 0,
      total_sent: 0,
      total_received: 0,
      total_resolved: 0,
      damaged_lost: 0,
    };

    // Total Active Stock = Added - Permanently Discarded
    const totalActive = Math.max(0, stat.stock_added - stat.permanently_discarded);
    // At Laundry / Pending = Sent - Received - Resolved
    const atLaundry = Math.max(0, stat.total_sent - stat.total_received - stat.total_resolved);
    // Available in Hotel = Total Active Stock - At Laundry
    const available = Math.max(0, totalActive - atLaundry);

    return {
      ...item,
      total_active_stock: totalActive,
      available_in_hotel: available,
      at_laundry: atLaundry,
      damaged_lost: stat.damaged_lost,
      total_sent: stat.total_sent,
      total_received: stat.total_received,
    };
  });

  return result;
};

export const saveLinenItem = async (hotelId, itemData, userId = '') => {
  if (!hotelId) throw new Error('Hotel context is required');
  const { id, item_name, category, unit = 'Pieces', standard_rate = 0, initial_stock = 0 } = itemData;

  if (!item_name || !item_name.trim()) throw new Error('Linen item name is required');

  // Prevent duplicate names within same hotel
  const nameQuery = supabaseServiceRole
    .from('linen_items')
    .select('id')
    .eq('hotel_id', hotelId)
    .ilike('item_name', item_name.trim())
    .eq('is_active', true);

  if (id) nameQuery.neq('id', id);
  const { data: dup } = await nameQuery;
  if (dup && dup.length > 0) {
    throw new Error(`A linen item named "${item_name.trim()}" already exists in this hotel.`);
  }

  let savedItem;
  if (id) {
    const { data, error } = await supabaseServiceRole
      .from('linen_items')
      .update({
        item_name: item_name.trim(),
        category: category || 'Bed Linen',
        unit: unit || 'Pieces',
        standard_rate: Number(standard_rate) || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .select('*')
      .single();
    if (error) throw error;
    savedItem = data;
  } else {
    const { data, error } = await supabaseServiceRole
      .from('linen_items')
      .insert({
        hotel_id: hotelId,
        item_name: item_name.trim(),
        category: category || 'Bed Linen',
        unit: unit || 'Pieces',
        standard_rate: Number(standard_rate) || 0,
        is_active: true,
        total_stock: Number(initial_stock) || 0,
      })
      .select('*')
      .single();
    if (error) throw error;
    savedItem = data;

    // If opening stock was specified, create auditable movement record
    if (Number(initial_stock) > 0) {
      await recordStockMovement(hotelId, {
        linen_item_id: savedItem.id,
        movement_date: new Date().toISOString().slice(0, 10),
        movement_type: 'opening',
        quantity: Number(initial_stock),
        reason: 'Initial opening stock creation',
        created_by: userId,
      });
    }
  }

  return savedItem;
};

export const seedStandardLinenItems = async (hotelId, userId = '') => {
  if (!hotelId) throw new Error('Hotel context is required');

  const { data: existing } = await supabaseServiceRole
    .from('linen_items')
    .select('item_name')
    .eq('hotel_id', hotelId);

  const existingNames = new Set((existing || []).map((i) => i.item_name.toLowerCase().trim()));

  const defaults = [
    { item_name: 'Bedsheet', category: 'Bed Linen', unit: 'Pieces', standard_rate: 15, initial_stock: 60 },
    { item_name: 'Pillow Cover', category: 'Bed Linen', unit: 'Pieces', standard_rate: 8, initial_stock: 80 },
    { item_name: 'Bath Towel', category: 'Bath Linen', unit: 'Pieces', standard_rate: 12, initial_stock: 50 },
    { item_name: 'Hand Towel', category: 'Bath Linen', unit: 'Pieces', standard_rate: 8, initial_stock: 40 },
    { item_name: 'Bath Mat', category: 'Bath Linen', unit: 'Pieces', standard_rate: 10, initial_stock: 30 },
    { item_name: 'Duvet Cover', category: 'Bed Linen', unit: 'Pieces', standard_rate: 25, initial_stock: 25 },
    { item_name: 'Blanket', category: 'Bed Linen', unit: 'Pieces', standard_rate: 40, initial_stock: 20 },
  ];

  const created = [];
  for (const def of defaults) {
    if (!existingNames.has(def.item_name.toLowerCase().trim())) {
      const item = await saveLinenItem(hotelId, def, userId);
      created.push(item);
    }
  }

  return created;
};

// ══════════════════════════════════════════════════════════════════════════════
// 2. STOCK MOVEMENTS & AUDITABLE LEDGER
// ══════════════════════════════════════════════════════════════════════════════

export const recordStockMovement = async (hotelId, movementData, userId = '') => {
  if (!hotelId) throw new Error('Hotel context is required');
  const {
    linen_item_id,
    movement_date = new Date().toISOString().slice(0, 10),
    movement_type,
    quantity,
    reason = '',
    reference_id = null,
    reference_type = '',
    created_by = userId,
  } = movementData;

  const validTypes = [
    'opening', 'addition', 'adjustment_add', 'adjustment_sub',
    'discard', 'lost_at_laundry', 'damaged_at_laundry', 'correction',
  ];
  if (!validTypes.includes(movement_type)) {
    throw new Error(`Invalid stock movement type: ${movement_type}`);
  }

  const qty = Number(quantity);
  if (isNaN(qty) || qty <= 0) {
    throw new Error('Stock movement quantity must be greater than 0.');
  }

  // Verify linen item exists and belongs to hotel
  const { data: item, error: itemErr } = await supabaseServiceRole
    .from('linen_items')
    .select('id, item_name, total_stock')
    .eq('id', linen_item_id)
    .eq('hotel_id', hotelId)
    .single();
  if (itemErr || !item) {
    throw new Error('Linen item not found or unauthorized.');
  }

  // Calculate current stock before movement
  const itemsWithStock = await getLinenItemsWithStock(hotelId);
  const currentStat = itemsWithStock.find((i) => i.id === linen_item_id);
  const beforeQty = currentStat ? currentStat.total_active_stock : 0;
  const currentAvailable = currentStat ? currentStat.available_in_hotel : 0;

  let afterQty = beforeQty;
  if (['opening', 'addition', 'adjustment_add', 'correction'].includes(movement_type)) {
    afterQty = beforeQty + qty;
  } else {
    // Subtraction / Discard: Cannot reduce below 0, and cannot reduce beyond available in hotel
    if (qty > currentAvailable) {
      throw new Error(
        `Cannot remove ${qty} pieces because only ${currentAvailable} pieces are currently available in hotel.`
      );
    }
    afterQty = Math.max(0, beforeQty - qty);
  }

  const { data: movement, error: movErr } = await supabaseServiceRole
    .from('linen_stock_movements')
    .insert({
      hotel_id: hotelId,
      linen_item_id,
      movement_date,
      movement_type,
      quantity: qty,
      before_qty: beforeQty,
      after_qty: afterQty,
      reason,
      reference_id,
      reference_type,
      created_by: created_by || userId || 'System',
    })
    .select('*')
    .single();
  if (movErr) throw movErr;

  // Sync cache column on linen_items
  await supabaseServiceRole
    .from('linen_items')
    .update({ total_stock: afterQty, updated_at: new Date().toISOString() })
    .eq('id', linen_item_id)
    .eq('hotel_id', hotelId);

  return movement;
};

export const getStockMovements = async (hotelId, filters = {}) => {
  if (!hotelId) throw new Error('Hotel context is required');
  const { linen_item_id, fromDate, toDate, limit = 100 } = filters;

  let query = supabaseServiceRole
    .from('linen_stock_movements')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (linen_item_id) query = query.eq('linen_item_id', linen_item_id);
  if (fromDate) query = query.gte('movement_date', fromDate);
  if (toDate) query = query.lte('movement_date', toDate);

  const { data, error } = await query;
  if (error) throw error;

  // Enrich with linen_item names
  const { data: allItems } = await supabaseServiceRole
    .from('linen_items')
    .select('id, item_name, category, unit')
    .eq('hotel_id', hotelId);

  const itemMap = new Map((allItems || []).map((i) => [i.id, i]));
  return (data || []).map((m) => ({
    ...m,
    linen_items: itemMap.get(m.linen_item_id) || null,
  }));
};

// ══════════════════════════════════════════════════════════════════════════════
// 3. VENDORS & VENDOR RATES
// ══════════════════════════════════════════════════════════════════════════════

export const getVendors = async (hotelId) => {
  if (!hotelId) throw new Error('Hotel context is required');
  const { data, error } = await supabaseServiceRole
    .from('laundry_vendors')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('vendor_name', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const saveVendor = async (hotelId, vendorData) => {
  if (!hotelId) throw new Error('Hotel context is required');
  const { id, vendor_name, contact_person = '', mobile_number = '', address = '', gstin = '', default_rate_type = 'Per Piece', notes = '' } = vendorData;
  if (!vendor_name || !vendor_name.trim()) throw new Error('Vendor name is required');

  if (id) {
    const { data, error } = await supabaseServiceRole
      .from('laundry_vendors')
      .update({
        vendor_name: vendor_name.trim(),
        contact_person,
        mobile_number,
        address,
        gstin,
        default_rate_type,
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabaseServiceRole
    .from('laundry_vendors')
    .insert({
      hotel_id: hotelId,
      vendor_name: vendor_name.trim(),
      contact_person,
      mobile_number,
      address,
      gstin,
      default_rate_type,
      notes,
      is_active: true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

export const getVendorRates = async (hotelId, vendorId) => {
  if (!hotelId || !vendorId) throw new Error('Hotel and Vendor are required');
  const { data, error } = await supabaseServiceRole
    .from('laundry_vendor_rates')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('vendor_id', vendorId)
    .eq('is_active', true);
  if (error) throw error;

  const { data: allItems } = await supabaseServiceRole
    .from('linen_items')
    .select('id, item_name, category')
    .eq('hotel_id', hotelId);

  const itemMap = new Map((allItems || []).map((i) => [i.id, i]));
  return (data || []).map((r) => ({
    ...r,
    linen_items: itemMap.get(r.linen_item_id) || null,
  }));
};

export const saveVendorRate = async (hotelId, { vendor_id, linen_item_id, rate_per_piece, effective_from = new Date().toISOString().slice(0, 10) }) => {
  if (!hotelId || !vendor_id || !linen_item_id) throw new Error('Missing rate parameters');
  const rate = Number(rate_per_piece);
  if (isNaN(rate) || rate < 0) throw new Error('Rate must be greater than or equal to 0');

  // Deactivate existing current rate for this item & vendor
  await supabaseServiceRole
    .from('laundry_vendor_rates')
    .update({ is_active: false, effective_to: effective_from })
    .eq('hotel_id', hotelId)
    .eq('vendor_id', vendor_id)
    .eq('linen_item_id', linen_item_id)
    .eq('is_active', true);

  // Insert new active rate
  const { data, error } = await supabaseServiceRole
    .from('laundry_vendor_rates')
    .insert({
      hotel_id: hotelId,
      vendor_id,
      linen_item_id,
      rate_per_piece: rate,
      effective_from,
      is_active: true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

// ══════════════════════════════════════════════════════════════════════════════
// 4. DISPATCH CREATION & VALIDATION
// ══════════════════════════════════════════════════════════════════════════════

export const createDispatch = async (hotelId, params, userId = '') => {
  if (!hotelId) throw new Error('Hotel context is required');
  const {
    dispatch_date = new Date().toISOString().slice(0, 10),
    vendor_id,
    vendor_name,
    challan_no = '',
    expected_return_date = null,
    remarks = '',
    sent_by = '',
    items = [],
  } = params;

  if (!items || items.length === 0) {
    throw new Error('At least one linen item must be dispatched.');
  }

  // 1. Verify available stock for each linen item
  const stockItems = await getLinenItemsWithStock(hotelId);
  const stockMap = new Map(stockItems.map((s) => [s.id, s]));

  for (const it of items) {
    const qty = Number(it.sent_qty);
    if (isNaN(qty) || qty <= 0) {
      throw new Error(`Invalid sent quantity for item "${it.item_name}". Must be > 0.`);
    }

    if (it.linen_item_id && stockMap.has(it.linen_item_id)) {
      const stockInfo = stockMap.get(it.linen_item_id);
      if (qty > stockInfo.available_in_hotel) {
        throw new Error(
          `Cannot dispatch ${qty} ${it.item_name}. Only ${stockInfo.available_in_hotel} pieces available in hotel.`
        );
      }
    }
  }

  // 2. Generate sequential dispatch_no: LD-YYYYMMDD-XXX
  const datePart = dispatch_date.replace(/-/g, '');
  const { count } = await supabaseServiceRole
    .from('laundry_dispatches')
    .select('id', { count: 'exact', head: true })
    .eq('hotel_id', hotelId)
    .eq('dispatch_date', dispatch_date);

  const seq = String((count ?? 0) + 1).padStart(3, '0');
  const dispatch_no = `LD-${datePart}-${seq}`;

  const total_amount = items.reduce((s, i) => s + ((Number(i.sent_qty) || 0) * (Number(i.rate_per_piece) || 0)), 0);

  // 3. Insert dispatch header
  const { data: dispatch, error: dispErr } = await supabaseServiceRole
    .from('laundry_dispatches')
    .insert({
      hotel_id: hotelId,
      dispatch_no,
      dispatch_date,
      vendor_id: vendor_id || null,
      vendor_name: vendor_name || '',
      challan_no,
      expected_return_date,
      remarks,
      sent_by: sent_by || userId || 'Staff',
      status: 'Sent',
      total_amount,
    })
    .select('*')
    .single();
  if (dispErr) throw dispErr;

  // 4. Insert dispatch line items with tracking columns
  const itemPayloads = items.map((i) => ({
    hotel_id: hotelId,
    dispatch_id: dispatch.id,
    linen_item_id: i.linen_item_id || null,
    item_name: i.item_name,
    sent_qty: Number(i.sent_qty) || 0,
    rate_per_piece: Number(i.rate_per_piece) || 0,
    amount: (Number(i.sent_qty) || 0) * (Number(i.rate_per_piece) || 0),
    total_received: 0,
    total_damaged: 0,
    total_lost: 0,
  }));

  const { data: insertedItems, error: itemsErr } = await supabaseServiceRole
    .from('laundry_dispatch_items')
    .insert(itemPayloads)
    .select('*');
  if (itemsErr) throw itemsErr;

  return { ...dispatch, items: insertedItems || itemPayloads };
};

// ══════════════════════════════════════════════════════════════════════════════
// 5. PARTIAL RECEIVING & VALIDATION ENGINE
// ══════════════════════════════════════════════════════════════════════════════

export const receiveLaundry = async (hotelId, params, userId = '') => {
  if (!hotelId) throw new Error('Hotel context is required');
  const {
    dispatch_id,
    receipt_date = new Date().toISOString().slice(0, 10),
    items = [], // array of { dispatch_item_id, linen_item_id, item_name, received_now, damaged_lost, is_billable, rate_applied }
    remarks = '',
    received_by = '',
  } = params;

  if (!dispatch_id) throw new Error('Dispatch ID is required.');
  if (!items || items.length === 0) throw new Error('At least one item must be received.');

  // 1. Fetch dispatch and verify hotel ownership
  const { data: dispatch, error: dispErr } = await supabaseServiceRole
    .from('laundry_dispatches')
    .select('*')
    .eq('id', dispatch_id)
    .eq('hotel_id', hotelId)
    .single();
  if (dispErr || !dispatch) {
    throw new Error('Dispatch not found or unauthorized for this hotel.');
  }

  if (dispatch.status === 'Completed' || dispatch.status === 'CLOSED') {
    throw new Error('Cannot receive against an already closed or fully resolved dispatch.');
  }

  // 2. Fetch existing dispatch items
  const { data: dispatchItems, error: diErr } = await supabaseServiceRole
    .from('laundry_dispatch_items')
    .select('*')
    .eq('dispatch_id', dispatch_id)
    .eq('hotel_id', hotelId);
  if (diErr) throw diErr;

  const diMap = new Map(dispatchItems.map((d) => [d.id, d]));
  const diByName = new Map(dispatchItems.map((d) => [d.item_name.toLowerCase(), d]));

  // 3. Validate receiving quantities against sent quantities
  const validatedItems = [];
  let totalReceiptAmount = 0;

  for (const it of items) {
    const recvNow = Number(it.received_now) || 0;
    // Support separate damaged_qty and lost_qty, falling back to damaged_lost if provided
    const dmgNow = Number(it.damaged_qty !== undefined ? it.damaged_qty : (it.damaged_lost || 0)) || 0;
    const lostNow = Number(it.lost_qty || 0) || 0;
    const totalAccounted = recvNow + dmgNow + lostNow;

    if (recvNow < 0 || dmgNow < 0 || lostNow < 0) {
      throw new Error('Received, damaged, and lost quantities cannot be negative.');
    }
    if (totalAccounted === 0) continue;

    // Find original dispatch item
    let di = null;
    if (it.dispatch_item_id && diMap.has(it.dispatch_item_id)) {
      di = diMap.get(it.dispatch_item_id);
    } else if (it.item_name && diByName.has(it.item_name.toLowerCase())) {
      di = diByName.get(it.item_name.toLowerCase());
    }

    if (!di) {
      throw new Error(`Item "${it.item_name}" does not belong to dispatch ${dispatch.dispatch_no}.`);
    }

    const sent = Number(di.sent_qty) || 0;
    const alreadyReceived = Number(di.total_received) || 0;
    const alreadyDamaged = Number(di.total_damaged) || 0;
    const alreadyLost = Number(di.total_lost) || 0;
    const alreadyAccounted = alreadyReceived + alreadyDamaged + alreadyLost;
    const outstanding = Math.max(0, sent - alreadyAccounted);

    if (totalAccounted > outstanding) {
      throw new Error(
        `Cannot account for ${totalAccounted} pieces of "${it.item_name}" (${recvNow} received, ${dmgNow} damaged, ${lostNow} lost) because only ${outstanding} remain outstanding.`
      );
    }

    const remainingPending = Math.max(0, outstanding - totalAccounted);
    const rate = Number(it.rate_applied !== undefined ? it.rate_applied : di.rate_per_piece) || 0;
    const isBillable = it.is_billable !== false;
    // Only received clean pieces are billable. Damaged, lost, and pending have ₹0 washing bill.
    const billAmount = isBillable ? (recvNow * rate) : 0;
    totalReceiptAmount += billAmount;

    validatedItems.push({
      dispatch_item_id: di.id,
      linen_item_id: di.linen_item_id,
      item_name: di.item_name,
      sent_qty: sent,
      received_now: recvNow,
      damaged_qty: dmgNow,
      lost_qty: lostNow,
      damaged_lost: dmgNow + lostNow,
      remaining_pending: remainingPending,
      is_billable: isBillable,
      rate_applied: rate,
      bill_amount: billAmount,
    });
  }

  if (validatedItems.length === 0) {
    throw new Error('At least one item must have a positive received, damaged, or lost quantity.');
  }

  // 4. Create receipt record
  const receiptJsonPayload = validatedItems.map((v) => ({
    item_name: v.item_name,
    linen_item_id: v.linen_item_id,
    sent_qty: v.sent_qty,
    received_now: v.received_now,
    damaged_qty: v.damaged_qty,
    lost_qty: v.lost_qty,
    damaged_lost: v.damaged_lost,
    remaining_pending: v.remaining_pending,
    is_billable: v.is_billable,
    rate_applied: v.rate_applied,
    bill_amount: v.bill_amount,
  }));

  const { data: receipt, error: recErr } = await supabaseServiceRole
    .from('laundry_receipts')
    .insert({
      hotel_id: hotelId,
      dispatch_id,
      receipt_date,
      items_json: receiptJsonPayload,
      remarks,
      received_by: received_by || userId || 'Staff',
    })
    .select('*')
    .single();
  if (recErr) throw recErr;

  // 5. Create normalized receiving items in laundry_receiving_items
  const receivingItemsPayload = validatedItems.map((v) => ({
    hotel_id: hotelId,
    receipt_id: receipt.id,
    dispatch_id,
    dispatch_item_id: v.dispatch_item_id,
    linen_item_id: v.linen_item_id,
    item_name: v.item_name,
    received_qty: v.received_now,
    damaged_qty: v.damaged_qty,
    lost_qty: v.lost_qty,
    is_billable: v.is_billable,
    rate_applied: v.rate_applied,
    bill_amount: v.bill_amount,
  }));

  const { error: recItemsErr } = await supabaseServiceRole
    .from('laundry_receiving_items')
    .insert(receivingItemsPayload);
  if (recItemsErr) console.warn('[LaundryService] Failed to insert normalized receiving items:', recItemsErr);

  // 6. Update tracking totals on each dispatch item and record stock movements for lost/damaged
  for (const v of validatedItems) {
    const di = diMap.get(v.dispatch_item_id);
    const newRecv = (Number(di.total_received) || 0) + v.received_now;
    const newDmg = (Number(di.total_damaged) || 0) + v.damaged_qty;
    const newLost = (Number(di.total_lost) || 0) + v.lost_qty;

    await supabaseServiceRole
      .from('laundry_dispatch_items')
      .update({
        total_received: newRecv,
        total_damaged: newDmg,
        total_lost: newLost,
      })
      .eq('id', di.id)
      .eq('hotel_id', hotelId);

    // Update in-memory copy
    di.total_received = newRecv;
    di.total_damaged = newDmg;
    di.total_lost = newLost;

    // Record stock movements for lost/damaged linen if item linked
    if (v.lost_qty > 0 && di.linen_item_id) {
      await recordStockMovement(hotelId, {
        linen_item_id: di.linen_item_id,
        movement_date: receipt_date,
        movement_type: 'lost_at_laundry',
        quantity: v.lost_qty,
        reason: `Marked lost during laundry receipt for dispatch ${dispatch.dispatch_no}`,
        reference_id: dispatch_id,
        reference_type: 'laundry_dispatch',
        created_by: received_by || userId || 'Staff',
      }).catch((err) => console.warn('[LaundryService] Failed to record lost stock movement:', err));
    }

    if (v.damaged_qty > 0 && di.linen_item_id) {
      await recordStockMovement(hotelId, {
        linen_item_id: di.linen_item_id,
        movement_date: receipt_date,
        movement_type: 'damaged_at_laundry',
        quantity: v.damaged_qty,
        reason: `Marked damaged during laundry receipt for dispatch ${dispatch.dispatch_no}`,
        reference_id: dispatch_id,
        reference_type: 'laundry_dispatch',
        created_by: received_by || userId || 'Staff',
      }).catch((err) => console.warn('[LaundryService] Failed to record damaged stock movement:', err));
    }
  }

  // 7. Recompute dispatch status
  let allFullyAccounted = true;
  let anyReceived = false;
  let anyDamagedOrLost = false;

  for (const di of dispatchItems) {
    const sent = Number(di.sent_qty) || 0;
    const recv = Number(di.total_received) || 0;
    const dmg = Number(di.total_damaged) || 0;
    const lost = Number(di.total_lost) || 0;

    if (recv > 0) anyReceived = true;
    if (dmg > 0 || lost > 0) anyDamagedOrLost = true;

    if (recv + dmg + lost < sent) {
      allFullyAccounted = false;
    }
  }

  let newStatus = 'Sent';
  if (allFullyAccounted) {
    newStatus = anyDamagedOrLost ? 'Short/Lost' : 'Completed';
  } else if (anyReceived || anyDamagedOrLost) {
    newStatus = 'Partially Received';
  }

  await supabaseServiceRole
    .from('laundry_dispatches')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', dispatch_id)
    .eq('hotel_id', hotelId);

  return {
    success: true,
    receipt,
    status: newStatus,
    billable_amount: totalReceiptAmount,
  };
};

// ══════════════════════════════════════════════════════════════════════════════
// 6. RESOLVE PENDING / LOST / DAMAGED
// ══════════════════════════════════════════════════════════════════════════════

export const resolvePendingLinen = async (hotelId, params, userId = '') => {
  if (!hotelId) throw new Error('Hotel context is required');
  const {
    dispatch_id,
    dispatch_item_id,
    resolution_type, // 'lost' | 'damaged' | 'discard'
    quantity,
    reason = '',
  } = params;

  const qty = Number(quantity);
  if (isNaN(qty) || qty <= 0) throw new Error('Quantity must be greater than 0.');

  // 1. Fetch dispatch item
  const { data: di, error: diErr } = await supabaseServiceRole
    .from('laundry_dispatch_items')
    .select('*')
    .eq('id', dispatch_item_id)
    .eq('hotel_id', hotelId)
    .single();
  if (diErr || !di) throw new Error('Dispatch item not found.');

  const sent = Number(di.sent_qty) || 0;
  const recv = Number(di.total_received) || 0;
  const dmg = Number(di.total_damaged) || 0;
  const lost = Number(di.total_lost) || 0;
  const pending = Math.max(0, sent - recv - dmg - lost);

  if (qty > pending) {
    throw new Error(`Cannot resolve ${qty} pieces. Only ${pending} pieces remain pending.`);
  }

  // 2. Update dispatch item tracking columns
  const updatePayload = {};
  if (resolution_type === 'lost') {
    updatePayload.total_lost = lost + qty;
  } else {
    updatePayload.total_damaged = dmg + qty;
  }

  await supabaseServiceRole
    .from('laundry_dispatch_items')
    .update(updatePayload)
    .eq('id', di.id)
    .eq('hotel_id', hotelId);

  // 3. Create stock movement to reduce active stock if lost or discarded
  if (di.linen_item_id) {
    await recordStockMovement(hotelId, {
      linen_item_id: di.linen_item_id,
      movement_date: new Date().toISOString().slice(0, 10),
      movement_type: resolution_type === 'lost' ? 'lost_at_laundry' : 'damaged_at_laundry',
      quantity: qty,
      reason: reason || `Resolved from dispatch ${di.laundry_dispatches?.dispatch_no}`,
      reference_id: dispatch_id,
      reference_type: 'laundry_dispatch',
      created_by: userId || 'Manager',
    });
  }

  // 4. Recompute dispatch status
  const { data: allItems } = await supabaseServiceRole
    .from('laundry_dispatch_items')
    .select('sent_qty, total_received, total_damaged, total_lost')
    .eq('dispatch_id', dispatch_id)
    .eq('hotel_id', hotelId);

  let allDone = true;
  for (const it of allItems || []) {
    const s = Number(it.sent_qty) || 0;
    const r = Number(it.total_received) || 0;
    const d = Number(it.total_damaged) || 0;
    const l = Number(it.total_lost) || 0;
    if (r + d + l < s) allDone = false;
  }

  const finalStatus = allDone ? 'Completed' : 'Partially Received';
  await supabaseServiceRole
    .from('laundry_dispatches')
    .update({ status: finalStatus, updated_at: new Date().toISOString() })
    .eq('id', dispatch_id)
    .eq('hotel_id', hotelId);

  return { success: true, resolved_qty: qty, dispatch_status: finalStatus };
};

// ══════════════════════════════════════════════════════════════════════════════
// 7. BILLING & FINANCE EXPENSE INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Calculates today's laundry bill strictly on APPROVED BILLABLE RECEIVED quantity.
 * Sent quantity and pending quantity NEVER contribute to the bill!
 */
export const calculateDailyBill = async (hotelId, vendorId, date) => {
  if (!hotelId || !vendorId || !date) throw new Error('Missing bill calculation parameters');

  // Find dispatches for this vendor
  const { data: dispatches } = await supabaseServiceRole
    .from('laundry_dispatches')
    .select('id')
    .eq('hotel_id', hotelId)
    .eq('vendor_id', vendorId);

  const dispIds = (dispatches || []).map((d) => d.id);
  if (dispIds.length === 0) {
    return {
      vendor_id: vendorId,
      bill_date: date,
      items: [],
      total_qty: 0,
      total_amount: 0,
    };
  }

  // Fetch receipts on this date for this vendor's dispatches
  const { data: receipts, error: recErr } = await supabaseServiceRole
    .from('laundry_receipts')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('receipt_date', date)
    .in('dispatch_id', dispIds);
  if (recErr) throw recErr;

  const vendorReceipts = receipts || [];

  const billItemsMap = new Map();
  let totalQty = 0;
  let totalAmount = 0;

  for (const r of vendorReceipts) {
    for (const it of r.items_json || []) {
      const recvQty = Number(it.received_now) || 0;
      if (recvQty <= 0) continue;

      const isBillable = it.is_billable !== false;
      if (!isBillable) continue; // Non-billable receiving excluded from bill

      const rate = Number(it.rate_applied) || 0;
      const amount = recvQty * rate;

      const key = it.item_name;
      if (!billItemsMap.has(key)) {
        billItemsMap.set(key, {
          item_name: it.item_name,
          linen_item_id: it.linen_item_id,
          quantity: 0,
          rate,
          amount: 0,
        });
      }
      const bItem = billItemsMap.get(key);
      bItem.quantity += recvQty;
      bItem.amount += amount;

      totalQty += recvQty;
      totalAmount += amount;
    }
  }

  return {
    vendor_id: vendorId,
    bill_date: date,
    items: Array.from(billItemsMap.values()),
    total_qty: totalQty,
    total_amount: totalAmount,
  };
};

export const createOrUpdateDailyBill = async (hotelId, { vendor_id, bill_date }, userId = '') => {
  const calc = await calculateDailyBill(hotelId, vendor_id, bill_date);

  const { data: vendor } = await supabaseServiceRole
    .from('laundry_vendors')
    .select('vendor_name')
    .eq('id', vendor_id)
    .maybeSingle();

  // Check if bill already exists for this vendor and date
  const { data: existingBill } = await supabaseServiceRole
    .from('laundry_bills')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('vendor_id', vendor_id)
    .eq('bill_date', bill_date)
    .maybeSingle();

  const billNo = existingBill ? existingBill.bill_no : `LB-${bill_date.replace(/-/g, '')}-${vendor_id.slice(0, 4).toUpperCase()}`;

  let bill;
  if (existingBill) {
    const { data, error } = await supabaseServiceRole
      .from('laundry_bills')
      .update({
        total_qty: calc.total_qty,
        total_amount: calc.total_amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingBill.id)
      .eq('hotel_id', hotelId)
      .select('*')
      .single();
    if (error) throw error;
    bill = data;

    // Delete old items and insert updated items
    await supabaseServiceRole.from('laundry_bill_items').delete().eq('bill_id', bill.id);
  } else {
    const { data, error } = await supabaseServiceRole
      .from('laundry_bills')
      .insert({
        hotel_id: hotelId,
        bill_no: billNo,
        bill_date,
        vendor_id,
        vendor_name: vendor?.vendor_name || '',
        total_qty: calc.total_qty,
        total_amount: calc.total_amount,
        status: 'draft',
        created_by: userId || 'System',
      })
      .select('*')
      .single();
    if (error) throw error;
    bill = data;
  }

  // Insert bill line items
  if (calc.items.length > 0) {
    const billItemsPayload = calc.items.map((i) => ({
      hotel_id: hotelId,
      bill_id: bill.id,
      linen_item_id: i.linen_item_id || null,
      item_name: i.item_name,
      quantity: i.quantity,
      rate: i.rate,
      amount: i.amount,
    }));
    await supabaseServiceRole.from('laundry_bill_items').insert(billItemsPayload);
  }

  return { ...bill, items: calc.items };
};

/**
 * Approves a laundry bill and synchronously integrates with Finance expense.
 * Idempotent: Ensures NO duplicate Finance expenses for the same bill.
 */
export const approveLaundryBill = async (hotelId, billId, userId = '') => {
  if (!hotelId || !billId) throw new Error('Hotel and Bill ID are required');

  const { data: bill, error: billErr } = await supabaseServiceRole
    .from('laundry_bills')
    .select('*')
    .eq('id', billId)
    .eq('hotel_id', hotelId)
    .single();
  if (billErr || !bill) throw new Error('Laundry bill not found.');

  if (bill.total_amount <= 0) {
    throw new Error('Cannot approve a bill with ₹0 amount.');
  }

  // 1. Idempotently check if an expense entry already exists for this laundry bill
  const { data: existingExp } = await supabaseServiceRole
    .from('expense_entries')
    .select('id, amount')
    .eq('hotel_id', hotelId)
    .eq('reference_type', 'laundry_bill')
    .eq('reference_id', billId)
    .maybeSingle();

  let expenseEntryId = existingExp?.id;

  if (existingExp) {
    // Update existing expense entry amount if changed
    await supabaseServiceRole
      .from('expense_entries')
      .update({
        amount: bill.total_amount,
        description: `Laundry Bill ${bill.bill_no} — ${bill.vendor_name}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingExp.id);
  } else {
    // 2. Find or create 'Laundry' category in expense_categories
    let { data: cat } = await supabaseServiceRole
      .from('expense_categories')
      .select('id, name')
      .eq('hotel_id', hotelId)
      .ilike('name', 'Laundry')
      .maybeSingle();

    if (!cat) {
      const { data: newCat } = await supabaseServiceRole
        .from('expense_categories')
        .insert({
          hotel_id: hotelId,
          name: 'Laundry',
          is_active: true,
          sort_order: 10,
        })
        .select('id, name')
        .single();
      cat = newCat;
    }

    // 3. Create authoritative expense entry
    const { data: newExp, error: expErr } = await supabaseServiceRole
      .from('expense_entries')
      .insert({
        hotel_id: hotelId,
        entry_date: bill.bill_date,
        category_id: cat?.id || null,
        category_name: 'Laundry',
        amount: bill.total_amount,
        payment_mode: 'Credit', // Initial bill created as credit liability
        description: `Laundry Bill ${bill.bill_no} — ${bill.vendor_name}`,
        bill_no: bill.bill_no,
        is_paid: false,
        reference_type: 'laundry_bill',
        reference_id: billId,
        created_by: toUuidOrNull(userId),
      })
      .select('id')
      .single();
    if (expErr) throw expErr;
    expenseEntryId = newExp.id;
  }

  // 4. Mark bill as approved
  const { data: updatedBill, error: upErr } = await supabaseServiceRole
    .from('laundry_bills')
    .update({
      status: 'approved',
      approved_by: userId || 'Manager',
      approved_at: new Date().toISOString(),
      expense_entry_id: expenseEntryId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', billId)
    .eq('hotel_id', hotelId)
    .select('*')
    .single();
  if (upErr) throw upErr;

  return updatedBill;
};

// ══════════════════════════════════════════════════════════════════════════════
// 8. VENDOR LEDGER & PAYMENTS
// ══════════════════════════════════════════════════════════════════════════════

export const recordVendorPayment = async (hotelId, params, userId = '') => {
  if (!hotelId) throw new Error('Hotel context is required');
  const {
    vendor_id,
    payment_date = new Date().toISOString().slice(0, 10),
    amount,
    payment_mode = 'Cash',
    reference_no = '',
    notes = '',
  } = params;

  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) {
    throw new Error('Payment amount must be greater than 0.');
  }

  const { data: payment, error } = await supabaseServiceRole
    .from('laundry_vendor_payments')
    .insert({
      hotel_id: hotelId,
      vendor_id,
      payment_date,
      amount: amt,
      payment_mode,
      reference_no,
      notes,
      created_by: userId || 'Staff',
    })
    .select('*')
    .single();
  if (error) throw error;

  return payment;
};

export const getVendorLedger = async (hotelId, vendorId, dateRange = {}) => {
  if (!hotelId || !vendorId) throw new Error('Hotel and Vendor are required');
  const { fromDate, toDate } = dateRange;

  // 1. Fetch dispatches for this vendor
  let dispQuery = supabaseServiceRole
    .from('laundry_dispatches')
    .select('id, dispatch_no, dispatch_date, total_amount, status, created_at')
    .eq('hotel_id', hotelId)
    .eq('vendor_id', vendorId)
    .order('dispatch_date', { ascending: true });
  if (fromDate) dispQuery = dispQuery.gte('dispatch_date', fromDate);
  if (toDate) dispQuery = dispQuery.lte('dispatch_date', toDate);
  const { data: dispatches } = await dispQuery;

  const dispIds = (dispatches || []).map((d) => d.id);
  let dispatchItems = [];
  let receipts = [];
  if (dispIds.length > 0) {
    const { data: dItems } = await supabaseServiceRole
      .from('laundry_dispatch_items')
      .select('dispatch_id, item_name, sent_qty, total_received, total_damaged, total_lost')
      .in('dispatch_id', dispIds);
    dispatchItems = dItems || [];

    const { data: recs } = await supabaseServiceRole
      .from('laundry_receipts')
      .select('id, dispatch_id, receipt_date, items_json, remarks, created_at')
      .eq('hotel_id', hotelId)
      .in('dispatch_id', dispIds);
    receipts = recs || [];
  }

  // 2. Fetch approved bills
  let billsQuery = supabaseServiceRole
    .from('laundry_bills')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('vendor_id', vendorId)
    .eq('status', 'approved')
    .order('bill_date', { ascending: true });
  if (fromDate) billsQuery = billsQuery.gte('bill_date', fromDate);
  if (toDate) billsQuery = billsQuery.lte('bill_date', toDate);
  const { data: bills } = await billsQuery;

  // 3. Fetch payments
  let payQuery = supabaseServiceRole
    .from('laundry_vendor_payments')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('vendor_id', vendorId)
    .order('payment_date', { ascending: true });
  if (fromDate) payQuery = payQuery.gte('payment_date', fromDate);
  if (toDate) payQuery = payQuery.lte('payment_date', toDate);
  const { data: payments } = await payQuery;

  // 4. Compute physical pending and financial due
  let totalSentQty = 0;
  let totalRecvQty = 0;
  let totalDamagedQty = 0;

  for (const di of dispatchItems) {
    totalSentQty += Number(di.sent_qty) || 0;
    totalRecvQty += Number(di.total_received) || 0;
    totalDamagedQty += (Number(di.total_damaged) || 0) + (Number(di.total_lost) || 0);
  }

  const physicalPending = Math.max(0, totalSentQty - totalRecvQty - totalDamagedQty);
  const totalBilled = (bills || []).reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
  const totalPaid = (payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const financialDue = Math.max(0, totalBilled - totalPaid);

  // 5. Build Date-Wise Unified Ledger (Sent Qty, Received Qty, Pending Qty, Bill Amount, Paid Amount, Payment Due)
  // Gather all unique activity dates
  const dateMap = new Map(); // date -> { sent_qty, received_qty, damaged_qty, bill_amount, paid_amount, notes: [] }

  const getOrCreateDate = (d) => {
    if (!dateMap.has(d)) {
      dateMap.set(d, {
        date: d,
        sent_qty: 0,
        received_qty: 0,
        damaged_qty: 0,
        bill_amount: 0,
        paid_amount: 0,
        notes: [],
      });
    }
    return dateMap.get(d);
  };

  // Map dispatches by date
  const dispItemQtyMap = new Map();
  for (const di of dispatchItems) {
    dispItemQtyMap.set(di.dispatch_id, (dispItemQtyMap.get(di.dispatch_id) || 0) + (Number(di.sent_qty) || 0));
  }
  for (const d of dispatches || []) {
    const qty = dispItemQtyMap.get(d.id) || 0;
    const entry = getOrCreateDate(d.dispatch_date);
    entry.sent_qty += qty;
    entry.notes.push(`Sent ${qty} pcs (${d.dispatch_no})`);
  }

  // Map receipts by date
  for (const r of receipts) {
    let rRecv = 0;
    let rDmg = 0;
    for (const it of r.items_json || []) {
      rRecv += Number(it.received_now) || 0;
      rDmg += Number(it.damaged_lost) || 0;
    }
    const entry = getOrCreateDate(r.receipt_date);
    entry.received_qty += rRecv;
    entry.damaged_qty += rDmg;
    entry.notes.push(`Received ${rRecv} pcs${rDmg > 0 ? `, ${rDmg} damaged/lost` : ''}`);
  }

  // Map bills by date
  for (const b of bills || []) {
    const entry = getOrCreateDate(b.bill_date);
    entry.bill_amount += Number(b.total_amount) || 0;
    entry.notes.push(`Bill ${b.bill_no}: ₹${b.total_amount}`);
  }

  // Map payments by date
  for (const p of payments || []) {
    const entry = getOrCreateDate(p.payment_date);
    entry.paid_amount += Number(p.amount) || 0;
    entry.notes.push(`Payment: ₹${p.amount} (${p.payment_mode})`);
  }

  // Sort dates chronologically
  const sortedDates = Array.from(dateMap.keys()).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  let runningPending = 0;
  let runningDue = 0;

  const dailyLedger = sortedDates.map((dateKey) => {
    const row = dateMap.get(dateKey);
    runningPending += (row.sent_qty - row.received_qty - row.damaged_qty);
    runningDue += (row.bill_amount - row.paid_amount);

    return {
      date: row.date,
      sent_qty: row.sent_qty,
      received_qty: row.received_qty,
      pending_qty: Math.max(0, runningPending),
      bill_amount: row.bill_amount,
      paid_amount: row.paid_amount,
      payment_due: Math.max(0, runningDue),
      details: row.notes.join(' • '),
    };
  });

  // 6. Build Individual Transaction Chronology
  const transactions = [];

  for (const d of dispatches || []) {
    const qty = dispItemQtyMap.get(d.id) || 0;
    transactions.push({
      date: d.dispatch_date,
      type: 'DISPATCH',
      reference: d.dispatch_no,
      description: `Dispatched ${qty} pcs to laundry`,
      sent_qty: qty,
      received_qty: 0,
      bill_amount: 0,
      paid_amount: 0,
      timestamp: d.created_at || d.dispatch_date,
    });
  }

  for (const r of receipts) {
    let rRecv = 0;
    for (const it of r.items_json || []) {
      rRecv += Number(it.received_now) || 0;
    }
    transactions.push({
      date: r.receipt_date,
      type: 'RECEIPT',
      reference: `RCV-${r.id.slice(0, 8)}`,
      description: `Returned ${rRecv} pcs from laundry`,
      sent_qty: 0,
      received_qty: rRecv,
      bill_amount: 0,
      paid_amount: 0,
      timestamp: r.created_at || r.receipt_date,
    });
  }

  for (const b of bills || []) {
    transactions.push({
      date: b.bill_date,
      type: 'BILL',
      reference: b.bill_no,
      description: `Daily Bill Approved (${b.total_qty} pcs)`,
      sent_qty: 0,
      received_qty: b.total_qty,
      bill_amount: b.total_amount,
      paid_amount: 0,
      timestamp: b.created_at || b.bill_date,
    });
  }

  for (const p of payments || []) {
    transactions.push({
      date: p.payment_date,
      type: 'PAYMENT',
      reference: p.reference_no || `PMT-${p.id.slice(0, 6)}`,
      description: `Payment via ${p.payment_mode}`,
      sent_qty: 0,
      received_qty: 0,
      bill_amount: 0,
      paid_amount: p.amount,
      timestamp: p.created_at || p.payment_date,
    });
  }

  transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Running balance for individual transactions
  let txRunningDue = 0;
  let txRunningPending = 0;
  const ledgerRows = transactions.map((t) => {
    txRunningDue += (t.bill_amount - t.paid_amount);
    txRunningPending += (t.sent_qty - t.received_qty);
    return {
      ...t,
      balance_due: Math.max(0, txRunningDue),
      pending_qty: Math.max(0, txRunningPending),
    };
  });

  return {
    vendor_id: vendorId,
    physical_pending_pieces: physicalPending,
    total_billed_amount: totalBilled,
    total_paid_amount: totalPaid,
    financial_due_amount: financialDue,
    daily_ledger: dailyLedger,
    transactions: ledgerRows,
  };
};

// ══════════════════════════════════════════════════════════════════════════════
// 9. DAILY STATEMENT & WHATSAPP INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

export const generateDailyStatement = async (hotelId, vendorId, date) => {
  if (!hotelId || !vendorId || !date) throw new Error('Missing statement parameters');

  const [hotel, { data: vendor }] = await Promise.all([
    getHotelDetails(hotelId),
    supabaseServiceRole.from('laundry_vendors').select('*').eq('id', vendorId).single(),
  ]);

  if (!vendor) throw new Error('Vendor not found');

  // 1. Calculate Opening Pending: Dispatches prior to `date` minus Receivings prior to `date`
  const { data: priorDispatches } = await supabaseServiceRole
    .from('laundry_dispatches')
    .select('id')
    .eq('hotel_id', hotelId)
    .eq('vendor_id', vendorId)
    .lt('dispatch_date', date);

  let openingPending = 0;
  const priorIds = (priorDispatches || []).map((d) => d.id);
  if (priorIds.length > 0) {
    const { data: priorItems } = await supabaseServiceRole
      .from('laundry_dispatch_items')
      .select('sent_qty, total_received, total_damaged, total_lost')
      .in('dispatch_id', priorIds);

    for (const it of priorItems || []) {
      const s = Number(it.sent_qty) || 0;
      const r = Number(it.total_received) || 0;
      const dLost = (Number(it.total_damaged) || 0) + (Number(it.total_lost) || 0);
      openingPending += Math.max(0, s - r - dLost);
    }
  }

  // 2. Dispatches Today
  const { data: todayDispatches } = await supabaseServiceRole
    .from('laundry_dispatches')
    .select('id')
    .eq('hotel_id', hotelId)
    .eq('vendor_id', vendorId)
    .eq('dispatch_date', date);

  const sentMap = new Map();
  let sentToday = 0;
  const todayIds = (todayDispatches || []).map((d) => d.id);
  if (todayIds.length > 0) {
    const { data: todayItems } = await supabaseServiceRole
      .from('laundry_dispatch_items')
      .select('item_name, sent_qty, rate_per_piece')
      .in('dispatch_id', todayIds);

    for (const it of todayItems || []) {
      const q = Number(it.sent_qty) || 0;
      sentToday += q;
      const cur = sentMap.get(it.item_name) || { qty: 0, rate: it.rate_per_piece };
      cur.qty += q;
      sentMap.set(it.item_name, cur);
    }
  }

  // 3. Receipts Today
  const { data: allVendorDispatches } = await supabaseServiceRole
    .from('laundry_dispatches')
    .select('id')
    .eq('hotel_id', hotelId)
    .eq('vendor_id', vendorId);

  const allVendorIds = (allVendorDispatches || []).map((d) => d.id);
  let todayReceipts = [];
  if (allVendorIds.length > 0) {
    const { data: tRecs } = await supabaseServiceRole
      .from('laundry_receipts')
      .select('items_json')
      .eq('hotel_id', hotelId)
      .eq('receipt_date', date)
      .in('dispatch_id', allVendorIds);
    todayReceipts = tRecs || [];
  }

  const recvMap = new Map();
  let receivedToday = 0;
  let todayBillableAmount = 0;

  for (const r of todayReceipts || []) {
    for (const it of r.items_json || []) {
      const rQty = Number(it.received_now) || 0;
      receivedToday += rQty;

      const rate = Number(it.rate_applied) || 0;
      const isBillable = it.is_billable !== false;
      const amt = isBillable ? (rQty * rate) : 0;
      if (isBillable) todayBillableAmount += amt;

      const cur = recvMap.get(it.item_name) || { qty: 0, billableQty: 0, rate, amount: 0 };
      cur.qty += rQty;
      if (isBillable) {
        cur.billableQty += rQty;
        cur.amount += amt;
      }
      recvMap.set(it.item_name, cur);
    }
  }

  // 4. Closing Pending = Opening Pending + Sent Today - Received Today
  const closingPending = Math.max(0, openingPending + sentToday - receivedToday);

  // 5. Build line item breakdown
  const allItemNames = Array.from(new Set([...sentMap.keys(), ...recvMap.keys()]));
  const itemBreakdown = allItemNames.map((name) => {
    const s = sentMap.get(name) || { qty: 0, rate: 0 };
    const r = recvMap.get(name) || { qty: 0, billableQty: 0, rate: s.rate || 0, amount: 0 };
    const rate = r.rate || s.rate || 0;
    const pending = Math.max(0, s.qty - r.qty);

    return {
      item_name: name,
      sent_qty: s.qty,
      received_qty: r.qty,
      pending_qty: pending,
      rate,
      billable_qty: r.billableQty,
      amount: r.amount,
    };
  });

  // 6. Format WhatsApp Statement Text strictly per spec Section 19
  const lines = [
    `*${hotel.name.toUpperCase()}*`,
    hotel.city ? `${hotel.city}` : '',
    '',
    `*Daily Laundry Statement*`,
    `Date: ${date}`,
    `Vendor: ${vendor.vendor_name}`,
    '----------------------------------------',
  ];

  for (const it of itemBreakdown) {
    lines.push(
      `*${it.item_name}*`,
      `Sent: ${it.sent_qty}`,
      `Received: ${it.received_qty}`,
      `Pending: ${it.pending_qty}`,
      `Rate: ₹${it.rate}`,
      `Billable Qty: ${it.billable_qty}`,
      `Amount: ₹${it.amount}`,
      ''
    );
  }

  lines.push(
    '----------------------------------------',
    `Opening Pending: ${openingPending} pcs`,
    `Sent Today: ${sentToday} pcs`,
    `Received Today: ${receivedToday} pcs`,
    `Closing Pending: ${closingPending} pcs`,
    '',
    `*Today's Billable Amount:*`,
    `*₹${todayBillableAmount}*`,
    '----------------------------------------',
    '_Pending quantity is not included in billing._'
  );

  const formattedMessage = lines.filter((l) => l !== undefined).join('\n');

  return {
    hotel,
    vendor,
    date,
    opening_pending: openingPending,
    sent_today: sentToday,
    received_today: receivedToday,
    closing_pending: closingPending,
    today_billable_amount: todayBillableAmount,
    items: itemBreakdown,
    whatsapp_text: formattedMessage,
  };
};

export const sendDailyWhatsAppStatement = async (hotelId, params, userId = '') => {
  const { vendor_id, date, recipient_phone } = params;
  const statement = await generateDailyStatement(hotelId, vendor_id, date);

  const phone = recipient_phone || statement.vendor.mobile_number;
  if (!phone) {
    throw new Error('Vendor does not have a registered mobile number for WhatsApp.');
  }

  // Attempt send via WhatsApp service
  const result = await whatsappService.sendWhatsAppMessage({
    recipientPhone: phone,
    messageText: statement.whatsapp_text,
    messageType: 'laundry_statement',
  });

  // Log delivery attempt truthfully
  const logStatus = result.success ? 'sent' : (result.whatsappDirectUrl ? 'manual' : 'failed');

  await supabaseServiceRole
    .from('laundry_statement_log')
    .insert({
      hotel_id: hotelId,
      vendor_id,
      statement_date: date,
      delivery_type: result.success ? 'whatsapp' : 'manual',
      recipient: phone,
      status: logStatus,
      statement_data: statement,
      error_message: result.error || '',
      sent_by: userId || 'Staff',
    });

  return {
    ...result,
    statement,
    log_status: logStatus,
  };
};

// ══════════════════════════════════════════════════════════════════════════════
// 10. COMPOSITE EXECUTIVE DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

export const getExecutiveDashboard = async (hotelId, selectedDate) => {
  if (!hotelId) throw new Error('Hotel context is required');
  const date = selectedDate || new Date().toISOString().slice(0, 10);

  // 1. Linen items with authoritative stock
  const linenItems = await getLinenItemsWithStock(hotelId);

  let totalLinenStock = 0;
  let availableInHotel = 0;
  let atLaundry = 0;
  let damagedLost = 0;

  for (const it of linenItems) {
    totalLinenStock += it.total_active_stock;
    availableInHotel += it.available_in_hotel;
    atLaundry += it.at_laundry;
    damagedLost += it.damaged_lost;
  }

  // 2. Dispatches and today's activity
  const { data: dispatches } = await supabaseServiceRole
    .from('laundry_dispatches')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('dispatch_date', { ascending: false });

  const dispIds = (dispatches || []).map((d) => d.id);
  let allDispItems = [];
  if (dispIds.length > 0) {
    const { data: dItems } = await supabaseServiceRole
      .from('laundry_dispatch_items')
      .select('*')
      .in('dispatch_id', dispIds);
    allDispItems = dItems || [];
  }
  const itemsByDisp = new Map();
  for (const it of allDispItems) {
    const arr = itemsByDisp.get(it.dispatch_id) || [];
    arr.push(it);
    itemsByDisp.set(it.dispatch_id, arr);
  }

  const dispatchesWithItems = (dispatches || []).map((d) => ({
    ...d,
    items: itemsByDisp.get(d.id) || [],
    laundry_dispatch_items: itemsByDisp.get(d.id) || [],
  }));

  let todaySent = 0;
  for (const d of dispatchesWithItems) {
    if (d.dispatch_date === date) {
      for (const it of d.items || []) {
        todaySent += (Number(it.sent_qty) || 0);
      }
    }
  }

  // 3. Receipts today
  const { data: receipts } = await supabaseServiceRole
    .from('laundry_receipts')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('receipt_date', date);

  let todayReceived = 0;
  for (const r of receipts || []) {
    for (const it of r.items_json || []) {
      todayReceived += (Number(it.received_now) || 0);
    }
  }

  // 4. Today's bill
  const { data: bills } = await supabaseServiceRole
    .from('laundry_bills')
    .select('total_amount')
    .eq('hotel_id', hotelId)
    .eq('bill_date', date);

  const todayBill = (bills || []).reduce((s, b) => s + (Number(b.total_amount) || 0), 0);

  // 5. Total Vendor Due across all vendors
  const { data: allBills } = await supabaseServiceRole
    .from('laundry_bills')
    .select('total_amount')
    .eq('hotel_id', hotelId)
    .eq('status', 'approved');

  const { data: allPayments } = await supabaseServiceRole
    .from('laundry_vendor_payments')
    .select('amount')
    .eq('hotel_id', hotelId);

  const totalBilledAll = (allBills || []).reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
  const totalPaidAll = (allPayments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const vendorDue = Math.max(0, totalBilledAll - totalPaidAll);

  // 6. Vendors
  const vendors = await getVendors(hotelId);

  return {
    selected_date: date,
    total_linen_stock: totalLinenStock,
    available_in_hotel: availableInHotel,
    at_laundry: atLaundry,
    damaged_lost: damagedLost,
    today_sent: todaySent,
    today_received: todayReceived,
    today_bill: todayBill,
    vendor_due: vendorDue,
    linen_items: linenItems,
    vendors,
    dispatches: dispatchesWithItems || [],
  };
};

export default {
  getHotelDetails,
  getLinenItemsWithStock,
  saveLinenItem,
  seedStandardLinenItems,
  recordStockMovement,
  getStockMovements,
  getVendors,
  saveVendor,
  getVendorRates,
  saveVendorRate,
  createDispatch,
  receiveLaundry,
  resolvePendingLinen,
  calculateDailyBill,
  createOrUpdateDailyBill,
  approveLaundryBill,
  recordVendorPayment,
  getVendorLedger,
  generateDailyStatement,
  sendDailyWhatsAppStatement,
  getExecutiveDashboard,
};

