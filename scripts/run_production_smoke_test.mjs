/**
 * HOTEL MANTRI — PRODUCTION SMOKE TEST RUNNER
 * 
 * Executes non-destructive production and staging smoke tests:
 * 1. Supabase Gateway Connectivity & HTTPS Status
 * 2. Public Branding Endpoint (Safe Read-Only)
 * 3. Protected Tenant Tables RLS Denial (Fail-Closed)
 * 4. Hotel Admins Modification Prevention Trigger
 * 5. Private Storage Bucket Object List Denial
 * 6. Service Role Administrative Gateway Authorization
 * 
 * Outputs sanitized execution log to:
 * - security-evidence/logs/production-smoke-test.log
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase configuration in .env');
  process.exit(1);
}

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let logContent = '';
function log(msg) {
  console.log(msg);
  logContent += msg + '\n';
}

function sanitize(text) {
  if (!text) return '';
  let clean = text;
  for (const s of [SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY]) {
    if (s && s.length > 5) clean = clean.split(s).join('[REDACTED_KEY]');
  }
  return clean;
}

async function runSmokeTests() {
  const timestamp = new Date().toISOString();
  log('========================================================================');
  log('HOTEL MANTRI — PRODUCTION SMOKE TEST RUNNER');
  log(`Timestamp: ${timestamp}`);
  log(`Target Endpoint: ${SUPABASE_URL}`);
  log('Execution Scope: Non-Destructive Integrity & Gateway Verifications');
  log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(cond, name, details) {
    if (cond) {
      log(`  ✓ PASS: ${name} ${details ? `(${details})` : ''}`);
      passed++;
    } else {
      log(`  ✗ FAIL: ${name} ${details ? `(${details})` : ''}`);
      failed++;
    }
  }

  // 1. Supabase Gateway Root Reachability
  try {
    const res = await fetch(SUPABASE_URL);
    assert(res.status === 404 || res.status === 200, 'Supabase Edge Gateway Reachability', `HTTP ${res.status}`);
  } catch (e) {
    assert(false, 'Supabase Edge Gateway Reachability', e.message);
  }

  // 2. Public Branding View Probe (Safe Read-Only)
  try {
    const { data, error, status } = await anonClient
      .from('public_hotel_branding')
      .select('id, hotel_name, city, state, is_active')
      .limit(2);
    const isSafe = !error && Array.isArray(data);
    assert(isSafe, 'Public Branding View Availability (Anon)', `HTTP ${status}, returned ${data?.length || 0} hotels`);
  } catch (e) {
    assert(false, 'Public Branding View Availability (Anon)', e.message);
  }

  // 3. Sensitive Base Table Access Denial (RLS Lockdown)
  try {
    const { data, error, status } = await anonClient
      .from('hotels')
      .select('id, admin_email, owner_name, mobile')
      .limit(1);
    const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
    assert(isBlocked, 'Sensitive Base Table hotels Protected Against Anon', error ? `PostgreSQL ${error.code || error.message}` : '0 rows returned');
  } catch (e) {
    assert(false, 'Sensitive Base Table hotels Protected Against Anon', e.message);
  }

  // 4. Financial Records Access Denial
  try {
    const { data, error } = await anonClient
      .from('invoices')
      .select('*')
      .limit(1);
    const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
    assert(isBlocked, 'Financial Invoices Protected Against Anon', error ? `PostgreSQL ${error.code || error.message}` : '0 rows returned');
  } catch (e) {
    assert(false, 'Financial Invoices Protected Against Anon', e.message);
  }

  // 5. Hotel Admins Mutation Guard (Tamper Protection)
  try {
    const { error } = await anonClient
      .from('hotel_admins')
      .insert({ user_id: '00000000-0000-0000-0000-000000000000', role: 'super_admin' });
    assert(!!error, 'Hotel Admins Mutation Guard Blocks Anonymous Writes', error ? `PostgreSQL ${error.code || error.message}` : 'Unexpected success');
  } catch (e) {
    assert(false, 'Hotel Admins Mutation Guard Blocks Anonymous Writes', e.message);
  }

  // 6. Storage Bucket Privacy (hotel-documents)
  try {
    const { data, error } = await anonClient
      .storage
      .from('hotel-documents')
      .list();
    const isDenied = !!error || !data || data.length === 0;
    assert(isDenied, 'Private Storage Bucket hotel-documents Enforces Privacy', error ? error.message : '0 items returned');
  } catch (e) {
    assert(false, 'Private Storage Bucket hotel-documents Enforces Privacy', e.message);
  }

  // 7. Service Role Gateway Authorization (Backend Services)
  try {
    const { count, error } = await serviceClient
      .from('hotels')
      .select('*', { count: 'exact', head: true });
    assert(!error && count !== null, 'Service Role Backend Bypass Authorized', `Count: ${count} hotels`);
  } catch (e) {
    assert(false, 'Service Role Backend Bypass Authorized', e.message);
  }

  // 8. Auth Gateway Heartbeat Probe
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON_KEY }
    });
    assert(res.status === 200, 'Supabase Auth Gateway Heartbeat', `HTTP ${res.status}`);
  } catch (e) {
    assert(false, 'Supabase Auth Gateway Heartbeat', e.message);
  }

  log('\n========================================================================');
  log(`SMOKE TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  log('========================================================================\n');

  // Write log file
  const logDir = path.join(ROOT_DIR, 'security-evidence', 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, 'production-smoke-test.log');
  fs.writeFileSync(logPath, sanitize(logContent), 'utf8');
  console.log(`Saved smoke test log to: ${logPath}`);

  if (failed > 0) process.exit(1);
}

runSmokeTests().catch(err => {
  console.error('Smoke test fatal error:', err);
  process.exit(1);
});
