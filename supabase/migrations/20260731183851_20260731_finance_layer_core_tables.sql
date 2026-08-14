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
