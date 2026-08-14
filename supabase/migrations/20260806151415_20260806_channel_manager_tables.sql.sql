/*
# Channel Manager Tables

1. Purpose
   Creates the database schema for the Channel Manager module (Channex.io integration).
   These tables store channel connections, rate plan mappings, OTA reservations,
   inventory restrictions, and sync logs. The actual Channex API integration requires
   credentials to be configured separately — until then the UI runs in mock/test mode.

2. New Tables
   - `channel_connections`: OTA channels connected via Channex (Booking.com, Agoda, etc.)
   - `channel_rate_mappings`: Maps Hotel Mantri room categories + rate plans to Channex room types + rate plans
   - `channel_ota_reservations`: OTA bookings received from Channex
   - `channel_inventory_restrictions`: Per-category per-date restrictions and rates
   - `channel_sync_logs`: Sync activity log

3. Security
   - RLS enabled on all tables, scoped to authenticated users via hotel_id ownership.
   - 4 policies per table (select/insert/update/delete) using hotel_id match.

4. Indexes
   - Composite indexes on (hotel_id, ...) for frequently queried columns.
   - Unique constraint on (hotel_id, ota_booking_id) to prevent duplicate OTA bookings.
   - Unique constraint on (hotel_id, room_category_id, date) for inventory restrictions.
*/

