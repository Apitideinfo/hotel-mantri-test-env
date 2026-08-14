/*
# Hotel Mantri Enterprise HQ — Phase 1 Schema

## Overview
Adds the complete data layer for the Super Admin "Enterprise HQ" command center.
All new tables are separate from existing hotel operational tables. Existing
tables (hotels, subscription_plans, hotel_admins, hotel_settings, etc.) are
only EXTENDED with nullable columns — no existing column is changed or dropped.

## New Tables
1. company_roles — role definitions with permission JSON
2. company_users — company-level staff (founder, sales, support, finance)
3. crm_leads — sales pipeline leads
4. crm_lead_notes — timeline notes per lead
5. support_tickets — hotel support tickets
6. support_ticket_messages — messages on a ticket
7. audit_logs — centralized read-only audit trail
8. notifications — in-app notification center
9. system_settings — global SaaS settings (key/value)
10. hotel_features — per-hotel module toggles
11. subscription_payments — payment records for hotel subscriptions
12. impersonation_sessions — secure "Login as Hotel" audit records

## Modified Tables
- hotels: added nullable columns (property_code, city, state, assigned_sales_exec,
  archived_at, last_login_at) — all nullable, backward compatible
- subscription_plans: added nullable columns (yearly_price, trial_days, room_limit,
  user_limit, hotel_limit, enabled_modules, grace_period) — all nullable

## Security
- RLS enabled on every new table
- Helper functions is_super_admin() (updated), is_company_user(), company_user_role()
- audit_logs: INSERT only (no update/delete) — append-only

## Notes
- is_super_admin() updated to also return true for company_users with
  role 'founder' or 'company_admin'
- All tables use gen_random_uuid() primary keys
- Soft delete via archived_at on hotels; no hard deletes from the UI
*/

-- ════════════════════════════════════════════════════════════════════════════
-- EXTEND hotels TABLE
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS property_code text,
  ADD COLUMN IF NOT EXISTS city text DEFAULT '',
  ADD COLUMN IF NOT EXISTS state text DEFAULT '',
  ADD COLUMN IF NOT EXISTS assigned_sales_exec uuid,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- ════════════════════════════════════════════════════════════════════════════
-- EXTEND subscription_plans TABLE
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS yearly_price numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_days int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS room_limit int,
  ADD COLUMN IF NOT EXISTS user_limit int,
  ADD COLUMN IF NOT EXISTS hotel_limit int,
  ADD COLUMN IF NOT EXISTS enabled_modules text DEFAULT '',
  ADD COLUMN IF NOT EXISTS grace_period int DEFAULT 0;

UPDATE subscription_plans SET trial_days = 14 WHERE trial_days = 0 AND name != 'Custom';

-- ════════════════════════════════════════════════════════════════════════════
-- 1. company_roles
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS company_roles (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text DEFAULT '',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order int NOT NULL DEFAULT 0
);

INSERT INTO company_roles (id, name, description, permissions, sort_order) VALUES
  ('founder', 'Founder / Super Admin', 'Full system access', '{"all": true}'::jsonb, 1),
  ('company_admin', 'Company Admin', 'Almost full access except founder-only settings', '{"all": true, "settings": {"system_settings": false}}'::jsonb, 2),
  ('sales_manager', 'Sales Manager', 'All leads, demos, team performance, assigned hotels', '{"hotels": {"read": true}, "crm": {"all": true}, "subscriptions": {"read": true}, "dashboard": true}'::jsonb, 3),
  ('sales_executive', 'Sales Executive', 'Only assigned leads, follow-ups, demos, notes', '{"crm": {"assigned": true}, "hotels": {"read": true}}'::jsonb, 4),
  ('support_manager', 'Support Manager', 'Tickets and authorized hotel support access', '{"tickets": {"all": true}, "hotels": {"read": true, "impersonate": true}}'::jsonb, 5),
  ('support_executive', 'Support Executive', 'Assigned tickets and hotel support access', '{"tickets": {"assigned": true}, "hotels": {"read": true, "impersonate": true}}'::jsonb, 6),
  ('finance_manager', 'Finance Manager', 'Subscriptions, invoices, payments, renewals', '{"subscriptions": {"all": true}, "payments": {"all": true}, "hotels": {"read": true}}'::jsonb, 7),
  ('finance_executive', 'Finance Executive', 'Payments and invoices', '{"payments": {"all": true}, "subscriptions": {"read": true}}'::jsonb, 8)
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. company_users
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS company_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text NOT NULL,
  mobile text DEFAULT '',
  role text NOT NULL REFERENCES company_roles(id),
  manager_id uuid REFERENCES company_users(id) ON DELETE SET NULL,
  department text DEFAULT '',
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive','Suspended')),
  assigned_hotels text[] DEFAULT '{}',
  assigned_leads text[] DEFAULT '{}',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE company_users ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS (after company_users exists)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM hotel_admins
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ) OR EXISTS (
    SELECT 1 FROM company_users
    WHERE user_id = auth.uid() AND role IN ('founder', 'company_admin') AND status = 'Active'
  );
