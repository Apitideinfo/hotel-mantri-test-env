/*
# Room Category Management

1. Overview
   Adds a room_categories table for hotel-level room category management,
   and a room_category column on room_chart_entries to tag each booking
   with a room category (e.g. Standard, Deluxe, Suite).

2. New Tables
   - room_categories
     - id (uuid, primary key)
     - hotel_id (uuid, references hotels)
     - name (text, not null) — category name (e.g. "Deluxe")
     - sort_order (integer, default 0) — display order
     - is_active (boolean, default true) — soft-delete / deactivate
     - created_at (timestamptz)

3. Modified Tables
   - room_chart_entries
     - room_category (text, default 'Standard') — the category name at time of booking

4. Default Categories
   - When a new hotel is created, 6 default categories are seeded:
     Standard, Deluxe, Super Deluxe, Executive, Suite, Family Room.
   - A trigger auto-seeds these for any new row in hotel_settings.

5. Security
   - RLS enabled on room_categories.
   - 4 policies (SELECT/INSERT/UPDATE/DELETE) scoped to authenticated users
     via hotel_id = auth_hotel_id() or is_super_admin().
   - room_chart_entries already has RLS; new column is covered by existing policies.

6. Notes
   - room_category on room_chart_entries is a free-text column (not FK) so
     renaming/deleting a category does not lose historical booking data.
   - Existing rows get 'Standard' as the default category.
*/

-- ── room_categories table ──
CREATE TABLE IF NOT EXISTS room_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (hotel_id, name)
);

ALTER TABLE room_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_room_categories" ON room_categories;
CREATE POLICY "auth_select_room_categories"
  ON room_categories FOR SELECT TO authenticated
  USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "auth_insert_room_categories" ON room_categories;
CREATE POLICY "auth_insert_room_categories"
  ON room_categories FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "auth_update_room_categories" ON room_categories;
CREATE POLICY "auth_update_room_categories"
  ON room_categories FOR UPDATE TO authenticated
  USING (is_super_admin() OR (hotel_id = auth_hotel_id()))
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "auth_delete_room_categories" ON room_categories;
CREATE POLICY "auth_delete_room_categories"
  ON room_categories FOR DELETE TO authenticated
  USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

-- ── room_category column on room_chart_entries ──
ALTER TABLE room_chart_entries
  ADD COLUMN IF NOT EXISTS room_category text DEFAULT 'Standard';

-- ── Auto-seed default categories for new hotels ──
CREATE OR REPLACE FUNCTION seed_default_room_categories()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO room_categories (hotel_id, name, sort_order)
  VALUES
    (NEW.id, 'Standard', 1),
    (NEW.id, 'Deluxe', 2),
    (NEW.id, 'Super Deluxe', 3),
    (NEW.id, 'Executive', 4),
    (NEW.id, 'Suite', 5),
    (NEW.id, 'Family Room', 6)
  ON CONFLICT (hotel_id, name) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_seed_room_categories ON hotel_settings;
CREATE TRIGGER trigger_seed_room_categories
  AFTER INSERT ON hotel_settings
  FOR EACH ROW EXECUTE FUNCTION seed_default_room_categories();

-- ── Seed default categories for existing hotels ──
INSERT INTO room_categories (hotel_id, name, sort_order)
SELECT h.id, cat.name, cat.sort_order
FROM hotels h
CROSS JOIN (VALUES
  ('Standard', 1),
  ('Deluxe', 2),
  ('Super Deluxe', 3),
  ('Executive', 4),
  ('Suite', 5),
  ('Family Room', 6)
) AS cat(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM room_categories rc WHERE rc.hotel_id = h.id AND rc.name = cat.name
)
ON CONFLICT (hotel_id, name) DO NOTHING;