/**
 * HOTEL MANTRI — Chatbot Booking API: Versioned Public Endpoints (/v1/public/)
 * 
 * Provides:
 * - 4.1 GET  /v1/public/room-categories
 * - 4.2 POST /v1/public/availability
 * - 4.3 POST /v1/public/quotes
 * - 4.4 POST /v1/public/bookings
 * - 4.5 GET  /v1/public/bookings/:reference
 * - 6.1 POST /v1/public/bookings/:reference/payment
 * - 6.2 POST /v1/public/bookings/:reference/verify
 */

import express from 'express';
import { getPublicRoomCategories, checkLiveAvailability } from '../services/availabilityService.js';
import { generateServerQuote } from '../services/quoteEngine.js';
import { createBookingAttempt, getBookingByReference } from '../services/bookingService.js';
import { createPaymentOrderForBooking, verifyAndSettlePayment } from '../services/paymentService.js';
import { publicRateLimiter, bookingRateLimiter, requireBotProviderAuth } from '../middleware/security.js';
import { getPublicHotelProfile } from '../services/hotelConfigService.js';

const router = express.Router();

/**
 * GET /v1/public/hotel-info
 * Approved public profile for greeting & hotel details.
 */
router.get('/hotel-info', publicRateLimiter, async (req, res, next) => {
  try {
    const profile = getPublicHotelProfile();
    res.status(200).json({
      success: true,
      data: profile,
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 4.1 GET /v1/public/room-categories
 * Returns active publicly bookable room categories.
 */
router.get('/room-categories', publicRateLimiter, async (req, res, next) => {
  try {
    const categories = await getPublicRoomCategories();
    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 4.2 POST /v1/public/availability
 * Checks real physical room availability across the stay dates.
 */
router.post('/availability', publicRateLimiter, async (req, res, next) => {
  try {
    const { checkIn, checkOut, adults, children, rooms, categoryId } = req.body || {};

    if (!checkIn || !checkOut) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_STAY_DATES',
          message: 'Both checkIn and checkOut dates are required (YYYY-MM-DD).',
          requestId: req.requestId,
        },
      });
    }

    const availability = await checkLiveAvailability({
      checkIn,
      checkOut,
      adults: adults !== undefined ? Number(adults) : 1,
      children: children !== undefined ? Number(children) : 0,
      rooms: rooms !== undefined ? Number(rooms) : 1,
      categoryId: categoryId || null,
    });

    res.status(200).json({
      success: true,
      data: availability,
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 4.3 POST /v1/public/quotes
 * Generates an authoritative server-side quote and returns a cryptographically signed token.
 */
router.post('/quotes', publicRateLimiter, async (req, res, next) => {
  try {
    const { categoryId, checkIn, checkOut, rooms, adults, children } = req.body || {};

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CATEGORY_REQUIRED',
          message: 'categoryId is required to generate a rate quote.',
          requestId: req.requestId,
        },
      });
    }

    if (!checkIn || !checkOut) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_STAY_DATES',
          message: 'checkIn and checkOut dates are required.',
          requestId: req.requestId,
        },
      });
    }

    const quote = await generateServerQuote({
      categoryId,
      checkIn,
      checkOut,
      rooms: rooms !== undefined ? Number(rooms) : 1,
      adults: adults !== undefined ? Number(adults) : 1,
      children: children !== undefined ? Number(children) : 0,
    });

    res.status(200).json({
      success: true,
      data: quote,
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 4.4 POST /v1/public/bookings
 * Creates a durable booking attempt and inventory hold.
 * Requires Idempotency-Key and valid quoteToken.
 */
router.post('/bookings', bookingRateLimiter, requireBotProviderAuth, async (req, res, next) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || req.body?.idempotencyKey;
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'Header "Idempotency-Key" is required for booking requests (minimum 8 characters).',
          requestId: req.requestId,
        },
      });
    }

    const { quoteToken, guestName, guestPhone, guestEmail, guestAddress, specialRequests } = req.body || {};

    if (!quoteToken) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'QUOTE_TOKEN_REQUIRED',
          message: 'Valid quoteToken from /v1/public/quotes is required to create a booking.',
          requestId: req.requestId,
        },
      });
    }

    const bookingResult = await createBookingAttempt({
      quoteToken,
      guestName,
      guestPhone,
      guestEmail,
      guestAddress,
      specialRequests,
      idempotencyKey,
    });

    const statusCode = bookingResult.idempotent ? 200 : 201;
    res.status(statusCode).json({
      success: true,
      data: bookingResult,
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 4.5 GET /v1/public/bookings/:reference
 * Minimal guest-facing booking status.
 * Requires guestToken in Authorization header or query parameter.
 */
router.get('/bookings/:reference', publicRateLimiter, async (req, res, next) => {
  try {
    const bookingReference = req.params.reference;
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token;

    const guestToken = (authHeader && authHeader.startsWith('Bearer '))
      ? authHeader.split(' ')[1]
      : queryToken;

    if (!guestToken) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'GUEST_TOKEN_REQUIRED',
          message: 'Guest authorization token is required (provide in Authorization: Bearer <token> or ?token=...).',
          requestId: req.requestId,
        },
      });
    }

    const booking = await getBookingByReference({
      bookingReference,
      guestToken,
    });

    res.status(200).json({
      success: true,
      data: booking,
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 6.1 POST /v1/public/bookings/:reference/payment
 * Creates a Razorpay order bound to the booking attempt and verified amount.
 */
router.post('/bookings/:reference/payment', bookingRateLimiter, async (req, res, next) => {
  try {
    const bookingReference = req.params.reference;

    const orderResult = await createPaymentOrderForBooking({
      bookingReference,
    });

    res.status(200).json({
      success: true,
      data: orderResult,
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 6.2 POST /v1/public/bookings/:reference/verify
 * Verifies Razorpay checkout signature and captured status, then atomically settles booking.
 */
router.post('/bookings/:reference/verify', bookingRateLimiter, async (req, res, next) => {
  try {
    const bookingReference = req.params.reference;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PAYMENT_FIELDS',
          message: 'razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.',
          requestId: req.requestId,
        },
      });
    }

    const settlementResult = await verifyAndSettlePayment({
      bookingReference,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });

    res.status(200).json({
      success: true,
      data: settlementResult,
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
