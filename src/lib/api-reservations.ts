import { supabase } from './supabase';
import { getCurrentHotelId, getRooms, getRoomCategories, getRoomChartForDateRange } from './api';
import { toNum, calcStayNights, isStayOverlapping } from './calc';
import { dispatchChannelEvent } from './api-channel';
import { apiFetch } from './api-fetch';
import type { RoomChartEntry } from './types';
import type {
  Reservation, ReservationInput, ReservationStatus,
  ReservationGroup, ReservationGroupInput,
  RatePlan, RatePlanInput, RatePlanType,
  WaitlistEntry, WaitlistInput, WaitlistStatus,
  RoomBlock, RoomBlockInput, BlockType,
  ReservationConfirmationData,
} from './types-reservations';
import { isValidEmail } from './types-reservations';

export { getRoomChartForDateRange };

/**
 * Definition of an active reservation status that blocks room inventory.
 * Confirmed and Checked-in block rooms.
 * Checked-out, Cancelled, and No-show do NOT block rooms.
 */
export const isReservationRoomBlocking = (status?: string | null): boolean => {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return s === 'confirmed' || s === 'checked_in';
};

export const getReservations = async (
  fromDate?: string,
  toDate?: string,
): Promise<Reservation[]> => {
  let q = supabase
    .from('reservations')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('check_in_date', { ascending: true });
  if (fromDate) q = q.gte('check_in_date', fromDate);
  if (toDate) q = q.lte('check_in_date', toDate);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Reservation[]) ?? [];
};

