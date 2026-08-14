/*
# GST Module and Split Payment Support

1. Overview
   Adds hotel-level GST settings and per-booking GST + split payment support.
   Also adds a monthly GST report view (computed, no table needed).

2. hotel_settings — new columns
   - gst_registered (boolean, default false) — whether the hotel is GST-registered
   - gst_mode (text, default 'Exclusive') — 'Inclusive' or 'Exclusive' tax mode
   - default_gst_slab (numeric, default 0) — default GST slab: 0, 5, 12, or 18

3. room_chart_entries — new columns
   - gst_mode (text, default 'Exclusive') — per-booking override: 'Inclusive' or 'Exclusive'
   - gst_slab (numeric, default 0) — per-booking tax slab: 0, 5, 12, or 18
   - gst_amount (numeric, default 0) — computed GST for this booking
   - taxable_amount (numeric, default 0) — taxable revenue (exclusive of GST) for this booking
   - pay_cash (numeric, default 0) — cash portion of split payment
   - pay_upi (numeric, default 0) — UPI portion
   - pay_card (numeric, default 0) — card portion
   - pay_bank (numeric, default 0) — bank transfer portion
   - pay_advance (numeric, default 0) — advance adjustment portion
   - pay_balance (numeric, default 0) — outstanding balance portion

4. Security
   - No new tables; only ALTER TABLE on existing tables (RLS already enabled).
   - No policy changes needed — existing hotel_id-scoped policies cover new columns.

5. Notes
   - All new columns have safe defaults so existing rows and code continue to work.
   - The existing `pay_mode` column is retained for backward compatibility;
     split payment columns provide finer-grained breakdown.
   - `total` remains the gross booking total (room_rate * nights).
     `taxable_amount` and `gst_amount` are derived from total + gst_mode + gst_slab.
*/

-- ── hotel_settings GST columns ──
ALTER TABLE hotel_settings
  ADD COLUMN IF NOT EXISTS gst_registered boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_mode text DEFAULT 'Exclusive' CHECK (gst_mode IN ('Inclusive','Exclusive')),
  ADD COLUMN IF NOT EXISTS default_gst_slab numeric DEFAULT 0 CHECK (default_gst_slab IN (0, 5, 12, 18));

-- ── room_chart_entries GST + split payment columns ──
ALTER TABLE room_chart_entries
  ADD COLUMN IF NOT EXISTS gst_mode text DEFAULT 'Exclusive' CHECK (gst_mode IN ('Inclusive','Exclusive')),
  ADD COLUMN IF NOT EXISTS gst_slab numeric DEFAULT 0 CHECK (gst_slab IN (0, 5, 12, 18)),
  ADD COLUMN IF NOT EXISTS gst_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_cash numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_upi numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_card numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_bank numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_advance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_balance numeric DEFAULT 0;
