/*
# Add meal_plan to room_chart_entries

Adds a meal_plan column to every room booking with a safe default of 'EP'
(Room Only). All existing entries are backfilled to 'EP' automatically.

Meal plan options:
  EP  – Room Only
  CP  – Room + Breakfast
  MAP – Room + Breakfast + Dinner
  AP  – Room + All Meals (Breakfast + Lunch + Dinner)
*/

ALTER TABLE room_chart_entries
  ADD COLUMN IF NOT EXISTS meal_plan text NOT NULL DEFAULT 'EP'
    CHECK (meal_plan IN ('EP', 'CP', 'MAP', 'AP'));

-- Backfill any existing NULL values (belt-and-suspenders)
UPDATE room_chart_entries SET meal_plan = 'EP' WHERE meal_plan IS NULL;
