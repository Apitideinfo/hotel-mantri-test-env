/*
# SaaS Lockdown Part 2b: Super admin CRUD policies on auth tables
*/
-- hotels
DROP POLICY IF EXISTS "super_admin_insert_hotels" ON hotels;
CREATE POLICY "super_admin_insert_hotels" ON hotels FOR INSERT TO authenticated WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS "super_admin_update_hotels" ON hotels;
CREATE POLICY "super_admin_update_hotels" ON hotels FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS "super_admin_delete_hotels" ON hotels;
CREATE POLICY "super_admin_delete_hotels" ON hotels FOR DELETE TO authenticated USING (is_super_admin());

-- hotel_admins
DROP POLICY IF EXISTS "super_admin_insert_hotel_admins" ON hotel_admins;
CREATE POLICY "super_admin_insert_hotel_admins" ON hotel_admins FOR INSERT TO authenticated WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS "super_admin_update_hotel_admins" ON hotel_admins;
CREATE POLICY "super_admin_update_hotel_admins" ON hotel_admins FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS "super_admin_delete_hotel_admins" ON hotel_admins;
CREATE POLICY "super_admin_delete_hotel_admins" ON hotel_admins FOR DELETE TO authenticated USING (is_super_admin());

-- hotel_invitations
DROP POLICY IF EXISTS "super_admin_insert_hotel_invitations" ON hotel_invitations;
CREATE POLICY "super_admin_insert_hotel_invitations" ON hotel_invitations FOR INSERT TO authenticated WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS "super_admin_update_hotel_invitations" ON hotel_invitations;
CREATE POLICY "super_admin_update_hotel_invitations" ON hotel_invitations FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS "super_admin_delete_hotel_invitations" ON hotel_invitations;
CREATE POLICY "super_admin_delete_hotel_invitations" ON hotel_invitations FOR DELETE TO authenticated USING (is_super_admin());

-- subscription_plans write
DROP POLICY IF EXISTS "super_admin_insert_subscription_plans" ON subscription_plans;
CREATE POLICY "super_admin_insert_subscription_plans" ON subscription_plans FOR INSERT TO authenticated WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS "super_admin_update_subscription_plans" ON subscription_plans;
CREATE POLICY "super_admin_update_subscription_plans" ON subscription_plans FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS "super_admin_delete_subscription_plans" ON subscription_plans;
CREATE POLICY "super_admin_delete_subscription_plans" ON subscription_plans FOR DELETE TO authenticated USING (is_super_admin());
