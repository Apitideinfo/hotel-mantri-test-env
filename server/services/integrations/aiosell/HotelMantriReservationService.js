import { supabaseServiceRole } from '../../../supabaseClient.js';
import dotenv from 'dotenv';
import { executeInventoryPush } from '../../../routes/aiosell.js';
import { checkRoomAvailability, normalizePhysicalRoom, withRoomLock } from '../../ReservationConflictService.js';
import { autoAssignPhysicalRoom, resolveHotelRoomCategory, isAutoAssignEnabled } from '../../RoomAssignmentService.js';
dotenv.config();

export const getSupabase = () => supabaseServiceRole;

/**
 * Finds an available physical room for a given category and date range.
 * If all physical rooms in the category are occupied, returns room_no: 'Unassigned'.
 */
export const findAvailablePhysicalRoom = async (hotelId, roomCategoryId, checkInDate, checkOutDate, excludeReservationId = null, excludeRoomIds = []) => {
  const supabase = getSupabase();
  if (!hotelId || !roomCategoryId || !checkInDate || !checkOutDate) {
    return { roomId: null, roomNo: 'Unassigned' };
  }

  try {
    // 1. Fetch active physical rooms in this category
    const { data: physicalRooms, error: roomsErr } = await supabase
      .from('rooms')
      .select('id, room_no, room_status, housekeeping_status, is_active')
      .eq('hotel_id', hotelId)
      .eq('category_id', roomCategoryId)
      .eq('is_active', true)
      .order('room_no', { ascending: true });

    if (roomsErr || !physicalRooms || physicalRooms.length === 0) {
      return { roomId: null, roomNo: 'Unassigned' };
    }

    const nonAssignable = new Set(['blocked', 'maintenance', 'out of service', 'out of order']);
    const eligibleRooms = physicalRooms.filter(r => !nonAssignable.has(String(r.room_status || '').toLowerCase()));

    const excludeSet = excludeRoomIds instanceof Set ? excludeRoomIds : new Set(Array.isArray(excludeRoomIds) ? excludeRoomIds : []);

    // Deterministic sort: vacant first, room_no ascending
    const sorted = [...eligibleRooms].sort((a, b) => {
      const aVacant = String(a.room_status || '').toLowerCase() === 'vacant' || String(a.housekeeping_status || '').toLowerCase() === 'vacant clean';
      const bVacant = String(b.room_status || '').toLowerCase() === 'vacant' || String(b.housekeeping_status || '').toLowerCase() === 'vacant clean';
      if (aVacant && !bVacant) return -1;
      if (!aVacant && bVacant) return 1;
      const numA = parseInt(a.room_no, 10);
      const numB = parseInt(b.room_no, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.room_no.localeCompare(b.room_no);
    });

    for (const room of sorted) {
      if (excludeSet.has(room.id) || excludeSet.has(room.room_no)) continue;

      const avail = await checkRoomAvailability({
        hotelId,
        roomNo: room.room_no,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        excludeReservationId,
      });

      if (avail.available) {
        return { roomId: room.id, roomNo: room.room_no };
      }
    }

    return { roomId: null, roomNo: 'Unassigned' };
  } catch (err) {
    console.error('Error finding physical room:', err);
    return { roomId: null, roomNo: 'Unassigned' };
  }
};

/**
 * Upserts a guest in the PMS `guests` table.
 * Links by mobile or email to avoid duplicate guest profiles.
 */
export const upsertGuest = async (hotelId, guestInfo = {}) => {
  const supabase = getSupabase();
  const name = guestInfo.name || guestInfo.guestName || 'OTA Guest';
  const mobile = (guestInfo.mobile || guestInfo.phone || guestInfo.guestPhone || '').trim();
  const email = (guestInfo.email || guestInfo.guestEmail || '').trim();
  const address = guestInfo.address || guestInfo.guestAddress || '';
  const nationality = guestInfo.nationality || '';

  if (!hotelId) return null;

  try {
    let existingGuest = null;

    if (mobile) {
      const { data } = await supabase
        .from('guests')
        .select('id, name, mobile, email')
        .eq('hotel_id', hotelId)
        .eq('mobile', mobile)
        .maybeSingle();
      if (data) existingGuest = data;
    }

    if (!existingGuest && email) {
      const { data } = await supabase
        .from('guests')
        .select('id, name, mobile, email')
        .eq('hotel_id', hotelId)
        .eq('email', email)
        .maybeSingle();
      if (data) existingGuest = data;
    }

    if (existingGuest) {
      const updates = {};
      if (address) updates.address = address;
      if (nationality) updates.nationality = nationality;
      if (email && !existingGuest.email) updates.email = email;
      if (mobile && !existingGuest.mobile) updates.mobile = mobile;

      if (Object.keys(updates).length > 0) {
        await supabase.from('guests').update(updates).eq('id', existingGuest.id);
      }
      return existingGuest.id;
    }

    // Insert new guest record
    const { data: newGuest, error: insertErr } = await supabase
      .from('guests')
      .insert({
        hotel_id: hotelId,
        name,
        mobile,
        email,
        address,
        nationality,
        vip_type: '',
        loyalty_level: 'Silver',
        loyalty_points: 0
      })
      .select('id')
      .maybeSingle();

    if (insertErr) {
      console.warn('Guest insert warning:', insertErr.message);
      return null;
    }
    return newGuest?.id || null;
  } catch (err) {
    console.warn('Guest upsert failed (non-blocking):', err.message);
    return null;
  }
};

/**
 * Creates or updates a reservation in the core PMS `reservations` table.
 * Strictly maintains idempotency via external booking ID and reservation ID.
 */
export const createOrUpdateReservation = async (
  reservationData,
  externalId,
  existingReservationId = null,
  excludeRoomIds = []
) => {
  const supabase = getSupabase();
  const idempotencyMarker = `[OTA_BOOKING_ID: ${externalId}]`;
  const legacyMarker = `[AIOSELL_BOOKING_ID: ${externalId}]`;

  let existing = null;

  if (existingReservationId) {
    const { data } = await supabase
      .from('reservations')
      .select('id, internal_note, room_id, room_no, guest_name, guest_phone, guest_email, guest_address, remarks')
      .eq('id', existingReservationId)
      .eq('hotel_id', reservationData.hotel_id)
      .maybeSingle();
    if (data) existing = data;
  }

  const roomSubMatch = (reservationData.internal_note || '').match(/\[ROOM:\s*\d+\/\d+\]/i);
  const targetMarker = roomSubMatch ? `${idempotencyMarker} ${roomSubMatch[0]}` : idempotencyMarker;

  if (!existing) {
    let query = supabase
      .from('reservations')
      .select('id, internal_note, room_id, room_no, guest_name, guest_phone, guest_email, guest_address, remarks')
      .eq('hotel_id', reservationData.hotel_id);

    if (roomSubMatch) {
      query = query.or(`internal_note.ilike.%${targetMarker}%,remarks.ilike.%${targetMarker}%`);
    } else {
      query = query.or(`internal_note.ilike.%${idempotencyMarker}%,internal_note.ilike.%${legacyMarker}%,remarks.ilike.%${idempotencyMarker}%,remarks.ilike.%${legacyMarker}%`);
    }

    const { data: existingList, error: searchError } = await query.limit(1);

    if (searchError) {
      throw new Error(`Failed to query existing reservations: ${searchError.message}`);
    }

    existing = existingList && existingList.length > 0 ? existingList[0] : null;
  }

  // Ensure clean date strings (YYYY-MM-DD) without time offset
  const cleanCheckIn = String(reservationData.check_in_date).slice(0, 10);
  const cleanCheckOut = String(reservationData.check_out_date).slice(0, 10);

  const payload = {
    ...reservationData,
    check_in_date: cleanCheckIn,
    check_out_date: cleanCheckOut,
  };

  // Remove generated/virtual fields that PostgreSQL generated columns forbid inserting into
  delete payload.id;
  delete payload.nights;
  delete payload.room_categories;

  // Validate physical room availability to prevent overlaps
  const norm = normalizePhysicalRoom(payload.room_no);
  if (norm) {
    const avail = await checkRoomAvailability({
      hotelId: reservationData.hotel_id,
      roomNo: norm,
      checkIn: cleanCheckIn,
      checkOut: cleanCheckOut,
      excludeReservationId: existing?.id || null,
    });
    if (!avail.available) {
      console.warn(`[OTA Service] Room ${norm} is occupied for ${cleanCheckIn} to ${cleanCheckOut}. Preserving as Unassigned.`);
      payload.room_no = 'Unassigned';
      payload.room_id = null;
    } else {
      payload.room_no = norm;
    }
  } else {
    payload.room_no = 'Unassigned';
    payload.room_id = null;
  }

  if (existing) {
    // If existing reservation has a physical room, check if it remains conflict-free for the stay dates
    if (existing.room_id && existing.room_no && (!payload.room_id || payload.room_no === 'Unassigned' || payload.room_no === 'TBD')) {
      const stillAvail = await checkRoomAvailability({
        hotelId: reservationData.hotel_id,
        roomNo: existing.room_no,
        checkIn: cleanCheckIn,
        checkOut: cleanCheckOut,
        excludeReservationId: existing.id,
      });

      if (stillAvail.available) {
        payload.room_id = existing.room_id;
        payload.room_no = existing.room_no;
      } else {
        console.warn(`[OTA Service] Existing room ${existing.room_no} now conflicts with updated stay ${cleanCheckIn} to ${cleanCheckOut}. Will auto-reassign.`);
        payload.room_id = null;
        payload.room_no = 'Unassigned';
      }
    }

    // Preserve valid local guest details if incoming payload has blanks
    if (!payload.guest_phone && existing.guest_phone) payload.guest_phone = existing.guest_phone;
    if (!payload.guest_email && existing.guest_email) payload.guest_email = existing.guest_email;
    if (!payload.guest_address && existing.guest_address) payload.guest_address = existing.guest_address;
    if ((!payload.guest_name || payload.guest_name === 'OTA Guest') && existing.guest_name && existing.guest_name !== 'OTA Guest') {
      payload.guest_name = existing.guest_name;
    }
    if (!payload.remarks && existing.remarks) payload.remarks = existing.remarks;

    // Preserve existing note if marker already present, otherwise append
    let internalNote = existing.internal_note || '';
    if (!internalNote.includes(idempotencyMarker) && !internalNote.includes(legacyMarker)) {
      internalNote = internalNote ? `${internalNote}\n${idempotencyMarker}` : idempotencyMarker;
    }
    payload.internal_note = internalNote;
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('reservations')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) throw new Error(`Failed to update reservation: ${error.message}`);

    // If reservation remains unassigned, attempt automatic physical room assignment
    if (!data.room_id || data.room_no === 'Unassigned' || data.room_no === 'TBD') {
      try {
        const autoRes = await autoAssignPhysicalRoom({
          hotelId: payload.hotel_id,
          reservationId: data.id,
          excludeRoomIds,
        });
        if (autoRes?.success && autoRes.roomNo) {
          data.room_no = autoRes.roomNo;
          data.room_id = autoRes.roomId;
        }
      } catch (autoErr) {
        console.warn('[HotelMantriReservationService] Automatic assignment non-blocking warning:', autoErr.message);
      }
    }

    return data;
  } else {
    // Create new reservation
    const internalNote = payload.internal_note
      ? (payload.internal_note.includes(idempotencyMarker) ? payload.internal_note : `${payload.internal_note}\n${idempotencyMarker}`)
      : idempotencyMarker;

    payload.internal_note = internalNote;
    if (!payload.remarks) {
      payload.remarks = idempotencyMarker;
    } else if (!payload.remarks.includes(idempotencyMarker)) {
      payload.remarks = `${payload.remarks} | ${idempotencyMarker}`;
    }
    payload.created_at = new Date().toISOString();
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('reservations')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw new Error(`Failed to create reservation: ${error.message}`);

    // Attempt automatic room assignment immediately upon import if room is not yet assigned
    if (!data.room_id || data.room_no === 'Unassigned' || data.room_no === 'TBD') {
      try {
        const autoRes = await autoAssignPhysicalRoom({
          hotelId: payload.hotel_id,
          reservationId: data.id,
          excludeRoomIds,
        });
        if (autoRes?.success && autoRes.roomNo) {
          data.room_no = autoRes.roomNo;
          data.room_id = autoRes.roomId;
        }
      } catch (autoErr) {
        console.warn('[HotelMantriReservationService] Automatic assignment non-blocking warning:', autoErr.message);
      }
    }

    return data;
  }
};

