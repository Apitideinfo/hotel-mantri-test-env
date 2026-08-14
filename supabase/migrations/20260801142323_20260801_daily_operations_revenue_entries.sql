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
