import { supabaseServiceRole as supabase } from '../supabaseClient.js';
import * as aiosellService from './aiosellService.js';
import { getChannelProviderConfig } from './providerConfig.js';
import { calculateAuthoritativeInventory } from '../routes/aiosell.js';

/**
 * Deterministic UTC-based date list generator.
 * Eliminates browser/server local timezone drift.
 */
export const getCleanDateList = (startDateStr, endDateStr) => {
  if (!startDateStr || !endDateStr) return [];
  const [sY, sM, sD] = startDateStr.split('-').map(Number);
  const [eY, eM, eD] = endDateStr.split('-').map(Number);
  if (!sY || !sM || !sD || !eY || !eM || !eD) return [];

  const cur = new Date(Date.UTC(sY, sM - 1, sD));
  const end = new Date(Date.UTC(eY, eM - 1, eD));
  const dates = [];

  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
};

// In-flight sync mutex to prevent duplicate concurrent pushes & coalesce rapid events
const inFlightOperations = new Map();
const pendingCoalescedEvents = new Map();

/**
 * Resolves active room and rate mappings for a hotel.
 * Integrates external provider catalogue to ensure all active rate plans
 * (single, double, triple, quad, penta) are accounted for, while filtering
 * out any orphaned or dummy room codes.
 */
