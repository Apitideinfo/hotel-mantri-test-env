-- 20261002230000_strict_multi_tenant_security.sql
-- CRITICAL SECURITY FIX: Enforce Strict Multi-Tenant Isolation
--
-- Guarantees:
-- 1. Hotel Owner / Admin can ONLY access their own authorized hotel
-- 2. Owner A cannot access Hotel B even via direct Supabase queries, API parameters, or headers
-- 3. Super Admin can view, select, and switch between authorized hotels
-- 4. Eliminates all open "global_open_*" policies with qual = 'true'

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ENHANCED HELPER FUNCTION: auth_hotel_id()
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth_hotel_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_hotel_id uuid;
  v_email text;
BEGIN
  -- 1. Look up active assigned hotel from hotel_admins
  SELECT hotel_id INTO v_hotel_id
  FROM hotel_admins
  WHERE user_id = auth.uid()
    AND role IN ('hotel_admin', 'hotel_staff')
    AND status = 'Active'
    AND hotel_id IS NOT NULL
  LIMIT 1;

  IF v_hotel_id IS NOT NULL THEN
    RETURN v_hotel_id;
  END IF;

  -- 2. Fallback: match verified user email against hotels.admin_email
  v_email := auth.jwt()->>'email';
  IF v_email IS NOT NULL AND v_email <> '' THEN
    SELECT id INTO v_hotel_id
    FROM hotels
    WHERE LOWER(TRIM(admin_email)) = LOWER(TRIM(v_email))
      AND is_active = true
    LIMIT 1;

    IF v_hotel_id IS NOT NULL THEN
      RETURN v_hotel_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION auth_hotel_id() TO authenticated;
GRANT EXECUTE ON FUNCTION auth_hotel_id() TO service_role;
REVOKE EXECUTE ON FUNCTION auth_hotel_id() FROM anon;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. DROP ALL DANGEROUS PERMISSIVE global_open_* POLICIES
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'global_open_%'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. STRICT RLS POLICIES ON hotels TABLE
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hotels_select_authenticated" ON hotels;
DROP POLICY IF EXISTS "authenticated_select_hotels" ON hotels;
DROP POLICY IF EXISTS "super_admin_select_hotels" ON hotels;
DROP POLICY IF EXISTS "owner_select_hotels" ON hotels;
DROP POLICY IF EXISTS "tenant_select_hotels" ON hotels;
CREATE POLICY "tenant_select_hotels" ON hotels FOR SELECT TO authenticated
  USING (is_super_admin() OR id = auth_hotel_id());

DROP POLICY IF EXISTS "super_admin_insert_hotels" ON hotels;
DROP POLICY IF EXISTS "tenant_insert_hotels" ON hotels;
CREATE POLICY "tenant_insert_hotels" ON hotels FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "super_admin_update_hotels" ON hotels;
DROP POLICY IF EXISTS "tenant_update_hotels" ON hotels;
CREATE POLICY "tenant_update_hotels" ON hotels FOR UPDATE TO authenticated
  USING (is_super_admin() OR id = auth_hotel_id())
  WITH CHECK (is_super_admin() OR id = auth_hotel_id());

DROP POLICY IF EXISTS "super_admin_delete_hotels" ON hotels;
DROP POLICY IF EXISTS "tenant_delete_hotels" ON hotels;
CREATE POLICY "tenant_delete_hotels" ON hotels FOR DELETE TO authenticated
  USING (is_super_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 4. STRICT RLS POLICIES ON hotel_settings TABLE
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE hotel_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_settings" ON hotel_settings;
DROP POLICY IF EXISTS "anon_insert_settings" ON hotel_settings;
DROP POLICY IF EXISTS "anon_update_settings" ON hotel_settings;
DROP POLICY IF EXISTS "anon_delete_settings" ON hotel_settings;
DROP POLICY IF EXISTS "tenant_select_hotel_settings" ON hotel_settings;
DROP POLICY IF EXISTS "tenant_insert_hotel_settings" ON hotel_settings;
DROP POLICY IF EXISTS "tenant_update_hotel_settings" ON hotel_settings;
DROP POLICY IF EXISTS "tenant_delete_hotel_settings" ON hotel_settings;

CREATE POLICY "tenant_select_hotel_settings" ON hotel_settings FOR SELECT TO authenticated
  USING (is_super_admin() OR id = auth_hotel_id());

CREATE POLICY "tenant_insert_hotel_settings" ON hotel_settings FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR id = auth_hotel_id());

