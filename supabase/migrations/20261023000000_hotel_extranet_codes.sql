-- Migration: 20261023000000_hotel_extranet_codes.sql
-- Description: Centralized Hotel Extranet Codes Management table and strict Super Admin RBAC.
-- Stores each hotel's individual OTA property/extranet codes safely isolated by hotel_id.

-- 1. Create hotel_extranet_codes table
CREATE TABLE IF NOT EXISTS hotel_extranet_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES channel_connections(id) ON DELETE SET NULL,
  ota_type text NOT NULL,
  ota_name text NOT NULL,
  extranet_property_code text NOT NULL,
  ota_property_name text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Prevent accidental duplicate records for the same hotel and OTA
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_hotel_extranet_codes_hotel_ota'
  ) THEN
    ALTER TABLE hotel_extranet_codes
      ADD CONSTRAINT uq_hotel_extranet_codes_hotel_ota UNIQUE (hotel_id, ota_type);
  END IF;
END $$;

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_hotel_extranet_codes_hotel_id ON hotel_extranet_codes(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_extranet_codes_ota_type ON hotel_extranet_codes(ota_type);
CREATE INDEX IF NOT EXISTS idx_hotel_extranet_codes_active ON hotel_extranet_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_hotel_extranet_codes_code ON hotel_extranet_codes(extranet_property_code);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE hotel_extranet_codes ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- SELECT: Super Admin can read all; Hotel Admin/Owner can read only their assigned hotel
DROP POLICY IF EXISTS "hotel_extranet_codes_select" ON hotel_extranet_codes;
CREATE POLICY "hotel_extranet_codes_select" ON hotel_extranet_codes
  FOR SELECT TO authenticated
  USING (is_super_admin() OR hotel_id = auth_hotel_id());

-- INSERT: Super Admin ONLY
DROP POLICY IF EXISTS "hotel_extranet_codes_insert" ON hotel_extranet_codes;
CREATE POLICY "hotel_extranet_codes_insert" ON hotel_extranet_codes
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

-- UPDATE: Super Admin ONLY
DROP POLICY IF EXISTS "hotel_extranet_codes_update" ON hotel_extranet_codes;
CREATE POLICY "hotel_extranet_codes_update" ON hotel_extranet_codes
  FOR UPDATE TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- DELETE: Super Admin ONLY
DROP POLICY IF EXISTS "hotel_extranet_codes_delete" ON hotel_extranet_codes;
CREATE POLICY "hotel_extranet_codes_delete" ON hotel_extranet_codes
  FOR DELETE TO authenticated
  USING (is_super_admin());

-- 6. Safe backfill: Populate from existing channel_connections.external_channel_id if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'channel_connections' AND column_name = 'external_channel_id'
  ) THEN
    INSERT INTO hotel_extranet_codes (hotel_id, channel_id, ota_type, ota_name, extranet_property_code, is_active)
    SELECT 
      cc.hotel_id,
      cc.id AS channel_id,
      cc.channel_type AS ota_type,
      COALESCE(cc.channel_name, cc.channel_type) AS ota_name,
      TRIM(cc.external_channel_id) AS extranet_property_code,
      COALESCE(cc.is_enabled, true) AS is_active
    FROM channel_connections cc
    WHERE cc.external_channel_id IS NOT NULL 
      AND TRIM(cc.external_channel_id) <> ''
    ON CONFLICT (hotel_id, ota_type) DO NOTHING;
  END IF;
END $$;
