/**
 * HOTEL MANTRI — Chatbot Booking API: Authoritative Quote & Cryptographic Token Engine
 * 
 * Provides:
 * 1. Server-authoritative price & tax derivation from database rates
 * 2. Strict ISO calendar date calculation and stay nights derivation [checkIn, checkOut)
 * 3. Exact tax computation using Hotel Mantri's GST engine (Exclusive / Inclusive / No Scope)
 * 4. Integer minor units (paise) for Razorpay precision
 * 5. Tamper-evident, HMAC-SHA256 cryptographically signed quote tokens with expiration
 * 6. Zero client-supplied amount trusting
 */

import crypto from 'crypto';
import { supabase } from '../db/supabase.js';
import { config } from '../config/environment.js';
import { getConfiguredHotelId, getPublicHotelProfile } from './hotelConfigService.js';

/**
 * Calculates stay nights using UTC arithmetic to avoid timezone shift errors.
 */
export const calculateStayNights = (checkInStr, checkOutStr) => {
  if (!checkInStr || !checkOutStr) return 0;
  const ci = String(checkInStr).slice(0, 10);
  const co = String(checkOutStr).slice(0, 10);
  if (ci >= co) return 0;

  const [y1, m1, d1] = ci.split('-').map(Number);
  const [y2, m2, d2] = co.split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  const diffDays = Math.round((utc2 - utc1) / 86400000);
  return diffDays > 0 ? diffDays : 0;
};

/**
 * Validates strict ISO 8601 YYYY-MM-DD calendar dates.
 */
