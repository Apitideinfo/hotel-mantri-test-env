-- =========================================================================
-- Migration: 20261102010000_role_aware_policies.sql
-- Finding: N2 - Role-Aware Database RLS Policies & Column Privilege Hardening
-- =========================================================================
-- Guarantees:
-- 1. Helper functions `auth_staff_role()` and `auth_has_role(...)` with pinned search_path.
-- 2. Column-level UPDATE privilege restrictions on `public.hotels` preventing client modification
--    of sensitive columns (plan, status, admin_email, subscription_*, trial_*, billing_*).
-- 3. Strict database-level role isolation:
--    - Finance & Accounting tables (chart_of_accounts, vouchers, journal_entries, journal_lines, vendors):
--      strictly inaccessible to Housekeeping and Reception. Accessible to hotel_admin, manager, accounts.
--    - Reservations, Folios, Charges: write restricted to hotel_admin, manager, reception, accounts.
--    - Rooms, Categories, Rates: write restricted to hotel_admin, manager.
--    - Housekeeping tasks: Housekeeping can only update assigned tasks.
-- 4. Audit logs: client insert allowed for own hotel; NO update or delete for anyone except service role.
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ROLE HELPER FUNCTIONS (SECURITY DEFINER, STABLE, PINNED search_path)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_staff_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT staff_role INTO v_role
  FROM public.hotel_admins
  WHERE user_id = auth.uid()
    AND status = 'Active'
  LIMIT 1;

  RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_has_role(VARIADIC roles text[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  IF is_super_admin() THEN
    RETURN true;
  END IF;

  v_role := auth_staff_role();
  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  RETURN v_role = ANY(roles);
END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_staff_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_has_role(VARIADIC text[]) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. HARDEN HOTELS TABLE: COLUMN PRIVILEGES & ROLE-BASED UPDATE
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.hotels') IS NOT NULL THEN
    -- Revoke full table UPDATE from authenticated
    REVOKE UPDATE ON public.hotels FROM authenticated;

    -- Grant UPDATE only on allowlisted non-sensitive branding/profile columns
    GRANT UPDATE (hotel_name, city, state, address, phone, website) ON public.hotels TO authenticated;

    -- Update policy: Only hotel_admin and manager can update own hotel profile
    DROP POLICY IF EXISTS "tenant_update_hotels" ON public.hotels;
    CREATE POLICY "tenant_update_hotels" ON public.hotels
      FOR UPDATE TO authenticated
      USING (is_super_admin() OR (id = auth_hotel_id() AND auth_has_role('hotel_admin', 'manager')))
      WITH CHECK (is_super_admin() OR (id = auth_hotel_id() AND auth_has_role('hotel_admin', 'manager')));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. AUDIT LOGS IMMUTABILITY (NO CLIENT UPDATE OR DELETE)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM authenticated, anon;

    DROP POLICY IF EXISTS "tenant_insert_audit_logs" ON public.audit_logs;
    DROP POLICY IF EXISTS "tenant_update_audit_logs" ON public.audit_logs;
    DROP POLICY IF EXISTS "tenant_delete_audit_logs" ON public.audit_logs;
    DROP POLICY IF EXISTS "tenant_select_audit_logs" ON public.audit_logs;

    CREATE POLICY "tenant_select_audit_logs" ON public.audit_logs
      FOR SELECT TO authenticated
      USING (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id() AND auth_has_role('hotel_admin', 'manager')));

    CREATE POLICY "tenant_insert_audit_logs" ON public.audit_logs
      FOR INSERT TO authenticated
      WITH CHECK (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id()));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. FINANCE & ACCOUNTING TABLES: STRICT ROLE RESTRICTION
-- ─────────────────────────────────────────────────────────────────────────
-- Prohibits Housekeeping, Reception, and unprivileged staff from reading/writing financial ledgers
DO $$
DECLARE
  fin_tbl text;
  fin_tables text[] := ARRAY[
    'chart_of_accounts',
    'journal_entries',
    'journal_lines',
    'vouchers',
    'vendors',
    'expense_entries',
    'salary_entries',
    'budgets',
    'bank_reconciliation'
  ];
BEGIN
  FOREACH fin_tbl IN ARRAY fin_tables LOOP
    IF to_regclass(format('public.%I', fin_tbl)) IS NOT NULL THEN
      -- Drop old permissive tenant policies
      EXECUTE format('DROP POLICY IF EXISTS "tenant_select_%s" ON public.%I;', fin_tbl, fin_tbl);
      EXECUTE format('DROP POLICY IF EXISTS "tenant_insert_%s" ON public.%I;', fin_tbl, fin_tbl);
      EXECUTE format('DROP POLICY IF EXISTS "tenant_update_%s" ON public.%I;', fin_tbl, fin_tbl);
      EXECUTE format('DROP POLICY IF EXISTS "tenant_delete_%s" ON public.%I;', fin_tbl, fin_tbl);

      -- Apply role-restricted policies (Super Admin, hotel_admin, manager, accounts)
      EXECUTE format('CREATE POLICY "tenant_select_%s" ON public.%I FOR SELECT TO authenticated USING (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id() AND auth_has_role(''hotel_admin'', ''manager'', ''accounts'')));', fin_tbl, fin_tbl);
      EXECUTE format('CREATE POLICY "tenant_insert_%s" ON public.%I FOR INSERT TO authenticated WITH CHECK (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id() AND auth_has_role(''hotel_admin'', ''manager'', ''accounts'')));', fin_tbl, fin_tbl);
      EXECUTE format('CREATE POLICY "tenant_update_%s" ON public.%I FOR UPDATE TO authenticated USING (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id() AND auth_has_role(''hotel_admin'', ''manager'', ''accounts''))) WITH CHECK (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id() AND auth_has_role(''hotel_admin'', ''manager'', ''accounts'')));', fin_tbl, fin_tbl);
      EXECUTE format('CREATE POLICY "tenant_delete_%s" ON public.%I FOR DELETE TO authenticated USING (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id() AND auth_has_role(''hotel_admin'', ''manager'', ''accounts'')));', fin_tbl, fin_tbl);
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RESERVATIONS, FOLIOS & CHARGES: WRITE RESTRICTIONS
-- ─────────────────────────────────────────────────────────────────────────
-- Housekeeping CANNOT insert, update, or delete reservations or folios
DO $$
DECLARE
  res_tbl text;
  res_tables text[] := ARRAY[
    'reservations',
    'folios',
    'folio_charges',
    'payments'
  ];
