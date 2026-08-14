/*
# Restaurant POS — Table Management (Areas + Tables)

1. Overview
   Creates two new POS tables: `pos_areas` (dining sections like Restaurant,
   AC Hall, Garden, Rooftop, Banquet) and `pos_tables` (individual restaurant
   tables with seating capacity, display order, and operational status).
   Every row is scoped by `hotel_id` and protected with the project's existing
   tenant-isolation RLS pattern (authenticated hotel admins/staff only, via
   hotel_admins join).

2. New Tables
   - `pos_areas`
     - `id` uuid PK
     - `hotel_id` uuid NOT NULL (FK hotels.id ON DELETE CASCADE)
     - `name` text NOT NULL (e.g. "Restaurant", "AC Hall", "Garden")
     - `display_order` int NOT NULL DEFAULT 0
     - `is_active` boolean NOT NULL DEFAULT true
     - `created_at` / `updated_at` timestamptz
   - `pos_tables`
     - `id` uuid PK
     - `hotel_id` uuid NOT NULL (FK hotels.id ON DELETE CASCADE)
     - `area_id` uuid NULL (FK pos_areas.id ON DELETE SET NULL)
     - `name` text NOT NULL (e.g. "T01", "Family 1", "Garden 1")
     - `seating_capacity` int NOT NULL DEFAULT 2
     - `display_order` int NOT NULL DEFAULT 0
     - `is_active` boolean NOT NULL DEFAULT true (Active / Inactive)
     - `current_status` text NOT NULL DEFAULT 'available'
       (one of: available, occupied, reserved, billing, cleaning)
     - `created_at` / `updated_at` timestamptz

3. Security
   - RLS enabled on both new tables.
   - 4 CRUD policies each (select/insert/update/delete), scoped TO authenticated,
     ownership verified via EXISTS join on hotel_admins (same pattern as
     pos_menu_categories and pos_menu_items already in this project).
   - No anon access — this app has a sign-in screen.

4. Indexes
   - `pos_areas(hotel_id, display_order)`
   - `pos_tables(hotel_id, area_id, display_order)`

5. Important Notes
   - This phase creates ONLY Areas + Tables for the POS.
   - Orders, KOT, billing, payments, KDS, and reports are NOT included.
   - Table status is operational UI only — no order/billing logic drives it yet.
   - Tables should be deactivated (is_active = false) rather than hard-deleted
     once POS activity exists. For now hard delete is allowed via RLS since
     no order tables exist yet.
   - No existing tables are modified.
*/

-- ── 1. pos_areas ──
CREATE TABLE IF NOT EXISTS pos_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_areas ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pos_areas_hotel_order
  ON pos_areas (hotel_id, display_order);

DROP POLICY IF EXISTS "pos_area_select_own" ON pos_areas;
CREATE POLICY "pos_area_select_own" ON pos_areas
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_areas.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_area_insert_own" ON pos_areas;
CREATE POLICY "pos_area_insert_own" ON pos_areas
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_areas.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_area_update_own" ON pos_areas;
CREATE POLICY "pos_area_update_own" ON pos_areas
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_areas.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_areas.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_area_delete_own" ON pos_areas;
CREATE POLICY "pos_area_delete_own" ON pos_areas
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_areas.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

-- ── 2. pos_tables ──
CREATE TABLE IF NOT EXISTS pos_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  area_id uuid REFERENCES pos_areas(id) ON DELETE SET NULL,
  name text NOT NULL,
  seating_capacity int NOT NULL DEFAULT 2,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  current_status text NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_tables ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pos_tables_hotel_area_order
  ON pos_tables (hotel_id, area_id, display_order);

DROP POLICY IF EXISTS "pos_table_select_own" ON pos_tables;
CREATE POLICY "pos_table_select_own" ON pos_tables
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_tables.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_table_insert_own" ON pos_tables;
CREATE POLICY "pos_table_insert_own" ON pos_tables
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_tables.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_table_update_own" ON pos_tables;
CREATE POLICY "pos_table_update_own" ON pos_tables
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_tables.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_tables.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_table_delete_own" ON pos_tables;
CREATE POLICY "pos_table_delete_own" ON pos_tables
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_tables.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

-- ── 3. updated_at triggers ──
DROP TRIGGER IF EXISTS trg_pos_area_updated_at ON pos_areas;
CREATE TRIGGER trg_pos_area_updated_at BEFORE UPDATE ON pos_areas
  FOR EACH ROW EXECUTE FUNCTION pos_set_updated_at();

DROP TRIGGER IF EXISTS trg_pos_table_updated_at ON pos_tables;
CREATE TRIGGER trg_pos_table_updated_at BEFORE UPDATE ON pos_tables
  FOR EACH ROW EXECUTE FUNCTION pos_set_updated_at();