export const cancelReservation = async (hotelId, externalId, existingReservationId = null) => {
  const supabase = getSupabase();
  const idempotencyMarker = `[OTA_BOOKING_ID: ${externalId}]`;
  const legacyMarker = `[AIOSELL_BOOKING_ID: ${externalId}]`;

  // Find all reservations for this booking
  let query = supabase
    .from('reservations')
    .select('id, hotel_id, check_in_date, check_out_date, status')
    .eq('hotel_id', hotelId);

  if (existingReservationId) {
    query = query.or(`id.eq.${existingReservationId},internal_note.ilike.%${idempotencyMarker}%,remarks.ilike.%${idempotencyMarker}%`);
  } else {
    query = query.or(`internal_note.ilike.%${idempotencyMarker}%,internal_note.ilike.%${legacyMarker}%,remarks.ilike.%${idempotencyMarker}%,remarks.ilike.%${legacyMarker}%`);
  }

  const { data: existingReservations } = await query;

  if (!existingReservations || existingReservations.length === 0) {
    return null;
  }

  const idsToCancel = existingReservations.map(r => r.id);

  const { data: cancelledRows, error } = await supabase
    .from('reservations')
    .update({ 
      status: 'cancelled',
      room_id: null,
      room_no: 'Unassigned',
      updated_at: new Date().toISOString()
    })
    .in('id', idsToCancel)
    .select('*');

  if (error) throw new Error(`Failed to cancel reservations: ${error.message}`);

  const primary = (cancelledRows || []).find(r => r.id === existingReservationId) || cancelledRows?.[0] || existingReservations[0];
  return primary;
};

export default {
  getSupabase,
  findAvailablePhysicalRoom,
  upsertGuest,
  createOrUpdateReservation,
  cancelReservation,
};

