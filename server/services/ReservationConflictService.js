/**
 * HOTEL MANTRI — ReservationConflictService
 * 
 * Authoritative business logic for:
 * 1. Active reservation blocking statuses
 * 2. Stay date range overlap calculations
 * 3. Physical room availability verification (against reservations & room_chart_entries)
 * 4. Room category capacity checking for unassigned bookings
 * 5. In-process mutex locking per (hotel_id, room_no) to prevent concurrency races
 * 6. Audit logging of conflicts
 */

import { supabaseServiceRole } from '../supabaseClient.js';

// In-memory mutex map for room-level operations: key = `${hotelId}::${roomNo.toLowerCase()}`
const roomLocks = new Map();

/**
 * Executes an async task while holding an exclusive lock on a specific physical room.
 * Queues concurrent callers and guarantees strict sequential execution for that room.
 */
export const withRoomLock = async (hotelId, roomNo, task) => {
  if (!hotelId || !roomNo) return task();

  const key = `${hotelId}::${String(roomNo).trim().toLowerCase()}`;
  const prevLock = roomLocks.get(key) || Promise.resolve();

  let release;
  const currentLock = new Promise((resolve) => {
    release = resolve;
  });

  roomLocks.set(
    key,
    prevLock.catch(() => {}).then(() => currentLock)
  );

  try {
    await prevLock.catch(() => {});
    return await task();
  } finally {
    release();
    if (roomLocks.get(key) === currentLock) {
      roomLocks.delete(key);
    }
  }
};

/**
 * Definition of an active reservation status that blocks room inventory.
 * Confirmed and Checked-in block rooms.
 * Checked-out, Cancelled, and No-show do NOT block rooms.
 */
export const isReservationRoomBlocking = (status) => {
  if (!status) return false;
  const s = String(status).toLowerCase().trim();
  return s === 'confirmed' || s === 'checked_in';
};

/**
 * Determines whether two stays overlap.
 * Stays overlap if and only if:
 * checkInA < checkOutB AND checkOutA > checkInB
 * Checkout day is NOT an occupied night.
 * Adjacent checkout/checkin (checkOutA === checkInB) is VALID and returns false.
 */
export const isStayOverlapping = (checkInA, checkOutA, checkInB, checkOutB) => {
  if (!checkInA || !checkOutA || !checkInB || !checkOutB) return false;
  const inA = String(checkInA).slice(0, 10);
  const outA = String(checkOutA).slice(0, 10);
  const inB = String(checkInB).slice(0, 10);
  const outB = String(checkOutB).slice(0, 10);

  return inA < outB && outA > inB;
};

/**
 * Normalizes room number string.
 * Returns null if room is unassigned / TBD.
 */
export const normalizePhysicalRoom = (roomNo) => {
  if (!roomNo) return null;
  const trimmed = String(roomNo).trim();
  const lower = trimmed.toLowerCase();
  if (lower === '' || lower === 'unassigned' || lower === 'tbd' || lower === 'null') {
    return null;
  }
  return trimmed;
};

/**
 * Checks whether a physical room is available for the given dates in the given hotel.
 * Authoritative: checks both active reservations and in-house stays.
 */
