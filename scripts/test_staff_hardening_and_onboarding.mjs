/**
 * HOTEL MANTRI — N5 & N7: STAFF ROLE HARDENING & ONBOARDING CREDENTIAL SAFETY
 * 
 * Verifies:
 * 1. staff_role default set to 'reception' (least-privilege) and NOT NULL.
 * 2. privileged_staff_review view created with security_invoker = on.
 * 3. hotel-onboarding sets staff_role: 'hotel_admin' explicitly on new owner.
 * 4. hotel-onboarding rejects existing auth email with 409 OWNER_EMAIL_EXISTS without password overwrite.
 * 5. setup-super-admin resets password strictly via recovery link generation.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const MIGRATION_PATH = path.join(ROOT_DIR, 'supabase', 'migrations', '20261102050000_staff_role_hardening.sql');
const ONBOARDING_PATH = path.join(ROOT_DIR, 'supabase', 'functions', 'hotel-onboarding', 'index.ts');
const SUPER_ADMIN_PATH = path.join(ROOT_DIR, 'supabase', 'functions', 'setup-super-admin', 'index.ts');

async function runHardeningSuite() {
  console.log('='.repeat(80));
  console.log(' HOTEL MANTRI — N5 & N7: STAFF ROLE HARDENING & CREDENTIAL SAFETY');
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

  // --- N5: Migration Audit ---
  console.log('\n--- N5: Staff Role Migration & Default Check ---');

  test('Migration 20261102050000_staff_role_hardening.sql exists', () => {
    assert(fs.existsSync(MIGRATION_PATH), 'Migration file exists on disk');
  });

  const migContent = fs.readFileSync(MIGRATION_PATH, 'utf8');

  test('Sets staff_role default to reception', () => {
    assert(migContent.includes("ALTER COLUMN staff_role SET DEFAULT 'reception'"), 'Sets default to reception');
  });

  test('Enforces staff_role NOT NULL', () => {
    assert(migContent.includes('ALTER COLUMN staff_role SET NOT NULL'), 'Sets NOT NULL');
  });

  test('Creates privileged_staff_review view with security_invoker = on', () => {
    assert(migContent.includes('privileged_staff_review'), 'Creates view');
    assert(migContent.includes('security_invoker = on') || migContent.includes('security_invoker = true'), 'Enforces security invoker');
  });

  test('Audit report script scripts/report_privileged_staff.mjs exists', () => {
    const rptPath = path.join(ROOT_DIR, 'scripts', 'report_privileged_staff.mjs');
    assert(fs.existsSync(rptPath), 'Report script exists');
  });

  // --- N7: Onboarding & Password Safety ---
  console.log('\n--- N7: Onboarding & Password Safety Check ---');

  const onbContent = fs.readFileSync(ONBOARDING_PATH, 'utf8');

  test('hotel-onboarding explicitly sets staff_role: "hotel_admin" on owner link', () => {
    assert(onbContent.includes('staff_role: "hotel_admin"'), 'Sets staff_role explicitly');
  });

  test('hotel-onboarding returns 409 OWNER_EMAIL_EXISTS and never overwrites password', () => {
    assert(onbContent.includes('OWNER_EMAIL_EXISTS'), 'Returns OWNER_EMAIL_EXISTS');
    assert(!onbContent.includes('adminClient.auth.admin.updateUserById(userId, {\n            password: body.password'), 'Does not update password');
  });

  const supContent = fs.readFileSync(SUPER_ADMIN_PATH, 'utf8');

  test('setup-super-admin resets password exclusively via recovery link', () => {
    assert(supContent.includes('type: "recovery"'), 'Generates recovery link');
    assert(!supContent.includes('updateUserById(existing.id, { password'), 'Does not directly overwrite password');
  });

  console.log('\n' + '='.repeat(80));
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('='.repeat(80));

  if (failed > 0) process.exit(1);
}

runHardeningSuite().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