-- Channel Connections
CREATE TABLE IF NOT EXISTS channel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  channel_type text NOT NULL,
  channel_name text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  channex_channel_id text,
  last_sync_at timestamptz,
  last_sync_status text,
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_channel_connections" ON channel_connections;
CREATE POLICY "select_own_channel_connections" ON channel_connections FOR SELECT
  TO authenticated USING (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "insert_own_channel_connections" ON channel_connections;
CREATE POLICY "insert_own_channel_connections" ON channel_connections FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "update_own_channel_connections" ON channel_connections;
CREATE POLICY "update_own_channel_connections" ON channel_connections FOR UPDATE
  TO authenticated USING (auth.uid() = hotel_id) WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "delete_own_channel_connections" ON channel_connections;
CREATE POLICY "delete_own_channel_connections" ON channel_connections FOR DELETE
  TO authenticated USING (auth.uid() = hotel_id);

CREATE INDEX IF NOT EXISTS idx_channel_connections_hotel ON channel_connections (hotel_id);

-- Channel Rate Mappings
CREATE TABLE IF NOT EXISTS channel_rate_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  room_category_id uuid,
  rate_plan_id uuid,
  channex_room_type_id text,
  channex_rate_plan_id text,
  status text NOT NULL DEFAULT 'unmapped',
  last_sync_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE channel_rate_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_channel_rate_mappings" ON channel_rate_mappings;
CREATE POLICY "select_own_channel_rate_mappings" ON channel_rate_mappings FOR SELECT
  TO authenticated USING (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "insert_own_channel_rate_mappings" ON channel_rate_mappings;
CREATE POLICY "insert_own_channel_rate_mappings" ON channel_rate_mappings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "update_own_channel_rate_mappings" ON channel_rate_mappings;
CREATE POLICY "update_own_channel_rate_mappings" ON channel_rate_mappings FOR UPDATE
  TO authenticated USING (auth.uid() = hotel_id) WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "delete_own_channel_rate_mappings" ON channel_rate_mappings;
CREATE POLICY "delete_own_channel_rate_mappings" ON channel_rate_mappings FOR DELETE
  TO authenticated USING (auth.uid() = hotel_id);

CREATE INDEX IF NOT EXISTS idx_channel_rate_mappings_hotel ON channel_rate_mappings (hotel_id);

-- Channel OTA Reservations
CREATE TABLE IF NOT EXISTS channel_ota_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  channel_connection_id uuid,
  ota_booking_id text NOT NULL,
  guest_name text,
  room_category text,
  check_in_date date,
  check_out_date date,
  amount numeric DEFAULT 0,
  booking_status text NOT NULL DEFAULT 'new',
  import_status text NOT NULL DEFAULT 'pending',
  raw_payload jsonb,
  reservation_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (hotel_id, ota_booking_id)
);

ALTER TABLE channel_ota_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_channel_ota_reservations" ON channel_ota_reservations;
CREATE POLICY "select_own_channel_ota_reservations" ON channel_ota_reservations FOR SELECT
  TO authenticated USING (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "insert_own_channel_ota_reservations" ON channel_ota_reservations;
CREATE POLICY "insert_own_channel_ota_reservations" ON channel_ota_reservations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "update_own_channel_ota_reservations" ON channel_ota_reservations;
CREATE POLICY "update_own_channel_ota_reservations" ON channel_ota_reservations FOR UPDATE
  TO authenticated USING (auth.uid() = hotel_id) WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "delete_own_channel_ota_reservations" ON channel_ota_reservations;
CREATE POLICY "delete_own_channel_ota_reservations" ON channel_ota_reservations FOR DELETE
  TO authenticated USING (auth.uid() = hotel_id);

CREATE INDEX IF NOT EXISTS idx_channel_ota_reservations_hotel ON channel_ota_reservations (hotel_id);
CREATE INDEX IF NOT EXISTS idx_channel_ota_reservations_hotel_status ON channel_ota_reservations (hotel_id, import_status);

-- Channel Inventory Restrictions
CREATE TABLE IF NOT EXISTS channel_inventory_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  room_category_id uuid NOT NULL,
  date date NOT NULL,
  availability integer DEFAULT 0,
  base_rate numeric DEFAULT 0,
  min_stay integer DEFAULT 1,
  max_stay integer DEFAULT 0,
  stop_sell boolean NOT NULL DEFAULT false,
  closed_to_arrival boolean NOT NULL DEFAULT false,
  closed_to_departure boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (hotel_id, room_category_id, date)
);

ALTER TABLE channel_inventory_restrictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_channel_inventory" ON channel_inventory_restrictions;
CREATE POLICY "select_own_channel_inventory" ON channel_inventory_restrictions FOR SELECT
  TO authenticated USING (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "insert_own_channel_inventory" ON channel_inventory_restrictions;
CREATE POLICY "insert_own_channel_inventory" ON channel_inventory_restrictions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "update_own_channel_inventory" ON channel_inventory_restrictions;
CREATE POLICY "update_own_channel_inventory" ON channel_inventory_restrictions FOR UPDATE
  TO authenticated USING (auth.uid() = hotel_id) WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "delete_own_channel_inventory" ON channel_inventory_restrictions;
CREATE POLICY "delete_own_channel_inventory" ON channel_inventory_restrictions FOR DELETE
  TO authenticated USING (auth.uid() = hotel_id);

CREATE INDEX IF NOT EXISTS idx_channel_inventory_hotel_date ON channel_inventory_restrictions (hotel_id, date);
CREATE INDEX IF NOT EXISTS idx_channel_inventory_hotel_cat_date ON channel_inventory_restrictions (hotel_id, room_category_id, date);

-- Channel Sync Logs
CREATE TABLE IF NOT EXISTS channel_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  channel_connection_id uuid,
  log_type text NOT NULL,
  direction text NOT NULL DEFAULT 'outbound',
  status text NOT NULL DEFAULT 'success',
  message text,
  error_detail text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE channel_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_channel_sync_logs" ON channel_sync_logs;
CREATE POLICY "select_own_channel_sync_logs" ON channel_sync_logs FOR SELECT
  TO authenticated USING (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "insert_own_channel_sync_logs" ON channel_sync_logs;
CREATE POLICY "insert_own_channel_sync_logs" ON channel_sync_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "update_own_channel_sync_logs" ON channel_sync_logs;
CREATE POLICY "update_own_channel_sync_logs" ON channel_sync_logs FOR UPDATE
  TO authenticated USING (auth.uid() = hotel_id) WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "delete_own_channel_sync_logs" ON channel_sync_logs;
CREATE POLICY "delete_own_channel_sync_logs" ON channel_sync_logs FOR DELETE
  TO authenticated USING (auth.uid() = hotel_id);

CREATE INDEX IF NOT EXISTS idx_channel_sync_logs_hotel ON channel_sync_logs (hotel_id, created_at DESC);
