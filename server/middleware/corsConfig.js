/**
 * HOTEL MANTRI — Explicit CORS Security Middleware (SEC-07)
 *
 * Replaces wildcard CORS with an explicit, environment-aware origin allowlist:
 * 1. Validates exact scheme, hostname, and port.
 * 2. Rejects lookalikes, unauthorized subdomains, and protocol/port mismatches.
 * 3. Never combines credentials with wildcard origins (Access-Control-Allow-Credentials: true
 *    is only returned for explicitly validated origins).
 * 4. Omits CORS permission headers for untrusted origins; rejects untrusted preflight with HTTP 403.
 * 5. Passes through requests without Origin headers (server-to-server, health-check, and cron).
 * 6. Sets Vary: Origin for proxy/CDN cache isolation.
 * 7. Supports dynamic environment configuration via ALLOWED_ORIGINS and test overrides.
 */

export const DEFAULT_PRODUCTION_ORIGINS = [
  'https://hotelmantri.com',
  'https://www.hotelmantri.com',
  'https://hotel-mantri-test-env.vercel.app',
];

export const DEFAULT_DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
];

export const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

export const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Accept',
  'Origin',
  'X-Request-Id',
  'X-Guest-Token',
  'x-cron-secret',
];

export const EXPOSED_HEADERS = [
  'X-Request-Id',
  'Content-Disposition',
  'Content-Type',
  'Content-Length',
];

let testOriginsOverride = null;

/**
 * Normalizes an origin string into standard lowercase <protocol>//<hostname>[:<port>].
 * Strips trailing slashes and rejects non-http/https schemes or wildcard strings.
 *
 * @param {string} raw
 * @returns {string|null}
 */
export const normalizeOrigin = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'null' || trimmed === '*') return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * Injects a temporary test allowlist or resets to environment resolution.
 * Pass string[] to override; pass null or undefined to restore.
 *
 * @param {string[]|null} origins
 */
export const setAllowedOriginsForTesting = (origins) => {
  testOriginsOverride = origins;
};

/**
 * Resolves the authoritative set of allowed origins based on environment
 * and configuration.
 *
 * @returns {Set<string>}
 */
export const resolveAllowedOrigins = () => {
  if (testOriginsOverride !== null && testOriginsOverride !== undefined) {
    const testSet = new Set();
    for (const item of testOriginsOverride) {
      const norm = normalizeOrigin(item);
      if (norm) testSet.add(norm);
    }
    return testSet;
  }

  const origins = new Set();

  // 1. Static production/staging domains
  for (const origin of DEFAULT_PRODUCTION_ORIGINS) {
    const norm = normalizeOrigin(origin);
    if (norm) origins.add(norm);
  }

  // 2. In non-production, include local development ports
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    for (const origin of DEFAULT_DEVELOPMENT_ORIGINS) {
      const norm = normalizeOrigin(origin);
      if (norm) origins.add(norm);
    }
  }

  // 3. Environment-variable configured origins (ALLOWED_ORIGINS / CORS_ALLOWED_ORIGINS)
  const envOrigins = process.env.ALLOWED_ORIGINS || process.env.CORS_ALLOWED_ORIGINS;
  if (envOrigins && typeof envOrigins === 'string') {
    const parts = envOrigins.split(',');
    for (const part of parts) {
      const norm = normalizeOrigin(part);
      if (norm) origins.add(norm);
    }
  }

  // 4. Configured app/frontend URLs
  const appUrls = [process.env.APP_URL, process.env.APP_BASE_URL, process.env.FRONTEND_URL];
  for (const url of appUrls) {
    if (url && typeof url === 'string') {
      const norm = normalizeOrigin(url);
      if (norm) {
        const isLocal = norm.includes('localhost') || norm.includes('127.0.0.1');
        if (!isProduction || !isLocal) {
          origins.add(norm);
        }
      }
    }
  }

  return origins;
};

/**
 * Checks if a specific origin is permitted by the allowlist.
 *
 * @param {string} origin
 * @param {Set<string>|null} [customSet=null]
 * @returns {boolean}
 */
export const isOriginAllowed = (origin, customSet = null) => {
  if (!origin || typeof origin !== 'string') return false;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  const set = customSet || resolveAllowedOrigins();
  return set.has(normalized);
};

/**
 * Returns current effective allowlist as an array of strings.
 *
 * @returns {string[]}
 */
export const getAllowedOrigins = () => {
  return Array.from(resolveAllowedOrigins());
};

/**
 * Express CORS Middleware enforcing explicit origin policy.
 */
export const corsMiddleware = (req, res, next) => {
  const origin = req.headers['origin'];

  // 1. Requests without Origin header (server-to-server, cron, curl, health check)
  // Proceed immediately without appending CORS headers.
  if (!origin) {
    return next();
  }

  const allowedOrigins = resolveAllowedOrigins();

  // 2. Untrusted Origin: do not grant CORS permissions
  if (!isOriginAllowed(origin, allowedOrigins)) {
    if (req.method === 'OPTIONS') {
      // Preflight from untrusted origin is rejected with HTTP 403
      return res.status(403).json({
        success: false,
        code: 'CORS_ORIGIN_DENIED',
        message: 'Cross-origin preflight request forbidden: origin not allowed.',
      });
    }

    // Actual request: omit Access-Control-Allow-Origin so browser blocks response
    return next();
  }

  // 3. Trusted Origin: set explicit allow headers (never wildcard *)
  const normalized = normalizeOrigin(origin);
  res.setHeader('Access-Control-Allow-Origin', normalized);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');

  // Preflight OPTIONS handling
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS.join(', '));
    res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '));
    res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS.join(', '));
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    res.setHeader('Content-Length', '0');
    return res.status(204).end();
  }

  // Actual requests: expose diagnostic headers
  res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS.join(', '));

  next();
};

export default corsMiddleware;
