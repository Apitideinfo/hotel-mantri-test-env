import { supabase } from './supabase';
import { getCurrentHotelId } from './api';
import { apiFetch } from './api-fetch';
import type { RoomCategory } from './types';
import type { RatePlan } from './types-reservations';
import type { BulkInventoryPatch } from './bulkUpdateDraft';
import { testAiosellConnection as testChannelConnection, checkAiosellStatus as checkChannelStatus, getAiosellMapping as fetchChannelMapping } from './api-aiosell';
export { testChannelConnection, checkChannelStatus, fetchChannelMapping };

// ── Types ──

export interface ChannelConnection {
  id: string;
  hotel_id: string;
  channel_type: string;
  channel_name: string;
  status: 'connected' | 'disconnected' | 'paused' | 'error' | 'awaiting_activation';
  connection_status?: string | null;
  mapping_status?: string | null;
  is_enabled?: boolean;
  external_channel_id?: string | null;
  provider?: string;
  external_hotel_code?: string | null;
  external_partner_id?: string | null;
  last_sync_at: string | null;
  last_successful_sync_at?: string | null;
  last_sync_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChannelRateMapping {
  id: string;
  hotel_id: string;
  channel_connection_id?: string | null;
  room_category_id: string | null;
  rate_plan_id: string | null;
  provider?: string;
  channex_room_type_id?: string | null;
  channex_rate_plan_id?: string | null;
  external_room_code?: string | null;
  external_room_name?: string | null;
  external_rate_plan_code?: string | null;
  external_rate_plan_name?: string | null;
  status: 'mapped' | 'unmapped' | 'error';
  is_active: boolean;
  mapping_error: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChannelOtaReservation {
  id: string;
  hotel_id: string;
  channel_connection_id: string | null;
  ota_booking_id: string;
  channel_name: string;
  guest_name: string | null;
  guest_mobile: string;
  room_category: string | null;
  rate_plan: string;
  check_in_date: string | null;
  check_out_date: string | null;
  amount: number;
  payment_status: string;
  reservation_status: string;
  booking_status: string;
  import_status: string;
  reservation_id: string | null;
  received_at: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChannelInventoryRestriction {
  id: string;
  hotel_id: string;
  room_category_id: string;
  date: string;
  availability: number;
  base_rate: number;
  channel_rate: number;
  min_stay: number;
  max_stay: number;
  stop_sell: boolean;
  closed_to_arrival: boolean;
  closed_to_departure: boolean;
  updated_at: string;
}

export interface ChannelSyncLog {
  id: string;
  hotel_id: string;
  channel_connection_id: string | null;
  log_type: string;
  direction: string;
  status: string;
  message: string | null;
  error_detail: string | null;
  room_category_id: string | null;
  date_range: string | null;
  created_at: string;
  retry_status: string;
  retry_count: number;
}

export interface ChannelSettings {
  id: string;
  hotel_id: string;
  api_base_url: string;
  api_key_secret_name: string | null;
  property_id: string | null;
  environment: 'test' | 'production';
  status: 'connected' | 'disconnected' | 'error';
  last_tested_at: string | null;
  last_test_result: string | null;
  aiosell_status?: 'connected' | 'disconnected' | 'error' | 'paused';
  aiosell_environment?: 'test' | 'production';
  aiosell_hotel_code?: string | null;
  aiosell_partner_id?: string | null;
  channel_manager_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AiosellMappingResponse {
  hotel: {
    hotel_id: string;
    hotel_name: string;
  };
  rooms: {
    room_id: string;
    room_name: string;
    count: number;
  }[];
  ratePlans: {
    rate_plan_id: string;
    rate_plan_name: string;
    room_id: string;
  }[];
  rawResponse?: any;
}

export const CHANNEL_TYPES: { type: string; label: string; short: string }[] = [
  { type: 'mmt', label: 'MakeMyTrip', short: 'MMT' },
  { type: 'goibibo', label: 'Goibibo', short: 'G' },
  { type: 'booking_com', label: 'Booking.com', short: 'B' },
  { type: 'agoda', label: 'Agoda', short: 'A' },
  { type: 'expedia', label: 'Expedia', short: 'E' },
  { type: 'airbnb', label: 'Airbnb', short: 'AB' },
  { type: 'cleartrip', label: 'Cleartrip', short: 'C' },
  { type: 'easemytrip', label: 'EaseMyTrip', short: 'EMT' },
  { type: 'hotels_com', label: 'Hotels.com', short: 'H' },
  { type: 'trip_com', label: 'Trip.com', short: 'T' },
  { type: 'yatra', label: 'Yatra / Travelguru', short: 'Y' },
];

export const getChannelMetadata = (type: string): { label: string; short: string } =>
  CHANNEL_TYPES.find((channel) => channel.type === type) ?? { label: type, short: '?' };

// ── Channel Connections ──

export const getChannelConnections = async (): Promise<ChannelConnection[]> => {
  const { data, error } = await supabase
    .from('channel_connections')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as ChannelConnection[]) ?? [];
};

export const saveChannelConnection = async (
  input: Omit<ChannelConnection, 'id' | 'hotel_id' | 'created_at' | 'updated_at'>,
  id?: string
): Promise<ChannelConnection> => {
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  if (id) {
    const { data, error } = await supabase
      .from('channel_connections')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as ChannelConnection;
  }
  const { data, error } = await supabase
    .from('channel_connections')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as ChannelConnection;
};

export const deleteChannelConnection = async (id: string): Promise<void> => {
  const { error } = await supabase.from('channel_connections').delete().eq('id', id);
  if (error) throw error;
};

// ── Rate Plan Mappings ──

export const getChannelRateMappings = async (): Promise<ChannelRateMapping[]> => {
  const { data, error } = await supabase
    .from('channel_rate_mappings')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as ChannelRateMapping[]) ?? [];
};

export const saveChannelRateMapping = async (
  input: Omit<ChannelRateMapping, 'id' | 'hotel_id' | 'created_at' | 'updated_at'>,
  id?: string
): Promise<ChannelRateMapping> => {
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  if (id) {
    const { data, error } = await supabase
      .from('channel_rate_mappings')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as ChannelRateMapping;
  }
  const { data, error } = await supabase
    .from('channel_rate_mappings')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as ChannelRateMapping;
};

export const deleteChannelRateMapping = async (id: string): Promise<void> => {
  const { error } = await supabase.from('channel_rate_mappings').delete().eq('id', id);
  if (error) throw error;
};

// ── OTA Reservations ──

export const getOtaReservations = async (limit = 50): Promise<ChannelOtaReservation[]> => {
  const { data, error } = await supabase
    .from('channel_ota_reservations')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as ChannelOtaReservation[]) ?? [];
};

export const createOtaReservationIfNew = async (input: Omit<ChannelOtaReservation, 'id' | 'hotel_id' | 'created_at' | 'updated_at'>): Promise<{ reservation: ChannelOtaReservation; duplicate: boolean }> => {
  const hotelId = getCurrentHotelId();
  const { data: existing, error: lookupError } = await supabase
    .from('channel_ota_reservations')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('ota_booking_id', input.ota_booking_id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return { reservation: existing as ChannelOtaReservation, duplicate: true };
  const { data, error } = await supabase
    .from('channel_ota_reservations')
    .insert({ ...input, hotel_id: hotelId, received_at: input.received_at ?? new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw error;
  return { reservation: data as ChannelOtaReservation, duplicate: false };
};

export const updateOtaReservationStatus = async (
  id: string,
  importStatus: string,
  reservationId?: string | null
): Promise<void> => {
  const payload: Record<string, unknown> = {
    import_status: importStatus,
    updated_at: new Date().toISOString(),
  };
  if (reservationId !== undefined) payload.reservation_id = reservationId;
  const { error } = await supabase
    .from('channel_ota_reservations')
    .update(payload)
    .eq('id', id);
  if (error) throw error;
};

// ── Inventory Restrictions ──

export const getInventoryRestrictions = async (
  startDate: string,
  endDate: string
): Promise<ChannelInventoryRestriction[]> => {
  const { data, error } = await supabase
    .from('channel_inventory_restrictions')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });
  if (error) throw error;
  return (data as ChannelInventoryRestriction[]) ?? [];
};

export type InventoryRestrictionInput = Partial<Omit<ChannelInventoryRestriction, 'id' | 'hotel_id' | 'updated_at'>> & {
  room_category_id: string;
  date: string;
};

export type ChannelEventType =
  | 'RATE_CHANGED'
  | 'AVAILABILITY_CHANGED'
  | 'INVENTORY_CHANGED'
  | 'RESERVATION_CREATED'
  | 'RESERVATION_MODIFIED'
  | 'RESERVATION_CANCELLED'
  | 'RESERVATION_CHANGED'
  | 'CHECK_IN'
  | 'CHECK_OUT'
  | 'ROOM_TRANSFER'
  | 'STAY_EXTENDED'
  | 'ROOM_BLOCKED'
  | 'ROOM_UNBLOCKED'
  | 'MANUAL_SYNC';

export interface DispatchChannelEventDetails {
  startDate?: string | null;
  endDate?: string | null;
  date?: string | null;
  roomCategoryId?: string | null;
  roomCategoryIds?: string[] | null;
  ratePlanIds?: string[] | null;
  room_no?: string | null;
  fromRoom?: string | null;
  toRoom?: string | null;
  [key: string]: any;
}

export const dispatchChannelEvent = async (
  eventType: ChannelEventType,
  details: DispatchChannelEventDetails = {}
): Promise<any> => {
  const hotelId = getCurrentHotelId();
  if (!hotelId) return null;

  try {
    const res = await apiFetch('/api/channels/events/dispatch', {
      method: 'POST',
      body: JSON.stringify({
        hotelId,
        eventType,
        details,
      }),
    });
    return res;
  } catch (err: any) {
    console.warn(`[dispatchChannelEvent] Event ${eventType} sync warning:`, err?.message || err);
    return { success: false, error: err };
  }
};

export const applyBulkInventoryPatch = async (
  patches: BulkInventoryPatch[],
  skipSync = false
): Promise<{
  success: boolean;
  updatedCount: number;
  allVerified?: boolean;
  rateSync?: any;
  inventorySync?: any;
  message?: string;
}> => {
  const hotelId = getCurrentHotelId();
  if (!hotelId) throw new Error('Hotel context is required to update inventory/rates');
  if (!patches || patches.length === 0) {
    return { success: true, updatedCount: 0, message: 'No patches to apply' };
  }

  // 1. Try server backend endpoint first
  try {
    const res = await apiFetch('/api/channels/inventory-restrictions/patch', {
      method: 'POST',
      body: JSON.stringify({ updates: patches, skipSync })
    });
    if (res && res.success) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('hotel_mantri_availability_updated', {
          detail: { hotelId, count: patches.length }
        }));
      }
      return res;
    }
  } catch (err) {
    console.warn('[applyBulkInventoryPatch] Backend route failed or unavailable, falling back to client-side merge:', err);
  }

  // 2. Client-side resilient non-destructive merge fallback
  const targetDates = [...new Set(patches.map(p => p.date).filter(Boolean))];
  const targetCatIds = [...new Set(patches.map(p => p.roomCategoryId).filter(Boolean))];

  const { data: existingRows, error: fetchErr } = await supabase
    .from('channel_inventory_restrictions')
    .select('*')
    .eq('hotel_id', hotelId)
    .in('date', targetDates)
    .in('room_category_id', targetCatIds);

  if (fetchErr) {
    console.error('[applyBulkInventoryPatch] Error fetching existing rows:', fetchErr);
    throw fetchErr;
  }

  const existingMap = new Map<string, ChannelInventoryRestriction>();
  (existingRows || []).forEach(r => {
    existingMap.set(`${r.room_category_id}|${r.date}`, r as ChannelInventoryRestriction);
  });

  // Coalesce patches
  const coalescedMap = new Map<string, BulkInventoryPatch>();
  for (const p of patches) {
    const key = `${p.roomCategoryId}|${p.date}`;
    const prev = coalescedMap.get(key) || { date: p.date, roomCategoryId: p.roomCategoryId };
    coalescedMap.set(key, { ...prev, ...p });
  }

  const mergedPayload: any[] = [];
  let hasRate = false;
  let hasInv = false;

  for (const [key, patch] of coalescedMap.entries()) {
    const existing = existingMap.get(key);
    const merged: any = {
      hotel_id: hotelId,
      room_category_id: patch.roomCategoryId,
      date: patch.date,
      updated_at: new Date().toISOString()
    };

    if (patch.baseRate !== undefined) {
      hasRate = true;
      merged.base_rate = patch.baseRate === null ? 0 : Math.max(0, patch.baseRate);
    } else if (existing) {
      merged.base_rate = existing.base_rate ?? 0;
    } else {
      merged.base_rate = 0;
    }

    if (patch.channelRate !== undefined) {
      hasRate = true;
      merged.channel_rate = patch.channelRate === null ? 0 : Math.max(0, patch.channelRate);
    } else if (existing) {
      merged.channel_rate = existing.channel_rate ?? 0;
    } else {
      merged.channel_rate = 0;
    }

    if (patch.availability !== undefined) {
      hasInv = true;
      merged.availability = patch.availability === null ? null : Math.max(0, patch.availability);
    } else if (existing) {
      merged.availability = existing.availability;
    } else {
      merged.availability = null;
    }

    if (patch.stopSell !== undefined) {
      hasInv = true;
      merged.stop_sell = Boolean(patch.stopSell);
    } else if (existing) {
      merged.stop_sell = Boolean(existing.stop_sell);
    } else {
      merged.stop_sell = false;
    }

    if (patch.minStay !== undefined) {
      hasInv = true;
      merged.min_stay = patch.minStay === null ? 1 : Math.max(1, patch.minStay);
    } else if (existing) {
      merged.min_stay = existing.min_stay ?? 1;
    } else {
      merged.min_stay = 1;
    }

    if (patch.maxStay !== undefined) {
      hasInv = true;
      merged.max_stay = patch.maxStay === null ? 0 : Math.max(0, patch.maxStay);
    } else if (existing) {
      merged.max_stay = existing.max_stay ?? 0;
    } else {
      merged.max_stay = 0;
    }

    if (patch.closedToArrival !== undefined) {
      hasInv = true;
      merged.closed_to_arrival = Boolean(patch.closedToArrival);
    } else if (existing) {
      merged.closed_to_arrival = Boolean(existing.closed_to_arrival);
    } else {
      merged.closed_to_arrival = false;
    }

    if (patch.closedToDeparture !== undefined) {
      hasInv = true;
      merged.closed_to_departure = Boolean(patch.closedToDeparture);
    } else if (existing) {
      merged.closed_to_departure = Boolean(existing.closed_to_departure);
    } else {
      merged.closed_to_departure = false;
    }

    if (existing?.id) {
      merged.id = existing.id;
    }

    mergedPayload.push(merged);
  }

  const { error: upsertErr } = await supabase
    .from('channel_inventory_restrictions')
    .upsert(mergedPayload, { onConflict: 'hotel_id,room_category_id,date' });

  if (upsertErr) {
    console.error('[applyBulkInventoryPatch] Client fallback upsert error:', upsertErr);
    throw upsertErr;
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hotel_mantri_availability_updated', {
      detail: { hotelId, count: mergedPayload.length }
    }));
  }

  // Trigger real-time sync if needed
  if (!skipSync) {
    const dates = targetDates.sort();
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    if (hasRate) {
      dispatchChannelEvent('RATE_CHANGED', {
        startDate,
        endDate,
        roomCategoryIds: targetCatIds,
      }).catch(e => console.warn('[applyBulkInventoryPatch] Rate auto-sync error:', e));
    }
    if (hasInv) {
      dispatchChannelEvent('AVAILABILITY_CHANGED', {
        startDate,
        endDate,
        roomCategoryIds: targetCatIds,
      }).catch(e => console.warn('[applyBulkInventoryPatch] Inventory auto-sync error:', e));
    }
  }

  return {
    success: true,
    updatedCount: mergedPayload.length,
    message: `Saved ${mergedPayload.length} records.`
  };
};

