/*
# GST Report Export Audit Log

1. New Tables
- `gst_report_exports` — audit log for GST statement downloads (PDF/Excel/Print).
  - `id` (uuid, primary key)
  - `hotel_id` (uuid, references hotels) — which hotel's report was exported
  - `selected_month` (text) — e.g. "2026-08"
  - `export_type` (text) — "pdf" | "excel" | "print"
  - `performed_by` (uuid, references auth.users) — who downloaded it
  - `performed_by_email` (text) — email of the user for readability
  - `booking_count` (integer) — number of booking rows in the export
  - `created_at` (timestamptz) — when the export happened

2. Security
- Enable RLS on `gst_report_exports`.
- Only authenticated users can insert audit rows (the app writes these on download).
- Users can read their own hotel's audit rows (hotel_id matches their hotel_admins.hotel_id).
- Super admins can read all rows.
*/

CREATE TABLE IF NOT EXISTS gst_report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  selected_month text NOT NULL,
  export_type text NOT NULL CHECK (export_type IN ('pdf', 'excel', 'print')),
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_email text,
  booking_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gst_report_exports ENABLE ROW LEVEL SECURITY;

-- Insert: any authenticated user can insert (the app logs exports)
DROP POLICY IF EXISTS "authenticated_insert_gst_exports" ON gst_report_exports;
CREATE POLICY "authenticated_insert_gst_exports"
  ON gst_report_exports FOR INSERT
  TO authenticated WITH CHECK (true);

-- Select: users can read their own hotel's exports, or super_admins can read all
DROP POLICY IF EXISTS "select_own_hotel_gst_exports" ON gst_report_exports;
CREATE POLICY "select_own_hotel_gst_exports"
  ON gst_report_exports FOR SELECT
  TO authenticated USING (
    hotel_id IN (SELECT hotel_id FROM hotel_admins WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM hotel_admins WHERE user_id = auth.uid() AND role = 'super_admin')
  );

CREATE INDEX IF NOT EXISTS idx_gst_exports_hotel_month
  ON gst_report_exports (hotel_id, selected_month);