BEGIN
  FOREACH res_tbl IN ARRAY res_tables LOOP
    IF to_regclass(format('public.%I', res_tbl)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "tenant_insert_%s" ON public.%I;', res_tbl, res_tbl);
      EXECUTE format('DROP POLICY IF EXISTS "tenant_update_%s" ON public.%I;', res_tbl, res_tbl);
      EXECUTE format('DROP POLICY IF EXISTS "tenant_delete_%s" ON public.%I;', res_tbl, res_tbl);

      -- Writes allowed only for hotel_admin, manager, reception, accounts
      EXECUTE format('CREATE POLICY "tenant_insert_%s" ON public.%I FOR INSERT TO authenticated WITH CHECK (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id() AND auth_has_role(''hotel_admin'', ''manager'', ''reception'', ''accounts'')));', res_tbl, res_tbl);
      EXECUTE format('CREATE POLICY "tenant_update_%s" ON public.%I FOR UPDATE TO authenticated USING (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id() AND auth_has_role(''hotel_admin'', ''manager'', ''reception'', ''accounts''))) WITH CHECK (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id() AND auth_has_role(''hotel_admin'', ''manager'', ''reception'', ''accounts'')));', res_tbl, res_tbl);
      EXECUTE format('CREATE POLICY "tenant_delete_%s" ON public.%I FOR DELETE TO authenticated USING (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id() AND auth_has_role(''hotel_admin'', ''manager'')));', res_tbl, res_tbl);
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. CONFIGURATION TABLES: RESTRICT TO HOTEL_ADMIN & MANAGER
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  cfg_tbl text;
  cfg_tables text[] := ARRAY[
    'rooms',
    'room_categories',
    'rate_plans'
  ];
BEGIN
  FOREACH cfg_tbl IN ARRAY cfg_tables LOOP
    IF to_regclass(format('public.%I', cfg_tbl)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "tenant_insert_%s" ON public.%I;', cfg_tbl, cfg_tbl);
      EXECUTE format('DROP POLICY IF EXISTS "tenant_update_%s" ON public.%I;', cfg_tbl, cfg_tbl);
      EXECUTE format('DROP POLICY IF EXISTS "tenant_delete_%s" ON public.%I;', cfg_tbl, cfg_tbl);

      EXECUTE format('CREATE POLICY "tenant_insert_%s" ON public.%I FOR INSERT TO authenticated WITH CHECK (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id() AND auth_has_role(''hotel_admin'', ''manager'')));', cfg_tbl, cfg_tbl);
      EXECUTE format('CREATE POLICY "tenant_update_%s" ON public.%I FOR UPDATE TO authenticated USING (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id() AND auth_has_role(''hotel_admin'', ''manager''))) WITH CHECK (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id() AND auth_has_role(''hotel_admin'', ''manager'')));', cfg_tbl, cfg_tbl);
      EXECUTE format('CREATE POLICY "tenant_delete_%s" ON public.%I FOR DELETE TO authenticated USING (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id() AND auth_has_role(''hotel_admin'', ''manager'')));', cfg_tbl, cfg_tbl);
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. HOUSEKEEPING TASKS: GRANULAR HOUSEKEEPING WRITE PERMISSION
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.housekeeping_tasks') IS NOT NULL THEN
    DROP POLICY IF EXISTS "tenant_insert_housekeeping_tasks" ON public.housekeeping_tasks;
    DROP POLICY IF EXISTS "tenant_update_housekeeping_tasks" ON public.housekeeping_tasks;
    DROP POLICY IF EXISTS "tenant_delete_housekeeping_tasks" ON public.housekeeping_tasks;

    -- Insert/Delete: hotel_admin, manager, reception
    CREATE POLICY "tenant_insert_housekeeping_tasks" ON public.housekeeping_tasks
      FOR INSERT TO authenticated
      WITH CHECK (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id() AND auth_has_role('hotel_admin', 'manager', 'reception')));

    CREATE POLICY "tenant_delete_housekeeping_tasks" ON public.housekeeping_tasks
      FOR DELETE TO authenticated
      USING (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id() AND auth_has_role('hotel_admin', 'manager')));

    -- Update: staff can update own assigned task status; admins/reception can update any task
    CREATE POLICY "tenant_update_housekeeping_tasks" ON public.housekeeping_tasks
      FOR UPDATE TO authenticated
      USING (
        is_super_admin() OR (
          hotel_id IS NOT NULL AND hotel_id = auth_hotel_id() AND (
            auth_has_role('hotel_admin', 'manager', 'reception') OR
            (auth_has_role('housekeeping') AND (assigned_to = auth.uid() OR assigned_to IS NULL))
          )
        )
      )
      WITH CHECK (
        is_super_admin() OR (
          hotel_id IS NOT NULL AND hotel_id = auth_hotel_id() AND (
            auth_has_role('hotel_admin', 'manager', 'reception') OR
            (auth_has_role('housekeeping') AND (assigned_to = auth.uid() OR assigned_to IS NULL))
          )
        )
      );
  END IF;
END $$;
