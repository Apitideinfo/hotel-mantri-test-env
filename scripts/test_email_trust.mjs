/**
 * HOTEL MANTRI — N4: EMAIL CONFIRMATION & AUTH_HOTEL_ID TRUST SUITE
 * 
 * Verifies:
 * 1. Migration 20261102030000_email_trust.sql removes email fallback.
 * 2. auto_confirm_user trigger dropped.
 * 3. auth_hotel_id() strictly relies on active hotel_admins records.
 * 4. Unconfirmed users cannot claim tenant context through admin_email.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const MIGRATION_PATH = path.join(ROOT_DIR, 'supabase', 'migrations', '20261102030000_email_trust.sql');

async function runEmailTrustSuite() {
  console.log('='.repeat(80));
  console.log(' HOTEL MANTRI — N4: EMAIL TRUST & AUTH_HOTEL_ID AUDIT');
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
  console.log('\n--- Criterion 1: Static Migration Audit for 20261102030000_email_trust.sql ---');

  test('Migration file exists', () => {
    assert(fs.existsSync(MIGRATION_PATH), 'Migration file exists on disk');
  });

  const content = fs.readFileSync(MIGRATION_PATH, 'utf8');

  test('Drops auto_confirm_user trigger', () => {
    assert(content.includes('DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;'), 'Drops trigger on auth.users');
    assert(content.includes('DROP FUNCTION IF EXISTS public.auto_confirm_user();'), 'Drops function');
  });

  test('Sanitizes sanitize_auth_user_tokens to not set email_confirmed_at', () => {
    assert(content.includes('CREATE OR REPLACE FUNCTION public.sanitize_auth_user_tokens'), 'Redefines sanitize_auth_user_tokens');
    assert(!content.includes('NEW.email_confirmed_at'), 'Does not auto-confirm email');
  });

  test('Redefines auth_hotel_id() with zero email fallback', () => {
    assert(content.includes('CREATE OR REPLACE FUNCTION public.auth_hotel_id()'), 'Redefines auth_hotel_id');
    const fnDefMatch = content.match(/CREATE OR REPLACE FUNCTION public\.auth_hotel_id\(\)[\s\S]*?\$\$;/);
    assert(fnDefMatch, 'Function definition found');
    const fnBody = fnDefMatch[0];
    assert(fnBody.includes('FROM public.hotel_admins'), 'Reads from hotel_admins');
    assert(fnBody.includes("status = 'Active'"), 'Requires Active status');
    assert(!fnBody.includes("auth.jwt()->>'email'"), 'Contains NO email fallback');
    assert(!fnBody.includes('admin_email'), 'Contains NO hotels.admin_email fallback in auth_hotel_id');
  });

  test('One-time bridge strictly requires confirmed email (u.email_confirmed_at IS NOT NULL)', () => {
    assert(content.includes('u.email_confirmed_at IS NOT NULL'), 'Requires confirmed email');
    assert(content.includes('lower(trim(h.admin_email)) = lower(trim(u.email))'), 'Requires exact normalized email match');
  });

  // --- CRITERION 2: Documentation in OWNER_MANUAL_STEPS.md ---
  console.log('\n--- Criterion 2: Owner Manual Steps Documentation ---');

  const manualPath = path.join(ROOT_DIR, 'OWNER_MANUAL_STEPS.md');
  const manual = fs.existsSync(manualPath) ? fs.readFileSync(manualPath, 'utf8') : '';

  test('OWNER_MANUAL_STEPS.md instructs on Supabase Auth settings', () => {
    assert(manual.includes('Auth') || manual.includes('Email') || manual.includes('N4'), 'Instructs on Supabase Auth');
  });

  console.log('\n' + '='.repeat(80));
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('='.repeat(80));

  if (failed > 0) process.exit(1);
}

runEmailTrustSuite().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
