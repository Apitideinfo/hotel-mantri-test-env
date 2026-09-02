// Enterprise HQ — API layer (all Supabase queries for the enterprise module)

import { supabase } from '@/lib/supabase';
import type {
  CompanyUser, CompanyUserInput, CompanyRoleDef,
  EnterpriseHotel, ChannelManagerHotelStatus, SubscriptionPlan, SubscriptionPayment,
  HotelFeature, CrmLead, CrmLeadNote, SupportTicket, SupportTicketMessage,
  AuditLog, AppNotification, SystemSetting, ImpersonationSession,
} from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ── Supabase error wrapper ──
// Supabase returns plain error objects (not Error instances), so `String(err)`
// produces "[object Object]". This wraps them into a real Error with full details.

const wrapSupabaseError = (table: string, op: string, error: unknown): Error => {
  if (error && typeof error === 'object' && 'message' in error) {
    const e = error as { message?: string; code?: string; details?: string; hint?: string };
    const parts = [
      `${table} ${op} failed`,
      `Postgres: ${e.code ?? '???'}`,
      e.message ?? 'Unknown error',
    ];
    if (e.details) parts.push(`Details: ${e.details}`);
    if (e.hint) parts.push(`Hint: ${e.hint}`);
    return new Error(parts.join(' | '));
  }
  if (error instanceof Error) return error;
  return new Error(`${table} ${op} failed: ${String(error)}`);
};

// ── Audit logging helper ──

export const logAudit = async (entry: {
  action: string;
  module: string;
  hotel_id?: string;
  hotel_name?: string;
  record_id?: string;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  reason?: string;
  metadata?: Record<string, unknown>;
}) => {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    const { data: roleData } = await supabase.rpc('company_user_role');
    await supabase.from('audit_logs').insert({
      user_id: user?.id ?? null,
      user_email: user?.email ?? '',
      role: (roleData as string) ?? '',
      action: entry.action,
      module: entry.module,
      hotel_id: entry.hotel_id ?? null,
      hotel_name: entry.hotel_name ?? '',
      record_id: entry.record_id ?? '',
      old_value: entry.old_value ?? null,
      new_value: entry.new_value ?? null,
      severity: entry.severity ?? 'info',
      reason: entry.reason ?? '',
      metadata: entry.metadata ?? {},
    });
  } catch {
    // Audit logging should never block the operation
  }
};

// ── Hotels ──

export const getEnterpriseHotels = async (): Promise<EnterpriseHotel[]> => {
  try {
    const { data, error } = await supabase
      .from('hotels')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return [];
    return (data ?? []) as EnterpriseHotel[];
  } catch {
    return [];
  }
};

export const getChannelManagerHotelStatuses = async (): Promise<ChannelManagerHotelStatus[]> => {
  try {
    const [settingsResult, connectionsResult, mappingsResult] = await Promise.all([
      supabase.from('channel_settings').select('hotel_id, status, last_tested_at, last_test_result, aiosell_status, aiosell_hotel_code'),
      supabase.from('channel_connections').select('hotel_id, status, last_sync_at, last_error'),
      supabase.from('channel_rate_mappings').select('hotel_id, status'),
    ]);

    const settingsData = settingsResult.data ?? [];
    const connectionsData = connectionsResult.data ?? [];
    const mappingsData = mappingsResult.data ?? [];

    const hotelIds = new Set<string>();
    for (const row of [...settingsData, ...connectionsData, ...mappingsData]) hotelIds.add(row.hotel_id);
    return Array.from(hotelIds).map((hotelId) => {
      const settings = settingsData.find((row) => row.hotel_id === hotelId);
      const connections = connectionsData.filter((row) => row.hotel_id === hotelId);
      const mappings = mappingsData.filter((row) => row.hotel_id === hotelId);
      const lastSyncs = [settings?.last_tested_at, ...connections.map((row) => row.last_sync_at)].filter((value): value is string => Boolean(value)).sort().reverse();
      
      const isConnected = settings?.status === 'connected' || settings?.aiosell_status === 'connected' || connections.some((row) => row.status === 'connected');
      
      return {
        hotel_id: hotelId,
        enabled: settings?.status === 'connected' || settings?.aiosell_status === 'connected' || settings?.aiosell_status === 'paused',
        connected: isConnected,
        aiosell_hotel_code: settings?.aiosell_hotel_code ?? null,
        mapping_complete: mappings.length > 0 && mappings.every((row) => row.status === 'mapped'),
        last_sync: lastSyncs[0] ?? null,
        sync_error: settings?.last_test_result ?? connections.find((row) => row.last_error)?.last_error ?? null,
      };
    });
  } catch {
    return [];
  }
};


export const getEnterpriseHotel = async (id: string): Promise<EnterpriseHotel | null> => {
  const { data, error } = await supabase
    .from('hotels')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as EnterpriseHotel | null;
};

export const updateEnterpriseHotel = async (
  id: string,
  patch: Partial<EnterpriseHotel>,
  oldHotel?: EnterpriseHotel,
) => {
  const { data, error } = await supabase
    .from('hotels')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  await logAudit({
    action: 'update_hotel',
    module: 'hotels',
    hotel_id: id,
    hotel_name: oldHotel?.hotel_name ?? data.hotel_name,
    record_id: id,
    old_value: oldHotel as Record<string, unknown> | undefined,
    new_value: data as Record<string, unknown>,
  });
  return data as EnterpriseHotel;
};

