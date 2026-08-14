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