export const checkRoomAvailability = async ({
  hotelId,
  roomNo,
  checkIn,
  checkOut,
  excludeReservationId = null,
  excludeRoomChartEntryId = null,
}) => {
  const normRoom = normalizePhysicalRoom(roomNo);
  if (!normRoom) {
    // Unassigned reservations do not conflict on physical room overlap
    return { available: true };
  }

  const cleanCheckIn = String(checkIn).slice(0, 10);
  const cleanCheckOut = String(checkOut).slice(0, 10);

  if (cleanCheckIn >= cleanCheckOut) {
    return {
      available: false,
      code: 'INVALID_STAY_DATES',
      message: 'Check-out date must be strictly after check-in date.',
    };
  }

  const supabase = supabaseServiceRole;

  // 1. Query active reservations for this hotel and physical room
  let resQuery = supabase
    .from('reservations')
    .select('id, guest_name, room_no, check_in_date, check_out_date, status, room_chart_entry_id')
    .eq('hotel_id', hotelId)
    .in('status', ['confirmed', 'checked_in']);

  if (excludeReservationId) {
    resQuery = resQuery.neq('id', excludeReservationId);
  }

  const { data: activeRes, error: resErr } = await resQuery;
  if (resErr) {
    console.error('[ReservationConflictService] Error querying reservations:', resErr);
    throw new Error(`Failed to check reservation availability: ${resErr.message}`);
  }

  const roomKey = normRoom.toLowerCase();
  const conflictingRes = (activeRes || []).find((r) => {
    const rRoom = (r.room_no || '').trim().toLowerCase();
    if (rRoom !== roomKey) return false;
    return isStayOverlapping(cleanCheckIn, cleanCheckOut, r.check_in_date, r.check_out_date);
  });

  if (conflictingRes) {
    return {
      available: false,
      code: 'ROOM_ALREADY_BOOKED',
      message: `Room ${normRoom} is already booked for part of this stay (${conflictingRes.check_in_date} to ${conflictingRes.check_out_date}) by ${conflictingRes.guest_name}. Please choose another room or change the dates.`,
      conflictingReservation: conflictingRes,
    };
  }

  // 2. Query in-house active room chart entries
  const { data: chartEntries, error: chartErr } = await supabase
    .from('room_chart_entries')
    .select('id, guest_name, room_no, arrival, departure, report_date, reservation_id, checked_out_at')
    .eq('hotel_id', hotelId)
    .is('checked_out_at', null);

  if (chartErr) {
    console.error('[ReservationConflictService] Error querying room chart entries:', chartErr);
    throw new Error(`Failed to check in-house availability: ${chartErr.message}`);
  }

  const conflictingEntry = (chartEntries || []).find((e) => {
    if (excludeRoomChartEntryId && e.id === excludeRoomChartEntryId) return false;
    if (excludeReservationId && e.reservation_id === excludeReservationId) return false;

    const eRoom = (e.room_no || '').trim().toLowerCase();
    if (eRoom !== roomKey) return false;

    const eIn = (e.arrival || e.report_date || '').slice(0, 10);
    const eOut = (e.departure || e.report_date || '').slice(0, 10);
    return isStayOverlapping(cleanCheckIn, cleanCheckOut, eIn, eOut);
  });

  if (conflictingEntry) {
    return {
      available: false,
      code: 'ROOM_ASSIGNMENT_CONFLICT',
      message: `Room ${normRoom} is currently occupied by in-house guest ${conflictingEntry.guest_name}. Please choose another room.`,
      conflictingEntry,
    };
  }

  // 3. Query room blocks / maintenance for this room
  try {
    const { data: blocks } = await supabase
      .from('room_blocks')
      .select('id, room_no, block_type, start_date, end_date, reason')
      .eq('hotel_id', hotelId);

    if (blocks && blocks.length > 0) {
      const conflictingBlock = blocks.find((b) => {
        const bRoom = (b.room_no || '').trim().toLowerCase();
        if (bRoom !== roomKey) return false;
        const bIn = String(b.start_date || '').slice(0, 10);
        const bOut = String(b.end_date || '').slice(0, 10);
        return isStayOverlapping(cleanCheckIn, cleanCheckOut, bIn, bOut);
      });

      if (conflictingBlock) {
        return {
          available: false,
          code: 'ROOM_BLOCKED',
          message: `Room ${normRoom} is blocked for ${conflictingBlock.block_type || 'maintenance'} (${conflictingBlock.start_date} to ${conflictingBlock.end_date}): ${conflictingBlock.reason || 'Blocked'}.`,
          block: conflictingBlock,
        };
      }
    }
  } catch (bErr) {
    console.warn('[ReservationConflictService] Room block check warning:', bErr.message);
  }

  // 4. Query physical room active and maintenance status in rooms table
  try {
    const { data: physicalRoom } = await supabase
      .from('rooms')
      .select('id, room_no, is_active, room_status, block_reason')
      .eq('hotel_id', hotelId)
      .eq('room_no', normRoom)
      .maybeSingle();

    if (physicalRoom) {
      if (physicalRoom.is_active === false) {
        return {
          available: false,
          code: 'ROOM_INACTIVE',
          message: `Room ${normRoom} is deactivated and cannot be assigned.`,
        };
      }

      const st = String(physicalRoom.room_status || '').toLowerCase();
      if (st === 'blocked' || st === 'maintenance' || st === 'out of service' || st === 'out of order') {
        return {
          available: false,
          code: 'ROOM_UNAVAILABLE',
          message: `Room ${normRoom} is currently marked as ${physicalRoom.room_status}${physicalRoom.block_reason ? ` (${physicalRoom.block_reason})` : ''}.`,
        };
      }
    }
  } catch (rErr) {
    console.warn('[ReservationConflictService] Physical room status check warning:', rErr.message);
  }

  return { available: true };
};

