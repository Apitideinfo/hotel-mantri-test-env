-- Migration to add Aiosell mapping columns to channel_rate_mappings

ALTER TABLE channel_rate_mappings
ADD COLUMN IF NOT EXISTS external_room_code text,
ADD COLUMN IF NOT EXISTS external_room_name text,
ADD COLUMN IF NOT EXISTS external_rate_plan_code text,
ADD COLUMN IF NOT EXISTS external_rate_plan_name text,
ADD COLUMN IF NOT EXISTS provider text DEFAULT 'aiosell';
