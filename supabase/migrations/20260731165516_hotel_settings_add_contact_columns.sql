/*
# Hotel Settings — Add Contact & Branding Columns

1. Changes
   Adds address, phone, email, and logo_url columns to hotel_settings.
   These feed the PDF header so reports show hotel-specific branding
   without hardcoding any hotel name.

2. Notes
   - All columns are optional (nullable / default empty string).
   - Multi-hotel ready: each hotel row gets its own contact details.
*/

ALTER TABLE hotel_settings
  ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS logo_url text NOT NULL DEFAULT '';