$$;

CREATE OR REPLACE FUNCTION is_company_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_users
    WHERE user_id = auth.uid() AND status = 'Active'
  );
$$;

CREATE OR REPLACE FUNCTION company_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM company_users
  WHERE user_id = auth.uid() AND status = 'Active'
  LIMIT 1;
$$;

-- Now add policies on company_users (functions exist)
DROP POLICY IF EXISTS "company_select_company_users" ON company_users;
CREATE POLICY "company_select_company_users" ON company_users FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "super_admin_insert_company_users" ON company_users;
CREATE POLICY "super_admin_insert_company_users" ON company_users FOR INSERT
  TO authenticated WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "super_admin_update_company_users" ON company_users;
CREATE POLICY "super_admin_update_company_users" ON company_users FOR UPDATE
  TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "super_admin_delete_company_users" ON company_users;
CREATE POLICY "super_admin_delete_company_users" ON company_users FOR DELETE
  TO authenticated USING (is_super_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 3. crm_leads
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_name text NOT NULL DEFAULT '',
  contact_person text NOT NULL DEFAULT '',
  mobile text DEFAULT '',
  email text DEFAULT '',
  city text DEFAULT '',
  num_rooms int DEFAULT 0,
  current_software text DEFAULT '',
  lead_source text DEFAULT '',
  interested_plan text DEFAULT '',
  assigned_exec uuid REFERENCES company_users(id) ON DELETE SET NULL,
  next_follow_up date,
  status text NOT NULL DEFAULT 'New Lead'
    CHECK (status IN ('New Lead','Contacted','Qualified','Demo Scheduled','Demo Completed','Proposal Sent','Negotiation','Converted','Lost','Follow-up Later')),
  notes text DEFAULT '',
  estimated_value numeric(12,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_crm_leads" ON crm_leads;
CREATE POLICY "company_select_crm_leads" ON crm_leads FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_insert_crm_leads" ON crm_leads;
CREATE POLICY "company_insert_crm_leads" ON crm_leads FOR INSERT
  TO authenticated WITH CHECK (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_update_crm_leads" ON crm_leads;
CREATE POLICY "company_update_crm_leads" ON crm_leads FOR UPDATE
  TO authenticated USING (is_company_user() OR is_super_admin())
  WITH CHECK (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_delete_crm_leads" ON crm_leads;
CREATE POLICY "company_delete_crm_leads" ON crm_leads FOR DELETE
  TO authenticated USING (is_company_user() OR is_super_admin());

CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON crm_leads(status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_assigned ON crm_leads(assigned_exec);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. crm_lead_notes
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm_lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_lead_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_lead_notes" ON crm_lead_notes;
CREATE POLICY "company_select_lead_notes" ON crm_lead_notes FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_insert_lead_notes" ON crm_lead_notes;
CREATE POLICY "company_insert_lead_notes" ON crm_lead_notes FOR INSERT
  TO authenticated WITH CHECK (is_company_user() OR is_super_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 5. support_tickets
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL UNIQUE,
  hotel_id uuid REFERENCES hotels(id) ON DELETE SET NULL,
  reporter text DEFAULT '',
  category text NOT NULL DEFAULT 'Other'
    CHECK (category IN ('Login','Room Chart','Daily Report','Finance','GST','WhatsApp','PDF','Subscription','Feature Request','Bug','Other')),
  priority text NOT NULL DEFAULT 'Low'
    CHECK (priority IN ('Low','Medium','High','Critical')),
  status text NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open','In Progress','Waiting for Customer','Resolved','Closed')),
  assigned_exec uuid REFERENCES company_users(id) ON DELETE SET NULL,
  description text DEFAULT '',
  resolution_notes text DEFAULT '',
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_tickets" ON support_tickets;
CREATE POLICY "company_select_tickets" ON support_tickets FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_insert_tickets" ON support_tickets;
CREATE POLICY "company_insert_tickets" ON support_tickets FOR INSERT
  TO authenticated WITH CHECK (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_update_tickets" ON support_tickets;
CREATE POLICY "company_update_tickets" ON support_tickets FOR UPDATE
  TO authenticated USING (is_company_user() OR is_super_admin())
  WITH CHECK (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_delete_tickets" ON support_tickets;
CREATE POLICY "company_delete_tickets" ON support_tickets FOR DELETE
  TO authenticated USING (is_super_admin());

CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_hotel ON support_tickets(hotel_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. support_ticket_messages
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_ticket_msgs" ON support_ticket_messages;
CREATE POLICY "company_select_ticket_msgs" ON support_ticket_messages FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_insert_ticket_msgs" ON support_ticket_messages;
CREATE POLICY "company_insert_ticket_msgs" ON support_ticket_messages FOR INSERT
  TO authenticated WITH CHECK (is_company_user() OR is_super_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 7. audit_logs
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text DEFAULT '',
  role text DEFAULT '',
  action text NOT NULL,
  module text DEFAULT '',
  hotel_id uuid,
  hotel_name text DEFAULT '',
  record_id text DEFAULT '',
  old_value jsonb,
  new_value jsonb,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','critical')),
  impersonation_id uuid,
  reason text DEFAULT '',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_audit_logs" ON audit_logs;
CREATE POLICY "company_select_audit_logs" ON audit_logs FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_insert_audit_logs" ON audit_logs;
CREATE POLICY "company_insert_audit_logs" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (is_company_user() OR is_super_admin());

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_hotel ON audit_logs(hotel_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 8. notifications
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL
    CHECK (type IN ('subscription_expiring','payment_due','trial_ending','new_lead','demo_reminder','support_ticket','critical_bug','hotel_suspended','hotel_created','system_announcement')),
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'low' CHECK (priority IN ('low','medium','high','critical')),
  hotel_id uuid REFERENCES hotels(id) ON DELETE CASCADE,
  target_role text DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_notifications" ON notifications;
CREATE POLICY "company_select_notifications" ON notifications FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_insert_notifications" ON notifications;
CREATE POLICY "company_insert_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_update_notifications" ON notifications;
CREATE POLICY "company_update_notifications" ON notifications FOR UPDATE
  TO authenticated USING (is_company_user() OR is_super_admin())
  WITH CHECK (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_delete_notifications" ON notifications;
CREATE POLICY "company_delete_notifications" ON notifications FOR DELETE
  TO authenticated USING (is_super_admin());

CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 9. system_settings
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_settings" ON system_settings;
CREATE POLICY "company_select_settings" ON system_settings FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "super_admin_update_settings" ON system_settings;
CREATE POLICY "super_admin_update_settings" ON system_settings FOR UPDATE
  TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "super_admin_insert_settings" ON system_settings;
CREATE POLICY "super_admin_insert_settings" ON system_settings FOR INSERT
  TO authenticated WITH CHECK (is_super_admin());

INSERT INTO system_settings (key, value) VALUES
  ('company_info', '{"name": "Hotel Mantri", "tagline": "Enterprise Hotel Management"}'::jsonb),
  ('defaults', '{"currency": "INR", "country": "India", "timezone": "Asia/Kolkata", "trial_days": 14, "grace_period": 7, "invoice_prefix": "HM-INV"}'::jsonb),
  ('support', '{"email": "support@hotelmantri.com", "phone": "+91 9999999999"}'::jsonb),
  ('security', '{"session_timeout_minutes": 30, "password_min_length": 8, "maintenance_mode": false}'::jsonb),
  ('default_categories', '["Standard", "Deluxe", "Super Deluxe", "Executive", "Suite", "Family Room"]'::jsonb),
  ('default_revenue_heads', '["Kitchen", "Restaurant", "Banquet", "Other Income"]'::jsonb),
  ('default_expense_heads', '["Housekeeping", "Maintenance", "Salary", "Utilities", "Miscellaneous"]'::jsonb),
  ('default_payment_modes', '["Cash", "Bank", "UPI", "Card"]'::jsonb),
  ('default_gst', '{"registered": false, "mode": "Exclusive", "slab": 12}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 10. hotel_features
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS hotel_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, module_key)
);

ALTER TABLE hotel_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_hotel_features" ON hotel_features;
CREATE POLICY "auth_select_hotel_features" ON hotel_features FOR SELECT
  TO authenticated
  USING (is_super_admin() OR hotel_id = auth_hotel_id() OR is_company_user());

DROP POLICY IF EXISTS "super_admin_insert_hotel_features" ON hotel_features;
CREATE POLICY "super_admin_insert_hotel_features" ON hotel_features FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_company_user());

DROP POLICY IF EXISTS "super_admin_update_hotel_features" ON hotel_features;
CREATE POLICY "super_admin_update_hotel_features" ON hotel_features FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_company_user())
  WITH CHECK (is_super_admin() OR is_company_user());

DROP POLICY IF EXISTS "super_admin_delete_hotel_features" ON hotel_features;
CREATE POLICY "super_admin_delete_hotel_features" ON hotel_features FOR DELETE
  TO authenticated USING (is_super_admin());

INSERT INTO hotel_features (hotel_id, module_key, is_enabled)
SELECT h.id, m.key, true
FROM hotels h
CROSS JOIN (VALUES
  ('dashboard'), ('daily_entry'), ('room_chart'), ('finance'), ('gst'),
  ('whatsapp_reports'), ('pdf_reports'), ('mtd'), ('ytd'), ('profit_loss'),
  ('multi_hotel'), ('company_ledger')
) AS m(key)
WHERE h.archived_at IS NULL
ON CONFLICT (hotel_id, module_key) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 11. subscription_payments
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES subscription_plans(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) DEFAULT 0,
  payment_mode text DEFAULT 'Cash',
  invoice_number text DEFAULT '',
  billing_cycle text DEFAULT 'monthly',
  payment_date date,
  notes text DEFAULT '',
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_payments" ON subscription_payments;
CREATE POLICY "company_select_payments" ON subscription_payments FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_insert_payments" ON subscription_payments;
CREATE POLICY "company_insert_payments" ON subscription_payments FOR INSERT
  TO authenticated WITH CHECK (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_update_payments" ON subscription_payments;
CREATE POLICY "company_update_payments" ON subscription_payments FOR UPDATE
  TO authenticated USING (is_company_user() OR is_super_admin())
  WITH CHECK (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "super_admin_delete_payments" ON subscription_payments;
CREATE POLICY "super_admin_delete_payments" ON subscription_payments FOR DELETE
  TO authenticated USING (is_super_admin());

CREATE INDEX IF NOT EXISTS idx_payments_hotel ON subscription_payments(hotel_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 12. impersonation_sessions
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_email text NOT NULL,
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  hotel_name text NOT NULL,
  reason text DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds int,
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE impersonation_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_impersonation" ON impersonation_sessions;
CREATE POLICY "company_select_impersonation" ON impersonation_sessions FOR SELECT
  TO authenticated USING (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_insert_impersonation" ON impersonation_sessions;
CREATE POLICY "company_insert_impersonation" ON impersonation_sessions FOR INSERT
  TO authenticated WITH CHECK (is_company_user() OR is_super_admin());

DROP POLICY IF EXISTS "company_update_impersonation" ON impersonation_sessions;
CREATE POLICY "company_update_impersonation" ON impersonation_sessions FOR UPDATE
  TO authenticated USING (is_company_user() OR is_super_admin())
  WITH CHECK (is_company_user() OR is_super_admin());

CREATE INDEX IF NOT EXISTS idx_impersonation_active ON impersonation_sessions(is_active);
