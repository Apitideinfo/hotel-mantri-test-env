-- 20260903150000_fix_auth_and_super_admin_grants.sql
-- Fix permissions and policies for is_super_admin() RPC and hotel_admins table

-- 1. Ensure is_super_admin function exists with correct definition and permissions
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM hotel_admins
    WHERE user_id = auth.uid() AND role = 'super_admin' AND status = 'Active'
  ) OR EXISTS (
    SELECT 1 FROM company_users
    WHERE user_id = auth.uid() AND role IN ('founder', 'company_admin') AND status = 'Active'
  );
$$;

-- Explicitly revoke from anon and grant to authenticated and service_role
REVOKE EXECUTE ON FUNCTION is_super_admin() FROM anon;
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin() TO service_role;

-- 2. Ensure authenticated users can query their own hotel_admins record, and Super Admins can query all
DROP POLICY IF EXISTS "hotel_admins_select" ON hotel_admins;
CREATE POLICY "hotel_admins_select" ON hotel_admins
FOR SELECT TO authenticated
USING (is_super_admin() OR user_id = auth.uid());

-- 3. Ensure hotels table allows authenticated users to read active hotels
DROP POLICY IF EXISTS "hotels_select_authenticated" ON hotels;
CREATE POLICY "hotels_select_authenticated" ON hotels
FOR SELECT TO authenticated
USING (true);
