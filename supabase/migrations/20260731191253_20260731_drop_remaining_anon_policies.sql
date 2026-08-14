/*
# Drop remaining old anon_* policies that were missed in the lockdown migration

These old policies have different names than what was dropped earlier:
  hotel_settings: anon_select_settings, anon_insert_settings, anon_update_settings, anon_delete_settings
  other_daily_entries: anon_select_other_daily, anon_insert_other_daily, anon_update_other_daily, anon_delete_other_daily
  room_chart_entries: anon_select_room_chart, anon_insert_room_chart, anon_update_room_chart, anon_delete_room_chart
*/

DROP POLICY IF EXISTS "anon_select_settings" ON hotel_settings;
DROP POLICY IF EXISTS "anon_insert_settings" ON hotel_settings;
DROP POLICY IF EXISTS "anon_update_settings" ON hotel_settings;
DROP POLICY IF EXISTS "anon_delete_settings" ON hotel_settings;

DROP POLICY IF EXISTS "anon_select_other_daily" ON other_daily_entries;
DROP POLICY IF EXISTS "anon_insert_other_daily" ON other_daily_entries;
DROP POLICY IF EXISTS "anon_update_other_daily" ON other_daily_entries;
DROP POLICY IF EXISTS "anon_delete_other_daily" ON other_daily_entries;

DROP POLICY IF EXISTS "anon_select_room_chart" ON room_chart_entries;
DROP POLICY IF EXISTS "anon_insert_room_chart" ON room_chart_entries;
DROP POLICY IF EXISTS "anon_update_room_chart" ON room_chart_entries;
DROP POLICY IF EXISTS "anon_delete_room_chart" ON room_chart_entries;
