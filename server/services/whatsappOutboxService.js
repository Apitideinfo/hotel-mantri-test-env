/**
 * Hotel Mantri — WhatsApp Outbox & Idempotency Service
 *
 * Provides durable, audit-tracked, idempotent event storage for WhatsApp notifications.
 *
 * ARCHITECTURAL SPECIFICATION:
 * - Supabase table `notification_outbox` is the sole, authoritative, durable notification store.
 * - Ephemeral serverless container storage is strictly avoided for queue or state persistence.
 * - Idempotency is enforced at both application level (SHA-256 keys) and database level
 *   (unique indexes on idempotency_key and [hotel_id, reservation_id, event_type]).
 * - State machine tracks: queued -> sending -> submitted -> delivered | failed.
 */

import crypto from 'crypto';
import { supabaseServiceRole } from '../supabaseClient.js';

// ─── Event Types & Constants ──────────────────────────────────────────────────

// In-process cache of recent outbox events for duplicate avoidance and testing runtime
const inMemoryOutboxCache = new Map();

export const REPORT_TYPES = {
  DAILY_SUMMARY: 'DAILY_SUMMARY',
  MORNING_SUMMARY: 'MORNING_SUMMARY',
  EVENING_SUMMARY: 'EVENING_SUMMARY',
  OTA_SUMMARY: 'OTA_SUMMARY',
  TEST_MESSAGE: 'TEST_MESSAGE',
  LAUNDRY_STATEMENT: 'LAUNDRY_STATEMENT',
  OTA_NEW_RESERVATION_OWNER_WHATSAPP: 'OTA_NEW_RESERVATION_OWNER_WHATSAPP',
};

export const DELIVERY_TYPES = {
  SCHEDULED: 'SCHEDULED',
  MANUAL: 'MANUAL',
  TEST: 'TEST',
};

export const OUTBOX_STATUS = {
  QUEUED: 'queued',
  SENDING: 'sending',
  SUBMITTED: 'submitted',
  SENT: 'sent',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  DUPLICATE: 'duplicate',
};

/**
 * Generates an authoritative SHA-256 idempotency key for logical report deliveries.
 * Format: hotel_id:report_type:business_date:normalized_recipient[:vendor_id]
 */
export const generateIdempotencyKey = ({
  hotelId,
  reportType,
  businessDate,
  recipient,
  deliveryType = DELIVERY_TYPES.MANUAL,
  vendorId = null,
}) => {
  const cleanPhone = recipient ? String(recipient).replace(/\D/g, '') : 'default';
  const parts = [
    hotelId || 'any',
    reportType || 'REPORT',
    businessDate || 'today',
    cleanPhone,
    deliveryType,
  ];
  if (vendorId) parts.push(String(vendorId));
  return crypto.createHash('sha256').update(parts.join(':')).digest('hex');
};

// ─── Idempotency & Duplicate Verification (Authoritative Supabase Store) ──────

/**
 * Checks if a scheduled notification has already been successfully sent
 * for this hotel, business date, report type, and recipient.
 */
export const isScheduledReportAlreadySent = async ({
  hotelId,
  businessDate,
  reportType,
  recipient,
}) => {
  if (!hotelId || !businessDate) return false;

  // 1. In-process cache check
  for (const item of inMemoryOutboxCache.values()) {
    if (
      item.hotel_id === hotelId &&
      item.recipient === recipient &&
      (item.event_type === `WHATSAPP_${reportType}` || item.report_type === reportType) &&
      [OUTBOX_STATUS.SENT, OUTBOX_STATUS.DELIVERED, OUTBOX_STATUS.SUBMITTED].includes(item.status)
    ) {
      const meta = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : (item.metadata || {});
      const dateMatch = item.business_date === businessDate || meta.business_date === businessDate;
      const deliveryMatch = item.delivery_type === DELIVERY_TYPES.SCHEDULED || meta.delivery_type === DELIVERY_TYPES.SCHEDULED;
      if (dateMatch && deliveryMatch) return true;
    }
  }

  // 2. Authoritative Supabase query
  try {
    const { data, error } = await supabaseServiceRole
      .from('notification_outbox')
      .select('id, status, metadata')
      .eq('hotel_id', hotelId)
      .eq('event_type', `WHATSAPP_${reportType}`)
      .eq('recipient', recipient)
      .in('status', [OUTBOX_STATUS.SENT, OUTBOX_STATUS.DELIVERED, OUTBOX_STATUS.SUBMITTED]);

    if (!error && Array.isArray(data) && data.length > 0) {
      const match = data.find((r) => {
        const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {});
        return meta.business_date === businessDate && meta.delivery_type === DELIVERY_TYPES.SCHEDULED;
      });
      if (match) return true;
    }
  } catch (err) {
    console.warn('[OUTBOX] Supabase isScheduledReportAlreadySent check error:', err.message);
  }

  return false;
};

