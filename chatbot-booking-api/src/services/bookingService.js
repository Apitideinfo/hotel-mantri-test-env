/**
 * HOTEL MANTRI — Chatbot Booking API: Booking & Hold Management Engine
 * 
 * Provides:
 * 1. Safe, durable booking attempts with configurable hold expiration
 * 2. Idempotency enforcement scoped to (hotelId, idempotencyKey, payloadFingerprint)
 * 3. Physical room assignment from category inventory avoiding overlaps
 * 4. Dual-mode database durability: uses database RPC `create_chatbot_booking_hold`
 *    when deployed, with direct table persistence fallback in `reservations`
 * 5. Unique public booking reference generation (HM-BKG-XXXXXX)
 * 6. Cryptographically signed, expiring guest lookup tokens (HMAC-SHA256)
 * 7. Guest data minimization and zero sensitive internal data leakage
 */

import crypto from 'crypto';
import { supabase } from '../db/supabase.js';
import { config } from '../config/environment.js';
import { getConfiguredHotelId, getPublicHotelProfile } from './hotelConfigService.js';
import { verifyQuoteToken } from './quoteEngine.js';

/**
 * Generates an HMAC-signed, expiring guest access token for booking lookups.
 */
export const generateGuestAccessToken = ({ bookingReference, hotelId, expiresInMs = 24 * 60 * 60 * 1000 }) => {
  const secret = config().security.bookingTokenSecret;
  const exp = Date.now() + expiresInMs;
  const payload = {
    bookingRef: String(bookingReference),
    hotelId: String(hotelId),
    exp,
    purpose: 'guest_booking_status',
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
  return `${payloadB64}.${sig}`;
};

/**
 * Verifies a guest access token using constant-time comparison.
 */
export const verifyGuestAccessToken = (token, expectedBookingReference) => {
  if (!token || typeof token !== 'string') {
    const err = new Error('Guest authorization token is missing.');
    err.status = 401;
    err.code = 'GUEST_TOKEN_MISSING';
    throw err;
  }

  const parts = token.trim().split('.');
  if (parts.length !== 2) {
    const err = new Error('Guest authorization token is malformed.');
    err.status = 401;
    err.code = 'GUEST_TOKEN_MALFORMED';
    throw err;
  }

  const [payloadB64, sig] = parts;
  const secret = config().security.bookingTokenSecret;
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');

  const bufA = crypto.createHash('sha256').update(sig).digest();
  const bufB = crypto.createHash('sha256').update(expectedSig).digest();

  if (!crypto.timingSafeEqual(bufA, bufB)) {
    const err = new Error('Guest authorization token has an invalid signature.');
    err.status = 403;
    err.code = 'GUEST_TOKEN_INVALID';
    throw err;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    const err = new Error('Unable to parse guest token payload.');
    err.status = 401;
    err.code = 'GUEST_TOKEN_INVALID';
    throw err;
  }

  if (Date.now() > payload.exp) {
    const err = new Error('Guest authorization token has expired.');
    err.status = 401;
    err.code = 'GUEST_TOKEN_EXPIRED';
    throw err;
  }

  const configuredHotelId = getConfiguredHotelId();
  if (String(payload.hotelId).toLowerCase() !== String(configuredHotelId).toLowerCase()) {
    const err = new Error('Token does not match configured hotel property.');
    err.status = 403;
    err.code = 'GUEST_TOKEN_HOTEL_MISMATCH';
    throw err;
  }

  if (expectedBookingReference && payload.bookingRef !== expectedBookingReference) {
    const err = new Error('Token is not authorized for the requested booking reference.');
    err.status = 403;
    err.code = 'GUEST_TOKEN_REF_MISMATCH';
    throw err;
  }

  return payload;
};

/**
 * Computes a SHA-256 fingerprint of a booking payload for idempotency checking.
 */
export const computePayloadFingerprint = (data) => {
  const norm = {
    categoryId: String(data.categoryId || ''),
    checkIn: String(data.checkIn || '').slice(0, 10),
    checkOut: String(data.checkOut || '').slice(0, 10),
    rooms: Number(data.rooms) || 1,
    guestPhone: String(data.guestPhone || '').trim(),
    guestEmail: String(data.guestEmail || '').trim().toLowerCase(),
    totalPaise: Number(data.totalPaise) || 0,
  };
  return crypto.createHash('sha256').update(JSON.stringify(norm)).digest('hex');
};

/**
 * Creates an authoritative booking attempt and inventory hold.
 */
export const createBookingAttempt = async ({
  quoteToken,
  guestName,
  guestPhone,
  guestEmail,
  guestAddress = '',
  specialRequests = '',
  idempotencyKey = null,
}) => {
  const hotelId = getConfiguredHotelId();

  // 1. Verify and unpack authoritative quote
  const quote = verifyQuoteToken(quoteToken);

  // 2. Validate Guest Input
  const cleanName = String(guestName || '').trim();
  const cleanPhone = String(guestPhone || '').trim();
  const cleanEmail = String(guestEmail || '').trim().toLowerCase();

  if (!cleanName || cleanName.length < 2) {
    const err = new Error('Valid guest name is required (minimum 2 characters).');
    err.status = 400;
    err.code = 'GUEST_NAME_REQUIRED';
    throw err;
  }

  if (!cleanPhone || cleanPhone.length < 8) {
    const err = new Error('Valid guest contact phone number is required.');
    err.status = 400;
    err.code = 'GUEST_PHONE_REQUIRED';
    throw err;
  }

  if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    const err = new Error('Valid guest email address is required for booking confirmations.');
    err.status = 400;
    err.code = 'GUEST_EMAIL_REQUIRED';
    throw err;
  }

  // 3. Compute Request Fingerprint & Idempotency Key
  const derivedIdempKey = idempotencyKey ? String(idempotencyKey).trim() : null;
  const fingerprint = computePayloadFingerprint({
    categoryId: quote.categoryId,
    checkIn: quote.checkIn,
    checkOut: quote.checkOut,
    rooms: quote.rooms,
    guestPhone: cleanPhone,
    guestEmail: cleanEmail,
    totalPaise: quote.totalAmountPaise,
  });

  const ttlSeconds = config().security.bookingHoldTtlSeconds;

  // 4. Try Stored Procedure RPC first: create_chatbot_booking_hold
  try {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('create_chatbot_booking_hold', {
      p_hotel_id: hotelId,
      p_category_id: quote.categoryId,
      p_check_in: quote.checkIn,
      p_check_out: quote.checkOut,
      p_rooms_count: quote.rooms,
      p_rate_per_night: quote.ratePerNight,
      p_total_amount_paise: quote.totalAmountPaise,
      p_guest_name: cleanName,
      p_guest_phone: cleanPhone,
      p_guest_email: cleanEmail,
      p_guest_address: String(guestAddress || ''),
      p_special_requests: String(specialRequests || ''),
      p_idempotency_key: derivedIdempKey,
      p_request_fingerprint: fingerprint,
      p_hold_ttl_seconds: ttlSeconds,
    });

    if (!rpcErr && rpcRes) {
      if (!rpcRes.success) {
        const err = new Error(rpcRes.message || 'Booking hold creation failed');
        err.status = rpcRes.code === 'IDEMPOTENCY_MISMATCH' ? 409 : 409;
        err.code = rpcRes.code || 'BOOKING_HOLD_FAILED';
        throw err;
      }

      const guestToken = generateGuestAccessToken({
        bookingReference: rpcRes.booking_reference,
        hotelId,
      });

      return {
        bookingReference: rpcRes.booking_reference,
        status: rpcRes.status || 'pending_payment',
        holdExpiresAt: rpcRes.expires_at,
        guestToken,
        idempotent: Boolean(rpcRes.idempotent),
        stay: {
          checkIn: quote.checkIn,
          checkOut: quote.checkOut,
          nights: quote.nights,
          rooms: quote.rooms,
          categoryName: quote.categoryName,
        },
        pricing: {
          currency: 'INR',
          totalAmount: quote.totalAmountInr,
          totalAmountPaise: quote.totalAmountPaise,
        },
      };
    }
  } catch (rpcCallErr) {
    if (rpcCallErr.code === 'IDEMPOTENCY_MISMATCH' || rpcCallErr.code === 'CAPACITY_EXCEEDED') {
      throw rpcCallErr;
    }
    // If RPC does not exist in schema cache, seamlessly proceed with database-level direct persistence
  }

  // 5. Database-Direct Durability Fallback:
  // Check idempotency in reservations table or booking_holds table
  if (derivedIdempKey) {
    const idempMarker = `[CLIENT_IDEMP: ${derivedIdempKey}]`;
    const { data: existingResvs } = await supabase
      .from('reservations')
      .select('*')
      .eq('hotel_id', hotelId)
      .ilike('internal_note', `%${idempMarker}%`)
      .limit(1);

    if (existingResvs && existingResvs.length > 0) {
      const existing = existingResvs[0];
      const refMatch = existing.internal_note.match(/\[CHATBOT_REF:\s*([^\]]+)\]/);
      const existingRef = refMatch ? refMatch[1].trim() : `HM-BKG-${existing.id.slice(0, 8).toUpperCase()}`;

      const guestToken = generateGuestAccessToken({
        bookingReference: existingRef,
        hotelId,
      });

      return {
        bookingReference: existingRef,
        status: existing.advance_paid > 0 ? 'confirmed' : 'pending_payment',
        holdExpiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        guestToken,
        idempotent: true,
        stay: {
          checkIn: existing.check_in_date,
          checkOut: existing.check_out_date,
          nights: existing.nights || quote.nights,
          rooms: 1,
          categoryName: quote.categoryName,
        },
        pricing: {
          currency: 'INR',
          totalAmount: Number(existing.invoice_total) || quote.totalAmountInr,
          totalAmountPaise: quote.totalAmountPaise,
        },
      };
    }
  }

  // Check physical room availability
  const { data: catRooms } = await supabase
    .from('rooms')
    .select('id, room_no, sort_order')
    .eq('hotel_id', hotelId)
    .eq('category_id', quote.categoryId)
    .eq('is_active', true)
    .neq('room_status', 'Maintenance');

  const { data: conflicting } = await supabase
    .from('reservations')
    .select('room_id, room_no')
    .eq('hotel_id', hotelId)
    .in('status', ['confirmed', 'checked_in'])
    .lt('check_in_date', quote.checkOut)
    .gt('check_out_date', quote.checkIn);

  const blockedRoomIds = new Set((conflicting || []).map((c) => c.room_id).filter(Boolean));
  const freeRooms = (catRooms || []).filter((r) => !blockedRoomIds.has(r.id));

  if (freeRooms.length < quote.rooms) {
    const err = new Error(`Only ${freeRooms.length} room(s) available for ${quote.categoryName}.`);
    err.status = 409;
    err.code = 'CATEGORY_CAPACITY_EXCEEDED';
    throw err;
  }

  const assignedRoom = freeRooms[0] || null;
  const bookingReference = `HM-BKG-${upper(crypto.randomBytes(5).toString('hex'))}`;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  // Upsert guest record
  let guestId = null;
  try {
    const { data: existingG } = await supabase
      .from('guests')
      .select('id')
      .eq('hotel_id', hotelId)
      .eq('mobile', cleanPhone)
      .maybeSingle();

    if (existingG) {
      guestId = existingG.id;
    } else {
      const { data: newG } = await supabase
        .from('guests')
        .insert({
          hotel_id: hotelId,
          name: cleanName,
          mobile: cleanPhone,
          email: cleanEmail,
          address: String(guestAddress || ''),
        })
        .select('id')
        .maybeSingle();
      guestId = newG?.id || null;
    }
  } catch (gErr) {
    console.warn('[BookingService] Guest upsert non-critical warning:', gErr.message);
  }

  // Insert reservation record directly into reservations table
  const internalNote = [
    `[CHATBOT_REF: ${bookingReference}]`,
    `[HOLD_EXP: ${expiresAt}]`,
    derivedIdempKey ? `[CLIENT_IDEMP: ${derivedIdempKey}]` : null,
    `[FINGERPRINT: ${fingerprint}]`,
  ].filter(Boolean).join(' ');

  const { data: insertedResv, error: insErr } = await supabase
    .from('reservations')
    .insert({
      hotel_id: hotelId,
      room_id: assignedRoom?.id || null,
      room_no: assignedRoom?.room_no || 'Unassigned',
      guest_name: cleanName,
      guest_phone: cleanPhone,
      guest_email: cleanEmail,
      guest_address: String(guestAddress || ''),
      check_in_date: quote.checkIn,
      check_out_date: quote.checkOut,
      rate: quote.ratePerNight,
      source_category: 'Direct/Chatbot',
      source_name: 'Chatbot Booking Engine',
      payment_mode: 'Razorpay',
      advance_paid: 0,
      taxable_amount: quote.taxableAmountInr || quote.subtotalInr,
      invoice_total: quote.totalAmountInr,
      adults: quote.adults,
      children: quote.children,
      remarks: specialRequests ? `Chatbot Booking: ${specialRequests}` : 'Booked via AI Chatbot',
      internal_note: internalNote,
      created_by: 'Chatbot Integration',
      status: 'confirmed', // Held in PMS inventory
      guest_id: guestId,
    })
    .select('*')
    .single();

  if (insErr) {
    console.error('[BookingService] Insert error:', insErr);
    if (insErr.code === '23P02') {
      const err = new Error(`Room ${assignedRoom?.room_no || 'selected'} was booked by another guest. Please retry.`);
      err.status = 409;
      err.code = 'ROOM_ALREADY_BOOKED';
      throw err;
    }
    throw new Error('Failed to create booking attempt in database.');
  }

  // Record audit log
  try {
    await supabase.from('audit_logs').insert({
      hotel_id: hotelId,
      action: 'CHATBOT_BOOKING_ATTEMPT_CREATED',
      module: 'reservation',
      record_id: insertedResv.id,
      metadata: {
        booking_reference: bookingReference,
        quote_id: quote.quoteId,
        amount_paise: quote.totalAmountPaise,
        expires_at: expiresAt,
      },
      severity: 'info',
    });
  } catch {
    // Non-fatal
  }

  const guestToken = generateGuestAccessToken({
    bookingReference,
    hotelId,
  });

  return {
    bookingReference,
    status: 'pending_payment',
    holdExpiresAt: expiresAt,
    guestToken,
    idempotent: false,
    stay: {
      checkIn: quote.checkIn,
      checkOut: quote.checkOut,
      nights: quote.nights,
      rooms: quote.rooms,
      categoryName: quote.categoryName,
    },
    pricing: {
      currency: 'INR',
      totalAmount: quote.totalAmountInr,
      totalAmountPaise: quote.totalAmountPaise,
    },
  };
};

