/*
# Laundry & Linen Module — Hotel Linen Tracking

1. Purpose
   Adds dedicated tables for tracking HOTEL LINEN sent to an outside laundry vendor
   and received back. This is NOT guest laundry — it tracks bedsheets, towels,
   pillow covers, etc. dispatched in bulk and received in partial or full lots.
   Completely separate from the finance `laundry_entries` table (untouched).

2. New Tables
   - `laundry_vendors`: Master list of laundry vendors (name, contact, mobile,
     address, GSTIN, default rate type, notes, active).
   - `linen_items`: Master list of linen items (name, category, unit Pieces/Kg,
     standard laundry rate, active).
   - `laundry_dispatches`: Header record for a dispatch (dispatch_date, vendor_id,
     challan_no, expected_return_date, remarks, sent_by, status, total_amount).
   - `laundry_dispatch_items`: Line items per dispatch (linen_item_id, item_name,
     sent_qty, rate_per_piece, amount).
   - `laundry_receipts`: Receipt records against a dispatch (receipt_date,
     dispatch_id, items_json with per-item received_qty + damaged_lost_qty,
     remarks, received_by).

3. Security
   - RLS enabled on all 5 tables, scoped to authenticated via hotel_id.
   - 4 policies per table (select/insert/update/delete), all using auth.uid() = hotel_id.
   - laundry_receipts uses hotel_id directly (denormalized for simple RLS).

4. Notes
   - All tables have hotel_id for tenant isolation.
   - Dispatch status: 'Sent' | 'Partially Received' | 'Completed' | 'Short/Lost'.
   - Pending = sent_qty - received_qty - damaged_lost_qty (never negative).
   - Receipts are append-only history (never overwritten).
   - No changes to existing finance laundry_entries table or any PMS logic.
*/

-- ── laundry_vendors ──
CREATE TABLE IF NOT EXISTS laundry_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  vendor_name text NOT NULL,
  contact_person text DEFAULT '',
  mobile_number text DEFAULT '',
  address text DEFAULT '',
  gstin text DEFAULT '',
  default_rate_type text DEFAULT 'Per Piece',
  notes text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE laundry_vendors ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_laundry_vendors_hotel ON laundry_vendors(hotel_id);

DROP POLICY IF EXISTS "select_own_laundry_vendors" ON laundry_vendors;
CREATE POLICY "select_own_laundry_vendors" ON laundry_vendors FOR SELECT
  TO authenticated USING (auth.uid() = hotel_id);
DROP POLICY IF EXISTS "insert_own_laundry_vendors" ON laundry_vendors;
CREATE POLICY "insert_own_laundry_vendors" ON laundry_vendors FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = hotel_id);
DROP POLICY IF EXISTS "update_own_laundry_vendors" ON laundry_vendors;
CREATE POLICY "update_own_laundry_vendors" ON laundry_vendors FOR UPDATE
  TO authenticated USING (auth.uid() = hotel_id) WITH CHECK (auth.uid() = hotel_id);
DROP POLICY IF EXISTS "delete_own_laundry_vendors" ON laundry_vendors;
CREATE POLICY "delete_own_laundry_vendors" ON laundry_vendors FOR DELETE
  TO authenticated USING (auth.uid() = hotel_id);

-- ── linen_items ──
CREATE TABLE IF NOT EXISTS linen_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  item_name text NOT NULL,
  category text DEFAULT '',
  unit text DEFAULT 'Pieces',
  standard_rate numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE linen_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_linen_items_hotel ON linen_items(hotel_id);

DROP POLICY IF EXISTS "select_own_linen_items" ON linen_items;
CREATE POLICY "select_own_linen_items" ON linen_items FOR SELECT
  TO authenticated USING (auth.uid() = hotel_id);
DROP POLICY IF EXISTS "insert_own_linen_items" ON linen_items;
CREATE POLICY "insert_own_linen_items" ON linen_items FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = hotel_id);
DROP POLICY IF EXISTS "update_own_linen_items" ON linen_items;
CREATE POLICY "update_own_linen_items" ON linen_items FOR UPDATE
  TO authenticated USING (auth.uid() = hotel_id) WITH CHECK (auth.uid() = hotel_id);
DROP POLICY IF EXISTS "delete_own_linen_items" ON linen_items;
CREATE POLICY "delete_own_linen_items" ON linen_items FOR DELETE
  TO authenticated USING (auth.uid() = hotel_id);

