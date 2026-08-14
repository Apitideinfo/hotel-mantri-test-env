/*
# Idempotent Hotel Onboarding — Schema Changes (Part 1: Columns + Tracking Table)

## Purpose
Add onboarding tracking columns and the onboarding_attempts table.
Unique indexes on property_code/admin_email will be added in a follow-up
migration after existing duplicates are cleaned up.

## Changes to `hotels` table
- ADD `onboarding_status` text NOT NULL DEFAULT 'completed'
- ADD `onboarding_attempt_id` uuid (nullable)

## New table: `onboarding_attempts`
- Tracks each onboarding attempt's state, completed steps, and form data
- Enables idempotent retry: resume from the failed step instead of creating a new hotel
*/

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS onboarding_attempt_id uuid;

CREATE TABLE IF NOT EXISTS onboarding_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid REFERENCES hotels(id) ON DELETE CASCADE,
  attempt_key text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  completed_steps text[] NOT NULL DEFAULT '{}',
  failed_step text,
  error_message text,
  form_data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE onboarding_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_select_onboarding_attempts" ON onboarding_attempts;
CREATE POLICY "super_admin_select_onboarding_attempts" ON onboarding_attempts
  FOR SELECT TO authenticated
  USING (is_super_admin() OR is_company_user());

DROP POLICY IF EXISTS "super_admin_insert_onboarding_attempts" ON onboarding_attempts;
CREATE POLICY "super_admin_insert_onboarding_attempts" ON onboarding_attempts
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR is_company_user());

DROP POLICY IF EXISTS "super_admin_update_onboarding_attempts" ON onboarding_attempts;
CREATE POLICY "super_admin_update_onboarding_attempts" ON onboarding_attempts
  FOR UPDATE TO authenticated
  USING (is_super_admin() OR is_company_user())
  WITH CHECK (is_super_admin() OR is_company_user());

DROP POLICY IF EXISTS "super_admin_delete_onboarding_attempts" ON onboarding_attempts;
CREATE POLICY "super_admin_delete_onboarding_attempts" ON onboarding_attempts
  FOR DELETE TO authenticated
  USING (is_super_admin() OR is_company_user());

CREATE INDEX IF NOT EXISTS idx_onboarding_attempts_key
  ON onboarding_attempts (attempt_key);

CREATE INDEX IF NOT EXISTS idx_onboarding_attempts_hotel_id
  ON onboarding_attempts (hotel_id);
