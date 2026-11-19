/**
 * HOTEL MANTRI — N2: ROLE-AWARE DATABASE RLS MATRIX TEST SUITE
 * 
 * Tests the PostgreSQL Row Level Security role policies created in:
 * `supabase/migrations/20261102010000_role_aware_policies.sql`
 * 
 * Verifies:
 * 1. Static AST inspection of role policies and column privileges.
 * 2. Helper functions `auth_staff_role()` and `auth_has_role(...)` definitions.
 * 3. Column privilege revocation on `public.hotels` (plan, status, etc. protected).
 * 4. Finance tables strictly inaccessible to Housekeeping and Reception.
 * 5. Reservations, folios, charges protected against Housekeeping writes.
 * 6. Audit logs immutable (no client update/delete).
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const MIGRATION_PATH = path.join(ROOT_DIR, 'supabase', 'migrations', '20261102010000_role_aware_policies.sql');

async function runRoleMatrixSuite() {
  console.log('='.repeat(80));
  console.log(' HOTEL MANTRI — N2: ROLE-AWARE DATABASE RLS MATRIX TEST SUITE');
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
  console.log('\n--- Criterion 1: Static Migration Audit for 20261102010000_role_aware_policies.sql ---');

  test('Migration file exists', () => {
    assert(fs.existsSync(MIGRATION_PATH), 'Migration file exists on disk');
  });

  const content = fs.readFileSync(MIGRATION_PATH, 'utf8');

  test('Defines auth_staff_role() with SECURITY DEFINER and pinned search_path', () => {
    assert(content.includes('CREATE OR REPLACE FUNCTION public.auth_staff_role()'), 'Defines auth_staff_role');
    assert(content.includes('SET search_path = public, pg_temp'), 'Pins search_path');
    assert(content.includes("status = 'Active'"), 'Enforces Active status check');
  });

  test('Defines auth_has_role(VARIADIC roles text[]) helper', () => {
    assert(content.includes('CREATE OR REPLACE FUNCTION public.auth_has_role'), 'Defines auth_has_role');
    assert(content.includes('is_super_admin()'), 'Bypasses check for super admin');
    assert(content.includes('ANY(roles)'), 'Checks role membership');
  });

  test('Revokes full table UPDATE on hotels from authenticated', () => {
    assert(content.includes('REVOKE UPDATE ON public.hotels FROM authenticated;'), 'Revokes full UPDATE');
  });

  test('Grants UPDATE on hotels strictly on allowlisted non-sensitive columns', () => {
    assert(
      content.includes('GRANT UPDATE (hotel_name, city, state, address, phone, website) ON public.hotels TO authenticated;'),
      'Grants strictly allowlisted columns'
    );
    assert(!content.includes('GRANT UPDATE (plan'), 'Does NOT grant plan update');
    assert(!content.includes('GRANT UPDATE (subscription_status'), 'Does NOT grant subscription_status update');
    assert(!content.includes('GRANT UPDATE (admin_email'), 'Does NOT grant admin_email update');
  });

  test('Restricts hotels UPDATE policy to hotel_admin and manager', () => {
    assert(content.includes("auth_has_role('hotel_admin', 'manager')"), 'Requires hotel_admin or manager');
  });

  test('Audit logs allows INSERT but strictly forbids UPDATE, DELETE, TRUNCATE', () => {
    assert(content.includes('REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM authenticated, anon;'), 'Revokes mutation privileges');
    assert(!content.includes('CREATE POLICY "tenant_update_audit_logs"'), 'Does not create update policy on audit_logs');
    assert(!content.includes('CREATE POLICY "tenant_delete_audit_logs"'), 'Does not create delete policy on audit_logs');
  });

  test('Finance tables protected from Housekeeping & Reception', () => {
    const finTables = ['chart_of_accounts', 'journal_entries', 'journal_lines', 'vouchers', 'vendors'];
    for (const t of finTables) {
      assert(content.includes(t), `Covers finance table ${t}`);
    }
    assert(
      content.includes("auth_has_role(''hotel_admin'', ''manager'', ''accounts'')") ||
      content.includes("auth_has_role('hotel_admin', 'manager', 'accounts')"),
      'Allows only accounts/admin/manager on finance'
    );
  });

  test('Reservations, folios, charges write-denied to Housekeeping', () => {
    assert(
      content.includes("auth_has_role(''hotel_admin'', ''manager'', ''reception'', ''accounts'')") ||
      content.includes("auth_has_role('hotel_admin', 'manager', 'reception', 'accounts')"),
      'Reservations write restricted'
    );
  });

  test('Housekeeping tasks allows housekeeping staff only on assigned tasks', () => {
    assert(content.includes("auth_has_role('housekeeping') AND (assigned_to = auth.uid() OR assigned_to IS NULL)"), 'Granular housekeeping task policy');
  });

  // --- CRITERION 2: Documentation in SECURITY_DECISIONS.md ---
  console.log('\n--- Criterion 2: Audit SECURITY_DECISIONS.md Documentation ---');

  const secDecPath = path.join(ROOT_DIR, 'SECURITY_DECISIONS.md');
  const secDec = fs.existsSync(secDecPath) ? fs.readFileSync(secDecPath, 'utf8') : '';

  test('SECURITY_DECISIONS.md exists and documents role classification', () => {
    assert(secDec.includes('Table Classification') || secDec.includes('Role-Aware') || secDec.includes('N2'), 'Documents role matrix');
  });

  console.log('\n' + '='.repeat(80));
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('='.repeat(80));

  if (failed > 0) process.exit(1);
}

runRoleMatrixSuite().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
