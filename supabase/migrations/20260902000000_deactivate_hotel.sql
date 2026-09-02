-- 20260902000000_deactivate_hotel.sql

-- Creates a secure RPC to deactivate a hotel and its associated admins atomically

CREATE OR REPLACE FUNCTION deactivate_hotel_atomically(p_hotel_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel_name text;
  v_admins_deactivated int;
BEGIN
  -- 1. Verify caller is a super admin
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Only super admins can deactivate a hotel';
  END IF;

  -- 2. Verify hotel exists and get its name
  SELECT hotel_name INTO v_hotel_name
  FROM hotels
  WHERE id = p_hotel_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hotel not found';
  END IF;

  -- 3. Deactivate the hotel
  UPDATE hotels
  SET is_active = false,
      subscription_status = 'Suspended',
      updated_at = now()
  WHERE id = p_hotel_id;

  -- 4. Deactivate associated hotel admins
  -- We suspend their role for THIS hotel only.
  -- This does not delete their auth.users account, so they can still access other hotels they might belong to.
  WITH updated_admins AS (
    UPDATE hotel_admins
    SET status = 'Suspended',
        updated_at = now()
    WHERE hotel_id = p_hotel_id
      AND status != 'Suspended'
    RETURNING id
  )
  SELECT count(*) INTO v_admins_deactivated FROM updated_admins;

  -- 5. Audit Log (Optional but recommended)
  -- Uses the existing audit_logs table to record the deactivation
  INSERT INTO audit_logs (
    user_id,
    user_email,
    role,
    action,
    module,
    hotel_id,
    hotel_name,
    record_id,
    severity,
    reason,
    metadata
  ) VALUES (
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    'super_admin',
    'deactivate_hotel',
    'hotels',
    p_hotel_id,
    v_hotel_name,
    p_hotel_id::text,
    'critical',
    'Super Admin removed/deactivated hotel via UI',
    json_build_object('admins_deactivated', v_admins_deactivated)
  );

  -- 6. Return result
  RETURN json_build_object(
    'success', true,
    'hotel_id', p_hotel_id,
    'admins_deactivated', v_admins_deactivated
  );
END;
$$;

-- Revoke execute from anon and grant to authenticated
REVOKE EXECUTE ON FUNCTION deactivate_hotel_atomically FROM anon;
GRANT EXECUTE ON FUNCTION deactivate_hotel_atomically TO authenticated;
