-- =========================================================================
-- Migration: Laundry & Linen Production System
-- Date: 2026-10-08
-- =========================================================================
-- Creates 7 new tables:
--   1. linen_stock_movements   – Auditable stock ledger
--   2. laundry_vendor_rates    – Per-vendor, per-item rate configuration
--   3. laundry_receiving_items – Normalized receiving line items
--   4. laundry_bills           – Bill records (separate from dispatch)
--   5. laundry_bill_items      – Bill line items
--   6. laundry_vendor_payments – Independent payment records
--   7. laundry_statement_log   – WhatsApp/PDF delivery log
--
-- Modifies existing tables:
--   - laundry_dispatch_items: adds total_received, total_damaged, total_lost
--   - linen_items: adds total_stock for quick reference
--
-- All tables: hotel_id scoped, RLS with auth_hotel_id() + is_super_admin()
-- =========================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. LINEN STOCK MOVEMENTS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS linen_stock_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        uuid NOT NULL,
  linen_item_id   uuid NOT NULL,
  movement_date   date NOT NULL DEFAULT CURRENT_DATE,
  movement_type   text NOT NULL CHECK (movement_type IN (
    'opening', 'addition', 'adjustment_add', 'adjustment_sub',
    'discard', 'lost_at_laundry', 'damaged_at_laundry', 'correction'
  )),
  quantity        numeric NOT NULL CHECK (quantity >= 0),
  before_qty      numeric NOT NULL DEFAULT 0,
  after_qty       numeric NOT NULL DEFAULT 0,
  reason          text DEFAULT '',
  reference_id    uuid,
  reference_type  text DEFAULT '',
  created_by      text DEFAULT '',
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE linen_stock_movements ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_stock_movements_hotel
  ON linen_stock_movements(hotel_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item
  ON linen_stock_movements(hotel_id, linen_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date
  ON linen_stock_movements(hotel_id, movement_date);

DROP POLICY IF EXISTS "select_own_stock_movements" ON linen_stock_movements;
CREATE POLICY "select_own_stock_movements" ON linen_stock_movements FOR SELECT
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "insert_own_stock_movements" ON linen_stock_movements;
CREATE POLICY "insert_own_stock_movements" ON linen_stock_movements FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "update_own_stock_movements" ON linen_stock_movements;
CREATE POLICY "update_own_stock_movements" ON linen_stock_movements FOR UPDATE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()))
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "delete_own_stock_movements" ON linen_stock_movements;
CREATE POLICY "delete_own_stock_movements" ON linen_stock_movements FOR DELETE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. LAUNDRY VENDOR RATES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS laundry_vendor_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        uuid NOT NULL,
  vendor_id       uuid NOT NULL,
  linen_item_id   uuid NOT NULL,
  rate_per_piece  numeric NOT NULL DEFAULT 0 CHECK (rate_per_piece >= 0),
  effective_from  date NOT NULL DEFAULT CURRENT_DATE,
  effective_to    date,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE laundry_vendor_rates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_vendor_rates_hotel
  ON laundry_vendor_rates(hotel_id);
CREATE INDEX IF NOT EXISTS idx_vendor_rates_vendor
  ON laundry_vendor_rates(hotel_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_rates_lookup
  ON laundry_vendor_rates(hotel_id, vendor_id, linen_item_id, effective_from);

DROP POLICY IF EXISTS "select_own_vendor_rates" ON laundry_vendor_rates;
CREATE POLICY "select_own_vendor_rates" ON laundry_vendor_rates FOR SELECT
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "insert_own_vendor_rates" ON laundry_vendor_rates;
CREATE POLICY "insert_own_vendor_rates" ON laundry_vendor_rates FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "update_own_vendor_rates" ON laundry_vendor_rates;
CREATE POLICY "update_own_vendor_rates" ON laundry_vendor_rates FOR UPDATE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()))
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "delete_own_vendor_rates" ON laundry_vendor_rates;
CREATE POLICY "delete_own_vendor_rates" ON laundry_vendor_rates FOR DELETE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. LAUNDRY RECEIVING ITEMS (Normalized per-item receiving records)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS laundry_receiving_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        uuid NOT NULL,
  receipt_id      uuid NOT NULL,
  dispatch_id     uuid NOT NULL,
  dispatch_item_id uuid,
  linen_item_id   uuid,
  item_name       text NOT NULL,
  received_qty    numeric NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
  damaged_qty     numeric NOT NULL DEFAULT 0 CHECK (damaged_qty >= 0),
  lost_qty        numeric NOT NULL DEFAULT 0 CHECK (lost_qty >= 0),
  is_billable     boolean DEFAULT true,
  rate_applied    numeric NOT NULL DEFAULT 0 CHECK (rate_applied >= 0),
  bill_amount     numeric NOT NULL DEFAULT 0 CHECK (bill_amount >= 0),
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE laundry_receiving_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_receiving_items_hotel
  ON laundry_receiving_items(hotel_id);
