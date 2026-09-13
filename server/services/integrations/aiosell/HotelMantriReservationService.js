import { supabaseServiceRole } from '../../../supabaseClient.js';
import dotenv from 'dotenv';
import { executeInventoryPush } from '../../../routes/aiosell.js';
dotenv.config();

export const getSupabase = () => supabaseServiceRole;

/**
 * Finds an available physical room for a given category and date range.
 * If all physical rooms in the category are occupied, returns room_no: 'Unassigned'.
 */
export const findAvailablePhysicalRoom = async (hotelId, roomCategoryId, checkInDate, checkOutDate, excludeReservationId = null) => {
  const supabase = getSupabase();
  if (!hotelId || !roomCategoryId || !checkInDate || !checkOutDate) {
    return { roomId: null, roomNo: 'Unassigned' };
  }

  try {
    // 1. Fetch active physical rooms in this category
    const { data: physicalRooms, error: roomsErr } = await supabase
      .from('rooms')
      .select('id, room_no')
      .eq('hotel_id', hotelId)
      .eq('category_id', roomCategoryId)
      .eq('is_active', true)
      .order('room_no', { ascending: true });

    if (roomsErr || !physicalRooms || physicalRooms.length === 0) {
      return { roomId: null, roomNo: 'Unassigned' };
    }

    // 2. Fetch occupied reservations in this date range
    let resQuery = supabase
      .from('reservations')
      .select('id, room_id, room_no')
      .eq('hotel_id', hotelId)
      .in('status', ['confirmed', 'checked_in'])
      .lt('check_in_date', checkOutDate)
      .gt('check_out_date', checkInDate);

    if (excludeReservationId) {
      resQuery = resQuery.neq('id', excludeReservationId);
    }

    const { data: bookedReservations } = await resQuery;

    // 3. Fetch occupied in-house room chart entries
    const { data: occupiedEntries } = await supabase
      .from('room_chart_entries')
      .select('room_no')
      .eq('hotel_id', hotelId)
      .is('checked_out_at', null)
      .lt('report_date', checkOutDate)
      .gte('report_date', checkInDate);

    const occupiedRoomNos = new Set();
    const occupiedRoomIds = new Set();

    (bookedReservations || []).forEach(r => {
      if (r.room_id) occupiedRoomIds.add(r.room_id);
      if (r.room_no) occupiedRoomNos.add(r.room_no.trim().toLowerCase());
    });

    (occupiedEntries || []).forEach(e => {
      if (e.room_no) occupiedRoomNos.add(e.room_no.trim().toLowerCase());
    });

    // 4. Find the first physical room that is not occupied
    const freeRoom = physicalRooms.find(r => 
      !occupiedRoomIds.has(r.id) && !occupiedRoomNos.has(r.room_no.trim().toLowerCase())
    );

    if (freeRoom) {
      return { roomId: freeRoom.id, roomNo: freeRoom.room_no };
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
export const createOrUpdateReservation = async (reservationData, externalId, existingReservationId = null) => {
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

  if (!existing) {
    const { data: existingList, error: searchError } = await supabase
      .from('reservations')
      .select('id, internal_note, room_id, room_no, guest_name, guest_phone, guest_email, guest_address, remarks')
      .eq('hotel_id', reservationData.hotel_id)
      .or(`internal_note.ilike.%${idempotencyMarker}%,internal_note.ilike.%${legacyMarker}%,remarks.ilike.%${idempotencyMarker}%,remarks.ilike.%${legacyMarker}%`)
      .limit(1);

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

  if (existing) {
    // Preserve existing physical room assignment if already set and new payload didn't assign one
    if (existing.room_id && (!payload.room_id || payload.room_no === 'Unassigned' || payload.room_no === 'TBD')) {
      payload.room_id = existing.room_id;
      payload.room_no = existing.room_no;
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

    triggerBackgroundSync(data.hotel_id, data.check_in_date, data.check_out_date);
    return data;
  } else {
    // Create new reservation
    const internalNote = payload.internal_note
      ? `${payload.internal_note}\n${idempotencyMarker}`
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

    triggerBackgroundSync(data.hotel_id, data.check_in_date, data.check_out_date);
    return data;
  }
};

export const cancelReservation = async (hotelId, externalId, existingReservationId = null) => {
  const supabase = getSupabase();
  const idempotencyMarker = `[OTA_BOOKING_ID: ${externalId}]`;
  const legacyMarker = `[AIOSELL_BOOKING_ID: ${externalId}]`;

  let existing = null;

  if (existingReservationId) {
    const { data } = await supabase
      .from('reservations')
      .select('id, hotel_id, check_in_date, check_out_date')
      .eq('id', existingReservationId)
      .eq('hotel_id', hotelId)
      .maybeSingle();
    if (data) existing = data;
  }

  if (!existing) {
    const { data: existingReservations } = await supabase
      .from('reservations')
      .select('id, hotel_id, check_in_date, check_out_date')
      .eq('hotel_id', hotelId)
      .or(`internal_note.ilike.%${idempotencyMarker}%,internal_note.ilike.%${legacyMarker}%,remarks.ilike.%${idempotencyMarker}%,remarks.ilike.%${legacyMarker}%`)
      .limit(1);

    existing = existingReservations && existingReservations.length > 0 ? existingReservations[0] : null;
  }

  if (!existing) {
    return null;
  }

  const { data, error } = await supabase
    .from('reservations')
    .update({ 
      status: 'cancelled',
      room_id: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', existing.id)
    .select('*')
    .single();


  if (error) throw new Error(`Failed to cancel reservation: ${error.message}`);

  triggerBackgroundSync(data.hotel_id, data.check_in_date, data.check_out_date);
  return data;
};

const triggerBackgroundSync = (hotelId, startDate, endDate) => {
  if (!hotelId || !startDate || !endDate) return;
  const start = String(startDate).slice(0, 10);
  const end = String(endDate).slice(0, 10);
  // Fire and forget inventory push
  executeInventoryPush(hotelId, null, start, end)
    .catch(err => console.warn(`[AutoSync] Background inventory push deferred for hotel ${hotelId}:`, err.message));
};

export default {
  getSupabase,
  findAvailablePhysicalRoom,
  upsertGuest,
  createOrUpdateReservation,
  cancelReservation,
};

