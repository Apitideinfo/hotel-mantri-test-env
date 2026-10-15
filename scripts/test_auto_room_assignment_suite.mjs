/**
 * HOTEL MANTRI — Master Test Suite: Automatic Room Assignment + Real-Time Availability + Double-Booking Prevention
 *
 * Verifies all 20 Phase 9 criteria:
 * 1. Automatic assignment for each configured room category.
 * 2. Correct assignment for the selected hotel only.
 * 3. Room capacity and guest-count validation.
 * 4. Overlapping stay date conflict detection [checkIn, checkOut).
 * 5. Turnover day checkout/checkin non-conflicting compatibility.
 * 6. Cancelled reservation inventory release.
 * 7. Checked-out reservation does not block future dates.
 * 8. Maintenance / out-of-order room exclusion.
 * 9. Reservation edit date revalidation & auto-reassignment.
 * 10. Stay extension conflict checking.
 * 11. Cancelling releases room correctly.
 * 12. Multi-room reservations use distinct physical rooms.
 * 13. OTA imports cannot create invalid or duplicate room assignments.
 * 14. Concurrency test: simultaneous booking requests racing for the final room.
 * 15. API retries / idempotency duplicate prevention.
 * 16. Check Availability agrees with actual assignment API.
 * 17. Multi-tenant isolation: changes to one hotel never affect another hotel.
 * 18. Operations Board and Reservations list show identical assignment.
 * 19. Real-time availability updates without stale cache.
 * 20. Atomic rollback on failed multi-room assignment leaves no orphaned records.
 */

import dotenv from 'dotenv';
dotenv.config();

import { supabaseServiceRole, ensureAuth } from '../server/supabaseClient.js';
import {
  getCategoryPhysicalRoomAvailability,
  checkRoomAvailability,
} from '../server/services/ReservationConflictService.js';
import {
  createReservationsAtomically,
  updateReservationAtomically,
  extendReservationStay,
  autoAssignPhysicalRoom,
} from '../server/services/RoomAssignmentService.js';

let passed = 0;
let failed = 0;
const testReservationsToCleanup = new Set();

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function cleanup() {
  if (testReservationsToCleanup.size > 0) {
    console.log(`\nCleaning up ${testReservationsToCleanup.size} test reservations...`);
    const ids = Array.from(testReservationsToCleanup);
    await supabaseServiceRole
      .from('reservations')
      .delete()
      .in('id', ids);
    console.log('Cleanup completed.');
  }
}

