-- ==============================================================================
-- HOTEL MANTRI — MIGRATION: 20261027000000_guest_search_and_index_optimization.sql
-- Purpose: Optimize guest lookup and recent reservation retrieval for multi-tenant CRM
-- ==============================================================================

-- 1. Index for fast ordered guest lookups by hotel
CREATE INDEX IF NOT EXISTS idx_guests_hotel_updated_at
  ON guests (hotel_id, updated_at DESC);

-- 2. Index for fast recent reservations queries by hotel
CREATE INDEX IF NOT EXISTS idx_reservations_hotel_created_at
  ON reservations (hotel_id, created_at DESC);

-- 3. Composite index for availability checks and active reservation overlap queries
CREATE INDEX IF NOT EXISTS idx_reservations_hotel_stay_status
  ON reservations (hotel_id, status, check_in_date, check_out_date);

-- 4. Composite index for default reservations list sorting by check_in_date DESC
CREATE INDEX IF NOT EXISTS idx_reservations_hotel_checkin_desc
  ON reservations (hotel_id, check_in_date DESC);

-- 5. Index for guest phone searches and CRM stay history queries
CREATE INDEX IF NOT EXISTS idx_reservations_hotel_guest_phone
  ON reservations (hotel_id, guest_phone);

-- 6. Index for guest phone autocomplete lookup
CREATE INDEX IF NOT EXISTS idx_guests_hotel_mobile
  ON guests (hotel_id, mobile);

-- 7. Composite index for in-house active room chart entries
CREATE INDEX IF NOT EXISTS idx_room_chart_active
  ON room_chart_entries (hotel_id, checked_out_at);

-- 8. Composite index for chronological booking timeline retrieval
CREATE INDEX IF NOT EXISTS idx_booking_timeline_hotel_created
  ON booking_timeline (hotel_id, created_at DESC);

