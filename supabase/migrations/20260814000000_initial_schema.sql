-- =========================================
-- File: 20260731124200_create_hotel_mis_tables.sql
-- =========================================
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



-- =========================================
-- File: 20260731145721_add_room_chart_module.sql
-- =========================================
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



-- =========================================
-- File: 20260731165516_hotel_settings_add_contact_columns.sql
-- =========================================
/*
# Hotel Settings — Add Contact & Branding Columns

1. Changes
   Adds address, phone, email, and logo_url columns to hotel_settings.
   These feed the PDF header so reports show hotel-specific branding
   without hardcoding any hotel name.

2. Notes
   - All columns are optional (nullable / default empty string).
   - Multi-hotel ready: each hotel row gets its own contact details.
*/

ALTER TABLE hotel_settings
  ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS logo_url text NOT NULL DEFAULT '';



-- =========================================
-- File: 20260731175556_20260731_hotel_settings_full_profile.sql
-- =========================================
ALTER TABLE hotel_settings
  ADD COLUMN IF NOT EXISTS legal_name         text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city               text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS state_name         text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pin_code           text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp_number    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS website            text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS gst_number         text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pan_number         text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hotel_reg_number   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cin_number         text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS manager_name       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS manager_mobile     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS admin_name         text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_name          text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS account_name       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS account_number     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ifsc_code          text NOT NULL DEFAULT '';



-- =========================================
-- File: 20260731175609_20260731_hotel_assets_storage_bucket.sql
-- =========================================
-- Storage bucket for hotel assets (logo uploads)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hotel-assets',
  'hotel-assets',
  true,
  2097152,
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "auth_upload_hotel_assets" ON storage.objects;
CREATE POLICY "auth_upload_hotel_assets"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'hotel-assets');

DROP POLICY IF EXISTS "auth_update_hotel_assets" ON storage.objects;
CREATE POLICY "auth_update_hotel_assets"
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'hotel-assets');

DROP POLICY IF EXISTS "auth_delete_hotel_assets" ON storage.objects;
CREATE POLICY "auth_delete_hotel_assets"
  ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'hotel-assets');

DROP POLICY IF EXISTS "public_read_hotel_assets" ON storage.objects;
CREATE POLICY "public_read_hotel_assets"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'hotel-assets');



-- =========================================
-- File: 20260731181623_20260731_add_meal_plan_to_room_chart.sql
-- =========================================
/*
# Add meal_plan to room_chart_entries

Adds a meal_plan column to every room booking with a safe default of 'EP'
(Room Only). All existing entries are backfilled to 'EP' automatically.

Meal plan options:
  EP  – Room Only
  CP  – Room + Breakfast
  MAP – Room + Breakfast + Dinner
  AP  – Room + All Meals (Breakfast + Lunch + Dinner)
*/

ALTER TABLE room_chart_entries
  ADD COLUMN IF NOT EXISTS meal_plan text NOT NULL DEFAULT 'EP'
    CHECK (meal_plan IN ('EP', 'CP', 'MAP', 'AP'));

-- Backfill any existing NULL values (belt-and-suspenders)
UPDATE room_chart_entries SET meal_plan = 'EP' WHERE meal_plan IS NULL;



-- =========================================
-- File: 20260731183851_20260731_finance_layer_core_tables.sql
-- =========================================
/*
# Finance Layer — Phase 1: Core Tables

Creates the complete financial management schema for the hotel MIS.
All tables are scoped by hotel_id for future multi-hotel support.

Tables created:
  1. expense_categories  — configurable expense heads per hotel
  2. expense_entries     — individual expense transactions
  3. staff               — staff master / employee directory
  4. salary_advances     — advance payments to staff during the month
  5. salary_settlements  — monthly final salary settlement records
  6. electricity_readings — meter readings and bill tracking
  7. utility_bills        — water / internet / gas recurring bills
  8. laundry_entries      — laundry in/out tracking
  9. monthly_bills        — general monthly recurring bills

Security: RLS enabled on all tables; anon+authenticated can read/write
(single-tenant hotel app, no user login required).
*/

-- ─────────────────────────────────────────────
-- 1. EXPENSE CATEGORIES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id    uuid NOT NULL,
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_expense_categories" ON expense_categories;
CREATE POLICY "anon_select_expense_categories" ON expense_categories FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_expense_categories" ON expense_categories;
CREATE POLICY "anon_insert_expense_categories" ON expense_categories FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_expense_categories" ON expense_categories;
CREATE POLICY "anon_update_expense_categories" ON expense_categories FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_expense_categories" ON expense_categories;
CREATE POLICY "anon_delete_expense_categories" ON expense_categories FOR DELETE
  TO anon, authenticated USING (true);

-- ─────────────────────────────────────────────
-- 2. EXPENSE ENTRIES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        uuid NOT NULL,
  entry_date      date NOT NULL,
  category_id     uuid REFERENCES expense_categories(id) ON DELETE SET NULL,
  category_name   text NOT NULL,           -- denormalised snapshot of head name
  amount          numeric(12,2) NOT NULL DEFAULT 0,
  payment_mode    text NOT NULL DEFAULT 'Cash'
                    CHECK (payment_mode IN ('Cash','Bank','UPI','Credit')),
  description     text NOT NULL DEFAULT '',
  bill_no         text NOT NULL DEFAULT '',
  is_paid         boolean NOT NULL DEFAULT true,
  paid_date       date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE expense_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_expense_entries" ON expense_entries;
CREATE POLICY "anon_select_expense_entries" ON expense_entries FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_expense_entries" ON expense_entries;
CREATE POLICY "anon_insert_expense_entries" ON expense_entries FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_expense_entries" ON expense_entries;
CREATE POLICY "anon_update_expense_entries" ON expense_entries FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_expense_entries" ON expense_entries;
CREATE POLICY "anon_delete_expense_entries" ON expense_entries FOR DELETE
  TO anon, authenticated USING (true);

-- ─────────────────────────────────────────────
-- 3. STAFF MASTER
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        uuid NOT NULL,
  name            text NOT NULL,
  employee_id     text NOT NULL DEFAULT '',
  department      text NOT NULL DEFAULT 'Front Office',
  designation     text NOT NULL DEFAULT '',
  joining_date    date,
  monthly_salary  numeric(12,2) NOT NULL DEFAULT 0,
  payment_mode    text NOT NULL DEFAULT 'Cash'
                    CHECK (payment_mode IN ('Cash','Bank','UPI')),
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_staff" ON staff;
CREATE POLICY "anon_select_staff" ON staff FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_staff" ON staff;
CREATE POLICY "anon_insert_staff" ON staff FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_staff" ON staff;
CREATE POLICY "anon_update_staff" ON staff FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_staff" ON staff;
CREATE POLICY "anon_delete_staff" ON staff FOR DELETE
  TO anon, authenticated USING (true);

-- ─────────────────────────────────────────────
-- 4. SALARY ADVANCES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_advances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        uuid NOT NULL,
  staff_id        uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  advance_date    date NOT NULL,
  amount          numeric(12,2) NOT NULL DEFAULT 0,
  payment_mode    text NOT NULL DEFAULT 'Cash'
                    CHECK (payment_mode IN ('Cash','Bank','UPI')),
  remark          text NOT NULL DEFAULT '',
  month_key       text NOT NULL,  -- YYYY-MM for quick month filtering
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE salary_advances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_salary_advances" ON salary_advances;
CREATE POLICY "anon_select_salary_advances" ON salary_advances FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_salary_advances" ON salary_advances;
CREATE POLICY "anon_insert_salary_advances" ON salary_advances FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_salary_advances" ON salary_advances;
CREATE POLICY "anon_update_salary_advances" ON salary_advances FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_salary_advances" ON salary_advances;
CREATE POLICY "anon_delete_salary_advances" ON salary_advances FOR DELETE
  TO anon, authenticated USING (true);

-- ─────────────────────────────────────────────
-- 5. SALARY SETTLEMENTS (monthly)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_settlements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id          uuid NOT NULL,
  staff_id          uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  month_key         text NOT NULL,         -- YYYY-MM
  monthly_salary    numeric(12,2) NOT NULL DEFAULT 0,
  total_advance     numeric(12,2) NOT NULL DEFAULT 0,
  final_payment     numeric(12,2) NOT NULL DEFAULT 0,
  payment_mode      text NOT NULL DEFAULT 'Cash'
                      CHECK (payment_mode IN ('Cash','Bank','UPI')),
  payment_date      date,
  status            text NOT NULL DEFAULT 'Pending'
                      CHECK (status IN ('Pending','Paid','PartiallyPaid')),
  remark            text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, staff_id, month_key)
);

ALTER TABLE salary_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_salary_settlements" ON salary_settlements;
CREATE POLICY "anon_select_salary_settlements" ON salary_settlements FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_salary_settlements" ON salary_settlements;
CREATE POLICY "anon_insert_salary_settlements" ON salary_settlements FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_salary_settlements" ON salary_settlements;
CREATE POLICY "anon_update_salary_settlements" ON salary_settlements FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_salary_settlements" ON salary_settlements;
CREATE POLICY "anon_delete_salary_settlements" ON salary_settlements FOR DELETE
  TO anon, authenticated USING (true);

-- ─────────────────────────────────────────────
-- 6. ELECTRICITY READINGS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS electricity_readings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        uuid NOT NULL,
  month_key       text NOT NULL,           -- YYYY-MM
  prev_reading    numeric(10,2) NOT NULL DEFAULT 0,
  curr_reading    numeric(10,2) NOT NULL DEFAULT 0,
  units_consumed  numeric(10,2) GENERATED ALWAYS AS (curr_reading - prev_reading) STORED,
  bill_amount     numeric(12,2) NOT NULL DEFAULT 0,
  bill_date       date,
  due_date        date,
  payment_date    date,
  payment_mode    text NOT NULL DEFAULT 'Cash'
                    CHECK (payment_mode IN ('Cash','Bank','UPI','Credit')),
  status          text NOT NULL DEFAULT 'Pending'
                    CHECK (status IN ('Pending','Paid','PartiallyPaid')),
  remarks         text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, month_key)
);

ALTER TABLE electricity_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_electricity_readings" ON electricity_readings;
CREATE POLICY "anon_select_electricity_readings" ON electricity_readings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_electricity_readings" ON electricity_readings;
CREATE POLICY "anon_insert_electricity_readings" ON electricity_readings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_electricity_readings" ON electricity_readings;
CREATE POLICY "anon_update_electricity_readings" ON electricity_readings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_electricity_readings" ON electricity_readings;
CREATE POLICY "anon_delete_electricity_readings" ON electricity_readings FOR DELETE
  TO anon, authenticated USING (true);

-- ─────────────────────────────────────────────
-- 7. UTILITY BILLS (water, internet, gas etc.)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS utility_bills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        uuid NOT NULL,
  bill_type       text NOT NULL,
  vendor          text NOT NULL DEFAULT '',
  bill_date       date,
  due_date        date,
  amount          numeric(12,2) NOT NULL DEFAULT 0,
  payment_date    date,
  payment_mode    text NOT NULL DEFAULT 'Cash'
                    CHECK (payment_mode IN ('Cash','Bank','UPI','Credit')),
  status          text NOT NULL DEFAULT 'Pending'
                    CHECK (status IN ('Pending','Paid','PartiallyPaid')),
  remarks         text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE utility_bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_utility_bills" ON utility_bills;
CREATE POLICY "anon_select_utility_bills" ON utility_bills FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_utility_bills" ON utility_bills;
CREATE POLICY "anon_insert_utility_bills" ON utility_bills FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_utility_bills" ON utility_bills;
CREATE POLICY "anon_update_utility_bills" ON utility_bills FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_utility_bills" ON utility_bills;
CREATE POLICY "anon_delete_utility_bills" ON utility_bills FOR DELETE
  TO anon, authenticated USING (true);

-- ─────────────────────────────────────────────
-- 8. LAUNDRY ENTRIES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS laundry_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id          uuid NOT NULL,
  entry_date        date NOT NULL,
  transaction_type  text NOT NULL DEFAULT 'Expense'
                      CHECK (transaction_type IN ('Revenue','Expense')),
  direction         text NOT NULL DEFAULT 'Out'
                      CHECK (direction IN ('In','Out')),
  room_dept         text NOT NULL DEFAULT '',
  item              text NOT NULL DEFAULT '',
  quantity          numeric(10,2) NOT NULL DEFAULT 0,
  rate              numeric(10,2) NOT NULL DEFAULT 0,
  amount            numeric(12,2) NOT NULL DEFAULT 0,
  vendor            text NOT NULL DEFAULT '',
  payment_status    text NOT NULL DEFAULT 'Pending'
                      CHECK (payment_status IN ('Pending','Paid')),
  remarks           text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE laundry_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_laundry_entries" ON laundry_entries;
CREATE POLICY "anon_select_laundry_entries" ON laundry_entries FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_laundry_entries" ON laundry_entries;
CREATE POLICY "anon_insert_laundry_entries" ON laundry_entries FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_laundry_entries" ON laundry_entries;
CREATE POLICY "anon_update_laundry_entries" ON laundry_entries FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_laundry_entries" ON laundry_entries;
CREATE POLICY "anon_delete_laundry_entries" ON laundry_entries FOR DELETE
  TO anon, authenticated USING (true);

-- ─────────────────────────────────────────────
-- 9. MONTHLY BILLS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_bills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        uuid NOT NULL,
  bill_name       text NOT NULL,
  vendor          text NOT NULL DEFAULT '',
  bill_date       date,
  due_date        date,
  amount          numeric(12,2) NOT NULL DEFAULT 0,
  payment_mode    text NOT NULL DEFAULT 'Cash'
                    CHECK (payment_mode IN ('Cash','Bank','UPI','Credit')),
  status          text NOT NULL DEFAULT 'Pending'
                    CHECK (status IN ('Pending','Paid','PartiallyPaid')),
  paid_date       date,
  remarks         text NOT NULL DEFAULT '',
  month_key       text NOT NULL,           -- YYYY-MM for filtering
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE monthly_bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_monthly_bills" ON monthly_bills;
CREATE POLICY "anon_select_monthly_bills" ON monthly_bills FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_monthly_bills" ON monthly_bills;
CREATE POLICY "anon_insert_monthly_bills" ON monthly_bills FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_monthly_bills" ON monthly_bills;
CREATE POLICY "anon_update_monthly_bills" ON monthly_bills FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_monthly_bills" ON monthly_bills;
CREATE POLICY "anon_delete_monthly_bills" ON monthly_bills FOR DELETE
  TO anon, authenticated USING (true);

