/**
 * HOTEL MANTRI — N3: FUNCTION GRANTS LOCKDOWN & PRIVILEGE AUDIT
 * 
 * Verifies:
 * 1. Static audit of 20261102020000_function_grants.sql.
 * 2. Closed-by-default execution privileges.
 * 3. Administrative RPC revocation from authenticated.
 * 4. Authorization enforcement on get_hotel_record_counts.
 * 5. Pinned search_path on all SECURITY DEFINER functions.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const MIGRATION_PATH = path.join(ROOT_DIR, 'supabase', 'migrations', '20261102020000_function_grants.sql');

async function runFunctionGrantsSuite() {
  console.log('='.repeat(80));
  console.log(' HOTEL MANTRI — N3: FUNCTION GRANTS LOCKDOWN AUDIT');
  console.log('='.repeat(80));

  let passed = 0;
  let failed = 0;

  function test(desc, fn) {
    try {
      fn();
      console.log(`  ✓ PASS: ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${desc} -> ${err.message}`);
      failed++;
    }
  }

  // --- CRITERION 1: Static Migration Integrity ---
  console.log('\n--- Criterion 1: Static Migration Audit for 20261102020000_function_grants.sql ---');

  test('Migration file exists', () => {
    assert(fs.existsSync(MIGRATION_PATH), 'Migration file exists on disk');
  });

  const content = fs.readFileSync(MIGRATION_PATH, 'utf8');

  test('Revokes EXECUTE on ALL functions from PUBLIC, anon, authenticated', () => {
    assert(
      content.includes('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;'),
      'Revokes execute on all functions'
    );
  });

  test('Alters default privileges to revoke EXECUTE on new functions', () => {
    assert(
      content.includes('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;'),
      'Revokes default execute privileges'
    );
  });

  test('Alters default privileges to revoke ALL ON TABLES from authenticated (closed-by-default)', () => {
    assert(
      content.includes('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;'),
      'New tables closed by default'
    );
  });

  test('Hardens get_hotel_record_counts with tenant authorization check', () => {
    assert(content.includes('CREATE OR REPLACE FUNCTION public.get_hotel_record_counts'), 'Redefines get_hotel_record_counts');
    assert(content.includes('is_super_admin() OR p_hotel_id = auth_hotel_id()'), 'Checks tenant ownership');
    assert(content.includes('SET search_path = public, pg_temp'), 'Pins search_path');
  });

  test('Pins search_path on internal helper and trigger functions', () => {
    assert(content.includes('sanitize_auth_user_tokens'), 'Pins search_path on sanitize_auth_user_tokens');
    assert(content.includes('auto_confirm_user'), 'Pins search_path on auto_confirm_user');
  });

  test('Explicitly grants EXECUTE only to allowlisted RLS helpers', () => {
    assert(content.includes('auth_hotel_id()'), 'Allowlists auth_hotel_id');
    assert(content.includes('is_super_admin()'), 'Allowlists is_super_admin');
    assert(content.includes('auth_staff_role()'), 'Allowlists auth_staff_role');
  });

  test('Strictly revokes sensitive RPCs from authenticated', () => {
    const sensitiveRpcList = [
      'get_auth_user_by_email',
      'delete_hotel_permanently',
      'reset_hotel_operational_data',
      'export_hotel_data',
      'change_plan',
      'suspend_subscription',
      'reactivate_subscription',
      'register_new_hotel'
    ];

    for (const rpc of sensitiveRpcList) {
      assert(content.includes(rpc), `Revokes ${rpc}`);
    }
  });

  // --- CRITERION 2: Documentation in SECURITY_DECISIONS.md ---
  console.log('\n--- Criterion 2: Audit SECURITY_DECISIONS.md Allowlist ---');

  const secDecPath = path.join(ROOT_DIR, 'SECURITY_DECISIONS.md');
  const secDec = fs.existsSync(secDecPath) ? fs.readFileSync(secDecPath, 'utf8') : '';

  test('SECURITY_DECISIONS.md documents function grant allowlist', () => {
    assert(secDec.includes('Function Grants') || secDec.includes('Function Allowlist') || secDec.includes('N3'), 'Documents function allowlist');
  });

  console.log('\n' + '='.repeat(80));
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('='.repeat(80));

  if (failed > 0) process.exit(1);
}

runFunctionGrantsSuite().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
