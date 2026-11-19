-- =========================================================================
-- Migration: 20261102050000_staff_role_hardening.sql
-- Finding: N5 - Staff Role Default Hardening & Privileged Review Reporting
-- =========================================================================
-- Guarantees:
-- 1. Sets default `staff_role` on `hotel_admins` to least-privilege 'reception' (not 'hotel_admin').
-- 2. Enforces NOT NULL constraint on `staff_role` (backfills NULLs to 'reception').
-- 3. Creates `privileged_staff_review` view for owner manual audit prior to production.
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. HARDEN staff_role COLUMN DEFAULTS & NULLABILITY
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.hotel_admins') IS NOT NULL THEN
    -- Backfill any NULL staff_role to least-privilege 'reception'
    UPDATE public.hotel_admins
    SET staff_role = 'reception'
    WHERE staff_role IS NULL;

    -- Alter default to 'reception'
    ALTER TABLE public.hotel_admins
      ALTER COLUMN staff_role SET DEFAULT 'reception',
      ALTER COLUMN staff_role SET NOT NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. PRIVILEGED STAFF REVIEW VIEW FOR OWNER GO-LIVE AUDIT
-- ─────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.privileged_staff_review CASCADE;

CREATE OR REPLACE VIEW public.privileged_staff_review
WITH (security_invoker = true) AS
SELECT
  ha.id,
  ha.hotel_id,
  h.hotel_name,
  ha.user_id,
  ha.email,
  ha.role,
  ha.staff_role,
  ha.status,
  ha.created_at
FROM public.hotel_admins ha
LEFT JOIN public.hotels h ON ha.hotel_id = h.id
WHERE ha.role = 'super_admin' OR ha.staff_role = 'hotel_admin';

ALTER VIEW public.privileged_staff_review SET (security_invoker = on);
GRANT SELECT ON public.privileged_staff_review TO authenticated, service_role;