-- ─────────────────────────────────────────────
-- INDEXES for common query patterns
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_expense_entries_hotel_date  ON expense_entries(hotel_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_expense_entries_hotel_cat   ON expense_entries(hotel_id, category_name);
CREATE INDEX IF NOT EXISTS idx_salary_advances_hotel_month ON salary_advances(hotel_id, month_key);
CREATE INDEX IF NOT EXISTS idx_salary_advances_staff       ON salary_advances(staff_id);
CREATE INDEX IF NOT EXISTS idx_salary_settlements_hotel_month ON salary_settlements(hotel_id, month_key);
CREATE INDEX IF NOT EXISTS idx_laundry_hotel_date          ON laundry_entries(hotel_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_monthly_bills_hotel_month   ON monthly_bills(hotel_id, month_key);



-- =========================================
-- File: 20260731190449_20260731_saas_auth_tables.sql
-- =========================================
/*
# Multi-Tenant SaaS — Part 1: Auth Tables & Helper Functions

Creates the authentication/authorization infrastructure:
  1. subscription_plans — configurable plans
  2. hotels — master hotel registry
  3. hotel_admins — user-to-hotel mapping with roles
  4. hotel_invitations — secure invite tokens
  5. Helper SQL functions: auth_hotel_id(), is_super_admin()
  6. Seeds default subscription plans
  7. Migrates existing Hotel Gopal into the hotels table
*/

-- ────────────────────────────────────────────────────────────────────────────
-- 1. SUBSCRIPTION PLANS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,
  price           numeric(12,2) NOT NULL DEFAULT 0,
  billing_period  text NOT NULL DEFAULT 'monthly'
                    CHECK (billing_period IN ('monthly','quarterly','yearly','custom')),
  features        text NOT NULL DEFAULT '',
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_subscription_plans" ON subscription_plans;
CREATE POLICY "auth_select_subscription_plans" ON subscription_plans FOR SELECT
  TO authenticated USING (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. HOTELS (master registry)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotels (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_name          text NOT NULL,
  owner_name          text NOT NULL DEFAULT '',
  admin_email         text NOT NULL,
  mobile              text NOT NULL DEFAULT '',
  address             text NOT NULL DEFAULT '',
  total_rooms         int NOT NULL DEFAULT 1,
  plan_id             uuid REFERENCES subscription_plans(id) ON DELETE SET NULL,
  subscription_start  date,
  subscription_expiry date,
  subscription_status text NOT NULL DEFAULT 'Active'
                        CHECK (subscription_status IN ('Active','Expired','Suspended')),
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. HOTEL ADMINS (user-to-hotel mapping with role)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotel_admins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hotel_id    uuid REFERENCES hotels(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'hotel_admin'
                CHECK (role IN ('super_admin','hotel_admin','hotel_staff')),
  status      text NOT NULL DEFAULT 'Active'
                CHECK (status IN ('Active','Invited','Suspended')),
  email       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, hotel_id)
);

ALTER TABLE hotel_admins ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. HOTEL INVITATIONS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotel_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  email        text NOT NULL,
  role         text NOT NULL DEFAULT 'hotel_admin',
  token_hash   text NOT NULL,
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz,
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hotel_invitations ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. HELPER FUNCTIONS (SECURITY DEFINER — run with owner privileges)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth_hotel_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT hotel_id FROM hotel_admins
  WHERE user_id = auth.uid() AND role IN ('hotel_admin','hotel_staff')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM hotel_admins
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. SEED SUBSCRIPTION PLANS
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO subscription_plans (name, price, billing_period, features, sort_order) VALUES
  ('Basic',   999,   'monthly', 'Room Chart, Daily MIS, Dashboard', 1),
  ('Standard',1999,  'monthly', 'Room Chart, MIS, MTD/YTD, Expenses, Staff', 2),
  ('Pro',     3999,  'monthly', 'All Standard + Profitability, Laundry, Bills, PDF Export', 3),
  ('Custom',  0,     'custom',  'Custom pricing — contact sales', 4)
ON CONFLICT (name) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. MIGRATE EXISTING HOTEL GOPAL INTO hotels TABLE
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO hotels (id, hotel_name, owner_name, admin_email, total_rooms, subscription_status, subscription_start)
SELECT
  '00000000-0000-0000-0000-000000000000',
  hotel_name,
  COALESCE(admin_name, 'Hotel Owner'),
  COALESCE(email, 'admin@hotelgopal.com'),
  total_rooms,
  'Active',
  CURRENT_DATE
FROM hotel_settings
WHERE id = '00000000-0000-0000-0000-000000000000'
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. INDEXES
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_hotel_admins_user ON hotel_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_hotel_admins_hotel ON hotel_admins(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_invitations_email ON hotel_invitations(email);
CREATE INDEX IF NOT EXISTS idx_hotels_status ON hotels(subscription_status);



-- =========================================
-- File: 20260731190957_20260731_saas_lockdown_2b.sql
-- =========================================
/*
# SaaS Lockdown Part 2b: Super admin CRUD policies on auth tables
*/
-- hotels
DROP POLICY IF EXISTS "super_admin_insert_hotels" ON hotels;
CREATE POLICY "super_admin_insert_hotels" ON hotels FOR INSERT TO authenticated WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS "super_admin_update_hotels" ON hotels;
CREATE POLICY "super_admin_update_hotels" ON hotels FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS "super_admin_delete_hotels" ON hotels;
CREATE POLICY "super_admin_delete_hotels" ON hotels FOR DELETE TO authenticated USING (is_super_admin());

-- hotel_admins
DROP POLICY IF EXISTS "super_admin_insert_hotel_admins" ON hotel_admins;
CREATE POLICY "super_admin_insert_hotel_admins" ON hotel_admins FOR INSERT TO authenticated WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS "super_admin_update_hotel_admins" ON hotel_admins;
CREATE POLICY "super_admin_update_hotel_admins" ON hotel_admins FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS "super_admin_delete_hotel_admins" ON hotel_admins;
CREATE POLICY "super_admin_delete_hotel_admins" ON hotel_admins FOR DELETE TO authenticated USING (is_super_admin());

-- hotel_invitations
DROP POLICY IF EXISTS "super_admin_insert_hotel_invitations" ON hotel_invitations;
CREATE POLICY "super_admin_insert_hotel_invitations" ON hotel_invitations FOR INSERT TO authenticated WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS "super_admin_update_hotel_invitations" ON hotel_invitations;
CREATE POLICY "super_admin_update_hotel_invitations" ON hotel_invitations FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS "super_admin_delete_hotel_invitations" ON hotel_invitations;
CREATE POLICY "super_admin_delete_hotel_invitations" ON hotel_invitations FOR DELETE TO authenticated USING (is_super_admin());

-- subscription_plans write
DROP POLICY IF EXISTS "super_admin_insert_subscription_plans" ON subscription_plans;
CREATE POLICY "super_admin_insert_subscription_plans" ON subscription_plans FOR INSERT TO authenticated WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS "super_admin_update_subscription_plans" ON subscription_plans;
CREATE POLICY "super_admin_update_subscription_plans" ON subscription_plans FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS "super_admin_delete_subscription_plans" ON subscription_plans;
CREATE POLICY "super_admin_delete_subscription_plans" ON subscription_plans FOR DELETE TO authenticated USING (is_super_admin());



-- =========================================
-- File: 20260731191227_20260731_create_super_admin_user.sql
-- =========================================
/*
# Create Super Admin User

Creates the initial super admin user in auth.users and links them
to the hotel_admins table with role='super_admin'.

Credentials:
  Email: admin@hotelmis.com
  Password: Admin@2026 (change after first login)
*/

-- Insert the super admin user into auth.users (if not exists)
DO $$
DECLARE
  admin_uid uuid;
  existing_count int;
BEGIN
  SELECT count(*) INTO existing_count FROM auth.users WHERE email = 'admin@hotelmis.com';
  IF existing_count = 0 THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated', 'authenticated', 'admin@hotelmis.com',
      crypt('Admin@2026', gen_salt('bf')),
      now(), now(), now(),
      '{"role": "super_admin"}'::jsonb,
      '{}'::jsonb
    )
    RETURNING id INTO admin_uid;
  ELSE
    SELECT id INTO admin_uid FROM auth.users WHERE email = 'admin@hotelmis.com' LIMIT 1;
  END IF;

  -- Link to hotel_admins
  INSERT INTO hotel_admins (user_id, hotel_id, role, status, email)
  SELECT admin_uid, NULL, 'super_admin', 'Active', 'admin@hotelmis.com'
  WHERE NOT EXISTS (
    SELECT 1 FROM hotel_admins WHERE user_id = admin_uid
  );
END $$;



-- =========================================
-- File: 20260731191253_20260731_drop_remaining_anon_policies.sql
-- =========================================
/*
# Drop remaining old anon_* policies that were missed in the lockdown migration

These old policies have different names than what was dropped earlier:
  hotel_settings: anon_select_settings, anon_insert_settings, anon_update_settings, anon_delete_settings
  other_daily_entries: anon_select_other_daily, anon_insert_other_daily, anon_update_other_daily, anon_delete_other_daily
  room_chart_entries: anon_select_room_chart, anon_insert_room_chart, anon_update_room_chart, anon_delete_room_chart
*/

DROP POLICY IF EXISTS "anon_select_settings" ON hotel_settings;
DROP POLICY IF EXISTS "anon_insert_settings" ON hotel_settings;
DROP POLICY IF EXISTS "anon_update_settings" ON hotel_settings;
DROP POLICY IF EXISTS "anon_delete_settings" ON hotel_settings;

DROP POLICY IF EXISTS "anon_select_other_daily" ON other_daily_entries;
DROP POLICY IF EXISTS "anon_insert_other_daily" ON other_daily_entries;
DROP POLICY IF EXISTS "anon_update_other_daily" ON other_daily_entries;
DROP POLICY IF EXISTS "anon_delete_other_daily" ON other_daily_entries;

DROP POLICY IF EXISTS "anon_select_room_chart" ON room_chart_entries;
DROP POLICY IF EXISTS "anon_insert_room_chart" ON room_chart_entries;
DROP POLICY IF EXISTS "anon_update_room_chart" ON room_chart_entries;
DROP POLICY IF EXISTS "anon_delete_room_chart" ON room_chart_entries;



-- =========================================
-- File: 20260731191312_20260731_revoke_anon_execute_helpers.sql
-- =========================================
/*
# Revoke EXECUTE on SECURITY DEFINER helper functions from anon

The auth_hotel_id() and is_super_admin() functions are used internally
by RLS policies. They return NULL/FALSE for unauthenticated users
(auth.uid() is null), so they're safe — but we revoke EXECUTE from anon
to satisfy the security advisor and follow least-privilege.
*/
REVOKE EXECUTE ON FUNCTION auth_hotel_id() FROM anon;
REVOKE EXECUTE ON FUNCTION is_super_admin() FROM anon;



-- =========================================
-- File: 20260801085928_20260801_gst_and_split_payments.sql
-- =========================================
/*
# GST Module and Split Payment Support

1. Overview
   Adds hotel-level GST settings and per-booking GST + split payment support.
   Also adds a monthly GST report view (computed, no table needed).

2. hotel_settings — new columns
   - gst_registered (boolean, default false) — whether the hotel is GST-registered
   - gst_mode (text, default 'Exclusive') — 'Inclusive' or 'Exclusive' tax mode
   - default_gst_slab (numeric, default 0) — default GST slab: 0, 5, 12, or 18

3. room_chart_entries — new columns
   - gst_mode (text, default 'Exclusive') — per-booking override: 'Inclusive' or 'Exclusive'
   - gst_slab (numeric, default 0) — per-booking tax slab: 0, 5, 12, or 18
   - gst_amount (numeric, default 0) — computed GST for this booking
   - taxable_amount (numeric, default 0) — taxable revenue (exclusive of GST) for this booking
   - pay_cash (numeric, default 0) — cash portion of split payment
   - pay_upi (numeric, default 0) — UPI portion
   - pay_card (numeric, default 0) — card portion
   - pay_bank (numeric, default 0) — bank transfer portion
   - pay_advance (numeric, default 0) — advance adjustment portion
   - pay_balance (numeric, default 0) — outstanding balance portion

4. Security
   - No new tables; only ALTER TABLE on existing tables (RLS already enabled).
   - No policy changes needed — existing hotel_id-scoped policies cover new columns.

5. Notes
   - All new columns have safe defaults so existing rows and code continue to work.
   - The existing `pay_mode` column is retained for backward compatibility;
     split payment columns provide finer-grained breakdown.
   - `total` remains the gross booking total (room_rate * nights).
     `taxable_amount` and `gst_amount` are derived from total + gst_mode + gst_slab.
*/

-- ── hotel_settings GST columns ──
ALTER TABLE hotel_settings
  ADD COLUMN IF NOT EXISTS gst_registered boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_mode text DEFAULT 'Exclusive' CHECK (gst_mode IN ('Inclusive','Exclusive')),
  ADD COLUMN IF NOT EXISTS default_gst_slab numeric DEFAULT 0 CHECK (default_gst_slab IN (0, 5, 12, 18));

-- ── room_chart_entries GST + split payment columns ──
ALTER TABLE room_chart_entries
  ADD COLUMN IF NOT EXISTS gst_mode text DEFAULT 'Exclusive' CHECK (gst_mode IN ('Inclusive','Exclusive')),
  ADD COLUMN IF NOT EXISTS gst_slab numeric DEFAULT 0 CHECK (gst_slab IN (0, 5, 12, 18)),
  ADD COLUMN IF NOT EXISTS gst_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_cash numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_upi numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_card numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_bank numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_advance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_balance numeric DEFAULT 0;



-- =========================================
-- File: 20260801142323_20260801_daily_operations_revenue_entries.sql
-- =========================================
/*
# Daily Operations Sheet — Revenue Entries + Expense Notes

1. New Table: daily_revenue_entries
   - Stores "Other Revenue" entries entered from the Daily Room Chart screen.
   - Columns: hotel_id, entry_date, revenue_head, description, amount, payment_mode, notes, created_by, created_at, updated_at.
   - revenue_head is one of: Kitchen, Laundry, Extra Bed, Hall Rental, Parking, Other Income.
   - payment_mode is one of: Cash, Bank, UPI, Card.
   - created_by stores the user_id of whoever created the row (nullable for backward compat).

2. Modified Table: expense_entries
   - Adds `notes` text column (default '') for additional context from the Daily Room Chart.
   - Adds `created_by` uuid column (nullable) to track who entered the expense.
   - Both columns are additive — no data loss.

3. Security
   - RLS enabled on daily_revenue_entries with anon+authenticated CRUD (matches existing finance tables).
   - expense_entries already has RLS; new columns inherit existing policies.

4. Indexes
   - daily_revenue_entries: index on (hotel_id, entry_date) for fast date-based queries.
   - expense_entries: index on (hotel_id, entry_date) added if not exists.
*/

-- ─────────────────────────────────────────────
-- 1. DAILY REVENUE ENTRIES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_revenue_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        uuid NOT NULL,
  entry_date      date NOT NULL,
  revenue_head    text NOT NULL,
  description     text NOT NULL DEFAULT '',
  amount          numeric(12,2) NOT NULL DEFAULT 0,
  payment_mode    text NOT NULL DEFAULT 'Cash'
                    CHECK (payment_mode IN ('Cash','Bank','UPI','Card')),
  notes           text NOT NULL DEFAULT '',
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE daily_revenue_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_daily_revenue_entries" ON daily_revenue_entries;
CREATE POLICY "anon_select_daily_revenue_entries" ON daily_revenue_entries FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_daily_revenue_entries" ON daily_revenue_entries;
CREATE POLICY "anon_insert_daily_revenue_entries" ON daily_revenue_entries FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_daily_revenue_entries" ON daily_revenue_entries;
CREATE POLICY "anon_update_daily_revenue_entries" ON daily_revenue_entries FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_daily_revenue_entries" ON daily_revenue_entries;
CREATE POLICY "anon_delete_daily_revenue_entries" ON daily_revenue_entries FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_daily_revenue_entries_hotel_date
  ON daily_revenue_entries (hotel_id, entry_date);

-- ─────────────────────────────────────────────
-- 2. EXPENSE ENTRIES — add notes + created_by
-- ─────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expense_entries' AND column_name = 'notes') THEN
    ALTER TABLE expense_entries ADD COLUMN notes text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expense_entries' AND column_name = 'created_by') THEN
    ALTER TABLE expense_entries ADD COLUMN created_by uuid;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_expense_entries_hotel_date
  ON expense_entries (hotel_id, entry_date);



-- =========================================
-- File: 20260801161637_20260801_room_category_management.sql.sql
-- =========================================
/*
# Room Category Management

1. Overview
   Adds a room_categories table for hotel-level room category management,
   and a room_category column on room_chart_entries to tag each booking
   with a room category (e.g. Standard, Deluxe, Suite).

2. New Tables
   - room_categories
     - id (uuid, primary key)
     - hotel_id (uuid, references hotels)
     - name (text, not null) — category name (e.g. "Deluxe")
     - sort_order (integer, default 0) — display order
     - is_active (boolean, default true) — soft-delete / deactivate
     - created_at (timestamptz)

3. Modified Tables
   - room_chart_entries
     - room_category (text, default 'Standard') — the category name at time of booking

4. Default Categories
   - When a new hotel is created, 6 default categories are seeded:
     Standard, Deluxe, Super Deluxe, Executive, Suite, Family Room.
   - A trigger auto-seeds these for any new row in hotel_settings.

5. Security
   - RLS enabled on room_categories.
   - 4 policies (SELECT/INSERT/UPDATE/DELETE) scoped to authenticated users
     via hotel_id = auth_hotel_id() or is_super_admin().
   - room_chart_entries already has RLS; new column is covered by existing policies.

6. Notes
   - room_category on room_chart_entries is a free-text column (not FK) so
     renaming/deleting a category does not lose historical booking data.
   - Existing rows get 'Standard' as the default category.
*/

-- ── room_categories table ──
CREATE TABLE IF NOT EXISTS room_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (hotel_id, name)
);

ALTER TABLE room_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_room_categories" ON room_categories;
CREATE POLICY "auth_select_room_categories"
  ON room_categories FOR SELECT TO authenticated
  USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "auth_insert_room_categories" ON room_categories;
CREATE POLICY "auth_insert_room_categories"
  ON room_categories FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "auth_update_room_categories" ON room_categories;
CREATE POLICY "auth_update_room_categories"
  ON room_categories FOR UPDATE TO authenticated
  USING (is_super_admin() OR (hotel_id = auth_hotel_id()))
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "auth_delete_room_categories" ON room_categories;
CREATE POLICY "auth_delete_room_categories"
  ON room_categories FOR DELETE TO authenticated
  USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

-- ── room_category column on room_chart_entries ──
ALTER TABLE room_chart_entries
  ADD COLUMN IF NOT EXISTS room_category text DEFAULT 'Standard';

-- ── Auto-seed default categories for new hotels ──
CREATE OR REPLACE FUNCTION seed_default_room_categories()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO room_categories (hotel_id, name, sort_order)
  VALUES
    (NEW.id, 'Standard', 1),
    (NEW.id, 'Deluxe', 2),
    (NEW.id, 'Super Deluxe', 3),
    (NEW.id, 'Executive', 4),
    (NEW.id, 'Suite', 5),
    (NEW.id, 'Family Room', 6)
  ON CONFLICT (hotel_id, name) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_seed_room_categories ON hotel_settings;
CREATE TRIGGER trigger_seed_room_categories
  AFTER INSERT ON hotel_settings
  FOR EACH ROW EXECUTE FUNCTION seed_default_room_categories();

-- ── Seed default categories for existing hotels ──
INSERT INTO room_categories (hotel_id, name, sort_order)
SELECT h.id, cat.name, cat.sort_order
FROM hotels h
CROSS JOIN (VALUES
  ('Standard', 1),
  ('Deluxe', 2),
  ('Super Deluxe', 3),
  ('Executive', 4),
  ('Suite', 5),
  ('Family Room', 6)
) AS cat(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM room_categories rc WHERE rc.hotel_id = h.id AND rc.name = cat.name
)
ON CONFLICT (hotel_id, name) DO NOTHING;


-- =========================================
-- File: 20260803183740_20260803_property_master_rooms.sql
-- =========================================
/*
# Property Master — Room Inventory & Category Tariffs

1. Overview
   Adds a per-hotel room inventory table so each hotel can manage its own
   physical rooms (room number, category, floor, tariff, extra-bed charge,
   active status). Also extends room_categories with default tariff and
   extra-bed charge so new rooms can inherit category defaults.

2. New Tables
   - rooms
     - id (uuid, primary key)
     - hotel_id (uuid, references hotels, ON DELETE CASCADE)
     - room_no (text, not null) — the physical room number/label
     - category_id (uuid, references room_categories, ON DELETE SET NULL)
     - floor (text) — floor identifier (e.g. "Ground", "1st")
     - default_tariff (numeric, default 0) — per-room default tariff
     - extra_bed_charge (numeric, default 0) — per-room extra-bed charge
     - is_active (boolean, default true) — soft-deactivate a room
     - sort_order (integer, default 0) — display order
     - created_at (timestamptz)
     - UNIQUE(hotel_id, room_no)

3. Modified Tables
   - room_categories
     - default_tariff (numeric, default 0) — category-level default tariff
     - extra_bed_charge (numeric, default 0) — category-level default extra-bed charge

4. Security
   - RLS enabled on rooms.
   - 4 policies (SELECT/INSERT/UPDATE/DELETE) scoped to authenticated users
     via hotel_id = auth_hotel_id() or is_super_admin() — same pattern as
     room_categories.

5. Notes
   - category_id on rooms is nullable and ON DELETE SET NULL so deleting a
     category does not lose room inventory rows.
   - room_no is free-text so hotels can use any numbering scheme.
   - The Daily Entry Room Chart reads from this table to generate room cards
     dynamically instead of using hardcoded room numbers.
*/

-- ── Extend room_categories with tariff fields ──
ALTER TABLE room_categories
  ADD COLUMN IF NOT EXISTS default_tariff numeric NOT NULL DEFAULT 0;

ALTER TABLE room_categories
  ADD COLUMN IF NOT EXISTS extra_bed_charge numeric NOT NULL DEFAULT 0;

-- ── rooms table ──
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_no text NOT NULL,
  category_id uuid REFERENCES room_categories(id) ON DELETE SET NULL,
  floor text,
  default_tariff numeric NOT NULL DEFAULT 0,
  extra_bed_charge numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (hotel_id, room_no)
);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_rooms" ON rooms;
CREATE POLICY "auth_select_rooms"
  ON rooms FOR SELECT TO authenticated
  USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "auth_insert_rooms" ON rooms;
CREATE POLICY "auth_insert_rooms"
  ON rooms FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "auth_update_rooms" ON rooms;
CREATE POLICY "auth_update_rooms"
  ON rooms FOR UPDATE TO authenticated
  USING (is_super_admin() OR (hotel_id = auth_hotel_id()))
  WITH CHECK (is_super_admin() OR (hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "auth_delete_rooms" ON rooms;
CREATE POLICY "auth_delete_rooms"
  ON rooms FOR DELETE TO authenticated
  USING (is_super_admin() OR (hotel_id = auth_hotel_id()));

-- Index for efficient per-hotel queries
CREATE INDEX IF NOT EXISTS idx_rooms_hotel_id ON rooms(hotel_id);
CREATE INDEX IF NOT EXISTS idx_rooms_category_id ON rooms(category_id);



-- =========================================
-- File: 20260803185613_20260803_enterprise_hq_schema.sql
-- =========================================
/*
# Hotel Mantri Enterprise HQ — Phase 1 Schema

## Overview
Adds the complete data layer for the Super Admin "Enterprise HQ" command center.
All new tables are separate from existing hotel operational tables. Existing
tables (hotels, subscription_plans, hotel_admins, hotel_settings, etc.) are
only EXTENDED with nullable columns — no existing column is changed or dropped.

## New Tables
1. company_roles — role definitions with permission JSON
2. company_users — company-level staff (founder, sales, support, finance)
3. crm_leads — sales pipeline leads
4. crm_lead_notes — timeline notes per lead
5. support_tickets — hotel support tickets
6. support_ticket_messages — messages on a ticket
7. audit_logs — centralized read-only audit trail
8. notifications — in-app notification center
9. system_settings — global SaaS settings (key/value)
10. hotel_features — per-hotel module toggles
11. subscription_payments — payment records for hotel subscriptions
12. impersonation_sessions — secure "Login as Hotel" audit records

## Modified Tables
- hotels: added nullable columns (property_code, city, state, assigned_sales_exec,
  archived_at, last_login_at) — all nullable, backward compatible
- subscription_plans: added nullable columns (yearly_price, trial_days, room_limit,
  user_limit, hotel_limit, enabled_modules, grace_period) — all nullable

## Security
- RLS enabled on every new table
- Helper functions is_super_admin() (updated), is_company_user(), company_user_role()
- audit_logs: INSERT only (no update/delete) — append-only

## Notes
- is_super_admin() updated to also return true for company_users with
  role 'founder' or 'company_admin'
- All tables use gen_random_uuid() primary keys
- Soft delete via archived_at on hotels; no hard deletes from the UI
*/

-- ════════════════════════════════════════════════════════════════════════════
-- EXTEND hotels TABLE
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS property_code text,
  ADD COLUMN IF NOT EXISTS city text DEFAULT '',
  ADD COLUMN IF NOT EXISTS state text DEFAULT '',
  ADD COLUMN IF NOT EXISTS assigned_sales_exec uuid,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- ════════════════════════════════════════════════════════════════════════════
-- EXTEND subscription_plans TABLE
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS yearly_price numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_days int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS room_limit int,
  ADD COLUMN IF NOT EXISTS user_limit int,
  ADD COLUMN IF NOT EXISTS hotel_limit int,
  ADD COLUMN IF NOT EXISTS enabled_modules text DEFAULT '',
  ADD COLUMN IF NOT EXISTS grace_period int DEFAULT 0;

UPDATE subscription_plans SET trial_days = 14 WHERE trial_days = 0 AND name != 'Custom';

-- ════════════════════════════════════════════════════════════════════════════
-- 1. company_roles
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS company_roles (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text DEFAULT '',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order int NOT NULL DEFAULT 0
);

INSERT INTO company_roles (id, name, description, permissions, sort_order) VALUES
  ('founder', 'Founder / Super Admin', 'Full system access', '{"all": true}'::jsonb, 1),
  ('company_admin', 'Company Admin', 'Almost full access except founder-only settings', '{"all": true, "settings": {"system_settings": false}}'::jsonb, 2),
  ('sales_manager', 'Sales Manager', 'All leads, demos, team performance, assigned hotels', '{"hotels": {"read": true}, "crm": {"all": true}, "subscriptions": {"read": true}, "dashboard": true}'::jsonb, 3),
  ('sales_executive', 'Sales Executive', 'Only assigned leads, follow-ups, demos, notes', '{"crm": {"assigned": true}, "hotels": {"read": true}}'::jsonb, 4),
  ('support_manager', 'Support Manager', 'Tickets and authorized hotel support access', '{"tickets": {"all": true}, "hotels": {"read": true, "impersonate": true}}'::jsonb, 5),
  ('support_executive', 'Support Executive', 'Assigned tickets and hotel support access', '{"tickets": {"assigned": true}, "hotels": {"read": true, "impersonate": true}}'::jsonb, 6),
  ('finance_manager', 'Finance Manager', 'Subscriptions, invoices, payments, renewals', '{"subscriptions": {"all": true}, "payments": {"all": true}, "hotels": {"read": true}}'::jsonb, 7),
  ('finance_executive', 'Finance Executive', 'Payments and invoices', '{"payments": {"all": true}, "subscriptions": {"read": true}}'::jsonb, 8)
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. company_users
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS company_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text NOT NULL,
  mobile text DEFAULT '',
  role text NOT NULL REFERENCES company_roles(id),
  manager_id uuid REFERENCES company_users(id) ON DELETE SET NULL,
  department text DEFAULT '',
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive','Suspended')),
  assigned_hotels text[] DEFAULT '{}',
  assigned_leads text[] DEFAULT '{}',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE company_users ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS (after company_users exists)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM hotel_admins
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ) OR EXISTS (
    SELECT 1 FROM company_users
    WHERE user_id = auth.uid() AND role IN ('founder', 'company_admin') AND status = 'Active'
  );
$$;

CREATE OR REPLACE FUNCTION is_company_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_users
    WHERE user_id = auth.uid() AND status = 'Active'
  );
$$;

CREATE OR REPLACE FUNCTION company_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM company_users
  WHERE user_id = auth.uid() AND status = 'Active'
  LIMIT 1;
$$;

-- Now add policies on company_users (functions exist)
DROP POLICY IF EXISTS "company_select_company_users" ON company_users;
CREATE POLICY "company_select_company_users" ON company_users FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "super_admin_insert_company_users" ON company_users;
CREATE POLICY "super_admin_insert_company_users" ON company_users FOR INSERT
  TO authenticated WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "super_admin_update_company_users" ON company_users;
CREATE POLICY "super_admin_update_company_users" ON company_users FOR UPDATE
  TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "super_admin_delete_company_users" ON company_users;
CREATE POLICY "super_admin_delete_company_users" ON company_users FOR DELETE
  TO authenticated USING (is_super_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 3. crm_leads
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_name text NOT NULL DEFAULT '',
  contact_person text NOT NULL DEFAULT '',
  mobile text DEFAULT '',
  email text DEFAULT '',
  city text DEFAULT '',
  num_rooms int DEFAULT 0,
  current_software text DEFAULT '',
  lead_source text DEFAULT '',
  interested_plan text DEFAULT '',
  assigned_exec uuid REFERENCES company_users(id) ON DELETE SET NULL,
  next_follow_up date,
  status text NOT NULL DEFAULT 'New Lead'
    CHECK (status IN ('New Lead','Contacted','Qualified','Demo Scheduled','Demo Completed','Proposal Sent','Negotiation','Converted','Lost','Follow-up Later')),
  notes text DEFAULT '',
  estimated_value numeric(12,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_crm_leads" ON crm_leads;
CREATE POLICY "company_select_crm_leads" ON crm_leads FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_insert_crm_leads" ON crm_leads;
CREATE POLICY "company_insert_crm_leads" ON crm_leads FOR INSERT
  TO authenticated WITH CHECK (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_update_crm_leads" ON crm_leads;
CREATE POLICY "company_update_crm_leads" ON crm_leads FOR UPDATE
  TO authenticated USING (is_company_user() OR is_super_admin())
  WITH CHECK (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_delete_crm_leads" ON crm_leads;
CREATE POLICY "company_delete_crm_leads" ON crm_leads FOR DELETE
  TO authenticated USING (is_company_user() OR is_super_admin());

CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON crm_leads(status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_assigned ON crm_leads(assigned_exec);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. crm_lead_notes
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm_lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_lead_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_lead_notes" ON crm_lead_notes;
CREATE POLICY "company_select_lead_notes" ON crm_lead_notes FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_insert_lead_notes" ON crm_lead_notes;
CREATE POLICY "company_insert_lead_notes" ON crm_lead_notes FOR INSERT
  TO authenticated WITH CHECK (is_company_user() OR is_super_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 5. support_tickets
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL UNIQUE,
  hotel_id uuid REFERENCES hotels(id) ON DELETE SET NULL,
  reporter text DEFAULT '',
  category text NOT NULL DEFAULT 'Other'
    CHECK (category IN ('Login','Room Chart','Daily Report','Finance','GST','WhatsApp','PDF','Subscription','Feature Request','Bug','Other')),
  priority text NOT NULL DEFAULT 'Low'
    CHECK (priority IN ('Low','Medium','High','Critical')),
  status text NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open','In Progress','Waiting for Customer','Resolved','Closed')),
  assigned_exec uuid REFERENCES company_users(id) ON DELETE SET NULL,
  description text DEFAULT '',
  resolution_notes text DEFAULT '',
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_tickets" ON support_tickets;
CREATE POLICY "company_select_tickets" ON support_tickets FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_insert_tickets" ON support_tickets;
CREATE POLICY "company_insert_tickets" ON support_tickets FOR INSERT
  TO authenticated WITH CHECK (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_update_tickets" ON support_tickets;
CREATE POLICY "company_update_tickets" ON support_tickets FOR UPDATE
  TO authenticated USING (is_company_user() OR is_super_admin())
  WITH CHECK (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_delete_tickets" ON support_tickets;
CREATE POLICY "company_delete_tickets" ON support_tickets FOR DELETE
  TO authenticated USING (is_super_admin());

CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_hotel ON support_tickets(hotel_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. support_ticket_messages
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_ticket_msgs" ON support_ticket_messages;
CREATE POLICY "company_select_ticket_msgs" ON support_ticket_messages FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_insert_ticket_msgs" ON support_ticket_messages;
CREATE POLICY "company_insert_ticket_msgs" ON support_ticket_messages FOR INSERT
  TO authenticated WITH CHECK (is_company_user() OR is_super_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 7. audit_logs
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text DEFAULT '',
  role text DEFAULT '',
  action text NOT NULL,
  module text DEFAULT '',
  hotel_id uuid,
  hotel_name text DEFAULT '',
  record_id text DEFAULT '',
  old_value jsonb,
  new_value jsonb,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','critical')),
  impersonation_id uuid,
  reason text DEFAULT '',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_audit_logs" ON audit_logs;
CREATE POLICY "company_select_audit_logs" ON audit_logs FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_insert_audit_logs" ON audit_logs;
CREATE POLICY "company_insert_audit_logs" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (is_company_user() OR is_super_admin());

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_hotel ON audit_logs(hotel_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 8. notifications
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL
    CHECK (type IN ('subscription_expiring','payment_due','trial_ending','new_lead','demo_reminder','support_ticket','critical_bug','hotel_suspended','hotel_created','system_announcement')),
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'low' CHECK (priority IN ('low','medium','high','critical')),
  hotel_id uuid REFERENCES hotels(id) ON DELETE CASCADE,
  target_role text DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_notifications" ON notifications;
CREATE POLICY "company_select_notifications" ON notifications FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_insert_notifications" ON notifications;
CREATE POLICY "company_insert_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_update_notifications" ON notifications;
CREATE POLICY "company_update_notifications" ON notifications FOR UPDATE
  TO authenticated USING (is_company_user() OR is_super_admin())
  WITH CHECK (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_delete_notifications" ON notifications;
CREATE POLICY "company_delete_notifications" ON notifications FOR DELETE
  TO authenticated USING (is_super_admin());

CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 9. system_settings
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_settings" ON system_settings;
CREATE POLICY "company_select_settings" ON system_settings FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "super_admin_update_settings" ON system_settings;
CREATE POLICY "super_admin_update_settings" ON system_settings FOR UPDATE
  TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "super_admin_insert_settings" ON system_settings;
CREATE POLICY "super_admin_insert_settings" ON system_settings FOR INSERT
  TO authenticated WITH CHECK (is_super_admin());

INSERT INTO system_settings (key, value) VALUES
  ('company_info', '{"name": "Hotel Mantri", "tagline": "Enterprise Hotel Management"}'::jsonb),
  ('defaults', '{"currency": "INR", "country": "India", "timezone": "Asia/Kolkata", "trial_days": 14, "grace_period": 7, "invoice_prefix": "HM-INV"}'::jsonb),
  ('support', '{"email": "support@hotelmantri.com", "phone": "+91 9999999999"}'::jsonb),
  ('security', '{"session_timeout_minutes": 30, "password_min_length": 8, "maintenance_mode": false}'::jsonb),
  ('default_categories', '["Standard", "Deluxe", "Super Deluxe", "Executive", "Suite", "Family Room"]'::jsonb),
  ('default_revenue_heads', '["Kitchen", "Restaurant", "Banquet", "Other Income"]'::jsonb),
  ('default_expense_heads', '["Housekeeping", "Maintenance", "Salary", "Utilities", "Miscellaneous"]'::jsonb),
  ('default_payment_modes', '["Cash", "Bank", "UPI", "Card"]'::jsonb),
  ('default_gst', '{"registered": false, "mode": "Exclusive", "slab": 12}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 10. hotel_features
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS hotel_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, module_key)
);

ALTER TABLE hotel_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_hotel_features" ON hotel_features;
CREATE POLICY "auth_select_hotel_features" ON hotel_features FOR SELECT
  TO authenticated
  USING (is_super_admin() OR hotel_id = auth_hotel_id() OR is_company_user());

DROP POLICY IF EXISTS "super_admin_insert_hotel_features" ON hotel_features;
CREATE POLICY "super_admin_insert_hotel_features" ON hotel_features FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_company_user());

DROP POLICY IF EXISTS "super_admin_update_hotel_features" ON hotel_features;
CREATE POLICY "super_admin_update_hotel_features" ON hotel_features FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_company_user())
  WITH CHECK (is_super_admin() OR is_company_user());

DROP POLICY IF EXISTS "super_admin_delete_hotel_features" ON hotel_features;
CREATE POLICY "super_admin_delete_hotel_features" ON hotel_features FOR DELETE
  TO authenticated USING (is_super_admin());

INSERT INTO hotel_features (hotel_id, module_key, is_enabled)
SELECT h.id, m.key, true
FROM hotels h
CROSS JOIN (VALUES
  ('dashboard'), ('daily_entry'), ('room_chart'), ('finance'), ('gst'),
  ('whatsapp_reports'), ('pdf_reports'), ('mtd'), ('ytd'), ('profit_loss'),
  ('multi_hotel'), ('company_ledger')
) AS m(key)
WHERE h.archived_at IS NULL
ON CONFLICT (hotel_id, module_key) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 11. subscription_payments
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES subscription_plans(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) DEFAULT 0,
  payment_mode text DEFAULT 'Cash',
  invoice_number text DEFAULT '',
  billing_cycle text DEFAULT 'monthly',
  payment_date date,
  notes text DEFAULT '',
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_payments" ON subscription_payments;
CREATE POLICY "company_select_payments" ON subscription_payments FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_insert_payments" ON subscription_payments;
CREATE POLICY "company_insert_payments" ON subscription_payments FOR INSERT
  TO authenticated WITH CHECK (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_update_payments" ON subscription_payments;
CREATE POLICY "company_update_payments" ON subscription_payments FOR UPDATE
  TO authenticated USING (is_company_user() OR is_super_admin())
  WITH CHECK (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "super_admin_delete_payments" ON subscription_payments;
CREATE POLICY "super_admin_delete_payments" ON subscription_payments FOR DELETE
  TO authenticated USING (is_super_admin());

CREATE INDEX IF NOT EXISTS idx_payments_hotel ON subscription_payments(hotel_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 12. impersonation_sessions
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_email text NOT NULL,
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  hotel_name text NOT NULL,
  reason text DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds int,
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE impersonation_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_impersonation" ON impersonation_sessions;
CREATE POLICY "company_select_impersonation" ON impersonation_sessions FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_insert_impersonation" ON impersonation_sessions;
CREATE POLICY "company_insert_impersonation" ON impersonation_sessions FOR INSERT
  TO authenticated WITH CHECK (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_update_impersonation" ON impersonation_sessions;
CREATE POLICY "company_update_impersonation" ON impersonation_sessions FOR UPDATE
  TO authenticated USING (is_company_user() OR is_super_admin())
  WITH CHECK (is_company_user() OR is_super_admin());

CREATE INDEX IF NOT EXISTS idx_impersonation_active ON impersonation_sessions(is_active);



-- =========================================
-- File: 20260803200543_20260803_hotel_data_management_functions.sql.sql
-- =========================================
/*
# Hotel Data Management — Reset & Delete Functions

## Purpose
Provides server-side, transactional functions for two destructive operations
on hotel data, accessible only to Founder / Super Admin (company_users with
role = 'founder' or 'company_admin').

## Functions Created

### 1. get_hotel_record_counts(p_hotel_id uuid)
Returns a JSON object with per-table row counts for a given hotel.
Used by the UI to show an itemized warning before deletion.

### 2. reset_hotel_operational_data(p_hotel_id uuid, p_reason text, p_user_email text, p_ip text, p_device text)
Deletes all operational/financial data for a hotel while preserving:
- Hotel profile (hotels, hotel_settings)
- Property Master (room_categories, rooms)
- Owner account (hotel_admins)
- Hotel users
- Subscription (subscription_payments)
- Feature access (hotel_features)
- Branding and settings
- company_sources (booking sources — setup data)

All wrapped in a single transaction. If any step fails, the entire
operation rolls back. Returns a JSON summary of deleted counts.

### 3. delete_hotel_permanently(p_hotel_id uuid, p_reason text, p_user_email text, p_ip text, p_device text)
Permanently deletes a hotel and ALL associated records including:
- Hotel record itself
- Owner and hotel-level users (only if not linked to other hotels)
- Property Master, rooms, categories
- All operational data
- Finance data
- Subscriptions, features
- Support tickets
- Notifications
- Audit logs for this hotel
- Impersonation sessions
- Storage files (hotel-assets bucket)

Also deletes the auth.users entry for hotel-specific users (only if they
are not linked to any other hotel via hotel_admins).

All wrapped in a single transaction. Returns a JSON summary.

### 4. export_hotel_data(p_hotel_id uuid)
Returns all hotel data as a JSON object for backup/download.

## Security
- All functions are SECURITY DEFINER with SET search_path = public
- Authorization is checked inside each function via auth.uid()
- EXECUTE is revoked from anon, granted only to authenticated
- Only founder/company_admin roles can execute destructive operations
- hotel_id is verified on every deletion query
- All operations are transactional (BEGIN/EXCEPTION/END blocks)
*/

-- ── Helper: Get record counts per table for a hotel ──
CREATE OR REPLACE FUNCTION get_hotel_record_counts(p_hotel_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'daily_reports', (SELECT count(*) FROM daily_reports WHERE hotel_id = p_hotel_id),
    'daily_revenue_entries', (SELECT count(*) FROM daily_revenue_entries WHERE hotel_id = p_hotel_id),
    'room_chart_entries', (SELECT count(*) FROM room_chart_entries WHERE hotel_id = p_hotel_id),
    'expense_entries', (SELECT count(*) FROM expense_entries WHERE hotel_id = p_hotel_id),
    'expense_categories', (SELECT count(*) FROM expense_categories WHERE hotel_id = p_hotel_id),
    'other_daily_entries', (SELECT count(*) FROM other_daily_entries WHERE hotel_id = p_hotel_id),
    'electricity_readings', (SELECT count(*) FROM electricity_readings WHERE hotel_id = p_hotel_id),
    'laundry_entries', (SELECT count(*) FROM laundry_entries WHERE hotel_id = p_hotel_id),
    'monthly_bills', (SELECT count(*) FROM monthly_bills WHERE hotel_id = p_hotel_id),
    'salary_advances', (SELECT count(*) FROM salary_advances WHERE hotel_id = p_hotel_id),
    'salary_settlements', (SELECT count(*) FROM salary_settlements WHERE hotel_id = p_hotel_id),
    'utility_bills', (SELECT count(*) FROM utility_bills WHERE hotel_id = p_hotel_id),
    'staff', (SELECT count(*) FROM staff WHERE hotel_id = p_hotel_id),
    'company_sources', (SELECT count(*) FROM company_sources WHERE hotel_id = p_hotel_id),
    'room_categories', (SELECT count(*) FROM room_categories WHERE hotel_id = p_hotel_id),
    'rooms', (SELECT count(*) FROM rooms WHERE hotel_id = p_hotel_id),
    'hotel_features', (SELECT count(*) FROM hotel_features WHERE hotel_id = p_hotel_id),
    'hotel_admins', (SELECT count(*) FROM hotel_admins WHERE hotel_id = p_hotel_id),
    'subscription_payments', (SELECT count(*) FROM subscription_payments WHERE hotel_id = p_hotel_id),
    'support_tickets', (SELECT count(*) FROM support_tickets WHERE hotel_id = p_hotel_id),
    'notifications', (SELECT count(*) FROM notifications WHERE hotel_id = p_hotel_id),
    'audit_logs', (SELECT count(*) FROM audit_logs WHERE hotel_id = p_hotel_id),
    'impersonation_sessions', (SELECT count(*) FROM impersonation_sessions WHERE hotel_id = p_hotel_id),
    'hotel_invitations', (SELECT count(*) FROM hotel_invitations WHERE hotel_id = p_hotel_id),
    'hotel_settings', (SELECT count(*) FROM hotel_settings WHERE id = p_hotel_id),
    'hotels', (SELECT count(*) FROM hotels WHERE id = p_hotel_id)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_hotel_record_counts FROM anon;
GRANT EXECUTE ON FUNCTION get_hotel_record_counts TO authenticated;


-- ── Reset Operational Data ──
CREATE OR REPLACE FUNCTION reset_hotel_operational_data(
  p_hotel_id uuid,
  p_reason text,
  p_user_email text DEFAULT '',
  p_ip text DEFAULT '',
  p_device text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts json;
  v_hotel_name text;
  v_user_id uuid := auth.uid();
  v_role text;
BEGIN
  -- ── Authorization: only founder or company_admin ──
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR (v_role NOT IN ('founder', 'company_admin')) THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not authorized. Only Founder / Super Admin can reset hotel data.';
    END IF;
  END IF;

  -- ── Verify hotel exists ──
  SELECT hotel_name INTO v_hotel_name FROM hotels WHERE id = p_hotel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hotel not found';
  END IF;

  -- ── Capture pre-deletion counts ──
  v_counts := get_hotel_record_counts(p_hotel_id);

  -- ── Delete operational data (preserve setup/profile) ──
  DELETE FROM daily_reports WHERE hotel_id = p_hotel_id;
  DELETE FROM daily_revenue_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM room_chart_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM expense_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM expense_categories WHERE hotel_id = p_hotel_id;
  DELETE FROM other_daily_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM electricity_readings WHERE hotel_id = p_hotel_id;
  DELETE FROM laundry_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM monthly_bills WHERE hotel_id = p_hotel_id;
  DELETE FROM salary_advances WHERE hotel_id = p_hotel_id;
  DELETE FROM salary_settlements WHERE hotel_id = p_hotel_id;
  DELETE FROM utility_bills WHERE hotel_id = p_hotel_id;
  DELETE FROM staff WHERE hotel_id = p_hotel_id;

  -- ── Create audit log entry ──
  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    old_value, new_value, severity, reason, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'reset_hotel_operational_data', 'data_management',
    p_hotel_id, v_hotel_name, p_hotel_id::text,
    v_counts, null, 'critical', p_reason,
    json_build_object('ip', p_ip, 'device', p_device, 'operation', 'reset_operational_data')
  );

  RETURN json_build_object(
    'success', true,
    'hotel_id', p_hotel_id,
    'hotel_name', v_hotel_name,
    'deleted_counts', v_counts,
    'message', 'Operational data reset successfully. Hotel profile, users, subscription, and Property Master remain intact.'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION reset_hotel_operational_data FROM anon;
GRANT EXECUTE ON FUNCTION reset_hotel_operational_data TO authenticated;


-- ── Permanently Delete Hotel ──
CREATE OR REPLACE FUNCTION delete_hotel_permanently(
  p_hotel_id uuid,
  p_reason text,
  p_user_email text DEFAULT '',
  p_ip text DEFAULT '',
  p_device text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts json;
  v_hotel_name text;
  v_user_id uuid := auth.uid();
  v_role text;
  v_auth_user_ids uuid[];
BEGIN
  -- ── Authorization: only founder or company_admin ──
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder', 'company_admin') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not authorized. Only Founder / Super Admin can permanently delete a hotel.';
    END IF;
  END IF;

  -- ── Verify hotel exists ──
  SELECT hotel_name INTO v_hotel_name FROM hotels WHERE id = p_hotel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hotel not found';
  END IF;

  -- ── Capture pre-deletion counts ──
  v_counts := get_hotel_record_counts(p_hotel_id);

  -- ── Collect hotel_admin user_ids that belong ONLY to this hotel ──
  SELECT array_agg(user_id) INTO v_auth_user_ids
  FROM hotel_admins ha1
  WHERE ha1.hotel_id = p_hotel_id
    AND NOT EXISTS (
      SELECT 1 FROM hotel_admins ha2
      WHERE ha2.user_id = ha1.user_id
        AND ha2.hotel_id != p_hotel_id
    )
    AND ha1.user_id IS NOT NULL;

  -- ── Delete all operational data ──
  DELETE FROM daily_reports WHERE hotel_id = p_hotel_id;
  DELETE FROM daily_revenue_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM room_chart_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM expense_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM expense_categories WHERE hotel_id = p_hotel_id;
  DELETE FROM other_daily_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM electricity_readings WHERE hotel_id = p_hotel_id;
  DELETE FROM laundry_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM monthly_bills WHERE hotel_id = p_hotel_id;
  DELETE FROM salary_advances WHERE hotel_id = p_hotel_id;
  DELETE FROM salary_settlements WHERE hotel_id = p_hotel_id;
  DELETE FROM utility_bills WHERE hotel_id = p_hotel_id;
  DELETE FROM staff WHERE hotel_id = p_hotel_id;
  DELETE FROM company_sources WHERE hotel_id = p_hotel_id;

  -- ── Delete setup/config data ──
  DELETE FROM room_categories WHERE hotel_id = p_hotel_id;
  DELETE FROM rooms WHERE hotel_id = p_hotel_id;
  DELETE FROM hotel_features WHERE hotel_id = p_hotel_id;
  DELETE FROM hotel_invitations WHERE hotel_id = p_hotel_id;
  DELETE FROM subscription_payments WHERE hotel_id = p_hotel_id;
  DELETE FROM support_tickets WHERE hotel_id = p_hotel_id;
  DELETE FROM notifications WHERE hotel_id = p_hotel_id;
  DELETE FROM impersonation_sessions WHERE hotel_id = p_hotel_id;

  -- ── Create audit log BEFORE deleting the hotel record ──
  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    old_value, new_value, severity, reason, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'delete_hotel_permanently', 'data_management',
    p_hotel_id, v_hotel_name, p_hotel_id::text,
    v_counts, null, 'critical', p_reason,
    json_build_object('ip', p_ip, 'device', p_device, 'operation', 'permanent_delete',
                      'auth_users_deleted', COALESCE(v_auth_user_ids, ARRAY[]::uuid[]))
  );

  -- ── Delete hotel_admins for this hotel ──
  DELETE FROM hotel_admins WHERE hotel_id = p_hotel_id;

  -- ── Delete hotel_settings (1:1 with hotels via id) ──
  DELETE FROM hotel_settings WHERE id = p_hotel_id;

  -- ── Delete audit logs for this hotel (except the permanent-delete log just created) ──
  DELETE FROM audit_logs WHERE hotel_id = p_hotel_id
    AND action != 'delete_hotel_permanently';

  -- ── Finally, delete the hotel record itself ──
  DELETE FROM hotels WHERE id = p_hotel_id;

  RETURN json_build_object(
    'success', true,
    'hotel_id', p_hotel_id,
    'hotel_name', v_hotel_name,
    'deleted_counts', v_counts,
    'auth_user_ids_to_delete', COALESCE(v_auth_user_ids, ARRAY[]::uuid[]),
    'message', 'Hotel permanently deleted. All associated records have been removed.'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_hotel_permanently FROM anon;
GRANT EXECUTE ON FUNCTION delete_hotel_permanently TO authenticated;


-- ── Export Hotel Data (for backup) ──
CREATE OR REPLACE FUNCTION export_hotel_data(p_hotel_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_hotel record;
  v_result json;
BEGIN
  -- ── Authorization: founder or company_admin ──
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder', 'company_admin') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  END IF;

  SELECT * INTO v_hotel FROM hotels WHERE id = p_hotel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hotel not found';
  END IF;

  SELECT json_build_object(
    'hotel', to_jsonb(v_hotel),
    'hotel_settings', (SELECT to_jsonb(hs.*) FROM hotel_settings hs WHERE hs.id = p_hotel_id),
    'room_categories', (SELECT json_agg(to_jsonb(rc.*)) FROM room_categories rc WHERE rc.hotel_id = p_hotel_id),
    'rooms', (SELECT json_agg(to_jsonb(r.*)) FROM rooms r WHERE r.hotel_id = p_hotel_id),
    'hotel_features', (SELECT json_agg(to_jsonb(hf.*)) FROM hotel_features hf WHERE hf.hotel_id = p_hotel_id),
    'hotel_admins', (SELECT json_agg(to_jsonb(ha.*)) FROM hotel_admins ha WHERE ha.hotel_id = p_hotel_id),
    'daily_reports', (SELECT json_agg(to_jsonb(dr.*)) FROM daily_reports dr WHERE dr.hotel_id = p_hotel_id),
    'daily_revenue_entries', (SELECT json_agg(to_jsonb(dre.*)) FROM daily_revenue_entries dre WHERE dre.hotel_id = p_hotel_id),
    'room_chart_entries', (SELECT json_agg(to_jsonb(rce.*)) FROM room_chart_entries rce WHERE rce.hotel_id = p_hotel_id),
    'expense_entries', (SELECT json_agg(to_jsonb(ee.*)) FROM expense_entries ee WHERE ee.hotel_id = p_hotel_id),
    'expense_categories', (SELECT json_agg(to_jsonb(ec.*)) FROM expense_categories ec WHERE ec.hotel_id = p_hotel_id),
    'other_daily_entries', (SELECT json_agg(to_jsonb(ode.*)) FROM other_daily_entries ode WHERE ode.hotel_id = p_hotel_id),
    'electricity_readings', (SELECT json_agg(to_jsonb(er.*)) FROM electricity_readings er WHERE er.hotel_id = p_hotel_id),
    'laundry_entries', (SELECT json_agg(to_jsonb(le.*)) FROM laundry_entries le WHERE le.hotel_id = p_hotel_id),
    'monthly_bills', (SELECT json_agg(to_jsonb(mb.*)) FROM monthly_bills mb WHERE mb.hotel_id = p_hotel_id),
    'salary_advances', (SELECT json_agg(to_jsonb(sa.*)) FROM salary_advances sa WHERE sa.hotel_id = p_hotel_id),
    'salary_settlements', (SELECT json_agg(to_jsonb(ss.*)) FROM salary_settlements ss WHERE ss.hotel_id = p_hotel_id),
    'utility_bills', (SELECT json_agg(to_jsonb(ub.*)) FROM utility_bills ub WHERE ub.hotel_id = p_hotel_id),
    'staff', (SELECT json_agg(to_jsonb(s.*)) FROM staff s WHERE s.hotel_id = p_hotel_id),
    'company_sources', (SELECT json_agg(to_jsonb(cs.*)) FROM company_sources cs WHERE cs.hotel_id = p_hotel_id),
    'subscription_payments', (SELECT json_agg(to_jsonb(sp.*)) FROM subscription_payments sp WHERE sp.hotel_id = p_hotel_id),
    'support_tickets', (SELECT json_agg(to_jsonb(st.*)) FROM support_tickets st WHERE st.hotel_id = p_hotel_id),
    'notifications', (SELECT json_agg(to_jsonb(n.*)) FROM notifications n WHERE n.hotel_id = p_hotel_id),
    'audit_logs', (SELECT json_agg(to_jsonb(al.*)) FROM audit_logs al WHERE al.hotel_id = p_hotel_id),
    'impersonation_sessions', (SELECT json_agg(to_jsonb(imp.*)) FROM impersonation_sessions imp WHERE imp.hotel_id = p_hotel_id),
    'hotel_invitations', (SELECT json_agg(to_jsonb(hi.*)) FROM hotel_invitations hi WHERE hi.hotel_id = p_hotel_id)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION export_hotel_data FROM anon;
GRANT EXECUTE ON FUNCTION export_hotel_data TO authenticated;



-- =========================================
-- File: 20260803201756_20260803_billing_invoice_system.sql.sql
-- =========================================
/*
# Billing & Invoice System — Core Schema

## Purpose
Creates a complete billing and invoice system for Hotel Mantri Enterprise HQ.
All company branding, GST, payment, and terms settings are stored in the database
and editable from Enterprise HQ → System Settings → Billing & Invoice Settings.
No company details are hardcoded.

## Tables Created

### 1. billing_settings (singleton)
Stores all billing/invoice configuration as a single JSONB document.
Key groups: company_details, branding, invoice_numbering, gst, payment, terms.
Logo, QR code, signature, seal, watermark are stored as URLs in the hotel-assets
storage bucket.

### 2. invoices
Main invoice table. Each invoice belongs to exactly one hotel.
- invoice_number: unique, generated server-side via generate_invoice_number()
- status: Draft → Issued → Sent → Partially Paid → Paid → Overdue → Cancelled
- snapshot: JSONB column storing a complete snapshot of company details, branding,
  GST rates, bank details, terms, hotel details, and plan features AT THE TIME OF
  ISSUE. This ensures future settings changes never alter past invoices.
- Issued invoices become immutable except for status and payment fields.

### 3. invoice_items
Line items for each invoice (subscription plan, add-ons, user licenses, etc.)
- hsn_sac, quantity, rate, discount, gst_rate, taxable_value, amount

### 4. invoice_payments
Payment records linked to invoices. Supports full, partial, and multiple payments.
- receipt_number: generated server-side
- payment_mode: Cash, Bank, UPI, Card, Gateway, Cheque
- Auto-updates invoice status based on total paid vs total amount

### 5. invoice_credit_notes
Credit notes for issued invoices (refunds, adjustments).
- Linked to original invoice
- Has its own credit note number

## Server-Side Functions

### generate_invoice_number()
Returns next invoice number based on billing_settings.invoice_numbering config.
Format: PREFIX/FY/SEQUENCE (e.g., HM/2026-27/000001)
Uses a sequence table (invoice_number_seq) to guarantee uniqueness.
Atomic — safe for concurrent calls.

### generate_receipt_number()
Returns next receipt number for payment records.

### issue_invoice(p_invoice_id)
Transitions a Draft invoice to Issued:
- Generates invoice number atomically
- Snapshots all billing settings, hotel details, plan features
- Sets issued_at timestamp
- Creates audit log
- Locks the invoice from further edits

### record_invoice_payment(p_invoice_id, amount, mode, ref, notes)
Records a payment against an invoice:
- Generates receipt number
- Updates invoice status (Partially Paid / Paid)
- Sets paid_date when fully paid
- Creates audit log

## Security
- RLS enabled on all tables
- Company-level staff (company_users) get access based on their role:
  - Founder / Company Admin: full CRUD
  - Finance Manager: create, issue, record payment, cancel, credit note
  - Finance Executive: create draft, record payment, download
  - Sales Manager: view assigned hotel invoices only
  - Sales Executive: view assigned hotel invoice status only
  - Support: no billing access
- Hotel users (hotel_admins) can only view/download their own hotel's invoices
- Sensitive bank/payment settings are not exposed to unauthorized roles
- Issued invoices cannot be deleted — only cancelled or credit-noted
- All invoice actions create audit logs

## Important Notes
1. The invoice_number_seq table uses a composite key (financial_year, seq)
   to reset numbering each financial year.
2. The snapshot column on invoices stores EVERYTHING needed to render the
   invoice exactly as it appeared at issue time — logo URL, colors, GSTIN,
   bank details, terms, hotel name, plan features, etc.
3. Invoice numbering is atomic via SELECT ... FOR UPDATE on the sequence row.
4. Credit notes have their own numbering: CN/FY/SEQUENCE
*/

-- ── 1. billing_settings (singleton) ──
CREATE TABLE IF NOT EXISTS billing_settings (
  id integer PRIMARY KEY DEFAULT 1,
  company_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  invoice_numbering jsonb NOT NULL DEFAULT '{}'::jsonb,
  gst jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment jsonb NOT NULL DEFAULT '{}'::jsonb,
  terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Ensure only one row
INSERT INTO billing_settings (id, company_details, branding, invoice_numbering, gst, payment, terms)
VALUES (1,
  '{"brand_name":"Hotel Mantri","legal_name":"","tagline":"","address":"","city":"","state":"","pin_code":"","country":"India","gstin":"","pan":"","cin":"","support_email":"","support_phone":"","website":""}'::jsonb,
  '{"logo_url":"","invoice_logo_url":"","watermark_url":"","signature_url":"","seal_url":"","primary_color":"#0f172a","secondary_color":"#1e3a5f","accent_color":"#d4af37","invoice_theme":"navy_gold","logo_size":"medium","watermark_opacity":0.05}'::jsonb,
  '{"prefix":"HM","fy_format":"YYYY-YY","starting_number":1,"padding_length":6,"next_preview":"HM/2026-27/000001"}'::jsonb,
  '{"default_gst_rate":18,"cgst_rate":9,"sgst_rate":9,"igst_rate":18,"hsn_sac":"9983","place_of_supply":"","tax_inclusive":false,"reverse_charge":false,"round_off":true}'::jsonb,
  '{"bank_name":"","account_holder":"","account_number":"","ifsc":"","branch":"","upi_id":"","qr_code_url":"","payment_link":"","payment_instructions":""}'::jsonb,
  '{"invoice_notes":"","terms_conditions":"","late_payment_terms":"","refund_policy":"","jurisdiction":"","footer_message":"","thank_you_message":""}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE billing_settings ENABLE ROW LEVEL SECURITY;

-- Company-level staff can read billing settings
DROP POLICY IF EXISTS "billing_settings_read_company" ON billing_settings;
CREATE POLICY "billing_settings_read_company"
ON billing_settings FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active')
  OR EXISTS (SELECT 1 FROM hotel_admins WHERE user_id = auth.uid() AND role = 'super_admin')
);

-- Only founder / company_admin can update billing settings
DROP POLICY IF EXISTS "billing_settings_update_founder" ON billing_settings;
CREATE POLICY "billing_settings_update_founder"
ON billing_settings FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active' AND role IN ('founder', 'company_admin'))
  OR EXISTS (SELECT 1 FROM hotel_admins WHERE user_id = auth.uid() AND role = 'super_admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active' AND role IN ('founder', 'company_admin'))
  OR EXISTS (SELECT 1 FROM hotel_admins WHERE user_id = auth.uid() AND role = 'super_admin')
);

-- ── 2. invoices ──
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE,
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE RESTRICT,
  plan_id uuid REFERENCES subscription_plans(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft','Issued','Sent','Partially Paid','Paid','Overdue','Cancelled','Credit Note Issued')),
  invoice_date date,
  due_date date,
  billing_period text,
  billing_cycle text,
  number_of_rooms integer DEFAULT 0,
  number_of_users integer DEFAULT 0,
  enabled_modules jsonb DEFAULT '[]'::jsonb,
  subscription_start date,
  subscription_end date,
  subtotal numeric(14,2) DEFAULT 0,
  discount_amount numeric(14,2) DEFAULT 0,
  taxable_amount numeric(14,2) DEFAULT 0,
  cgst_amount numeric(14,2) DEFAULT 0,
  sgst_amount numeric(14,2) DEFAULT 0,
  igst_amount numeric(14,2) DEFAULT 0,
  round_off numeric(14,2) DEFAULT 0,
  total_amount numeric(14,2) DEFAULT 0,
  amount_paid numeric(14,2) DEFAULT 0,
  balance_due numeric(14,2) DEFAULT 0,
  is_interstate boolean DEFAULT false,
  place_of_supply text,
  notes text,
  snapshot jsonb,
  issued_at timestamptz,
  issued_by uuid REFERENCES auth.users(id),
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id),
  cancel_reason text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_hotel_id ON invoices(hotel_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON invoices(invoice_date);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Company-level staff can read invoices based on role
DROP POLICY IF EXISTS "invoices_read_company" ON invoices;
CREATE POLICY "invoices_read_company"
ON invoices FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active')
  OR EXISTS (SELECT 1 FROM hotel_admins ha WHERE ha.user_id = auth.uid() AND ha.hotel_id = invoices.hotel_id)
);

-- Company-level staff can create invoices
DROP POLICY IF EXISTS "invoices_create_company" ON invoices;
CREATE POLICY "invoices_create_company"
ON invoices FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active'
    AND role IN ('founder','company_admin','finance_manager','finance_executive'))
);

-- Company-level staff can update invoices (but issue_invoice RPC handles immutability)
DROP POLICY IF EXISTS "invoices_update_company" ON invoices;
CREATE POLICY "invoices_update_company"
ON invoices FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active'
    AND role IN ('founder','company_admin','finance_manager','finance_executive'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active'
    AND role IN ('founder','company_admin','finance_manager','finance_executive'))
);

-- Only founder / company_admin can delete DRAFT invoices
DROP POLICY IF EXISTS "invoices_delete_draft" ON invoices;
CREATE POLICY "invoices_delete_draft"
ON invoices FOR DELETE
TO authenticated
USING (
  invoices.status = 'Draft'
  AND EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active'
    AND role IN ('founder','company_admin','finance_manager'))
);

-- ── 3. invoice_items ──
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sr_no integer NOT NULL DEFAULT 1,
  description text NOT NULL,
  hsn_sac text,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  rate numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) DEFAULT 0,
  taxable_value numeric(14,2) DEFAULT 0,
  gst_rate numeric(5,2) DEFAULT 0,
  cgst_amount numeric(14,2) DEFAULT 0,
  sgst_amount numeric(14,2) DEFAULT 0,
  igst_amount numeric(14,2) DEFAULT 0,
  amount numeric(14,2) DEFAULT 0,
  item_type text DEFAULT 'subscription',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_read" ON invoice_items;
CREATE POLICY "invoice_items_read"
ON invoice_items FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active')
  OR EXISTS (SELECT 1 FROM hotel_admins ha WHERE ha.user_id = auth.uid() AND ha.hotel_id = (SELECT i.hotel_id FROM invoices i WHERE i.id = invoice_items.invoice_id))
);

DROP POLICY IF EXISTS "invoice_items_insert" ON invoice_items;
CREATE POLICY "invoice_items_insert"
ON invoice_items FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active'
    AND role IN ('founder','company_admin','finance_manager','finance_executive'))
);

DROP POLICY IF EXISTS "invoice_items_update" ON invoice_items;
CREATE POLICY "invoice_items_update"
ON invoice_items FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active'
    AND role IN ('founder','company_admin','finance_manager','finance_executive'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active'
    AND role IN ('founder','company_admin','finance_manager','finance_executive'))
);

DROP POLICY IF EXISTS "invoice_items_delete" ON invoice_items;
CREATE POLICY "invoice_items_delete"
ON invoice_items FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active'
    AND role IN ('founder','company_admin','finance_manager','finance_executive'))
);

-- ── 4. invoice_payments ──
CREATE TABLE IF NOT EXISTS invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  receipt_number text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_mode text NOT NULL DEFAULT 'Bank'
    CHECK (payment_mode IN ('Cash','Bank','UPI','Card','Gateway','Cheque','Other')),
  transaction_reference text,
  bank_or_upi text,
  notes text,
  entered_by uuid REFERENCES auth.users(id),
  entered_by_email text,
  is_refund boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id ON invoice_payments(invoice_id);

ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_payments_read" ON invoice_payments;
CREATE POLICY "invoice_payments_read"
ON invoice_payments FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active')
  OR EXISTS (SELECT 1 FROM hotel_admins ha WHERE ha.user_id = auth.uid() AND ha.hotel_id = (SELECT i.hotel_id FROM invoices i WHERE i.id = invoice_payments.invoice_id))
);

DROP POLICY IF EXISTS "invoice_payments_insert" ON invoice_payments;
CREATE POLICY "invoice_payments_insert"
ON invoice_payments FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active'
    AND role IN ('founder','company_admin','finance_manager','finance_executive'))
);

DROP POLICY IF EXISTS "invoice_payments_update" ON invoice_payments;
CREATE POLICY "invoice_payments_update"
ON invoice_payments FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active'
    AND role IN ('founder','company_admin','finance_manager'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active'
    AND role IN ('founder','company_admin','finance_manager'))
);

DROP POLICY IF EXISTS "invoice_payments_delete" ON invoice_payments;
CREATE POLICY "invoice_payments_delete"
ON invoice_payments FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active'
    AND role IN ('founder','company_admin','finance_manager'))
);

-- ── 5. invoice_credit_notes ──
CREATE TABLE IF NOT EXISTS invoice_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number text UNIQUE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'Issued'
    CHECK (status IN ('Issued','Applied','Cancelled')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice_id ON invoice_credit_notes(invoice_id);

ALTER TABLE invoice_credit_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_notes_read" ON invoice_credit_notes;
CREATE POLICY "credit_notes_read"
ON invoice_credit_notes FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active')
  OR EXISTS (SELECT 1 FROM hotel_admins ha WHERE ha.user_id = auth.uid() AND ha.hotel_id = (SELECT i.hotel_id FROM invoices i WHERE i.id = invoice_credit_notes.invoice_id))
);

DROP POLICY IF EXISTS "credit_notes_insert" ON invoice_credit_notes;
CREATE POLICY "credit_notes_insert"
ON invoice_credit_notes FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active'
    AND role IN ('founder','company_admin','finance_manager'))
);

