-- =========================================================================
-- Migration: 20261102020000_function_grants.sql
-- Finding: N3 - Function Grants Lockdown & Closed-by-Default Privileges
-- =========================================================================
-- Guarantees:
-- 1. Revokes EXECUTE on ALL functions in schema `public` from PUBLIC, anon, authenticated.
-- 2. Alters default privileges so newly created functions and tables are closed by default.
-- 3. Explicitly grants EXECUTE to `authenticated` ONLY for essential RLS helpers.
-- 4. Revokes EXECUTE on administrative and sensitive RPCs from `authenticated`.
-- 5. Pins `search_path = public, pg_temp` on trigger and internal helper functions.
-- 6. Adds tenant authorization check to `get_hotel_record_counts(p_hotel_id)`.
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. REVOKE ALL EXECUTE ON ALL FUNCTIONS FROM PUBLIC, anon, authenticated
-- ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. HARDEN get_hotel_record_counts WITH AUTHORIZATION CHECK
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_hotel_record_counts(p_hotel_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result json;
BEGIN
  -- Strict tenant authorization check
  IF NOT (is_super_admin() OR p_hotel_id = auth_hotel_id()) THEN
    RAISE EXCEPTION 'Access denied: caller does not have permission to view records for hotel %', p_hotel_id;
  END IF;

  SELECT json_build_object(
    'daily_reports', (SELECT count(*) FROM daily_reports WHERE hotel_id = p_hotel_id),
    'daily_revenue_entries', (SELECT count(*) FROM daily_revenue_entries WHERE hotel_id = p_hotel_id),
    'room_chart_entries', (SELECT count(*) FROM room_chart_entries WHERE hotel_id = p_hotel_id),
    'other_daily_entries', (SELECT count(*) FROM other_daily_entries WHERE hotel_id = p_hotel_id),
    'booking_timeline', (SELECT count(*) FROM booking_timeline WHERE hotel_id = p_hotel_id),
    'reservations', (SELECT count(*) FROM reservations WHERE hotel_id = p_hotel_id),
    'folio_charges', (SELECT count(*) FROM folio_charges WHERE hotel_id = p_hotel_id),
    'room_shifts', (SELECT count(*) FROM room_shifts WHERE hotel_id = p_hotel_id),
    'laundry_entries', (SELECT count(*) FROM laundry_entries WHERE hotel_id = p_hotel_id),
    'electricity_readings', (SELECT count(*) FROM electricity_readings WHERE hotel_id = p_hotel_id),
    'utility_bills', (SELECT count(*) FROM utility_bills WHERE hotel_id = p_hotel_id),
    'monthly_bills', (SELECT count(*) FROM monthly_bills WHERE hotel_id = p_hotel_id),
    'salary_advances', (SELECT count(*) FROM salary_advances WHERE hotel_id = p_hotel_id),
    'salary_settlements', (SELECT count(*) FROM salary_settlements WHERE hotel_id = p_hotel_id),
    'expense_entries', (SELECT count(*) FROM expense_entries WHERE hotel_id = p_hotel_id)
  ) INTO result;
  RETURN result;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. PIN search_path ON INTERNAL FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sanitize_auth_user_tokens') THEN
    ALTER FUNCTION public.sanitize_auth_user_tokens() SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auto_confirm_user') THEN
    ALTER FUNCTION public.auto_confirm_user() SET search_path = public, pg_temp;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. EXPLICIT EXECUTE ALLOWLIST FOR authenticated ROLE (RLS HELPERS ONLY)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  fn text;
  allowed_fns text[] := ARRAY[
    'is_super_admin()',
    'auth_hotel_id()',
    'auth_staff_role()',
    'auth_has_role(text[])',
    'is_company_user()',
    'company_user_role()',
    'get_hotel_record_counts(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY allowed_fns LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated;', fn);
    EXCEPTION WHEN OTHERS THEN
      -- Function might not exist in this environment version
      NULL;
    END;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. STRICTLY REVOKE SENSITIVE FUNCTIONS FROM authenticated & anon
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  fn text;
  revoked_fns text[] := ARRAY[
    'get_auth_user_by_email(text)',
    'sanitize_auth_user_tokens()',
    'auto_confirm_user()',
    'delete_hotel_permanently(uuid)',
    'reset_hotel_operational_data(uuid, text, text, text, text)',
    'export_hotel_data(uuid)',
    'change_plan(uuid, text, text)',
    'suspend_subscription(uuid, text)',
    'reactivate_subscription(uuid)',
    'extend_grace_period(uuid, integer, text)',
    'convert_trial_to_paid(uuid, text, text)',
    'update_billing_settings(jsonb)',
    'update_subscription_settings(jsonb)',
    'send_subscription_reminder(uuid, text, text)',
    'cancel_invoice(uuid, text)',
    'issue_invoice(uuid)',
    'record_invoice_payment(uuid, numeric, text, text, text)',
    'register_new_hotel(text, text, text, text, integer, text)'
  ];
BEGIN
  FOREACH fn IN ARRAY revoked_fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated;', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role;', fn);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;
