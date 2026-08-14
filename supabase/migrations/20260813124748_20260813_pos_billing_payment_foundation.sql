/*
# Restaurant POS — Billing & Payment Foundation

1. Overview
   Creates pos_bills and pos_payments tables for POS billing and payment
   collection. Reuses existing pos_orders, pos_order_items, pos_kots tables.
   Post to Room reuses the existing folio_charges PMS path.

2. New Tables

   - pos_bills
     - id uuid PK
     - hotel_id uuid NOT NULL (FK hotels.id ON DELETE CASCADE)
     - bill_number text NOT NULL (property-unique, e.g. POS-2026-000123)
     - order_id uuid NOT NULL (FK pos_orders.id ON DELETE CASCADE)
     - status text NOT NULL DEFAULT 'open'
       ('open' | 'billed' | 'paid' | 'posted_to_room' | 'void')
     - subtotal numeric(12,2) NOT NULL DEFAULT 0
     - discount_amount numeric(12,2) NOT NULL DEFAULT 0
     - discount_type text NULL ('flat' | 'percent')
     - discount_value numeric(12,2) NULL
     - discount_reason text NULL
     - gst_amount numeric(12,2) NOT NULL DEFAULT 0
     - grand_total numeric(12,2) NOT NULL DEFAULT 0
     - void_reason text NULL
     - voided_by text NULL
     - voided_at timestamptz NULL
     - created_at / updated_at timestamptz

   - pos_payments
     - id uuid PK
     - hotel_id uuid NOT NULL (FK hotels.id ON DELETE CASCADE)
     - bill_id uuid NOT NULL (FK pos_bills.id ON DELETE CASCADE)
     - order_id uuid NOT NULL (FK pos_orders.id ON DELETE CASCADE)
     - payment_mode text NOT NULL ('cash' | 'upi' | 'card' | 'bank' | 'post_to_room')
     - amount numeric(12,2) NOT NULL DEFAULT 0
     - reference_no text NULL (UPI ref, card last4, bank txn id)
     - room_chart_entry_id uuid NULL (FK room_chart_entries.id ON DELETE SET NULL) — for post_to_room
     - folio_charge_id uuid NULL (FK folio_charges.id ON DELETE SET NULL) — link to PMS folio
     - created_at timestamptz

3. Security
   - RLS enabled on both tables.
   - 4 CRUD policies each, scoped TO authenticated via hotel_admins EXISTS join.
   - No anon access.

4. Indexes
   - pos_bills(hotel_id, status, created_at)
   - pos_bills(hotel_id, order_id)
   - pos_bills(hotel_id, bill_number) UNIQUE
   - pos_payments(hotel_id, bill_id)
   - pos_payments(hotel_id, order_id)

5. Important Notes
   - Post to Room creates a folio_charges row (charge_type='Room Service',
     description includes POS bill number) and links via pos_payments.folio_charge_id.
   - No duplicate PMS revenue/payment transactions — folio_charges is the
     single PMS charge path, reused as-is.
   - Bill numbers are property-unique via a unique index. The API generates
     them server-side using a read-then-increment pattern guarded by the
     unique index (concurrent inserts that collide will error and retry).
   - No existing tables are modified.
*/

-- ── 1. pos_bills ──
CREATE TABLE IF NOT EXISTS pos_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  bill_number text NOT NULL,
  order_id uuid NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'billed', 'paid', 'posted_to_room', 'void')),
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  discount_type text,
  discount_value numeric(12,2),
  discount_reason text,
  gst_amount numeric(12,2) NOT NULL DEFAULT 0,
  grand_total numeric(12,2) NOT NULL DEFAULT 0,
  void_reason text,
  voided_by text,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_bills ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pos_bills_hotel_status_created
  ON pos_bills (hotel_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_pos_bills_hotel_order
  ON pos_bills (hotel_id, order_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_bills_hotel_bill_number
  ON pos_bills (hotel_id, bill_number);

DROP POLICY IF EXISTS "pos_bill_select_own" ON pos_bills;
CREATE POLICY "pos_bill_select_own" ON pos_bills
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_bills.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_bill_insert_own" ON pos_bills;
CREATE POLICY "pos_bill_insert_own" ON pos_bills
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_bills.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_bill_update_own" ON pos_bills;
CREATE POLICY "pos_bill_update_own" ON pos_bills
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_bills.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_bills.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_bill_delete_own" ON pos_bills;
CREATE POLICY "pos_bill_delete_own" ON pos_bills
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_bills.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

-- ── 2. pos_payments ──
CREATE TABLE IF NOT EXISTS pos_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  bill_id uuid NOT NULL REFERENCES pos_bills(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  payment_mode text NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'card', 'bank', 'post_to_room')),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  reference_no text,
  room_chart_entry_id uuid REFERENCES room_chart_entries(id) ON DELETE SET NULL,
  folio_charge_id uuid REFERENCES folio_charges(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pos_payments_hotel_bill
  ON pos_payments (hotel_id, bill_id);

CREATE INDEX IF NOT EXISTS idx_pos_payments_hotel_order
  ON pos_payments (hotel_id, order_id);

DROP POLICY IF EXISTS "pos_pay_select_own" ON pos_payments;
CREATE POLICY "pos_pay_select_own" ON pos_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_payments.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_pay_insert_own" ON pos_payments;
CREATE POLICY "pos_pay_insert_own" ON pos_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_payments.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_pay_update_own" ON pos_payments;
CREATE POLICY "pos_pay_update_own" ON pos_payments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_payments.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_payments.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_pay_delete_own" ON pos_payments;
CREATE POLICY "pos_pay_delete_own" ON pos_payments
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_payments.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

-- ── 3. updated_at trigger for pos_bills ──
DROP TRIGGER IF EXISTS trg_pos_bill_updated_at ON pos_bills;
CREATE TRIGGER trg_pos_bill_updated_at BEFORE UPDATE ON pos_bills
  FOR EACH ROW EXECUTE FUNCTION pos_set_updated_at();
