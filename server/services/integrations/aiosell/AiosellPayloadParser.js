/**
 * AiosellPayloadParser.js
 * 
 * Extracts and normalizes the payload coming from Aiosell's webhook.
 */

export const parseWebhookPayload = (payload) => {
  if (!payload || !payload.action || !payload.hotelCode || !payload.bookingId) {
    const err = new Error('Invalid webhook payload structure: missing required fields');
    err.status = 400;
    throw err;
  }
  
  return {
    action: String(payload.action).toLowerCase(), // book, modify, cancel
    hotelCode: String(payload.hotelCode),
    bookingId: String(payload.bookingId),
    roomCode: payload.roomCode ? String(payload.roomCode) : null,
    rateplanCode: payload.rateplanCode ? String(payload.rateplanCode) : null,
    guestName: payload.guestName || 'Aiosell Guest',
    guestPhone: payload.guestPhone || '',
    guestEmail: payload.guestEmail || '',
    checkIn: payload.checkIn, // Expecting YYYY-MM-DD
    checkOut: payload.checkOut, // Expecting YYYY-MM-DD
    roomsCount: payload.roomsCount ? parseInt(payload.roomsCount, 10) : 1,
    amount: payload.amount ? parseFloat(payload.amount) : 0,
    paymentStatus: payload.paymentStatus || 'unpaid',
    raw: payload,
  };
};

export default {
  parseWebhookPayload
};
