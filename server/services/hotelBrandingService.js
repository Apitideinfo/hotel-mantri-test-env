/**
 * Hotel Mantri — Hotel Branding Service
 *
 * Provides authoritative management for hotel branding:
 * - Dynamic logo resolution (aspect-ratio preserved for PDF embedding)
 * - Dynamic hotel name, location, address, contact numbers, website, GSTIN
 * - Dynamic check-in time, check-out time, and cancellation policy
 * - Multi-tenant isolation: strictly hotel-scoped, zero cross-tenant leakage
 * - Local durable JSON backing store for extended branding attributes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseServiceRole } from '../supabaseClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const BRANDING_FILE = path.join(DATA_DIR, 'hotel_branding.json');
const LOGOS_DIR = path.join(DATA_DIR, 'logos');

// Ensure storage directories exist
for (const dir of [DATA_DIR, LOGOS_DIR]) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.warn(`[BRANDING_SERVICE] Could not create directory ${dir}:`, err.message);
    }
  }
}

// ─── Local Branding Store Helpers ──────────────────────────────────────────

const readLocalBrandingMap = () => {
  try {
    if (!fs.existsSync(BRANDING_FILE)) return {};
    const content = fs.readFileSync(BRANDING_FILE, 'utf-8');
    return JSON.parse(content || '{}');
  } catch (err) {
    console.warn('[BRANDING_SERVICE] Failed to read branding file:', err.message);
    return {};
  }
};

const writeLocalBrandingMap = (map) => {
  try {
    fs.writeFileSync(BRANDING_FILE, JSON.stringify(map, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[BRANDING_SERVICE] Failed to write branding file:', err.message);
  }
};

// ─── Logo Image Fetcher & Base64 Converter ───────────────────────────────────

/**
 * Fetches an image from a URL, local path, or data URI and converts to a base64 Data URL for jsPDF.
 * @param {string} logoUrl
 * @returns {Promise<string|null>} Base64 data URI or null
 */
export const fetchLogoAsBase64 = async (logoUrl) => {
  if (!logoUrl || typeof logoUrl !== 'string') return null;

  const trimmed = logoUrl.trim();
  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }

  // Check candidate local file paths
  const cleanRel = trimmed.replace(/^[/\\]+/, '');
  const candidatePaths = [
    trimmed,
    path.resolve(process.cwd(), cleanRel),
    path.resolve(__dirname, '..', cleanRel),
    path.resolve(__dirname, cleanRel),
    path.join(LOGOS_DIR, path.basename(trimmed)),
    path.join(DATA_DIR, cleanRel.replace(/^data[/\\]+/i, '')),
  ];

  for (const cPath of candidatePaths) {
    if (fs.existsSync(cPath) && fs.statSync(cPath).isFile()) {
      try {
        const ext = path.extname(cPath).toLowerCase().replace('.', '');
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        const buf = fs.readFileSync(cPath);
        return `data:${mime};base64,${buf.toString('base64')}`;
      } catch (err) {
        console.warn('[BRANDING_SERVICE] Failed to read local logo file:', err.message);
      }
    }
  }

  // Fetch via HTTP/HTTPS with timeout
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(trimmed, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn(`[BRANDING_SERVICE] Logo fetch failed with status ${res.status} for ${trimmed}`);
        return null;
      }

      const contentType = res.headers.get('content-type') || 'image/png';
      const mime = contentType.includes('jpeg') || contentType.includes('jpg')
        ? 'image/jpeg'
        : contentType.includes('webp')
        ? 'image/webp'
        : 'image/png';

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return `data:${mime};base64,${buffer.toString('base64')}`;
    } catch (err) {
      console.warn(`[BRANDING_SERVICE] Could not load logo image from ${trimmed}:`, err.message);
      return null;
    }
  }

  return null;
};

// ─── Authoritative Branding Resolver ──────────────────────────────────────────

/**
 * Resolves the complete, authoritative hotel branding for a given hotelId.
 * Strictly hotel-isolated. Merges database records with extended branding attributes.
 *
 * @param {string} hotelId - Hotel UUID
 * @returns {Promise<Object>} Unified hotel branding object
 */
