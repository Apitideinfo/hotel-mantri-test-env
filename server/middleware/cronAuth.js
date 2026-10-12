/**
 * HOTEL MANTRI — Protected Cron Authentication Middleware (SEC-06)
 *
 * Enforces fail-closed authentication for automated scheduled tasks:
 * 1. Requires configured, non-empty CRON_SECRET in ALL environments.
 *    If CRON_SECRET is not configured or empty, requests are rejected with 503 CRON_SECRET_NOT_CONFIGURED.
 * 2. Authenticates incoming requests via:
 *    - Authorization: Bearer <CRON_SECRET>
 *    - x-cron-secret: <CRON_SECRET>
 * 3. Compares secrets in constant-time (crypto.timingSafeEqual) to eliminate timing side-channel attacks.
 * 4. Never logs or discloses secrets in error messages, logs, or audit records.
 * 5. Provides test helper setCronSecretForTesting(secret) for isolated regression test suites.
 */

import crypto from 'crypto';

let testCronSecret = undefined;

/**
 * Injects a test cron secret or resets to environment resolution.
 * Pass string to override; pass undefined to restore process.env.CRON_SECRET resolution.
 *
 * @param {string|undefined} secret
 */
export const setCronSecretForTesting = (secret) => {
  testCronSecret = secret;
};

/**
 * Resolves the authoritative cron secret from environment or test override.
 * Returns trimmed non-empty string or null.
 *
 * @returns {string|null}
 */
export const getCronSecret = () => {
  if (testCronSecret !== undefined) {
    if (typeof testCronSecret !== 'string') return null;
    const cleanTest = testCronSecret.trim();
    return cleanTest.length > 0 ? cleanTest : null;
  }

  const rawSecret = process.env.CRON_SECRET;
  if (!rawSecret || typeof rawSecret !== 'string') return null;
  const clean = rawSecret.trim();
  return clean.length > 0 ? clean : null;
};

/**
 * Express middleware protecting automated scheduled/cron endpoints.
 * Fails closed on missing configuration, missing caller credentials, or invalid tokens.
 */
export const requireCronAuth = (req, res, next) => {
  const configuredSecret = getCronSecret();

  // 1. Fail-closed: missing or empty secret prevents execution in all environments
  if (!configuredSecret) {
    return res.status(503).json({
      success: false,
      code: 'CRON_SECRET_NOT_CONFIGURED',
      message: 'Cron authentication is not configured on server.',
    });
  }

  // 2. Extract candidate secret from Authorization Bearer or x-cron-secret header
  let candidateSecret = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && typeof authHeader === 'string') {
    const trimmed = authHeader.trim();
    if (trimmed.startsWith('Bearer ')) {
      candidateSecret = trimmed.slice(7).trim();
    }
  }

  if (!candidateSecret && req.headers['x-cron-secret'] && typeof req.headers['x-cron-secret'] === 'string') {
    candidateSecret = req.headers['x-cron-secret'].trim();
  }

  if (!candidateSecret) {
    return res.status(401).json({
      success: false,
      code: 'CRON_AUTH_REQUIRED',
      message: 'Unauthorized: Missing cron authentication credentials.',
    });
  }

  // 3. Timing-safe constant-time comparison via SHA-256 digests
  // Comparing SHA-256 digests guarantees identical 32-byte buffers, preventing length leakage and TypeError
  const expectedHash = crypto.createHash('sha256').update(configuredSecret, 'utf8').digest();
  const actualHash = crypto.createHash('sha256').update(candidateSecret, 'utf8').digest();

  if (!crypto.timingSafeEqual(expectedHash, actualHash)) {
    return res.status(401).json({
      success: false,
      code: 'INVALID_CRON_SECRET',
      message: 'Unauthorized: Invalid cron credentials.',
    });
  }

  next();
};

/**
 * Validates cron configuration at startup or diagnostic checkpoints.
 * Logs status without disclosing secrets.
 *
 * @returns {boolean}
 */
export const validateCronConfiguration = () => {
  const secret = getCronSecret();
  const env = process.env.NODE_ENV || 'development';
  if (!secret) {
    if (env === 'production') {
      console.error('[CRON_AUTH][FATAL] CRON_SECRET is missing or empty in production! Protected cron endpoints will fail closed (HTTP 503).');
    } else {
      console.warn('[CRON_AUTH][WARN] CRON_SECRET is not configured. Protected cron endpoints will fail closed (HTTP 503).');
    }
    return false;
  }
  return true;
};
