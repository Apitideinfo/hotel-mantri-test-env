/*
# Multi-Tenant SaaS — Part 1: Auth Tables & Helper Functions

Creates the authentication/authorization infrastructure:
  1. subscription_plans — configurable plans
  2. hotels — master hotel registry
  3. hotel_admins — user-to-hotel mapping with roles
  4. hotel_invitations — secure invite tokens
  5. Helper SQL functions: auth_hotel_id(), is_super_admin()
  6. Seeds default subscription plans
  7. Migrates existing Hotel Gopal into the hotels table
*/

-- ────────────────────────────────────────────────────────────────────────────
-- 1. SUBSCRIPTION PLANS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,
  price           numeric(12,2) NOT NULL DEFAULT 0,
  billing_period  text NOT NULL DEFAULT 'monthly'
                    CHECK (billing_period IN ('monthly','quarterly','yearly','custom')),
  features        text NOT NULL DEFAULT '',
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_subscription_plans" ON subscription_plans;
CREATE POLICY "auth_select_subscription_plans" ON subscription_plans FOR SELECT
  TO authenticated USING (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. HOTELS (master registry)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotels (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_name          text NOT NULL,
  owner_name          text NOT NULL DEFAULT '',
  admin_email         text NOT NULL,
  mobile              text NOT NULL DEFAULT '',
  address             text NOT NULL DEFAULT '',
  total_rooms         int NOT NULL DEFAULT 1,
  plan_id             uuid REFERENCES subscription_plans(id) ON DELETE SET NULL,
  subscription_start  date,
  subscription_expiry date,
  subscription_status text NOT NULL DEFAULT 'Active'
                        CHECK (subscription_status IN ('Active','Expired','Suspended')),
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. HOTEL ADMINS (user-to-hotel mapping with role)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotel_admins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hotel_id    uuid REFERENCES hotels(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'hotel_admin'
                CHECK (role IN ('super_admin','hotel_admin','hotel_staff')),
  status      text NOT NULL DEFAULT 'Active'
                CHECK (status IN ('Active','Invited','Suspended')),
  email       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, hotel_id)
);

ALTER TABLE hotel_admins ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. HOTEL INVITATIONS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotel_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  email        text NOT NULL,
  role         text NOT NULL DEFAULT 'hotel_admin',
  token_hash   text NOT NULL,
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz,
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hotel_invitations ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. HELPER FUNCTIONS (SECURITY DEFINER — run with owner privileges)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth_hotel_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT hotel_id FROM hotel_admins
  WHERE user_id = auth.uid() AND role IN ('hotel_admin','hotel_staff')
  LIMIT 1;
$$;

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
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. SEED SUBSCRIPTION PLANS
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO subscription_plans (name, price, billing_period, features, sort_order) VALUES
  ('Basic',   999,   'monthly', 'Room Chart, Daily MIS, Dashboard', 1),
  ('Standard',1999,  'monthly', 'Room Chart, MIS, MTD/YTD, Expenses, Staff', 2),
  ('Pro',     3999,  'monthly', 'All Standard + Profitability, Laundry, Bills, PDF Export', 3),
  ('Custom',  0,     'custom',  'Custom pricing — contact sales', 4)
ON CONFLICT (name) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. MIGRATE EXISTING HOTEL GOPAL INTO hotels TABLE
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO hotels (id, hotel_name, owner_name, admin_email, total_rooms, subscription_status, subscription_start)
SELECT
  '00000000-0000-0000-0000-000000000000',
  hotel_name,
  COALESCE(admin_name, 'Hotel Owner'),
  COALESCE(email, 'admin@hotelgopal.com'),
  total_rooms,
  'Active',
  CURRENT_DATE
FROM hotel_settings
WHERE id = '00000000-0000-0000-0000-000000000000'
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. INDEXES
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_hotel_admins_user ON hotel_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_hotel_admins_hotel ON hotel_admins(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_invitations_email ON hotel_invitations(email);
CREATE INDEX IF NOT EXISTS idx_hotels_status ON hotels(subscription_status);
