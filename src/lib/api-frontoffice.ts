import { supabase } from './supabase';
import { getCurrentHotelId, saveRoomChartRow, getCompanySources, classifyCompany } from './api';
import { updateReservationStatus } from './api-reservations';
import { toNum, calcGstFull } from './calc';
import type {
  RoomChartEntry, RoomChartEntryInput, Room, HousekeepingStatus,
  BookingTimelineEvent, TimelineEventType, FolioCharge, FolioChargeInput,
  RoomShift, SourceCategory, PayMode, GstType, GstSlab, MealPlan,
} from './types';
import type { Reservation } from './types-reservations';

// ── Timeline ──

export const addTimelineEvent = async (params: {
  entryId?: string | null;
  reservationId?: string | null;
  eventType: TimelineEventType;
  description?: string;
  amount?: number;
  performedBy?: string;
  eventData?: Record<string, unknown>;
}): Promise<void> => {
  const { error } = await supabase.from('booking_timeline').insert({
    hotel_id: getCurrentHotelId(),
    entry_id: params.entryId ?? null,
    reservation_id: params.reservationId ?? null,
    event_type: params.eventType,
    event_description: params.description ?? '',
    event_amount: params.amount ?? 0,
    event_data: params.eventData ?? null,
    performed_by: params.performedBy ?? '',
  });
  if (error) throw error;
};

export const getTimeline = async (entryId?: string, reservationId?: string): Promise<BookingTimelineEvent[]> => {
  let q = supabase
    .from('booking_timeline')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('created_at', { ascending: true });
  if (entryId) q = q.eq('entry_id', entryId);
  if (reservationId) q = q.eq('reservation_id', reservationId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as BookingTimelineEvent[]) ?? [];
};

// ── Check-In ──

export interface CheckInParams {
  reservationId?: string;
  roomNo: string;
  guestName: string;
  phone?: string;
  email?: string;
  checkIn: string;
  checkOut: string;
  rate: number;
  sourceCategory?: SourceCategory;
  sourceName?: string;
  paymentMode?: PayMode;
  advancePaid?: number;
  payCash?: number;
  payUpi?: number;
  payCard?: number;
  payBank?: number;
  mealPlan?: MealPlan;
  gstType?: GstType;
  gstSlab?: GstSlab;
  discount?: number;
  adults?: number;
  children?: number;
  remarks?: string;
  idProofType?: string;
  idProofNumber?: string;
  idProofVerified?: boolean;
  arrivalTime?: string;
  performedBy?: string;
}

export const checkInGuest = async (params: CheckInParams): Promise<RoomChartEntry> => {
  const hotelId = getCurrentHotelId();
  const sources = await getCompanySources();

  // Prevent double check-in: check if entry already exists for this room+date
  const { data: existing } = await supabase
    .from('room_chart_entries')
    .select('id, checked_in_at')
    .eq('hotel_id', hotelId)
    .eq('room_no', params.roomNo)
    .eq('report_date', params.checkIn)
    .maybeSingle();
  if (existing && (existing as { checked_in_at?: string }).checked_in_at) {
    throw new Error('Guest is already checked in for this date.');
  }

  const nights = Math.max(1, Math.round(
    (new Date(params.checkOut + 'T00:00:00').getTime() - new Date(params.checkIn + 'T00:00:00').getTime()) / 86400000,
  ));
  const subtotal = params.rate * nights;
  const discount = toNum(params.discount);
  const afterDiscount = Math.max(0, subtotal - discount);
  const { taxable, gst, invoiceTotal } = calcGstFull(
    afterDiscount,
    params.gstType ?? 'No Scope',
    params.gstSlab ?? 0,
  );

  const totalReceived = toNum(params.payCash) + toNum(params.payUpi) + toNum(params.payCard) + toNum(params.payBank);
  const balance = Math.max(0, invoiceTotal - totalReceived);

  const entryInput: RoomChartEntryInput = {
    report_date: params.checkIn,
    room_no: params.roomNo,
    guest_name: params.guestName,
    arrival: params.checkIn,
    departure: params.checkOut,
    nights,
    room_rate: params.rate,
    total: subtotal,
    company: params.sourceName ?? '',
    source_category: params.sourceCategory ?? classifyCompany(params.sourceName ?? '', sources),
    pay_mode: params.paymentMode ?? 'Cash',
    description: '',
    is_complimentary: false,
    meal_plan: params.mealPlan ?? 'EP',
    gst_mode: 'Exclusive',
    gst_type: params.gstType ?? 'No Scope',
    gst_slab: params.gstSlab ?? 0,
    gst_amount: gst,
    taxable_amount: taxable,
    invoice_total: invoiceTotal,
    revenue_category: 'Room Revenue',
    remarks: params.remarks ?? '',
    created_by: params.performedBy ?? '',
    business_date: params.checkIn,
    room_category: 'Standard',
    pay_cash: params.payCash ?? 0,
    pay_upi: params.payUpi ?? 0,
    pay_card: params.payCard ?? 0,
    pay_bank: params.payBank ?? 0,
    pay_advance: totalReceived,
    pay_balance: balance,
    id_proof_type: params.idProofType ?? '',
    id_proof_number: params.idProofNumber ?? '',
    id_proof_verified: params.idProofVerified ?? false,
    arrival_time: params.arrivalTime ?? '',
    checkout_time: '',
    checked_in_at: new Date().toISOString(),
    checked_out_at: null,
    reservation_id: params.reservationId ?? null,
  };

  const saved = await saveRoomChartRow(entryInput, sources);

  // Update room housekeeping status to Occupied
  await updateRoomHousekeeping(params.roomNo, 'Occupied');

  // Update reservation status if from reservation
  if (params.reservationId) {
    await updateReservationStatus(params.reservationId, 'checked_in', saved.id);
  }

  // Add timeline event
  await addTimelineEvent({
    entryId: saved.id,
    reservationId: params.reservationId,
    eventType: 'check_in',
    description: `Check-in: ${params.guestName} → Room ${params.roomNo}`,
    amount: totalReceived,
    performedBy: params.performedBy,
    eventData: { room_no: params.roomNo, arrival_time: params.arrivalTime },
  });

  return saved;
};

