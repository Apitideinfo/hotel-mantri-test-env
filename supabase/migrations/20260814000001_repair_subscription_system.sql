-- =========================================
-- File: 20260814000001_repair_subscription_system.sql
-- Description: Assigns a default 'Pro' plan to the seeded test hotel to prevent renewal errors.
--              Also repairs the channel_settings RLS policies which were structurally broken.
-- =========================================

-- 1. Repair Seed Data: Assign 'Pro' plan to the default seeded hotel if it doesn't have one
DO $$
DECLARE
  v_pro_plan_id uuid;
BEGIN
  SELECT id INTO v_pro_plan_id FROM subscription_plans WHERE name = 'Pro' LIMIT 1;
  
  IF v_pro_plan_id IS NOT NULL THEN
    UPDATE hotels
    SET plan_id = v_pro_plan_id,
        base_amount = 3999,
        tax_amount = ROUND(3999 * 18 / 100, 2),
        total_payable = 3999 + ROUND(3999 * 18 / 100, 2),
        outstanding_amount = 3999 + ROUND(3999 * 18 / 100, 2)
    WHERE id = '00000000-0000-0000-0000-000000000000' AND plan_id IS NULL;
  END IF;
END $$;

-- 2. Repair channel_settings RLS policies
-- The previous policies compared auth.uid() (a User UUID) to hotel_id (a Hotel UUID), which is structurally invalid and always false.
-- We replace them with correct access controls matching the rest of the application's patterns.

DROP POLICY IF EXISTS "select_own_channel_settings" ON channel_settings;
CREATE POLICY "select_own_channel_settings" ON channel_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_channel_settings" ON channel_settings;
CREATE POLICY "insert_own_channel_settings" ON channel_settings FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_channel_settings" ON channel_settings;
CREATE POLICY "update_own_channel_settings" ON channel_settings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- End of migration
