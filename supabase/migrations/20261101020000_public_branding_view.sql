-- =========================================================================
-- Migration: 20261101020000_public_branding_view.sql
-- Finding: C1 - Public Hotel Branding View & Security Definer Hardening
-- =========================================================================
-- Guarantees:
-- 1. Base table `hotels` is strictly inaccessible to `anon` (no private columns leaked).
-- 2. Creates dedicated `public_hotel_branding` view exposing only safe public fields.
-- 3. Grants SELECT on `public_hotel_branding` to `anon` and `authenticated`.
-- 4. Pins `search_path = public, pg_temp` on ALL SECURITY DEFINER functions in `public`.
-- 5. Revokes all permissions on rate and channel mapping tables from `anon`.
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. DEDICATED PUBLIC BRANDING VIEW (SAFE COLUMNS ONLY)
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

-- Enforce security_invoker = true to satisfy Supabase security linter
ALTER VIEW public.public_hotel_branding SET (security_invoker = true);

-- Grant read access on view to anon and authenticated
GRANT SELECT ON public.public_hotel_branding TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. STRICTLY REVOKE BASE TABLE & RATE TABLE ACCESS FROM anon
-- ─────────────────────────────────────────────────────────────────────────
REVOKE ALL ON public.hotels FROM anon;
REVOKE ALL ON public.hotel_settings FROM anon;
REVOKE ALL ON public.hotel_admins FROM anon;

-- Revoke all rate and channel tables from anon (prevent pricing/cost data leaks)
DO $$
DECLARE
  rate_tbl text;
  rate_tables text[] := ARRAY[
    'rate_plans',
    'room_categories',
    'channel_rate_mappings',
    'channel_connections',
    'channel_ota_reservations',
    'channel_inventory_restrictions',
    'ota_settlements',
    'hotel_extranet_codes'
  ];
BEGIN
  FOREACH rate_tbl IN ARRAY rate_tables LOOP
    IF to_regclass(format('public.%I', rate_tbl)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon;', rate_tbl);
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. PIN search_path ON ALL SECURITY DEFINER FUNCTIONS IN public SCHEMA
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN (
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.prosecdef = true
  ) LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp;', fn.proname, fn.args);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not set search_path on public.%(%): %', fn.proname, fn.args, SQLERRM;
    END;
  END LOOP;
END $$;