export const resolveAuthoritativeMappings = async (hotelId, hotelConfig, channelId = null) => {
  // 1. Query Hotel Categories
  const { data: allCategories, error: catError } = await supabase
    .from('room_categories')
    .select('id, name, default_tariff')
    .eq('hotel_id', hotelId)
    .eq('is_active', true);

  if (catError) {
    console.error('[ChannelSyncEngine] Error querying room categories:', catError);
  }

  // 2. Query Channel Rate Mappings
  let mappingQuery = supabase
    .from('channel_rate_mappings')
    .select('id, room_category_id, rate_plan_id, external_room_code, external_rate_plan_code, channel_connection_id, status, is_active')
    .eq('hotel_id', hotelId)
    .eq('status', 'mapped');

  if (channelId) {
    mappingQuery = mappingQuery.or(`channel_connection_id.eq.${channelId},channel_connection_id.is.null`);
  }

  const { data: dbMappings, error: mapError } = await mappingQuery;
  if (mapError) {
    console.error('[ChannelSyncEngine] Error querying mappings:', mapError);
  }

  // 3. Fetch external catalogue from provider
  let externalCatalogue = { rooms: [], ratePlans: [] };
  try {
    const propDetails = await aiosellService.getPropertyMapping(hotelConfig);
    if (propDetails) {
      externalCatalogue.rooms = Array.isArray(propDetails.rooms) ? propDetails.rooms : [];
      externalCatalogue.ratePlans = Array.isArray(propDetails.ratePlans) ? propDetails.ratePlans : [];
    }
  } catch (err) {
    console.warn('[ChannelSyncEngine] Upstream catalogue fetch warning (non-blocking):', err.message);
  }

  const validExternalRoomCodes = new Set(externalCatalogue.rooms.map(r => r.room_id || r.roomId || r.roomCode));

  // 4. Resolve category -> external room code map
  const categoryToRoomCode = {};
  const roomCodeToCategory = {};

  (dbMappings || []).forEach(m => {
    if (!m.room_category_id || !m.external_room_code) return;
    // If catalogue rooms are known, prefer mappings that match the catalogue
    if (validExternalRoomCodes.size > 0 && !validExternalRoomCodes.has(m.external_room_code)) {
      return; // Skip invalid room codes (e.g. ROOM-CODE-101)
    }
    categoryToRoomCode[m.room_category_id] = m.external_room_code;
    roomCodeToCategory[m.external_room_code] = m.room_category_id;
  });

  // Fallback: if a category still has no mapping and validExternalRoomCodes has exact name match
  (allCategories || []).forEach(c => {
    if (!categoryToRoomCode[c.id] && validExternalRoomCodes.size > 0) {
      const normalized = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = externalCatalogue.rooms.find(r => {
        const rName = (r.room_name || r.roomName || r.room_id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return rName === normalized || r.room_id === normalized || normalized.includes(r.room_id);
      });
      if (match) {
        const code = match.room_id || match.roomId;
        categoryToRoomCode[c.id] = code;
        roomCodeToCategory[code] = c.id;
      }
    }
  });

  // 5. Resolve effective roomCode + rateplanCode pairs
  const effectivePairs = [];
  const seenPairKeys = new Set();

  for (const catId of Object.keys(categoryToRoomCode)) {
    const extRoomCode = categoryToRoomCode[catId];
    const roomPrefix = `${extRoomCode.toLowerCase()}-`;

    // A. Explicit DB mapped rate plans for this room
    const dbPlansForRoom = (dbMappings || []).filter(m => 
      m.room_category_id === catId && 
      m.external_rate_plan_code &&
      (m.external_room_code === extRoomCode || m.external_rate_plan_code.toLowerCase().startsWith(roomPrefix))
    );

    for (const rp of dbPlansForRoom) {
      const pairKey = `${catId}|${extRoomCode}|${rp.external_rate_plan_code}`;
      if (!seenPairKeys.has(pairKey)) {
        seenPairKeys.add(pairKey);
        effectivePairs.push({
          room_category_id: catId,
          roomCode: extRoomCode,
          rateplanCode: rp.external_rate_plan_code,
          source: 'db'
        });
      }
    }

    // B. External catalogue rate plans for this room (ensures S, D, T, Q, P are all covered)
    const catPlansForRoom = externalCatalogue.ratePlans.filter(erp => 
      erp.room_id === extRoomCode ||
      erp.rate_plan_id?.toLowerCase().startsWith(roomPrefix)
    );

    for (const erp of catPlansForRoom) {
      const pairKey = `${catId}|${extRoomCode}|${erp.rate_plan_id}`;
      if (!seenPairKeys.has(pairKey)) {
        seenPairKeys.add(pairKey);
        effectivePairs.push({
          room_category_id: catId,
          roomCode: extRoomCode,
          rateplanCode: erp.rate_plan_id,
          source: 'catalogue'
        });
      }
    }
  }

  return {
    categories: allCategories || [],
    categoryToRoomCode,
    roomCodeToCategory,
    effectivePairs,
    externalCatalogue
  };
};

/**
 * Log synchronization operations safely without secrets
 */
export const logSyncSafely = async ({
  hotelId,
  channelConnectionId = null,
  logType,
  direction = 'outbound',
  status,
  message,
  errorDetail = null,
  dateRange = null,
  roomCategoryId = null,
  recordsAttempted = 0,
  recordsVerified = 0
}) => {
  try {
    await supabase.from('channel_sync_logs').insert({
      hotel_id: hotelId,
      channel_connection_id: channelConnectionId,
      log_type: logType,
      direction,
      status,
      message,
      error_detail: errorDetail ? (typeof errorDetail === 'object' ? JSON.stringify(errorDetail) : String(errorDetail)) : null,
      date_range: dateRange,
      room_category_id: roomCategoryId,
      retry_status: 'not_retried',
      retry_count: 0
    });
  } catch (err) {
    console.error('[ChannelSyncEngine] Failed to write sync log:', err.message);
  }
};

/**
 * Synchronize Rates to Channel Manager
 */
export const syncRates = async ({
  hotelId,
  channelId = null,
  startDate,
  endDate,
  roomCategoryIds = null,
  ratePlanIds = null,
  skipVerification = false,
  triggeredBy = 'manual'
}) => {
  if (!hotelId) throw new Error('Hotel ID is required for syncRates');
  if (!startDate || !endDate) throw new Error('startDate and endDate are required');

  const syncKey = `RATES:${hotelId}:${startDate}:${endDate}:${roomCategoryIds ? roomCategoryIds.sort().join(',') : 'ALL'}`;
  if (inFlightOperations.has(syncKey)) {
    console.log(`[ChannelSyncEngine] Coalescing rate sync request for ${syncKey}`);
    pendingCoalescedEvents.set(syncKey, { hotelId, channelId, startDate, endDate, roomCategoryIds, ratePlanIds, triggeredBy });
    return inFlightOperations.get(syncKey);
  }

  const operationPromise = (async () => {
    const startTime = Date.now();
    const hotelConfig = await getChannelProviderConfig(hotelId);

    // 1. Resolve mappings
    const mappings = await resolveAuthoritativeMappings(hotelId, hotelConfig, channelId);
    let pairsToSync = mappings.effectivePairs;

    if (roomCategoryIds && roomCategoryIds.length > 0) {
      pairsToSync = pairsToSync.filter(p => roomCategoryIds.includes(p.room_category_id));
    }

    if (pairsToSync.length === 0) {
      const err = new Error('No active room and rate plan mappings found for this channel.');
      err.status = 422;
      err.code = 'RATE_MAPPING_REQUIRED';
      throw err;
    }

    // 2. Query inventory restrictions overrides for rates
    const categoryIds = [...new Set(pairsToSync.map(p => p.room_category_id))];
    const { data: restrictions } = await supabase
      .from('channel_inventory_restrictions')
      .select('date, room_category_id, channel_rate, base_rate')
      .eq('hotel_id', hotelId)
      .in('room_category_id', categoryIds)
      .gte('date', startDate)
      .lte('date', endDate);

    // 3. Build updates payload
    const dates = getCleanDateList(startDate, endDate);
    let totalRateEntriesCount = 0;

    const updates = dates.map(date => {
      const rates = [];
      const seenCombos = new Set();

      for (const pair of pairsToSync) {
        const comboKey = `${pair.roomCode}|${pair.rateplanCode}`;
        if (seenCombos.has(comboKey)) continue;
        seenCombos.add(comboKey);

        const restriction = (restrictions || []).find(r => r.date === date && r.room_category_id === pair.room_category_id);
        const category = mappings.categories.find(c => c.id === pair.room_category_id);

        let rateValue = category ? (category.default_tariff || 0) : 0;
        if (restriction && Number(restriction.channel_rate) > 0) {
          rateValue = restriction.channel_rate;
        } else if (restriction && Number(restriction.base_rate) > 0) {
          rateValue = restriction.base_rate;
        }

        const numericRate = Math.round(Number(rateValue));
        if (!numericRate || isNaN(numericRate) || numericRate <= 0) {
          continue;
        }

        rates.push({
          roomCode: pair.roomCode,
          rateplanCode: pair.rateplanCode,
          rate: numericRate
        });
        totalRateEntriesCount++;
      }

      return {
        startDate: date,
        endDate: date,
        rates
      };
    }).filter(u => u.rates.length > 0);

    if (updates.length === 0) {
      const err = new Error('No valid positive rate updates found to push.');
      err.status = 422;
      err.code = 'RATE_VALUES_MISSING';
      throw err;
    }

    const payload = {
      hotelCode: hotelConfig.hotelCode,
      updates
    };

    // 4. Push to external channel manager
    const pushResult = await aiosellService.pushRates(payload, hotelConfig);
    if (!pushResult || pushResult.success === false) {
      const errorMsg = pushResult?.message || pushResult?.error || 'External channel manager rejected rate update.';
      const err = new Error(errorMsg);
      err.status = 502;
      err.code = 'RATE_PUSH_REJECTED';
      throw err;
    }

    // 5. Live Post-Push Fetch Verification
    let verified = true;
    let verifiedCount = 0;
    const discrepancies = [];

    if (!skipVerification) {
      try {
        await new Promise(r => setTimeout(r, 1200));
        const fetched = await aiosellService.fetchRates(startDate, endDate, hotelConfig);
        const fetchedUpdates = fetched?.updates || (Array.isArray(fetched) ? fetched : []);

        for (const expectedUpdate of updates) {
          const matchingFetched = fetchedUpdates.find(u => u.startDate === expectedUpdate.startDate);
          for (const expectedRate of expectedUpdate.rates) {
            const match = matchingFetched?.rates?.find(
              r => r.roomCode === expectedRate.roomCode && r.rateplanCode === expectedRate.rateplanCode
            );
            if (match && Number(match.rate) === Number(expectedRate.rate)) {
              verifiedCount++;
            } else {
              verified = false;
              discrepancies.push({
                date: expectedUpdate.startDate,
                roomCode: expectedRate.roomCode,
                rateplanCode: expectedRate.rateplanCode,
                expected: expectedRate.rate,
                actual: match ? match.rate : 'missing'
              });
            }
          }
        }
      } catch (vErr) {
        console.warn('[ChannelSyncEngine] Rate verification fetch warning:', vErr.message);
        verified = false;
        discrepancies.push({ error: 'Live verification query failed: ' + vErr.message });
      }
    }

    const durationMs = Date.now() - startTime;
    const syncStatus = verified ? 'VERIFIED' : (discrepancies.length > 0 ? 'PARTIAL' : 'SUCCESS');
    const syncMessage = verified
      ? `Rates synchronized and verified across ${updates.length} dates (${verifiedCount} rate plans confirmed)`
      : `Rates accepted by channel manager, but verification detected ${discrepancies.length} discrepancies`;

    await logSyncSafely({
      hotelId,
      channelConnectionId: channelId,
      logType: 'RATE_PUSH',
      status: syncStatus,
      message: syncMessage,
      errorDetail: discrepancies.length > 0 ? discrepancies.slice(0, 5) : null,
      dateRange: `${startDate} to ${endDate}`,
      recordsAttempted: totalRateEntriesCount,
      recordsVerified: verifiedCount
    });

    return {
      success: true,
      verified,
      status: syncStatus,
      message: syncMessage,
      operation: 'rate_push',
      hotelCode: hotelConfig.hotelCode,
      dateRange: `${startDate} to ${endDate}`,
      datesCount: updates.length,
      recordsAttempted: totalRateEntriesCount,
      recordsVerified: verifiedCount,
      discrepancies: discrepancies.length > 0 ? discrepancies.slice(0, 10) : undefined,
      durationMs,
      triggeredBy
    };
  })();

  inFlightOperations.set(syncKey, operationPromise);

  try {
    const res = await operationPromise;
    return res;
  } finally {
    inFlightOperations.delete(syncKey);
    // If an event was coalesced while in-flight, execute one follow-up run with latest state
    if (pendingCoalescedEvents.has(syncKey)) {
      const followUp = pendingCoalescedEvents.get(syncKey);
      pendingCoalescedEvents.delete(syncKey);
      syncRates(followUp).catch(err => console.error('[ChannelSyncEngine] Error in coalesced follow-up syncRates:', err));
    }
  }
};

/**
 * Synchronize Inventory to Channel Manager
 */
export const syncInventory = async ({
  hotelId,
  channelId = null,
  startDate,
  endDate,
  roomCategoryIds = null,
  skipVerification = false,
  triggeredBy = 'manual'
}) => {
  if (!hotelId) throw new Error('Hotel ID is required for syncInventory');
  if (!startDate || !endDate) throw new Error('startDate and endDate are required');

  const syncKey = `INV:${hotelId}:${startDate}:${endDate}:${roomCategoryIds ? roomCategoryIds.sort().join(',') : 'ALL'}`;
  if (inFlightOperations.has(syncKey)) {
    console.log(`[ChannelSyncEngine] Coalescing inventory sync request for ${syncKey}`);
    pendingCoalescedEvents.set(syncKey, { hotelId, channelId, startDate, endDate, roomCategoryIds, triggeredBy });
    return inFlightOperations.get(syncKey);
  }

  const operationPromise = (async () => {
    const startTime = Date.now();
    const hotelConfig = await getChannelProviderConfig(hotelId);

    // 1. Resolve mappings
    const mappings = await resolveAuthoritativeMappings(hotelId, hotelConfig, channelId);
    const categoryToExtCode = mappings.categoryToRoomCode;

    const targetCategoryIds = roomCategoryIds && roomCategoryIds.length > 0
      ? roomCategoryIds.filter(id => categoryToExtCode[id])
      : Object.keys(categoryToExtCode);

    if (targetCategoryIds.length === 0) {
      const err = new Error('No active room mappings found for this channel.');
      err.status = 422;
      err.code = 'ROOM_MAPPING_REQUIRED';
      throw err;
    }

    // 2. Compute Authoritative Inventory Matrix
    const { matrix } = await calculateAuthoritativeInventory(hotelId, startDate, endDate, targetCategoryIds);

    // 3. Build updates payload
    const dates = getCleanDateList(startDate, endDate);
    const updates = [];

    for (const date of dates) {
      const rooms = [];
      const uniqueRoomCodes = new Set();
      const dateEntries = matrix.filter(m => m.date === date);

      for (const entry of dateEntries) {
        const roomCode = categoryToExtCode[entry.room_category_id];
        if (!roomCode || uniqueRoomCodes.has(roomCode)) continue;
        uniqueRoomCodes.add(roomCode);

        rooms.push({
          roomCode,
          available: Math.max(0, Math.round(Number(entry.available) || 0))
        });
      }

      if (rooms.length > 0) {
        updates.push({
          startDate: date,
          endDate: date,
          rooms
        });
      }
    }

    if (updates.length === 0) {
      const err = new Error('No valid inventory updates constructed for the date range.');
      err.status = 422;
      err.code = 'EMPTY_INVENTORY_UPDATES';
      throw err;
    }

    const payload = {
      hotelCode: hotelConfig.hotelCode,
      updates
    };

    // 4. Push to external channel manager
    const pushResult = await aiosellService.pushInventory(payload, hotelConfig);
    if (!pushResult || pushResult.success === false) {
      const errorMsg = pushResult?.message || pushResult?.error || 'External channel manager rejected inventory update.';
      const err = new Error(errorMsg);
      err.status = 502;
      err.code = 'INVENTORY_PUSH_REJECTED';
      throw err;
    }

    // 5. Live Post-Push Fetch Verification
    let verified = true;
    let verifiedRoomsCount = 0;
    const discrepancies = [];

    if (!skipVerification) {
      try {
        await new Promise(r => setTimeout(r, 1200));
        const fetched = await aiosellService.fetchInventory(startDate, endDate, hotelConfig);
        const fetchedUpdates = fetched?.updates || (Array.isArray(fetched) ? fetched : []);

        for (const expectedUpdate of updates) {
          const matchingFetched = fetchedUpdates.find(u => u.startDate === expectedUpdate.startDate);
          for (const expectedRoom of expectedUpdate.rooms) {
            const match = matchingFetched?.rooms?.find(r => r.roomCode === expectedRoom.roomCode);
            if (match && Number(match.available) === Number(expectedRoom.available)) {
              verifiedRoomsCount++;
            } else {
              verified = false;
              discrepancies.push({
                date: expectedUpdate.startDate,
                roomCode: expectedRoom.roomCode,
                expected: expectedRoom.available,
                actual: match ? Number(match.available) : null
              });
            }
          }
        }
      } catch (vErr) {
        console.warn('[ChannelSyncEngine] Inventory verification fetch warning:', vErr.message);
        verified = false;
        discrepancies.push({ error: 'Live verification query failed: ' + vErr.message });
      }
    }

    const durationMs = Date.now() - startTime;
    const syncStatus = verified ? 'VERIFIED' : (discrepancies.length > 0 ? 'PARTIAL' : 'SUCCESS');
    const safeLogMsg = `Inventory synchronized (${updates.length} dates, ${verifiedRoomsCount} room dates verified)`;

    await logSyncSafely({
      hotelId,
      channelConnectionId: channelId,
      logType: 'INVENTORY_PUSH',
      status: syncStatus,
      message: safeLogMsg,
      errorDetail: discrepancies.length > 0 ? discrepancies.slice(0, 5) : null,
      dateRange: `${startDate} to ${endDate}`,
      recordsAttempted: updates.reduce((acc, u) => acc + u.rooms.length, 0),
      recordsVerified: verifiedRoomsCount
    });

    return {
      success: true,
      verified,
      status: syncStatus,
      message: safeLogMsg,
      operation: 'inventory_push',
      hotelCode: hotelConfig.hotelCode,
      dateRange: `${startDate} to ${endDate}`,
      datesCount: updates.length,
      recordsAttempted: updates.reduce((acc, u) => acc + u.rooms.length, 0),
      recordsVerified: verifiedRoomsCount,
      discrepancies: discrepancies.length > 0 ? discrepancies.slice(0, 10) : undefined,
      durationMs,
      triggeredBy
    };
  })();

  inFlightOperations.set(syncKey, operationPromise);

  try {
    const res = await operationPromise;
    return res;
  } finally {
    inFlightOperations.delete(syncKey);
    if (pendingCoalescedEvents.has(syncKey)) {
      const followUp = pendingCoalescedEvents.get(syncKey);
      pendingCoalescedEvents.delete(syncKey);
      syncInventory(followUp).catch(err => console.error('[ChannelSyncEngine] Error in coalesced follow-up syncInventory:', err));
    }
  }
};

/**
 * Central event handler for PMS events.
 * Dispatches targeted synchronization based on the affected entity and dates.
 */
export const handlePmsEvent = async (hotelId, eventType, details = {}) => {
  if (!hotelId) throw new Error('Hotel ID is required for handlePmsEvent');

  const {
    startDate,
    endDate,
    roomCategoryId,
    roomCategoryIds = [],
    ratePlanIds = []
  } = details;

  const targetCategoryIds = [
    ...(roomCategoryId ? [roomCategoryId] : []),
    ...(Array.isArray(roomCategoryIds) ? roomCategoryIds : [])
  ];

  const sDate = startDate || new Date().toISOString().split('T')[0];
  const eDate = endDate || sDate;

  console.log(`[ChannelSyncEngine] Handling PMS event ${eventType} for hotel ${hotelId} (${sDate} to ${eDate})`);

  switch (eventType) {
    case 'RATE_CHANGED': {
      return await syncRates({
        hotelId,
        startDate: sDate,
        endDate: eDate,
        roomCategoryIds: targetCategoryIds.length > 0 ? targetCategoryIds : null,
        ratePlanIds: ratePlanIds.length > 0 ? ratePlanIds : null,
        triggeredBy: eventType
      });
    }

    case 'AVAILABILITY_CHANGED':
    case 'INVENTORY_CHANGED':
    case 'RESERVATION_CREATED':
    case 'RESERVATION_MODIFIED':
    case 'RESERVATION_CANCELLED':
    case 'RESERVATION_CHANGED':
    case 'CHECK_IN':
    case 'CHECK_OUT':
    case 'ROOM_TRANSFER':
    case 'STAY_EXTENDED':
    case 'ROOM_BLOCKED':
    case 'ROOM_UNBLOCKED': {
      return await syncInventory({
        hotelId,
        startDate: sDate,
        endDate: eDate,
        roomCategoryIds: targetCategoryIds.length > 0 ? targetCategoryIds : null,
        triggeredBy: eventType
      });
    }

    default:
      console.warn(`[ChannelSyncEngine] Unhandled PMS event type: ${eventType}`);
      return { success: true, message: `Event ${eventType} recorded.` };
  }
};
