import express from 'express';
import aiosellService from '../services/aiosellService.js';
import { createClient } from '@supabase/supabase-js';
import { supabaseServiceRole } from '../supabaseClient.js';
import { processAiosellReservation } from '../services/integrations/aiosell/AiosellReservationService.js';
import { parseWebhookPayload } from '../services/integrations/aiosell/AiosellPayloadParser.js';
import { resolveAuthorizedHotel, requireHotelAccess } from '../middleware/auth.js';
import { getChannelProviderConfig } from '../services/providerConfig.js';
import { syncRates, syncInventory, getCleanDateList } from '../services/channelSyncEngine.js';

const router = express.Router();

// Helper to fetch hotel-specific channel configuration
const getHotelAiosellConfig = async (hotelId, requestId = null, client = null) => {
  return getChannelProviderConfig(hotelId, requestId, client);
};

// Public & Diagnostic Health / Status Endpoints (Always return JSON, never HTML)
router.all(['/status', '/health', '/test-connection'], async (req, res) => {
  const requestId = req.requestId || `HM-STAT-${Date.now().toString(36).toUpperCase()}`;
  try {
    // Resolve authorized hotel context securely when token is provided
    let hotelId = null;
    let scopedClient = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const authRes = await resolveAuthorizedHotel(req);
      if (!authRes.success) {
        return res.status(authRes.status || 403).json({
          success: false,
          error: authRes.code,
          code: authRes.code,
          message: authRes.message,
          requestId,
        });
      }
      hotelId = authRes.hotelId;
      scopedClient = authRes.scopedSupabase;
    } else {
      const requestedHeader = req.headers['x-hotel-id'] || req.query.hotelId;
      if (requestedHeader) {
        return res.status(401).json({
          success: false,
          error: 'AUTH_REQUIRED',
          code: 'AUTH_REQUIRED',
          message: 'Authentication required to inspect hotel-specific integration status.',
          requestId,
        });
      }
    }
    
    // If no specific hotel context is provided (e.g. platform health check, direct URL verification)
    if (!hotelId) {
      return res.status(200).json({
        success: true,
        configured: true,
        connected: true,
        status: 'operational',
        service: 'aiosell_channel_manager',
        provider: 'external_channel_manager',
        environment: process.env.AIOSELL_ENVIRONMENT || 'production',
        message: 'Aiosell channel manager API service is operational. Pass x-hotel-id header for property-specific connection status.',
        lastCheckedAt: new Date().toISOString(),
        requestId
      });
    }

    let hotelConfig = null;
    try {
      hotelConfig = await getHotelAiosellConfig(hotelId, requestId, scopedClient || req.scopedSupabase);
    } catch (cfgErr) {
      const isPropMissing = cfgErr.code === 'PROVIDER_PROPERTY_NOT_FOUND' || cfgErr.message?.includes('property code');
      const statusType = isPropMissing ? 'PROPERTY_NOT_CONFIGURED' : 'CONFIGURATION_MISSING';
      const errCode = isPropMissing ? 'AIOSSELL_HOTEL_NOT_FOUND' : 'AIOSSELL_AUTH_FAILED';
      return res.status(200).json({
        success: false,
        configured: false,
        connected: false,
        status: statusType,
        code: errCode,
        errorCode: errCode,
        provider: 'external_channel_manager',
        hotelId,
        message: cfgErr.message || 'Channel manager integration is not configured for this hotel.',
        lastCheckedAt: new Date().toISOString(),
        requestId
      });
    }

    if (!hotelConfig || !hotelConfig.credentialPresent) {
      return res.status(200).json({
        success: false,
        configured: false,
        connected: false,
        status: 'CONFIGURATION_MISSING',
        code: 'AIOSSELL_AUTH_FAILED',
        errorCode: 'AIOSSELL_AUTH_FAILED',
        provider: 'external_channel_manager',
        hotelId,
        message: 'Channel manager server credentials are not configured.',
        lastCheckedAt: new Date().toISOString(),
        requestId
      });
    }

    if (!hotelConfig.hotelCode) {
      return res.status(200).json({
        success: false,
        configured: false,
        connected: false,
        status: 'PROPERTY_NOT_CONFIGURED',
        code: 'AIOSSELL_HOTEL_NOT_FOUND',
        errorCode: 'AIOSSELL_HOTEL_NOT_FOUND',
        provider: 'external_channel_manager',
        hotelId,
        message: 'External property code is not configured for this hotel in Channel Settings.',
        lastCheckedAt: new Date().toISOString(),
        requestId
      });
    }

    const result = await aiosellService.testConnection(hotelConfig);
    
    if (result.success) {
      // Persist success status in channel_settings
      const supabase = scopedClient || req.scopedSupabase || getSupabase();
      await supabase
        .from('channel_settings')
        .update({
          aiosell_status: 'connected',
          last_tested_at: new Date().toISOString(),
          last_test_result: 'Connected successfully',
          updated_at: new Date().toISOString()
        })
        .eq('hotel_id', hotelId);

      return res.status(200).json({
        success: true,
        configured: true,
        connected: true,
        status: 'CONNECTED',
        code: 'AIOSSELL_CONNECTED',
        errorCode: null,
        provider: 'external_channel_manager',
        hotelId,
        environment: result.environment || hotelConfig.environment,
        hotelCode: result.hotelCode || hotelConfig.hotelCode,
        partnerId: result.partnerId || hotelConfig.partnerId,
        mappingConfigured: (result.mapping?.rooms?.length > 0) || (result.mapping?.ratePlans?.length > 0),
        mapping: result.mapping,
        latencyMs: result.responseTimeMs,
        responseTimeMs: result.responseTimeMs,
        message: 'Channel integration connection successful',
        lastCheckedAt: new Date().toISOString(),
        requestId
      });
    } else {
      // Persist error status in channel_settings
      const supabase = scopedClient || req.scopedSupabase || getSupabase();
      await supabase
        .from('channel_settings')
        .update({
          aiosell_status: 'error',
          last_tested_at: new Date().toISOString(),
          last_test_result: result.error?.message || 'Connection test failed',
          updated_at: new Date().toISOString()
        })
        .eq('hotel_id', hotelId);

      const errObj = result.error || {};
      const errorCode = errObj.errorCode || errObj.code || 'AIOSSELL_CONNECTION_FAILED';
      const statusLabel = errorCode === 'AIOSSELL_AUTH_FAILED' 
        ? 'AUTH_ERROR' 
        : errorCode === 'AIOSSELL_HOTEL_NOT_FOUND' 
        ? 'PROPERTY_NOT_CONFIGURED' 
        : 'EXTERNAL_PROVIDER_UNAVAILABLE';

      return res.status(200).json({
        success: false,
        configured: true,
        connected: false,
        status: statusLabel,
        code: errorCode,
        errorCode,
        provider: 'external_channel_manager',
        error: {
          code: errorCode,
          message: errObj.message || 'Channel manager integration connection failed',
          requestId
        },
        message: errObj.message || 'Channel manager integration connection failed',
        details: result.diagnostic,
        requestId
      });
    }
  } catch (err) {
    console.error(`[/api/aiosell/status] Error:`, err);
    const statusCode = err.status && typeof err.status === 'number' ? err.status : 500;
    const errorCode = err.errorCode || err.code || (statusCode === 500 ? 'SERVER_ERROR' : 'API_ERROR');
    const isInternalJsError = err instanceof ReferenceError || err instanceof TypeError || String(err?.message || '').includes('is not defined');
    const safeMessage = isInternalJsError
      ? 'An internal authorization error occurred while verifying hotel channel status.'
      : (err.message || 'Failed to verify channel integration status');

    res.status(statusCode).json({
      success: false,
      provider: 'external_channel_manager',
      error: {
        code: errorCode,
        message: safeMessage,
        requestId
      },
      errorCode,
      message: safeMessage,
      requestId
    });
  }
});