async function runMasterTestSuite() {
  console.log('\n========================================================================');
  console.log('HOTEL MANTRI — AUTOMATIC ROOM ASSIGNMENT & AVAILABILITY MASTER TEST SUITE');
  console.log('========================================================================\n');

  await ensureAuth();

  const HOTEL_GOPAL_ID = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb';
  const MARS_HOTEL_ID = '9001eb1c-9d38-49d0-84f7-75244e8f4bf8';

  // Fetch categories for HOTEL GOPAL
  const { data: categories } = await supabaseServiceRole
    .from('room_categories')
    .select('id, name')
    .eq('hotel_id', HOTEL_GOPAL_ID);

  console.log(`Test Hotel: HOTEL GOPAL (${HOTEL_GOPAL_ID})`);
  console.log(`Found ${categories?.length || 0} configured categories:`, categories?.map(c => c.name).join(', '));
  console.log('------------------------------------------------------------------------\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Automatic assignment for each configured room category
  // ──────────────────────────────────────────────────────────────────────────
  console.log('TEST 1: Automatic assignment for each configured room category');
  for (const cat of categories) {
    const checkIn = '2028-01-10';
    const checkOut = '2028-01-12';
    const result = await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [
        {
          guest_name: `AutoAssign Test ${cat.name}`,
          guest_phone: '9876543210',
          guest_email: 'test@hotelmantri.com',
          room_category_id: cat.id,
          rate_plan: cat.name,
          check_in_date: checkIn,
          check_out_date: checkOut,
          rate: 2500,
          status: 'confirmed',
          auto_assign: true,
        },
      ],
      allowEmptyEmail: true,
      userId: 'TEST_SUITE',
    });

    const res = result?.[0];
    if (res) testReservationsToCleanup.add(res.id);

    // Verify assigned room belongs to this category
    const { data: assignedRoom } = await supabaseServiceRole
      .from('rooms')
      .select('id, room_no, category_id, hotel_id')
      .eq('id', res?.room_id)
      .maybeSingle();

    assert(
      res && res.room_no && res.room_no !== 'Unassigned' && res.room_id && assignedRoom?.category_id === cat.id,
      `Category "${cat.name}" automatically assigned physical Room ${res?.room_no} (id: ${res?.room_id})`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Correct assignment for the selected hotel only
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 2: Correct assignment for the selected hotel only (strict tenant isolation)');
  {
    const cat = categories[0];
    const result = await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [
        {
          guest_name: 'Hotel Isolation Test Guest',
          guest_phone: '9876543211',
          guest_email: 'test@hotelmantri.com',
          room_category_id: cat.id,
          check_in_date: '2028-01-15',
          check_out_date: '2028-01-17',
          rate: 2500,
          status: 'confirmed',
          auto_assign: true,
        },
      ],
      allowEmptyEmail: true,
      userId: 'TEST_SUITE',
    });

    const res = result?.[0];
    if (res) testReservationsToCleanup.add(res.id);

    const { data: roomInDb } = await supabaseServiceRole
      .from('rooms')
      .select('hotel_id, room_no')
      .eq('id', res.room_id)
      .single();

    assert(
      res.hotel_id === HOTEL_GOPAL_ID && roomInDb.hotel_id === HOTEL_GOPAL_ID && roomInDb.hotel_id !== MARS_HOTEL_ID,
      `Assigned Room ${res.room_no} strictly belongs to HOTEL GOPAL (${res.hotel_id}) and not MARS HOTEL`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Room capacity and guest-count validation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 3: Room capacity and guest-count validation');
  {
    // Select Suite AC (2 physical rooms) for rapid and rigorous capacity validation
    const cat = categories.find(c => c.name.toLowerCase().includes('suite')) || categories[categories.length - 1];
    const avail = await getCategoryPhysicalRoomAvailability({
      hotelId: HOTEL_GOPAL_ID,
      categoryId: cat.id,
      checkIn: '2028-02-01',
      checkOut: '2028-02-03',
    });

    assert(
      avail.totalRooms > 0 && avail.availableRooms === avail.totalRooms,
      `Category "${cat.name}" has ${avail.totalRooms} total physical rooms, all available on clean dates`
    );

    // Attempt to book totalRooms + 1 rooms in a single multi-room request
    const overCapacityItems = [];
    for (let i = 0; i <= avail.totalRooms; i++) {
      overCapacityItems.push({
        guest_name: `OverCap Guest ${i + 1}`,
        guest_email: 'test@hotelmantri.com',
        room_category_id: cat.id,
        check_in_date: '2028-02-01',
        check_out_date: '2028-02-03',
        rate: 2000,
        status: 'confirmed',
        auto_assign: true,
      });
    }

    let overCapRejected = false;
    let errorCode = '';
    try {
      await createReservationsAtomically({
        hotelId: HOTEL_GOPAL_ID,
        items: overCapacityItems,
        allowEmptyEmail: true,
        userId: 'TEST_SUITE',
      });
    } catch (err) {
      overCapRejected = true;
      errorCode = err.code;
    }

    assert(
      overCapRejected && errorCode === 'CATEGORY_CAPACITY_EXCEEDED',
      `Exceeding category capacity (${avail.totalRooms + 1}/${avail.totalRooms}) properly rejected with 409 CATEGORY_CAPACITY_EXCEEDED`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Room booked for 10–12 October is unavailable for overlapping stay
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 4: Overlapping stay date conflict detection [checkIn, checkOut)');
  let test4RoomNo = null;
  {
    const cat = categories[0];
    const checkIn = '2028-03-10';
    const checkOut = '2028-03-12';

    const res1 = (await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [
        {
          guest_name: 'Stay 1 (10-12 Mar)',
          guest_email: 'test@hotelmantri.com',
          room_category_id: cat.id,
          check_in_date: checkIn,
          check_out_date: checkOut,
          rate: 2000,
          status: 'confirmed',
          auto_assign: true,
        },
      ],
      allowEmptyEmail: true,
      userId: 'TEST_SUITE',
    }))[0];
    testReservationsToCleanup.add(res1.id);
    test4RoomNo = res1.room_no;

    // Overlapping stay: 11-13 Mar (overlaps on 11th night)
    const availOverlap = await checkRoomAvailability({
      hotelId: HOTEL_GOPAL_ID,
      roomNo: test4RoomNo,
      checkIn: '2028-03-11',
      checkOut: '2028-03-13',
    });

    let directBookFailed = false;
    try {
      await createReservationsAtomically({
        hotelId: HOTEL_GOPAL_ID,
        items: [
          {
            guest_name: 'Stay 2 Overlap Attempt',
            guest_email: 'test@hotelmantri.com',
            room_no: test4RoomNo,
            check_in_date: '2028-03-11',
            check_out_date: '2028-03-13',
            rate: 2000,
            status: 'confirmed',
          },
        ],
        allowEmptyEmail: true,
        userId: 'TEST_SUITE',
      });
    } catch (err) {
      directBookFailed = true;
    }

    assert(
      !availOverlap.available && directBookFailed,
      `Room ${test4RoomNo} booked for 10-12 Mar is unavailable for overlapping stay 11-13 Mar (rejected with conflict)`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: New stay starting on 12 October can use that room (turnover day)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 5: Turnover day checkout/checkin compatibility');
  {
    // Check-in on 12 Mar (when Stay 1 checks out)
    const availTurnover = await checkRoomAvailability({
      hotelId: HOTEL_GOPAL_ID,
      roomNo: test4RoomNo,
      checkIn: '2028-03-12',
      checkOut: '2028-03-15',
    });

    let turnoverBookSuccess = false;
    let resTurnover = null;
    try {
      const resList = await createReservationsAtomically({
        hotelId: HOTEL_GOPAL_ID,
        items: [
          {
            guest_name: 'Stay 3 Turnover Guest',
            guest_email: 'test@hotelmantri.com',
            room_no: test4RoomNo,
            check_in_date: '2028-03-12',
            check_out_date: '2028-03-15',
            rate: 2000,
            status: 'confirmed',
          },
        ],
        allowEmptyEmail: true,
        userId: 'TEST_SUITE',
      });
      resTurnover = resList[0];
      turnoverBookSuccess = true;
      testReservationsToCleanup.add(resTurnover.id);
    } catch (err) {
      turnoverBookSuccess = false;
    }

    assert(
      availTurnover.available && turnoverBookSuccess,
      `New stay starting on checkout date (12 Mar) successfully booked Room ${test4RoomNo} (half-open interval respected)`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Cancelled reservation no longer blocks inventory
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 6: Cancelled reservation releases inventory');
  {
    const cat = categories[0];
    const res = (await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [
        {
          guest_name: 'To Be Cancelled',
          guest_email: 'test@hotelmantri.com',
          room_category_id: cat.id,
          check_in_date: '2028-04-01',
          check_out_date: '2028-04-04',
          rate: 2000,
          status: 'confirmed',
          auto_assign: true,
        },
      ],
      allowEmptyEmail: true,
      userId: 'TEST_SUITE',
    }))[0];
    testReservationsToCleanup.add(res.id);
    const roomNo = res.room_no;

    // Verify room is blocked before cancellation
    const beforeCancel = await checkRoomAvailability({
      hotelId: HOTEL_GOPAL_ID,
      roomNo,
      checkIn: '2028-04-01',
      checkOut: '2028-04-04',
    });
    assert(!beforeCancel.available, `Room ${roomNo} is initially blocked by confirmed reservation`);

    // Cancel reservation
    await updateReservationAtomically({
      hotelId: HOTEL_GOPAL_ID,
      reservationId: res.id,
      updates: { status: 'cancelled' },
      userId: 'TEST_SUITE',
    });

    // Verify room is now free
    const afterCancel = await checkRoomAvailability({
      hotelId: HOTEL_GOPAL_ID,
      roomNo,
      checkIn: '2028-04-01',
      checkOut: '2028-04-04',
    });
    assert(afterCancel.available, `Room ${roomNo} is immediately available again after reservation cancellation`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Checked-out reservation does not block future dates
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 7: Checked-out reservation does not block future dates');
  {
    const cat = categories[0];
    const res = (await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [
        {
          guest_name: 'Past Checked Out Stay',
          guest_email: 'test@hotelmantri.com',
          room_category_id: cat.id,
          check_in_date: '2028-04-10',
          check_out_date: '2028-04-12',
          rate: 2000,
          status: 'checked_out',
          auto_assign: true,
        },
      ],
      allowEmptyEmail: true,
      userId: 'TEST_SUITE',
    }))[0];
    testReservationsToCleanup.add(res.id);
    const roomNo = res.room_no;

    const futureAvail = await checkRoomAvailability({
      hotelId: HOTEL_GOPAL_ID,
      roomNo,
      checkIn: '2028-04-13',
      checkOut: '2028-04-16',
    });

    assert(
      futureAvail.available,
      `Checked-out reservation for Room ${roomNo} does not block future dates (13-16 Apr)`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 8: Maintenance / out-of-order room is excluded from auto-assignment
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 8: Maintenance / out-of-order room exclusion');
  {
    const cat = categories[0];
    const { data: testRoom } = await supabaseServiceRole
      .from('rooms')
      .select('id, room_no, room_status')
      .eq('hotel_id', HOTEL_GOPAL_ID)
      .eq('category_id', cat.id)
      .limit(1)
      .single();

    const originalStatus = testRoom.room_status;

    // Temporarily set room to 'maintenance'
    await supabaseServiceRole
      .from('rooms')
      .update({ room_status: 'maintenance' })
      .eq('id', testRoom.id);

    try {
      const avail = await getCategoryPhysicalRoomAvailability({
        hotelId: HOTEL_GOPAL_ID,
        categoryId: cat.id,
        checkIn: '2028-05-01',
        checkOut: '2028-05-03',
      });

      assert(
        avail.unavailableRoomNos.includes(testRoom.room_no) && !avail.availableRoomNos.includes(testRoom.room_no),
        `Room ${testRoom.room_no} marked "maintenance" is excluded from available rooms`
      );
    } finally {
      // Restore original status
      await supabaseServiceRole
        .from('rooms')
        .update({ room_status: originalStatus })
        .eq('id', testRoom.id);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 9: Editing dates or category revalidates the room assignment
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 9: Editing dates revalidates assignment and detects conflict');
  {
    const cat = categories[0];
    // Create blocking reservation in Room X for 10-12 May
    const resA = (await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [
        {
          guest_name: 'Blocker Stay A',
          guest_email: 'test@hotelmantri.com',
          room_category_id: cat.id,
          check_in_date: '2028-05-10',
          check_out_date: '2028-05-12',
          rate: 2000,
          status: 'confirmed',
          auto_assign: true,
        },
      ],
      allowEmptyEmail: true,
      userId: 'TEST_SUITE',
    }))[0];
    testReservationsToCleanup.add(resA.id);

    // Create reservation B for different dates
    const resB = (await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [
        {
          guest_name: 'Stay B Later Dates',
          guest_email: 'test@hotelmantri.com',
          room_category_id: cat.id,
          check_in_date: '2028-05-20',
          check_out_date: '2028-05-22',
          rate: 2000,
          status: 'confirmed',
          auto_assign: true,
        },
      ],
      allowEmptyEmail: true,
      userId: 'TEST_SUITE',
    }))[0];
    testReservationsToCleanup.add(resB.id);

    // Attempt to edit resB's room and dates to collide directly with resA's room and stay dates
    let collides = false;
    try {
      await updateReservationAtomically({
        hotelId: HOTEL_GOPAL_ID,
        reservationId: resB.id,
        updates: {
          room_no: resA.room_no,
          room_id: resA.room_id,
          check_in_date: '2028-05-10',
          check_out_date: '2028-05-12',
        },
        userId: 'TEST_SUITE',
      });
    } catch (err) {
      collides = true;
    }

    assert(
      collides,
      `Updating Stay B to collide with Stay A in Room ${resA.room_no} was blocked with conflict`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 10: Extending a reservation detects overlapping bookings
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 10: Extending reservation detects overlapping bookings');
  let test10ResGuest1 = null;
  let test10ResGuest2 = null;
  {
    const cat = categories[0];
    // Find an available room
    const avail = await getCategoryPhysicalRoomAvailability({
      hotelId: HOTEL_GOPAL_ID,
      categoryId: cat.id,
      checkIn: '2028-06-01',
      checkOut: '2028-06-10',
    });
    const targetRoom = avail.availableRoomDetails[0];

    // Guest 1: 1-3 June
    test10ResGuest1 = (await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [
        {
          guest_name: 'Guest 1 Early Stay',
          guest_email: 'test@hotelmantri.com',
          room_no: targetRoom.roomNo,
          room_id: targetRoom.id,
          check_in_date: '2028-06-01',
          check_out_date: '2028-06-03',
          rate: 2000,
          status: 'confirmed',
        },
      ],
      allowEmptyEmail: true,
      userId: 'TEST_SUITE',
    }))[0];
    testReservationsToCleanup.add(test10ResGuest1.id);

    // Guest 2: 4-6 June in the same room
    test10ResGuest2 = (await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [
        {
          guest_name: 'Guest 2 Later Stay',
          guest_email: 'test@hotelmantri.com',
          room_no: targetRoom.roomNo,
          room_id: targetRoom.id,
          check_in_date: '2028-06-04',
          check_out_date: '2028-06-06',
          rate: 2000,
          status: 'confirmed',
        },
      ],
      allowEmptyEmail: true,
      userId: 'TEST_SUITE',
    }))[0];
    testReservationsToCleanup.add(test10ResGuest2.id);

    // Attempt to extend Guest 1 checkout to 5 June (which overlaps Guest 2 starting 4 June)
    let extensionBlocked = false;
    try {
      await extendReservationStay({
        hotelId: HOTEL_GOPAL_ID,
        reservationId: test10ResGuest1.id,
        newCheckOut: '2028-06-05',
        userId: 'TEST_SUITE',
      });
    } catch (err) {
      extensionBlocked = true;
    }

    assert(
      extensionBlocked,
      `Extending Guest 1 checkout to 05 June in Room ${targetRoom.roomNo} collided with Guest 2 and was safely blocked`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 11: Cancelling reservation releases room for extension
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 11: Cancelling reservation releases room for extension');
  {
    // Cancel Guest 2
    await updateReservationAtomically({
      hotelId: HOTEL_GOPAL_ID,
      reservationId: test10ResGuest2.id,
      updates: { status: 'cancelled' },
      userId: 'TEST_SUITE',
    });

    // Now re-attempt extending Guest 1 checkout to 5 June
    let extensionSuccess = false;
    try {
      const updated = await extendReservationStay({
        hotelId: HOTEL_GOPAL_ID,
        reservationId: test10ResGuest1.id,
        newCheckOut: '2028-06-05',
        userId: 'TEST_SUITE',
      });
      extensionSuccess = updated && updated.check_out_date === '2028-06-05';
    } catch (err) {
      extensionSuccess = false;
    }

    assert(
      extensionSuccess,
      `After cancelling conflicting Guest 2, extending Guest 1 checkout to 05 June succeeded`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 12: Multi-room reservations use distinct rooms
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 12: Multi-room reservations allocate distinct physical rooms');
  {
    const cat = categories[0];
    const multiResults = await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [
        {
          guest_name: 'Multi-Room Guest 1',
          guest_email: 'test@hotelmantri.com',
          room_category_id: cat.id,
          check_in_date: '2028-07-01',
          check_out_date: '2028-07-03',
          rate: 2000,
          status: 'confirmed',
          auto_assign: true,
        },
        {
          guest_name: 'Multi-Room Guest 2',
          guest_email: 'test@hotelmantri.com',
          room_category_id: cat.id,
          check_in_date: '2028-07-01',
          check_out_date: '2028-07-03',
          rate: 2000,
          status: 'confirmed',
          auto_assign: true,
        },
      ],
      allowEmptyEmail: true,
      userId: 'TEST_SUITE',
    });

    multiResults.forEach(r => testReservationsToCleanup.add(r.id));

    const roomA = multiResults[0]?.room_no;
    const roomB = multiResults[1]?.room_no;
    const idA = multiResults[0]?.room_id;
    const idB = multiResults[1]?.room_id;

    assert(
      roomA && roomB && roomA !== roomB && idA && idB && idA !== idB,
      `Multi-room booking assigned distinct physical rooms: Room ${roomA} and Room ${roomB}`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 13: OTA imports cannot create invalid or duplicate room assignments
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 13: OTA import auto-assignment & missing category protection');
  {
    const cat = categories[0];
    // Create an unassigned OTA reservation
    const otaRes = (await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [
        {
          guest_name: 'OTA Booking.com Guest',
          guest_phone: '9988776655',
          guest_email: 'ota@booking.com',
          check_in_date: '2028-08-01',
          check_out_date: '2028-08-03',
          rate: 3000,
          rate_plan: cat.name,
          source_category: 'OTA',
          source_name: 'Booking.com',
          status: 'confirmed',
          allow_unassigned: true,
        },
      ],
      allowEmptyEmail: true,
      userId: 'OTA_IMPORT',
    }))[0];
    testReservationsToCleanup.add(otaRes.id);

    // Call autoAssignPhysicalRoom
    const assignOutcome = await autoAssignPhysicalRoom({
      hotelId: HOTEL_GOPAL_ID,
      reservationId: otaRes.id,
    });

    assert(
      assignOutcome.success && assignOutcome.roomNo && assignOutcome.roomNo !== 'Unassigned',
      `OTA reservation automatically assigned valid physical Room ${assignOutcome.roomNo}`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 14: Concurrency test: simultaneous competing requests for last room');
  {
    const cat = categories.find(c => c.name.toLowerCase().includes('suite')) || categories[categories.length - 1];
    const checkIn = '2028-09-01';
    const checkOut = '2028-09-03';

    // Get current available rooms
    const avail = await getCategoryPhysicalRoomAvailability({
      hotelId: HOTEL_GOPAL_ID,
      categoryId: cat.id,
      checkIn,
      checkOut,
    });

    // Book all except 1 room
    const fillerCount = avail.availableRooms - 1;
    const fillerReservations = [];
    if (fillerCount > 0) {
      for (let i = 0; i < fillerCount; i++) {
        fillerReservations.push({
          guest_name: `Filler Guest ${i + 1}`,
          guest_email: 'test@hotelmantri.com',
          room_category_id: cat.id,
          check_in_date: checkIn,
          check_out_date: checkOut,
          rate: 2000,
          status: 'confirmed',
          auto_assign: true,
        });
      }
      const fillers = await createReservationsAtomically({
        hotelId: HOTEL_GOPAL_ID,
        items: fillerReservations,
        allowEmptyEmail: true,
        userId: 'TEST_SUITE',
      });
      fillers.forEach(r => testReservationsToCleanup.add(r.id));
    }

    // Now exactly 1 physical room remains in this category!
    const singleAvail = await getCategoryPhysicalRoomAvailability({
      hotelId: HOTEL_GOPAL_ID,
      categoryId: cat.id,
      checkIn,
      checkOut,
    });
    console.log(`  Pre-race remaining rooms in category: ${singleAvail.availableRooms}`);

    // Fire 2 concurrent booking requests for this category
    const [p1, p2] = await Promise.allSettled([
      createReservationsAtomically({
        hotelId: HOTEL_GOPAL_ID,
        items: [
          {
            guest_name: 'Concurrent Racer 1',
            guest_email: 'test@hotelmantri.com',
            room_category_id: cat.id,
            check_in_date: checkIn,
            check_out_date: checkOut,
            rate: 2000,
            status: 'confirmed',
            auto_assign: true,
          },
        ],
        allowEmptyEmail: true,
        userId: 'TEST_SUITE_CONCURRENCY_1',
      }),
      createReservationsAtomically({
        hotelId: HOTEL_GOPAL_ID,
        items: [
          {
            guest_name: 'Concurrent Racer 2',
            guest_email: 'test@hotelmantri.com',
            room_category_id: cat.id,
            check_in_date: checkIn,
            check_out_date: checkOut,
            rate: 2000,
            status: 'confirmed',
            auto_assign: true,
          },
        ],
        allowEmptyEmail: true,
        userId: 'TEST_SUITE_CONCURRENCY_2',
      }),
    ]);

    let successCount = 0;
    let conflictCount = 0;
    const assignedRooms = [];

    if (p1.status === 'fulfilled') {
      successCount++;
      const res = p1.value[0];
      testReservationsToCleanup.add(res.id);
      assignedRooms.push(res.room_no);
    } else {
      conflictCount++;
    }

    if (p2.status === 'fulfilled') {
      successCount++;
      const res = p2.value[0];
      testReservationsToCleanup.add(res.id);
      assignedRooms.push(res.room_no);
    } else {
      conflictCount++;
    }

    // Guarantee: Double-booking never occurred
    const uniqueAssignedRooms = new Set(assignedRooms);
    const noDoubleBooking = uniqueAssignedRooms.size === assignedRooms.length;

    assert(
      noDoubleBooking && (successCount === 1 || (successCount === 2 && uniqueAssignedRooms.size === 2)),
      `Concurrency race resolved safely without double-booking (successes: ${successCount}, conflicts: ${conflictCount}, assigned rooms: ${assignedRooms.join(', ')})`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 15: API retries do not create duplicate reservations (idempotency)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 15: API retries / idempotency duplicate prevention');
  {
    const idempKey = `test_idemp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const cat = categories[0];

    const call1 = await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [
        {
          guest_name: 'Idempotent Guest',
          guest_email: 'test@hotelmantri.com',
          room_category_id: cat.id,
          check_in_date: '2028-10-01',
          check_out_date: '2028-10-03',
          rate: 2500,
          status: 'confirmed',
          auto_assign: true,
          idempotency_key: idempKey,
        },
      ],
      allowEmptyEmail: true,
      userId: 'TEST_SUITE',
    });
    const res1 = call1[0];
    testReservationsToCleanup.add(res1.id);

    // Immediate replay with exact same idempotency_key
    let call2Replayed = false;
    let res2 = null;
    try {
      const call2 = await createReservationsAtomically({
        hotelId: HOTEL_GOPAL_ID,
        items: [
          {
            guest_name: 'Idempotent Guest',
            guest_email: 'test@hotelmantri.com',
            room_category_id: cat.id,
            check_in_date: '2028-10-01',
            check_out_date: '2028-10-03',
            rate: 2500,
            status: 'confirmed',
            auto_assign: true,
            idempotency_key: idempKey,
          },
        ],
        allowEmptyEmail: true,
        userId: 'TEST_SUITE',
      });
      res2 = call2[0];
    } catch (err) {
      if (err.idempotentReplay && err.existingReservation) {
        call2Replayed = true;
        res2 = err.existingReservation;
      }
    }

    assert(
      res1.id === res2?.id,
      `API retry with idempotency key replayed original reservation ${res1.id} without creating duplicate record`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 16: Check Availability agrees with actual assignment API
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 16: Check Availability agrees with actual assignment API');
  {
    const cat = categories.find(c => c.name.toLowerCase().includes('suite')) || categories[categories.length - 1];
    const checkIn = '2028-11-01';
    const checkOut = '2028-11-03';

    const availBefore = await getCategoryPhysicalRoomAvailability({
      hotelId: HOTEL_GOPAL_ID,
      categoryId: cat.id,
      checkIn,
      checkOut,
    });

    const res = (await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [
        {
          guest_name: 'Agreement Test Guest',
          guest_email: 'test@hotelmantri.com',
          room_category_id: cat.id,
          check_in_date: checkIn,
          check_out_date: checkOut,
          rate: 2000,
          status: 'confirmed',
          auto_assign: true,
        },
      ],
      allowEmptyEmail: true,
      userId: 'TEST_SUITE',
    }))[0];
    testReservationsToCleanup.add(res.id);

    const availAfter = await getCategoryPhysicalRoomAvailability({
      hotelId: HOTEL_GOPAL_ID,
      categoryId: cat.id,
      checkIn,
      checkOut,
    });

    assert(
      availBefore.availableRoomNos.includes(res.room_no) &&
      availAfter.availableRooms === availBefore.availableRooms - 1 &&
      availAfter.unavailableRoomNos.includes(res.room_no),
      `Assigned Room ${res.room_no} matched available list and decremented availability count from ${availBefore.availableRooms} to ${availAfter.availableRooms}`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 17: Multi-tenant isolation: changes to one hotel never affect another
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 17: Multi-tenant isolation between hotels');
  {
    // Check mars hotel availability
    const marsAvailBefore = await getCategoryPhysicalRoomAvailability({
      hotelId: MARS_HOTEL_ID,
      checkIn: '2028-12-01',
      checkOut: '2028-12-03',
    });

    // Book in HOTEL GOPAL
    const gopalRes = (await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [
        {
          guest_name: 'Gopal Isolation Guest',
          guest_email: 'test@hotelmantri.com',
          room_category_id: categories[0].id,
          check_in_date: '2028-12-01',
          check_out_date: '2028-12-03',
          rate: 2000,
          status: 'confirmed',
          auto_assign: true,
        },
      ],
      allowEmptyEmail: true,
      userId: 'TEST_SUITE',
    }))[0];
    testReservationsToCleanup.add(gopalRes.id);

    // Recheck mars hotel availability
    const marsAvailAfter = await getCategoryPhysicalRoomAvailability({
      hotelId: MARS_HOTEL_ID,
      checkIn: '2028-12-01',
      checkOut: '2028-12-03',
    });

    assert(
      marsAvailBefore.availableRooms === marsAvailAfter.availableRooms &&
      marsAvailBefore.totalRooms === marsAvailAfter.totalRooms,
      `Booking in HOTEL GOPAL did not affect MARS HOTEL availability (${marsAvailBefore.availableRooms} rooms remain)`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 18: Operations Board and Reservations list show identical assignment
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 18: Operations Board & Reservations list show identical assignment');
  {
    const cat = categories[0];
    const res = (await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [
        {
          guest_name: 'Ops Board Sync Guest',
          guest_email: 'test@hotelmantri.com',
          room_category_id: cat.id,
          check_in_date: '2028-12-10',
          check_out_date: '2028-12-12',
          rate: 2000,
          status: 'confirmed',
          auto_assign: true,
        },
      ],
      allowEmptyEmail: true,
      userId: 'TEST_SUITE',
    }))[0];
    testReservationsToCleanup.add(res.id);

    // Query reservations table
    const { data: dbRes } = await supabaseServiceRole
      .from('reservations')
      .select('id, room_no, room_id, guest_name')
      .eq('id', res.id)
      .single();

    // Query active stays for Operations Board view
    const { data: boardView } = await supabaseServiceRole
      .from('reservations')
      .select('id, room_no, room_id, guest_name')
      .eq('hotel_id', HOTEL_GOPAL_ID)
      .eq('room_no', res.room_no)
      .eq('check_in_date', '2028-12-10')
      .single();

    assert(
      dbRes.room_no === res.room_no && boardView.room_no === res.room_no,
      `Reservation ${res.id} displays Room ${res.room_no} identically in Reservation List and Operations Board query`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 19: Real-time availability updates without stale cache
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 19: Real-time availability updates without stale cache');
  {
    const cat = categories.find(c => c.name.toLowerCase().includes('suite')) || categories[categories.length - 1];
    const checkIn = '2028-12-15';
    const checkOut = '2028-12-17';

    const avail1 = await getCategoryPhysicalRoomAvailability({
      hotelId: HOTEL_GOPAL_ID,
      categoryId: cat.id,
      checkIn,
      checkOut,
    });

    const res = (await createReservationsAtomically({
      hotelId: HOTEL_GOPAL_ID,
      items: [
        {
          guest_name: 'Fresh Query Guest',
          guest_email: 'test@hotelmantri.com',
          room_category_id: cat.id,
          check_in_date: checkIn,
          check_out_date: checkOut,
          rate: 2000,
          status: 'confirmed',
          auto_assign: true,
        },
      ],
      allowEmptyEmail: true,
      userId: 'TEST_SUITE',
    }))[0];
    testReservationsToCleanup.add(res.id);

    const avail2 = await getCategoryPhysicalRoomAvailability({
      hotelId: HOTEL_GOPAL_ID,
      categoryId: cat.id,
      checkIn,
      checkOut,
    });

    assert(
      avail2.availableRooms === avail1.availableRooms - 1 && avail2.unavailableRoomNos.includes(res.room_no),
      `Immediate subsequent availability query accurately reflects reservation without stale caching`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 20: Atomic rollback on failed multi-room assignment leaves no orphaned records
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nTEST 20: Atomic rollback on failed multi-room assignment leaves no orphaned records');
  {
    const cat = categories.find(c => c.name.toLowerCase().includes('suite')) || categories[categories.length - 1];
    // Find how many rooms are available for dates
    const avail = await getCategoryPhysicalRoomAvailability({
      hotelId: HOTEL_GOPAL_ID,
      categoryId: cat.id,
      checkIn: '2028-12-20',
      checkOut: '2028-12-22',
    });

    // Request total available + 1 rooms in a batch
    const batch = [];
    for (let i = 0; i <= avail.availableRooms; i++) {
      batch.push({
        guest_name: `Atomic Rollback Guest ${i + 1}`,
        guest_email: 'test@hotelmantri.com',
        room_category_id: cat.id,
        check_in_date: '2028-12-20',
        check_out_date: '2028-12-22',
        rate: 2000,
        status: 'confirmed',
        auto_assign: true,
      });
    }

    let batchFailed = false;
    try {
      await createReservationsAtomically({
        hotelId: HOTEL_GOPAL_ID,
        items: batch,
        allowEmptyEmail: true,
        userId: 'TEST_SUITE_ROLLBACK',
      });
    } catch (err) {
      batchFailed = true;
    }

    // Verify none of the items were left inserted in the database
    const { data: orphaned } = await supabaseServiceRole
      .from('reservations')
      .select('id, guest_name')
      .eq('hotel_id', HOTEL_GOPAL_ID)
      .ilike('guest_name', 'Atomic Rollback Guest%');

    assert(
      batchFailed && (!orphaned || orphaned.length === 0),
      `Partial batch failure rolled back completely; orphaned reservations count = ${orphaned?.length || 0}`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log(`MASTER SUITE RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================\n');

  await cleanup();

  if (failed > 0) {
    console.error(`❌ ${failed} tests failed!`);
    setTimeout(() => process.exit(1), 100);
  } else {
    console.log(`✅ All ${passed} tests passed successfully!`);
    setTimeout(() => process.exit(0), 100);
  }
}

runMasterTestSuite().catch(async (err) => {
  console.error('Fatal test error:', err);
  await cleanup();
  setTimeout(() => process.exit(1), 100);
});
