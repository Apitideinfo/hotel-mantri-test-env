/**
 * HOTEL MANTRI — Reusable Redis & Serverless Caching Service
 * 
 * Architecture:
 * - Managed, stateless HTTP REST Redis client (@upstash/redis) optimized for Vercel Serverless Functions.
 * - Server-side only: never exposes credentials to frontend code.
 * - Strict tenant isolation: all cache keys MUST be scoped by hotel_id.
 * - Fail-open design: if Redis is not configured or temporarily degraded, 
 *   all operations automatically and safely fall back to Supabase / in-memory without throwing errors.
 * - Distributed ownership-aware locking with TTL auto-expiration.
 */

import { Redis } from '@upstash/redis';
import crypto from 'crypto';

// In-memory fallback mutexes for when Redis is unconfigured or degraded
const localMutexes = new Map();

// In-memory fallback cache with TTL support for fail-open resilience
const localFallbackCache = new Map();
const MAX_LOCAL_CACHE_ENTRIES = 2000;

const pruneLocalCacheIfNeeded = () => {
  if (localFallbackCache.size <= MAX_LOCAL_CACHE_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of localFallbackCache.entries()) {
    if (v.expiresAt <= now) {
      localFallbackCache.delete(k);
    }
  }
  if (localFallbackCache.size > MAX_LOCAL_CACHE_ENTRIES) {
    const iter = localFallbackCache.keys();
    for (let i = 0; i < 200; i++) {
      const n = iter.next();
      if (n.done) break;
      localFallbackCache.delete(n.value);
    }
  }
};

// Runtime metrics
const metrics = {
  hits: 0,
  misses: 0,
  sets: 0,
  dels: 0,
  bypasses: 0,
  errors: 0,
  locksAcquired: 0,
  locksReleased: 0,
  lastError: null,
  lastErrorAt: null,
};

let clientInstance = null;
let clientInitialized = false;

/**
 * Initializes and returns the singleton Upstash Redis client.
 * Returns null if environment variables are not configured.
 */
export const getRedisClient = () => {
  if (clientInitialized) return clientInstance;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    clientInitialized = true;
    clientInstance = null;
    return null;
  }

  try {
    clientInstance = new Redis({
      url,
      token,
      // Automatic retry for transient network hiccups
      retry: {
        retries: 2,
        backoff: (retryCount) => Math.exp(retryCount) * 50,
      },
    });
    clientInitialized = true;
  } catch (err) {
    console.warn('[RedisService] Initialization failed, operating in fail-open fallback mode:', err.message);
    metrics.errors++;
    metrics.lastError = err.message;
    metrics.lastErrorAt = new Date().toISOString();
    clientInitialized = true;
    clientInstance = null;
  }

  return clientInstance;
};

/**
 * Resets the client (useful for unit testing or when switching env vars).
 */
export const resetRedisClient = () => {
  clientInstance = null;
  clientInitialized = false;
  localFallbackCache.clear();
};

/**
 * Checks whether Redis is configured via server environment variables.
 */
export const isRedisConfigured = () => {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
};

/**
 * Probes Redis health with a fast PING.
 * Returns detailed connectivity, latency, and mode without exposing credentials.
 */
export const checkRedisHealth = async () => {
  const urlConfigured = Boolean(process.env.UPSTASH_REDIS_REST_URL);
  const tokenConfigured = Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);
  const configured = urlConfigured && tokenConfigured;

  if (!configured) {
    return {
      healthy: false,
      latencyMs: 0,
      status: 'UNCONFIGURED',
      mode: 'LOCAL_IN_PROCESS_FALLBACK',
      remoteConfigured: false,
      remoteUrlConfigured: urlConfigured,
      remoteTokenConfigured: tokenConfigured,
      fallbackCacheSize: localFallbackCache.size,
      diagnosticNote: 'Operating in local in-process fallback mode. To activate remote Redis, configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel environment variables.',
    };
  }

  const client = getRedisClient();
  if (!client) {
    return {
      healthy: false,
      latencyMs: 0,
      status: 'INIT_FAILED',
      mode: 'LOCAL_IN_PROCESS_FALLBACK',
      remoteConfigured: true,
      remoteUrlConfigured: urlConfigured,
      remoteTokenConfigured: tokenConfigured,
      fallbackCacheSize: localFallbackCache.size,
    };
  }

  const start = Date.now();
  try {
    const pong = await client.ping();
    const latencyMs = Date.now() - start;
    const healthy = pong === 'PONG' || pong === 'pong' || Boolean(pong);
    return {
      healthy,
      latencyMs,
      status: healthy ? 'HEALTHY' : 'UNEXPECTED_RESPONSE',
      mode: 'REMOTE_UPSTASH_REST',
      remoteConfigured: true,
      remoteUrlConfigured: true,
      remoteTokenConfigured: true,
      fallbackCacheSize: localFallbackCache.size,
    };
  } catch (err) {
    metrics.errors++;
    metrics.lastError = err.message;
    metrics.lastErrorAt = new Date().toISOString();
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      status: 'ERROR',
      mode: 'LOCAL_IN_PROCESS_FALLBACK',
      error: err.message,
      remoteConfigured: true,
      remoteUrlConfigured: urlConfigured,
      remoteTokenConfigured: tokenConfigured,
      fallbackCacheSize: localFallbackCache.size,
    };
  }
};