// Apply auth middleware to all remaining authenticated routes in this file
router.use(requireHotelAccess);

// Helper to get dates array using deterministic UTC calendar arithmetic
const getDates = (start, end) => getCleanDateList(start, end);

let supabaseInstance = null;
const getSupabase = () => {
  return supabaseServiceRole;
};

// Helper to sanitize secrets from logs
const sanitizeLogData = (data) => {
  if (!data) return null;
  const str = typeof data === 'object' ? JSON.stringify(data) : String(data);
  return str
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/password['"]?\s*[:=]\s*['"][^'"]+['"]/gi, 'password:"[REDACTED]"')
    .replace(/key['"]?\s*[:=]\s*['"][^'"]+['"]/gi, 'key:"[REDACTED]"');
};

// Helper to log to Supabase channel_sync_logs
const logSync = async (hotelId, operation, direction, status, message, errorDetail = null, roomCategory = null, channelConnectionId = null, requestId = null) => {
  try {
    const supabase = getSupabase();
    await supabase.from('channel_sync_logs').insert({
      hotel_id: hotelId,
      channel_connection_id: channelConnectionId,
      log_type: operation,
      direction,
      status,
      message: sanitizeLogData(message),
      error_detail: sanitizeLogData(errorDetail),
      room_category_id: roomCategory,
      retry_status: 'not_retried',
      retry_count: 0
    });
  } catch (err) {
    console.error('Failed to write sync log:', err);
  }
};

router.get('/mapping', async (req, res) => {
  try {
    const hotelId = (req.hotelId || req.auth?.hotelId);
    if (!hotelId) {
      return res.status(400).json({ success: false, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.', requestId: req.requestId });
    }

    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId, req.scopedSupabase);
    
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const result = await aiosellService.getPropertyMapping(hotelConfig);
    
    // Enrich with hotel object matching frontend AiosellMappingResponse contract
    const { data: hotelData } = await (req.scopedSupabase || getSupabase())
      .from('hotels')
      .select('id, hotel_name')
      .eq('id', hotelId)
      .maybeSingle();

    const hotelObj = {
      id: hotelId,
      hotel_id: hotelId,
      name: hotelData?.hotel_name || result.hotelCode || 'Hotel',
      hotel_name: hotelData?.hotel_name || result.hotelCode || 'Hotel',
    };

    await logSync(hotelId, 'AIOSELL_FETCH_MAPPING', 'inbound', 'success', 'Successfully fetched property mapping', null, null, null, req.requestId);
    res.json({
      ...result,
      hotel: hotelObj,
    });
  } catch (err) {
    await logSync((req.hotelId || req.auth?.hotelId), 'AIOSELL_FETCH_MAPPING', 'inbound', 'failure', 'Failed to fetch mapping', err.message, null, null, req.requestId);
    res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Failed to fetch mapping',
      message: err.message || 'Failed to fetch mapping',
      code: err.code || 'API_ERROR',
      requestId: req.requestId
    });
  }
});


/**
 * Authoritative Room Availability Calculator for Hotel Mantri PMS
 * Computes: Available = max(0, physicalActive - occupied - blocked)
 * Used by both UI grid matrix endpoint and outbound channel push.
 */
export async function calculateAuthoritativeInventory(hotelId, startDate, endDate, specificCategoryIds = null, options = {}) {
  if (specificCategoryIds && !Array.isArray(specificCategoryIds) && typeof specificCategoryIds === 'object') {
    options = specificCategoryIds;
    specificCategoryIds = null;
  }
  const dates = getDates(startDate, endDate);
  const supabase = options?.client || getSupabase();

  // 1. Get physical rooms
  const { data: physicalRooms, error: roomsError } = await supabase
    .from('rooms')
    .select('id, category_id, room_no, is_active')
    .eq('hotel_id', hotelId);

  if (roomsError) {
    console.error('[calculateAuthoritativeInventory] Error querying rooms:', roomsError);
  }

  const roomToCatMap = {};
  const physicalCounts = {};
  (physicalRooms || []).forEach(r => {
    if (r.category_id && r.is_active !== false) {
      roomToCatMap[r.id] = r.category_id;
      physicalCounts[r.category_id] = (physicalCounts[r.category_id] || 0) + 1;
    }
  });

  // Map room_no to category_id
  const roomNoToCatMap = {};
  (physicalRooms || []).forEach(r => {
    if (r.room_no && r.category_id) {
      roomNoToCatMap[String(r.room_no).trim().toLowerCase()] = r.category_id;
    }
  });

  // 2. Get active reservations overlapping the date range
  const { data: reservations, error: resError } = await supabase
    .from('reservations')
    .select('id, room_id, room_no, rate_plan, check_in_date, check_out_date, status, internal_note, remarks, created_at')
    .eq('hotel_id', hotelId)
    .in('status', ['confirmed', 'checked_in'])
    .lte('check_in_date', endDate)
    .gte('check_out_date', startDate);

  if (resError) {
    console.error('[calculateAuthoritativeInventory] Error querying reservations:', resError);
  }

  // 3. Get room blocks / maintenance
  const { data: roomBlocks } = await supabase
    .from('room_blocks')
    .select('room_no, start_date, end_date, block_type')
    .eq('hotel_id', hotelId)
    .lte('start_date', endDate)
    .gte('end_date', startDate);

  // 4. Get channel mappings for rate plan / room code resolution
  const { data: mappings } = await supabase
    .from('channel_rate_mappings')
    .select('room_category_id, external_room_code, external_rate_plan_code')
    .eq('hotel_id', hotelId)
    .eq('status', 'mapped');

  const extCodeToCatMap = {};
  const ratePlanCodeToCatMap = {};
  (mappings || []).forEach(m => {
    if (m.room_category_id) {
      if (m.external_room_code) {
        extCodeToCatMap[m.external_room_code.toLowerCase()] = m.room_category_id;
      }
      if (m.external_rate_plan_code) {
        ratePlanCodeToCatMap[m.external_rate_plan_code.toLowerCase()] = m.room_category_id;
      }
    }
  });

  // 5. Get room categories to map category names
  const { data: allCategories } = await supabase
    .from('room_categories')
    .select('id, name')
    .eq('hotel_id', hotelId)
    .neq('is_active', false);

  const catNameToIdMap = {};
  (allCategories || []).forEach(c => {
    if (c.name) {
      catNameToIdMap[c.name.trim().toLowerCase()] = c.id;
    }
  });

  // 6. Query channel_ota_reservations for mapping unassigned bookings
  const { data: otaRecords } = await supabase
    .from('channel_ota_reservations')
    .select('ota_booking_id, reservation_id, room_category')
    .eq('hotel_id', hotelId);

  const otaResIdToCatMap = {};
  const otaBookingIdToCatMap = {};
  (otaRecords || []).forEach(o => {
    const matchedCatId = o.room_category ? catNameToIdMap[o.room_category.trim().toLowerCase()] : null;
    if (matchedCatId) {
      if (o.reservation_id) otaResIdToCatMap[o.reservation_id] = matchedCatId;
      if (o.ota_booking_id) otaBookingIdToCatMap[String(o.ota_booking_id).trim()] = matchedCatId;
    }
  });

  // 7. Get inventory restrictions overrides
  let restrictionsQuery = supabase
    .from('channel_inventory_restrictions')
    .select('date, room_category_id, availability, stop_sell, base_rate, channel_rate, min_stay, max_stay, closed_to_arrival, closed_to_departure, updated_at')
    .eq('hotel_id', hotelId)
    .gte('date', startDate)
    .lte('date', endDate);

  if (specificCategoryIds && specificCategoryIds.length > 0) {
    restrictionsQuery = restrictionsQuery.in('room_category_id', specificCategoryIds);
  }
  const { data: restrictions } = await restrictionsQuery;

  const restrictionMap = new Map();
  (restrictions || []).forEach(r => {
    restrictionMap.set(`${r.room_category_id}|${r.date}`, r);
  });

  const categories = (allCategories || []).filter(c => 
    !specificCategoryIds || specificCategoryIds.includes(c.id)
  );

  const matrix = [];

  for (const date of dates) {
    // Count occupied per category on this date
    // Hotel night interval [check_in, check_out): check-in is occupied, check-out is no longer occupied
    const occupiedCounts = {};
    (reservations || []).forEach(res => {
      const ci = String(res.check_in_date).slice(0, 10);
      const co = String(res.check_out_date).slice(0, 10);

      if (date >= ci && date < co) {
        let catId = res.room_id ? roomToCatMap[res.room_id] : null;

        // Try physical room number if assigned
        if (!catId && res.room_no && res.room_no !== 'Unassigned' && res.room_no !== 'TBD') {
          catId = roomNoToCatMap[String(res.room_no).trim().toLowerCase()];
        }

        // Try rate plan exact code or room code prefix
        if (!catId && res.rate_plan) {
          const rp = String(res.rate_plan).toLowerCase().trim();
          catId = ratePlanCodeToCatMap[rp];
          if (!catId) {
            const prefix = rp.split('-').slice(0, 2).join('-');
            catId = extCodeToCatMap[prefix] || extCodeToCatMap[rp.split('-')[0]];
          }
        }

        // Try reservation ID in OTA records
        if (!catId && res.id && otaResIdToCatMap[res.id]) {
          catId = otaResIdToCatMap[res.id];
        }

        // Try OTA booking marker in internal note or remarks
        if (!catId) {
          const noteText = `${res.internal_note || ''} ${res.remarks || ''}`;
          const otaMatch = noteText.match(/\[OTA_BOOKING_ID:\s*([^\]\s]+)\]/i);
          if (otaMatch && otaMatch[1]) {
            catId = otaBookingIdToCatMap[otaMatch[1].trim()];
          }
        }

        if (catId) {
          occupiedCounts[catId] = (occupiedCounts[catId] || 0) + 1;
        }
      }
    });

    // Count blocked per category on this date
    const blockedCounts = {};
    (roomBlocks || []).forEach(b => {
      const bs = String(b.start_date).slice(0, 10);
      const be = String(b.end_date).slice(0, 10);
      if (date >= bs && date <= be) {
        const catId = roomNoToCatMap[String(b.room_no).trim().toLowerCase()];
        if (catId) {
          blockedCounts[catId] = (blockedCounts[catId] || 0) + 1;
        }
      }
    });

    for (const cat of categories) {
      const physical = physicalCounts[cat.id] || 0;
      const occupied = occupiedCounts[cat.id] || 0;
      const blocked = blockedCounts[cat.id] || 0;
      const calculatedAvailable = Math.max(0, physical - occupied - blocked);

      const r = restrictionMap.get(`${cat.id}|${date}`);
      const isManual = r && r.availability !== undefined && r.availability !== null && String(r.availability).trim() !== '';
      const manualVal = isManual ? Number(r.availability) : null;

      let sellable = calculatedAvailable;

      if (r?.stop_sell) {
        sellable = 0;
      } else if (isManual && !isNaN(manualVal)) {
        // Authoritative inventory: respect manual override
        // Calculate new reservations for this category and date created strictly AFTER the manual update was saved
        const rUpdatedAt = r.updated_at ? new Date(r.updated_at).getTime() : 0;
        let newReservationsAfterUpdate = 0;
        if (rUpdatedAt > 0) {
          (reservations || []).forEach(res => {
            const ci = String(res.check_in_date).slice(0, 10);
            const co = String(res.check_out_date).slice(0, 10);
            if (date >= ci && date < co) {
              const resCreatedAt = res.created_at ? new Date(res.created_at).getTime() : 0;
              if (resCreatedAt > rUpdatedAt) {
                let matchedCatId = res.room_id ? roomToCatMap[res.room_id] : null;
                if (!matchedCatId && res.room_no && res.room_no !== 'Unassigned' && res.room_no !== 'TBD') {
                  matchedCatId = roomNoToCatMap[String(res.room_no).trim().toLowerCase()];
                }
                if (!matchedCatId && res.rate_plan) {
                  const rp = String(res.rate_plan).toLowerCase().trim();
                  matchedCatId = ratePlanCodeToCatMap[rp] || extCodeToCatMap[rp.split('-').slice(0, 2).join('-')] || extCodeToCatMap[rp.split('-')[0]];
                }
                if (!matchedCatId && res.id && otaResIdToCatMap[res.id]) {
                  matchedCatId = otaResIdToCatMap[res.id];
                }
                if (!matchedCatId) {
                  const noteText = `${res.internal_note || ''} ${res.remarks || ''}`;
                  const otaMatch = noteText.match(/\[OTA_BOOKING_ID:\s*([^\]\s]+)\]/i);
                  if (otaMatch && otaMatch[1]) {
                    matchedCatId = otaBookingIdToCatMap[otaMatch[1].trim()];
                  }
                }
                if (matchedCatId === cat.id) {
                  newReservationsAfterUpdate++;
                }
              }
            }
          });
        }

        const remainingManual = Math.max(0, manualVal - newReservationsAfterUpdate);
        // Authoritative PMS inventory rule:
        // Cap at physical availability if physical rooms are configured, otherwise respect manual value
        sellable = physical > 0 ? Math.min(remainingManual, calculatedAvailable) : remainingManual;
      }

      matrix.push({
        date,
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
        closed_to_departure: Boolean(r?.closed_to_departure)
      });
    }
  }

  // Persist authoritative calculated availability into channel_inventory_restrictions ONLY when explicitly requested
  if (options.persistToDb === true && matrix.length > 0) {
    try {
      const upsertRows = matrix.map(m => {
        const existing = restrictionMap.get(`${m.room_category_id}|${m.date}`);
        return {
          hotel_id: hotelId,
          room_category_id: m.room_category_id,
          date: m.date,
          availability: m.is_manual ? m.available : (existing?.availability ?? null),
          base_rate: existing?.base_rate ?? 0,
          channel_rate: existing?.channel_rate ?? 0,
          min_stay: existing?.min_stay ?? 1,
          max_stay: existing?.max_stay ?? 0,
          stop_sell: Boolean(existing?.stop_sell),
          closed_to_arrival: Boolean(existing?.closed_to_arrival),
          closed_to_departure: Boolean(existing?.closed_to_departure),
          updated_at: new Date().toISOString()
        };
      });

      await supabase
        .from('channel_inventory_restrictions')
        .upsert(upsertRows, { onConflict: 'hotel_id,room_category_id,date' });
    } catch (upsertErr) {
      console.warn('[calculateAuthoritativeInventory] Warning: could not persist availability to restrictions table:', upsertErr.message);
    }
  }

  return { matrix, physicalCounts, categories, mappings: mappings || [] };
}

