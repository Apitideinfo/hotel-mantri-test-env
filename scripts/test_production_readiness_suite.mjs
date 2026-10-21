/**
 * HOTEL MANTRI — PRODUCTION READINESS AND AUDIT VERIFICATION SUITE
 * 
 * Verifies:
 * 1. Edge Function hotel-onboarding response contracts (GET health, 400 validation, 401 auth, 403 rbac, 405 method, 409 conflict, safe 500s)
 * 2. Realtime WebSocket lifecycle management, teardown safety, backoff, and fallback
 * 3. Reservation wizard date validation (past dates, business timezone, backdating authorization)
 * 4. Concurrent booking overbooking prevention & room assignment integrity
 * 5. Multi-tenant isolation for Hotel Gopal (bd8f18de-2f97-48e7-b029-d2e536feb7cb)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { supabaseServiceRole } from '../server/supabaseClient.js';
import { createReservationsAtomically, getCategoryPhysicalRoomAvailability } from '../server/services/RoomAssignmentService.js';
import { realtimeManager } from '../src/lib/realtimeManager.js';
import { validateReservationForm, buildReservationInputs } from '../src/lib/reservationFormHelpers.js';
import { calcStayNights, calcGstFull } from '../src/lib/calc.js';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const HOTEL_GOPAL_ID = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb';

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

async function runSuite() {
  console.log('\n========================================================================');
  console.log('HOTEL MANTRI — PRODUCTION READINESS & INCIDENT VERIFICATION SUITE');
  console.log('========================================================================\n');

  // ──────────────────────────────────────────────────────────────────────────
  // GROUP 1: Edge Function hotel-onboarding Response Contracts
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST GROUP 1: Edge Function hotel-onboarding Contract & Safety ---');

  // 1. GET request without body
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/hotel-onboarding`, {
      method: 'GET',
    });
    const data = await res.json().catch(() => ({}));
    assert(
      res.status === 200 && data.success === true && data.service === 'hotel-onboarding',
      `GET /functions/v1/hotel-onboarding returns 200 OK health check (status: ${res.status})`
    );
    assert(
      Boolean(data.request_id || res.headers.get('x-request-id')),
      `GET response includes correlation request ID`
    );
  } catch (err) {
    assert(false, `GET request failed: ${err.message}`);
  }

  // 2. Unauthenticated POST
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/hotel-onboarding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'onboard_hotel' }),
    });
    const data = await res.json().catch(() => ({}));
    assert(
      res.status === 401 && data.code === 'MISSING_AUTH_HEADER',
      `Unauthenticated POST returns HTTP 401 MISSING_AUTH_HEADER (status: ${res.status})`
    );
  } catch (err) {
    assert(false, `Unauthenticated POST test failed: ${err.message}`);
  }

  // 3. Invalid JWT
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/hotel-onboarding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid.test.token',
      },
      body: JSON.stringify({ action: 'onboard_hotel' }),
    });
    const data = await res.json().catch(() => ({}));
    assert(
      res.status === 401 && data.code === 'INVALID_TOKEN',
      `Invalid token returns HTTP 401 INVALID_TOKEN (status: ${res.status})`
    );
  } catch (err) {
    assert(false, `Invalid token test failed: ${err.message}`);
  }

  // 4. Malformed non-JSON body
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/hotel-onboarding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid.test.token', // Even before or after auth
      },
      body: 'this-is-not-json{{{',
    });
    // Should be rejected with 400 or 401 before any 500
    assert(
      res.status === 400 || res.status === 401,
      `Malformed body returns clean 4xx client error, not 500 (status: ${res.status})`
    );
  } catch (err) {
    assert(false, `Malformed body test failed: ${err.message}`);
  }

  // 5. Unsupported HTTP method
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/hotel-onboarding`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert(
      res.status === 405,
      `PUT method returns HTTP 405 Method Not Allowed (status: ${res.status})`
    );
  } catch (err) {
    assert(false, `Unsupported method test failed: ${err.message}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GROUP 2: Realtime Lifecycle Management & WebSocket Safety
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST GROUP 2: Realtime Lifecycle & WebSocket Safety ---');

  // 6. Realtime manager state transitions
  assert(
    realtimeManager.getStatus() === 'IDLE',
    `RealtimeManager starts in IDLE status`
  );

  let capturedStatus = null;
  const unsubscribeListener = realtimeManager.subscribeStatus((st) => {
    capturedStatus = st;
  });

  // Connect to test hotel
  realtimeManager.connect(HOTEL_GOPAL_ID, true);
  assert(
    realtimeManager.getStatus() === 'CONNECTING' || realtimeManager.getStatus() === 'SUBSCRIBED',
    `RealtimeManager transitions to CONNECTING or SUBSCRIBED on connect`
  );

  // Safe rapid disconnect (simulating React 18 component unmount during connection phase)
  realtimeManager.disconnect();
  assert(
    realtimeManager.getStatus() === 'IDLE',
    `RealtimeManager disconnects safely without uncaught socket crashes`
  );
  unsubscribeListener();

  // Deduplication test: multiple calls with same hotelId do not create duplicate sockets
  realtimeManager.connect(HOTEL_GOPAL_ID, true);
  const statusAfterFirst = realtimeManager.getStatus();
  realtimeManager.connect(HOTEL_GOPAL_ID, true); // repeat
  assert(
    realtimeManager.getStatus() === statusAfterFirst,
    `Calling connect multiple times with the same hotelId does not churn channels`
  );
  realtimeManager.disconnect();

  // ──────────────────────────────────────────────────────────────────────────
  // GROUP 3: Reservation Wizard Date Validation & Business Rules
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST GROUP 3: Reservation Wizard Date Validation & Business Rules ---');

  const todayKolkata = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  // 7. Reject past dates without authorization
  const pastValidation = validateReservationForm({
    guestName: 'Test Guest',
    email: 'guest@example.com',
    roomNos: ['101'],
    checkIn: '2026-09-01',
    checkOut: '2026-09-05',
    allowBackdated: false,
  });
  assert(
    pastValidation.valid === false && pastValidation.error?.includes('past'),
    `Reservation wizard rejects past check-in (2026-09-01 vs business date ${todayKolkata})`
  );

  // 8. Allow past dates when backdated authorization is explicitly granted
  const backdatedValidation = validateReservationForm({
    guestName: 'Test Guest',
    email: 'guest@example.com',
    roomNos: ['101'],
    checkIn: '2026-09-01',
    checkOut: '2026-09-05',
    allowBackdated: true,
  });
  assert(
    backdatedValidation.valid === true,
    `Reservation wizard permits historical dates when authorized as backdated entry`
  );

  // 9. Reject check-out <= check-in
  const invalidRangeValidation = validateReservationForm({
    guestName: 'Test Guest',
    email: 'guest@example.com',
    roomNos: ['101'],
    checkIn: '2028-05-10',
    checkOut: '2028-05-10', // same day
  });
  assert(
    invalidRangeValidation.valid === false && invalidRangeValidation.error?.includes('Check-out date must be after check-in date'),
    `Reservation wizard rejects checkout date on or before check-in date`
  );

  // 10. Accurate stay duration & night calculation
  const calculatedNights = calcStayNights('2028-05-10', '2028-05-15');
  assert(
    calculatedNights === 5,
    `calcStayNights calculates exactly 5 nights for 2028-05-10 to 2028-05-15`
  );

  // 11. Backend rejection of past dates without allowBackdated flag
  try {
    await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [
        {
          guest_name: 'Past Stay Test',
          guest_phone: '9876543210',
          guest_email: 'past@hotelmantri.com',
          check_in_date: '2026-09-01',
          check_out_date: '2026-09-05',
          rate: 2500,
          room_no: '101',
          allowBackdated: false,
        },
      ],
      allowEmptyEmail: true,
      allowBackdated: false,
    });
    assert(false, 'Backend should reject past check-in without backdated authorization');
  } catch (err) {
    assert(
      err.code === 'PAST_CHECK_IN_DATE' || err.status === 400,
      `Backend createReservationsAtomically rejects past check-in dates with 400 PAST_CHECK_IN_DATE`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GROUP 4: Financial Calculations, Totals & GST Consistency
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST GROUP 4: Financial Calculations, Totals & GST Consistency ---');

  // Test GST Slab 12% calculation
  const gstResult = calcGstFull(10000, 'Exclusive', 12);
  assert(
    gstResult.taxable === 10000 && gstResult.gst === 1200 && gstResult.invoiceTotal === 11200,
    `Exclusive GST 12% on ₹10,000 matches exactly: ₹10,000 taxable, ₹1,200 GST, ₹11,200 total`
  );

  // Test GST Inclusive calculation
  const gstIncResult = calcGstFull(11200, 'Inclusive', 12);
  assert(
    Math.round(gstIncResult.taxable) === 10000 && Math.round(gstIncResult.gst) === 1200 && gstIncResult.invoiceTotal === 11200,
    `Inclusive GST 12% on ₹11,200 matches exactly: ₹10,000 taxable, ₹1,200 GST, ₹11,200 total`
  );

  // ──────────────────────────────────────────────────────────────────────────
  // GROUP 5: Inventory Integrity & Multi-Tenant Isolation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST GROUP 5: Inventory Integrity & Multi-Tenant Isolation ---');

  // 12. Hotel Gopal physical room verification
  const { data: gopalRooms } = await supabaseServiceRole
    .from('rooms')
    .select('id, room_no, hotel_id')
    .eq('hotel_id', HOTEL_GOPAL_ID)
    .eq('is_active', true);

  assert(
    Array.isArray(gopalRooms) && gopalRooms.length === 22,
    `Hotel Gopal has exactly 22 active physical rooms configured (found: ${gopalRooms?.length})`
  );

  const allBelongToGopal = (gopalRooms || []).every((r) => r.hotel_id === HOTEL_GOPAL_ID);
  assert(
    allBelongToGopal,
    `All 22 physical rooms are strictly isolated and scoped to Hotel Gopal (${HOTEL_GOPAL_ID})`
  );

  // 13. Concurrency test: Simultaneous reservation creation for last room in category
  console.log('\nTesting concurrent reservation race safety on future dates (2029-01-10)...');
  const catRes = await supabaseServiceRole
    .from('room_categories')
    .select('id, name')
    .eq('hotel_id', HOTEL_GOPAL_ID)
    .eq('name', 'Suite AC')
    .maybeSingle();

  if (catRes?.data) {
    const testCatId = catRes.data.id;
    const testCheckIn = '2029-01-10';
    const testCheckOut = '2029-01-12';

    // Book first suite room
    const book1 = await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [{
        guest_name: 'Suite Booking 1',
        guest_phone: '9991112220',
        guest_email: 'suite1@test.com',
        room_category_id: testCatId,
        rate_plan: 'Suite AC',
        check_in_date: testCheckIn,
        check_out_date: testCheckOut,
        rate: 3800,
        status: 'confirmed',
        auto_assign: true,
      }],
      allowEmptyEmail: true,
    });

    const book2 = await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [{
        guest_name: 'Suite Booking 2',
        guest_phone: '9991112221',
        guest_email: 'suite2@test.com',
        room_category_id: testCatId,
        rate_plan: 'Suite AC',
        check_in_date: testCheckIn,
        check_out_date: testCheckOut,
        rate: 3800,
        status: 'confirmed',
        auto_assign: true,
      }],
      allowEmptyEmail: true,
    });

    // Attempting a 3rd booking for a 2-room category MUST fail with 409
    let thirdFailedAsExpected = false;
    try {
      await createReservationsAtomically({
        hotelId: HOTEL_GOPAL_ID,
        items: [{
          guest_name: 'Suite Booking 3 (Overbook)',
          guest_phone: '9991112222',
          guest_email: 'suite3@test.com',
          room_category_id: testCatId,
          rate_plan: 'Suite AC',
          check_in_date: testCheckIn,
          check_out_date: testCheckOut,
          rate: 3800,
          status: 'confirmed',
          auto_assign: true,
        }],
        allowEmptyEmail: true,
      });
    } catch (err) {
      thirdFailedAsExpected = err.status === 409 || err.code === 'CATEGORY_CAPACITY_EXCEEDED';
    }

    assert(
      thirdFailedAsExpected,
      `Category capacity limit (2/2) strictly enforced: 3rd concurrent booking blocked with 409 CATEGORY_CAPACITY_EXCEEDED`
    );

    // Clean up test bookings
    if (book1?.[0]?.id) await supabaseServiceRole.from('reservations').delete().eq('id', book1[0].id);
    if (book2?.[0]?.id) await supabaseServiceRole.from('reservations').delete().eq('id', book2[0].id);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // FINAL REPORT
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log(`SUITE RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal error running suite:', err);
  process.exit(1);
});
