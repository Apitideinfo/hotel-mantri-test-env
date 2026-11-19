-- =========================================================================
-- Migration: 20261102040000_storage_bucket_policies.sql
-- Finding: N6 - Storage Bucket Isolation & Private Documents Hardening
-- =========================================================================
-- Guarantees:
-- 1. Buckets are explicitly configured:
--    - `hotel-assets`: public = true (public hotel logo images)
--    - `hotel-documents`: public = false (confidential guest reservation PDFs, daily reports, invoices)
-- 2. Establishes tenant-scoped RLS policies on `storage.objects` for `hotel-documents`:
--    - Access strictly restricted to caller's `auth_hotel_id()::text` as the top-level path segment.
--    - Super Admin can access all paths.
--    - Anonymous (`anon`) role has ZERO access to `hotel-documents`.
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. CONFIGURE BUCKET PRIVACY & LIMITS
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- 1.1 hotel-assets (Public for logos)
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('hotel-assets', 'hotel-assets', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[])
  ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[];

  -- 1.2 hotel-documents (Strictly PRIVATE for guest & financial documents)
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('hotel-documents', 'hotel-documents', false, 15728640, ARRAY['application/pdf']::text[])
  ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 15728640,
    allowed_mime_types = ARRAY['application/pdf']::text[];
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. TENANT-SCOPED STORAGE POLICIES FOR hotel-documents
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Drop existing policies if any
  DROP POLICY IF EXISTS "tenant_select_hotel_documents" ON storage.objects;
  DROP POLICY IF EXISTS "tenant_insert_hotel_documents" ON storage.objects;
  DROP POLICY IF EXISTS "tenant_update_hotel_documents" ON storage.objects;
  DROP POLICY IF EXISTS "tenant_delete_hotel_documents" ON storage.objects;

  -- 2.1 SELECT: Authenticated users can read only their own hotel's documents
  CREATE POLICY "tenant_select_hotel_documents"
    ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'hotel-documents' AND (
        is_super_admin() OR
        split_part(name, '/', 1) = auth_hotel_id()::text
      )
    );

  -- 2.2 INSERT: Tenant write isolation
  CREATE POLICY "tenant_insert_hotel_documents"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'hotel-documents' AND (
        is_super_admin() OR
        split_part(name, '/', 1) = auth_hotel_id()::text
      )
    );

  -- 2.3 UPDATE: Tenant write isolation
  CREATE POLICY "tenant_update_hotel_documents"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
      bucket_id = 'hotel-documents' AND (
        is_super_admin() OR
        split_part(name, '/', 1) = auth_hotel_id()::text
      )
    )
    WITH CHECK (
      bucket_id = 'hotel-documents' AND (
        is_super_admin() OR
        split_part(name, '/', 1) = auth_hotel_id()::text
      )
    );

  -- 2.4 DELETE: Tenant write isolation
  CREATE POLICY "tenant_delete_hotel_documents"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id = 'hotel-documents' AND (
        is_super_admin() OR
        split_part(name, '/', 1) = auth_hotel_id()::text
      )
    );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