// ── Walk-In Check-In ──

export const walkInCheckIn = async (params: Omit<CheckInParams, 'reservationId'>): Promise<RoomChartEntry> => {
  return checkInGuest({ ...params, reservationId: undefined });
};

// ── Check-Out ──

export interface CheckOutParams {
  entryId: string;
  roomNo: string;
  collectBalance?: number;
  collectCash?: number;
  collectUpi?: number;
  collectCard?: number;
  collectBank?: number;
  checkoutAnyway?: boolean;
  performedBy?: string;
}

export const checkOutGuest = async (params: CheckOutParams): Promise<RoomChartEntry> => {
  const hotelId = getCurrentHotelId();

  // Fetch the entry
  const { data: entryData, error: fetchErr } = await supabase
    .from('room_chart_entries')
    .select('*')
    .eq('id', params.entryId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!entryData) throw new Error('Booking not found.');
  const entry = entryData as RoomChartEntry;

  // Prevent double checkout
  if (entry.checked_out_at) {
    throw new Error('Guest is already checked out.');
  }

  // Calculate balance
  const totalReceived = toNum(entry.pay_cash) + toNum(entry.pay_upi) + toNum(entry.pay_card) + toNum(entry.pay_bank);
  const extraCharges = await getFolioCharges(params.entryId);
  const extraTotal = extraCharges.reduce((s, c) => s + toNum(c.amount) * toNum(c.quantity), 0);
  const grandTotal = toNum(entry.invoice_total) + extraTotal;
  const balance = Math.max(0, grandTotal - totalReceived);

  const additionalPayment = toNum(params.collectCash) + toNum(params.collectUpi) + toNum(params.collectCard) + toNum(params.collectBank);

  if (balance > 0 && additionalPayment < balance && !params.checkoutAnyway) {
    throw new Error(`Pending balance of ₹${balance}. Collect balance or use "Checkout Anyway" (requires Admin permission).`);
  }

  // Update entry with additional payment and checkout time
  const updatePayload: Record<string, unknown> = {
    checked_out_at: new Date().toISOString(),
    checkout_time: new Date().toTimeString().slice(0, 5),
    pay_cash: toNum(entry.pay_cash) + toNum(params.collectCash),
    pay_upi: toNum(entry.pay_upi) + toNum(params.collectUpi),
    pay_card: toNum(entry.pay_card) + toNum(params.collectCard),
    pay_bank: toNum(entry.pay_bank) + toNum(params.collectBank),
    pay_advance: totalReceived + additionalPayment,
    pay_balance: Math.max(0, grandTotal - (totalReceived + additionalPayment)),
  };

  const { data: updated, error: updateErr } = await supabase
    .from('room_chart_entries')
    .update(updatePayload)
    .eq('id', params.entryId)
    .select('*')
    .single();
  if (updateErr) throw updateErr;

  // Set room to Vacant Dirty after checkout
  await updateRoomHousekeeping(params.roomNo, 'Vacant Dirty');

  // Update room's last guest info for housekeeping display
  await supabase
    .from('rooms')
    .update({
      last_guest_name: entry.guest_name ?? '',
      last_departure_time: new Date().toTimeString().slice(0, 5),
    })
    .eq('hotel_id', hotelId)
    .eq('room_no', params.roomNo);

  // Add timeline event
  await addTimelineEvent({
    entryId: params.entryId,
    eventType: 'checkout',
    description: `Check-out: ${entry.guest_name} from Room ${params.roomNo}`,
    amount: additionalPayment,
    performedBy: params.performedBy,
    eventData: { balance_remaining: Math.max(0, grandTotal - (totalReceived + additionalPayment)) },
  });

  return updated as RoomChartEntry;
};

