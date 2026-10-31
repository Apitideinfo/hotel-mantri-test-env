/**
 * HOTEL MANTRI — Payment Security Service (SEC-03 & SEC-03B)
 * 
 * Provides:
 * 1. Authoritative server-side order amount derivation (SaaS plans & reservations)
 * 2. Strict authentication, authorization, and guest checkout ownership verification
 * 3. Cryptographically signed, expiring guest checkout tokens (HMAC-SHA256)
 * 4. Constant-time timing-safe HMAC-SHA256 signature verification (crypto.timingSafeEqual)
 * 5. Provider-side payment lifecycle verification (captured, authorized, failed, refunded)
 * 6. Durable database-backed payment idempotency and atomic balance updates (RPC / ledger)
 * 7. In-memory concurrency locks and rate limiting for multi-layered defense
 */

import crypto from 'crypto';
import Razorpay from 'razorpay';
import { supabaseServiceRole } from '../supabaseClient.js';
import { resolveAuthorizedHotel } from '../middleware/auth.js';
import { paymentRateLimiter } from '../middleware/rateLimiter.js';

// Canonical SaaS Subscription Plan Prices (in paise and INR)
export const CANONICAL_PLANS = {
  basic: {
    id: 'basic',
    name: 'Basic',
    priceInr: 999,
    amountPaise: 99900,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceInr: 1999,
    amountPaise: 199900,
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    priceInr: 1999,
    amountPaise: 199900,
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    priceInr: 3999,
    amountPaise: 399900,
  },
};


// In-memory active verification mutex map to prevent concurrent duplicate processing
const activeVerificationLocks = new Map();

// In-memory fallback caches for order and payment tracking
const inMemoryProcessedPayments = new Map();
const inMemoryOrdersCache = new Map();

// Configurable Razorpay instance (enables safe test mocking)
let customRazorpayClient = null;

export const setRazorpayClient = (client) => {
  customRazorpayClient = client;
};

export const getRazorpayClient = () => {
  if (customRazorpayClient) return customRazorpayClient;
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  if (keyId && keySecret) {
    customRazorpayClient = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }
  return customRazorpayClient;
};

/**
 * Sliding window rate limiting middleware for payment endpoints.
 * Re-exported from centralized rateLimiter middleware (SEC-10).
 */
export { paymentRateLimiter };

/**
 * Resolves the secret key for guest checkout tokens.
 * Enforces production fail-closed behavior: in production, GUEST_CHECKOUT_SECRET
 * must be explicitly configured and at least 32 characters long.
 */
export const getGuestCheckoutSecret = () => {
  const secret = process.env.GUEST_CHECKOUT_SECRET;
  const isTest = process.env.NODE_ENV === 'test';
  if (!isTest) {
    if (!secret || typeof secret !== 'string' || secret.trim().length < 32) {
      throw new Error('GUEST_CHECKOUT_SECRET must be configured with at least 32 characters in all non-test environments.');
    }
    return secret.trim();
  }
  if (secret && typeof secret === 'string' && secret.trim().length >= 32) {
    return secret.trim();
  }
  return 'test_guest_checkout_secret_min_32_characters_123456';
};

/**
 * Generates an HMAC-signed, expiring guest checkout token.
 * Binds the token to a specific reservation and hotel without exposing raw credentials.
 */