export const deactivateEnterpriseHotel = async (hotelId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/setup-super-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action: 'deactivate_hotel', hotel_id: hotelId })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Edge Function Error: ${JSON.stringify(data)}`);
  }
  return data;
};

export const createEnterpriseHotel = async (
  payload: Record<string, unknown>,
) => {
  const { data, error } = await supabase
    .from('hotels')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw wrapSupabaseError('hotels', 'insert', error);
  await logAudit({
    action: 'create_hotel',
    module: 'hotels',
    hotel_id: data.id,
    hotel_name: data.hotel_name,
    record_id: data.id,
    new_value: data as Record<string, unknown>,
  });
  return data as EnterpriseHotel;
};

// ── Subscription Plans ──

export const getPlans = async (): Promise<SubscriptionPlan[]> => {
  try {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) return [];
    return (data ?? []) as SubscriptionPlan[];
  } catch {
    return [];
  }
};

export const upsertPlan = async (
  payload: Partial<SubscriptionPlan>,
  id?: string,
): Promise<SubscriptionPlan> => {
  if (id) {
    const { data, error } = await supabase
      .from('subscription_plans')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as SubscriptionPlan;
  }
  const { data, error } = await supabase
    .from('subscription_plans')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as SubscriptionPlan;
};

// ── Subscription Payments ──

export const getPayments = async (hotelId?: string): Promise<SubscriptionPayment[]> => {
  try {
    let q = supabase.from('subscription_payments').select('*').order('created_at', { ascending: false });
    if (hotelId) q = q.eq('hotel_id', hotelId);
    const { data, error } = await q;
    if (error) return [];
    return (data ?? []) as SubscriptionPayment[];
  } catch {
    return [];
  }
};

export const createPayment = async (payload: Record<string, unknown>): Promise<SubscriptionPayment> => {
  const { data, error } = await supabase.from('subscription_payments').insert(payload).select('*').single();
  if (error) throw error;
  await logAudit({
    action: 'record_payment',
    module: 'subscriptions',
    hotel_id: payload.hotel_id as string,
    record_id: data.id,
    new_value: data as Record<string, unknown>,
  });
  return data as SubscriptionPayment;
};

// ── Hotel Features ──

export const getHotelFeatures = async (hotelId: string): Promise<HotelFeature[]> => {
  const { data, error } = await supabase
    .from('hotel_features')
    .select('*')
    .eq('hotel_id', hotelId);
  if (error) throw error;
  return (data ?? []) as HotelFeature[];
};

export const upsertHotelFeature = async (
  hotelId: string,
  moduleKey: string,
  isEnabled: boolean,
): Promise<void> => {
  const { error } = await supabase
    .from('hotel_features')
    .upsert(
      { hotel_id: hotelId, module_key: moduleKey, is_enabled: isEnabled, updated_at: new Date().toISOString() },
      { onConflict: 'hotel_id,module_key' },
    );
  if (error) throw wrapSupabaseError('hotel_features', 'upsert', error);
};

// ── Company Users ──

export const getCompanyUsers = async (): Promise<CompanyUser[]> => {
  const { data, error } = await supabase
    .from('company_users')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CompanyUser[];
};

export const getCompanyRoles = async (): Promise<CompanyRoleDef[]> => {
  const { data, error } = await supabase
    .from('company_roles')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CompanyRoleDef[];
};

export const saveCompanyUser = async (
  input: CompanyUserInput,
  id?: string,
): Promise<CompanyUser> => {
  if (id) {
    const { password, ...patch } = input;
    void password;
    const { data, error } = await supabase
      .from('company_users')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    await logAudit({ action: 'update_company_user', module: 'users', record_id: id, new_value: data as Record<string, unknown> });
    return data as CompanyUser;
  }
  // Create auth user first via edge function
  if (!input.password || input.password.length < 6) throw new Error('Password must be at least 6 characters');
  const { data: result, error: fetchErr } = await supabase.functions.invoke('setup-super-admin', {
    body: { action: 'create_company_user', email: input.email, password: input.password, name: input.name, role: input.role },
  });
  if (fetchErr) {
    throw new Error(fetchErr.message || 'Failed to create user account');
  }
  const userId = result.userId as string;
  const { password, ...insertPayload } = input;
  void password;
  const { data, error } = await supabase
    .from('company_users')
    .insert({ ...insertPayload, user_id: userId })
    .select('*')
    .single();
  if (error) throw error;
  await logAudit({ action: 'create_company_user', module: 'users', record_id: data.id, new_value: data as Record<string, unknown> });
  return data as CompanyUser;
};

export const deleteCompanyUser = async (id: string): Promise<void> => {
  const { error } = await supabase.from('company_users').delete().eq('id', id);
  if (error) throw error;
  await logAudit({ action: 'delete_company_user', module: 'users', record_id: id });
};

// ── CRM Leads ──

export const getLeads = async (): Promise<CrmLead[]> => {
  const { data, error } = await supabase
    .from('crm_leads')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CrmLead[];
};

export const saveLead = async (payload: Partial<CrmLead>, id?: string): Promise<CrmLead> => {
  if (id) {
    const { data, error } = await supabase
      .from('crm_leads')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as CrmLead;
  }
  const { data, error } = await supabase
    .from('crm_leads')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  await logAudit({ action: 'create_lead', module: 'crm', record_id: data.id, new_value: data as Record<string, unknown> });
  return data as CrmLead;
};

export const deleteLead = async (id: string): Promise<void> => {
  const { error } = await supabase.from('crm_leads').delete().eq('id', id);
  if (error) throw error;
};

export const getLeadNotes = async (leadId: string): Promise<CrmLeadNote[]> => {
  const { data, error } = await supabase
    .from('crm_lead_notes')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CrmLeadNote[];
};

export const addLeadNote = async (leadId: string, note: string): Promise<CrmLeadNote> => {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('crm_lead_notes')
    .insert({ lead_id: leadId, user_id: userData.user?.id ?? null, note })
    .select('*')
    .single();
  if (error) throw error;
  return data as CrmLeadNote;
};

// ── Support Tickets ──

export const getTickets = async (): Promise<SupportTicket[]> => {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SupportTicket[];
};

export const saveTicket = async (payload: Partial<SupportTicket>, id?: string): Promise<SupportTicket> => {
  if (id) {
    const { data, error } = await supabase
      .from('support_tickets')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as SupportTicket;
  }
  const ticketNumber = `HM-${Date.now().toString(36).toUpperCase()}`;
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({ ...payload, ticket_number: ticketNumber })
    .select('*')
    .single();
  if (error) throw error;
  await logAudit({ action: 'create_ticket', module: 'tickets', record_id: data.id, new_value: data as Record<string, unknown> });
  return data as SupportTicket;
};

export const deleteTicket = async (id: string): Promise<void> => {
  const { error } = await supabase.from('support_tickets').delete().eq('id', id);
  if (error) throw error;
};

export const getTicketMessages = async (ticketId: string): Promise<SupportTicketMessage[]> => {
  const { data, error } = await supabase
    .from('support_ticket_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SupportTicketMessage[];
};

export const addTicketMessage = async (ticketId: string, message: string): Promise<SupportTicketMessage> => {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('support_ticket_messages')
    .insert({ ticket_id: ticketId, user_id: userData.user?.id ?? null, message })
    .select('*')
    .single();
  if (error) throw error;
  return data as SupportTicketMessage;
};

// ── Audit Logs ──

export const getAuditLogs = async (filters?: {
  module?: string; hotelId?: string; severity?: string; limit?: number;
}): Promise<AuditLog[]> => {
  let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
  if (filters?.module) q = q.eq('module', filters.module);
  if (filters?.hotelId) q = q.eq('hotel_id', filters.hotelId);
  if (filters?.severity) q = q.eq('severity', filters.severity);
  q = q.limit(filters?.limit ?? 200);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AuditLog[];
};

// ── Notifications ──

export const getNotifications = async (): Promise<AppNotification[]> => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as AppNotification[];
};

export const markNotificationRead = async (id: string): Promise<void> => {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) throw error;
};

export const markAllNotificationsRead = async (): Promise<void> => {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
  if (error) throw error;
};

export const createNotification = async (payload: {
  type: string; title: string; message: string; priority?: string;
  hotel_id?: string; target_role?: string;
}): Promise<void> => {
  const { error } = await supabase.from('notifications').insert({
    type: payload.type,
    title: payload.title,
    message: payload.message,
    priority: payload.priority ?? 'low',
    hotel_id: payload.hotel_id ?? null,
    target_role: payload.target_role ?? '',
  });
  if (error) throw error;
};

// ── System Settings ──

export const getSystemSettings = async (): Promise<SystemSetting[]> => {
  const { data, error } = await supabase.from('system_settings').select('*');
  if (error) throw error;
  return (data ?? []) as SystemSetting[];
};

export const updateSystemSetting = async (key: string, value: Record<string, unknown>): Promise<void> => {
  const { error } = await supabase
    .from('system_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
  await logAudit({ action: 'update_setting', module: 'settings', record_id: key, new_value: value });
};

// ── Impersonation ──

export const startImpersonation = async (hotelId: string, hotelName: string, reason: string): Promise<ImpersonationSession> => {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('impersonation_sessions')
    .insert({
      admin_user_id: userData.user?.id ?? '',
      admin_email: userData.user?.email ?? '',
      hotel_id: hotelId,
      hotel_name: hotelName,
      reason,
      started_at: new Date().toISOString(),
      is_active: true,
    })
    .select('*')
    .single();
  if (error) throw error;
  await logAudit({
    action: 'start_impersonation',
    module: 'impersonation',
    hotel_id: hotelId,
    hotel_name: hotelName,
    record_id: data.id,
    reason,
    severity: 'warning',
  });
  return data as ImpersonationSession;
};

export const endImpersonation = async (sessionId: string): Promise<void> => {
  const { error } = await supabase
    .from('impersonation_sessions')
    .update({
      is_active: false,
      ended_at: new Date().toISOString(),
      duration_seconds: Math.floor(Date.now() / 1000) - 0,
    })
    .eq('id', sessionId);
  if (error) throw error;
  await logAudit({
    action: 'end_impersonation',
    module: 'impersonation',
    record_id: sessionId,
    severity: 'info',
  });
};

export const getImpersonationSessions = async (): Promise<ImpersonationSession[]> => {
  const { data, error } = await supabase
    .from('impersonation_sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as ImpersonationSession[];
};

// ── Enterprise room categories (explicit hotel_id) ──

export const getEnterpriseRoomCategories = async (hotelId: string) => {
  const { data, error } = await supabase
    .from('room_categories')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const createEnterpriseRoomCategory = async (
  hotelId: string,
  name: string,
  defaultTariff: number,
  extraBedCharge: number,
) => {
  if (!hotelId) throw new Error('Hotel ID missing before category creation.');
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Room category name cannot be empty.');

  const { data: existing } = await supabase
    .from('room_categories')
    .select('sort_order')
    .eq('hotel_id', hotelId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = existing ? (existing as { sort_order: number }).sort_order + 1 : 1;

  const payload = {
    hotel_id: hotelId,
    name: trimmedName,
    sort_order: nextOrder,
    default_tariff: defaultTariff,
    extra_bed_charge: extraBedCharge,
  };
  console.log('[createEnterpriseRoomCategory] INSERT payload:', payload);

  const { data, error } = await supabase
    .from('room_categories')
    .insert(payload)
    .select('*')
    .single();
  if (error) {
    const parts = [
      `room_categories insert failed`,
      `Postgres: ${error.code ?? '???'}`,
      error.message ?? '',
    ];
    if (error.details) parts.push(`Details: ${error.details}`);
    if (error.hint) parts.push(`Hint: ${error.hint}`);
    throw new Error(parts.join(' | '));
  }
  return data;
};

export const deleteEnterpriseRoomCategory = async (id: string) => {
  const { error } = await supabase.from('room_categories').delete().eq('id', id);
  if (error) throw error;
};

// ── Enterprise rooms (explicit hotel_id) ──

export const getEnterpriseRooms = async (hotelId: string) => {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const createEnterpriseRoom = async (
  hotelId: string,
  roomNo: string,
  categoryId: string | null,
  floor: string | null,
  defaultTariff: number,
  extraBedCharge: number,
  isActive: boolean,
) => {
  const { data, error } = await supabase
    .from('rooms')
    .insert({
      hotel_id: hotelId,
      room_no: roomNo.trim(),
      category_id: categoryId,
      floor,
      default_tariff: defaultTariff,
      extra_bed_charge: extraBedCharge,
      is_active: isActive,
      sort_order: 0,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

export const updateEnterpriseRoom = async (id: string, patch: Record<string, unknown>) => {
  const { data, error } = await supabase
    .from('rooms')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

export const deleteEnterpriseRoom = async (id: string) => {
  const { error } = await supabase.from('rooms').delete().eq('id', id);
  if (error) throw error;
};

export const bulkCreateEnterpriseRooms = async (
  hotelId: string,
  rooms: { room_no: string; category_id: string | null; floor: string | null; default_tariff: number; extra_bed_charge: number; is_active: boolean; sort_order: number }[],
) => {
  const payload = rooms.map((r) => ({ ...r, hotel_id: hotelId }));
  console.log('[bulkCreateEnterpriseRooms] INSERT payload:', payload);
  const { data, error } = await supabase.from('rooms').insert(payload).select('*');
  if (error) throw wrapSupabaseError('rooms', 'insert', error);
  return data ?? [];
};

// ─ Enterprise hotel setup (hotel_settings + company_sources) ──

export const setupHotelDefaults = async (hotelId: string, hotelName: string, totalRooms: number) => {
  const { error: settingsError } = await supabase.from('hotel_settings').insert({
    id: hotelId,
    hotel_name: hotelName,
    total_rooms: totalRooms,
  });
  if (settingsError) throw wrapSupabaseError('hotel_settings', 'insert', settingsError);

  const defaultSources = ['OTA', 'Direct/Walking', 'Corporate/Agent', 'Phonebook'];
  const { error: sourcesError } = await supabase.from('company_sources').insert(
    defaultSources.map((cat) => ({
      hotel_id: hotelId,
      name: cat,
      source_category: cat as 'OTA' | 'Direct/Walking' | 'Corporate/Agent' | 'Phonebook',
    })),
  );
  if (sourcesError) throw wrapSupabaseError('company_sources', 'insert', sourcesError);
};

// ── Edge function call for creating hotel admin ──

// ── Idempotent Hotel Onboarding ──

export interface OnboardingResult {
  success: boolean;
  hotel_id?: string;
  attempt_id?: string;
  completed_steps?: string[];
  failed_step?: string;
  error?: string;
}

export const checkExistingOnboarding = async (
  propertyCode: string | null,
  adminEmail: string,
): Promise<{ hotel: EnterpriseHotel | null; attempt: { id: string; status: string; completed_steps: string[]; failed_step: string | null; error_message: string | null } | null }> => {
  const attemptKey = `${propertyCode || ''}|${adminEmail}`;
  const { data: attempt } = await supabase
    .from('onboarding_attempts')
    .select('*')
    .eq('attempt_key', attemptKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let hotel: EnterpriseHotel | null = null;
  if (attempt?.hotel_id) {
    const { data: h } = await supabase
      .from('hotels')
      .select('*')
      .eq('id', attempt.hotel_id)
      .maybeSingle();
    hotel = h as EnterpriseHotel | null;
  }

  if (!hotel) {
    const { data: byEmail } = await supabase
      .from('hotels')
      .select('*')
      .eq('admin_email', adminEmail)
      .maybeSingle();
    hotel = byEmail as EnterpriseHotel | null;
  }

  if (!hotel && propertyCode) {
    const { data: byCode } = await supabase
      .from('hotels')
      .select('*')
      .eq('property_code', propertyCode)
      .maybeSingle();
    hotel = byCode as EnterpriseHotel | null;
  }

  return {
    hotel,
    attempt: attempt as { id: string; status: string; completed_steps: string[]; failed_step: string | null; error_message: string | null } | null,
  };
};

export const onboardHotelAtomically = async (payload: {
  hotel_name: string;
  owner_name: string;
  admin_email: string;
  mobile: string;
  address: string;
  total_rooms: number;
  city: string;
  state: string;
  property_code: string | null;
  password: string;
  categories: { name: string; tariff: number; extra_bed: number }[];
  rooms: { room_no: string; category_name: string | null; floor: string | null; tariff: number; extra_bed: number; is_active: boolean }[];
  features: Record<string, boolean>;
}): Promise<OnboardingResult> => {
  try {
    const session = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/hotel-onboarding`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.data.session?.access_token ?? ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'onboard_hotel', ...payload }),
    });
    const result = await res.json();
    if (res.ok && result.success) {
      return {
        success: true,
        hotel_id: result.hotel_id,
        attempt_id: result.attempt_id,
        completed_steps: result.completed_steps,
      };
    }

    return {
      success: false,
      error: result.error || 'Onboarding failed',
      failed_step: result.failed_step || 'unknown',
      attempt_id: result.attempt_id || 'N/A',
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error during onboarding',
      failed_step: 'network',
      attempt_id: 'N/A',
    };
  }
};

