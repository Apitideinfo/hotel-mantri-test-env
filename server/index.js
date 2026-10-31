import express from 'express';
import helmet from 'helmet';
import { corsMiddleware, getAllowedOrigins } from './middleware/corsConfig.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import aiosellRoutes from './routes/aiosell.js';
import aiosellIntegrationRoutes from './services/integrations/aiosell/AiosellWebhookController.js';
import { processPendingRoomAllocations } from './services/RoomAssignmentService.js';
import { timingMiddleware } from './middleware/timing.js';

dotenv.config();

/**
 * M6: Redacts sensitive query parameter values (tokens, secrets, credentials) from request logs.
 */
export const sanitizeUrlForLog = (urlStr) => {
  if (!urlStr || typeof urlStr !== 'string') return '';
  const qIdx = urlStr.indexOf('?');
  if (qIdx === -1) return urlStr;
  const pathPart = urlStr.slice(0, qIdx);
  const rawQuery = urlStr.slice(qIdx + 1);
  if (!rawQuery) return pathPart;

  const sensitiveKeys = new Set(['token', 'auth', 'auth_token', 'key', 'signature', 'code', 'password', 'guest_token']);
  const sanitizedParams = rawQuery.split('&').map((param) => {
    const eqIdx = param.indexOf('=');
    if (eqIdx === -1) return param;
    const key = param.slice(0, eqIdx);
    const keyLower = decodeURIComponent(key).toLowerCase().trim();
    if (sensitiveKeys.has(keyLower)) {
      return `${key}=[REDACTED]`;
    }
    return param;
  });

  return `${pathPart}?${sanitizedParams.join('&')}`;
};

// Server Lifecycle & Graceful Shutdown State
let isShuttingDown = false;
let activeRequests = 0;
let serverInstance = null;
const activeSockets = new Set();
let shutdownPromise = null;
let shutdownTimeoutTimer = null;

export const getShutdownStatus = () => ({
  isShuttingDown,
  activeRequests,
  activeSocketsCount: activeSockets.size,
});

export const setServerInstance = (srv) => {
  serverInstance = srv;
  if (srv) {
    srv.on('connection', (socket) => {
      activeSockets.add(socket);
      socket.on('close', () => {
        activeSockets.delete(socket);
      });
    });
  }
};

process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled Promise Rejection (non-fatal):', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Fatal Uncaught Exception encountered:', err);
  if (process.env.NODE_ENV !== 'test') {
    gracefulShutdown('uncaughtException', 1).catch(() => {
      process.exit(1);
    });
  }
});

const app = express();
const PORT = process.env.PORT || 5000;

// H5: Trust Vercel / reverse proxy 1-hop for accurate req.ip rate limiting
app.set('trust proxy', 1);

// M1: Helmet security headers (HSTS, nosniff, Referrer-Policy, frameguard/frame-ancestors)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' },
  })
);

app.use(corsMiddleware);

