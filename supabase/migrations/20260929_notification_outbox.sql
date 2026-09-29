-- Hotel Mantri — notification_outbox table migration
-- Purpose: Durable outbox for OTA owner email notifications
-- Prevents duplicate emails via unique constraint on (hotel_id, reservation_id, event_type)
--
-- Run this in Supabase SQL Editor or apply as a migration file.

-- Create table
CREATE TABLE IF NOT EXISTS notification_outbox (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id            UUID NOT NULL,
  reservation_id      UUID,
  event_type          TEXT NOT NULL,
  recipient           TEXT,
  status              TEXT NOT NULL DEFAULT 'queued',
    -- queued | sending | sent | failed | not_configured | duplicate
  attempt_count       INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT,
  provider_message_id TEXT,
  metadata            JSONB,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate notifications for the same reservation + event
  CONSTRAINT notification_outbox_unique_event
    UNIQUE (hotel_id, reservation_id, event_type)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS notification_outbox_hotel_id_idx     ON notification_outbox (hotel_id);
CREATE INDEX IF NOT EXISTS notification_outbox_reservation_id_idx ON notification_outbox (reservation_id);
CREATE INDEX IF NOT EXISTS notification_outbox_status_idx       ON notification_outbox (status);
CREATE INDEX IF NOT EXISTS notification_outbox_event_type_idx   ON notification_outbox (event_type);
CREATE INDEX IF NOT EXISTS notification_outbox_created_at_idx   ON notification_outbox (created_at DESC);

-- Row Level Security (if using Supabase RLS)
ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;

-- Hotel admins can read their own hotel's notifications
CREATE POLICY "Hotel admin can view notifications"
  ON notification_outbox
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

-- Service role can do everything (for backend operations)
-- No explicit policy needed for service role (bypasses RLS)

COMMENT ON TABLE notification_outbox IS 'Durable outbox for Hotel Mantri automated notifications. Unique constraint prevents duplicate OTA owner emails.';
COMMENT ON COLUMN notification_outbox.event_type IS 'e.g. OTA_NEW_RESERVATION_OWNER_EMAIL';
COMMENT ON COLUMN notification_outbox.status IS 'queued | sending | sent | failed | not_configured | duplicate';
COMMENT ON COLUMN notification_outbox.attempt_count IS 'Number of send attempts made';
COMMENT ON COLUMN notification_outbox.last_error IS 'Safe error code (never contains SMTP credentials)';
COMMENT ON COLUMN notification_outbox.provider_message_id IS 'SMTP message ID on successful send';