export const upsertInventoryRestriction = async (
  input: InventoryRestrictionInput
): Promise<void> => {
  const patch: BulkInventoryPatch = {
    roomCategoryId: input.room_category_id,
    date: input.date,
    ...(input.base_rate !== undefined ? { baseRate: input.base_rate } : {}),
    ...(input.channel_rate !== undefined ? { channelRate: input.channel_rate } : {}),
    ...(input.availability !== undefined ? { availability: input.availability } : {}),
    ...(input.stop_sell !== undefined ? { stopSell: input.stop_sell } : {}),
    ...(input.min_stay !== undefined ? { minStay: input.min_stay } : {}),
    ...(input.max_stay !== undefined ? { maxStay: input.max_stay } : {}),
    ...(input.closed_to_arrival !== undefined ? { closedToArrival: input.closed_to_arrival } : {}),
    ...(input.closed_to_departure !== undefined ? { closedToDeparture: input.closed_to_departure } : {}),
  };
  await applyBulkInventoryPatch([patch]);
};

export const bulkUpdateInventory = async (
  updates: Array<InventoryRestrictionInput>
): Promise<void> => {
  const patches: BulkInventoryPatch[] = updates.map(u => ({
    roomCategoryId: u.room_category_id,
    date: u.date,
    ...(u.base_rate !== undefined ? { baseRate: u.base_rate } : {}),
    ...(u.channel_rate !== undefined ? { channelRate: u.channel_rate } : {}),
    ...(u.availability !== undefined ? { availability: u.availability } : {}),
    ...(u.stop_sell !== undefined ? { stopSell: u.stop_sell } : {}),
    ...(u.min_stay !== undefined ? { minStay: u.min_stay } : {}),
    ...(u.max_stay !== undefined ? { maxStay: u.max_stay } : {}),
    ...(u.closed_to_arrival !== undefined ? { closedToArrival: u.closed_to_arrival } : {}),
    ...(u.closed_to_departure !== undefined ? { closedToDeparture: u.closed_to_departure } : {}),
  }));
  await applyBulkInventoryPatch(patches);
};

