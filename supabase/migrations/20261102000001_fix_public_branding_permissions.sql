-- =========================================================================
-- Migration: 20261102000001_fix_public_branding_permissions.sql
-- Finding: C1 - Public Branding Invoker Column Permissions & Extension Hardening
-- =========================================================================
-- Guarantees:
-- 1. Relocates pgcrypto to `extensions` schema to satisfy Supabase Linter rule 0002.
-- 2. Ensures `hotel_settings.logo_url` column exists to prevent error 42703.
-- 3. Recreates `public.public_hotel_branding` with `security_invoker = on` (Linter 0009).
-- 4. Grants column-level SELECT privileges to `anon` strictly on safe public columns:
--    (id, hotel_name, city, state, address, is_active) on `hotels`
--    (id, logo_url) on `hotel_settings`
--    All private columns (admin_email, owner_name, mobile, financial_year, opening_cash_balance)
--    remain strictly DENIED to `anon`.
-- 5. Establishes explicit RLS policies for `anon` to read active hotel rows.
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. RELOCATE EXTENSIONS OUT OF PUBLIC SCHEMA (Supabase Linter 0002)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'pgcrypto' AND n.nspname = 'public'
  ) THEN
    CREATE SCHEMA IF NOT EXISTS extensions;
    ALTER EXTENSION pgcrypto SET SCHEMA extensions;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. SCHEMA RESILIENCE (Ensure logo_url column exists)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.hotel_settings') IS NOT NULL THEN
    ALTER TABLE public.hotel_settings ADD COLUMN IF NOT EXISTS logo_url text NOT NULL DEFAULT '';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. DEDICATED PUBLIC BRANDING VIEW (SECURITY INVOKER)
-- ─────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.public_hotel_branding CASCADE;

CREATE OR REPLACE VIEW public.public_hotel_branding
WITH (security_invoker = true) AS
SELECT
  h.id,
  h.hotel_name,
  h.city,
  h.state,
  h.address,
  s.logo_url,
  h.is_active
FROM public.hotels h
LEFT JOIN public.hotel_settings s ON h.id = s.id
WHERE h.is_active = true;

-- Enforce security_invoker = on for Supabase Security Advisor
ALTER VIEW public.public_hotel_branding SET (security_invoker = on);

-- Grant select on the view itself
GRANT SELECT ON public.public_hotel_branding TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. COLUMN-LEVEL PRIVILEGES & RLS POLICIES FOR VIEW UNDERLYING TABLES
-- ─────────────────────────────────────────────────────────────────────────
-- Base tables remain REVOKED from anon for all mutations and sensitive columns.
-- Column-level grant allows the security_invoker view to resolve only safe attributes:
DO $$
BEGIN
  IF to_regclass('public.hotels') IS NOT NULL THEN
    REVOKE ALL ON public.hotels FROM anon;
    GRANT SELECT (id, hotel_name, city, state, address, is_active) ON public.hotels TO anon;

    DROP POLICY IF EXISTS "anon_select_active_hotels" ON public.hotels;
    CREATE POLICY "anon_select_active_hotels" ON public.hotels
      FOR SELECT TO anon
      USING (is_active = true);
  END IF;

  IF to_regclass('public.hotel_settings') IS NOT NULL THEN
    REVOKE ALL ON public.hotel_settings FROM anon;
    GRANT SELECT (id, logo_url) ON public.hotel_settings TO anon;

    DROP POLICY IF EXISTS "anon_select_public_hotel_settings" ON public.hotel_settings;
    CREATE POLICY "anon_select_public_hotel_settings" ON public.hotel_settings
      FOR SELECT TO anon
      USING (true);
  END IF;
END $$;
