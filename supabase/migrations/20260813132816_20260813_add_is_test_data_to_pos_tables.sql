-- Add is_test_data boolean column to all POS tables.
-- Defaults to FALSE so all existing real data is unaffected.
-- Test/demo records inserted with is_test_data = TRUE can be cleaned up
-- with a single DELETE WHERE is_test_data = TRUE on each table.

ALTER TABLE pos_menu_categories ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE pos_menu_items       ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE pos_areas            ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE pos_tables           ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE pos_orders           ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE pos_order_items      ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE pos_kots             ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE pos_kot_items        ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE pos_bills            ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE pos_payments         ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;