export const generateGuestCheckoutToken = ({
  reservationId,
  hotelId,
  expiresInMs = 24 * 60 * 60 * 1000, // 24 hours default
}) => {
  if (!reservationId || !hotelId) {
    throw new Error('Both reservationId and hotelId are required to issue guest checkout token.');
  }

  let secret;
  try {
    secret = getGuestCheckoutSecret();
  } catch (err) {
    throw new Error('Guest token service is not properly configured.');
  }

  const exp = Date.now() + expiresInMs;
  const payload = {
    resv: String(reservationId),
    hotel: String(hotelId),
    exp,
    purpose: 'guest_checkout',
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');

  return `${payloadB64}.${sig}`;
};

/**
 * Verifies a guest checkout token using constant-time comparison and expiration checking.
 */
export const verifyGuestCheckoutToken = (token, expectedReservationId = null, allowedPurposes = ['guest_checkout']) => {
  if (!token || typeof token !== 'string') {
    return { valid: false, code: 'TOKEN_MISSING', message: 'Guest checkout token is missing.' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 2) {
    return { valid: false, code: 'TOKEN_MALFORMED', message: 'Guest checkout token is malformed.' };
  }

  let secret;
  try {
    secret = getGuestCheckoutSecret();
  } catch (err) {
    return {
      valid: false,
      code: 'GUEST_SECRET_NOT_CONFIGURED',
      message: 'Guest checkout security secret is not configured on server.',
    };
  }

  const [payloadB64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');

  const expDigest = crypto.createHash('sha256').update(expectedSig).digest();
  const actDigest = crypto.createHash('sha256').update(sig).digest();

  if (!crypto.timingSafeEqual(expDigest, actDigest)) {
    return { valid: false, code: 'TOKEN_INVALID_SIGNATURE', message: 'Guest checkout token signature is invalid.' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, code: 'TOKEN_PAYLOAD_INVALID', message: 'Guest checkout token payload cannot be decoded.' };
  }

  const validPurposes = Array.isArray(allowedPurposes) ? allowedPurposes : [allowedPurposes];
  if (!validPurposes.includes(payload.purpose)) {
    return { valid: false, code: 'TOKEN_PURPOSE_MISMATCH', message: 'Token is not authorized for requested operation.' };
  }

  if (Date.now() > payload.exp) {
    return { valid: false, code: 'TOKEN_EXPIRED', message: 'Guest checkout token has expired.' };
  }

  if (expectedReservationId && payload.resv !== String(expectedReservationId)) {
    return {
      valid: false,
      code: 'TOKEN_RESERVATION_MISMATCH',
      message: 'Guest checkout token does not match the target reservation.',
    };
  }

  return { valid: true, payload };
};

/**
 * Generates an HMAC-signed, expiring guest confirmation token.
 * Specifically scoped for accessing reservation confirmation documents without checkout permissions.
 */
export const generateGuestConfirmationToken = ({
  reservationId,
  hotelId,
  expiresInMs = 24 * 60 * 60 * 1000, // 24 hours default
}) => {
  if (!reservationId || !hotelId) {
    throw new Error('Both reservationId and hotelId are required to issue guest confirmation token.');
  }

  let secret;
  try {
    secret = getGuestCheckoutSecret();
  } catch (err) {
    throw new Error('Guest token service is not properly configured.');
  }

  const exp = Date.now() + expiresInMs;
  const payload = {
    resv: String(reservationId),
    hotel: String(hotelId),
    exp,
    purpose: 'reservation_confirmation',
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');

  return `${payloadB64}.${sig}`;
};

/**
 * Verifies a guest reservation token for document viewing, accepting checkout or confirmation scopes.
 */
export const verifyGuestReservationToken = (token, expectedReservationId = null) => {
  return verifyGuestCheckoutToken(token, expectedReservationId, [
    'guest_checkout',
    'reservation_confirmation',
    'guest_confirmation',
  ]);
};

/**
 * Resolves canonical SaaS subscription plan by ID, slug, or name.
 */
export const resolvePlanPricing = async (planIdentifier) => {
  if (!planIdentifier || typeof planIdentifier !== 'string') return null;

  const clean = planIdentifier.trim().toLowerCase().replace(/\s+plan$/i, '');
  if (CANONICAL_PLANS[clean]) {
    return CANONICAL_PLANS[clean];
  }

  // Fallback: check database subscription_plans table if available
  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
    let planQuery = supabaseServiceRole
      .from('subscription_plans')
      .select('id, name, price, price_monthly')
      .eq('is_active', true);

    if (isUuid) {
      planQuery = planQuery.eq('id', clean);
    } else {
      const sanitized = clean.replace(/[,()"'\\]/g, '');
      if (!sanitized) return null;
      planQuery = planQuery.or(`name.ilike.${sanitized},slug.ilike.${sanitized}`);
    }

    const { data: dbPlan } = await planQuery.maybeSingle();

    if (dbPlan) {
      const price = Number(dbPlan.price_monthly ?? dbPlan.price ?? 0);
      if (price > 0) {
        return {
          id: dbPlan.id,
          name: dbPlan.name,
          priceInr: price,
          amountPaise: Math.round(price * 100),
        };
      }
    }
  } catch {
    // Database query failed or table not available; rely on canonical plans
  }

  return null;
};

/**
 * Resolves authoritative reservation due balance and verifies tenant/guest access.
 */
export const resolveReservationAuthoritativeAmount = async ({
  reservationId,
  authContext = null,
  guestToken = null,
  guestEmail = null,
  guestPhone = null,
}) => {
  if (!reservationId || typeof reservationId !== 'string') {
    return {
      success: false,
      status: 400,
      code: 'INVALID_RESERVATION_ID',
      error: 'A valid reservation ID is required.',
    };
  }

  // Pre-check for unauthenticated guest checkout:
  // Strict rule: contact matching alone CANNOT authorize payment. A cryptographically signed guestToken is required.
  let tokenValidation = null;
  if (!authContext) {
    if (!guestToken) {
      return {
        success: false,
        status: 403,
        code: 'GUEST_TOKEN_REQUIRED',
        error: 'Guest checkout requires an authorized, cryptographically signed guest checkout token. Contact matching alone cannot authorize payment.',
      };
    }

    tokenValidation = verifyGuestCheckoutToken(guestToken, reservationId.trim());
    if (!tokenValidation.valid) {
      return {
        success: false,
        status: 403,
        code: tokenValidation.code,
        error: `Guest token authorization failed: ${tokenValidation.message}`,
      };
    }
  }

  try {
    const { data: resv, error } = await supabaseServiceRole
      .from('reservations')
      .select('id, hotel_id, status, rate, invoice_total, advance_paid, guest_email, guest_phone, payment_ref')
      .eq('id', reservationId.trim())
      .maybeSingle();

    if (error || !resv) {
      return {
        success: false,
        status: 404,
        code: 'RESERVATION_NOT_FOUND',
        error: 'The requested reservation does not exist.',
      };
    }

    if (resv.status === 'cancelled') {
      return {
        success: false,
        status: 400,
        code: 'RESERVATION_CANCELLED',
        error: 'Cannot create payment for a cancelled reservation.',
      };
    }

    // Tenant authorization check for authenticated staff/admin users
    if (authContext) {
      if (!authContext.isSuperAdmin && authContext.hotelId !== resv.hotel_id) {
        return {
          success: false,
          status: 403,
          code: 'HOTEL_ACCESS_DENIED',
          error: 'You are not authorized to process payment for another hotel property.',
        };
      }
    } else if (tokenValidation?.valid) {
      // Verified by cryptographically signed checkout token
      if (tokenValidation.payload.hotel !== resv.hotel_id) {
        return {
          success: false,
          status: 403,
          code: 'TOKEN_HOTEL_MISMATCH',
          error: 'Guest checkout token does not match the reservation hotel.',
        };
      }
    }

    // Authoritative balance calculation
    const total = Number(resv.invoice_total) > 0
      ? Number(resv.invoice_total)
      : (Number(resv.rate) > 0 ? Number(resv.rate) : 0);
    const advance = Number(resv.advance_paid) || 0;
    const dueBalance = Math.max(0, total - advance);

    if (dueBalance <= 0) {
      return {
        success: false,
        status: 400,
        code: 'RESERVATION_ALREADY_PAID',
        error: 'This reservation is already fully paid.',
      };
    }

    const authoritativeAmountPaise = Math.round(dueBalance * 100);

    return {
      success: true,
      reservation: resv,
      hotelId: resv.hotel_id,
      dueBalanceInr: dueBalance,
      authoritativeAmountPaise,
    };
  } catch (err) {
    const isKeyMissing = err?.message?.includes('SUPABASE_SERVICE_ROLE_KEY');
    return {
      success: false,
      status: isKeyMissing ? 503 : 500,
      code: isKeyMissing ? 'DATABASE_NOT_CONFIGURED' : 'SERVER_ERROR',
      error: err?.message || 'Failed to verify reservation.',
    };
  }
};

/**
 * Validates request payload and derives authoritative order amount.
 */
export const validateAndDeriveOrderContext = async (req) => {
  const {
    amount,
    currency = 'INR',
    planId,
    reservationId,
    guestToken,
    guestEmail,
    guestPhone,
    notes,
  } = req.body || {};

  // Currency validation
  if (typeof currency !== 'string' || currency.trim().toUpperCase() !== 'INR') {
    return {
      success: false,
      status: 400,
      code: 'INVALID_CURRENCY',
      error: 'Currency must be INR. International currencies are not supported.',
    };
  }

  // Attempt authentication resolution if token provided
  let authContext = null;
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const authResolution = await resolveAuthorizedHotel(req);
    if (!authResolution.success) {
      return {
        success: false,
        status: authResolution.status,
        code: authResolution.code,
        error: authResolution.message,
      };
    }
    authContext = authResolution;
  }

  // Candidate plan identifier
  const candidatePlan = planId || notes?.plan || req.body?.plan;

  // Case 1: SaaS Subscription Checkout
  if (candidatePlan) {
    const plan = await resolvePlanPricing(candidatePlan);
    if (!plan) {
      return {
        success: false,
        status: 400,
        code: 'INVALID_SUBSCRIPTION_PLAN',
        error: `Unknown subscription plan: ${candidatePlan}.`,
      };
    }

    // Verify client-submitted amount if provided
    if (amount !== undefined && amount !== null) {
      if (typeof amount !== 'number' || Math.round(amount) !== plan.amountPaise) {
        return {
          success: false,
          status: 400,
          code: 'AMOUNT_MISMATCH',
          error: `Client amount (${amount} paise) does not match authoritative plan pricing (${plan.amountPaise} paise).`,
        };
      }
    }

    return {
      success: true,
      checkoutType: 'subscription',
      planId: plan.id,
      planName: plan.name,
      authoritativeAmountPaise: plan.amountPaise,
      hotelId: authContext?.hotelId || null,
      authContext,
    };
  }

  // Case 2: Reservation Booking Checkout
  if (reservationId) {
    const resvResult = await resolveReservationAuthoritativeAmount({
      reservationId,
      authContext,
      guestToken: guestToken || req.body?.guest_token || req.query?.token,
      guestEmail: guestEmail || notes?.guestEmail || req.body?.guest_email,
      guestPhone: guestPhone || notes?.guestPhone || req.body?.guest_phone,
    });

    if (!resvResult.success) {
      return resvResult;
    }

    // Verify client-submitted amount if provided
    if (amount !== undefined && amount !== null) {
      if (typeof amount !== 'number' || Math.round(amount) !== resvResult.authoritativeAmountPaise) {
        return {
          success: false,
          status: 400,
          code: 'AMOUNT_MISMATCH',
          error: `Client amount (${amount} paise) does not match authoritative reservation balance (${resvResult.authoritativeAmountPaise} paise).`,
        };
      }
    }

    return {
      success: true,
      checkoutType: 'reservation',
      reservationId: resvResult.reservation.id,
      hotelId: resvResult.hotelId,
      authoritativeAmountPaise: resvResult.authoritativeAmountPaise,
      authContext,
    };
  }

  // Case 3: No valid plan or reservation reference provided
  if (!authContext) {
    return {
      success: false,
      status: 401,
      code: 'AUTH_REQUIRED',
      error: 'Authentication is required for order creation when no verified plan or reservation is specified.',
    };
  }

  return {
    success: false,
    status: 400,
    code: 'AUTHORITATIVE_REFERENCE_REQUIRED',
    error: 'An authoritative checkout reference (planId or reservationId) is required to calculate the payment amount.',
  };
};

/**
 * Constant-time HMAC-SHA256 signature verification.
 * Strictly prevents timing attacks via crypto.timingSafeEqual.
 */
export const verifyRazorpayHmacSignature = ({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
  keySecret,
}) => {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return {
      isValid: false,
      code: 'MISSING_PARAMETERS',
      message: 'Missing required signature verification fields (order_id, payment_id, signature).',
    };
  }

  if (
    typeof razorpay_order_id !== 'string' ||
    typeof razorpay_payment_id !== 'string' ||
    typeof razorpay_signature !== 'string'
  ) {
    return {
      isValid: false,
      code: 'INVALID_PAYLOAD_TYPE',
      message: 'Verification parameters must be strings.',
    };
  }

  if (!keySecret) {
    return {
      isValid: false,
      code: 'KEY_SECRET_NOT_CONFIGURED',
      message: 'Razorpay secret key is not configured on server.',
    };
  }

  const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(payload)
    .digest('hex');

  const expDigest = crypto.createHash('sha256').update(expectedSignature).digest();
  const actDigest = crypto.createHash('sha256').update(razorpay_signature).digest();
  const isValid = crypto.timingSafeEqual(expDigest, actDigest);

  return {
    isValid,
    code: isValid ? 'SIGNATURE_VALID' : 'INVALID_SIGNATURE',
    message: isValid ? 'Payment verified successfully.' : 'Invalid payment signature. Verification failed.',
  };
};

/**
 * Verifies the provider-side payment lifecycle state before marking a transaction as settled.
 * Strictly ensures payment belongs to the expected order, amount, currency, and is in 'captured' state.
 */
export const verifyRazorpayPaymentLifecycle = async ({
  gateway,
  paymentId,
  expectedOrderId,
  expectedAmountPaise,
  expectedCurrency = 'INR',
}) => {
  if (!gateway || typeof gateway.payments?.fetch !== 'function') {
    return {
      success: false,
      code: 'GATEWAY_NOT_CONFIGURED',
      status: 503,
      message: 'Payment gateway client is not available for lifecycle verification.',
    };
  }

  try {
    const payment = await gateway.payments.fetch(paymentId);
    if (!payment) {
      return {
        success: false,
        code: 'PAYMENT_NOT_FOUND',
        status: 404,
        message: 'Payment record was not found on Razorpay provider.',
      };
    }

    // 1. Order ID cross-binding check
    if (expectedOrderId && payment.order_id && payment.order_id !== expectedOrderId) {
      return {
        success: false,
        code: 'ORDER_PAYMENT_MISMATCH',
        status: 400,
        message: 'Payment order ID does not match expected Razorpay order ID.',
        details: { expected: expectedOrderId, actual: payment.order_id },
      };
    }

    // 2. Status verification
    if (payment.status === 'failed') {
      return {
        success: false,
        code: 'PAYMENT_FAILED',
        status: 400,
        message: 'Payment has failed on Razorpay.',
      };
    }

    if (payment.status === 'refunded') {
      return {
        success: false,
        code: 'PAYMENT_REFUNDED',
        status: 400,
        message: 'Payment has been refunded and cannot be credited.',
      };
    }

    if (payment.status === 'authorized') {
      return {
        success: false,
        code: 'PAYMENT_NOT_CAPTURED',
        status: 400,
        message: 'Payment is authorized but not captured by provider.',
        providerStatus: payment.status,
      };
    }

    if (payment.status !== 'captured') {
      return {
        success: false,
        code: 'INVALID_PAYMENT_STATUS',
        status: 400,
        message: `Payment status is ${payment.status}, expected captured.`,
        providerStatus: payment.status,
      };
    }

    // 3. Amount & Currency verification
    if (expectedAmountPaise && Number(payment.amount) !== Number(expectedAmountPaise)) {
      return {
        success: false,
        code: 'AMOUNT_MISMATCH',
        status: 400,
        message: 'Captured payment amount does not match expected order amount.',
        details: { expected: expectedAmountPaise, actual: payment.amount },
      };
    }

    if (expectedCurrency && payment.currency && payment.currency.toUpperCase() !== expectedCurrency.toUpperCase()) {
      return {
        success: false,
        code: 'CURRENCY_MISMATCH',
        status: 400,
        message: 'Captured payment currency does not match expected currency.',
        details: { expected: expectedCurrency, actual: payment.currency },
      };
    }

    return {
      success: true,
      payment,
    };
  } catch (err) {
    return {
      success: false,
      code: 'PROVIDER_FETCH_FAILED',
      status: 502,
      message: err?.message || 'Failed to verify payment lifecycle with Razorpay.',
    };
  }
};

/**
 * Serializes concurrent verification requests on the same payment ID.
 */
export const withPaymentLock = async (paymentId, task) => {
  if (!paymentId) return task();

  const prevLock = activeVerificationLocks.get(paymentId) || Promise.resolve();

  let release;
  const currentLock = new Promise((resolve) => {
    release = resolve;
  });

  activeVerificationLocks.set(paymentId, prevLock.then(() => currentLock));

  try {
    await prevLock;
    return await task();
  } finally {
    release();
    if (activeVerificationLocks.get(paymentId) === currentLock) {
      activeVerificationLocks.delete(paymentId);
    }
  }
};

/**
 * Records an order or payment audit event in the database using service role,
 * while maintaining an in-memory cache for fast local retrieval and offline resilience.
 */
export const recordPaymentAuditLog = async ({
  action,
  recordId,
  hotelId = null,
  metadata = {},
  severity = 'info',
}) => {
  // Update in-memory caches
  if (action === 'PAYMENT_ORDER_CREATED') {
    inMemoryOrdersCache.set(String(recordId), {
      orderId: String(recordId),
      hotelId,
      metadata,
      notes: metadata?.notes || {},
    });
  } else if (action === 'PAYMENT_VERIFIED') {
    inMemoryProcessedPayments.set(String(recordId), {
      paymentId: String(recordId),
      orderId: metadata?.order_id || null,
      metadata,
      verifiedAt: new Date().toISOString(),
    });
  }

  try {
    await supabaseServiceRole.from('audit_logs').insert({
      action,
      module: 'payment',
      hotel_id: hotelId,
      record_id: String(recordId),
      metadata,
      severity,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[PaymentSecurityService] Audit log write non-fatal warning:', err?.message || err);
  }
};

/**
 * Performs durable, atomic payment verification and reservation settlement.
 * Delegates to database RPC process_verified_payment when available, with
 * resilient database-ledger and audit-trail fallback.
 */
export const processVerifiedPaymentDurable = async ({
  orderId,
  paymentId,
  reservationId = null,
  hotelId = null,
  amountPaise = 0,
  metadata = {},
}) => {
  const pId = String(paymentId);
  const oId = String(orderId);

  // 0. Pre-check idempotency across in-memory cache, audit_logs, and ledger
  const existingIdemp = await checkPaymentIdempotency(pId);
  if (existingIdemp.alreadyProcessed) {
    return {
      success: true,
      idempotent: true,
      message: 'Payment verified successfully (previously processed)',
      source: existingIdemp.source || 'idempotency_check',
    };
  }

  // 1. Try atomic database RPC
  let rpcResult = null;
  let rpcError = null;
  try {
    const response = await supabaseServiceRole.rpc('process_verified_payment', {
      p_order_id: oId,
      p_payment_id: pId,
      p_reservation_id: reservationId || null,
      p_hotel_id: hotelId || null,
      p_amount_paise: Number(amountPaise),
      p_metadata: metadata,
    });
    rpcResult = response?.data;
    rpcError = response?.error;
  } catch (err) {
    rpcError = err;
  }

  if (!rpcError && rpcResult) {
    // Keep in-memory cache synchronized
    inMemoryProcessedPayments.set(pId, {
      paymentId: pId,
      orderId: oId,
      metadata,
      verifiedAt: new Date().toISOString(),
    });

    return {
      success: Boolean(rpcResult.success),
      idempotent: Boolean(rpcResult.idempotent),
      message: rpcResult.message || 'Payment processed via database RPC',
      source: 'database_rpc',
    };
  }

  // Production Fail-Closed Gate:
  // Production financial settlement MUST use the approved database-backed atomic transaction path.
  // Never fall back to in-memory cache or sequential audit logs and report settlement success in production.
  if (process.env.NODE_ENV === 'production') {
    return {
      success: false,
      status: 503,
      code: 'SETTLEMENT_RECORDING_FAILED',
      error: 'Payment settlement database recording failed. Transaction can be safely retried or reconciled.',
      recoverable: true,
      orderId: oId,
      paymentId: pId,
      source: 'database_rpc_failure',
    };
  }

  // 2. Check dedicated payment_transactions table if available
  try {
    const { data: existingTx } = await supabaseServiceRole
      .from('payment_transactions')
      .select('id, payment_id, order_id')
      .eq('payment_id', pId)
      .maybeSingle();

    if (existingTx) {
      inMemoryProcessedPayments.set(pId, {
        paymentId: pId,
        orderId: oId,
        metadata,
        verifiedAt: new Date().toISOString(),
      });

      return {
        success: true,
        idempotent: true,
        message: 'Payment verified successfully (previously processed in ledger)',
        source: 'payment_transactions_table',
      };
    }

    // Insert into payment_transactions ledger
    await supabaseServiceRole
      .from('payment_transactions')
      .insert({
        order_id: oId,
        payment_id: pId,
        reservation_id: reservationId || null,
        hotel_id: hotelId || null,
        amount_paise: Number(amountPaise),
        status: 'captured',
        metadata,
      });
  } catch {
    // Table not yet migrated; fall through to audit log + in-memory protection
  }

  // 3. Update reservation balance
  if (reservationId) {
    try {
      const { data: currentResv } = await supabaseServiceRole
        .from('reservations')
        .select('id, advance_paid, rate, invoice_total')
        .eq('id', reservationId)
        .maybeSingle();

      if (currentResv) {
        const paidAmountInr = amountPaise ? Math.round(Number(amountPaise) / 100) : 0;
        const newAdvance = (Number(currentResv.advance_paid) || 0) + paidAmountInr;

        await supabaseServiceRole
          .from('reservations')
          .update({
            payment_ref: pId,
            payment_mode: 'Razorpay',
            advance_paid: newAdvance,
            updated_at: new Date().toISOString(),
          })
          .eq('id', reservationId);
      }
    } catch (updateErr) {
      console.warn('[ProcessPayment] Reservation update fallback warning:', updateErr?.message || updateErr);
    }
  }

  // 4. Record audit log
  await recordPaymentAuditLog({
    action: 'PAYMENT_VERIFIED',
    recordId: pId,
    hotelId,
    metadata: {
      order_id: oId,
      payment_id: pId,
      reservation_id: reservationId || null,
      amount_paise: amountPaise,
      verified_at: new Date().toISOString(),
      ...metadata,
    },
  });

  return {
    success: true,
    idempotent: false,
    message: 'Payment verified successfully',
    source: 'application_fallback',
  };
};

/**
 * Checks whether this payment ID has already been verified and processed.
 */
export const checkPaymentIdempotency = async (paymentId) => {
  if (!paymentId) return { alreadyProcessed: false };

  const idStr = String(paymentId);

  // 1. Check in-memory processed payments cache
  if (inMemoryProcessedPayments.has(idStr)) {
    const cached = inMemoryProcessedPayments.get(idStr);
    return {
      alreadyProcessed: true,
      orderId: cached.orderId || cached.metadata?.order_id || null,
      source: 'in_memory_cache',
    };
  }

  // 2. Check payment_transactions table
  try {
    const { data: existingTx } = await supabaseServiceRole
      .from('payment_transactions')
      .select('id, payment_id, order_id, created_at')
      .eq('payment_id', idStr)
      .maybeSingle();

    if (existingTx) {
      inMemoryProcessedPayments.set(idStr, {
        paymentId: idStr,
        orderId: existingTx.order_id,
      });

      return {
        alreadyProcessed: true,
        orderId: existingTx.order_id,
        source: 'payment_transactions',
      };
    }
  } catch {
    // Non-fatal if table not migrated
  }

  // 3. Check audit_logs table
  try {
    const { data: existingAudit } = await supabaseServiceRole
      .from('audit_logs')
      .select('id, record_id, metadata, created_at')
      .eq('action', 'PAYMENT_VERIFIED')
      .eq('record_id', idStr)
      .maybeSingle();

    if (existingAudit) {
      inMemoryProcessedPayments.set(idStr, {
        paymentId: idStr,
        orderId: existingAudit.metadata?.order_id || null,
        metadata: existingAudit.metadata,
      });

      return {
        alreadyProcessed: true,
        auditRecord: existingAudit,
        orderId: existingAudit.metadata?.order_id || null,
        source: 'audit_logs',
      };
    }

    // 4. Check reservations table payment_ref
    const { data: existingResv } = await supabaseServiceRole
      .from('reservations')
      .select('id, hotel_id, payment_ref')
      .eq('payment_ref', idStr)
      .maybeSingle();

    if (existingResv) {
      return {
        alreadyProcessed: true,
        reservationId: existingResv.id,
        source: 'reservations_table',
      };
    }
  } catch {
    // Audit lookup non-fatal; proceed with verification
  }

  return { alreadyProcessed: false };
};

/**
 * Fetches order record from audit logs, in-memory cache, or Razorpay provider to verify order association.
 */
export const fetchOrderAssociation = async (orderId, razorpayInstance = null) => {
  if (!orderId) return null;

  const orderStr = String(orderId);

  // 1. Check in-memory orders cache
  if (inMemoryOrdersCache.has(orderStr)) {
    const cached = inMemoryOrdersCache.get(orderStr);
    return {
      orderId: cached.orderId,
      hotelId: cached.hotelId,
      notes: cached.notes || cached.metadata?.notes || {},
      amount: cached.metadata?.amount,
      source: 'in_memory_cache',
    };
  }

  // 2. Check local payment_transactions or audit_logs
  try {
    const { data: auditOrder } = await supabaseServiceRole
      .from('audit_logs')
      .select('record_id, hotel_id, metadata, created_at')
      .eq('action', 'PAYMENT_ORDER_CREATED')
      .eq('record_id', orderStr)
      .maybeSingle();

    if (auditOrder && auditOrder.metadata) {
      return {
        orderId: auditOrder.record_id,
        hotelId: auditOrder.hotel_id,
        notes: auditOrder.metadata.notes || {},
        amount: auditOrder.metadata.amount,
        source: 'audit_logs',
      };
    }
  } catch {
    // Non-fatal
  }

  // 3. Fallback: query Razorpay provider API if instance available
  const client = razorpayInstance || getRazorpayClient();
  if (client && typeof client.orders?.fetch === 'function') {
    try {
      const rzpOrder = await client.orders.fetch(orderStr);
      if (rzpOrder) {
        return {
          orderId: rzpOrder.id,
          hotelId: rzpOrder.notes?.hotelId || null,
          notes: rzpOrder.notes || {},
          amount: rzpOrder.amount,
          source: 'razorpay_api',
        };
      }
    } catch {
      // Razorpay fetch error
    }
  }

  return null;
};