export interface AuthoritativeMatrixItem {
  date: string;
  room_category_id: string;
  category_name: string;
  physical: number;
  occupied: number;
  blocked: number;
  calculatedAvailable: number;
  available: number;
  stop_sell: boolean;
  is_manual?: boolean;
  manual_availability?: number | null;
  base_rate?: number;
  min_stay?: number;
  max_stay?: number;
  closed_to_arrival?: boolean;
  closed_to_departure?: boolean;
}

export const getAuthoritativeAvailabilityMatrix = async (
  startDate: string,
  endDate: string
): Promise<{ matrix: AuthoritativeMatrixItem[]; source: 'api' | 'supabase' }> => {
  const hotelId = getCurrentHotelId();
  // 1. Try server matrix endpoint first
  try {
    const res = await getInventoryMatrix(startDate, endDate);
    if (res && res.success && Array.isArray(res.matrix)) {
      return { matrix: res.matrix, source: 'api' };
    }
  } catch {
    // Fall back to client calculation from Supabase
  }

  // 2. Client-side authoritative calculation directly from Supabase
  const [catsRes, roomsRes, resvsRes, blocksRes, restrictionsRes] = await Promise.all([
    supabase.from('room_categories').select('id, name').eq('hotel_id', hotelId).eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('rooms').select('id, category_id, room_no, is_active').eq('hotel_id', hotelId),
    supabase.from('reservations').select('id, room_id, room_no, check_in_date, check_out_date, status').eq('hotel_id', hotelId).in('status', ['confirmed', 'checked_in']).lte('check_in_date', endDate).gte('check_out_date', startDate),
    supabase.from('room_blocks').select('room_no, start_date, end_date, block_type').eq('hotel_id', hotelId).lte('start_date', endDate).gte('end_date', startDate),
    supabase.from('channel_inventory_restrictions').select('*').eq('hotel_id', hotelId).gte('date', startDate).lte('date', endDate),
  ]);

  const categories = (catsRes.data ?? []) as Array<{ id: string; name: string }>;
  const rooms = (roomsRes.data ?? []) as Array<{ id: string; category_id: string; room_no: string; is_active: boolean }>;
  const reservations = (resvsRes.data ?? []) as Array<{ id: string; room_id: string; room_no: string; check_in_date: string; check_out_date: string; status: string }>;
  const blocks = (blocksRes.data ?? []) as Array<{ room_no: string; start_date: string; end_date: string; block_type: string }>;
  const restrictions = (restrictionsRes.data ?? []) as ChannelInventoryRestriction[];

  const physicalCounts: Record<string, number> = {};
  const roomToCatMap: Record<string, string> = {};
  const roomNoToCatMap: Record<string, string> = {};

  for (const r of rooms) {
    if (r.category_id && r.is_active !== false) {
      roomToCatMap[r.id] = r.category_id;
      physicalCounts[r.category_id] = (physicalCounts[r.category_id] || 0) + 1;
      if (r.room_no) {
        roomNoToCatMap[r.room_no.trim().toLowerCase()] = r.category_id;
      }
    }
  }

  const restrictionMap = new Map<string, ChannelInventoryRestriction>();
  for (const r of restrictions) {
    restrictionMap.set(`${r.room_category_id}|${r.date}`, r);
  }

  // Generate date array
  const dates: string[] = [];
  let cur = startDate;
  while (cur <= endDate) {
    dates.push(cur);
    const [y, m, d] = cur.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + 1));
    cur = dt.toISOString().slice(0, 10);
  }

  const matrix: AuthoritativeMatrixItem[] = [];

  for (const d of dates) {
    const dTime = new Date(d + 'T12:00:00');
    const occCounts: Record<string, number> = {};
    for (const res of reservations) {
      const ci = new Date(res.check_in_date + 'T12:00:00');
      const co = new Date(res.check_out_date + 'T12:00:00');
      if (dTime >= ci && dTime < co) {
        const catId = (res.room_id ? roomToCatMap[res.room_id] : null) || (res.room_no ? roomNoToCatMap[res.room_no.trim().toLowerCase()] : null);
        if (catId) {
          occCounts[catId] = (occCounts[catId] || 0) + 1;
        }
      }
    }

    const blkCounts: Record<string, number> = {};
    for (const b of blocks) {
      const bs = new Date(b.start_date + 'T12:00:00');
      const be = new Date(b.end_date + 'T12:00:00');
      if (dTime >= bs && dTime <= be) {
        const catId = roomNoToCatMap[b.room_no.trim().toLowerCase()];
        if (catId) {
          blkCounts[catId] = (blkCounts[catId] || 0) + 1;
        }
      }
    }

    for (const cat of categories) {
      const physical = physicalCounts[cat.id] || 0;
      const occupied = occCounts[cat.id] || 0;
      const blocked = blkCounts[cat.id] || 0;
      const calculatedAvailable = Math.max(0, physical - occupied - blocked);

      const r = restrictionMap.get(`${cat.id}|${d}`);
      let sellable = calculatedAvailable;

      if (r) {
        if (r.stop_sell) {
          sellable = 0;
        } else if (r.availability !== undefined && r.availability !== null && String(r.availability) !== '') {
          const manualVal = Number(r.availability);
          if (!isNaN(manualVal)) {
            sellable = Math.max(0, manualVal);
          }
        }
      }

      matrix.push({
        date: d,
        room_category_id: cat.id,
        category_name: cat.name,
        physical,
        occupied,
        blocked,
        calculatedAvailable,
        available: sellable,
        stop_sell: Boolean(r?.stop_sell),
        is_manual: Boolean(r && r.availability !== undefined && r.availability !== null && String(r.availability) !== ''),
        manual_availability: r && r.availability !== undefined && r.availability !== null && String(r.availability) !== '' ? Number(r.availability) : null,
        base_rate: r?.base_rate ?? 0,
        min_stay: r?.min_stay ?? 1,
        max_stay: r?.max_stay ?? 0,
        closed_to_arrival: Boolean(r?.closed_to_arrival),
        closed_to_departure: Boolean(r?.closed_to_departure),
      });
    }
  }

  return { matrix, source: 'supabase' };
};

