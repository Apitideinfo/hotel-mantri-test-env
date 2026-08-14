/*
# Restaurant POS — KOT Kitchen Display (KDS) status expansion

1. Overview
   Expands pos_kots.kot_status to support the full kitchen workflow:
   sent → preparing → ready → served, plus cancelled.
   Adds cancelled_reason column for audit.
   Adds kitchen_status_updated_at to track when the KOT last changed
   kitchen status (for average preparation time calculation).

2. Changes to existing table (no data loss)
   - ALTER pos_kots.kot_status CHECK constraint to allow:
     'sent' | 'preparing' | 'ready' | 'served' | 'cancelled'
   - ADD pos_kots.cancelled_reason text NULL
   - ADD pos_kots.kitchen_status_updated_at timestamptz NULL
   - ADD pos_kots.priority text NULL ('normal' | 'urgent') — default normal

3. Important Notes
   - 'sent' is the "New" column on the KDS board.
   - No existing rows are modified — 'sent' remains valid.
   - No other tables are touched.
*/

-- ── 1. Drop old CHECK and add expanded one ──
ALTER TABLE pos_kots DROP CONSTRAINT IF EXISTS pos_kots_kot_status_check;

ALTER TABLE pos_kots ADD CONSTRAINT pos_kots_kot_status_check
  CHECK (kot_status IN ('sent', 'preparing', 'ready', 'served', 'cancelled'));

-- ── 2. Add columns ──
ALTER TABLE pos_kots ADD COLUMN IF NOT EXISTS cancelled_reason text;
ALTER TABLE pos_kots ADD COLUMN IF NOT EXISTS kitchen_status_updated_at timestamptz;
ALTER TABLE pos_kots ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent'));

-- ── 3. Backfill kitchen_status_updated_at for existing rows ──
UPDATE pos_kots SET kitchen_status_updated_at = created_at WHERE kitchen_status_updated_at IS NULL;
