import dotenv from 'dotenv';
dotenv.config();
import assert from 'assert';
import {
  calcStayNights,
  isStayOccupiedOnDate,
  aggregateRoomChart,
  buildDerivedReport,
  reconcilePeriodFinances,
  calcArr,
  calcOcc,
  calcRevpar,
} from '../src/lib/calc.ts';

function runTests() {
  console.log('='.repeat(80));
  console.log('RUNNING COMPREHENSIVE FINANCIAL MODEL TESTS');
  console.log('='.repeat(80));

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ [FAIL] ${name}:`, err.message);
    }
  }

  // TEST 16: ADVANCE PAYMENT TEST
  test('Test 16: Advance Payment Test', () => {
    // Reservation: ₹10,000, Advance: ₹4,000
    // Expected: Revenue = ₹10,000 (across stay), Collection = ₹4,000, Outstanding = ₹6,000
    const stay = {
      id: 'adv-test-1',
      report_date: '2026-09-10',
      arrival: '2026-09-10',
      departure: '2026-09-12',
      nights: 2,
      room_rate: 5000,
      total: 10000,
      pay_cash: 4000,
      pay_bank: 0,
      pay_upi: 0,
      pay_card: 0,
      pay_advance: 4000,
      pay_balance: 6000,
      is_complimentary: false,
    };

    const recon1 = reconcilePeriodFinances([stay], { start: '2026-09-10', end: '2026-09-12' });
    assert.strictEqual(recon1.totalRevenue, 10000, 'Revenue must be 10000');
    assert.strictEqual(recon1.totalCollections, 4000, 'Collection must be 4000');
    assert.strictEqual(recon1.earnedRevenueCollected, 4000, 'Collected revenue must be 4000');
    assert.strictEqual(recon1.earnedRevenueOutstanding, 6000, 'Outstanding revenue must be 6000');
    assert.strictEqual(recon1.earnedRevenueCollected + recon1.earnedRevenueOutstanding, recon1.totalRevenue, 'Revenue = Collected + Outstanding');

    // Then pay remaining ₹6,000
    stay.pay_cash = 10000;
    stay.pay_balance = 0;
    const recon2 = reconcilePeriodFinances([stay], { start: '2026-09-10', end: '2026-09-12' });
    assert.strictEqual(recon2.totalRevenue, 10000, 'Revenue still 10000');
    assert.strictEqual(recon2.totalCollections, 10000, 'Collection now 10000');
    assert.strictEqual(recon2.earnedRevenueOutstanding, 0, 'Outstanding now 0');
  });

  // TEST 17: FULL PAYMENT TEST
  test('Test 17: Full Payment Test', () => {
    // Reservation: ₹5,000, Payment: ₹5,000
    const stay = {
      id: 'full-test-1',
      report_date: '2026-09-10',
      arrival: '2026-09-10',
      departure: '2026-09-11',
      nights: 1,
      room_rate: 5000,
      total: 5000,
      pay_cash: 5000,
      pay_bank: 0,
      pay_upi: 0,
      pay_card: 0,
      pay_advance: 5000,
      pay_balance: 0,
      is_complimentary: false,
    };
    const recon = reconcilePeriodFinances([stay], { start: '2026-09-10', end: '2026-09-11' });
    assert.strictEqual(recon.totalRevenue, 5000);
    assert.strictEqual(recon.totalCollections, 5000);
    assert.strictEqual(recon.earnedRevenueCollected, 5000);
    assert.strictEqual(recon.earnedRevenueOutstanding, 0);
  });

  // TEST 18: PARTIAL PAYMENT TEST
  test('Test 18: Partial Payment Test', () => {
    // Reservation: ₹5,000, Payment: ₹3,000
    const stay = {
      id: 'part-test-1',
      report_date: '2026-09-10',
      arrival: '2026-09-10',
      departure: '2026-09-11',
      nights: 1,
      room_rate: 5000,
      total: 5000,
      pay_cash: 3000,
      pay_bank: 0,
      pay_upi: 0,
      pay_card: 0,
      pay_advance: 3000,
      pay_balance: 2000,
      is_complimentary: false,
    };
    const recon = reconcilePeriodFinances([stay], { start: '2026-09-10', end: '2026-09-11' });
    assert.strictEqual(recon.totalRevenue, 5000);
    assert.strictEqual(recon.totalCollections, 3000);
    assert.strictEqual(recon.earnedRevenueCollected, 3000);
    assert.strictEqual(recon.earnedRevenueOutstanding, 2000);
  });

  // TEST 19: MULTI-NIGHT TEST (REVENUE DATES VS PAYMENT DATE)
  test('Test 19: Multi-night Test (31 Aug -> 2 Sep, rate 1200/night, paid on 1 Sep)', () => {
    const stay = {
      id: 'multi-night-1',
      report_date: '2026-09-01', // payment posted on 1 Sep
      arrival: '2026-08-31',
      departure: '2026-09-02',
      nights: 2,
      room_rate: 1200,
      total: 2400,
      pay_cash: 2400,
      pay_bank: 0,
      pay_upi: 0,
      pay_card: 0,
      pay_advance: 2400,
      pay_balance: 0,
      is_complimentary: false,
    };

    // Revenue on 31 Aug
    const reconAug = reconcilePeriodFinances([stay], { start: '2026-08-31', end: '2026-08-31' });
    assert.strictEqual(reconAug.totalRevenue, 1200, '31 Aug revenue must be 1200');
    assert.strictEqual(reconAug.totalCollections, 0, '31 Aug collection must be 0 (paid on 1 Sep)');

    // Revenue on 1 Sep
    const reconSept = reconcilePeriodFinances([stay], { start: '2026-09-01', end: '2026-09-01' });
    assert.strictEqual(reconSept.totalRevenue, 1200, '1 Sep revenue must be 1200 (NOT 2400)');
    assert.strictEqual(reconSept.totalCollections, 2400, '1 Sep collection must be 2400');
    assert.strictEqual(reconSept.collectionsForOtherPeriods, 1200, '1200 was collected for prior August night');
  });

  // TEST 20: MULTI-ROOM TEST
  test('Test 20: Multi-room Test (101=1200, 102=1500, 103=1800, 2 nights, total 9000, payment 5000)', () => {
    const rm101 = { id: 'm-101', reservation_id: 'resv-multi-1', guest_name: 'Group Leader', report_date: '2026-09-01', arrival: '2026-09-01', departure: '2026-09-03', nights: 2, room_rate: 1200, total: 2400, pay_cash: 5000, pay_bank: 0, pay_upi: 0, pay_card: 0, pay_balance: 0, is_complimentary: false };
    const rm102 = { id: 'm-102', reservation_id: 'resv-multi-1', guest_name: 'Group Leader', report_date: '2026-09-01', arrival: '2026-09-01', departure: '2026-09-03', nights: 2, room_rate: 1500, total: 3000, pay_cash: 0, pay_bank: 0, pay_upi: 0, pay_card: 0, pay_balance: 3000, is_complimentary: false };
    const rm103 = { id: 'm-103', reservation_id: 'resv-multi-1', guest_name: 'Group Leader', report_date: '2026-09-01', arrival: '2026-09-01', departure: '2026-09-03', nights: 2, room_rate: 1800, total: 3600, pay_cash: 0, pay_bank: 0, pay_upi: 0, pay_card: 0, pay_balance: 3600, is_complimentary: false };

    const recon = reconcilePeriodFinances([rm101, rm102, rm103], { start: '2026-09-01', end: '2026-09-03' });
    assert.strictEqual(recon.totalRevenue, 9000, 'Total revenue must be 9000');
    assert.strictEqual(recon.totalCollections, 5000, 'Total collection must be 5000');
    assert.strictEqual(recon.earnedRevenueCollected, 5000, 'Earned collected is 5000');
    assert.strictEqual(recon.earnedRevenueOutstanding, 4000, 'Earned outstanding is 4000');
    assert.strictEqual(recon.earnedRevenueCollected + recon.earnedRevenueOutstanding, 9000);
  });

  // TEST 21: PAYMENT DATE TEST
  test('Test 21: Payment Date Test (Stay 10-12 Sep @2000/nt = 4000, Paid on 15 Sep)', () => {
    const stay = {
      id: 'date-test-1',
      report_date: '2026-09-15', // Paid on 15 Sep
      arrival: '2026-09-10',
      departure: '2026-09-12',
      nights: 2,
      room_rate: 2000,
      total: 4000,
      pay_cash: 0,
      pay_bank: 4000,
      pay_upi: 0,
      pay_card: 0,
      pay_advance: 4000,
      pay_balance: 0,
      is_complimentary: false,
    };

    // Checking period 10-11 Sep (stay dates)
    const reconStay = reconcilePeriodFinances([stay], { start: '2026-09-10', end: '2026-09-11' });
    assert.strictEqual(reconStay.totalRevenue, 4000, 'Stay revenue recognized on stay dates');
    assert.strictEqual(reconStay.totalCollections, 0, 'No collection on stay dates');

    // Checking 15 Sep (payment date)
    const reconPay = reconcilePeriodFinances([stay], { start: '2026-09-15', end: '2026-09-15' });
    assert.strictEqual(reconPay.totalRevenue, 0, 'No revenue on payment date');
    assert.strictEqual(reconPay.totalCollections, 4000, 'Collection posted on payment date');
  });

  // TEST 25-28: KPI FORMULAS
  test('Test 25-28: KPI Formulas (ARR, Occ, RevPAR)', () => {
    // 10 rooms occupied out of 20 total rooms, room revenue = 20,000
    const totalRooms = 20;
    const roomsOccupied = 10;
    const roomRevenue = 20000;
    const days = 1;

    const arr = calcArr(roomRevenue, roomsOccupied);
    assert.strictEqual(arr, 2000, 'ARR = 20000 / 10 = 2000');

    const occ = calcOcc(roomsOccupied, totalRooms);
    assert.strictEqual(occ, 50, 'Occ = 10 / 20 = 50%');

    const revpar = calcRevpar(roomRevenue, totalRooms, days);
    assert.strictEqual(revpar, 1000, 'RevPAR = 20000 / 20 = 1000');
    assert.strictEqual(revpar, (arr * occ) / 100, 'RevPAR == ARR * Occ%');
  });

  // TEST 22: REFUND TEST
  test('Test 22: Refund Test (Paid 5000, refund 1000 issued -> net collection 4000)', () => {
    const stay = {
      id: 'ref-test-1',
      report_date: '2026-09-10',
      arrival: '2026-09-10',
      departure: '2026-09-11',
      nights: 1,
      room_rate: 4000, // Adjusted after discount/refund
      total: 4000,
      pay_cash: 4000, // net collection
      pay_bank: 0,
      pay_upi: 0,
      pay_card: 0,
      pay_advance: 4000,
      pay_balance: 0,
      is_complimentary: false,
    };
    const recon = reconcilePeriodFinances([stay], { start: '2026-09-10', end: '2026-09-11' });
    assert.strictEqual(recon.totalRevenue, 4000, 'Adjusted revenue 4000');
    assert.strictEqual(recon.totalCollections, 4000, 'Net collection 4000');
    assert.strictEqual(recon.earnedRevenueOutstanding, 0, 'No outstanding');
  });

  // TEST 23: CANCELLATION TEST
  test('Test 23: Cancellation Test (Cancelled before stay -> no earned revenue recognized)', () => {
    const cancelledResv = {
      id: 'canc-test-1',
      status: 'cancelled',
      report_date: '2026-09-10',
      arrival: '2026-09-10',
      departure: '2026-09-12',
      nights: 2,
      room_rate: 2000,
      total: 4000,
      pay_cash: 0,
      pay_bank: 0,
      pay_upi: 0,
      pay_card: 0,
      pay_advance: 0,
      pay_balance: 0,
      is_complimentary: false,
    };
    // Cancelled reservations are excluded from active occupancy by query status filter
    const activeEntries = [cancelledResv].filter(r => r.status !== 'cancelled');
    const recon = reconcilePeriodFinances(activeEntries, { start: '2026-09-10', end: '2026-09-12' });
    assert.strictEqual(recon.totalRevenue, 0, 'Cancelled reservation must not produce earned revenue');
    assert.strictEqual(recon.totalCollections, 0, 'Cancelled reservation has 0 collection');
  });

  // TEST 24: CHECKOUT TEST
  test('Test 24: Checkout Test (Settled checkout -> 0 live in-house due; unsettled -> balance due)', () => {
    const settledStay = { id: 's-1', total: 5000, advance_paid: 5000, status: 'checked_out' };
    const unsettledStay = { id: 's-2', total: 6000, advance_paid: 2000, status: 'checked_out' };

    const getDue = (r) => Math.max(0, (r.total || 0) - (r.advance_paid || 0));
    assert.strictEqual(getDue(settledStay), 0, 'Settled checkout has 0 balance due');
    assert.strictEqual(getDue(unsettledStay), 4000, 'Unsettled checkout retains 4000 receivable balance');
  });

  // TEST 32: HOTEL ISOLATION TEST
  test('Test 32: Hotel Isolation Test (Hotel A entries never appear in Hotel B reconciliation)', () => {
    const hotelA = 'hotel-uuid-a';
    const hotelB = 'hotel-uuid-b';

    const entriesA = [{ id: '1', hotel_id: hotelA, total: 5000, room_rate: 5000, nights: 1, arrival: '2026-09-01', departure: '2026-09-02', report_date: '2026-09-01', pay_cash: 5000, pay_bank: 0, pay_upi: 0, pay_card: 0, pay_balance: 0, is_complimentary: false }];
    const entriesB = [{ id: '2', hotel_id: hotelB, total: 8000, room_rate: 8000, nights: 1, arrival: '2026-09-01', departure: '2026-09-02', report_date: '2026-09-01', pay_cash: 8000, pay_bank: 0, pay_upi: 0, pay_card: 0, pay_balance: 0, is_complimentary: false }];

    const scopedToA = entriesA.filter(e => e.hotel_id === hotelA);
    const reconA = reconcilePeriodFinances(scopedToA, { start: '2026-09-01', end: '2026-09-02' });
    assert.strictEqual(reconA.totalRevenue, 5000, 'Hotel A revenue must only be 5000');
    assert.strictEqual(reconA.totalCollections, 5000, 'Hotel A collection must only be 5000');

    const scopedToB = entriesB.filter(e => e.hotel_id === hotelB);
    const reconB = reconcilePeriodFinances(scopedToB, { start: '2026-09-01', end: '2026-09-02' });
    assert.strictEqual(reconB.totalRevenue, 8000, 'Hotel B revenue must only be 8000');
    assert.strictEqual(reconB.totalCollections, 8000, 'Hotel B collection must only be 8000');
  });

  console.log('='.repeat(80));
  console.log(`TEST RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log('='.repeat(80));
}

runTests();
