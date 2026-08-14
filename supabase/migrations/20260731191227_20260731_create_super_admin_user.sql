/*
# Create Super Admin User

Creates the initial super admin user in auth.users and links them
to the hotel_admins table with role='super_admin'.

Credentials:
  Email: admin@hotelmis.com
  Password: Admin@2026 (change after first login)
*/

-- Insert the super admin user into auth.users (if not exists)
DO $$
DECLARE
  admin_uid uuid;
  existing_count int;
BEGIN
  SELECT count(*) INTO existing_count FROM auth.users WHERE email = 'admin@hotelmis.com';
  IF existing_count = 0 THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated', 'authenticated', 'admin@hotelmis.com',
      crypt('Admin@2026', gen_salt('bf')),
      now(), now(), now(),
      '{"role": "super_admin"}'::jsonb,
      '{}'::jsonb
    )
    RETURNING id INTO admin_uid;
  ELSE
    SELECT id INTO admin_uid FROM auth.users WHERE email = 'admin@hotelmis.com' LIMIT 1;
  END IF;

  -- Link to hotel_admins
  INSERT INTO hotel_admins (user_id, hotel_id, role, status, email)
  SELECT admin_uid, NULL, 'super_admin', 'Active', 'admin@hotelmis.com'
  WHERE NOT EXISTS (
    SELECT 1 FROM hotel_admins WHERE user_id = admin_uid
  );
END $$;