/**
 * Authoritative single category/date availability calculator
 */
export async function calculateRoomCategoryAvailability(hotelId, roomCategoryId, businessDate) {
  const cleanDate = String(businessDate).slice(0, 10);
  const { matrix } = await calculateAuthoritativeInventory(hotelId, cleanDate, cleanDate, [roomCategoryId], { persistToDb: false });
  const entry = matrix.find(m => m.room_category_id === roomCategoryId && m.date === cleanDate);
  return {
    hotelId,
    roomCategoryId,
    businessDate: cleanDate,
    physical: entry?.physical ?? 0,
    occupied: entry?.occupied ?? 0,
    blocked: entry?.blocked ?? 0,
    calculatedAvailable: entry?.calculatedAvailable ?? 0,
    available: entry?.available ?? 0,
    stopSell: Boolean(entry?.stop_sell),
    isManual: Boolean(entry?.is_manual),
    manualAvailability: entry?.manual_availability ?? null
  };
}

export const executeInventoryPush = async (hotelId, arg2, arg3, arg4, options = {}) => {
  let channelId = null;
  let startDate = null;
  let endDate = null;
  let opts = {};

  if (typeof arg2 === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(arg2)) {
    startDate = arg2;
    endDate = arg3;
    opts = typeof arg4 === 'object' ? arg4 : options;
  } else {
    channelId = arg2 || null;
    startDate = arg3;
    endDate = arg4;
    opts = options || {};
  }

  return await syncInventory({
    hotelId,
    channelId,
    startDate,
    endDate,
    roomCategoryIds: opts?.roomCategoryIds || null,
    skipVerification: opts?.skipVerification || false,
    triggeredBy: opts?.triggeredBy || 'manual'
  });
};

