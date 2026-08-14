/*
# Reservations – Wizard Fields

## Purpose
Adds optional booking-detail columns to the `reservations` table so the new
4-step New Booking wizard can persist meal plan, GST, guest details, payment
breakdown, and audit metadata — without touching revenue/GST/cash reporting
(reservations still only block inventory until check-in).

## Columns added (all optional / defaulted)
1. `meal_plan` text – EP / CP / MAP / AP (default 'EP')
2. `gst_type` text – Exclusive / Inclusive / No Scope (default 'No Scope')
3. `gst_slab` numeric – GST rate percent (default 0)
4. `gst_amount` numeric – calculated GST amount (default 0)
5. `taxable_amount` numeric – pre-tax amount (default 0)
6. `invoice_total` numeric – final amount incl. GST (default 0)
7. `adults` int – number of adults (default 1)
8. `children` int – number of children (default 0)
9. `discount` numeric – discount amount (default 0)
10. `guest_address` text – optional guest address
11. `guest_type` text – FIT / Corporate / Group etc. (default '')
12. `company_gst` text – guest/company GST number (default '')
13. `payment_ref` text – payment reference / UTR (default '')
14. `pay_cash` numeric – cash portion of advance (default 0)
15. `pay_upi` numeric – UPI portion (default 0)
16. `pay_card` numeric – card portion (default 0)
17. `pay_bank` numeric – bank portion (default 0)
18. `created_by` text – booking created-by user name (default '')
19. `internal_note` text – internal note (default '')

## Security
- No policy changes. Existing CRUD policies on `reservations` remain unchanged.
- All new columns are nullable / defaulted so existing rows and inserts work.
*/

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS meal_plan text NOT NULL DEFAULT 'EP',
  ADD COLUMN IF NOT EXISTS gst_type text NOT NULL DEFAULT 'No Scope',
  ADD COLUMN IF NOT EXISTS gst_slab numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_total numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adults integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS children integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS guest_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS guest_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_gst text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_ref text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pay_cash numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_upi numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_card numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_bank numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS internal_note text NOT NULL DEFAULT '';
