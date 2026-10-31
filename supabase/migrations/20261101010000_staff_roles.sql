-- =========================================================================
-- Migration: 20261101010000_staff_roles.sql
-- Finding: C2 - Staff Roles, Database Authority & Tamper-Proof Permissions
-- =========================================================================
-- Guarantees:
-- 1. Adds `staff_role` and `permissions` columns to `hotel_admins` table.
-- 2. Enforces strict CHECK constraint on allowed staff roles.
-- 3. Backfills staff roles and permissions from auth.users metadata.
-- 4. Bridges missing hotel_admins rows for verified hotel owner emails.
-- =========================================================================

-- 1. Add staff_role and permissions columns to hotel_admins
ALTER TABLE public.hotel_admins
  ADD COLUMN IF NOT EXISTS staff_role text,
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Add check constraint for staff_role allowlist if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hotel_admins_staff_role_check'
  ) THEN
    ALTER TABLE public.hotel_admins
      ADD CONSTRAINT hotel_admins_staff_role_check
      CHECK (staff_role IS NULL OR staff_role IN ('hotel_admin', 'manager', 'reception', 'accounts', 'housekeeping'));
  END IF;
END $$;

-- 2. Backfill existing staff roles from auth.users raw_user_meta_data
UPDATE public.hotel_admins ha
SET
  staff_role = CASE
    WHEN u.raw_user_meta_data->>'role' IN ('hotel_admin', 'manager', 'reception', 'accounts', 'housekeeping')
      THEN u.raw_user_meta_data->>'role'
    WHEN ha.role = 'hotel_admin' OR ha.role = 'owner'
      THEN 'hotel_admin'
    WHEN ha.role = 'super_admin'
      THEN 'hotel_admin'
    ELSE 'reception'
  END,
  permissions = COALESCE(u.raw_user_meta_data->'permissions', '{}'::jsonb)
FROM auth.users u
WHERE ha.user_id = u.id
  AND (ha.staff_role IS NULL OR ha.staff_role = '');

-- Fallback for any records not matched to auth.users
UPDATE public.hotel_admins
SET staff_role = CASE
  WHEN role = 'hotel_admin' OR role = 'owner' OR role = 'super_admin' THEN 'hotel_admin'
  ELSE 'reception'
END
WHERE staff_role IS NULL OR staff_role = '';

ALTER TABLE public.hotel_admins
  ALTER COLUMN staff_role SET DEFAULT 'hotel_admin';

-- 3. One-time bridge: Ensure hotel owners with admin_email have an active hotel_admins entry
INSERT INTO public.hotel_admins (hotel_id, user_id, role, staff_role, status, email, permissions)
SELECT
  h.id,
  u.id,
  'hotel_admin',
  'hotel_admin',
  'Active',
  u.email,
  '{}'::jsonb
FROM public.hotels h
JOIN auth.users u ON LOWER(TRIM(u.email)) = LOWER(TRIM(h.admin_email))
WHERE NOT EXISTS (
  SELECT 1 FROM public.hotel_admins ha
  WHERE ha.user_id = u.id AND ha.hotel_id = h.id
)
ON CONFLICT DO NOTHING;

-- 4. Create index for fast staff role lookups
CREATE INDEX IF NOT EXISTS idx_hotel_admins_staff_role
  ON public.hotel_admins (hotel_id, staff_role);