// ── Room Shift ──

export const shiftRoom = async (params: {
  entryId: string;
  fromRoom: string;
  toRoom: string;
  reason?: string;
  performedBy?: string;
}): Promise<RoomChartEntry> => {
  const hotelId = getCurrentHotelId();

  // Verify target room is not occupied
  const { data: existing } = await supabase
    .from('room_chart_entries')
    .select('id')
    .eq('hotel_id', hotelId)
    .eq('room_no', params.toRoom)
    .is('checked_out_at', null)
    .maybeSingle();
  if (existing) {
    throw new Error('Target room is already occupied.');
  }

  // Update entry with new room
  const { data: updated, error } = await supabase
    .from('room_chart_entries')
    .update({ room_no: params.toRoom })
    .eq('id', params.entryId)
    .select('*')
    .single();
  if (error) throw error;

  // Update housekeeping: old room → Vacant Dirty, new room → Occupied
  await updateRoomHousekeeping(params.fromRoom, 'Vacant Dirty');
  await updateRoomHousekeeping(params.toRoom, 'Occupied');

  // Record shift
  const { error: shiftErr } = await supabase.from('room_shifts').insert({
    hotel_id: hotelId,
    entry_id: params.entryId,
    from_room: params.fromRoom,
    to_room: params.toRoom,
    reason: params.reason ?? '',
    shifted_by: params.performedBy ?? '',
  });
  if (shiftErr) throw shiftErr;

  // Timeline event
  await addTimelineEvent({
    entryId: params.entryId,
    eventType: 'room_shift',
    description: `Room shifted: ${params.fromRoom} → ${params.toRoom}`,
    performedBy: params.performedBy,
    eventData: { from: params.fromRoom, to: params.toRoom, reason: params.reason },
  });

  return updated as RoomChartEntry;
};

// ── Extend Stay ──

export const extendStay = async (params: {
  entryId: string;
  newCheckOut: string;
  performedBy?: string;
}): Promise<RoomChartEntry> => {
  const hotelId = getCurrentHotelId();

  const { data: entryData, error: fetchErr } = await supabase
    .from('room_chart_entries')
    .select('*')
    .eq('id', params.entryId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!entryData) throw new Error('Booking not found.');
  const entry = entryData as RoomChartEntry;

  // Prevent invalid dates
  if (new Date(params.newCheckOut + 'T00:00:00') <= new Date((entry.arrival ?? entry.report_date) + 'T00:00:00')) {
    throw new Error('New checkout date must be after the check-in date.');
  }

  // Check room availability for extended period
  const { data: overlap } = await supabase
    .from('room_chart_entries')
    .select('id')
    .eq('hotel_id', hotelId)
    .eq('room_no', entry.room_no)
    .neq('id', params.entryId)
    .is('checked_out_at', null)
    .or(`and(arrival.lte.${params.newCheckOut},departure.gte.${(entry.arrival ?? entry.report_date)})`)
    .maybeSingle();
  if (overlap) {
    throw new Error('Room is not available for the extended period (overlap detected).');
  }

  // Also check reservations
  const { data: resOverlap } = await supabase
    .from('reservations')
    .select('id')
    .eq('hotel_id', hotelId)
    .eq('room_no', entry.room_no)
    .in('status', ['confirmed', 'checked_in'])
    .or(`and(check_in_date.lte.${params.newCheckOut},check_out_date.gte.${(entry.arrival ?? entry.report_date)})`)
    .maybeSingle();
  if (resOverlap) {
    throw new Error('Room has a confirmed reservation that conflicts with the extended stay.');
  }

  // Recalculate billing
  const newNights = Math.max(1, Math.round(
    (new Date(params.newCheckOut + 'T00:00:00').getTime() - new Date((entry.arrival ?? entry.report_date) + 'T00:00:00').getTime()) / 86400000,
  ));
  const newSubtotal = toNum(entry.room_rate) * newNights;
  const afterDiscount = Math.max(0, newSubtotal - 0);
  const { taxable, gst, invoiceTotal } = calcGstFull(afterDiscount, entry.gst_type, entry.gst_slab);

  const totalReceived = toNum(entry.pay_cash) + toNum(entry.pay_upi) + toNum(entry.pay_card) + toNum(entry.pay_bank);
  const newBalance = Math.max(0, invoiceTotal - totalReceived);

  const { data: updated, error } = await supabase
    .from('room_chart_entries')
    .update({
      departure: params.newCheckOut,
      nights: newNights,
      total: newSubtotal,
      taxable_amount: taxable,
      gst_amount: gst,
      invoice_total: invoiceTotal,
      pay_balance: newBalance,
    })
    .eq('id', params.entryId)
    .select('*')
    .single();
  if (error) throw error;

  await addTimelineEvent({
    entryId: params.entryId,
    eventType: 'stay_extended',
    description: `Stay extended to ${params.newCheckOut} (${newNights} nights)`,
    performedBy: params.performedBy,
    eventData: { new_checkout: params.newCheckOut, new_nights: newNights, new_total: invoiceTotal },
  });

  return updated as RoomChartEntry;
};

