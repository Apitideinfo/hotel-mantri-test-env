-- 20261102000000_protect_hotel_admins.sql
-- Finding: N1 (CRITICAL) — Complete lockdown of hotel_admins and administrative tables from client writes,
-- defense-in-depth trigger guards, and hardening of is_super_admin() and all super-admin RPCs.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DROP WRITE POLICIES ON hotel_admins
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_update_hotel_admins" ON public.hotel_admins;
DROP POLICY IF EXISTS "tenant_insert_hotel_admins" ON public.hotel_admins;
DROP POLICY IF EXISTS "tenant_delete_hotel_admins" ON public.hotel_admins;
DROP POLICY IF EXISTS "super_admin_insert_hotel_admins" ON public.hotel_admins;
DROP POLICY IF EXISTS "super_admin_update_hotel_admins" ON public.hotel_admins;
DROP POLICY IF EXISTS "super_admin_delete_hotel_admins" ON public.hotel_admins;

-- Authenticated users may ONLY select their own row or super admin selects all
DROP POLICY IF EXISTS "tenant_select_hotel_admins" ON public.hotel_admins;
DROP POLICY IF EXISTS "hotel_admins_select" ON public.hotel_admins;
CREATE POLICY "tenant_select_hotel_admins" ON public.hotel_admins
  FOR SELECT TO authenticated
  USING (is_super_admin() OR user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. REVOKE ALL WRITE PRIVILEGES ON hotel_admins FROM CLIENT ROLES
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.hotel_admins FROM authenticated, anon, public;
GRANT SELECT ON public.hotel_admins TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DEFENSE IN DEPTH: TRIGGER GUARD ON hotel_admins
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_hotel_admins_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  BEGIN
    v_jwt_role := current_setting('request.jwt.claim.role', true);
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  -- Allow if current_user is superuser/service role, or JWT claim is service_role
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') OR v_jwt_role = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  RAISE EXCEPTION 'hotel_admins mutations are strictly restricted to service_role or server administration';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_hotel_admins_mutation ON public.hotel_admins;
CREATE TRIGGER trg_guard_hotel_admins_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.hotel_admins
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_hotel_admins_mutation();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. APPLY PROTECTION TO COMPANY USERS, INVITATIONS, IMPERSONATION, BILLING & SUBSCRIPTIONS
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  pol RECORD;
  protected_tables text[] := ARRAY[
    'company_users',
    'hotel_invitations',
    'impersonation_sessions',
    'billing_settings',
    'subscription_settings',
    'subscription_reminders',
    'subscription_plan_history',
    'subscription_notes',
    'subscription_payments'
  ];
BEGIN
  FOREACH t IN ARRAY protected_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      -- Drop all existing client write policies
      FOR pol IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = t
          AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, t);
      END LOOP;

      -- Revoke all modifications from client roles
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated, anon, public;', t);

      -- Attach defense-in-depth trigger
      EXECUTE format('DROP TRIGGER IF EXISTS trg_guard_%I_mutation ON public.%I;', t, t);
      EXECUTE format('CREATE TRIGGER trg_guard_%I_mutation BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_hotel_admins_mutation();', t, t);
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. HARDEN is_super_admin()
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (auth.uid() IS NOT NULL) AND (
    EXISTS (
      SELECT 1 FROM public.hotel_admins
      WHERE user_id = auth.uid() AND role = 'super_admin' AND status = 'Active'
    ) OR EXISTS (
      SELECT 1 FROM public.company_users
      WHERE user_id = auth.uid() AND role IN ('founder', 'company_admin') AND status = 'Active'
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. HARDEN ALL ADMIN RPCS (PIN SEARCH PATH & ENFORCE ACTIVE SUPER ADMIN / COMPANY ROLE)
-- ─────────────────────────────────────────────────────────────────────────────


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
SET search_path = public, pg_temp
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

  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized. Only Founder / Super Admin can permanently delete a hotel.';
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

CREATE OR REPLACE FUNCTION change_plan(
  p_hotel_id uuid,
  p_new_plan_id uuid,
  p_change_mode text DEFAULT 'immediate',
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  IF NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM company_users WHERE user_id = v_user_id AND status = 'Active' AND role IN ('founder','company_admin','finance_manager','sales_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
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

CREATE OR REPLACE FUNCTION suspend_subscription(
  p_hotel_id uuid,
  p_reason text,
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hotel RECORD;
  v_user_id uuid := auth.uid();
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM company_users WHERE user_id = v_user_id AND status = 'Active' AND role IN ('founder','company_admin','finance_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
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

CREATE OR REPLACE FUNCTION reactivate_subscription(
  p_hotel_id uuid,
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hotel RECORD;
  v_user_id uuid := auth.uid();
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM company_users WHERE user_id = v_user_id AND status = 'Active' AND role IN ('founder','company_admin','finance_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
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

CREATE OR REPLACE FUNCTION extend_grace_period(
  p_hotel_id uuid,
  p_days integer,
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hotel RECORD;
  v_user_id uuid := auth.uid();
  v_role text;
  v_new_grace_end date;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM company_users WHERE user_id = v_user_id AND status = 'Active' AND role IN ('founder','company_admin','finance_manager','sales_manager','support_lead')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
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

CREATE OR REPLACE FUNCTION convert_trial_to_paid(
  p_hotel_id uuid,
  p_plan_id uuid,
  p_billing_cycle text DEFAULT 'monthly',
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  IF NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM company_users WHERE user_id = v_user_id AND status = 'Active' AND role IN ('founder','company_admin','finance_manager','sales_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
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

CREATE OR REPLACE FUNCTION update_billing_settings(
  p_section text,
  p_data jsonb,
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM company_users WHERE user_id = v_user_id AND status = 'Active' AND role IN ('founder','company_admin','finance_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized to update billing settings';
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

CREATE OR REPLACE FUNCTION update_subscription_settings(
  p_data jsonb,
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM company_users WHERE user_id = v_user_id AND status = 'Active' AND role IN ('founder','company_admin','finance_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
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
SET search_path = public, pg_temp
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

  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized. Only Founder / Super Admin can reset hotel data.';
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

CREATE OR REPLACE FUNCTION export_hotel_data(p_hotel_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  IF NOT is_super_admin() AND NOT (p_hotel_id = auth_hotel_id()) THEN
    RAISE EXCEPTION 'Not authorized';
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

CREATE OR REPLACE FUNCTION send_subscription_reminder(
  p_hotel_id uuid,
  p_days_before integer,
  p_channel text DEFAULT 'in_app',
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hotel RECORD;
  v_user_id uuid := auth.uid();
  v_role text;
  v_message text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM company_users WHERE user_id = v_user_id AND status = 'Active' AND role IN ('founder','company_admin','sales_manager','sales_executive','support_lead')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
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

CREATE OR REPLACE FUNCTION cancel_invoice(
  p_invoice_id uuid,
  p_reason text,
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  IF NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM company_users WHERE user_id = v_user_id AND status = 'Active' AND role IN ('founder','company_admin','finance_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized to cancel invoices';
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

CREATE OR REPLACE FUNCTION issue_invoice(
  p_invoice_id uuid,
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  IF NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM company_users WHERE user_id = v_user_id AND status = 'Active' AND role IN ('founder','company_admin','finance_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized to issue invoices';
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
SET search_path = public, pg_temp
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

  IF NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM company_users WHERE user_id = v_user_id AND status = 'Active' AND role IN ('founder','company_admin','finance_manager','finance_executive')
  ) THEN
    RAISE EXCEPTION 'Not authorized to record payments';
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

CREATE OR REPLACE FUNCTION public.register_new_hotel(
  p_hotel_name text,
  p_owner_name text,
  p_mobile text,
  p_address text,
  p_total_rooms int,
  p_number_of_floors int
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with privileges of the function creator (postgres) to bypass RLS
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_hotel_id uuid;
  v_existing_hotel_id uuid;
  v_category_id uuid;
  v_rooms_per_floor int;
  v_current_floor int;
  v_room_count int;
  v_room_num int;
BEGIN
  -- Verify the caller is authenticated
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated. Please log in or sign up first.';
  END IF;

  -- Get caller's email
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  -- Ensure the user doesn't already have an active hotel admin role
  SELECT hotel_id INTO v_existing_hotel_id FROM public.hotel_admins WHERE user_id = v_user_id LIMIT 1;
  IF v_existing_hotel_id IS NOT NULL THEN
    RAISE EXCEPTION 'User is already associated with a hotel (ID: %).', v_existing_hotel_id;
  END IF;

  -- Insert the new hotel record
  INSERT INTO public.hotels (
    hotel_name,
    owner_name,
    admin_email,
    mobile,
    address,
    total_rooms,
    number_of_floors,
    subscription_status,
    subscription_start,
    subscription_expiry,
    is_active
  ) VALUES (
    p_hotel_name,
    p_owner_name,
    v_user_email,
    p_mobile,
    p_address,
    p_total_rooms,
    p_number_of_floors,
    'Active',
    CURRENT_DATE,
    CURRENT_DATE + interval '14 days',
    true
  ) RETURNING id INTO v_hotel_id;

  -- Insert hotel settings (mandatory base row)
  INSERT INTO public.hotel_settings (
    id,
    hotel_name,
    total_rooms,
    opening_cash_balance,
    financial_year
  ) VALUES (
    v_hotel_id,
    p_hotel_name,
    p_total_rooms,
    0,
    EXTRACT(YEAR FROM CURRENT_DATE)
  );

  -- Insert default company sources
  INSERT INTO public.company_sources (hotel_id, name, source_category)
  VALUES 
    (v_hotel_id, 'OTA', 'OTA'),
    (v_hotel_id, 'Direct/Walking', 'Direct/Walking'),
    (v_hotel_id, 'Corporate/Agent', 'Corporate/Agent'),
    (v_hotel_id, 'Phonebook', 'Phonebook');

  -- Create the admin relationship
  INSERT INTO public.hotel_admins (
    user_id,
    hotel_id,
    role,
    status,
    email
  ) VALUES (
    v_user_id,
    v_hotel_id,
    'hotel_admin',
    'Active',
    v_user_email
  );

  -- Create default room category
  INSERT INTO public.room_categories (hotel_id, name, sort_order)
  VALUES (v_hotel_id, 'Standard Room', 1)
  RETURNING id INTO v_category_id;

  -- Generate rooms evenly across floors
  v_rooms_per_floor := ceil(p_total_rooms::float / p_number_of_floors::float);
  v_room_count := 0;
  
  FOR v_current_floor IN 1..p_number_of_floors LOOP
    v_room_num := v_current_floor * 100 + 1;
    FOR i IN 1..v_rooms_per_floor LOOP
      IF v_room_count < p_total_rooms THEN
        INSERT INTO public.rooms (hotel_id, category_id, room_no, floor, default_tariff)
        VALUES (v_hotel_id, v_category_id, v_room_num::text, v_current_floor::text, 2000);
        v_room_num := v_room_num + 1;
        v_room_count := v_room_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- Log the action
  INSERT INTO public.audit_logs (
    user_id,
    user_email,
    role,
    action,
    module,
    hotel_id,
    hotel_name,
    record_id,
    new_value,
    severity,
    reason,
    metadata
  ) VALUES (
    v_user_id,
    v_user_email,
    'hotel_admin',
    'register_hotel',
    'hotels',
    v_hotel_id,
    p_hotel_name,
    v_hotel_id::text,
    jsonb_build_object('total_rooms', p_total_rooms, 'floors', p_number_of_floors),
    'info',
    'Self-service signup',
    '{}'::jsonb
  );

  RETURN v_hotel_id;
END;
$$;