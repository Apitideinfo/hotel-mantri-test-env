/*
# Restaurant POS — Order & KOT Foundation

1. Overview
   Creates the minimum data foundation for POS order entry and KOT (Kitchen
   Order Ticket) generation. Four new tables: pos_orders, pos_kots,
   pos_order_items, pos_kot_items. Every row is scoped by hotel_id and
   protected with the project's existing tenant-isolation RLS pattern
   (authenticated hotel admins/staff only, via hotel_admins join).

2. New Tables

   - pos_orders
     - id uuid PK
     - hotel_id uuid NOT NULL (FK hotels.id ON DELETE CASCADE)
     - order_number text NOT NULL (human-readable, e.g. ORD-0001)
     - order_type text NOT NULL ('dine_in' | 'room_service' | 'takeaway')
     - status text NOT NULL DEFAULT 'draft'
       ('draft' | 'open' | 'kot_sent' | 'completed' | 'cancelled')
     - table_id uuid NULL (FK pos_tables.id ON DELETE SET NULL) — dine-in only
     - room_chart_entry_id uuid NULL (FK room_chart_entries.id ON DELETE SET NULL) — room service only
     - room_no text NULL — denormalized room number for room service
     - guest_name text NULL — room service / takeaway
     - guest_phone text NULL — takeaway
     - guest_count int NULL — dine-in
     - waiter_name text NULL — dine-in optional
     - subtotal numeric(12,2) NOT NULL DEFAULT 0
     - discount_amount numeric(12,2) NOT NULL DEFAULT 0
     - discount_type text NULL ('flat' | 'percent')
     - discount_value numeric(12,2) NULL
     - gst_amount numeric(12,2) NOT NULL DEFAULT 0
     - grand_total numeric(12,2) NOT NULL DEFAULT 0
     - notes text NULL
     - created_at / updated_at timestamptz

   - pos_kots
     - id uuid PK
     - hotel_id uuid NOT NULL (FK hotels.id ON DELETE CASCADE)
     - kot_number text NOT NULL (e.g. KOT-0001)
     - order_id uuid NOT NULL (FK pos_orders.id ON DELETE CASCADE)
     - kot_status text NOT NULL DEFAULT 'sent' ('sent' | 'cancelled')
     - created_at timestamptz

   - pos_order_items
     - id uuid PK
     - hotel_id uuid NOT NULL (FK hotels.id ON DELETE CASCADE)
     - order_id uuid NOT NULL (FK pos_orders.id ON DELETE CASCADE)
     - menu_item_id uuid NULL (FK pos_menu_items.id ON DELETE SET NULL)
     - name text NOT NULL — snapshot of item name at order time
     - is_veg boolean NOT NULL DEFAULT true — snapshot
     - rate numeric(12,2) NOT NULL DEFAULT 0 — snapshot of selling price
     - gst_percent numeric(5,2) NOT NULL DEFAULT 0 — snapshot
     - quantity int NOT NULL DEFAULT 1
     - line_total numeric(12,2) NOT NULL DEFAULT 0 (rate × qty)
     - note text NULL — per-item note (e.g. "No Onion", "Less Spicy")
     - kot_id uuid NULL (FK pos_kots.id ON DELETE SET NULL) — which KOT sent this item
     - created_at timestamptz

   - pos_kot_items
     - id uuid PK
     - hotel_id uuid NOT NULL (FK hotels.id ON DELETE CASCADE)
     - kot_id uuid NOT NULL (FK pos_kots.id ON DELETE CASCADE)
     - order_item_id uuid NULL (FK pos_order_items.id ON DELETE SET NULL)
     - name text NOT NULL — snapshot
     - quantity int NOT NULL
     - note text NULL
     - is_veg boolean NOT NULL DEFAULT true
     - created_at timestamptz

3. Security
   - RLS enabled on all four new tables.
   - 4 CRUD policies each (select/insert/update/delete), scoped TO authenticated,
     ownership verified via EXISTS join on hotel_admins.
   - No anon access.

4. Indexes
   - pos_orders(hotel_id, status, created_at)
   - pos_orders(hotel_id, table_id) — for finding running orders by table
   - pos_order_items(hotel_id, order_id)
   - pos_kots(hotel_id, order_id, created_at)
   - pos_kot_items(hotel_id, kot_id)

5. Important Notes
   - This phase creates ONLY order entry + KOT data foundation.
   - No final billing, payment, or PMS Finance posting.
   - Item name/rate/gst_percent are snapshotted on pos_order_items for
     historical billing accuracy — menu master data is NOT duplicated.
   - An order can have multiple KOTs over time (re-orders during a meal).
   - pos_orders.table_id links to pos_tables for dine-in; when KOT is sent,
     the table's current_status is set to 'occupied' by the frontend.
   - pos_orders.room_chart_entry_id links to room_chart_entries for room
     service, reading from existing PMS in-house data. No duplicate guest
     or room records are created.
   - No existing tables are modified.
*/

