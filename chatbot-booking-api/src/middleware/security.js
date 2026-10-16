/**
 * HOTEL MANTRI — Chatbot Booking API: Security Middleware
 * 
 * Provides:
 * 1. Request correlation ID tracking (X-Request-Id)
 * 2. Hardened security headers (OWASP guidelines)
 * 3. Origin-allowlisted CORS (and server-to-server allowance)
 * 4. Sliding-window rate limiters (in-memory IP & contact throttle)
 * 5. Raw request buffer capture for Razorpay webhook HMAC verification
 * 6. Structured, sanitized error handling with secret redaction
 */

import crypto from 'crypto';
import cors from 'cors';
import { config } from '../config/environment.js';

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export const timingSafeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!a || !b) return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
};

/**
 * Request correlation ID middleware.
 */
export const requestIdMiddleware = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const requestId = incoming || `HM-BOT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
};

/**
 * Security headers middleware.
 */
export const securityHeadersMiddleware = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
};

/**
 * CORS middleware with explicit allowlist.
 * Allows server-to-server requests where Origin header is omitted.
 */
export const createCorsMiddleware = () => {
  const allowed = config().security.allowedOrigins;

  return cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (e.g. server-side chatbot builder backend, curl)
      if (!origin) return callback(null, true);

      if (allowed.includes('*') || allowed.includes(origin)) {
        return callback(null, true);
      }

      // Check subdomain or localhost patterns in development
      if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost:')) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} is not allowed by CORS configuration.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'Idempotency-Key',
      'X-Idempotency-Key',
      'X-Razorpay-Signature',
    ],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86400,
  });
};

/**
 * Sliding-window rate limiter factory.
 */
export const createRateLimiter = ({ windowMs = 60000, max = 60, message = 'Too many requests' }) => {
  const requests = new Map();

  return (req, res, next) => {
    // Determine client identifier (IP or contact phone/email if present)
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown-ip';
    const contactKey = req.body?.guestPhone || req.body?.guestEmail || '';
    const key = contactKey ? `${clientIp}:${contactKey}` : clientIp;

    const now = Date.now();
    const timestamps = requests.get(key) || [];
    const validTimestamps = timestamps.filter((t) => now - t < windowMs);

    if (validTimestamps.length >= max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
          retryAfterSeconds: Math.ceil(windowMs / 1000),
          requestId: req.requestId,
        },
      });
    }

    validTimestamps.push(now);
    requests.set(key, validTimestamps);
    next();
  };
};

/**
 * General public rate limiter: 120 requests per minute per IP.
 */
export const publicRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Public API rate limit exceeded. Please wait before retrying.',
});

/**
 * Sensitive booking / payment rate limiter: 25 requests per minute.
 */
export const bookingRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 25,
  message: 'Booking request rate limit exceeded. Please wait before retrying.',
});

/**
 * Optional server-to-server bot provider token authentication.
 * If CHATBOT_API_SECRET is configured, verifies Bearer token.
 */
export const requireBotProviderAuth = (req, res, next) => {
  const expectedSecret = config().security.chatbotApiSecret;
  if (!expectedSecret) {
    // If not configured, public API mode is active
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'BOT_AUTH_REQUIRED',
        message: 'Authorization header with Bearer token is required.',
        requestId: req.requestId,
      },
    });
  }

  const token = authHeader.split(' ')[1];
  if (!timingSafeEqual(token, expectedSecret)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'BOT_AUTH_INVALID',
        message: 'Invalid chatbot integration API token.',
        requestId: req.requestId,
      },
    });
  }

  next();
};

/**
 * Sanitizes sensitive secrets, URLs, and tokens from error messages.
 */
export const sanitizeError = (msg) => {
  if (!msg || typeof msg !== 'string') return 'An internal server error occurred.';
  return msg
    .replace(/(eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/g, '[REDACTED_TOKEN]')
    .replace(/(postgres|postgresql|mongodb):\/\/[^\s]+/gi, '[REDACTED_DB_URL]')
    .replace(/(sbp_[a-zA-Z0-9_]+|rzp_[a-zA-Z0-9_]+|key_secret_[a-zA-Z0-9_]+)/gi, '[REDACTED_SECRET]');
};

/**
 * Centralized error handler.
 */
export const errorHandlerMiddleware = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const requestId = req.requestId || `HM-BOT-ERR-${Date.now().toString(36).toUpperCase()}`;

  // Body parser 413
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds the maximum permitted limit of 1MB.',
        requestId,
      },
    });
  }

  const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  const isProd = config().isProd;

  console.error(`[${requestId}] API Error:`, {
    path: req.originalUrl || req.url,
    method: req.method,
    status,
    code: err?.code || 'INTERNAL_ERROR',
    message: err?.message || String(err),
  });

  const clientMessage = status >= 500 && isProd
    ? 'An unexpected error occurred while processing your request. Please contact hotel support.'
    : sanitizeError(err?.message || 'An unexpected internal error occurred.');

  res.status(status).json({
    success: false,
    error: {
      code: err?.code || (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST'),
      message: clientMessage,
      requestId,
    },
  });
};