router.post('/inventory/push', async (req, res) => {
  const hotelId = (req.hotelId || req.auth?.hotelId);
  try {
    const { startDate, endDate, channelId } = req.body;
    const result = await executeInventoryPush(hotelId, channelId, startDate, endDate);
    res.json({
      success: true,
      verified: result.verified,
      message: result.message,
      recordsAttempted: result.recordsAttempted,
      recordsVerified: result.recordsVerified,
      discrepancies: result.discrepancies,
      result,
      requestId: req.requestId
    });
  } catch (err) {
    await logSync(hotelId, 'INVENTORY_PUSH', 'outbound', 'failure', err.message || 'Inventory push failed', err.code, null, req.body?.channelId);
    res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'INVENTORY_PUSH_FAILED',
        message: err.message || 'Inventory push failed',
        stage: err.stage || 'validation'
      },
      code: err.code || 'INVENTORY_PUSH_FAILED',
      message: err.message || 'Inventory push failed',
      requestId: req.requestId
    });
  }
});

router.post('/inventory/fetch', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId, req.scopedSupabase);
    
    const result = await aiosellService.fetchInventory(startDate, endDate, hotelConfig);
    const updates = result?.updates || (Array.isArray(result) ? result : []);
    const count = updates.length;

    res.json({
      success: true,
      hotelCode: hotelConfig.hotelCode,
      count,
      message: count === 0 ? 'No inventory data returned for the selected date range.' : undefined,
      result,
      requestId: req.requestId
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'INVENTORY_FETCH_FAILED',
        message: err.message || 'Failed to fetch inventory from channel provider',
        stage: 'aiosell'
      },
      code: err.code || 'INVENTORY_FETCH_FAILED',
      message: err.message || 'Failed to fetch inventory',
      requestId: req.requestId
    });
  }
});