-- ── 1. pos_orders ──
CREATE TABLE IF NOT EXISTS pos_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  order_type text NOT NULL CHECK (order_type IN ('dine_in', 'room_service', 'takeaway')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'kot_sent', 'completed', 'cancelled')),
  table_id uuid REFERENCES pos_tables(id) ON DELETE SET NULL,
  room_chart_entry_id uuid REFERENCES room_chart_entries(id) ON DELETE SET NULL,
  room_no text,
  guest_name text,
  guest_phone text,
  guest_count int,
  waiter_name text,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  discount_type text,
  discount_value numeric(12,2),
  gst_amount numeric(12,2) NOT NULL DEFAULT 0,
  grand_total numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pos_orders_hotel_status_created
  ON pos_orders (hotel_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_pos_orders_hotel_table
  ON pos_orders (hotel_id, table_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_orders_hotel_order_number
  ON pos_orders (hotel_id, order_number);

DROP POLICY IF EXISTS "pos_order_select_own" ON pos_orders;
CREATE POLICY "pos_order_select_own" ON pos_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_orders.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_order_insert_own" ON pos_orders;
CREATE POLICY "pos_order_insert_own" ON pos_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_orders.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_order_update_own" ON pos_orders;
CREATE POLICY "pos_order_update_own" ON pos_orders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_orders.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_orders.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_order_delete_own" ON pos_orders;
CREATE POLICY "pos_order_delete_own" ON pos_orders
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_orders.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

-- ── 2. pos_kots (created before pos_order_items for FK) ──
CREATE TABLE IF NOT EXISTS pos_kots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  kot_number text NOT NULL,
  order_id uuid NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  kot_status text NOT NULL DEFAULT 'sent' CHECK (kot_status IN ('sent', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_kots ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pos_kots_hotel_order
  ON pos_kots (hotel_id, order_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_kots_hotel_kot_number
  ON pos_kots (hotel_id, kot_number);

DROP POLICY IF EXISTS "pos_kot_select_own" ON pos_kots;
CREATE POLICY "pos_kot_select_own" ON pos_kots
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_kots.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_kot_insert_own" ON pos_kots;
CREATE POLICY "pos_kot_insert_own" ON pos_kots
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_kots.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_kot_update_own" ON pos_kots;
CREATE POLICY "pos_kot_update_own" ON pos_kots
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_kots.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_kots.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_kot_delete_own" ON pos_kots;
CREATE POLICY "pos_kot_delete_own" ON pos_kots
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_kots.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

-- ── 3. pos_order_items ──
CREATE TABLE IF NOT EXISTS pos_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES pos_menu_items(id) ON DELETE SET NULL,
  name text NOT NULL,
  is_veg boolean NOT NULL DEFAULT true,
  rate numeric(12,2) NOT NULL DEFAULT 0,
  gst_percent numeric(5,2) NOT NULL DEFAULT 0,
  quantity int NOT NULL DEFAULT 1,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  note text,
  kot_id uuid REFERENCES pos_kots(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_order_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pos_order_items_hotel_order
  ON pos_order_items (hotel_id, order_id);

DROP POLICY IF EXISTS "pos_oi_select_own" ON pos_order_items;
CREATE POLICY "pos_oi_select_own" ON pos_order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_order_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_oi_insert_own" ON pos_order_items;
CREATE POLICY "pos_oi_insert_own" ON pos_order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_order_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_oi_update_own" ON pos_order_items;
CREATE POLICY "pos_oi_update_own" ON pos_order_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_order_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_order_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_oi_delete_own" ON pos_order_items;
CREATE POLICY "pos_oi_delete_own" ON pos_order_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_order_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

-- ── 4. pos_kot_items ──
CREATE TABLE IF NOT EXISTS pos_kot_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  kot_id uuid NOT NULL REFERENCES pos_kots(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES pos_order_items(id) ON DELETE SET NULL,
  name text NOT NULL,
  quantity int NOT NULL,
  note text,
  is_veg boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_kot_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pos_kot_items_hotel_kot
  ON pos_kot_items (hotel_id, kot_id);

DROP POLICY IF EXISTS "pos_ki_select_own" ON pos_kot_items;
CREATE POLICY "pos_ki_select_own" ON pos_kot_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_kot_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_ki_insert_own" ON pos_kot_items;
CREATE POLICY "pos_ki_insert_own" ON pos_kot_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_kot_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_ki_update_own" ON pos_kot_items;
CREATE POLICY "pos_ki_update_own" ON pos_kot_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_kot_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_kot_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_ki_delete_own" ON pos_kot_items;
CREATE POLICY "pos_ki_delete_own" ON pos_kot_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_kot_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

-- ── 5. updated_at trigger for pos_orders ──
DROP TRIGGER IF EXISTS trg_pos_order_updated_at ON pos_orders;
CREATE TRIGGER trg_pos_order_updated_at BEFORE UPDATE ON pos_orders
  FOR EACH ROW EXECUTE FUNCTION pos_set_updated_at();
