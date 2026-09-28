/**
 * Comprehensive Automated Verification Suite for Reservation Integrity & Safety
 * Tests all 21 scenarios specified in Section 57 of Master Prompt
 */

import assert from 'assert';
import { supabaseServiceRole } from '../server/supabaseClient.js';
import {
  checkRoomAvailability,
  isStayOverlapping,
  isReservationRoomBlocking,
  normalizePhysicalRoom,
  detectExistingConflicts,
  checkCategoryCapacity,
} from '../server/services/ReservationConflictService.js';
import {
  createReservationsAtomically,
  updateReservationAtomically,
  assignPhysicalRoom,
  extendReservationStay,
  validateAndProcessCheckIn,
} from '../server/services/RoomAssignmentService.js';
import { processAiosellReservation } from '../server/services/integrations/aiosell/AiosellReservationService.js';

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c';
const createdTestReservationIds = [];

async function cleanup() {
  if (createdTestReservationIds.length > 0) {
    await supabaseServiceRole
      .from('reservations')
      .delete()
      .in('id', createdTestReservationIds);
  }
  await supabaseServiceRole
    .from('reservations')
    .delete()
    .eq('hotel_id', HOTEL_ID)
    .or('internal_note.ilike.%[OTA_BOOKING_ID: OTA-%,remarks.ilike.%[OTA_BOOKING_ID: OTA-%,guest_name.ilike.%Test Guest%,guest_name.ilike.%Pavan Singh%,guest_name.ilike.%Concurrent User%,guest_name.ilike.%Unassigned %,guest_name.ilike.%Mod Guest%,guest_name.ilike.%Move Target%,guest_name.ilike.%Cancel Me%,guest_name.ilike.%Reuse Room%,guest_name.ilike.%Multi Guest%,guest_name.ilike.%Checkin Candidate%');
  await supabaseServiceRole
    .from('channel_ota_reservations')
    .delete()
    .eq('hotel_id', HOTEL_ID)
    .ilike('ota_booking_id', 'OTA-%');
}

