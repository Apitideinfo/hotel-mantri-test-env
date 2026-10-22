-- ==============================================================================
-- HOTEL MANTRI — MIGRATION: 20261023010000_operations_performance_indexes.sql
-- Purpose: High-speed query execution for Operations Board date-range lookups,
--          room chart entries, active reservations, and VIP guest queries.
-- Non-destructive, safe, and idempotent.
-- ==============================================================================

-- 1. Reservation date-range queries:
-- Used by getReservationsForDateRange: .lte('check_in_date', endDate).gte('check_out_date', startDate)
CREATE INDEX IF NOT EXISTS idx_reservations_hotel_dates
  ON reservations (hotel_id, check_in_date, check_out_date)
  WHERE status IN ('confirmed', 'checked_in');

CREATE INDEX IF NOT EXISTS idx_reservations_hotel_checkout_checkin
  ON reservations (hotel_id, check_out_date, check_in_date)
  WHERE status IN ('confirmed', 'checked_in');

-- 2. Room chart entries report date and stay range queries:
-- Used by getRoomChartForDateRange: .gte('report_date', ...).lte('report_date', ...)
CREATE INDEX IF NOT EXISTS idx_room_chart_entries_hotel_report_date
  ON room_chart_entries (hotel_id, report_date);

CREATE INDEX IF NOT EXISTS idx_room_chart_entries_hotel_arrival_departure
  ON room_chart_entries (hotel_id, arrival, departure);

-- 3. High-speed VIP guests lookup:
-- Used by getVipGuests: .neq('vip_type', '')
CREATE INDEX IF NOT EXISTS idx_guests_hotel_vip
  ON guests (hotel_id, vip_type)
  WHERE vip_type IS NOT NULL AND vip_type <> '';

-- 4. Channel inventory restrictions date lookup:
-- Used by getAuthoritativeAvailabilityMatrix: .gte('date', startDate).lte('date', endDate)
CREATE INDEX IF NOT EXISTS idx_channel_restrictions_hotel_date
  ON channel_inventory_restrictions (hotel_id, date);