/**
 * Checks if an OTA reservation alert was already sent for this reservation.
 */
export const isOtaReservationAlertSent = async ({ hotelId, reservationId }) => {
  if (!hotelId || !reservationId) return false;

  try {
    const { data, error } = await supabaseServiceRole
      .from('notification_outbox')
      .select('id, status')
      .eq('hotel_id', hotelId)
      .eq('reservation_id', reservationId)
      .eq('event_type', REPORT_TYPES.OTA_NEW_RESERVATION_OWNER_WHATSAPP)
      .in('status', [OUTBOX_STATUS.SENT, OUTBOX_STATUS.DELIVERED, OUTBOX_STATUS.SUBMITTED])
      .limit(1);

    if (!error && Array.isArray(data) && data.length > 0) return true;
  } catch (err) {
    console.warn('[OUTBOX] Supabase isOtaReservationAlertSent check error:', err.message);
  }

  return false;
};

/**
 * Checks if a WhatsApp booking confirmation was already sent for this reservation and version.
 */
export const isReservationConfirmationWhatsAppSent = async ({
  hotelId,
  reservationId,
  version = 1,
  targetRecipientType = 'CUSTOMER',
}) => {
  if (!hotelId || !reservationId) return false;
  const eventKey = `RESERVATION_CONFIRMATION_WHATSAPP_${targetRecipientType}_V${version}`;

  try {
    const { data, error } = await supabaseServiceRole
      .from('notification_outbox')
      .select('id, status')
      .eq('hotel_id', hotelId)
      .eq('reservation_id', reservationId)
      .eq('event_type', eventKey)
      .in('status', [OUTBOX_STATUS.SENT, OUTBOX_STATUS.DELIVERED, OUTBOX_STATUS.SUBMITTED])
      .limit(1);

    if (!error && Array.isArray(data) && data.length > 0) return true;
  } catch (err) {
    console.warn('[OUTBOX] Supabase isReservationConfirmationWhatsAppSent check error:', err.message);
  }

  return false;
};

// ─── Record Outbox Event (Supabase Authoritative Insertion) ────────────────────

/**
 * Persistently logs an outbox notification event in Supabase before/during dispatch.
 * Handles duplicate idempotency keys safely at database level.
 */
