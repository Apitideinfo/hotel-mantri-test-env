import { supabase } from './supabase';
import { getCurrentHotelId } from './api';
import { apiFetch } from './api-fetch';
import type { RoomCategory } from './types';
import type { RatePlan } from './types-reservations';
import type { BulkInventoryPatch } from './bulkUpdateDraft';
import { normalizeToISODate } from './bulkUpdateDraft';
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
  channel_room_code?: string | null;
  channel_room_name?: string | null;
  channel_rate_plan_code?: string | null;
  channel_rate_plan_name?: string | null;
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
  channel_name?: string | null;
  log_type: string;
  direction: string;
  status: string;
  message: string | null;
  error_detail: string | null;
  error_details?: string | null;
  duration_ms?: number | null;
  attempt_count?: number;
  payload?: any;
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

export const getChannelConnections = async (hotelIdOverride?: string): Promise<ChannelConnection[]> => {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  const { data, error } = await supabase
    .from('channel_connections')
    .select('*')
    .eq('hotel_id', targetHotelId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as ChannelConnection[]) ?? [];
};

export const saveChannelConnection = async (
  input: Omit<ChannelConnection, 'id' | 'hotel_id' | 'created_at' | 'updated_at'>,
  id?: string
): Promise<ChannelConnection> => {
  if (id) {
    const res = await apiFetch(`/api/channels/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        externalChannelId: input.external_channel_id,
        isEnabled: input.is_enabled,
        status: input.status,
        connectionStatus: input.connection_status
      })
    });
    return res as ChannelConnection;
  }
  const res: any = await apiFetch('/api/channels', {
    method: 'POST',
    body: JSON.stringify({
      channelType: input.channel_type,
      displayName: input.channel_name,
      externalChannelId: input.external_channel_id
    })
  });
  return res.channel;
};

export const deleteChannelConnection = async (id: string): Promise<void> => {
  await apiFetch(`/api/channels/${id}`, { method: 'DELETE' });
};

// ── Rate Plan Mappings ──

export const getChannelRateMappings = async (hotelIdOverride?: string): Promise<ChannelRateMapping[]> => {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  const { data, error } = await supabase
    .from('channel_rate_mappings')
    .select('*')
    .eq('hotel_id', targetHotelId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as ChannelRateMapping[]) ?? [];
};

export const saveChannelRateMapping = async (
  input: Omit<ChannelRateMapping, 'id' | 'hotel_id' | 'created_at' | 'updated_at'>,
  id?: string
): Promise<ChannelRateMapping> => {
  const channelConnectionId = input.channel_connection_id;
  if (!channelConnectionId) {
    throw new Error('channel_connection_id is required to save rate mapping');
  }
  const payload = {
    id,
    roomCategoryId: input.room_category_id,
    ratePlanId: input.rate_plan_id,
    externalRoomCode: input.external_room_code,
    externalRoomName: input.external_room_name,
    externalRatePlanCode: input.external_rate_plan_code,
    externalRatePlanName: input.external_rate_plan_name,
    isActive: input.is_active
  };
  const res: any = await apiFetch(`/api/channels/${channelConnectionId}/mappings`, {
    method: 'POST',
    body: JSON.stringify({ mappings: [payload] })
  });
  return res.mappings[0];
};

export const deleteChannelRateMapping = async (id: string): Promise<void> => {
  const { error } = await supabase.from('channel_rate_mappings').delete().eq('id', id);
  if (error) throw error;
};

// ── OTA Reservations ──

export const getOtaReservations = async (limit = 50, hotelIdOverride?: string): Promise<ChannelOtaReservation[]> => {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  const { data, error } = await supabase
    .from('channel_ota_reservations')
    .select('*')
    .eq('hotel_id', targetHotelId)
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
  endDate: string,
  hotelIdOverride?: string
): Promise<ChannelInventoryRestriction[]> => {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  const { data, error } = await supabase
    .from('channel_inventory_restrictions')
    .select('*')
    .eq('hotel_id', targetHotelId)
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

export interface ExternalSyncResult {
  success: boolean;
  status: 'VERIFIED' | 'PARTIAL_SUCCESS' | 'FAILED' | 'NOT_CONFIGURED' | 'SKIPPED' | 'NOT_NEEDED' | string;
  message?: string;
  failureReasons?: string[];
  rateSync?: any;
  inventorySync?: any;
}

export interface BulkInventoryPatchResult {
  success: boolean;
  updatedCount: number;
  allVerified?: boolean;
  externalSync?: ExternalSyncResult | null;
  rateSync?: any;
  inventorySync?: any;
  message?: string;
  updated?: any[];
  localUpdate?: {
    success: boolean;
    count: number;
  };
  hasRate?: boolean;
  hasInv?: boolean;
  dateRange?: string;
}

export const applyBulkInventoryPatch = async (
  patches: BulkInventoryPatch[],
  skipSync = false
): Promise<BulkInventoryPatchResult> => {
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
  } catch (err: any) {
    const isNetworkOr404 =
      err?.status === 404 ||
      err?.code === 'API_ROUTE_NOT_FOUND' ||
      err?.error === 'NETWORK_ERROR' ||
      err?.code === 'ERR_NETWORK_FAILURE' ||
      err?.code === 'ERR_INTERNET_DISCONNECTED';

    if (!isNetworkOr404) {
      console.error('[applyBulkInventoryPatch] Backend route returned error (not falling back):', err);
      throw new Error(err?.message || (typeof err?.error === 'string' ? err.error : 'Failed to apply bulk inventory and rate updates.'));
    }

    console.warn('[applyBulkInventoryPatch] Backend route unavailable/offline (404/network), falling back to client-side merge:', err);
  }

  // 2. Client-side resilient non-destructive merge fallback
  const targetDates = [...new Set(patches.map(p => normalizeToISODate(p.date)).filter(Boolean))];
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
    const d = normalizeToISODate(p.date);
    if (!d || !p.roomCategoryId) continue;
    const key = `${p.roomCategoryId}|${d}`;
    const prev = coalescedMap.get(key) || { date: d, roomCategoryId: p.roomCategoryId };
    coalescedMap.set(key, { ...prev, ...p, date: d });
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

    // NEVER include id in the upsert payload.
    // Omission guarantees PostgREST does not inject null for new rows in the batch.
    // PostgreSQL handles ON CONFLICT (hotel_id, room_category_id, date) DO UPDATE:
    // - Existing rows retain their database-assigned UUID primary key
    // - New rows are inserted with database DEFAULT gen_random_uuid()
    delete merged.id;

    mergedPayload.push(merged);
  }

  const { error: upsertErr } = await supabase
    .from('channel_inventory_restrictions')
    .upsert(mergedPayload, { onConflict: 'hotel_id,room_category_id,date' });

  if (upsertErr) {
    console.error('[applyBulkInventoryPatch] Client fallback upsert error:', upsertErr);
    throw new Error(upsertErr.message || 'Client fallback upsert failed.');
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
): Promise<any> => {
  const patch: BulkInventoryPatch = {
    roomCategoryId: input.room_category_id,
    date: normalizeToISODate(input.date) || input.date,
    ...(input.base_rate !== undefined ? { baseRate: input.base_rate } : {}),
    ...(input.channel_rate !== undefined ? { channelRate: input.channel_rate } : {}),
    ...(input.availability !== undefined ? { availability: input.availability } : {}),
    ...(input.stop_sell !== undefined ? { stopSell: input.stop_sell } : {}),
    ...(input.min_stay !== undefined ? { minStay: input.min_stay } : {}),
    ...(input.max_stay !== undefined ? { maxStay: input.max_stay } : {}),
    ...(input.closed_to_arrival !== undefined ? { closedToArrival: input.closed_to_arrival } : {}),
    ...(input.closed_to_departure !== undefined ? { closedToDeparture: input.closed_to_departure } : {}),
  };
  return await applyBulkInventoryPatch([patch]);
};

export const bulkUpdateInventory = async (
  updates: Array<InventoryRestrictionInput>
): Promise<void> => {
  const patches: BulkInventoryPatch[] = updates.map(u => ({
    roomCategoryId: u.room_category_id,
    date: normalizeToISODate(u.date) || u.date,
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
  channel_rate?: number;
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
    supabase.from('reservations').select('id, room_id, room_no, check_in_date, check_out_date, status, created_at').eq('hotel_id', hotelId).in('status', ['confirmed', 'checked_in']).lte('check_in_date', endDate).gte('check_out_date', startDate),
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
      const isManual = Boolean(r && r.availability !== undefined && r.availability !== null && String(r.availability) !== '');
      const manualVal = isManual ? Number(r!.availability) : null;

      if (r) {
        if (r.stop_sell) {
          sellable = 0;
        } else if (isManual && manualVal !== null && !isNaN(manualVal)) {
          const rUpdatedAt = r.updated_at ? new Date(r.updated_at).getTime() : 0;
          let newBookingsAfterUpdate = 0;
          if (rUpdatedAt > 0) {
            for (const res of reservations) {
              const ci = new Date(res.check_in_date + 'T12:00:00');
              const co = new Date(res.check_out_date + 'T12:00:00');
              if (dTime >= ci && dTime < co) {
                const resCreatedAt = (res as any).created_at ? new Date((res as any).created_at).getTime() : 0;
                if (resCreatedAt > rUpdatedAt) {
                  const matchedCatId = (res.room_id ? roomToCatMap[res.room_id] : null) || (res.room_no ? roomNoToCatMap[res.room_no.trim().toLowerCase()] : null);
                  if (matchedCatId === cat.id) {
                    newBookingsAfterUpdate++;
                  }
                }
              }
            }
          }
          const remainingManual = Math.max(0, manualVal - newBookingsAfterUpdate);
          sellable = Math.min(remainingManual, calculatedAvailable);
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
        is_manual: isManual,
        manual_availability: manualVal,
        base_rate: r?.base_rate ?? 0,
        channel_rate: r?.channel_rate ?? 0,
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

export const getSyncLogs = async (limit = 100, filters?: SyncLogFilters, hotelIdOverride?: string): Promise<ChannelSyncLog[]> => {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  let query = supabase
    .from('channel_sync_logs')
    .select('*')
    .eq('hotel_id', targetHotelId)
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
  input: Omit<ChannelSyncLog, 'id' | 'hotel_id' | 'created_at' | 'retry_status' | 'retry_count'> & Partial<Pick<ChannelSyncLog, 'retry_status' | 'retry_count'>>,
  hotelIdOverride?: string
): Promise<void> => {
  const targetHotelId = hotelIdOverride || (input as any).hotel_id || getCurrentHotelId();
  const payload = { retry_status: 'not_retried', retry_count: 0, ...input, hotel_id: targetHotelId };
  const { error } = await supabase.from('channel_sync_logs').insert(payload);
  if (error) throw error;
};

export const retrySyncLog = async (logOrId: string | ChannelSyncLog, hotelIdOverride?: string): Promise<any> => {
  const logId = typeof logOrId === 'string' ? logOrId : logOrId.id;
  const targetHotelId = hotelIdOverride || (typeof logOrId === 'object' ? logOrId.hotel_id : undefined) || getCurrentHotelId();
  return await apiFetch(`/api/channels/sync/retry/${logId}`, {
    method: 'POST',
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {}
  });
};

// ── Channel Settings (Backend Secured) ──

export const getChannelSettings = async (hotelIdOverride?: string): Promise<ChannelSettings | null> => {
  try {
    const targetHotelId = hotelIdOverride || getCurrentHotelId();
    const endpoint = `/api/channels/settings${targetHotelId ? `?hotelId=${encodeURIComponent(targetHotelId)}` : ''}`;
    const res: any = await apiFetch(endpoint, {
      headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {}
    });
    if (!res || !res.settings) return null;
    const s = res.settings;
    return {
      id: s.id || '',
      hotel_id: s.hotelId || targetHotelId,
      api_base_url: s.apiBaseUrl || '',
      api_key_secret_name: null,
      property_id: s.hotelCode || null,
      environment: s.environment || 'production',
      status: s.status || 'disconnected',
      last_tested_at: s.lastTestedAt || null,
      last_test_result: s.lastTestResult || null,
      created_at: '',
      updated_at: '',
      aiosell_hotel_code: s.hotelCode || null,
      aiosell_partner_id: s.partnerId || null,
      aiosell_environment: s.environment || 'production',
      aiosell_status: s.status || 'disconnected'
    } as any;
  } catch (err) {
    console.warn('[api-channel] Failed to fetch channel settings from API:', err);
    return null;
  }
};

export const saveChannelSettings = async (
  input: {
    hotelId?: string;
    hotelCode?: string;
    partnerId?: string;
    environment?: 'test' | 'production' | 'sandbox';
    apiBaseUrl?: string;
  } | any,
  hotelIdOverride?: string
): Promise<any> => {
  const targetHotelId = hotelIdOverride || input.hotelId || input.hotel_id || getCurrentHotelId();
  const hotelCode = input.hotelCode !== undefined 
    ? input.hotelCode 
    : (input.aiosell_hotel_code !== undefined ? input.aiosell_hotel_code : input.property_id);
  const partnerId = input.partnerId !== undefined 
    ? input.partnerId 
    : input.aiosell_partner_id;
  const environment = input.environment || input.aiosell_environment || 'production';
  const apiBaseUrl = input.apiBaseUrl || input.api_base_url;

  return await apiFetch('/api/channels/settings', {
    method: 'POST',
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {},
    body: JSON.stringify({ 
      hotelId: targetHotelId,
      hotelCode: hotelCode !== undefined ? (hotelCode ? String(hotelCode).trim() : null) : undefined, 
      partnerId: partnerId !== undefined ? (partnerId ? String(partnerId).trim() : null) : undefined, 
      environment, 
      apiBaseUrl 
    })
  });
};

export const updateChannelSettingsStatus = async (
  status: string,
  testResult?: string,
  hotelIdOverride?: string
): Promise<void> => {
  const existing = await getChannelSettings(hotelIdOverride);
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

export const fetchMappingValidation = async (channelId: string, hotelIdOverride?: string): Promise<{
  success: boolean;
  channelId: string;
  mappingStatus: string;
  isComplete: boolean;
  canPush: boolean;
  totalCategories: number;
  mappedCategories: number;
  unmappedCategories: number;
  missingCategories: { id: string; name: string }[];
  missingRatePlans: { id: string; name: string }[];
  validationErrors: string[];
}> => {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  return await apiFetch(`/api/channels/${channelId}/mapping-validation`, {
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {}
  });
};

export const fetchChannelAuditHistory = async (hotelIdOverride?: string): Promise<any[]> => {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  const endpoint = `/api/channels/audit-history${targetHotelId ? `?hotelId=${encodeURIComponent(targetHotelId)}` : ''}`;
  const res: any = await apiFetch(endpoint, {
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {}
  });
  return res.logs || [];
};

export const fetchSyncLogsPaginated = async (params: {
  channelId?: string;
  logType?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ logs: ChannelSyncLog[]; totalCount: number }> => {
  const q = new URLSearchParams();
  if (params.channelId) q.set('channelId', params.channelId);
  if (params.logType) q.set('logType', params.logType);
  if (params.status) q.set('status', params.status);
  if (params.limit) q.set('limit', String(params.limit));
  if (params.offset) q.set('offset', String(params.offset));

  const res: any = await apiFetch(`/api/channels/sync/logs?${q.toString()}`);
  return { logs: res.logs || [], totalCount: res.totalCount || 0 };
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

export interface OtaPushResult {
  channelId: string;
  channelName: string;
  channelType: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  durationMs: number;
  datesCount: number;
}

export interface OtaPushSummary {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

/**
 * Normalizes a per-OTA status string from the backend to the frontend enum.
 * Backend may send 'successful'/'warning'; frontend expects 'success'/'failed'/'skipped'.
 */
const normalizeOtaStatus = (s: string | undefined): 'success' | 'failed' | 'skipped' => {
  if (!s) return 'failed';
  const lower = s.toLowerCase();
  if (lower === 'success' || lower === 'successful' || lower === 'ok') return 'success';
  if (lower === 'skipped' || lower === 'skip') return 'skipped';
  return 'failed'; // 'warning', 'error', 'failed', or anything else
};

/**
 * Normalizes a raw push response from the backend into the shape the UI components expect.
 * Computes `summary` from `perOtaResults` if the backend didn't include it (the root cause
 * of the production crash where `res.summary` was undefined).
 */
const normalizePushResponse = (
  raw: any
): { success: boolean; summary: OtaPushSummary; perOtaResults: OtaPushResult[]; error?: string } => {
  if (!raw || typeof raw !== 'object') {
    return {
      success: false,
      summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
      perOtaResults: [],
      error: 'Empty or invalid response from server',
    };
  }

  // Normalize perOtaResults array
  const rawResults: any[] = Array.isArray(raw.perOtaResults) ? raw.perOtaResults : [];
  const perOtaResults: OtaPushResult[] = rawResults.map((r: any) => ({
    channelId: r?.channelId || 'unknown',
    channelName: r?.channelName || r?.channelType || 'Unknown Channel',
    channelType: r?.channelType || 'unknown',
    status: normalizeOtaStatus(r?.status),
    message: r?.message || (normalizeOtaStatus(r?.status) === 'success' ? 'Synchronized successfully' : 'Operation completed'),
    durationMs: typeof r?.durationMs === 'number' ? r.durationMs : 0,
    datesCount: typeof r?.datesCount === 'number' ? r.datesCount : 0,
  }));

  // Use backend summary if provided, otherwise compute from perOtaResults
  let summary: OtaPushSummary;
  if (raw.summary && typeof raw.summary === 'object' && typeof raw.summary.total === 'number') {
    summary = {
      total: raw.summary.total,
      succeeded: typeof raw.summary.succeeded === 'number' ? raw.summary.succeeded : 0,
      failed: typeof raw.summary.failed === 'number' ? raw.summary.failed : 0,
      skipped: typeof raw.summary.skipped === 'number' ? raw.summary.skipped : 0,
    };
  } else {
    // Compute summary from normalized perOtaResults
    summary = {
      total: perOtaResults.length,
      succeeded: perOtaResults.filter(r => r.status === 'success').length,
      failed: perOtaResults.filter(r => r.status === 'failed').length,
      skipped: perOtaResults.filter(r => r.status === 'skipped').length,
    };
  }

  const success = typeof raw.success === 'boolean' ? raw.success : summary.failed === 0;
  const error = typeof raw.error === 'string' ? raw.error
    : (typeof raw.message === 'string' && !raw.success) ? raw.message
    : undefined;

  return { success, summary, perOtaResults, error };
};

export const pushRatesToChannels = async (payload: {
  startDate: string;
  endDate: string;
  channelIds?: string[];
  rateOverrides?: Array<{
    room_category_id: string;
    rate_plan_id?: string;
    base_rate: number;
    min_nights?: number;
    stop_sell?: boolean;
  }>;
}): Promise<{
  success: boolean;
  summary: OtaPushSummary;
  perOtaResults: OtaPushResult[];
  error?: string;
}> => {
  const raw = await apiFetch('/api/channels/sync/rates', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return normalizePushResponse(raw);
};

export const pushInventoryToChannels = async (payload: {
  startDate: string;
  endDate: string;
  channelIds?: string[];
  roomCategoryId?: string;
  adjustments?: Record<string, { delta?: number; stopSell?: boolean }>;
}): Promise<{
  success: boolean;
  summary: OtaPushSummary;
  perOtaResults: OtaPushResult[];
  error?: string;
}> => {
  const raw = await apiFetch('/api/channels/sync/inventory', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return normalizePushResponse(raw);
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
  channelStatus?: {
    configured: boolean;
    connected: boolean;
    status: string;
    message?: string;
    errorCode?: string;
  };
}

export const getChannelManagerOverview = async (hotelIdOverride?: string): Promise<ChannelManagerOverview> => {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  const [connections, otaReservations, categories, ratePlans, mappings, syncLogs, settings] = await Promise.all([
    getChannelConnections(targetHotelId),
    getOtaReservations(20, targetHotelId),
    (async () => {
      const { data, error } = await supabase
        .from('room_categories')
        .select('*')
        .eq('hotel_id', targetHotelId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data as RoomCategory[]) ?? [];
    })(),
    (async () => {
      const { data, error } = await supabase
        .from('rate_plans')
        .select('*')
        .eq('hotel_id', targetHotelId)
        .eq('is_active', true)
        .order('plan_type', { ascending: true });
      if (error) throw error;
      return (data as RatePlan[]) ?? [];
    })(),
    getChannelRateMappings(targetHotelId),
    getSyncLogs(50, undefined, targetHotelId),
    getChannelSettings(targetHotelId),
  ]);

  const dbConnected = settings?.aiosell_status === 'connected' && Boolean(settings?.aiosell_hotel_code);
  let isLiveMode = dbConnected;
  let channelStatus: {
    configured: boolean;
    connected: boolean;
    status: string;
    message?: string;
    errorCode?: string;
  } = {
    configured: Boolean(settings?.channel_manager_enabled && settings?.aiosell_hotel_code),
    connected: dbConnected,
    status: dbConnected ? 'CONNECTED' : (settings?.aiosell_status || 'NOT_CONFIGURED').toUpperCase(),
    message: ''
  };

  try {
    const data = await checkChannelStatus(targetHotelId);
    if (data) {
      const isConnected = data.connected === true || String(data.status).toUpperCase() === 'CONNECTED';
      isLiveMode = isConnected || dbConnected;
      channelStatus = {
        configured: data.configured ?? channelStatus.configured,
        connected: isLiveMode,
        status: (data.status || (isLiveMode ? 'CONNECTED' : 'DISCONNECTED')).toUpperCase(),
        message: data.message || '',
        errorCode: (data as any).errorCode || (data as any).error || undefined
      };
    }
  } catch (err) {
    console.warn('Backend channel status ping non-fatal check:', err);
    // If backend check had a transient error, retain authoritative DB state
    if (dbConnected) {
      isLiveMode = true;
      channelStatus.connected = true;
      channelStatus.status = 'CONNECTED';
    }
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
    channelStatus,
  };
};

export async function fetchChannels(hotelIdOverride?: string) {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  return apiFetch('/api/channels', {
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {}
  });
}

export async function fetchChannelDetails(channelId: string, hotelIdOverride?: string) {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  return apiFetch(`/api/channels/${channelId}`, {
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {}
  });
}

export async function updateChannel(channelId: string, updates: Record<string, any>, hotelIdOverride?: string) {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  return apiFetch(`/api/channels/${channelId}`, {
    method: 'PATCH',
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {},
    body: JSON.stringify(updates),
  });
}

export async function deleteChannel(channelId: string, hotelIdOverride?: string) {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  return apiFetch(`/api/channels/${channelId}`, {
    method: 'DELETE',
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {}
  });
}

export async function fetchChannelMappings(channelId: string, hotelIdOverride?: string) {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  return apiFetch(`/api/channels/${channelId}/mappings`, {
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {}
  });
}

export async function saveChannelMappings(channelId: string, mappings: any[], hotelIdOverride?: string) {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  return apiFetch(`/api/channels/${channelId}/mappings`, {
    method: 'POST',
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {},
    body: JSON.stringify({ mappings, hotelId: targetHotelId }),
  });
}

export async function syncChannelInventory(channelId: string, startDate?: string, endDate?: string, hotelIdOverride?: string) {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  return apiFetch(`/api/channels/${channelId}/sync/inventory`, {
    method: 'POST',
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {},
    body: JSON.stringify({ startDate, endDate, hotelId: targetHotelId }),
  });
}

export async function syncChannelRates(channelId: string, startDate?: string, endDate?: string, hotelIdOverride?: string) {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  return apiFetch(`/api/channels/${channelId}/sync/rates`, {
    method: 'POST',
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {},
    body: JSON.stringify({ startDate, endDate, hotelId: targetHotelId }),
  });
}

export async function pullChannelFutureBookings(channelId: string, startDate?: string, endDate?: string, hotelIdOverride?: string) {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  return apiFetch(`/api/channels/${channelId}/future-bookings`, {
    method: 'POST',
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {},
    body: JSON.stringify({ startDate, endDate, hotelId: targetHotelId }),
  });
}

export async function fetchChannelReservations(channelId: string, hotelIdOverride?: string) {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  return apiFetch(`/api/channels/${channelId}/reservations`, {
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {}
  });
}

export async function fetchChannelLogs(channelId: string, hotelIdOverride?: string) {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  return apiFetch(`/api/channels/${channelId}/logs`, {
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {}
  });
}

export async function discoverChannels(hotelIdOverride?: string) {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  return apiFetch('/api/channels/discover', {
    method: 'POST',
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {}
  });
}

export async function addChannel(channelType: string, displayName: string, externalChannelId?: string, hotelIdOverride?: string) {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  return apiFetch('/api/channels', {
    method: 'POST',
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {},
    body: JSON.stringify({ channelType, displayName, externalChannelId, hotelId: targetHotelId })
  });
}

export async function testChannelConnectionDirect(hotelIdOverride?: string) {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  return apiFetch('/api/channels/test-connection', {
    method: 'POST',
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {}
  });
}

export async function triggerChannelLiveSync(params?: { startDate?: string; endDate?: string; force?: boolean }, hotelIdOverride?: string) {
  const targetHotelId = hotelIdOverride || getCurrentHotelId();
  return apiFetch('/api/channels/live-sync', {
    method: 'POST',
    headers: targetHotelId ? { 'x-hotel-id': targetHotelId } : {},
    body: JSON.stringify({ ...(params || {}), hotelId: targetHotelId })
  });
}




