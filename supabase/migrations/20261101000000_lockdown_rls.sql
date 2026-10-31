-- =========================================================================
-- Migration: 20261101000000_lockdown_rls.sql
-- Finding: C1 - Remove Every Open 'anon' Database Policy (RLS Bypass)
-- =========================================================================
-- Guarantees:
-- 1. Enables Row Level Security on EVERY table in schema `public`.
-- 2. Dynamically drops ALL existing policies across all public tables and storage.
-- 3. Revokes all permissions (tables, sequences, functions) from `anon`.
-- 4. Enforces strict multi-tenant RLS for `authenticated` role.
-- 5. Implements tenant-scoped storage policies on `hotel-assets`.
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ENABLE ROW LEVEL SECURITY ACROSS ALL PUBLIC TABLES
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. DROP EVERY EXISTING POLICY ON ALL PUBLIC TABLES
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN (
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- Drop all existing policies on storage.objects for hotel-assets bucket
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN (
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. REVOKE ALL PRIVILEGES FROM anon ROLE
-- ─────────────────────────────────────────────────────────────────────────
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

-- Ensure authenticated and service_role have appropriate schema permissions
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RECREATE POLICIES ON SPECIAL TABLES (WITHOUT hotel_id COLUMN)
-- ─────────────────────────────────────────────────────────────────────────

-- 4.1 hotels
CREATE POLICY "tenant_select_hotels" ON public.hotels
  FOR SELECT TO authenticated
  USING (is_super_admin() OR id = auth_hotel_id());

CREATE POLICY "tenant_insert_hotels" ON public.hotels
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "tenant_update_hotels" ON public.hotels
  FOR UPDATE TO authenticated
  USING (is_super_admin() OR id = auth_hotel_id())
  WITH CHECK (is_super_admin() OR id = auth_hotel_id());

CREATE POLICY "tenant_delete_hotels" ON public.hotels
  FOR DELETE TO authenticated
  USING (is_super_admin());

-- 4.2 hotel_settings
CREATE POLICY "tenant_select_hotel_settings" ON public.hotel_settings
  FOR SELECT TO authenticated
  USING (is_super_admin() OR id = auth_hotel_id());

CREATE POLICY "tenant_insert_hotel_settings" ON public.hotel_settings
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR id = auth_hotel_id());

CREATE POLICY "tenant_update_hotel_settings" ON public.hotel_settings
  FOR UPDATE TO authenticated
  USING (is_super_admin() OR id = auth_hotel_id())
  WITH CHECK (is_super_admin() OR id = auth_hotel_id());

CREATE POLICY "tenant_delete_hotel_settings" ON public.hotel_settings
  FOR DELETE TO authenticated
  USING (is_super_admin());

-- 4.3 hotel_admins
CREATE POLICY "tenant_select_hotel_admins" ON public.hotel_admins
  FOR SELECT TO authenticated
  USING (is_super_admin() OR user_id = auth.uid());

CREATE POLICY "tenant_insert_hotel_admins" ON public.hotel_admins
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "tenant_update_hotel_admins" ON public.hotel_admins
  FOR UPDATE TO authenticated
  USING (is_super_admin() OR (user_id = auth.uid() AND hotel_id = auth_hotel_id()))
  WITH CHECK (is_super_admin() OR (user_id = auth.uid() AND hotel_id = auth_hotel_id()));

CREATE POLICY "tenant_delete_hotel_admins" ON public.hotel_admins
  FOR DELETE TO authenticated
  USING (is_super_admin());

-- 4.4 Reference / Lookup Tables (Read-only for authenticated, write for super_admin)
DO $$
DECLARE
  ref_tbl text;
  ref_tables text[] := ARRAY['subscription_plans', 'company_roles', 'hotel_features'];
BEGIN
  FOREACH ref_tbl IN ARRAY ref_tables LOOP
    IF to_regclass(format('public.%I', ref_tbl)) IS NOT NULL THEN
      EXECUTE format('CREATE POLICY "lookup_select_%s" ON public.%I FOR SELECT TO authenticated USING (true);', ref_tbl, ref_tbl);
      EXECUTE format('CREATE POLICY "lookup_insert_%s" ON public.%I FOR INSERT TO authenticated WITH CHECK (is_super_admin());', ref_tbl, ref_tbl);
      EXECUTE format('CREATE POLICY "lookup_update_%s" ON public.%I FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());', ref_tbl, ref_tbl);
      EXECUTE format('CREATE POLICY "lookup_delete_%s" ON public.%I FOR DELETE TO authenticated USING (is_super_admin());', ref_tbl, ref_tbl);
    END IF;
  END LOOP;
END $$;

-- 4.5 Child tables referencing parents with hotel_id (if child lacks direct hotel_id)
DO $$
BEGIN
  -- invoice_items
  IF to_regclass('public.invoice_items') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoice_items' AND column_name = 'hotel_id') THEN
      CREATE POLICY "tenant_select_invoice_items" ON public.invoice_items FOR SELECT TO authenticated
        USING (is_super_admin() OR EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.hotel_id = auth_hotel_id()));
      CREATE POLICY "tenant_insert_invoice_items" ON public.invoice_items FOR INSERT TO authenticated
        WITH CHECK (is_super_admin() OR EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.hotel_id = auth_hotel_id()));
      CREATE POLICY "tenant_update_invoice_items" ON public.invoice_items FOR UPDATE TO authenticated
        USING (is_super_admin() OR EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.hotel_id = auth_hotel_id()))
        WITH CHECK (is_super_admin() OR EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.hotel_id = auth_hotel_id()));
      CREATE POLICY "tenant_delete_invoice_items" ON public.invoice_items FOR DELETE TO authenticated
        USING (is_super_admin() OR EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.hotel_id = auth_hotel_id()));
    END IF;
  END IF;

  -- invoice_payments
  IF to_regclass('public.invoice_payments') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoice_payments' AND column_name = 'hotel_id') THEN
      CREATE POLICY "tenant_select_invoice_payments" ON public.invoice_payments FOR SELECT TO authenticated
        USING (is_super_admin() OR EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.hotel_id = auth_hotel_id()));
      CREATE POLICY "tenant_insert_invoice_payments" ON public.invoice_payments FOR INSERT TO authenticated
        WITH CHECK (is_super_admin() OR EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.hotel_id = auth_hotel_id()));
      CREATE POLICY "tenant_update_invoice_payments" ON public.invoice_payments FOR UPDATE TO authenticated
        USING (is_super_admin() OR EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.hotel_id = auth_hotel_id()))
        WITH CHECK (is_super_admin() OR EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.hotel_id = auth_hotel_id()));
      CREATE POLICY "tenant_delete_invoice_payments" ON public.invoice_payments FOR DELETE TO authenticated
        USING (is_super_admin() OR EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.hotel_id = auth_hotel_id()));
    END IF;
  END IF;

  -- invoice_credit_notes
  IF to_regclass('public.invoice_credit_notes') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoice_credit_notes' AND column_name = 'hotel_id') THEN
      CREATE POLICY "tenant_select_invoice_credit_notes" ON public.invoice_credit_notes FOR SELECT TO authenticated
        USING (is_super_admin() OR EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.hotel_id = auth_hotel_id()));
      CREATE POLICY "tenant_insert_invoice_credit_notes" ON public.invoice_credit_notes FOR INSERT TO authenticated
        WITH CHECK (is_super_admin() OR EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.hotel_id = auth_hotel_id()));
      CREATE POLICY "tenant_update_invoice_credit_notes" ON public.invoice_credit_notes FOR UPDATE TO authenticated
        USING (is_super_admin() OR EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.hotel_id = auth_hotel_id()))
        WITH CHECK (is_super_admin() OR EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.hotel_id = auth_hotel_id()));
      CREATE POLICY "tenant_delete_invoice_credit_notes" ON public.invoice_credit_notes FOR DELETE TO authenticated
        USING (is_super_admin() OR EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.hotel_id = auth_hotel_id()));
    END IF;
  END IF;

  -- support_ticket_messages
  IF to_regclass('public.support_ticket_messages') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_ticket_messages' AND column_name = 'hotel_id') THEN
      CREATE POLICY "tenant_select_ticket_msgs" ON public.support_ticket_messages FOR SELECT TO authenticated
        USING (is_super_admin() OR EXISTS (SELECT 1 FROM public.support_tickets WHERE support_tickets.id = ticket_id AND support_tickets.hotel_id = auth_hotel_id()));
      CREATE POLICY "tenant_insert_ticket_msgs" ON public.support_ticket_messages FOR INSERT TO authenticated
        WITH CHECK (is_super_admin() OR EXISTS (SELECT 1 FROM public.support_tickets WHERE support_tickets.id = ticket_id AND support_tickets.hotel_id = auth_hotel_id()));
      CREATE POLICY "tenant_update_ticket_msgs" ON public.support_ticket_messages FOR UPDATE TO authenticated
        USING (is_super_admin() OR EXISTS (SELECT 1 FROM public.support_tickets WHERE support_tickets.id = ticket_id AND support_tickets.hotel_id = auth_hotel_id()))
        WITH CHECK (is_super_admin() OR EXISTS (SELECT 1 FROM public.support_tickets WHERE support_tickets.id = ticket_id AND support_tickets.hotel_id = auth_hotel_id()));
      CREATE POLICY "tenant_delete_ticket_msgs" ON public.support_ticket_messages FOR DELETE TO authenticated
        USING (is_super_admin() OR EXISTS (SELECT 1 FROM public.support_tickets WHERE support_tickets.id = ticket_id AND support_tickets.hotel_id = auth_hotel_id()));
    END IF;
  END IF;
