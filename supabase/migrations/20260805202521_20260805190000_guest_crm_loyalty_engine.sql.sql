/*
# Guest CRM + Loyalty Engine — Phase 8

1. Overview
   Creates a complete Guest CRM system with permanent guest profiles, stay history,
   preferences, notes, documents, loyalty program, VIP management, corporate profiles,
   travel agents, tags, and insights.  Existing booking tables (room_chart_entries,
   reservations) are REUSED — no existing table is modified.  A new guest_id column
   is added additively to room_chart_entries and reservations to link bookings to
   guest profiles.

2. Existing Tables — Additive Columns Only (no column dropped/renamed/retyped)
   a) room_chart_entries
      - guest_id uuid  — FK to guests(id), nullable (backward compatible)
   b) reservations
      - guest_id uuid  — FK to guests(id), nullable (backward compatible)

3. New Tables
   a) guests
      - id, hotel_id, name, mobile, email, address, nationality, id_proof_type,
        id_proof_number, gst_number, company_name, photo_url, vip_type, loyalty_level,
        loyalty_points, date_of_birth, anniversary, notes, tags, created_at, updated_at
   b) guest_preferences
      - id, guest_id, smoking, high_floor, near_lift, extra_pillow, extra_bed,
        room_temperature, meal_preference, favourite_room, favourite_category
   c) guest_notes
      - id, guest_id, note, created_by, created_at
   d) guest_documents
      - id, guest_id, doc_type, doc_url, uploaded_at
   e) guest_stays
      - id, guest_id, hotel_id, entry_id, reservation_id, room_no, category,
        check_in, check_out, nights, revenue, payment_status, booking_source, remarks
      (materialized view of booking data for fast CRM queries)
   f) corporate_profiles
      - id, hotel_id, company_name, gst, billing_address, credit_limit, corporate_rate,
        contact_person, contact_phone, contact_email, created_at
   g) travel_agents
      - id, hotel_id, agent_name, contact_person, phone, email, commission_rate,
        created_at
   h) loyalty_transactions
      - id, guest_id, hotel_id, points, transaction_type(earn|redeem|adjust),
        description, entry_id, created_at

4. Security
   - RLS enabled on every new table.
   - Policies use TO anon, authenticated (matches existing project pattern where
     the browser uses the service-role key).

5. Indexes
   - guests(hotel_id, mobile)
   - guests(hotel_id, email)
   - guests(hotel_id, company_name)
   - guest_stays(guest_id, check_in DESC)
   - loyalty_transactions(guest_id, created_at DESC)

6. Important Notes
   - No existing column is dropped, renamed, or retyped.
   - guest_id columns on room_chart_entries and reservations are nullable so
     existing rows continue to work without a guest profile.
   - Duplicate detection is done in the API layer by querying guests by mobile/email.
*/

-- ── 2. Additive columns on existing tables ──
DO $$ BEGIN
  ALTER TABLE room_chart_entries ADD COLUMN IF NOT EXISTS guest_id uuid REFERENCES guests(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE reservations ADD COLUMN IF NOT EXISTS guest_id uuid REFERENCES guests(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── 3a. guests ──
CREATE TABLE IF NOT EXISTS guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  mobile text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  nationality text NOT NULL DEFAULT '',
  id_proof_type text NOT NULL DEFAULT '',
  id_proof_number text NOT NULL DEFAULT '',
  gst_number text NOT NULL DEFAULT '',
  company_name text NOT NULL DEFAULT '',
  photo_url text NOT NULL DEFAULT '',
  vip_type text NOT NULL DEFAULT '',
  loyalty_level text NOT NULL DEFAULT 'Silver',
  loyalty_points integer NOT NULL DEFAULT 0,
  date_of_birth date,
  anniversary date,
  notes text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── 3b. guest_preferences ──
CREATE TABLE IF NOT EXISTS guest_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  smoking text NOT NULL DEFAULT 'Non Smoking',
  high_floor boolean NOT NULL DEFAULT false,
  near_lift boolean NOT NULL DEFAULT false,
  extra_pillow boolean NOT NULL DEFAULT false,
  extra_bed boolean NOT NULL DEFAULT false,
  room_temperature text NOT NULL DEFAULT 'Normal',
  meal_preference text NOT NULL DEFAULT 'EP',
  favourite_room text NOT NULL DEFAULT '',
  favourite_category text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

-- ── 3c. guest_notes ──
CREATE TABLE IF NOT EXISTS guest_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── 3d. guest_documents ──
CREATE TABLE IF NOT EXISTS guest_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  doc_type text NOT NULL DEFAULT '',
  doc_url text NOT NULL DEFAULT '',
  uploaded_at timestamptz DEFAULT now()
);

-- ── 3e. guest_stays ──
CREATE TABLE IF NOT EXISTS guest_stays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL,
  entry_id uuid REFERENCES room_chart_entries(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  room_no text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  check_in date,
  check_out date,
  nights integer NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT '',
  booking_source text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── 3f. corporate_profiles ──
CREATE TABLE IF NOT EXISTS corporate_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  company_name text NOT NULL,
  gst text NOT NULL DEFAULT '',
  billing_address text NOT NULL DEFAULT '',
  credit_limit numeric NOT NULL DEFAULT 0,
  corporate_rate numeric NOT NULL DEFAULT 0,
  contact_person text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── 3g. travel_agents ──
CREATE TABLE IF NOT EXISTS travel_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  agent_name text NOT NULL,
  contact_person text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  commission_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ── 3h. loyalty_transactions ──
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL,
  points integer NOT NULL DEFAULT 0,
  transaction_type text NOT NULL DEFAULT 'earn',
  description text NOT NULL DEFAULT '',
  entry_id uuid REFERENCES room_chart_entries(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- ── 4. RLS + Policies ──
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_stays ENABLE ROW LEVEL SECURITY;
ALTER TABLE corporate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'guests', 'guest_preferences', 'guest_notes', 'guest_documents',
    'guest_stays', 'corporate_profiles', 'travel_agents', 'loyalty_transactions'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "crm_select_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "crm_select_%s" ON %I FOR SELECT TO anon, authenticated USING (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "crm_insert_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "crm_insert_%s" ON %I FOR INSERT TO anon, authenticated WITH CHECK (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "crm_update_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "crm_update_%s" ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "crm_delete_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "crm_delete_%s" ON %I FOR DELETE TO anon, authenticated USING (true);', t, t);
  END LOOP;
END $$;

-- ── 5. Indexes ──
CREATE INDEX IF NOT EXISTS idx_guests_mobile ON guests(hotel_id, mobile);
CREATE INDEX IF NOT EXISTS idx_guests_email ON guests(hotel_id, email);
CREATE INDEX IF NOT EXISTS idx_guests_company ON guests(hotel_id, company_name);
CREATE INDEX IF NOT EXISTS idx_guest_stays_guest ON guest_stays(guest_id, check_in DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_guest ON loyalty_transactions(guest_id, created_at DESC);

-- ── updated_at trigger for guests ──
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guests_updated_at ON guests;
CREATE TRIGGER guests_updated_at BEFORE UPDATE ON guests
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
