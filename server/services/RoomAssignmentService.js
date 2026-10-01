/**
 * HOTEL MANTRI — RoomAssignmentService
 * 
 * Authoritative transactional execution for:
 * 1. Atomic reservation creation (single or multi-room)
 * 2. Room assignment & reassignment
 * 3. Moving reservations (dates and/or physical rooms)
 * 4. Stay extension
 * 5. Check-in validation
 */

import { supabaseServiceRole } from '../supabaseClient.js';
import {
  withRoomLock,
  checkRoomAvailability,
  checkCategoryCapacity,
  normalizePhysicalRoom,
  logBlockedConflict,
} from './ReservationConflictService.js';
import { checkManualDuplicate } from './ReservationIdempotencyService.js';
import { isValidEmail } from './emailService.js';

/**
 * Upserts a guest in the PMS guests table.
 */
export const upsertGuestMaster = async (hotelId, payload) => {
  const supabase = supabaseServiceRole;
  const cleanName = (payload.guest_name || '').trim();
  const cleanPhone = (payload.guest_phone || '').trim();
  const cleanEmail = (payload.guest_email || '').trim();
  const address = payload.guest_address || '';

  if (!hotelId || !cleanName) return null;

  try {
    let existingGuest = null;
    if (cleanPhone) {
      const { data: g } = await supabase
        .from('guests')
        .select('id')
        .eq('hotel_id', hotelId)
        .eq('mobile', cleanPhone)
        .maybeSingle();
      existingGuest = g;
    }

    if (!existingGuest) {
      const { data: g } = await supabase
        .from('guests')
        .select('id')
        .eq('hotel_id', hotelId)
        .ilike('name', cleanName)
        .maybeSingle();
      existingGuest = g;
    }

    if (existingGuest) {
      await supabase
        .from('guests')
        .update({
          mobile: cleanPhone || undefined,
          email: cleanEmail || undefined,
          address: address || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingGuest.id);
      return existingGuest.id;
    } else {
      const { data: newG } = await supabase
        .from('guests')
        .insert({
          hotel_id: hotelId,
          name: cleanName,
          mobile: cleanPhone,
          email: cleanEmail,
          address,
        })
        .select('id')
        .single();
      return newG?.id || null;
    }
  } catch (err) {
    console.warn('[RoomAssignmentService] Guest upsert non-critical warning:', err.message);
    return null;
  }
};

/**
 * Creates reservations atomically.
 * If multiple rooms are requested, ALL must be verified and acquired together.
 * Never leaves a booking half-created.
 */
export const createReservationsAtomically = async ({
  hotelId,
  inputs,
  userId = null,
}) => {
  if (!hotelId) {
    throw { status: 400, code: 'HOTEL_CONTEXT_REQUIRED', message: 'Hotel context is required.' };
  }

  const rawList = Array.isArray(inputs) ? inputs : [inputs];
  if (rawList.length === 0) {
    throw { status: 400, code: 'EMPTY_INPUT', message: 'No reservation inputs provided.' };
  }

  // 1. Date and Room Integrity Check
  const assignedPhysicalRooms = new Set();

  for (const item of rawList) {
    const ci = String(item.check_in_date || '').slice(0, 10);
    const co = String(item.check_out_date || '').slice(0, 10);

    if (!ci || !co) {
      throw { status: 400, code: 'INVALID_STAY_DATES', message: 'Check-in and check-out dates are required.' };
    }
    if (ci >= co) {
      throw {
        status: 400,
        code: 'INVALID_STAY_DATES',
        message: `Check-out date (${co}) must be strictly after check-in date (${ci}).`,
      };
    }

    const norm = normalizePhysicalRoom(item.room_no);
    if (norm) {
      const key = norm.toLowerCase();
      if (assignedPhysicalRooms.has(key)) {
        throw {
          status: 400,
          code: 'DUPLICATE_ROOM_IN_BOOKING',
          message: `Physical room ${norm} cannot be selected more than once in the same booking.`,
        };
      }
      assignedPhysicalRooms.add(key);
    }

    // Mandatory Guest Email Check for manual reservations
    const isOta = Boolean(item.is_ota || item.source_category === 'OTA');
    const cleanEmail = (item.guest_email || '').trim();
    if (!isOta) {
      if (!cleanEmail) {
        throw {
          status: 422,
          code: 'GUEST_EMAIL_REQUIRED',
          message: 'Guest email is required to create a reservation.',
        };
      }
      if (!isValidEmail(cleanEmail)) {
        throw {
          status: 422,
          code: 'INVALID_GUEST_EMAIL',
          message: 'Please provide a valid guest email address.',
        };
      }
    }
  }

  // 2. Lock rooms sequentially and validate
  const createdRecords = [];

  const lockAndExecute = async (index) => {
    if (index >= rawList.length) {
      return createdRecords;
    }

    const item = rawList[index];
    const norm = normalizePhysicalRoom(item.room_no);

    const checkAndInsert = async () => {
      // Physical room availability check
      if (norm) {
        const availCheck = await checkRoomAvailability({
          hotelId,
          roomNo: norm,
          checkIn: item.check_in_date,
          checkOut: item.check_out_date,
        });

        if (!availCheck.available) {
          await logBlockedConflict({
            hotelId,
            userId,
            roomNo: norm,
            operation: 'RESERVATION_CREATE_BLOCKED',
            reason: availCheck.message,
            details: { checkIn: item.check_in_date, checkOut: item.check_out_date, guest: item.guest_name },
          });

          throw {
            status: 409,
            code: availCheck.code,
            message: availCheck.message,
            conflictingReservation: availCheck.conflictingReservation,
          };
        }
      } else if (item.room_category_id) {
        // Unassigned category capacity check
        const capCheck = await checkCategoryCapacity({
          hotelId,
          categoryId: item.room_category_id,
          checkIn: item.check_in_date,
          checkOut: item.check_out_date,
        });

        if (!capCheck.available) {
          throw {
            status: 409,
            code: capCheck.code,
            message: capCheck.message,
          };
        }
      }

      // Check manual duplicate
      const dupeCheck = await checkManualDuplicate(hotelId, item);
      if (dupeCheck.duplicate) {
        throw {
          status: 409,
          code: dupeCheck.code,
          message: dupeCheck.message,
        };
      }

      // Sync guest profile
      const guestId = item.guest_id || (await upsertGuestMaster(hotelId, item));

      const payload = {
        ...item,
        hotel_id: hotelId,
        guest_email: item.guest_email || '',
        guest_phone: item.guest_phone || '',
        room_no: norm || 'Unassigned',
        room_id: norm ? item.room_id : null,
        guest_id: guestId || null,
        status: item.status || 'confirmed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Strip PostgreSQL virtual / generated columns
      delete payload.id;
      delete payload.nights;
      delete payload.room_categories;

      const { data: inserted, error: insertErr } = await supabaseServiceRole
        .from('reservations')
        .insert(payload)
        .select('*')
        .single();

      if (insertErr) {
        console.error('[RoomAssignmentService] Insert error:', insertErr);
        // Translate PostgreSQL errors cleanly
        if (insertErr.code === '23P01' || insertErr.message?.includes('INVALID_STAY_DATES')) {
          throw { status: 400, code: 'INVALID_STAY_DATES', message: 'Check-out date must be after check-in date.' };
        }
        if (insertErr.code === '23P02' || insertErr.message?.includes('ROOM_ALREADY_BOOKED')) {
          throw {
            status: 409,
            code: 'ROOM_ALREADY_BOOKED',
            message: `Room ${norm || 'selected'} is already booked for part of this stay. Please choose another room.`,
          };
        }
        throw { status: 500, code: 'RESERVATION_SAVE_FAILED', message: 'Failed to create reservation in database.' };
      }

      if (Number(inserted.advance_paid) > 0) {
        const todayDate = (new Date()).toISOString().slice(0, 10);
        await supabaseServiceRole.from('booking_timeline').insert({
          hotel_id: hotelId,
          reservation_id: inserted.id,
          event_type: 'advance_payment',
          event_description: `Advance payment for reservation: ${inserted.guest_name}`,
          event_amount: Number(inserted.advance_paid),
          event_data: {
            payment_date: todayDate,
            business_date: todayDate,
            payment_method: inserted.payment_mode || 'Cash',
            pay_cash: inserted.pay_cash || 0,
            pay_bank: inserted.pay_bank || 0,
            pay_upi: inserted.pay_upi || 0,
            pay_card: inserted.pay_card || 0,
          },
          performed_by: userId || 'STAFF',
        }).catch(err => console.warn('[RoomAssignmentService] Timeline insert warning:', err.message));
      }

      createdRecords.push(inserted);
      return lockAndExecute(index + 1);
    };

    if (norm) {
      return withRoomLock(hotelId, norm, checkAndInsert);
    } else {
      return checkAndInsert();
    }
  };

  try {
    return await lockAndExecute(0);
  } catch (err) {
    // If any item failed and some were already inserted, roll back inserted ones atomically
    if (createdRecords.length > 0) {
      const idsToDelete = createdRecords.map((r) => r.id);
      await supabaseServiceRole
        .from('reservations')
        .delete()
        .in('id', idsToDelete)
        .eq('hotel_id', hotelId);
    }
    throw err;
  }
};

/**
 * Updates a reservation atomically with conflict validation.
 */
export const updateReservationAtomically = async ({
  hotelId,
  reservationId,
  updates,
  userId = null,
}) => {
  if (!hotelId || !reservationId) {
    throw { status: 400, code: 'MISSING_PARAMS', message: 'Hotel ID and reservation ID are required.' };
  }

  // 1. Fetch current reservation
  const { data: current, error: fetchErr } = await supabaseServiceRole
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .eq('hotel_id', hotelId)
    .maybeSingle();

  if (fetchErr || !current) {
    throw { status: 404, code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found.' };
  }

  const newRoomNo = updates.room_no !== undefined ? updates.room_no : current.room_no;
  const newCheckIn = String(updates.check_in_date || current.check_in_date).slice(0, 10);
  const newCheckOut = String(updates.check_out_date || current.check_out_date).slice(0, 10);
  const newStatus = updates.status || current.status;

  if (newCheckIn >= newCheckOut) {
    throw { status: 400, code: 'INVALID_STAY_DATES', message: 'Check-out date must be strictly after check-in date.' };
  }

  const normRoom = normalizePhysicalRoom(newRoomNo);

  const performUpdate = async () => {
    // If status is blocking and a physical room is assigned, verify availability
    if ((newStatus === 'confirmed' || newStatus === 'checked_in') && normRoom) {
      const availCheck = await checkRoomAvailability({
        hotelId,
        roomNo: normRoom,
        checkIn: newCheckIn,
        checkOut: newCheckOut,
        excludeReservationId: reservationId,
      });

      if (!availCheck.available) {
        await logBlockedConflict({
          hotelId,
          userId,
          reservationId,
          roomNo: normRoom,
          operation: 'RESERVATION_UPDATE_BLOCKED',
          reason: availCheck.message,
        });

        throw {
          status: 409,
          code: availCheck.code,
          message: availCheck.message,
          conflictingReservation: availCheck.conflictingReservation,
        };
      }
    }

    const payload = {
      ...updates,
      room_no: normRoom || 'Unassigned',
      room_id: normRoom ? updates.room_id ?? current.room_id : null,
      check_in_date: newCheckIn,
      check_out_date: newCheckOut,
      updated_at: new Date().toISOString(),
    };

    delete payload.id;
    delete payload.nights;
    delete payload.hotel_id;

    const { data: updated, error: updateErr } = await supabaseServiceRole
      .from('reservations')
      .update(payload)
      .eq('id', reservationId)
      .eq('hotel_id', hotelId)
      .select('*')
      .single();

    if (updateErr) {
      console.error('[RoomAssignmentService] Update error:', updateErr);
      throw { status: 500, code: 'UPDATE_FAILED', message: 'Failed to update reservation in database.' };
    }

    return updated;
  };

  if (normRoom) {
    return withRoomLock(hotelId, normRoom, performUpdate);
  } else {
    return performUpdate();
  }
};

/**
 * Assigns or reassigns a physical room to a reservation.
 */
export const assignPhysicalRoom = async ({
  hotelId,
  reservationId,
  roomNo,
  roomId = null,
  userId = null,
}) => {
  const norm = normalizePhysicalRoom(roomNo);
  if (!norm) {
    // Setting back to unassigned
    return updateReservationAtomically({
      hotelId,
      reservationId,
      updates: { room_no: 'Unassigned', room_id: null },
      userId,
    });
  }

  // Fetch stay dates
  const { data: res } = await supabaseServiceRole
    .from('reservations')
    .select('check_in_date, check_out_date, status')
    .eq('id', reservationId)
    .eq('hotel_id', hotelId)
    .single();

  if (!res) throw { status: 404, code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found.' };

  // Resolve room_id if not passed
  let resolvedRoomId = roomId;
  if (!resolvedRoomId) {
    const { data: rObj } = await supabaseServiceRole
      .from('rooms')
      .select('id')
      .eq('hotel_id', hotelId)
      .eq('room_no', norm)
      .maybeSingle();
    resolvedRoomId = rObj?.id || null;
  }

  return updateReservationAtomically({
    hotelId,
    reservationId,
    updates: { room_no: norm, room_id: resolvedRoomId },
    userId,
  });
};

/**
 * Extends stay dates atomically with room locking.
 */
export const extendReservationStay = async ({
  hotelId,
  reservationId,
  newCheckOut,
  userId = null,
}) => {
  const cleanOut = String(newCheckOut).slice(0, 10);

  const { data: current } = await supabaseServiceRole
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .eq('hotel_id', hotelId)
    .maybeSingle();

  if (!current) throw { status: 404, code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found.' };
  if (cleanOut <= current.check_in_date) {
    throw { status: 400, code: 'INVALID_STAY_DATES', message: 'New check-out date must be after check-in date.' };
  }

  const updated = await updateReservationAtomically({
    hotelId,
    reservationId,
    updates: { check_out_date: cleanOut },
    userId,
  });

  // If in-house, also update room_chart_entries
  if (current.status === 'checked_in') {
    try {
      const inD = new Date(current.check_in_date + 'T00:00:00');
      const outD = new Date(cleanOut + 'T00:00:00');
      const newNights = Math.max(1, Math.round((outD - inD) / 86400000));

      await supabaseServiceRole
        .from('room_chart_entries')
        .update({
          departure: cleanOut,
          nights: newNights,
          updated_at: new Date().toISOString(),
        })
        .eq('hotel_id', hotelId)
        .eq('room_no', current.room_no)
        .is('checked_out_at', null);
    } catch (e) {
      console.warn('[RoomAssignmentService] Room chart sync warning on extend:', e.message);
    }
  }

  return updated;
};

/**
 * Validates check-in for a reservation.
 * Ensures the physical room is assigned and is completely free of conflicting in-house guests.
 */
export const validateAndProcessCheckIn = async ({
  hotelId,
  reservationId,
  userId = null,
}) => {
  const { data: res } = await supabaseServiceRole
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .eq('hotel_id', hotelId)
    .maybeSingle();

  if (!res) throw { status: 404, code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found.' };
  if (res.status === 'checked_in') {
    return { success: true, message: 'Reservation is already checked in.', reservation: res };
  }
  if (res.status === 'checked_out' || res.status === 'cancelled') {
    throw { status: 400, code: 'INVALID_STATUS', message: `Cannot check in a ${res.status} reservation.` };
  }

  const norm = normalizePhysicalRoom(res.room_no);
  if (!norm) {
    throw {
      status: 400,
      code: 'UNASSIGNED_ROOM',
      message: 'Please assign a physical room before processing check-in.',
    };
  }

  return withRoomLock(hotelId, norm, async () => {
    // Check if room is available
    const availCheck = await checkRoomAvailability({
      hotelId,
      roomNo: norm,
      checkIn: res.check_in_date,
      checkOut: res.check_out_date,
      excludeReservationId: reservationId,
    });

    if (!availCheck.available) {
      await logBlockedConflict({
        hotelId,
        userId,
        reservationId,
        roomNo: norm,
        operation: 'CHECK_IN_BLOCKED',
        reason: availCheck.message,
      });

      throw {
        status: 409,
        code: availCheck.code,
        message: availCheck.message,
      };
    }

    // Update reservation status to checked_in
    const { data: updated, error } = await supabaseServiceRole
      .from('reservations')
      .update({
        status: 'checked_in',
        updated_at: new Date().toISOString(),
      })
      .eq('id', reservationId)
      .eq('hotel_id', hotelId)
      .select('*')
      .single();

    if (error) throw { status: 500, code: 'CHECK_IN_FAILED', message: 'Failed to update check-in status.' };
    return { success: true, message: 'Check-in successful.', reservation: updated };
  });
};

/**
 * Normalizes text for category matching:
 * Converts dashes/underscores to spaces, strips rate plan suffixes (e.g. -s-ep, -ep),
 * and removes all non-alphanumeric characters.
 */
const simplifyCategoryString = (str) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\b(s\s*ep|d\s*ep|ep|cp|map|ap)\b/gi, '')
    .replace(/\b(room|rate|plan|standard)\b/gi, ' ')
    .replace(/[^a-z0-9]/g, '');
};

/**
 * Checks if automatic room assignment is enabled for this hotel.
 * Default is ON (true).
 */
export const isAutoAssignEnabled = async (hotelId) => {
  if (!hotelId) return true;
  try {
    const { data } = await supabaseServiceRole
      .from('system_settings')
      .select('value')
      .eq('key', `auto_assign_ota_${hotelId}`)
      .maybeSingle();

    if (data && typeof data.value === 'object' && data.value !== null) {
      return data.value.enabled !== false;
    }
    if (data && typeof data.value === 'boolean') {
      return data.value;
    }
    return true; // Default: ON
  } catch (err) {
    return true; // Default: ON
  }
};

/**
 * Sets automatic room assignment feature flag for this hotel.
 */
export const setAutoAssignEnabled = async (hotelId, enabled) => {
  if (!hotelId) throw new Error('hotelId is required');
  const key = `auto_assign_ota_${hotelId}`;
  const value = { enabled: Boolean(enabled), updated_at: new Date().toISOString() };

  const { data: existing } = await supabaseServiceRole
    .from('system_settings')
    .select('key')
    .eq('key', key)
    .maybeSingle();

  if (existing) {
    await supabaseServiceRole
      .from('system_settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', key);
  } else {
    await supabaseServiceRole
      .from('system_settings')
      .insert({ key, value, updated_at: new Date().toISOString() });
  }

  return { success: true, hotelId, enabled: Boolean(enabled) };
};

/**
 * Authoritative room category resolution from OTA roomCode, roomName, or ratePlan.
 * 1. Checks persistent channel_room_mappings.
 * 2. Matches active room_categories in the hotel.
 * 3. Never guesses across categories; returns null if unmapped.
 */
export const resolveHotelRoomCategory = async (hotelId, { roomCode, roomName, ratePlan }) => {
  if (!hotelId) return null;
  const supabase = supabaseServiceRole;

  const rawCandidates = [roomCode, ratePlan, roomName].filter(Boolean).map(s => String(s).trim());
  if (rawCandidates.length === 0) return null;

  // 1. Direct query on channel_room_mappings
  for (const term of rawCandidates) {
    const { data: mapping } = await supabase
      .from('channel_room_mappings')
      .select('room_category_id, external_room_code')
      .eq('hotel_id', hotelId)
      .ilike('external_room_code', term)
      .maybeSingle();

    if (mapping && mapping.room_category_id) {
      const { data: cat } = await supabase
        .from('room_categories')
        .select('id, name')
        .eq('id', mapping.room_category_id)
        .maybeSingle();

      if (cat) {
        return { categoryId: cat.id, categoryName: cat.name, source: 'channel_room_mapping' };
      }
    }
  }

  // 2. Fetch all active room categories for this hotel
  const { data: categories, error: catErr } = await supabase
    .from('room_categories')
    .select('id, name, is_active')
    .eq('hotel_id', hotelId);

  if (catErr || !categories || categories.length === 0) {
    return null;
  }

  // Active categories map
  const activeCats = categories.filter(c => c.is_active !== false);

  // 3. Exact simplified match
  for (const term of rawCandidates) {
    const simpTerm = simplifyCategoryString(term);
    if (!simpTerm) continue;

    // Direct match against category simplified name
    const exact = activeCats.find(c => simplifyCategoryString(c.name) === simpTerm);
    if (exact) {
      return { categoryId: exact.id, categoryName: exact.name, source: 'exact_simplified' };
    }

    // Inclusion match (e.g. deluxeac matches Deluxe AC Room)
    const included = activeCats.find(c => {
      const cSimp = simplifyCategoryString(c.name);
      return cSimp.includes(simpTerm) || simpTerm.includes(cSimp);
    });
    if (included) {
      return { categoryId: included.id, categoryName: included.name, source: 'fuzzy_included' };
    }
  }

  return null;
};

/**
 * Removes any [UNASSIGNED_REASON: ...] tag from an internal note string.
 */
export const stripUnassignedReason = (note) => {
  if (!note) return '';
  return String(note).replace(/\[UNASSIGNED_REASON:\s*[^\]]+\]/gi, '').trim();
};

/**
 * Appends or updates a [UNASSIGNED_REASON: <reason>] tag in an internal note.
 */
export const setUnassignedReason = (note, reason) => {
  const clean = stripUnassignedReason(note);
  const tag = `[UNASSIGNED_REASON: ${reason}]`;
  return clean ? `${clean}\n${tag}` : tag;
};

/**
 * Automatically assigns an eligible physical room to a reservation based on:
 * - Hotel setting (Automatic Room Assignment ON/OFF)
 * - Mapped room category
 * - Stay dates (check-in inclusive, check-out exclusive)
 * - Room status (active, not blocked, not under maintenance)
 * - Non-conflicting reservation / in-house stay
 * - Deterministic ordering: prefer vacant rooms, then room_no ascending
 * - Concurrency safety: atomic execution inside withRoomLock
 */
export const autoAssignPhysicalRoom = async ({
  hotelId,
  reservationId,
  preferredRoomNo = null,
  userId = null,
  dryRun = false,
  excludeRoomIds = [],
}) => {
  if (!hotelId || !reservationId) {
    throw { status: 400, code: 'MISSING_PARAMS', message: 'hotelId and reservationId are required.' };
  }

  const supabase = supabaseServiceRole;

  // 1. Check Hotel Setting
  const enabled = await isAutoAssignEnabled(hotelId);
  if (!enabled) {
    return {
      success: false,
      reason: 'AUTO_ASSIGN_DISABLED',
      message: 'Automatic room assignment is disabled in hotel settings.',
    };
  }

  // 2. Fetch reservation
  const { data: reservation, error: fetchErr } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .eq('hotel_id', hotelId)
    .maybeSingle();

  if (fetchErr || !reservation) {
    throw { status: 404, code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found.' };
  }

  if (reservation.status === 'cancelled' || reservation.status === 'checked_out') {
    return {
      success: false,
      reason: 'INVALID_STATUS',
      message: `Cannot assign room to a ${reservation.status} reservation.`,
    };
  }

  const checkIn = String(reservation.check_in_date).slice(0, 10);
  const checkOut = String(reservation.check_out_date).slice(0, 10);

  // 3. Resolve room category
  let category = await resolveHotelRoomCategory(hotelId, {
    roomCode: reservation.rate_plan,
    ratePlan: reservation.rate_plan,
    roomName: reservation.rate_plan,
  });

  // If still not resolved, check channel_ota_reservations
  if (!category) {
    const { data: otaRow } = await supabase
      .from('channel_ota_reservations')
      .select('room_category, rate_plan')
      .eq('hotel_id', hotelId)
      .eq('reservation_id', reservationId)
      .maybeSingle();

    if (otaRow) {
      category = await resolveHotelRoomCategory(hotelId, {
        roomCode: otaRow.room_category,
        ratePlan: otaRow.rate_plan,
      });
    }
  }

  // If room category could not be resolved reliably
  if (!category) {
    if (!dryRun) {
      const updatedNote = setUnassignedReason(reservation.internal_note, 'ROOM_CATEGORY_NOT_MAPPED');
      await supabase
        .from('reservations')
        .update({
          room_no: 'Unassigned',
          room_id: null,
          internal_note: updatedNote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reservationId);
    }

    console.warn(`[AUTO_ASSIGN] Reservation ${reservationId} unassigned: ROOM_CATEGORY_NOT_MAPPED`);
    return {
      success: false,
      reason: 'ROOM_CATEGORY_NOT_MAPPED',
      message: 'Room category mapping required. Could not map to a Hotel Mantri room category.',
    };
  }

  // 4. Check if existing room assignment is already valid and conflict-free
  const currentNorm = normalizePhysicalRoom(reservation.room_no);
  if (currentNorm) {
    // Check if the current room belongs to the target category
    const { data: curRoomObj } = await supabase
      .from('rooms')
      .select('id, room_no, category_id, is_active, room_status')
      .eq('hotel_id', hotelId)
      .eq('room_no', currentNorm)
      .maybeSingle();

    if (
      curRoomObj &&
      curRoomObj.is_active !== false &&
      curRoomObj.category_id === category.categoryId
    ) {
      const avail = await checkRoomAvailability({
        hotelId,
        roomNo: currentNorm,
        checkIn,
        checkOut,
        excludeReservationId: reservationId,
      });

      if (avail.available) {
        // Current room is already valid and conflict-free: KEEP IT!
        if (!dryRun) {
          const cleanedNote = stripUnassignedReason(reservation.internal_note);
          await supabase
            .from('reservations')
            .update({
              room_no: currentNorm,
              room_id: curRoomObj.id,
              internal_note: cleanedNote,
              updated_at: new Date().toISOString(),
            })
            .eq('id', reservationId);
        }

        console.log(`[AUTO_ASSIGN] Reservation ${reservationId}: kept existing valid room ${currentNorm}`);
        return {
          success: true,
          roomNo: currentNorm,
          roomId: curRoomObj.id,
          categoryName: category.categoryName,
          keptExisting: true,
          message: `Existing room ${currentNorm} is valid and conflict-free.`,
        };
      }
    }
  }

  // 5. Query all active physical rooms in the mapped category
  const { data: candidateRooms, error: roomsErr } = await supabase
    .from('rooms')
    .select('id, room_no, category_id, floor, room_status, housekeeping_status, is_active')
    .eq('hotel_id', hotelId)
    .eq('category_id', category.categoryId)
    .eq('is_active', true)
    .order('room_no', { ascending: true });

  if (roomsErr || !candidateRooms || candidateRooms.length === 0) {
    if (!dryRun) {
      const updatedNote = setUnassignedReason(reservation.internal_note, 'NO_ELIGIBLE_ROOM');
      await supabase
        .from('reservations')
        .update({
          room_no: 'Unassigned',
          room_id: null,
          internal_note: updatedNote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reservationId);
    }

    console.warn(`[AUTO_ASSIGN] Reservation ${reservationId}: NO_ELIGIBLE_ROOM for category ${category.categoryName}`);
    return {
      success: false,
      reason: 'NO_ELIGIBLE_ROOM',
      message: `No active physical rooms configured for category ${category.categoryName}.`,
    };
  }

  // Filter out rooms with explicit non-assignable statuses or already assigned in current multi-room batch
  const nonAssignableStatuses = new Set(['blocked', 'maintenance', 'out of service', 'out of order']);
  const excludeSet = new Set((excludeRoomIds || []).map(String));
  const eligibleRooms = candidateRooms.filter(
    r => !excludeSet.has(String(r.id)) && !nonAssignableStatuses.has(String(r.room_status || '').toLowerCase())
  );

  if (eligibleRooms.length === 0) {
    if (!dryRun) {
      const updatedNote = setUnassignedReason(reservation.internal_note, 'ROOM_BLOCKED');
      await supabase
        .from('reservations')
        .update({
          room_no: 'Unassigned',
          room_id: null,
          internal_note: updatedNote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reservationId);
    }

    return {
      success: false,
      reason: 'ROOM_BLOCKED',
      message: `All physical rooms in ${category.categoryName} are currently blocked or under maintenance.`,
    };
  }

  // 6. Deterministic ordering:
  // - Prefer preferredRoomNo if eligible
  // - Prefer vacant rooms (room_status === 'Vacant' or housekeeping_status === 'Vacant Clean')
  // - Deterministic tie-breaker: room_no ascending numerically
  const sortedCandidates = [...eligibleRooms].sort((a, b) => {
    if (preferredRoomNo) {
      if (a.room_no.toLowerCase() === preferredRoomNo.toLowerCase()) return -1;
      if (b.room_no.toLowerCase() === preferredRoomNo.toLowerCase()) return 1;
    }

    const aVacant = String(a.room_status || '').toLowerCase() === 'vacant' || String(a.housekeeping_status || '').toLowerCase() === 'vacant clean';
    const bVacant = String(b.room_status || '').toLowerCase() === 'vacant' || String(b.housekeeping_status || '').toLowerCase() === 'vacant clean';
    if (aVacant && !bVacant) return -1;
    if (!aVacant && bVacant) return 1;

    // Room number numerical or lexicographical sort
    const numA = parseInt(a.room_no, 10);
    const numB = parseInt(b.room_no, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.room_no.localeCompare(b.room_no);
  });

  // 7. Concurrency-Safe Transactional Check & Acquire using withRoomLock
  let assignedRoom = null;

  for (const candidate of sortedCandidates) {
    const acquireResult = await withRoomLock(hotelId, candidate.room_no, async () => {
      // Re-check room availability inside the mutex lock
      const availCheck = await checkRoomAvailability({
        hotelId,
        roomNo: candidate.room_no,
        checkIn,
        checkOut,
        excludeReservationId: reservationId,
      });

      if (!availCheck.available) {
        return null;
      }

      if (dryRun) {
        return { roomNo: candidate.room_no, roomId: candidate.id, dryRun: true };
      }

      // Commit the room assignment atomically
      const cleanedNote = stripUnassignedReason(reservation.internal_note);
      const { data: updated, error: updateErr } = await supabase
        .from('reservations')
        .update({
          room_no: candidate.room_no,
          room_id: candidate.id,
          internal_note: cleanedNote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reservationId)
        .select('*')
        .single();

      if (updateErr) {
        console.error(`[AUTO_ASSIGN] Error updating reservation ${reservationId}:`, updateErr);
        return null;
      }

      return { roomNo: candidate.room_no, roomId: candidate.id, updated };
    });

    if (acquireResult) {
      assignedRoom = acquireResult;
      break;
    }
  }

  // 8. Result reporting
  if (assignedRoom) {
    console.log(
      `[AUTO_ASSIGN_SUCCESS] OTA reservation: ${reservationId} | Category: ${category.categoryName} | Stay: ${checkIn} -> ${checkOut} | Assigned Room: ${assignedRoom.roomNo}`
    );
    return {
      success: true,
      roomNo: assignedRoom.roomNo,
      roomId: assignedRoom.roomId,
      categoryName: category.categoryName,
      message: `Assigned room ${assignedRoom.roomNo} successfully.`,
    };
  }

  // 9. If no eligible room could be assigned for the full stay
  if (!dryRun) {
    const updatedNote = setUnassignedReason(reservation.internal_note, 'NO_ROOM_FOR_FULL_STAY');
    await supabase
      .from('reservations')
      .update({
        room_no: 'Unassigned',
        room_id: null,
        internal_note: updatedNote,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reservationId);
  }

  console.warn(
    `[AUTO_ASSIGN_FAILED] OTA reservation: ${reservationId} | Category: ${category.categoryName} | Stay: ${checkIn} -> ${checkOut} | Result: NO_ROOM_FOR_FULL_STAY`
  );

  return {
    success: false,
    reason: 'NO_ROOM_FOR_FULL_STAY',
    message: `No available physical rooms in category ${category.categoryName} for stay ${checkIn} to ${checkOut}.`,
  };
};

/**
 * Scans and auto-assigns physical rooms for all unassigned reservations in a hotel.
 */
export const batchAutoAssignReservations = async (hotelId) => {
  if (!hotelId) throw new Error('hotelId is required');
  const supabase = supabaseServiceRole;

  const { data: unassigned, error } = await supabase
    .from('reservations')
    .select('id, guest_name, check_in_date, check_out_date, status, rate_plan, room_no, source_name')
    .eq('hotel_id', hotelId)
    .in('status', ['confirmed', 'checked_in'])
    .or('room_no.eq.Unassigned,room_no.eq.TBD,room_no.is.null,room_id.is.null')
    .order('check_in_date', { ascending: true });

  if (error || !unassigned || unassigned.length === 0) {
    return { total: 0, assignedCount: 0, unassignedCount: 0, results: [] };
  }

  const results = [];
  let assignedCount = 0;
  let unassignedCount = 0;

  for (const res of unassigned) {
    try {
      const outcome = await autoAssignPhysicalRoom({
        hotelId,
        reservationId: res.id,
      });

      if (outcome.success) {
        assignedCount++;
        results.push({
          id: res.id,
          guestName: res.guest_name,
          source: res.source_name,
          status: 'assigned',
          roomNo: outcome.roomNo,
          category: outcome.categoryName,
        });
      } else {
        unassignedCount++;
        results.push({
          id: res.id,
          guestName: res.guest_name,
          source: res.source_name,
          status: 'unassigned',
          reason: outcome.reason,
          message: outcome.message,
        });
      }
    } catch (err) {
      unassignedCount++;
      results.push({
        id: res.id,
        guestName: res.guest_name,
        source: res.source_name,
        status: 'unassigned',
        reason: 'ASSIGNMENT_ERROR',
        message: err.message,
      });
    }
  }

  return {
    total: unassigned.length,
    assignedCount,
    unassignedCount,
    results,
  };
};

export default {
  upsertGuestMaster,
  createReservationsAtomically,
  updateReservationAtomically,
  assignPhysicalRoom,
  extendReservationStay,
  validateAndProcessCheckIn,
  isAutoAssignEnabled,
  setAutoAssignEnabled,
  resolveHotelRoomCategory,
  autoAssignPhysicalRoom,
  batchAutoAssignReservations,
};

