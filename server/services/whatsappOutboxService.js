/**
 * Hotel Mantri — WhatsApp Outbox & Idempotency Service
 *
 * Provides durable, audit-tracked, idempotent event storage for WhatsApp notifications.
 * Prevents duplicate scheduled deliveries (Section 15, 16).
 *
 * Unique logical event rule for scheduled summaries:
 *   (hotel_id, business_date, report_type, recipient, delivery_type='SCHEDULED')
 *
 * Storage Resilience:
 *   - Attempts Supabase table `notification_outbox`
 *   - Gracefully falls back to local durable store `server/data/whatsapp_outbox.json`
 *     if Supabase service role key is absent or RLS denies anon insertion.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { supabaseServiceRole } from '../supabaseClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isServerless
  ? path.join('/tmp', 'hotel-mantri-data')
  : path.join(__dirname, '..', 'data');
const OUTBOX_FILE = path.join(DATA_DIR, 'whatsapp_outbox.json');

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('[OUTBOX] Could not create storage directory (non-fatal):', err.message);
}

// ─── Local Outbox Helpers ─────────────────────────────────────────────────────

const readLocalOutbox = () => {
  try {
    if (!fs.existsSync(OUTBOX_FILE)) return [];
    const content = fs.readFileSync(OUTBOX_FILE, 'utf-8');
    return JSON.parse(content || '[]');
  } catch (err) {
    console.warn('[OUTBOX] Failed to read local outbox file:', err.message);
    return [];
  }
};

const writeLocalOutbox = (records) => {
  try {
    fs.writeFileSync(OUTBOX_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[OUTBOX] Failed to write local outbox file:', err.message);
  }
};

// ─── Event Types & Constants ──────────────────────────────────────────────────

export const REPORT_TYPES = {
  DAILY_SUMMARY: 'DAILY_SUMMARY',
  MORNING_SUMMARY: 'MORNING_SUMMARY',
  EVENING_SUMMARY: 'EVENING_SUMMARY',
  OTA_SUMMARY: 'OTA_SUMMARY',
  TEST_MESSAGE: 'TEST_MESSAGE',
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
  SENT: 'sent',
  FAILED: 'failed',
  DUPLICATE: 'duplicate',
};

// ─── Idempotency Check ────────────────────────────────────────────────────────

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
  // 1. Check local durable outbox first
  const localRecords = readLocalOutbox();
  const foundLocal = localRecords.find((r) =>
    r.hotel_id === hotelId &&
    r.business_date === businessDate &&
    r.report_type === reportType &&
    r.recipient === recipient &&
    r.delivery_type === DELIVERY_TYPES.SCHEDULED &&
    r.status === OUTBOX_STATUS.SENT
  );

  if (foundLocal) return true;

  // 2. Check Supabase outbox
  try {
    const { data, error } = await supabaseServiceRole
      .from('notification_outbox')
      .select('id, status, metadata')
      .eq('hotel_id', hotelId)
      .eq('event_type', `WHATSAPP_${reportType}`)
      .eq('recipient', recipient)
      .eq('status', OUTBOX_STATUS.SENT);

    if (!error && data && data.length > 0) {
      const match = data.find((r) => {
        const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {});
        return meta.business_date === businessDate && meta.delivery_type === DELIVERY_TYPES.SCHEDULED;
      });
      if (match) return true;
    }
  } catch (err) {
    console.warn('[OUTBOX] Supabase check error:', err.message);
  }

  return false;
};

/**
 * Checks if an OTA reservation alert was already sent for this reservation.
 */
export const isOtaReservationAlertSent = async ({ hotelId, reservationId }) => {
  const localRecords = readLocalOutbox();
  const foundLocal = localRecords.find((r) =>
    r.hotel_id === hotelId &&
    r.reservation_id === reservationId &&
    r.report_type === REPORT_TYPES.OTA_NEW_RESERVATION_OWNER_WHATSAPP &&
    r.status === OUTBOX_STATUS.SENT
  );
  if (foundLocal) return true;

  try {
    const { data } = await supabaseServiceRole
      .from('notification_outbox')
      .select('id, status')
      .eq('hotel_id', hotelId)
      .eq('reservation_id', reservationId)
      .eq('event_type', REPORT_TYPES.OTA_NEW_RESERVATION_OWNER_WHATSAPP)
      .eq('status', OUTBOX_STATUS.SENT)
      .limit(1);

    if (data && data.length > 0) return true;
  } catch { /* ignore */ }

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
  const eventKey = `RESERVATION_CONFIRMATION_WHATSAPP_${targetRecipientType}_V${version}`;

  // 1. Check local durable outbox
  const localRecords = readLocalOutbox();
  const foundLocal = localRecords.find((r) =>
    r.hotel_id === hotelId &&
    r.reservation_id === reservationId &&
    (r.event_type === eventKey || r.report_type === eventKey) &&
    r.status === OUTBOX_STATUS.SENT
  );
  if (foundLocal) return true;

  // 2. Check Supabase notification_outbox
  try {
    const { data } = await supabaseServiceRole
      .from('notification_outbox')
      .select('id, status')
      .eq('hotel_id', hotelId)
      .eq('reservation_id', reservationId)
      .eq('event_type', eventKey)
      .eq('status', OUTBOX_STATUS.SENT)
      .limit(1);

    if (data && data.length > 0) return true;
  } catch { /* ignore */ }

  return false;
};

// ─── Record Outbox Event ──────────────────────────────────────────────────────

