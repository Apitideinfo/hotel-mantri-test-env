-- ==============================================================================
-- HOTEL MANTRI — MIGRATION: 20260928000000_reservation_integrity_and_room_overlap.sql
-- Purpose: Database-level reservation integrity, duplicate OTA prevention, 
--          and physical room overlap enforcement.
-- ==============================================================================

-- 1. Ensure indexes for high-speed conflict checking
CREATE INDEX IF NOT EXISTS idx_reservations_room_dates
  ON reservations (hotel_id, room_no, check_in_date, check_out_date)
  WHERE status IN ('confirmed', 'checked_in');

CREATE INDEX IF NOT EXISTS idx_reservations_room_id_dates
  ON reservations (hotel_id, room_id, check_in_date, check_out_date)
  WHERE status IN ('confirmed', 'checked_in') AND room_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_hotel_status
  ON reservations (hotel_id, status);

CREATE INDEX IF NOT EXISTS idx_room_chart_entries_active_stay
  ON room_chart_entries (hotel_id, room_no, report_date)
  WHERE checked_out_at IS NULL;

-- 2. OTA Unique Constraint / Index to prevent duplicate webhook imports
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_ota_unique_booking
  ON channel_ota_reservations (hotel_id, ota_booking_id)
  WHERE ota_booking_id IS NOT NULL AND ota_booking_id <> '';

-- 3. Stored function to verify room availability
CREATE OR REPLACE FUNCTION check_room_availability(
  p_hotel_id uuid,
  p_room_no text,
  p_check_in date,
  p_check_out date,
  p_exclude_reservation_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  v_conflict_count integer;
BEGIN
  -- Unassigned rooms do not block physical rooms
  IF p_room_no IS NULL OR LOWER(TRIM(p_room_no)) IN ('', 'unassigned', 'tbd') THEN
    RETURN true;
  END IF;

  -- Verify check_in < check_out
  IF p_check_in >= p_check_out THEN
    RETURN false;
  END IF;

  -- 1. Check active reservations in this hotel for overlapping dates
  SELECT COUNT(*) INTO v_conflict_count
  FROM reservations
  WHERE hotel_id = p_hotel_id
    AND (id <> p_exclude_reservation_id OR p_exclude_reservation_id IS NULL)
    AND status IN ('confirmed', 'checked_in')
    AND LOWER(TRIM(room_no)) = LOWER(TRIM(p_room_no))
    AND check_in_date < p_check_out
    AND check_out_date > p_check_in;

  IF v_conflict_count > 0 THEN
    RETURN false;
  END IF;

  -- 2. Check in-house active room chart entries (excluding reservation's own entry)
  SELECT COUNT(*) INTO v_conflict_count
  FROM room_chart_entries
  WHERE hotel_id = p_hotel_id
    AND checked_out_at IS NULL
    AND (reservation_id <> p_exclude_reservation_id OR p_exclude_reservation_id IS NULL OR reservation_id IS NULL)
    AND LOWER(TRIM(room_no)) = LOWER(TRIM(p_room_no))
    AND COALESCE(arrival, report_date) < p_check_out
    AND COALESCE(departure, report_date) > p_check_in;

  IF v_conflict_count > 0 THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE;

-- 4. Trigger Function: Enforce Physical Room Non-Overlap and Date Invariants
CREATE OR REPLACE FUNCTION trg_enforce_reservation_integrity()
RETURNS trigger AS $$
DECLARE
  v_conflict_guest text;
BEGIN
  -- Validate date invariant: check_in < check_out
  IF NEW.check_in_date >= NEW.check_out_date THEN
    RAISE EXCEPTION 'INVALID_STAY_DATES: Check-out date (%) must be strictly after check-in date (%)',
      NEW.check_out_date, NEW.check_in_date
      USING ERRCODE = '23P01';
  END IF;

  -- If status is non-blocking or physical room is unassigned, permit
  IF NEW.status NOT IN ('confirmed', 'checked_in') OR 
     NEW.room_no IS NULL OR 
     LOWER(TRIM(NEW.room_no)) IN ('', 'unassigned', 'tbd') THEN
    RETURN NEW;
  END IF;

  -- Detect physical room overlap
  SELECT guest_name INTO v_conflict_guest
  FROM reservations
  WHERE hotel_id = NEW.hotel_id
    AND (id <> NEW.id OR NEW.id IS NULL)
    AND status IN ('confirmed', 'checked_in')
    AND (
      (NEW.room_id IS NOT NULL AND room_id IS NOT NULL AND room_id = NEW.room_id)
      OR LOWER(TRIM(room_no)) = LOWER(TRIM(NEW.room_no))
    )
    AND check_in_date < NEW.check_out_date
    AND check_out_date > NEW.check_in_date
  LIMIT 1;

  IF v_conflict_guest IS NOT NULL THEN
    RAISE EXCEPTION 'ROOM_ALREADY_BOOKED: Room % is already booked for part of this stay by %',
      NEW.room_no, v_conflict_guest
      USING ERRCODE = '23P02';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_reservation_integrity ON reservations;
CREATE TRIGGER enforce_reservation_integrity
  BEFORE INSERT OR UPDATE ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION trg_enforce_reservation_integrity();
