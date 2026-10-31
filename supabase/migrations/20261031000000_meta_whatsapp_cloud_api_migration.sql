-- =========================================================================
-- Migration: Meta WhatsApp Business Cloud API Migration
-- Date: 2026-10-31
-- =========================================================================
-- Purpose:
-- 1. Ensure `notification_outbox` table exists with all required columns.
-- 2. Safely add `provider` and other lifecycle columns if not already present.
-- 3. Set default provider to 'META' and migrate any legacy 'WHINTA' entries.
-- 4. Ensure all indexes and constraints exist idempotently.
-- =========================================================================

-- 1. Ensure notification_outbox table exists
CREATE TABLE IF NOT EXISTS notification_outbox (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id            UUID NOT NULL,
  reservation_id      UUID,
  event_type          TEXT NOT NULL,
  recipient           TEXT,
  status              TEXT NOT NULL DEFAULT 'queued',
  attempt_count       INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT,
  provider_message_id TEXT,
  metadata            JSONB,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Safely add all required columns to notification_outbox
ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'META',
  ADD COLUMN IF NOT EXISTS business_date TEXT,
  ADD COLUMN IF NOT EXISTS report_type TEXT,
  ADD COLUMN IF NOT EXISTS delivery_type TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS template_name TEXT,
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

-- Ensure default is 'META' and update any legacy 'WHINTA' or NULL values
ALTER TABLE notification_outbox
  ALTER COLUMN provider SET DEFAULT 'META';

UPDATE notification_outbox
  SET provider = 'META'
  WHERE provider = 'WHINTA' OR provider IS NULL;

-- 3. Create indexes on notification_outbox
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_outbox_idempotency_key
  ON notification_outbox (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_outbox_provider_msg_id
  ON notification_outbox (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_outbox_business_date
  ON notification_outbox (hotel_id, business_date);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_provider
  ON notification_outbox (provider);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_status_provider
  ON notification_outbox (status, provider);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_hotel_status
  ON notification_outbox (hotel_id, status);

-- 4. Conditionally update laundry_statement_log if the table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'laundry_statement_log') THEN
    ALTER TABLE laundry_statement_log
      ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'META',
      ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
      ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
      ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

    ALTER TABLE laundry_statement_log
      ALTER COLUMN provider SET DEFAULT 'META';

    UPDATE laundry_statement_log
      SET provider = 'META'
      WHERE provider = 'WHINTA' OR provider IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_laundry_statement_log_idempotency_key
      ON laundry_statement_log (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- 5. Conditionally extend hotel_settings with WhatsApp configuration columns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hotel_settings') THEN
    ALTER TABLE hotel_settings
      ADD COLUMN IF NOT EXISTS whatsapp_number TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS whatsapp_country_code TEXT NOT NULL DEFAULT '91',
      ADD COLUMN IF NOT EXISTS whatsapp_report_recipient_phone TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS whatsapp_daily_report_enabled BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS whatsapp_laundry_statement_enabled BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS whatsapp_preferred_delivery_time TEXT NOT NULL DEFAULT '22:00',
      ADD COLUMN IF NOT EXISTS whatsapp_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      ADD COLUMN IF NOT EXISTS whatsapp_delivery_preferences JSONB NOT NULL DEFAULT '{"send_morning": false, "send_evening": true, "include_pdf": false}'::jsonb,
      ADD COLUMN IF NOT EXISTS whatsapp_consent_status TEXT NOT NULL DEFAULT 'opted_in',
      ADD COLUMN IF NOT EXISTS whatsapp_reservation_template TEXT DEFAULT 'reservation_confirmation',
      ADD COLUMN IF NOT EXISTS whatsapp_reservation_language TEXT DEFAULT 'en',
      ADD COLUMN IF NOT EXISTS whatsapp_daily_report_template TEXT DEFAULT 'daily_hotel_report',
      ADD COLUMN IF NOT EXISTS whatsapp_daily_report_language TEXT DEFAULT 'en',
      ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS whatsapp_business_account_id TEXT DEFAULT '';
  END IF;
END $$;