export const getActiveRoomChartEntries = async (date: string): Promise<RoomChartEntry[]> => {
  const { data, error } = await supabase
    .from('room_chart_entries')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .lte('report_date', date)
    .is('checked_out_at', null)
    .order('report_date', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;

  return ((data as RoomChartEntry[]) ?? []).filter((entry) => {
    const checkIn = entry.arrival ?? entry.report_date;
    const checkOut = entry.departure ?? entry.report_date;
    return (date >= checkIn && date < checkOut) || (date === checkIn && date === checkOut);
  });
};

export const getReservationsForDateRange = async (
  startDate: string,
  endDate: string,
): Promise<Reservation[]> => {
  const hotelId = getCurrentHotelId();
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('check_in_date', { ascending: true });
  if (error) {
    console.error('[getReservationsForDateRange] Supabase query error:', error);
    throw error;
  }

  const list = (data as Reservation[]) ?? [];
  return list.filter((r) => {
    const ci = (r.check_in_date ?? '').slice(0, 10);
    const co = (r.check_out_date ?? '').slice(0, 10);
    if (!ci || !co) return false;
    // Overlaps the date range [startDate, endDate]
    return ci <= endDate && co >= startDate;
  });
};

export const getFutureReservationsCount = async (
  targetDate: string,
): Promise<number> => {
  const hotelId = getCurrentHotelId();
  const { count, error } = await supabase
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('hotel_id', hotelId)
    .eq('status', 'confirmed')
    .gt('check_in_date', targetDate);
  if (error) {
    console.error('[getFutureReservationsCount] Supabase count error:', error);
    throw error;
  }
  return count ?? 0;
};

export const saveReservation = async (
  input: ReservationInput,
  id?: string,
): Promise<Reservation> => {
  const hotelId = getCurrentHotelId();
  const ci = (input.check_in_date || '').slice(0, 10);
  const co = (input.check_out_date || '').slice(0, 10);

  if (!ci || !co) {
    throw new Error('Please select check-in and check-out dates.');
  }
  if (ci >= co) {
    throw new Error('Check-out date must be strictly after check-in date.');
  }

  const isNew = !id || id.trim() === '';
  const isOta = Boolean((input as any).is_ota || input.source_category === 'OTA');
  const cleanEmail = (input.guest_email ?? '').trim();

  if (isNew && !isOta) {
    if (!cleanEmail) {
      throw new Error('Guest email is required.');
    }
    if (!isValidEmail(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }
  } else if (!isNew && !isOta && input.guest_email !== undefined && input.guest_email !== null) {
    if (cleanEmail && !isValidEmail(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }
  }

  const normRoom = (input.room_no || '').trim().toLowerCase();
  const isPhysical = normRoom && normRoom !== 'unassigned' && normRoom !== 'tbd';

  if (isPhysical) {
    const isAvail = await checkRoomAvailability(input.room_no, ci, co, id);
    if (!isAvail) {
      throw new Error(`Room ${input.room_no} is already booked for part of this stay. Please choose another room or change the dates.`);
    }
  }

  // Try authoritative backend endpoint
  try {
    if (id && id.trim() !== '') {
      const res = await apiFetch(`/api/reservations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      });
      if (res?.reservation) {
        dispatchChannelEvent('RESERVATION_MODIFIED', {
          startDate: res.reservation.check_in_date,
          endDate: res.reservation.check_out_date,
          room_no: res.reservation.room_no,
          room_id: res.reservation.room_id,
        }).catch(e => console.warn('[saveReservation] Auto-sync warning:', e));
        return {
          ...res.reservation,
          _emailDelivery: res.emailDelivery,
          _emailStatus: res.emailStatus,
        };
      }
    } else {
      const res = await apiFetch('/api/reservations', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      if (res?.reservation) {
        dispatchChannelEvent('RESERVATION_CREATED', {
          startDate: res.reservation.check_in_date,
          endDate: res.reservation.check_out_date,
          room_no: res.reservation.room_no,
          room_id: res.reservation.room_id,
        }).catch(e => console.warn('[saveReservation] Auto-sync warning:', e));
        return {
          ...res.reservation,
          _emailDelivery: res.emailDelivery,
          _emailStatus: res.emailStatus,
        };
      }
    }
  } catch (err: any) {
    if (
      err?.code === 'ROOM_ALREADY_BOOKED' ||
      err?.code === 'ROOM_ASSIGNMENT_CONFLICT' ||
      err?.code === 'INVALID_STAY_DATES' ||
      err?.code === 'RESERVATION_DUPLICATE' ||
      err?.code === 'GUEST_EMAIL_REQUIRED' ||
      err?.code === 'INVALID_GUEST_EMAIL' ||
      err?.status === 422
    ) {
      throw new Error(err.message || 'Validation error');
    }
    console.warn('[saveReservation] Backend call deferred to direct database update:', err?.message || err);
  }

  // Direct Supabase fallback
  const rawPayload = { ...input, hotel_id: hotelId };
  delete (rawPayload as { id?: string }).id;
  delete (rawPayload as { nights?: number }).nights;

  if (isNew && !isOta) {
    if (!cleanEmail) {
      throw new Error('Guest email is required.');
    }
    if (!isValidEmail(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }
  }

  // Sync guest into guests master table if name or phone provided
  try {
    const cleanName = (rawPayload.guest_name ?? '').trim();
    const cleanPhone = (rawPayload.guest_phone ?? '').trim();
    const cleanEmail = (rawPayload.guest_email ?? '').trim();
    if (cleanName && !rawPayload.guest_id) {
      let existingGuest: { id: string } | null = null;
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
        rawPayload.guest_id = existingGuest.id;
        await supabase
          .from('guests')
          .update({
            mobile: cleanPhone || undefined,
            email: cleanEmail || undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingGuest.id);
      } else {
        const { data: newG } = await supabase
          .from('guests')
          .insert({
            hotel_id: hotelId,
            name: cleanName,
            mobile: cleanPhone,
            email: cleanEmail,
          })
          .select('id')
          .single();
        if (newG) rawPayload.guest_id = newG.id;
      }
    }
  } catch {
    // Non-blocking guest sync
  }

  if (id && id.trim() !== '') {
    const { data, error } = await supabase
      .from('reservations')
      .update({ ...rawPayload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      if (error.code === '23P01' || error.message?.includes('INVALID_STAY_DATES')) {
        throw new Error('Check-out date must be after check-in date.');
      }
      if (error.code === '23P02' || error.message?.includes('ROOM_ALREADY_BOOKED')) {
        throw new Error(`Room ${rawPayload.room_no} is already booked for part of this stay. Please choose another room.`);
      }
      throw error;
    }
    const res = data as Reservation;
    dispatchChannelEvent('RESERVATION_MODIFIED', {
      startDate: res.check_in_date,
      endDate: res.check_out_date,
      room_no: res.room_no,
      room_id: res.room_id,
    }).catch(e => console.warn('[saveReservation] Auto-sync warning:', e));

    if (toNum(res.advance_paid) > 0) {
      const todayStr = (new Date()).toISOString().slice(0, 10);
      Promise.resolve(supabase.from('booking_timeline').insert({
        hotel_id: hotelId,
        reservation_id: res.id,
        event_type: 'advance_payment',
        event_description: `Advance payment for reservation: ${res.guest_name}`,
        event_amount: toNum(res.advance_paid),
        event_data: {
          payment_date: todayStr,
          business_date: todayStr,
          payment_method: res.payment_mode || 'Cash',
          pay_cash: res.pay_cash ?? 0,
          pay_bank: res.pay_bank ?? 0,
          pay_upi: res.pay_upi ?? 0,
          pay_card: res.pay_card ?? 0,
        },
        performed_by: 'STAFF',
      })).catch(() => {});
    }

    return res;
  }

  const { data, error } = await supabase
    .from('reservations')
    .insert(rawPayload)
    .select('*')
    .single();
  if (error) {
    if (error.code === '23P01' || error.message?.includes('INVALID_STAY_DATES')) {
      throw new Error('Check-out date must be after check-in date.');
    }
    if (error.code === '23P02' || error.message?.includes('ROOM_ALREADY_BOOKED')) {
      throw new Error(`Room ${rawPayload.room_no} is already booked for part of this stay. Please choose another room.`);
    }
    throw error;
  }
  const res = data as Reservation;
  dispatchChannelEvent('RESERVATION_CREATED', {
    startDate: res.check_in_date,
    endDate: res.check_out_date,
    room_no: res.room_no,
    room_id: res.room_id,
  }).catch(e => console.warn('[saveReservation] Auto-sync warning:', e));

  if (toNum(res.advance_paid) > 0) {
    const todayStr = (new Date()).toISOString().slice(0, 10);
    Promise.resolve(supabase.from('booking_timeline').insert({
      hotel_id: hotelId,
      reservation_id: res.id,
      event_type: 'advance_payment',
      event_description: `Advance payment for reservation: ${res.guest_name}`,
      event_amount: toNum(res.advance_paid),
      event_data: {
        payment_date: todayStr,
        business_date: todayStr,
        payment_method: res.payment_mode || 'Cash',
        pay_cash: res.pay_cash ?? 0,
        pay_bank: res.pay_bank ?? 0,
        pay_upi: res.pay_upi ?? 0,
        pay_card: res.pay_card ?? 0,
      },
      performed_by: 'STAFF',
    })).catch(() => {});
  }

  return res;
};

export const updateReservationStatus = async (
  id: string,
  status: ReservationStatus,
  roomChartEntryId?: string | null,
): Promise<Reservation> => {
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (roomChartEntryId !== undefined) patch.room_chart_entry_id = roomChartEntryId;
  const { data, error } = await supabase
    .from('reservations')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  const res = data as Reservation;
  const eventType = status === 'cancelled' ? 'RESERVATION_CANCELLED' :
    status === 'checked_in' ? 'CHECK_IN' :
    status === 'checked_out' ? 'CHECK_OUT' : 'RESERVATION_MODIFIED';
  dispatchChannelEvent(eventType, {
    startDate: res.check_in_date,
    endDate: res.check_out_date,
    room_no: res.room_no,
    room_id: res.room_id,
  }).catch(e => console.warn('[updateReservationStatus] Auto-sync warning:', e));
  return res;
};

export const deleteReservation = async (id: string): Promise<void> => {
  const { data: existing } = await supabase
    .from('reservations')
    .select('check_in_date, check_out_date, room_no')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('reservations').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    dispatchChannelEvent('RESERVATION_CANCELLED', {
      startDate: existing.check_in_date,
      endDate: existing.check_out_date,
      room_no: existing.room_no,
    }).catch(e => console.warn('[deleteReservation] Auto-sync warning:', e));
  }
};

export const checkRoomAvailability = async (
  roomNo: string,
  checkIn: string,
  checkOut: string,
  excludeId?: string,
): Promise<boolean> => {
  const roomKey = (roomNo || '').trim().toLowerCase();
  // Unassigned rooms do not block physical rooms
  if (!roomKey || roomKey === 'unassigned' || roomKey === 'tbd') {
    return true;
  }

  const ci = checkIn.slice(0, 10);
  const co = checkOut.slice(0, 10);
  if (ci >= co) return false;

  try {
    const hotelId = getCurrentHotelId();

    // 1. Check active reservations for overlap
    let resQ = supabase
      .from('reservations')
      .select('id, room_no, check_in_date, check_out_date, status, room_chart_entry_id')
      .eq('hotel_id', hotelId)
      .in('status', ['confirmed', 'checked_in']);
    if (excludeId) resQ = resQ.neq('id', excludeId);

    const { data: resData } = await resQ;

    // Find if excludeId has an associated room_chart_entry_id
    let excludeEntryId: string | null = null;
    if (excludeId) {
      const { data: exRes } = await supabase
        .from('reservations')
        .select('room_chart_entry_id')
        .eq('id', excludeId)
        .maybeSingle();
      if (exRes?.room_chart_entry_id) {
        excludeEntryId = exRes.room_chart_entry_id;
      }
    }

    const resOverlap = (resData ?? []).some((r) => {
      if ((r.room_no ?? '').trim().toLowerCase() !== roomKey) return false;
      const rCi = (r.check_in_date ?? '').slice(0, 10);
      const rCo = (r.check_out_date ?? '').slice(0, 10);
      if (!rCi || !rCo) return false;
      return isStayOverlapping(ci, co, rCi, rCo);
    });

    if (resOverlap) return false;

    // 2. Check room_chart entries for overlap (excluding this reservation's own entry)
    const { data: entryData } = await supabase
      .from('room_chart_entries')
      .select('id, room_no, arrival, departure, reservation_id')
      .eq('hotel_id', hotelId)
      .is('checked_out_at', null);

    const entryOverlap = (entryData ?? []).some((e: { id?: string; room_no?: string; arrival?: string; departure?: string; report_date?: string; reservation_id?: string }) => {
      if ((e.room_no ?? '').trim().toLowerCase() !== roomKey) return false;
      // Exclude if entry belongs to the reservation being extended/moved
      if (excludeId && e.reservation_id === excludeId) return false;
      if (excludeEntryId && e.id === excludeEntryId) return false;

      const a = (e.arrival ?? e.report_date ?? '').slice(0, 10);
      const d = (e.departure ?? e.report_date ?? '').slice(0, 10);
      if (!a || !d) return false;
      return isStayOverlapping(ci, co, a, d);
    });

    return !entryOverlap;
  } catch {
    return true;
  }
};

export const assignPhysicalRoom = async (
  reservationId: string,
  roomNo: string,
  roomId?: string | null,
): Promise<Reservation> => {
  try {
    const res = await apiFetch(`/api/reservations/${reservationId}/assign-room`, {
      method: 'POST',
      body: JSON.stringify({ roomNo, roomId }),
    });
    if (res?.reservation) {
      dispatchChannelEvent('ROOM_TRANSFER', {
        startDate: res.reservation.check_in_date,
        endDate: res.reservation.check_out_date,
        room_no: res.reservation.room_no,
      }).catch(e => console.warn('[assignPhysicalRoom] Auto-sync warning:', e));
      return res.reservation;
    }
  } catch (err: any) {
    if (err?.code === 'ROOM_ALREADY_BOOKED' || err?.code === 'ROOM_ASSIGNMENT_CONFLICT') {
      throw new Error(err.message || `Room ${roomNo} is already occupied for these dates.`);
    }
  }

  // Client-side fallback
  const { data: current, error: fetchErr } = await supabase
    .from('reservations')
    .select('check_in_date, check_out_date')
    .eq('id', reservationId)
    .single();
  if (fetchErr || !current) throw new Error('Reservation not found.');

  const norm = roomNo.trim().toLowerCase();
  if (norm && norm !== 'unassigned' && norm !== 'tbd') {
    const available = await checkRoomAvailability(roomNo, current.check_in_date, current.check_out_date, reservationId);
    if (!available) {
      throw new Error(`Room ${roomNo} is no longer available for these dates. Another reservation was assigned to this room. Please choose another room.`);
    }
  }

  const { data: updated, error } = await supabase
    .from('reservations')
    .update({
      room_no: roomNo,
      room_id: roomId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reservationId)
    .select('*')
    .single();

  if (error) throw error;
  const r = updated as Reservation;
  dispatchChannelEvent('ROOM_TRANSFER', {
    startDate: r.check_in_date,
    endDate: r.check_out_date,
    room_no: r.room_no,
  }).catch(e => console.warn('[assignPhysicalRoom] Auto-sync warning:', e));
  return r;
};

export const extractUnassignedReason = (reservation: any): string => {
  const note = reservation?.internal_note || reservation?.remarks || '';
  const match = note.match(/\[UNASSIGNED_REASON:\s*([^\]]+)\]/i);
  if (match) return match[1].trim();
  const room = String(reservation?.room_no || '').trim().toLowerCase();
  if (room === 'tbd' || room === 'unassigned' || !room) {
    return 'UNASSIGNED';
  }
  return '';
};

export const autoAssignReservation = async (
  reservationId: string,
  preferredRoomNo?: string | null,
): Promise<{ success: boolean; roomNo?: string; roomId?: string; categoryName?: string; reason?: string; message?: string }> => {
  try {
    const res = await apiFetch(`/api/reservations/${reservationId}/auto-assign`, {
      method: 'POST',
      body: JSON.stringify({ preferredRoomNo }),
    });
    if (res?.success && res.roomNo) {
      dispatchChannelEvent('ROOM_TRANSFER', {
        room_no: res.roomNo,
      }).catch(e => console.warn('[autoAssignReservation] Auto-sync warning:', e));
    }
    return res;
  } catch (err: any) {
    return {
      success: false,
      reason: err?.code || 'AUTO_ASSIGN_FAILED',
      message: err?.message || 'Automatic room assignment failed.',
    };
  }
};

export const batchAutoAssignReservations = async (): Promise<{
  total: number;
  assignedCount: number;
  unassignedCount: number;
  results: any[];
}> => {
  try {
    const res = await apiFetch('/api/reservations/auto-assign-all', {
      method: 'POST',
    });
    return res;
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to auto-assign unassigned reservations.');
  }
};

export const getAutoAssignSetting = async (): Promise<boolean> => {
  try {
    const res = await apiFetch('/api/reservations/auto-assign-setting');
    return res?.enabled !== false;
  } catch {
    return true; // Default ON
  }
};

export const setAutoAssignSetting = async (enabled: boolean): Promise<boolean> => {
  try {
    const res = await apiFetch('/api/reservations/auto-assign-setting', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
    return res?.enabled !== false;
  } catch {
    return enabled;
  }
};

export const checkInReservation = async (reservationId: string): Promise<Reservation> => {
  try {
    const res = await apiFetch(`/api/reservations/${reservationId}/check-in`, {
      method: 'POST',
    });
    if (res?.reservation) return res.reservation;
  } catch (err: any) {
    throw new Error(err?.message || 'Check-in blocked due to room conflict.');
  }

  // Fallback
  return updateReservationStatus(reservationId, 'checked_in');
};

export const extendReservation = async (params: {
  reservationId: string;
  newCheckOut: string;
}): Promise<Reservation> => {
  const { reservationId, newCheckOut } = params;

  try {
    const res = await apiFetch(`/api/reservations/${reservationId}/extend`, {
      method: 'POST',
      body: JSON.stringify({ newCheckOut }),
    });
    if (res?.reservation) {
      dispatchChannelEvent('STAY_EXTENDED', {
        startDate: res.reservation.check_in_date,
        endDate: res.reservation.check_out_date,
        room_no: res.reservation.room_no,
      }).catch(e => console.warn('[extendReservation] Auto-sync warning:', e));
      return res.reservation;
    }
  } catch (err: any) {
    if (err?.code === 'ROOM_ALREADY_BOOKED' || err?.code === 'INVALID_STAY_DATES') {
      throw new Error(err.message);
    }
  }

  const { data: current, error: fetchErr } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!current) throw new Error('Reservation not found.');
  const res = current as Reservation;

  if (new Date(newCheckOut + 'T00:00:00') <= new Date(res.check_in_date + 'T00:00:00')) {
    throw new Error('New check-out date must be after check-in date.');
  }

  const available = await checkRoomAvailability(res.room_no, res.check_in_date, newCheckOut, reservationId);
  if (!available) {
    throw new Error('Room is not available for the extended date range (conflict detected).');
  }

  // Update reservations (do NOT pass 'nights' because it is PostgreSQL GENERATED ALWAYS AS STORED column)
  const { data: updated, error } = await supabase
    .from('reservations')
    .update({
      check_out_date: newCheckOut,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reservationId)
    .select('*')
    .single();
  if (error) throw error;

  if (res.status === 'checked_in') {
    try {
      const hotelId = getCurrentHotelId();
      const newNights = calcStayNights(res.check_in_date, newCheckOut);

      await supabase
        .from('room_chart_entries')
        .update({
          departure: newCheckOut,
          nights: newNights,
        })
        .eq('hotel_id', hotelId)
        .eq('room_no', res.room_no)
        .is('checked_out_at', null);
    } catch {
      /* non-critical fallback */
    }
  }

  dispatchChannelEvent('STAY_EXTENDED', {
    startDate: res.check_in_date,
    endDate: newCheckOut,
    room_no: res.room_no,
  }).catch(e => console.warn('[extendReservation] Auto-sync warning:', e));

  return updated as Reservation;
};

// ── Phase 9: Drag & Drop — Move Reservation ──

export const moveReservation = async (params: {
  reservationId: string;
  newRoomNo?: string;
  newCheckIn?: string;
  newCheckOut?: string;
}): Promise<Reservation> => {
  const { reservationId, newRoomNo, newCheckIn, newCheckOut } = params;

  // Fetch current reservation
  const { data: current, error: fetchErr } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!current) throw new Error('Reservation not found.');
  const res = current as Reservation;

  const roomNo = newRoomNo ?? res.room_no;
  const checkIn = newCheckIn ?? res.check_in_date;
  const checkOut = newCheckOut ?? res.check_out_date;

  if (res.status === 'checked_in') {
    if (roomNo === res.room_no && checkIn === res.check_in_date && checkOut > res.check_out_date) {
      return extendReservation({ reservationId, newCheckOut: checkOut });
    }
    throw new Error('Cannot change room or check-in date for a checked-in guest. Use Room Shift or Extend Stay.');
  }

  if (res.status === 'checked_out') {
    throw new Error('Cannot move a reservation that is already checked out.');
  }

  // Validate availability of new room/dates
  const available = await checkRoomAvailability(roomNo, checkIn, checkOut, reservationId);
  if (!available) {
    throw new Error('Room is not available for the selected dates (overlap or block detected).');
  }

  const { data: updated, error } = await supabase
    .from('reservations')
    .update({
      room_no: roomNo,
      check_in_date: checkIn,
      check_out_date: checkOut,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reservationId)
    .select('*')
    .single();
  if (error) throw error;

  dispatchChannelEvent('ROOM_TRANSFER', {
    startDate: checkIn,
    endDate: checkOut,
    room_no: roomNo,
  }).catch(e => console.warn('[moveReservation] Auto-sync warning:', e));

  return updated as Reservation;
};

// ── Phase 9: Split Reservation ──

export const splitReservation = async (params: {
  reservationId: string;
  newRoomNo: string;
  splitDate: string;
}): Promise<Reservation> => {
  const { reservationId, newRoomNo, splitDate } = params;

  const { data: current, error: fetchErr } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!current) throw new Error('Reservation not found.');
  const original = current as Reservation;

  // Validate new room availability from split date to original checkout
  const available = await checkRoomAvailability(newRoomNo, splitDate, original.check_out_date, reservationId);
  if (!available) {
    throw new Error('Target room is not available for the split period.');
  }

  // Create new reservation for the split portion
  const { data: newRes, error: insertErr } = await supabase
    .from('reservations')
    .insert({
      hotel_id: original.hotel_id,
      room_id: null,
      room_no: newRoomNo,
      guest_name: original.guest_name,
      guest_phone: original.guest_phone,
      guest_email: original.guest_email,
      guest_address: original.guest_address,
      guest_type: original.guest_type,
      company_gst: original.company_gst,
      check_in_date: splitDate,
      check_out_date: original.check_out_date,
      rate: original.rate,
      source_category: original.source_category,
      source_name: original.source_name,
      payment_mode: original.payment_mode,
      advance_paid: 0,
      meal_plan: original.meal_plan,
      gst_type: original.gst_type,
      gst_slab: original.gst_slab,
      adults: original.adults,
      children: original.children,
      remarks: `Split from ${original.room_no} on ${splitDate}. ${original.remarks}`,
      status: 'confirmed',
      group_id: original.group_id,
      rate_plan: original.rate_plan,
      parent_reservation_id: original.id,
      guest_id: original.guest_id,
    })
    .select('*')
    .single();
  if (insertErr) throw insertErr;

  // Update original reservation's checkout to split date
  await supabase
    .from('reservations')
    .update({
      check_out_date: splitDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reservationId);

  return newRes as Reservation;
};

// ── Phase 9: Group Bookings ──

export const createGroupBooking = async (params: {
  group: ReservationGroupInput;
  rooms: Array<{
    room_no: string;
    guest_name: string;
    guest_phone?: string;
    check_in: string;
    check_out: string;
    rate: number;
    adults?: number;
    children?: number;
    source_category?: string;
    meal_plan?: string;
  }>;
}): Promise<{ group: ReservationGroup; reservations: Reservation[] }> => {
  const hotelId = getCurrentHotelId();
  const confirmationNumber = `GRP-${Date.now().toString(36).toUpperCase()}`;

  // Create group
  const { data: groupData, error: groupErr } = await supabase
    .from('reservation_groups')
    .insert({
      hotel_id: hotelId,
      group_name: params.group.group_name,
      contact_person: params.group.contact_person ?? '',
      contact_phone: params.group.contact_phone ?? '',
      contact_email: params.group.contact_email ?? '',
      total_rooms: params.rooms.length,
      total_guests: params.group.total_guests ?? params.rooms.reduce((s, r) => s + (r.adults ?? 1), 0),
      confirmation_number: confirmationNumber,
      notes: params.group.notes ?? '',
    })
    .select('*')
    .single();
  if (groupErr) throw groupErr;
  const group = groupData as ReservationGroup;

  // Create reservations for each room
  const reservations: Reservation[] = [];
  for (const room of params.rooms) {
    const nights = calcStayNights(room.check_in, room.check_out);

    // Validate availability
    const available = await checkRoomAvailability(room.room_no, room.check_in, room.check_out);
    if (!available) {
      throw new Error(`Room ${room.room_no} is not available for the selected dates.`);
    }

    const { data: resData, error: resErr } = await supabase
      .from('reservations')
      .insert({
        hotel_id: hotelId,
        room_id: null,
        room_no: room.room_no,
        guest_name: room.guest_name,
        guest_phone: room.guest_phone ?? '',
        check_in_date: room.check_in,
        check_out_date: room.check_out,
        nights,
        rate: room.rate,
        source_category: room.source_category ?? 'Direct/Walking',
        meal_plan: room.meal_plan ?? 'EP',
        adults: room.adults ?? 1,
        children: room.children ?? 0,
        status: 'confirmed',
        group_id: group.id,
        rate_plan: 'Base',
      })
      .select('*')
      .single();
    if (resErr) throw resErr;
    reservations.push(resData as Reservation);
  }

  return { group, reservations };
};

export const getReservationGroups = async (): Promise<ReservationGroup[]> => {
  const { data, error } = await supabase
    .from('reservation_groups')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as ReservationGroup[]) ?? [];
};

export const getGroupReservations = async (groupId: string): Promise<Reservation[]> => {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('group_id', groupId)
    .order('room_no', { ascending: true });
  if (error) throw error;
  return (data as Reservation[]) ?? [];
};

// ── Phase 9: Rate Plans ──

export const getRatePlans = async (): Promise<RatePlan[]> => {
  const { data, error } = await supabase
    .from('rate_plans')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('plan_type', { ascending: true });
  if (error) throw error;
  return (data as RatePlan[]) ?? [];
};

export const saveRatePlan = async (input: RatePlanInput, id?: string): Promise<RatePlan> => {
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  if (id) {
    const { data, error } = await supabase.from('rate_plans').update(payload).eq('id', id).select('*').single();
    if (error) throw error;
    return data as RatePlan;
  }
  const { data, error } = await supabase.from('rate_plans').insert(payload).select('*').single();
  if (error) throw error;
  return data as RatePlan;
};

export const deleteRatePlan = async (id: string): Promise<void> => {
  const { error } = await supabase.from('rate_plans').delete().eq('id', id);
  if (error) throw error;
};

export const getApplicableRate = (plan: RatePlan, date: string): number => {
  const day = new Date(date + 'T00:00:00');
  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
  if (plan.start_date && plan.end_date) {
    const d = date;
    if (d >= plan.start_date && d <= plan.end_date && plan.season_rate > 0) {
      return plan.season_rate;
    }
  }
  if (isWeekend && plan.weekend_rate > 0) return plan.weekend_rate;
  return plan.base_rate;
};

// ── Phase 9: Waitlist ──

export const getWaitlist = async (status?: WaitlistStatus): Promise<WaitlistEntry[]> => {
  let q = supabase
    .from('waitlist')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('check_in', { ascending: true });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data as WaitlistEntry[]) ?? [];
};

export const addToWaitlist = async (input: WaitlistInput): Promise<WaitlistEntry> => {
  const nights = input.nights ?? calcStayNights(input.check_in, input.check_out);
  const { data, error } = await supabase
    .from('waitlist')
    .insert({
      ...input,
      hotel_id: getCurrentHotelId(),
      nights,
      status: 'waiting',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as WaitlistEntry;
};

export const updateWaitlistStatus = async (id: string, status: WaitlistStatus): Promise<void> => {
  const patch: Record<string, unknown> = { status };
  if (status === 'notified') patch.notified_at = new Date().toISOString();
  const { error } = await supabase.from('waitlist').update(patch).eq('id', id);
  if (error) throw error;
};

export const deleteWaitlistEntry = async (id: string): Promise<void> => {
  const { error } = await supabase.from('waitlist').delete().eq('id', id);
  if (error) throw error;
};

// Auto-notify waitlist when a room becomes available
export const checkWaitlistAvailability = async (): Promise<WaitlistEntry[]> => {
  const waiting = await getWaitlist('waiting');
  const notified: WaitlistEntry[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const entry of waiting) {
    if (entry.check_in < today) continue;
    // Check if any room in the requested category is available
    const { data: rooms } = await supabase
      .from('rooms')
      .select('room_no')
      .eq('hotel_id', getCurrentHotelId())
      .eq('is_active', true);

    for (const room of (rooms ?? [])) {
      const available = await checkRoomAvailability(
        (room as { room_no: string }).room_no,
        entry.check_in,
        entry.check_out,
      );
      if (available) {
        await updateWaitlistStatus(entry.id, 'notified');
        notified.push(entry);
        break;
      }
    }
  }
  return notified;
};

// ── Phase 9: Room Blocks ──

export const getRoomBlocks = async (): Promise<RoomBlock[]> => {
  const { data, error } = await supabase
    .from('room_blocks')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('start_date', { ascending: true });
  if (error) throw error;
  return (data as RoomBlock[]) ?? [];
};

export const createRoomBlock = async (input: RoomBlockInput): Promise<RoomBlock> => {
  const { data, error } = await supabase
    .from('room_blocks')
    .insert({ ...input, hotel_id: getCurrentHotelId() })
    .select('*')
    .single();
  if (error) throw error;
  const block = data as RoomBlock;
  dispatchChannelEvent('ROOM_BLOCKED', {
    startDate: block.start_date,
    endDate: block.end_date,
    room_no: block.room_no,
  }).catch(e => console.warn('[createRoomBlock] Auto-sync warning:', e));
  return block;
};

export const deleteRoomBlock = async (id: string): Promise<void> => {
  const { data: existing } = await supabase
    .from('room_blocks')
    .select('start_date, end_date, room_no')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('room_blocks').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    dispatchChannelEvent('ROOM_UNBLOCKED', {
      startDate: existing.start_date,
      endDate: existing.end_date,
      room_no: existing.room_no,
    }).catch(e => console.warn('[deleteRoomBlock] Auto-sync warning:', e));
  }
};

// ── Phase 9: Bulk Operations ──

export const bulkCheckIn = async (reservationIds: string[]): Promise<Reservation[]> => {
  const results: Reservation[] = [];
  for (const id of reservationIds) {
    const res = await updateReservationStatus(id, 'checked_in');
    results.push(res);
  }
  return results;
};

export const bulkCheckOut = async (reservationIds: string[]): Promise<Reservation[]> => {
  const results: Reservation[] = [];
  for (const id of reservationIds) {
    const res = await updateReservationStatus(id, 'checked_out');
    results.push(res);
  }
  return results;
};

export const bulkCancel = async (reservationIds: string[]): Promise<Reservation[]> => {
  const results: Reservation[] = [];
  for (const id of reservationIds) {
    const res = await updateReservationStatus(id, 'cancelled');
    results.push(res);
  }
  return results;
};

// ── Phase 9: Alerts ──

export interface ReservationAlert {
  type: 'overbooking' | 'duplicate' | 'guest_overlap' | 'payment_pending' | 'vip_arrival' | 'room_not_ready';
  message: string;
  reservationId?: string;
  roomNo?: string;
  severity: 'warning' | 'error' | 'info';
}

export const getReservationAlerts = async (reservations: Reservation[]): Promise<ReservationAlert[]> => {
  const alerts: ReservationAlert[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // Physical room overbooking detection (ignoring unassigned/TBD)
  const physicalReservations = reservations.filter((r) => {
    if (!isReservationRoomBlocking(r.status)) return false;
    const room = (r.room_no || '').trim().toLowerCase();
    return room && room !== 'unassigned' && room !== 'tbd';
  });

  const roomGroups = new Map<string, Reservation[]>();
  for (const r of physicalReservations) {
    const key = r.room_no.trim();
    if (!roomGroups.has(key)) roomGroups.set(key, []);
    roomGroups.get(key)!.push(r);
  }

  for (const [roomNo, list] of roomGroups) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (isStayOverlapping(a.check_in_date, a.check_out_date, b.check_in_date, b.check_out_date)) {
          alerts.push({
            type: 'overbooking',
            message: `Room ${roomNo} has overlapping bookings: ${a.guest_name} (${a.check_in_date} to ${a.check_out_date}) and ${b.guest_name} (${b.check_in_date} to ${b.check_out_date})`,
            roomNo,
            reservationId: a.id,
            severity: 'error',
          });
        }
      }
    }
  }

  // Duplicate reservation detection: only if same guest, same dates AND same physical room
  // (Legitimate multiple room bookings for same guest on different rooms are allowed)
  const guestRoomMap = new Map<string, Reservation[]>();
  for (const r of reservations) {
    if (!isReservationRoomBlocking(r.status)) continue;
    const room = (r.room_no || '').trim().toLowerCase();
    const key = `${r.guest_name.toLowerCase().trim()}|${r.check_in_date}|${r.check_out_date}|${room}`;
    if (!guestRoomMap.has(key)) guestRoomMap.set(key, []);
    guestRoomMap.get(key)!.push(r);
  }
  for (const [, resList] of guestRoomMap) {
    if (resList.length > 1) {
      alerts.push({
        type: 'duplicate',
        message: `Duplicate reservation: ${resList[0].guest_name} has multiple bookings for Room ${resList[0].room_no || 'Unassigned'} on the same dates`,
        reservationId: resList[0].id,
        severity: 'warning',
      });
    }
  }

  // Payment pending (advance paid = 0 for confirmed reservations with check-in today or past)
  for (const r of reservations) {
    if (r.status === 'confirmed' && r.check_in_date <= today && r.advance_paid === 0) {
      alerts.push({
        type: 'payment_pending',
        message: `Payment pending: ${r.guest_name} (Room ${r.room_no}) has no advance paid`,
        reservationId: r.id,
        roomNo: r.room_no,
        severity: 'warning',
      });
    }
  }

  // Room not ready (confirmed reservation arriving today, room is dirty)
  const { data: dirtyRooms } = await supabase
    .from('rooms')
    .select('room_no, housekeeping_status')
    .eq('hotel_id', getCurrentHotelId())
    .eq('housekeeping_status', 'Vacant Dirty');
  const dirtySet = new Set((dirtyRooms ?? []).map((r: { room_no: string }) => r.room_no.trim().toLowerCase()));
  for (const r of reservations) {
    if (r.status === 'confirmed' && r.check_in_date === today && dirtySet.has(r.room_no.trim().toLowerCase())) {
      alerts.push({
        type: 'room_not_ready',
        message: `Room ${r.room_no} is not ready for arriving guest ${r.guest_name}`,
        reservationId: r.id,
        roomNo: r.room_no,
        severity: 'warning',
      });
    }
  }

  return alerts;
};

// ── Phase 9: Availability Engine ──

export interface RoomAvailability {
  room_no: string;
  category: string;
  floor: string;
  status: 'Vacant' | 'Occupied' | 'Reserved' | 'Dirty' | 'OutOfOrder' | 'Blocked' | 'HouseUse' | 'Complimentary';
  guestName?: string;
  reservationId?: string;
  checkOut?: string;
}

export const getRoomAvailabilityForDate = async (date: string): Promise<RoomAvailability[]> => {
  const hotelId = getCurrentHotelId();

  // Get all active rooms safely
  let rooms: Array<Record<string, unknown>> = [];
  try {
    const { data, error } = await supabase
      .from('rooms')
      .select('*, room_categories!inner(name)')
      .eq('hotel_id', hotelId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (!error && data && data.length > 0) {
      rooms = data as Array<Record<string, unknown>>;
    }
  } catch {
    // Fallback to getRooms and getRoomCategories
  }

  if (rooms.length === 0) {
    const [allRms, allCats] = await Promise.all([getRooms(), getRoomCategories()]);
    const catMap = new Map(allCats.map((c) => [c.id, c.name]));
    rooms = allRms.map((r) => ({
      room_no: r.room_no,
      room_categories: { name: (r.category_id ? catMap.get(r.category_id) : null) ?? 'Standard' },
      floor: r.floor ?? 'Floor 1',
      housekeeping_status: r.housekeeping_status ?? 'Vacant Clean',
    }));
  }

  // Get occupied rooms (checked-in entries)
  let occupied: Array<{ room_no: string; guest_name: string; departure: string }> = [];
  try {
    const { data } = await supabase
      .from('room_chart_entries')
      .select('room_no, guest_name, departure')
      .eq('hotel_id', hotelId)
      .is('checked_out_at', null);
    if (data) occupied = data;
  } catch { /* fallback empty */ }

  const occupiedMap = new Map(occupied.map((e) =>
    [e.room_no.trim().toLowerCase(), { guestName: e.guest_name, checkOut: e.departure }],
  ));

  // Get reservations for this date
  let reservations: Array<{ id: string; room_no: string; guest_name: string; check_out_date: string }> = [];
  try {
    const { data } = await supabase
      .from('reservations')
      .select('id, room_no, guest_name, check_out_date, status')
      .eq('hotel_id', hotelId)
      .in('status', ['confirmed', 'checked_in'])
      .lte('check_in_date', date)
      .gte('check_out_date', date);
    if (data) reservations = data;
  } catch { /* fallback empty */ }

  const reservedMap = new Map(reservations.map((r) =>
    [r.room_no.trim().toLowerCase(), { reservationId: r.id, guestName: r.guest_name, checkOut: r.check_out_date }],
  ));

  // Get room blocks for this date
  let blocks: Array<{ room_no: string; block_type: string }> = [];
  try {
    const { data } = await supabase
      .from('room_blocks')
      .select('room_no, block_type')
      .eq('hotel_id', hotelId)
      .lte('start_date', date)
      .gte('end_date', date);
    if (data) blocks = data;
  } catch { /* fallback empty */ }

  const blockMap = new Map(blocks.map((b) =>
    [b.room_no.trim().toLowerCase(), b.block_type],
  ));

  return rooms.map((r) => {
    const roomNo = ((r.room_no ?? r.room_number) as string) ?? '';
    const key = roomNo.trim().toLowerCase();
    const category = ((r.room_categories as { name: string } | null)?.name) ?? 'Standard';
    const floor = (r.floor as string) ?? '';
    const hkStatus = (r.housekeeping_status as string) ?? 'Vacant Clean';

    let status: RoomAvailability['status'] = 'Vacant';
    let guestName: string | undefined;
    let reservationId: string | undefined;
    let checkOut: string | undefined;

    if (blockMap.has(key)) {
      status = blockMap.get(key) as RoomAvailability['status'];
    } else if (occupiedMap.has(key)) {
      status = 'Occupied';
      const occ = occupiedMap.get(key)!;
      guestName = occ.guestName;
      checkOut = occ.checkOut;
    } else if (reservedMap.has(key)) {
      status = 'Reserved';
      const res = reservedMap.get(key)!;
      guestName = res.guestName;
      reservationId = res.reservationId;
      checkOut = res.checkOut;
    } else if (hkStatus === 'Vacant Dirty') {
      status = 'Dirty';
    }

    return { room_no: roomNo, category, floor, status, guestName, reservationId, checkOut };
  });
};

// ── Phase 9: Room Upgrade Suggestion ──

export const suggestRoomUpgrade = async (params: {
  checkIn: string;
  checkOut: string;
  requestedCategory: string;
}): Promise<{ roomNo: string; category: string; rate: number } | null> => {
  const hotelId = getCurrentHotelId();

  // Get all rooms with categories
  const { data: rooms } = await supabase
    .from('rooms')
    .select('*, room_categories!inner(name, default_tariff)')
    .eq('hotel_id', hotelId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  // Find available rooms in higher categories
  for (const room of (rooms ?? []) as Array<Record<string, unknown>>) {
    const cat = (room.room_categories as { name: string; default_tariff: number } | null);
    if (!cat) continue;
    if (cat.name === params.requestedCategory) continue; // Skip same category

    const roomNo = room.room_no as string;
    const available = await checkRoomAvailability(roomNo, params.checkIn, params.checkOut);
    if (available) {
      return { roomNo, category: cat.name, rate: cat.default_tariff };
    }
  }
  return null;
};

// ── Phase 9: Quick Reservation ──

export const quickReservation = async (params: {
  roomNo: string;
  guestName: string;
  guestPhone?: string;
  checkIn: string;
  checkOut: string;
  rate: number;
  sourceCategory?: string;
}): Promise<Reservation> => {
  const available = await checkRoomAvailability(params.roomNo, params.checkIn, params.checkOut);
  if (!available) throw new Error('Room is not available for the selected dates.');

  const nights = calcStayNights(params.checkIn, params.checkOut);

  return saveReservation({
    room_id: null,
    room_no: params.roomNo,
    guest_name: params.guestName,
    guest_phone: params.guestPhone ?? '',
    check_in_date: params.checkIn,
    check_out_date: params.checkOut,
    nights,
    rate: params.rate,
    source_category: params.sourceCategory ?? 'Direct/Walking',
    status: 'confirmed',
    rate_plan: 'Walk-in',
  });
};

// ── Phase 10: Server-side Paginated Reservations & Conflict Diagnostic ──

export interface ReservationFilterParams {
  page?: number;
  pageSize?: number;
  search?: string;
  fromDate?: string;
  toDate?: string;
  status?: string;
  sourceCategory?: string;
  assignedStatus?: 'all' | 'assigned' | 'unassigned';
  roomNo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedReservationsResult {
  reservations: Reservation[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const getReservationsPaginated = async (
  params: ReservationFilterParams = {}
): Promise<PaginatedReservationsResult> => {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.search) query.set('search', params.search);
  if (params.fromDate) query.set('fromDate', params.fromDate);
  if (params.toDate) query.set('toDate', params.toDate);
  if (params.status) query.set('status', params.status);
  if (params.sourceCategory) query.set('sourceCategory', params.sourceCategory);
  if (params.assignedStatus) query.set('assignedStatus', params.assignedStatus);
  if (params.roomNo) query.set('roomNo', params.roomNo);
  if (params.sortBy) query.set('sortBy', params.sortBy);
  if (params.sortOrder) query.set('sortOrder', params.sortOrder);

  try {
    const res = await apiFetch(`/api/reservations?${query.toString()}`);
    if (res && res.success) {
      return {
        reservations: res.reservations || [],
        totalCount: res.totalCount || 0,
        page: res.page || 1,
        pageSize: res.pageSize || 20,
        totalPages: res.totalPages || 1,
      };
    }
  } catch (err) {
    console.warn('[getReservationsPaginated] Backend endpoint fallback to Supabase query:', err);
  }

  // Fallback to direct Supabase query
  const hotelId = getCurrentHotelId();
  const pageNum = params.page || 1;
  const limit = params.pageSize || 20;
  const offset = (pageNum - 1) * limit;

  let q = supabase
    .from('reservations')
    .select('*', { count: 'exact' })
    .eq('hotel_id', hotelId);

  if (params.status && params.status !== 'all') {
    q = q.eq('status', params.status);
  }
  if (params.sourceCategory && params.sourceCategory !== 'all') {
    q = q.eq('source_category', params.sourceCategory);
  }
  if (params.roomNo && params.roomNo !== 'all') {
    q = q.ilike('room_no', params.roomNo.trim());
  }
  if (params.assignedStatus === 'unassigned') {
    q = q.or('room_no.is.null,room_no.eq.,room_no.ilike.unassigned,room_no.ilike.tbd');
  } else if (params.assignedStatus === 'assigned') {
    q = q.not('room_no', 'is', null).neq('room_no', '').not('room_no', 'ilike', 'unassigned').not('room_no', 'ilike', 'tbd');
  }
  if (params.fromDate && params.toDate) {
    q = q.lt('check_in_date', params.toDate).gt('check_out_date', params.fromDate);
  } else if (params.fromDate) {
    q = q.gte('check_out_date', params.fromDate);
  } else if (params.toDate) {
    q = q.lte('check_in_date', params.toDate);
  }
  if (params.search && params.search.trim()) {
    const s = params.search.trim();
    q = q.or(`guest_name.ilike.%${s}%,guest_phone.ilike.%${s}%,guest_email.ilike.%${s}%,room_no.ilike.%${s}%,payment_ref.ilike.%${s}%`);
  }

  const isAsc = params.sortOrder === 'asc';
  q = q.order(params.sortBy || 'check_in_date', { ascending: isAsc }).range(offset, offset + limit - 1);

  const { data, count, error } = await q;
  if (error) throw error;

  return {
    reservations: (data as Reservation[]) || [],
    totalCount: count || 0,
    page: pageNum,
    pageSize: limit,
    totalPages: Math.ceil((count || 0) / limit),
  };
};

export const getReservationConflicts = async (): Promise<any[]> => {
  try {
    const res = await apiFetch('/api/reservations/conflicts');
    if (res && res.success) {
      return res.conflicts || [];
    }
  } catch (err) {
    console.warn('[getReservationConflicts] Fallback to client check:', err);
  }

  // Client-side detection fallback
  const hotelId = getCurrentHotelId();
  const { data: res } = await supabase
    .from('reservations')
    .select('*')
    .eq('hotel_id', hotelId)
    .in('status', ['confirmed', 'checked_in'])
    .order('check_in_date', { ascending: true });

  const list = (res as Reservation[]) || [];
  const conflicts: any[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const rA = (a.room_no || '').trim().toLowerCase();
      const rB = (b.room_no || '').trim().toLowerCase();
      if (!rA || rA === 'unassigned' || rA === 'tbd' || !rB || rB === 'unassigned' || rB === 'tbd') continue;
      if (rA === rB || (a.room_id && b.room_id && a.room_id === b.room_id)) {
        if (isStayOverlapping(a.check_in_date, a.check_out_date, b.check_in_date, b.check_out_date)) {
          conflicts.push({
            type: 'physical_room_overlap',
            roomNo: a.room_no,
            reservationA: a,
            reservationB: b,
          });
        }
      }
    }
  }
  return conflicts;
};

/**
 * Authoritative Reservation Confirmation Data Service (Section 16)
 * Single authoritative source of truth for PDF, Print, Email, and WhatsApp.
 */
export const getReservationConfirmationData = async (
  reservationId: string
): Promise<ReservationConfirmationData> => {
  if (!reservationId) {
    throw new Error('Reservation ID is required.');
  }

  // 1. Try fetching authoritative reservation record
  let reservation: Reservation | null = null;
  const { data: resData } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .maybeSingle();

  if (resData) {
    reservation = resData as Reservation;
  } else {
    // Check if reservationId is actually a room_chart_entry id
    const { data: entryData } = await supabase
      .from('room_chart_entries')
      .select('*')
      .eq('id', reservationId)
      .maybeSingle();

    if (entryData) {
      if (entryData.reservation_id) {
        const { data: linkedRes } = await supabase
          .from('reservations')
          .select('*')
          .eq('id', entryData.reservation_id)
          .maybeSingle();
        if (linkedRes) {
          reservation = linkedRes as Reservation;
        }
      }

      // If no linked reservation exists, synthesize authoritative reservation from entry
      if (!reservation) {
        const advance = toNum(entryData.pay_cash) + toNum(entryData.pay_upi) + toNum(entryData.pay_card) + toNum(entryData.pay_bank);
        reservation = {
          id: entryData.id,
          hotel_id: entryData.hotel_id,
          room_id: null,
          room_no: entryData.room_no || 'Unassigned',
          guest_name: entryData.guest_name || 'Valued Guest',
          guest_phone: '',
          guest_email: '',
          guest_address: '',
          guest_type: entryData.source_category || 'Direct',
          company_gst: '',
          check_in_date: entryData.arrival || entryData.report_date,
          check_out_date: entryData.departure || entryData.report_date,
          nights: entryData.nights || 1,
          rate: toNum(entryData.room_rate),
          source_category: entryData.source_category || 'Direct',
          source_name: entryData.company || 'Direct',
          payment_mode: entryData.pay_mode || 'Cash',
          advance_paid: advance,
          pay_cash: toNum(entryData.pay_cash),
          pay_upi: toNum(entryData.pay_upi),
          pay_card: toNum(entryData.pay_card),
          pay_bank: toNum(entryData.pay_bank),
          payment_ref: '',
          discount: 0,
          meal_plan: entryData.meal_plan || 'EP',
          gst_type: entryData.gst_type || 'No Scope',
          gst_slab: 0,
          gst_amount: toNum(entryData.gst_amount),
          taxable_amount: toNum(entryData.taxable_amount) || toNum(entryData.total),
          invoice_total: toNum(entryData.invoice_total) || toNum(entryData.total),
          adults: 1,
          children: 0,
          remarks: entryData.remarks || '',
          internal_note: '',
          created_by: 'STAFF',
          status: entryData.checked_out_at ? 'checked_out' : 'checked_in',
          room_chart_entry_id: entryData.id,
          group_id: null,
          rate_plan: 'Standard',
          parent_reservation_id: null,
          guest_id: null,
          created_at: entryData.created_at || new Date().toISOString(),
          updated_at: entryData.updated_at || new Date().toISOString(),
        };
      }
    }
  }

  if (!reservation) {
    throw new Error('Reservation record not found.');
  }

  const hotelId = reservation.hotel_id || getCurrentHotelId();

  // 2. Load linked guest record if available
  let guest = {
    id: reservation.guest_id || undefined,
    name: reservation.guest_name || 'Valued Guest',
    phone: reservation.guest_phone || '',
    email: reservation.guest_email || '',
    address: reservation.guest_address || '',
  };

  if (reservation.guest_id) {
    const { data: g } = await supabase
      .from('guests')
      .select('*')
      .eq('id', reservation.guest_id)
      .maybeSingle();
    if (g) {
      guest = {
        id: g.id,
        name: g.name || guest.name,
        phone: g.phone || guest.phone,
        email: g.email || guest.email,
        address: g.address || guest.address,
      };
    }
  }

  // 3. Load hotel settings and hotel record
  const [{ data: settingsData }, { data: hotelData }] = await Promise.all([
    supabase.from('hotel_settings').select('*').eq('id', hotelId).maybeSingle(),
    supabase.from('hotels').select('*').eq('id', hotelId).maybeSingle(),
  ]);

  const hotelSettings = settingsData || {};
  const hotelInfo = hotelData || {};

  const hotelName = hotelSettings.hotel_name || hotelInfo.hotel_name || 'Hotel Mantri';
  const hotelPhone = hotelSettings.phone || hotelInfo.phone || '';
  const hotelEmail = hotelSettings.email || hotelInfo.email || '';
  const hotelAddress = [
    hotelSettings.address || hotelInfo.address,
    hotelSettings.city,
    hotelSettings.state_name,
    hotelSettings.pin_code,
  ].filter(Boolean).join(', ');

  const hotel = {
    id: hotelId,
    hotel_name: hotelName,
    phone: hotelPhone,
    email: hotelEmail,
    address: hotelAddress,
    city: hotelSettings.city || '',
    state_name: hotelSettings.state_name || '',
    pin_code: hotelSettings.pin_code || '',
    gst_number: hotelSettings.gst_number || '',
    logo_url: hotelSettings.logo_url,
    check_in_time: hotelSettings.check_in_time || '12:00 Hrs',
    check_out_time: hotelSettings.check_out_time || '10:00 Hrs',
    cancellation_policy: hotelSettings.cancellation_policy || 'Standard cancellation policy applies.',
    important_notes: hotelSettings.important_notes || '',
  };

  // 4. Resolve room category
  let roomCategory = reservation.rate_plan || (reservation as any).room_category || 'Standard';
  let roomId = reservation.room_id || undefined;
  if (reservation.room_no && reservation.room_no !== 'Unassigned') {
    const { data: rooms } = await supabase.from('rooms').select('*').eq('hotel_id', hotelId);
    const room = (rooms || []).find((r: any) => r.room_no?.trim().toLowerCase() === reservation.room_no?.trim().toLowerCase());
    if (room) {
      roomId = room.id;
      if (room.category_id) {
        const { data: cat } = await supabase.from('room_categories').select('*').eq('id', room.category_id).maybeSingle();
        if (cat?.name) {
          roomCategory = cat.name;
        }
      }
    }
  }

  // 5. Calculate stay dates (Hotel-local dates inclusive check-in, exclusive check-out)
  const checkIn = String(reservation.check_in_date || '').slice(0, 10);
  const checkOut = String(reservation.check_out_date || '').slice(0, 10);
  const nights = calcStayNights(checkIn, checkOut);
  const bookingDate = reservation.created_at || new Date().toISOString();

  // 6. Calculate authoritative charges
  const rate = Number(reservation.rate) || 0;
  const roomCharges = rate * nights;
  const taxableAmount = Number(reservation.taxable_amount) || roomCharges;
  const gstAmount = Number(reservation.gst_amount) || 0;
  const totalAmount = Number(reservation.invoice_total) || (taxableAmount + gstAmount);

  // 7. Calculate authoritative payments and balance
  const advancePaid = Number(reservation.advance_paid) || 0;
  const balance = Math.max(0, totalAmount - advancePaid);
  const paymentStatus = (balance === 0 ? 'Paid' : (advancePaid > 0 ? 'Partially Paid' : 'Pending')) as 'Paid' | 'Partially Paid' | 'Pending';
  const paymentMode = reservation.payment_mode || 'Cash';

  // 8. Resolve booking source & OTA details
  const rawNote = `${reservation.internal_note || ''} ${reservation.remarks || ''}`;
  const otaMatch = rawNote.match(/\[OTA_BOOKING_ID:\s*([^\]]+)\]/i) || rawNote.match(/\[AIOSELL_BOOKING_ID:\s*([^\]]+)\]/i);
  const otaBookingId = otaMatch && otaMatch[1] ? otaMatch[1].trim() : '';
  const catStr = String(reservation.source_category || '').toLowerCase();
  const nameStr = String(reservation.source_name || '').toLowerCase();

  const isOta = !!(otaBookingId || catStr.includes('ota') || String(reservation.guest_type || '').toUpperCase() === 'OTA' ||
    nameStr.includes('agoda') || nameStr.includes('makemytrip') || nameStr.includes('booking') || nameStr.includes('goibibo'));

  const sourceType = (isOta ? 'OTA' : 'MANUAL') as 'OTA' | 'MANUAL';
  const sourceName = reservation.source_name || reservation.source_category || (isOta ? 'OTA' : 'Direct');
  const shortId = (reservation.id || '').slice(0, 8).toUpperCase();
  const confirmationNumber = otaBookingId || `HM-RES-${shortId}`;

  // 9. Resolve contacts according to Section 12 rule:
  // Manual -> Guest email. OTA -> Owner email.
  const targetEmail = isOta ? (hotelEmail || null) : (guest.email || null);
  const targetPhone = guest.phone || hotelPhone || null;

  return {
    hotel,
    guest,
    reservation,
    room: {
      room_no: reservation.room_no || 'Unassigned',
      room_id: roomId,
      room_category: roomCategory,
      rate_plan: reservation.rate_plan || 'Standard',
      meal_plan: reservation.meal_plan || 'EP',
    },
    dates: {
      checkIn,
      checkOut,
      nights,
      bookingDate,
    },
    charges: {
      rate,
      roomCharges,
      taxableAmount,
      gstAmount,
      totalAmount,
    },
    payments: {
      advancePaid,
      paymentMode,
      paymentStatus,
    },
    balance,
    source: {
      sourceType,
      sourceName,
      otaBookingId,
      confirmationNumber,
    },
    contacts: {
      guestContact: {
        name: guest.name,
        phone: guest.phone,
        email: guest.email,
      },
      ownerContact: {
        name: hotelName,
        phone: hotelPhone,
        email: hotelEmail,
      },
      targetEmail,
      targetPhone,
    },
  };
};

/**
 * Builds the authoritative WhatsApp confirmation message (Section 15)
 */
export const buildWhatsAppConfirmationText = (data: ReservationConfirmationData): string => {
  const hotelName = data.hotel.hotel_name || 'Hotel Mantri';
  const lines = [
    `*${hotelName} Reservation Confirmation*`,
    '',
    `Guest: ${data.guest.name}`,
    `Booking ID: ${data.source.confirmationNumber}`,
    `Room: ${data.room.room_no} - ${data.room.room_category}`,
    `Check-in: ${data.dates.checkIn}`,
    `Check-out: ${data.dates.checkOut}`,
    `Nights: ${data.dates.nights}`,
    '',
    `Grand Total: ₹${Math.round(data.charges.totalAmount).toLocaleString('en-IN')}`,
    `Received: ₹${Math.round(data.payments.advancePaid).toLocaleString('en-IN')}`,
    `Balance: ₹${Math.round(data.balance).toLocaleString('en-IN')}`,
  ];
  return lines.join('\n');
};

/**
 * Dispatches or opens WhatsApp with authoritative reservation text (Section 15)
 */
export const openWhatsAppConfirmation = (data: ReservationConfirmationData): string => {
  const targetPhone = data.contacts.targetPhone || data.contacts.guestContact.phone || data.contacts.ownerContact.phone;
  const digits = (targetPhone || '').replace(/\D/g, '');
  if (!digits) {
    throw new Error('No valid mobile phone number available for WhatsApp.');
  }
  const formattedPhone = digits.length === 10 ? `91${digits}` : digits;
  const text = buildWhatsAppConfirmationText(data);
  const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  return url;
};

/**
 * Sends reservation confirmation email via server SMTP service (Section 11-14)
 */
export const sendReservationConfirmationEmail = async (
  data: ReservationConfirmationData,
  recipientEmailOverride?: string
): Promise<{ success: boolean; message: string; messageId?: string }> => {
  const isOta = data.source.sourceType === 'OTA';
  const target = (recipientEmailOverride || (isOta ? data.contacts.ownerContact.email : data.guest.email) || '').trim();

  // Section 12 requirement: If guest email missing on manual/direct booking
  if (!isOta && (!target || !isValidEmail(target))) {
    throw new Error('Guest email is required to send the confirmation.');
  }

  // If OTA and owner email missing
  if (isOta && (!target || !isValidEmail(target))) {
    throw new Error('Hotel owner email is required to send notification for OTA bookings.');
  }

  const res = await apiFetch(`/api/reservations/${data.reservation.id}/confirmation/send-email`, {
    method: 'POST',
    body: JSON.stringify({
      recipientEmail: target || undefined,
    }),
  });

  if (!res.success) {
    throw new Error(res.message || 'Failed to send confirmation email.');
  }

  return res;
};