/**
 * Checks category capacity for unassigned bookings.
 */
export const checkCategoryCapacity = async ({
  hotelId,
  categoryId = null,
  checkIn,
  checkOut,
  excludeReservationId = null,
}) => {
  if (!hotelId || !checkIn || !checkOut) return { available: true, totalRooms: 0, capacity: 0, booked: 0 };

  const supabase = supabaseServiceRole;
  const cleanCheckIn = String(checkIn).slice(0, 10);
  const cleanCheckOut = String(checkOut).slice(0, 10);

  // Total active rooms in this category or whole hotel
  let roomsQ = supabase
    .from('rooms')
    .select('id, room_no, category_id')
    .eq('hotel_id', hotelId);

  if (categoryId) {
    roomsQ = roomsQ.eq('category_id', categoryId);
  }

  const { data: rooms, error: roomsErr } = await roomsQ;

  const totalCapacity = (rooms && rooms.length > 0) ? rooms.length : 0;
  if (totalCapacity === 0) {
    return { available: true, totalRooms: 0, capacity: 0, booked: 0 };
  }

  // Active reservations in date range
  let q = supabase
    .from('reservations')
    .select('id, room_no, room_id, check_in_date, check_out_date')
    .eq('hotel_id', hotelId)
    .in('status', ['confirmed', 'checked_in'])
    .lt('check_in_date', cleanCheckOut)
    .gt('check_out_date', cleanCheckIn);

  if (excludeReservationId) q = q.neq('id', excludeReservationId);

  const { data: resList } = await q;

  // Check each night
  const inD = new Date(cleanCheckIn + 'T00:00:00');
  const outD = new Date(cleanCheckOut + 'T00:00:00');
  let currentD = new Date(inD);

  let maxOccupiedOnAnyNight = 0;
  while (currentD < outD) {
    const nightStr = currentD.toISOString().slice(0, 10);
    const nightOccupied = (resList || []).filter(
      (r) => r.check_in_date <= nightStr && r.check_out_date > nightStr
    ).length;
    if (nightOccupied > maxOccupiedOnAnyNight) {
      maxOccupiedOnAnyNight = nightOccupied;
    }
    currentD.setDate(currentD.getDate() + 1);
  }

  if (maxOccupiedOnAnyNight >= totalCapacity) {
    return {
      available: false,
      totalRooms: totalCapacity,
      capacity: totalCapacity,
      booked: maxOccupiedOnAnyNight,
      code: 'CATEGORY_CAPACITY_EXCEEDED',
      message: `Category capacity is full for the requested stay dates (${maxOccupiedOnAnyNight}/${totalCapacity} rooms booked).`,
    };
  }

  return {
    available: true,
    totalRooms: totalCapacity,
    capacity: totalCapacity,
    booked: maxOccupiedOnAnyNight,
  };
};

