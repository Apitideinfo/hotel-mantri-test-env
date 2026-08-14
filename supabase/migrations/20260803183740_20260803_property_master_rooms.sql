/*
# Property Master — Room Inventory & Category Tariffs

1. Overview
   Adds a per-hotel room inventory table so each hotel can manage its own
   physical rooms (room number, category, floor, tariff, extra-bed charge,
   active status). Also extends room_categories with default tariff and
   extra-bed charge so new rooms can inherit category defaults.

2. New Tables
   - rooms
     - id (uuid, primary key)
     - hotel_id (uuid, references hotels, ON DELETE CASCADE)
     - room_no (text, not null) — the physical room number/label
     - category_id (uuid, references room_categories, ON DELETE SET NULL)
     - floor (text) — floor identifier (e.g. "Ground", "1st")
     - default_tariff (numeric, default 0) — per-room default tariff
     - extra_bed_charge (numeric, default 0) — per-room extra-bed charge
     - is_active (boolean, default true) — soft-deactivate a room
     - sort_order (integer, default 0) — display order
     - created_at (timestamptz)
     - UNIQUE(hotel_id, room_no)

3. Modified Tables
   - room_categories
     - default_tariff (numeric, default 0) — category-level default tariff
     - extra_bed_charge (numeric, default 0) — category-level default extra-bed charge

4. Security
   - RLS enabled on rooms.
   - 4 policies (SELECT/INSERT/UPDATE/DELETE) scoped to authenticated users
     via hotel_id = auth_hotel_id() or is_super_admin() — same pattern as
     room_categories.

5. Notes
   - category_id on rooms is nullable and ON DELETE SET NULL so deleting a
     category does not lose room inventory rows.
   - room_no is free-text so hotels can use any numbering scheme.
   - The Daily Entry Room Chart reads from this table to generate room cards
     dynamically instead of using hardcoded room numbers.
*/

-- ── Extend room_categories with tariff fields ──
ALTER TABLE room_categories
  ADD COLUMN IF NOT EXISTS default_tariff numeric NOT NULL DEFAULT 0;

ALTER TABLE room_categories
  ADD COLUMN IF NOT EXISTS extra_bed_charge numeric NOT NULL DEFAULT 0;

-- ── rooms table ──
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_no text NOT NULL,
  category_id uuid REFERENCES room_categories(id) ON DELETE SET NULL,
  floor text,
  default_tariff numeric NOT NULL DEFAULT 0,
  extra_bed_charge numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (hotel_id, room_no)
);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_rooms" ON rooms;
CREATE POLICY "auth_select_rooms"
  ON rooms FOR SELECT TO authenticated
  USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "auth_insert_rooms" ON rooms;
CREATE POLICY "auth_insert_rooms"
  ON rooms FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "auth_update_rooms" ON rooms;
CREATE POLICY "auth_update_rooms"
  ON rooms FOR UPDATE TO authenticated
  USING (is_super_admin() OR (hotel_id = auth_hotel_id()))
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "auth_delete_rooms" ON rooms;
CREATE POLICY "auth_delete_rooms"
  ON rooms FOR DELETE TO authenticated
  USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

-- Index for efficient per-hotel queries
CREATE INDEX IF NOT EXISTS idx_rooms_hotel_id ON rooms(hotel_id);
CREATE INDEX IF NOT EXISTS idx_rooms_category_id ON rooms(category_id);