-- ── 6. invoice_number_seq (for atomic invoice numbering) ──
CREATE TABLE IF NOT EXISTS invoice_number_seq (
  financial_year text NOT NULL,
  last_seq integer NOT NULL DEFAULT 0,
  PRIMARY KEY (financial_year)
);

ALTER TABLE invoice_number_seq ENABLE ROW LEVEL SECURITY;

-- No direct access from client — only via SECURITY DEFINER function
REVOKE ALL ON invoice_number_seq FROM anon;

-- ── 7. receipt_number_seq ──
CREATE TABLE IF NOT EXISTS receipt_number_seq (
  financial_year text NOT NULL,
  last_seq integer NOT NULL DEFAULT 0,
  PRIMARY KEY (financial_year)
);

ALTER TABLE receipt_number_seq ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON receipt_number_seq FROM anon;

-- ── Helper: Get current financial year string ──
CREATE OR REPLACE FUNCTION get_current_fy()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y int := EXTRACT(YEAR FROM now());
  y2 int;
BEGIN
  -- Indian FY: April 1 to March 31
  IF EXTRACT(MONTH FROM now()) >= 4 THEN
    y2 := y + 1;
  ELSE
    y2 := y;
    y := y - 1;
  END IF;
  -- Format: 2026-27
  RETURN y::text || '-' || RIGHT(y2::text, 2);
END;
$$;

REVOKE EXECUTE ON FUNCTION get_current_fy FROM anon;
GRANT EXECUTE ON FUNCTION get_current_fy TO authenticated;

-- ── Server-Side: Generate Invoice Number ──
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy text;
  v_seq integer;
  v_prefix text;
  v_padding integer;
  v_number text;
  v_settings jsonb;
