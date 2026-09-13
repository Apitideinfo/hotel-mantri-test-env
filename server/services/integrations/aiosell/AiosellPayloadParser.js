/**
 * AiosellPayloadParser.js
 * 
 * Extracts and normalizes reservation payloads coming from either
 * Aiosell's inbound webhooks or the external Channel Manager API.
 * Preserves all useful reservation, guest, room, and financial data.
 */

const normalizeDateStr = (dateVal) => {
  if (!dateVal) return null;
  if (typeof dateVal === 'string') {
    // If it includes T or space, take date part
    const trimmed = dateVal.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  } else if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    return dateVal.toISOString().slice(0, 10);
  }
  return null;
};

const normalizeAction = (actionVal, statusVal) => {
  const raw = String(actionVal || statusVal || 'book').toLowerCase().trim();
  if (['cancel', 'cancellation', 'cancelled', 'delete'].includes(raw)) return 'cancel';
  if (['modify', 'modification', 'modified', 'update', 'updated', 'amend'].includes(raw)) return 'modify';
  return 'book';
};

export const parseWebhookPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    const err = new Error('Invalid webhook payload: payload must be an object');
    err.status = 400;
    throw err;
  }

  const rawAction = payload.action || payload.event || payload.status || 'book';
  const hotelCode = payload.hotelCode || payload.hotel_code || payload.hotelId;
  const bookingId = payload.bookingId || payload.booking_id || payload.reservation_id || payload.cmBookingId || payload.cm_booking_id;

  if (!hotelCode || !bookingId) {
    const err = new Error('Invalid webhook payload structure: missing required fields (hotelCode, bookingId)');
    err.status = 400;
    throw err;
  }

  const action = normalizeAction(rawAction, payload.booking_status);
  const channel = payload.channel || payload.ota || payload.channelName || payload.channel_name || payload.source || 'OTA';
  const cmBookingId = payload.cmBookingId || payload.cm_booking_id || null;

  // Check-in and check-out dates
  const checkIn = normalizeDateStr(
    payload.checkin || payload.checkIn || payload.check_in || payload.arrival || payload.start_date
  );
  const checkOut = normalizeDateStr(
    payload.checkout || payload.checkOut || payload.check_out || payload.departure || payload.end_date
  );

  // Room details (support both root-level fields and nested rooms array)
  const roomObj = Array.isArray(payload.rooms) && payload.rooms.length > 0 ? payload.rooms[0] : null;
  const roomCode = payload.roomCode || payload.room_code || payload.roomId || roomObj?.roomCode || roomObj?.roomId || null;
  const roomName = payload.roomName || payload.room_name || roomObj?.roomName || roomObj?.name || null;
  const rateplanCode = payload.rateplanCode || payload.rate_plan_code || payload.ratePlanCode || roomObj?.rateplanCode || roomObj?.ratePlanId || null;
  const rateplanName = payload.rateplanName || payload.rate_plan_name || roomObj?.rateplanName || null;

  // Occupancy
  const occupancyObj = roomObj?.occupancy || payload.occupancy || payload.pax || null;
  const adults = Number(occupancyObj?.adults ?? payload.adults ?? roomObj?.adults ?? 1) || 1;
  const children = Number(occupancyObj?.children ?? payload.children ?? roomObj?.children ?? 0) || 0;
  const infants = Number(occupancyObj?.infants ?? payload.infants ?? roomObj?.infants ?? 0) || 0;
  const roomsCount = Number(payload.roomsCount || payload.rooms_count || (Array.isArray(payload.rooms) ? payload.rooms.length : 1)) || 1;

  // Guest details
  const guestObj = payload.guest || payload.customer || null;
  const firstName = payload.guestFirstName || guestObj?.firstName || guestObj?.first_name || '';
  const lastName = payload.guestLastName || guestObj?.lastName || guestObj?.last_name || '';
  const rawGuestName = payload.guestName || payload.guest_name || roomObj?.guestName || (firstName || lastName ? `${firstName} ${lastName}`.trim() : '');
  const guestName = rawGuestName || 'OTA Guest';

  const guestPhone = payload.guestPhone || payload.guest_phone || guestObj?.phone || guestObj?.mobile || '';
  const guestEmail = payload.guestEmail || payload.guest_email || guestObj?.email || '';

  // Guest address
  let guestAddress = '';
  if (typeof payload.guestAddress === 'string') {
    guestAddress = payload.guestAddress;
  } else if (guestObj?.address && typeof guestObj.address === 'object') {
    const addrParts = [
      guestObj.address.line1,
      guestObj.address.city,
      guestObj.address.state,
      guestObj.address.zipCode || guestObj.address.zip_code,
      guestObj.address.country
    ].filter(Boolean);
    guestAddress = addrParts.join(', ');
  } else if (typeof guestObj?.address === 'string') {
    guestAddress = guestObj.address;
  }

  const nationality = payload.nationality || guestObj?.nationality || guestObj?.country || guestObj?.address?.country || '';

  // Financials
  const amountObj = typeof payload.amount === 'object' && payload.amount !== null ? payload.amount : null;
  const amountAfterTax = Number(amountObj?.amountAfterTax ?? (typeof payload.amount === 'number' ? payload.amount : payload.total_price ?? payload.price ?? 0)) || 0;
  const amountBeforeTax = amountObj?.amountBeforeTax !== undefined ? Number(amountObj.amountBeforeTax) : null;
  const taxes = amountObj?.tax !== undefined ? Number(amountObj.tax) : (amountBeforeTax !== null ? Math.max(0, amountAfterTax - amountBeforeTax) : 0);
  const discounts = Number(payload.discount ?? amountObj?.discount ?? 0) || 0;
  const currency = payload.currency || amountObj?.currency || 'INR';

  // Payment info
  // `pah` = Pay At Hotel. If pah is false, reservation is prepaid by OTA.
  let paymentStatus = 'unpaid';
  if (payload.pah === false) {
    paymentStatus = 'paid';
  } else if (payload.pah === true) {
    paymentStatus = 'unpaid';
  } else if (payload.paymentStatus || payload.payment_status) {
    const rawPay = String(payload.paymentStatus || payload.payment_status).toLowerCase();
    paymentStatus = rawPay === 'paid' ? 'paid' : 'unpaid';
  }

  // Timestamps
  const bookedOn = payload.bookedOn || payload.bookingDate || payload.booking_date || payload.created_at || null;
  const modificationDate = payload.modified_at || payload.modification_date || null;
  const cancellationDate = payload.cancelled_at || payload.cancellation_date || null;

  // Requests / remarks
  const specialRequests = payload.specialRequests || payload.special_requests || payload.remarks || payload.notes || '';
  const remarks = payload.remarks || payload.notes || specialRequests || '';

  // Check if this payload has the minimal complete reservation fields
  // A complete payload needs at least checkIn, checkOut, and roomCode or amount
  const isCompletePayload = Boolean(checkIn && checkOut && (roomCode || amountAfterTax > 0));

  return {
    action,
    hotelCode: String(hotelCode),
    bookingId: String(bookingId),
    cmBookingId: cmBookingId ? String(cmBookingId) : null,
    channelName: channel,
    checkIn,
    checkOut,
    checkin: checkIn,
    checkout: checkOut,
    roomCode,
    roomName,
    rateplanCode,
    rateplanName,
    roomsCount,
    adults,
    children,
    infants,
    guestName,
    guestFirstName: firstName || null,
    guestLastName: lastName || null,
    guestPhone: String(guestPhone || '').trim(),
    guestEmail: String(guestEmail || '').trim(),
    guestAddress: guestAddress || null,
    nationality: nationality || null,
    amount: amountAfterTax,
    amountBeforeTax,
    taxes,
    discounts,
    currency,
    paymentStatus,
    paymentMode: 'OTA',
    bookedOn,
    modificationDate,
    cancellationDate,
    specialRequests,
    remarks,
    isCompletePayload,
    raw: payload,
  };
};

export const AiosellPayloadParser = {
  parseWebhookPayload,
  normalize: parseWebhookPayload,
};

export default {
  parseWebhookPayload,
  normalize: parseWebhookPayload,
};