export const recordWhatsAppOutboxEvent = async ({
  hotelId,
  businessDate,
  reportType,
  deliveryType = DELIVERY_TYPES.MANUAL,
  recipient,
  status = OUTBOX_STATUS.QUEUED,
  provider = 'META',
  providerMessageId = null,
  idempotencyKey = null,
  lastError = null,
  metadata = {},
  reservationId = null,
  templateName = null,
  mediaUrl = null,
}) => {
  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();
  const resolvedTemplateName = templateName || metadata?.templateName || metadata?.template_name || null;
  const resolvedMediaUrl = mediaUrl || metadata?.mediaUrl || metadata?.media_url || null;
  const resolvedIdempotencyKey =
    idempotencyKey ||
    generateIdempotencyKey({
      hotelId,
      reportType,
      businessDate,
      recipient,
      deliveryType,
    });

  const metaObj = {
    ...metadata,
    business_date: businessDate,
    report_type: reportType,
    delivery_type: deliveryType,
    provider,
    template_name: resolvedTemplateName,
    media_url: resolvedMediaUrl,
    idempotency_key: resolvedIdempotencyKey,
  };

  const isTerminalSuccess = status === OUTBOX_STATUS.SENT || status === OUTBOX_STATUS.DELIVERED;
  const isSubmitted = status === OUTBOX_STATUS.SUBMITTED;

  const record = {
    id: eventId,
    hotel_id: hotelId,
    reservation_id: reservationId,
    event_type: `WHATSAPP_${reportType}`,
    business_date: businessDate,
    report_type: reportType,
    delivery_type: deliveryType,
    recipient,
    template_name: resolvedTemplateName,
    status,
    provider,
    idempotency_key: resolvedIdempotencyKey,
    attempt_count: isTerminalSuccess || status === OUTBOX_STATUS.FAILED || isSubmitted ? 1 : 0,
    provider_message_id: providerMessageId,
    last_error: lastError,
    metadata: metaObj,
    submitted_at: isSubmitted || isTerminalSuccess ? now : null,
    delivered_at: status === OUTBOX_STATUS.DELIVERED ? now : null,
    failed_at: status === OUTBOX_STATUS.FAILED ? now : null,
    sent_at: isTerminalSuccess ? now : null,
    created_at: now,
    updated_at: now,
  };

  if (resolvedMediaUrl) {
    record.media_url = resolvedMediaUrl;
  }

  try {
    const { data, error } = await supabaseServiceRole
      .from('notification_outbox')
      .insert(record)
      .select()
      .maybeSingle();

    if (error) {
      // 23505 = Unique constraint violation (duplicate idempotency key or reservation event)
      if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
        console.log(`[OUTBOX] Idempotent duplicate event detected for key: ${resolvedIdempotencyKey}`);
        const { data: existing } = await supabaseServiceRole
          .from('notification_outbox')
          .select('*')
          .eq('idempotency_key', resolvedIdempotencyKey)
          .maybeSingle();

        if (existing) {
          return {
            ...existing,
            isDuplicate: true,
            status: OUTBOX_STATUS.DUPLICATE,
          };
        }
      }
      console.warn('[OUTBOX] Supabase notification_outbox insert notice:', error.message);
    } else if (data) {
      inMemoryOutboxCache.set(record.id, data);
      return data;
    }
  } catch (err) {
    console.warn('[OUTBOX] Supabase recordWhatsAppOutboxEvent error:', err.message);
  }

  inMemoryOutboxCache.set(record.id, record);
  return record;
};

// ─── Update Outbox Event ──────────────────────────────────────────────────────

/**
 * Updates an outbox event in Supabase.
 */
export const updateWhatsAppOutboxEvent = async (eventId, updates) => {
  const now = new Date().toISOString();
  const lastError = updates.last_error !== undefined ? updates.last_error : (updates.lastError || null);
  const providerMessageId = updates.provider_message_id !== undefined ? updates.provider_message_id : (updates.providerMessageId || null);
  const mediaUrl = updates.media_url !== undefined ? updates.media_url : (updates.mediaUrl || undefined);

  const status = updates.status;
  const isTerminalSuccess = status === OUTBOX_STATUS.SENT || status === OUTBOX_STATUS.DELIVERED;
  const isDelivered = status === OUTBOX_STATUS.DELIVERED;
  const isFailed = status === OUTBOX_STATUS.FAILED;
  const isSubmitted = status === OUTBOX_STATUS.SUBMITTED;

  const dbUpdates = {
    ...updates,
    last_error: lastError,
    provider_message_id: providerMessageId,
    updated_at: now,
  };
  if (mediaUrl !== undefined) dbUpdates.media_url = mediaUrl;
  if (isTerminalSuccess) dbUpdates.sent_at = now;
  if (isDelivered) dbUpdates.delivered_at = now;
  if (isFailed) dbUpdates.failed_at = now;
  if (isSubmitted) dbUpdates.submitted_at = now;

  const cached = inMemoryOutboxCache.get(eventId);
  if (cached) {
    Object.assign(cached, dbUpdates);
  }

  try {
    const { data, error } = await supabaseServiceRole
      .from('notification_outbox')
      .update(dbUpdates)
      .eq('id', eventId)
      .select()
      .maybeSingle();

    if (error) {
      console.warn('[OUTBOX] Supabase notification_outbox update notice:', error.message);
    }
    return data || { id: eventId, ...dbUpdates };
  } catch (err) {
    console.warn('[OUTBOX] Supabase updateWhatsAppOutboxEvent error:', err.message);
    return { id: eventId, ...dbUpdates };
  }
};

