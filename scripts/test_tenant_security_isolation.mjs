import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolveAuthorizedHotel, requireHotelAccess } from '../server/middleware/auth.js';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://mtfycmdoqzzyxhjmfvuv.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const HOTEL_A_ID = '2fb1e4de-de39-4ad3-ac75-a03f196157b4'; // test hotel
const HOTEL_B_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c'; // Hotel Gopal

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

async function runSecuritySuite() {
  console.log('===============================================================');
  console.log('HOTEL MANTRI — MULTI-TENANT SECURITY AUDIT & ATTACK SIMULATION');
  console.log('===============================================================\n');

  // Authenticate as Owner A (test hotel)
  console.log('Authenticating as Owner A (akshayvyas505@gmail.com)...');
  const clientA = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authA, error: errA } = await clientA.auth.signInWithPassword({
    email: 'akshayvyas505@gmail.com',
    password: 'Password123!',
  });
  if (errA || !authA.session) throw new Error(`Owner A login failed: ${errA?.message}`);
  const tokenA = authA.session.access_token;
  console.log('Owner A authenticated successfully.\n');

  // Authenticate as Owner B (Hotel Gopal)
  console.log('Authenticating as Owner B (hoteladmin@test.com)...');
  const clientB = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authB, error: errB } = await clientB.auth.signInWithPassword({
    email: 'hoteladmin@test.com',
    password: 'Password123!',
  });
  if (errB || !authB.session) throw new Error(`Owner B login failed: ${errB?.message}`);
  const tokenB = authB.session.access_token;
  console.log('Owner B authenticated successfully.\n');

  // Authenticate as Super Admin (admin@hotelmis.com)
  console.log('Authenticating as Super Admin (admin@hotelmis.com)...');
  const clientSA = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authSA, error: errSA } = await clientSA.auth.signInWithPassword({
    email: 'admin@hotelmis.com',
    password: 'Admin@2026',
  });
  if (errSA || !authSA.session) throw new Error(`Super Admin login failed: ${errSA?.message}`);
  const tokenSA = authSA.session.access_token;
  console.log('Super Admin authenticated successfully.\n');

  // ─────────────────────────────────────────────────────────────
  // TEST 1 — Normal owner login
  // ─────────────────────────────────────────────────────────────
  console.log('TEST 1: Normal Owner A Login & Authorization Resolution');
  {
    const req = {
      headers: { authorization: `Bearer ${tokenA}` },
      query: {},
      body: {},
    };
    const res = await resolveAuthorizedHotel(req);
    assert(res.success === true, 'Owner A resolves authorized hotel successfully');
    assert(res.hotelId === HOTEL_A_ID, `Authorized hotelId strictly matches Hotel A (${HOTEL_A_ID})`);
    assert(res.isSuperAdmin === false, 'Owner A isSuperAdmin flag is strictly false');
    assert(res.role === 'hotel_admin', 'Owner A role is strictly hotel_admin');
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 2 — localStorage manipulation defense
  // ─────────────────────────────────────────────────────────────
  console.log('\nTEST 2: Defense against localStorage Tampering');
  {
    // Client attempts to pass a forged hotelId pretending it came from localStorage
    const req = {
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-hotel-id': HOTEL_B_ID, // tampered value from client localStorage
      },
      query: {},
      body: {},
    };
    const res = await resolveAuthorizedHotel(req);
    assert(res.success === false, 'Server rejects tampered hotel ID matching Hotel B');
    assert(res.status === 403, 'Rejection HTTP status is 403');
    assert(res.code === 'HOTEL_ACCESS_DENIED', 'Error code is HOTEL_ACCESS_DENIED');
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 3 — URL parameter manipulation defense
  // ─────────────────────────────────────────────────────────────
  console.log('\nTEST 3: Defense against URL Parameter Tampering');
  {
    // Owner A sends query parameter ?hotelId=HOTEL_B_ID
    const req = {
      headers: { authorization: `Bearer ${tokenA}` },
      query: { hotelId: HOTEL_B_ID },
      body: {},
    };
    const res = await resolveAuthorizedHotel(req);
    assert(res.success === false, 'Server rejects URL query parameter tampering with Hotel B');
    assert(res.status === 403, 'Rejection HTTP status is 403');
    assert(res.code === 'HOTEL_ACCESS_DENIED', 'Error code is HOTEL_ACCESS_DENIED');
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 4 — Request body manipulation defense
  // ─────────────────────────────────────────────────────────────
  console.log('\nTEST 4: Defense against Request Body Tampering');
  {
    // Owner A sends body { hotel_id: HOTEL_B_ID }
    const req = {
      headers: { authorization: `Bearer ${tokenA}` },
      query: {},
      body: { hotel_id: HOTEL_B_ID },
    };
    const res = await resolveAuthorizedHotel(req);
    assert(res.success === false, 'Server rejects request body tampering with Hotel B');
    assert(res.status === 403, 'Rejection HTTP status is 403');
    assert(res.code === 'HOTEL_ACCESS_DENIED', 'Error code is HOTEL_ACCESS_DENIED');
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 5 — Request header manipulation defense
  // ─────────────────────────────────────────────────────────────
  console.log('\nTEST 5: Defense against Custom Header Tampering (X-Hotel-Id)');
  {
    const req = {
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-hotel-id': HOTEL_B_ID,
      },
      query: {},
      body: {},
      url: '/api/reservations',
      method: 'GET',
    };
    let capturedStatus = 0;
    let capturedBody = null;
    const resObj = {
      status(s) { capturedStatus = s; return this; },
      json(b) { capturedBody = b; return this; },
    };
    let nextCalled = false;
    await requireHotelAccess(req, resObj, () => { nextCalled = true; });

    assert(!nextCalled, 'requireHotelAccess blocks request from proceeding to next()');
    assert(capturedStatus === 403, 'Response HTTP status is 403');
    assert(capturedBody?.code === 'HOTEL_ACCESS_DENIED', 'Response code is HOTEL_ACCESS_DENIED');
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 6 — Direct Supabase Client RLS Defense
  // ─────────────────────────────────────────────────────────────
  console.log('\nTEST 6: PostgreSQL RLS Direct Client Isolation');
  {
    // A. Query hotels table
    const { data: hotelsA } = await clientA.from('hotels').select('id, hotel_name');
    assert(hotelsA?.length === 1, `Owner A sees exactly 1 hotel row in hotels table (saw ${hotelsA?.length})`);
    assert(hotelsA?.[0]?.id === HOTEL_A_ID, `Visible hotel is strictly Hotel A (${hotelsA?.[0]?.hotel_name})`);

    // Verify Owner A CANNOT query Hotel B row directly
    const { data: hotelBQuery } = await clientA.from('hotels').select('*').eq('id', HOTEL_B_ID);
    assert(hotelBQuery?.length === 0, 'Owner A querying Hotel B directly via Supabase returns ZERO rows');

    // B. Query reservations table
    const { data: resvsA } = await clientA.from('reservations').select('id, hotel_id');
    const hasHotelBOwnership = resvsA?.some((r) => r.hotel_id === HOTEL_B_ID);
    assert(!hasHotelBOwnership, 'Owner A receives ZERO reservations belonging to Hotel B');

    const { data: directResvB } = await clientA.from('reservations').select('*').eq('hotel_id', HOTEL_B_ID);
    assert(directResvB?.length === 0, 'Owner A querying Hotel B reservations directly returns ZERO rows');

    // C. Query channel_settings table
    const { data: chA } = await clientA.from('channel_settings').select('*');
    assert(chA?.every((c) => c.hotel_id === HOTEL_A_ID), 'Owner A sees only channel_settings for Hotel A');

    const { data: chBDirect } = await clientA.from('channel_settings').select('*').eq('hotel_id', HOTEL_B_ID);
    assert(chBDirect?.length === 0, 'Owner A querying Hotel B channel_settings returns ZERO rows');

    // D. Query channel_ota_reservations table
    const { data: otaBDirect } = await clientA.from('channel_ota_reservations').select('*').eq('hotel_id', HOTEL_B_ID);
    assert(otaBDirect?.length === 0, 'Owner A querying Hotel B OTA reservations returns ZERO rows');

    // E. Attempt cross-tenant INSERT into reservations for Hotel B
    const { error: insErr } = await clientA.from('reservations').insert({
      hotel_id: HOTEL_B_ID,
      guest_name: 'Attacker Hacker',
      check_in_date: '2026-11-01',
      check_out_date: '2026-11-03',
      rate: 5000,
      total_amount: 10000,
      status: 'confirmed',
    });
    assert(!!insErr, 'Owner A attempting to INSERT a reservation for Hotel B is BLOCKED by RLS');

    // F. Attempt cross-tenant UPDATE on Hotel B reservations
    const { data: updData, error: updErr } = await clientA
      .from('reservations')
      .update({ special_requests: 'Compromised by Owner A' })
      .eq('hotel_id', HOTEL_B_ID)
      .select('*');
    assert(updErr || updData?.length === 0, 'Owner A attempting to UPDATE Hotel B reservations affects 0 rows or is blocked');

    // G. Attempt cross-tenant DELETE on Hotel B reservations
    const { data: delData, error: delErr } = await clientA
      .from('reservations')
      .delete()
      .eq('hotel_id', HOTEL_B_ID)
      .select('*');
    assert(delData?.length === 0, 'Owner A attempting to DELETE Hotel B reservations affects 0 rows');
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 7 — Owner B Isolation from Owner A
  // ─────────────────────────────────────────────────────────────
  console.log('\nTEST 7: Bidirectional Isolation (Owner B -> Hotel A is also BLOCKED)');
  {
    const { data: hotelsB } = await clientB.from('hotels').select('id, hotel_name');
    assert(hotelsB?.length === 1, `Owner B sees exactly 1 hotel row in hotels table (saw ${hotelsB?.length})`);
    assert(hotelsB?.[0]?.id === HOTEL_B_ID, `Visible hotel is strictly Hotel B (${hotelsB?.[0]?.hotel_name})`);

    const { data: hotelAQuery } = await clientB.from('hotels').select('*').eq('id', HOTEL_A_ID);
    assert(hotelAQuery?.length === 0, 'Owner B querying Hotel A directly returns ZERO rows');

    // Tampering test from Owner B targeting Hotel A
    const reqB = {
      headers: {
        authorization: `Bearer ${tokenB}`,
        'x-hotel-id': HOTEL_A_ID,
      },
      query: {},
      body: {},
    };
    const resB = await resolveAuthorizedHotel(reqB);
    assert(resB.success === false, 'Owner B attempting to access Hotel A is REJECTED');
    assert(resB.status === 403, 'Rejection status is 403');
    assert(resB.code === 'HOTEL_ACCESS_DENIED', 'Rejection code is HOTEL_ACCESS_DENIED');
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 8 — Super Admin Switching Functionality Preserved
  // ─────────────────────────────────────────────────────────────
  console.log('\nTEST 8: Super Admin Multi-Property Access & Switching');
  {
    // Super Admin queries hotels table
    const { data: saHotels } = await clientSA.from('hotels').select('id, hotel_name');
    assert(saHotels?.length >= 2, `Super Admin can view multiple hotels (found ${saHotels?.length})`);

    // Super Admin selects Hotel A
    const reqSA_A = {
      headers: {
        authorization: `Bearer ${tokenSA}`,
        'x-hotel-id': HOTEL_A_ID,
      },
      query: {},
      body: {},
    };
    const resSA_A = await resolveAuthorizedHotel(reqSA_A);
    assert(resSA_A.success === true, 'Super Admin can select Hotel A');
    assert(resSA_A.hotelId === HOTEL_A_ID, 'Super Admin context is Hotel A');

    // Super Admin switches to Hotel B
    const reqSA_B = {
      headers: {
        authorization: `Bearer ${tokenSA}`,
        'x-hotel-id': HOTEL_B_ID,
      },
      query: {},
      body: {},
    };
    const resSA_B = await resolveAuthorizedHotel(reqSA_B);
    assert(resSA_B.success === true, 'Super Admin can switch to Hotel B');
    assert(resSA_B.hotelId === HOTEL_B_ID, 'Super Admin context is switched to Hotel B');
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 9 — Unauthenticated Access Defense
  // ─────────────────────────────────────────────────────────────
  console.log('\nTEST 9: Unauthenticated Cross-Hotel Access Defense');
  {
    // No auth token provided
    const reqAnon = {
      headers: { 'x-hotel-id': HOTEL_A_ID },
      query: {},
      body: {},
    };
    const resAnon = await resolveAuthorizedHotel(reqAnon);
    assert(resAnon.success === false, 'Unauthenticated request with X-Hotel-Id is rejected');
    assert(resAnon.status === 401, 'Rejection status is 401');
    assert(resAnon.code === 'AUTH_REQUIRED', 'Rejection code is AUTH_REQUIRED');

    // Public Anon Client direct RLS query
    const publicClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: anonHotels } = await publicClient.from('hotels').select('*');
    assert(anonHotels?.length === 0, 'Public anon client cannot read hotels table (0 rows returned)');

    const { data: anonResvs } = await publicClient.from('reservations').select('*');
    assert(anonResvs?.length === 0, 'Public anon client cannot read reservations table (0 rows returned)');
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 10 — Channel Manager and Aiosell Tenant Isolation
  // ─────────────────────────────────────────────────────────────
  console.log('\nTEST 10: Channel Manager & Aiosell Configuration Isolation');
  {
    // Owner A requests channel connections
    const reqChA = {
      headers: { authorization: `Bearer ${tokenA}` },
      query: {},
      body: {},
    };
    const authRes = await resolveAuthorizedHotel(reqChA);
    assert(authRes.success === true, 'Owner A authorized for channel manager');

    const { data: chConnA } = await clientA
      .from('channel_connections')
      .select('id, hotel_id, channel_name');
    assert(chConnA?.every((c) => c.hotel_id === HOTEL_A_ID), 'Owner A channel_connections strictly belong to Hotel A');

    // Owner A attempts to query Hotel B channel connections
    const { data: chConnB } = await clientA
      .from('channel_connections')
      .select('*')
      .eq('hotel_id', HOTEL_B_ID);
    assert(chConnB?.length === 0, 'Owner A querying Hotel B channel connections returns 0 rows');
  }

  console.log('\n===============================================================');
  console.log(`SECURITY AUDIT COMPLETE: ${passed} Passed, ${failed} Failed`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSecuritySuite().catch((err) => {
  console.error('Fatal Security Suite Error:', err);
  process.exit(1);
});
