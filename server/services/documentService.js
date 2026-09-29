/**
 * Hotel Mantri — Document Service
 *
 * Provides authoritative management for reservation documents:
 * - Versioned PDF generation and persistent storage
 * - Idempotency checking to prevent duplicate confirmation documents
 * - Database record keeping in `reservation_documents` (with local durable JSON fallback)
 * - Multi-tenant security (strictly hotel-scoped)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseServiceRole } from '../supabaseClient.js';
import {
  generateReservationPdfBuffer,
  generateReservationPdfBase64,
  buildReservationConfirmationPdf,
} from './reservationPdfService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const DOCS_DIR = path.join(DATA_DIR, 'documents');
const DOCS_METADATA_FILE = path.join(DATA_DIR, 'reservation_documents.json');

// Ensure local document directory exists
if (!fs.existsSync(DOCS_DIR)) {
  try {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
  } catch (err) {
    console.warn('[DOCUMENT_SERVICE] Could not create storage directory:', err.message);
  }
}

// ─── Local Metadata Fallback Helpers ──────────────────────────────────────────

const readLocalDocs = () => {
  try {
    if (!fs.existsSync(DOCS_METADATA_FILE)) return [];
    const content = fs.readFileSync(DOCS_METADATA_FILE, 'utf-8');
    return JSON.parse(content || '[]');
  } catch (err) {
    console.warn('[DOCUMENT_SERVICE] Failed to read local docs file:', err.message);
    return [];
  }
};

const writeLocalDocs = (records) => {
  try {
    fs.writeFileSync(DOCS_METADATA_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[DOCUMENT_SERVICE] Failed to write local docs file:', err.message);
  }
};

// ─── Status Constants ─────────────────────────────────────────────────────────

export const DOCUMENT_TYPES = {
  RESERVATION_CONFIRMATION: 'RESERVATION_CONFIRMATION',
  RESERVATION_MODIFICATION: 'RESERVATION_MODIFICATION',
  RESERVATION_CANCELLATION: 'RESERVATION_CANCELLATION',
};

export const DOCUMENT_STATUS = {
  GENERATED: 'GENERATED',
  FAILED: 'FAILED',
};

export const DELIVERY_STATUS = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  SKIPPED: 'SKIPPED',
};

// ─── Version & Document Query Helpers ────────────────────────────────────────

/**
 * Gets all confirmation document records for a reservation, sorted newest version first.
 */
export const getReservationDocuments = async (hotelId, reservationId) => {
  if (!hotelId || !reservationId) return [];

  // 1. Try Supabase query
  try {
    const { data, error } = await supabaseServiceRole
      .from('reservation_documents')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('reservation_id', reservationId)
      .order('version', { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data;
    }
  } catch (err) {
    // Table may not exist yet in Supabase
  }

  // 2. Local fallback
  const localList = readLocalDocs();
  return localList
    .filter((d) => d.hotel_id === hotelId && d.reservation_id === reservationId)
    .sort((a, b) => (b.version || 0) - (a.version || 0));
};

/**
 * Resolves the next version number for a reservation's confirmation.
 */
export const getNextDocumentVersion = async (hotelId, reservationId) => {
  const existingDocs = await getReservationDocuments(hotelId, reservationId);
  if (!existingDocs || existingDocs.length === 0) return 1;
  const maxVersion = Math.max(...existingDocs.map((d) => d.version || 1));
  return maxVersion + 1;
};

// ─── Persistent Storage Writers ──────────────────────────────────────────────

/**
 * Saves PDF binary to durable persistent storage.
 * Logical path: reservations/{hotel_id}/{reservation_id}/confirmation-v{version}.pdf
 */
export const savePdfToStorage = async ({
  hotelId,
  reservationId,
  version,
  buffer,
  filename,
}) => {
  const relativeDir = path.join('reservations', String(hotelId), String(reservationId));
  const fullDir = path.join(DOCS_DIR, relativeDir);

  if (!fs.existsSync(fullDir)) {
    fs.mkdirSync(fullDir, { recursive: true });
  }

  const fileBaseName = filename || `confirmation-v${version}.pdf`;
  const diskPath = path.join(fullDir, fileBaseName);

  fs.writeFileSync(diskPath, buffer);

  const logicalStoragePath = `reservations/${hotelId}/${reservationId}/${fileBaseName}`;
  console.log(`[DOCUMENT_STORAGE] Saved PDF to ${diskPath} (${buffer.length} bytes)`);

  return {
    storagePath: logicalStoragePath,
    diskPath,
    fileSize: buffer.length,
  };
};

/**
 * Reads PDF binary buffer from persistent storage.
 */
export const readPdfFromStorage = async (hotelId, reservationId, storagePath) => {
  if (!storagePath || typeof storagePath !== 'string') return null;
  // Check local disk path
  const normalizedPath = storagePath.replace(/^reservations[\\/]/, '');
  const candidateDiskPaths = [
    path.join(DOCS_DIR, storagePath),
    path.join(DOCS_DIR, 'reservations', String(hotelId), String(reservationId), path.basename(storagePath)),
  ];

  for (const p of candidateDiskPaths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p);
    }
  }

  return null;
};