/**
 * Creates or logs an outbox notification event.
 */
export const recordWhatsAppOutboxEvent = async ({
  hotelId,
  businessDate,
  reportType,
  deliveryType = DELIVERY_TYPES.MANUAL,
  recipient,
  status = OUTBOX_STATUS.QUEUED,
  providerMessageId = null,
  lastError = null,
  metadata = {},
  reservationId = null,
}) => {
  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();
  const metaObj = {
    ...metadata,
    business_date: businessDate,
    report_type: reportType,
    delivery_type: deliveryType,
  };

  const record = {
    id: eventId,
    hotel_id: hotelId,
    business_date: businessDate,
    reservation_id: reservationId,
    report_type: reportType,
    delivery_type: deliveryType,
    recipient,
    status,
    attempt_count: status === OUTBOX_STATUS.SENT || status === OUTBOX_STATUS.FAILED ? 1 : 0,
    provider_message_id: providerMessageId,
    last_error: lastError,
    metadata: metaObj,
    sent_at: status === OUTBOX_STATUS.SENT ? now : null,
    created_at: now,
    updated_at: now,
  };

  // Always write to local durable store for guaranteed persistence
  const localRecords = readLocalOutbox();
  localRecords.unshift(record);
  // Keep last 500 records
  if (localRecords.length > 500) localRecords.length = 500;
  writeLocalOutbox(localRecords);

  // Also attempt Supabase notification_outbox
  try {
    await supabaseServiceRole.from('notification_outbox').insert({
      id: eventId,
      hotel_id: hotelId,
      reservation_id: reservationId,
      event_type: `WHATSAPP_${reportType}`,
      recipient,
      status,
      attempt_count: record.attempt_count,
      provider_message_id: providerMessageId,
      last_error: lastError,
      metadata: JSON.stringify(metaObj),
      sent_at: record.sent_at,
      created_at: now,
      updated_at: now,
    });
  } catch (err) {
    // If Supabase fails (e.g. RLS), local record is already saved
    console.warn('[OUTBOX] Supabase notification_outbox insert skipped:', err.message);
  }

  return record;
};

// ─── Update Outbox Event ──────────────────────────────────────────────────────

export const updateWhatsAppOutboxEvent = async (eventId, updates) => {
  const now = new Date().toISOString();
  const localRecords = readLocalOutbox();
  const idx = localRecords.findIndex((r) => r.id === eventId);
  const lastError = updates.last_error || updates.lastError || null;
  const providerMessageId = updates.provider_message_id || updates.providerMessageId || null;

  if (idx !== -1) {
    localRecords[idx] = {
      ...localRecords[idx],
      ...updates,
      last_error: lastError !== undefined ? lastError : localRecords[idx].last_error,
      provider_message_id: providerMessageId !== undefined ? providerMessageId : localRecords[idx].provider_message_id,
      updated_at: now,
      sent_at: updates.status === OUTBOX_STATUS.SENT ? now : localRecords[idx].sent_at,
    };
    writeLocalOutbox(localRecords);
  }

  try {
    const dbUpdates = {
      ...updates,
      last_error: lastError,
      provider_message_id: providerMessageId,
      updated_at: now,
    };
    if (updates.status === OUTBOX_STATUS.SENT) dbUpdates.sent_at = now;
    await supabaseServiceRole
      .from('notification_outbox')
      .update(dbUpdates)
      .eq('id', eventId);
  } catch { /* ignore */ }
};

// ─── Get Outbox History ───────────────────────────────────────────────────────

/**
 * Returns recent WhatsApp notifications for a hotel.
 */
export const getWhatsAppHistory = async (hotelId, limit = 20) => {
  const localRecords = readLocalOutbox();
  const filtered = localRecords
    .filter((r) => r.hotel_id === hotelId && (r.report_type || r.event_type))
    .slice(0, limit);

  // If local has entries, return them
  if (filtered.length > 0) {
    return filtered.map((r) => ({
      id: r.id,
      hotel_id: r.hotel_id,
      business_date: r.business_date || r.metadata?.business_date || '',
      report_type: r.report_type || r.metadata?.report_type || r.event_type || 'DAILY_SUMMARY',
      delivery_type: r.delivery_type || r.metadata?.delivery_type || 'MANUAL',
      recipient: r.recipient || '',
      status: r.status,
      attempt_count: r.attempt_count || 1,
      provider_message_id: r.provider_message_id || null,
      last_error: r.last_error || null,
      sent_at: r.sent_at,
      created_at: r.created_at,
    }));
  }

  // Fallback to Supabase
  try {
    const { data } = await supabaseServiceRole
      .from('notification_outbox')
      .select('*')
      .eq('hotel_id', hotelId)
      .ilike('event_type', 'WHATSAPP%')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (data) {
      return data.map((r) => {
        const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {});
        return {
          id: r.id,
          hotel_id: r.hotel_id,
          business_date: meta.business_date || '',
          report_type: meta.report_type || r.event_type.replace('WHATSAPP_', ''),
          delivery_type: meta.delivery_type || 'MANUAL',
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
    console.warn('[OUTBOX] History fetch error:', err.message);
  }

  return [];
};

export default {
  REPORT_TYPES,
  DELIVERY_TYPES,
  OUTBOX_STATUS,
  isScheduledReportAlreadySent,
  isOtaReservationAlertSent,
  recordWhatsAppOutboxEvent,
  updateWhatsAppOutboxEvent,
  getWhatsAppHistory,
};