export const discardOnboardingAttempt = async (attemptId: string, hotelId: string): Promise<void> => {
  await supabase.from('onboarding_attempts').delete().eq('id', attemptId);
  await supabase.from('hotels').delete().eq('id', hotelId);
};

export const createHotelAdminAccount = async (email: string, password: string, hotelId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/setup-super-admin`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create_hotel_admin', email, password, hotel_id: hotelId, role: 'hotel_admin' }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create admin account');
  }
  return res.json();
};

export const resetHotelPassword = async (email: string, password: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/setup-super-admin`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reset_password', email, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to reset password');
  }
  return res.json();
};

// ── Hotel Data Management ──

export interface HotelRecordCounts {
  daily_reports: number;
  daily_revenue_entries: number;
  room_chart_entries: number;
  expense_entries: number;
  expense_categories: number;
  other_daily_entries: number;
  electricity_readings: number;
  laundry_entries: number;
  monthly_bills: number;
  salary_advances: number;
  salary_settlements: number;
  utility_bills: number;
  staff: number;
  company_sources: number;
  room_categories: number;
  rooms: number;
  hotel_features: number;
  hotel_admins: number;
  subscription_payments: number;
  support_tickets: number;
  notifications: number;
  audit_logs: number;
  impersonation_sessions: number;
  hotel_invitations: number;
  hotel_settings: number;
  hotels: number;
}