// ─── Record Document in Metadata Store ────────────────────────────────────────

export const recordDocument = async ({
  hotelId,
  reservationId,
  documentType = DOCUMENT_TYPES.RESERVATION_CONFIRMATION,
  version = 1,
  fileName,
  storagePath,
  status = DOCUMENT_STATUS.GENERATED,
  emailStatus = DELIVERY_STATUS.PENDING,
  whatsappStatus = DELIVERY_STATUS.PENDING,
  generatedBy = 'SYSTEM',
  metadata = {},
}) => {
  const docRecord = {
    id: `doc_${hotelId.slice(0, 8)}_${reservationId.slice(0, 8)}_v${version}_${Date.now()}`,
    hotel_id: hotelId,
    reservation_id: reservationId,
    document_type: documentType,
    version,
    file_name: fileName,
    storage_path: storagePath,
    status,
    email_status: emailStatus,
    whatsapp_status: whatsappStatus,
    generated_by: generatedBy,
    metadata,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 1. Try Supabase insert
  try {
    const { data, error } = await supabaseServiceRole
      .from('reservation_documents')
      .upsert(
        {
          hotel_id: hotelId,
          reservation_id: reservationId,
          document_type: documentType,
          version,
          file_name: fileName,
          storage_path: storagePath,
          status,
          email_status: emailStatus,
          whatsapp_status: whatsappStatus,
          generated_by: generatedBy,
          metadata,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'hotel_id, reservation_id, document_type, version' }
      )
      .select('id')
      .maybeSingle();

    if (!error && data?.id) {
      docRecord.id = data.id;
    }
  } catch (err) {
    // If table doesn't exist, we fall through to local
  }

  // 2. Always persist to durable local store
  const localDocs = readLocalDocs();
  const existingIdx = localDocs.findIndex(
    (d) =>
      d.hotel_id === hotelId &&
      d.reservation_id === reservationId &&
      d.document_type === documentType &&
      d.version === version
  );

  if (existingIdx >= 0) {
    localDocs[existingIdx] = { ...localDocs[existingIdx], ...docRecord, id: localDocs[existingIdx].id };
  } else {
    localDocs.push(docRecord);
  }
  writeLocalDocs(localDocs);

  return docRecord;
};

export const updateDocumentDeliveryStatus = async (
  hotelId,
  reservationId,
  version,
  { emailStatus, whatsappStatus, errorDetails }
) => {
  const updates = { updated_at: new Date().toISOString() };
  if (emailStatus) updates.email_status = emailStatus;
  if (whatsappStatus) updates.whatsapp_status = whatsappStatus;

  // 1. Try Supabase
  try {
    await supabaseServiceRole
      .from('reservation_documents')
      .update(updates)
      .eq('hotel_id', hotelId)
      .eq('reservation_id', reservationId)
      .eq('version', version);
  } catch (err) {
    // Non-fatal
  }

  // 2. Update local store
  const localDocs = readLocalDocs();
  const target = localDocs.find(
    (d) => d.hotel_id === hotelId && d.reservation_id === reservationId && d.version === version
  );
  if (target) {
    if (emailStatus) target.email_status = emailStatus;
    if (whatsappStatus) target.whatsapp_status = whatsappStatus;
    if (errorDetails) {
      target.metadata = target.metadata || {};
      target.metadata.last_delivery_error = errorDetails;
    }
    target.updated_at = new Date().toISOString();
    writeLocalDocs(localDocs);
  }
};

// ─── Authoritative Generation Function ────────────────────────────────────────

/**
 * Authoritative Reservation Confirmation Document Generator.
 *
 * Generates the PDF, saves to persistent storage, records in metadata store,
 * and returns document record and binary buffer.
 *
 * @param {Object} params
 * @param {string} params.hotelId
 * @param {string} params.reservationId
 * @param {Object} [params.reservation] - Full reservation record if already fetched
 * @param {boolean} [params.forceNewVersion=false] - Increment version (e.g. for modification)
 * @param {string} [params.documentType='RESERVATION_CONFIRMATION']
 * @param {string} [params.generatedBy='SYSTEM']
 */
export const generateAndStoreReservationConfirmation = async ({
  hotelId,
  reservationId,
  reservation = null,
  forceNewVersion = false,
  documentType = DOCUMENT_TYPES.RESERVATION_CONFIRMATION,
  generatedBy = 'SYSTEM',
}) => {
  if (!hotelId || !reservationId) {
    throw new Error('hotelId and reservationId are required for confirmation generation.');
  }

  // 1. Fetch Authoritative Reservation Record (if not provided)
  let resRecord = reservation;
  if (!resRecord) {
    const { data: fetched, error } = await supabaseServiceRole
      .from('reservations')
      .select('*')
      .eq('id', reservationId)
      .eq('hotel_id', hotelId)
      .maybeSingle();

    if (error || !fetched) {
      throw new Error(`Reservation ${reservationId} not found for hotel ${hotelId}.`);
    }
    resRecord = fetched;
  }

  // 2. Fetch Hotel Master & Settings
  const [{ data: hotelRecord }, { data: settingsRecord }] = await Promise.all([
    supabaseServiceRole.from('hotels').select('*').eq('id', hotelId).maybeSingle(),
    supabaseServiceRole.from('hotel_settings').select('*').eq('id', hotelId).maybeSingle(),
  ]);

  const hotel = hotelRecord || {};
  const settings = settingsRecord || {};

  // 3. Determine Version Number
  let version = 1;
  const existingDocs = await getReservationDocuments(hotelId, reservationId);

  if (forceNewVersion) {
    const maxVer = existingDocs.length > 0 ? Math.max(...existingDocs.map((d) => d.version || 1)) : 0;
    version = maxVer + 1;
  } else if (existingDocs.length > 0) {
    const latest = existingDocs[0];
    const resUpdated = resRecord.updated_at ? new Date(resRecord.updated_at).getTime() : 0;
    const docGenTime = latest.metadata?.generated_at ? new Date(latest.metadata.generated_at).getTime() : (latest.created_at ? new Date(latest.created_at).getTime() : 0);

    // Cache safety check: Do not use cached PDF if reservation was modified after document was generated
    const isStale = resUpdated > docGenTime;
    if (!isStale) {
      const existingBuffer = await readPdfFromStorage(hotelId, reservationId, latest.storage_path);
      if (existingBuffer) {
        return {
          alreadyExists: true,
          document: latest,
          buffer: existingBuffer,
          version: latest.version,
        };
      }
    }
    version = latest.version || 1;
  }

  // 4. Generate Professional PDF
  const shortId = (resRecord.id || '').slice(0, 8).toUpperCase();
  const fileName = `Hotel-Mantri-Reservation-Confirmation-HM-${shortId}-v${version}.pdf`;

  let pdfBuffer;
  try {
    pdfBuffer = await generateReservationPdfBuffer({
      reservation: resRecord,
      hotel,
      settings,
      version,
      documentType,
    });
  } catch (pdfErr) {
    console.error(`[DOCUMENT_SERVICE] PDF generation failed for reservation=${reservationId}:`, pdfErr.message);
    // Record failure in document store
    await recordDocument({
      hotelId,
      reservationId,
      documentType,
      version,
      fileName,
      storagePath: '',
      status: DOCUMENT_STATUS.FAILED,
      metadata: { error: pdfErr.message },
    });
    throw new Error(`PDF_GENERATION_FAILED: ${pdfErr.message}`);
  }

  // 5. Save to Persistent Storage
  const { storagePath } = await savePdfToStorage({
    hotelId,
    reservationId,
    version,
    buffer: pdfBuffer,
    filename: fileName,
  });

  // 6. Record Document in Database / Outbox Store
  const docRecord = await recordDocument({
    hotelId,
    reservationId,
    documentType,
    version,
    fileName,
    storagePath,
    status: DOCUMENT_STATUS.GENERATED,
    emailStatus: DELIVERY_STATUS.PENDING,
    whatsappStatus: DELIVERY_STATUS.PENDING,
    generatedBy,
    metadata: {
      reservation_updated_at: resRecord.updated_at || new Date().toISOString(),
      guest_name: resRecord.guest_name,
      check_in: resRecord.check_in_date,
      check_out: resRecord.check_out_date,
      room_no: resRecord.room_no,
      invoice_total: resRecord.invoice_total,
      generated_at: new Date().toISOString(),
    },
  });

  return {
    alreadyExists: false,
    document: docRecord,
    buffer: pdfBuffer,
    version,
    fileName,
    storagePath,
  };
};

export default {
  DOCUMENT_TYPES,
  DOCUMENT_STATUS,
  DELIVERY_STATUS,
  getReservationDocuments,
  getNextDocumentVersion,
  savePdfToStorage,
  readPdfFromStorage,
  recordDocument,
  updateDocumentDeliveryStatus,
  generateAndStoreReservationConfirmation,
};
