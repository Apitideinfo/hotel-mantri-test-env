/*
# Hotel Gopal MIS - Room Chart Module

1. Overview
   Extends the existing schema with a Room Chart module that becomes the primary
   daily data source. Room revenue, source breakdown (OTA/Direct/Corporate/Phonebook),
   cash/bank, and tomorrow's status are all derived automatically from room chart rows.
   A small "other daily entries" table holds kitchen, other revenue, and expenses that
   the room chart cannot provide. Company/booking-source names are stored in a
   `company_sources` table with an editable source-category classification.

2. New Tables
   - `company_sources`: master list of booking-source/company/agent names with a
     configurable `source_category` (OTA | Direct/Walking | Corporate/Agent | Phonebook).
   - `room_chart_entries`: one row per occupied room per night. Holds guest, arrival,
     departure, nights, room_rate, total, company (actual name), pay_mode, description,
     and a denormalized `source_category` (copied from company_sources at save time).
   - `other_daily_entries`: singleton-per-date row for Kitchen, Other Revenue,
     Housekeeping Supply, Other Expense, Salary Advance, Maintenance Bill,
     Cash Handover MD Sir, Bank Cash Deposit.

3. Security
   - RLS enabled on all new tables; anon + authenticated CRUD (single-tenant, no auth).
   - Unique constraint on (hotel_id, report_date) for other_daily_entries prevents duplicates.

4. Notes
   - The existing `daily_reports` table is retained; new daily reports are derived from
     room chart + other entries and upserted into daily_reports by the app.
*/

CREATE TABLE IF NOT EXISTS company_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES hotel_settings(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_category text NOT NULL DEFAULT 'Direct/Walking'
    CHECK (source_category IN ('OTA','Direct/Walking','Corporate/Agent','Phonebook')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (hotel_id, name)
);

ALTER TABLE company_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_company_sources" ON company_sources;
CREATE POLICY "anon_select_company_sources" ON company_sources FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_company_sources" ON company_sources;
CREATE POLICY "anon_insert_company_sources" ON company_sources FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_company_sources" ON company_sources;
CREATE POLICY "anon_update_company_sources" ON company_sources FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_company_sources" ON company_sources;
CREATE POLICY "anon_delete_company_sources" ON company_sources FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS room_chart_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES hotel_settings(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  room_no text NOT NULL DEFAULT '',
  guest_name text NOT NULL DEFAULT '',
  arrival date,
  departure date,
  nights int NOT NULL DEFAULT 1 CHECK (nights >= 0),
  room_rate numeric NOT NULL DEFAULT 0 CHECK (room_rate >= 0),
  total numeric NOT NULL DEFAULT 0 CHECK (total >= 0),
  company text NOT NULL DEFAULT '',
  source_category text NOT NULL DEFAULT 'Direct/Walking'
    CHECK (source_category IN ('OTA','Direct/Walking','Corporate/Agent','Phonebook')),
  pay_mode text NOT NULL DEFAULT 'Cash'
    CHECK (pay_mode IN ('Cash','Bank')),
  description text NOT NULL DEFAULT '',
  is_complimentary boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE room_chart_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_room_chart" ON room_chart_entries;
CREATE POLICY "anon_select_room_chart" ON room_chart_entries FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_room_chart" ON room_chart_entries;
CREATE POLICY "anon_insert_room_chart" ON room_chart_entries FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_room_chart" ON room_chart_entries;
CREATE POLICY "anon_update_room_chart" ON room_chart_entries FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_room_chart" ON room_chart_entries;
CREATE POLICY "anon_delete_room_chart" ON room_chart_entries FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_room_chart_date ON room_chart_entries (report_date);
CREATE INDEX IF NOT EXISTS idx_room_chart_company ON room_chart_entries (company);

CREATE TABLE IF NOT EXISTS other_daily_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES hotel_settings(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  kitchen numeric NOT NULL DEFAULT 0 CHECK (kitchen >= 0),
  other_income numeric NOT NULL DEFAULT 0 CHECK (other_income >= 0),
  housekeeping_supply numeric NOT NULL DEFAULT 0 CHECK (housekeeping_supply >= 0),
  other_expense numeric NOT NULL DEFAULT 0 CHECK (other_expense >= 0),
  salary_advance numeric NOT NULL DEFAULT 0 CHECK (salary_advance >= 0),
  maintenance_bill numeric NOT NULL DEFAULT 0 CHECK (maintenance_bill >= 0),
  cash_handover_md numeric NOT NULL DEFAULT 0 CHECK (cash_handover_md >= 0),
  bank_cash_deposit numeric NOT NULL DEFAULT 0 CHECK (bank_cash_deposit >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_other_daily_date UNIQUE (hotel_id, report_date)
);

ALTER TABLE other_daily_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_other_daily" ON other_daily_entries;
CREATE POLICY "anon_select_other_daily" ON other_daily_entries FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_other_daily" ON other_daily_entries;
CREATE POLICY "anon_insert_other_daily" ON other_daily_entries FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_other_daily" ON other_daily_entries;
CREATE POLICY "anon_update_other_daily" ON other_daily_entries FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_other_daily" ON other_daily_entries;
CREATE POLICY "anon_delete_other_daily" ON other_daily_entries FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_other_daily_date ON other_daily_entries (report_date);

INSERT INTO company_sources (hotel_id, name, source_category)
VALUES
  ('00000000-0000-0000-0000-000000000000','MakeMyTrip','OTA'),
  ('00000000-0000-0000-0000-000000000000','Booking.com','OTA'),
  ('00000000-0000-0000-0000-000000000000','Goibibo','OTA'),
  ('00000000-0000-0000-0000-000000000000','Phonebook','Phonebook'),
  ('00000000-0000-0000-0000-000000000000','Walk In','Direct/Walking'),
  ('00000000-0000-0000-0000-000000000000','Direct','Direct/Walking')
ON CONFLICT (hotel_id, name) DO NOTHING;
