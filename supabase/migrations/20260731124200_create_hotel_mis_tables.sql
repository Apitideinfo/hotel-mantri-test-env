/*
# Hotel Gopal MIS - Core Schema

1. Overview
   Single-tenant, no-auth app for Hotel Gopal Devbhumi Dwarka.
   The receptionist uses the anon-key client to read/write daily reports.
   No sign-in screen, so policies are scoped to `anon, authenticated`.

2. New Tables
   - `hotel_settings` (singleton row): hotel name, total rooms, opening cash balance, financial year.
   - `daily_reports`: one row per (hotel_id, report_date). Stores all daily entry fields plus
     computed cash_closing. Unique on (hotel_id, report_date) to prevent duplicates.

3. Security
   - RLS enabled on both tables.
   - anon + authenticated CRUD allowed (intentionally shared single-tenant data).
   - Unique constraint on (hotel_id, report_date) prevents duplicate daily reports.
*/

CREATE TABLE IF NOT EXISTS hotel_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_name text NOT NULL DEFAULT 'Hotel Gopal Devbhumi Dwarka',
  total_rooms int NOT NULL DEFAULT 22 CHECK (total_rooms > 0),
  opening_cash_balance numeric NOT NULL DEFAULT 0,
  financial_year int NOT NULL DEFAULT 2026,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE hotel_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_settings" ON hotel_settings;
CREATE POLICY "anon_select_settings" ON hotel_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_settings" ON hotel_settings;
CREATE POLICY "anon_insert_settings" ON hotel_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_settings" ON hotel_settings;
CREATE POLICY "anon_update_settings" ON hotel_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_settings" ON hotel_settings;
CREATE POLICY "anon_delete_settings" ON hotel_settings FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES hotel_settings(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  rooms_occupied int NOT NULL DEFAULT 0 CHECK (rooms_occupied >= 0),
  complimentary_room int NOT NULL DEFAULT 0 CHECK (complimentary_room >= 0),
  room_sale_amount numeric NOT NULL DEFAULT 0 CHECK (room_sale_amount >= 0),
  ota numeric NOT NULL DEFAULT 0 CHECK (ota >= 0),
  direct_walking numeric NOT NULL DEFAULT 0 CHECK (direct_walking >= 0),
  corporate_agent numeric NOT NULL DEFAULT 0 CHECK (corporate_agent >= 0),
  phonebook numeric NOT NULL DEFAULT 0 CHECK (phonebook >= 0),
  kitchen numeric NOT NULL DEFAULT 0 CHECK (kitchen >= 0),
  other_income numeric NOT NULL DEFAULT 0 CHECK (other_income >= 0),
  housekeeping_supply numeric NOT NULL DEFAULT 0 CHECK (housekeeping_supply >= 0),
  other_expense numeric NOT NULL DEFAULT 0 CHECK (other_expense >= 0),
  cash numeric NOT NULL DEFAULT 0 CHECK (cash >= 0),
  bank numeric NOT NULL DEFAULT 0 CHECK (bank >= 0),
  salary_advance numeric NOT NULL DEFAULT 0 CHECK (salary_advance >= 0),
  maintenance_bill numeric NOT NULL DEFAULT 0 CHECK (maintenance_bill >= 0),
  cash_handover_md numeric NOT NULL DEFAULT 0 CHECK (cash_handover_md >= 0),
  bank_cash_deposit numeric NOT NULL DEFAULT 0 CHECK (bank_cash_deposit >= 0),
  departure int NOT NULL DEFAULT 0 CHECK (departure >= 0),
  expected_arrival int NOT NULL DEFAULT 0 CHECK (expected_arrival >= 0),
  expected_arr numeric NOT NULL DEFAULT 0 CHECK (expected_arr >= 0),
  cash_closing numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_hotel_date UNIQUE (hotel_id, report_date)
);

ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_reports" ON daily_reports;
CREATE POLICY "anon_select_reports" ON daily_reports FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_reports" ON daily_reports;
CREATE POLICY "anon_insert_reports" ON daily_reports FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_reports" ON daily_reports;
CREATE POLICY "anon_update_reports" ON daily_reports FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_reports" ON daily_reports;
CREATE POLICY "anon_delete_reports" ON daily_reports FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports (report_date);

INSERT INTO hotel_settings (id, hotel_name, total_rooms, opening_cash_balance, financial_year)
SELECT '00000000-0000-0000-0000-000000000000', 'Hotel Gopal Devbhumi Dwarka', 22, 0, 2026
WHERE NOT EXISTS (SELECT 1 FROM hotel_settings WHERE id = '00000000-0000-0000-0000-000000000000');
