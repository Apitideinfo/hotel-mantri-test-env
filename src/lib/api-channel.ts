import { supabase } from './supabase';
import { getCurrentHotelId } from './api';
import type { RoomCategory } from './types';
import type { RatePlan } from './types-reservations';
export { getAiosellMapping as fetchAiosellMapping } from './api-aiosell';

// ── Types ──

export interface ChannelConnection {
  id: string;
  hotel_id: string;
  channel_type: string;
  channel_name: string;
  status: 'connected' | 'disconnected' | 'paused' | 'error';
  provider?: string;
  external_hotel_code?: string | null;
  external_partner_id?: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChannelRateMapping {
  id: string;
  hotel_id: string;
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
  { type: 'aiosell', label: 'Aiosell', short: 'AS' },
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

export const upsertInventoryRestriction = async (
  input: Omit<ChannelInventoryRestriction, 'id' | 'hotel_id' | 'updated_at'>
): Promise<void> => {
  const payload = { ...input, hotel_id: getCurrentHotelId(), updated_at: new Date().toISOString() };
  const { error } = await supabase
    .from('channel_inventory_restrictions')
    .upsert(payload, { onConflict: 'hotel_id,room_category_id,date' });
  if (error) throw error;
};

export const bulkUpdateInventory = async (
  updates: Array<Omit<ChannelInventoryRestriction, 'id' | 'hotel_id' | 'updated_at'>>
): Promise<void> => {
  const payload = updates.map((u) => ({
    ...u,
    hotel_id: getCurrentHotelId(),
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from('channel_inventory_restrictions')
    .upsert(payload, { onConflict: 'hotel_id,room_category_id,date' });
  if (error) throw error;
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
  const existing = await getChannelSettings();
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  delete payload.aiosell_status;
  delete payload.aiosell_environment;
  delete payload.aiosell_hotel_code;
  delete payload.aiosell_partner_id;
  if (existing) {
    const { data, error } = await supabase
      .from('channel_settings')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return data as ChannelSettings;
  }
  const { data, error } = await supabase
    .from('channel_settings')
    .insert(payload)
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
    const aiosellTest = await fetch('http://localhost:5000/api/aiosell/test', {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (aiosellTest.ok) {
      const data = await aiosellTest.json();
      isLiveMode = data.success === true;
    }
  } catch (err) {
    console.error('Failed to check aiosell status', err);
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
