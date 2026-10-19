-- ==============================================================================
-- HOTEL MANTRI — MIGRATION: 20261017000000_chatbot_booking_concurrency.sql
-- Scope: Chatbot Booking API Concurrency, Inventory Holds & Atomic Settlement
-- Purpose:
--   1. Create `booking_holds` table for durable multi-instance inventory reservation
--   2. Add stored procedure `create_chatbot_booking_hold` for atomic concurrency
--   3. Add stored procedure `finalize_chatbot_booking` for atomic payment settlement
--   4. Add stored procedure `release_expired_booking_holds` for automatic hold cleanup
-- ==============================================================================

-- 1. Create booking_holds table
CREATE TABLE IF NOT EXISTS public.booking_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  booking_reference text NOT NULL UNIQUE,
  category_id uuid NOT NULL REFERENCES public.room_categories(id) ON DELETE CASCADE,
  check_in_date date NOT NULL,
  check_out_date date NOT NULL,
  rooms_count integer NOT NULL DEFAULT 1 CHECK (rooms_count > 0),
  assigned_room_ids uuid[] DEFAULT '{}',
  assigned_room_nos text[] DEFAULT '{}',
  adults integer NOT NULL DEFAULT 1,
  children integer NOT NULL DEFAULT 0,
  rate_per_night numeric(12,2) NOT NULL DEFAULT 0,
  total_amount_paise integer NOT NULL CHECK (total_amount_paise > 0),
  guest_name text NOT NULL,
  guest_phone text NOT NULL,
  guest_email text NOT NULL,
  guest_address text DEFAULT '',
  special_requests text DEFAULT '',
  status text NOT NULL DEFAULT 'held'
    CHECK (status IN ('held', 'confirmed', 'expired', 'released')),
  idempotency_key text,
  request_fingerprint text,
  razorpay_order_id text,
  razorpay_payment_id text,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_booking_holds_hotel_idemp UNIQUE (hotel_id, idempotency_key)
);

-- Indexes for lightning-fast availability and lookup
CREATE INDEX IF NOT EXISTS idx_booking_holds_active 
  ON public.booking_holds (hotel_id, category_id, check_in_date, check_out_date) 
  WHERE status = 'held';

CREATE INDEX IF NOT EXISTS idx_booking_holds_order 
  ON public.booking_holds (razorpay_order_id);

CREATE INDEX IF NOT EXISTS idx_booking_holds_reference 
  ON public.booking_holds (booking_reference);

CREATE INDEX IF NOT EXISTS idx_booking_holds_expiry 
  ON public.booking_holds (expires_at) 
  WHERE status = 'held';

