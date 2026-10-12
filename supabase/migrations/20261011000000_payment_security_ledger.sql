-- ==============================================================================
-- HOTEL MANTRI — MIGRATION: 20261011000000_payment_security_ledger.sql
-- Scope: SEC-03B Payment Integrity Closure
-- Purpose:
--   1. Durable, database-backed payment transaction ledger (payment_transactions)
--   2. Unique constraint on provider payment ID to prevent duplicate processing
--   3. Row-level locked atomic payment verification stored procedure
-- ==============================================================================

-- 1. Create dedicated payment transactions ledger
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid REFERENCES public.hotels(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  payment_id text NOT NULL,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  plan_id text,
  amount_paise integer NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'captured'
    CHECK (status IN ('authorized', 'captured', 'refunded', 'failed')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_payment_transactions_payment_id UNIQUE (payment_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order
  ON public.payment_transactions (order_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_resv
  ON public.payment_transactions (reservation_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_hotel
  ON public.payment_transactions (hotel_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_created
  ON public.payment_transactions (created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies
DROP POLICY IF EXISTS "payment_transactions_select_policy" ON public.payment_transactions;
CREATE POLICY "payment_transactions_select_policy" ON public.payment_transactions
  FOR SELECT TO authenticated
  USING (
    is_super_admin() OR
    hotel_id IN (
      SELECT hotel_id FROM public.hotel_admins WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "payment_transactions_insert_policy" ON public.payment_transactions;
CREATE POLICY "payment_transactions_insert_policy" ON public.payment_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin() OR
    hotel_id IN (
      SELECT hotel_id FROM public.hotel_admins WHERE user_id = auth.uid()
    )
  );

-- 2. Stored Procedure for Atomic Payment Verification and Settlement
CREATE OR REPLACE FUNCTION public.process_verified_payment(
  p_order_id text,
  p_payment_id text,
  p_reservation_id uuid,
  p_hotel_id uuid,
  p_amount_paise integer,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_resv public.reservations%ROWTYPE;
  v_paid_inr numeric(12,2);
  v_existing_tx public.payment_transactions%ROWTYPE;
BEGIN
  -- Validate required input parameters
  IF p_payment_id IS NULL OR TRIM(p_payment_id) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_PAYMENT_ID',
      'message', 'Payment ID cannot be null or empty'
    );
  END IF;

  IF p_order_id IS NULL OR TRIM(p_order_id) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_ORDER_ID',
      'message', 'Order ID cannot be null or empty'
    );
  END IF;

  IF p_amount_paise < 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_AMOUNT',
      'message', 'Payment amount cannot be negative'
    );
  END IF;

  -- Caller tenant authorization check for authenticated users (defense in depth)
  IF auth.uid() IS NOT NULL AND NOT (public.is_super_admin()) THEN
    IF p_hotel_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.hotel_admins WHERE user_id = auth.uid() AND hotel_id = p_hotel_id
    ) THEN
      RAISE EXCEPTION 'Access denied: user is not authorized for hotel %', p_hotel_id;
    END IF;
  END IF;

  -- 1. Check uniqueness and idempotency on payment_id
  SELECT * INTO v_existing_tx
  FROM public.payment_transactions
  WHERE payment_id = p_payment_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'message', 'Payment has already been processed previously',
      'payment_id', p_payment_id,
      'order_id', v_existing_tx.order_id,
      'transaction_id', v_existing_tx.id
    );
  END IF;

  -- 2. Insert into payment transactions ledger
  INSERT INTO public.payment_transactions (
    hotel_id,
    order_id,
    payment_id,
    reservation_id,
    amount_paise,
    currency,
    status,
    metadata
  )
  VALUES (
    p_hotel_id,
    p_order_id,
    p_payment_id,
    p_reservation_id,
    p_amount_paise,
    'INR',
    'captured',
    p_metadata
  );

  -- 3. Atomic reservation settlement (if reservation_id is provided)
  IF p_reservation_id IS NOT NULL THEN
    -- Lock reservation row exclusively to prevent concurrent updates
    SELECT * INTO v_resv
    FROM public.reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
      -- Transaction recorded but reservation not found; roll back to prevent inconsistency
      RAISE EXCEPTION 'Target reservation % does not exist', p_reservation_id;
    END IF;

    IF v_resv.status = 'cancelled' THEN
      RAISE EXCEPTION 'Cannot apply payment to cancelled reservation %', p_reservation_id;
    END IF;

    v_paid_inr := round(p_amount_paise / 100.0, 2);

    UPDATE public.reservations
    SET advance_paid = COALESCE(advance_paid, 0) + v_paid_inr,
        payment_ref = p_payment_id,
        payment_mode = 'Razorpay',
        updated_at = now()
    WHERE id = p_reservation_id;
  END IF;

  -- 4. Record audit log entry
  INSERT INTO public.audit_logs (
    action,
    module,
    hotel_id,
    record_id,
    metadata,
    severity,
    created_at
  )
  VALUES (
    'PAYMENT_VERIFIED',
    'payment',
    p_hotel_id,
    p_payment_id,
    jsonb_build_object(
      'order_id', p_order_id,
      'payment_id', p_payment_id,
      'reservation_id', p_reservation_id,
      'amount_paise', p_amount_paise,
      'settled_at', now()
    ),
    'info',
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'message', 'Payment processed and settled successfully',
    'payment_id', p_payment_id,
    'order_id', p_order_id,
    'new_advance_paid', CASE WHEN p_reservation_id IS NOT NULL THEN COALESCE(v_resv.advance_paid, 0) + v_paid_inr ELSE 0 END
  );
END;
$$;

-- Safe Grants: Revoke from public/anon, grant to authenticated and service_role
REVOKE ALL ON FUNCTION public.process_verified_payment(text, text, uuid, uuid, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_verified_payment(text, text, uuid, uuid, integer, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.process_verified_payment(text, text, uuid, uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_verified_payment(text, text, uuid, uuid, integer, jsonb) TO service_role;