CREATE INDEX IF NOT EXISTS idx_receiving_items_receipt
  ON laundry_receiving_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receiving_items_dispatch
  ON laundry_receiving_items(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_receiving_items_dispatch_item
  ON laundry_receiving_items(dispatch_item_id);
CREATE INDEX IF NOT EXISTS idx_receiving_items_date
  ON laundry_receiving_items(hotel_id, created_at);

DROP POLICY IF EXISTS "select_own_receiving_items" ON laundry_receiving_items;
CREATE POLICY "select_own_receiving_items" ON laundry_receiving_items FOR SELECT
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "insert_own_receiving_items" ON laundry_receiving_items;
CREATE POLICY "insert_own_receiving_items" ON laundry_receiving_items FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "update_own_receiving_items" ON laundry_receiving_items;
CREATE POLICY "update_own_receiving_items" ON laundry_receiving_items FOR UPDATE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()))
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "delete_own_receiving_items" ON laundry_receiving_items;
CREATE POLICY "delete_own_receiving_items" ON laundry_receiving_items FOR DELETE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. LAUNDRY BILLS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS laundry_bills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        uuid NOT NULL,
  bill_no         text DEFAULT '',
  bill_date       date NOT NULL,
  vendor_id       uuid,
  vendor_name     text DEFAULT '',
  total_qty       numeric NOT NULL DEFAULT 0 CHECK (total_qty >= 0),
  total_amount    numeric NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status          text DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'paid', 'cancelled')),
  approved_by     text DEFAULT '',
  approved_at     timestamptz,
  expense_entry_id uuid,
  notes           text DEFAULT '',
  created_by      text DEFAULT '',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE laundry_bills ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_laundry_bills_hotel
  ON laundry_bills(hotel_id);
CREATE INDEX IF NOT EXISTS idx_laundry_bills_date
  ON laundry_bills(hotel_id, bill_date);
