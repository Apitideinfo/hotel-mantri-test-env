/**
 * HOTEL MANTRI — ReservationIdempotencyService
 * 
 * Authoritative idempotency and duplicate detection for:
 * 1. OTA inbound webhooks and channel sync
 * 2. External booking identity: hotel_id + channel + external_booking_id
 * 3. Concurrent webhook serialization via async mutex locks
 * 4. Manual duplicate detection (authoritative identifier vs. legitimate same-guest multiple rooms)
 */

import { supabaseServiceRole } from '../supabaseClient.js';

// In-memory mutex map for OTA idempotency: key = `${hotelId}::${channel.toLowerCase()}::${externalId}`
const otaLocks = new Map();

/**
 * Runs a webhook/OTA task while holding an exclusive lock on that specific external booking.
 * Guarantees that concurrent webhooks for the same booking ID are executed strictly one at a time.
 */
export const withOtaLock = async (hotelId, channel, externalBookingId, task) => {
  if (!hotelId || !externalBookingId) return task();

  const chan = String(channel || 'ota').trim().toLowerCase();
  const extId = String(externalBookingId).trim();
  const key = `${hotelId}::${chan}::${extId}`;

  const prevLock = otaLocks.get(key) || Promise.resolve();

  let release;
  const currentLock = new Promise((resolve) => {
    release = resolve;
  });

  otaLocks.set(key, prevLock.then(() => currentLock));

  try {
    await prevLock;
    return await task();
  } finally {
    release();
    if (otaLocks.get(key) === currentLock) {
      otaLocks.delete(key);
    }
  }
};

/**
 * Finds existing OTA reservation in channel_ota_reservations or reservations table.
 */
export const findExistingOtaBooking = async (hotelId, externalBookingId) => {
  if (!hotelId || !externalBookingId) return null;

  const supabase = supabaseServiceRole;
  const cleanId = String(externalBookingId).trim();

  // 1. Check channel_ota_reservations
  const { data: otaRecord } = await supabase
    .from('channel_ota_reservations')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('ota_booking_id', cleanId)
    .maybeSingle();

  if (otaRecord) {
    return {
      type: 'channel_ota_record',
      otaRecord,
      reservationId: otaRecord.reservation_id,
      bookingStatus: otaRecord.booking_status,
      importStatus: otaRecord.import_status,
    };
  }

  // 2. Check internal_note / remarks markers in reservations
  const marker = `[OTA_BOOKING_ID: ${cleanId}]`;
  const legacyMarker = `[AIOSELL_BOOKING_ID: ${cleanId}]`;

  const { data: resList } = await supabase
    .from('reservations')
    .select('id, hotel_id, room_id, room_no, guest_name, check_in_date, check_out_date, status, internal_note')
    .eq('hotel_id', hotelId)
    .or(`internal_note.ilike.%${marker}%,internal_note.ilike.%${legacyMarker}%,remarks.ilike.%${marker}%,remarks.ilike.%${legacyMarker}%`)
    .limit(1);

  if (resList && resList.length > 0) {
    return {
      type: 'reservation_record',
      reservation: resList[0],
      reservationId: resList[0].id,
      bookingStatus: resList[0].status,
    };
  }

  return null;
};

/**
 * Checks for hard duplicate manual bookings.
 * Same hotel + same authoritative reference.
 * Note: Legitimate multi-room bookings for the same guest on different rooms are allowed!
 */
export const checkManualDuplicate = async (hotelId, payload, excludeId = null) => {
  if (!hotelId) return { duplicate: false };

  const supabase = supabaseServiceRole;
  const paymentRef = (payload.payment_ref || '').trim();

  // If a non-empty payment reference / UTR is provided, verify uniqueness
  if (paymentRef) {
    let q = supabase
      .from('reservations')
      .select('id, guest_name, check_in_date, check_out_date, room_no')
      .eq('hotel_id', hotelId)
      .eq('payment_ref', paymentRef)
      .in('status', ['confirmed', 'checked_in']);

    if (excludeId) q = q.neq('id', excludeId);

    const { data: existing } = await q;
    if (existing && existing.length > 0) {
      return {
        duplicate: true,
        code: 'RESERVATION_DUPLICATE',
        message: `A booking with payment reference '${paymentRef}' already exists (${existing[0].guest_name}, Room ${existing[0].room_no}).`,
        existing: existing[0],
      };
    }
  }

  return { duplicate: false };
};

export default {
  withOtaLock,
  findExistingOtaBooking,
  checkManualDuplicate,
};