END $$;

-- 4.6 Enterprise Platform & Super Admin Management Tables (No hotel_id)
DO $$
DECLARE
  ent_tbl text;
  ent_tables text[] := ARRAY[
    'company_users',
    'crm_leads',
    'crm_lead_notes',
    'system_settings',
    'billing_settings',
    'subscription_settings',
    'subscription_reminders',
    'subscription_plan_history',
    'subscription_notes',
    'subscription_payments',
    'impersonation_sessions',
    'onboarding_attempts',
    'invoice_number_seq',
    'receipt_number_seq',
    'hotel_invitations'
  ];
BEGIN
  FOREACH ent_tbl IN ARRAY ent_tables LOOP
    IF to_regclass(format('public.%I', ent_tbl)) IS NOT NULL THEN
      -- Only apply if the table does NOT have hotel_id
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ent_tbl AND column_name = 'hotel_id') THEN
        EXECUTE format('CREATE POLICY "super_admin_select_%s" ON public.%I FOR SELECT TO authenticated USING (is_super_admin());', ent_tbl, ent_tbl);
        EXECUTE format('CREATE POLICY "super_admin_insert_%s" ON public.%I FOR INSERT TO authenticated WITH CHECK (is_super_admin());', ent_tbl, ent_tbl);
        EXECUTE format('CREATE POLICY "super_admin_update_%s" ON public.%I FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());', ent_tbl, ent_tbl);
        EXECUTE format('CREATE POLICY "super_admin_delete_%s" ON public.%I FOR DELETE TO authenticated USING (is_super_admin());', ent_tbl, ent_tbl);
      END IF;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RECREATE STRICT TENANT POLICIES ON ALL TABLES WITH hotel_id COLUMN
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl RECORD;
  t text;
  has_policies boolean;