// ── Folio Charges ──

export const getFolioCharges = async (entryId: string): Promise<FolioCharge[]> => {
  const { data, error } = await supabase
    .from('folio_charges')
    .select('*')
    .eq('entry_id', entryId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as FolioCharge[]) ?? [];
};

export const addFolioCharge = async (input: FolioChargeInput, performedBy?: string): Promise<FolioCharge> => {
  const { data, error } = await supabase
    .from('folio_charges')
    .insert({
      hotel_id: getCurrentHotelId(),
      entry_id: input.entry_id,
      charge_type: input.charge_type,
      description: input.description,
      amount: input.amount,
      quantity: input.quantity ?? 1,
    })
    .select('*')
    .single();
  if (error) throw error;

  await addTimelineEvent({
    entryId: input.entry_id,
    eventType: 'extra_charge',
    description: `Extra charge: ${input.charge_type} — ${input.description}`,
    amount: input.amount * (input.quantity ?? 1),
    performedBy: performedBy,
  });

  return data as FolioCharge;
};

export const deleteFolioCharge = async (id: string): Promise<void> => {
  const { error } = await supabase.from('folio_charges').delete().eq('id', id);
  if (error) throw error;
};

// ── Housekeeping ──

export const updateRoomHousekeeping = async (
  roomNo: string,
  status: HousekeepingStatus,
  note?: string,
): Promise<void> => {
  const hotelId = getCurrentHotelId();
  const { error } = await supabase
    .from('rooms')
    .update({
      housekeeping_status: status,
      housekeeping_note: note ?? '',
      housekeeping_updated_at: new Date().toISOString(),
    })
    .eq('hotel_id', hotelId)
    .eq('room_no', roomNo);
  if (error) throw error;
};

export const getRoomShifts = async (entryId: string): Promise<RoomShift[]> => {
  const { data, error } = await supabase
    .from('room_shifts')
    .select('*')
    .eq('entry_id', entryId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as RoomShift[]) ?? [];
};

// ── Validations ──

export const validateCheckIn = (params: CheckInParams): string | null => {
  if (!params.guestName?.trim()) return 'Guest name is required.';
  if (!params.roomNo?.trim()) return 'Room number is required.';
  if (!params.checkIn || !params.checkOut) return 'Check-in and check-out dates are required.';
  if (new Date(params.checkOut + 'T00:00:00') <= new Date(params.checkIn + 'T00:00:00')) {
    return 'Check-out must be after check-in.';
  }
  if (toNum(params.rate) < 0) return 'Rate cannot be negative.';
  return null;
};

export const validateExtendStay = (currentCheckIn: string, newCheckOut: string): string | null => {
  if (!newCheckOut) return 'New checkout date is required.';
  if (new Date(newCheckOut + 'T00:00:00') <= new Date(currentCheckIn + 'T00:00:00')) {
    return 'New checkout must be after check-in date.';
  }
  return null;
};

export const getVacantRooms = async (excludeRoomNo?: string): Promise<Room[]> => {
  const hotelId = getCurrentHotelId();
  const { data: rooms, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  const allRooms = (rooms as Room[]) ?? [];

  // Get occupied room numbers
  const { data: occupied } = await supabase
    .from('room_chart_entries')
    .select('room_no')
    .eq('hotel_id', hotelId)
    .is('checked_out_at', null);
  const occupiedSet = new Set((occupied ?? []).map((r: { room_no: string }) => r.room_no.trim().toLowerCase()));

  // Get confirmed/checked_in reservation room numbers
  const { data: resRooms } = await supabase
    .from('reservations')
    .select('room_no')
    .eq('hotel_id', hotelId)
    .in('status', ['confirmed', 'checked_in']);
  const resSet = new Set((resRooms ?? []).map((r: { room_no: string }) => r.room_no.trim().toLowerCase()));

  return allRooms.filter((r) => {
    const key = r.room_no.trim().toLowerCase();
    return !occupiedSet.has(key) && !resSet.has(key) && key !== (excludeRoomNo ?? '').trim().toLowerCase();
  });
};
