-- Migration: 20261022020000_aiosell_isolation_and_uniqueness.sql
-- Description: Enforce strict uniqueness and tenant isolation on Aiosell hotel codes in channel_settings.

DO $$
BEGIN
  -- 1. Ensure unique index on hotel_id in channel_settings (one configuration per hotel)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'channel_settings_tenant_key'
  ) THEN
    CREATE UNIQUE INDEX channel_settings_tenant_key ON channel_settings (hotel_id);
  END IF;

  -- 2. Partial unique index on aiosell_hotel_code to prevent cross-hotel code duplication
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_channel_settings_aiosell_hotel_code'
  ) THEN
    CREATE UNIQUE INDEX idx_channel_settings_aiosell_hotel_code
      ON channel_settings (aiosell_hotel_code)
      WHERE aiosell_hotel_code IS NOT NULL AND aiosell_hotel_code != '';
  END IF;
END $$;
