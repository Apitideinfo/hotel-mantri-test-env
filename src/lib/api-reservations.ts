import { supabase } from './supabase';
import { getCurrentHotelId, getRooms, getRoomCategories } from './api';
import type { RoomChartEntry } from './types';
import type {
  Reservation, ReservationInput, ReservationStatus,
  ReservationGroup, ReservationGroupInput,
  RatePlan, RatePlanInput, RatePlanType,
  WaitlistEntry, WaitlistInput, WaitlistStatus,
  RoomBlock, RoomBlockInput, BlockType,
} from './types-reservations';

export const getRoomChartForDateRange = async (
  fromDate: string,
  toDate: string,
): Promise<RoomChartEntry[]> => {
  const { data, error } = await supabase
    .from('room_chart_entries')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .gte('report_date', fromDate)
    .lte('report_date', toDate)
    .order('report_date', { ascending: true });
  if (error) throw error;
  return (data as RoomChartEntry[]) ?? [];
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
  try {
    const hotelId = getCurrentHotelId();
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('hotel_id', hotelId)
      .order('check_in_date', { ascending: true });
    if (error) return [];

    const list = (data as Reservation[]) ?? [];
    return list.filter((r) => {
      const ci = (r.check_in_date ?? '').slice(0, 10);
      const co = (r.check_out_date ?? '').slice(0, 10);
      if (!ci || !co) return false;
      return ci <= endDate && co >= startDate;
    });
  } catch {
    return [];
  }
};

export const saveReservation = async (
  input: ReservationInput,
  id?: string,
): Promise<Reservation> => {
  const hotelId = getCurrentHotelId();
  const rawPayload = { ...input, hotel_id: hotelId };

  // Remove generated/virtual fields that PostgreSQL generated columns forbid inserting into
  delete (rawPayload as { id?: string }).id;
  delete (rawPayload as { nights?: number }).nights;

  if (id && id.trim() !== '') {
    const { data, error } = await supabase
      .from('reservations')
      .update({ ...rawPayload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as Reservation;
  }

  const { data, error } = await supabase
    .from('reservations')
    .insert(rawPayload)
    .select('*')
    .single();
  if (error) throw error;
  return data as Reservation;
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
  return data as Reservation;
};

export const deleteReservation = async (id: string): Promise<void> => {
  const { error } = await supabase.from('reservations').delete().eq('id', id);
  if (error) throw error;
};

export const checkRoomAvailability = async (
  roomNo: string,
  checkIn: string,
  checkOut: string,
  excludeId?: string,
): Promise<boolean> => {
  try {
    const hotelId = getCurrentHotelId();
    const roomKey = roomNo.trim().toLowerCase();

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
      const ci = (r.check_in_date ?? '').slice(0, 10);
      const co = (r.check_out_date ?? '').slice(0, 10);
      if (!ci || !co) return false;
      return ci < checkOut && co > checkIn;
    });

    if (resOverlap) return false;

    // 2. Check room_chart entries for overlap (excluding this reservation's own entry)
    const { data: entryData } = await supabase
      .from('room_chart_entries')
      .select('id, room_no, arrival, departure, reservation_id')
      .eq('hotel_id', hotelId);

    const entryOverlap = (entryData ?? []).some((e: { id?: string; room_no?: string; arrival?: string; departure?: string; report_date?: string; reservation_id?: string }) => {
      if ((e.room_no ?? '').trim().toLowerCase() !== roomKey) return false;
      // Exclude if entry belongs to the reservation being extended/moved
      if (excludeId && e.reservation_id === excludeId) return false;
      if (excludeEntryId && e.id === excludeEntryId) return false;

      const a = (e.arrival ?? e.report_date ?? '').slice(0, 10);
      const d = (e.departure ?? e.report_date ?? '').slice(0, 10);
      if (!a || !d) return false;
      return a < checkOut && d > checkIn;
    });

    return !entryOverlap;
  } catch {
    return true;
  }
};

export const extendReservation = async (params: {
  reservationId: string;
  newCheckOut: string;
}): Promise<Reservation> => {
  const { reservationId, newCheckOut } = params;

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
      const checkInDt = new Date(res.check_in_date + 'T00:00:00');
      const checkOutDt = new Date(newCheckOut + 'T00:00:00');
      const newNights = Math.max(1, Math.round((checkOutDt.getTime() - checkInDt.getTime()) / 86400000));

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
    const nights = Math.max(1, Math.round(
      (new Date(room.check_out + 'T00:00:00').getTime() - new Date(room.check_in + 'T00:00:00').getTime()) / 86400000,
    ));

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
  const nights = input.nights ?? Math.max(1, Math.round(
    (new Date(input.check_out + 'T00:00:00').getTime() - new Date(input.check_in + 'T00:00:00').getTime()) / 86400000,
  ));
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
  return data as RoomBlock;
};

export const deleteRoomBlock = async (id: string): Promise<void> => {
  const { error } = await supabase.from('room_blocks').delete().eq('id', id);
  if (error) throw error;
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

  // Group by room+date to detect overbooking
  const roomDateMap = new Map<string, Reservation[]>();
  for (const r of reservations) {
    if (r.status !== 'confirmed' && r.status !== 'checked_in') continue;
    const key = `${r.room_no}|${r.check_in_date}`;
    if (!roomDateMap.has(key)) roomDateMap.set(key, []);
    roomDateMap.get(key)!.push(r);
  }
  for (const [key, resList] of roomDateMap) {
    if (resList.length > 1) {
      const [roomNo, date] = key.split('|');
      alerts.push({
        type: 'overbooking',
        message: `Room ${roomNo} has ${resList.length} overlapping reservations on ${date}`,
        roomNo,
        severity: 'error',
      });
    }
  }

  // Duplicate reservation detection (same guest, same dates)
  const guestDateMap = new Map<string, Reservation[]>();
  for (const r of reservations) {
    if (r.status !== 'confirmed' && r.status !== 'checked_in') continue;
    const key = `${r.guest_name.toLowerCase()}|${r.check_in_date}|${r.check_out_date}`;
    if (!guestDateMap.has(key)) guestDateMap.set(key, []);
    guestDateMap.get(key)!.push(r);
  }
  for (const [, resList] of guestDateMap) {
    if (resList.length > 1) {
      alerts.push({
        type: 'duplicate',
        message: `Duplicate reservation: ${resList[0].guest_name} has ${resList.length} bookings for the same dates`,
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

  const nights = Math.max(1, Math.round(
    (new Date(params.checkOut + 'T00:00:00').getTime() - new Date(params.checkIn + 'T00:00:00').getTime()) / 86400000,
  ));

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