export const isValidDateString = (str) => {
  if (!str || typeof str !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/**
 * Resolves authoritative nightly rate from database room_categories and rate_plans.
 */
export const resolveAuthoritativeRate = async ({ hotelId, categoryId }) => {
  // 1. Fetch category from database
  const { data: cat, error: catErr } = await supabase
    .from('room_categories')
    .select('id, hotel_id, name, default_tariff, extra_bed_charge, is_active')
    .eq('id', categoryId)
    .eq('hotel_id', hotelId)
    .maybeSingle();

  if (catErr || !cat) {
    const err = new Error(`Room category ${categoryId} does not exist for configured hotel.`);
    err.status = 404;
    err.code = 'CATEGORY_NOT_FOUND';
    throw err;
  }

  if (!cat.is_active) {
    const err = new Error(`Room category "${cat.name}" is currently inactive and not bookable.`);
    err.status = 400;
    err.code = 'CATEGORY_INACTIVE';
    throw err;
  }

  // 2. Check for active rate plan
  let nightlyRate = Number(cat.default_tariff);

  const { data: ratePlans } = await supabase
    .from('rate_plans')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('is_active', true)
    .ilike('plan_name', `%${cat.name}%`)
    .limit(1);

  if (ratePlans && ratePlans.length > 0 && Number(ratePlans[0].base_rate) > 0) {
    nightlyRate = Number(ratePlans[0].base_rate);
  }

  // Fallback: Check if rooms in this category have a configured tariff
  if (nightlyRate <= 0) {
    const { data: sampleRoom } = await supabase
      .from('rooms')
      .select('default_tariff')
      .eq('hotel_id', hotelId)
      .eq('category_id', categoryId)
      .gt('default_tariff', 0)
      .limit(1)
      .maybeSingle();

    if (sampleRoom && Number(sampleRoom.default_tariff) > 0) {
      nightlyRate = Number(sampleRoom.default_tariff);
    }
  }

  // If rate cannot be resolved, fail closed instead of guessing (Constraint 4.3)
  if (!nightlyRate || nightlyRate <= 0) {
    const err = new Error(`No active rate is configured for category "${cat.name}". Please contact hotel reservations.`);
    err.status = 422;
    err.code = 'RATE_NOT_AVAILABLE';
    throw err;
  }

  return {
    category: cat,
    nightlyRate,
  };
};

/**
 * Computes GST breakdown using Hotel Mantri's rules.
 */
export const calculateTaxes = ({ preTaxAmount, gstMode = 'Exclusive', gstSlab = 12 }) => {
  const amount = Number(preTaxAmount) || 0;
  const slab = Number(gstSlab) || 0;

  if (gstMode === 'No Scope' || slab === 0) {
    return {
      taxableAmount: amount,
      gstAmount: 0,
      cgst: 0,
      sgst: 0,
      totalAmount: amount,
    };
  }

  if (gstMode === 'Inclusive') {
    const taxable = Math.round((amount / (1 + slab / 100)) * 100) / 100;
    const gst = Math.round((amount - taxable) * 100) / 100;
    return {
      taxableAmount: taxable,
      gstAmount: gst,
      cgst: Math.round((gst / 2) * 100) / 100,
      sgst: Math.round((gst / 2) * 100) / 100,
      totalAmount: amount,
    };
  }

  // Exclusive
  const gst = Math.round((amount * (slab / 100)) * 100) / 100;
  return {
    taxableAmount: amount,
    gstAmount: gst,
    cgst: Math.round((gst / 2) * 100) / 100,
    sgst: Math.round((gst / 2) * 100) / 100,
    totalAmount: Math.round((amount + gst) * 100) / 100,
  };
};

/**
 * Creates an authoritative server quote and issues a cryptographically signed token.
 */
export const generateServerQuote = async ({
  categoryId,
  checkIn,
  checkOut,
  rooms = 1,
  adults = 1,
  children = 0,
}) => {
  const hotelId = getConfiguredHotelId();

  // 1. Date Validation
  if (!isValidDateString(checkIn) || !isValidDateString(checkOut)) {
    const err = new Error('Check-in and check-out dates must be valid ISO calendar dates (YYYY-MM-DD).');
    err.status = 400;
    err.code = 'INVALID_DATE_FORMAT';
    throw err;
  }

  const nights = calculateStayNights(checkIn, checkOut);
  if (nights <= 0) {
    const err = new Error(`Check-out date (${checkOut}) must be strictly after check-in date (${checkIn}).`);
    err.status = 400;
    err.code = 'INVALID_STAY_DATES';
    throw err;
  }

  if (nights > 30) {
    const err = new Error('Maximum permitted chatbot stay length is 30 nights. Please contact hotel directly for extended stays.');
    err.status = 400;
    err.code = 'MAX_STAY_EXCEEDED';
    throw err;
  }

  const roomCount = Math.max(1, parseInt(rooms, 10) || 1);
  if (roomCount > 5) {
    const err = new Error('Maximum online booking limit is 5 rooms. For group bookings, please contact hotel front desk.');
    err.status = 400;
    err.code = 'MAX_ROOMS_EXCEEDED';
    throw err;
  }

  // 2. Resolve Authoritative Nightly Rate
  const { category, nightlyRate } = await resolveAuthoritativeRate({ hotelId, categoryId });

  // 3. Calculate Itemized Pricing
  const subtotal = nightlyRate * nights * roomCount;
  const hotelProfile = getPublicHotelProfile();
  const gstMode = hotelProfile.gstMode || 'Exclusive';
  const gstSlab = hotelProfile.defaultGstSlab || (nightlyRate >= 7500 ? 18 : 12);

  const taxes = calculateTaxes({
    preTaxAmount: subtotal,
    gstMode,
    gstSlab,
  });

  const totalPaise = Math.round(taxes.totalAmount * 100);
  const quoteId = `HM-QTE-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const ttlSeconds = config().security.bookingHoldTtlSeconds;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  // 4. Construct Cryptographically Signed Quote Payload
  const payload = {
    quoteId,
    hotelId,
    categoryId,
    categoryName: category.name,
    checkIn,
    checkOut,
    nights,
    rooms: roomCount,
    adults: Math.max(1, parseInt(adults, 10) || 1),
    children: Math.max(0, parseInt(children, 10) || 0),
    ratePerNight: nightlyRate,
    subtotalInr: subtotal,
    taxableAmountInr: taxes.taxableAmount,
    gstAmountInr: taxes.gstAmount,
    totalAmountInr: taxes.totalAmount,
    totalAmountPaise: totalPaise,
    currency: 'INR',
    exp: Date.now() + ttlSeconds * 1000,
  };

  const secret = config().security.bookingTokenSecret;
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
  const quoteToken = `${payloadB64}.${signature}`;

  return {
    quoteId,
    quoteToken,
    expiresAt,
    stay: {
      checkIn,
      checkOut,
      nights,
      rooms: roomCount,
      adults: payload.adults,
      children: payload.children,
    },
    category: {
      id: category.id,
      name: category.name,
    },
    pricing: {
      currency: 'INR',
      ratePerNight: nightlyRate,
      subtotal: subtotal,
      taxes: {
        mode: gstMode,
        slabPercent: gstSlab,
        gstAmount: taxes.gstAmount,
        cgst: taxes.cgst,
        sgst: taxes.sgst,
      },
      totalAmount: taxes.totalAmount,
      totalAmountPaise: totalPaise,
    },
  };
};

/**
 * Validates and unpacks a signed quoteToken.
 * Rejects tampered, expired, or cross-hotel quotes.
 */
export const verifyQuoteToken = (quoteToken) => {
  if (!quoteToken || typeof quoteToken !== 'string') {
    const err = new Error('Quote reference token is missing or invalid.');
    err.status = 400;
    err.code = 'QUOTE_TOKEN_MISSING';
    throw err;
  }

  const parts = quoteToken.trim().split('.');
  if (parts.length !== 2) {
    const err = new Error('Quote reference token is malformed.');
    err.status = 400;
    err.code = 'QUOTE_TOKEN_MALFORMED';
    throw err;
  }

  const [payloadB64, providedSig] = parts;
  const secret = config().security.bookingTokenSecret;

  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');

  // Constant-time signature comparison (SEC-09)
  const hashProvided = crypto.createHash('sha256').update(providedSig).digest();
  const hashExpected = crypto.createHash('sha256').update(expectedSig).digest();

  if (!crypto.timingSafeEqual(hashProvided, hashExpected)) {
    const err = new Error('Quote reference token has an invalid signature. Tampering detected.');
    err.status = 400;
    err.code = 'QUOTE_SIGNATURE_INVALID';
    throw err;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    const err = new Error('Unable to decode quote token payload.');
    err.status = 400;
    err.code = 'QUOTE_PAYLOAD_INVALID';
    throw err;
  }

  // Expiration check
  if (Date.now() > payload.exp) {
    const err = new Error('Quote has expired. Please request a fresh rate quote.');
    err.status = 410;
    err.code = 'QUOTE_EXPIRED';
    throw err;
  }

  // Tenant binding check
  const configuredHotelId = getConfiguredHotelId();
  if (String(payload.hotelId).toLowerCase() !== String(configuredHotelId).toLowerCase()) {
    const err = new Error('Quote does not belong to configured hotel property.');
    err.status = 403;
    err.code = 'QUOTE_HOTEL_MISMATCH';
    throw err;
  }

  return payload;
};