BEGIN
  FOR tbl IN (
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'hotel_id'
      AND table_name NOT IN ('hotels', 'hotel_settings', 'hotel_admins')
    GROUP BY table_name
  ) LOOP
    t := tbl.table_name;
    -- Check if policy was already created
    SELECT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    ) INTO has_policies;

    IF NOT has_policies THEN
      EXECUTE format('CREATE POLICY "tenant_select_%s" ON public.%I FOR SELECT TO authenticated USING (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id()));', t, t);
      EXECUTE format('CREATE POLICY "tenant_insert_%s" ON public.%I FOR INSERT TO authenticated WITH CHECK (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id()));', t, t);
      EXECUTE format('CREATE POLICY "tenant_update_%s" ON public.%I FOR UPDATE TO authenticated USING (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id())) WITH CHECK (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id()));', t, t);
      EXECUTE format('CREATE POLICY "tenant_delete_%s" ON public.%I FOR DELETE TO authenticated USING (is_super_admin() OR (hotel_id IS NOT NULL AND hotel_id = auth_hotel_id()));', t, t);
    END IF;
  END LOOP;
END $$;

-- Fallback catch-all for any remaining table without policies: fail-closed to super admin only
DO $$
DECLARE
  unprotected RECORD;
  u text;
BEGIN
  FOR unprotected IN (
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN (
        SELECT tablename FROM pg_policies WHERE schemaname = 'public'
      )
  ) LOOP
    u := unprotected.tablename;
    EXECUTE format('CREATE POLICY "fallback_super_admin_select_%s" ON public.%I FOR SELECT TO authenticated USING (is_super_admin());', u, u);
    EXECUTE format('CREATE POLICY "fallback_super_admin_insert_%s" ON public.%I FOR INSERT TO authenticated WITH CHECK (is_super_admin());', u, u);
    EXECUTE format('CREATE POLICY "fallback_super_admin_update_%s" ON public.%I FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());', u, u);
    EXECUTE format('CREATE POLICY "fallback_super_admin_delete_%s" ON public.%I FOR DELETE TO authenticated USING (is_super_admin());', u, u);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. TENANT-SCOPED STORAGE POLICIES (hotel-assets BUCKET)
-- ─────────────────────────────────────────────────────────────────────────
-- Public read for logos
CREATE POLICY "public_read_hotel_assets"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'hotel-assets');

-- Tenant-scoped upload: object path MUST begin with caller's hotel_id or caller is super_admin
CREATE POLICY "tenant_upload_hotel_assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hotel-assets' AND (
      is_super_admin() OR
      split_part(name, '/', 1) = auth_hotel_id()::text
    )
  );

-- Tenant-scoped update
CREATE POLICY "tenant_update_hotel_assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'hotel-assets' AND (
      is_super_admin() OR
      split_part(name, '/', 1) = auth_hotel_id()::text
    )
  )
  WITH CHECK (
    bucket_id = 'hotel-assets' AND (
      is_super_admin() OR
      split_part(name, '/', 1) = auth_hotel_id()::text
    )
  );

-- Tenant-scoped delete
CREATE POLICY "tenant_delete_hotel_assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'hotel-assets' AND (
      is_super_admin() OR
      split_part(name, '/', 1) = auth_hotel_id()::text
    )
  );
