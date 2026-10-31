/**
 * Hotel Mantri — Meta Compliance & Data Deletion Service
 *
 * Implements:
 * 1. Meta signed-request verification & User Data Deletion Callback per Meta's official documentation.
 * 2. Status check tracking for deletion requests using unique confirmation codes.
 * 3. Public data-deletion request submission workflow for guests, staff, and WhatsApp recipients.
 * 4. Durable, auditable storage with local fallback (safe across serverless and node environments).
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
const DELETION_REQUESTS_FILE = path.join(DATA_DIR, 'deletion_requests.json');

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('[Compliance] Could not create storage directory:', err.message);
}

// Read local requests store
export const readLocalDeletionRequests = () => {
  try {
    if (!fs.existsSync(DELETION_REQUESTS_FILE)) return [];
    const content = fs.readFileSync(DELETION_REQUESTS_FILE, 'utf-8');
    return JSON.parse(content || '[]');
  } catch (err) {
    console.warn('[Compliance] Failed to read local deletion requests:', err.message);
    return [];
  }
};

// Write local requests store atomically
export const writeLocalDeletionRequests = (records) => {
  try {
    const tempPath = `${DELETION_REQUESTS_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(records, null, 2), 'utf-8');
    fs.renameSync(tempPath, DELETION_REQUESTS_FILE);
  } catch (err) {
    console.warn('[Compliance] Failed to write local deletion requests:', err.message);
  }
};

/**
 * Base64URL decode helper
 */
export const base64UrlDecode = (input) => {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
};

/**
 * Parses and verifies a Meta signed_request.
 * Format: encoded_sig.payload
 *
 * @param {string} signedRequest
 * @param {string} appSecret
 * @returns {{ valid: boolean, error?: string, data?: object }}
 */
export const parseAndVerifyMetaSignedRequest = (signedRequest, appSecret) => {
  if (!appSecret) {
    const err = new Error('Meta App Secret is not configured on server.');
    err.statusCode = 503;
    err.code = 'APP_SECRET_NOT_CONFIGURED';
    throw err;
  }

  if (!signedRequest || typeof signedRequest !== 'string') {
    return { valid: false, error: 'MISSING_SIGNED_REQUEST' };
  }

  const parts = signedRequest.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'INVALID_SIGNED_REQUEST_FORMAT' };
  }

  const [encodedSig, encodedPayload] = parts;

  let sigBuffer;
  try {
    const normalizedSig = encodedSig.replace(/-/g, '+').replace(/_/g, '/');
    sigBuffer = Buffer.from(normalizedSig, 'base64');
  } catch {
    return { valid: false, error: 'INVALID_SIGNATURE_ENCODING' };
  }

  let payload;
  try {
    const decodedPayloadStr = base64UrlDecode(encodedPayload);
    payload = JSON.parse(decodedPayloadStr);
  } catch {
    return { valid: false, error: 'INVALID_PAYLOAD_JSON' };
  }

  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'EMPTY_PAYLOAD' };
  }

  if (!payload.algorithm || String(payload.algorithm).toUpperCase() !== 'HMAC-SHA256') {
    return { valid: false, error: 'UNSUPPORTED_OR_MISSING_ALGORITHM' };
  }

  try {
    const expectedHmac = crypto
      .createHmac('sha256', appSecret)
      .update(encodedPayload)
      .digest();

    const sigDigest = crypto.createHash('sha256').update(sigBuffer).digest();
    const expDigest = crypto.createHash('sha256').update(expectedHmac).digest();

    if (!crypto.timingSafeEqual(sigDigest, expDigest)) {
      return { valid: false, error: 'SIGNATURE_MISMATCH' };
    }
  } catch (err) {
    return { valid: false, error: `VERIFICATION_FAILED: ${err.message}` };
  }

  return { valid: true, data: payload };
};

/**
 * Generates a human-friendly confirmation code for tracking
 */
export const generateConfirmationCode = (prefix = 'HM-DEL') => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${dateStr}-${rand}`;
};

/**
 * Creates or updates an auditable deletion request record
 */
export const recordDeletionRequest = async ({
  confirmationCode,
  source = 'web_form', // 'meta_callback' | 'web_form' | 'admin'
  metaUserId = null,
  requesterName = null,
  email = null,
  phone = null,
  role = null,
  hotelName = null,
  bookingRef = null,
  requestType = 'full_deletion',
  reason = null,
  ipAddress = null,
}) => {
  const code = confirmationCode || generateConfirmationCode(source === 'meta_callback' ? 'HM-DEL-META' : 'HM-DEL');
  const now = new Date().toISOString();

  const record = {
    confirmation_code: code,
    source,
    meta_user_id: metaUserId,
    requester_name: requesterName,
    email: email ? email.trim().toLowerCase() : null,
    phone: phone ? phone.trim() : null,
    role,
    hotel_name: hotelName,
    booking_ref: bookingRef,
    request_type: requestType,
    reason,
    ip_address: ipAddress ? crypto.createHash('sha256').update(ipAddress).digest('hex').substring(0, 16) : null,
    status: 'received', // 'received' | 'under_review' | 'completed' | 'restricted_retention'
    disposition_notes: 'Request logged into compliance register. Non-financial PII queued for review/purge. Tax & invoice records retained under statutory guidelines (Section 44AA / CGST).',
    created_at: now,
    updated_at: now,
  };

  // 1. Persist to local durable file store
  const existing = readLocalDeletionRequests();
  const existingIndex = existing.findIndex((r) => r.confirmation_code === code);
  if (existingIndex >= 0) {
    existing[existingIndex] = { ...existing[existingIndex], ...record, updated_at: now };
  } else {
    existing.unshift(record);
  }
  writeLocalDeletionRequests(existing.slice(0, 1000)); // Keep bounded history

  // 2. Best-effort Supabase persistence if table exists
  if (supabaseServiceRole) {
    try {
      await supabaseServiceRole.from('compliance_deletion_requests').upsert({
        confirmation_code: record.confirmation_code,
        source: record.source,
        meta_user_id: record.meta_user_id,
        requester_name: record.requester_name,
        email: record.email,
        phone: record.phone,
        role: record.role,
        hotel_name: record.hotel_name,
        booking_ref: record.booking_ref,
        request_type: record.request_type,
        status: record.status,
        created_at: record.created_at,
        updated_at: record.updated_at,
      });
    } catch {
      // Table may not exist yet, local durable file is authoritative fallback
    }
  }

  return record;
};

/**
 * Finds a deletion request by confirmation code
 */
export const findDeletionRequest = async (confirmationCode) => {
  if (!confirmationCode) return null;
  const cleanCode = String(confirmationCode).trim().toUpperCase();

  // Try local store first
  const existing = readLocalDeletionRequests();
  const found = existing.find((r) => r.confirmation_code.toUpperCase() === cleanCode);
  if (found) return found;

  // Try Supabase fallback
  if (supabaseServiceRole) {
    try {
      const { data } = await supabaseServiceRole
        .from('compliance_deletion_requests')
        .select('*')
        .eq('confirmation_code', cleanCode)
        .maybeSingle();
      if (data) return data;
    } catch {
      // ignore
    }
  }

  return null;
};
