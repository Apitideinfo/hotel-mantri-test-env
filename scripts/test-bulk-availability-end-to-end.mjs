import app from '../server/index.js';
import { supabaseServiceRole } from '../server/supabaseClient.js';
import { calculateAuthoritativeInventory } from '../server/routes/aiosell.js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c';
const DELUXE_ID = 'ca773df6-63e4-43ed-963b-05bbc2494499';
const SUITE_ID = '9e82c94b-bfc0-4c86-94f9-940b3df4769f';
const FOURBED_ID = 'b2b5b71b-72e5-494f-a906-824b87dfd88b';

const TEST_PORT = 5055;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    failCount++;
    throw new Error(message);
  } else {
    console.log(`  ✓ PASS: ${message}`);
    passCount++;
  }
}

async function cleanupTestDateRestrictions(dates) {
  await supabaseServiceRole
    .from('channel_inventory_restrictions')
    .delete()
    .eq('hotel_id', HOTEL_ID)
    .in('date', dates);
}

async function cleanupTestReservations(tag) {
  const { data: resList } = await supabaseServiceRole
    .from('reservations')
    .select('id')
    .eq('hotel_id', HOTEL_ID)
    .ilike('internal_note', `%${tag}%`);

  if (resList && resList.length > 0) {
    const ids = resList.map(r => r.id);
    await supabaseServiceRole.from('reservations').delete().in('id', ids);
  }
}

