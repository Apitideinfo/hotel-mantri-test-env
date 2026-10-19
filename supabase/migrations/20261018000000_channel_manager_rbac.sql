-- Migration: 20261018000000_channel_manager_rbac.sql
-- Description: Enforce strict RBAC for Channel Manager: Super Admin OTA Configuration & Owner Read/Push-Only Access.
-- Prevents hotel owners/admins from directly creating, updating, or deleting channel connections, settings, credentials, or mappings.

-- 1. Ensure foreign key on channel_rate_mappings referencing channel_connections
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_channel_rate_mappings_connection'
      AND table_name = 'channel_rate_mappings'
  ) THEN
    ALTER TABLE channel_rate_mappings
      ADD CONSTRAINT fk_channel_rate_mappings_connection
      FOREIGN KEY (channel_connection_id)
      REFERENCES channel_connections(id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Constraint or relation may already exist
  NULL;
END $$;

-- 2. Ensure indexes on channel tables for fast multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_channel_connections_hotel_status ON channel_connections (hotel_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_channel_rate_mappings_hotel_cat ON channel_rate_mappings (hotel_id, room_category_id);
CREATE INDEX IF NOT EXISTS idx_channel_rate_mappings_conn ON channel_rate_mappings (channel_connection_id);
CREATE INDEX IF NOT EXISTS idx_channel_sync_logs_hotel_created ON channel_sync_logs (hotel_id, created_at DESC);

-- 3. Update RLS policies for channel_connections
-- Hotel Owner/Admin has READ-ONLY access. Only Super Admin can INSERT/UPDATE/DELETE.
DO $$
BEGIN
  IF to_regclass('public.channel_connections') IS NOT NULL THEN
    ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "tenant_select_channel_connections" ON channel_connections;
    DROP POLICY IF EXISTS "tenant_insert_channel_connections" ON channel_connections;
    DROP POLICY IF EXISTS "tenant_update_channel_connections" ON channel_connections;
    DROP POLICY IF EXISTS "tenant_delete_channel_connections" ON channel_connections;
    DROP POLICY IF EXISTS "channel_conn_select" ON channel_connections;
    DROP POLICY IF EXISTS "channel_conn_insert" ON channel_connections;
    DROP POLICY IF EXISTS "channel_conn_update" ON channel_connections;
    DROP POLICY IF EXISTS "channel_conn_delete" ON channel_connections;

    -- SELECT: Super Admin can read any, Hotel Admin/Owner can read their assigned hotel
    CREATE POLICY "channel_conn_select" ON channel_connections
      FOR SELECT TO authenticated
      USING (is_super_admin() OR hotel_id = auth_hotel_id());

    -- INSERT: Super Admin ONLY
    CREATE POLICY "channel_conn_insert" ON channel_connections
      FOR INSERT TO authenticated
      WITH CHECK (is_super_admin());

    -- UPDATE: Super Admin ONLY
    CREATE POLICY "channel_conn_update" ON channel_connections
      FOR UPDATE TO authenticated
      USING (is_super_admin())
      WITH CHECK (is_super_admin());

    -- DELETE: Super Admin ONLY
    CREATE POLICY "channel_conn_delete" ON channel_connections
      FOR DELETE TO authenticated
      USING (is_super_admin());
  END IF;
END $$;

-- 4. Update RLS policies for channel_settings (Credentials & Integration Secrets)
-- Hotel Owner/Admin CANNOT directly read or write credentials. Super Admin ONLY.
DO $$
BEGIN
  IF to_regclass('public.channel_settings') IS NOT NULL THEN
    ALTER TABLE channel_settings ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "tenant_select_channel_settings" ON channel_settings;
    DROP POLICY IF EXISTS "tenant_insert_channel_settings" ON channel_settings;
    DROP POLICY IF EXISTS "tenant_update_channel_settings" ON channel_settings;
    DROP POLICY IF EXISTS "tenant_delete_channel_settings" ON channel_settings;
    DROP POLICY IF EXISTS "channel_settings_select" ON channel_settings;
    DROP POLICY IF EXISTS "channel_settings_insert" ON channel_settings;
    DROP POLICY IF EXISTS "channel_settings_update" ON channel_settings;
    DROP POLICY IF EXISTS "channel_settings_delete" ON channel_settings;

    CREATE POLICY "channel_settings_select" ON channel_settings
      FOR SELECT TO authenticated
      USING (is_super_admin());

    CREATE POLICY "channel_settings_insert" ON channel_settings
      FOR INSERT TO authenticated
      WITH CHECK (is_super_admin());

    CREATE POLICY "channel_settings_update" ON channel_settings
      FOR UPDATE TO authenticated
      USING (is_super_admin())
      WITH CHECK (is_super_admin());

    CREATE POLICY "channel_settings_delete" ON channel_settings
      FOR DELETE TO authenticated
      USING (is_super_admin());
  END IF;
END $$;

-- 5. Update RLS policies for channel_rate_mappings
-- Hotel Owner/Admin has READ-ONLY access. Only Super Admin can INSERT/UPDATE/DELETE.
DO $$
BEGIN
  IF to_regclass('public.channel_rate_mappings') IS NOT NULL THEN
    ALTER TABLE channel_rate_mappings ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "tenant_select_channel_rate_mappings" ON channel_rate_mappings;
    DROP POLICY IF EXISTS "tenant_insert_channel_rate_mappings" ON channel_rate_mappings;
    DROP POLICY IF EXISTS "tenant_update_channel_rate_mappings" ON channel_rate_mappings;
    DROP POLICY IF EXISTS "tenant_delete_channel_rate_mappings" ON channel_rate_mappings;
    DROP POLICY IF EXISTS "channel_mapping_select" ON channel_rate_mappings;
    DROP POLICY IF EXISTS "channel_mapping_insert" ON channel_rate_mappings;
    DROP POLICY IF EXISTS "channel_mapping_update" ON channel_rate_mappings;
    DROP POLICY IF EXISTS "channel_mapping_delete" ON channel_rate_mappings;

    -- SELECT: Super Admin can read any, Hotel Admin/Owner can read their assigned hotel
    CREATE POLICY "channel_mapping_select" ON channel_rate_mappings
      FOR SELECT TO authenticated
      USING (is_super_admin() OR hotel_id = auth_hotel_id());

    -- INSERT: Super Admin ONLY
    CREATE POLICY "channel_mapping_insert" ON channel_rate_mappings
      FOR INSERT TO authenticated
      WITH CHECK (is_super_admin());

    -- UPDATE: Super Admin ONLY
    CREATE POLICY "channel_mapping_update" ON channel_rate_mappings
      FOR UPDATE TO authenticated
      USING (is_super_admin())
      WITH CHECK (is_super_admin());

    -- DELETE: Super Admin ONLY
    CREATE POLICY "channel_mapping_delete" ON channel_rate_mappings
      FOR DELETE TO authenticated
      USING (is_super_admin());
  END IF;
END $$;

-- 6. Ensure channel_sync_logs allows hotel-scoped viewing and server-side logging
DO $$
BEGIN
  IF to_regclass('public.channel_sync_logs') IS NOT NULL THEN
    ALTER TABLE channel_sync_logs ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "tenant_select_channel_sync_logs" ON channel_sync_logs;
    DROP POLICY IF EXISTS "tenant_insert_channel_sync_logs" ON channel_sync_logs;
    DROP POLICY IF EXISTS "tenant_update_channel_sync_logs" ON channel_sync_logs;
    DROP POLICY IF EXISTS "tenant_delete_channel_sync_logs" ON channel_sync_logs;
    DROP POLICY IF EXISTS "channel_sync_logs_select" ON channel_sync_logs;
    DROP POLICY IF EXISTS "channel_sync_logs_insert" ON channel_sync_logs;
    DROP POLICY IF EXISTS "channel_sync_logs_update" ON channel_sync_logs;
    DROP POLICY IF EXISTS "channel_sync_logs_delete" ON channel_sync_logs;

    CREATE POLICY "channel_sync_logs_select" ON channel_sync_logs
      FOR SELECT TO authenticated
      USING (is_super_admin() OR hotel_id = auth_hotel_id());

    CREATE POLICY "channel_sync_logs_insert" ON channel_sync_logs
      FOR INSERT TO authenticated
      WITH CHECK (is_super_admin() OR hotel_id = auth_hotel_id());

    CREATE POLICY "channel_sync_logs_update" ON channel_sync_logs
      FOR UPDATE TO authenticated
      USING (is_super_admin() OR hotel_id = auth_hotel_id())
      WITH CHECK (is_super_admin() OR hotel_id = auth_hotel_id());

    CREATE POLICY "channel_sync_logs_delete" ON channel_sync_logs
      FOR DELETE TO authenticated
      USING (is_super_admin());
  END IF;
END $$;
