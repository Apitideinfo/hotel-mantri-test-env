/**
 * HOTEL MANTRI — Channel Manager Durable Outbox & Queue Service
 * 
 * Architecture:
 * - Durable outbox in Supabase PostgreSQL (channel_sync_jobs) as authoritative persistence.
 * - Distributed coordination and coalescing with Redis (@upstash/redis).
 * - Automatic retry with exponential backoff and jitter.
 * - Serverless-safe: workers process bounded batches and can be triggered on demand or via Vercel Cron.
 * - Fail-open: operates cleanly even when Redis is offline by falling back to database locking.
 */

import { supabaseServiceRole as supabase } from '../supabaseClient.js';
import * as redisService from './redisService.js';
import { syncRates, syncInventory, reconcileInventory } from './channelSyncEngine.js';
import { generateAndDeliverConfirmation } from './reservationDeliveryService.js';

const DEFAULT_MAX_ATTEMPTS = 5;
const WORKER_LOCK_TTL_MS = 45000; // 45 seconds

/**
 * Calculates exponential backoff with jitter.
 */
function calculateBackoffMs(attempt) {
  const base = Math.min(300000, Math.pow(2, attempt) * 2000); // Max 5 min
  const jitter = Math.floor(Math.random() * 1000);
  return base + jitter;
}

/**
 * Enqueues an Aiosell channel synchronization job durably into PostgreSQL.
 * Deduplicates / coalesces if a pending job with the same idempotency key exists.
 */
