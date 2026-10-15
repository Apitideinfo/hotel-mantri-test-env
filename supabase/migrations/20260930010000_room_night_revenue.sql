-- ============================================================================
-- Migration: 20260930010000_room_night_revenue.sql
-- Description: Authoritative Night-by-Night Room Revenue Table for Hotel Mantri PMS
-- Core Accounting Rule: Room revenue is recognized by occupied room-night / business date.
-- ============================================================================

CREATE TABLE IF NOT EXISTS room_night_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid REFERENCES reservations(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL REFERENCES hotel_settings(id) ON DELETE CASCADE,
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  room_category_id uuid,
  room_no text NOT NULL DEFAULT '',
  business_date date NOT NULL,
  rate_plan_id uuid,
  meal_plan_id uuid,
  night_rate numeric(12,2) NOT NULL DEFAULT 0 CHECK (night_rate >= 0),
  tax_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  gross_room_revenue numeric(12,2) NOT NULL DEFAULT 0 CHECK (gross_room_revenue >= 0),
  net_room_revenue numeric(12,2) NOT NULL DEFAULT 0 CHECK (net_room_revenue >= 0),
  currency text NOT NULL DEFAULT 'INR',
  source text NOT NULL DEFAULT 'Direct',
  source_category text NOT NULL DEFAULT 'Direct/Walking'
    CHECK (source_category IN ('OTA', 'Direct/Walking', 'Corporate/Agent', 'Phonebook')),
  is_complimentary boolean NOT NULL DEFAULT false,
  guest_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_room_night_revenue UNIQUE (hotel_id, reservation_id, business_date, room_no)
);

CREATE INDEX IF NOT EXISTS idx_room_night_rev_hotel_date ON room_night_revenue (hotel_id, business_date);
CREATE INDEX IF NOT EXISTS idx_room_night_rev_reservation ON room_night_revenue (reservation_id);
CREATE INDEX IF NOT EXISTS idx_room_night_rev_room ON room_night_revenue (hotel_id, room_no, business_date);

ALTER TABLE room_night_revenue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rnr_select" ON room_night_revenue;
CREATE POLICY "rnr_select" ON room_night_revenue FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "rnr_insert" ON room_night_revenue;
CREATE POLICY "rnr_insert" ON room_night_revenue FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "rnr_update" ON room_night_revenue;
CREATE POLICY "rnr_update" ON room_night_revenue FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "rnr_delete" ON room_night_revenue;
CREATE POLICY "rnr_delete" ON room_night_revenue FOR DELETE
  TO anon, authenticated USING (true);