router.all('/inventory/matrix', async (req, res) => {
  const hotelId = (req.hotelId || req.auth?.hotelId);
  const requestId = req.requestId || `HM-MTX-${Date.now().toString(36).toUpperCase()}`;

  if (!hotelId) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'HOTEL_CONTEXT_REQUIRED',
        message: 'Hotel context is required to query inventory matrix.',
        requestId
      }
    });
  }

  try {
    const startDate = req.body?.startDate || req.query?.startDate;
    const endDate = req.body?.endDate || req.query?.endDate;
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INVENTORY_UPDATE',
          message: 'startDate and endDate are required.',
          requestId
        }
      });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DATE_FORMAT',
          message: 'Dates must be formatted as YYYY-MM-DD.',
          requestId
        }
      });
    }

    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DATE_RANGE',
          message: 'startDate must be on or before endDate.',
          requestId
        }
      });
    }

    const { matrix, physicalCounts, categories, mappings } = await calculateAuthoritativeInventory(
      hotelId,
      startDate,
      endDate,
      null,
      { persistToDb: false, client: req.scopedSupabase || supabaseServiceRole }
    );
    res.json({
      success: true,
      startDate,
      endDate,
      physicalCounts,
      categories,
      mappings,
      matrix,
      requestId
    });
  } catch (err) {
    console.error('[POST /inventory/matrix] Error:', err);
    res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'MATRIX_ERROR',
        message: err.message || 'Failed to calculate inventory matrix',
        requestId
      }
    });
  }
});