CREATE INDEX IF NOT EXISTS idx_laundry_bills_vendor
  ON laundry_bills(hotel_id, vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_laundry_bills_expense_ref
  ON laundry_bills(expense_entry_id) WHERE expense_entry_id IS NOT NULL;

DROP POLICY IF EXISTS "select_own_laundry_bills" ON laundry_bills;
CREATE POLICY "select_own_laundry_bills" ON laundry_bills FOR SELECT
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "insert_own_laundry_bills" ON laundry_bills;
CREATE POLICY "insert_own_laundry_bills" ON laundry_bills FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "update_own_laundry_bills" ON laundry_bills;
CREATE POLICY "update_own_laundry_bills" ON laundry_bills FOR UPDATE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()))
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "delete_own_laundry_bills" ON laundry_bills;
CREATE POLICY "delete_own_laundry_bills" ON laundry_bills FOR DELETE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. LAUNDRY BILL ITEMS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS laundry_bill_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id          uuid NOT NULL,
  bill_id           uuid NOT NULL,
  linen_item_id     uuid,
  item_name         text NOT NULL,
  quantity          numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  rate              numeric NOT NULL DEFAULT 0 CHECK (rate >= 0),
  amount            numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  receipt_id        uuid,
  dispatch_id       uuid,
  receiving_item_id uuid,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE laundry_bill_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bill_items_hotel
  ON laundry_bill_items(hotel_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill
  ON laundry_bill_items(bill_id);

DROP POLICY IF EXISTS "select_own_bill_items" ON laundry_bill_items;
CREATE POLICY "select_own_bill_items" ON laundry_bill_items FOR SELECT
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "insert_own_bill_items" ON laundry_bill_items;
CREATE POLICY "insert_own_bill_items" ON laundry_bill_items FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "update_own_bill_items" ON laundry_bill_items;
CREATE POLICY "update_own_bill_items" ON laundry_bill_items FOR UPDATE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()))
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "delete_own_bill_items" ON laundry_bill_items;
CREATE POLICY "delete_own_bill_items" ON laundry_bill_items FOR DELETE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. LAUNDRY VENDOR PAYMENTS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS laundry_vendor_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        uuid NOT NULL,
  vendor_id       uuid NOT NULL,
  payment_date    date NOT NULL,
  amount          numeric NOT NULL CHECK (amount > 0),
  payment_mode    text DEFAULT 'Cash'
    CHECK (payment_mode IN ('Cash', 'Bank', 'UPI', 'Credit')),
  reference_no    text DEFAULT '',
  notes           text DEFAULT '',
  created_by      text DEFAULT '',
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE laundry_vendor_payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_vendor_payments_hotel
  ON laundry_vendor_payments(hotel_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor
  ON laundry_vendor_payments(hotel_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_date
  ON laundry_vendor_payments(hotel_id, payment_date);

DROP POLICY IF EXISTS "select_own_vendor_payments" ON laundry_vendor_payments;
CREATE POLICY "select_own_vendor_payments" ON laundry_vendor_payments FOR SELECT
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "insert_own_vendor_payments" ON laundry_vendor_payments;
CREATE POLICY "insert_own_vendor_payments" ON laundry_vendor_payments FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "update_own_vendor_payments" ON laundry_vendor_payments;
CREATE POLICY "update_own_vendor_payments" ON laundry_vendor_payments FOR UPDATE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()))
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "delete_own_vendor_payments" ON laundry_vendor_payments;
CREATE POLICY "delete_own_vendor_payments" ON laundry_vendor_payments FOR DELETE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. LAUNDRY STATEMENT LOG
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS laundry_statement_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        uuid NOT NULL,
  vendor_id       uuid,
  statement_date  date NOT NULL,
  delivery_type   text DEFAULT 'whatsapp'
    CHECK (delivery_type IN ('whatsapp', 'pdf', 'manual')),
  recipient       text DEFAULT '',
  status          text DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'downloaded')),
  statement_data  jsonb DEFAULT '{}'::jsonb,
  error_message   text DEFAULT '',
  sent_by         text DEFAULT '',
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE laundry_statement_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_statement_log_hotel
  ON laundry_statement_log(hotel_id);
CREATE INDEX IF NOT EXISTS idx_statement_log_date
  ON laundry_statement_log(hotel_id, statement_date);

DROP POLICY IF EXISTS "select_own_statement_log" ON laundry_statement_log;
CREATE POLICY "select_own_statement_log" ON laundry_statement_log FOR SELECT
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "insert_own_statement_log" ON laundry_statement_log;
CREATE POLICY "insert_own_statement_log" ON laundry_statement_log FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "update_own_statement_log" ON laundry_statement_log;
CREATE POLICY "update_own_statement_log" ON laundry_statement_log FOR UPDATE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()))
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "delete_own_statement_log" ON laundry_statement_log;
CREATE POLICY "delete_own_statement_log" ON laundry_statement_log FOR DELETE
  TO authenticated USING (is_super_admin() OR (hotel_id = auth_hotel_id()));


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. ALTER EXISTING TABLES — Add tracking columns
-- ═══════════════════════════════════════════════════════════════════════════

-- Add total_stock to linen_items for quick stock reference
ALTER TABLE linen_items
  ADD COLUMN IF NOT EXISTS total_stock numeric DEFAULT 0;

-- Add per-item tracking to dispatch items for fast aggregation
ALTER TABLE laundry_dispatch_items
  ADD COLUMN IF NOT EXISTS total_received numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_damaged  numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_lost     numeric DEFAULT 0;

-- Add reference columns to expense_entries for laundry bill idempotency
ALTER TABLE expense_entries
  ADD COLUMN IF NOT EXISTS reference_type text DEFAULT '',
  ADD COLUMN IF NOT EXISTS reference_id   uuid;

CREATE INDEX IF NOT EXISTS idx_expense_entries_reference
  ON expense_entries(reference_type, reference_id)
  WHERE reference_type != '' AND reference_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════