export const enqueueChannelSyncJob = async ({
  hotelId,
  jobType, // 'RATE_SYNC' | 'INVENTORY_SYNC' | 'RECONCILIATION' | 'RESERVATION_SYNC'
  payload = {},
  idempotencyKey = null,
  client = null
}) => {
  if (!hotelId) throw new Error('Hotel ID is required to enqueue channel sync job');
  if (!jobType) throw new Error('Job type is required to enqueue channel sync job');

  const db = client || supabase;
  const derivedKey = idempotencyKey || `${jobType}:${hotelId}:${payload.startDate || 'all'}:${payload.endDate || 'all'}`;

  try {
    // 1. Check for existing pending/retrying job with same idempotency key
    if (derivedKey) {
      const { data: existing } = await db
        .from('channel_sync_jobs')
        .select('id, status, payload')
        .eq('hotel_id', hotelId)
        .eq('idempotency_key', derivedKey)
        .in('status', ['pending', 'retrying'])
        .maybeSingle();

      if (existing) {
        // Coalesce: merge payload into existing pending job and refresh update timestamp
        const mergedPayload = { ...existing.payload, ...payload };
        await db
          .from('channel_sync_jobs')
          .update({
            payload: mergedPayload,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        return {
          success: true,
          jobId: existing.id,
          status: 'coalesced',
          message: 'Existing pending job coalesced with latest updates.'
        };
      }
    }

    // 2. Insert new durable job
    const { data: job, error } = await db
      .from('channel_sync_jobs')
      .insert({
        hotel_id: hotelId,
        job_type: jobType,
        status: 'pending',
        idempotency_key: derivedKey,
        payload,
        attempt_count: 0,
        max_attempts: DEFAULT_MAX_ATTEMPTS,
        next_attempt_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id, status')
      .single();

    if (error) {
      console.warn('[ChannelSyncQueue] Insert error (non-fatal, continuing):', error.message);
      return { success: false, error: error.message };
    }

    // 3. Opportunistically invoke worker in non-blocking background
    setImmediate(() => {
      processPendingSyncJobs(hotelId).catch(err => {
        console.warn('[ChannelSyncQueue] Async worker trigger warning:', err.message);
      });
    });

    return {
      success: true,
      jobId: job.id,
      status: 'pending',
      message: 'Channel sync job enqueued durably.'
    };
  } catch (err) {
    console.error('[ChannelSyncQueue] Enqueue exception:', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Claims the next pending or retryable job atomically.
 */
export const claimNextSyncJob = async (hotelId, workerId, dbClient = null) => {
  const db = dbClient || supabase;
  const now = new Date().toISOString();

  // Find candidate job
  const { data: candidate } = await db
    .from('channel_sync_jobs')
    .select('*')
    .eq('hotel_id', hotelId)
    .in('status', ['pending', 'retrying'])
    .lte('next_attempt_at', now)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!candidate) return null;

  // Atomically claim candidate
  const { data: claimed, error } = await db
    .from('channel_sync_jobs')
    .update({
      status: 'processing',
      locked_at: now,
      locked_by: workerId,
      updated_at: now
    })
    .eq('id', candidate.id)
    .in('status', ['pending', 'retrying'])
    .select('*')
    .maybeSingle();

  if (error || !claimed) {
    // Another worker claimed it concurrently
    return null;
  }

  return claimed;
};

/**
 * Marks a job as succeeded.
 */
export const markJobSucceeded = async (jobId, dbClient = null) => {
  const db = dbClient || supabase;
  const now = new Date().toISOString();
  await db
    .from('channel_sync_jobs')
    .update({
      status: 'succeeded',
      completed_at: now,
      locked_at: null,
      locked_by: null,
      updated_at: now
    })
    .eq('id', jobId);
};

/**
 * Marks a job as failed or schedules a retry with exponential backoff.
 */
export const markJobFailed = async (job, error, dbClient = null) => {
  const db = dbClient || supabase;
  const now = Date.now();
  const nextAttemptCount = (job.attempt_count || 0) + 1;
  const isRetryable = nextAttemptCount < (job.max_attempts || DEFAULT_MAX_ATTEMPTS);
  const errMsg = typeof error === 'object' ? (error.message || JSON.stringify(error)) : String(error);

  if (isRetryable) {
    const delayMs = calculateBackoffMs(nextAttemptCount);
    const nextDate = new Date(now + delayMs).toISOString();

    await db
      .from('channel_sync_jobs')
      .update({
        status: 'retrying',
        attempt_count: nextAttemptCount,
        next_attempt_at: nextDate,
        last_error: errMsg.slice(0, 500),
        locked_at: null,
        locked_by: null,
        updated_at: new Date(now).toISOString()
      })
      .eq('id', job.id);
  } else {
    // Exceeded max attempts: move to permanent failed state
    await db
      .from('channel_sync_jobs')
      .update({
        status: 'failed',
        attempt_count: nextAttemptCount,
        last_error: `[PERMANENT_FAILURE] ${errMsg}`.slice(0, 500),
        locked_at: null,
        locked_by: null,
        updated_at: new Date(now).toISOString()
      })
      .eq('id', job.id);
  }
};

/**
 * Recovers stuck jobs whose workers crashed or timed out (> 2 minutes).
 */
export const recoverStuckJobs = async (hotelId, dbClient = null) => {
  const db = dbClient || supabase;
  const cutoff = new Date(Date.now() - 120000).toISOString(); // 2 minutes ago

  const { data: stuck } = await db
    .from('channel_sync_jobs')
    .update({
      status: 'retrying',
      locked_at: null,
      locked_by: null,
      updated_at: new Date().toISOString()
    })
    .eq('hotel_id', hotelId)
    .eq('status', 'processing')
    .lt('locked_at', cutoff)
    .select('id');

  return stuck ? stuck.length : 0;
};

/**
 * Processes pending synchronization jobs for a given hotel.
 * Protected by distributed Redis lock to prevent overlapping runs across serverless invocations.
 */
export const processPendingSyncJobs = async (hotelId, { maxJobsToProcess = 5 } = {}) => {
  if (!hotelId) return { processed: 0, message: 'Hotel ID is required' };

  const workerId = `worker_${hotelId}_${Date.now()}`;
  const lockKey = `hm:lock:sync:worker:${hotelId}`;

  // 1. Acquire distributed lock (Redis with local in-memory fallback)
  const lock = await redisService.acquireLock(lockKey, {
    ttlMs: WORKER_LOCK_TTL_MS,
    ownerId: workerId
  });

  if (!lock.acquired) {
    return {
      processed: 0,
      skipped: true,
      message: 'Another sync worker is currently running for this hotel.'
    };
  }

  let processedCount = 0;
  const jobResults = [];

  try {
    // 2. Recover any stuck jobs from previous crashed workers
    await recoverStuckJobs(hotelId);

    // 3. Process jobs up to bounded limit
    for (let i = 0; i < maxJobsToProcess; i++) {
      const job = await claimNextSyncJob(hotelId, workerId);
      if (!job) break; // Queue drained

      try {
        let result = null;
        switch (job.job_type) {
          case 'INVENTORY_SYNC': {
            result = await syncInventory({
              hotelId: job.hotel_id,
              startDate: job.payload.startDate,
              endDate: job.payload.endDate,
              roomCategoryIds: job.payload.roomCategoryIds || null,
              triggeredBy: job.payload.triggeredBy || 'queue_worker'
            });
            break;
          }

          case 'RATE_SYNC': {
            result = await syncRates({
              hotelId: job.hotel_id,
              startDate: job.payload.startDate,
              endDate: job.payload.endDate,
              roomCategoryIds: job.payload.roomCategoryIds || null,
              ratePlanIds: job.payload.ratePlanIds || null,
              triggeredBy: job.payload.triggeredBy || 'queue_worker'
            });
            break;
          }

          case 'RECONCILIATION': {
            result = await reconcileInventory({
              hotelId: job.hotel_id,
              startDate: job.payload.startDate,
              endDate: job.payload.endDate,
              roomCategoryIds: job.payload.roomCategoryIds || null,
              autoRepair: true
            });
            break;
          }

          case 'NOTIFICATION_DELIVERY': {
            const { reservationId, eventType, generatedBy } = job.payload || {};
            result = await generateAndDeliverConfirmation({
              hotelId: job.hotel_id,
              reservationId,
              eventType: eventType || 'NEW_RESERVATION',
              generatedBy: generatedBy || 'SYSTEM',
            });
            break;
          }

          default:
            console.warn(`[ChannelSyncQueue] Unknown job type ${job.job_type}, marking succeeded.`);
            result = { success: true, message: `Ignored unhandled job type ${job.job_type}` };
            break;
        }

        await markJobSucceeded(job.id);
        processedCount++;
        jobResults.push({ id: job.id, type: job.job_type, status: 'succeeded', result });
      } catch (jobErr) {
        console.warn(`[ChannelSyncQueue] Job ${job.id} failed:`, jobErr.message);
        await markJobFailed(job, jobErr);
        jobResults.push({ id: job.id, type: job.job_type, status: 'failed', error: jobErr.message });
      }
    }
  } finally {
    // 4. Release distributed lock
    await redisService.releaseLock(lockKey, workerId);
  }

  return {
    processed: processedCount,
    jobs: jobResults,
    hotelId
  };
};

/**
 * Gets queue status and counts for a hotel (for admin dashboard observability).
 */
export const getQueueStatus = async (hotelId) => {
  if (!hotelId) return null;

  const { data: counts, error } = await supabase
    .from('channel_sync_jobs')
    .select('status, job_type, created_at, next_attempt_at')
    .eq('hotel_id', hotelId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return { error: error.message };
  }

  const summary = {
    pending: 0,
    processing: 0,
    retrying: 0,
    succeeded: 0,
    failed: 0,
    totalTracked: (counts || []).length,
    oldestPendingAt: null
  };

  (counts || []).forEach(j => {
    if (summary[j.status] !== undefined) summary[j.status]++;
    if ((j.status === 'pending' || j.status === 'retrying') && !summary.oldestPendingAt) {
      summary.oldestPendingAt = j.created_at;
    }
  });

  return summary;
};