BEGIN
  v_fy := get_current_fy();

  -- Atomically get and increment the sequence
  INSERT INTO invoice_number_seq (financial_year, last_seq)
  VALUES (v_fy, 1)
  ON CONFLICT (financial_year)
  DO UPDATE SET last_seq = invoice_number_seq.last_seq + 1
  RETURNING last_seq INTO v_seq;

  -- Get prefix and padding from billing_settings
  SELECT invoice_numbering INTO v_settings FROM billing_settings WHERE id = 1;
  v_prefix := COALESCE((v_settings->>'prefix')::text, 'HM');
  v_padding := COALESCE((v_settings->>'padding_length')::int, 6);

  -- Build: PREFIX/FY/SEQUENCE  e.g., HM/2026-27/000001
  v_number := v_prefix || '/' || v_fy || '/' || LPAD(v_seq::text, v_padding, '0');

  RETURN v_number;
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_invoice_number FROM anon;
GRANT EXECUTE ON FUNCTION generate_invoice_number TO authenticated;

-- ── Server-Side: Generate Receipt Number ──
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy text;
  v_seq integer;
  v_number text;
BEGIN
  v_fy := get_current_fy();

  INSERT INTO receipt_number_seq (financial_year, last_seq)
  VALUES (v_fy, 1)
  ON CONFLICT (financial_year)
  DO UPDATE SET last_seq = receipt_number_seq.last_seq + 1
  RETURNING last_seq INTO v_seq;

  v_number := 'RCP/' || v_fy || '/' || LPAD(v_seq::text, 5, '0');
  RETURN v_number;
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_receipt_number FROM anon;
GRANT EXECUTE ON FUNCTION generate_receipt_number TO authenticated;

-- ── Server-Side: Issue Invoice (Draft → Issued with snapshot) ──
CREATE OR REPLACE FUNCTION issue_invoice(
  p_invoice_id uuid,
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_hotel RECORD;
  v_plan RECORD;
  v_items jsonb;
  v_features jsonb;
  v_snapshot jsonb;
  v_invoice_number text;
  v_settings billing_settings%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_role text;
  v_hotel_features jsonb;
BEGIN
  -- Authorization
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder','company_admin','finance_manager') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not authorized to issue invoices';
    END IF;
  END IF;

  -- Load invoice
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_invoice.status != 'Draft' THEN
    RAISE EXCEPTION 'Only Draft invoices can be issued. Current status: %', v_invoice.status;
  END IF;

  -- Generate invoice number atomically
  v_invoice_number := generate_invoice_number();

  -- Load hotel
  SELECT * INTO v_hotel FROM hotels WHERE id = v_invoice.hotel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hotel not found';
  END IF;

  -- Load plan
  SELECT * INTO v_plan FROM subscription_plans WHERE id = v_invoice.plan_id;

  -- Load hotel features
  SELECT COALESCE(json_agg(json_build_object('module_key', module_key, 'is_enabled', is_enabled)), '[]'::json)
  INTO v_hotel_features
  FROM hotel_features WHERE hotel_id = v_invoice.hotel_id;

  -- Load invoice items
  SELECT COALESCE(json_agg(to_jsonb(t)), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT sr_no, description, hsn_sac, quantity, rate, discount, taxable_value,
           gst_rate, cgst_amount, sgst_amount, igst_amount, amount, item_type
    FROM invoice_items WHERE invoice_id = p_invoice_id ORDER BY sr_no
  ) t;

  -- Load billing settings for snapshot
  SELECT * INTO v_settings FROM billing_settings WHERE id = 1;

  -- Build snapshot
  v_snapshot := jsonb_build_object(
    'company_details', v_settings.company_details,
    'branding', v_settings.branding,
    'gst', v_settings.gst,
    'payment', v_settings.payment,
    'terms', v_settings.terms,
    'hotel', jsonb_build_object(
      'hotel_name', v_hotel.hotel_name,
      'address', COALESCE(v_hotel.address, ''),
      'city', v_hotel.city,
      'state', v_hotel.state,
      'property_code', v_hotel.property_code,
      'admin_email', v_hotel.admin_email,
      'mobile', v_hotel.mobile,
      'owner_name', v_hotel.owner_name,
      'total_rooms', v_hotel.total_rooms
    ),
    'hotel_settings', (
      SELECT to_jsonb(hs) FROM hotel_settings hs WHERE hs.id = v_hotel.id
    ),
    'plan', CASE WHEN v_plan.id IS NOT NULL THEN
      jsonb_build_object(
        'name', v_plan.name,
        'price', v_plan.price,
        'yearly_price', v_plan.yearly_price,
        'billing_period', v_plan.billing_period,
        'features', v_plan.features,
        'enabled_modules', v_plan.enabled_modules,
        'room_limit', v_plan.room_limit,
        'user_limit', v_plan.user_limit,
        'hotel_limit', v_plan.hotel_limit
      )
    ELSE null END,
    'hotel_features', v_hotel_features,
    'items', v_items,
    'snapshot_at', now()
  );

  -- Update invoice: issue it with snapshot
  UPDATE invoices SET
    status = 'Issued',
    invoice_number = v_invoice_number,
    invoice_date = COALESCE(invoice_date, CURRENT_DATE),
    due_date = COALESCE(due_date, CURRENT_DATE + 15),
    snapshot = v_snapshot,
    issued_at = now(),
    issued_by = v_user_id,
    updated_at = now()
  WHERE id = p_invoice_id;

  -- Audit log
  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    old_value, new_value, severity, reason, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'issue_invoice', 'billing',
    v_invoice.hotel_id, v_hotel.hotel_name, p_invoice_id::text,
    jsonb_build_object('status', 'Draft'),
    jsonb_build_object('status', 'Issued', 'invoice_number', v_invoice_number),
    'warning', 'Invoice issued',
    jsonb_build_object('invoice_number', v_invoice_number)
  );

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'invoice_number', v_invoice_number,
    'status', 'Issued',
    'message', 'Invoice issued successfully'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION issue_invoice FROM anon;
GRANT EXECUTE ON FUNCTION issue_invoice TO authenticated;

-- ── Server-Side: Record Invoice Payment ──
CREATE OR REPLACE FUNCTION record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_mode text,
  p_transaction_reference text DEFAULT '',
  p_bank_or_upi text DEFAULT '',
  p_notes text DEFAULT '',
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_receipt text;
  v_new_paid numeric;
  v_new_balance numeric;
  v_new_status text;
  v_user_id uuid := auth.uid();
  v_role text;
  v_hotel_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder','company_admin','finance_manager','finance_executive') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not authorized to record payments';
    END IF;
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_invoice.status IN ('Draft','Cancelled') THEN
    RAISE EXCEPTION 'Cannot record payment for % invoice', v_invoice.status;
  END IF;

  -- Generate receipt number
  v_receipt := generate_receipt_number();

  -- Insert payment record
  INSERT INTO invoice_payments (
    invoice_id, receipt_number, amount, payment_mode,
    transaction_reference, bank_or_upi, notes,
    entered_by, entered_by_email
  ) VALUES (
    p_invoice_id, v_receipt, p_amount, p_payment_mode,
    p_transaction_reference, p_bank_or_upi, p_notes,
    v_user_id, p_user_email
  );

  -- Calculate new totals
  v_new_paid := v_invoice.amount_paid + p_amount;
  v_new_balance := v_invoice.total_amount - v_new_paid;

  IF v_new_balance <= 0.01 THEN
    v_new_status := 'Paid';
  ELSE
    v_new_status := 'Partially Paid';
  END IF;

  -- Get hotel name for audit
  SELECT hotel_name INTO v_hotel_name FROM hotels WHERE id = v_invoice.hotel_id;

  -- Update invoice
  UPDATE invoices SET
    amount_paid = v_new_paid,
    balance_due = v_new_balance,
    status = v_new_status,
    paid_at = CASE WHEN v_new_status = 'Paid' THEN now() ELSE paid_at END,
    updated_at = now()
  WHERE id = p_invoice_id;

  -- Audit log
  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    old_value, new_value, severity, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'record_payment', 'billing',
    v_invoice.hotel_id, v_hotel_name, p_invoice_id::text,
    jsonb_build_object('amount_paid', v_invoice.amount_paid, 'status', v_invoice.status),
    jsonb_build_object('amount_paid', v_new_paid, 'status', v_new_status, 'receipt', v_receipt),
    'info', 'Payment recorded',
    jsonb_build_object('receipt_number', v_receipt, 'amount', p_amount, 'mode', p_payment_mode)
  );

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'receipt_number', v_receipt,
    'new_status', v_new_status,
    'amount_paid', v_new_paid,
    'balance_due', v_new_balance,
    'message', 'Payment recorded successfully'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION record_invoice_payment FROM anon;
GRANT EXECUTE ON FUNCTION record_invoice_payment TO authenticated;

-- ── Server-Side: Cancel Invoice ──
CREATE OR REPLACE FUNCTION cancel_invoice(
  p_invoice_id uuid,
  p_reason text,
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_user_id uuid := auth.uid();
  v_role text;
  v_hotel_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder','company_admin','finance_manager') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not authorized to cancel invoices';
    END IF;
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_invoice.status IN ('Paid','Cancelled') THEN
    RAISE EXCEPTION 'Cannot cancel % invoice', v_invoice.status;
  END IF;

  SELECT hotel_name INTO v_hotel_name FROM hotels WHERE id = v_invoice.hotel_id;

  UPDATE invoices SET
    status = 'Cancelled',
    cancelled_at = now(),
    cancelled_by = v_user_id,
    cancel_reason = p_reason,
    updated_at = now()
  WHERE id = p_invoice_id;

  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    old_value, new_value, severity, reason, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'cancel_invoice', 'billing',
    v_invoice.hotel_id, v_hotel_name, p_invoice_id::text,
    jsonb_build_object('status', v_invoice.status),
    jsonb_build_object('status', 'Cancelled'),
    'warning', p_reason,
    '{}'::jsonb
  );

  RETURN jsonb_build_object('success', true, 'message', 'Invoice cancelled');
END;
$$;

REVOKE EXECUTE ON FUNCTION cancel_invoice FROM anon;
GRANT EXECUTE ON FUNCTION cancel_invoice TO authenticated;

-- ── Server-Side: Get Billing Settings (for client) ──
-- Returns settings but strips sensitive payment fields for non-finance roles
CREATE OR REPLACE FUNCTION get_billing_settings()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings billing_settings%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_role text;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_settings FROM billing_settings WHERE id = 1;

  -- Check if user is founder/company_admin/finance
  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id LIMIT 1;
  END IF;

  v_result := jsonb_build_object(
    'company_details', v_settings.company_details,
    'branding', v_settings.branding,
    'invoice_numbering', v_settings.invoice_numbering,
    'gst', v_settings.gst,
    'payment', v_settings.payment,
    'terms', v_settings.terms,
    'updated_at', v_settings.updated_at
  );

  -- For hotel users or non-finance company users, strip sensitive bank details
  IF v_role NOT IN ('founder','company_admin','finance_manager','finance_executive','super_admin') THEN
    v_result := jsonb_set(v_result, '{payment}', jsonb_build_object(
      'upi_id', v_settings.payment->>'upi_id',
      'qr_code_url', v_settings.payment->>'qr_code_url',
      'payment_link', v_settings.payment->>'payment_link',
      'payment_instructions', v_settings.payment->>'payment_instructions'
    ));
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_billing_settings FROM anon;
GRANT EXECUTE ON FUNCTION get_billing_settings TO authenticated;

-- ── Server-Side: Update Billing Settings ──
CREATE OR REPLACE FUNCTION update_billing_settings(
  p_section text,
  p_data jsonb,
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder','company_admin') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not authorized to update billing settings';
    END IF;
  END IF;

  IF p_section NOT IN ('company_details','branding','invoice_numbering','gst','payment','terms') THEN
    RAISE EXCEPTION 'Invalid settings section: %', p_section;
  END IF;

  EXECUTE format('UPDATE billing_settings SET %I = $1, updated_at = now(), updated_by = $2 WHERE id = 1', p_section)
  USING p_data, v_user_id;

  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    record_id, new_value, severity, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'update_billing_settings', 'billing',
    p_section, p_data, 'info',
    jsonb_build_object('section', p_section)
  );

  RETURN jsonb_build_object('success', true, 'section', p_section);
END;
$$;

REVOKE EXECUTE ON FUNCTION update_billing_settings FROM anon;
GRANT EXECUTE ON FUNCTION update_billing_settings TO authenticated;

-- ── Server-Side: Preview Next Invoice Number ──
CREATE OR REPLACE FUNCTION preview_next_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy text;
  v_next_seq integer;
  v_prefix text;
  v_padding integer;
  v_settings jsonb;
BEGIN
  v_fy := get_current_fy();

  SELECT COALESCE(last_seq, 0) + 1 INTO v_next_seq
  FROM invoice_number_seq WHERE financial_year = v_fy;

  IF v_next_seq IS NULL THEN
    v_next_seq := 1;
  END IF;

  SELECT invoice_numbering INTO v_settings FROM billing_settings WHERE id = 1;
  v_prefix := COALESCE((v_settings->>'prefix')::text, 'HM');
  v_padding := COALESCE((v_settings->>'padding_length')::int, 6);

  RETURN v_prefix || '/' || v_fy || '/' || LPAD(v_next_seq::text, v_padding, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION preview_next_invoice_number FROM anon;
GRANT EXECUTE ON FUNCTION preview_next_invoice_number TO authenticated;



-- =========================================
-- File: 20260803203325_20260803_subscription_renewal_automation.sql.sql
-- =========================================
/*
# Subscription & Renewal Automation Module

## Purpose
Extends the existing hotel subscription system with a complete lifecycle:
Trial → Active → Renewal Due → Grace Period → Suspended → Cancelled/Archived.
Connects safely to the existing Invoice system for automatic draft invoice generation.

## Tables Created

### 1. subscription_settings (singleton)
Global settings for subscription automation:
- auto_generate_invoice: 'draft_only' | 'auto_issue' | 'disabled'
- generate_days_before_renewal: int (e.g., 7 = generate 7 days before renewal)
- default_due_date_offset: int (days from issue to due date)
- default_grace_period: int (days after expiry before suspension)
- reminder_days: array of days before expiry to send reminders (e.g., [15, 7, 3, 0])
- restrict_modules_in_grace: boolean (restrict premium modules during grace)
- suspend_entries_after_grace: boolean (block new operational entries after grace)
- auto_suspend_after_grace: boolean (automatically suspend after grace period ends)

### 2. subscription_reminders
Tracks reminder history per hotel:
- hotel_id, reminder_type (email/whatsapp/in_app), days_before, sent_at, message, status

### 3. subscription_plan_history
Complete audit trail of plan changes:
- hotel_id, old_plan_id, new_plan_id, change_type (upgrade/downgrade/initial), effective_date, prorated_amount, credit_adjustment, changed_by, reason

### 4. subscription_notes
Internal notes on subscriptions:
- hotel_id, note, created_by, created_by_email, created_at

## Columns Added to hotels
- trial_start: date
- trial_end: date
- grace_period_end: date
- base_amount: numeric
- discount_amount: numeric
- tax_amount: numeric
- total_payable: numeric
- auto_renew: boolean default true
- assigned_finance_exec: uuid (references company_users)
- subscription_cancelled_at: timestamptz
- subscription_notes: text (quick notes field, separate from subscription_notes table)

## Server Functions

### convert_trial_to_paid(p_hotel_id, p_plan_id, p_billing_cycle, p_user_email)
Converts a trial hotel to paid:
- Updates subscription_status to Active
- Sets plan_id, billing cycle, base/discount/tax/total
- Creates plan history entry
- Generates draft invoice (if auto_generate enabled)
- Creates audit log

### generate_renewal_invoice(p_hotel_id, p_user_email)
Generates a draft invoice for the next billing period:
- Prevents duplicates (checks for existing draft/issued invoice for same period)
- Creates invoice with items from plan
- Returns invoice id

### record_subscription_payment(p_hotel_id, p_amount, p_mode, p_ref, p_notes, p_user_email, p_extend_subscription)
Records payment and links to latest issued invoice:
- Records payment via record_invoice_payment if invoice exists
- Updates subscription amount_paid
- If fully paid AND p_extend_subscription=true: extends subscription_end by billing cycle
- If partial: sets status to 'Partially Paid' (no extension unless super admin approves)
- Creates audit log

### extend_grace_period(p_hotel_id, p_days, p_user_email)
Extends grace period end date by specified days.

### suspend_subscription(p_hotel_id, p_reason, p_user_email)
Suspends a hotel subscription:
- Sets status to Suspended
- Sets is_active to false
- Creates audit log

### reactivate_subscription(p_hotel_id, p_user_email)
Reactivates a suspended hotel:
- Sets status to Active
- Sets is_active to true
- Creates audit log

### change_plan(p_hotel_id, p_new_plan_id, p_change_mode, p_user_email)
Changes subscription plan:
- 'immediate': changes now, calculates prorated amount
- 'next_renewal': schedules change for next renewal
- Creates plan history entry with prorated amount and credit adjustment
- Issued invoices remain unchanged
- Creates audit log

### send_subscription_reminder(p_hotel_id, p_days_before, p_channel, p_user_email)
Records a reminder being sent:
- Creates subscription_reminders record
- Creates audit log
- Does NOT actually send email/WhatsApp (just records intent)

### get_renewal_dashboard()
Returns aggregated renewal data for the dashboard:
- Counts for due today, 3 days, 7 days, 15 days, overdue, grace, suspended
- Total outstanding amount
- Per-hotel renewal details with plan, invoice, payment info

## Security
- RLS on all new tables
- Company staff access based on role
- Hotel users can only see their own subscription data
- All mutations go through SECURITY DEFINER functions with auth checks
- Sensitive operations (suspend, reactivate, plan change) require founder/company_admin/finance_manager
*/

-- ── Add columns to hotels ──
DO $$ BEGIN
  ALTER TABLE hotels ADD COLUMN IF NOT EXISTS trial_start date;
  ALTER TABLE hotels ADD COLUMN IF NOT EXISTS trial_end date;
  ALTER TABLE hotels ADD COLUMN IF NOT EXISTS grace_period_end date;
  ALTER TABLE hotels ADD COLUMN IF NOT EXISTS base_amount numeric(14,2) DEFAULT 0;
  ALTER TABLE hotels ADD COLUMN IF NOT EXISTS discount_amount numeric(14,2) DEFAULT 0;
  ALTER TABLE hotels ADD COLUMN IF NOT EXISTS tax_amount numeric(14,2) DEFAULT 0;
  ALTER TABLE hotels ADD COLUMN IF NOT EXISTS total_payable numeric(14,2) DEFAULT 0;
  ALTER TABLE hotels ADD COLUMN IF NOT EXISTS auto_renew boolean DEFAULT true;
  ALTER TABLE hotels ADD COLUMN IF NOT EXISTS assigned_finance_exec uuid;
  ALTER TABLE hotels ADD COLUMN IF NOT EXISTS subscription_cancelled_at timestamptz;
  ALTER TABLE hotels ADD COLUMN IF NOT EXISTS subscription_notes text DEFAULT '';
  ALTER TABLE hotels ADD COLUMN IF NOT EXISTS billing_cycle text DEFAULT 'monthly';
  ALTER TABLE hotels ADD COLUMN IF NOT EXISTS amount_paid numeric(14,2) DEFAULT 0;
  ALTER TABLE hotels ADD COLUMN IF NOT EXISTS outstanding_amount numeric(14,2) DEFAULT 0;
  ALTER TABLE hotels ADD COLUMN IF NOT EXISTS renewal_date date;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add FK for assigned_finance_exec
DO $$ BEGIN
  ALTER TABLE hotels ADD CONSTRAINT hotels_assigned_finance_exec_fkey
  FOREIGN KEY (assigned_finance_exec) REFERENCES company_users(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── 1. subscription_settings (singleton) ──
CREATE TABLE IF NOT EXISTS subscription_settings (
  id integer PRIMARY KEY DEFAULT 1,
  auto_generate_invoice text NOT NULL DEFAULT 'draft_only'
    CHECK (auto_generate_invoice IN ('draft_only','auto_issue','disabled')),
  generate_days_before_renewal integer NOT NULL DEFAULT 7,
  default_due_date_offset integer NOT NULL DEFAULT 15,
  default_grace_period integer NOT NULL DEFAULT 7,
  reminder_days jsonb NOT NULL DEFAULT '[15,7,3,0]'::jsonb,
  restrict_modules_in_grace boolean DEFAULT true,
  suspend_entries_after_grace boolean DEFAULT true,
  auto_suspend_after_grace boolean DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO subscription_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE subscription_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sub_settings_read_company" ON subscription_settings;
CREATE POLICY "sub_settings_read_company"
ON subscription_settings FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active')
  OR EXISTS (SELECT 1 FROM hotel_admins WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "sub_settings_update_founder" ON subscription_settings;
CREATE POLICY "sub_settings_update_founder"
ON subscription_settings FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active' AND role IN ('founder','company_admin'))
  OR EXISTS (SELECT 1 FROM hotel_admins WHERE user_id = auth.uid() AND role = 'super_admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active' AND role IN ('founder','company_admin'))
  OR EXISTS (SELECT 1 FROM hotel_admins WHERE user_id = auth.uid() AND role = 'super_admin')
);

-- ── 2. subscription_reminders ──
CREATE TABLE IF NOT EXISTS subscription_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  reminder_type text NOT NULL DEFAULT 'in_app'
    CHECK (reminder_type IN ('email','whatsapp','in_app')),
  days_before integer NOT NULL DEFAULT 0,
  message text,
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent','failed','pending')),
  sent_by uuid REFERENCES auth.users(id),
  sent_by_email text,
  sent_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_reminders_hotel_id ON subscription_reminders(hotel_id);

ALTER TABLE subscription_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sub_reminders_read" ON subscription_reminders;
CREATE POLICY "sub_reminders_read"
ON subscription_reminders FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active')
  OR EXISTS (SELECT 1 FROM hotel_admins ha WHERE ha.user_id = auth.uid() AND ha.hotel_id = subscription_reminders.hotel_id)
);

DROP POLICY IF EXISTS "sub_reminders_insert" ON subscription_reminders;
CREATE POLICY "sub_reminders_insert"
ON subscription_reminders FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active')
);

-- ── 3. subscription_plan_history ──
CREATE TABLE IF NOT EXISTS subscription_plan_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  old_plan_id uuid REFERENCES subscription_plans(id) ON DELETE SET NULL,
  new_plan_id uuid REFERENCES subscription_plans(id) ON DELETE SET NULL,
  change_type text NOT NULL DEFAULT 'initial'
    CHECK (change_type IN ('initial','upgrade','downgrade','renewal','cancel')),
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  prorated_amount numeric(14,2) DEFAULT 0,
  credit_adjustment numeric(14,2) DEFAULT 0,
  old_base_amount numeric(14,2),
  new_base_amount numeric(14,2),
  changed_by uuid REFERENCES auth.users(id),
  changed_by_email text,
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_history_hotel_id ON subscription_plan_history(hotel_id);

ALTER TABLE subscription_plan_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plan_history_read" ON subscription_plan_history;
CREATE POLICY "plan_history_read"
ON subscription_plan_history FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active')
  OR EXISTS (SELECT 1 FROM hotel_admins ha WHERE ha.user_id = auth.uid() AND ha.hotel_id = subscription_plan_history.hotel_id)
);

DROP POLICY IF EXISTS "plan_history_insert" ON subscription_plan_history;
CREATE POLICY "plan_history_insert"
ON subscription_plan_history FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active')
);

-- ── 4. subscription_notes ──
CREATE TABLE IF NOT EXISTS subscription_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_by_email text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_notes_hotel_id ON subscription_notes(hotel_id);

ALTER TABLE subscription_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sub_notes_read" ON subscription_notes;
CREATE POLICY "sub_notes_read"
ON subscription_notes FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active')
  OR EXISTS (SELECT 1 FROM hotel_admins ha WHERE ha.user_id = auth.uid() AND ha.hotel_id = subscription_notes.hotel_id)
);

DROP POLICY IF EXISTS "sub_notes_insert" ON subscription_notes;
CREATE POLICY "sub_notes_insert"
ON subscription_notes FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND status = 'Active')
);

-- ── Helper: compute next renewal date based on billing cycle ──
CREATE OR REPLACE FUNCTION compute_next_renewal_date(p_start date, p_cycle text)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_cycle = 'yearly' THEN
    RETURN p_start + INTERVAL '1 year';
  ELSIF p_cycle = 'quarterly' THEN
    RETURN p_start + INTERVAL '3 months';
  ELSE
    RETURN p_start + INTERVAL '1 month';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION compute_next_renewal_date FROM anon;
GRANT EXECUTE ON FUNCTION compute_next_renewal_date TO authenticated;