// ── Sync Logs ──

export interface SyncLogFilters {
  channelConnectionId?: string;
  status?: string;
  logType?: string;
  startDate?: string;
  endDate?: string;
}

export const getSyncLogs = async (limit = 100, filters?: SyncLogFilters): Promise<ChannelSyncLog[]> => {
  let query = supabase
    .from('channel_sync_logs')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('created_at', { ascending: false })
    .limit(limit);
  if (filters?.channelConnectionId) query = query.eq('channel_connection_id', filters.channelConnectionId);
  if (filters?.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters?.logType && filters.logType !== 'all') query = query.eq('log_type', filters.logType);
  if (filters?.startDate) query = query.gte('created_at', filters.startDate + 'T00:00:00');
  if (filters?.endDate) query = query.lte('created_at', filters.endDate + 'T23:59:59');
  const { data, error } = await query;
  if (error) throw error;
  return (data as ChannelSyncLog[]) ?? [];
};

export const insertSyncLog = async (
  input: Omit<ChannelSyncLog, 'id' | 'hotel_id' | 'created_at' | 'retry_status' | 'retry_count'> & Partial<Pick<ChannelSyncLog, 'retry_status' | 'retry_count'>>
): Promise<void> => {
  const payload = { retry_status: 'not_retried', retry_count: 0, ...input, hotel_id: getCurrentHotelId() };
  const { error } = await supabase.from('channel_sync_logs').insert(payload);
  if (error) throw error;
};