-- Enable Row Level Security
ALTER TABLE public.booking_holds ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies for booking_holds
DROP POLICY IF EXISTS "tenant_select_booking_holds" ON public.booking_holds;
CREATE POLICY "tenant_select_booking_holds" ON public.booking_holds
  FOR SELECT TO authenticated
  USING (
    is_super_admin() OR
    hotel_id IN (
      SELECT hotel_id FROM public.hotel_admins WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tenant_insert_booking_holds" ON public.booking_holds;
CREATE POLICY "tenant_insert_booking_holds" ON public.booking_holds
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin() OR
    hotel_id IN (
      SELECT hotel_id FROM public.hotel_admins WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tenant_update_booking_holds" ON public.booking_holds;
CREATE POLICY "tenant_update_booking_holds" ON public.booking_holds
  FOR UPDATE TO authenticated
  USING (
    is_super_admin() OR
    hotel_id IN (
      SELECT hotel_id FROM public.hotel_admins WHERE user_id = auth.uid()
    )
  );

-- 2. Stored Procedure: create_chatbot_booking_hold
CREATE OR REPLACE FUNCTION public.create_chatbot_booking_hold(
  p_hotel_id uuid,
  p_category_id uuid,
  p_check_in date,
  p_check_out date,
  p_rooms_count int,
  p_rate_per_night numeric,
  p_total_amount_paise int,
  p_guest_name text,
  p_guest_phone text,
  p_guest_email text,
  p_guest_address text DEFAULT '',
  p_special_requests text DEFAULT '',
  p_idempotency_key text DEFAULT NULL,
  p_request_fingerprint text DEFAULT NULL,
  p_hold_ttl_seconds int DEFAULT 900
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lock_key bigint;
  v_total_physical_rooms int;
  v_max_occupied int;
  v_available_rooms int;
  v_hold_rec public.booking_holds%ROWTYPE;
  v_new_ref text;
  v_expires_at timestamptz;
BEGIN
  -- Strict Parameter Validation
  IF p_hotel_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'HOTEL_REQUIRED', 'message', 'Hotel ID is required');
  END IF;

  IF p_category_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'CATEGORY_REQUIRED', 'message', 'Category ID is required');
  END IF;

  IF p_check_in >= p_check_out THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_DATES', 'message', 'Check-out date must be strictly after check-in date');
  END IF;

  IF p_rooms_count <= 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_ROOM_COUNT', 'message', 'Room count must be at least 1');
  END IF;

  -- 1. Idempotency Check
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    SELECT * INTO v_hold_rec 
    FROM public.booking_holds 
    WHERE hotel_id = p_hotel_id AND idempotency_key = TRIM(p_idempotency_key);

    IF FOUND THEN
      IF v_hold_rec.request_fingerprint = p_request_fingerprint OR p_request_fingerprint IS NULL THEN
        RETURN jsonb_build_object(
          'success', true,
          'idempotent', true,
          'booking_reference', v_hold_rec.booking_reference,
          'hold_id', v_hold_rec.id,
          'status', v_hold_rec.status,
          'expires_at', v_hold_rec.expires_at,
          'amount_paise', v_hold_rec.total_amount_paise
        );
      ELSE
        RETURN jsonb_build_object(
          'success', false,
          'code', 'IDEMPOTENCY_MISMATCH',
          'message', 'Idempotency key has already been used with different request parameters'
        );
      END IF;
    END IF;
  END IF;

  -- 2. Transaction-scoped advisory lock for the hotel category
  v_lock_key := ('x' || substr(md5(p_hotel_id::text || ':' || p_category_id::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- 3. Verify category belongs to configured hotel
  IF NOT EXISTS (
    SELECT 1 FROM public.room_categories 
    WHERE id = p_category_id AND hotel_id = p_hotel_id AND is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'CATEGORY_NOT_FOUND', 'message', 'Room category not found for configured hotel');
  END IF;

  -- 4. Count total physical rooms in category
  SELECT COUNT(*) INTO v_total_physical_rooms
  FROM public.rooms
  WHERE hotel_id = p_hotel_id 
    AND category_id = p_category_id 
    AND is_active = true 
    AND COALESCE(room_status, 'Vacant') <> 'Maintenance';

  -- 5. Calculate peak occupied units across stay [check_in, check_out)
  WITH date_series AS (
    SELECT generate_series(p_check_in, p_check_out - interval '1 day', interval '1 day')::date AS d
  ),
  daily_occupancy AS (
    SELECT 
      ds.d,
      (
        SELECT COUNT(*) 
        FROM public.reservations r
        JOIN public.rooms rm ON r.room_id = rm.id
        WHERE r.hotel_id = p_hotel_id 
          AND rm.category_id = p_category_id
          AND r.status IN ('confirmed', 'checked_in')
          AND r.check_in_date <= ds.d 
          AND r.check_out_date > ds.d
      ) + (
        SELECT COALESCE(SUM(bh.rooms_count), 0)
        FROM public.booking_holds bh
        WHERE bh.hotel_id = p_hotel_id
          AND bh.category_id = p_category_id
          AND bh.status = 'held'
          AND bh.expires_at > now()
          AND bh.check_in_date <= ds.d
          AND bh.check_out_date > ds.d
      ) AS occupied_units
    FROM date_series ds
  )
  SELECT COALESCE(MAX(occupied_units), 0) INTO v_max_occupied FROM daily_occupancy;

  v_available_rooms := v_total_physical_rooms - v_max_occupied;

  IF v_available_rooms < p_rooms_count THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'CAPACITY_EXCEEDED',
      'message', format('Only %s rooms available for selected category, requested %s', v_available_rooms, p_rooms_count),
      'available_rooms', v_available_rooms
    );
  END IF;

  -- 6. Generate secure public reference and expiration
  v_new_ref := 'HM-BKG-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10));
  v_expires_at := now() + (p_hold_ttl_seconds || ' seconds')::interval;

  -- 7. Insert durable hold record
  INSERT INTO public.booking_holds (
    hotel_id,
    booking_reference,
    category_id,
    check_in_date,
    check_out_date,
    rooms_count,
    rate_per_night,
    total_amount_paise,
    guest_name,
    guest_phone,
    guest_email,
    guest_address,
    special_requests,
    status,
    idempotency_key,
    request_fingerprint,
    expires_at
  ) VALUES (
    p_hotel_id,
    v_new_ref,
    p_category_id,
    p_check_in,
    p_check_out,
    p_rooms_count,
    p_rate_per_night,
    p_total_amount_paise,
    TRIM(p_guest_name),
    TRIM(p_guest_phone),
    TRIM(p_guest_email),
    COALESCE(p_guest_address, ''),
    COALESCE(p_special_requests, ''),
    'held',
    TRIM(p_idempotency_key),
    p_request_fingerprint,
    v_expires_at
  ) RETURNING * INTO v_hold_rec;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'booking_reference', v_hold_rec.booking_reference,
    'hold_id', v_hold_rec.id,
    'status', 'held',
    'expires_at', v_hold_rec.expires_at,
    'amount_paise', v_hold_rec.total_amount_paise
  );
END;
$$;

-- 3. Stored Procedure: finalize_chatbot_booking
CREATE OR REPLACE FUNCTION public.finalize_chatbot_booking(
  p_booking_reference text,
  p_order_id text,
  p_payment_id text,
  p_amount_paise int,
  p_payment_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hold public.booking_holds%ROWTYPE;
  v_resv_id uuid;
  v_guest_id uuid;
  v_amount_inr numeric(12,2);
  v_assigned_room_id uuid;
  v_assigned_room_no text;
  v_existing_tx public.payment_transactions%ROWTYPE;
BEGIN
  -- 1. Idempotency Check on payment_id
  SELECT * INTO v_existing_tx 
  FROM public.payment_transactions 
  WHERE payment_id = p_payment_id;

  IF FOUND THEN
    SELECT * INTO v_hold FROM public.booking_holds WHERE razorpay_payment_id = p_payment_id;
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'message', 'Payment already settled previously',
      'booking_reference', v_hold.booking_reference,
      'reservation_id', v_hold.reservation_id,
      'payment_id', p_payment_id
    );
  END IF;

  -- 2. Lock hold row exclusively
  SELECT * INTO v_hold
  FROM public.booking_holds
  WHERE booking_reference = p_booking_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'HOLD_NOT_FOUND',
      'message', format('Booking hold %s not found', p_booking_reference)
    );
  END IF;

  IF v_hold.status = 'confirmed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'message', 'Booking has already been confirmed',
      'booking_reference', v_hold.booking_reference,
      'reservation_id', v_hold.reservation_id
    );
  END IF;

  IF p_amount_paise < v_hold.total_amount_paise THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'AMOUNT_UNDERPAID',
      'message', format('Payment amount (%s paise) is less than required (%s paise)', p_amount_paise, v_hold.total_amount_paise)
    );
  END IF;

  v_amount_inr := round(p_amount_paise / 100.0, 2);

  -- 3. Assign physical room from candidate rooms in category
  SELECT r.id, r.room_no INTO v_assigned_room_id, v_assigned_room_no
  FROM public.rooms r
  WHERE r.hotel_id = v_hold.hotel_id
    AND r.category_id = v_hold.category_id
    AND r.is_active = true
    AND COALESCE(r.room_status, 'Vacant') <> 'Maintenance'
    AND NOT EXISTS (
      SELECT 1 FROM public.reservations res
      WHERE res.hotel_id = v_hold.hotel_id
        AND res.room_id = r.id
        AND res.status IN ('confirmed', 'checked_in')
        AND res.check_in_date < v_hold.check_out_date
        AND res.check_out_date > v_hold.check_in_date
    )
  ORDER BY r.sort_order ASC, r.room_no ASC
  LIMIT 1;

  IF v_assigned_room_no IS NULL THEN
    v_assigned_room_no := 'Unassigned';
    v_assigned_room_id := NULL;
  END IF;

  -- 4. Upsert guest
  SELECT id INTO v_guest_id
  FROM public.guests
  WHERE hotel_id = v_hold.hotel_id
    AND mobile = v_hold.guest_phone
  LIMIT 1;

  IF v_guest_id IS NULL THEN
    INSERT INTO public.guests (
      hotel_id, name, mobile, email, address
    ) VALUES (
      v_hold.hotel_id, v_hold.guest_name, v_hold.guest_phone, v_hold.guest_email, v_hold.guest_address
    ) RETURNING id INTO v_guest_id;
  END IF;

  -- 5. Insert authoritative reservation into Hotel Mantri PMS
  INSERT INTO public.reservations (
    hotel_id,
    room_id,
    room_no,
    guest_name,
    guest_phone,
    guest_email,
    guest_address,
    check_in_date,
    check_out_date,
    rate,
    source_category,
    source_name,
    payment_mode,
    advance_paid,
    pay_bank,
    payment_ref,
    taxable_amount,
    invoice_total,
    adults,
    children,
    remarks,
    internal_note,
    created_by,
    status,
    guest_id
  ) VALUES (
    v_hold.hotel_id,
    v_assigned_room_id,
    v_assigned_room_no,
    v_hold.guest_name,
    v_hold.guest_phone,
    v_hold.guest_email,
    v_hold.guest_address,
    v_hold.check_in_date,
    v_hold.check_out_date,
    v_hold.rate_per_night,
    'Direct/Chatbot',
    'Chatbot Booking Engine',
    'Razorpay',
    v_amount_inr,
    v_amount_inr,
    p_payment_id,
    v_amount_inr,
    v_amount_inr,
    v_hold.adults,
    v_hold.children,
    COALESCE(v_hold.special_requests, 'Booked via AI Chatbot'),
    format('[CHATBOT_REF: %s] [RAZORPAY_ORDER: %s]', v_hold.booking_reference, p_order_id),
    'Chatbot Integration',
    'confirmed',
    v_guest_id
  ) RETURNING id INTO v_resv_id;

  -- 6. Insert into payment_transactions ledger
  INSERT INTO public.payment_transactions (
    hotel_id,
    order_id,
    payment_id,
    reservation_id,
    amount_paise,
    currency,
    status,
    metadata
  ) VALUES (
    v_hold.hotel_id,
    p_order_id,
    p_payment_id,
    v_resv_id,
    p_amount_paise,
    'INR',
    'captured',
    p_payment_metadata || jsonb_build_object('booking_reference', v_hold.booking_reference)
  );

  -- 7. Insert into booking_timeline
  INSERT INTO public.booking_timeline (
    hotel_id,
    reservation_id,
    event_type,
    event_description,
    event_amount,
    event_data,
    performed_by
  ) VALUES (
    v_hold.hotel_id,
    v_resv_id,
    'online_payment',
    format('Online payment via Razorpay for Chatbot reservation: %s', v_hold.guest_name),
    v_amount_inr,
    jsonb_build_object(
      'order_id', p_order_id,
      'payment_id', p_payment_id,
      'amount_paise', p_amount_paise,
      'payment_method', 'Razorpay'
    ),
    'CHATBOT_INTEGRATION'
  );

  -- 8. Insert into audit_logs
  INSERT INTO public.audit_logs (
    hotel_id,
    action,
    module,
    record_id,
    metadata,
    severity
  ) VALUES (
    v_hold.hotel_id,
    'CHATBOT_BOOKING_SETTLED',
    'reservation',
    v_resv_id::text,
    jsonb_build_object(
      'booking_reference', v_hold.booking_reference,
      'order_id', p_order_id,
      'payment_id', p_payment_id,
      'amount_paise', p_amount_paise,
      'room_no', v_assigned_room_no
    ),
    'info'
  );

  -- 9. Update hold record
  UPDATE public.booking_holds
  SET status = 'confirmed',
      razorpay_order_id = p_order_id,
      razorpay_payment_id = p_payment_id,
      reservation_id = v_resv_id,
      assigned_room_ids = CASE WHEN v_assigned_room_id IS NOT NULL THEN ARRAY[v_assigned_room_id] ELSE '{}'::uuid[] END,
      assigned_room_nos = ARRAY[v_assigned_room_no],
      updated_at = now()
  WHERE id = v_hold.id;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'message', 'Booking confirmed and settled successfully',
    'booking_reference', v_hold.booking_reference,
    'reservation_id', v_resv_id,
    'room_no', v_assigned_room_no,
    'advance_paid_inr', v_amount_inr
  );
END;
$$;

-- 4. Stored Procedure: release_expired_booking_holds
CREATE OR REPLACE FUNCTION public.release_expired_booking_holds(p_hotel_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.booking_holds
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'held'
    AND expires_at < now()
    AND (hotel_id = p_hotel_id OR p_hotel_id IS NULL);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 5. Permissions
REVOKE ALL ON FUNCTION public.create_chatbot_booking_hold(uuid, uuid, date, date, int, numeric, int, text, text, text, text, text, text, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_chatbot_booking_hold(uuid, uuid, date, date, int, numeric, int, text, text, text, text, text, text, text, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_chatbot_booking_hold(uuid, uuid, date, date, int, numeric, int, text, text, text, text, text, text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_chatbot_booking_hold(uuid, uuid, date, date, int, numeric, int, text, text, text, text, text, text, text, int) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_chatbot_booking(text, text, text, int, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_chatbot_booking(text, text, text, int, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_chatbot_booking(text, text, text, int, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_chatbot_booking(text, text, text, int, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.release_expired_booking_holds(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_expired_booking_holds(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.release_expired_booking_holds(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_booking_holds(uuid) TO service_role;