-- ── laundry_dispatches ──
CREATE TABLE IF NOT EXISTS laundry_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  dispatch_no text DEFAULT '',
  dispatch_date date NOT NULL,
  vendor_id uuid,
  vendor_name text DEFAULT '',
  challan_no text DEFAULT '',
  expected_return_date date,
  remarks text DEFAULT '',
  sent_by text DEFAULT '',
  status text DEFAULT 'Sent',
  total_amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE laundry_dispatches ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_laundry_dispatches_hotel_date ON laundry_dispatches(hotel_id, dispatch_date);
CREATE INDEX IF NOT EXISTS idx_laundry_dispatches_vendor ON laundry_dispatches(hotel_id, vendor_id);

DROP POLICY IF EXISTS "select_own_laundry_dispatches" ON laundry_dispatches;
CREATE POLICY "select_own_laundry_dispatches" ON laundry_dispatches FOR SELECT
  TO authenticated USING (auth.uid() = hotel_id);
DROP POLICY IF EXISTS "insert_own_laundry_dispatches" ON laundry_dispatches;
CREATE POLICY "insert_own_laundry_dispatches" ON laundry_dispatches FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = hotel_id);
DROP POLICY IF EXISTS "update_own_laundry_dispatches" ON laundry_dispatches;
CREATE POLICY "update_own_laundry_dispatches" ON laundry_dispatches FOR UPDATE
  TO authenticated USING (auth.uid() = hotel_id) WITH CHECK (auth.uid() = hotel_id);
DROP POLICY IF EXISTS "delete_own_laundry_dispatches" ON laundry_dispatches;
CREATE POLICY "delete_own_laundry_dispatches" ON laundry_dispatches FOR DELETE
  TO authenticated USING (auth.uid() = hotel_id);

-- ── laundry_dispatch_items ──
CREATE TABLE IF NOT EXISTS laundry_dispatch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  dispatch_id uuid NOT NULL,
  linen_item_id uuid,
  item_name text NOT NULL,
  sent_qty numeric NOT NULL DEFAULT 0,
  rate_per_piece numeric DEFAULT 0,
  amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE laundry_dispatch_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_laundry_dispatch_items_dispatch ON laundry_dispatch_items(dispatch_id);

DROP POLICY IF EXISTS "select_own_laundry_dispatch_items" ON laundry_dispatch_items;
CREATE POLICY "select_own_laundry_dispatch_items" ON laundry_dispatch_items FOR SELECT
  TO authenticated USING (auth.uid() = hotel_id);
DROP POLICY IF EXISTS "insert_own_laundry_dispatch_items" ON laundry_dispatch_items;
CREATE POLICY "insert_own_laundry_dispatch_items" ON laundry_dispatch_items FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = hotel_id);
DROP POLICY IF EXISTS "update_own_laundry_dispatch_items" ON laundry_dispatch_items;
CREATE POLICY "update_own_laundry_dispatch_items" ON laundry_dispatch_items FOR UPDATE
  TO authenticated USING (auth.uid() = hotel_id) WITH CHECK (auth.uid() = hotel_id);
DROP POLICY IF EXISTS "delete_own_laundry_dispatch_items" ON laundry_dispatch_items;
CREATE POLICY "delete_own_laundry_dispatch_items" ON laundry_dispatch_items FOR DELETE
  TO authenticated USING (auth.uid() = hotel_id);

-- ── laundry_receipts ──
CREATE TABLE IF NOT EXISTS laundry_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  dispatch_id uuid NOT NULL,
  receipt_date date NOT NULL,
  items_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  remarks text DEFAULT '',
  received_by text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE laundry_receipts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_laundry_receipts_dispatch ON laundry_receipts(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_laundry_receipts_hotel_date ON laundry_receipts(hotel_id, receipt_date);

DROP POLICY IF EXISTS "select_own_laundry_receipts" ON laundry_receipts;
CREATE POLICY "select_own_laundry_receipts" ON laundry_receipts FOR SELECT
  TO authenticated USING (auth.uid() = hotel_id);
DROP POLICY IF EXISTS "insert_own_laundry_receipts" ON laundry_receipts;
CREATE POLICY "insert_own_laundry_receipts" ON laundry_receipts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = hotel_id);
DROP POLICY IF EXISTS "update_own_laundry_receipts" ON laundry_receipts;
CREATE POLICY "update_own_laundry_receipts" ON laundry_receipts FOR UPDATE
  TO authenticated USING (auth.uid() = hotel_id) WITH CHECK (auth.uid() = hotel_id);
DROP POLICY IF EXISTS "delete_own_laundry_receipts" ON laundry_receipts;
CREATE POLICY "delete_own_laundry_receipts" ON laundry_receipts FOR DELETE
  TO authenticated USING (auth.uid() = hotel_id);
