/**
 * Hotel Mantri — Financial Calculation Engine Comprehensive Test Suite
 *
 * Verifies all 10 core architectural test scenarios + visual regression test:
 *   TEST 1: Multi-night revenue strictly allocated by occupied room nights [check-in, check-out)
 *   TEST 2: Payment date separation (100% upfront payment on Day 1)
 *   TEST 3: Daily payment schedule (Cash Closing on each day receives only that day's cash)
 *   TEST 4: Partial payments across different business dates
 *   TEST 5: Advance payment received before check-in date
 *   TEST 6: Multiple concurrent reservations on same business date (no cross-contamination)
 *   TEST 7: Multi-room stays with independent rates (no duplicate counting)
 *   TEST 8: Payment methods segregation (Cash, Bank, UPI, Card, OTA)
 *   TEST 9: Future payment isolation (future payments NEVER appear in today's Cash Closing)
 *   TEST 10: Timezone boundary stability (hotel-local YYYY-MM-DD, no UTC shift)
 *   TEST 11 (Visual Regression): 31-Aug to 02-Sep stay -> ₹1,200 on 31-Aug, ₹1,200 on 01-Sep, ₹0 on 02-Sep.
 *
 * Run with:
 *   node scripts/test_financial_calculation_engine.mjs
 */

