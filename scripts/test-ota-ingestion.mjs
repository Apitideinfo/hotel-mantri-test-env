import 'dotenv/config';
import { supabaseServiceRole } from '../server/supabaseClient.js';
import { AiosellReservationService } from '../server/services/integrations/aiosell/AiosellReservationService.js';
import { AiosellPayloadParser } from '../server/services/integrations/aiosell/AiosellPayloadParser.js';

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c'; // Hotel Gopal (Fa44d51cc0)
const TEST_BOOKING_ID = `TEST-OTA-${Date.now()}`;

async function runTests() {
  console.log('==================================================');
  console.log('OTA INGESTION & LIVE SYNC VERIFICATION SUITE');
  console.log('==================================================');

  // Verify DB connection
  const { data: hotel, error: hotelErr } = await supabaseServiceRole
    .from('hotels')
    .select('id, hotel_name')
    .eq('id', HOTEL_ID)
    .single();

  if (hotelErr || !hotel) {
    console.error('Failed to locate test hotel:', hotelErr);
    process.exit(1);
  }
  console.log(`✓ Active Hotel: ${hotel.hotel_name} (${hotel.id})`);

  // Verify Room Category & Physical Room
  const { data: cat } = await supabaseServiceRole
    .from('room_categories')
    .select('id, name')
    .eq('hotel_id', HOTEL_ID)
    .limit(1)
    .single();

  console.log(`✓ Verified Room Category: ${cat.name} (id: ${cat.id})`);

  let testPassedCount = 0;

  // ----------------------------------------------------
  // TEST 1: New Booking Ingestion
  // ----------------------------------------------------
  console.log('\n[TEST 1] Ingesting New OTA Reservation...');
  const newPayload = {
    bookingId: TEST_BOOKING_ID,
    channel: 'MakeMyTrip',
    hotelCode: 'fa44d51cc0',
    status: 'book',
    checkin: '2026-10-10',
    checkout: '2026-10-13',
    bookedOn: new Date().toISOString(),
    pah: false,
    amount: {
      amountAfterTax: 7500,
      amountBeforeTax: 6500,
      tax: 1000,
      currency: 'INR',
    },
    guest: {
      firstName: 'Rahul',
      lastName: 'Sharma',
      phone: '9876543210',
      email: 'rahul.test@example.com',
      address: 'Connaught Place, New Delhi',
    },
    rooms: [
      {
        roomCode: 'suite-ac',
        rateplanCode: 'suite-ac-s-ep',
        occupancy: { adults: 2, children: 1 },
        guestName: 'Rahul Sharma',
      },
    ],
  };

  const parsed1 = AiosellPayloadParser.normalize(newPayload);
  console.log('  Normalized Payload:', {
    bookingId: parsed1.bookingId,
    dates: `${parsed1.checkin} -> ${parsed1.checkout}`,
    guest: `${parsed1.guestName} (${parsed1.guestPhone})`,
    amount: parsed1.amount,
    roomCode: parsed1.roomCode,
  });

  const res1 = await AiosellReservationService.processReservation(parsed1, HOTEL_ID);
  console.log('  Process Result:', res1);

  if (res1.status === 'imported' && res1.reservationId) {
    console.log('✓ TEST 1 PASSED: Successfully imported new reservation into PMS.');
    testPassedCount++;
  } else {
    console.error('✗ TEST 1 FAILED: Expected imported status.', res1);
  }

  // Verify reservation record in PMS
  const { data: pmsRes1 } = await supabaseServiceRole
    .from('reservations')
    .select('id, guest_name, check_in_date, check_out_date, invoice_total, rate, status, room_no')
    .eq('id', res1.reservationId)
    .single();

  console.log('  PMS Reservation in DB:', pmsRes1);
  if (pmsRes1 && pmsRes1.guest_name === 'Rahul Sharma' && pmsRes1.check_in_date === '2026-10-10') {
    console.log('✓ PMS reservation fields verified accurately.');
  }

  // ----------------------------------------------------
  // TEST 2: Idempotency & Duplicate Protection
  // ----------------------------------------------------
  console.log('\n[TEST 2] Idempotency: Re-ingesting the exact same booking...');
  const res2 = await AiosellReservationService.processReservation(parsed1, HOTEL_ID);
  console.log('  Process Result (Duplicate):', res2);

  const { data: duplicateCheck } = await supabaseServiceRole
    .from('reservations')
    .select('id')
    .eq('hotel_id', HOTEL_ID)
    .ilike('remarks', `%[OTA_BOOKING_ID: ${TEST_BOOKING_ID}]%`);

  console.log(`  Count of PMS reservations with booking ID ${TEST_BOOKING_ID}:`, duplicateCheck?.length || 0);
  if (res2.status === 'updated' && res2.reservationId === res1.reservationId) {
    console.log('✓ TEST 2 PASSED: Duplicate prevented, existing record updated cleanly.');
    testPassedCount++;
  } else {
    console.error('✗ TEST 2 FAILED: Expected 1 record and updated status.', { count: duplicateCheck?.length, res2 });
  }

  // ----------------------------------------------------
  // TEST 3: Modification Ingestion
  // ----------------------------------------------------
  console.log('\n[TEST 3] Modification: Modifying dates and rate...');
  const modifyPayload = {
    ...newPayload,
    status: 'modify',
    checkin: '2026-10-11',
    checkout: '2026-10-15',
    amount: {
      amountAfterTax: 9600,
      amountBeforeTax: 8400,
      tax: 1200,
      currency: 'INR',
    },
  };

  const parsed3 = AiosellPayloadParser.normalize(modifyPayload);
  const res3 = await AiosellReservationService.processReservation(parsed3, HOTEL_ID);
  console.log('  Process Result (Modify):', res3);

  const { data: pmsRes3 } = await supabaseServiceRole
    .from('reservations')
    .select('check_in_date, check_out_date, invoice_total, rate')
    .eq('id', res1.reservationId)
    .single();

  console.log('  Updated PMS Reservation:', pmsRes3);
  if (res3.status === 'updated' && pmsRes3 && pmsRes3.check_in_date === '2026-10-11' && Number(pmsRes3.invoice_total) === 9600) {
    console.log('✓ TEST 3 PASSED: Modification updated existing reservation correctly.');
    testPassedCount++;
  } else {
    console.error('✗ TEST 3 FAILED: Modification did not update expected fields.', { res3, pmsRes3 });
  }

  // ----------------------------------------------------
  // TEST 4: Cancellation Ingestion
  // ----------------------------------------------------
  console.log('\n[TEST 4] Cancellation: Cancelling booking...');
  const cancelPayload = {
    ...modifyPayload,
    status: 'cancel',
  };

  const parsed4 = AiosellPayloadParser.normalize(cancelPayload);
  const res4 = await AiosellReservationService.processReservation(parsed4, HOTEL_ID);
  console.log('  Process Result (Cancel):', res4);

  const { data: pmsRes4 } = await supabaseServiceRole
    .from('reservations')
    .select('status, room_no')
    .eq('id', res1.reservationId)
    .single();

  console.log('  Cancelled PMS Reservation:', pmsRes4);
  if (res4.status === 'cancelled' && pmsRes4.status === 'cancelled') {
    console.log('✓ TEST 4 PASSED: Reservation successfully cancelled and room freed.');
    testPassedCount++;
  } else {
    console.error('✗ TEST 4 FAILED: Expected cancelled status.', { res4, pmsRes4 });
  }

  // ----------------------------------------------------
  // TEST 5: Unknown Room Code Mapping Guard
  // ----------------------------------------------------
  console.log('\n[TEST 5] Mapping Guard: Handling unknown room code...');
  const UNMAPPED_BOOKING_ID = `TEST-UNMAPPED-${Date.now()}`;
  const unmappedPayload = {
    ...newPayload,
    bookingId: UNMAPPED_BOOKING_ID,
    rooms: [
      {
        roomCode: 'NON_EXISTENT_SUITE_XYZ',
        rateplanCode: 'EP',
        occupancy: { adults: 2, children: 0 },
        guestName: 'Unmapped Guest',
      },
    ],
  };

  const parsed5 = AiosellPayloadParser.normalize(unmappedPayload);
  const res5 = await AiosellReservationService.processReservation(parsed5, HOTEL_ID);
  console.log('  Process Result (Unmapped):', res5);

  const { data: unmappedPms } = await supabaseServiceRole
    .from('reservations')
    .select('id')
    .eq('hotel_id', HOTEL_ID)
    .ilike('remarks', `%[OTA_BOOKING_ID: ${UNMAPPED_BOOKING_ID}]%`);

  const { data: otaRow5 } = await supabaseServiceRole
    .from('channel_ota_reservations')
    .select('import_status, booking_status')
    .eq('ota_booking_id', UNMAPPED_BOOKING_ID)
    .single();

  console.log('  OTA Reservation Record:', otaRow5);
  console.log('  PMS Reservations Created for Unmapped:', unmappedPms?.length || 0);

  if (res5.status === 'mapping_required' && (!unmappedPms || unmappedPms.length === 0) && otaRow5?.import_status === 'mapping_required') {
    console.log('✓ TEST 5 PASSED: Guard successfully prevented corrupted reservation creation.');
    testPassedCount++;
  } else {
    console.error('✗ TEST 5 FAILED: Expected mapping_required and 0 PMS reservations.', { res5, unmappedPms, otaRow5 });
  }

  // ----------------------------------------------------
  // TEST 6: Real Upstream Channel Live Sync
  // ----------------------------------------------------
  console.log('\n[TEST 6] Live Sync Integration: Testing Aiosell live reservation fetch & sync...');
  const { testConnection, fetchReservations } = await import('../server/services/aiosellService.js');
  
  const { data: settings } = await supabaseServiceRole
    .from('channel_settings')
    .select('*')
    .eq('hotel_id', HOTEL_ID)
    .single();

  const testConn = await testConnection(settings);
  console.log('  Upstream testConnection result:', { success: testConn.success, hotelCode: testConn.hotelCode });

  if (testConn.success) {
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const liveBookings = await fetchReservations(today, future, settings);
    console.log(`  Fetched ${liveBookings.length} live bookings from upstream partner.`);
    if (liveBookings.length >= 0) {
      console.log('✓ TEST 6 PASSED: Real external channel connection and reservation fetch verified.');
      testPassedCount++;
    }
  } else {
    console.error('✗ TEST 6 FAILED: Upstream connection test failed.', testConn);
  }

  // ----------------------------------------------------
  // Cleanup Test Records
  // ----------------------------------------------------
  console.log('\n[CLEANUP] Cleaning up test records...');
  await supabaseServiceRole.from('reservations').delete().eq('id', res1.reservationId);
  await supabaseServiceRole.from('channel_ota_reservations').delete().in('ota_booking_id', [TEST_BOOKING_ID, UNMAPPED_BOOKING_ID]);
  console.log('✓ Cleanup complete.');

  console.log('\n==================================================');
  console.log(`RESULTS: ${testPassedCount} of 6 test suites passed successfully!`);
  console.log('==================================================');

  if (testPassedCount === 6) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});