/**
 * Builds a strict tenant-isolated cache key.
 * Format: hm:cache:{hotelId}:{namespace}:{subKey}
 */
export const buildTenantCacheKey = (hotelId, namespace, subKey = 'default') => {
  if (!hotelId) throw new Error('Hotel ID is required for tenant cache key');
  return `hm:cache:${hotelId}:${namespace}:${String(subKey).trim()}`;
};

/**
 * Safe GET from cache.
 * Returns parsed JSON object or primitive, or null on cache miss / failure.
 * Reads from remote Upstash Redis when available; falls back to local in-process cache.
 */
export const get = async (key) => {
  const client = getRedisClient();
  if (!client) {
    const entry = localFallbackCache.get(key);
    if (entry) {
      if (entry.expiresAt > Date.now()) {
        metrics.hits++;
        return typeof entry.value === 'object' ? JSON.parse(JSON.stringify(entry.value)) : entry.value;
      }
      localFallbackCache.delete(key);
    }
    metrics.misses++;
    return null;
  }

  try {
    const val = await client.get(key);
    if (val !== null && val !== undefined) {
      metrics.hits++;
      return typeof val === 'string' ? JSON.parse(val) : val;
    }
    metrics.misses++;
    return null;
  } catch (err) {
    // Non-fatal fail-open fallback to local cache
    metrics.errors++;
    metrics.lastError = err.message;
    metrics.lastErrorAt = new Date().toISOString();
    const entry = localFallbackCache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      metrics.hits++;
      return typeof entry.value === 'object' ? JSON.parse(JSON.stringify(entry.value)) : entry.value;
    }
    metrics.misses++;
    return null;
  }
};

/**
 * Safe SET into cache with explicit TTL.
 * Writes to remote Upstash Redis and caches in local memory fail-open.
 */
export const set = async (key, value, { ttlSeconds = 300 } = {}) => {
  const expiresAt = Date.now() + (ttlSeconds > 0 ? ttlSeconds * 1000 : 300 * 1000);
  pruneLocalCacheIfNeeded();
  localFallbackCache.set(key, { value, expiresAt });

  const client = getRedisClient();
  if (!client) {
    metrics.sets++;
    return true;
  }

  try {
    const payload = typeof value === 'object' ? JSON.stringify(value) : value;
    if (ttlSeconds && ttlSeconds > 0) {
      await client.set(key, payload, { ex: ttlSeconds });
    } else {
      await client.set(key, payload);
    }
    metrics.sets++;
    return true;
  } catch (err) {
    metrics.errors++;
    metrics.lastError = err.message;
    metrics.lastErrorAt = new Date().toISOString();
    // Return true because in-memory fallback already succeeded
    return true;
  }
};

/**
 * Safe DEL key from cache.
 */
export const del = async (key) => {
  localFallbackCache.delete(key);
  const client = getRedisClient();
  if (!client) {
    metrics.dels++;
    return true;
  }

  try {
    await client.del(key);
    metrics.dels++;
    return true;
  } catch (err) {
    metrics.errors++;
    return false;
  }
};

/**
 * Deletes all keys matching a specific pattern (e.g. hm:cache:{hotelId}:*).
 */
export const delPattern = async (pattern) => {
  const regexPattern = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  for (const k of localFallbackCache.keys()) {
    if (regexPattern.test(k)) {
      localFallbackCache.delete(k);
    }
  }

  const client = getRedisClient();
  if (!client) return 0;

  try {
    const keys = await client.keys(pattern);
    if (keys && keys.length > 0) {
      await client.del(...keys);
      metrics.dels += keys.length;
      return keys.length;
    }
    return 0;
  } catch (err) {
    metrics.errors++;
    return 0;
  }
};

/**
 * Cache wrap pattern: returns cached data if present, otherwise calls fetchFn(),
 * saves the result to Redis in the background, and returns the data.
 */