app.use((req, res, next) => {
  const incomingReqId = req.headers['x-request-id'];
  const isValidReqId = typeof incomingReqId === 'string' && /^[A-Za-z0-9-_]{8,64}$/.test(incomingReqId);
  const requestId = isValidReqId ? incomingReqId : `HM-REQ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Safe Server Shutdown: stop accepting new requests during graceful shutdown
  if (isShuttingDown) {
    res.setHeader('Connection', 'close');
    return res.status(503).json({
      success: false,
      code: 'SERVER_SHUTTING_DOWN',
      error: 'Server is undergoing graceful shutdown. New requests are not accepted.',
      activeRequests,
      uptime: Number(process.uptime().toFixed(2)),
      requestId,
    });
  }

  // Track in-flight requests for bounded draining
  activeRequests++;
  let requestFinished = false;
  const onFinishOrClose = () => {
    if (!requestFinished) {
      requestFinished = true;
      activeRequests = Math.max(0, activeRequests - 1);
    }
  };
  res.on('finish', onFinishOrClose);
  res.on('close', onFinishOrClose);

  // URL Normalization Middleware: ensure /Test/api and /test/api, or stripped /api routes reach their handlers
  const original = req.url || '';
  if (req.url === '/api/index.js' || req.url.startsWith('/api/index.js?')) {
    const matched = req.headers['x-forwarded-uri'] || req.headers['x-invoke-path'] || req.headers['x-vercel-matched-path'] || req.headers['x-matched-path'];
    if (matched && matched.startsWith('/api') && !matched.startsWith('/api/index.js')) {
      const qIdx = original.indexOf('?');
      const queryString = qIdx !== -1 && !matched.includes('?') ? original.slice(qIdx) : '';
      req.url = matched + queryString;
    }
  } else if (req.url.startsWith('/Test/api')) {
    req.url = req.url.replace(/^\/Test\/api/, '/api');
  } else if (req.url.startsWith('/test/api')) {
    req.url = req.url.replace(/^\/test\/api/, '/api');
  } else if (!req.url.startsWith('/api') && req.url !== '/' && !req.url.startsWith('/index.html') && !req.url.startsWith('/assets/')) {
    req.url = `/api${req.url.startsWith('/') ? req.url : `/${req.url}`}`;
  }

  const start = Date.now();
  res.on('finish', () => {
    const safeOriginal = sanitizeUrlForLog(original);
    const safeUrl = sanitizeUrlForLog(req.url);
    console.log(`[HTTP ${requestId}] ${req.method} ${safeOriginal}${safeOriginal !== safeUrl ? ` (rewritten: ${safeUrl})` : ''} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

app.use(timingMiddleware);

// Route-specific large payload handler for logo upload (up to 10MB base64 images) (SEC-10)
const LOGO_UPLOAD_LIMIT = '10mb';
app.use(['/api/hotel-branding/logo', '/hotel-branding/logo'], express.json({
  limit: LOGO_UPLOAD_LIMIT,
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(['/api/hotel-branding/logo', '/hotel-branding/logo'], express.urlencoded({ extended: true, limit: LOGO_UPLOAD_LIMIT }));

// Global default limit (1MB) for all other JSON & form submissions (SEC-10 resource exhaustion defense & Webhook raw buffer preservation)
const GLOBAL_BODY_LIMIT = '1mb';
app.use(express.json({
  limit: GLOBAL_BODY_LIMIT,
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: GLOBAL_BODY_LIMIT }));

import channelRoutes from './routes/channels.js';
import reservationRoutes from './routes/reservations.js';
import hotelBrandingRoutes from './routes/hotelBranding.js';
import notificationRoutes from './routes/notifications.js';
import revenueRoutes from './routes/revenue.js';
import laundryRoutes from './routes/laundry.js';
import userRoutes from './routes/users.js';
import housekeepingRoutes from './routes/housekeeping.js';
import metaComplianceRoutes from './routes/metaCompliance.js';
import onboardingRoutes from './routes/onboarding.js';
import whatsappWebhookRoutes from './routes/whatsappWebhook.js';
import {
  paymentRateLimiter,
  validateAndDeriveOrderContext,
  verifyRazorpayHmacSignature,
  verifyRazorpayPaymentLifecycle,
  generateGuestCheckoutToken,
  processVerifiedPaymentDurable,
  withPaymentLock,
  recordPaymentAuditLog,
  checkPaymentIdempotency,
  fetchOrderAssociation,
  getRazorpayClient,
} from './services/paymentSecurityService.js';
import {
  authRateLimiter,
  webhookRateLimiter,
  exportRateLimiter,
  generalApiRateLimiter,
} from './middleware/rateLimiter.js';
import { resolveAuthorizedHotel, requireHotelAccess } from './middleware/auth.js';
import { validateCronConfiguration } from './middleware/cronAuth.js';
import { supabaseServiceRole } from './supabaseClient.js';
import * as redisService from './services/redisService.js';

// Root / Health check endpoints (M2 Minimal Public Health Check)
app.get(['/', '/api', '/api/health', '/health'], (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Detailed diagnostic health check behind requireHotelAccess + super admin (M2)
app.get(['/api/health/detailed', '/health/detailed'], requireHotelAccess, (req, res) => {
  if (req.hotelRole !== 'super_admin' && !req.isSuperAdmin) {
    return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Detailed diagnostics require super admin privileges.' });
  }
  const mem = process.memoryUsage();
  res.status(200).json({
    status: 'ok',
    message: 'Hotel Mantri Backend API Server is running',
    version: '1.0.0',
    uptime: Number(process.uptime().toFixed(2)),
    memory: {
      heapUsedMb: Number((mem.heapUsed / 1024 / 1024).toFixed(2)),
      heapTotalMb: Number((mem.heapTotal / 1024 / 1024).toFixed(2)),
      rssMb: Number((mem.rss / 1024 / 1024).toFixed(2)),
    },
    activeRequests,
    nodeVersion: process.version,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    branch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    buildTime: new Date().toISOString(),
    frontendUrl: process.env.FRONTEND_URL || process.env.VITE_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173'),
    endpoints: [
      '/api/reservations',
      '/api/channels',
      '/api/hotel-branding',
      '/api/notifications',
      '/api/aiosell',
      '/api/laundry',
      '/api/users',
      '/api/housekeeping',
      '/api/create-order',
      '/api/verify-payment',
      '/api/whatsapp/webhook',
      '/api/redis/status'
    ]
  });
});

/**
 * GET /api/redis/status
 * Safe authenticated Redis health/status diagnostic.
 * Reports connection mode, latency, and operational metrics without exposing credentials.
 */
app.get(['/api/redis/status', '/redis/status'], requireHotelAccess, async (req, res) => {
  const health = await redisService.checkRedisHealth();
  const metrics = redisService.getRedisMetrics();
  res.json({
    success: true,
    configured: metrics.configured,
    mode: health.mode,
    status: health.status,
    healthy: health.healthy,
    latencyMs: health.latencyMs,
    metrics: {
      hits: metrics.hits,
      misses: metrics.misses,
      sets: metrics.sets,
      dels: metrics.dels,
      bypasses: metrics.bypasses,
      errors: metrics.errors,
      locksAcquired: metrics.locksAcquired,
      locksReleased: metrics.locksReleased,
      lastErrorAt: metrics.lastErrorAt,
    },
    requestId: req.requestId,
  });
});

// H5: Global API rate limiting on all /api routes (120 req/min per IP/user)
app.use('/api', generalApiRateLimiter);

// Specific stricter limiters on sensitive routes (H5)
app.use(['/api/onboarding', '/onboarding'], authRateLimiter);
app.use(['/api/whatsapp/webhook', '/whatsapp/webhook'], webhookRateLimiter);
app.use(['/api/meta/data-deletion-callback', '/meta/data-deletion-callback'], webhookRateLimiter);
app.use(['/api/reservations/export', '/reservations/export'], exportRateLimiter);

// Mount API routes with both /api prefix and direct path for total serverless compatibility
app.use('/api/aiosell', aiosellRoutes);
app.use('/aiosell', aiosellRoutes);

app.use('/api/integrations/aiosell', aiosellIntegrationRoutes);
app.use('/integrations/aiosell', aiosellIntegrationRoutes);

app.use('/api/channels', channelRoutes);
app.use('/channels', channelRoutes);

app.use('/api/reservations', reservationRoutes);
app.use('/reservations', reservationRoutes);

app.use('/api/revenue', revenueRoutes);
app.use('/revenue', revenueRoutes);
app.use('/api/reservations/revenue', revenueRoutes);

app.use('/api/hotel-branding', hotelBrandingRoutes);
app.use('/hotel-branding', hotelBrandingRoutes);

app.use('/api/notifications', notificationRoutes);
app.use('/notifications', notificationRoutes);
app.use('/api/reports/whatsapp', notificationRoutes);
app.use('/reports/whatsapp', notificationRoutes);
app.use('/api/reports', notificationRoutes);
app.use('/reports', notificationRoutes);
app.use('/api/cron', notificationRoutes);
app.use('/cron', notificationRoutes);

app.use('/api/laundry', laundryRoutes);
app.use('/laundry', laundryRoutes);

app.use('/api/users', userRoutes);
app.use('/users', userRoutes);

app.use('/api/housekeeping', housekeepingRoutes);
app.use('/housekeeping', housekeepingRoutes);

app.use('/api/meta', metaComplianceRoutes);
app.use('/meta', metaComplianceRoutes);
app.use('/api/compliance', metaComplianceRoutes);
app.use('/compliance', metaComplianceRoutes);

app.use('/api/onboarding', onboardingRoutes);
app.use('/onboarding', onboardingRoutes);

app.use('/api/whatsapp', whatsappWebhookRoutes);
app.use('/whatsapp', whatsappWebhookRoutes);
app.use('/api/webhooks/meta-whatsapp', whatsappWebhookRoutes);
app.use('/webhooks/meta-whatsapp', whatsappWebhookRoutes);

/**
 * STEP 1: Backend Endpoint to Create Order (SEC-03 Hardened)
 * POST /api/create-order
 */
app.post(['/api/create-order', '/create-order'], paymentRateLimiter, async (req, res) => {
  const requestId = req.requestId || `HM-ORDER-${Date.now().toString(36).toUpperCase()}`;

  try {
    // If authenticated user is Housekeeping, strictly deny payment processing
    if (req.headers.authorization) {
      try {
        const authRes = await resolveAuthorizedHotel(req);
        if (authRes.success && authRes.role === 'housekeeping') {
          return res.status(403).json({ success: false, error: 'ACCESS_DENIED', message: 'Housekeeping users are not authorized to collect or process payments.', requestId });
        }
      } catch { /* proceed */ }
    }
    const gateway = getRazorpayClient();
    if (!gateway) {
      return res.status(503).json({
        success: false,
        code: 'GATEWAY_NOT_CONFIGURED',
        error: 'Razorpay payment gateway is not configured on server.',
        requestId,
      });
    }

    // 1. Authoritative server-side amount derivation and authorization check
    const contextResult = await validateAndDeriveOrderContext(req);
    if (!contextResult.success) {
      return res.status(contextResult.status).json({
        success: false,
        code: contextResult.code,
        error: contextResult.error,
        requestId,
      });
    }

    const {
      checkoutType,
      planId,
      planName,
      reservationId,
      hotelId,
      authoritativeAmountPaise,
      authContext,
    } = contextResult;

    // 2. Prepare order options with signed tamper-evident notes
    const { receipt, notes } = req.body || {};
    const orderReceipt = receipt || `rcpt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const orderNotes = {
      platform: 'HotelMantri',
      checkoutType,
      planId: planId || '',
      planName: planName || '',
      reservationId: reservationId || '',
      hotelId: hotelId || (authContext?.hotelId || ''),
      userId: authContext?.userId || (authContext?.user?.id || ''),
      expectedAmount: String(authoritativeAmountPaise),
      createdAt: new Date().toISOString(),
    };

    // Merge client notes without overriding protected security keys
    if (notes && typeof notes === 'object') {
      for (const [k, v] of Object.entries(notes)) {
        if (!orderNotes[k] && typeof v === 'string') {
          orderNotes[k] = v.substring(0, 255);
        }
      }
    }

    const options = {
      amount: authoritativeAmountPaise,
      currency: 'INR',
      receipt: orderReceipt,
      notes: orderNotes,
    };

    // 3. Create Razorpay order
    const order = await gateway.orders.create(options);

    // 4. Record order creation in audit_logs
    await recordPaymentAuditLog({
      action: 'PAYMENT_ORDER_CREATED',
      recordId: order.id,
      hotelId: orderNotes.hotelId || null,
      metadata: {
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        notes: order.notes,
        created_at: new Date().toISOString(),
      },
    });

    const keyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '';

    const responsePayload = {
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: keyId,
    };

    if (reservationId && (hotelId || authContext?.hotelId)) {
      // Security: Only issue new guest tokens when requested by authenticated staff/admin or internal delivery flow
      if (authContext) {
        responsePayload.guest_token = generateGuestCheckoutToken({
          reservationId,
          hotelId: hotelId || authContext?.hotelId,
        });
      }
    }

    return res.status(200).json(responsePayload);
  } catch (err) {
    console.error(`[${requestId}] Razorpay Create Order Error:`, err);
    return res.status(500).json({
      success: false,
      code: 'CREATE_ORDER_FAILED',
      error: err?.message || 'Failed to create Razorpay order',
      requestId,
    });
  }
});

/**
 * STEP 3: Backend Endpoint to Verify Signature (SEC-03 Hardened)
 * POST /api/verify-payment
 */
app.post(['/api/verify-payment', '/verify-payment'], paymentRateLimiter, async (req, res) => {
  const requestId = req.requestId || `HM-VERIFY-${Date.now().toString(36).toUpperCase()}`;

  try {
    // If authenticated user is Housekeeping, strictly deny payment processing
    if (req.headers.authorization) {
      try {
        const authRes = await resolveAuthorizedHotel(req);
        if (authRes.success && authRes.role === 'housekeeping') {
          return res.status(403).json({ success: false, error: 'ACCESS_DENIED', message: 'Housekeeping users are not authorized to collect or process payments.', requestId });
        }
      } catch { /* proceed */ }
    }
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    if (!keySecret) {
      return res.status(503).json({
        success: false,
        code: 'GATEWAY_NOT_CONFIGURED',
        error: 'Razorpay payment gateway secret is not configured on server.',
        requestId,
      });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, reservationId } = req.body || {};

    // 1. Parameter presence and type check
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_PARAMETERS',
        error: 'Missing required parameters (razorpay_order_id, razorpay_payment_id, razorpay_signature)',
        requestId,
      });
    }

    // 2. Constant-time HMAC-SHA256 signature verification
    const sigCheck = verifyRazorpayHmacSignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      keySecret,
    });

    if (!sigCheck.isValid) {
      return res.status(400).json({
        success: false,
        code: sigCheck.code,
        error: sigCheck.message,
        requestId,
      });
    }

    // 3. Serialize concurrent verification requests for this payment ID
    return await withPaymentLock(razorpay_payment_id, async () => {
      // 4. Idempotency & Replay Protection: Check if already verified
      const idempotency = await checkPaymentIdempotency(razorpay_payment_id);
      if (idempotency.alreadyProcessed) {
        return res.status(200).json({
          success: true,
          message: 'Payment verified successfully (previously processed)',
          order_id: razorpay_order_id,
          payment_id: razorpay_payment_id,
          idempotent: true,
        });
      }

      // 5. Order Context Binding: Verify order belongs to this tenant / reservation (M7 Hardened)
      const orderRecord = await fetchOrderAssociation(razorpay_order_id, getRazorpayClient());
      if (!orderRecord) {
        return res.status(404).json({
          success: false,
          code: 'ORDER_NOT_FOUND',
          error: 'Razorpay order could not be resolved. Unverified orders cannot be settled.',
          requestId,
        });
      }

      // Resolve optional caller auth context
      let authContext = null;
      const authHeader = req.headers?.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const authRes = await resolveAuthorizedHotel(req);
        if (authRes.success) {
          authContext = authRes;
        }
      }

      // Cross-tenant check: if caller has hotel context and order has hotelId
      if (authContext && !authContext.isSuperAdmin && orderRecord.hotelId) {
        if (authContext.hotelId !== orderRecord.hotelId) {
          return res.status(403).json({
            success: false,
            code: 'HOTEL_ACCESS_DENIED',
            error: 'Cross-tenant payment violation: Order does not belong to authorized hotel.',
            requestId,
          });
        }
      }

      // Reservation binding check: ensure order is bound to the target reservation
      const targetReservationId = reservationId || req.body?.reservation_id || orderRecord.notes?.reservationId;
      const orderReservationId = orderRecord.notes?.reservationId;
      if (orderReservationId && targetReservationId && orderReservationId !== targetReservationId) {
        return res.status(400).json({
          success: false,
          code: 'ORDER_MISMATCH',
          error: 'Order does not match the target reservation.',
          requestId,
        });
      }

      // Authoritative amount strictly from the resolved order record (M7: never trust req.body.amount)
      const amountPaise = Number(orderRecord.amount);
      if (!amountPaise || amountPaise <= 0 || isNaN(amountPaise)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_ORDER_AMOUNT',
          error: 'Resolved Razorpay order does not contain a valid authoritative amount.',
          requestId,
        });
      }

      // 6. Provider-side payment lifecycle verification
      const gateway = getRazorpayClient();
      if (gateway && typeof gateway.payments?.fetch === 'function') {
        const lifecycle = await verifyRazorpayPaymentLifecycle({
          gateway,
          paymentId: razorpay_payment_id,
          expectedOrderId: razorpay_order_id,
          expectedAmountPaise: amountPaise,
          expectedCurrency: 'INR',
        });

        if (!lifecycle.success) {
          return res.status(lifecycle.status || 400).json({
            success: false,
            code: lifecycle.code,
            error: lifecycle.message,
            requestId,
          });
        }
      }

      // 7. Atomic & Durable Settlement (via RPC or durable ledger fallback)
      const targetHotelId = orderRecord.hotelId || null;

      const durableResult = await processVerifiedPaymentDurable({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        reservationId: targetReservationId || null,
        hotelId: targetHotelId,
        amountPaise,
        metadata: {
          verified_at: new Date().toISOString(),
          // Security: avoid persisting raw guest token values
          guest_token_present: Boolean(req.body?.guestToken || req.body?.guest_token),
        },
      });

      if (!durableResult.success) {
        return res.status(durableResult.status || 503).json({
          success: false,
          code: durableResult.code || 'SETTLEMENT_RECORDING_FAILED',
          error: durableResult.error || 'Payment settlement recording failed. Transaction can be safely retried.',
          recoverable: durableResult.recoverable ?? true,
          order_id: razorpay_order_id,
          payment_id: razorpay_payment_id,
          requestId,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id,
        idempotent: durableResult.idempotent,
      });
    });
  } catch (err) {
    console.error(`[${requestId}] Razorpay Verify Payment Error:`, err);
    return res.status(500).json({
      success: false,
      code: 'VERIFY_PAYMENT_FAILED',
      error: err?.message || 'Server error during signature verification',
      requestId,
    });
  }
});

// Global 404 handler for all unmatched API routes
app.use((req, res) => {
  const requestId = req.requestId || `HM-REQ-${Date.now().toString(36).toUpperCase()}`;
  res.status(404).json({
    success: false,
    error: {
      code: 'API_ROUTE_NOT_FOUND',
      message: `The requested route ${req.method} ${req.originalUrl || req.url} does not exist.`,
      requestId
    }
  });
});

// Global Error handler
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const requestId = req.requestId || `HM-REQ-${Date.now().toString(36).toUpperCase()}`;

  // Handle body-parser 413 Payload Too Large cleanly (SEC-10)
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({
      success: false,
      code: 'PAYLOAD_TOO_LARGE',
      error: 'Request payload exceeds the maximum permitted size limit.',
      requestId,
    });
  }

  console.error('[Unhandled Server Error]', {
    requestId,
    route: req.originalUrl || req.url,
    method: req.method,
    error: err?.message || String(err),
    code: err?.code || 'INTERNAL_SERVER_ERROR',
    stack: err?.stack
  });

  const statusCode = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;

  // Sanitize any potential secret, database URL or sensitive token leakage from client error messages
  const sanitizeErrorMessage = (msg) => {
    if (!msg || typeof msg !== 'string') return 'An unexpected internal server error occurred.';
    return msg
      .replace(/(eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/g, '[REDACTED_TOKEN]')
      .replace(/(postgres|postgresql|mongodb):\/\/[^\s]+/gi, '[REDACTED_DB_URL]')
      .replace(/(sbp_[a-zA-Z0-9_]+|rzp_[a-zA-Z0-9_]+|key_secret_[a-zA-Z0-9_]+)/gi, '[REDACTED_SECRET]');
  };

  const isProduction = process.env.NODE_ENV === 'production';
  const clientErrorMessage = statusCode >= 500 && isProduction
    ? 'An internal server error occurred. Please contact system support with the provided Request ID.'
    : sanitizeErrorMessage(err?.message || 'An unexpected internal server error occurred.');

  res.status(statusCode).json({
    success: false,
    error: {
      code: err?.code || 'INTERNAL_SERVER_ERROR',
      message: clientErrorMessage,
      requestId
    }
  });
});

/**
 * Safe Server Shutdown Function:
 * 1. Stops accepting new requests (503 response).
 * 2. Allows in-flight requests to complete within bounded timeout.
 * 3. Closes idle connections and destroys active sockets on timeout.
 * 4. Avoids duplicate handlers and restart loops.
 */
export const gracefulShutdown = async (signal = 'SIGTERM', exitCode = 0, customTimeoutMs = null) => {
  if (shutdownPromise) {
    console.log(`[Shutdown] Graceful shutdown already initiated (signal: ${signal}). Awaiting completion...`);
    return shutdownPromise;
  }

  isShuttingDown = true;
  console.log(`[Shutdown] Received ${signal}. Starting safe server shutdown...`);

  shutdownPromise = new Promise((resolve) => {
    const timeoutMs = customTimeoutMs !== null
      ? customTimeoutMs
      : parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '10000', 10);

    shutdownTimeoutTimer = setTimeout(() => {
      console.warn(`[Shutdown] Bounded shutdown timeout (${timeoutMs}ms) reached. Force terminating ${activeSockets.size} open socket(s)...`);
      for (const socket of activeSockets) {
        socket.destroy();
      }
      activeSockets.clear();
      if (process.env.NODE_ENV !== 'test') {
        process.exit(exitCode !== 0 ? exitCode : 1);
      }
      resolve({ status: 'timed_out', exitCode: exitCode !== 0 ? exitCode : 1 });
    }, timeoutMs);

    // Unref timer so it doesn't hold event loop open if everything else finishes
    if (typeof shutdownTimeoutTimer.unref === 'function') {
      shutdownTimeoutTimer.unref();
    }

    const finalize = () => {
      if (shutdownTimeoutTimer) clearTimeout(shutdownTimeoutTimer);
      console.log(`[Shutdown] All in-flight requests completed. HTTP server closed cleanly.`);
      if (process.env.NODE_ENV !== 'test') {
        process.exit(exitCode);
      }
      resolve({ status: 'clean', exitCode });
    };

    if (!serverInstance) {
      finalize();
      return;
    }

    serverInstance.close((err) => {
      if (err) {
        console.error('[Shutdown] Error while closing HTTP server:', err);
      }
      finalize();
    });

    // Close idle connections if Node.js supports it
    if (typeof serverInstance.closeIdleConnections === 'function') {
      serverInstance.closeIdleConnections();
    }
  });

  return shutdownPromise;
};

// Avoid duplicate signal listener registrations
let signalHandlersRegistered = false;
export const registerSignalHandlers = () => {
  if (signalHandlersRegistered) return;
  signalHandlersRegistered = true;

  process.on('SIGTERM', () => {
    console.log('[Process] SIGTERM received. Initiating graceful shutdown.');
    gracefulShutdown('SIGTERM', 0);
  });

  process.on('SIGINT', () => {
    console.log('[Process] SIGINT received (Ctrl+C). Initiating graceful shutdown.');
    gracefulShutdown('SIGINT', 0);
  });
};

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun && !process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  registerSignalHandlers();
  const server = app.listen(PORT, () => {
    console.log(`Backend Server running on http://localhost:${PORT}`);
    console.log(`[CORS] Enforcing explicit origin allowlist (${getAllowedOrigins().length} origins configured)`);
    validateCronConfiguration();
    // Run background reconciliation on startup for active property if configured
    const targetHotelId = process.env.HOTEL_ID || process.env.DEFAULT_HOTEL_ID;
    if (targetHotelId) {
      processPendingRoomAllocations(targetHotelId).catch(e => {
        console.warn('[Startup] Automatic allocation reconciliation warning:', e.message);
      });
    }
  });
  setServerInstance(server);
}

export default app;

