-- Fix RLS policies for laundry_linen module tables.
-- Root cause: original migration used `auth.uid() = hotel_id` which compares
-- the user's auth UUID against the hotel UUID — they never match, so all
-- inserts/selects/updates/deletes were blocked by RLS.
-- Fix: use `hotel_id = auth_hotel_id()` (the existing helper function used by
-- all other tenant tables) and also allow `is_super_admin()`.

-- ── laundry_vendors ──
DROP POLICY IF EXISTS "select_own_laundry_vendors" ON laundry_vendors;
CREATE POLICY "select_own_laundry_vendors" ON laundry_vendors FOR SELECT
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));
DROP POLICY IF EXISTS "insert_own_laundry_vendors" ON laundry_vendors;
CREATE POLICY "insert_own_laundry_vendors" ON laundry_vendors FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));
DROP POLICY IF EXISTS "update_own_laundry_vendors" ON laundry_vendors;
CREATE POLICY "update_own_laundry_vendors" ON laundry_vendors FOR UPDATE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()))
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));
DROP POLICY IF EXISTS "delete_own_laundry_vendors" ON laundry_vendors;
CREATE POLICY "delete_own_laundry_vendors" ON laundry_vendors FOR DELETE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

-- ── linen_items ──
DROP POLICY IF EXISTS "select_own_linen_items" ON linen_items;
CREATE POLICY "select_own_linen_items" ON linen_items FOR SELECT
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));
DROP POLICY IF EXISTS "insert_own_linen_items" ON linen_items;
CREATE POLICY "insert_own_linen_items" ON linen_items FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));
DROP POLICY IF EXISTS "update_own_linen_items" ON linen_items;
CREATE POLICY "update_own_linen_items" ON linen_items FOR UPDATE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()))
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));
DROP POLICY IF EXISTS "delete_own_linen_items" ON linen_items;
CREATE POLICY "delete_own_linen_items" ON linen_items FOR DELETE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

-- ── laundry_dispatches ──
DROP POLICY IF EXISTS "select_own_laundry_dispatches" ON laundry_dispatches;
CREATE POLICY "select_own_laundry_dispatches" ON laundry_dispatches FOR SELECT
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));
DROP POLICY IF EXISTS "insert_own_laundry_dispatches" ON laundry_dispatches;
CREATE POLICY "insert_own_laundry_dispatches" ON laundry_dispatches FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));
DROP POLICY IF EXISTS "update_own_laundry_dispatches" ON laundry_dispatches;
CREATE POLICY "update_own_laundry_dispatches" ON laundry_dispatches FOR UPDATE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()))
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));
DROP POLICY IF EXISTS "delete_own_laundry_dispatches" ON laundry_dispatches;
CREATE POLICY "delete_own_laundry_dispatches" ON laundry_dispatches FOR DELETE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

-- ── laundry_dispatch_items ──
DROP POLICY IF EXISTS "select_own_laundry_dispatch_items" ON laundry_dispatch_items;
CREATE POLICY "select_own_laundry_dispatch_items" ON laundry_dispatch_items FOR SELECT
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));
DROP POLICY IF EXISTS "insert_own_laundry_dispatch_items" ON laundry_dispatch_items;
CREATE POLICY "insert_own_laundry_dispatch_items" ON laundry_dispatch_items FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));
DROP POLICY IF EXISTS "update_own_laundry_dispatch_items" ON laundry_dispatch_items;
CREATE POLICY "update_own_laundry_dispatch_items" ON laundry_dispatch_items FOR UPDATE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()))
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));
DROP POLICY IF EXISTS "delete_own_laundry_dispatch_items" ON laundry_dispatch_items;
CREATE POLICY "delete_own_laundry_dispatch_items" ON laundry_dispatch_items FOR DELETE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

-- ── laundry_receipts ──
DROP POLICY IF EXISTS "select_own_laundry_receipts" ON laundry_receipts;
CREATE POLICY "select_own_laundry_receipts" ON laundry_receipts FOR SELECT
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));
DROP POLICY IF EXISTS "insert_own_laundry_receipts" ON laundry_receipts;
CREATE POLICY "insert_own_laundry_receipts" ON laundry_receipts FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));
DROP POLICY IF EXISTS "update_own_laundry_receipts" ON laundry_receipts;
CREATE POLICY "update_own_laundry_receipts" ON laundry_receipts FOR UPDATE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()))
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));
DROP POLICY IF EXISTS "delete_own_laundry_receipts" ON laundry_receipts;
CREATE POLICY "delete_own_laundry_receipts" ON laundry_receipts FOR DELETE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));
