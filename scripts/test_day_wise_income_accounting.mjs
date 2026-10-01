/**
 * HOTEL MANTRI — Day-Wise Income & Historical Revenue Verification Test Suite
 */

import { supabaseServiceRole as supabase } from '../server/supabaseClient.js';
import { calculateDayWiseRevenue, isStayOccupiedOnDate, getNightlyRoomRevenue, calcStayNights } from '../server/services/RevenueCalculationService.js';

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c'; // Hotel Gopal

const results = [];
function record(testName, passed, details) {
  results.push({ test: testName, status: passed ? 'PASS' : 'FAIL', details });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${testName}: ${details}`);
}

async function runTests() {
  console.log('=== STARTING HOTEL MANTRI DAY-WISE REVENUE VERIFICATION ===\n');

  let testResvId = null;
  let testTimelineId = null;

  try {
    // ----------------------------------------------------
    // TEST 1: Current-day revenue (2026-10-02)
    // ----------------------------------------------------
    const todayRes = await calculateDayWiseRevenue({ hotelId: HOTEL_ID, date: '2026-10-02' });
    const todayPassed = todayRes.period.date === '2026-10-02' && typeof todayRes.summary.totalIncome === 'number';
    record('Current-day revenue', todayPassed, `Date: ${todayRes.period.date}, Total: ₹${todayRes.summary.totalIncome}, Status: ${todayRes.dailyBreakdown[0]?.businessDateStatus}`);

    // ----------------------------------------------------
    // TEST 2: Specific historical date (2026-10-01)
    // ----------------------------------------------------
    const oct1Res = await calculateDayWiseRevenue({ hotelId: HOTEL_ID, date: '2026-10-01' });
    const oct1Passed = oct1Res.summary.roomRevenue === 6993 && oct1Res.summary.soldRoomNights === 4;
    record('Specific historical date (2026-10-01)', oct1Passed, `Earned Revenue: ₹${oct1Res.summary.roomRevenue} across ${oct1Res.summary.soldRoomNights} room nights (expected 6993)`);

    // ----------------------------------------------------
    // TEST 3: Another historical date (2026-09-15)
    // ----------------------------------------------------
    const sep15Res = await calculateDayWiseRevenue({ hotelId: HOTEL_ID, date: '2026-09-15' });
    const sep15Passed = sep15Res.summary.roomRevenue === 9771 && sep15Res.summary.soldRoomNights === 6;
    record('Specific historical date (2026-09-15)', sep15Passed, `Earned Revenue: ₹${sep15Res.summary.roomRevenue} across ${sep15Res.summary.soldRoomNights} room nights (expected 9771)`);

    // ----------------------------------------------------
    // TEST 4: Date Range View (2026-10-01 -> 2026-10-07)
    // ----------------------------------------------------
    const rangeRes = await calculateDayWiseRevenue({ hotelId: HOTEL_ID, startDate: '2026-10-01', endDate: '2026-10-07' });
    const dailySum = rangeRes.dailyBreakdown.reduce((sum, d) => sum + d.totalIncome, 0);
    const rangePassed = rangeRes.dailyBreakdown.length === 7 && Math.abs(dailySum - rangeRes.summary.totalIncome) < 0.01;
    record('Date range total equals sum of daily earned revenue', rangePassed, `Sum of 7 days: ₹${dailySum.toFixed(2)}, Range Total: ₹${rangeRes.summary.totalIncome.toFixed(2)}`);

    // ----------------------------------------------------
    // TEST 5 & 6: Multi-night allocation & Payment-date separation (Mandatory Test Section 31)
    // Check-in: 2026-12-01, Check-out: 2026-12-03 (2 nights, rate: 1200, total: 2400)
    // Paid 2400 on 2026-12-01
    // ----------------------------------------------------
    const { data: newResv, error: insErr } = await supabase.from('reservations').insert({
      hotel_id: HOTEL_ID,
      guest_name: 'Audit Test Guest',
      check_in_date: '2026-12-01',
      check_out_date: '2026-12-03',
      rate: 1200,
      invoice_total: 2400,
      status: 'confirmed',
      room_no: '101',
      source_name: 'Direct/Walking',
      source_category: 'Direct/Walking',
      payment_mode: 'Cash',
      advance_paid: 2400,
      created_at: '2026-12-01T10:00:00Z',
    }).select().single();

    if (insErr) throw insErr;
    testResvId = newResv.id;

    // Timeline payment event on 2026-12-01
    const { data: tlEvt } = await supabase.from('booking_timeline').insert({
      hotel_id: HOTEL_ID,
      reservation_id: testResvId,
      event_type: 'payment_received',
      event_description: 'Payment: Full stay ₹2,400',
      event_amount: 2400,
      event_data: { payment_date: '2026-12-01', payment_method: 'Cash' },
    }).select().single();
    if (tlEvt) testTimelineId = tlEvt.id;

    // Calculate revenue for 2026-12-01
    const dec1Res = await calculateDayWiseRevenue({ hotelId: HOTEL_ID, date: '2026-12-01' });
    // Calculate revenue for 2026-12-02
    const dec2Res = await calculateDayWiseRevenue({ hotelId: HOTEL_ID, date: '2026-12-02' });
    // Calculate revenue for 2026-12-03 (checkout)
    const dec3Res = await calculateDayWiseRevenue({ hotelId: HOTEL_ID, date: '2026-12-03' });

    const dec1Rev = dec1Res.reservationsBreakdown.find(r => r.reservationId === testResvId)?.revenueForDate || 0;
    const dec2Rev = dec2Res.reservationsBreakdown.find(r => r.reservationId === testResvId)?.revenueForDate || 0;
    const dec3Rev = dec3Res.reservationsBreakdown.find(r => r.reservationId === testResvId)?.revenueForDate || 0;

    const multiNightPassed = dec1Rev === 1200 && dec2Rev === 1200 && dec3Rev === 0;
    record('Multi-night revenue allocation', multiNightPassed, `Dec 1: ₹${dec1Rev}, Dec 2: ₹${dec2Rev}, Dec 3 (checkout): ₹${dec3Rev}`);

    const dec1Col = dec1Res.dailyBreakdown[0]?.collections?.total || 0;
    const dec2Col = dec2Res.dailyBreakdown[0]?.collections?.total || 0;
    const paymentSeparationPassed = dec1Rev === 1200 && dec1Col >= 2400 && dec2Rev === 1200 && dec2Col === 0;
    record('Payment-date separation (Earned Revenue ≠ Collection)', paymentSeparationPassed, `Dec 1 Rev: ₹${dec1Rev}, Dec 1 Col: ₹${dec1Col} | Dec 2 Rev: ₹${dec2Rev}, Dec 2 Col: ₹${dec2Col}`);

    // ----------------------------------------------------
    // TEST 7: OTA reservation revenue
    // ----------------------------------------------------
    const oct18Res = await calculateDayWiseRevenue({ hotelId: HOTEL_ID, date: '2026-10-18' });
    const manishBooking = oct18Res.reservationsBreakdown.find(r => r.guestName.toLowerCase().includes('manish'));
    const otaPassed = Boolean(manishBooking && manishBooking.revenueForDate === 1819);
    record('OTA reservation revenue', otaPassed, `Manish Sharma on 2026-10-18: Room ${manishBooking?.roomNo} -> ₹${manishBooking?.revenueForDate} (Source: ${manishBooking?.sourceName})`);

    // ----------------------------------------------------
    // TEST 8: Reservation modification
    // ----------------------------------------------------
    await supabase.from('reservations').update({
      rate: 1500,
      invoice_total: 3000,
    }).eq('id', testResvId);

    const modDec1 = await calculateDayWiseRevenue({ hotelId: HOTEL_ID, date: '2026-12-01' });
    const modRev = modDec1.reservationsBreakdown.find(r => r.reservationId === testResvId)?.revenueForDate || 0;
    const modPassed = modRev === 1500;
    record('Reservation modification', modPassed, `After updating rate to ₹1500, daily revenue recalculated to ₹${modRev}`);

    // ----------------------------------------------------
    // TEST 9: Cancellation handling
    // ----------------------------------------------------
    await supabase.from('reservations').update({
      status: 'cancelled',
    }).eq('id', testResvId);

    const canDec1 = await calculateDayWiseRevenue({ hotelId: HOTEL_ID, date: '2026-12-01' });
    const canRev = canDec1.reservationsBreakdown.find(r => r.reservationId === testResvId)?.revenueForDate || 0;
    const canPassed = canRev === 0;
    record('Cancellation handling', canPassed, `After cancellation, earned room revenue dropped to ₹${canRev}`);

    // ----------------------------------------------------
    // TEST 10: ARR calculation (ARR = room revenue / sold room nights)
    // ----------------------------------------------------
    const arrTest = oct1Res.summary.arr === (6993 / 4);
    record('ARR calculation', arrTest, `₹${oct1Res.summary.arr} = ₹6993 / 4 nights sold`);

    // ----------------------------------------------------
    // TEST 11: RevPAR calculation (RevPAR = room revenue / available room nights)
    // ----------------------------------------------------
    const revparTest = oct1Res.summary.revpar > 0 && Math.abs(oct1Res.summary.revpar - (6993 / oct1Res.summary.availableRoomNights)) < 0.01;
    record('RevPAR calculation', revparTest, `₹${oct1Res.summary.revpar} = ₹6993 / ${oct1Res.summary.availableRoomNights} available rooms`);

    // ----------------------------------------------------
    // TEST 12: Hotel isolation
    // ----------------------------------------------------
    const dummyHotelId = '11111111-2222-3333-4444-555555555555';
    const dummyRes = await calculateDayWiseRevenue({ hotelId: dummyHotelId, date: '2026-10-01' });
    const isolationPassed = dummyRes.summary.roomRevenue === 0 && dummyRes.reservationsBreakdown.length === 0;
    record('Hotel isolation', isolationPassed, `Unrelated hotel returns 0 records and ₹0 revenue`);

    // ----------------------------------------------------
    // TEST 13: No duplicate revenue (linked room_chart_entry vs reservation)
    // ----------------------------------------------------
    const { data: sampleLinked } = await supabase.from('room_chart_entries').select('reservation_id').eq('hotel_id', HOTEL_ID).not('reservation_id', 'is', null).limit(1);
    let noDupPassed = true;
    if (sampleLinked && sampleLinked.length > 0 && sampleLinked[0].reservation_id) {
      const resvId = sampleLinked[0].reservation_id;
      const count = oct1Res.reservationsBreakdown.filter(r => r.reservationId === resvId).length;
      noDupPassed = count <= 1;
    }
    record('No duplicate revenue', noDupPassed, `Stays appearing in both room_chart_entries and reservations are synthesized once`);

  } finally {
    // Cleanup test records
    if (testTimelineId) {
      await supabase.from('booking_timeline').delete().eq('id', testTimelineId);
    }
    if (testResvId) {
      await supabase.from('reservations').delete().eq('id', testResvId);
    }
  }

  console.log('\n=== SUITE SUMMARY ===');
  console.table(results);

  const allPassed = results.every(r => r.status === 'PASS');
  console.log(`\nOVERALL STATUS: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}

runTests().catch(err => {
  console.error('Test suite runner failed:', err);
  process.exit(1);
});
