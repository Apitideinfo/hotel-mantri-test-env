/*
# Restaurant POS — Menu Management Foundation

1. Overview
   Adds a property-level toggle `restaurant_pos_enabled` to the existing
   `hotel_settings` table (default OFF) and creates two new dedicated POS
   tables: `pos_menu_categories` and `pos_menu_items`. Every row is scoped
   by `hotel_id` and protected with the project's existing tenant-isolation
   RLS pattern (authenticated hotel admins/staff only, via hotel_admins join).

2. Modified Tables
   - `hotel_settings`
     - New column `restaurant_pos_enabled` boolean NOT NULL DEFAULT false.
     - Existing settings architecture is reused — no duplicate settings table.

3. New Tables
   - `pos_menu_categories`
     - `id` uuid PK
     - `hotel_id` uuid NOT NULL (FK hotels.id ON DELETE CASCADE)
     - `name` text NOT NULL
     - `display_order` int NOT NULL DEFAULT 0
     - `is_active` boolean NOT NULL DEFAULT true
     - `created_at` / `updated_at` timestamptz
   - `pos_menu_items`
     - `id` uuid PK
     - `hotel_id` uuid NOT NULL (FK hotels.id ON DELETE CASCADE)
     - `category_id` uuid NULL (FK pos_menu_categories.id ON DELETE SET NULL)
     - `name` text NOT NULL
     - `is_veg` boolean NOT NULL DEFAULT true
     - `price` numeric(12,2) NOT NULL DEFAULT 0
     - `gst_percent` numeric(5,2) NOT NULL DEFAULT 0
     - `description` text
     - `is_active` boolean NOT NULL DEFAULT true (Active / Inactive)
     - `is_available` boolean NOT NULL DEFAULT true (Available / Sold Out)
     - `image_url` text
     - `display_order` int NOT NULL DEFAULT 0
     - `created_at` / `updated_at` timestamptz

4. Security
   - RLS enabled on both new tables.
   - 4 CRUD policies each (select/insert/update/delete), scoped TO authenticated,
     ownership verified via EXISTS join on hotel_admins (same pattern as existing
     hotel-scoped tables in this project).
   - No anon access — this app has a sign-in screen.

5. Indexes
   - `pos_menu_categories(hotel_id, display_order)`
   - `pos_menu_items(hotel_id, category_id, display_order)`

6. Important Notes
   - This phase creates ONLY the POS foundation + Menu Management.
   - Orders, KOT, billing, payments, KDS, tables, reports, stock, and aggregator
     integrations are intentionally NOT included.
   - No existing Finance / laundry / menu / PMS / Channel Manager tables are
     modified or affected.
*/

-- ── 1. Add restaurant_pos_enabled to hotel_settings ──
ALTER TABLE hotel_settings
  ADD COLUMN IF NOT EXISTS restaurant_pos_enabled boolean NOT NULL DEFAULT false;

-- ── 2. pos_menu_categories ──
CREATE TABLE IF NOT EXISTS pos_menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_menu_categories ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pos_menu_categories_hotel_order
  ON pos_menu_categories (hotel_id, display_order);

DROP POLICY IF EXISTS "pos_cat_select_own" ON pos_menu_categories;
CREATE POLICY "pos_cat_select_own" ON pos_menu_categories
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_categories.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_cat_insert_own" ON pos_menu_categories;
CREATE POLICY "pos_cat_insert_own" ON pos_menu_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_categories.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_cat_update_own" ON pos_menu_categories;
CREATE POLICY "pos_cat_update_own" ON pos_menu_categories
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_categories.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_categories.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_cat_delete_own" ON pos_menu_categories;
CREATE POLICY "pos_cat_delete_own" ON pos_menu_categories
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_categories.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

-- ── 3. pos_menu_items ──
CREATE TABLE IF NOT EXISTS pos_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  category_id uuid REFERENCES pos_menu_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  is_veg boolean NOT NULL DEFAULT true,
  price numeric(12,2) NOT NULL DEFAULT 0,
  gst_percent numeric(5,2) NOT NULL DEFAULT 0,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  is_available boolean NOT NULL DEFAULT true,
  image_url text,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_menu_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pos_menu_items_hotel_cat_order
  ON pos_menu_items (hotel_id, category_id, display_order);

DROP POLICY IF EXISTS "pos_item_select_own" ON pos_menu_items;
CREATE POLICY "pos_item_select_own" ON pos_menu_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_item_insert_own" ON pos_menu_items;
CREATE POLICY "pos_item_insert_own" ON pos_menu_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_item_update_own" ON pos_menu_items;
CREATE POLICY "pos_item_update_own" ON pos_menu_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_item_delete_own" ON pos_menu_items;
CREATE POLICY "pos_item_delete_own" ON pos_menu_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

-- ── 4. updated_at triggers ──
CREATE OR REPLACE FUNCTION pos_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pos_cat_updated_at ON pos_menu_categories;
CREATE TRIGGER trg_pos_cat_updated_at BEFORE UPDATE ON pos_menu_categories
  FOR EACH ROW EXECUTE FUNCTION pos_set_updated_at();

DROP TRIGGER IF EXISTS trg_pos_item_updated_at ON pos_menu_items;
CREATE TRIGGER trg_pos_item_updated_at BEFORE UPDATE ON pos_menu_items
  FOR EACH ROW EXECUTE FUNCTION pos_set_updated_at();
