/**
 * AiosellPayloadParser.js
 * 
 * Extracts and normalizes the payload coming from Aiosell's webhook.
 */

export const parseWebhookPayload = (payload) => {
  const action = payload?.action || payload?.event || 'book';
  const hotelCode = payload?.hotelCode || payload?.hotel_code || payload?.hotelId;
  const bookingId = payload?.bookingId || payload?.booking_id || payload?.reservation_id;

  if (!payload || !hotelCode || !bookingId) {
    const err = new Error('Invalid webhook payload structure: missing required fields');
    err.status = 400;
    throw err;
  }
  
  const channel = payload?.channel || payload?.ota || payload?.source || payload?.channelName || payload?.channel_name || 'Aiosell';
  
  return {
    action: String(action).toLowerCase(), // book, modify, cancel
    hotelCode: String(hotelCode),
    bookingId: String(bookingId),
    channelName: channel,
    roomCode: payload?.roomCode || payload?.room_code || payload?.rooms?.[0]?.roomCode || null,
    rateplanCode: payload?.rateplanCode || payload?.rate_plan_code || payload?.ratePlanCode || payload?.rooms?.[0]?.rateplanCode || null,
    guestName: payload?.guestName || payload?.guest_name || (payload?.guest ? `${payload.guest.firstName || ''} ${payload.guest.lastName || ''}`.trim() : 'Aiosell Guest') || 'Aiosell Guest',
    guestPhone: payload?.guestPhone || payload?.guest_phone || payload?.guest?.phone || '',
    guestEmail: payload?.guestEmail || payload?.guest_email || payload?.guest?.email || '',
    checkIn: payload?.checkIn || payload?.check_in || payload?.checkin, // Expecting YYYY-MM-DD
    checkOut: payload?.checkOut || payload?.check_out || payload?.checkout, // Expecting YYYY-MM-DD
    roomsCount: payload?.roomsCount || payload?.rooms_count ? parseInt(payload.roomsCount || payload.rooms_count, 10) : 1,
    amount: payload?.amount?.amountAfterTax ?? payload?.amount ?? 0,
    paymentStatus: payload?.paymentStatus || payload?.payment_status || 'unpaid',
    raw: payload,
  };
};

export default {
  parseWebhookPayload
};
