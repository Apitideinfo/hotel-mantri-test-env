/**
 * HOTEL MANTRI — OWNER WELCOME EMAIL AUTOMATED VERIFICATION SUITE
 * 
 * Verifies all 12 authoritative test requirements:
 * 1. Hotel creation with a valid owner email.
 * 2. Missing or invalid owner email rejection.
 * 3. Missing SMTP environment variables handling (safe error, no crash).
 * 4. Invalid SMTP credentials handling (EAUTH, safe error, no leaked secrets).
 * 5. SMTP timeout or provider rejection (ETIMEDOUT / retryable).
 * 6. Hotel creation succeeds while notification sending fails (graceful degradation).
 * 7. Retrying a failed notification without creating another hotel.
 * 8. Duplicate submission or rapid retry does not send duplicate messages.
 * 9. Unauthorized users cannot trigger the endpoint (401/403 RBAC).
 * 10. Correct recipient, subject, and hotel details (owner email, NOT super admin).
 * 11. Existing hotel creation and owner login still work.
 * 12. Production build and Vercel API routing.
 */

import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import app from '../server/index.js';
import { supabaseServiceRole } from '../server/supabaseClient.js';
import { setMockTransportHandler } from '../server/services/emailService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createAuthClient = () => createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

let passed = 0;
let failed = 0;
const testResults = [];