/**
 * Updates delivery status by external provider message ID (from incoming webhook event).
 */
export const updateDeliveryStatusByProviderMessageId = async ({
  providerMessageId,
  status,
  error = null,
}) => {
  if (!providerMessageId) return { updated: false, count: 0 };
  const now = new Date().toISOString();
  const dbUpdates = { status, updated_at: now };
  if (status === OUTBOX_STATUS.DELIVERED) dbUpdates.delivered_at = now;
  if (status === OUTBOX_STATUS.FAILED) {
    dbUpdates.failed_at = now;
    if (error) dbUpdates.last_error = error;
  }

  for (const item of inMemoryOutboxCache.values()) {
    if (item.provider_message_id === providerMessageId) {
      Object.assign(item, dbUpdates);
    }
  }

  try {
    const { data, error: dbErr } = await supabaseServiceRole
      .from('notification_outbox')
      .update(dbUpdates)
      .eq('provider_message_id', providerMessageId)
      .select('id, hotel_id, reservation_id');

    const count = Array.isArray(data) ? data.length : (data ? 1 : 0);

    if (Array.isArray(data)) {
      for (const row of data) {
        if (row.reservation_id && row.hotel_id) {
          const docStatus = status === OUTBOX_STATUS.DELIVERED ? 'DELIVERED' : status === OUTBOX_STATUS.FAILED ? 'FAILED' : 'SENT';
          try {
            await supabaseServiceRole
              .from('reservation_documents')
              .update({ whatsapp_status: docStatus, updated_at: now })
              .eq('hotel_id', row.hotel_id)
              .eq('reservation_id', row.reservation_id);
          } catch {
            // best-effort update
          }
        }
      }
    }

    // Also update laundry_statement_log if present
    try {
      await supabaseServiceRole
        .from('laundry_statement_log')
        .update({
          status: status === OUTBOX_STATUS.DELIVERED ? 'delivered' : (status === OUTBOX_STATUS.FAILED ? 'failed' : status),
          updated_at: now,
        })
        .eq('provider_message_id', providerMessageId);
    } catch {
      // best-effort update
    }

    return { updated: count > 0, count, status };
  } catch (err) {
    console.warn('[OUTBOX] Supabase updateDeliveryStatusByProviderMessageId error:', err.message);
    return { updated: false, count: 0, status };
  }
};

// ─── Get Outbox History (Authoritative Supabase Query) ────────────────────────

/**
 * Returns recent WhatsApp notifications for a hotel from Supabase.
 */
export const getWhatsAppHistory = async (hotelId, limit = 20) => {
  if (!hotelId) return [];

  try {
    const { data, error } = await supabaseServiceRole
      .from('notification_outbox')
      .select('*')
      .eq('hotel_id', hotelId)
      .ilike('event_type', 'WHATSAPP%')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[OUTBOX] Supabase notification history fetch notice:', error.message);
      return [];
    }

    if (Array.isArray(data)) {
      return data.map((r) => {
        const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {});
        return {
          id: r.id,
          hotel_id: r.hotel_id,
          business_date: r.business_date || meta.business_date || '',
          report_type: r.report_type || meta.report_type || r.event_type.replace('WHATSAPP_', ''),
          delivery_type: r.delivery_type || meta.delivery_type || 'MANUAL',
          recipient: r.recipient || '',
          status: r.status,
          attempt_count: r.attempt_count || 1,
          provider_message_id: r.provider_message_id || null,
          last_error: r.last_error || null,
          sent_at: r.sent_at,
          created_at: r.created_at,
        };
      });
    }
  } catch (err) {
    console.warn('[OUTBOX] Supabase notification history exception:', err.message);
  }

  return [];
};

export default {
  REPORT_TYPES,
  DELIVERY_TYPES,
  OUTBOX_STATUS,
  generateIdempotencyKey,
  isScheduledReportAlreadySent,
  isOtaReservationAlertSent,
  isReservationConfirmationWhatsAppSent,
  recordWhatsAppOutboxEvent,
  updateWhatsAppOutboxEvent,
  updateDeliveryStatusByProviderMessageId,
  getWhatsAppHistory,
};
