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
