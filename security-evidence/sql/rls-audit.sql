-- =========================================================================
-- HOTEL MANTRI — PRODUCTION RLS AUDIT VERIFICATION SQL SCRIPT
-- =========================================================================
-- Execute against PostgreSQL / Supabase SQL Editor to audit:
-- 1. Table-level Row Level Security enablement status
-- 2. Complete RLS policy definitions and roles
-- 3. Anonymous role privilege grants across all tables
-- =========================================================================

-- 1. Check Row Level Security status on every public table
SELECT 
    schemaname,
    tablename,
    rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename;

-- 2. Verify all tables in public schema have RLS enabled (Count disabled tables)
SELECT 
    COUNT(*) AS tables_with_rls_disabled
FROM pg_tables
WHERE schemaname = 'public' 
  AND rowsecurity = false;

-- 3. Detailed policy audit across all tables
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

-- 4. Check table grants for anon role (Must be 0 writable grants, only safe lookup)
SELECT 
    table_schema,
    table_name,
    privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
ORDER BY table_name, privilege_type;

-- 5. Audit all SECURITY DEFINER functions to ensure search_path is pinned
SELECT 
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true;