export const getHotelBranding = async (hotelId) => {
  if (!hotelId) {
    return {
      hotelId: null,
      hotelName: 'Hotel Mantri',
      city: '',
      address: '',
      phone: '',
      email: '',
      website: '',
      gstNumber: '',
      logoUrl: '',
      checkInTime: '12:00 Hrs',
      checkOutTime: '10:00 Hrs',
      cancellationPolicy: 'Standard cancellation policy applies.',
      importantNotes: 'Valid Government Photo ID required at check-in for all adult guests.',
    };
  }

  // 1. Fetch hotel master record
  const { data: hotelData } = await supabaseServiceRole
    .from('hotels')
    .select('*')
    .eq('id', hotelId)
    .maybeSingle();

  // 2. Fetch hotel_settings record
  const { data: settingsData } = await supabaseServiceRole
    .from('hotel_settings')
    .select('*')
    .eq('id', hotelId)
    .maybeSingle();

  const hotel = hotelData || {};
  const settings = settingsData || {};

  // 3. Read local extended branding configuration
  const localMap = readLocalBrandingMap();
  const localBranding = localMap[hotelId] || {};

  const hotelName = localBranding.hotel_name || settings.hotel_name || hotel.hotel_name || 'Hotel Mantri';
  const city = localBranding.city || settings.city || hotel.city || '';
  const state = localBranding.state_name || settings.state_name || hotel.state || '';
  const address = localBranding.address || settings.address || hotel.address || '';
  const pinCode = localBranding.pin_code || settings.pin_code || '';
  const phone = localBranding.phone || settings.phone || settings.whatsapp_number || hotel.mobile || '';
  const email = localBranding.email || settings.email || hotel.admin_email || '';
  const website = localBranding.website || settings.website || '';
  const gstNumber = localBranding.gst_number || settings.gst_number || '';
  const panNumber = localBranding.pan_number || settings.pan_number || '';
  const logoUrl = localBranding.logo_url !== undefined ? localBranding.logo_url : (settings.logo_url || '');

  const checkInTime = localBranding.check_in_time || '12:00 Hrs';
  const checkOutTime = localBranding.check_out_time || '10:00 Hrs';
  const cancellationPolicy = localBranding.cancellation_policy ||
    'Cancellation requests must be received 24 hours prior to check-in for a full refund. Cancellations made within 24 hours are subject to standard retention charges.';
  const importantNotes = localBranding.important_notes ||
    'Valid Government Photo ID (Aadhaar / Passport / Driving Licence) required at check-in for all adult guests. PAN Card is not accepted as address proof.';

  return {
    hotelId,
    hotelName,
    legalName: settings.legal_name || '',
    city,
    state,
    address,
    pinCode,
    phone,
    landline: phone,
    email,
    website,
    gstNumber,
    panNumber,
    logoUrl,
    checkInTime,
    checkOutTime,
    cancellationPolicy,
    importantNotes,
    updatedAt: localBranding.updated_at || settings.updated_at || new Date().toISOString(),
  };
};

/**
 * Saves/updates branding attributes for a hotel.
 *
 * @param {string} hotelId - Hotel UUID
 * @param {Object} patch - Partial branding attributes
 * @returns {Promise<Object>} Updated branding object
 */
export const updateHotelBranding = async (hotelId, patch = {}) => {
  if (!hotelId) throw new Error('hotelId is required to update branding');

  // 1. Update Supabase hotel_settings for standard database columns
  const standardDbFields = {};
  if (patch.hotelName || patch.hotel_name) standardDbFields.hotel_name = (patch.hotelName || patch.hotel_name).trim();
  if (patch.address !== undefined) standardDbFields.address = patch.address.trim();
  if (patch.city !== undefined) standardDbFields.city = patch.city.trim();
  if (patch.stateName || patch.state_name) standardDbFields.state_name = (patch.stateName || patch.state_name).trim();
  if (patch.pinCode || patch.pin_code) standardDbFields.pin_code = (patch.pinCode || patch.pin_code).trim();
  if (patch.phone !== undefined) standardDbFields.phone = patch.phone.trim();
  if (patch.email !== undefined) standardDbFields.email = patch.email.trim();
  if (patch.website !== undefined) standardDbFields.website = patch.website.trim();
  if (patch.gstNumber || patch.gst_number) standardDbFields.gst_number = (patch.gstNumber || patch.gst_number).trim();
  const incomingLogo = patch.logoUrl !== undefined ? patch.logoUrl : patch.logo_url;
  if (incomingLogo !== undefined) {
    standardDbFields.logo_url = (incomingLogo || '').trim();
  }

  if (Object.keys(standardDbFields).length > 0) {
    try {
      await supabaseServiceRole
        .from('hotel_settings')
        .update({
          ...standardDbFields,
          updated_at: new Date().toISOString(),
        })
        .eq('id', hotelId);
    } catch (err) {
      console.warn('[BRANDING_SERVICE] Failed to update hotel_settings table:', err.message);
    }
  }

  // 2. Persist extended branding in local durable JSON file
  const localMap = readLocalBrandingMap();
  const existing = localMap[hotelId] || {};

  localMap[hotelId] = {
    ...existing,
    hotel_id: hotelId,
    hotel_name: patch.hotelName || patch.hotel_name || existing.hotel_name || standardDbFields.hotel_name,
    city: patch.city !== undefined ? patch.city : existing.city,
    state_name: patch.stateName || patch.state_name || existing.state_name,
    address: patch.address !== undefined ? patch.address : existing.address,
    pin_code: patch.pinCode || patch.pin_code || existing.pin_code,
    phone: patch.phone !== undefined ? patch.phone : existing.phone,
    email: patch.email !== undefined ? patch.email : existing.email,
    website: patch.website !== undefined ? patch.website : existing.website,
    gst_number: patch.gstNumber || patch.gst_number || existing.gst_number,
    logo_url: incomingLogo !== undefined ? (incomingLogo || '').trim() : (existing.logo_url || ''),
    check_in_time: patch.checkInTime || patch.check_in_time || existing.check_in_time || '12:00 Hrs',
    check_out_time: patch.checkOutTime || patch.check_out_time || existing.check_out_time || '10:00 Hrs',
    cancellation_policy: patch.cancellationPolicy || patch.cancellation_policy || existing.cancellation_policy,
    important_notes: patch.importantNotes || patch.important_notes || existing.important_notes,
    updated_at: new Date().toISOString(),
  };

  writeLocalBrandingMap(localMap);

  return getHotelBranding(hotelId);
};

export default {
  getHotelBranding,
  updateHotelBranding,
  fetchLogoAsBase64,
};