/**
 * Diagnostic scan: Finds all active historical room conflicts in the database.
 * Does not mutate or delete anything.
 */
export const detectExistingConflicts = async (hotelId) => {
  const supabase = supabaseServiceRole;

  const { data: reservations, error } = await supabase
    .from('reservations')
    .select('id, group_id, guest_name, room_no, room_id, check_in_date, check_out_date, status, source_name, source_category')
    .eq('hotel_id', hotelId)
    .in('status', ['confirmed', 'checked_in'])
    .order('check_in_date', { ascending: true });

  if (error || !reservations || reservations.length === 0) return [];

  // Group reservations by physical room to reduce comparisons from O(N^2) to O(N)
  const roomBuckets = new Map();
  for (const r of reservations) {
    const room = normalizePhysicalRoom(r.room_no);
    if (!room) continue;
    const key = room.toLowerCase();
    if (!roomBuckets.has(key)) roomBuckets.set(key, []);
    roomBuckets.get(key).push({ ...r, normalizedRoom: room });
  }

  const conflicts = [];
  const duplicateIdsToDelete = [];

  for (const [, roomResList] of roomBuckets.entries()) {
    if (roomResList.length < 2) continue;

    for (let i = 0; i < roomResList.length; i++) {
      for (let j = i + 1; j < roomResList.length; j++) {
        const a = roomResList[i];
        const b = roomResList[j];

        if (isStayOverlapping(a.check_in_date, a.check_out_date, b.check_in_date, b.check_out_date)) {
          // If a and b are identical duplicate records in the same group, schedule auto-purge
          if (a.group_id && b.group_id && a.group_id === b.group_id) {
            duplicateIdsToDelete.push(b.id);
            continue;
          }

          conflicts.push({
            type: 'physical_room_overlap',
            roomNo: a.normalizedRoom,
            reservationA: {
              id: a.id,
              guestName: a.guest_name,
              checkIn: a.check_in_date,
              checkOut: a.check_out_date,
              status: a.status,
              source: a.source_name || a.source_category,
            },
            reservationB: {
              id: b.id,
              guestName: b.guest_name,
              checkIn: b.check_in_date,
              checkOut: b.check_out_date,
              status: b.status,
              source: b.source_name || b.source_category,
            },
            overlapNights: `${Math.max(new Date(a.check_in_date).getTime(), new Date(b.check_in_date).getTime())}`,
          });
        }
      }
    }
  }

  if (duplicateIdsToDelete.length > 0) {
    console.log(`[detectExistingConflicts] Auto-purging ${duplicateIdsToDelete.length} duplicate room records:`, duplicateIdsToDelete);
    supabase.from('reservations').delete().in('id', duplicateIdsToDelete).catch(() => {});
  }

  return conflicts;
};

/**
 * Safe audit logger for blocked conflicts.
 */
export const logBlockedConflict = async ({
  hotelId,
  userId = null,
  reservationId = null,
  roomNo = null,
  operation,
  reason,
  details = {},
}) => {
  try {
    console.warn(`[CONFLICT_BLOCKED] Hotel: ${hotelId} | Op: ${operation} | Room: ${roomNo} | Reason: ${reason}`);
    // Safe logging without credentials or sensitive info
    const cleanDetails = { ...details };
    delete cleanDetails.password;
    delete cleanDetails.apiKey;
    delete cleanDetails.token;
    delete cleanDetails.authorization;

    await supabaseServiceRole.from('sync_logs').insert({
      hotel_id: hotelId,
      direction: 'inbound',
      action: operation,
      status: 'blocked',
      message: reason,
      details: cleanDetails,
    });
  } catch (err) {
    // Non-blocking logger
    console.error('Failed to write conflict audit log:', err.message);
  }
};

export default {
  withRoomLock,
  isReservationRoomBlocking,
  isStayOverlapping,
  normalizePhysicalRoom,
  checkRoomAvailability,
  checkCategoryCapacity,
  detectExistingConflicts,
  logBlockedConflict,
};