import {
  generateOccupiedStayNights,
  generateRoomRevenueLedger,
  reconcilePaymentLedger,
  aggregateDailyRoomRevenue,
  aggregateDailyCollections,
  calculateCashClosing,
  isStayOccupiedOnDate,
  isStayOverlapping,
  calcStayNights,
  normalizeDateString,
} from '../server/services/financialLedgerService.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    failedTests++;
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(message);
  } else {
    passedTests++;
    console.log(`  ✅ PASSED: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  totalTests++;
  if (actual !== expected) {
    failedTests++;
    console.error(`  ❌ FAILED: ${message} (Expected: ${expected}, Actual: ${actual})`);
    throw new Error(`${message} -> Expected ${expected}, got ${actual}`);
  } else {
    passedTests++;
    console.log(`  ✅ PASSED: ${message} (= ${actual})`);
  }
}

function assertClose(actual, expected, message) {
  totalTests++;
  if (Math.abs(actual - expected) > 0.01) {
    failedTests++;
    console.error(`  ❌ FAILED: ${message} (Expected: ${expected}, Actual: ${actual})`);
    throw new Error(`${message} -> Expected ${expected}, got ${actual}`);
  } else {
    passedTests++;
    console.log(`  ✅ PASSED: ${message} (= ${actual})`);
  }
}

console.log('================================================================');
console.log('HOTEL MANTRI — FINANCIAL CALCULATION ENGINE VERIFICATION');
console.log('================================================================\n');

// ── TEST 1: 3-night stay, ₹12,000 total, ₹4,000/night ───────────────────────
console.log('--- TEST 1: Room Revenue By Occupied Business Date ---');
{
  const stay = {
    id: 'res_001',
    hotel_id: 'hotel_gopal',
    check_in_date: '2026-09-01',
    check_out_date: '2026-09-04',
    rate: 4000,
    invoice_total: 12000,
    room_no: '101',
    guest_name: 'Test Guest 1',
  };

  const occupiedNights = generateOccupiedStayNights(stay.check_in_date, stay.check_out_date);
  assertEqual(occupiedNights.length, 3, '3 occupied room nights generated');
  assertEqual(occupiedNights[0], '2026-09-01', 'Night 1 is 2026-09-01');
  assertEqual(occupiedNights[1], '2026-09-02', 'Night 2 is 2026-09-02');
  assertEqual(occupiedNights[2], '2026-09-03', 'Night 3 is 2026-09-03');
  assert(!occupiedNights.includes('2026-09-04'), 'Departure date 2026-09-04 is strictly EXCLUDED from occupied nights');

  const ledger = generateRoomRevenueLedger(stay);
  assertEqual(ledger.length, 3, '3 room revenue ledger entries created');

  const revDay1 = aggregateDailyRoomRevenue(ledger, '2026-09-01');
  const revDay2 = aggregateDailyRoomRevenue(ledger, '2026-09-02');
  const revDay3 = aggregateDailyRoomRevenue(ledger, '2026-09-03');
  const revDay4 = aggregateDailyRoomRevenue(ledger, '2026-09-04');

  assertEqual(revDay1.totalRoomRevenue, 4000, 'Revenue Day 1 (01-09-2026) = ₹4,000');
  assertEqual(revDay2.totalRoomRevenue, 4000, 'Revenue Day 2 (02-09-2026) = ₹4,000');
  assertEqual(revDay3.totalRoomRevenue, 4000, 'Revenue Day 3 (03-09-2026) = ₹4,000');
  assertEqual(revDay4.totalRoomRevenue, 0, 'Revenue Day 4 (checkout date) = ₹0');
}

// ── TEST 2: Payment date separation (100% upfront payment Day 1) ────────────
console.log('\n--- TEST 2: ₹12,000 Paid Entirely on Day 1 ---');
{
  const timelineEvents = [
    {
      id: 'tl_pay_01',
      hotel_id: 'hotel_gopal',
      reservation_id: 'res_001',
      event_type: 'check_in',
      event_amount: 12000,
      event_data: {
        payment_date: '2026-09-01',
        payment_method: 'Cash',
      },
    },
  ];

  const transactions = reconcilePaymentLedger({ timelineEvents, hotelId: 'hotel_gopal' });
  assertEqual(transactions.length, 1, '1 payment transaction recognized');
  assertEqual(transactions[0].payment_date, '2026-09-01', 'Payment date is 2026-09-01');
  assertEqual(transactions[0].amount, 12000, 'Payment amount is ₹12,000');

  const colDay1 = aggregateDailyCollections(transactions, '2026-09-01');
  const colDay2 = aggregateDailyCollections(transactions, '2026-09-02');
  const colDay3 = aggregateDailyCollections(transactions, '2026-09-03');

  assertEqual(colDay1.cash, 12000, 'Collection Day 1 = ₹12,000 Cash');
  assertEqual(colDay2.cash, 0, 'Collection Day 2 = ₹0');
  assertEqual(colDay3.cash, 0, 'Collection Day 3 = ₹0');
  assertEqual(colDay1.totalCollections, 12000, 'Total collection Day 1 = ₹12,000');
}

// ── TEST 3: ₹4,000 paid each day ────────────────────────────────────────────
console.log('\n--- TEST 3: ₹4,000 Paid Each Day (Daily Payments) ---');
{
  const timelineEvents = [
    {
      id: 'tl_p1',
      hotel_id: 'hotel_gopal',
      reservation_id: 'res_001',
      event_type: 'check_in',
      event_amount: 4000,
      event_data: { payment_date: '2026-09-01', payment_method: 'Cash' },
    },
    {
      id: 'tl_p2',
      hotel_id: 'hotel_gopal',
      reservation_id: 'res_001',
      event_type: 'payment_received',
      event_amount: 4000,
      event_data: { payment_date: '2026-09-02', payment_method: 'Cash' },
    },
    {
      id: 'tl_p3',
      hotel_id: 'hotel_gopal',
      reservation_id: 'res_001',
      event_type: 'payment_received',
      event_amount: 4000,
      event_data: { payment_date: '2026-09-03', payment_method: 'Cash' },
    },
  ];

  const transactions = reconcilePaymentLedger({ timelineEvents, hotelId: 'hotel_gopal' });
  assertEqual(transactions.length, 3, '3 discrete payment transactions recorded');

  const c1 = aggregateDailyCollections(transactions, '2026-09-01');
  const c2 = aggregateDailyCollections(transactions, '2026-09-02');
  const c3 = aggregateDailyCollections(transactions, '2026-09-03');
  const c4 = aggregateDailyCollections(transactions, '2026-09-04');

  assertEqual(c1.cash, 4000, 'Collection Day 1 = ₹4,000 Cash');
  assertEqual(c2.cash, 4000, 'Collection Day 2 = ₹4,000 Cash');
  assertEqual(c3.cash, 4000, 'Collection Day 3 = ₹4,000 Cash');
  assertEqual(c4.cash, 0, 'Collection Day 4 = ₹0');
}

// ── TEST 4: Partial payments (₹2,000 Day 1, ₹5,000 Day 2, ₹5,000 Day 3) ─────
console.log('\n--- TEST 4: Partial Payments (₹2,000 Day 1, ₹5,000 Day 2, ₹5,000 Day 3) ---');
{
  const timelineEvents = [
    {
      id: 'tl_part_1',
      hotel_id: 'hotel_gopal',
      event_type: 'check_in',
      event_amount: 2000,
      event_data: { payment_date: '2026-09-01', payment_method: 'Cash' },
    },
    {
      id: 'tl_part_2',
      hotel_id: 'hotel_gopal',
      event_type: 'payment_received',
      event_amount: 5000,
      event_data: { payment_date: '2026-09-02', payment_method: 'UPI' },
    },
    {
      id: 'tl_part_3',
      hotel_id: 'hotel_gopal',
      event_type: 'checkout',
      event_amount: 5000,
      event_data: { payment_date: '2026-09-03', payment_method: 'Cash' },
    },
  ];

  const transactions = reconcilePaymentLedger({ timelineEvents, hotelId: 'hotel_gopal' });
  const c1 = aggregateDailyCollections(transactions, '2026-09-01');
  const c2 = aggregateDailyCollections(transactions, '2026-09-02');
  const c3 = aggregateDailyCollections(transactions, '2026-09-03');

  assertEqual(c1.cash, 2000, 'Day 1: ₹2,000 Cash');
  assertEqual(c1.upi, 0, 'Day 1: ₹0 UPI');
  assertEqual(c2.upi, 5000, 'Day 2: ₹5,000 UPI');
  assertEqual(c2.cash, 0, 'Day 2: ₹0 Cash');
  assertEqual(c3.cash, 5000, 'Day 3: ₹5,000 Cash');
}

// ── TEST 5: Advance payment before check-in ──────────────────────────────────
console.log('\n--- TEST 5: Advance Payment Before Check-in ---');
{
  const stay = {
    id: 'res_adv_01',
    hotel_id: 'hotel_gopal',
    check_in_date: '2026-09-10',
    check_out_date: '2026-09-12',
    rate: 5000,
    invoice_total: 10000,
    guest_name: 'Advance Guest',
  };

  const timelineEvents = [
    {
      id: 'tl_adv_01',
      hotel_id: 'hotel_gopal',
      reservation_id: 'res_adv_01',
      event_type: 'advance_payment',
      event_amount: 5000,
      event_data: {
        payment_date: '2026-09-08',
        payment_method: 'Cash',
      },
    },
  ];

  const ledger = generateRoomRevenueLedger(stay);
  const transactions = reconcilePaymentLedger({ timelineEvents, hotelId: 'hotel_gopal' });

  // On payment date 08-Sep
  const rev08 = aggregateDailyRoomRevenue(ledger, '2026-09-08');
  const col08 = aggregateDailyCollections(transactions, '2026-09-08');
  assertEqual(col08.cash, 5000, '08-Sep: Collection = ₹5,000 Cash');
  assertEqual(rev08.totalRoomRevenue, 0, '08-Sep: Room Revenue = ₹0 (Stay has not started)');

  // On check-in date 10-Sep
  const rev10 = aggregateDailyRoomRevenue(ledger, '2026-09-10');
  const col10 = aggregateDailyCollections(transactions, '2026-09-10');
  assertEqual(rev10.totalRoomRevenue, 5000, '10-Sep: Room Revenue = ₹5,000');
  assertEqual(col10.cash, 0, '10-Sep: Collection = ₹0 (already collected in advance)');

  // On occupied date 11-Sep
  const rev11 = aggregateDailyRoomRevenue(ledger, '2026-09-11');
  assertEqual(rev11.totalRoomRevenue, 5000, '11-Sep: Room Revenue = ₹5,000');

  // On departure date 12-Sep
  const rev12 = aggregateDailyRoomRevenue(ledger, '2026-09-12');
  assertEqual(rev12.totalRoomRevenue, 0, '12-Sep: Departure date revenue = ₹0');
}

// ── TEST 6: Multiple reservations on same day (no cross-contamination) ───────
console.log('\n--- TEST 6: Multiple Reservations on Same Day ---');
{
  const stayA = {
    id: 'res_A',
    hotel_id: 'hotel_gopal',
    check_in_date: '2026-09-01',
    check_out_date: '2026-09-02',
    rate: 3000,
    invoice_total: 3000,
    room_no: '101',
    guest_name: 'Guest A',
  };
  const stayB = {
    id: 'res_B',
    hotel_id: 'hotel_gopal',
    check_in_date: '2026-09-01',
    check_out_date: '2026-09-03',
    rate: 4500,
    invoice_total: 9000,
    room_no: '102',
    guest_name: 'Guest B',
  };

  const ledgerA = generateRoomRevenueLedger(stayA);
  const ledgerB = generateRoomRevenueLedger(stayB);
  const combinedLedger = [...ledgerA, ...ledgerB];

  const revDay1 = aggregateDailyRoomRevenue(combinedLedger, '2026-09-01');
  const revDay2 = aggregateDailyRoomRevenue(combinedLedger, '2026-09-02');

  assertEqual(revDay1.totalRoomRevenue, 7500, 'Day 1 Room Revenue = ₹3,000 + ₹4,500 = ₹7,500');
  assertEqual(revDay1.occupiedRooms, 2, 'Day 1 Occupied Rooms = 2');
  assertEqual(revDay2.totalRoomRevenue, 4500, 'Day 2 Room Revenue = ₹4,500 (Guest B only)');
  assertEqual(revDay2.occupiedRooms, 1, 'Day 2 Occupied Rooms = 1');
}

// ── TEST 7: Multiple rooms in a reservation (no duplicate revenue) ───────────
console.log('\n--- TEST 7: Multi-room Reservation Revenue Split ---');
{
  const rooms = [
    { room_no: '101', rate: 4000 },
    { room_no: '102', rate: 3000 },
    { room_no: '103', rate: 5000 },
  ];

  let combinedLedger = [];
  for (const rm of rooms) {
    const rmLedger = generateRoomRevenueLedger({
      reservation_id: 'group_res_100',
      hotel_id: 'hotel_gopal',
      check_in_date: '2026-09-01',
      check_out_date: '2026-09-03', // 2 nights
      rate: rm.rate,
      invoice_total: rm.rate * 2,
      room_no: rm.room_no,
      guest_name: 'Group Lead',
    });
    combinedLedger.push(...rmLedger);
  }

  assertEqual(combinedLedger.length, 6, '6 total room-night ledger entries created (3 rooms × 2 nights)');

  const revDay1 = aggregateDailyRoomRevenue(combinedLedger, '2026-09-01');
  const revDay2 = aggregateDailyRoomRevenue(combinedLedger, '2026-09-02');
  const revDay3 = aggregateDailyRoomRevenue(combinedLedger, '2026-09-03');

  assertEqual(revDay1.totalRoomRevenue, 12000, 'Day 1 multi-room revenue = 4000 + 3000 + 5000 = ₹12,000');
  assertEqual(revDay1.occupiedRooms, 3, 'Day 1 occupied rooms = 3');
  assertEqual(revDay2.totalRoomRevenue, 12000, 'Day 2 multi-room revenue = ₹12,000');
  assertEqual(revDay3.totalRoomRevenue, 0, 'Day 3 checkout date = ₹0');
}

// ── TEST 8: Payment methods segregation (Cash, Bank, UPI, Card, OTA) ────────
console.log('\n--- TEST 8: Payment Method Bucket Segregation ---');
{
  const timelineEvents = [
    { id: 'tx_c', hotel_id: 'hotel_gopal', event_type: 'payment_received', event_amount: 1000, event_data: { payment_date: '2026-09-01', payment_method: 'Cash' } },
    { id: 'tx_b', hotel_id: 'hotel_gopal', event_type: 'payment_received', event_amount: 2000, event_data: { payment_date: '2026-09-01', payment_method: 'Bank' } },
    { id: 'tx_u', hotel_id: 'hotel_gopal', event_type: 'payment_received', event_amount: 3000, event_data: { payment_date: '2026-09-01', payment_method: 'UPI' } },
    { id: 'tx_d', hotel_id: 'hotel_gopal', event_type: 'payment_received', event_amount: 4000, event_data: { payment_date: '2026-09-01', payment_method: 'Card' } },
    { id: 'tx_o', hotel_id: 'hotel_gopal', event_type: 'payment_received', event_amount: 5000, event_data: { payment_date: '2026-09-01', payment_method: 'OTA' } },
  ];

  const transactions = reconcilePaymentLedger({ timelineEvents, hotelId: 'hotel_gopal' });
  const col = aggregateDailyCollections(transactions, '2026-09-01');

  assertEqual(col.cash, 1000, 'Cash bucket = ₹1,000');
  assertEqual(col.bank, 2000, 'Bank bucket = ₹2,000');
  assertEqual(col.upi, 3000, 'UPI bucket = ₹3,000');
  assertEqual(col.card, 4000, 'Card bucket = ₹4,000');
  assertEqual(col.ota, 5000, 'OTA bucket = ₹5,000');
  assertEqual(col.totalCollections, 15000, 'Total collections = ₹15,000');
}

// ── TEST 9: Future payment isolation ────────────────────────────────────────
console.log('\n--- TEST 9: Future Payment NEVER in Today\'s Cash Closing ---');
{
  const timelineEvents = [
    { id: 'tx_today', hotel_id: 'hotel_gopal', event_type: 'payment_received', event_amount: 2500, event_data: { payment_date: '2026-09-01', payment_method: 'Cash' } },
    { id: 'tx_future1', hotel_id: 'hotel_gopal', event_type: 'payment_received', event_amount: 8000, event_data: { payment_date: '2026-09-02', payment_method: 'Cash' } },
    { id: 'tx_future2', hotel_id: 'hotel_gopal', event_type: 'payment_received', event_amount: 15000, event_data: { payment_date: '2026-09-03', payment_method: 'Cash' } },
  ];

  const transactions = reconcilePaymentLedger({ timelineEvents, hotelId: 'hotel_gopal' });
  const colToday = aggregateDailyCollections(transactions, '2026-09-01');

  assertEqual(colToday.cash, 2500, 'Today\'s Cash Collection = ₹2,500 only');
  assert(!colToday.transactions.some(tx => tx.payment_date > '2026-09-01'), 'No future transaction exists in today\'s collections');

  const closing = calculateCashClosing({
    openingCash: 10000,
    cashCollections: colToday.cash,
    otherCashIncome: 0,
    cashExpenses: 500,
    salaryAdvance: 0,
    cashHandover: 0,
    bankDeposit: 0,
  });

  // Opening (10,000) + Cash Collection (2,500) - Expenses (500) = 12,000
  assertEqual(closing.closingCash, 12000, 'Cash Closing for 2026-09-01 is exactly ₹12,000 without future payments');
}

// ── TEST 10: Timezone boundary stability ────────────────────────────────────
console.log('\n--- TEST 10: Timezone Boundary Stability ---');
{
  const inputDate = '2026-08-31';
  const normalized = normalizeDateString(inputDate);
  assertEqual(normalized, '2026-08-31', '31-08-2026 preserved exactly without day shift');

  const nights = generateOccupiedStayNights('2026-08-31', '2026-09-02');
  assertEqual(nights[0], '2026-08-31', 'Start night is 2026-08-31 (does not shift to 30-Aug)');
  assertEqual(nights[1], '2026-09-01', 'Second night is 2026-09-01 (does not shift)');
  assertEqual(nights.length, 2, 'Exactly 2 nights generated');
}

// ── TEST 11: Visual Regression from User Prompt (Prem Suthar Example) ───────
console.log('\n--- TEST 11: Visual Regression (Prem Suthar Example: 31-Aug to 02-Sep) ---');
{
  const stay = {
    id: 'prem_suthar_stay',
    hotel_id: 'hotel_gopal',
    room_no: '405',
    guest_name: 'Mr Prem Suthar',
    check_in_date: '2026-08-31',
    check_out_date: '2026-09-02',
    rate: 1200,
    invoice_total: 2400,
  };

  const ledger = generateRoomRevenueLedger(stay);
  const rev31 = aggregateDailyRoomRevenue(ledger, '2026-08-31');
  const rev01 = aggregateDailyRoomRevenue(ledger, '2026-09-01');
  const rev02 = aggregateDailyRoomRevenue(ledger, '2026-09-02');

  assertEqual(rev31.totalRoomRevenue, 1200, '31-08-2026 Room Revenue = ₹1,200');
  assertEqual(rev01.totalRoomRevenue, 1200, '01-09-2026 Room Revenue = ₹1,200 (NOT ₹2,400 lump sum!)');
  assertEqual(rev02.totalRoomRevenue, 0, '02-09-2026 (Departure Date) Room Revenue = ₹0');
}

// ── TEST 12: Interval Overlap Guarantee [check_in, check_out) ───────────────
console.log('\n--- TEST 12: Interval Overlap Invariant [check_in, check_out) ---');
{
  // Same room: Stay 1 checks out on 05-Sep, Stay 2 checks in on 05-Sep.
  const overlapSameDay = isStayOverlapping('2026-09-01', '2026-09-05', '2026-09-05', '2026-09-08');
  assertEqual(overlapSameDay, false, 'Adjacent checkout on 05-Sep and check-in on 05-Sep DO NOT conflict');

  // True conflict: Stay 1 checks out on 06-Sep, Stay 2 checks in on 05-Sep.
  const trueConflict = isStayOverlapping('2026-09-01', '2026-09-06', '2026-09-05', '2026-09-08');
  assertEqual(trueConflict, true, 'Stay overlapping between 05-Sep and 06-Sep correctly flagged as CONFLICT');
}

console.log('\n================================================================');
console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED out of ${totalTests} checks.`);
console.log('================================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
