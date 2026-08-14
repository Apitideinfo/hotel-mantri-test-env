-- 1. Modify issue_invoice to preserve existing invoice_number (assigned at draft creation)
--    Only generate a new number if the invoice doesn't already have one.
CREATE OR REPLACE FUNCTION public.issue_invoice(
  p_invoice_id uuid,
  p_user_email text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_hotel RECORD;
  v_plan RECORD;
  v_items jsonb;
  v_features jsonb;
  v_snapshot jsonb;
  v_invoice_number text;
  v_settings billing_settings%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_role text;
  v_hotel_features jsonb;
BEGIN
  -- Authorization
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = v_user_id AND status = 'Active';
  IF NOT FOUND OR v_role NOT IN ('founder','company_admin','finance_manager') THEN
    SELECT role INTO v_role FROM hotel_admins WHERE user_id = v_user_id AND role = 'super_admin' LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not authorized to issue invoices';
    END IF;
  END IF;

  -- Load invoice
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_invoice.status != 'Draft' THEN
    RAISE EXCEPTION 'Only Draft invoices can be issued. Current status: %', v_invoice.status;
  END IF;

  -- Use existing invoice_number if already assigned (at draft creation), otherwise generate one
  IF v_invoice.invoice_number IS NOT NULL AND v_invoice.invoice_number != '' THEN
    v_invoice_number := v_invoice.invoice_number;
  ELSE
    v_invoice_number := generate_invoice_number();
  END IF;

  -- Load hotel
  SELECT * INTO v_hotel FROM hotels WHERE id = v_invoice.hotel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hotel not found';
  END IF;

  -- Load plan
  SELECT * INTO v_plan FROM subscription_plans WHERE id = v_invoice.plan_id;

  -- Load hotel features
  SELECT COALESCE(json_agg(json_build_object('module_key', module_key, 'is_enabled', is_enabled)), '[]'::json)
  INTO v_hotel_features
  FROM hotel_features WHERE hotel_id = v_invoice.hotel_id;

  -- Load invoice items
  SELECT COALESCE(json_agg(to_jsonb(t)), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT sr_no, description, hsn_sac, quantity, rate, discount, taxable_value,
    gst_rate, cgst_amount, sgst_amount, igst_amount, amount, item_type
    FROM invoice_items WHERE invoice_id = p_invoice_id ORDER BY sr_no
  ) t;

  -- Load billing settings for snapshot
  SELECT * INTO v_settings FROM billing_settings WHERE id = 1;

  -- Build snapshot
  v_snapshot := jsonb_build_object(
    'company_details', v_settings.company_details,
    'branding', v_settings.branding,
    'gst', v_settings.gst,
    'payment', v_settings.payment,
    'terms', v_settings.terms,
    'hotel', jsonb_build_object(
      'hotel_name', v_hotel.hotel_name,
      'address', COALESCE(v_hotel.address, ''),
      'city', v_hotel.city,
      'state', v_hotel.state,
      'property_code', v_hotel.property_code,
      'admin_email', v_hotel.admin_email,
      'mobile', v_hotel.mobile,
      'owner_name', v_hotel.owner_name,
      'total_rooms', v_hotel.total_rooms
    ),
    'hotel_settings', (
      SELECT to_jsonb(hs) FROM hotel_settings hs WHERE hs.id = v_hotel.id
    ),
    'plan', CASE WHEN v_plan.id IS NOT NULL THEN
      jsonb_build_object(
        'name', v_plan.name,
        'price', v_plan.price,
        'yearly_price', v_plan.yearly_price,
        'billing_period', v_plan.billing_period,
        'features', v_plan.features,
        'enabled_modules', v_plan.enabled_modules,
        'room_limit', v_plan.room_limit,
        'user_limit', v_plan.user_limit,
        'hotel_limit', v_plan.hotel_limit
      )
    ELSE null END,
    'hotel_features', v_hotel_features,
    'items', v_items,
    'snapshot_at', now()
  );

  -- Update invoice: issue it with snapshot
  UPDATE invoices SET
    status = 'Issued',
    invoice_number = v_invoice_number,
    invoice_date = COALESCE(invoice_date, CURRENT_DATE),
    due_date = COALESCE(due_date, CURRENT_DATE + 15),
    snapshot = v_snapshot,
    issued_at = now(),
    issued_by = v_user_id,
    updated_at = now()
  WHERE id = p_invoice_id;

  -- Audit log
  INSERT INTO audit_logs (
    user_id, user_email, role, action, module,
    hotel_id, hotel_name, record_id,
    old_value, new_value, severity, reason, metadata
  ) VALUES (
    v_user_id, p_user_email, v_role,
    'issue_invoice', 'billing',
    v_invoice.hotel_id, v_hotel.hotel_name, p_invoice_id::text,
    jsonb_build_object('status', 'Draft'),
    jsonb_build_object('status', 'Issued', 'invoice_number', v_invoice_number),
    'warning', 'Invoice issued',
    jsonb_build_object('invoice_number', v_invoice_number)
  );

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'invoice_number', v_invoice_number,
    'status', 'Issued',
    'message', 'Invoice issued successfully'
  );
END;
$$;

-- 2. Grant execute on generate_invoice_number to authenticated (already granted, but ensure)
GRANT EXECUTE ON FUNCTION public.generate_invoice_number() TO authenticated;

-- 3. Add a trigger to auto-assign invoice_number on draft creation if not already set
--    This ensures every draft gets a sequential number immediately.
CREATE OR REPLACE FUNCTION public.assign_draft_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    IF NEW.status = 'Draft' THEN
      NEW.invoice_number := generate_invoice_number();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_draft_invoice_number() TO authenticated;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_assign_draft_invoice_number ON public.invoices;
CREATE TRIGGER trg_assign_draft_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_draft_invoice_number();