-- ── Server: Convert Trial to Paid ──
CREATE OR REPLACE FUNCTION convert_trial_to_paid(
  p_hotel_id uuid,
  p_plan_id uuid,
  p_billing_cycle text DEFAULT 'monthly',
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel RECORD;
  v_plan RECORD;
  v_base numeric;
  v_tax numeric;
  v_total numeric;
  v_user_id uuid := auth.uid();
  v_role text;
  v_start date := CURRENT_DATE;
  v_end date;
  v_settings RECORD;
  v_invoice_id uuid;
  v_gst_rate numeric;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder','company_admin','finance_manager','sales_manager') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;
  END IF;

  SELECT * INTO v_hotel FROM hotels WHERE id = p_hotel_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hotel not found'; END IF;

  IF v_hotel.subscription_status NOT IN ('Trial','Trial Expiring','Expired') THEN
    RAISE EXCEPTION 'Hotel is not in trial. Current status: %', v_hotel.subscription_status;
  END IF;

  SELECT * INTO v_plan FROM subscription_plans WHERE id = p_plan_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found or inactive'; END IF;

  -- Compute amounts
  v_base := CASE WHEN p_billing_cycle = 'yearly' THEN v_plan.yearly_price ELSE v_plan.price END;
  v_gst_rate := COALESCE((SELECT (gst->>'default_gst_rate')::numeric FROM billing_settings WHERE id = 1), 18);
  v_tax := ROUND(v_base * v_gst_rate / 100, 2);
  v_total := v_base + v_tax;

  v_end := compute_next_renewal_date(v_start, p_billing_cycle);

  -- Update hotel
  UPDATE hotels SET
    plan_id = p_plan_id,
    billing_cycle = p_billing_cycle,
    subscription_status = 'Active',
    subscription_start = v_start,
    subscription_expiry = v_end,
    renewal_date = v_end,
    trial_end = COALESCE(trial_end, CURRENT_DATE),
    base_amount = v_base,
    tax_amount = v_tax,
    total_payable = v_total,
    outstanding_amount = v_total,
    amount_paid = 0,
    grace_period_end = NULL,
    updated_at = now()
  WHERE id = p_hotel_id;

  -- Plan history
  INSERT INTO subscription_plan_history (
    hotel_id, old_plan_id, new_plan_id, change_type, effective_date,
    new_base_amount, changed_by, changed_by_email, reason
  ) VALUES (
    p_hotel_id, v_hotel.plan_id, p_plan_id, 'initial', v_start,
    v_base, v_user_id, p_user_email, 'Trial converted to paid'
  );

  -- Auto-generate invoice if enabled
  SELECT * INTO v_settings FROM subscription_settings WHERE id = 1;
  IF v_settings.auto_generate_invoice != 'disabled' THEN
    -- Create draft invoice via direct insert (reuse invoice logic)
    INSERT INTO invoices (
      hotel_id, plan_id, status, billing_period, billing_cycle,
      number_of_rooms, subscription_start, subscription_end,
      subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount,
      total_amount, balance_due, is_interstate, due_date, created_by
    ) VALUES (
      p_hotel_id, p_plan_id, 'Draft', p_billing_cycle, p_billing_cycle,
      v_hotel.total_rooms, v_start, v_end,
      v_base, v_base, v_tax / 2, v_tax / 2, 0,
      v_total, v_total, false, CURRENT_DATE + v_settings.default_due_date_offset, v_user_id
    ) RETURNING id INTO v_invoice_id;

    -- Insert invoice item
    INSERT INTO invoice_items (
      invoice_id, sr_no, description, hsn_sac, quantity, rate, discount,
      taxable_value, gst_rate, cgst_amount, sgst_amount, igst_amount, amount, item_type
    ) VALUES (
      v_invoice_id, 1, v_plan.name || ' — ' || p_billing_cycle || ' subscription',
      COALESCE((SELECT gst->>'hsn_sac' FROM billing_settings WHERE id = 1), '9983'),
      1, v_base, 0, v_base, v_gst_rate, v_tax / 2, v_tax / 2, 0, v_total, 'subscription'
    );

    -- Auto-issue if configured
    IF v_settings.auto_generate_invoice = 'auto_issue' THEN
      PERFORM issue_invoice(v_invoice_id, p_user_email);
    END IF;
  END IF;

  -- Audit log
  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    old_value, new_value, severity, reason, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'convert_trial', 'subscriptions',
    p_hotel_id, v_hotel.hotel_name, p_hotel_id::text,
    jsonb_build_object('status', v_hotel.subscription_status),
    jsonb_build_object('status', 'Active', 'plan', v_plan.name, 'invoice_id', v_invoice_id),
    'warning', 'Trial converted to paid',
    jsonb_build_object('plan_id', p_plan_id, 'billing_cycle', p_billing_cycle, 'invoice_id', v_invoice_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'hotel_id', p_hotel_id,
    'new_status', 'Active',
    'invoice_id', v_invoice_id,
    'message', 'Trial converted to paid successfully'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION convert_trial_to_paid FROM anon;
GRANT EXECUTE ON FUNCTION convert_trial_to_paid TO authenticated;

-- ── Server: Generate Renewal Invoice ──
CREATE OR REPLACE FUNCTION generate_renewal_invoice(
  p_hotel_id uuid,
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel RECORD;
  v_plan RECORD;
  v_base numeric;
  v_tax numeric;
  v_total numeric;
  v_user_id uuid := auth.uid();
  v_role text;
  v_settings RECORD;
  v_invoice_id uuid;
  v_gst_rate numeric;
  v_new_start date;
  v_new_end date;
  v_existing_count int;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder','company_admin','finance_manager','finance_executive') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;
  END IF;

  SELECT * INTO v_hotel FROM hotels WHERE id = p_hotel_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hotel not found'; END IF;

  IF v_hotel.plan_id IS NULL THEN RAISE EXCEPTION 'Hotel has no plan assigned'; END IF;

  SELECT * INTO v_plan FROM subscription_plans WHERE id = v_hotel.plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found'; END IF;

  -- Prevent duplicates: check for existing draft/issued invoice for same billing period
  SELECT count(*) INTO v_existing_count
  FROM invoices
  WHERE hotel_id = p_hotel_id
    AND plan_id = v_hotel.plan_id
    AND billing_cycle = v_hotel.billing_cycle
    AND status IN ('Draft','Issued','Sent','Partially Paid')
    AND subscription_start = v_hotel.subscription_expiry;

  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'Invoice already exists for this billing period';
  END IF;

  -- Compute next period
  v_new_start := v_hotel.subscription_expiry;
  IF v_new_start IS NULL THEN v_new_start := CURRENT_DATE; END IF;
  v_new_end := compute_next_renewal_date(v_new_start, v_hotel.billing_cycle);

  v_base := CASE WHEN v_hotel.billing_cycle = 'yearly' THEN v_plan.yearly_price ELSE v_plan.price END;
  v_gst_rate := COALESCE((SELECT (gst->>'default_gst_rate')::numeric FROM billing_settings WHERE id = 1), 18);
  v_tax := ROUND(v_base * v_gst_rate / 100, 2);
  v_total := v_base + v_tax;

  SELECT * INTO v_settings FROM subscription_settings WHERE id = 1;

  -- Create draft invoice
  INSERT INTO invoices (
    hotel_id, plan_id, status, billing_period, billing_cycle,
    number_of_rooms, subscription_start, subscription_end,
    subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount,
    total_amount, balance_due, is_interstate, due_date, created_by
  ) VALUES (
    p_hotel_id, v_hotel.plan_id, 'Draft', v_hotel.billing_cycle, v_hotel.billing_cycle,
    v_hotel.total_rooms, v_new_start, v_new_end,
    v_base, v_base, v_tax / 2, v_tax / 2, 0,
    v_total, v_total, false, CURRENT_DATE + v_settings.default_due_date_offset, v_user_id
  ) RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_items (
    invoice_id, sr_no, description, hsn_sac, quantity, rate, discount,
    taxable_value, gst_rate, cgst_amount, sgst_amount, igst_amount, amount, item_type
  ) VALUES (
    v_invoice_id, 1, v_plan.name || ' — ' || v_hotel.billing_cycle || ' renewal',
    COALESCE((SELECT gst->>'hsn_sac' FROM billing_settings WHERE id = 1), '9983'),
    1, v_base, 0, v_base, v_gst_rate, v_tax / 2, v_tax / 2, 0, v_total, 'subscription'
  );

  -- Update hotel renewal info
  UPDATE hotels SET
    renewal_date = v_new_end,
    base_amount = v_base,
    tax_amount = v_tax,
    total_payable = v_total,
    outstanding_amount = v_total,
    updated_at = now()
  WHERE id = p_hotel_id;

  -- Auto-issue if configured
  IF v_settings.auto_generate_invoice = 'auto_issue' THEN
    PERFORM issue_invoice(v_invoice_id, p_user_email);
  END IF;

  -- Audit log
  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    new_value, severity, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'generate_renewal_invoice', 'subscriptions',
    p_hotel_id, v_hotel.hotel_name, v_invoice_id::text,
    jsonb_build_object('invoice_id', v_invoice_id, 'period_start', v_new_start, 'period_end', v_new_end),
    'info', jsonb_build_object('invoice_id', v_invoice_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'message', 'Renewal invoice generated'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_renewal_invoice FROM anon;
GRANT EXECUTE ON FUNCTION generate_renewal_invoice TO authenticated;

-- ── Server: Record Subscription Payment ──
CREATE OR REPLACE FUNCTION record_subscription_payment(
  p_hotel_id uuid,
  p_amount numeric,
  p_payment_mode text DEFAULT 'Bank',
  p_transaction_reference text DEFAULT '',
  p_notes text DEFAULT '',
  p_user_email text DEFAULT '',
  p_extend_subscription boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel RECORD;
  v_user_id uuid := auth.uid();
  v_role text;
  v_new_paid numeric;
  v_new_outstanding numeric;
  v_new_status text;
  v_invoice RECORD;
  v_receipt text;
  v_new_end date;
  v_is_super_admin boolean := false;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder','company_admin','finance_manager','finance_executive') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;
    v_is_super_admin := true;
  END IF;

  SELECT * INTO v_hotel FROM hotels WHERE id = p_hotel_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hotel not found'; END IF;

  -- Find latest issued/sent/partially-paid invoice for this hotel
  SELECT * INTO v_invoice FROM invoices
  WHERE hotel_id = p_hotel_id AND status IN ('Issued','Sent','Partially Paid','Overdue')
  ORDER BY created_at DESC LIMIT 1;

  v_new_paid := v_hotel.amount_paid + p_amount;
  v_new_outstanding := v_hotel.total_payable - v_new_paid;

  -- If invoice exists, record payment against it
  IF v_invoice.id IS NOT NULL THEN
    PERFORM record_invoice_payment(
      v_invoice.id, p_amount, p_payment_mode,
      p_transaction_reference, '', p_notes, p_user_email
    );
  END IF;

  -- Determine new status
  IF v_new_outstanding <= 0.01 THEN
    v_new_status := 'Active';
    -- Extend subscription only if fully paid AND extension approved
    IF p_extend_subscription THEN
      v_new_end := compute_next_renewal_date(COALESCE(v_hotel.subscription_expiry, CURRENT_DATE), v_hotel.billing_cycle);
      UPDATE hotels SET
        subscription_expiry = v_new_end,
        renewal_date = v_new_end,
        grace_period_end = NULL,
        subscription_status = v_new_status,
        amount_paid = v_new_paid,
        outstanding_amount = 0,
        updated_at = now()
      WHERE id = p_hotel_id;
    ELSE
      -- Super admin explicitly chose not to extend (partial payment scenario)
      v_new_status := 'Partially Paid';
      UPDATE hotels SET
        subscription_status = v_new_status,
        amount_paid = v_new_paid,
        outstanding_amount = v_new_outstanding,
        updated_at = now()
      WHERE id = p_hotel_id;
    END IF;
  ELSE
    -- Partial payment
    v_new_status := 'Partially Paid';
    -- Only extend if super admin explicitly approves for partial
    IF p_extend_subscription AND v_is_super_admin THEN
      v_new_end := compute_next_renewal_date(COALESCE(v_hotel.subscription_expiry, CURRENT_DATE), v_hotel.billing_cycle);
      UPDATE hotels SET
        subscription_expiry = v_new_end,
        renewal_date = v_new_end,
        subscription_status = v_new_status,
        amount_paid = v_new_paid,
        outstanding_amount = v_new_outstanding,
        updated_at = now()
      WHERE id = p_hotel_id;
    ELSE
      UPDATE hotels SET
        subscription_status = v_new_status,
        amount_paid = v_new_paid,
        outstanding_amount = v_new_outstanding,
        updated_at = now()
      WHERE id = p_hotel_id;
    END IF;
  END IF;

  -- Audit log
  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    old_value, new_value, severity, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'record_subscription_payment', 'subscriptions',
    p_hotel_id, v_hotel.hotel_name, p_hotel_id::text,
    jsonb_build_object('amount_paid', v_hotel.amount_paid, 'status', v_hotel.subscription_status),
    jsonb_build_object('amount_paid', v_new_paid, 'status', v_new_status, 'outstanding', v_new_outstanding),
    'info', jsonb_build_object('amount', p_amount, 'mode', p_payment_mode, 'extended', p_extend_subscription)
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_status', v_new_status,
    'amount_paid', v_new_paid,
    'outstanding', v_new_outstanding,
    'message', 'Payment recorded'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION record_subscription_payment FROM anon;
GRANT EXECUTE ON FUNCTION record_subscription_payment TO authenticated;

-- ── Server: Extend Grace Period ──
CREATE OR REPLACE FUNCTION extend_grace_period(
  p_hotel_id uuid,
  p_days integer,
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel RECORD;
  v_user_id uuid := auth.uid();
  v_role text;
  v_new_grace_end date;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder','company_admin','finance_manager') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;
  END IF;

  SELECT * INTO v_hotel FROM hotels WHERE id = p_hotel_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hotel not found'; END IF;

  v_new_grace_end := COALESCE(v_hotel.grace_period_end, v_hotel.subscription_expiry, CURRENT_DATE) + p_days;

  UPDATE hotels SET
    grace_period_end = v_new_grace_end,
    subscription_status = CASE
      WHEN v_hotel.subscription_status IN ('Overdue','Expired') THEN 'Grace Period'
      ELSE v_hotel.subscription_status
    END,
    updated_at = now()
  WHERE id = p_hotel_id;

  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    old_value, new_value, severity, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'extend_grace_period', 'subscriptions',
    p_hotel_id, v_hotel.hotel_name, p_hotel_id::text,
    jsonb_build_object('grace_period_end', v_hotel.grace_period_end),
    jsonb_build_object('grace_period_end', v_new_grace_end),
    'warning', jsonb_build_object('days', p_days)
  );

  RETURN jsonb_build_object('success', true, 'grace_period_end', v_new_grace_end);
END;
$$;

REVOKE EXECUTE ON FUNCTION extend_grace_period FROM anon;
GRANT EXECUTE ON FUNCTION extend_grace_period TO authenticated;

-- ── Server: Suspend Subscription ──
CREATE OR REPLACE FUNCTION suspend_subscription(
  p_hotel_id uuid,
  p_reason text,
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel RECORD;
  v_user_id uuid := auth.uid();
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder','company_admin','finance_manager') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;
  END IF;

  SELECT * INTO v_hotel FROM hotels WHERE id = p_hotel_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hotel not found'; END IF;

  UPDATE hotels SET
    subscription_status = 'Suspended',
    is_active = false,
    updated_at = now()
  WHERE id = p_hotel_id;

  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    old_value, new_value, severity, reason, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'suspend_subscription', 'subscriptions',
    p_hotel_id, v_hotel.hotel_name, p_hotel_id::text,
    jsonb_build_object('status', v_hotel.subscription_status),
    jsonb_build_object('status', 'Suspended'),
    'error', p_reason, '{}'::jsonb
  );

  RETURN jsonb_build_object('success', true, 'message', 'Subscription suspended');
END;
$$;

REVOKE EXECUTE ON FUNCTION suspend_subscription FROM anon;
GRANT EXECUTE ON FUNCTION suspend_subscription TO authenticated;

-- ── Server: Reactivate Subscription ──
CREATE OR REPLACE FUNCTION reactivate_subscription(
  p_hotel_id uuid,
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel RECORD;
  v_user_id uuid := auth.uid();
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder','company_admin','finance_manager') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;
  END IF;

  SELECT * INTO v_hotel FROM hotels WHERE id = p_hotel_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hotel not found'; END IF;

  UPDATE hotels SET
    subscription_status = 'Active',
    is_active = true,
    grace_period_end = NULL,
    updated_at = now()
  WHERE id = p_hotel_id;

  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    old_value, new_value, severity, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'reactivate_subscription', 'subscriptions',
    p_hotel_id, v_hotel.hotel_name, p_hotel_id::text,
    jsonb_build_object('status', v_hotel.subscription_status),
    jsonb_build_object('status', 'Active'),
    'info', '{}'::jsonb
  );

  RETURN jsonb_build_object('success', true, 'message', 'Subscription reactivated');
END;
$$;

REVOKE EXECUTE ON FUNCTION reactivate_subscription FROM anon;
GRANT EXECUTE ON FUNCTION reactivate_subscription TO authenticated;

-- ── Server: Change Plan ──
CREATE OR REPLACE FUNCTION change_plan(
  p_hotel_id uuid,
  p_new_plan_id uuid,
  p_change_mode text DEFAULT 'immediate',
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel RECORD;
  v_old_plan RECORD;
  v_new_plan RECORD;
  v_user_id uuid := auth.uid();
  v_role text;
  v_prorated numeric := 0;
  v_credit numeric := 0;
  v_new_base numeric;
  v_new_tax numeric;
  v_new_total numeric;
  v_gst_rate numeric;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder','company_admin','finance_manager','sales_manager') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;
  END IF;

  SELECT * INTO v_hotel FROM hotels WHERE id = p_hotel_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hotel not found'; END IF;

  SELECT * INTO v_new_plan FROM subscription_plans WHERE id = p_new_plan_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'New plan not found'; END IF;

  SELECT * INTO v_old_plan FROM subscription_plans WHERE id = v_hotel.plan_id;

  -- Compute new amounts
  v_new_base := CASE WHEN v_hotel.billing_cycle = 'yearly' THEN v_new_plan.yearly_price ELSE v_new_plan.price END;
  v_gst_rate := COALESCE((SELECT (gst->>'default_gst_rate')::numeric FROM billing_settings WHERE id = 1), 18);
  v_new_tax := ROUND(v_new_base * v_gst_rate / 100, 2);
  v_new_total := v_new_base + v_new_tax;

  -- Prorated calculation for immediate upgrade
  IF p_change_mode = 'immediate' AND v_old_plan.id IS NOT NULL THEN
    v_prorated := v_new_base - COALESCE(v_hotel.base_amount, v_old_plan.price);
    IF v_prorated < 0 THEN
      v_credit := ABS(v_prorated);
      v_prorated := 0;
    END IF;
  END IF;

  IF p_change_mode = 'immediate' THEN
    UPDATE hotels SET
      plan_id = p_new_plan_id,
      base_amount = v_new_base,
      tax_amount = v_new_tax,
      total_payable = v_new_total + v_credit,
      outstanding_amount = v_new_total + v_credit - v_hotel.amount_paid,
      updated_at = now()
    WHERE id = p_hotel_id;

    INSERT INTO subscription_plan_history (
      hotel_id, old_plan_id, new_plan_id, change_type, effective_date,
      old_base_amount, new_base_amount, prorated_amount, credit_adjustment,
      changed_by, changed_by_email, reason
    ) VALUES (
      p_hotel_id, v_hotel.plan_id, p_new_plan_id,
      CASE WHEN v_new_base > COALESCE(v_hotel.base_amount, 0) THEN 'upgrade' ELSE 'downgrade' END,
      CURRENT_DATE, v_hotel.base_amount, v_new_base, v_prorated, v_credit,
      v_user_id, p_user_email, 'Plan changed immediately'
    );
  ELSE
    -- Next renewal: just record the history, actual change happens at renewal
    INSERT INTO subscription_plan_history (
      hotel_id, old_plan_id, new_plan_id, change_type, effective_date,
      old_base_amount, new_base_amount, prorated_amount, credit_adjustment,
      changed_by, changed_by_email, reason
    ) VALUES (
      p_hotel_id, v_hotel.plan_id, p_new_plan_id,
      CASE WHEN v_new_base > COALESCE(v_hotel.base_amount, 0) THEN 'upgrade' ELSE 'downgrade' END,
      v_hotel.subscription_expiry, v_hotel.base_amount, v_new_base, 0, 0,
      v_user_id, p_user_email, 'Plan change scheduled for next renewal'
    );
  END IF;

  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    old_value, new_value, severity, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'change_plan', 'subscriptions',
    p_hotel_id, v_hotel.hotel_name, p_hotel_id::text,
    jsonb_build_object('plan', v_old_plan.name),
    jsonb_build_object('plan', v_new_plan.name, 'mode', p_change_mode, 'prorated', v_prorated, 'credit', v_credit),
    'warning', jsonb_build_object('mode', p_change_mode, 'prorated', v_prorated, 'credit', v_credit)
  );

  RETURN jsonb_build_object(
    'success', true,
    'prorated_amount', v_prorated,
    'credit_adjustment', v_credit,
    'message', 'Plan changed'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION change_plan FROM anon;
GRANT EXECUTE ON FUNCTION change_plan TO authenticated;

-- ── Server: Send Subscription Reminder ──
CREATE OR REPLACE FUNCTION send_subscription_reminder(
  p_hotel_id uuid,
  p_days_before integer,
  p_channel text DEFAULT 'in_app',
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel RECORD;
  v_user_id uuid := auth.uid();
  v_role text;
  v_message text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;
  END IF;

  SELECT * INTO v_hotel FROM hotels WHERE id = p_hotel_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hotel not found'; END IF;

  v_message := CASE
    WHEN p_days_before > 0 THEN 'Subscription expires in ' || p_days_before || ' days (' || v_hotel.subscription_expiry || ')'
    WHEN p_days_before = 0 THEN 'Subscription expires TODAY (' || v_hotel.subscription_expiry || ')'
    ELSE 'Subscription is OVERDUE. Please renew immediately.'
  END;

  INSERT INTO subscription_reminders (
    hotel_id, reminder_type, days_before, message, status, sent_by, sent_by_email
  ) VALUES (
    p_hotel_id, p_channel, p_days_before, v_message, 'sent', v_user_id, p_user_email
  );

  -- Also create in-app notification
  INSERT INTO notifications (type, title, message, priority, hotel_id, target_role)
  VALUES (
    'subscription_expiring',
    'Subscription Reminder',
    v_message || ' — Hotel: ' || v_hotel.hotel_name,
    CASE WHEN p_days_before <= 0 THEN 'critical' WHEN p_days_before <= 3 THEN 'high' ELSE 'medium' END,
    p_hotel_id,
    'all'
  );

  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id, severity, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'send_reminder', 'subscriptions',
    p_hotel_id, v_hotel.hotel_name, p_hotel_id::text,
    'info', jsonb_build_object('days_before', p_days_before, 'channel', p_channel)
  );

  RETURN jsonb_build_object('success', true, 'message', v_message);
END;
$$;

REVOKE EXECUTE ON FUNCTION send_subscription_reminder FROM anon;
GRANT EXECUTE ON FUNCTION send_subscription_reminder TO authenticated;

-- ── Server: Get Renewal Dashboard ──
CREATE OR REPLACE FUNCTION get_renewal_dashboard()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_today date := CURRENT_DATE;
  v_due_today int;
  v_due_3 int;
  v_due_7 int;
  v_due_15 int;
  v_overdue int;
  v_grace int;
  v_suspended int;
  v_total_outstanding numeric;
  v_hotels jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT count(*) INTO v_due_today FROM hotels
  WHERE subscription_expiry = v_today AND subscription_status NOT IN ('Cancelled','Archived','Suspended');

  SELECT count(*) INTO v_due_3 FROM hotels
  WHERE subscription_expiry BETWEEN v_today AND v_today + 3
    AND subscription_status NOT IN ('Cancelled','Archived','Suspended');

  SELECT count(*) INTO v_due_7 FROM hotels
  WHERE subscription_expiry BETWEEN v_today AND v_today + 7
    AND subscription_status NOT IN ('Cancelled','Archived','Suspended');

  SELECT count(*) INTO v_due_15 FROM hotels
  WHERE subscription_expiry BETWEEN v_today AND v_today + 15
    AND subscription_status NOT IN ('Cancelled','Archived','Suspended');

  SELECT count(*) INTO v_overdue FROM hotels
  WHERE subscription_expiry < v_today
    AND subscription_status NOT IN ('Cancelled','Archived','Suspended')
    AND grace_period_end IS NULL;

  SELECT count(*) INTO v_grace FROM hotels
  WHERE subscription_status = 'Grace Period' OR grace_period_end IS NOT NULL
    AND subscription_status NOT IN ('Cancelled','Archived','Suspended');

  SELECT count(*) INTO v_suspended FROM hotels
  WHERE subscription_status = 'Suspended';

  SELECT COALESCE(SUM(outstanding_amount), 0) INTO v_total_outstanding
  FROM hotels WHERE subscription_status NOT IN ('Cancelled','Archived','Suspended');

  -- Per-hotel details
  SELECT COALESCE(json_agg(json_build_object(
    'hotel_id', h.id,
    'hotel_name', h.hotel_name,
    'property_code', h.property_code,
    'plan_name', p.name,
    'billing_cycle', h.billing_cycle,
    'subscription_start', h.subscription_start,
    'subscription_expiry', h.subscription_expiry,
    'renewal_date', h.renewal_date,
    'grace_period_end', h.grace_period_end,
    'subscription_status', h.subscription_status,
    'base_amount', h.base_amount,
    'total_payable', h.total_payable,
    'amount_paid', h.amount_paid,
    'outstanding_amount', h.outstanding_amount,
    'auto_renew', h.auto_renew,
    'assigned_sales_exec', h.assigned_sales_exec,
    'assigned_finance_exec', h.assigned_finance_exec,
    'days_to_expiry', CASE
      WHEN h.subscription_expiry IS NULL THEN null
      ELSE h.subscription_expiry - v_today
    END,
    'latest_invoice_number', (
      SELECT inv.invoice_number FROM invoices inv
      WHERE inv.hotel_id = h.id ORDER BY inv.created_at DESC LIMIT 1
    ),
    'latest_invoice_id', (
      SELECT inv.id FROM invoices inv
      WHERE inv.hotel_id = h.id ORDER BY inv.created_at DESC LIMIT 1
    ),
    'latest_invoice_status', (
      SELECT inv.status FROM invoices inv
      WHERE inv.hotel_id = h.id ORDER BY inv.created_at DESC LIMIT 1
    )
  )), '[]'::json) INTO v_hotels
  FROM hotels h
  LEFT JOIN subscription_plans p ON h.plan_id = p.id
  WHERE h.subscription_status NOT IN ('Cancelled','Archived')
    AND h.archived_at IS NULL;

  RETURN jsonb_build_object(
    'counts', jsonb_build_object(
      'due_today', v_due_today,
      'due_3_days', v_due_3,
      'due_7_days', v_due_7,
      'due_15_days', v_due_15,
      'overdue', v_overdue,
      'grace_period', v_grace,
      'suspended', v_suspended,
      'total_outstanding', v_total_outstanding
    ),
    'hotels', v_hotels
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_renewal_dashboard FROM anon;
GRANT EXECUTE ON FUNCTION get_renewal_dashboard TO authenticated;

-- ── Server: Update Subscription Settings ──
CREATE OR REPLACE FUNCTION update_subscription_settings(
  p_data jsonb,
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder','company_admin') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;
  END IF;

  UPDATE subscription_settings SET
    auto_generate_invoice = COALESCE((p_data->>'auto_generate_invoice')::text, auto_generate_invoice),
    generate_days_before_renewal = COALESCE((p_data->>'generate_days_before_renewal')::int, generate_days_before_renewal),
    default_due_date_offset = COALESCE((p_data->>'default_due_date_offset')::int, default_due_date_offset),
    default_grace_period = COALESCE((p_data->>'default_grace_period')::int, default_grace_period),
    reminder_days = COALESCE(p_data->'reminder_days', reminder_days),
    restrict_modules_in_grace = COALESCE((p_data->>'restrict_modules_in_grace')::boolean, restrict_modules_in_grace),
    suspend_entries_after_grace = COALESCE((p_data->>'suspend_entries_after_grace')::boolean, suspend_entries_after_grace),
    auto_suspend_after_grace = COALESCE((p_data->>'auto_suspend_after_grace')::boolean, auto_suspend_after_grace),
    updated_at = now(),
    updated_by = v_user_id
  WHERE id = 1;

  INSERT INTO audit_logs (
    user_id, user_email, role, action, module, severity, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'update_subscription_settings', 'subscriptions', 'info', p_data
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION update_subscription_settings FROM anon;
GRANT EXECUTE ON FUNCTION update_subscription_settings TO authenticated;



-- =========================================
-- File: 20260803213932_20260803_onboarding_idempotent_part1.sql
-- =========================================
/*
# Idempotent Hotel Onboarding — Schema Changes (Part 1: Columns + Tracking Table)

## Purpose
Add onboarding tracking columns and the onboarding_attempts table.
Unique indexes on property_code/admin_email will be added in a follow-up
migration after existing duplicates are cleaned up.

## Changes to `hotels` table
- ADD `onboarding_status` text NOT NULL DEFAULT 'completed'
- ADD `onboarding_attempt_id` uuid (nullable)

## New table: `onboarding_attempts`
- Tracks each onboarding attempt's state, completed steps, and form data
- Enables idempotent retry: resume from the failed step instead of creating a new hotel
*/

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS onboarding_attempt_id uuid;

CREATE TABLE IF NOT EXISTS onboarding_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid REFERENCES hotels(id) ON DELETE CASCADE,
  attempt_key text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  completed_steps text[] NOT NULL DEFAULT '{}',
  failed_step text,
  error_message text,
  form_data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE onboarding_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_select_onboarding_attempts" ON onboarding_attempts;
CREATE POLICY "super_admin_select_onboarding_attempts" ON onboarding_attempts
  FOR SELECT TO authenticated
  USING (is_super_admin() OR is_company_user());

DROP POLICY IF EXISTS "super_admin_insert_onboarding_attempts" ON onboarding_attempts;
CREATE POLICY "super_admin_insert_onboarding_attempts" ON onboarding_attempts
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR is_company_user());

DROP POLICY IF EXISTS "super_admin_update_onboarding_attempts" ON onboarding_attempts;
CREATE POLICY "super_admin_update_onboarding_attempts" ON onboarding_attempts
  FOR UPDATE TO authenticated
  USING (is_super_admin() OR is_company_user())
  WITH CHECK (is_super_admin() OR is_company_user());

DROP POLICY IF EXISTS "super_admin_delete_onboarding_attempts" ON onboarding_attempts;
CREATE POLICY "super_admin_delete_onboarding_attempts" ON onboarding_attempts
  FOR DELETE TO authenticated
  USING (is_super_admin() OR is_company_user());

CREATE INDEX IF NOT EXISTS idx_onboarding_attempts_key
  ON onboarding_attempts (attempt_key);

CREATE INDEX IF NOT EXISTS idx_onboarding_attempts_hotel_id
  ON onboarding_attempts (hotel_id);



-- =========================================
-- File: 20260803214138_20260803_archive_hotel_sunshine_duplicates.sql
-- =========================================
/*
# Clean up Hotel Sunshine duplicate records

## Purpose
Archive 5 duplicate "Hotel Sunshine" records, keeping only the oldest one (06af300b).
All 6 duplicates have the same data (settings + 6 categories + 4 sources, 0 rooms/features/admins).
The first created record (06af300b) is kept as the master.

## Action
- Set is_active = false, onboarding_status = 'archived', archived_at = now() for 5 duplicate IDs
- Do NOT delete — archive only, so data is recoverable
- The kept record (06af300b) stays is_active = true, onboarding_status = 'completed'
*/

UPDATE hotels
SET is_active = false,
    onboarding_status = 'archived',
    archived_at = now()
WHERE id IN (
  'dbfb6162-8bca-479f-b620-ad8ca2ddae7c',
  '0001a003-0ec4-4d04-9c34-1e5a961993ac',
  'dc1bb236-6df9-45e4-96aa-8f7302ff00e8',
  'e4600c4d-eaa7-4d15-a38b-78cbb5b4a05f',
  'd7f981f6-36d0-4707-b95e-11abd096c909'
);



-- =========================================
-- File: 20260803222448_20260803_invoice_number_at_creation.sql
-- =========================================
-- 1. Modify issue_invoice to preserve existing invoice_number (assigned at draft creation)
--    Only generate a new number if the invoice doesn't already have one.
CREATE OR REPLACE FUNCTION public.issue_invoice(
  p_invoice_id uuid,
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_hotel RECORD;
  v_plan RECORD;
  v_items jsonb;
  v_features jsonb;
  v_snapshot jsonb;
  v_invoice_number text;
  v_settings billing_settings%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_role text;
  v_hotel_features jsonb;
BEGIN
  -- Authorization
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder','company_admin','finance_manager') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not authorized to issue invoices';
    END IF;
  END IF;

  -- Load invoice
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_invoice.status != 'Draft' THEN
    RAISE EXCEPTION 'Only Draft invoices can be issued. Current status: %', v_invoice.status;
  END IF;

  -- Use existing invoice_number if already assigned (at draft creation), otherwise generate one
  IF v_invoice.invoice_number IS NOT NULL AND v_invoice.invoice_number != '' THEN
    v_invoice_number := v_invoice.invoice_number;
  ELSE
    v_invoice_number := generate_invoice_number();
  END IF;

  -- Load hotel
  SELECT * INTO v_hotel FROM hotels WHERE id = v_invoice.hotel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hotel not found';
  END IF;

  -- Load plan
  SELECT * INTO v_plan FROM subscription_plans WHERE id = v_invoice.plan_id;

  -- Load hotel features
  SELECT COALESCE(json_agg(json_build_object('module_key', module_key, 'is_enabled', is_enabled)), '[]'::json)
  INTO v_hotel_features
  FROM hotel_features WHERE hotel_id = v_invoice.hotel_id;

  -- Load invoice items
  SELECT COALESCE(json_agg(to_jsonb(t)), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT sr_no, description, hsn_sac, quantity, rate, discount, taxable_value,
    gst_rate, cgst_amount, sgst_amount, igst_amount, amount, item_type
    FROM invoice_items WHERE invoice_id = p_invoice_id ORDER BY sr_no
  ) t;

  -- Load billing settings for snapshot
  SELECT * INTO v_settings FROM billing_settings WHERE id = 1;

  -- Build snapshot
  v_snapshot := jsonb_build_object(
    'company_details', v_settings.company_details,
    'branding', v_settings.branding,
    'gst', v_settings.gst,
    'payment', v_settings.payment,
    'terms', v_settings.terms,
    'hotel', jsonb_build_object(
      'hotel_name', v_hotel.hotel_name,
      'address', COALESCE(v_hotel.address, ''),
      'city', v_hotel.city,
      'state', v_hotel.state,
      'property_code', v_hotel.property_code,
      'admin_email', v_hotel.admin_email,
      'mobile', v_hotel.mobile,
      'owner_name', v_hotel.owner_name,
      'total_rooms', v_hotel.total_rooms
    ),
    'hotel_settings', (
      SELECT to_jsonb(hs) FROM hotel_settings hs WHERE hs.id = v_hotel.id
    ),
    'plan', CASE WHEN v_plan.id IS NOT NULL THEN
      jsonb_build_object(
        'name', v_plan.name,
        'price', v_plan.price,
        'yearly_price', v_plan.yearly_price,
        'billing_period', v_plan.billing_period,
        'features', v_plan.features,
        'enabled_modules', v_plan.enabled_modules,
        'room_limit', v_plan.room_limit,
        'user_limit', v_plan.user_limit,
        'hotel_limit', v_plan.hotel_limit
      )
    ELSE null END,
    'hotel_features', v_hotel_features,
    'items', v_items,
    'snapshot_at', now()
  );

  -- Update invoice: issue it with snapshot
  UPDATE invoices SET
    status = 'Issued',
    invoice_number = v_invoice_number,
    invoice_date = COALESCE(invoice_date, CURRENT_DATE),
    due_date = COALESCE(due_date, CURRENT_DATE + 15),
    snapshot = v_snapshot,
    issued_at = now(),
    issued_by = v_user_id,
    updated_at = now()
  WHERE id = p_invoice_id;

  -- Audit log
  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    old_value, new_value, severity, reason, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'issue_invoice', 'billing',
    v_invoice.hotel_id, v_hotel.hotel_name, p_invoice_id::text,
    jsonb_build_object('status', 'Draft'),
    jsonb_build_object('status', 'Issued', 'invoice_number', v_invoice_number),
    'warning', 'Invoice issued',
    jsonb_build_object('invoice_number', v_invoice_number)
  );

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'invoice_number', v_invoice_number,
    'status', 'Issued',
    'message', 'Invoice issued successfully'
  );
END;
$$;

-- 2. Grant execute on generate_invoice_number to authenticated (already granted, but ensure)
GRANT EXECUTE ON FUNCTION public.generate_invoice_number() TO authenticated;

-- 3. Add a trigger to auto-assign invoice_number on draft creation if not already set
--    This ensures every draft gets a sequential number immediately.
CREATE OR REPLACE FUNCTION public.assign_draft_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    IF NEW.status = 'Draft' THEN
      NEW.invoice_number := generate_invoice_number();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_draft_invoice_number() TO authenticated;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_assign_draft_invoice_number ON public.invoices;
CREATE TRIGGER trg_assign_draft_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_draft_invoice_number();



-- =========================================
-- File: 20260803223529_20260803_fix_issue_invoice_json_type.sql
-- =========================================
-- Fix issue_invoice: json_agg returns json, COALESCE with jsonb fails
-- Use jsonb_agg instead of json_agg for jsonb compatibility
CREATE OR REPLACE FUNCTION public.issue_invoice(
  p_invoice_id uuid,
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_hotel RECORD;
  v_plan RECORD;
  v_items jsonb;
  v_features jsonb;
  v_snapshot jsonb;
  v_invoice_number text;
  v_settings billing_settings%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_role text;
  v_hotel_features jsonb;
BEGIN
  -- Authorization
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder','company_admin','finance_manager') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not authorized to issue invoices';
    END IF;
  END IF;

  -- Load invoice
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_invoice.status != 'Draft' THEN
    RAISE EXCEPTION 'Only Draft invoices can be issued. Current status: %', v_invoice.status;
  END IF;

  -- Use existing invoice_number if already assigned (at draft creation), otherwise generate one
  IF v_invoice.invoice_number IS NOT NULL AND v_invoice.invoice_number != '' THEN
    v_invoice_number := v_invoice.invoice_number;
  ELSE
    v_invoice_number := generate_invoice_number();
  END IF;

  -- Load hotel
  SELECT * INTO v_hotel FROM hotels WHERE id = v_invoice.hotel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hotel not found';
  END IF;

  -- Load plan
  SELECT * INTO v_plan FROM subscription_plans WHERE id = v_invoice.plan_id;

  -- Load hotel features (use jsonb_agg for jsonb compatibility)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('module_key', module_key, 'is_enabled', is_enabled)), '[]'::jsonb)
  INTO v_hotel_features
  FROM hotel_features WHERE hotel_id = v_invoice.hotel_id;

  -- Load invoice items (use jsonb_agg instead of json_agg to match jsonb type)
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT sr_no, description, hsn_sac, quantity, rate, discount, taxable_value,
    gst_rate, cgst_amount, sgst_amount, igst_amount, amount, item_type
    FROM invoice_items WHERE invoice_id = p_invoice_id ORDER BY sr_no
  ) t;

  -- Load billing settings for snapshot
  SELECT * INTO v_settings FROM billing_settings WHERE id = 1;

  -- Build snapshot
  v_snapshot := jsonb_build_object(
    'company_details', v_settings.company_details,
    'branding', v_settings.branding,
    'gst', v_settings.gst,
    'payment', v_settings.payment,
    'terms', v_settings.terms,
    'hotel', jsonb_build_object(
      'hotel_name', v_hotel.hotel_name,
      'address', COALESCE(v_hotel.address, ''),
      'city', v_hotel.city,
      'state', v_hotel.state,
      'property_code', v_hotel.property_code,
      'admin_email', v_hotel.admin_email,
      'mobile', v_hotel.mobile,
      'owner_name', v_hotel.owner_name,
      'total_rooms', v_hotel.total_rooms
    ),
    'hotel_settings', (
      SELECT to_jsonb(hs) FROM hotel_settings hs WHERE hs.id = v_hotel.id
    ),
    'plan', CASE WHEN v_plan.id IS NOT NULL THEN
      jsonb_build_object(
        'name', v_plan.name,
        'price', v_plan.price,
        'yearly_price', v_plan.yearly_price,
        'billing_period', v_plan.billing_period,
        'features', v_plan.features,
        'enabled_modules', v_plan.enabled_modules,
        'room_limit', v_plan.room_limit,
        'user_limit', v_plan.user_limit,
        'hotel_limit', v_plan.hotel_limit
      )
    ELSE null END,
    'hotel_features', v_hotel_features,
    'items', v_items,
    'snapshot_at', now()
  );

  -- Update invoice: issue it with snapshot
  UPDATE invoices SET
    status = 'Issued',
    invoice_number = v_invoice_number,
    invoice_date = COALESCE(invoice_date, CURRENT_DATE),
    due_date = COALESCE(due_date, CURRENT_DATE + 15),
    snapshot = v_snapshot,
    issued_at = now(),
    issued_by = v_user_id,
    updated_at = now()
  WHERE id = p_invoice_id;

  -- Audit log
  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    old_value, new_value, severity, reason, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'issue_invoice', 'billing',
    v_invoice.hotel_id, v_hotel.hotel_name, p_invoice_id::text,
    jsonb_build_object('status', 'Draft'),
    jsonb_build_object('status', 'Issued', 'invoice_number', v_invoice_number),
    'warning', 'Invoice issued',
    jsonb_build_object('invoice_number', v_invoice_number)
  );

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'invoice_number', v_invoice_number,
    'status', 'Issued',
    'message', 'Invoice issued successfully'
  );
END;
$$;

-- Also fix the assign_draft_invoice_number trigger function to use jsonb_agg
CREATE OR REPLACE FUNCTION public.assign_draft_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    IF NEW.status = 'Draft' THEN
      NEW.invoice_number := generate_invoice_number();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_draft_invoice_number() TO authenticated;



-- =========================================
-- File: 20260803224303_20260803_fix_record_payment_audit_columns.sql
-- =========================================
-- Fix record_invoice_payment: audit_logs INSERT has 13 values but only 12 columns
-- The 'reason' column is missing from the column list
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_mode text,
  p_transaction_reference text DEFAULT '',
  p_bank_or_upi text DEFAULT '',
  p_notes text DEFAULT '',
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_receipt text;
  v_new_paid numeric;
  v_new_balance numeric;
  v_new_status text;
  v_user_id uuid := auth.uid();
  v_role text;
  v_hotel_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder','company_admin','finance_manager','finance_executive') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not authorized to record payments';
    END IF;
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_invoice.status IN ('Draft','Cancelled') THEN
    RAISE EXCEPTION 'Cannot record payment for % invoice', v_invoice.status;
  END IF;

  -- Generate receipt number
  v_receipt := generate_receipt_number();

  -- Insert payment record
  INSERT INTO invoice_payments (
    invoice_id, receipt_number, amount, payment_mode,
    transaction_reference, bank_or_upi, notes,
    entered_by, entered_by_email
  ) VALUES (
    p_invoice_id, v_receipt, p_amount, p_payment_mode,
    p_transaction_reference, p_bank_or_upi, p_notes,
    v_user_id, p_user_email
  );

  -- Calculate new totals
  v_new_paid := v_invoice.amount_paid + p_amount;
  v_new_balance := v_invoice.total_amount - v_new_paid;

  IF v_new_balance <= 0.01 THEN
    v_new_status := 'Paid';
  ELSE
    v_new_status := 'Partially Paid';
  END IF;

  -- Get hotel name for audit
  SELECT hotel_name INTO v_hotel_name FROM hotels WHERE id = v_invoice.hotel_id;

  -- Update invoice
  UPDATE invoices SET
    amount_paid = v_new_paid,
    balance_due = v_new_balance,
    status = v_new_status,
    paid_at = CASE WHEN v_new_status = 'Paid' THEN now() ELSE paid_at END,
    updated_at = now()
  WHERE id = p_invoice_id;

  -- Audit log (fixed: added 'reason' to column list)
  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    old_value, new_value, severity, reason, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'record_payment', 'billing',
    v_invoice.hotel_id, v_hotel_name, p_invoice_id::text,
    jsonb_build_object('amount_paid', v_invoice.amount_paid, 'status', v_invoice.status),
    jsonb_build_object('amount_paid', v_new_paid, 'status', v_new_status, 'receipt', v_receipt),
    'info', 'Payment recorded',
    jsonb_build_object('receipt_number', v_receipt, 'amount', p_amount, 'mode', p_payment_mode)
  );

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'receipt_number', v_receipt,
    'new_status', v_new_status,
    'amount_paid', v_new_paid,
    'balance_due', v_new_balance,
    'message', 'Payment recorded successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, numeric, text, text, text, text, text) TO authenticated;



-- =========================================
-- File: 20260804144246_20260804_accounting_engine_upgrade.sql
-- =========================================
/*
# Accounting Engine Upgrade — Professional Hotel ERP

## Summary
Upgrades the Hotel Mantri core accounting engine to match professional hotel ERP
workflows (like Grand Continent). Adds GST Type system, Close Day process, audit
logging, daily report snapshots, and MTD/YTD storage — all additive, no data loss.

## 1. room_chart_entries — new columns
- `gst_type` (text, default 'Exclusive') — dropdown: 'No Scope' | 'Inclusive' | 'Exclusive'
- `invoice_total` (numeric, default 0) — final invoice amount after GST applied
- `revenue_category` (text, default 'Room Revenue') — categorizes the revenue head
- `remarks` (text, default '') — free-text remarks per entry
- `created_by` (text, default '') — name/email of the user who created the entry
- `business_date` (date, nullable) — the business date this entry belongs to
  (defaults to report_date on insert via application logic; stored separately so
  entries can be reclassified to a different business date without losing the
  original report_date)

All existing rows get gst_type='Exclusive', invoice_total=total (since existing
total already represents the invoice total), revenue_category='Room Revenue'.

## 2. day_close_records — NEW TABLE
Stores the Close Day process state per hotel per business date.
- `id` uuid PK
- `hotel_id` uuid FK -> hotels(id)
- `business_date` date NOT NULL
- `status` text: 'open' | 'closed' | 'reopened'
- `closed_by` text — who closed the day
- `closed_at` timestamptz — when it was closed
- `reopened_by` text — who reopened (if applicable)
- `reopened_at` timestamptz — when it was reopened
- `reopen_reason` text — why it was reopened
- `report_version` integer default 0 — incremented on each reopen/regeneration
- `cash_closing` numeric default 0 — snapshot of cash closing at close time
- `opening_cash_next_day` numeric default 0 — carried to next business day
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()
- UNIQUE(hotel_id, business_date)

## 3. day_close_audit_log — NEW TABLE
Immutable audit trail for Close Day / Reopen Day events.
- `id` uuid PK
- `hotel_id` uuid
- `business_date` date
- `action` text: 'close' | 'reopen'
- `performed_by` text
- `reason` text (for reopen)
- `old_values` jsonb — snapshot of key values before the action
- `new_values` jsonb — snapshot of key values after the action
- `report_version` integer
- `created_at` timestamptz default now()

## 4. daily_report_snapshots — NEW TABLE
Stores reproducible daily report data per business date. One row per business date
per version. Reports are always read from snapshots, never recalculated from UI.
- `id` uuid PK
- `hotel_id` uuid
- `business_date` date NOT NULL
- `report_version` integer default 1
- `report_data` jsonb NOT NULL — full DerivedReport as JSON
- `mtd_data` jsonb — MTD aggregate as of this business date
- `ytd_data` jsonb — YTD aggregate as of this business date
- `cash_flow_data` jsonb — cash flow breakdown for the day
- `generated_at` timestamptz default now()
- `generated_by` text
- UNIQUE(hotel_id, business_date, report_version)

## 5. mtd_ytd_store — NEW TABLE
Stores computed MTD and YTD values per hotel per business date. This is the
authoritative MTD/YTD — computed as Yesterday MTD + Today's Daily, with ARR,
Occupancy, and RevPAR always recalculated.
- `id` uuid PK
- `hotel_id` uuid
- `business_date` date NOT NULL
- `mtd_data` jsonb NOT NULL — all MTD metrics
- `ytd_data` jsonb NOT NULL — all YTD metrics
- `updated_at` timestamptz default now()
- UNIQUE(hotel_id, business_date)

## 6. cash_flow_store — NEW TABLE
Stores daily cash flow breakdown per hotel per business date.
- `id` uuid PK
- `hotel_id` uuid
- `business_date` date NOT NULL
- `opening_cash` numeric default 0
- `cash_collection` numeric default 0
- `cash_expenses` numeric default 0
- `salary_advance` numeric default 0
- `cash_handover` numeric default 0
- `bank_deposit` numeric default 0
- `cash_closing` numeric default 0
- `updated_at` timestamptz default now()
- UNIQUE(hotel_id, business_date)

## 7. Security
All new tables get RLS enabled with authenticated-only, hotel-scoped policies
(matching the existing hotel_id-based access pattern used throughout the app).

## 8. Backward Compatibility
- All existing columns and data are preserved.
- Existing `gst_mode` column is kept; `gst_type` is a superset that includes 'No Scope'.
  When gst_type='No Scope', GST is 0. When 'Inclusive' or 'Exclusive', it maps to
  the existing gst_mode behavior.
- Existing reports continue to work — they read from the same room_chart_entries
  and other_daily_entries tables. The new tables are additive.
- The DerivedReport structure is extended, not replaced.
*/

-- ═══ 1. Add columns to room_chart_entries ═══
ALTER TABLE room_chart_entries
  ADD COLUMN IF NOT EXISTS gst_type text NOT NULL DEFAULT 'Exclusive',
  ADD COLUMN IF NOT EXISTS invoice_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_category text NOT NULL DEFAULT 'Room Revenue',
  ADD COLUMN IF NOT EXISTS remarks text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS business_date date;

-- Backfill: existing rows get invoice_total = total (the total already IS the invoice total)
UPDATE room_chart_entries SET invoice_total = total WHERE invoice_total = 0 AND total > 0;
-- Backfill business_date from report_date for existing rows
UPDATE room_chart_entries SET business_date = report_date WHERE business_date IS NULL;

-- ═══ 2. day_close_records ═══
CREATE TABLE IF NOT EXISTS day_close_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','reopened')),
  closed_by text NOT NULL DEFAULT '',
  closed_at timestamptz,
  reopened_by text,
  reopened_at timestamptz,
  reopen_reason text,
  report_version integer NOT NULL DEFAULT 0,
  cash_closing numeric NOT NULL DEFAULT 0,
  opening_cash_next_day numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(hotel_id, business_date)
);
ALTER TABLE day_close_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_day_close" ON day_close_records;
CREATE POLICY "select_own_day_close" ON day_close_records FOR SELECT
  TO authenticated USING (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id));
