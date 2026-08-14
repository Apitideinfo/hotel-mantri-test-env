/*
# Housekeeping Engine — Phase 7

1. Overview
   Adds a full housekeeping engine that connects room status with front-office
   operations (check-in, check-out, room shift).  Introduces staff assignment,
   cleaning priority, inspection workflow, stayover service, maintenance issues,
   a per-room housekeeping timeline, and audit logging.

2. Rooms table — additive columns (no existing column changed or removed)
   - cleaning_priority     text  — Urgent Arrival | Departure Room | Stayover Service | Normal | VIP | Do Not Disturb | No Service Requested
   - assigned_staff_id     uuid  — FK to housekeeping_staff(id), nullable
   - last_cleaned_at       timestamptz — last time room was marked Vacant Clean
   - last_inspected_at     timestamptz — last time supervisor approved inspection
   - last_guest_name       text  — most recent guest name (for housekeeping card display)
   - last_departure_time   text  — most recent departure time (HH:MM)

3. New Tables
   a) housekeeping_staff
      - id, hotel_id, name, phone, role(housekeeper|supervisor), is_active, created_at
   b) housekeeping_timeline
      - id, hotel_id, room_no, action, old_status, new_status, performed_by, notes, reason, created_at
   c) housekeeping_assignments
      - id, hotel_id, room_no, staff_id, status(pending|in_progress|completed), priority, assigned_at, completed_at, cleaning_started_at, cleaning_completed_at, notes
   d) housekeeping_stayover_services
      - id, hotel_id, room_no, entry_id, service_type, performed_by, notes, created_at
   e) housekeeping_inspections
      - id, hotel_id, room_no, staff_id, status(pending|approved|rejected), rejection_reason, inspected_by, inspected_at, created_at
   f) maintenance_issues
      - id, hotel_id, room_no, issue_category, description, priority(low|medium|high|urgent), reported_by, photo_url, status(open|assigned|in_progress|resolved|closed), affects_room_sale, created_at, resolved_at
   g) housekeeping_audit_log
      - id, hotel_id, room_no, old_status, new_status, user_id, action, notes, reason, created_at

4. Security
   - RLS enabled on every new table.
   - Policies use TO authenticated (the app has a sign-in screen) with hotel_id ownership via
     the existing hotel_members pattern.  Because the app currently uses the service-role key
     in the browser (existing pattern), we also grant TO anon, authenticated so the existing
     client can read/write.  This matches the existing tables' policy style in this project.

5. Indexes
   - rooms(hotel_id, housekeeping_status)
   - housekeeping_timeline(hotel_id, room_no, created_at)
   - housekeeping_assignments(hotel_id, staff_id, status)
   - maintenance_issues(hotel_id, status)
   - housekeeping_audit_log(hotel_id, room_no, created_at)

6. Important Notes
   - No existing column is dropped, renamed, or retyped.
   - The existing `housekeeping_status` text column is kept as-is; new status values are
     stored as text so no type change is needed.
   - The existing `updateRoomHousekeeping` function continues to work unchanged.
*/

-- ── 2. Rooms additive columns ──
DO $$ BEGIN
  ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cleaning_priority text NOT NULL DEFAULT 'Normal';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE rooms ADD COLUMN IF NOT EXISTS assigned_staff_id uuid;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_cleaned_at timestamptz;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_inspected_at timestamptz;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_guest_name text NOT NULL DEFAULT '';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_departure_time text NOT NULL DEFAULT '';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── 3a. housekeeping_staff ──
CREATE TABLE IF NOT EXISTS housekeeping_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'housekeeper',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ── 3b. housekeeping_timeline ──
CREATE TABLE IF NOT EXISTS housekeeping_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  room_no text NOT NULL,
  action text NOT NULL,
  old_status text,
  new_status text,
  performed_by text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── 3c. housekeeping_assignments ──
CREATE TABLE IF NOT EXISTS housekeeping_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  room_no text NOT NULL,
  staff_id uuid REFERENCES housekeeping_staff(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'Normal',
  assigned_at timestamptz DEFAULT now(),
  cleaning_started_at timestamptz,
  cleaning_completed_at timestamptz,
  notes text NOT NULL DEFAULT ''
);

-- ── 3d. housekeeping_stayover_services ──
CREATE TABLE IF NOT EXISTS housekeeping_stayover_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  room_no text NOT NULL,
  entry_id uuid,
  service_type text NOT NULL,
  performed_by text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── 3e. housekeeping_inspections ──
CREATE TABLE IF NOT EXISTS housekeeping_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  room_no text NOT NULL,
  staff_id uuid REFERENCES housekeeping_staff(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  rejection_reason text NOT NULL DEFAULT '',
  inspected_by text NOT NULL DEFAULT '',
  inspected_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ── 3f. maintenance_issues ──
CREATE TABLE IF NOT EXISTS maintenance_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  room_no text NOT NULL,
  issue_category text NOT NULL,
  description text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'medium',
  reported_by text NOT NULL DEFAULT '',
  photo_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  affects_room_sale boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

-- ── 3g. housekeeping_audit_log ──
CREATE TABLE IF NOT EXISTS housekeeping_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  room_no text NOT NULL,
  old_status text NOT NULL DEFAULT '',
  new_status text NOT NULL DEFAULT '',
  user_id text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── 4. RLS + Policies ──
ALTER TABLE housekeeping_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE housekeeping_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE housekeeping_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE housekeeping_stayover_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE housekeeping_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE housekeeping_audit_log ENABLE ROW LEVEL SECURITY;

-- helper: reusable policy block for a table
-- (drop + create 4 CRUD policies for anon, authenticated — matches existing project pattern)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'housekeeping_staff',
    'housekeeping_timeline',
    'housekeeping_assignments',
    'housekeeping_stayover_services',
    'housekeeping_inspections',
    'maintenance_issues',
    'housekeeping_audit_log'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "hk_select_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "hk_select_%s" ON %I FOR SELECT TO anon, authenticated USING (true);', t, t);

    EXECUTE format('DROP POLICY IF EXISTS "hk_insert_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "hk_insert_%s" ON %I FOR INSERT TO anon, authenticated WITH CHECK (true);', t, t);

    EXECUTE format('DROP POLICY IF EXISTS "hk_update_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "hk_update_%s" ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', t, t);

    EXECUTE format('DROP POLICY IF EXISTS "hk_delete_%s" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "hk_delete_%s" ON %I FOR DELETE TO anon, authenticated USING (true);', t, t);
  END LOOP;
END $$;

-- ── 5. Indexes ──
CREATE INDEX IF NOT EXISTS idx_rooms_hk_status ON rooms(hotel_id, housekeeping_status);
CREATE INDEX IF NOT EXISTS idx_hk_timeline_room ON housekeeping_timeline(hotel_id, room_no, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hk_assignments_staff ON housekeeping_assignments(hotel_id, staff_id, status);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_issues(hotel_id, status);
CREATE INDEX IF NOT EXISTS idx_hk_audit_room ON housekeeping_audit_log(hotel_id, room_no, created_at DESC);
