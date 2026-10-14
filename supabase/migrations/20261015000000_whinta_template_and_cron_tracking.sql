-- =========================================================================
-- Migration: Whinta Template & Scheduled Report Outbox Tracking
-- Date: 2026-10-15
-- =========================================================================
-- Ensures explicit tracking of WhatsApp templates, idempotency keys,
-- and provider status lifecycle for Whinta integrations.
-- =========================================================================

ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS template_name text,
  ADD COLUMN IF NOT EXISTS business_date text,
  ADD COLUMN IF NOT EXISTS report_type text,
  ADD COLUMN IF NOT EXISTS delivery_type text DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'WHINTA',
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_outbox_idempotency_key
  ON notification_outbox (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_outbox_template_name
  ON notification_outbox (template_name)
  WHERE template_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_outbox_provider_msg_id
  ON notification_outbox (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