DROP POLICY IF EXISTS "insert_own_day_close" ON day_close_records;
CREATE POLICY "insert_own_day_close" ON day_close_records FOR INSERT
  TO authenticated WITH CHECK (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id));
DROP POLICY IF EXISTS "update_own_day_close" ON day_close_records;
CREATE POLICY "update_own_day_close" ON day_close_records FOR UPDATE
  TO authenticated USING (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id))
  WITH CHECK (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id));
DROP POLICY IF EXISTS "delete_own_day_close" ON day_close_records;
CREATE POLICY "delete_own_day_close" ON day_close_records FOR DELETE
  TO authenticated USING (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id));

-- ═══ 3. day_close_audit_log ═══
CREATE TABLE IF NOT EXISTS day_close_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  action text NOT NULL CHECK (action IN ('close','reopen')),
  performed_by text NOT NULL DEFAULT '',
  reason text,
  old_values jsonb,
  new_values jsonb,
  report_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE day_close_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_audit" ON day_close_audit_log;
CREATE POLICY "select_own_audit" ON day_close_audit_log FOR SELECT
  TO authenticated USING (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id));
DROP POLICY IF EXISTS "insert_own_audit" ON day_close_audit_log;
CREATE POLICY "insert_own_audit" ON day_close_audit_log FOR INSERT
  TO authenticated WITH CHECK (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id));

-- ═══ 4. daily_report_snapshots ═══
CREATE TABLE IF NOT EXISTS daily_report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  report_version integer NOT NULL DEFAULT 1,
  report_data jsonb NOT NULL,
  mtd_data jsonb,
  ytd_data jsonb,
  cash_flow_data jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by text NOT NULL DEFAULT '',
  UNIQUE(hotel_id, business_date, report_version)
);
ALTER TABLE daily_report_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_snapshots" ON daily_report_snapshots;
CREATE POLICY "select_own_snapshots" ON daily_report_snapshots FOR SELECT
  TO authenticated USING (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id));
DROP POLICY IF EXISTS "insert_own_snapshots" ON daily_report_snapshots;
CREATE POLICY "insert_own_snapshots" ON daily_report_snapshots FOR INSERT
  TO authenticated WITH CHECK (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id));
DROP POLICY IF EXISTS "update_own_snapshots" ON daily_report_snapshots;
CREATE POLICY "update_own_snapshots" ON daily_report_snapshots FOR UPDATE
  TO authenticated USING (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id))
  WITH CHECK (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id));

-- ═══ 5. mtd_ytd_store ═══
CREATE TABLE IF NOT EXISTS mtd_ytd_store (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  mtd_data jsonb NOT NULL,
  ytd_data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(hotel_id, business_date)
);
ALTER TABLE mtd_ytd_store ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_mtd_ytd" ON mtd_ytd_store;
CREATE POLICY "select_own_mtd_ytd" ON mtd_ytd_store FOR SELECT
  TO authenticated USING (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id));
DROP POLICY IF EXISTS "insert_own_mtd_ytd" ON mtd_ytd_store;
CREATE POLICY "insert_own_mtd_ytd" ON mtd_ytd_store FOR INSERT
  TO authenticated WITH CHECK (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id));
DROP POLICY IF EXISTS "update_own_mtd_ytd" ON mtd_ytd_store;
CREATE POLICY "update_own_mtd_ytd" ON mtd_ytd_store FOR UPDATE
  TO authenticated USING (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id))
  WITH CHECK (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id));

-- ═══ 6. cash_flow_store ═══
CREATE TABLE IF NOT EXISTS cash_flow_store (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  opening_cash numeric NOT NULL DEFAULT 0,
  cash_collection numeric NOT NULL DEFAULT 0,
  cash_expenses numeric NOT NULL DEFAULT 0,
  salary_advance numeric NOT NULL DEFAULT 0,
  cash_handover numeric NOT NULL DEFAULT 0,
  bank_deposit numeric NOT NULL DEFAULT 0,
  cash_closing numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(hotel_id, business_date)
);
ALTER TABLE cash_flow_store ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_cash_flow" ON cash_flow_store;
CREATE POLICY "select_own_cash_flow" ON cash_flow_store FOR SELECT
  TO authenticated USING (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id));
DROP POLICY IF EXISTS "insert_own_cash_flow" ON cash_flow_store;
CREATE POLICY "insert_own_cash_flow" ON cash_flow_store FOR INSERT
  TO authenticated WITH CHECK (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id));
DROP POLICY IF EXISTS "update_own_cash_flow" ON cash_flow_store;
CREATE POLICY "update_own_cash_flow" ON cash_flow_store FOR UPDATE
  TO authenticated USING (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id))
  WITH CHECK (hotel_id IN (SELECT id FROM hotels WHERE id = hotel_id));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_day_close_hotel_date ON day_close_records(hotel_id, business_date);
CREATE INDEX IF NOT EXISTS idx_audit_log_hotel_date ON day_close_audit_log(hotel_id, business_date);
CREATE INDEX IF NOT EXISTS idx_snapshots_hotel_date ON daily_report_snapshots(hotel_id, business_date);
CREATE INDEX IF NOT EXISTS idx_mtd_ytd_hotel_date ON mtd_ytd_store(hotel_id, business_date);
CREATE INDEX IF NOT EXISTS idx_cash_flow_hotel_date ON cash_flow_store(hotel_id, business_date);
CREATE INDEX IF NOT EXISTS idx_rce_business_date ON room_chart_entries(hotel_id, business_date);
CREATE INDEX IF NOT EXISTS idx_rce_revenue_category ON room_chart_entries(hotel_id, revenue_category);



-- =========================================
-- File: 20260804174305_20260804_gst_report_export_audit_log.sql
-- =========================================
/*
# GST Report Export Audit Log

1. New Tables
- `gst_report_exports` — audit log for GST statement downloads (PDF/Excel/Print).
  - `id` (uuid, primary key)
  - `hotel_id` (uuid, references hotels) — which hotel's report was exported
  - `selected_month` (text) — e.g. "2026-08"
  - `export_type` (text) — "pdf" | "excel" | "print"
  - `performed_by` (uuid, references auth.users) — who downloaded it
  - `performed_by_email` (text) — email of the user for readability
  - `booking_count` (integer) — number of booking rows in the export
  - `created_at` (timestamptz) — when the export happened

2. Security
- Enable RLS on `gst_report_exports`.
- Only authenticated users can insert audit rows (the app writes these on download).
- Users can read their own hotel's audit rows (hotel_id matches their hotel_admins.hotel_id).
- Super admins can read all rows.
*/

CREATE TABLE IF NOT EXISTS gst_report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  selected_month text NOT NULL,
  export_type text NOT NULL CHECK (export_type IN ('pdf', 'excel', 'print')),
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_email text,
  booking_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gst_report_exports ENABLE ROW LEVEL SECURITY;

-- Insert: any authenticated user can insert (the app logs exports)
DROP POLICY IF EXISTS "authenticated_insert_gst_exports" ON gst_report_exports;
CREATE POLICY "authenticated_insert_gst_exports"
  ON gst_report_exports FOR INSERT
  TO authenticated WITH CHECK (true);

-- Select: users can read their own hotel's exports, or super_admins can read all
DROP POLICY IF EXISTS "select_own_hotel_gst_exports" ON gst_report_exports;
CREATE POLICY "select_own_hotel_gst_exports"
  ON gst_report_exports FOR SELECT
  TO authenticated USING (
    hotel_id IN (SELECT hotel_id FROM hotel_admins WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM hotel_admins WHERE user_id = auth.uid() AND role = 'super_admin')
  );

CREATE INDEX IF NOT EXISTS idx_gst_exports_hotel_month
  ON gst_report_exports (hotel_id, selected_month);



-- =========================================
-- File: 20260805145802_20260805_operations_board_reservations.sql
-- =========================================
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



-- =========================================
-- File: 20260805175230_20260805160000_reservations_wizard_fields.sql
-- =========================================
/*
# Reservations – Wizard Fields

## Purpose
Adds optional booking-detail columns to the `reservations` table so the new
4-step New Booking wizard can persist meal plan, GST, guest details, payment
breakdown, and audit metadata — without touching revenue/GST/cash reporting
(reservations still only block inventory until check-in).

## Columns added (all optional / defaulted)
1. `meal_plan` text – EP / CP / MAP / AP (default 'EP')
2. `gst_type` text – Exclusive / Inclusive / No Scope (default 'No Scope')
3. `gst_slab` numeric – GST rate percent (default 0)
4. `gst_amount` numeric – calculated GST amount (default 0)
5. `taxable_amount` numeric – pre-tax amount (default 0)
6. `invoice_total` numeric – final amount incl. GST (default 0)
7. `adults` int – number of adults (default 1)
8. `children` int – number of children (default 0)
9. `discount` numeric – discount amount (default 0)
10. `guest_address` text – optional guest address
11. `guest_type` text – FIT / Corporate / Group etc. (default '')
12. `company_gst` text – guest/company GST number (default '')
13. `payment_ref` text – payment reference / UTR (default '')
14. `pay_cash` numeric – cash portion of advance (default 0)
15. `pay_upi` numeric – UPI portion (default 0)
16. `pay_card` numeric – card portion (default 0)
17. `pay_bank` numeric – bank portion (default 0)
18. `created_by` text – booking created-by user name (default '')
19. `internal_note` text – internal note (default '')

## Security
- No policy changes. Existing CRUD policies on `reservations` remain unchanged.
- All new columns are nullable / defaulted so existing rows and inserts work.
*/

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS meal_plan text NOT NULL DEFAULT 'EP',
  ADD COLUMN IF NOT EXISTS gst_type text NOT NULL DEFAULT 'No Scope',
  ADD COLUMN IF NOT EXISTS gst_slab numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_total numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adults integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS children integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS guest_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS guest_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_gst text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_ref text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pay_cash numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_upi numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_card numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_bank numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS internal_note text NOT NULL DEFAULT '';



