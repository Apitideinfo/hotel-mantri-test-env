import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import express from 'express';
import request from 'http';
import app from '../server/index.js';
import { supabaseServiceRole, ensureAuth } from '../server/supabaseClient.js';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const TEST_HOTEL_ID = 'aa5bfd36-de50-4217-8997-d2cd18e4dfe8'; // Hotel Swagat (Active registered hotel)

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

async function runTest() {
  console.log('\n===============================================================');
  console.log('HOTEL MANTRI — HOUSEKEEPING RBAC & SECURITY VERIFICATION SUITE');
  console.log('===============================================================\n');

  // Start internal test server
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test API server listening on ${baseUrl}`);

  await ensureAuth();

  // Create temporary Housekeeping test user
  const testEmail = `hk_audit_${Date.now()}@hotel.hotelmantri.internal`;
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Creating test housekeeping user: ${testEmail}...`);
  const { data: signUpData, error: signUpErr } = await anonClient.auth.signUp({
    email: testEmail,
    password: 'Password123!',
    options: {
      data: {
        full_name: 'Audit Housekeeper',
        mobile: '9998887776',
        username: 'audit_hk',
        role: 'housekeeping',
        assigned_floor: '1st',
        shift: 'Morning',
        can_laundry: false,
        can_maintenance: true,
        can_approve_inspection: false,
        hotel_id: TEST_HOTEL_ID,
      },
    },
  });

  if (signUpErr || !signUpData.user) {
    throw new Error(`Failed to create test housekeeping user: ${signUpErr?.message}`);
  }
  const hkUserId = signUpData.user.id;

  // Set authoritative role & permissions in app_metadata (C2 compliance)
  await supabaseServiceRole.auth.admin.updateUserById(hkUserId, {
    app_metadata: {
      role: 'housekeeping',
      permissions: {
        canLaundry: false,
        canMaintenance: true,
        canApproveInspection: false,
        assignedFloor: '1st',
        shift: 'Morning',
      },
    },
  });

  // Insert into hotel_admins with role 'hotel_staff'
  const { error: adminErr } = await supabaseServiceRole
    .from('hotel_admins')
    .upsert({
      user_id: hkUserId,
      hotel_id: TEST_HOTEL_ID,
      role: 'hotel_staff',
      email: testEmail,
      status: 'Active',
    });
  if (adminErr) throw adminErr;

  // Sign in as housekeeping user to get valid token
  const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: testEmail,
    password: 'Password123!',
  });
  if (signInErr || !signInData.session) throw signInErr;
  const hkToken = signInData.session.access_token;
  console.log('Housekeeping test user signed in. Access token acquired.\n');

  // Helper function to make HTTP requests
  const apiCall = async (endpoint, options = {}) => {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${hkToken}`,
        'x-hotel-id': TEST_HOTEL_ID,
        ...options.headers,
      },
    });
    let body = null;
    try {
      body = await res.json();
    } catch {}
    return { status: res.status, body };
  };

  let createdMaintenanceIssueId = null;

  try {
    // 1. Housekeeping CANNOT access Reservations
    console.log('Checking Reservations Module Access Control...');
    const resReservations = await apiCall('/api/reservations');
    assert(resReservations.status === 403, 'GET /api/reservations returns 403 Forbidden for Housekeeping');
    assert(resReservations.body?.code === 'ROLE_FORBIDDEN', 'Error code is ROLE_FORBIDDEN');

    // 2. Housekeeping CANNOT access Channel Manager
    console.log('\nChecking Channel Manager Access Control...');
    const resChannels = await apiCall('/api/channels');
    assert(resChannels.status === 403, 'GET /api/channels returns 403 Forbidden for Housekeeping');
    assert(resChannels.body?.code === 'ROLE_FORBIDDEN', 'Error code is ROLE_FORBIDDEN');

    // 3. Housekeeping CANNOT access Aiosell Integration
    console.log('\nChecking Aiosell Access Control...');
    const resAiosell = await apiCall('/api/aiosell/sync-status');
    assert(resAiosell.status === 403, 'GET /api/aiosell/sync-status returns 403 Forbidden for Housekeeping');

    // 4. Housekeeping CANNOT access Revenue Autopilot / Accounting
    console.log('\nChecking Revenue / Finance Access Control...');
    const resRevenue = await apiCall('/api/revenue/day-wise');
    assert(resRevenue.status === 403, 'GET /api/revenue/day-wise returns 403 Forbidden for Housekeeping');

    // 5. Housekeeping CANNOT access Sensitive Notification / Daily Reports
    console.log('\nChecking Reports / Notifications Access Control...');
    const resReports = await apiCall('/api/notifications/whatsapp/summary');
    assert(resReports.status === 403, 'GET /api/notifications/whatsapp/summary returns 403 Forbidden for Housekeeping');

    // 6. Housekeeping CANNOT access User Management
    console.log('\nChecking User Management Access Control...');
    const resUsers = await apiCall('/api/users');
    assert(resUsers.status === 403, 'GET /api/users returns 403 Forbidden for Housekeeping');

    // 7. Housekeeping CANNOT access Laundry when can_laundry = false
    console.log('\nChecking Laundry & Linen Permission Access Control...');
    const resLaundry = await apiCall('/api/laundry/dashboard');
    assert(resLaundry.status === 403, 'GET /api/laundry/dashboard returns 403 Forbidden when laundry permission disabled');
    assert(resLaundry.body?.code === 'LAUNDRY_PERMISSION_REQUIRED', 'Error code is LAUNDRY_PERMISSION_REQUIRED');

    // 8. Housekeeping CAN access Housekeeping Rooms
    console.log('\nChecking Housekeeping Authorized Endpoints...');
    const resHkRooms = await apiCall('/api/housekeeping/rooms');
    assert(resHkRooms.status === 200, 'GET /api/housekeeping/rooms returns 200 OK');
    assert(Array.isArray(resHkRooms.body?.rooms), 'Returns valid rooms array');

    // Verify rooms response contains NO room rates or guest financial data
    const firstRoom = resHkRooms.body?.rooms?.[0];
    assert(firstRoom !== undefined, 'At least one room is returned');
    assert(firstRoom?.room_rate === undefined, 'Room rates are stripped from housekeeping response');
    assert(firstRoom?.total_amount === undefined, 'Financial billing data is omitted');

    // 9. Housekeeping can perform cleaning workflow transitions
    const testRoomNo = firstRoom?.room_no || '101';
    console.log(`\nTesting Room Cleaning Workflow on Room ${testRoomNo}...`);

    // Start Cleaning
    const resStart = await apiCall('/api/housekeeping/start-cleaning', {
      method: 'POST',
      body: JSON.stringify({ roomNo: testRoomNo }),
    });
    assert(resStart.status === 200, 'POST /api/housekeeping/start-cleaning returns 200 OK');
    assert(resStart.body?.status === 'Cleaning In Progress', 'Room moves to "Cleaning In Progress"');

    // Mark Cleaning Complete
    const resComplete = await apiCall('/api/housekeeping/complete-cleaning', {
      method: 'POST',
      body: JSON.stringify({ roomNo: testRoomNo, notes: 'Bed made, bathroom sanitized' }),
    });
    assert(resComplete.status === 200, 'POST /api/housekeeping/complete-cleaning returns 200 OK');
    assert(resComplete.body?.status === 'Ready for Inspection', 'Room moves to "Ready for Inspection"');

    // Standard housekeeper CANNOT approve inspection without permission
    const resApproveUnauthorized = await apiCall('/api/housekeeping/approve-inspection', {
      method: 'POST',
      body: JSON.stringify({ roomNo: testRoomNo }),
    });
    assert(resApproveUnauthorized.status === 403, 'Approve inspection rejected for staff without approval permission');

    // Housekeeper can update priority and note
    const resPriority = await apiCall('/api/housekeeping/priority', {
      method: 'POST',
      body: JSON.stringify({ roomNo: testRoomNo, priority: 'Urgent Arrival' }),
    });
    assert(resPriority.status === 200, 'Housekeeper can update cleaning priority to "Urgent Arrival"');

    const resNote = await apiCall('/api/housekeeping/note', {
      method: 'POST',
      body: JSON.stringify({ roomNo: testRoomNo, note: 'Extra towels placed in wardrobe' }),
    });
    assert(resNote.status === 200, 'Housekeeper can add housekeeping note');

    // Housekeeper can report maintenance issue
    const resMaint = await apiCall('/api/housekeeping/maintenance', {
      method: 'POST',
      body: JSON.stringify({
        roomNo: testRoomNo,
        issueCategory: 'Plumbing',
        description: 'Bathroom faucet dripping',
        priority: 'medium',
      }),
    });
    createdMaintenanceIssueId = resMaint.body?.issue?.id;
    assert(resMaint.status === 201, 'Housekeeper can report maintenance issue');
    assert(resMaint.body?.issue?.id !== undefined, 'Maintenance issue created with ID');

    // Reset room back to Vacant Clean
    await supabaseServiceRole.from('rooms').update({
      housekeeping_status: 'Vacant Clean',
      cleaning_priority: 'Normal',
      housekeeping_note: '',
    }).eq('hotel_id', TEST_HOTEL_ID).eq('room_no', testRoomNo);

  } finally {
    // Clean up
    console.log('\nCleaning up test user, test maintenance records, and closing server...');
    try {
      if (createdMaintenanceIssueId) {
        await supabaseServiceRole.from('maintenance_issues').delete().eq('id', createdMaintenanceIssueId);
      }
      await supabaseServiceRole.from('hotel_admins').delete().eq('user_id', hkUserId);
      await supabaseServiceRole.from('housekeeping_staff').delete().eq('name', 'Audit Housekeeper');
      await supabaseServiceRole.auth.admin.deleteUser(hkUserId);
    } catch (cleanupErr) {
      console.warn('  ⚠️ Note: housekeeping cleanup warning:', cleanupErr?.message);
    }
    server.close();
  }

  console.log(`\n===============================================================`);
  console.log(`RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log(`===============================================================\n`);

  if (failed > 0) process.exit(1);
}

runTest().catch((err) => {
  console.error('Fatal test suite failure:', err);
  process.exit(1);
});