router.post('/inventory/verify', async (req, res) => {
  const hotelId = (req.hotelId || req.auth?.hotelId);
  try {
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'startDate and endDate are required' });
    }
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId, req.scopedSupabase);
    const { matrix } = await calculateAuthoritativeInventory(hotelId, startDate, endDate, null, { client: req.scopedSupabase });
    
    // Fetch live from Aiosell
    const fetchedInv = await aiosellService.fetchInventory(startDate, endDate, hotelConfig);
    const fetchedUpdates = fetchedInv?.updates || (Array.isArray(fetchedInv) ? fetchedInv : []);

    res.json({
      success: true,
      hotelCode: hotelConfig.hotelCode,
      dateRange: `${startDate} to ${endDate}`,
      fetchedUpdatesCount: fetchedUpdates.length,
      fetchedUpdates,
      localMatrix: matrix
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: err.message
    });
  }
});

router.post('/inventory/diagnostic', async (req, res) => {
  const hotelId = (req.hotelId || req.auth?.hotelId);
  try {
    const { startDate, endDate } = req.body;
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId, req.scopedSupabase);
    const { matrix, physicalCounts, categories, mappings } = await calculateAuthoritativeInventory(hotelId, startDate, endDate, null, { client: req.scopedSupabase });

    res.json({
      hotel: {
        internalId: hotelId,
        externalHotelCode: hotelConfig.hotelCode,
        partnerId: hotelConfig.partnerId,
        environment: hotelConfig.environment
      },
      dateRange: { startDate, endDate },
      physicalCounts,
      categories,
      mappings: mappings.map(m => ({
        roomCategoryId: m.room_category_id,
        externalRoomCode: m.external_room_code
      })),
      matrixSample: matrix.slice(0, 6),
      externalRequest: {
        endpoint: `https://live.aiosell.com/api/v2/cm/update/${hotelConfig.partnerId}`,
        method: 'POST'
      }
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * Executes rate push for a hotel with multi-rate plan matching and post-push verification.
 * Supports signature:
 *   executeRatePush(hotelId, channelId, startDate, endDate, options)
 *   executeRatePush(hotelId, startDate, endDate, options)
 */
export const executeRatePush = async (hotelId, arg2, arg3, arg4, options = {}) => {
  let channelId = null;
  let startDate = null;
  let endDate = null;
  let opts = {};

  if (typeof arg2 === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(arg2)) {
    startDate = arg2;
    endDate = arg3;
    opts = typeof arg4 === 'object' ? arg4 : options;
  } else {
    channelId = arg2 || null;
    startDate = arg3;
    endDate = arg4;
    opts = options || {};
  }

  return await syncRates({
    hotelId,
    channelId,
    startDate,
    endDate,
    roomCategoryIds: opts?.roomCategoryIds || null,
    ratePlanIds: opts?.ratePlanIds || null,
    skipVerification: opts?.skipVerification || false,
    triggeredBy: opts?.triggeredBy || 'manual'
  });
};

router.post('/rates/push', async (req, res) => {
  const hotelId = (req.hotelId || req.auth?.hotelId);
  try {
    const { startDate, endDate, channelId } = req.body;
    const result = await executeRatePush(hotelId, channelId, startDate, endDate);
    res.json({
      success: true,
      verified: result.verified,
      message: result.message,
      recordsAttempted: result.recordsAttempted,
      recordsVerified: result.recordsVerified,
      discrepancies: result.discrepancies,
      result,
      requestId: req.requestId
    });
  } catch (err) {
    await logSync(hotelId, 'RATE_PUSH', 'outbound', 'failure', err.message || 'Rates push failed', err.code, null, req.body?.channelId);
    res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'RATE_PUSH_FAILED',
        message: err.message || 'Failed to push rates',
        stage: err.stage || 'mapping',
        missingCategories: err.missingCategories
      },
      code: err.code || 'RATE_PUSH_FAILED',
      message: err.message || 'Failed to push rates',
      requestId: req.requestId
    });
  }
});

router.post('/rates/verify', async (req, res) => {
  const hotelId = (req.hotelId || req.auth?.hotelId);
  try {
    const { startDate, endDate, channelId } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'startDate and endDate are required' });
    }
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId, req.scopedSupabase);
    const fetchedRatesRes = await aiosellService.fetchRates(startDate, endDate, hotelConfig);
    const fetchedUpdates = fetchedRatesRes?.updates || (Array.isArray(fetchedRatesRes) ? fetchedRatesRes : []);

    const supabase = req.scopedSupabase || getSupabase();
    const { data: restrictions } = await supabase
      .from('channel_inventory_restrictions')
      .select('date, room_category_id, channel_rate, base_rate')
      .eq('hotel_id', hotelId)
      .gte('date', startDate)
      .lte('date', endDate);

    const { data: mappings } = await supabase
      .from('channel_rate_mappings')
      .select('room_category_id, external_room_code, external_rate_plan_code')
      .eq('hotel_id', hotelId)
      .eq('status', 'mapped');

    res.json({
      success: true,
      hotelCode: hotelConfig.hotelCode,
      dateRange: `${startDate} to ${endDate}`,
      fetchedUpdatesCount: fetchedUpdates.length,
      fetchedRates: fetchedUpdates,
      localRestrictionsCount: (restrictions || []).length,
      mappingsCount: (mappings || []).length,
      requestId: req.requestId
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'VERIFY_FAILED',
        message: err.message || 'Rate verification failed'
      },
      requestId: req.requestId
    });
  }
});

