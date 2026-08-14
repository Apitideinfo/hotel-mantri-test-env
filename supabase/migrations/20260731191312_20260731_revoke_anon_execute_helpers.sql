/*
# Revoke EXECUTE on SECURITY DEFINER helper functions from anon

The auth_hotel_id() and is_super_admin() functions are used internally
by RLS policies. They return NULL/FALSE for unauthenticated users
(auth.uid() is null), so they're safe — but we revoke EXECUTE from anon
to satisfy the security advisor and follow least-privilege.
*/
REVOKE EXECUTE ON FUNCTION auth_hotel_id() FROM anon;
REVOKE EXECUTE ON FUNCTION is_super_admin() FROM anon;