export const retrySyncLog = async (log: ChannelSyncLog): Promise<void> => {
  const { error: updateError } = await supabase
    .from('channel_sync_logs')
    .update({ retry_status: 'retried', retry_count: (log.retry_count ?? 0) + 1 })
    .eq('id', log.id)
    .eq('hotel_id', getCurrentHotelId());
  if (updateError) throw updateError;
  await insertSyncLog({
    channel_connection_id: log.channel_connection_id,
    log_type: log.log_type,
    direction: log.direction,
    status: 'pending',
    message: `Retry requested${log.message ? `: ${log.message}` : ''}`,
    error_detail: null,
    room_category_id: log.room_category_id,
    date_range: log.date_range,
    retry_status: 'queued',
    retry_count: 0,
  });
};

// ── Channel Settings ──

export const getChannelSettings = async (): Promise<ChannelSettings | null> => {
  const { data, error } = await supabase
    .from('channel_settings')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .maybeSingle();
  if (error) throw error;
  return data as ChannelSettings | null;
};

export const saveChannelSettings = async (
  input: Omit<ChannelSettings, 'id' | 'hotel_id' | 'created_at' | 'updated_at' | 'last_tested_at' | 'last_test_result'>
): Promise<ChannelSettings> => {
  // Extract and omit `id` if it was accidentally passed in through spread
  const { id, ...cleanInput } = input as any;
  const payload = { ...cleanInput, hotel_id: getCurrentHotelId(), updated_at: new Date().toISOString() };
  
  const { data, error } = await supabase
    .from('channel_settings')
    .upsert(payload, { onConflict: 'hotel_id' })
    .select('*')
    .single();
    
  if (error) throw error;
  return data as ChannelSettings;
};

