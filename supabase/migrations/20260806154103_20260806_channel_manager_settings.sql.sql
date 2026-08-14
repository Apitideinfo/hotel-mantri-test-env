/*
# Channel Manager Settings Table + Sync Log Columns

1. Purpose
   Adds a `channel_settings` table for storing Channex connection configuration
   (API base URL, API key reference, property ID, environment).
   Also adds `channel_connection_id`, `room_category_id`, `date_range` columns
   to `channel_sync_logs` for richer filtering, and `channel_rate` column to
   `channel_inventory_restrictions` for per-channel rate overrides.

2. New Tables
   - `channel_settings`: Per-hotel Channex connection configuration
     - id, hotel_id, api_base_url, api_key_secret_name, property_id,
       environment (test/production), status (connected/disconnected/error),
       last_tested_at, last_test_result, created_at, updated_at

3. Modified Tables
   - `channel_sync_logs`: ADD columns channel_connection_id (already exists),
     room_category_id uuid, date_range text, for filtering by category/date
   - `channel_inventory_restrictions`: ADD column channel_rate numeric for
     per-channel rate overrides (separate from base_rate)

4. Security
   - RLS enabled on channel_settings, scoped to authenticated via hotel_id.
   - 4 policies (select/insert/update/delete).

5. Notes
   - API key is NOT stored in the database directly. Only a secret reference name
     is stored. The actual key lives in Supabase secrets / edge function env.
   - All additions are additive — no data loss.
*/

-- Channel Settings
CREATE TABLE IF NOT EXISTS channel_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  api_base_url text DEFAULT 'https://api.channex.io/api/v1',
  api_key_secret_name text,
  property_id text,
  environment text NOT NULL DEFAULT 'test',
  status text NOT NULL DEFAULT 'disconnected',
  last_tested_at timestamptz,
  last_test_result text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (hotel_id)
);

ALTER TABLE channel_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_channel_settings" ON channel_settings;
CREATE POLICY "select_own_channel_settings" ON channel_settings FOR SELECT
  TO authenticated USING (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "insert_own_channel_settings" ON channel_settings;
CREATE POLICY "insert_own_channel_settings" ON channel_settings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "update_own_channel_settings" ON channel_settings;
CREATE POLICY "update_own_channel_settings" ON channel_settings FOR UPDATE
  TO authenticated USING (auth.uid() = hotel_id) WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "delete_own_channel_settings" ON channel_settings;
CREATE POLICY "delete_own_channel_settings" ON channel_settings FOR DELETE
  TO authenticated USING (auth.uid() = hotel_id);

-- Add columns to channel_sync_logs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'channel_sync_logs' AND column_name = 'room_category_id') THEN
    ALTER TABLE channel_sync_logs ADD COLUMN room_category_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'channel_sync_logs' AND column_name = 'date_range') THEN
    ALTER TABLE channel_sync_logs ADD COLUMN date_range text;
  END IF;
END $$;

-- Add channel_rate column to inventory restrictions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'channel_inventory_restrictions' AND column_name = 'channel_rate') THEN
    ALTER TABLE channel_inventory_restrictions ADD COLUMN channel_rate numeric DEFAULT 0;
  END IF;
END $$;
