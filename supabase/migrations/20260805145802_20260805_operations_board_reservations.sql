/*
# Operations Board – Reservations Table

## Purpose
Adds a `reservations` table to support the Operations Board timeline view.
This table stores FUTURE reservations that block room inventory without affecting
revenue, GST, cash, or any existing reporting.

## What this migration does

### 1. New table: `reservations`
Stores future room reservations created from the Operations Board.
- `id` – primary key UUID
- `hotel_id` – links to the hotel (matches hotel_id used throughout the system)
- `room_id` – links to `rooms.id` (Property Master)
- `room_no` – denormalised room number for fast lookups
- `guest_name` – guest full name
- `guest_phone` – guest contact number
- `guest_email` – optional guest email
- `check_in_date` – arrival date (YYYY-MM-DD)
- `check_out_date` – departure date (YYYY-MM-DD)
- `nights` – computed from check_in/check_out
- `rate` – agreed room rate (stored; not posted to revenue until check-in)
- `source_category` – OTA / Direct / Corporate etc.
- `source_name` – specific source / company name
- `payment_mode` – Cash / Bank / UPI etc.
- `advance_paid` – advance amount collected at booking
- `remarks` – internal notes
- `status` – reservation lifecycle: 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show'
- `room_chart_entry_id` – nullable FK: set when the reservation is converted to an actual room_chart_entry (check-in)
- `created_at`, `updated_at` timestamps

### 2. Security
- RLS enabled. Policies use `TO anon, authenticated` (app uses hotel_id scoping, no per-user auth on these records).

### 3. Important notes
- Future reservations ONLY block inventory on the Operations Board.
- They do NOT affect daily_reports, mtd_ytd_store, cash_flow_store, or any financial aggregate.
- When a reservation is checked in via the Operations Board it should be converted to a `room_chart_entry` and the `room_chart_entry_id` set.
- The `rooms` table (Property Master) is the source of truth for room inventory.
*/

CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  room_no text NOT NULL,
  guest_name text NOT NULL,
  guest_phone text NOT NULL DEFAULT '',
  guest_email text NOT NULL DEFAULT '',
  check_in_date date NOT NULL,
  check_out_date date NOT NULL,
  nights integer GENERATED ALWAYS AS (
    (check_out_date - check_in_date)
  ) STORED,
  rate numeric(12,2) NOT NULL DEFAULT 0,
  source_category text NOT NULL DEFAULT 'Direct/Walking',
  source_name text NOT NULL DEFAULT '',
  payment_mode text NOT NULL DEFAULT 'Cash',
  advance_paid numeric(12,2) NOT NULL DEFAULT 0,
  remarks text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
  room_chart_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reservations_hotel_id_idx ON reservations(hotel_id);
CREATE INDEX IF NOT EXISTS reservations_dates_idx ON reservations(hotel_id, check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS reservations_room_no_idx ON reservations(hotel_id, room_no);
CREATE INDEX IF NOT EXISTS reservations_status_idx ON reservations(hotel_id, status);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "res_select" ON reservations;
CREATE POLICY "res_select" ON reservations FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "res_insert" ON reservations;
CREATE POLICY "res_insert" ON reservations FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "res_update" ON reservations;
CREATE POLICY "res_update" ON reservations FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "res_delete" ON reservations;
CREATE POLICY "res_delete" ON reservations FOR DELETE
TO anon, authenticated USING (true);