export interface DeletionSummary {
  success: boolean;
  hotel_id: string;
  hotel_name: string;
  deleted_counts: HotelRecordCounts;
  auth_user_ids_to_delete?: string[];
  message: string;
}

export const getHotelRecordCounts = async (hotelId: string): Promise<HotelRecordCounts> => {
  const { data, error } = await supabase.rpc('get_hotel_record_counts', { p_hotel_id: hotelId });
  if (error) throw error;
  return data as HotelRecordCounts;
};

export const exportHotelData = async (hotelId: string): Promise<Record<string, unknown>> => {
  const { data, error } = await supabase.rpc('export_hotel_data', { p_hotel_id: hotelId });
  if (error) throw error;
  return data as Record<string, unknown>;
};

export const resetHotelOperationalData = async (
  hotelId: string,
  reason: string,
  userEmail: string,
  ip: string,
  device: string,
): Promise<DeletionSummary> => {
  const { data, error } = await supabase.rpc('reset_hotel_operational_data', {
    p_hotel_id: hotelId,
    p_reason: reason,
    p_user_email: userEmail,
    p_ip: ip,
    p_device: device,
  });
  if (error) throw error;
  return data as DeletionSummary;
};

export const deleteHotelPermanently = async (
  hotelId: string,
  reason: string,
  userEmail: string,
  ip: string,
  device: string,
): Promise<DeletionSummary> => {
  // Step 1: Delete storage files first (edge function with service role)
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/hotel-data-management`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_storage_files', hotel_id: hotelId }),
    });
  } catch {
    // Storage cleanup is best-effort — don't block deletion
  }

  // Step 2: Call the database function to delete all records
  const { data, error } = await supabase.rpc('delete_hotel_permanently', {
    p_hotel_id: hotelId,
    p_reason: reason,
    p_user_email: userEmail,
    p_ip: ip,
    p_device: device,
  });
  if (error) throw error;
  const summary = data as DeletionSummary;

  // Step 3: Delete auth.users for users that belonged only to this hotel
  if (summary.auth_user_ids_to_delete && summary.auth_user_ids_to_delete.length > 0) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/hotel-data-management`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_auth_users', auth_user_ids: summary.auth_user_ids_to_delete }),
      });
    } catch {
      // Auth user cleanup is best-effort — the hotel data is already deleted
    }
  }

  return summary;
};