export const updateChannelSettingsStatus = async (
  status: string,
  testResult?: string
): Promise<void> => {
  const existing = await getChannelSettings();
  if (!existing) return;
  const payload: Record<string, unknown> = {
    status,
    last_tested_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (testResult !== undefined) payload.last_test_result = testResult;
  const { error } = await supabase.from('channel_settings').update(payload).eq('id', existing.id);
  if (error) throw error;
};

// ── Aiosell Endpoints (Proxy to Backend) ──


export const fetchChannelInventory = async (startDate: string, endDate: string): Promise<any> => {
  return apiFetch('/api/aiosell/inventory/fetch', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate })
  });
};

export const fetchChannelRates = async (startDate: string, endDate: string): Promise<any> => {
  return apiFetch('/api/aiosell/rates/fetch', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate })
  });
};

export const pushChannelInventory = async (startDate: string, endDate: string, channelId?: string): Promise<any> => {
  return apiFetch('/api/aiosell/inventory/push', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate, channelId })
  });
};

export const fetchChannelFutureBookings = async (startDate: string, endDate: string): Promise<any> => {
  return apiFetch('/api/aiosell/reservations/fetch', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate })
  });
};

export const pushChannelRates = async (startDate: string, endDate: string, channelId?: string): Promise<any> => {
  return apiFetch('/api/aiosell/rates/push', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate, channelId })
  });
};