export const wrap = async (key, fetchFn, { ttlSeconds = 300 } = {}) => {
  const cached = await get(key);
  if (cached !== null) {
    return cached;
  }

  // Fetch from authoritative source (Supabase)
  const fresh = await fetchFn();
  if (fresh !== null && fresh !== undefined) {
    // Asynchronously save to cache without blocking return
    set(key, fresh, { ttlSeconds }).catch(() => {});
  }
  return fresh;
};

/**
 * Tenant-scoped cache wrap pattern:
 * Builds tenant key, checks cache, calls fetchFn() on miss, and writes to cache fail-open.
 */
export const wrapTenant = async (hotelId, namespace, subKey, fetchFn, { ttlSeconds = 300 } = {}) => {
  if (!hotelId) return fetchFn();
  const key = buildTenantCacheKey(hotelId, namespace, subKey);
  return wrap(key, fetchFn, { ttlSeconds });
};

/**
 * Distributed Lock: Acquire an exclusive lock with TTL.
 * Uses atomic SET key ownerId NX PX ttlMs.
 * Returns { acquired: boolean, lockKey: string, ownerId: string, fallback: boolean }
 */
export const acquireLock = async (lockKey, { ttlMs = 15000, ownerId = null } = {}) => {
  const owner = ownerId || `hm_owner_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const client = getRedisClient();

  // If Redis is not available, use safe local in-process mutex
  if (!client) {
    const existing = localMutexes.get(lockKey);
    const now = Date.now();
    if (existing && existing.expiresAt > now) {
      return { acquired: false, lockKey, ownerId: owner, fallback: true };
    }
    localMutexes.set(lockKey, { owner, expiresAt: now + ttlMs });
    metrics.locksAcquired++;
    return { acquired: true, lockKey, ownerId: owner, fallback: true };
  }

  try {
    const res = await client.set(lockKey, owner, {
      nx: true,
      px: ttlMs,
    });
    const acquired = res === 'OK' || res === true;
    if (acquired) {
      metrics.locksAcquired++;
    }
    return { acquired, lockKey, ownerId: owner, fallback: false };
  } catch (err) {
    metrics.errors++;
    // Fall back to local in-process lock on Redis network error
    const existing = localMutexes.get(lockKey);
    const now = Date.now();
    if (existing && existing.expiresAt > now) {
      return { acquired: false, lockKey, ownerId: owner, fallback: true };
    }
    localMutexes.set(lockKey, { owner, expiresAt: now + ttlMs });
    return { acquired: true, lockKey, ownerId: owner, fallback: true };
  }
};

/**
 * Distributed Lock: Ownership-aware release.
 * Releases the lock ONLY if the current value matches ownerId.
 */
export const releaseLock = async (lockKey, ownerId) => {
  const client = getRedisClient();

  if (!client) {
    const existing = localMutexes.get(lockKey);
    if (existing && existing.owner === ownerId) {
      localMutexes.delete(lockKey);
      metrics.locksReleased++;
      return true;
    }
    return false;
  }

  try {
    // Lua script for atomic ownership check and release
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const res = await client.eval(luaScript, [lockKey], [ownerId]);
    if (Number(res) === 1) {
      metrics.locksReleased++;
      return true;
    }
    return false;
  } catch (err) {
    metrics.errors++;
    const existing = localMutexes.get(lockKey);
    if (existing && existing.owner === ownerId) {
      localMutexes.delete(lockKey);
      return true;
    }
    return false;
  }
};

/**
 * Returns structured metrics.
 */
export const getRedisMetrics = () => {
  const configured = isRedisConfigured();
  return {
    ...metrics,
    configured,
    mode: configured ? (clientInstance ? 'REMOTE_UPSTASH_REST' : 'LOCAL_IN_PROCESS_FALLBACK') : 'LOCAL_IN_PROCESS_FALLBACK',
    status: configured ? (clientInstance ? 'INITIALIZED' : 'CONFIGURED') : 'UNCONFIGURED',
  };
};

/**
 * Resets metrics counters.
 */
export const resetRedisMetrics = () => {
  metrics.hits = 0;
  metrics.misses = 0;
  metrics.sets = 0;
  metrics.dels = 0;
  metrics.bypasses = 0;
  metrics.errors = 0;
  metrics.locksAcquired = 0;
  metrics.locksReleased = 0;
  metrics.lastError = null;
  metrics.lastErrorAt = null;
};

/**
 * Atomic rate-limit increment backed by Upstash Redis (H5).
 * Uses INCR + EXPIRE on the first hit.
 * Returns null if Redis is not configured or throws, triggering in-memory fallback.
 */
export const incrRateLimit = async (key, windowSeconds = 60) => {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    return count;
  } catch (err) {
    console.warn('[RedisService] Rate limit incr failed, using in-memory fallback:', err.message);
    return null;
  }
};
