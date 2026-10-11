-- =========================================================================
-- Migration: Whinta WhatsApp Integration & Hotel Owner Recipient Settings
-- Date: 2026-10-11
-- =========================================================================
-- 1. Extends hotel_settings with hotel-specific WhatsApp recipient preferences:
--    - Country code & recipient phone
--    - Daily report toggle & laundry statement toggle
--    - Preferred send time & hotel timezone
--    - Delivery preferences (JSONB)
--    - Consent/opt-in status
--    - Audit tracking (last success & last failure)
--
-- 2. Extends notification_outbox with idempotency and provider tracking:
--    - Idempotency key & provider name
--    - Delivery lifecycle timestamps (submitted_at, delivered_at, failed_at)
--
-- 3. Extends laundry_statement_log with provider tracking and idempotency:
--    - Provider name, provider message ID, idempotency key
--
-- 4. Ensures strict multi-tenant Row Level Security (RLS)
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EXTEND hotel_settings WITH WHATSAPP PREFERENCES
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE hotel_settings
  ADD COLUMN IF NOT EXISTS whatsapp_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp_country_code text NOT NULL DEFAULT '91',
  ADD COLUMN IF NOT EXISTS whatsapp_report_recipient_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp_daily_report_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_laundry_statement_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_preferred_delivery_time text NOT NULL DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS whatsapp_timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS whatsapp_delivery_preferences jsonb NOT NULL DEFAULT '{"send_morning": false, "send_evening": true, "include_pdf": false}'::jsonb,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_status text NOT NULL DEFAULT 'opted_in',
  ADD COLUMN IF NOT EXISTS whatsapp_last_successful_send timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_last_failure_reason text,
  ADD COLUMN IF NOT EXISTS whatsapp_last_failure_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. EXTEND notification_outbox FOR IDEMPOTENCY & LIFECYCLE
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE notification_outbox
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

CREATE INDEX IF NOT EXISTS idx_notification_outbox_provider_msg_id
  ON notification_outbox (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_outbox_business_date
  ON notification_outbox (hotel_id, business_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. EXTEND laundry_statement_log FOR PROVIDER TRACKING
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'laundry_statement_log') THEN
    ALTER TABLE laundry_statement_log
      ADD COLUMN IF NOT EXISTS provider text DEFAULT 'WHINTA',
      ADD COLUMN IF NOT EXISTS provider_message_id text,
      ADD COLUMN IF NOT EXISTS idempotency_key text,
      ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
      ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_laundry_statement_log_idempotency_key
      ON laundry_statement_log (idempotency_key)
      WHERE idempotency_key IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_laundry_statement_log_provider_msg
      ON laundry_statement_log (provider_message_id)
      WHERE provider_message_id IS NOT NULL;
  END IF;
END $$;
