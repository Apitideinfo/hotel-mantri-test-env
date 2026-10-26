-- ==============================================================================
-- HOTEL MANTRI — MIGRATION: 20261027010000_channel_sync_jobs_and_outbox.sql
-- Purpose: Durable database outbox for Aiosell rate/inventory channel synchronization.
--          Enables serverless-safe, retryable, asynchronous channel synchronization
--          without dropping jobs when lambda execution contexts terminate.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS channel_sync_jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id            UUID NOT NULL,
  job_type            TEXT NOT NULL,
    -- 'RATE_SYNC' | 'INVENTORY_SYNC' | 'RESERVATION_SYNC' | 'RECONCILIATION'
  status              TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'processing' | 'succeeded' | 'retrying' | 'failed'
  idempotency_key     TEXT,
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempt_count       INTEGER NOT NULL DEFAULT 0,
  max_attempts        INTEGER NOT NULL DEFAULT 5,
  next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at           TIMESTAMPTZ,
  locked_by           TEXT,
  last_error          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);

-- Performance and queue-claiming indexes
CREATE INDEX IF NOT EXISTS idx_channel_sync_jobs_pending
  ON channel_sync_jobs (hotel_id, status, next_attempt_at)
  WHERE status IN ('pending', 'retrying');

CREATE INDEX IF NOT EXISTS idx_channel_sync_jobs_status
  ON channel_sync_jobs (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_channel_sync_jobs_hotel_type
  ON channel_sync_jobs (hotel_id, job_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_channel_sync_jobs_idempotency
  ON channel_sync_jobs (hotel_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE channel_sync_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hotel admins can view own sync jobs" ON channel_sync_jobs;
CREATE POLICY "Hotel admins can view own sync jobs"
  ON channel_sync_jobs
  FOR SELECT
  USING (
    hotel_id IN (
      SELECT hotel_id FROM hotel_admins
      WHERE user_id = auth.uid() AND status = 'Active'
    )
    OR
    EXISTS (SELECT 1 FROM hotels WHERE id = hotel_id AND admin_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    OR
    EXISTS (SELECT 1 FROM hotel_admins WHERE user_id = auth.uid() AND role = 'super_admin' AND status = 'Active')
  );

-- Service role bypasses RLS for worker processing
COMMENT ON TABLE channel_sync_jobs IS 'Durable outbox for Hotel Mantri Aiosell channel manager synchronization jobs.';