router.post('/rates/fetch', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId, req.scopedSupabase);

    const result = await aiosellService.fetchRates(startDate, endDate, hotelConfig);
    const updates = result?.updates || (Array.isArray(result) ? result : []);
    const count = updates.length;

    res.json({
      success: true,
      hotelCode: hotelConfig.hotelCode,
      count,
      message: count === 0 ? 'No rate data returned for the selected date range.' : undefined,
      result,
      requestId: req.requestId
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'RATE_FETCH_FAILED',
        message: err.message || 'Failed to fetch rates from channel provider',
        stage: 'aiosell'
      },
      code: err.code || 'RATE_FETCH_FAILED',
      message: err.message || 'Failed to fetch rates',
      requestId: req.requestId
    });
  }
});

router.post('/inventory-restrictions/push', async (req, res) => {
  try {
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId, req.scopedSupabase);
    const result = await aiosellService.pushInventoryRestrictions(req.body, hotelConfig);
    await logSync(hotelId, 'INVENTORY_RESTRICTION_PUSH', 'outbound', 'success', 'Restrictions pushed');
    res.json({ success: true, result });
  } catch (err) {
    await logSync((req.hotelId || req.auth?.hotelId), 'INVENTORY_RESTRICTION_PUSH', 'outbound', 'failure', 'Push failed', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message, code: err.code || 'API_ERROR', requestId: req.requestId });
  }
});

