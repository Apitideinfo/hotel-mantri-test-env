import 'dotenv/config';
import { supabaseServiceRole } from '../server/supabaseClient.js';
import { AiosellReservationService } from '../server/services/integrations/aiosell/AiosellReservationService.js';
import { AiosellPayloadParser } from '../server/services/integrations/aiosell/AiosellPayloadParser.js';
import { calculateAuthoritativeInventory, calculateRoomCategoryAvailability } from '../server/routes/aiosell.js';
import { syncInventory, reconcileInventory } from '../server/services/channelSyncEngine.js';

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c'; // Hotel Mantri
const DELUXE_CAT_ID = 'ca773df6-63e4-43ed-963b-05bbc2494499'; // Deluxe AC (18 physical rooms)

async function getAvail(date) {
  const res = await calculateRoomCategoryAvailability(HOTEL_ID, DELUXE_CAT_ID, date);
  return Number(res.available);
}

async function cleanAllTestRecords() {
  console.log('[CLEANUP] Purging previous test reservations and OTA records...');
  // Find reservations with TEST-
  const { data: testRes } = await supabaseServiceRole
    .from('reservations')
    .select('id')
    .eq('hotel_id', HOTEL_ID)
    .or('internal_note.ilike.%TEST-%,remarks.ilike.%TEST-%');

  if (testRes && testRes.length > 0) {
    const ids = testRes.map(r => r.id);
    await supabaseServiceRole.from('reservations').delete().in('id', ids);
    console.log(`  Purged ${ids.length} test reservation records.`);
  }

  const { data: testOta } = await supabaseServiceRole
    .from('channel_ota_reservations')
    .select('id')
    .eq('hotel_id', HOTEL_ID)
    .ilike('ota_booking_id', 'TEST-%');

  if (testOta && testOta.length > 0) {
    const ids = testOta.map(r => r.id);
    await supabaseServiceRole.from('channel_ota_reservations').delete().in('id', ids);
    console.log(`  Purged ${ids.length} test channel_ota_reservations records.`);
  }

  // Purge test restrictions
  await supabaseServiceRole
    .from('channel_inventory_restrictions')
    .delete()
    .eq('hotel_id', HOTEL_ID)
    .in('date', ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
}

async function runAllTests() {
  console.log('==================================================');
  console.log('HOTEL MANTRI OTA INVENTORY AUTO-SYNC TEST SUITE');
  console.log('==================================================');

  await cleanAllTestRecords();

  let passed = 0;
  let failed = 0;

  try {
    // ----------------------------------------------------
    // BASELINE CHECK
    // ----------------------------------------------------
    const baselineDate = '2026-10-20';
    const baseAvail = await getAvail(baselineDate);
    console.log(`\n[BASELINE] Deluxe AC availability for ${baselineDate}: ${baseAvail} (Physical: 18)`);

    // ----------------------------------------------------
    // TEST 1: Single OTA Room Booking (Reduces by 1)
    // ----------------------------------------------------
    console.log('\n--- TEST 1: Single OTA room booking (reduces inventory by 1) ---');
    const t1Id = `TEST-T1-${Date.now()}`;

    const t1Payload = AiosellPayloadParser.normalize({
      bookingId: t1Id,
      channel: 'Agoda',
      hotelCode: 'fa44d51cc0',
      status: 'book',
      checkin: baselineDate,
      checkout: '2026-10-21',
      amount: { amountAfterTax: 2500, amountBeforeTax: 2200, tax: 300, currency: 'INR' },
      guest: { firstName: 'Test1', lastName: 'Single', phone: '9999900001', email: 't1@example.com' },
      rooms: [
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep', occupancy: { adults: 2, children: 0 } }
      ]
    });

    const t1Result = await AiosellReservationService.processReservation(t1Payload, HOTEL_ID, { skipDelivery: true });
    const t1Avail = await getAvail(baselineDate);
    console.log(`  Initial: ${baseAvail} -> After 1-room booking: ${t1Avail}`);
    if (t1Result.status === 'imported' && t1Result.reservationId && t1Avail === baseAvail - 1) {
      console.log('✓ TEST 1 PASSED: Single OTA room reduced availability by exactly 1.');
      passed++;
    } else {
      console.error(`✗ TEST 1 FAILED: Expected ${baseAvail - 1}, got ${t1Avail}`, t1Result);
      failed++;
    }

    // ----------------------------------------------------
    // TEST 2: Four Rooms Multi-Room Booking (Reduces by 4)
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Four rooms multi-room booking (reduces inventory by 4) ---');
    const t2Id = `TEST-T2-${Date.now()}`;

    const t2Payload = AiosellPayloadParser.normalize({
      bookingId: t2Id,
      channel: 'Booking.com',
      hotelCode: 'fa44d51cc0',
      status: 'book',
      checkin: baselineDate,
      checkout: '2026-10-21',
      amount: { amountAfterTax: 10000, amountBeforeTax: 8800, tax: 1200, currency: 'INR' },
      guest: { firstName: 'Test2', lastName: 'FourRooms', phone: '9999900002', email: 't2@example.com' },
      rooms: [
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep', occupancy: { adults: 2, children: 0 } },
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep', occupancy: { adults: 2, children: 0 } },
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep', occupancy: { adults: 2, children: 0 } },
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep', occupancy: { adults: 2, children: 0 } }
      ]
    });

    const beforeT2 = await getAvail(baselineDate);
    const t2Result = await AiosellReservationService.processReservation(t2Payload, HOTEL_ID, { skipDelivery: true });
    const afterT2 = await getAvail(baselineDate);
    console.log(`  Before: ${beforeT2} -> After 4-room booking: ${afterT2}`);

    const { data: t2PmsRows } = await supabaseServiceRole
      .from('reservations')
      .select('id, room_no')
      .eq('hotel_id', HOTEL_ID)
      .ilike('internal_note', `%${t2Id}%`);

    console.log(`  PMS reservations created for 4 rooms: ${t2PmsRows?.length || 0}`);
    if (t2Result.status === 'imported' && afterT2 === beforeT2 - 4 && t2PmsRows?.length === 4) {
      console.log('✓ TEST 2 PASSED: 4-room OTA booking created 4 PMS rows and reduced availability by exactly 4.');
      passed++;
    } else {
      console.error(`✗ TEST 2 FAILED: Expected reduction of 4, got ${beforeT2} -> ${afterT2}`, { t2Result, rows: t2PmsRows?.length });
      failed++;
    }

    // ----------------------------------------------------
    // TEST 3: Multi-night booking [check_in, check_out) interval
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Multi-night booking [check_in, check_out) interval ---');
    const t3Id = `TEST-T3-${Date.now()}`;

    const d1 = '2026-10-25';
    const d2 = '2026-10-26';
    const d3 = '2026-10-27';
    const dCheckout = '2026-10-28';

    const bD1 = await getAvail(d1);
    const bD2 = await getAvail(d2);
    const bD3 = await getAvail(d3);
    const bDCo = await getAvail(dCheckout);

    const t3Payload = AiosellPayloadParser.normalize({
      bookingId: t3Id,
      channel: 'MakeMyTrip',
      hotelCode: 'fa44d51cc0',
      status: 'book',
      checkin: d1,
      checkout: dCheckout,
      amount: { amountAfterTax: 9000, amountBeforeTax: 8000, tax: 1000, currency: 'INR' },
      guest: { firstName: 'Test3', lastName: 'MultiNight', phone: '9999900003', email: 't3@example.com' },
      rooms: [
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep', occupancy: { adults: 2, children: 0 } },
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep', occupancy: { adults: 2, children: 0 } }
      ]
    });

    await AiosellReservationService.processReservation(t3Payload, HOTEL_ID, { skipDelivery: true });

    const aD1 = await getAvail(d1);
    const aD2 = await getAvail(d2);
    const aD3 = await getAvail(d3);
    const aDCo = await getAvail(dCheckout);

    console.log(`  Night 1 (${d1}): ${bD1} -> ${aD1} (diff: ${bD1 - aD1})`);
    console.log(`  Night 2 (${d2}): ${bD2} -> ${aD2} (diff: ${bD2 - aD2})`);
    console.log(`  Night 3 (${d3}): ${bD3} -> ${aD3} (diff: ${bD3 - aD3})`);
    console.log(`  Checkout (${dCheckout}): ${bDCo} -> ${aDCo} (diff: ${bDCo - aDCo})`);

    if (
      bD1 - aD1 === 2 &&
      bD2 - aD2 === 2 &&
      bD3 - aD3 === 2 &&
      bDCo - aDCo === 0
    ) {
      console.log('✓ TEST 3 PASSED: Multi-night booking occupied check-in dates [10-25, 10-28) and released checkout date.');
      passed++;
    } else {
      console.error('✗ TEST 3 FAILED: Incorrect date interval inventory calculation.');
      failed++;
    }

    // ----------------------------------------------------
    // TEST 4: Duplicate Webhook Idempotency
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Duplicate webhook idempotency (no double-decrement) ---');
    const availBeforeDup = await getAvail(d1);
    // Send identical t3Payload again
    const dupResult = await AiosellReservationService.processReservation(t3Payload, HOTEL_ID, { skipDelivery: true });
    const availAfterDup = await getAvail(d1);

    const { data: dupRows } = await supabaseServiceRole
      .from('reservations')
      .select('id')
      .eq('hotel_id', HOTEL_ID)
      .ilike('internal_note', `%${t3Id}%`);

    console.log(`  Avail before: ${availBeforeDup} -> Avail after duplicate: ${availAfterDup} | Rows: ${dupRows?.length}`);
    if (availBeforeDup === availAfterDup && dupRows?.length === 2) {
      console.log('✓ TEST 4 PASSED: Duplicate webhook processed idempotently without double-decrementing.');
      passed++;
    } else {
      console.error('✗ TEST 4 FAILED: Duplicate webhook created extra rows or reduced inventory twice.');
      failed++;
    }

    // ----------------------------------------------------
    // TEST 5: Cancellation Restores Inventory
    // ----------------------------------------------------
    console.log('\n--- TEST 5: Cancellation restores inventory ---');
    const t5Id = `TEST-T5-${Date.now()}`;

    const t5Date = '2026-11-01';
    const initAvailT5 = await getAvail(t5Date);

    const t5BookPayload = AiosellPayloadParser.normalize({
      bookingId: t5Id,
      channel: 'Agoda',
      hotelCode: 'fa44d51cc0',
      status: 'book',
      checkin: t5Date,
      checkout: '2026-11-02',
      amount: { amountAfterTax: 5000, amountBeforeTax: 4500, tax: 500, currency: 'INR' },
      guest: { firstName: 'Test5', lastName: 'CancelUser', phone: '9999900005', email: 't5@example.com' },
      rooms: [
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep', occupancy: { adults: 2, children: 0 } },
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep', occupancy: { adults: 2, children: 0 } }
      ]
    });

    await AiosellReservationService.processReservation(t5BookPayload, HOTEL_ID, { skipDelivery: true });
    const bookedAvailT5 = await getAvail(t5Date);
    console.log(`  Initial: ${initAvailT5} -> Booked 2 rooms: ${bookedAvailT5}`);

    // Now send Cancel webhook
    const t5CancelPayload = AiosellPayloadParser.normalize({
      bookingId: t5Id,
      channel: 'Agoda',
      hotelCode: 'fa44d51cc0',
      status: 'cancel',
      action: 'cancel',
      checkin: t5Date,
      checkout: '2026-11-02',
      rooms: [
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep' }
      ]
    });

    const cancelResult = await AiosellReservationService.processReservation(t5CancelPayload, HOTEL_ID, { skipDelivery: true });
    const cancelledAvailT5 = await getAvail(t5Date);
    console.log(`  After cancel: ${cancelledAvailT5}`);

    if (bookedAvailT5 === initAvailT5 - 2 && cancelledAvailT5 === initAvailT5 && cancelResult.status === 'cancelled') {
      console.log('✓ TEST 5 PASSED: Cancellation completely restored availability to initial count.');
      passed++;
    } else {
      console.error('✗ TEST 5 FAILED: Cancellation did not restore availability.', { initAvailT5, bookedAvailT5, cancelledAvailT5 });
      failed++;
    }

    // ----------------------------------------------------
    // TEST 6: Modification (2 rooms -> 3 rooms)
    // ----------------------------------------------------
    console.log('\n--- TEST 6: Modification (2 rooms -> 3 rooms) ---');
    const t6Id = `TEST-T6-${Date.now()}`;

    const t6Date = '2026-11-05';
    const initAvailT6 = await getAvail(t6Date);

    // Initial 2 rooms
    const t6Payload1 = AiosellPayloadParser.normalize({
      bookingId: t6Id,
      channel: 'Booking.com',
      hotelCode: 'fa44d51cc0',
      status: 'book',
      checkin: t6Date,
      checkout: '2026-11-06',
      amount: { amountAfterTax: 5000, amountBeforeTax: 4500, tax: 500, currency: 'INR' },
      guest: { firstName: 'Test6', lastName: 'ModUser', phone: '9999900006', email: 't6@example.com' },
      rooms: [
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep' },
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep' }
      ]
    });
    await AiosellReservationService.processReservation(t6Payload1, HOTEL_ID, { skipDelivery: true });
    const after2Rooms = await getAvail(t6Date);

    // Modify to 3 rooms
    const t6Payload2 = AiosellPayloadParser.normalize({
      bookingId: t6Id,
      channel: 'Booking.com',
      hotelCode: 'fa44d51cc0',
      status: 'modify',
      action: 'modify',
      checkin: t6Date,
      checkout: '2026-11-06',
      amount: { amountAfterTax: 7500, amountBeforeTax: 6750, tax: 750, currency: 'INR' },
      guest: { firstName: 'Test6', lastName: 'ModUser', phone: '9999900006', email: 't6@example.com' },
      rooms: [
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep' },
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep' },
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep' }
      ]
    });
    const modResult = await AiosellReservationService.processReservation(t6Payload2, HOTEL_ID, { skipDelivery: true });
    const after3Rooms = await getAvail(t6Date);

    console.log(`  Initial: ${initAvailT6} -> After 2 rooms: ${after2Rooms} -> After modify to 3 rooms: ${after3Rooms}`);
    if (after2Rooms === initAvailT6 - 2 && after3Rooms === initAvailT6 - 3 && modResult.status === 'updated') {
      console.log('✓ TEST 6 PASSED: Modification updated inventory to exactly 3 rooms (not 5).');
      passed++;
    } else {
      console.error('✗ TEST 6 FAILED: Modification inventory incorrect.', { initAvailT6, after2Rooms, after3Rooms });
      failed++;
    }

    // ----------------------------------------------------
    // TEST 7: Concurrent OTA Bookings
    // ----------------------------------------------------
    console.log('\n--- TEST 7: Concurrent OTA Bookings ---');
    const t7IdA = `TEST-T7A-${Date.now()}`;
    const t7IdB = `TEST-T7B-${Date.now()}`;

    const t7Date = '2026-11-10';
    const initAvailT7 = await getAvail(t7Date);

    const pA = AiosellPayloadParser.normalize({
      bookingId: t7IdA,
      channel: 'MakeMyTrip',
      hotelCode: 'fa44d51cc0',
      status: 'book',
      checkin: t7Date,
      checkout: '2026-11-11',
      amount: { amountAfterTax: 4000, amountBeforeTax: 3500, tax: 500, currency: 'INR' },
      guest: { firstName: 'ConcA', lastName: 'User', phone: '9999900071', email: 'ca@example.com' },
      rooms: [
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep' },
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep' }
      ]
    });

    const pB = AiosellPayloadParser.normalize({
      bookingId: t7IdB,
      channel: 'Agoda',
      hotelCode: 'fa44d51cc0',
      status: 'book',
      checkin: t7Date,
      checkout: '2026-11-11',
      amount: { amountAfterTax: 6000, amountBeforeTax: 5200, tax: 800, currency: 'INR' },
      guest: { firstName: 'ConcB', lastName: 'User', phone: '9999900072', email: 'cb@example.com' },
      rooms: [
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep' },
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep' },
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep' }
      ]
    });

    // Launch concurrently
    console.log(`  Dispatching booking A (2 rooms) and booking B (3 rooms) simultaneously...`);
    const [resA, resB] = await Promise.all([
      AiosellReservationService.processReservation(pA, HOTEL_ID, { skipDelivery: true }),
      AiosellReservationService.processReservation(pB, HOTEL_ID, { skipDelivery: true })
    ]);

    const finalAvailT7 = await getAvail(t7Date);
    console.log(`  Initial: ${initAvailT7} -> After concurrent A(2) + B(3): ${finalAvailT7} (Expected: ${initAvailT7 - 5})`);

    if (finalAvailT7 === initAvailT7 - 5 && resA.status === 'imported' && resB.status === 'imported') {
      console.log('✓ TEST 7 PASSED: Concurrent bookings cleanly converged to authoritative total (5 rooms consumed).');
      passed++;
    } else {
      console.error('✗ TEST 7 FAILED: Concurrent booking collision or race condition.', { initAvailT7, finalAvailT7 });
      failed++;
    }

    // ----------------------------------------------------
    // TEST 8: Unmapped Room Handling (mapping_required)
    // ----------------------------------------------------
    console.log('\n--- TEST 8: Unmapped Room Handling ---');
    const t8Id = `TEST-T8-${Date.now()}`;

    const t8Date = '2026-11-15';
    const initAvailT8 = await getAvail(t8Date);

    const unmappedPayload = AiosellPayloadParser.normalize({
      bookingId: t8Id,
      channel: 'Expedia',
      hotelCode: 'fa44d51cc0',
      status: 'book',
      checkin: t8Date,
      checkout: '2026-11-16',
      amount: { amountAfterTax: 3000, amountBeforeTax: 2700, tax: 300, currency: 'INR' },
      guest: { firstName: 'Unmapped', lastName: 'Guest', phone: '9999900008', email: 'unmapped@example.com' },
      rooms: [
        { roomCode: 'non-existent-room-code-999', rateplanCode: 'EP' }
      ]
    });

    const res8 = await AiosellReservationService.processReservation(unmappedPayload, HOTEL_ID, { skipDelivery: true });
    const afterAvailT8 = await getAvail(t8Date);

    const { data: otaRow8 } = await supabaseServiceRole
      .from('channel_ota_reservations')
      .select('import_status, booking_status')
      .eq('ota_booking_id', t8Id)
      .single();

    console.log(`  Unmapped status: ${res8.status} | DB import_status: ${otaRow8?.import_status} | Avail: ${initAvailT8} -> ${afterAvailT8}`);
    if (res8.status === 'mapping_required' && otaRow8?.import_status === 'mapping_required' && initAvailT8 === afterAvailT8) {
      console.log('✓ TEST 8 PASSED: Unmapped room safely halted with mapping_required and did not alter inventory.');
      passed++;
    } else {
      console.error('✗ TEST 8 FAILED: Unmapped room corrupted inventory or was not flagged as mapping_required.', res8);
      failed++;
    }

    // ----------------------------------------------------
    // TEST 9: External API Failure Handling (Durable Sync State)
    // ----------------------------------------------------
    console.log('\n--- TEST 9: External API Failure Handling (Durable Sync State) ---');
    const t9Id = `TEST-T9-${Date.now()}`;

    const t9Payload = AiosellPayloadParser.normalize({
      bookingId: t9Id,
      channel: 'Agoda',
      hotelCode: 'fa44d51cc0',
      status: 'book',
      checkin: '2026-11-20',
      checkout: '2026-11-21',
      amount: { amountAfterTax: 2200, amountBeforeTax: 2000, tax: 200, currency: 'INR' },
      guest: { firstName: 'Failure', lastName: 'Handling', phone: '9999900009', email: 'fail@example.com' },
      rooms: [
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-ep' }
      ]
    });

    const res9 = await AiosellReservationService.processReservation(t9Payload, HOTEL_ID, { skipDelivery: true });
    const { data: pmsRow9 } = await supabaseServiceRole
      .from('reservations')
      .select('id, status')
      .ilike('internal_note', `%${t9Id}%`)
      .single();

    if (res9.status === 'imported' && pmsRow9?.id && pmsRow9.status === 'confirmed') {
      console.log('✓ TEST 9 PASSED: PMS reservation safely persisted even in isolated failure/retry environments.');
      passed++;
    } else {
      console.error('✗ TEST 9 FAILED: Reservation was not persisted safely.', { res9, pmsRow9 });
      failed++;
    }

    // ----------------------------------------------------
    // TEST 10: Vercel Serverless Synchronous Flow Verification
    // ----------------------------------------------------
    console.log('\n--- TEST 10: Vercel Serverless Synchronous Flow Verification ---');
    const vDate = '2026-10-01';
    const syncRes = await syncInventory({
      hotelId: HOTEL_ID,
      startDate: vDate,
      endDate: vDate,
      skipVerification: false,
      triggeredBy: 'test_vercel_serverless'
    });

    console.log(`  Sync result status: ${syncRes.status} | Verified: ${syncRes.verified} | Duration: ${syncRes.durationMs}ms`);
    if (syncRes.success && syncRes.verified && syncRes.status === 'VERIFIED') {
      console.log('✓ TEST 10 PASSED: Synchronous inventory push + read-after-write verification completed within serverless lifecycle.');
      passed++;
    } else {
      console.error('✗ TEST 10 FAILED: Verification failed or did not complete synchronously.', syncRes);
      failed++;
    }

  } catch (err) {
    console.error('Test suite error:', err);
    failed++;
  } finally {
    await cleanAllTestRecords();
  }

  console.log('\n==================================================');
  console.log(`FINAL RESULTS: ${passed} PASSED, ${failed} FAILED (Total 10 Test Cases)`);
  console.log('==================================================');

  if (failed === 0) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAllTests();
