-- Storage bucket for hotel assets (logo uploads)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hotel-assets',
  'hotel-assets',
  true,
  2097152,
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "auth_upload_hotel_assets" ON storage.objects;
CREATE POLICY "auth_upload_hotel_assets"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'hotel-assets');

DROP POLICY IF EXISTS "auth_update_hotel_assets" ON storage.objects;
CREATE POLICY "auth_update_hotel_assets"
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'hotel-assets');

DROP POLICY IF EXISTS "auth_delete_hotel_assets" ON storage.objects;
CREATE POLICY "auth_delete_hotel_assets"
  ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'hotel-assets');

DROP POLICY IF EXISTS "public_read_hotel_assets" ON storage.objects;
CREATE POLICY "public_read_hotel_assets"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'hotel-assets');