router.post('/rate-restrictions/push', async (req, res) => {
  try {
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId, req.scopedSupabase);
    const result = await aiosellService.pushRateRestrictions(req.body, hotelConfig);
    await logSync(hotelId, 'RATE_RESTRICTION_PUSH', 'outbound', 'success', 'Restrictions pushed');
    res.json({ success: true, result });
  } catch (err) {
    await logSync((req.hotelId || req.auth?.hotelId), 'RATE_RESTRICTION_PUSH', 'outbound', 'failure', 'Push failed', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message, code: err.code || 'API_ERROR', requestId: req.requestId });
  }
});

router.post('/reservations/fetch', async (req, res) => {
  try {
    const { startDate, endDate, channelId } = req.body;
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId, req.scopedSupabase);
    
    // 1. Fetch raw reservations from provider
    const result = await aiosellService.fetchReservations(startDate, endDate, hotelConfig);
    
    let reservationsArray = [];
    if (Array.isArray(result)) {
      reservationsArray = result;
    } else if (result && Array.isArray(result.data)) {
      reservationsArray = result.data;
    } else if (result && Array.isArray(result.reservations)) {
      reservationsArray = result.reservations;
    }
    
    // 2. Unify processing logic for each fetched reservation
    if (reservationsArray.length > 0) {
      const processed = [];
      const errors = [];
      const stats = { imported: 0, updated: 0, cancelled: 0, mapping_required: 0, failed: 0, skipped: 0 };
      
      for (const rawRes of reservationsArray) {
        try {
          const payload = parseWebhookPayload({ ...rawRes, action: 'book', hotelCode: hotelConfig.hotelCode });
          const resResult = await processAiosellReservation(payload, hotelId);
          processed.push(resResult);
          if (stats[resResult.status] !== undefined) {
            stats[resResult.status]++;
          }
        } catch (err) {
          errors.push(err.message);
          stats.failed++;
        }
      }
      
      await logSync(hotelId, 'RESERVATION_FETCH', 'inbound', 'success', `Fetched ${reservationsArray.length} reservations`, { processed, errors, stats }, null, channelId);
      res.json({ success: true, fetched: reservationsArray.length, stats, errors, requestId: req.requestId });
    } else {
      await logSync(hotelId, 'RESERVATION_FETCH', 'inbound', 'success', 'No reservations returned', result, null, channelId);
      res.json({ success: true, processed: 0, errors: [], rawResult: result, stats: { imported: 0, updated: 0, cancelled: 0, mapping_required: 0, failed: 0, skipped: 0 }, requestId: req.requestId });
    }
  } catch (err) {
    await logSync((req.hotelId || req.auth?.hotelId), 'RESERVATION_FETCH', 'inbound', 'failure', 'Fetch failed', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message, code: err.code || 'API_ERROR', requestId: req.requestId });
  }
});

router.post('/reservation/no-show', async (req, res) => {
  try {
    const { bookingId } = req.body;
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId, req.scopedSupabase);
    const result = await aiosellService.markNoShow(bookingId, hotelConfig);
    res.json({ success: true, result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message, code: err.code || 'API_ERROR', requestId: req.requestId });
  }
});

router.post('/channel-multiplier', async (req, res) => {
  try {
    const hotelId = (req.hotelId || req.auth?.hotelId);
    const hotelConfig = await getHotelAiosellConfig(hotelId, req.requestId, req.scopedSupabase);
    const result = await aiosellService.channelMultiplier(req.body, hotelConfig);
    res.json({ success: true, result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message, code: err.code || 'API_ERROR', requestId: req.requestId });
  }
});

export default router;
