/**
 * HOTEL MANTRI — Hotel Branding API Routes
 * 
 * Provides authorized, tenant-isolated management of hotel branding:
 * - Hotel Name, Location, Address, Phone, Email, Website, GSTIN
 * - Check-in Time & Check-out Time configuration
 * - Cancellation Policy & Important Stay Notes
 * - Logo upload, replacement, preview, and removal
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireHotelAccess as checkAuth } from '../middleware/auth.js';
import {
  getHotelBranding,
  updateHotelBranding,
  fetchLogoAsBase64,
} from '../services/hotelBrandingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isServerless
  ? path.join('/tmp', 'hotel-mantri-data')
  : path.join(__dirname, '..', 'data');
const LOGOS_DIR = path.join(DATA_DIR, 'logos');

try {
  if (!fs.existsSync(LOGOS_DIR)) {
    fs.mkdirSync(LOGOS_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('[HOTEL_BRANDING] Could not create logos directory (non-fatal):', err.message);
}

const router = express.Router();

/**
 * GET /api/hotel-branding
 * Retrieves dynamic branding configuration for the authorized hotel.
 */
router.get('/', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    if (!hotelId) {
      return res.status(400).json({
        success: false,
        code: 'HOTEL_CONTEXT_REQUIRED',
        message: 'Hotel context is required to retrieve branding.',
      });
    }

    const branding = await getHotelBranding(hotelId);
    return res.json({
      success: true,
      branding,
    });
  } catch (err) {
    console.error('[BRANDING_API] Error fetching branding:', err);
    return res.status(500).json({
      success: false,
      code: 'BRANDING_FETCH_FAILED',
      message: err.message || 'Failed to retrieve hotel branding.',
    });
  }
});

/**
 * PUT /api/hotel-branding
 * Updates dynamic branding configuration for the authorized hotel.
 */
router.put('/', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    if (!hotelId) {
      return res.status(400).json({
        success: false,
        code: 'HOTEL_CONTEXT_REQUIRED',
        message: 'Hotel context is required to update branding.',
      });
    }

    const patch = req.body || {};
    const updated = await updateHotelBranding(hotelId, patch);

    return res.json({
      success: true,
      message: 'Hotel branding updated successfully.',
      branding: updated,
    });
  } catch (err) {
    console.error('[BRANDING_API] Error updating branding:', err);
    return res.status(500).json({
      success: false,
      code: 'BRANDING_UPDATE_FAILED',
      message: err.message || 'Failed to update hotel branding.',
    });
  }
});

/**
 * POST /api/hotel-branding/logo
 * Uploads or replaces hotel logo for the authorized hotel.
 * Accepts: { logoDataUrl: "data:image/png;base64,..." } or { logoUrl: "..." }
 */
router.post('/logo', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    if (!hotelId) {
      return res.status(400).json({
        success: false,
        code: 'HOTEL_CONTEXT_REQUIRED',
        message: 'Hotel context is required to upload logo.',
      });
    }

    const { logoDataUrl, logoUrl } = req.body;
    const incomingData = logoDataUrl || logoUrl;

    if (!incomingData || typeof incomingData !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_LOGO_PAYLOAD',
        message: 'Please provide a valid logoDataUrl or logoUrl.',
      });
    }

    let finalLogoUrl = incomingData;

    // If it's a data URI, write it to local disk under data/logos/<hotelId>.<ext>
    if (incomingData.startsWith('data:image/')) {
      const match = incomingData.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_IMAGE_FORMAT',
          message: 'Supported image formats are PNG, JPEG, and WEBP.',
        });
      }

      const rawExt = match[1].toLowerCase();
      const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
      if (!['png', 'jpg', 'jpeg', 'webp'].includes(rawExt)) {
        return res.status(400).json({
          success: false,
          code: 'UNSUPPORTED_IMAGE_FORMAT',
          message: 'Supported formats: PNG, JPG/JPEG, WEBP.',
        });
      }

      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 5 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          code: 'FILE_TOO_LARGE',
          message: 'Logo file size must not exceed 5 MB.',
        });
      }

      const filename = `${hotelId}-logo.${ext}`;
      const filePath = path.join(LOGOS_DIR, filename);
      fs.writeFileSync(filePath, buffer);

      // Use a persistent relative/local path or data url
      finalLogoUrl = incomingData; // preserve high-quality data URI for zero-latency PDF rendering
    }

    const updated = await updateHotelBranding(hotelId, { logoUrl: finalLogoUrl });

    return res.json({
      success: true,
      message: 'Hotel logo updated successfully.',
      logoUrl: updated.logoUrl,
      branding: updated,
    });
  } catch (err) {
    console.error('[BRANDING_API] Error uploading logo:', err);
    return res.status(500).json({
      success: false,
      code: 'LOGO_UPLOAD_FAILED',
      message: err.message || 'Failed to upload hotel logo.',
    });
  }
});

/**
 * DELETE /api/hotel-branding/logo
 * Removes the configured logo for the authorized hotel.
 */
router.delete('/logo', checkAuth, async (req, res) => {
  try {
    const hotelId = req.hotelId || req.auth?.hotelId;
    if (!hotelId) {
      return res.status(400).json({
        success: false,
        code: 'HOTEL_CONTEXT_REQUIRED',
        message: 'Hotel context is required to remove logo.',
      });
    }

    const updated = await updateHotelBranding(hotelId, { logoUrl: '' });

    return res.json({
      success: true,
      message: 'Hotel logo removed successfully.',
      branding: updated,
    });
  } catch (err) {
    console.error('[BRANDING_API] Error removing logo:', err);
    return res.status(500).json({
      success: false,
      code: 'LOGO_REMOVAL_FAILED',
      message: err.message || 'Failed to remove hotel logo.',
    });
  }
});

export default router;
