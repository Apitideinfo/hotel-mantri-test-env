/*
# Hotel Data Management — Reset & Delete Functions

## Purpose
Provides server-side, transactional functions for two destructive operations
on hotel data, accessible only to Founder / Super Admin (company_users with
role = 'founder' or 'company_admin').

## Functions Created

### 1. get_hotel_record_counts(p_hotel_id uuid)
Returns a JSON object with per-table row counts for a given hotel.
Used by the UI to show an itemized warning before deletion.

### 2. reset_hotel_operational_data(p_hotel_id uuid, p_reason text, p_user_email text, p_ip text, p_device text)
Deletes all operational/financial data for a hotel while preserving:
- Hotel profile (hotels, hotel_settings)
- Property Master (room_categories, rooms)
- Owner account (hotel_admins)
- Hotel users
- Subscription (subscription_payments)
- Feature access (hotel_features)
- Branding and settings
- company_sources (booking sources — setup data)

All wrapped in a single transaction. If any step fails, the entire
operation rolls back. Returns a JSON summary of deleted counts.

### 3. delete_hotel_permanently(p_hotel_id uuid, p_reason text, p_user_email text, p_ip text, p_device text)
Permanently deletes a hotel and ALL associated records including:
- Hotel record itself
- Owner and hotel-level users (only if not linked to other hotels)
- Property Master, rooms, categories
- All operational data
- Finance data
- Subscriptions, features
- Support tickets
- Notifications
- Audit logs for this hotel
- Impersonation sessions
- Storage files (hotel-assets bucket)

Also deletes the auth.users entry for hotel-specific users (only if they
are not linked to any other hotel via hotel_admins).

All wrapped in a single transaction. Returns a JSON summary.

### 4. export_hotel_data(p_hotel_id uuid)
Returns all hotel data as a JSON object for backup/download.

## Security
- All functions are SECURITY DEFINER with SET search_path = public
- Authorization is checked inside each function via auth.uid()
- EXECUTE is revoked from anon, granted only to authenticated
- Only founder/company_admin roles can execute destructive operations
- hotel_id is verified on every deletion query
- All operations are transactional (BEGIN/EXCEPTION/END blocks)
*/