CREATE POLICY "tenant_update_hotel_settings" ON hotel_settings FOR UPDATE TO authenticated
  USING (is_super_admin() OR id = auth_hotel_id())
  WITH CHECK (is_super_admin() OR id = auth_hotel_id());

CREATE POLICY "tenant_delete_hotel_settings" ON hotel_settings FOR DELETE TO authenticated
  USING (is_super_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 5. STRICT RLS POLICIES ON hotel_admins TABLE
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE hotel_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hotel_admins_select" ON hotel_admins;
DROP POLICY IF EXISTS "tenant_select_hotel_admins" ON hotel_admins;
CREATE POLICY "tenant_select_hotel_admins" ON hotel_admins FOR SELECT TO authenticated
  USING (is_super_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "super_admin_insert_hotel_admins" ON hotel_admins;
DROP POLICY IF EXISTS "tenant_insert_hotel_admins" ON hotel_admins;
CREATE POLICY "tenant_insert_hotel_admins" ON hotel_admins FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "super_admin_update_hotel_admins" ON hotel_admins;
DROP POLICY IF EXISTS "tenant_update_hotel_admins" ON hotel_admins;
CREATE POLICY "tenant_update_hotel_admins" ON hotel_admins FOR UPDATE TO authenticated
  USING (is_super_admin() OR (user_id = auth.uid() AND hotel_id = auth_hotel_id()))
  WITH CHECK (is_super_admin() OR (user_id = auth.uid() AND hotel_id = auth_hotel_id()));

DROP POLICY IF EXISTS "super_admin_delete_hotel_admins" ON hotel_admins;
DROP POLICY IF EXISTS "tenant_delete_hotel_admins" ON hotel_admins;
CREATE POLICY "tenant_delete_hotel_admins" ON hotel_admins FOR DELETE TO authenticated
  USING (is_super_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 6. STRICT RLS POLICIES ACROSS ALL HOTEL-SCOPED TABLES (hotel_id column)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'reservations',
    'rooms',
    'room_categories',
    'rate_plans',
    'room_chart_entries',
    'daily_reports',
    'company_sources',
    'other_daily_entries',
    'expense_categories',
    'expense_entries',
    'staff',
    'salary_advances',
    'salary_settlements',
    'channel_connections',
    'channel_settings',
    'channel_rate_mappings',
    'channel_ota_reservations',
    'channel_inventory_restrictions',
    'channel_sync_logs',
    'invoices',
    'monthly_bills',
    'utility_bills',
    'vendors',
    'vouchers',
    'waitlist',
    'room_blocks',
    'reservation_groups',
    'notification_outbox',
    'reservation_documents'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      -- Drop legacy permissive or anon policies
      EXECUTE format('DROP POLICY IF EXISTS "res_select" ON %I;', t);
      EXECUTE format('DROP POLICY IF EXISTS "res_insert" ON %I;', t);
      EXECUTE format('DROP POLICY IF EXISTS "res_update" ON %I;', t);
      EXECUTE format('DROP POLICY IF EXISTS "res_delete" ON %I;', t);
      EXECUTE format('DROP POLICY IF EXISTS "anon_select_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "anon_insert_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "anon_update_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "anon_delete_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "res_select_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "res_insert_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "res_update_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "res_delete_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "select_own_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "insert_own_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "update_own_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "delete_own_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "authenticated_select_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "auth_select_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "auth_insert_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "auth_update_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "auth_delete_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "tenant_select_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "tenant_insert_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "tenant_update_%s" ON %I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "tenant_delete_%s" ON %I;', t, t);

      -- Ensure RLS is enabled
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);

      -- Create strict tenant isolation policies
      EXECUTE format('CREATE POLICY "tenant_select_%s" ON %I FOR SELECT TO authenticated USING (is_super_admin() OR hotel_id = auth_hotel_id());', t, t);
      EXECUTE format('CREATE POLICY "tenant_insert_%s" ON %I FOR INSERT TO authenticated WITH CHECK (is_super_admin() OR hotel_id = auth_hotel_id());', t, t);
      EXECUTE format('CREATE POLICY "tenant_update_%s" ON %I FOR UPDATE TO authenticated USING (is_super_admin() OR hotel_id = auth_hotel_id()) WITH CHECK (is_super_admin() OR hotel_id = auth_hotel_id());', t, t);
      EXECUTE format('CREATE POLICY "tenant_delete_%s" ON %I FOR DELETE TO authenticated USING (is_super_admin() OR hotel_id = auth_hotel_id());', t, t);
    END IF;
  END LOOP;
END $$;
