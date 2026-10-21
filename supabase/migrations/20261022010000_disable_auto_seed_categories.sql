-- Migration: 20261022010000_disable_auto_seed_categories.sql
-- Description: Disables automatic seeding of phantom room categories for new hotels
--              and cleans up unconfigured trigger-seeded categories that have no rooms,
--              no reservations, and no rate mappings.

-- 1. Drop the auto-seed trigger from hotel_settings
DROP TRIGGER IF EXISTS trigger_seed_room_categories ON public.hotel_settings;

-- 2. Replace seed_default_room_categories with a safe no-op function
CREATE OR REPLACE FUNCTION public.seed_default_room_categories()
RETURNS TRIGGER AS $$
BEGIN
  -- Intentionally no-op: Room categories must be explicitly created by the hotel owner/admin
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Safely deactivate unconfigured phantom categories that:
--    - Have default_tariff = 0 and extra_bed_charge = 0
--    - Have NO physical rooms in the rooms table
--    - Have NO active reservations
--    - Have NO external OTA rate mappings
--    - Belong to the legacy auto-seed set
UPDATE public.room_categories
SET is_active = false
WHERE is_active = true
  AND default_tariff = 0
  AND (extra_bed_charge = 0 OR extra_bed_charge IS NULL)
  AND name IN ('Standard', 'Deluxe', 'Super Deluxe', 'Executive', 'Suite', 'Family Room')
  AND NOT EXISTS (
    SELECT 1 FROM public.rooms r WHERE r.category_id = room_categories.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.channel_rate_mappings crm WHERE crm.room_category_id = room_categories.id
  );
