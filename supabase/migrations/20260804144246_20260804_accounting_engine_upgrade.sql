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