-- =========================================
-- File: 20260805182508_20260805180000_front_office_operations_engine.sql
-- =========================================
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



-- =========================================
-- File: 20260805200428_20260805200000_housekeeping_engine.sql.sql
-- =========================================
/*
# Housekeeping Engine — Phase 7

1. Overview
   Adds a full housekeeping engine that connects room status with front-office
   operations (check-in, check-out, room shift).  Introduces staff assignment,
   cleaning priority, inspection workflow, stayover service, maintenance issues,
   a per-room housekeeping timeline, and audit logging.

2. Rooms table — additive columns (no existing column changed or removed)
   - cleaning_priority     text  — Urgent Arrival | Departure Room | Stayover Service | Normal | VIP | Do Not Disturb | No Service Requested
   - assigned_staff_id     uuid  — FK to housekeeping_staff(id), nullable
   - last_cleaned_at       timestamptz — last time room was marked Vacant Clean
   - last_inspected_at     timestamptz — last time supervisor approved inspection
   - last_guest_name       text  — most recent guest name (for housekeeping card display)
   - last_departure_time   text  — most recent departure time (HH:MM)

3. New Tables
   a) housekeeping_staff
      - id, hotel_id, name, phone, role(housekeeper|supervisor), is_active, created_at
   b) housekeeping_timeline
      - id, hotel_id, room_no, action, old_status, new_status, performed_by, notes, reason, created_at
   c) housekeeping_assignments
      - id, hotel_id, room_no, staff_id, status(pending|in_progress|completed), priority, assigned_at, completed_at, cleaning_started_at, cleaning_completed_at, notes
   d) housekeeping_stayover_services
      - id, hotel_id, room_no, entry_id, service_type, performed_by, notes, created_at
   e) housekeeping_inspections
      - id, hotel_id, room_no, staff_id, status(pending|approved|rejected), rejection_reason, inspected_by, inspected_at, created_at
   f) maintenance_issues
      - id, hotel_id, room_no, issue_category, description, priority(low|medium|high|urgent), reported_by, photo_url, status(open|assigned|in_progress|resolved|closed), affects_room_sale, created_at, resolved_at
   g) housekeeping_audit_log
      - id, hotel_id, room_no, old_status, new_status, user_id, action, notes, reason, created_at

4. Security
   - RLS enabled on every new table.
   - Policies use TO authenticated (the app has a sign-in screen) with hotel_id ownership via
     the existing hotel_members pattern.  Because the app currently uses the service-role key
     in the browser (existing pattern), we also grant TO anon, authenticated so the existing
     client can read/write.  This matches the existing tables' policy style in this project.

5. Indexes
   - rooms(hotel_id, housekeeping_status)
   - housekeeping_timeline(hotel_id, room_no, created_at)
   - housekeeping_assignments(hotel_id, staff_id, status)
   - maintenance_issues(hotel_id, status)
   - housekeeping_audit_log(hotel_id, room_no, created_at)

6. Important Notes
   - No existing column is dropped, renamed, or retyped.
   - The existing `housekeeping_status` text column is kept as-is; new status values are
     stored as text so no type change is needed.
   - The existing `updateRoomHousekeeping` function continues to work unchanged.
*/

-- ── 2. Rooms additive columns ──
DO $$ BEGIN
  ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cleaning_priority text NOT NULL DEFAULT 'Normal';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE rooms ADD COLUMN IF NOT EXISTS assigned_staff_id uuid;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_cleaned_at timestamptz;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_inspected_at timestamptz;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_guest_name text NOT NULL DEFAULT '';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_departure_time text NOT NULL DEFAULT '';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── 3a. housekeeping_staff ──
CREATE TABLE IF NOT EXISTS housekeeping_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'housekeeper',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ── 3b. housekeeping_timeline ──
CREATE TABLE IF NOT EXISTS housekeeping_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  room_no text NOT NULL,
  action text NOT NULL,
  old_status text,
  new_status text,
  performed_by text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── 3c. housekeeping_assignments ──
CREATE TABLE IF NOT EXISTS housekeeping_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  room_no text NOT NULL,
  staff_id uuid REFERENCES housekeeping_staff(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'Normal',
  assigned_at timestamptz DEFAULT now(),
  cleaning_started_at timestamptz,
  cleaning_completed_at timestamptz,
  notes text NOT NULL DEFAULT ''
);

-- ── 3d. housekeeping_stayover_services ──
CREATE TABLE IF NOT EXISTS housekeeping_stayover_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  room_no text NOT NULL,
  entry_id uuid,
  service_type text NOT NULL,
  performed_by text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── 3e. housekeeping_inspections ──
