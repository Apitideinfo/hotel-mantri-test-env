import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const client = createClient(SUPABASE_URL, ANON_KEY);

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

async function runTests() {
  console.log('\n======================================================');
  console.log('   HOTEL ONBOARDING PIPELINE & RESILIENCE VERIFICATION');
  console.log('======================================================\n');

  // 1. Super Admin Authentication
  console.log('1. Authenticating as Super Admin (admin@hotelmis.com)...');
  const { data: adminLogin, error: adminLoginErr } = await client.auth.signInWithPassword({
    email: 'admin@hotelmis.com',
    password: 'Admin@2026',
  });
  assert(!adminLoginErr && !!adminLogin.session, 'Super Admin logged in successfully');
  const adminToken = adminLogin.session.access_token;

  // Verify Super Admin status via RPC
  const { data: isSuper } = await client.rpc('is_super_admin');
  assert(isSuper === true, 'is_super_admin RPC confirms Super Admin');

  // 2. Full Hotel Onboarding with 50 Rooms & 3 Categories
  const uniquePropCode = `PROD-${Date.now().toString().slice(-5)}`;
  const ownerEmail = `owner_${Date.now()}@production-test.com`;
  const ownerPassword = 'OwnerSecurePassword123!';
  const hotelName = `Grand Production Hotel ${uniquePropCode}`;

  console.log(`\n2. Performing Full Onboarding: "${hotelName}" (50 rooms, 3 categories, Trial plan)...`);
  const onboardRes = await fetch(`${SUPABASE_URL}/functions/v1/hotel-onboarding`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'onboard_hotel',
      hotel_name: hotelName,
      owner_name: 'Akshay Production',
      admin_email: ownerEmail,
      mobile: '9876543210',
      address: '123 Station Road',
      total_rooms: 50,
      city: 'Bikaner',
      state: 'Rajasthan',
      property_code: uniquePropCode,
      password: ownerPassword,
      categories: [
        { name: 'Standard', tariff: 999, extra_bed: 200 },
        { name: 'Deluxe', tariff: 1499, extra_bed: 250 },
        { name: 'Super Deluxe', tariff: 1999, extra_bed: 300 },
      ],
      rooms: [], // Backend must auto-generate all 50 physical rooms
      features: { channel_manager: true, daily_entry: true, room_chart: true },
    }),
  });

  assert(onboardRes.status === 200, `HTTP status is 200 (received: ${onboardRes.status})`);
  const onboardData = await onboardRes.json();
  assert(onboardData.success === true, 'Onboarding response indicates success');
  assert(!!onboardData.hotel_id, `Hotel ID returned: ${onboardData.hotel_id}`);
  assert(!!onboardData.attempt_id, `Attempt ID returned: ${onboardData.attempt_id}`);
  const newHotelId = onboardData.hotel_id;

  // 3. Database Verification of Created Resources
  console.log('\n3. Verifying Database Records for New Hotel...');
  const { data: hotelRow, error: hErr } = await client
    .from('hotels')
    .select('*')
    .eq('id', newHotelId)
    .single();

  assert(!hErr && !!hotelRow, 'Hotel record exists in database');
  assert(hotelRow.hotel_name === hotelName, 'Hotel name matches');
  assert(hotelRow.total_rooms === 50, 'Hotel total_rooms is 50');
  assert(hotelRow.is_active === true, 'Hotel is_active is true');
  assert(hotelRow.onboarding_status === 'completed', 'Hotel onboarding_status is completed');
  assert(!!hotelRow.plan_id, `Hotel subscription plan_id assigned: ${hotelRow.plan_id}`);
  assert(hotelRow.subscription_status === 'Active', 'Hotel subscription_status is Active');

  // Verify Attempt Record
  const { data: attemptRow } = await client
    .from('onboarding_attempts')
    .select('*')
    .eq('id', onboardData.attempt_id)
    .single();
  assert(attemptRow?.status === 'completed', 'Onboarding attempt marked completed');
  assert(attemptRow?.completed_steps?.includes('room_inventory'), 'Completed steps includes room_inventory');
  assert(attemptRow?.completed_steps?.includes('owner_auth'), 'Completed steps includes owner_auth');

  // Verify Categories
  const { data: catRows } = await client
    .from('room_categories')
    .select('*')
    .eq('hotel_id', newHotelId)
    .order('name');

  const standardCat = catRows?.find((c) => c.name === 'Standard');
  const deluxeCat = catRows?.find((c) => c.name === 'Deluxe');
  const superDeluxeCat = catRows?.find((c) => c.name === 'Super Deluxe');

  assert(!!standardCat, 'Standard category exists');
  assert(standardCat?.default_tariff === 999, `Standard tariff is 999 (received: ${standardCat?.default_tariff})`);
  assert(standardCat?.extra_bed_charge === 200, `Standard extra_bed is 200 (received: ${standardCat?.extra_bed_charge})`);
  assert(deluxeCat?.default_tariff === 1499, `Deluxe tariff is 1499 (received: ${deluxeCat?.default_tariff})`);
  assert(superDeluxeCat?.default_tariff === 1999, `Super Deluxe tariff is 1999 (received: ${superDeluxeCat?.default_tariff})`);

  // Verify Physical Rooms (MUST EQUAL 50)
  const { data: physicalRooms, count: roomCount } = await client
    .from('rooms')
    .select('id, room_no, category_id, floor, default_tariff', { count: 'exact' })
    .eq('hotel_id', newHotelId);

  assert(physicalRooms?.length === 50, `Physical room count in database equals 50 (received: ${physicalRooms?.length})`);
  const roomNos = new Set(physicalRooms?.map((r) => r.room_no));
  assert(roomNos.size === 50, 'All 50 room numbers are unique within the hotel');
  assert(physicalRooms?.every((r) => !!r.category_id), 'All 50 rooms are assigned to valid room categories');
  assert(physicalRooms?.every((r) => !!r.floor), 'All 50 rooms have floor assignments');

  // 4. Owner Login & Role/RBAC Verification
  console.log('\n4. Testing New Owner Authentication & Access...');
  const ownerClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: ownerLogin, error: ownerLoginErr } = await ownerClient.auth.signInWithPassword({
    email: ownerEmail,
    password: ownerPassword,
  });

  assert(!ownerLoginErr && !!ownerLogin.session, 'New owner successfully logged in with temporary password');
  const ownerToken = ownerLogin?.session?.access_token;

  // Verify owner role in hotel_admins
  const { data: ownerAdminRows } = await client
    .from('hotel_admins')
    .select('*')
    .eq('email', ownerEmail);

  assert(ownerAdminRows?.length === 1, 'Owner appears exactly once in hotel_admins');
  assert(ownerAdminRows?.[0]?.role === 'hotel_admin', 'Owner role is strictly hotel_admin');
  assert(ownerAdminRows?.[0]?.hotel_id === newHotelId, 'Owner is linked to the new hotel');
  assert(ownerAdminRows?.[0]?.status === 'Active', 'Owner status is Active');

  // Verify owner is NOT Super Admin
  const { data: ownerIsSuper } = await ownerClient.rpc('is_super_admin');
  assert(ownerIsSuper === false, 'Owner is not Super Admin');

  // 5. Retry / Idempotency Verification (Phase 36 & 37)
  console.log('\n5. Testing Idempotent Partial Room Creation & Retry (Phase 36)...');
  // Simulate partial failure: delete 20 rooms for a new test hotel with 50 rooms
  const propCodePartial = `PART-${Date.now().toString().slice(-5)}`;
  const partialEmail = `partial_${Date.now()}@production-test.com`;
  const partialHotelName = `Partial Recovery Hotel ${propCodePartial}`;

  // Run onboarding
  const initialPartialRes = await fetch(`${SUPABASE_URL}/functions/v1/hotel-onboarding`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'onboard_hotel',
      hotel_name: partialHotelName,
      owner_name: 'Recovery Owner',
      admin_email: partialEmail,
      mobile: '9876543211',
      address: '456 Test Lane',
      total_rooms: 50,
      city: 'Bikaner',
      state: 'Rajasthan',
      property_code: propCodePartial,
      password: 'RecoveryPassword123!',
      categories: [{ name: 'Standard', tariff: 1000, extra_bed: 200 }],
      rooms: [],
      features: {},
    }),
  });
  const partialData = await initialPartialRes.json();
  const partialHotelId = partialData.hotel_id;

  // Now delete 20 rooms to simulate partial room creation
  const { data: roomsToDelete } = await client
    .from('rooms')
    .select('id')
    .eq('hotel_id', partialHotelId)
    .limit(20);

  if (roomsToDelete && roomsToDelete.length > 0) {
    await client.from('rooms').delete().in('id', roomsToDelete.map((r) => r.id));
  }

  const { count: roomsRemaining } = await client
    .from('rooms')
    .select('id', { count: 'exact' })
    .eq('hotel_id', partialHotelId);
  assert(roomsRemaining === 30, `Simulated partial failure: 30 rooms remain out of 50`);

  // Reset attempt step so room_inventory re-runs
  await client
    .from('onboarding_attempts')
    .update({
      completed_steps: ['hotel_record', 'hotel_settings', 'room_categories'],
      failed_step: 'room_inventory',
      status: 'incomplete',
    })
    .eq('id', partialData.attempt_id);

  // Call retry
  console.log('   Retrying onboarding to recover the missing 20 rooms...');
  const retryRes = await fetch(`${SUPABASE_URL}/functions/v1/hotel-onboarding`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'onboard_hotel',
      attempt_id: partialData.attempt_id,
      hotel_name: partialHotelName,
      owner_name: 'Recovery Owner',
      admin_email: partialEmail,
      mobile: '9876543211',
      address: '456 Test Lane',
      total_rooms: 50,
      city: 'Bikaner',
      state: 'Rajasthan',
      property_code: propCodePartial,
      password: 'RecoveryPassword123!',
      categories: [{ name: 'Standard', tariff: 1000, extra_bed: 200 }],
      rooms: [],
      features: {},
    }),
  });

  const retryData = await retryRes.json();
  assert(retryData.success === true, 'Retry completed successfully');

  // Verify total rooms in DB is now EXACTLY 50 (NOT 50+30=80, NOT 70)
  const { count: finalRoomCount } = await client
    .from('rooms')
    .select('id', { count: 'exact' })
    .eq('hotel_id', partialHotelId);
  assert(finalRoomCount === 50, `Final room count after retry is EXACTLY 50 (received: ${finalRoomCount})`);

  // 6. Conflict Detection Test (Phase 4 Case C)
  console.log('\n6. Testing Email Conflict Detection (Phase 4 Case C)...');
  const conflictRes = await fetch(`${SUPABASE_URL}/functions/v1/hotel-onboarding`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'onboard_hotel',
      hotel_name: 'Conflict Hotel',
      owner_name: 'Conflict User',
      admin_email: ownerEmail, // Email already belongs to hotel 1
      mobile: '9876543210',
      address: '789 Conflict St',
      total_rooms: 10,
      city: 'Bikaner',
      state: 'Rajasthan',
      property_code: `CONF-${Date.now().toString().slice(-4)}`,
      password: 'Password123!',
      categories: [{ name: 'Standard', tariff: 1000, extra_bed: 200 }],
      rooms: [],
      features: {},
    }),
  });

  assert(conflictRes.status === 409, `Conflict returns HTTP 409 (received: ${conflictRes.status})`);
  const conflictData = await conflictRes.json();
  assert(conflictData.code === 'OWNER_EMAIL_CONFLICT', `Conflict error code is OWNER_EMAIL_CONFLICT (received: ${conflictData.code})`);

  // 7. Existing Hotel Gopal Regression Test (Phase 32)
  console.log('\n7. Verifying Existing Hotel Gopal Remains Completely Intact...');
  const { data: gopalHotels } = await client
    .from('hotels')
    .select('*')
    .eq('id', 'a93139f5-baa0-47a4-87ca-81ee7e106d9c');
  assert(gopalHotels?.length === 1, 'Hotel Gopal exists and is unique');
  assert(gopalHotels?.[0]?.hotel_name === 'Hotel Gopal', 'Hotel Gopal name is preserved');

  const { data: gopalRooms } = await client
    .from('rooms')
    .select('id')
    .eq('hotel_id', 'a93139f5-baa0-47a4-87ca-81ee7e106d9c');
  assert((gopalRooms?.length ?? 0) > 0, `Hotel Gopal rooms are preserved (count: ${gopalRooms?.length})`);

  const { data: gopalResvs } = await client
    .from('reservations')
    .select('id')
    .eq('hotel_id', 'a93139f5-baa0-47a4-87ca-81ee7e106d9c');
  assert((gopalResvs?.length ?? 0) > 0, `Hotel Gopal reservations are preserved (count: ${gopalResvs?.length})`);

  console.log('\n======================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
