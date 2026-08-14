-- Fix record_invoice_payment: audit_logs INSERT has 13 values but only 12 columns
-- The 'reason' column is missing from the column list
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_mode text,
  p_transaction_reference text DEFAULT '',
  p_bank_or_upi text DEFAULT '',
  p_notes text DEFAULT '',
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_receipt text;
  v_new_paid numeric;
  v_new_balance numeric;
  v_new_status text;
  v_user_id uuid := auth.uid();
  v_role text;
  v_hotel_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder','company_admin','finance_manager','finance_executive') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not authorized to record payments';
    END IF;
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_invoice.status IN ('Draft','Cancelled') THEN
    RAISE EXCEPTION 'Cannot record payment for % invoice', v_invoice.status;
  END IF;

  -- Generate receipt number
  v_receipt := generate_receipt_number();

  -- Insert payment record
  INSERT INTO invoice_payments (
    invoice_id, receipt_number, amount, payment_mode,
    transaction_reference, bank_or_upi, notes,
    entered_by, entered_by_email
  ) VALUES (
    p_invoice_id, v_receipt, p_amount, p_payment_mode,
    p_transaction_reference, p_bank_or_upi, p_notes,
    v_user_id, p_user_email
  );

  -- Calculate new totals
  v_new_paid := v_invoice.amount_paid + p_amount;
  v_new_balance := v_invoice.total_amount - v_new_paid;

  IF v_new_balance <= 0.01 THEN
    v_new_status := 'Paid';
  ELSE
    v_new_status := 'Partially Paid';
  END IF;

  -- Get hotel name for audit
  SELECT hotel_name INTO v_hotel_name FROM hotels WHERE id = v_invoice.hotel_id;

  -- Update invoice
  UPDATE invoices SET
    amount_paid = v_new_paid,
    balance_due = v_new_balance,
    status = v_new_status,
    paid_at = CASE WHEN v_new_status = 'Paid' THEN now() ELSE paid_at END,
    updated_at = now()
  WHERE id = p_invoice_id;

  -- Audit log (fixed: added 'reason' to column list)
  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    old_value, new_value, severity, reason, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'record_payment', 'billing',
    v_invoice.hotel_id, v_hotel_name, p_invoice_id::text,
    jsonb_build_object('amount_paid', v_invoice.amount_paid, 'status', v_invoice.status),
    jsonb_build_object('amount_paid', v_new_paid, 'status', v_new_status, 'receipt', v_receipt),
    'info', 'Payment recorded',
    jsonb_build_object('receipt_number', v_receipt, 'amount', p_amount, 'mode', p_payment_mode)
  );

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'receipt_number', v_receipt,
    'new_status', v_new_status,
    'amount_paid', v_new_paid,
    'balance_due', v_new_balance,
    'message', 'Payment recorded successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, numeric, text, text, text, text, text) TO authenticated;
