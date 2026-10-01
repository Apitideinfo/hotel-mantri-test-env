import { supabaseServiceRole } from '../server/supabaseClient.js';
import {
  autoAssignPhysicalRoom,
  resolveHotelRoomCategory,
  batchAutoAssignReservations,
  isAutoAssignEnabled,
  setAutoAssignEnabled,
} from '../server/services/RoomAssignmentService.js';
import {
  checkRoomAvailability,
  isStayOverlapping,
} from '../server/services/ReservationConflictService.js';
import {
  createOrUpdateReservation,
  cancelReservation,
  findAvailablePhysicalRoom,
} from '../server/services/integrations/aiosell/HotelMantriReservationService.js';
import { processAiosellReservation } from '../server/services/integrations/aiosell/AiosellReservationService.js';

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c'; // Hotel Gopal

const results = {};

const record = (testName, pass, details = '') => {
  results[testName] = { status: pass ? 'PASS' : 'FAIL', details };
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${testName}${details ? ` -> ${details}` : ''}`);
};

const cleanupTestReservations = async (tag) => {
  const { data } = await supabaseServiceRole
    .from('reservations')
    .select('id')
    .eq('hotel_id', HOTEL_ID)
    .or(`guest_name.ilike.%${tag}%,internal_note.ilike.%${tag}%,remarks.ilike.%${tag}%`);

  if (data && data.length > 0) {
    const ids = data.map((r) => r.id);
    await supabaseServiceRole.from('reservations').delete().in('id', ids).eq('hotel_id', HOTEL_ID);
  }

  await supabaseServiceRole
    .from('channel_ota_reservations')
    .delete()
    .eq('hotel_id', HOTEL_ID)
    .ilike('ota_booking_id', `%${tag}%`);
};

const runSuite = async () => {
  console.log('=== STARTING OTA AUTO-ASSIGNMENT REGRESSION TEST SUITE ===\n');
  const testTag = `TEST_${Date.now()}`;

  try {
    // TEST 1: OTA new reservation import
    console.log('\n--- 1. OTA NEW RESERVATION ---');
    const bookingId1 = `${testTag}_NEW_01`;
    const payload1 = {
      action: 'book',
      bookingId: bookingId1,
      hotelCode: 'fa44d51cc0',
      channel: 'Goibibo',
      checkin: '2026-11-01',
      checkout: '2026-11-03',
      guest: { firstName: 'TestNewGuest', lastName: 'Alpha', phone: '9876543210', email: 'newguest@test.com' },
      rooms: [
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-s-ep', occupancy: { adults: 2, children: 0 } },
      ],
      amount: { amountBeforeTax: 2000, tax: 100, amountAfterTax: 2100 },
      pah: false,
    };

    const webhookResult1 = await processAiosellReservation(HOTEL_ID, payload1);
    const pass1 = webhookResult1.success === true && webhookResult1.status === 'imported';
    record('OTA new reservation', pass1, `Import status: ${webhookResult1.status}`);

    // TEST 2: Automatic physical room assignment
    console.log('\n--- 2. AUTOMATIC ROOM ASSIGNMENT ---');
    const { data: res1 } = await supabaseServiceRole
      .from('reservations')
      .select('id, room_no, room_id, status, rate_plan')
      .eq('id', webhookResult1.reservationId)
      .single();

    const pass2 = Boolean(res1?.room_no && res1.room_no !== 'Unassigned' && res1.room_no !== 'TBD' && res1?.room_id);
    record('Automatic room assignment', pass2, `Assigned physical room: ${res1?.room_no} (ID: ${res1?.room_id})`);

    // TEST 3: Same-category multiple rooms
    console.log('\n--- 3. SAME-CATEGORY MULTIPLE ROOMS ---');
    const bookingId3 = `${testTag}_MULTI_02`;
    const payload3 = {
      action: 'book',
      bookingId: bookingId3,
      hotelCode: 'fa44d51cc0',
      channel: 'MakeMyTrip',
      checkin: '2026-11-05',
      checkout: '2026-11-07',
      guest: { firstName: 'MultiGuest', lastName: 'Beta', phone: '9876543211', email: 'multi@test.com' },
      rooms: [
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-s-ep', occupancy: { adults: 2, children: 0 } },
        { roomCode: 'deluxe-ac', rateplanCode: 'deluxe-ac-s-ep', occupancy: { adults: 2, children: 0 } },
      ],
      amount: { amountBeforeTax: 4000, tax: 200, amountAfterTax: 4200 },
      pah: false,
    };

    const webhookResult3 = await processAiosellReservation(HOTEL_ID, payload3);
    const { data: multiRes } = await supabaseServiceRole
      .from('reservations')
      .select('id, room_no, room_id')
      .eq('hotel_id', HOTEL_ID)
      .ilike('internal_note', `%${bookingId3}%`);

    const roomNos = (multiRes || []).map((r) => r.room_no);
    const uniqueRoomNos = new Set(roomNos);
    const pass3 = multiRes?.length === 2 && uniqueRoomNos.size === 2 && !roomNos.includes('Unassigned');
    record('Same-category multiple rooms', pass3, `Allocated separate rooms: ${roomNos.join(' and ')}`);

    // TEST 4: Existing conflicting reservation
    console.log('\n--- 4. EXISTING CONFLICTING RESERVATION ---');
    const assignedRoom = res1.room_no;
    const availCheckConflict = await checkRoomAvailability({
      hotelId: HOTEL_ID,
      roomNo: assignedRoom,
      checkIn: '2026-11-01',
      checkOut: '2026-11-02',
    });
    const pass4 = availCheckConflict.available === false && availCheckConflict.code === 'ROOM_ALREADY_BOOKED';
    record('Existing conflicting reservation', pass4, `Conflict correctly blocked: ${availCheckConflict.code}`);

    // TEST 5: Back-to-back reservations (checkout day is NOT occupied night)
    console.log('\n--- 5. BACK-TO-BACK RESERVATIONS ---');
    // res1 is Nov 1 -> Nov 3. Stays starting Nov 3 should be AVAILABLE for the same room!
    const backToBackCheck = await checkRoomAvailability({
      hotelId: HOTEL_ID,
      roomNo: assignedRoom,
      checkIn: '2026-11-03',
      checkOut: '2026-11-05',
    });
    const pass5 = backToBackCheck.available === true;
    record('Back-to-back reservations', pass5, `Room ${assignedRoom} available on checkout day (Nov 3): ${pass5}`);

    // TEST 6: Concurrent OTA bookings
    console.log('\n--- 6. CONCURRENT OTA BOOKINGS (RACE CONDITION) ---');
    const concurrentBookingA = `${testTag}_CONC_A`;
    const concurrentBookingB = `${testTag}_CONC_B`;

    const makeConcurrentPayload = (bId, gName) => ({
      action: 'book',
      bookingId: bId,
      hotelCode: 'fa44d51cc0',
      channel: 'Agoda',
      checkin: '2026-11-15',
      checkout: '2026-11-17',
      guest: { firstName: gName, lastName: 'Race', phone: '9876543212' },
      rooms: [{ roomCode: 'fourbed-ac', rateplanCode: 'fourbed-ac-s-ep' }],
      amount: { amountAfterTax: 3000 },
      pah: false,
    });

    const [raceA, raceB] = await Promise.all([
      processAiosellReservation(HOTEL_ID, makeConcurrentPayload(concurrentBookingA, 'GuestA')),
      processAiosellReservation(HOTEL_ID, makeConcurrentPayload(concurrentBookingB, 'GuestB')),
    ]);

    const { data: concRes } = await supabaseServiceRole
      .from('reservations')
      .select('id, room_no, internal_note')
      .eq('hotel_id', HOTEL_ID)
      .or(`internal_note.ilike.%${concurrentBookingA}%,internal_note.ilike.%${concurrentBookingB}%`);

    const concRooms = (concRes || []).map((r) => r.room_no);
    const pass6 = concRes?.length === 2 && concRooms[0] !== concRooms[1] && !concRooms.includes('Unassigned');
    record('Concurrent OTA bookings', pass6, `Assigned distinct rooms atomically: ${concRooms.join(' vs ')}`);

    // TEST 7: OTA modification (dates / category)
    console.log('\n--- 7. OTA MODIFICATION ---');
    const payloadModify = {
      ...payload1,
      action: 'modify',
      checkin: '2026-11-01',
      checkout: '2026-11-04', // Extended 1 night
    };
    const modResult = await processAiosellReservation(HOTEL_ID, payloadModify);
    const { data: modRes } = await supabaseServiceRole
      .from('reservations')
      .select('id, room_no, check_out_date')
      .eq('id', webhookResult1.reservationId)
      .single();

    const pass7 = modResult.success && modRes?.check_out_date === '2026-11-04' && modRes?.room_no === assignedRoom;
    record('OTA modification', pass7, `Maintained valid room ${modRes?.room_no} with new checkout ${modRes?.check_out_date}`);

    // TEST 8: OTA cancellation
    console.log('\n--- 8. OTA CANCELLATION ---');
    const payloadCancel = {
      action: 'cancel',
      bookingId: bookingId1,
      hotelCode: 'fa44d51cc0',
      channel: 'Goibibo',
      checkin: '2026-11-01',
      checkout: '2026-11-04',
      guest: { firstName: 'TestNewGuest', lastName: 'Alpha' },
      rooms: [{ roomCode: 'deluxe-ac' }],
      amount: { amountAfterTax: 0 },
    };

    const cancelResult = await processAiosellReservation(HOTEL_ID, payloadCancel);
    const { data: cancelledRes } = await supabaseServiceRole
      .from('reservations')
      .select('id, status, room_no, room_id')
      .eq('id', webhookResult1.reservationId)
      .single();

    const pass8 = cancelledRes?.status === 'cancelled' && (cancelledRes?.room_no === 'Unassigned' || !cancelledRes?.room_id);
    record('OTA cancellation', pass8, `Reservation status: ${cancelledRes?.status}, Room unassigned: ${cancelledRes?.room_no}`);

    // TEST 9: Duplicate webhook (idempotency)
    console.log('\n--- 9. DUPLICATE WEBHOOK ---');
    const dupResult = await processAiosellReservation(HOTEL_ID, payload3); // Repeat booking 3
    const { data: dupCheck } = await supabaseServiceRole
      .from('reservations')
      .select('id')
      .eq('hotel_id', HOTEL_ID)
      .ilike('internal_note', `%${bookingId3}%`);

    const pass9 = dupResult.idempotent === true && dupCheck?.length === 2;
    record('Duplicate webhook', pass9, `Idempotent response: ${dupResult.idempotent}, Count unchanged: ${dupCheck?.length}`);

    // TEST 10: Manual booking conflict
    console.log('\n--- 10. MANUAL BOOKING CONFLICT ---');
    const occupiedRoomMulti = multiRes[0]?.room_no;
    const manualConflictCheck = await checkRoomAvailability({
      hotelId: HOTEL_ID,
      roomNo: occupiedRoomMulti,
      checkIn: '2026-11-06',
      checkOut: '2026-11-08',
    });
    const pass10 = manualConflictCheck.available === false && manualConflictCheck.code === 'ROOM_ALREADY_BOOKED';
    record('Manual booking conflict', pass10, `Protected against manual assignment: ${manualConflictCheck.code}`);

    // TEST 11: Operations Board refresh & unassigned state
    console.log('\n--- 11. OPERATIONS BOARD QUERY ---');
    const { data: boardRes } = await supabaseServiceRole
      .from('reservations')
      .select('id, guest_name, room_no, check_in_date, check_out_date, status')
      .eq('hotel_id', HOTEL_ID)
      .in('status', ['confirmed', 'checked_in'])
      .gte('check_in_date', '2026-10-01')
      .lte('check_in_date', '2026-10-07');

    const boardUnassigned = (boardRes || []).filter(
      (r) => !r.room_no || r.room_no.toLowerCase() === 'unassigned' || r.room_no.toLowerCase() === 'tbd'
    );
    const pass11 = boardUnassigned.length === 0;
    record('Operations Board refresh', pass11, `Oct 1-7 unassigned count is ${boardUnassigned.length}`);

    // TEST 12: Inventory synchronization
    console.log('\n--- 12. INVENTORY SYNCHRONIZATION ---');
    const pass12 = Boolean(webhookResult1.syncResult || webhookResult3.syncResult || cancelResult.syncResult);
    record('Inventory synchronization', pass12, 'Authoritative inventory calculation invoked and pushed');

  } finally {
    // Cleanup generated regression data
    console.log('\nCleaning up regression test records...');
    await cleanupTestReservations(testTag);
    console.log('Cleaned up test data.');
  }

  console.log('\n=== SUITE EXECUTION SUMMARY ===');
  console.table(results);
};

runSuite().catch(console.error);
