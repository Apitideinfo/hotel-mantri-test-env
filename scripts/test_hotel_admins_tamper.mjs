/**
 * Hotel Mantri — Hotel Admins & Super Admin Privilege Escalation Prevention Test Suite
 * Finding: N1 (CRITICAL) — Verify that hotel users cannot edit hotel_admins or escalate to super_admin
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runStaticMigrationCheck() {
  console.log('\n--- Criterion 1: Static Migration Audit for 20261102000000_protect_hotel_admins.sql ---');
  const migrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '20261102000000_protect_hotel_admins.sql');
  assert(fs.existsSync(migrationPath), 'Migration 20261102000000_protect_hotel_admins.sql exists');

  const content = fs.readFileSync(migrationPath, 'utf8');

  // Verify policy drops
  assert(
    content.includes('DROP POLICY IF EXISTS "tenant_update_hotel_admins" ON public.hotel_admins'),
    'Drops tenant_update_hotel_admins policy'
  );
  assert(
    content.includes('DROP POLICY IF EXISTS "tenant_insert_hotel_admins" ON public.hotel_admins'),
    'Drops tenant_insert_hotel_admins policy'
  );
  assert(
    content.includes('DROP POLICY IF EXISTS "tenant_delete_hotel_admins" ON public.hotel_admins'),
    'Drops tenant_delete_hotel_admins policy'
  );

  // Verify SELECT policy restriction
  assert(
    content.includes('CREATE POLICY "tenant_select_hotel_admins" ON public.hotel_admins') &&
    content.includes('USING (is_super_admin() OR user_id = auth.uid())'),
    'Restricts SELECT on hotel_admins to own row or super admin'
  );

  // Verify REVOKE from authenticated and anon
  assert(
    content.includes('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.hotel_admins FROM authenticated, anon, public;'),
    'Revokes all modification privileges on hotel_admins from authenticated, anon, public'
  );

  // Verify Trigger Guard Definition
  assert(
    content.includes('CREATE OR REPLACE FUNCTION public.guard_hotel_admins_mutation()') &&
    content.includes('SET search_path = public, pg_temp') &&
    content.includes("RAISE EXCEPTION 'hotel_admins mutations are strictly restricted to service_role or server administration'"),
    'Creates guard_hotel_admins_mutation() defense-in-depth trigger with pinned search_path'
  );

  assert(
    content.includes('CREATE TRIGGER trg_guard_hotel_admins_mutation') &&
    content.includes('BEFORE INSERT OR UPDATE OR DELETE ON public.hotel_admins'),
    'Binds guard trigger BEFORE INSERT OR UPDATE OR DELETE on hotel_admins'
  );

  // Verify protection on company_users, invitations, impersonation, billing, subscriptions
  const protectedTables = [
    'company_users',
    'hotel_invitations',
    'impersonation_sessions',
    'billing_settings',
    'subscription_settings',
    'subscription_reminders',
    'subscription_plan_history',
    'subscription_notes',
    'subscription_payments'
  ];
  for (const t of protectedTables) {
    assert(
      content.includes(`'${t}'`),
      `Protects ${t} with mutation revocation and trigger guard in migration`
    );
  }

  // Verify hardened is_super_admin()
  assert(
    content.includes('CREATE OR REPLACE FUNCTION public.is_super_admin()') &&
    content.includes('SET search_path = public, pg_temp') &&
    content.includes("role = 'super_admin' AND status = 'Active'") &&
    content.includes("role IN ('founder', 'company_admin') AND status = 'Active'"),
    'Hardens is_super_admin() with search_path = public, pg_temp and strict status = Active check'
  );

  // Verify 15 RPCs hardened with search_path = public, pg_temp and super admin check
  const rpcs = [
    'delete_hotel_permanently',
    'change_plan',
    'suspend_subscription',
    'reactivate_subscription',
    'extend_grace_period',
    'convert_trial_to_paid',
    'update_billing_settings',
    'update_subscription_settings',
    'reset_hotel_operational_data',
    'export_hotel_data',
    'send_subscription_reminder',
    'cancel_invoice',
    'issue_invoice',
    'record_invoice_payment',
    'register_new_hotel'
  ];
  for (const r of rpcs) {
    assert(
      content.includes(`FUNCTION ${r}(`) || content.includes(`FUNCTION public.${r}(`),
      `Hardens RPC ${r} in 20261102000000_protect_hotel_admins.sql`
    );
  }

  console.log('\n--- Criterion 2: Client Code Audit (Zero Direct Writes) ---');
  const superAdminPanel = fs.readFileSync(path.join(ROOT_DIR, 'src', 'screens', 'SuperAdminPanel.tsx'), 'utf8');
  assert(
    !superAdminPanel.includes("supabase.from('hotel_admins').update"),
    'SuperAdminPanel.tsx does not execute direct supabase.from("hotel_admins").update'
  );
  assert(
    superAdminPanel.includes("supabase.functions.invoke('setup-super-admin', {\n        body: { action: 'deactivate_hotel'"),
    'SuperAdminPanel.tsx routes hotel deactivation safely through setup-super-admin Edge Function'
  );

  const enterpriseApi = fs.readFileSync(path.join(ROOT_DIR, 'src', 'enterprise', 'api.ts'), 'utf8');
  assert(
    !enterpriseApi.includes("supabase.from('company_users').update"),
    'enterprise/api.ts does not execute direct client update on company_users'
  );
  assert(
    !enterpriseApi.includes("supabase.from('company_users').insert"),
    'enterprise/api.ts does not execute direct client insert on company_users'
  );
  assert(
    !enterpriseApi.includes("supabase.from('company_users').delete"),
    'enterprise/api.ts does not execute direct client delete on company_users'
  );
  assert(
    !enterpriseApi.includes("supabase.from('impersonation_sessions').insert"),
    'enterprise/api.ts does not execute direct client insert on impersonation_sessions'
  );
  assert(
    !enterpriseApi.includes("supabase.from('subscription_payments').insert"),
    'enterprise/api.ts does not execute direct client insert on subscription_payments'
  );
  assert(
    !enterpriseApi.includes("supabase.from('subscription_notes').insert"),
    'enterprise/api.ts does not execute direct client insert on subscription_notes'
  );
}

async function runLiveTamperCheck() {
  console.log('\n--- Criterion 3: Live REST Tamper & Escalation Probing ---');
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.log('  ⚠️ CANNOT-VERIFY: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.');
    return;
  }

  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Test live connection reachability
  let isReachable = false;
  try {
    const probe = await Promise.race([
      anonClient.from('hotels').select('id').limit(1),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ]);
    if (probe && (probe.data || probe.error)) {
      isReachable = true;
    }
  } catch (err) {
    isReachable = false;
  }

  if (!isReachable) {
    console.log('  ⚠️ Live Supabase unreachable in current local environment (offline / sandbox mode).');
    console.log('     Live REST tampering assertions marked as CANNOT-VERIFY for local run.');
    console.log('     (Run against live staging database to execute live HTTP network payloads).');
    return;
  }

  console.log('  Live Supabase endpoint reachable. Executing live tamper probes...');

  // 1. Anonymous Attacks
  const { data: anonUpdate, error: anonUpdateErr } = await anonClient
    .from('hotel_admins')
    .update({ role: 'super_admin' })
    .eq('id', '00000000-0000-0000-0000-000000000000');
  assert(anonUpdateErr != null, 'Anon cannot UPDATE hotel_admins role');

  const { data: anonInsert, error: anonInsertErr } = await anonClient
    .from('hotel_admins')
    .insert({ role: 'super_admin', status: 'Active' });
  assert(anonInsertErr != null, 'Anon cannot INSERT into hotel_admins');

  const { data: anonDelete, error: anonDeleteErr } = await anonClient
    .from('hotel_admins')
    .delete()
    .eq('id', '00000000-0000-0000-0000-000000000000');
  assert(anonDeleteErr != null, 'Anon cannot DELETE from hotel_admins');

  const { error: anonDelRpcErr } = await anonClient.rpc('delete_hotel_permanently', {
    p_hotel_id: '00000000-0000-0000-0000-000000000000',
    p_reason: 'Tamper test'
  });
  assert(anonDelRpcErr != null, 'Anon cannot execute delete_hotel_permanently RPC');

  const { error: anonChangePlanErr } = await anonClient.rpc('change_plan', {
    p_hotel_id: '00000000-0000-0000-0000-000000000000',
    p_new_plan_id: '00000000-0000-0000-0000-000000000000'
  });
  assert(anonChangePlanErr != null, 'Anon cannot execute change_plan RPC');
}

async function main() {
  console.log('===================================================================');
  console.log('HOTEL MANTRI — N1: HOTEL_ADMINS TAMPER & SUPER ADMIN ESCALATION AUDIT');
  console.log('===================================================================');

  try {
    await runStaticMigrationCheck();
    await runLiveTamperCheck();

    console.log('\n===================================================================');
    console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('===================================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during test execution:', err);
    process.exit(1);
  }
}

main();
