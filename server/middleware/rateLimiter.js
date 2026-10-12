/**
 * HOTEL MANTRI — Centralized Rate Limiting & Resource Exhaustion Protection
 *
 * Implements sliding-window in-memory rate limiting with per-route thresholds:
 * - paymentRateLimiter: 40 req/min for payment order creation & verification
 * - cronRateLimiter: 10 req/min for scheduled cron triggers
 * - pdfRateLimiter: 30 req/min for CPU-intensive PDF rendering
 * - webhookRateLimiter: 120 req/min for inbound channel webhooks
 * - generalApiRateLimiter: 300 req/min for standard public endpoints
 *
 * NOTE ON SERVERLESS & DISTRIBUTED STATE:
 * In serverless environments (Vercel, AWS Lambda), in-memory Map state is local
 * to each ephemeral execution container. This provides effective per-instance
 * burst and CPU-exhaustion mitigation, but does not provide globally shared quota
 * across concurrent lambdas without an external store (e.g. Redis / Upstash).
 * This architecture is documented per SEC-10 requirements.
 */

const rateLimitStores = new Map();
let rateLimitBypassActive = false;

/**
 * Extracts normalized client IP address from request headers or socket.
 */
export const getClientIp = (req) => {
  const xForwardedFor = req.headers?.['x-forwarded-for'];
  if (typeof xForwardedFor === 'string' && xForwardedFor.trim().length > 0) {
    const clientIp = xForwardedFor.split(',')[0].trim();
    if (clientIp) return clientIp;
  }
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
};

/**
 * Factory function to create route-specific sliding window rate limiters.
 */
export const createRateLimiter = (options = {}) => {
  const {
    windowMs = 60 * 1000,
    max = 60,
    name = 'DEFAULT',
    errorCode = 'RATE_LIMIT_EXCEEDED',
    message = 'Too many requests. Please try again later.',
    keyGenerator = getClientIp,
  } = options;

  const store = new Map();
  rateLimitStores.set(name, store);

  // Periodic cleanup of expired window timestamps every 2 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    const windowStart = now - windowMs;
    for (const [key, timestamps] of store.entries()) {
      const active = timestamps.filter((t) => t > windowStart);
      if (active.length === 0) {
        store.delete(key);
      } else {
        store.set(key, active);
      }
    }
  }, 2 * 60 * 1000);

  if (cleanupInterval.unref) {
    cleanupInterval.unref(); // Prevent timer from keeping Node process alive in tests
  }

  const limiterMiddleware = (req, res, next) => {
    if (rateLimitBypassActive) {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    const timestamps = store.get(key) || [];
    const validTimestamps = timestamps.filter((t) => t > windowStart);

    const resetTime = Math.ceil((now + windowMs) / 1000);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Reset', resetTime);

    if (validTimestamps.length >= max) {
      res.setHeader('X-RateLimit-Remaining', 0);
      const oldestValid = validTimestamps[0] || now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestValid + windowMs - now) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds);

      return res.status(429).json({
        success: false,
        code: errorCode,
        error: message,
        retryAfterSeconds,
        requestId: req.requestId || req.headers?.['x-request-id'] || null,
      });
    }

    validTimestamps.push(now);
    store.set(key, validTimestamps);

    const remaining = Math.max(0, max - validTimestamps.length);
    res.setHeader('X-RateLimit-Remaining', remaining);
    next();
  };

  limiterMiddleware.reset = () => {
    store.clear();
  };

  limiterMiddleware.store = store;
  limiterMiddleware.options = { windowMs, max, name };

  return limiterMiddleware;
};

// ─── Standard Configured Limiters ─────────────────────────────────────────────

/**
 * 1. Payment Rate Limiter: 40 requests/minute per IP
 * Protects Razorpay order creation and payment verification from brute-force / abuse.
 */
export const paymentRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 40,
  name: 'PAYMENT',
  errorCode: 'RATE_LIMIT_EXCEEDED',
  message: 'Too many payment requests from this address. Please try again in one minute.',
});

/**
 * 2. Cron Rate Limiter: 10 requests/minute per IP
 * Protects scheduled cron endpoints from high-frequency invocation bursts.
 */
export const cronRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  name: 'CRON',
  errorCode: 'CRON_RATE_LIMIT_EXCEEDED',
  message: 'Too many scheduled job requests from this address. Please slow down.',
});

/**
 * 3. PDF Generation Rate Limiter: 30 requests/minute per IP
 * Protects computationally expensive PDF document rendering from CPU starvation.
 */
export const pdfRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  name: 'PDF',
  errorCode: 'PDF_RATE_LIMIT_EXCEEDED',
  message: 'Too many document generation requests from this address. Please try again shortly.',
});

/**
 * 4. Webhook Rate Limiter: 120 requests/minute per IP
 * Generous threshold for legitimate OTA webhooks while mitigating unbounded floods.
 */
export const webhookRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  name: 'WEBHOOK',
  errorCode: 'WEBHOOK_RATE_LIMIT_EXCEEDED',
  message: 'Too many webhook requests from this address. Please throttle submission rate.',
});

/**
 * 5. General API Rate Limiter: 300 requests/minute per IP
 * Broad safety net against aggressive scraping / automated floods.
 */
export const generalApiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  name: 'GENERAL',
  errorCode: 'API_RATE_LIMIT_EXCEEDED',
  message: 'Too many requests to Hotel Mantri API from this address. Please try again later.',
});

// ─── Test Helpers ─────────────────────────────────────────────────────────────

/**
 * Resets all rate limit in-memory stores for isolated unit testing.
 */
export const resetAllRateLimits = () => {
  for (const store of rateLimitStores.values()) {
    store.clear();
  }
};

/**
 * Temporarily bypasses rate limiting for testing scenarios requiring large bursts.
 */
export const setRateLimitBypassForTesting = (bypass) => {
  rateLimitBypassActive = Boolean(bypass);
};
