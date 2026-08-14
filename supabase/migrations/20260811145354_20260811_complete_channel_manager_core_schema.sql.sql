-- Complete the existing Channel Manager schema without touching PMS tables.
-- All tenant checks use the existing Hotel Mantri auth_hotel_id() helper.

ALTER TABLE channel_ota_reservations
  ADD COLUMN IF NOT EXISTS channel_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS guest_mobile text DEFAULT '',
  ADD COLUMN IF NOT EXISTS rate_plan text DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reservation_status text DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

ALTER TABLE channel_sync_logs
  ADD COLUMN IF NOT EXISTS retry_status text DEFAULT 'not_retried',
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

ALTER TABLE channel_rate_mappings
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mapping_error text;

ALTER TABLE channel_settings
  ADD COLUMN IF NOT EXISTS channel_manager_enabled boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS channel_inventory_restrictions_tenant_date_key
  ON channel_inventory_restrictions (hotel_id, room_category_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS channel_ota_reservations_tenant_booking_key
  ON channel_ota_reservations (hotel_id, ota_booking_id);
CREATE UNIQUE INDEX IF NOT EXISTS channel_rate_mappings_tenant_category_plan_key
  ON channel_rate_mappings (hotel_id, room_category_id, rate_plan_id);
CREATE UNIQUE INDEX IF NOT EXISTS channel_settings_tenant_key
  ON channel_settings (hotel_id);

-- Replace the original auth.uid() = hotel_id policies with the established tenant helper.
DO $$
DECLARE
  table_name text;
  policy_name text;
  action_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'channel_connections',
    'channel_inventory_restrictions',
    'channel_ota_reservations',
    'channel_rate_mappings',
    'channel_settings',
    'channel_sync_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    FOREACH action_name IN ARRAY ARRAY['select', 'insert', 'update', 'delete'] LOOP
      policy_name := action_name || '_own_' || table_name;
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, table_name);
      IF action_name = 'select' THEN
        EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (is_super_admin() OR hotel_id = auth_hotel_id())', policy_name, table_name);
      ELSIF action_name = 'insert' THEN
        EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (is_super_admin() OR hotel_id = auth_hotel_id())', policy_name, table_name);
      ELSIF action_name = 'update' THEN
        EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (is_super_admin() OR hotel_id = auth_hotel_id()) WITH CHECK (is_super_admin() OR hotel_id = auth_hotel_id())', policy_name, table_name);
      ELSE
        EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (is_super_admin() OR hotel_id = auth_hotel_id())', policy_name, table_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;