export const verifyChannelRates = async (startDate: string, endDate: string, channelId?: string): Promise<any> => {
  return apiFetch('/api/aiosell/rates/verify', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate, channelId })
  });
};

export const verifyChannelInventory = async (startDate: string, endDate: string, channelId?: string): Promise<any> => {
  return apiFetch('/api/aiosell/inventory/verify', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate, channelId })
  });
};

export const getInventoryMatrix = async (startDate: string, endDate: string): Promise<any> => {
  return apiFetch('/api/aiosell/inventory/matrix', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate })
  });
};

// ── Composite fetch for Channel Manager overview ──

export interface ChannelManagerOverview {
  connections: ChannelConnection[];
  otaReservations: ChannelOtaReservation[];
  categories: RoomCategory[];
  ratePlans: RatePlan[];
  mappings: ChannelRateMapping[];
  syncLogs: ChannelSyncLog[];
  settings: ChannelSettings | null;
  isLiveMode: boolean;
}

export const getChannelManagerOverview = async (): Promise<ChannelManagerOverview> => {
  const [connections, otaReservations, categories, ratePlans, mappings, syncLogs, settings] = await Promise.all([
    getChannelConnections(),
    getOtaReservations(20),
    (async () => {
      const { data, error } = await supabase
        .from('room_categories')
        .select('*')
        .eq('hotel_id', getCurrentHotelId())
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data as RoomCategory[]) ?? [];
    })(),
    (async () => {
      const { data, error } = await supabase
        .from('rate_plans')
        .select('*')
        .eq('hotel_id', getCurrentHotelId())
        .eq('is_active', true)
        .order('plan_type', { ascending: true });
      if (error) throw error;
      return (data as RatePlan[]) ?? [];
    })(),
    getChannelRateMappings(),
    getSyncLogs(50),
    getChannelSettings(),
  ]);

  let isLiveMode = false;
  try {
    const data = await checkChannelStatus();
    isLiveMode = data.connected === true;
  } catch (err) {
    console.error('Failed to check channel status', err);
  }

  return {
    settings,
    connections,
    otaReservations,
    categories,
    ratePlans,
    mappings,
    syncLogs,
    isLiveMode,
  };
};

