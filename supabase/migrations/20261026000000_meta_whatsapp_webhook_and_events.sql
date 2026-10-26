-- =========================================================================
-- Migration: Meta WhatsApp Cloud API Webhook Events & Tracking
-- Date: 2026-10-26
-- =========================================================================
-- Purpose:
-- 1. Create `whatsapp_webhook_events` table to persistently record Meta WhatsApp
--    Cloud API status updates, delivery receipts, errors, and inbound messages.
-- 2. Provide strict idempotency via unique index on `idempotency_key`.
-- 3. Ensure multi-tenant isolation, hotel associations, and RLS security.
-- 4. Add `whatsapp_opt_in` flag to `reservations` and `guests` tables.
-- 5. Extend `hotel_settings` with WhatsApp Cloud API provider preferences.
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. WHATSAPP WEBHOOK EVENTS TABLE
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            TEXT,
  wamid               TEXT,                       -- Meta message ID (wamid.HBgL...)
  event_type          TEXT NOT NULL,              -- 'status_update' | 'incoming_message' | 'error'
  phone_number_id     TEXT,                       -- Meta Phone Number ID
  recipient_phone     TEXT,                       -- Normalized destination phone
  sender_phone        TEXT,                       -- Normalized origin phone (for inbound)
  delivery_status     TEXT,                       -- 'sent' | 'delivered' | 'read' | 'failed' | 'received'
  event_timestamp     TIMESTAMPTZ,                -- Original Meta event timestamp
  processing_status   TEXT NOT NULL DEFAULT 'PROCESSED', -- 'PROCESSED' | 'SKIPPED' | 'FAILED'
  error_details       JSONB,                      -- Sanitized error payload (no secrets)
  idempotency_key     TEXT UNIQUE,                -- Unique key preventing duplicate processing
  raw_metadata        JSONB,                      -- Safe diagnostic metadata
  hotel_id            UUID REFERENCES hotels(id) ON DELETE SET NULL,
  reservation_id      UUID REFERENCES reservations(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for lightning-fast queries and deduplication
CREATE INDEX IF NOT EXISTS idx_wa_events_wamid           ON whatsapp_webhook_events (wamid);
CREATE INDEX IF NOT EXISTS idx_wa_events_status          ON whatsapp_webhook_events (delivery_status);
CREATE INDEX IF NOT EXISTS idx_wa_events_hotel_id        ON whatsapp_webhook_events (hotel_id);
CREATE INDEX IF NOT EXISTS idx_wa_events_reservation_id  ON whatsapp_webhook_events (reservation_id);
CREATE INDEX IF NOT EXISTS idx_wa_events_created_at      ON whatsapp_webhook_events (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_events_idempotency ON whatsapp_webhook_events (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. EXTEND RESERVATIONS & GUESTS WITH WHATSAPP OPT-IN
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT;

ALTER TABLE guests
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_reservations_whatsapp_msg_id ON reservations (whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. EXTEND HOTEL SETTINGS WITH META WHATSAPP CONFIG
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE hotel_settings
  ADD COLUMN IF NOT EXISTS whatsapp_provider TEXT DEFAULT 'META',
  ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp_business_account_id TEXT DEFAULT '';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY (RLS) FOR MULTI-TENANT ISOLATION
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

-- Hotel admins can view events for their assigned property
CREATE POLICY "Hotel admins can view whatsapp webhook events"
  ON whatsapp_webhook_events
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

COMMENT ON TABLE whatsapp_webhook_events IS 'Audit log of official Meta WhatsApp Cloud API webhooks (delivery receipts, status transitions, inbound messages).';
COMMENT ON COLUMN whatsapp_webhook_events.wamid IS 'Meta WhatsApp message ID (e.g. wamid.HBgL...).';
COMMENT ON COLUMN whatsapp_webhook_events.idempotency_key IS 'Unique key combining wamid and status/timestamp to prevent duplicate processing.';
