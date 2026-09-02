-- Ensure channel_connections has the required schema and unique constraints
ALTER TABLE channel_connections
ADD COLUMN IF NOT EXISTS external_channel_id text,
ADD COLUMN IF NOT EXISTS mapping_status text DEFAULT 'unmapped',
ADD COLUMN IF NOT EXISTS is_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS connection_status text DEFAULT 'disconnected',
ADD COLUMN IF NOT EXISTS last_successful_sync_at timestamptz;

-- Cleanup duplicates before enforcing uniqueness
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER(PARTITION BY hotel_id, channel_type ORDER BY created_at DESC) as row_num
  FROM channel_connections
)
DELETE FROM channel_connections
WHERE id IN (SELECT id FROM duplicates WHERE row_num > 1);

-- Ensure idempotency by channel type per hotel
ALTER TABLE channel_connections DROP CONSTRAINT IF EXISTS channel_connections_hotel_channel_unique;
ALTER TABLE channel_connections ADD CONSTRAINT channel_connections_hotel_channel_unique UNIQUE (hotel_id, channel_type);

-- Ensure channel_rate_mappings scopes to connection if not already
ALTER TABLE channel_rate_mappings
ADD COLUMN IF NOT EXISTS channel_connection_id uuid REFERENCES channel_connections(id) ON DELETE CASCADE;
