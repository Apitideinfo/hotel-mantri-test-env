-- =========================================================================
-- Migration: Meta WhatsApp Template Synchronization & Metadata Storage
-- Date: 2026-10-31
-- =========================================================================
-- Purpose:
-- 1. Create `whatsapp_templates` table to persistently store synchronized
--    message templates from Meta WhatsApp Business Account (WABA).
-- 2. Store component definitions: Header type (DOCUMENT, etc.), format,
--    body text, variables list, footer, buttons, and approval status.
-- 3. Extend `hotel_settings` with template selections and sync timestamps.
-- 4. Enable Row Level Security (RLS) for multi-tenant isolation.
-- =========================================================================

-- 1. WHATSAPP TEMPLATES TABLE
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id            UUID REFERENCES hotels(id) ON DELETE CASCADE,
  template_id         TEXT NOT NULL,                       -- Meta template ID
  name                TEXT NOT NULL,                       -- Template name in Meta WABA
  language            TEXT NOT NULL DEFAULT 'en',          -- Language code (e.g. en, hi, en_US)
  status              TEXT NOT NULL,                       -- 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED'
  category            TEXT DEFAULT 'UTILITY',              -- 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'
  header_type         TEXT DEFAULT 'NONE',                 -- 'DOCUMENT' | 'IMAGE' | 'VIDEO' | 'TEXT' | 'NONE'
  header_format       TEXT,                                -- Format string from Meta component
  body_text           TEXT,                                -- Full body text template with {{1}}, {{2}}...
  body_variables      JSONB DEFAULT '[]'::jsonb,           -- Extracted parameter placeholder keys
  footer_text         TEXT,                                -- Footer component text
  buttons             JSONB DEFAULT '[]'::jsonb,           -- Configured buttons
  components          JSONB DEFAULT '[]'::jsonb,           -- Complete raw components from Meta Graph API
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraints for templates (compatible across all Postgres versions)
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_templates_hotel
  ON whatsapp_templates (hotel_id, name, language)
  WHERE hotel_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_templates_global
  ON whatsapp_templates (name, language)
  WHERE hotel_id IS NULL;

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_status    ON whatsapp_templates (status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_name      ON whatsapp_templates (name);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_hotel_id  ON whatsapp_templates (hotel_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_category  ON whatsapp_templates (category);

-- 2. EXTEND HOTEL SETTINGS
ALTER TABLE hotel_settings
  ADD COLUMN IF NOT EXISTS whatsapp_templates_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_reservation_language TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS whatsapp_daily_report_language TEXT DEFAULT 'en';

-- 3. ROW LEVEL SECURITY (RLS)
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_templates' AND policyname = 'Hotel admins can view whatsapp templates'
  ) THEN
    CREATE POLICY "Hotel admins can view whatsapp templates"
      ON whatsapp_templates
      FOR SELECT
      USING (
        hotel_id IS NULL
        OR hotel_id IN (
          SELECT hotel_id FROM hotel_admins
          WHERE user_id = auth.uid() AND status = 'Active'
        )
        OR EXISTS (SELECT 1 FROM hotels WHERE id = hotel_id AND admin_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
        OR EXISTS (SELECT 1 FROM hotel_admins WHERE user_id = auth.uid() AND role = 'super_admin' AND status = 'Active')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_templates' AND policyname = 'Hotel admins can manage whatsapp templates'
  ) THEN
    CREATE POLICY "Hotel admins can manage whatsapp templates"
      ON whatsapp_templates
      FOR ALL
      USING (
        hotel_id IS NULL
        OR hotel_id IN (
          SELECT hotel_id FROM hotel_admins
          WHERE user_id = auth.uid() AND status = 'Active'
        )
        OR EXISTS (SELECT 1 FROM hotels WHERE id = hotel_id AND admin_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
        OR EXISTS (SELECT 1 FROM hotel_admins WHERE user_id = auth.uid() AND role = 'super_admin' AND status = 'Active')
      );
  END IF;
END $$;

COMMENT ON TABLE whatsapp_templates IS 'Synchronized Meta WhatsApp message templates with component definitions and approval status.';
