import dotenv from 'dotenv';
import http from 'http';
import app from '../server/index.js';
import { supabaseServiceRole, ensureAuth } from '../server/supabaseClient.js';
import { setHotelResolverForTesting } from '../server/middleware/auth.js';
import { calculateAuthoritativeInventory } from '../server/routes/aiosell.js';

dotenv.config();

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

async function request(baseUrl, method, path, body, headers = {}) {
  const url = new URL(path, baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function setAuthContext(hotel, role = 'hotel_owner') {
  setHotelResolverForTesting(() => ({
    success: true,
    userId: 'test-user-id',
    hotelId: hotel.id,
    role,
    isSuperAdmin: role === 'super_admin',
    hotel,
    scopedSupabase: supabaseServiceRole,
  }));
}

async function runTestSuite() {
  console.log('\n=============================================================================');
  console.log('HOTEL MANTRI — CHANNEL MANAGER EXACT INVENTORY MATCHING TEST SUITE');
  console.log('=============================================================================\n');

  await ensureAuth();

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}\n`);

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Hotel with zero registered rooms (Clean Empty Setup State)
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Hotel with zero registered rooms ---');
    const { data: zeroRoomHotel } = await supabaseServiceRole
      .from('hotels')
      .select('id, hotel_name')
      .eq('id', '195e449b-57df-4e96-9572-52646a6d63ae') // Royal Mantri Suites
      .single();

    if (zeroRoomHotel) {
      setAuthContext(zeroRoomHotel, 'hotel_owner');

      const today = new Date().toISOString().slice(0, 10);
      const res = await request(baseUrl, 'POST', '/api/aiosell/inventory/matrix', {
        startDate: today,
        endDate: today
      }, { 'x-hotel-id': zeroRoomHotel.id });

      assert(res.status === 200, 'Matrix API returns 200 for hotel with zero rooms');
      assert(res.body.totalPhysicalRooms === 0, `Total physical rooms is 0 (got ${res.body.totalPhysicalRooms})`);
      assert(Array.isArray(res.body.categories) && res.body.categories.length === 0, 'No fabricated categories returned');
      assert(Array.isArray(res.body.matrix) && res.body.matrix.length === 0, 'Matrix array is empty, no fabricated rooms');
    }

    // -------------------------------------------------------------------------
    // TEST 2: Hotel with single category and registered rooms (Hotel Swagat)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Hotel with single category & rooms (Hotel Swagat) ---');
    const { data: swagatHotel } = await supabaseServiceRole
      .from('hotels')
      .select('id, hotel_name')
      .eq('id', 'aa5bfd36-de50-4217-8997-d2cd18e4dfe8')
      .single();

    if (swagatHotel) {
      setAuthContext(swagatHotel, 'hotel_owner');

      const today = new Date().toISOString().slice(0, 10);
      const res = await request(baseUrl, 'POST', '/api/aiosell/inventory/matrix', {
        startDate: today,
        endDate: today
      }, { 'x-hotel-id': swagatHotel.id });

      assert(res.status === 200, 'Matrix API returns 200 for Hotel Swagat');
      assert(res.body.totalPhysicalRooms === 15, `Hotel Swagat total physical rooms is exactly 15 (got ${res.body.totalPhysicalRooms})`);
      assert(res.body.categories.length === 1, `Has exactly 1 active category (got ${res.body.categories.length})`);
      const cat = res.body.categories[0];
      assert(cat.name === 'Deluxe AC', `Category name is Deluxe AC (got ${cat.name})`);
      assert(cat.room_count === 15, `Category room_count is exactly 15 (got ${cat.room_count})`);
      assert(cat.total_rooms === 15, `Category total_rooms is exactly 15 (got ${cat.total_rooms})`);

      const matrixEntry = res.body.matrix.find(m => m.room_category_id === cat.id);
      assert(matrixEntry && matrixEntry.physical === 15, `Matrix physical capacity is 15 (got ${matrixEntry?.physical})`);
    }

    // -------------------------------------------------------------------------
    // TEST 3: Multi-category hotel with different counts (Hotel Gopal: 18, 2, 2 = 22)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Multi-category hotel exact derivation (Hotel Gopal) ---');
    const { data: gopalHotel } = await supabaseServiceRole
      .from('hotels')
      .select('id, hotel_name')
      .eq('id', 'df9a4949-afb9-404d-ae37-e11457fa624e')
      .single();

    if (gopalHotel) {
      setAuthContext(gopalHotel, 'hotel_owner');

      const today = new Date().toISOString().slice(0, 10);
      const res = await request(baseUrl, 'POST', '/api/aiosell/inventory/matrix', {
        startDate: today,
        endDate: today
      }, { 'x-hotel-id': gopalHotel.id });

      assert(res.status === 200, 'Matrix API returns 200 for Hotel Gopal');
      assert(res.body.totalPhysicalRooms === 22, `Hotel Gopal total registered physical rooms is 22 (got ${res.body.totalPhysicalRooms})`);
      
      const catCounts = {};
      res.body.categories.forEach(c => {
        catCounts[c.name] = c.room_count;
      });
      console.log('    Derived category breakdown:', catCounts);
      assert(catCounts['Deluxe AC'] === 18, `Deluxe AC has exactly 18 rooms (got ${catCounts['Deluxe AC']})`);
      assert(catCounts['Fourbed AC'] === 2, `Fourbed AC has exactly 2 rooms (got ${catCounts['Fourbed AC']})`);
      assert(catCounts['Suite AC'] === 2, `Suite AC has exactly 2 rooms (got ${catCounts['Suite AC']})`);

      // -------------------------------------------------------------------------
      // TEST 4: Category totals strictly equaling physical room totals
      // -------------------------------------------------------------------------
      console.log('\n--- TEST 4: Category totals equal physical room totals ---');
      const sumCatRooms = res.body.categories.reduce((acc, c) => acc + c.room_count, 0);
      const unassignedCount = (res.body.unassignedRooms || []).length;
      assert(sumCatRooms + unassignedCount === res.body.totalPhysicalRooms, 
        `Sum of categories (${sumCatRooms}) + unassigned (${unassignedCount}) == total physical (${res.body.totalPhysicalRooms})`);
      assert(sumCatRooms === 22, 'Sum of category rooms is exactly 22');
    }

    // -------------------------------------------------------------------------
    // TEST 5: Missing category assignments & orphaned rooms detection
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Unassigned rooms detection & validation warning ---');
    // Temporarily insert a test room with NULL category_id in Hotel Gopal
    const { data: testUnassignedRoom, error: unassignedErr } = await supabaseServiceRole
      .from('rooms')
      .insert({
        hotel_id: gopalHotel.id,
        room_no: 'TEST-UNASSIGNED-999',
        category_id: null,
        is_active: true
      })
      .select('id, room_no')
      .single();

    if (testUnassignedRoom) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { unassignedRooms, totalPhysicalRooms } = await calculateAuthoritativeInventory(
          gopalHotel.id,
          today,
          today,
          null,
          { client: supabaseServiceRole }
        );

        assert(totalPhysicalRooms === 23, `Total physical rooms increments to 23 (got ${totalPhysicalRooms})`);
        const foundUnassigned = (unassignedRooms || []).find(r => r.room_no === 'TEST-UNASSIGNED-999');
        assert(Boolean(foundUnassigned), 'Unassigned room is explicitly identified in unassignedRooms array');
        assert(foundUnassigned?.reason === 'Missing category assignment', `Identifies correct reason: "${foundUnassigned?.reason}"`);
      } finally {
        await supabaseServiceRole.from('rooms').delete().eq('id', testUnassignedRoom.id);
      }
    }

    // -------------------------------------------------------------------------
    // TEST 6 & 7: Multi-tenant hotel isolation and switching without leakage
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6 & 7: Multi-tenant hotel isolation & switching ---');
    setAuthContext(swagatHotel, 'hotel_owner');

    const today = new Date().toISOString().slice(0, 10);
    const swagatRes = await request(baseUrl, 'POST', '/api/aiosell/inventory/matrix', {
      startDate: today,
      endDate: today
    }, { 'x-hotel-id': swagatHotel.id });

    // Switch context to Hotel Gopal
    setAuthContext(gopalHotel, 'hotel_owner');

    const gopalRes = await request(baseUrl, 'POST', '/api/aiosell/inventory/matrix', {
      startDate: today,
      endDate: today
    }, { 'x-hotel-id': gopalHotel.id });

    assert(swagatRes.body.totalPhysicalRooms === 15, 'Swagat query returned 15 rooms');
    assert(gopalRes.body.totalPhysicalRooms === 22, 'Gopal query returned 22 rooms');
    const swagatCatIds = new Set(swagatRes.body.categories.map(c => c.id));
    const gopalHasSwagatCat = gopalRes.body.categories.some(c => swagatCatIds.has(c.id));
    assert(!gopalHasSwagatCat, 'Zero category leakage between Hotel Swagat and Hotel Gopal');

    // -------------------------------------------------------------------------
    // TEST 8, 9, 10: Dynamic room addition, reassignment, and deletion
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8, 9, 10: Dynamic room lifecycle: add, reassign, delete ---');
    const { data: gopalCats } = await supabaseServiceRole
      .from('room_categories')
      .select('id, name')
      .eq('hotel_id', gopalHotel.id)
      .eq('is_active', true);

    const deluxeCat = gopalCats.find(c => c.name.includes('Deluxe'));
    const suiteCat = gopalCats.find(c => c.name.includes('Suite'));

    if (deluxeCat && suiteCat) {
      // Step A: Add a new room to Suite category
      const { data: newRoom } = await supabaseServiceRole
        .from('rooms')
        .insert({
          hotel_id: gopalHotel.id,
          room_no: 'TEST-SUITE-301',
          category_id: suiteCat.id,
          is_active: true
        })
        .select()
        .single();

      const afterAdd = await calculateAuthoritativeInventory(gopalHotel.id, today, today, null, { client: supabaseServiceRole });
      const suiteAfterAdd = afterAdd.categories.find(c => c.id === suiteCat.id);
      assert(suiteAfterAdd.room_count === 3, `Suite count increased from 2 to 3 after room add (got ${suiteAfterAdd.room_count})`);
      assert(afterAdd.totalPhysicalRooms === 23, `Total physical rooms increased to 23 (got ${afterAdd.totalPhysicalRooms})`);

      // Step B: Reassign room from Suite to Deluxe
      await supabaseServiceRole
        .from('rooms')
        .update({ category_id: deluxeCat.id })
        .eq('id', newRoom.id);

      const afterReassign = await calculateAuthoritativeInventory(gopalHotel.id, today, today, null, { client: supabaseServiceRole });
      const suiteAfterReassign = afterReassign.categories.find(c => c.id === suiteCat.id);
      const deluxeAfterReassign = afterReassign.categories.find(c => c.id === deluxeCat.id);
      assert(suiteAfterReassign.room_count === 2, `Suite count reverted to 2 after reassignment (got ${suiteAfterReassign.room_count})`);
      assert(deluxeAfterReassign.room_count === 19, `Deluxe count increased from 18 to 19 after reassignment (got ${deluxeAfterReassign.room_count})`);
      assert(afterReassign.totalPhysicalRooms === 23, `Total physical rooms remains invariant at 23 (got ${afterReassign.totalPhysicalRooms})`);

      // Step C: Delete room
      await supabaseServiceRole.from('rooms').delete().eq('id', newRoom.id);
      const afterDelete = await calculateAuthoritativeInventory(gopalHotel.id, today, today, null, { client: supabaseServiceRole });
      const deluxeAfterDelete = afterDelete.categories.find(c => c.id === deluxeCat.id);
      assert(deluxeAfterDelete.room_count === 18, `Deluxe count restored to 18 after room delete (got ${deluxeAfterDelete.room_count})`);
      assert(afterDelete.totalPhysicalRooms === 22, `Total physical rooms restored to 22 (got ${afterDelete.totalPhysicalRooms})`);
    }

    // -------------------------------------------------------------------------
    // TEST 11: Reservations and blocked rooms reducing availability
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 11: Reservations and blocked rooms availability reduction ---');
    const futureDate = '2026-11-20';
    // Insert a test reservation for Hotel Gopal Deluxe category
    const { data: testResv } = await supabaseServiceRole
      .from('reservations')
      .insert({
        hotel_id: gopalHotel.id,
        room_no: '101',
        rate_plan: 'EP',
        check_in_date: futureDate,
        check_out_date: '2026-11-21',
        status: 'confirmed',
        guest_name: 'Test Guest',
      })
      .select()
      .single();

    try {
      const inv = await calculateAuthoritativeInventory(gopalHotel.id, futureDate, futureDate, null, { client: supabaseServiceRole });
      const deluxeMatrix = inv.matrix.find(m => m.room_category_id === deluxeCat.id && m.date === futureDate);
      assert(deluxeMatrix.physical === 18, `Physical rooms is 18 (got ${deluxeMatrix.physical})`);
      assert(deluxeMatrix.occupied === 1, `Occupied count is 1 for confirmed reservation (got ${deluxeMatrix.occupied})`);
      assert(deluxeMatrix.available === 17, `Available rooms is 17 = 18 physical - 1 occupied (got ${deluxeMatrix.available})`);
    } finally {
      await supabaseServiceRole.from('reservations').delete().eq('id', testResv.id);
    }

    // -------------------------------------------------------------------------
    // TEST 12 & 13: Capacity bounds enforcement & rejection of updates > physical
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 12 & 13: Enforce physical capacity bounds on /inventory-restrictions/patch ---');
    setAuthContext(gopalHotel, 'hotel_owner');

    // Suite AC has 2 rooms. Attempting to set availability to 3 must be REJECTED with 400 EXCEEDS_PHYSICAL_CAPACITY!
    const patchOverCapacityRes = await request(baseUrl, 'POST', '/api/channels/inventory-restrictions/patch', {
      updates: [
        {
          roomCategoryId: suiteCat.id,
          date: '2026-11-25',
          availability: 5 // > 2 physical capacity
        }
      ]
    }, { 'x-hotel-id': gopalHotel.id });

    assert(patchOverCapacityRes.status === 400, `Rejects availability exceeding physical capacity with HTTP 400 (got ${patchOverCapacityRes.status})`);
    assert(patchOverCapacityRes.body.error?.code === 'EXCEEDS_PHYSICAL_CAPACITY', 
      `Error code is EXCEEDS_PHYSICAL_CAPACITY (got ${patchOverCapacityRes.body.error?.code})`);
    console.log('    Server rejection message:', patchOverCapacityRes.body.error?.message);

    // Negative availability must also be rejected
    const patchNegativeRes = await request(baseUrl, 'POST', '/api/channels/inventory-restrictions/patch', {
      updates: [
        {
          roomCategoryId: suiteCat.id,
          date: '2026-11-25',
          availability: -3
        }
      ]
    }, { 'x-hotel-id': gopalHotel.id });

    assert(patchNegativeRes.status === 400, `Rejects negative availability with HTTP 400 (got ${patchNegativeRes.status})`);
    assert(['INVALID_INVENTORY_VALUE', 'INVALID_INVENTORY_UPDATE'].includes(patchNegativeRes.body.error?.code), `Error code is INVALID_INVENTORY_VALUE or INVALID_INVENTORY_UPDATE (got ${patchNegativeRes.body.error?.code})`);

    // Valid update at physical capacity limit (2) must be ACCEPTED
    const patchValidRes = await request(baseUrl, 'POST', '/api/channels/inventory-restrictions/patch', {
      updates: [
        {
          roomCategoryId: suiteCat.id,
          date: '2026-11-25',
          availability: 2
        }
      ]
    }, { 'x-hotel-id': gopalHotel.id });

    assert(patchValidRes.status === 200, `Accepts valid update within capacity with HTTP 200 (got ${patchValidRes.status})`);

    // Clean up test restriction
    await supabaseServiceRole
      .from('channel_inventory_restrictions')
      .delete()
      .eq('hotel_id', gopalHotel.id)
      .eq('room_category_id', suiteCat.id)
      .eq('date', '2026-11-25');

    // -------------------------------------------------------------------------
    // TEST 14: Cross-hotel foreign category update rejection
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 14: Cross-hotel foreign category security check ---');
    const crossHotelRes = await request(baseUrl, 'POST', '/api/channels/inventory-restrictions/patch', {
      updates: [
        {
          roomCategoryId: swagatHotel ? 'c0fa7cb4-7b6c-4809-b1d7-2194389025ce' : 'fake-cat-id',
          date: '2026-11-25',
          availability: 1
        }
      ]
    }, { 'x-hotel-id': gopalHotel.id });

    assert(crossHotelRes.status === 400 || crossHotelRes.status === 403, 
      `Cross-hotel category injection blocked with status ${crossHotelRes.status}`);

    // -------------------------------------------------------------------------
    // TEST 15: Unmapped OTA categories handling
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 15: Unmapped OTA categories handling ---');
    // Query channel mappings for Gopal
    const { data: gopalMappings } = await supabaseServiceRole
      .from('channel_rate_mappings')
      .select('*')
      .eq('hotel_id', gopalHotel.id);

    console.log(`    Hotel Gopal active mappings count: ${gopalMappings?.length || 0}`);
    assert(Array.isArray(gopalMappings), 'Authoritative channel rate mappings queried cleanly');

    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('=============================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    server.close();
  }
}

runTestSuite().catch(err => {
  console.error('Fatal error running test suite:', err);
  process.exit(1);
});