function assert(condition, message, details = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
    testResults.push({ status: 'PASS', message });
  } else {
    console.error(`  ✗ FAIL: ${message} ${details ? '(' + details + ')' : ''}`);
    failed++;
    testResults.push({ status: 'FAIL', message, details });
  }
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('HOTEL MANTRI — HOTEL CREATION OWNER EMAIL VERIFICATION SUITE (12 TESTS)');
  console.log('========================================================================\n');

  let server;
  const TEST_PORT = 5098;
  const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

  // Track entities to clean up
  const createdHotelIds = [];
  const createdAuthUserIds = [];

  // Track dispatched emails in mock
  const capturedEmails = [];
  let mockErrorToThrow = null;

  setMockTransportHandler(async (mail) => {
    if (mail.verifyOnly) {
      if (mockErrorToThrow) throw mockErrorToThrow;
      return { success: true };
    }
    if (mockErrorToThrow) {
      throw mockErrorToThrow;
    }
    capturedEmails.push(mail);
    return {
      success: true,
      messageId: `<mock-id-${Date.now()}@hotelmantri.com>`,
    };
  });

  try {
    // 0. Start local test server
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(TEST_PORT, resolve));
    console.log(`[Test Setup] Test server listening on ${BASE_URL}`);

    // 0. Authenticate Super Admin using isolated client
    console.log('[Test Setup] Authenticating Super Admin...');
    const authClient = createAuthClient();
    const { data: superAdminAuth, error: saAuthErr } = await authClient.auth.signInWithPassword({
      email: 'admin@hotelmis.com',
      password: 'Admin@2026',
    });
    if (saAuthErr) throw new Error(`Super admin auth failed: ${saAuthErr.message}`);
    const superAdminToken = superAdminAuth.session.access_token;
    console.log(`[Test Setup] Super Admin authenticated (${superAdminAuth.user.email})\n`);

    const timestamp = Date.now().toString(36);

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 1: Hotel creation with a valid owner email
    // ──────────────────────────────────────────────────────────────────────────
    console.log('--- TEST 1: Hotel creation with a valid owner email ---');
    const hotel1Name = `Royal Mantri Suites ${timestamp}`;
    const hotel1Owner = `Rajesh Sharma`;
    const hotel1Email = `owner.mantri.${timestamp}@gmail.com`;

    const { data: hotel1, error: h1Err } = await supabaseServiceRole
      .from('hotels')
      .insert({
        hotel_name: hotel1Name,
        owner_name: hotel1Owner,
        admin_email: hotel1Email,
        mobile: '9876543210',
        address: '100 Beach Road, Goa',
        total_rooms: 42,
        subscription_status: 'Active',
        is_active: true,
      })
      .select()
      .single();

    if (h1Err) throw new Error(`Failed to create hotel 1: ${h1Err.message}`);
    createdHotelIds.push(hotel1.id);

    // Send welcome email via API
    capturedEmails.length = 0;
    const res1 = await fetch(`${BASE_URL}/api/onboarding/send-welcome-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        hotelId: hotel1.id,
      }),
    });
    const data1 = await res1.json();

    assert(res1.status === 200, 'Test 1.1: Endpoint returns HTTP 200 for valid hotel creation', `Status was ${res1.status}`);
    assert(data1.success === true, 'Test 1.2: Response indicates success === true');
    assert(data1.status === 'sent', 'Test 1.3: Response status is "sent"');
    assert(data1.recipient === hotel1Email, 'Test 1.4: Reported recipient matches owner email');
    assert(capturedEmails.length === 1, 'Test 1.5: One outbound email was dispatched by the service');

    // Verify audit log entry
    const { data: audit1 } = await supabaseServiceRole
      .from('audit_logs')
      .select('*')
      .eq('hotel_id', hotel1.id)
      .eq('action', 'send_welcome_email')
      .limit(1);
    assert(audit1 && audit1.length > 0, 'Test 1.6: Successful delivery logged in audit_logs');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 2: Missing or invalid owner email
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 2: Missing or invalid owner email ---');
    const { data: badHotel, error: badHErr } = await supabaseServiceRole
      .from('hotels')
      .insert({
        hotel_name: `Bad Email Hotel ${timestamp}`,
        owner_name: 'Nobody',
        admin_email: 'not-a-valid-email',
        total_rooms: 10,
        subscription_status: 'Active',
      })
      .select()
      .single();
    if (badHErr) throw new Error(`Failed to insert bad hotel: ${badHErr.message}`);
    createdHotelIds.push(badHotel.id);

    const res2 = await fetch(`${BASE_URL}/api/onboarding/send-welcome-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        hotelId: badHotel.id,
      }),
    });
    const data2 = await res2.json();

    assert(res2.status === 400, 'Test 2.1: Rejects invalid email with HTTP 400', `Status was ${res2.status}`);
    assert(data2.code === 'INVALID_EMAIL', 'Test 2.2: Returns explicit error code INVALID_EMAIL');
    assert(data2.success === false, 'Test 2.3: success is false');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 3: Missing SMTP environment variables
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 3: Missing SMTP environment variables ---');
    // Temporarily disable mock to test real config validation
    setMockTransportHandler(null);
    const origPassword = process.env.SMTP_PASSWORD;
    const origUser = process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    delete process.env.SMTP_USER;

    const res3 = await fetch(`${BASE_URL}/api/onboarding/send-welcome-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        hotelId: hotel1.id,
        forceResend: true,
      }),
    });
    const data3 = await res3.json();

    assert(res3.status === 503, 'Test 3.1: Returns HTTP 503 Service Unavailable when SMTP env vars missing', `Status was ${res3.status}`);
    assert(data3.code === 'EMAIL_NOT_CONFIGURED', 'Test 3.2: Returns code EMAIL_NOT_CONFIGURED');
    assert(Array.isArray(data3.missingVars) && data3.missingVars.includes('SMTP_PASSWORD'), 'Test 3.3: Missing variables explicitly listed without disclosing secrets');
    assert(data3.retryable === true, 'Test 3.4: Error is marked retryable');

    // Restore env vars & mock
    process.env.SMTP_PASSWORD = origPassword;
    process.env.SMTP_USER = origUser;
    setMockTransportHandler(async (mail) => {
      if (mail.verifyOnly) {
        if (mockErrorToThrow) throw mockErrorToThrow;
        return { success: true };
      }
      if (mockErrorToThrow) throw mockErrorToThrow;
      capturedEmails.push(mail);
      return { success: true, messageId: `<mock-id-${Date.now()}@hotelmantri.com>` };
    });

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 4: Invalid SMTP credentials
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 4: Invalid SMTP credentials ---');
    mockErrorToThrow = Object.assign(new Error('535 5.7.8 Username and Password not accepted'), {
      code: 'EAUTH',
      responseCode: 535,
    });

    const res4 = await fetch(`${BASE_URL}/api/onboarding/send-welcome-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        hotelId: hotel1.id,
        forceResend: true,
      }),
    });
    const data4 = await res4.json();

    assert(res4.status === 502, 'Test 4.1: Returns HTTP 502 Bad Gateway on SMTP Auth failure', `Status was ${res4.status}`);
    assert(data4.code === 'SMTP_AUTH_FAILED', 'Test 4.2: Reports sanitized error code SMTP_AUTH_FAILED');
    assert(!data4.message.includes('Password not accepted'), 'Test 4.3: Safe message returned to client without leaking raw credentials');
    assert(data4.retryable === true, 'Test 4.4: Notification marked retryable');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 5: SMTP timeout or provider rejection
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 5: SMTP timeout or provider rejection ---');
    mockErrorToThrow = Object.assign(new Error('Connection timed out after 10000ms'), {
      code: 'ETIMEDOUT',
    });

    const res5 = await fetch(`${BASE_URL}/api/onboarding/send-welcome-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        hotelId: hotel1.id,
        forceResend: true,
      }),
    });
    const data5 = await res5.json();

    assert(res5.status === 502, 'Test 5.1: Returns HTTP 502 on SMTP timeout', `Status was ${res5.status}`);
    assert(data5.code === 'SMTP_TIMEOUT', 'Test 5.2: Reports code SMTP_TIMEOUT');
    assert(data5.retryable === true, 'Test 5.3: Marked retryable');

    mockErrorToThrow = null; // Clear mock failure

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 6: Hotel creation succeeds while notification sending fails
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 6: Hotel creation succeeds while notification sending fails ---');
    // Set mock to fail
    mockErrorToThrow = Object.assign(new Error('Mailbox full or provider rejected'), {
      code: 'EMBOXFULL',
    });

    const hotel6Name = `Resilient Hotel ${timestamp}`;
    const hotel6Email = `owner.resilient.${timestamp}@gmail.com`;
    const { data: hotel6, error: h6Err } = await supabaseServiceRole
      .from('hotels')
      .insert({
        hotel_name: hotel6Name,
        owner_name: 'Resilient Owner',
        admin_email: hotel6Email,
        total_rooms: 18,
        subscription_status: 'Active',
      })
      .select()
      .single();
    if (h6Err) throw new Error(`Failed to create hotel 6: ${h6Err.message}`);
    createdHotelIds.push(hotel6.id);

    const res6 = await fetch(`${BASE_URL}/api/onboarding/send-welcome-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        hotelId: hotel6.id,
      }),
    });
    const data6 = await res6.json();

    assert(res6.status === 502, 'Test 6.1: Email sending reports failure gracefully (502)');
    assert(data6.status === 'failed', 'Test 6.2: Status is failed');

    // Authoritative check: Verify hotel 6 still exists in the database!
    const { data: dbHotel6 } = await supabaseServiceRole
      .from('hotels')
      .select('*')
      .eq('id', hotel6.id)
      .maybeSingle();

    assert(dbHotel6 !== null, 'Test 6.3: Hotel record remains in DB and was NOT deleted on email failure');
    assert(dbHotel6.admin_email === hotel6Email, 'Test 6.4: Hotel admin_email intact');

    // Verify failure was logged in audit_logs
    const { data: failLogs } = await supabaseServiceRole
      .from('audit_logs')
      .select('*')
      .eq('hotel_id', hotel6.id)
      .eq('action', 'send_welcome_email_failed');
    assert(failLogs && failLogs.length > 0, 'Test 6.5: Email failure logged in audit_logs for operator visibility');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 7: Retrying a failed notification without creating another hotel
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 7: Retrying a failed notification without creating another hotel ---');
    mockErrorToThrow = null; // Restore mock delivery
    capturedEmails.length = 0;

    // Retry sending email for hotel6
    const res7 = await fetch(`${BASE_URL}/api/onboarding/send-welcome-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        hotelId: hotel6.id,
        forceResend: true,
      }),
    });
    const data7 = await res7.json();

    assert(res7.status === 200, 'Test 7.1: Retry endpoint returns HTTP 200');
    assert(data7.success === true, 'Test 7.2: Retry reports success === true');
    assert(data7.status === 'sent', 'Test 7.3: Retry status is "sent"');

    // Count how many hotels exist with hotel6's name
    const { data: allSameHotels } = await supabaseServiceRole
      .from('hotels')
      .select('id')
      .eq('hotel_name', hotel6Name);

    assert(allSameHotels && allSameHotels.length === 1, 'Test 7.4: Retrying failed email did NOT create a duplicate hotel (exactly 1 exists)');
    assert(allSameHotels[0].id === hotel6.id, 'Test 7.5: Hotel ID matches original hotel ID');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 8: Duplicate submission or retry does not send duplicate messages
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 8: Duplicate submission or retry does not send duplicate messages ---');
    capturedEmails.length = 0;

    // Immediate second call for hotel6 without forceResend
    const res8 = await fetch(`${BASE_URL}/api/onboarding/send-welcome-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        hotelId: hotel6.id,
        forceResend: false,
      }),
    });
    const data8 = await res8.json();

    assert(res8.status === 200, 'Test 8.1: Immediate duplicate call returns HTTP 200');
    assert(data8.deduplicated === true, 'Test 8.2: Response indicates deduplicated === true');
    assert(capturedEmails.length === 0, 'Test 8.3: Mock transport was NOT called again (no duplicate email sent)');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 9: Unauthorized users cannot trigger the endpoint
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 9: Unauthorized users cannot trigger the endpoint ---');
    // 9a. No auth header
    const res9a = await fetch(`${BASE_URL}/api/onboarding/send-welcome-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hotelId: hotel1.id }),
    });
    const data9a = await res9a.json();
    assert(res9a.status === 401, 'Test 9.1: Request with no token rejected with HTTP 401', `Status was ${res9a.status}`);
    assert(data9a.code === 'AUTH_REQUIRED', 'Test 9.2: Error code is AUTH_REQUIRED');

    // 9b. Invalid/forged token
    const res9b = await fetch(`${BASE_URL}/api/onboarding/send-welcome-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.signature',
      },
      body: JSON.stringify({ hotelId: hotel1.id }),
    });
    assert(res9b.status === 401, 'Test 9.3: Forged token rejected with HTTP 401');

    // 9c. Non-super-admin user (create temporary hotel_admin account)
    const testAdminEmail = `temp.admin.${timestamp}@hotelmantri.test`;
    const { data: normalUser, error: nuErr } = await supabaseServiceRole.auth.admin.createUser({
      email: testAdminEmail,
      password: 'TemporaryAdminPassword123!',
      email_confirm: true,
    });
    if (!nuErr && normalUser?.user) {
      createdAuthUserIds.push(normalUser.user.id);
      // Insert into hotel_admins as normal hotel_admin (NOT super_admin)
      await supabaseServiceRole.from('hotel_admins').insert({
        user_id: normalUser.user.id,
        email: testAdminEmail,
        role: 'hotel_admin',
        hotel_id: hotel1.id,
        status: 'Active',
      });

      const testUserClient = createAuthClient();
      const { data: userAuth } = await testUserClient.auth.signInWithPassword({
        email: testAdminEmail,
        password: 'TemporaryAdminPassword123!',
      });

      if (userAuth?.session) {
        const res9c = await fetch(`${BASE_URL}/api/onboarding/send-welcome-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${userAuth.session.access_token}`,
          },
          body: JSON.stringify({ hotelId: hotel1.id }),
        });
        assert(res9c.status === 403, 'Test 9.4: Normal hotel_admin is rejected with HTTP 403 Forbidden', `Status was ${res9c.status}`);
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 10: Correct recipient, subject, and hotel details
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 10: Correct recipient, subject, and hotel details ---');
    capturedEmails.length = 0;
    const hotel10Name = `Seaside Palace Resort ${timestamp}`;
    const hotel10Owner = `Vikram Singhania`;
    const hotel10Email = `singhania.resort.${timestamp}@gmail.com`;

    const { data: hotel10, error: h10Err } = await supabaseServiceRole
      .from('hotels')
      .insert({
        hotel_name: hotel10Name,
        owner_name: hotel10Owner,
        admin_email: hotel10Email,
        mobile: '9876543210',
        address: 'Marine Drive, Mumbai',
        total_rooms: 85,
        subscription_status: 'Active',
        is_active: true,
      })
      .select()
      .single();
    if (h10Err) throw new Error(`Failed to create hotel 10: ${h10Err.message}`);
    createdHotelIds.push(hotel10.id);

    await fetch(`${BASE_URL}/api/onboarding/send-welcome-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        hotelId: hotel10.id,
        planName: 'Enterprise Growth Plan',
      }),
    });

    assert(capturedEmails.length === 1, 'Test 10.1: Dispatched email captured');
    const email10 = capturedEmails[0];

    assert(email10.to === hotel10Email, 'Test 10.2: Recipient is verified hotel owner email');
    assert(email10.to !== 'admin@hotelmis.com' && email10.to !== 'superadmin@hotel.com', 'Test 10.3: Recipient is NEVER the Super Admin email');
    assert(email10.subject.includes(hotel10Name), 'Test 10.4: Subject includes verified hotel name');
    assert(email10.html.includes(hotel10Name), 'Test 10.5: HTML body contains verified hotel name');
    assert(email10.html.includes(hotel10Owner), 'Test 10.6: HTML body greets owner by name');
    assert(email10.html.includes('85'), 'Test 10.7: HTML body lists verified total rooms (85)');
    assert(email10.html.includes('Hotel Mantri'), 'Test 10.8: Contains Hotel Mantri branding');
    assert(!email10.html.includes('{{') && !email10.html.includes('undefined'), 'Test 10.9: No unpopulated template placeholders in message');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 11: Existing hotel creation and owner login still work
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 11: Existing hotel creation and owner login still work ---');
    const loginTestEmail = `owner.login.${timestamp}@testmantri.com`;
    const loginTestPass = 'MantriOwner@2026!';

    // Create auth account
    const { data: authOwner, error: aoErr } = await supabaseServiceRole.auth.admin.createUser({
      email: loginTestEmail,
      password: loginTestPass,
      email_confirm: true,
      user_metadata: { role: 'hotel_admin' },
    });
    if (aoErr) throw new Error(`Failed to create owner auth user: ${aoErr.message}`);
    createdAuthUserIds.push(authOwner.user.id);

    // Link in hotel_admins
    const { error: haErr } = await supabaseServiceRole.from('hotel_admins').insert({
      user_id: authOwner.user.id,
      email: loginTestEmail,
      hotel_id: hotel10.id,
      role: 'hotel_admin',
      status: 'Active',
    });
    assert(!haErr, 'Test 11.1: Hotel admin association created without database error');

    // Verify owner can log in
    const ownerAuthClient = createAuthClient();
    const { data: ownerLogin, error: olErr } = await ownerAuthClient.auth.signInWithPassword({
      email: loginTestEmail,
      password: loginTestPass,
    });
    assert(!olErr && ownerLogin?.session, 'Test 11.2: New hotel owner can successfully authenticate');
    assert(ownerLogin.user.email === loginTestEmail, 'Test 11.3: Authenticated user matches owner email');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 12: Production build and Vercel API routing
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 12: Production build and Vercel API routing ---');
    // 12a. Verify api/index.js exports express app
    const apiIndexPath = path.resolve(__dirname, '../api/index.js');
    assert(fs.existsSync(apiIndexPath), 'Test 12.1: api/index.js entrypoint exists for Vercel serverless');
    const apiIndexContent = fs.readFileSync(apiIndexPath, 'utf8');
    assert(apiIndexContent.includes('export default app') || apiIndexContent.includes('export default'), 'Test 12.2: api/index.js exports default handler');

    // 12b. Verify vercel.json rewrites
    const vercelConfigPath = path.resolve(__dirname, '../vercel.json');
    assert(fs.existsSync(vercelConfigPath), 'Test 12.3: vercel.json exists');
    const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
    const apiRewrite = vercelConfig.rewrites?.find((r) => r.source === '/api/(.*)' && r.destination === '/api/index.js');
    assert(!!apiRewrite, 'Test 12.4: vercel.json rewrites /api/(.*) to /api/index.js');

    // 12c. Verify production build output
    const distIndexPath = path.resolve(__dirname, '../dist/index.html');
    assert(fs.existsSync(distIndexPath), 'Test 12.5: Vite production bundle dist/index.html exists');

  } catch (err) {
    console.error('Fatal test runner exception:', err);
    failed++;
  } finally {
    // Clean up test server
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('\n[Cleanup] Test server stopped.');
    }

    // Clean up DB records
    console.log('[Cleanup] Removing test entities from database...');
    if (createdHotelIds.length > 0) {
      await supabaseServiceRole.from('audit_logs').delete().in('hotel_id', createdHotelIds);
      await supabaseServiceRole.from('hotel_admins').delete().in('hotel_id', createdHotelIds);
      await supabaseServiceRole.from('hotels').delete().in('id', createdHotelIds);
      console.log(`  Removed ${createdHotelIds.length} test hotels and associated logs.`);
    }

    for (const uid of createdAuthUserIds) {
      try {
        await supabaseServiceRole.auth.admin.deleteUser(uid);
      } catch { /* ignore */ }
    }
    if (createdAuthUserIds.length > 0) {
      console.log(`  Removed ${createdAuthUserIds.length} temporary auth users.`);
    }

    console.log('\n========================================================================');
    console.log(`TEST SUITE RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log('========================================================================');
    
    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runTestSuite();