/**
 * Retrieves safe guest-facing booking details by reference.
 */
export const getBookingByReference = async ({ bookingReference, guestToken, isBotAuthorized = false }) => {
  const hotelId = getConfiguredHotelId();

  // 1. Verify guest authorization token (unless caller has valid bot credentials)
  if (!isBotAuthorized) {
    verifyGuestAccessToken(guestToken, bookingReference);
  }

  // 2. Fetch reservation
  const refMarker = `[CHATBOT_REF: ${bookingReference}]`;
  const { data: resvs, error } = await supabase
    .from('reservations')
    .select(`
      id,
      hotel_id,
      room_no,
      guest_name,
      check_in_date,
      check_out_date,
      nights,
      rate,
      advance_paid,
      invoice_total,
      adults,
      children,
      payment_mode,
      payment_ref,
      status,
      internal_note,
      created_at
    `)
    .eq('hotel_id', hotelId)
    .ilike('internal_note', `%${refMarker}%`)
    .limit(1);

  if (error || !resvs || resvs.length === 0) {
    const err = new Error(`Booking reference ${bookingReference} not found.`);
    err.status = 404;
    err.code = 'BOOKING_NOT_FOUND';
    throw err;
  }

  const resv = resvs[0];
  const advancePaid = Number(resv.advance_paid) || 0;
  const invoiceTotal = Number(resv.invoice_total) || 0;
  const isPaid = advancePaid >= invoiceTotal && invoiceTotal > 0;

  // Extract hold expiration if unpaid
  const expMatch = resv.internal_note.match(/\[HOLD_EXP:\s*([^\]]+)\]/);
  const holdExpiresAt = expMatch ? expMatch[1].trim() : null;

  return {
    bookingReference,
    status: isPaid ? 'confirmed' : 'pending_payment',
    paymentStatus: isPaid ? 'PAID' : (advancePaid > 0 ? 'PARTIALLY_PAID' : 'PENDING'),
    stay: {
      checkIn: resv.check_in_date,
      checkOut: resv.check_out_date,
      nights: resv.nights,
      guestCount: {
        adults: resv.adults,
        children: resv.children,
      },
    },
    pricing: {
      currency: 'INR',
      totalAmount: invoiceTotal,
      advancePaid: advancePaid,
      balanceDue: Math.max(0, invoiceTotal - advancePaid),
    },
    holdExpiresAt,
    nextAction: isPaid ? 'CONFIRMED' : 'COMPLETE_PAYMENT',
  };
};

function upper(str) {
  return String(str || '').toUpperCase();
}