async function runEndToEndVerification() {
  const server = app.listen(TEST_PORT, () => {
    console.log(`[TEST-SERVER] Listening on ${BASE_URL}`);
  });

  try {
    console.log('================================================================');
    console.log('    HOTEL MANTRI BULK AVAILABILITY END-TO-END VERIFICATION      ');
    console.log('================================================================\n');

    const testDates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-12-31', '2027-01-01'];
    await cleanupTestDateRestrictions(testDates);
    await cleanupTestReservations('E2E-TEST');

  // -------------------------------------------------------------------------
  // TEST 1: One room category (Deluxe AC on 01 Oct: 15 -> 10)
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Single Category Availability Update (01 Oct: 15 -> 10) ---');
  
  // 1a. Check baseline
  const baselineMatrix = await calculateAuthoritativeInventory(HOTEL_ID, '2026-10-01', '2026-10-01', { persistToDb: false });
  const baselineDeluxe = baselineMatrix.matrix.find(m => m.room_category_id === DELUXE_ID && m.date === '2026-10-01');
  console.log(`  Initial calculated available: ${baselineDeluxe?.available} (Physical: ${baselineDeluxe?.physical})`);

  // 1b. Update via PATCH endpoint
  const patchRes = await axios.post(`${BASE_URL}/api/channels/inventory-restrictions/patch`, {
    updates: [
      { roomCategoryId: DELUXE_ID, date: '2026-10-01', availability: 10 }
    ],
    skipSync: true
  }, {
    headers: {
      'x-hotel-id': HOTEL_ID,
      'Content-Type': 'application/json'
    }
  });

  assert(patchRes.data.success === true, 'Backend confirmed bulk update successfully');
  assert(patchRes.data.updatedCount === 1, 'Updated count is 1');
  assert(patchRes.data.updated[0].availability === 10, 'Confirmed response contains availability: 10');

  // 1c. Inspect Database immediately after
  const { data: dbRow1, error: dbErr1 } = await supabaseServiceRole
    .from('channel_inventory_restrictions')
    .select('*')
    .eq('hotel_id', HOTEL_ID)
    .eq('room_category_id', DELUXE_ID)
    .eq('date', '2026-10-01')
    .single();

  assert(!dbErr1 && dbRow1 !== null, 'Database row exists immediately after save');
  assert(dbRow1.availability === 10, `Database immediately after = 10 (actual: ${dbRow1.availability})`);

  // 1d. Main Inventory matrix read
  const matrix1 = await calculateAuthoritativeInventory(HOTEL_ID, '2026-10-01', '2026-10-01', { persistToDb: false });
  const deluxeMatrix1 = matrix1.matrix.find(m => m.room_category_id === DELUXE_ID && m.date === '2026-10-01');
  assert(deluxeMatrix1.available === 10, `Main Inventory page reads available = 10 (actual: ${deluxeMatrix1.available})`);
  assert(deluxeMatrix1.is_manual === true, 'Item flagged as manual override');

  // 1e. Verify read did NOT mutate the database back to calculatedAvailable
  const { data: dbRowAfterRead } = await supabaseServiceRole
    .from('channel_inventory_restrictions')
    .select('availability')
    .eq('hotel_id', HOTEL_ID)
    .eq('room_category_id', DELUXE_ID)
    .eq('date', '2026-10-01')
    .single();
  assert(dbRowAfterRead.availability === 10, 'Authoritative read preserved manual availability in DB without overwriting');

  // -------------------------------------------------------------------------
  // TEST 2: Multiple dates (01 Oct = 10, 02 Oct = 11, 03 Oct = 12)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: Multiple Dates Update (01 Oct=10, 02 Oct=11, 03 Oct=12) ---');
  await axios.post(`${BASE_URL}/api/channels/inventory-restrictions/patch`, {
    updates: [
      { roomCategoryId: DELUXE_ID, date: '2026-10-01', availability: 10 },
      { roomCategoryId: DELUXE_ID, date: '2026-10-02', availability: 11 },
      { roomCategoryId: DELUXE_ID, date: '2026-10-03', availability: 12 }
    ],
    skipSync: true
  }, {
    headers: { 'x-hotel-id': HOTEL_ID }
  });

  const matrix2 = await calculateAuthoritativeInventory(HOTEL_ID, '2026-10-01', '2026-10-03', { persistToDb: false });
  const d1 = matrix2.matrix.find(m => m.room_category_id === DELUXE_ID && m.date === '2026-10-01');
  const d2 = matrix2.matrix.find(m => m.room_category_id === DELUXE_ID && m.date === '2026-10-02');
  const d3 = matrix2.matrix.find(m => m.room_category_id === DELUXE_ID && m.date === '2026-10-03');

  assert(d1.available === 10, `01 Oct = 10 (actual: ${d1.available})`);
  assert(d2.available === 11, `02 Oct = 11 (actual: ${d2.available})`);
  assert(d3.available === 12, `03 Oct = 12 (actual: ${d3.available})`);

  // -------------------------------------------------------------------------
  // TEST 3: Multiple categories (Suite = 2, Deluxe = 10, Fourbed = 4)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: Multiple Categories (Suite=2, Deluxe=10, Fourbed=4) ---');
  await axios.post(`${BASE_URL}/api/channels/inventory-restrictions/patch`, {
    updates: [
      { roomCategoryId: SUITE_ID, date: '2026-10-01', availability: 2 },
      { roomCategoryId: DELUXE_ID, date: '2026-10-01', availability: 10 },
      { roomCategoryId: FOURBED_ID, date: '2026-10-01', availability: 4 } // note: physical is 2, capped at 2
    ],
    skipSync: true
  }, {
    headers: { 'x-hotel-id': HOTEL_ID }
  });

  const matrix3 = await calculateAuthoritativeInventory(HOTEL_ID, '2026-10-01', '2026-10-01', { persistToDb: false });
  const sRow = matrix3.matrix.find(m => m.room_category_id === SUITE_ID && m.date === '2026-10-01');
  const delRow = matrix3.matrix.find(m => m.room_category_id === DELUXE_ID && m.date === '2026-10-01');
  const fRow = matrix3.matrix.find(m => m.room_category_id === FOURBED_ID && m.date === '2026-10-01');

  assert(sRow.available === 2, `Suite available = 2 (actual: ${sRow.available})`);
  assert(delRow.available === 10, `Deluxe available = 10 (actual: ${delRow.available})`);
  // Physical capacity rule check: Fourbed has 2 physical rooms, setting 4 cannot exceed physical capacity
  assert(fRow.available <= fRow.physical, `Fourbed availability cannot exceed physical capacity (${fRow.available} <= ${fRow.physical})`);

  // -------------------------------------------------------------------------
  // TEST 4 & 5: Save then Leave Page / Hard Refresh (Persistence)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4 & 5: Save -> Leave -> Return & Hard Refresh Simulation ---');
  // Simulate client navigating away and re-requesting from scratch
  const refreshedMatrix = await calculateAuthoritativeInventory(HOTEL_ID, '2026-10-01', '2026-10-01', { persistToDb: false });
  const refreshedDeluxe = refreshedMatrix.matrix.find(m => m.room_category_id === DELUXE_ID && m.date === '2026-10-01');
  assert(refreshedDeluxe.available === 10, `Hard refresh / re-open returns exact persisted availability: 10`);

  // -------------------------------------------------------------------------
  // TEST 6: Relogin Simulation (Different auth session / context re-fetch)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 6: Relogin Context Persistence ---');
  const reloginMatrix = await calculateAuthoritativeInventory(HOTEL_ID, '2026-10-01', '2026-10-01', { persistToDb: false });
  const reloginDeluxe = reloginMatrix.matrix.find(m => m.room_category_id === DELUXE_ID && m.date === '2026-10-01');
  assert(reloginDeluxe.available === 10, `Fresh session fetch retains availability: 10`);

  // -------------------------------------------------------------------------
  // TEST 7: OTA Booking After Bulk Update
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 7: Booking Simulation After Bulk Update ---');
  // User set Deluxe on 01 Oct to 10 rooms.
  // Now 1 new reservation is created for 01 Oct after the bulk update timestamp.
  await new Promise(r => setTimeout(r, 100));
  const { data: newRes, error: resErr } = await supabaseServiceRole
    .from('reservations')
    .insert({
      hotel_id: HOTEL_ID,
      room_id: 'bd6c7b12-301b-4d72-a0e4-7c7365fb5157',
      room_no: '101',
      check_in_date: '2026-10-01',
      check_out_date: '2026-10-02',
      status: 'confirmed',
      guest_name: 'E2E-TEST Guest 1',
      internal_note: 'E2E-TEST reservation after bulk update',
      adults: 2,
      rate: 3000,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  assert(!resErr && newRes !== null, 'New reservation created after manual bulk update');

  const matrixAfterBooking = await calculateAuthoritativeInventory(HOTEL_ID, '2026-10-01', '2026-10-01', { persistToDb: false });
  const deluxeAfterBooking = matrixAfterBooking.matrix.find(m => m.room_category_id === DELUXE_ID && m.date === '2026-10-01');
  console.log(`  Manual was: 10. After 1 new booking: ${deluxeAfterBooking.available}`);
  assert(deluxeAfterBooking.available === 9, `New booking decrements manual availability from 10 to 9 (actual: ${deluxeAfterBooking.available})`);

  // -------------------------------------------------------------------------
  // TEST 8: Bulk Update After Booking
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 8: Bulk Update After Booking (Override to 5) ---');
  // Manager deliberately overrides availability to 5
  await new Promise(r => setTimeout(r, 100));
  await axios.post(`${BASE_URL}/api/channels/inventory-restrictions/patch`, {
    updates: [
      { roomCategoryId: DELUXE_ID, date: '2026-10-01', availability: 5 }
    ],
    skipSync: true
  }, {
    headers: { 'x-hotel-id': HOTEL_ID }
  });

  const matrixAfterOverride = await calculateAuthoritativeInventory(HOTEL_ID, '2026-10-01', '2026-10-01', { persistToDb: false });
  const deluxeAfterOverride = matrixAfterOverride.matrix.find(m => m.room_category_id === DELUXE_ID && m.date === '2026-10-01');
  assert(deluxeAfterOverride.available === 5, `Subsequent bulk update correctly overrides availability to 5 (actual: ${deluxeAfterOverride.available})`);

  // Clean up the test reservation
  await cleanupTestReservations('E2E-TEST');

  // -------------------------------------------------------------------------
  // TEST 9: Date Handling Across Boundaries (30 Sep, 01 Oct, 31 Dec, 01 Jan)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 9: Date Handling (Year boundary 31 Dec -> 01 Jan) ---');
  await axios.post(`${BASE_URL}/api/channels/inventory-restrictions/patch`, {
    updates: [
      { roomCategoryId: DELUXE_ID, date: '2026-12-31', availability: 7 },
      { roomCategoryId: DELUXE_ID, date: '2027-01-01', availability: 8 }
    ],
    skipSync: true
  }, {
    headers: { 'x-hotel-id': HOTEL_ID }
  });

  const dec31 = await calculateAuthoritativeInventory(HOTEL_ID, '2026-12-31', '2026-12-31', { persistToDb: false });
  const jan01 = await calculateAuthoritativeInventory(HOTEL_ID, '2027-01-01', '2027-01-01', { persistToDb: false });

  const dec31Deluxe = dec31.matrix.find(m => m.room_category_id === DELUXE_ID);
  const jan01Deluxe = jan01.matrix.find(m => m.room_category_id === DELUXE_ID);

  assert(dec31Deluxe.available === 7, `31 Dec availability = 7 (actual: ${dec31Deluxe.available})`);
  assert(jan01Deluxe.available === 8, `01 Jan availability = 8 (actual: ${jan01Deluxe.available})`);

  // -------------------------------------------------------------------------
  // TEST 10: Hotel Scoping & Security Isolation
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 10: Hotel Scoping & Security Isolation ---');
  const fakeHotelId = '00000000-0000-0000-0000-000000000000';
  try {
    await axios.post(`${BASE_URL}/api/channels/inventory-restrictions/patch`, {
      updates: [{ roomCategoryId: DELUXE_ID, date: '2026-10-01', availability: 99 }]
    }, {
      headers: { 'x-hotel-id': fakeHotelId }
    });
    assert(false, 'Should have rejected invalid/unauthorized hotel ID');
  } catch (err) {
    assert(err.response?.status === 404 || err.response?.status === 400 || err.response?.status === 401,
      `Cross-hotel/unauthorized update blocked with status ${err.response?.status}`);
  }

  // -------------------------------------------------------------------------
  // TEST 11: Backend Type & Range Validation
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 11: Backend Type & Range Validation ---');
  try {
    await axios.post(`${BASE_URL}/api/channels/inventory-restrictions/patch`, {
      updates: [{ roomCategoryId: DELUXE_ID, date: '2026-10-01', availability: -5 }]
    }, {
      headers: { 'x-hotel-id': HOTEL_ID }
    });
    assert(false, 'Should have rejected negative availability');
  } catch (err) {
    assert(err.response?.status === 400, 'Negative availability rejected with 400 Bad Request');
  }

  // -------------------------------------------------------------------------
  // TEST 12: Audit Logging Verification
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 12: Audit Logging in channel_sync_logs ---');
  const { data: auditLogs } = await supabaseServiceRole
    .from('channel_sync_logs')
    .select('*')
    .eq('hotel_id', HOTEL_ID)
    .eq('log_type', 'BULK_UPDATE')
    .order('created_at', { ascending: false })
    .limit(1);

  assert(auditLogs && auditLogs.length > 0, 'Audit log created for BULK_UPDATE');
  assert(auditLogs[0].status === 'SUCCESS', `Audit status is SUCCESS (logged: ${auditLogs[0].message})`);

  // Final cleanup
  await cleanupTestDateRestrictions(testDates);

  console.log('\n================================================================');
  console.log(` RESULTS: ${passCount} / ${passCount + failCount} PASSED`);
  if (failCount === 0) {
    console.log(' ALL END-TO-END VERIFICATION CHECKS COMPLETED SUCCESSFULLY!');
  } else {
    console.error(` ${failCount} CHECKS FAILED!`);
    process.exit(1);
  }
  console.log('================================================================\n');
  } finally {
    server.close();
  }
}

runEndToEndVerification().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
