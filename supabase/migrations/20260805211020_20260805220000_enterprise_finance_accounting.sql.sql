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