export async function fetchChannels() {
  return apiFetch('/api/channels');
}

export async function fetchChannelDetails(channelId: string) {
  return apiFetch(`/api/channels/${channelId}`);
}

export async function updateChannel(channelId: string, updates: Record<string, any>) {
  return apiFetch(`/api/channels/${channelId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteChannel(channelId: string) {
  return apiFetch(`/api/channels/${channelId}`, {
    method: 'DELETE',
  });
}

export async function fetchChannelMappings(channelId: string) {
  return apiFetch(`/api/channels/${channelId}/mappings`);
}

export async function saveChannelMappings(channelId: string, mappings: any[]) {
  return apiFetch(`/api/channels/${channelId}/mappings`, {
    method: 'POST',
    body: JSON.stringify({ mappings }),
  });
}

export async function syncChannelInventory(channelId: string, startDate?: string, endDate?: string) {
  return apiFetch(`/api/channels/${channelId}/sync/inventory`, {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate }),
  });
}

export async function syncChannelRates(channelId: string, startDate?: string, endDate?: string) {
  return apiFetch(`/api/channels/${channelId}/sync/rates`, {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate }),
  });
}

export async function pullChannelFutureBookings(channelId: string, startDate?: string, endDate?: string) {
  return apiFetch(`/api/channels/${channelId}/future-bookings`, {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate }),
  });
}

export async function fetchChannelReservations(channelId: string) {
  return apiFetch(`/api/channels/${channelId}/reservations`);
}

export async function fetchChannelLogs(channelId: string) {
  return apiFetch(`/api/channels/${channelId}/logs`);
}

export async function discoverChannels() {
  return apiFetch('/api/channels/discover', {
    method: 'POST'
  });
}

export async function addChannel(channelType: string, displayName: string, externalChannelId?: string) {
  return apiFetch('/api/channels', {
    method: 'POST',
    body: JSON.stringify({ channelType, displayName, externalChannelId })
  });
}

export async function testChannelConnectionDirect() {
  return apiFetch('/api/channels/test-connection', {
    method: 'POST'
  });
}

export async function triggerChannelLiveSync(params?: { startDate?: string; endDate?: string; force?: boolean }) {
  return apiFetch('/api/channels/live-sync', {
    method: 'POST',
    body: JSON.stringify(params || {})
  });
}