export const deleteHotelStorageFiles = async (hotelId: string): Promise<number> => {
  const session = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/hotel-data-management`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${session.data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete_storage_files', hotel_id: hotelId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to delete storage files');
  }
  const result = await res.json();
  return result.deleted_files as number;
};

// ── Billing & Invoice API ──

import type {
  BillingSettings, Invoice, InvoiceItem, InvoicePayment,
  InvoiceWithDetails, InvoiceStatus,
} from './types';

export const getBillingSettings = async (): Promise<BillingSettings> => {
  const { data, error } = await supabase.rpc('get_billing_settings');
  if (error) throw error;
  return data as BillingSettings;
};

export const updateBillingSettings = async (
  section: 'company_details' | 'branding' | 'invoice_numbering' | 'gst' | 'payment' | 'terms',
  data: Record<string, unknown>,
): Promise<void> => {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.rpc('update_billing_settings', {
    p_section: section,
    p_data: data,
    p_user_email: userData.user?.email ?? '',
  });
  if (error) throw error;
};

export const previewNextInvoiceNumber = async (): Promise<string> => {
  const { data, error } = await supabase.rpc('preview_next_invoice_number');
  if (error) throw error;
  return data as string;
};

export const getInvoices = async (filters?: {
  hotelId?: string;
  status?: InvoiceStatus;
  planId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<InvoiceWithDetails[]> => {
  let q = supabase
    .from('invoices')
    .select('*, hotels!inner(hotel_name, property_code, address, city, state, admin_email, mobile, owner_name, total_rooms), subscription_plans(name)')
    .order('created_at', { ascending: false });
  if (filters?.hotelId) q = q.eq('hotel_id', filters.hotelId);
  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.planId) q = q.eq('plan_id', filters.planId);
  if (filters?.dateFrom) q = q.gte('invoice_date', filters.dateFrom);
  if (filters?.dateTo) q = q.lte('invoice_date', filters.dateTo);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => {
    const h = (r.hotels as Record<string, unknown>) ?? {};
    const p = (r.subscription_plans as Record<string, unknown>) ?? {};
    return {
      ...r,
      hotel_name: h.hotel_name as string,
      property_code: h.property_code as string,
      address: h.address as string,
      city: h.city as string,
      state: h.state as string,
      admin_email: h.admin_email as string,
      mobile: h.mobile as string,
      owner_name: h.owner_name as string,
      total_rooms: h.total_rooms as number,
      plan_name: p.name as string,
    };
  }) as InvoiceWithDetails[];
};

export const getInvoice = async (id: string): Promise<InvoiceWithDetails | null> => {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, hotels!inner(hotel_name, property_code, address, city, state, admin_email, mobile, owner_name, total_rooms), subscription_plans(name)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const h = (data.hotels as Record<string, unknown>) ?? {};
  const p = (data.subscription_plans as Record<string, unknown>) ?? {};
  let planName = p.name as string | undefined;
  if (!planName && data.plan_id) {
    const { data: planData } = await supabase
      .from('subscription_plans')
      .select('name')
      .eq('id', data.plan_id)
      .maybeSingle();
    if (planData) planName = planData.name;
  }
  return {
    ...data,
    hotel_name: h.hotel_name as string,
    property_code: h.property_code as string,
    address: h.address as string,
    city: h.city as string,
    state: h.state as string,
    admin_email: h.admin_email as string,
    mobile: h.mobile as string,
    owner_name: h.owner_name as string,
    total_rooms: h.total_rooms as number,
    plan_name: planName,
  } as InvoiceWithDetails;
};

export const getInvoiceItems = async (invoiceId: string): Promise<InvoiceItem[]> => {
  const { data, error } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('sr_no', { ascending: true });
  if (error) throw error;
  return (data ?? []) as InvoiceItem[];
};

export const getInvoicePayments = async (invoiceId: string): Promise<InvoicePayment[]> => {
  const { data, error } = await supabase
    .from('invoice_payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as InvoicePayment[];
};

export const createInvoice = async (payload: {
  hotel_id: string;
  plan_id?: string | null;
  billing_period?: string;
  billing_cycle?: string;
  number_of_rooms?: number;
  number_of_users?: number;
  enabled_modules?: string[];
  subscription_start?: string;
  subscription_end?: string;
  is_interstate?: boolean;
  place_of_supply?: string;
  notes?: string;
  due_date?: string;
  items: Array<{
    description: string;
    hsn_sac?: string;
    quantity: number;
    rate: number;
    discount?: number;
    gst_rate?: number;
    item_type?: string;
  }>;
}): Promise<Invoice> => {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('invoices')
    .insert({
      hotel_id: payload.hotel_id,
      plan_id: payload.plan_id ?? null,
      status: 'Draft',
      billing_period: payload.billing_period ?? '',
      billing_cycle: payload.billing_cycle ?? '',
      number_of_rooms: payload.number_of_rooms ?? 0,
      number_of_users: payload.number_of_users ?? 0,
      enabled_modules: payload.enabled_modules ?? [],
      subscription_start: payload.subscription_start ?? null,
      subscription_end: payload.subscription_end ?? null,
      is_interstate: payload.is_interstate ?? false,
      place_of_supply: payload.place_of_supply ?? '',
      notes: payload.notes ?? '',
      due_date: payload.due_date ?? null,
      created_by: userData.user?.id,
    })
    .select('*')
    .single();
  if (error) throw error;
  const invoice = data as Invoice;

  // Insert items and compute totals
  const settings = await getBillingSettings();
  const gstRate = payload.items[0]?.gst_rate ?? settings.gst.default_gst_rate;
  let subtotal = 0;
  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalDiscount = 0;

  const itemsToInsert = payload.items.map((item, idx) => {
    const qty = item.quantity || 1;
    const disc = item.discount || 0;
    const lineTotal = qty * item.rate;
    const taxableValue = lineTotal - disc;
    const taxAmount = (taxableValue * gstRate) / 100;
    const cgst = payload.is_interstate ? 0 : taxAmount / 2;
    const sgst = payload.is_interstate ? 0 : taxAmount / 2;
    const igst = payload.is_interstate ? taxAmount : 0;
    const amount = taxableValue + taxAmount;

    subtotal += lineTotal;
    totalDiscount += disc;
    totalTaxable += taxableValue;
    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;

    return {
      invoice_id: invoice.id,
      sr_no: idx + 1,
      description: item.description,
      hsn_sac: item.hsn_sac ?? settings.gst.hsn_sac,
      quantity: qty,
      rate: item.rate,
      discount: disc,
      taxable_value: taxableValue,
      gst_rate: gstRate,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      amount,
      item_type: item.item_type ?? 'subscription',
    };
  });

  const { error: itemsError } = await supabase.from('invoice_items').insert(itemsToInsert);
  if (itemsError) throw itemsError;

  let totalAmount = totalTaxable + totalCgst + totalSgst + totalIgst;
  let roundOff = 0;
  if (settings.gst.round_off) {
    const rounded = Math.round(totalAmount);
    roundOff = rounded - totalAmount;
    totalAmount = rounded;
  }

  const { error: updateError } = await supabase
    .from('invoices')
    .update({
      subtotal,
      discount_amount: totalDiscount,
      taxable_amount: totalTaxable,
      cgst_amount: totalCgst,
      sgst_amount: totalSgst,
      igst_amount: totalIgst,
      round_off: roundOff,
      total_amount: totalAmount,
      balance_due: totalAmount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice.id);
  if (updateError) throw updateError;

  return { ...invoice, subtotal, discount_amount: totalDiscount, taxable_amount: totalTaxable,
    cgst_amount: totalCgst, sgst_amount: totalSgst, igst_amount: totalIgst,
    round_off: roundOff, total_amount: totalAmount, balance_due: totalAmount } as Invoice;
};

export const issueInvoice = async (invoiceId: string): Promise<{ invoice_number: string }> => {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc('issue_invoice', {
    p_invoice_id: invoiceId,
    p_user_email: userData.user?.email ?? '',
  });
  if (error) throw error;
  return { invoice_number: (data as Record<string, unknown>).invoice_number as string };
};

export const recordInvoicePayment = async (params: {
  invoiceId: string;
  amount: number;
  paymentMode: string;
  transactionReference?: string;
  bankOrUpi?: string;
  notes?: string;
}): Promise<{ receipt_number: string; new_status: string }> => {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc('record_invoice_payment', {
    p_invoice_id: params.invoiceId,
    p_amount: params.amount,
    p_payment_mode: params.paymentMode,
    p_transaction_reference: params.transactionReference ?? '',
    p_bank_or_upi: params.bankOrUpi ?? '',
    p_notes: params.notes ?? '',
    p_user_email: userData.user?.email ?? '',
  });
  if (error) throw error;
  return {
    receipt_number: (data as Record<string, unknown>).receipt_number as string,
    new_status: (data as Record<string, unknown>).new_status as string,
  };
};

export const cancelInvoice = async (invoiceId: string, reason: string): Promise<void> => {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.rpc('cancel_invoice', {
    p_invoice_id: invoiceId,
    p_reason: reason,
    p_user_email: userData.user?.email ?? '',
  });
  if (error) throw error;
};

export const updateInvoiceStatus = async (invoiceId: string, status: InvoiceStatus): Promise<void> => {
  const { error } = await supabase
    .from('invoices')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', invoiceId);
  if (error) throw error;
};

export const deleteDraftInvoice = async (invoiceId: string): Promise<void> => {
  const { error } = await supabase.from('invoices').delete().eq('id', invoiceId);
  if (error) throw error;
};

export const duplicateInvoice = async (invoiceId: string): Promise<string> => {
  const [invoice, items] = await Promise.all([
    getInvoice(invoiceId),
    getInvoiceItems(invoiceId),
  ]);
  if (!invoice) throw new Error('Invoice not found');

  const newInvoice = await createInvoice({
    hotel_id: invoice.hotel_id,
    plan_id: invoice.plan_id ?? null,
    billing_period: invoice.billing_period ?? '',
    billing_cycle: invoice.billing_cycle ?? '',
    number_of_rooms: invoice.number_of_rooms ?? 0,
    number_of_users: invoice.number_of_users ?? 0,
    enabled_modules: invoice.enabled_modules ?? [],
    is_interstate: invoice.is_interstate ?? false,
    place_of_supply: invoice.place_of_supply ?? '',
    notes: invoice.notes ?? '',
    due_date: invoice.due_date ?? undefined,
    items: items.map((item) => ({
      description: item.description,
      hsn_sac: item.hsn_sac,
      quantity: item.quantity,
      rate: item.rate,
      discount: item.discount,
      gst_rate: item.gst_rate,
      item_type: item.item_type,
    })),
  });
  return newInvoice.id;
};

export const updateDraftInvoice = async (
  invoiceId: string,
  patch: {
    billing_period?: string;
    billing_cycle?: string;
    due_date?: string;
    notes?: string;
  }
): Promise<void> => {
  const { error } = await supabase
    .from('invoices')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', invoiceId);
  if (error) throw error;
};

export const sendInvoiceEmail = async (invoiceId: string, email?: string): Promise<void> => {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.rpc('send_invoice_email', {
    p_invoice_id: invoiceId,
    p_email: email ?? '',
    p_user_email: userData.user?.email ?? '',
  });
  if (error) throw error;
};

// ── Subscription Lifecycle API ──

import type {
  SubscriptionSettings, SubscriptionReminder, SubscriptionPlanHistory,
  SubscriptionNote, RenewalDashboardData,
} from './types';

export const getSubscriptionSettings = async (): Promise<SubscriptionSettings> => {
  const { data, error } = await supabase.from('subscription_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data as SubscriptionSettings;
};

export const updateSubscriptionSettings = async (data: Partial<SubscriptionSettings>): Promise<void> => {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.rpc('update_subscription_settings', {
    p_data: data as Record<string, unknown>,
    p_user_email: userData.user?.email ?? '',
  });
  if (error) throw error;
};

export const getRenewalDashboard = async (): Promise<RenewalDashboardData> => {
  const { data, error } = await supabase.rpc('get_renewal_dashboard');
  if (error) throw error;
  return data as RenewalDashboardData;
};

export const convertTrialToPaid = async (hotelId: string, planId: string, billingCycle: string): Promise<{ invoice_id: string }> => {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc('convert_trial_to_paid', {
    p_hotel_id: hotelId, p_plan_id: planId, p_billing_cycle: billingCycle, p_user_email: userData.user?.email ?? '',
  });
  if (error) throw error;
  return { invoice_id: (data as Record<string, unknown>).invoice_id as string };
};

export const generateRenewalInvoice = async (hotelId: string): Promise<{ invoice_id: string }> => {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    throw new Error('You must be signed in to generate a renewal invoice.');
  }

  const { data, error } = await supabase.rpc('generate_renewal_invoice', {
    p_hotel_id: hotelId, p_user_email: userData.user.email ?? '',
  });

  if (error) {
    console.error('Renewal invoice RPC failed:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
    // Throw a more user friendly error if it's an authorization issue
    if (error.message.includes('Not authorized')) {
      throw new Error('You do not have permission to renew subscriptions. Please contact an administrator.');
    }
    throw new Error(`Unable to generate the renewal invoice: ${error.message}`);
  }

  return { invoice_id: (data as Record<string, unknown>).invoice_id as string };
};

export const recordSubscriptionPayment = async (params: {
  hotelId: string;
  amount: number;
  paymentMode?: string;
  transactionReference?: string;
  notes?: string;
  extendSubscription?: boolean;
}): Promise<{ new_status: string; amount_paid: number; outstanding: number }> => {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc('record_subscription_payment', {
    p_hotel_id: params.hotelId,
    p_amount: params.amount,
    p_payment_mode: params.paymentMode ?? 'Bank',
    p_transaction_reference: params.transactionReference ?? '',
    p_notes: params.notes ?? '',
    p_user_email: userData.user?.email ?? '',
    p_extend_subscription: params.extendSubscription ?? true,
  });
  if (error) throw error;
  return {
    new_status: (data as Record<string, unknown>).new_status as string,
    amount_paid: (data as Record<string, unknown>).amount_paid as number,
    outstanding: (data as Record<string, unknown>).outstanding as number,
  };
};

export const extendGracePeriod = async (hotelId: string, days: number): Promise<void> => {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.rpc('extend_grace_period', {
    p_hotel_id: hotelId, p_days: days, p_user_email: userData.user?.email ?? '',
  });
  if (error) throw error;
};

export const suspendSubscription = async (hotelId: string, reason: string): Promise<void> => {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.rpc('suspend_subscription', {
    p_hotel_id: hotelId, p_reason: reason, p_user_email: userData.user?.email ?? '',
  });
  if (error) throw error;
};

export const reactivateSubscription = async (hotelId: string): Promise<void> => {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.rpc('reactivate_subscription', {
    p_hotel_id: hotelId, p_user_email: userData.user?.email ?? '',
  });
  if (error) throw error;
};

export const changePlan = async (hotelId: string, newPlanId: string, mode: 'immediate' | 'next_renewal'): Promise<{ prorated_amount: number; credit_adjustment: number }> => {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc('change_plan', {
    p_hotel_id: hotelId, p_new_plan_id: newPlanId, p_change_mode: mode, p_user_email: userData.user?.email ?? '',
  });
  if (error) throw error;
  return {
    prorated_amount: (data as Record<string, unknown>).prorated_amount as number,
    credit_adjustment: (data as Record<string, unknown>).credit_adjustment as number,
  };
};

export const sendSubscriptionReminder = async (hotelId: string, daysBefore: number, channel: 'email' | 'whatsapp' | 'in_app'): Promise<void> => {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.rpc('send_subscription_reminder', {
    p_hotel_id: hotelId, p_days_before: daysBefore, p_channel: channel, p_user_email: userData.user?.email ?? '',
  });
  if (error) throw error;
};

export const getSubscriptionReminders = async (hotelId: string): Promise<SubscriptionReminder[]> => {
  const { data, error } = await supabase
    .from('subscription_reminders')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('sent_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SubscriptionReminder[];
};

export const getPlanHistory = async (hotelId: string): Promise<SubscriptionPlanHistory[]> => {
  const { data, error } = await supabase
    .from('subscription_plan_history')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SubscriptionPlanHistory[];
};

export const getSubscriptionNotes = async (hotelId: string): Promise<SubscriptionNote[]> => {
  const { data, error } = await supabase
    .from('subscription_notes')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SubscriptionNote[];
};

export const addSubscriptionNote = async (hotelId: string, note: string): Promise<void> => {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from('subscription_notes').insert({
    hotel_id: hotelId,
    note,
    created_by: userData.user?.id,
    created_by_email: userData.user?.email ?? '',
  });
  if (error) throw error;
};