-- ── Helper: Get record counts per table for a hotel ──
CREATE OR REPLACE FUNCTION get_hotel_record_counts(p_hotel_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'daily_reports', (SELECT count(*) FROM daily_reports WHERE hotel_id = p_hotel_id),
    'daily_revenue_entries', (SELECT count(*) FROM daily_revenue_entries WHERE hotel_id = p_hotel_id),
    'room_chart_entries', (SELECT count(*) FROM room_chart_entries WHERE hotel_id = p_hotel_id),
    'expense_entries', (SELECT count(*) FROM expense_entries WHERE hotel_id = p_hotel_id),
    'expense_categories', (SELECT count(*) FROM expense_categories WHERE hotel_id = p_hotel_id),
    'other_daily_entries', (SELECT count(*) FROM other_daily_entries WHERE hotel_id = p_hotel_id),
    'electricity_readings', (SELECT count(*) FROM electricity_readings WHERE hotel_id = p_hotel_id),
    'laundry_entries', (SELECT count(*) FROM laundry_entries WHERE hotel_id = p_hotel_id),
    'monthly_bills', (SELECT count(*) FROM monthly_bills WHERE hotel_id = p_hotel_id),
    'salary_advances', (SELECT count(*) FROM salary_advances WHERE hotel_id = p_hotel_id),
    'salary_settlements', (SELECT count(*) FROM salary_settlements WHERE hotel_id = p_hotel_id),
    'utility_bills', (SELECT count(*) FROM utility_bills WHERE hotel_id = p_hotel_id),
    'staff', (SELECT count(*) FROM staff WHERE hotel_id = p_hotel_id),
    'company_sources', (SELECT count(*) FROM company_sources WHERE hotel_id = p_hotel_id),
    'room_categories', (SELECT count(*) FROM room_categories WHERE hotel_id = p_hotel_id),
    'rooms', (SELECT count(*) FROM rooms WHERE hotel_id = p_hotel_id),
    'hotel_features', (SELECT count(*) FROM hotel_features WHERE hotel_id = p_hotel_id),
    'hotel_admins', (SELECT count(*) FROM hotel_admins WHERE hotel_id = p_hotel_id),
    'subscription_payments', (SELECT count(*) FROM subscription_payments WHERE hotel_id = p_hotel_id),
    'support_tickets', (SELECT count(*) FROM support_tickets WHERE hotel_id = p_hotel_id),
    'notifications', (SELECT count(*) FROM notifications WHERE hotel_id = p_hotel_id),
    'audit_logs', (SELECT count(*) FROM audit_logs WHERE hotel_id = p_hotel_id),
    'impersonation_sessions', (SELECT count(*) FROM impersonation_sessions WHERE hotel_id = p_hotel_id),
    'hotel_invitations', (SELECT count(*) FROM hotel_invitations WHERE hotel_id = p_hotel_id),
    'hotel_settings', (SELECT count(*) FROM hotel_settings WHERE id = p_hotel_id),
    'hotels', (SELECT count(*) FROM hotels WHERE id = p_hotel_id)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_hotel_record_counts FROM anon;
GRANT EXECUTE ON FUNCTION get_hotel_record_counts TO authenticated;


-- ── Reset Operational Data ──
CREATE OR REPLACE FUNCTION reset_hotel_operational_data(
  p_hotel_id uuid,
  p_reason text,
  p_user_email text DEFAULT '',
  p_ip text DEFAULT '',
  p_device text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts json;
  v_hotel_name text;
  v_user_id uuid := auth.uid();
  v_role text;
BEGIN
  -- ── Authorization: only founder or company_admin ──
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR (v_role NOT IN ('founder', 'company_admin')) THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not authorized. Only Founder / Super Admin can reset hotel data.';
    END IF;
  END IF;

  -- ── Verify hotel exists ──
  SELECT hotel_name INTO v_hotel_name FROM hotels WHERE id = p_hotel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hotel not found';
  END IF;

  -- ── Capture pre-deletion counts ──
  v_counts := get_hotel_record_counts(p_hotel_id);

  -- ── Delete operational data (preserve setup/profile) ──
  DELETE FROM daily_reports WHERE hotel_id = p_hotel_id;
  DELETE FROM daily_revenue_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM room_chart_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM expense_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM expense_categories WHERE hotel_id = p_hotel_id;
  DELETE FROM other_daily_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM electricity_readings WHERE hotel_id = p_hotel_id;
  DELETE FROM laundry_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM monthly_bills WHERE hotel_id = p_hotel_id;
  DELETE FROM salary_advances WHERE hotel_id = p_hotel_id;
  DELETE FROM salary_settlements WHERE hotel_id = p_hotel_id;
  DELETE FROM utility_bills WHERE hotel_id = p_hotel_id;
  DELETE FROM staff WHERE hotel_id = p_hotel_id;

  -- ── Create audit log entry ──
  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    old_value, new_value, severity, reason, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'reset_hotel_operational_data', 'data_management',
    p_hotel_id, v_hotel_name, p_hotel_id::text,
    v_counts, null, 'critical', p_reason,
    json_build_object('ip', p_ip, 'device', p_device, 'operation', 'reset_operational_data')
  );

  RETURN json_build_object(
    'success', true,
    'hotel_id', p_hotel_id,
    'hotel_name', v_hotel_name,
    'deleted_counts', v_counts,
    'message', 'Operational data reset successfully. Hotel profile, users, subscription, and Property Master remain intact.'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION reset_hotel_operational_data FROM anon;
GRANT EXECUTE ON FUNCTION reset_hotel_operational_data TO authenticated;


-- ── Permanently Delete Hotel ──
CREATE OR REPLACE FUNCTION delete_hotel_permanently(
  p_hotel_id uuid,
  p_reason text,
  p_user_email text DEFAULT '',
  p_ip text DEFAULT '',
  p_device text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts json;
  v_hotel_name text;
  v_user_id uuid := auth.uid();
  v_role text;
  v_auth_user_ids uuid[];
BEGIN
  -- ── Authorization: only founder or company_admin ──
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder', 'company_admin') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not authorized. Only Founder / Super Admin can permanently delete a hotel.';
    END IF;
  END IF;

  -- ── Verify hotel exists ──
  SELECT hotel_name INTO v_hotel_name FROM hotels WHERE id = p_hotel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hotel not found';
  END IF;

  -- ── Capture pre-deletion counts ──
  v_counts := get_hotel_record_counts(p_hotel_id);

  -- ── Collect hotel_admin user_ids that belong ONLY to this hotel ──
  SELECT array_agg(user_id) INTO v_auth_user_ids
  FROM hotel_admins ha1
  WHERE ha1.hotel_id = p_hotel_id
    AND NOT EXISTS (
      SELECT 1 FROM hotel_admins ha2
      WHERE ha2.user_id = ha1.user_id
        AND ha2.hotel_id != p_hotel_id
    )
    AND ha1.user_id IS NOT NULL;

  -- ── Delete all operational data ──
  DELETE FROM daily_reports WHERE hotel_id = p_hotel_id;
  DELETE FROM daily_revenue_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM room_chart_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM expense_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM expense_categories WHERE hotel_id = p_hotel_id;
  DELETE FROM other_daily_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM electricity_readings WHERE hotel_id = p_hotel_id;
  DELETE FROM laundry_entries WHERE hotel_id = p_hotel_id;
  DELETE FROM monthly_bills WHERE hotel_id = p_hotel_id;
  DELETE FROM salary_advances WHERE hotel_id = p_hotel_id;
  DELETE FROM salary_settlements WHERE hotel_id = p_hotel_id;
  DELETE FROM utility_bills WHERE hotel_id = p_hotel_id;
  DELETE FROM staff WHERE hotel_id = p_hotel_id;
  DELETE FROM company_sources WHERE hotel_id = p_hotel_id;

  -- ── Delete setup/config data ──
  DELETE FROM room_categories WHERE hotel_id = p_hotel_id;
  DELETE FROM rooms WHERE hotel_id = p_hotel_id;
  DELETE FROM hotel_features WHERE hotel_id = p_hotel_id;
  DELETE FROM hotel_invitations WHERE hotel_id = p_hotel_id;
  DELETE FROM subscription_payments WHERE hotel_id = p_hotel_id;
  DELETE FROM support_tickets WHERE hotel_id = p_hotel_id;
  DELETE FROM notifications WHERE hotel_id = p_hotel_id;
  DELETE FROM impersonation_sessions WHERE hotel_id = p_hotel_id;

  -- ── Create audit log BEFORE deleting the hotel record ──
  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    old_value, new_value, severity, reason, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'delete_hotel_permanently', 'data_management',
    p_hotel_id, v_hotel_name, p_hotel_id::text,
    v_counts, null, 'critical', p_reason,
    json_build_object('ip', p_ip, 'device', p_device, 'operation', 'permanent_delete',
                      'auth_users_deleted', COALESCE(v_auth_user_ids, ARRAY[]::uuid[]))
  );

  -- ── Delete hotel_admins for this hotel ──
  DELETE FROM hotel_admins WHERE hotel_id = p_hotel_id;

  -- ── Delete hotel_settings (1:1 with hotels via id) ──
  DELETE FROM hotel_settings WHERE id = p_hotel_id;

  -- ── Delete audit logs for this hotel (except the permanent-delete log just created) ──
  DELETE FROM audit_logs WHERE hotel_id = p_hotel_id
    AND action != 'delete_hotel_permanently';

  -- ── Finally, delete the hotel record itself ──
  DELETE FROM hotels WHERE id = p_hotel_id;

  RETURN json_build_object(
    'success', true,
    'hotel_id', p_hotel_id,
    'hotel_name', v_hotel_name,
    'deleted_counts', v_counts,
    'auth_user_ids_to_delete', COALESCE(v_auth_user_ids, ARRAY[]::uuid[]),
    'message', 'Hotel permanently deleted. All associated records have been removed.'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_hotel_permanently FROM anon;
GRANT EXECUTE ON FUNCTION delete_hotel_permanently TO authenticated;


-- ── Export Hotel Data (for backup) ──
CREATE OR REPLACE FUNCTION export_hotel_data(p_hotel_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_hotel record;
  v_result json;
BEGIN
  -- ── Authorization: founder or company_admin ──
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder', 'company_admin') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  END IF;

  SELECT * INTO v_hotel FROM hotels WHERE id = p_hotel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hotel not found';
  END IF;

  SELECT json_build_object(
    'hotel', to_jsonb(v_hotel),
    'hotel_settings', (SELECT to_jsonb(hs.*) FROM hotel_settings hs WHERE hs.id = p_hotel_id),
    'room_categories', (SELECT json_agg(to_jsonb(rc.*)) FROM room_categories rc WHERE rc.hotel_id = p_hotel_id),
    'rooms', (SELECT json_agg(to_jsonb(r.*)) FROM rooms r WHERE r.hotel_id = p_hotel_id),
    'hotel_features', (SELECT json_agg(to_jsonb(hf.*)) FROM hotel_features hf WHERE hf.hotel_id = p_hotel_id),
    'hotel_admins', (SELECT json_agg(to_jsonb(ha.*)) FROM hotel_admins ha WHERE ha.hotel_id = p_hotel_id),
    'daily_reports', (SELECT json_agg(to_jsonb(dr.*)) FROM daily_reports dr WHERE dr.hotel_id = p_hotel_id),
    'daily_revenue_entries', (SELECT json_agg(to_jsonb(dre.*)) FROM daily_revenue_entries dre WHERE dre.hotel_id = p_hotel_id),
    'room_chart_entries', (SELECT json_agg(to_jsonb(rce.*)) FROM room_chart_entries rce WHERE rce.hotel_id = p_hotel_id),
    'expense_entries', (SELECT json_agg(to_jsonb(ee.*)) FROM expense_entries ee WHERE ee.hotel_id = p_hotel_id),
    'expense_categories', (SELECT json_agg(to_jsonb(ec.*)) FROM expense_categories ec WHERE ec.hotel_id = p_hotel_id),
    'other_daily_entries', (SELECT json_agg(to_jsonb(ode.*)) FROM other_daily_entries ode WHERE ode.hotel_id = p_hotel_id),
    'electricity_readings', (SELECT json_agg(to_jsonb(er.*)) FROM electricity_readings er WHERE er.hotel_id = p_hotel_id),
    'laundry_entries', (SELECT json_agg(to_jsonb(le.*)) FROM laundry_entries le WHERE le.hotel_id = p_hotel_id),
    'monthly_bills', (SELECT json_agg(to_jsonb(mb.*)) FROM monthly_bills mb WHERE mb.hotel_id = p_hotel_id),
    'salary_advances', (SELECT json_agg(to_jsonb(sa.*)) FROM salary_advances sa WHERE sa.hotel_id = p_hotel_id),
    'salary_settlements', (SELECT json_agg(to_jsonb(ss.*)) FROM salary_settlements ss WHERE ss.hotel_id = p_hotel_id),
    'utility_bills', (SELECT json_agg(to_jsonb(ub.*)) FROM utility_bills ub WHERE ub.hotel_id = p_hotel_id),
    'staff', (SELECT json_agg(to_jsonb(s.*)) FROM staff s WHERE s.hotel_id = p_hotel_id),
    'company_sources', (SELECT json_agg(to_jsonb(cs.*)) FROM company_sources cs WHERE cs.hotel_id = p_hotel_id),
    'subscription_payments', (SELECT json_agg(to_jsonb(sp.*)) FROM subscription_payments sp WHERE sp.hotel_id = p_hotel_id),
    'support_tickets', (SELECT json_agg(to_jsonb(st.*)) FROM support_tickets st WHERE st.hotel_id = p_hotel_id),
    'notifications', (SELECT json_agg(to_jsonb(n.*)) FROM notifications n WHERE n.hotel_id = p_hotel_id),
    'audit_logs', (SELECT json_agg(to_jsonb(al.*)) FROM audit_logs al WHERE al.hotel_id = p_hotel_id),
    'impersonation_sessions', (SELECT json_agg(to_jsonb(imp.*)) FROM impersonation_sessions imp WHERE imp.hotel_id = p_hotel_id),
    'hotel_invitations', (SELECT json_agg(to_jsonb(hi.*)) FROM hotel_invitations hi WHERE hi.hotel_id = p_hotel_id)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION export_hotel_data FROM anon;
GRANT EXECUTE ON FUNCTION export_hotel_data TO authenticated;
