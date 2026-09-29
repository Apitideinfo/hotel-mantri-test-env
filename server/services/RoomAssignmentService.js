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

export default {
  upsertGuestMaster,
  createReservationsAtomically,
  updateReservationAtomically,
  assignPhysicalRoom,
  extendReservationStay,
  validateAndProcessCheckIn,
};