async function runIntegrityTests() {
  console.log('===============================================================');
  console.log('   HOTEL MANTRI MASTER RESERVATION INTEGRITY & SAFETY SUITE   ');
  console.log('===============================================================\n');

  await cleanup();

  let passedCount = 0;
  let totalCount = 0;

  function recordTest(name, passed, detail = '') {
    totalCount++;
    if (passed) {
      passedCount++;
      console.log(`[PASS] ${totalCount.toString().padStart(2, '0')}. ${name} ${detail ? `(${detail})` : ''}`);
    } else {
      console.error(`[FAIL] ${totalCount.toString().padStart(2, '0')}. ${name} ${detail ? `(${detail})` : ''}`);
    }
  }

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Same Room Exact Overlap (Blocked)
    // -------------------------------------------------------------------------
    const resA = await createReservationsAtomically({
      hotelId: HOTEL_ID,
      inputs: [{
        room_no: '101',
        check_in_date: '2027-01-10',
        check_out_date: '2027-01-15',
        guest_name: 'Test Guest A',
        guest_phone: '9999900001',
        status: 'confirmed',
        source_category: 'Direct/Walking',
      }],
    });
    createdTestReservationIds.push(resA[0].id);

    let test1Blocked = false;
    try {
      await createReservationsAtomically({
        hotelId: HOTEL_ID,
        inputs: [{
          room_no: '101',
          check_in_date: '2027-01-10',
          check_out_date: '2027-01-15',
          guest_name: 'Test Guest B',
          guest_phone: '9999900002',
          status: 'confirmed',
          source_category: 'Direct/Walking',
        }],
      });
    } catch (err) {
      test1Blocked = err.code === 'ROOM_ALREADY_BOOKED' || err.status === 409;
    }
    recordTest('Same Room Exact Overlap (2027-01-10 -> 2027-01-15)', test1Blocked);

    // -------------------------------------------------------------------------
    // TEST 2: Same Room Partial Overlap - Starts before, overlaps into stay
    // -------------------------------------------------------------------------
    let test2Blocked = false;
    try {
      await createReservationsAtomically({
        hotelId: HOTEL_ID,
        inputs: [{
          room_no: '101',
          check_in_date: '2027-01-08',
          check_out_date: '2027-01-12',
          guest_name: 'Test Guest C',
          guest_phone: '9999900003',
          status: 'confirmed',
          source_category: 'Direct/Walking',
        }],
      });
    } catch (err) {
      test2Blocked = err.code === 'ROOM_ALREADY_BOOKED' || err.status === 409;
    }
    recordTest('Same Room Partial Overlap (starts before, overlaps check_in)', test2Blocked);

    // -------------------------------------------------------------------------
    // TEST 3: Same Room Partial Overlap - Starts during stay, ends after
    // -------------------------------------------------------------------------
    let test3Blocked = false;
    try {
      await createReservationsAtomically({
        hotelId: HOTEL_ID,
        inputs: [{
          room_no: '101',
          check_in_date: '2027-01-13',
          check_out_date: '2027-01-18',
          guest_name: 'Test Guest D',
          guest_phone: '9999900004',
          status: 'confirmed',
          source_category: 'Direct/Walking',
        }],
      });
    } catch (err) {
      test3Blocked = err.code === 'ROOM_ALREADY_BOOKED' || err.status === 409;
    }
    recordTest('Same Room Partial Overlap (starts within, overlaps check_out)', test3Blocked);

    // -------------------------------------------------------------------------
    // TEST 4: Same Room Contained Reservation
    // -------------------------------------------------------------------------
    let test4Blocked = false;
    try {
      await createReservationsAtomically({
        hotelId: HOTEL_ID,
        inputs: [{
          room_no: '101',
          check_in_date: '2027-01-11',
          check_out_date: '2027-01-14',
          guest_name: 'Test Guest E',
          guest_phone: '9999900005',
          status: 'confirmed',
          source_category: 'Direct/Walking',
        }],
      });
    } catch (err) {
      test4Blocked = err.code === 'ROOM_ALREADY_BOOKED' || err.status === 409;
    }
    recordTest('Same Room Contained Reservation (inside existing stay)', test4Blocked);

    // -------------------------------------------------------------------------
    // TEST 5: Same Room Adjacent Checkout / Check-in (Must be ALLOWED)
    // Invariant: check_out date is NOT an occupied night
    // -------------------------------------------------------------------------
    let test5Allowed = false;
    try {
      const resAdjacentAfter = await createReservationsAtomically({
        hotelId: HOTEL_ID,
        inputs: [{
          room_no: '101',
          check_in_date: '2027-01-15', // Same day as resA check_out
          check_out_date: '2027-01-18',
          guest_name: 'Adjacent After Guest',
          guest_phone: '9999900006',
          status: 'confirmed',
          source_category: 'Direct/Walking',
        }],
      });
      createdTestReservationIds.push(resAdjacentAfter[0].id);

      const resAdjacentBefore = await createReservationsAtomically({
        hotelId: HOTEL_ID,
        inputs: [{
          room_no: '101',
          check_in_date: '2027-01-05',
          check_out_date: '2027-01-10', // Same day as resA check_in
          guest_name: 'Adjacent Before Guest',
          guest_phone: '9999900007',
          status: 'confirmed',
          source_category: 'Direct/Walking',
        }],
      });
      createdTestReservationIds.push(resAdjacentBefore[0].id);

      test5Allowed = !!resAdjacentAfter[0]?.id && !!resAdjacentBefore[0]?.id;
    } catch (err) {
      console.error('Test 5 error:', err);
      test5Allowed = false;
    }
    recordTest('Same Room Adjacent Checkout/Check-in (Checkout date free for next guest)', test5Allowed);

    // -------------------------------------------------------------------------
    // TEST 6: Different Rooms Same Dates (Allowed)
    // -------------------------------------------------------------------------
    let test6Allowed = false;
    try {
      const resDiffRoom = await createReservationsAtomically({
        hotelId: HOTEL_ID,
        inputs: [{
          room_no: '102',
          check_in_date: '2027-01-10',
          check_out_date: '2027-01-15',
          guest_name: 'Diff Room Guest',
          guest_phone: '9999900008',
          status: 'confirmed',
          source_category: 'Direct/Walking',
        }],
      });
      createdTestReservationIds.push(resDiffRoom[0].id);
      test6Allowed = !!resDiffRoom[0]?.id;
    } catch (err) {
      test6Allowed = false;
    }
    recordTest('Different Rooms Same Dates (Room 101 and 102 co-exist)', test6Allowed);

    // -------------------------------------------------------------------------
    // TEST 7: Same Guest Different Rooms (Pavan Singh scenario - Must be ALLOWED)
    // Legitimate multi-room booking by single party
    // -------------------------------------------------------------------------
    let test7Allowed = false;
    try {
      const pavan1 = await createReservationsAtomically({
        hotelId: HOTEL_ID,
        inputs: [{
          room_no: '201',
          check_in_date: '2027-02-01',
          check_out_date: '2027-02-05',
          guest_name: 'Mr. Pavan Singh',
          guest_phone: '9876543210',
          status: 'confirmed',
          source_category: 'Direct/Walking',
        }],
      });
      createdTestReservationIds.push(pavan1[0].id);

      const pavan2 = await createReservationsAtomically({
        hotelId: HOTEL_ID,
        inputs: [{
          room_no: '202',
          check_in_date: '2027-02-01',
          check_out_date: '2027-02-05',
          guest_name: 'Mr. Pavan Singh',
          guest_phone: '9876543210',
          status: 'confirmed',
          source_category: 'Direct/Walking',
        }],
      });
      createdTestReservationIds.push(pavan2[0].id);

      test7Allowed = !!pavan1[0]?.id && !!pavan2[0]?.id;
    } catch (err) {
      test7Allowed = false;
    }
    recordTest('Same Guest Multi-Room Booking (e.g. Mr. Pavan Singh on Rooms 201 & 202)', test7Allowed);

    // -------------------------------------------------------------------------
    // TEST 8: Duplicate OTA Booking Idempotency
    // -------------------------------------------------------------------------
    let test8Passed = false;
    const otaPayload1 = {
      bookingId: 'OTA-TEST-INT-888',
      channelName: 'Booking.com',
      guestName: 'OTA Guest One',
      guestPhone: '9123456780',
      checkIn: '2027-03-01',
      checkOut: '2027-03-04',
      roomCode: 'Deluxe AC',
      rate: 2500,
      amount: 7500,
      action: 'book',
      paymentStatus: 'paid',
    };

    const firstIngest = await processAiosellReservation(otaPayload1, HOTEL_ID);
    const secondIngest = await processAiosellReservation(otaPayload1, HOTEL_ID);

    if (firstIngest.reservationId) createdTestReservationIds.push(firstIngest.reservationId);

    const { data: otaRows } = await supabaseServiceRole
      .from('reservations')
      .select('id')
      .eq('hotel_id', HOTEL_ID)
      .ilike('internal_note', '%[OTA_BOOKING_ID: OTA-TEST-INT-888]%');

    test8Passed = firstIngest.success &&
      secondIngest.success &&
      secondIngest.status === 'already_imported' &&
      otaRows?.length === 1;
    recordTest('Duplicate OTA Booking Idempotency (Send twice -> 1 DB row, 2nd idempotent)', test8Passed);

    // -------------------------------------------------------------------------
    // TEST 9: Concurrent Duplicate OTA Webhooks (5 Simultaneous Requests)
    // -------------------------------------------------------------------------
    let test9Passed = false;
    const concurrentPayload = {
      bookingId: 'OTA-CONCURRENT-RACE-777',
      channelName: 'Agoda',
      guestName: 'Agoda Race Guest',
      guestPhone: '9123456781',
      checkIn: '2027-03-10',
      checkOut: '2027-03-13',
      roomCode: 'Deluxe AC',
      rate: 3000,
      amount: 9000,
      action: 'book',
      paymentStatus: 'paid',
    };

    const webhookPromises = Array.from({ length: 5 }, () => processAiosellReservation(concurrentPayload, HOTEL_ID));
    const webhookResults = await Promise.all(webhookPromises);

    const { data: raceRows } = await supabaseServiceRole
      .from('reservations')
      .select('id')
      .eq('hotel_id', HOTEL_ID)
      .ilike('internal_note', '%[OTA_BOOKING_ID: OTA-CONCURRENT-RACE-777]%');

    for (const r of raceRows || []) {
      createdTestReservationIds.push(r.id);
    }

    const createdCount = webhookResults.filter(r => r.status === 'imported').length;
    const idempotentCount = webhookResults.filter(r => r.status === 'already_imported').length;

    test9Passed = raceRows?.length === 1 && createdCount === 1 && idempotentCount === 4;
    recordTest('Concurrent Duplicate OTA Webhooks (5 simultaneous -> 1 created, 4 idempotent)', test9Passed);

    // -------------------------------------------------------------------------
    // TEST 10: Concurrent Booking Creation (Two users click save on same room)
    // -------------------------------------------------------------------------
    let test10Passed = false;
    const createReq1 = createReservationsAtomically({
      hotelId: HOTEL_ID,
      inputs: [{
        room_no: '205',
        check_in_date: '2027-04-01',
        check_out_date: '2027-04-05',
        guest_name: 'Concurrent User 1',
        guest_phone: '9999900010',
        status: 'confirmed',
        source_category: 'Direct/Walking',
      }],
    });
    const createReq2 = createReservationsAtomically({
      hotelId: HOTEL_ID,
      inputs: [{
        room_no: '205',
        check_in_date: '2027-04-01',
        check_out_date: '2027-04-05',
        guest_name: 'Concurrent User 2',
        guest_phone: '9999900011',
        status: 'confirmed',
        source_category: 'Direct/Walking',
      }],
    });

    const [res1, res2] = await Promise.allSettled([createReq1, createReq2]);
    const succeeded = [res1, res2].filter(r => r.status === 'fulfilled');
    const rejected = [res1, res2].filter(r => r.status === 'rejected');

    if (succeeded.length === 1 && rejected.length === 1) {
      test10Passed = true;
      createdTestReservationIds.push(succeeded[0].value[0].id);
    }
    recordTest('Concurrent Duplicate Booking Creation (2 clicks -> 1 success, 1 conflict)', test10Passed);

    // -------------------------------------------------------------------------
    // TEST 11: Concurrent Room Assignment (2 unassigned assigned to same room)
    // -------------------------------------------------------------------------
    let test11Passed = false;
    const unassigned1 = await createReservationsAtomically({
      hotelId: HOTEL_ID,
      inputs: [{
        room_no: 'Unassigned',
        check_in_date: '2027-05-01',
        check_out_date: '2027-05-05',
        guest_name: 'Unassigned 1',
        guest_phone: '9999900021',
        status: 'confirmed',
        source_category: 'Direct/Walking',
      }],
    });
    createdTestReservationIds.push(unassigned1[0].id);

    const unassigned2 = await createReservationsAtomically({
      hotelId: HOTEL_ID,
      inputs: [{
        room_no: 'Unassigned',
        check_in_date: '2027-05-01',
        check_out_date: '2027-05-05',
        guest_name: 'Unassigned 2',
        guest_phone: '9999900022',
        status: 'confirmed',
        source_category: 'Direct/Walking',
      }],
    });
    createdTestReservationIds.push(unassigned2[0].id);

    const assign1 = assignPhysicalRoom({
      hotelId: HOTEL_ID,
      reservationId: unassigned1[0].id,
      roomNo: '206',
    });
    const assign2 = assignPhysicalRoom({
      hotelId: HOTEL_ID,
      reservationId: unassigned2[0].id,
      roomNo: '206',
    });

    const [aRes1, aRes2] = await Promise.allSettled([assign1, assign2]);
    const aSuccess = [aRes1, aRes2].filter(r => r.status === 'fulfilled');
    const aRejected = [aRes1, aRes2].filter(r => r.status === 'rejected');

    test11Passed = aSuccess.length === 1 && aRejected.length === 1;
    recordTest('Concurrent Room Assignment (Two unassigned -> 1 assigned, 1 blocked)', test11Passed);

    // -------------------------------------------------------------------------
    // TEST 12: Reservation Modification Conflict
    // -------------------------------------------------------------------------
    let test12Passed = false;
    const modA = await createReservationsAtomically({
      hotelId: HOTEL_ID,
      inputs: [{
        room_no: '301',
        check_in_date: '2027-06-01',
        check_out_date: '2027-06-03',
        guest_name: 'Mod Guest A',
        guest_phone: '9999900031',
        status: 'confirmed',
        source_category: 'Direct/Walking',
      }],
    });
    createdTestReservationIds.push(modA[0].id);

    const modB = await createReservationsAtomically({
      hotelId: HOTEL_ID,
      inputs: [{
        room_no: '301',
        check_in_date: '2027-06-04',
        check_out_date: '2027-06-07',
        guest_name: 'Mod Guest B',
        guest_phone: '9999900032',
        status: 'confirmed',
        source_category: 'Direct/Walking',
      }],
    });
    createdTestReservationIds.push(modB[0].id);

    // Attempt modifying modA checkout to 2027-06-05 (which conflicts with modB starting on 06-04)
    try {
      await updateReservationAtomically({
        hotelId: HOTEL_ID,
        reservationId: modA[0].id,
        updates: { check_out_date: '2027-06-05' },
      });
    } catch (err) {
      test12Passed = err.code === 'ROOM_ALREADY_BOOKED' || err.status === 409;
    }

    // Verify modA was not modified
    const { data: modACheck } = await supabaseServiceRole
      .from('reservations')
      .select('check_out_date')
      .eq('id', modA[0].id)
      .single();
    test12Passed = test12Passed && modACheck?.check_out_date === '2027-06-03';
    recordTest('Reservation Modification Conflict (Updating stay into occupied nights blocked)', test12Passed);

    // -------------------------------------------------------------------------
    // TEST 13: Room Move Conflict
    // -------------------------------------------------------------------------
    let test13Passed = false;
    const moveRes = await createReservationsAtomically({
      hotelId: HOTEL_ID,
      inputs: [{
        room_no: '302',
        check_in_date: '2027-06-05',
        check_out_date: '2027-06-08',
        guest_name: 'Move Target Guest',
        guest_phone: '9999900041',
        status: 'confirmed',
        source_category: 'Direct/Walking',
      }],
    });
    createdTestReservationIds.push(moveRes[0].id);

    // Try moving modB (Room 301, dates 2027-06-04 -> 2027-06-07) to Room 302
    try {
      await assignPhysicalRoom({
        hotelId: HOTEL_ID,
        reservationId: modB[0].id,
        roomNo: '302',
      });
    } catch (err) {
      test13Passed = err.code === 'ROOM_ALREADY_BOOKED' || err.status === 409;
    }

    // Check modB is still in Room 301
    const { data: modBCheck } = await supabaseServiceRole
      .from('reservations')
      .select('room_no')
      .eq('id', modB[0].id)
      .single();
    test13Passed = test13Passed && modBCheck?.room_no === '301';
    recordTest('Room Move / Reassignment Conflict (Move to occupied room blocked)', test13Passed);

    // -------------------------------------------------------------------------
    // TEST 14: Stay Extension Conflict
    // -------------------------------------------------------------------------
    let test14Passed = false;
    try {
      await extendReservationStay({
        hotelId: HOTEL_ID,
        reservationId: modA[0].id,
        newCheckOut: '2027-06-06',
      });
    } catch (err) {
      test14Passed = err.code === 'ROOM_ALREADY_BOOKED' || err.status === 409;
    }
    recordTest('Stay Extension Conflict (Extending stay past occupied check_in blocked)', test14Passed);

    // -------------------------------------------------------------------------
    // TEST 15: Cancelled Booking Room Reuse (Allowed)
    // Inactive/cancelled reservations must not block room
    // -------------------------------------------------------------------------
    let test15Passed = false;
    const cancelRes = await createReservationsAtomically({
      hotelId: HOTEL_ID,
      inputs: [{
        room_no: '305',
        check_in_date: '2027-07-01',
        check_out_date: '2027-07-05',
        guest_name: 'Cancel Me',
        guest_phone: '9999900051',
        status: 'cancelled',
        source_category: 'Direct/Walking',
      }],
    });
    createdTestReservationIds.push(cancelRes[0].id);

    try {
      const reuseRes = await createReservationsAtomically({
        hotelId: HOTEL_ID,
        inputs: [{
          room_no: '305',
          check_in_date: '2027-07-01',
          check_out_date: '2027-07-05',
          guest_name: 'Reuse Room',
          guest_phone: '9999900052',
          status: 'confirmed',
          source_category: 'Direct/Walking',
        }],
      });
      createdTestReservationIds.push(reuseRes[0].id);
      test15Passed = !!reuseRes[0]?.id;
    } catch (err) {
      test15Passed = false;
    }
    recordTest('Cancelled Booking Room Reuse (Cancelled booking does not block room)', test15Passed);

    // -------------------------------------------------------------------------
    // TEST 16: Invalid Stay Dates
    // check_in == check_out or check_in > check_out must be rejected
    // -------------------------------------------------------------------------
    let test16Passed = false;
    let sameDayBlocked = false;
    let reversedBlocked = false;

    try {
      await createReservationsAtomically({
        hotelId: HOTEL_ID,
        inputs: [{
          room_no: '101',
          check_in_date: '2027-08-01',
          check_out_date: '2027-08-01',
          guest_name: 'Zero Nights',
          status: 'confirmed',
        }],
      });
    } catch (err) {
      sameDayBlocked = err.code === 'INVALID_STAY_DATES' || err.status === 400;
    }

    try {
      await createReservationsAtomically({
        hotelId: HOTEL_ID,
        inputs: [{
          room_no: '101',
          check_in_date: '2027-08-05',
          check_out_date: '2027-08-01',
          guest_name: 'Negative Nights',
          status: 'confirmed',
        }],
      });
    } catch (err) {
      reversedBlocked = err.code === 'INVALID_STAY_DATES' || err.status === 400;
    }

    test16Passed = sameDayBlocked && reversedBlocked;
    recordTest('Invalid Stay Dates (check_in >= check_out rejected)', test16Passed);

    // -------------------------------------------------------------------------
    // TEST 17: Multi-Room Booking Atomic Allocation
    // If 1 room is available but 2nd room conflicts, BOTH must fail (all-or-nothing)
    // -------------------------------------------------------------------------
    let test17Passed = false;
    try {
      await createReservationsAtomically({
        hotelId: HOTEL_ID,
        inputs: [
          {
            room_no: '103', // Available
            check_in_date: '2027-01-10',
            check_out_date: '2027-01-15',
            guest_name: 'Multi Guest 1',
            status: 'confirmed',
          },
          {
            room_no: '101', // Already booked by resA in Test 1!
            check_in_date: '2027-01-10',
            check_out_date: '2027-01-15',
            guest_name: 'Multi Guest 2',
            status: 'confirmed',
          },
        ],
      });
    } catch (err) {
      // Check that Room 103 was NOT left created!
      const { data: orphaned103 } = await supabaseServiceRole
        .from('reservations')
        .select('id')
        .eq('hotel_id', HOTEL_ID)
        .eq('room_no', '103')
        .eq('check_in_date', '2027-01-10');

      test17Passed = (err.code === 'ROOM_ALREADY_BOOKED' || err.status === 409) &&
        (!orphaned103 || orphaned103.length === 0);
    }
    recordTest('Multi-Room Booking Atomic Rollback (No partial allocations)', test17Passed);

    // -------------------------------------------------------------------------
    // TEST 18: Unassigned Reservation Behavior
    // Unassigned does not block room "Unassigned" as a physical room
    // -------------------------------------------------------------------------
    let test18Passed = false;
    const uRes1 = await createReservationsAtomically({
      hotelId: HOTEL_ID,
      inputs: [{
        room_no: 'Unassigned',
        check_in_date: '2027-10-01',
        check_out_date: '2027-10-05',
        guest_name: 'Unassigned A',
        status: 'confirmed',
      }],
    });
    createdTestReservationIds.push(uRes1[0].id);

    const uRes2 = await createReservationsAtomically({
      hotelId: HOTEL_ID,
      inputs: [{
        room_no: 'TBD',
        check_in_date: '2027-10-01',
        check_out_date: '2027-10-05',
        guest_name: 'Unassigned B',
        status: 'confirmed',
      }],
    });
    createdTestReservationIds.push(uRes2[0].id);

    // Both must be created and physical room normalized to null
    test18Passed = !!uRes1[0]?.id && !!uRes2[0]?.id &&
      uRes1[0].room_no === 'Unassigned' && (uRes2[0].room_no === 'Unassigned' || uRes2[0].room_no === 'TBD') &&
      uRes1[0].room_id === null && uRes2[0].room_id === null;
    recordTest('Unassigned Reservations Co-existence (Not treated as physical room)', test18Passed);

    // -------------------------------------------------------------------------
    // TEST 19: Category Capacity Checking
    // -------------------------------------------------------------------------
    let test19Passed = false;
    const capCheck = await checkCategoryCapacity({
      hotelId: HOTEL_ID,
      checkIn: '2027-11-01',
      checkOut: '2027-11-05',
    });
    test19Passed = typeof capCheck.totalRooms === 'number' && capCheck.totalRooms > 0;
    recordTest('Room Category Capacity Check (Authoritative capacity calculation)', test19Passed);

    // -------------------------------------------------------------------------
    // TEST 20: Safe Check-In Validation
    // Check-in validates that room has no conflicts before allowing status update
    // -------------------------------------------------------------------------
    let test20Passed = false;
    const checkInRes = await createReservationsAtomically({
      hotelId: HOTEL_ID,
      inputs: [{
        room_no: '102',
        check_in_date: '2027-12-01',
        check_out_date: '2027-12-05',
        guest_name: 'Checkin Candidate',
        status: 'confirmed',
      }],
    });
    createdTestReservationIds.push(checkInRes[0].id);

    const checkInResult = await validateAndProcessCheckIn({
      hotelId: HOTEL_ID,
      reservationId: checkInRes[0].id,
    });
    test20Passed = checkInResult.success && checkInResult.reservation.status === 'checked_in';
    recordTest('Safe Check-In Validation (Validates room integrity prior to check-in)', test20Passed);

    // -------------------------------------------------------------------------
    // TEST 21: Historical Conflict Detection Routine
    // -------------------------------------------------------------------------
    let test21Passed = false;
    const conflictScan = await detectExistingConflicts(HOTEL_ID);
    test21Passed = Array.isArray(conflictScan);
    recordTest('Historical Conflict Detection Diagnostic (Zero unhandled crashes)', test21Passed);

  } finally {
    console.log('\nCleaning up test artifacts from database...');
    await cleanup();
    console.log('Cleanup complete.');
  }

  console.log('\n===============================================================');
  console.log(`RESULTS: ${passedCount} / ${totalCount} PASSED`);
  console.log('===============================================================\n');

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runIntegrityTests().catch(err => {
  console.error('Fatal Test Suite Error:', err);
  cleanup().finally(() => process.exit(1));
});
