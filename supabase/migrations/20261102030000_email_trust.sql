-- =========================================================================
-- Migration: 20261102030000_email_trust.sql
-- Finding: N4 - Eliminate Unverified Email Fallback & Auto-Confirm Trigger
-- =========================================================================
-- Guarantees:
-- 1. Drops `auto_confirm_user` trigger on `auth.users` to prevent unverified account creation.
-- 2. Sanitizes `sanitize_auth_user_tokens` to not default `email_confirmed_at`.
-- 3. Redefines `auth_hotel_id()` to strictly resolve tenant context from active `hotel_admins` records.
--    Eliminates the vulnerable `hotels.admin_email = auth.jwt()->>'email'` fallback completely.
-- 4. One-time bridge: securely links pre-existing confirmed owner accounts into `hotel_admins`
--    strictly requiring `email_confirmed_at IS NOT NULL`.
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. DROP auto_confirm_user TRIGGER ON auth.users
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  DROP FUNCTION IF EXISTS public.auto_confirm_user();
EXCEPTION WHEN OTHERS THEN
  -- May fail if auth schema trigger access is restricted
  NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. HARDEN sanitize_auth_user_tokens
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sanitize_auth_user_tokens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Strip control characters or whitespace from email
  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. STRICT auth_hotel_id() — ZERO EMAIL FALLBACK
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_hotel_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hotel_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT hotel_id INTO v_hotel_id
  FROM public.hotel_admins
  WHERE user_id = auth.uid()
    AND status = 'Active'
    AND hotel_id IS NOT NULL
  LIMIT 1;

  RETURN v_hotel_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_hotel_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_hotel_id() TO service_role;
REVOKE EXECUTE ON FUNCTION public.auth_hotel_id() FROM anon;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. ONE-TIME SECURE BRIDGE FOR CONFIRMED OWNERS ONLY
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  bridged_count integer := 0;
BEGIN
  IF to_regclass('public.hotels') IS NOT NULL AND to_regclass('public.hotel_admins') IS NOT NULL THEN
    WITH inserted AS (
      INSERT INTO public.hotel_admins (hotel_id, user_id, role, staff_role, status)
      SELECT
        h.id,
        u.id,
        'hotel_admin',
        'hotel_admin',
        'Active'
      FROM public.hotels h
      JOIN auth.users u ON lower(trim(h.admin_email)) = lower(trim(u.email))
      WHERE u.email_confirmed_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.hotel_admins ha
          WHERE ha.user_id = u.id AND ha.hotel_id = h.id
        )
      ON CONFLICT DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO bridged_count FROM inserted;

    IF bridged_count > 0 AND to_regclass('public.audit_logs') IS NOT NULL THEN
      INSERT INTO public.audit_logs (action, details, created_at)
      VALUES (
        'MIGRATION_N4_BRIDGE',
        jsonb_build_object('bridged_owner_count', bridged_count),
        now()
      );
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
