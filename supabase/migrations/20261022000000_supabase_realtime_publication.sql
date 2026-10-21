-- 20261022000000_supabase_realtime_publication.sql
-- Ensure supabase_realtime publication exists and includes core operational tables
-- for live updates across Reservations, OTA Bookings, Room Chart, and Inventory Restrictions.

DO $$
BEGIN
  -- 1. Ensure supabase_realtime publication exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- 2. Add reservations to publication if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'reservations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;
  END IF;

  -- 3. Add channel_ota_reservations to publication if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'channel_ota_reservations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_ota_reservations;
  END IF;

  -- 4. Add room_chart_entries to publication if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'room_chart_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_chart_entries;
  END IF;

  -- 5. Add channel_inventory_restrictions to publication if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'channel_inventory_restrictions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_inventory_restrictions;
  END IF;
END $$;
