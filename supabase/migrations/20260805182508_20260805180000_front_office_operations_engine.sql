/*
# Front Office Operations Engine — Schema

## Purpose
Adds housekeeping status, booking timeline, folio charges, and room shift tracking
to support the Phase 4 front office workflow. Does NOT alter existing tables'
columns — only adds new optional columns and new tables.

## 1. New columns on `rooms` table
- `housekeeping_status` text — Vacant Clean / Vacant Dirty / Occupied / Inspection /
  Out Of Order / Blocked (default 'Vacant Clean')
- `housekeeping_note` text — optional note from housekeeping staff
- `housekeeping_updated_at` timestamptz — last status change

## 2. New columns on `room_chart_entries` table (all optional / defaulted)
- `id_proof_type` text — Aadhaar / Passport / DL / Voter ID / Other (default '')
- `id_proof_number` text — ID document number (default '')
- `id_proof_verified` boolean — front desk verified the ID (default false)
- `arrival_time` text — actual arrival time HH:MM (default '')
- `checkout_time` text — actual checkout time HH:MM (default '')
- `checked_in_at` timestamptz — when check-in was processed
- `checked_out_at` timestamptz — when checkout was processed
- `reservation_id` uuid — links to reservations.id if checked in from a reservation

## 3. New table: `booking_timeline`
Records every event in a booking's lifecycle for audit and folio.
- `id` uuid PK
- `hotel_id` uuid
- `entry_id` uuid nullable FK to room_chart_entries.id
- `reservation_id` uuid nullable FK to reservations.id
- `event_type` text — booking_created / confirmation_sent / check_in / payment_received /
  room_shift / stay_extended / extra_charge / checkout / invoice_generated
- `event_description` text — human-readable description
- `event_amount` numeric — amount associated with event if any (default 0)
- `event_data` jsonb — additional structured data
- `performed_by` text — staff member name
- `created_at` timestamptz

## 4. New table: `folio_charges`
Extra charges added to a guest folio (laundry, minibar, extra bed, etc).
- `id` uuid PK
- `hotel_id` uuid
- `entry_id` uuid FK to room_chart_entries.id
- `charge_type` text — Laundry / Minibar / Extra Bed / Room Service / Other
- `description` text
- `amount` numeric
- `quantity` int default 1
- `created_at` timestamptz

## 5. New table: `room_shifts`
Tracks room shift history for audit.
- `id` uuid PK
- `hotel_id` uuid
- `entry_id` uuid FK to room_chart_entries.id
- `from_room` text
- `to_room` text
- `reason` text
- `shifted_by` text
- `created_at` timestamptz

## 6. Security
- RLS enabled on all new tables.
- Policies use `TO anon, authenticated` (app uses hotel_id scoping, no per-user auth on these records).
- All new columns on existing tables are nullable / defaulted.
*/

-- ── 1. rooms table: housekeeping columns ──
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS housekeeping_status text NOT NULL DEFAULT 'Vacant Clean'
    CHECK (housekeeping_status IN ('Vacant Clean', 'Vacant Dirty', 'Occupied', 'Inspection', 'Out Of Order', 'Blocked')),
  ADD COLUMN IF NOT EXISTS housekeeping_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS housekeeping_updated_at timestamptz;

-- ── 2. room_chart_entries table: front office columns ──
ALTER TABLE room_chart_entries
  ADD COLUMN IF NOT EXISTS id_proof_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS id_proof_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS id_proof_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS arrival_time text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS checkout_time text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS reservation_id uuid;

-- ── 3. booking_timeline table ──
CREATE TABLE IF NOT EXISTS booking_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  entry_id uuid REFERENCES room_chart_entries(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_description text NOT NULL DEFAULT '',
  event_amount numeric(12,2) NOT NULL DEFAULT 0,
  event_data jsonb,
  performed_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_timeline_hotel_idx ON booking_timeline(hotel_id);
CREATE INDEX IF NOT EXISTS booking_timeline_entry_idx ON booking_timeline(entry_id);
CREATE INDEX IF NOT EXISTS booking_timeline_reservation_idx ON booking_timeline(reservation_id);

ALTER TABLE booking_timeline ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bt_select" ON booking_timeline;
CREATE POLICY "bt_select" ON booking_timeline FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "bt_insert" ON booking_timeline;
CREATE POLICY "bt_insert" ON booking_timeline FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "bt_update" ON booking_timeline;
CREATE POLICY "bt_update" ON booking_timeline FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "bt_delete" ON booking_timeline;
CREATE POLICY "bt_delete" ON booking_timeline FOR DELETE
  TO anon, authenticated USING (true);

-- ── 4. folio_charges table ──
CREATE TABLE IF NOT EXISTS folio_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  entry_id uuid REFERENCES room_chart_entries(id) ON DELETE CASCADE,
  charge_type text NOT NULL DEFAULT 'Other',
  description text NOT NULL DEFAULT '',
  amount numeric(12,2) NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS folio_charges_hotel_idx ON folio_charges(hotel_id);
CREATE INDEX IF NOT EXISTS folio_charges_entry_idx ON folio_charges(entry_id);

ALTER TABLE folio_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fc_select" ON folio_charges;
CREATE POLICY "fc_select" ON folio_charges FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "fc_insert" ON folio_charges;
CREATE POLICY "fc_insert" ON folio_charges FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "fc_update" ON folio_charges;
CREATE POLICY "fc_update" ON folio_charges FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "fc_delete" ON folio_charges;
CREATE POLICY "fc_delete" ON folio_charges FOR DELETE
  TO anon, authenticated USING (true);

-- ── 5. room_shifts table ──
CREATE TABLE IF NOT EXISTS room_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  entry_id uuid REFERENCES room_chart_entries(id) ON DELETE CASCADE,
  from_room text NOT NULL,
  to_room text NOT NULL,
  reason text NOT NULL DEFAULT '',
  shifted_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_shifts_hotel_idx ON room_shifts(hotel_id);
CREATE INDEX IF NOT EXISTS room_shifts_entry_idx ON room_shifts(entry_id);

ALTER TABLE room_shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rs_select" ON room_shifts;
CREATE POLICY "rs_select" ON room_shifts FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "rs_insert" ON room_shifts;
CREATE POLICY "rs_insert" ON room_shifts FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "rs_update" ON room_shifts;
CREATE POLICY "rs_update" ON room_shifts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "rs_delete" ON room_shifts;
CREATE POLICY "rs_delete" ON room_shifts FOR DELETE
  TO anon, authenticated USING (true);
