-- =========================================================================
-- Migration: Whinta Template & Scheduled Report Outbox Tracking
-- Date: 2026-10-15
-- =========================================================================
-- Ensures explicit tracking of WhatsApp templates, idempotency keys,
-- document storage, and provider status lifecycle for Whinta integrations.
-- =========================================================================

-- 1. notification_outbox tracking additions
ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS template_name text,
  ADD COLUMN IF NOT EXISTS business_date text,
  ADD COLUMN IF NOT EXISTS report_type text,
  ADD COLUMN IF NOT EXISTS delivery_type text DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'WHINTA',
  ADD COLUMN IF NOT EXISTS media_url text,
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

CREATE INDEX IF NOT EXISTS idx_notification_outbox_business_date
  ON notification_outbox (hotel_id, business_date);

-- 2. hotel_settings configuration additions
ALTER TABLE hotel_settings
  ADD COLUMN IF NOT EXISTS whatsapp_reservation_confirmation_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_daily_report_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_report_recipient_phone text,
  ADD COLUMN IF NOT EXISTS whatsapp_preferred_delivery_time text DEFAULT '21:00',
  ADD COLUMN IF NOT EXISTS whatsapp_timezone text DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS whatsapp_reservation_template text DEFAULT 'booking_confirmation',
  ADD COLUMN IF NOT EXISTS whatsapp_daily_report_template text DEFAULT 'daily_hotel_report',
  ADD COLUMN IF NOT EXISTS whatsapp_template_language text DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS whatsapp_template_has_document_header boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_last_successful_send timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_last_failure_reason text,
  ADD COLUMN IF NOT EXISTS whatsapp_last_failure_at timestamptz;

-- 3. Supabase Storage bucket for hotel documents (PDFs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hotel-documents',
  'hotel-documents',
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf']::text[];
