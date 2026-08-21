-- 1. Add number_of_floors to hotels
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS number_of_floors int NOT NULL DEFAULT 1 CHECK (number_of_floors > 0);

-- 1.5 Auto-confirm users (bypasses Supabase email confirmation requirement for seamless signup flow)
CREATE OR REPLACE FUNCTION public.auto_confirm_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.email_confirmed_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.auto_confirm_user();

-- 2. Create RPC function for secure hotel registration
CREATE OR REPLACE FUNCTION public.register_new_hotel(
  p_hotel_name text,
  p_owner_name text,
  p_mobile text,
  p_address text,
  p_total_rooms int,
  p_number_of_floors int
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with privileges of the function creator (postgres) to bypass RLS
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_hotel_id uuid;
  v_existing_hotel_id uuid;
  v_category_id uuid;
  v_rooms_per_floor int;
  v_current_floor int;
  v_room_count int;
  v_room_num int;
BEGIN
  -- Verify the caller is authenticated
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated. Please log in or sign up first.';
  END IF;

  -- Get caller's email
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  -- Ensure the user doesn't already have an active hotel admin role
  SELECT hotel_id INTO v_existing_hotel_id FROM public.hotel_admins WHERE user_id = v_user_id LIMIT 1;
  IF v_existing_hotel_id IS NOT NULL THEN
    RAISE EXCEPTION 'User is already associated with a hotel (ID: %).', v_existing_hotel_id;
  END IF;

  -- Insert the new hotel record
  INSERT INTO public.hotels (
    hotel_name,
    owner_name,
    admin_email,
    mobile,
    address,
    total_rooms,
    number_of_floors,
    subscription_status,
    subscription_start,
    subscription_expiry,
    is_active
  ) VALUES (
    p_hotel_name,
    p_owner_name,
    v_user_email,
    p_mobile,
    p_address,
    p_total_rooms,
    p_number_of_floors,
    'Active',
    CURRENT_DATE,
    CURRENT_DATE + interval '14 days',
    true
  ) RETURNING id INTO v_hotel_id;

  -- Insert hotel settings (mandatory base row)
  INSERT INTO public.hotel_settings (
    id,
    hotel_name,
    total_rooms,
    opening_cash_balance,
    financial_year
  ) VALUES (
    v_hotel_id,
    p_hotel_name,
    p_total_rooms,
    0,
    EXTRACT(YEAR FROM CURRENT_DATE)
  );

  -- Insert default company sources
  INSERT INTO public.company_sources (hotel_id, name, source_category)
  VALUES 
    (v_hotel_id, 'OTA', 'OTA'),
    (v_hotel_id, 'Direct/Walking', 'Direct/Walking'),
    (v_hotel_id, 'Corporate/Agent', 'Corporate/Agent'),
    (v_hotel_id, 'Phonebook', 'Phonebook');

  -- Create the admin relationship
  INSERT INTO public.hotel_admins (
    user_id,
    hotel_id,
    role,
    status,
    email
  ) VALUES (
    v_user_id,
    v_hotel_id,
    'hotel_admin',
    'Active',
    v_user_email
  );

  -- Create default room category
  INSERT INTO public.room_categories (hotel_id, name, sort_order)
  VALUES (v_hotel_id, 'Standard Room', 1)
  RETURNING id INTO v_category_id;

  -- Generate rooms evenly across floors
  v_rooms_per_floor := ceil(p_total_rooms::float / p_number_of_floors::float);
  v_room_count := 0;
  
  FOR v_current_floor IN 1..p_number_of_floors LOOP
    v_room_num := v_current_floor * 100 + 1;
    FOR i IN 1..v_rooms_per_floor LOOP
      IF v_room_count < p_total_rooms THEN
        INSERT INTO public.rooms (hotel_id, category_id, room_no, floor, default_tariff)
        VALUES (v_hotel_id, v_category_id, v_room_num::text, v_current_floor::text, 2000);
        v_room_num := v_room_num + 1;
        v_room_count := v_room_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- Log the action
  INSERT INTO public.audit_logs (
    user_id,
    user_email,
    role,
    action,
    module,
    hotel_id,
    hotel_name,
    record_id,
    new_value,
    severity,
    reason,
    metadata
  ) VALUES (
    v_user_id,
    v_user_email,
    'hotel_admin',
    'register_hotel',
    'hotels',
    v_hotel_id,
    p_hotel_name,
    v_hotel_id::text,
    jsonb_build_object('total_rooms', p_total_rooms, 'floors', p_number_of_floors),
    'info',
    'Self-service signup',
    '{}'::jsonb
  );

  RETURN v_hotel_id;
END;
$$;