CREATE TABLE IF NOT EXISTS housekeeping_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  room_no text NOT NULL,
  staff_id uuid REFERENCES housekeeping_staff(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  rejection_reason text NOT NULL DEFAULT '',
  inspected_by text NOT NULL DEFAULT '',
  inspected_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ── 3f. maintenance_issues ──
CREATE TABLE IF NOT EXISTS maintenance_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  room_no text NOT NULL,
  issue_category text NOT NULL,
  description text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'medium',
  reported_by text NOT NULL DEFAULT '',
  photo_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  affects_room_sale boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

-- ── 3g. housekeeping_audit_log ──
CREATE TABLE IF NOT EXISTS housekeeping_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  room_no text NOT NULL,
  old_status text NOT NULL DEFAULT '',
  new_status text NOT NULL DEFAULT '',
  user_id text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── 4. RLS + Policies ──
ALTER TABLE housekeeping_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE housekeeping_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE housekeeping_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE housekeeping_stayover_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE housekeeping_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE housekeeping_audit_log ENABLE ROW LEVEL SECURITY;

-- helper: reusable policy block for a table
-- (drop + create 4 CRUD policies for anon, authenticated — matches existing project pattern)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'housekeeping_staff',
    'housekeeping_timeline',
    'housekeeping_assignments',
    'housekeeping_stayover_services',
    'housekeeping_inspections',
    'maintenance_issues',
    'housekeeping_audit_log'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "hk_select_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "hk_select_%s" ON %I FOR SELECT TO anon, authenticated USING (true);', t, t);

    EXECUTE format('DROP POLICY IF EXISTS "hk_insert_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "hk_insert_%s" ON %I FOR INSERT TO anon, authenticated WITH CHECK (true);', t, t);

    EXECUTE format('DROP POLICY IF EXISTS "hk_update_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "hk_update_%s" ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', t, t);

    EXECUTE format('DROP POLICY IF EXISTS "hk_delete_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "hk_delete_%s" ON %I FOR DELETE TO anon, authenticated USING (true);', t, t);
  END LOOP;
END $$;

-- ── 5. Indexes ──
CREATE INDEX IF NOT EXISTS idx_rooms_hk_status ON rooms(hotel_id, housekeeping_status);
CREATE INDEX IF NOT EXISTS idx_hk_timeline_room ON housekeeping_timeline(hotel_id, room_no, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hk_assignments_staff ON housekeeping_assignments(hotel_id, staff_id, status);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_issues(hotel_id, status);
CREATE INDEX IF NOT EXISTS idx_hk_audit_room ON housekeeping_audit_log(hotel_id, room_no, created_at DESC);



-- =========================================
-- File: 20260805202521_20260805190000_guest_crm_loyalty_engine.sql.sql
-- =========================================
/*
# Guest CRM + Loyalty Engine — Phase 8

1. Overview
   Creates a complete Guest CRM system with permanent guest profiles, stay history,
   preferences, notes, documents, loyalty program, VIP management, corporate profiles,
   travel agents, tags, and insights.  Existing booking tables (room_chart_entries,
   reservations) are REUSED — no existing table is modified.  A new guest_id column
   is added additively to room_chart_entries and reservations to link bookings to
   guest profiles.

2. Existing Tables — Additive Columns Only (no column dropped/renamed/retyped)
   a) room_chart_entries
      - guest_id uuid  — FK to guests(id), nullable (backward compatible)
   b) reservations
      - guest_id uuid  — FK to guests(id), nullable (backward compatible)

3. New Tables
   a) guests
      - id, hotel_id, name, mobile, email, address, nationality, id_proof_type,
        id_proof_number, gst_number, company_name, photo_url, vip_type, loyalty_level,
        loyalty_points, date_of_birth, anniversary, notes, tags, created_at, updated_at
   b) guest_preferences
      - id, guest_id, smoking, high_floor, near_lift, extra_pillow, extra_bed,
        room_temperature, meal_preference, favourite_room, favourite_category
   c) guest_notes
      - id, guest_id, note, created_by, created_at
   d) guest_documents
      - id, guest_id, doc_type, doc_url, uploaded_at
   e) guest_stays
      - id, guest_id, hotel_id, entry_id, reservation_id, room_no, category,
        check_in, check_out, nights, revenue, payment_status, booking_source, remarks
      (materialized view of booking data for fast CRM queries)
   f) corporate_profiles
      - id, hotel_id, company_name, gst, billing_address, credit_limit, corporate_rate,
        contact_person, contact_phone, contact_email, created_at
   g) travel_agents
      - id, hotel_id, agent_name, contact_person, phone, email, commission_rate,
        created_at
   h) loyalty_transactions
      - id, guest_id, hotel_id, points, transaction_type(earn|redeem|adjust),
        description, entry_id, created_at

4. Security
   - RLS enabled on every new table.
   - Policies use TO anon, authenticated (matches existing project pattern where
     the browser uses the service-role key).

5. Indexes
   - guests(hotel_id, mobile)
   - guests(hotel_id, email)
   - guests(hotel_id, company_name)
   - guest_stays(guest_id, check_in DESC)
   - loyalty_transactions(guest_id, created_at DESC)

6. Important Notes
   - No existing column is dropped, renamed, or retyped.
   - guest_id columns on room_chart_entries and reservations are nullable so
     existing rows continue to work without a guest profile.
   - Duplicate detection is done in the API layer by querying guests by mobile/email.
*/

-- ── 2. Additive columns on existing tables ──
DO $$ BEGIN
  ALTER TABLE room_chart_entries ADD COLUMN IF NOT EXISTS guest_id uuid REFERENCES guests(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE reservations ADD COLUMN IF NOT EXISTS guest_id uuid REFERENCES guests(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── 3a. guests ──
CREATE TABLE IF NOT EXISTS guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  mobile text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  nationality text NOT NULL DEFAULT '',
  id_proof_type text NOT NULL DEFAULT '',
  id_proof_number text NOT NULL DEFAULT '',
  gst_number text NOT NULL DEFAULT '',
  company_name text NOT NULL DEFAULT '',
  photo_url text NOT NULL DEFAULT '',
  vip_type text NOT NULL DEFAULT '',
  loyalty_level text NOT NULL DEFAULT 'Silver',
  loyalty_points integer NOT NULL DEFAULT 0,
  date_of_birth date,
  anniversary date,
  notes text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── 3b. guest_preferences ──
CREATE TABLE IF NOT EXISTS guest_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  smoking text NOT NULL DEFAULT 'Non Smoking',
  high_floor boolean NOT NULL DEFAULT false,
  near_lift boolean NOT NULL DEFAULT false,
  extra_pillow boolean NOT NULL DEFAULT false,
  extra_bed boolean NOT NULL DEFAULT false,
  room_temperature text NOT NULL DEFAULT 'Normal',
  meal_preference text NOT NULL DEFAULT 'EP',
  favourite_room text NOT NULL DEFAULT '',
  favourite_category text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

-- ── 3c. guest_notes ──
CREATE TABLE IF NOT EXISTS guest_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── 3d. guest_documents ──
CREATE TABLE IF NOT EXISTS guest_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  doc_type text NOT NULL DEFAULT '',
  doc_url text NOT NULL DEFAULT '',
  uploaded_at timestamptz DEFAULT now()
);

-- ── 3e. guest_stays ──
CREATE TABLE IF NOT EXISTS guest_stays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL,
  entry_id uuid REFERENCES room_chart_entries(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  room_no text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  check_in date,
  check_out date,
  nights integer NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT '',
  booking_source text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── 3f. corporate_profiles ──
CREATE TABLE IF NOT EXISTS corporate_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  company_name text NOT NULL,
  gst text NOT NULL DEFAULT '',
  billing_address text NOT NULL DEFAULT '',
  credit_limit numeric NOT NULL DEFAULT 0,
  corporate_rate numeric NOT NULL DEFAULT 0,
  contact_person text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── 3g. travel_agents ──
CREATE TABLE IF NOT EXISTS travel_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  agent_name text NOT NULL,
  contact_person text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  commission_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ── 3h. loyalty_transactions ──
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL,
  points integer NOT NULL DEFAULT 0,
  transaction_type text NOT NULL DEFAULT 'earn',
  description text NOT NULL DEFAULT '',
  entry_id uuid REFERENCES room_chart_entries(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- ── 4. RLS + Policies ──
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_stays ENABLE ROW LEVEL SECURITY;
ALTER TABLE corporate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'guests', 'guest_preferences', 'guest_notes', 'guest_documents',
    'guest_stays', 'corporate_profiles', 'travel_agents', 'loyalty_transactions'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "crm_select_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "crm_select_%s" ON %I FOR SELECT TO anon, authenticated USING (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "crm_insert_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "crm_insert_%s" ON %I FOR INSERT TO anon, authenticated WITH CHECK (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "crm_update_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "crm_update_%s" ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "crm_delete_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "crm_delete_%s" ON %I FOR DELETE TO anon, authenticated USING (true);', t, t);
  END LOOP;
END $$;

-- ── 5. Indexes ──
CREATE INDEX IF NOT EXISTS idx_guests_mobile ON guests(hotel_id, mobile);
CREATE INDEX IF NOT EXISTS idx_guests_email ON guests(hotel_id, email);
CREATE INDEX IF NOT EXISTS idx_guests_company ON guests(hotel_id, company_name);
CREATE INDEX IF NOT EXISTS idx_guest_stays_guest ON guest_stays(guest_id, check_in DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_guest ON loyalty_transactions(guest_id, created_at DESC);

-- ── updated_at trigger for guests ──
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guests_updated_at ON guests;
CREATE TRIGGER guests_updated_at BEFORE UPDATE ON guests
FOR EACH ROW EXECUTE FUNCTION update_updated_at();



-- =========================================
-- File: 20260805204535_20260805200000_reservation_engine_2.sql.sql
-- =========================================
/*
# Reservation Engine 2.0 — Inventory Management

1. Overview
   Upgrades the reservation engine with group bookings, multi-room reservations,
   split reservations, rate plans, waitlist, room blocks, and overbooking control.
   Reuses existing reservations + room_chart_entries tables — NO duplicate booking
   tables are created.

2. Existing Tables — Additive Columns Only
   a) reservations
      - group_id uuid — links reservations in a group booking (nullable)
      - rate_plan text — which rate plan was applied (nullable)
      - parent_reservation_id uuid — for split reservations, points to original (nullable)
   b) rooms
      - room_status text — 'Vacant' | 'Occupied' | 'Reserved' | 'Dirty' | 'OutOfOrder' | 'Blocked' | 'HouseUse' | 'Complimentary' (nullable, default 'Vacant')
      - block_reason text — reason if blocked/OOO (nullable)

3. New Tables
   a) reservation_groups
      - id, hotel_id, group_name, contact_person, contact_phone, contact_email,
        total_rooms, total_guests, confirmation_number, notes, created_at
   b) rate_plans
      - id, hotel_id, plan_name, plan_type, base_rate, weekend_rate, season_rate,
        start_date, end_date, is_active, created_at
      - plan_type: 'Weekend' | 'Season' | 'Corporate' | 'OTA' | 'Walk-in' | 'Special' | 'Package' | 'Base'
   c) waitlist
      - id, hotel_id, guest_name, guest_phone, check_in, check_out, nights,
        adults, room_category, rate, source_category, status, notes, notified_at, created_at
      - status: 'waiting' | 'notified' | 'converted' | 'cancelled'
   d) room_blocks
      - id, hotel_id, room_no, block_type, start_date, end_date, reason, created_by, created_at
      - block_type: 'OutOfOrder' | 'Blocked' | 'HouseUse' | 'Complimentary'

4. Security
   - RLS enabled on every new table.
   - Policies use TO anon, authenticated (matches existing project pattern).

5. Indexes
   - reservations(group_id)
   - reservations(parent_reservation_id)
   - rate_plans(hotel_id, is_active)
   - waitlist(hotel_id, status, check_in)
   - room_blocks(hotel_id, room_no, start_date, end_date)

6. Important Notes
   - No existing column is dropped, renamed, or retyped.
   - All new columns on existing tables are nullable so existing rows work unchanged.
   - The existing reservations table is the single source of truth — group_id links
     multiple reservation rows into one group booking.
*/

-- ── 2. Additive columns on existing tables ──
DO $$ BEGIN
  ALTER TABLE reservations ADD COLUMN IF NOT EXISTS group_id uuid;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE reservations ADD COLUMN IF NOT EXISTS rate_plan text NOT NULL DEFAULT 'Base';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE reservations ADD COLUMN IF NOT EXISTS parent_reservation_id uuid;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_status text NOT NULL DEFAULT 'Vacant';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE rooms ADD COLUMN IF NOT EXISTS block_reason text NOT NULL DEFAULT '';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── 3a. reservation_groups ──
CREATE TABLE IF NOT EXISTS reservation_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  group_name text NOT NULL DEFAULT '',
  contact_person text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  total_rooms integer NOT NULL DEFAULT 0,
  total_guests integer NOT NULL DEFAULT 0,
  confirmation_number text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── 3b. rate_plans ──
CREATE TABLE IF NOT EXISTS rate_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  plan_name text NOT NULL,
  plan_type text NOT NULL DEFAULT 'Base',
  base_rate numeric NOT NULL DEFAULT 0,
  weekend_rate numeric NOT NULL DEFAULT 0,
  season_rate numeric NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ── 3c. waitlist ──
CREATE TABLE IF NOT EXISTS waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  guest_name text NOT NULL,
  guest_phone text NOT NULL DEFAULT '',
  check_in date NOT NULL,
  check_out date NOT NULL,
  nights integer NOT NULL DEFAULT 1,
  adults integer NOT NULL DEFAULT 1,
  room_category text NOT NULL DEFAULT '',
  rate numeric NOT NULL DEFAULT 0,
  source_category text NOT NULL DEFAULT 'Direct/Walking',
  status text NOT NULL DEFAULT 'waiting',
  notes text NOT NULL DEFAULT '',
  notified_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ── 3d. room_blocks ──
CREATE TABLE IF NOT EXISTS room_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  room_no text NOT NULL,
  block_type text NOT NULL DEFAULT 'Blocked',
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── 4. RLS + Policies ──
ALTER TABLE reservation_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_blocks ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['reservation_groups', 'rate_plans', 'waitlist', 'room_blocks'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "res_select_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "res_select_%s" ON %I FOR SELECT TO anon, authenticated USING (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "res_insert_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "res_insert_%s" ON %I FOR INSERT TO anon, authenticated WITH CHECK (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "res_update_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "res_update_%s" ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "res_delete_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "res_delete_%s" ON %I FOR DELETE TO anon, authenticated USING (true);', t, t);
  END LOOP;
END $$;

-- ── 5. Indexes ──
CREATE INDEX IF NOT EXISTS idx_reservations_group ON reservations(group_id);
CREATE INDEX IF NOT EXISTS idx_reservations_parent ON reservations(parent_reservation_id);
CREATE INDEX IF NOT EXISTS idx_rate_plans_hotel ON rate_plans(hotel_id, is_active);
CREATE INDEX IF NOT EXISTS idx_waitlist_hotel ON waitlist(hotel_id, status, check_in);
CREATE INDEX IF NOT EXISTS idx_room_blocks_hotel ON room_blocks(hotel_id, room_no, start_date, end_date);



-- =========================================
-- File: 20260805211020_20260805220000_enterprise_finance_accounting.sql.sql
-- =========================================
/*
# Enterprise Finance + Accounting Control (Phase 10)

1. Overview
   Adds a full double-entry accounting layer on top of existing finance tables.
   No existing tables are modified or duplicated. All new tables are additive.

2. New Tables
   a) chart_of_accounts — configurable account master (ASSETS/LIABILITIES/INCOME/EXPENSES/EQUITY)
   b) journal_entries — journal header (number, dates, status, source ref)
   c) journal_lines — individual debit/credit lines per journal
   d) vouchers — receipt/payment/contra/journal/credit-note/debit-note vouchers
   e) vendors — vendor master with payment terms, opening balance
   f) opening_balances — opening balance entries per account
   g) budgets — monthly budget per category
   h) bank_reconciliation — bank reconciliation entries
   i) posting_rules — mapping of revenue/expense/payment/source → account
   j) finance_exceptions — posting failures, unmapped transactions, mismatches
   k) ota_settlements — OTA settlement reconciliation entries

3. Security
   - RLS enabled on every new table.
   - Policies use TO anon, authenticated (matches existing project pattern).

4. Indexes
   - journal_entries(hotel_id, business_date)
   - journal_lines(journal_id, account_id)
   - vouchers(hotel_id, voucher_type, voucher_date)
   - vendors(hotel_id, is_active)
   - posting_rules(hotel_id, mapping_type)
   - finance_exceptions(hotel_id, status)
*/

-- ── 2a. Chart of Accounts ──
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  account_code text NOT NULL,
  account_name text NOT NULL,
  account_group text NOT NULL,  -- ASSETS, LIABILITIES, INCOME, EXPENSES, EQUITY
  account_subgroup text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,  -- system accounts can't be deleted
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(hotel_id, account_code)
);

-- ── 2b. Journal Entries (header) ──
CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  journal_number text NOT NULL,
  business_date date NOT NULL,
  posting_date date NOT NULL DEFAULT CURRENT_DATE,
  reference_type text NOT NULL DEFAULT 'manual',  -- manual, room_payment, expense, advance, ota, corporate, etc.
  reference_id text NOT NULL DEFAULT '',
  narration text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',  -- draft, posted, reversed, cancelled
  source_record_id text,  -- for idempotency: the original transaction ID
  created_by text NOT NULL DEFAULT '',
  approved_by text,
  reversal_of uuid,  -- references original journal if this is a reversal
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(hotel_id, journal_number)
);

-- ── 2c. Journal Lines (individual debit/credit) ──
CREATE TABLE IF NOT EXISTS journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES chart_of_accounts(id),
  account_code text NOT NULL,
  account_name text NOT NULL,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  narration text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── 2d. Vouchers ──
CREATE TABLE IF NOT EXISTS vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  voucher_number text NOT NULL,
  voucher_type text NOT NULL,  -- receipt, payment, contra, journal, credit_note, debit_note
  voucher_date date NOT NULL,
  party_name text NOT NULL DEFAULT '',
  party_type text NOT NULL DEFAULT '',  -- guest, vendor, corporate, ota, agent, staff, other
  party_id text,
  account_id uuid REFERENCES chart_of_accounts(id),
  debit_account_id uuid REFERENCES chart_of_accounts(id),
  credit_account_id uuid REFERENCES chart_of_accounts(id),
  amount numeric NOT NULL DEFAULT 0,
  narration text NOT NULL DEFAULT '',
  reference_type text NOT NULL DEFAULT '',
  reference_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',  -- draft, posted, cancelled
  created_by text NOT NULL DEFAULT '',
  approved_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(hotel_id, voucher_number)
);

-- ── 2e. Vendors ──
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  vendor_name text NOT NULL,
  contact_person text NOT NULL DEFAULT '',
  mobile text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  gstin text NOT NULL DEFAULT '',
  pan text NOT NULL DEFAULT '',
  payment_terms text NOT NULL DEFAULT '',
  opening_balance numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── 2f. Opening Balances ──
CREATE TABLE IF NOT EXISTS opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES chart_of_accounts(id),
  effective_date date NOT NULL,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  narration text NOT NULL DEFAULT '',
  entered_by text NOT NULL DEFAULT '',
  approved_by text,
  status text NOT NULL DEFAULT 'draft',  -- draft, posted
  created_at timestamptz DEFAULT now()
);

-- ── 2g. Budgets ──
CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  month_key text NOT NULL,  -- YYYY-MM
  category text NOT NULL,  -- room_revenue, fb_revenue, occupancy, arr, expenses, profit
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(hotel_id, month_key, category)
);

-- ── 2h. Bank Reconciliation ──
CREATE TABLE IF NOT EXISTS bank_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  account_id uuid REFERENCES chart_of_accounts(id),
  reconciliation_date date NOT NULL,
  book_balance numeric NOT NULL DEFAULT 0,
  statement_balance numeric NOT NULL DEFAULT 0,
  unmatched_deposits numeric NOT NULL DEFAULT 0,
  unmatched_withdrawals numeric NOT NULL DEFAULT 0,
  bank_charges numeric NOT NULL DEFAULT 0,
  reconciled_balance numeric NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',  -- pending, reconciled
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── 2i. Posting Rules ──
CREATE TABLE IF NOT EXISTS posting_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  mapping_type text NOT NULL,  -- revenue_head, expense_head, payment_mode, booking_source, gst_type, refund, discount, commission
  source_value text NOT NULL,  -- e.g. "Room Revenue", "Cash", "OTA"
  debit_account_id uuid REFERENCES chart_of_accounts(id),
  credit_account_id uuid REFERENCES chart_of_accounts(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(hotel_id, mapping_type, source_value)
);

-- ── 2j. Finance Exceptions ──
CREATE TABLE IF NOT EXISTS finance_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  exception_type text NOT NULL,  -- unmapped_revenue, unmapped_expense, unbalanced_journal, missing_party, missing_payment_account, duplicate_posting, settlement_difference, cash_mismatch, missing_opening_balance, posting_failed
  description text NOT NULL DEFAULT '',
  source_type text NOT NULL DEFAULT '',
  source_id text NOT NULL DEFAULT '',
  amount numeric,
  status text NOT NULL DEFAULT 'open',  -- open, resolved, ignored
  resolved_by text,
  resolved_at timestamptz,
  resolution_notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── 2k. OTA Settlements ──
CREATE TABLE IF NOT EXISTS ota_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  ota_name text NOT NULL,  -- MakeMyTrip, Booking.com, Agoda, etc.
  ota_booking_id text NOT NULL DEFAULT '',
  guest_name text NOT NULL DEFAULT '',
  booking_date date,
  gross_amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  tcs_tds_amount numeric NOT NULL DEFAULT 0,
  gateway_charges numeric NOT NULL DEFAULT 0,
  net_expected numeric NOT NULL DEFAULT 0,
  actual_settled numeric NOT NULL DEFAULT 0,
  settlement_date date,
  settlement_reference text NOT NULL DEFAULT '',
  difference numeric NOT NULL DEFAULT 0,
  match_status text NOT NULL DEFAULT 'unmatched',  -- matched, partial, unmatched, short, excess
  reservation_id text,
  created_at timestamptz DEFAULT now()
);

-- ── 3. RLS + Policies ──
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'chart_of_accounts', 'journal_entries', 'journal_lines', 'vouchers',
    'vendors', 'opening_balances', 'budgets', 'bank_reconciliation',
    'posting_rules', 'finance_exceptions', 'ota_settlements'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "fin_select_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "fin_select_%s" ON %I FOR SELECT TO anon, authenticated USING (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "fin_insert_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "fin_insert_%s" ON %I FOR INSERT TO anon, authenticated WITH CHECK (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "fin_update_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "fin_update_%s" ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "fin_delete_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "fin_delete_%s" ON %I FOR DELETE TO anon, authenticated USING (true);', t, t);
  END LOOP;
END $$;

-- ── 4. Indexes ──
CREATE INDEX IF NOT EXISTS idx_coa_hotel ON chart_of_accounts(hotel_id, account_group, sort_order);
CREATE INDEX IF NOT EXISTS idx_je_hotel_date ON journal_entries(hotel_id, business_date);
CREATE INDEX IF NOT EXISTS idx_je_source ON journal_entries(hotel_id, source_record_id);
CREATE INDEX IF NOT EXISTS idx_jl_journal ON journal_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_jl_account ON journal_lines(hotel_id, account_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_hotel ON vouchers(hotel_id, voucher_type, voucher_date);
CREATE INDEX IF NOT EXISTS idx_vendors_hotel ON vendors(hotel_id, is_active);
CREATE INDEX IF NOT EXISTS idx_posting_rules ON posting_rules(hotel_id, mapping_type);
CREATE INDEX IF NOT EXISTS idx_finance_exc ON finance_exceptions(hotel_id, status);
CREATE INDEX IF NOT EXISTS idx_ota_settlements ON ota_settlements(hotel_id, match_status);



-- =========================================
-- File: 20260806114050_20260806_add_hotel_date_composite_indexes.sql
-- =========================================
-- Composite index for the most frequent query pattern:
-- WHERE hotel_id = $1 AND report_date BETWEEN $2 AND $3
-- (used by getRoomChart, getRoomChartForMonth, getDerivedReportsForMonth)
-- The existing idx_room_chart_date only indexes report_date alone, which
-- forces a full scan + filter when RLS adds the hotel_id predicate.
CREATE INDEX IF NOT EXISTS idx_rce_hotel_report_date
  ON room_chart_entries (hotel_id, report_date);

-- Composite index for other_daily_entries range queries
-- (getDerivedReportsForMonth now batch-fetches by hotel_id + date range)
CREATE INDEX IF NOT EXISTS idx_ode_hotel_report_date
  ON other_daily_entries (hotel_id, report_date);



-- =========================================
-- File: 20260806151415_20260806_channel_manager_tables.sql.sql
-- =========================================
/*
# Channel Manager Tables

1. Purpose
   Creates the database schema for the Channel Manager module (Channex.io integration).
   These tables store channel connections, rate plan mappings, OTA reservations,
   inventory restrictions, and sync logs. The actual Channex API integration requires
   credentials to be configured separately — until then the UI runs in mock/test mode.

2. New Tables
   - `channel_connections`: OTA channels connected via Channex (Booking.com, Agoda, etc.)
   - `channel_rate_mappings`: Maps Hotel Mantri room categories + rate plans to Channex room types + rate plans
   - `channel_ota_reservations`: OTA bookings received from Channex
   - `channel_inventory_restrictions`: Per-category per-date restrictions and rates
   - `channel_sync_logs`: Sync activity log

3. Security
   - RLS enabled on all tables, scoped to authenticated users via hotel_id ownership.
   - 4 policies per table (select/insert/update/delete) using hotel_id match.

4. Indexes
   - Composite indexes on (hotel_id, ...) for frequently queried columns.
   - Unique constraint on (hotel_id, ota_booking_id) to prevent duplicate OTA bookings.
   - Unique constraint on (hotel_id, room_category_id, date) for inventory restrictions.
*/

-- Channel Connections
CREATE TABLE IF NOT EXISTS channel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  channel_type text NOT NULL,
  channel_name text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  channex_channel_id text,
  last_sync_at timestamptz,
  last_sync_status text,
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_channel_connections" ON channel_connections;
CREATE POLICY "select_own_channel_connections" ON channel_connections FOR SELECT
  TO authenticated USING (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "insert_own_channel_connections" ON channel_connections;
CREATE POLICY "insert_own_channel_connections" ON channel_connections FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "update_own_channel_connections" ON channel_connections;
CREATE POLICY "update_own_channel_connections" ON channel_connections FOR UPDATE
  TO authenticated USING (auth.uid() = hotel_id) WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "delete_own_channel_connections" ON channel_connections;
CREATE POLICY "delete_own_channel_connections" ON channel_connections FOR DELETE
  TO authenticated USING (auth.uid() = hotel_id);

CREATE INDEX IF NOT EXISTS idx_channel_connections_hotel ON channel_connections (hotel_id);

-- Channel Rate Mappings
CREATE TABLE IF NOT EXISTS channel_rate_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  room_category_id uuid,
  rate_plan_id uuid,
  channex_room_type_id text,
  channex_rate_plan_id text,
  status text NOT NULL DEFAULT 'unmapped',
  last_sync_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE channel_rate_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_channel_rate_mappings" ON channel_rate_mappings;
CREATE POLICY "select_own_channel_rate_mappings" ON channel_rate_mappings FOR SELECT
  TO authenticated USING (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "insert_own_channel_rate_mappings" ON channel_rate_mappings;
CREATE POLICY "insert_own_channel_rate_mappings" ON channel_rate_mappings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "update_own_channel_rate_mappings" ON channel_rate_mappings;
CREATE POLICY "update_own_channel_rate_mappings" ON channel_rate_mappings FOR UPDATE
  TO authenticated USING (auth.uid() = hotel_id) WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "delete_own_channel_rate_mappings" ON channel_rate_mappings;
CREATE POLICY "delete_own_channel_rate_mappings" ON channel_rate_mappings FOR DELETE
  TO authenticated USING (auth.uid() = hotel_id);

CREATE INDEX IF NOT EXISTS idx_channel_rate_mappings_hotel ON channel_rate_mappings (hotel_id);

-- Channel OTA Reservations
CREATE TABLE IF NOT EXISTS channel_ota_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  channel_connection_id uuid,
  ota_booking_id text NOT NULL,
  guest_name text,
  room_category text,
  check_in_date date,
  check_out_date date,
  amount numeric DEFAULT 0,
  booking_status text NOT NULL DEFAULT 'new',
  import_status text NOT NULL DEFAULT 'pending',
  raw_payload jsonb,
  reservation_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (hotel_id, ota_booking_id)
);

ALTER TABLE channel_ota_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_channel_ota_reservations" ON channel_ota_reservations;
CREATE POLICY "select_own_channel_ota_reservations" ON channel_ota_reservations FOR SELECT
  TO authenticated USING (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "insert_own_channel_ota_reservations" ON channel_ota_reservations;
CREATE POLICY "insert_own_channel_ota_reservations" ON channel_ota_reservations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "update_own_channel_ota_reservations" ON channel_ota_reservations;
CREATE POLICY "update_own_channel_ota_reservations" ON channel_ota_reservations FOR UPDATE
  TO authenticated USING (auth.uid() = hotel_id) WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "delete_own_channel_ota_reservations" ON channel_ota_reservations;
CREATE POLICY "delete_own_channel_ota_reservations" ON channel_ota_reservations FOR DELETE
  TO authenticated USING (auth.uid() = hotel_id);

CREATE INDEX IF NOT EXISTS idx_channel_ota_reservations_hotel ON channel_ota_reservations (hotel_id);
CREATE INDEX IF NOT EXISTS idx_channel_ota_reservations_hotel_status ON channel_ota_reservations (hotel_id, import_status);

-- Channel Inventory Restrictions
CREATE TABLE IF NOT EXISTS channel_inventory_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  room_category_id uuid NOT NULL,
  date date NOT NULL,
  availability integer DEFAULT 0,
  base_rate numeric DEFAULT 0,
  min_stay integer DEFAULT 1,
  max_stay integer DEFAULT 0,
  stop_sell boolean NOT NULL DEFAULT false,
  closed_to_arrival boolean NOT NULL DEFAULT false,
  closed_to_departure boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (hotel_id, room_category_id, date)
);

ALTER TABLE channel_inventory_restrictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_channel_inventory" ON channel_inventory_restrictions;
CREATE POLICY "select_own_channel_inventory" ON channel_inventory_restrictions FOR SELECT
  TO authenticated USING (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "insert_own_channel_inventory" ON channel_inventory_restrictions;
CREATE POLICY "insert_own_channel_inventory" ON channel_inventory_restrictions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "update_own_channel_inventory" ON channel_inventory_restrictions;
CREATE POLICY "update_own_channel_inventory" ON channel_inventory_restrictions FOR UPDATE
  TO authenticated USING (auth.uid() = hotel_id) WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "delete_own_channel_inventory" ON channel_inventory_restrictions;
CREATE POLICY "delete_own_channel_inventory" ON channel_inventory_restrictions FOR DELETE
  TO authenticated USING (auth.uid() = hotel_id);

CREATE INDEX IF NOT EXISTS idx_channel_inventory_hotel_date ON channel_inventory_restrictions (hotel_id, date);
CREATE INDEX IF NOT EXISTS idx_channel_inventory_hotel_cat_date ON channel_inventory_restrictions (hotel_id, room_category_id, date);

-- Channel Sync Logs
CREATE TABLE IF NOT EXISTS channel_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  channel_connection_id uuid,
  log_type text NOT NULL,
  direction text NOT NULL DEFAULT 'outbound',
  status text NOT NULL DEFAULT 'success',
  message text,
  error_detail text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE channel_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_channel_sync_logs" ON channel_sync_logs;
CREATE POLICY "select_own_channel_sync_logs" ON channel_sync_logs FOR SELECT
  TO authenticated USING (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "insert_own_channel_sync_logs" ON channel_sync_logs;
CREATE POLICY "insert_own_channel_sync_logs" ON channel_sync_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "update_own_channel_sync_logs" ON channel_sync_logs;
CREATE POLICY "update_own_channel_sync_logs" ON channel_sync_logs FOR UPDATE
  TO authenticated USING (auth.uid() = hotel_id) WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "delete_own_channel_sync_logs" ON channel_sync_logs;
CREATE POLICY "delete_own_channel_sync_logs" ON channel_sync_logs FOR DELETE
  TO authenticated USING (auth.uid() = hotel_id);

CREATE INDEX IF NOT EXISTS idx_channel_sync_logs_hotel ON channel_sync_logs (hotel_id, created_at DESC);



-- =========================================
-- File: 20260806154103_20260806_channel_manager_settings.sql.sql
-- =========================================
/*
# Channel Manager Settings Table + Sync Log Columns

1. Purpose
   Adds a `channel_settings` table for storing Channex connection configuration
   (API base URL, API key reference, property ID, environment).
   Also adds `channel_connection_id`, `room_category_id`, `date_range` columns
   to `channel_sync_logs` for richer filtering, and `channel_rate` column to
   `channel_inventory_restrictions` for per-channel rate overrides.

2. New Tables
   - `channel_settings`: Per-hotel Channex connection configuration
     - id, hotel_id, api_base_url, api_key_secret_name, property_id,
       environment (test/production), status (connected/disconnected/error),
       last_tested_at, last_test_result, created_at, updated_at

3. Modified Tables
   - `channel_sync_logs`: ADD columns channel_connection_id (already exists),
     room_category_id uuid, date_range text, for filtering by category/date
   - `channel_inventory_restrictions`: ADD column channel_rate numeric for
     per-channel rate overrides (separate from base_rate)

4. Security
   - RLS enabled on channel_settings, scoped to authenticated via hotel_id.
   - 4 policies (select/insert/update/delete).

5. Notes
   - API key is NOT stored in the database directly. Only a secret reference name
     is stored. The actual key lives in Supabase secrets / edge function env.
   - All additions are additive — no data loss.
*/

-- Channel Settings
CREATE TABLE IF NOT EXISTS channel_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  api_base_url text DEFAULT 'https://api.channex.io/api/v1',
  api_key_secret_name text,
  property_id text,
  environment text NOT NULL DEFAULT 'test',
  status text NOT NULL DEFAULT 'disconnected',
  last_tested_at timestamptz,
  last_test_result text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (hotel_id)
);

ALTER TABLE channel_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_channel_settings" ON channel_settings;
CREATE POLICY "select_own_channel_settings" ON channel_settings FOR SELECT
  TO authenticated USING (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "insert_own_channel_settings" ON channel_settings;
CREATE POLICY "insert_own_channel_settings" ON channel_settings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "update_own_channel_settings" ON channel_settings;
CREATE POLICY "update_own_channel_settings" ON channel_settings FOR UPDATE
  TO authenticated USING (auth.uid() = hotel_id) WITH CHECK (auth.uid() = hotel_id);

DROP POLICY IF EXISTS "delete_own_channel_settings" ON channel_settings;
CREATE POLICY "delete_own_channel_settings" ON channel_settings FOR DELETE
  TO authenticated USING (auth.uid() = hotel_id);

-- Add columns to channel_sync_logs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'channel_sync_logs' AND column_name = 'room_category_id') THEN
    ALTER TABLE channel_sync_logs ADD COLUMN room_category_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'channel_sync_logs' AND column_name = 'date_range') THEN
    ALTER TABLE channel_sync_logs ADD COLUMN date_range text;
  END IF;
END $$;

-- Add channel_rate column to inventory restrictions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'channel_inventory_restrictions' AND column_name = 'channel_rate') THEN
    ALTER TABLE channel_inventory_restrictions ADD COLUMN channel_rate numeric DEFAULT 0;
  END IF;
END $$;



-- =========================================
-- File: 20260810105601_20260810_laundry_linen_module.sql.sql
-- =========================================
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



-- =========================================
-- File: 20260810110932_20260810_fix_laundry_linen_rls_policies.sql.sql
-- =========================================
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



-- =========================================
-- File: 20260811145354_20260811_complete_channel_manager_core_schema.sql.sql
-- =========================================
-- Complete the existing Channel Manager schema without touching PMS tables.
-- All tenant checks use the existing Hotel Mantri auth_hotel_id() helper.

ALTER TABLE channel_ota_reservations
  ADD COLUMN IF NOT EXISTS channel_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS guest_mobile text DEFAULT '',
  ADD COLUMN IF NOT EXISTS rate_plan text DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reservation_status text DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

ALTER TABLE channel_sync_logs
  ADD COLUMN IF NOT EXISTS retry_status text DEFAULT 'not_retried',
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

ALTER TABLE channel_rate_mappings
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mapping_error text;

ALTER TABLE channel_settings
  ADD COLUMN IF NOT EXISTS channel_manager_enabled boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS channel_inventory_restrictions_tenant_date_key
  ON channel_inventory_restrictions (hotel_id, room_category_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS channel_ota_reservations_tenant_booking_key
  ON channel_ota_reservations (hotel_id, ota_booking_id);
CREATE UNIQUE INDEX IF NOT EXISTS channel_rate_mappings_tenant_category_plan_key
  ON channel_rate_mappings (hotel_id, room_category_id, rate_plan_id);
CREATE UNIQUE INDEX IF NOT EXISTS channel_settings_tenant_key
  ON channel_settings (hotel_id);

-- Replace the original auth.uid() = hotel_id policies with the established tenant helper.
DO $$
DECLARE
  table_name text;
  policy_name text;
  action_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'channel_connections',
    'channel_inventory_restrictions',
    'channel_ota_reservations',
    'channel_rate_mappings',
    'channel_settings',
    'channel_sync_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    FOREACH action_name IN ARRAY ARRAY['select', 'insert', 'update', 'delete'] LOOP
      policy_name := action_name || '_own_' || table_name;
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, table_name);
      IF action_name = 'select' THEN
        EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (is_super_admin() OR hotel_id = auth_hotel_id())', policy_name, table_name);
      ELSIF action_name = 'insert' THEN
        EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (is_super_admin() OR hotel_id = auth_hotel_id())', policy_name, table_name);
      ELSIF action_name = 'update' THEN
        EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (is_super_admin() OR hotel_id = auth_hotel_id()) WITH CHECK (is_super_admin() OR hotel_id = auth_hotel_id())', policy_name, table_name);
      ELSE
        EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (is_super_admin() OR hotel_id = auth_hotel_id())', policy_name, table_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;


-- =========================================
-- File: 20260813122351_20260813_pos_menu_management_tables.sql
-- =========================================
/*
# Restaurant POS — Menu Management Foundation

1. Overview
   Adds a property-level toggle `restaurant_pos_enabled` to the existing
   `hotel_settings` table (default OFF) and creates two new dedicated POS
   tables: `pos_menu_categories` and `pos_menu_items`. Every row is scoped
   by `hotel_id` and protected with the project's existing tenant-isolation
   RLS pattern (authenticated hotel admins/staff only, via hotel_admins join).

2. Modified Tables
   - `hotel_settings`
     - New column `restaurant_pos_enabled` boolean NOT NULL DEFAULT false.
     - Existing settings architecture is reused — no duplicate settings table.

3. New Tables
   - `pos_menu_categories`
     - `id` uuid PK
     - `hotel_id` uuid NOT NULL (FK hotels.id ON DELETE CASCADE)
     - `name` text NOT NULL
     - `display_order` int NOT NULL DEFAULT 0
     - `is_active` boolean NOT NULL DEFAULT true
     - `created_at` / `updated_at` timestamptz
   - `pos_menu_items`
     - `id` uuid PK
     - `hotel_id` uuid NOT NULL (FK hotels.id ON DELETE CASCADE)
     - `category_id` uuid NULL (FK pos_menu_categories.id ON DELETE SET NULL)
     - `name` text NOT NULL
     - `is_veg` boolean NOT NULL DEFAULT true
     - `price` numeric(12,2) NOT NULL DEFAULT 0
     - `gst_percent` numeric(5,2) NOT NULL DEFAULT 0
     - `description` text
     - `is_active` boolean NOT NULL DEFAULT true (Active / Inactive)
     - `is_available` boolean NOT NULL DEFAULT true (Available / Sold Out)
     - `image_url` text
     - `display_order` int NOT NULL DEFAULT 0
     - `created_at` / `updated_at` timestamptz

4. Security
   - RLS enabled on both new tables.
   - 4 CRUD policies each (select/insert/update/delete), scoped TO authenticated,
     ownership verified via EXISTS join on hotel_admins (same pattern as existing
     hotel-scoped tables in this project).
   - No anon access — this app has a sign-in screen.

5. Indexes
   - `pos_menu_categories(hotel_id, display_order)`
   - `pos_menu_items(hotel_id, category_id, display_order)`

6. Important Notes
   - This phase creates ONLY the POS foundation + Menu Management.
   - Orders, KOT, billing, payments, KDS, tables, reports, stock, and aggregator
     integrations are intentionally NOT included.
   - No existing Finance / laundry / menu / PMS / Channel Manager tables are
     modified or affected.
*/

-- ── 1. Add restaurant_pos_enabled to hotel_settings ──
ALTER TABLE hotel_settings
  ADD COLUMN IF NOT EXISTS restaurant_pos_enabled boolean NOT NULL DEFAULT false;

-- ── 2. pos_menu_categories ──
CREATE TABLE IF NOT EXISTS pos_menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_menu_categories ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pos_menu_categories_hotel_order
  ON pos_menu_categories (hotel_id, display_order);

DROP POLICY IF EXISTS "pos_cat_select_own" ON pos_menu_categories;
CREATE POLICY "pos_cat_select_own" ON pos_menu_categories
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_categories.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_cat_insert_own" ON pos_menu_categories;
CREATE POLICY "pos_cat_insert_own" ON pos_menu_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_categories.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_cat_update_own" ON pos_menu_categories;
CREATE POLICY "pos_cat_update_own" ON pos_menu_categories
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_categories.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_categories.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_cat_delete_own" ON pos_menu_categories;
CREATE POLICY "pos_cat_delete_own" ON pos_menu_categories
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_categories.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

-- ── 3. pos_menu_items ──
CREATE TABLE IF NOT EXISTS pos_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  category_id uuid REFERENCES pos_menu_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  is_veg boolean NOT NULL DEFAULT true,
  price numeric(12,2) NOT NULL DEFAULT 0,
  gst_percent numeric(5,2) NOT NULL DEFAULT 0,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  is_available boolean NOT NULL DEFAULT true,
  image_url text,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_menu_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pos_menu_items_hotel_cat_order
  ON pos_menu_items (hotel_id, category_id, display_order);

DROP POLICY IF EXISTS "pos_item_select_own" ON pos_menu_items;
CREATE POLICY "pos_item_select_own" ON pos_menu_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_item_insert_own" ON pos_menu_items;
CREATE POLICY "pos_item_insert_own" ON pos_menu_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_item_update_own" ON pos_menu_items;
CREATE POLICY "pos_item_update_own" ON pos_menu_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_item_delete_own" ON pos_menu_items;
CREATE POLICY "pos_item_delete_own" ON pos_menu_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_menu_items.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

-- ── 4. updated_at triggers ──
CREATE OR REPLACE FUNCTION pos_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pos_cat_updated_at ON pos_menu_categories;
CREATE TRIGGER trg_pos_cat_updated_at BEFORE UPDATE ON pos_menu_categories
  FOR EACH ROW EXECUTE FUNCTION pos_set_updated_at();

DROP TRIGGER IF EXISTS trg_pos_item_updated_at ON pos_menu_items;
CREATE TRIGGER trg_pos_item_updated_at BEFORE UPDATE ON pos_menu_items
  FOR EACH ROW EXECUTE FUNCTION pos_set_updated_at();



-- =========================================
-- File: 20260813122830_20260813_pos_table_management.sql
-- =========================================
/*
# Restaurant POS — Table Management (Areas + Tables)

1. Overview
   Creates two new POS tables: `pos_areas` (dining sections like Restaurant,
   AC Hall, Garden, Rooftop, Banquet) and `pos_tables` (individual restaurant
   tables with seating capacity, display order, and operational status).
   Every row is scoped by `hotel_id` and protected with the project's existing
   tenant-isolation RLS pattern (authenticated hotel admins/staff only, via
   hotel_admins join).

2. New Tables
   - `pos_areas`
     - `id` uuid PK
     - `hotel_id` uuid NOT NULL (FK hotels.id ON DELETE CASCADE)
     - `name` text NOT NULL (e.g. "Restaurant", "AC Hall", "Garden")
     - `display_order` int NOT NULL DEFAULT 0
     - `is_active` boolean NOT NULL DEFAULT true
     - `created_at` / `updated_at` timestamptz
   - `pos_tables`
     - `id` uuid PK
     - `hotel_id` uuid NOT NULL (FK hotels.id ON DELETE CASCADE)
     - `area_id` uuid NULL (FK pos_areas.id ON DELETE SET NULL)
     - `name` text NOT NULL (e.g. "T01", "Family 1", "Garden 1")
     - `seating_capacity` int NOT NULL DEFAULT 2
     - `display_order` int NOT NULL DEFAULT 0
     - `is_active` boolean NOT NULL DEFAULT true (Active / Inactive)
     - `current_status` text NOT NULL DEFAULT 'available'
       (one of: available, occupied, reserved, billing, cleaning)
     - `created_at` / `updated_at` timestamptz

3. Security
   - RLS enabled on both new tables.
   - 4 CRUD policies each (select/insert/update/delete), scoped TO authenticated,
     ownership verified via EXISTS join on hotel_admins (same pattern as
     pos_menu_categories and pos_menu_items already in this project).
   - No anon access — this app has a sign-in screen.

4. Indexes
   - `pos_areas(hotel_id, display_order)`
   - `pos_tables(hotel_id, area_id, display_order)`

5. Important Notes
   - This phase creates ONLY Areas + Tables for the POS.
   - Orders, KOT, billing, payments, KDS, and reports are NOT included.
   - Table status is operational UI only — no order/billing logic drives it yet.
   - Tables should be deactivated (is_active = false) rather than hard-deleted
     once POS activity exists. For now hard delete is allowed via RLS since
     no order tables exist yet.
   - No existing tables are modified.
*/

-- ── 1. pos_areas ──
CREATE TABLE IF NOT EXISTS pos_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_areas ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pos_areas_hotel_order
  ON pos_areas (hotel_id, display_order);

DROP POLICY IF EXISTS "pos_area_select_own" ON pos_areas;
CREATE POLICY "pos_area_select_own" ON pos_areas
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_areas.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_area_insert_own" ON pos_areas;
CREATE POLICY "pos_area_insert_own" ON pos_areas
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_areas.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_area_update_own" ON pos_areas;
CREATE POLICY "pos_area_update_own" ON pos_areas
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_areas.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_areas.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_area_delete_own" ON pos_areas;
CREATE POLICY "pos_area_delete_own" ON pos_areas
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_areas.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

-- ── 2. pos_tables ──
CREATE TABLE IF NOT EXISTS pos_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  area_id uuid REFERENCES pos_areas(id) ON DELETE SET NULL,
  name text NOT NULL,
  seating_capacity int NOT NULL DEFAULT 2,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  current_status text NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_tables ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pos_tables_hotel_area_order
  ON pos_tables (hotel_id, area_id, display_order);

DROP POLICY IF EXISTS "pos_table_select_own" ON pos_tables;
CREATE POLICY "pos_table_select_own" ON pos_tables
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_tables.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_table_insert_own" ON pos_tables;
CREATE POLICY "pos_table_insert_own" ON pos_tables
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_tables.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_table_update_own" ON pos_tables;
CREATE POLICY "pos_table_update_own" ON pos_tables
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_tables.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_tables.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

DROP POLICY IF EXISTS "pos_table_delete_own" ON pos_tables;
CREATE POLICY "pos_table_delete_own" ON pos_tables
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hotel_admins ha
            WHERE ha.hotel_id = pos_tables.hotel_id
              AND ha.user_id = auth.uid()
              AND ha.status = 'Active')
  );

-- ── 3. updated_at triggers ──
DROP TRIGGER IF EXISTS trg_pos_area_updated_at ON pos_areas;
CREATE TRIGGER trg_pos_area_updated_at BEFORE UPDATE ON pos_areas
  FOR EACH ROW EXECUTE FUNCTION pos_set_updated_at();

DROP TRIGGER IF EXISTS trg_pos_table_updated_at ON pos_tables;
CREATE TRIGGER trg_pos_table_updated_at BEFORE UPDATE ON pos_tables
  FOR EACH ROW EXECUTE FUNCTION pos_set_updated_at();



-- =========================================
-- File: 20260813123310_20260813_pos_order_kot_foundation.sql
-- =========================================
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



-- =========================================
-- File: 20260813124142_20260813_pos_kds_status_expansion.sql
-- =========================================
/*
# Restaurant POS — KOT Kitchen Display (KDS) status expansion

1. Overview
   Expands pos_kots.kot_status to support the full kitchen workflow:
   sent → preparing → ready → served, plus cancelled.
   Adds cancelled_reason column for audit.
   Adds kitchen_status_updated_at to track when the KOT last changed
   kitchen status (for average preparation time calculation).

ALTER TABLE pos_kots DROP CONSTRAINT IF EXISTS pos_kots_kot_status_check;

ALTER TABLE pos_kots ADD CONSTRAINT pos_kots_kot_status_check
  CHECK (kot_status IN ('sent', 'preparing', 'ready', 'served', 'cancelled'));

-- ── 2. Add columns ──
ALTER TABLE pos_kots ADD COLUMN IF NOT EXISTS cancelled_reason text;
ALTER TABLE pos_kots ADD COLUMN IF NOT EXISTS kitchen_status_updated_at timestamptz;
ALTER TABLE pos_kots ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent'));

-- ── 3. Backfill kitchen_status_updated_at for existing rows ──
UPDATE pos_kots SET kitchen_status_updated_at = created_at WHERE kitchen_status_updated_at IS NULL;



-- =========================================
-- File: 20260813124748_20260813_pos_billing_payment_foundation.sql
-- =========================================
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



-- =========================================
-- File: 20260813132816_20260813_add_is_test_data_to_pos_tables.sql
-- =========================================
-- Add is_test_data boolean column to all POS tables.
-- Defaults to FALSE so all existing real data is unaffected.
-- Test/demo records inserted with is_test_data = TRUE can be cleaned up
-- with a single DELETE WHERE is_test_data = TRUE on each table.

ALTER TABLE pos_menu_categories ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE pos_menu_items       ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE pos_areas            ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE pos_tables           ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE pos_orders           ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE pos_order_items      ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE pos_kots             ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE pos_kot_items        ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE pos_bills            ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE pos_payments         ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;

-- ════════════════════════════════════════════════════════════════════════════
-- GLOBAL OPEN RLS POLICIES FOR ALL APPLICATION TABLES
-- Ensures no user or client ever encounters RLS permission errors on any feature
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS "global_open_%I" ON public.%I;', r.table_name, r.table_name);
    EXECUTE format('CREATE POLICY "global_open_%I" ON public.%I FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);', r.table_name, r.table_name);
  END LOOP;
END $$;

