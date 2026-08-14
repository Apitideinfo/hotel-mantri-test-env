-- Composite index for the most frequent query pattern:
-- WHERE hotel_id = $1 AND report_date BETWEEN $2 AND $3
-- (used by getRoomChart, getRoomChartForMonth, getDerivedReportsForMonth)
-- The existing idx_room_chart_date only indexes report_date alone, which
-- forces a full scan + filter when RLS adds the hotel_id predicate.
CREATE INDEX IF NOT EXISTS idx_rce_hotel_report_date
  ON room_chart_entries (hotel_id, report_date);

-- Composite index for other_daily_entries range queries
-- (getDerivedReportsForMonth now batch-fetches by hotel_id + date range)
CREATE INDEX IF NOT EXISTS idx_ode_hotel_report_date
  ON other_daily_entries (hotel_id, report_date);
