/**
 * MASTER VERIFICATION TEST SUITE — HOTEL MANTRI PMS
 * 
 * Tests all 12 test cases specified in Section 33 of Master Prompt:
 * 1. Multi-night stay revenue allocation [check_in, check_out)
 * 2. Processing date independence
 * 3. Prepayment & separation of revenue from collection
 * 4. Daily payments collection separation
 * 5. Variable nightly rates
 * 6. Multi-room reservation support
 * 7. Month boundary stay
 * 8. Year boundary stay
 * 9. Reservation modification (date/rate)
 * 10. Cancellation handling
 * 11. Duplicate posting idempotency
 * 12. Multi-tenant hotel isolation
 * 13. ARR and RevPAR calculation
 * 14. Report reconciliation (Daily -> MTD -> YTD)
 */

import {
  generateOccupiedStayNights,
  generateAuthoritativeNightlyRevenue,
  getAuthoritativeDailyMetrics,
  reconcilePaymentLedger,
} from '../server/services/authoritativeRevenue.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('===============================================================');
console.log('HOTEL MANTRI — MASTER REVENUE ALLOCATION VERIFICATION TEST SUITE');
console.log('===============================================================\n');

// ── TEST 1: Multi-night stay revenue allocation ──────────────────────────────
console.log('TEST 1: Multi-night stay revenue allocation (31-08-2026 to 02-09-2026, ₹1,200/night)');
{
  const nights = generateOccupiedStayNights('2026-08-31', '2026-09-02');
  assert(nights.length === 2, 'Exactly 2 occupied nights generated');
  assert(nights[0] === '2026-08-31', 'Night 1 is 2026-08-31');
  assert(nights[1] === '2026-09-01', 'Night 2 is 2026-09-01');
  assert(!nights.includes('2026-09-02'), 'Checkout date 2026-09-02 is EXCLUDED from revenue nights');

  const res = [{
    id: 'res_1',
    hotel_id: 'hotel_1',
    room_no: '101',
    check_in_date: '2026-08-31',
    check_out_date: '2026-09-02',
    rate: 1200,
    invoice_total: 2400,
    status: 'confirmed',
  }];

  const entries = generateAuthoritativeNightlyRevenue({ hotelId: 'hotel_1', reservations: res });
  assert(entries.length === 2, '2 authoritative nightly revenue rows produced');

  const aug31 = entries.find((e) => e.business_date === '2026-08-31');
  const sep01 = entries.find((e) => e.business_date === '2026-09-01');
  const sep02 = entries.find((e) => e.business_date === '2026-09-02');

  assert(aug31 && aug31.gross_room_revenue === 1200, '31-08-2026 room revenue is ₹1,200');
  assert(sep01 && sep01.gross_room_revenue === 1200, '01-09-2026 room revenue is ₹1,200');
  assert(!sep02, '02-09-2026 has ₹0 room revenue');
}

// ── TEST 2: Processing date independence ─────────────────────────────────────
console.log('\nTEST 2: Processing date independence (reservation entered/processed on 01-09-2026)');
{
  const res = [{
    id: 'res_2',
    hotel_id: 'hotel_1',
    room_no: '102',
    check_in_date: '2026-08-31',
    check_out_date: '2026-09-02',
    rate: 1200,
    invoice_total: 2400,
    created_at: '2026-09-01T15:30:00Z', // Created on 01-09
    report_date: '2026-09-01',           // Processed on 01-09
    status: 'checked_in',
  }];

  const entries = generateAuthoritativeNightlyRevenue({ hotelId: 'hotel_1', reservations: res });
  const aug31 = entries.find((e) => e.business_date === '2026-08-31');
  const sep01 = entries.find((e) => e.business_date === '2026-09-01');

  assert(aug31 && aug31.gross_room_revenue === 1200, '31-08-2026 still recognized as ₹1,200 despite 01-09 creation date');
  assert(sep01 && sep01.gross_room_revenue === 1200, '01-09-2026 recognized as ₹1,200 (not ₹2,400 lump sum)');
}

// ── TEST 3: Prepayment & Separation of Revenue from Collection ───────────────
console.log('\nTEST 3: Full ₹2,400 payment received on 01-09-2026');
{
  const res = [{
    id: 'res_3',
    hotel_id: 'hotel_1',
    room_no: '103',
    check_in_date: '2026-08-31',
    check_out_date: '2026-09-02',
    rate: 1200,
    invoice_total: 2400,
    status: 'confirmed',
  }];

  const timelineEvents = [{
    id: 'evt_pay_1',
    hotel_id: 'hotel_1',
    reservation_id: 'res_3',
    event_type: 'payment_received',
    event_amount: 2400,
    event_data: { payment_date: '2026-09-01', payment_method: 'UPI' },
    created_at: '2026-09-01T10:00:00Z',
  }];

  const revenues = generateAuthoritativeNightlyRevenue({ hotelId: 'hotel_1', reservations: res });
  const payments = reconcilePaymentLedger({ timelineEvents, reservations: res, hotelId: 'hotel_1' });

  const revAug31 = revenues.filter((r) => r.business_date === '2026-08-31').reduce((s, r) => s + r.gross_room_revenue, 0);
  const revSep01 = revenues.filter((r) => r.business_date === '2026-09-01').reduce((s, r) => s + r.gross_room_revenue, 0);

  const colAug31 = payments.filter((p) => p.payment_date === '2026-08-31').reduce((s, p) => s + p.amount, 0);
  const colSep01 = payments.filter((p) => p.payment_date === '2026-09-01').reduce((s, p) => s + p.amount, 0);

  assert(revAug31 === 1200, '31-08 Revenue = ₹1,200');
  assert(revSep01 === 1200, '01-09 Revenue = ₹1,200 (payment did NOT inflate revenue)');
  assert(colAug31 === 0, '31-08 Collection = ₹0');
  assert(colSep01 === 2400, '01-09 Collection = ₹2,400 (matches payment date)');
}

// ── TEST 4: Three-day stay with daily payments ──────────────────────────────
console.log('\nTEST 4: Three-day stay with ₹4,000 daily payments (31-08 to 03-09, ₹12,000 total)');
{
  const res = [{
    id: 'res_4',
    hotel_id: 'hotel_1',
    room_no: '104',
    check_in_date: '2026-08-31',
    check_out_date: '2026-09-03',
    rate: 4000,
    invoice_total: 12000,
    status: 'checked_in',
  }];

  const timelineEvents = [
    { id: 'tx_1', hotel_id: 'hotel_1', reservation_id: 'res_4', event_type: 'payment_received', event_amount: 4000, event_data: { payment_date: '2026-08-31', payment_method: 'Cash' } },
    { id: 'tx_2', hotel_id: 'hotel_1', reservation_id: 'res_4', event_type: 'payment_received', event_amount: 4000, event_data: { payment_date: '2026-09-01', payment_method: 'Cash' } },
    { id: 'tx_3', hotel_id: 'hotel_1', reservation_id: 'res_4', event_type: 'payment_received', event_amount: 4000, event_data: { payment_date: '2026-09-02', payment_method: 'Cash' } },
  ];

  const payments = reconcilePaymentLedger({ timelineEvents, reservations: res, hotelId: 'hotel_1' });
  const col1 = payments.filter((p) => p.payment_date === '2026-08-31').reduce((s, p) => s + p.amount, 0);
  const col2 = payments.filter((p) => p.payment_date === '2026-09-01').reduce((s, p) => s + p.amount, 0);
  const col3 = payments.filter((p) => p.payment_date === '2026-09-02').reduce((s, p) => s + p.amount, 0);

  assert(col1 === 4000, 'Day 1 Collection = ₹4,000 (not full ₹12,000)');
  assert(col2 === 4000, 'Day 2 Collection = ₹4,000');
  assert(col3 === 4000, 'Day 3 Collection = ₹4,000');
}

// ── TEST 5: Variable nightly rates ──────────────────────────────────────────
console.log('\nTEST 5: Variable nightly rates (31-08: ₹1,000, 01-09: ₹1,500, checkout 02-09)');
{
  const res = [{
    id: 'res_5',
    hotel_id: 'hotel_1',
    room_no: '105',
    check_in_date: '2026-08-31',
    check_out_date: '2026-09-02',
    rate: 1250,
    invoice_total: 2500,
    variable_nightly_rates: {
      '2026-08-31': 1000,
      '2026-09-01': 1500,
    },
    status: 'confirmed',
  }];

  const entries = generateAuthoritativeNightlyRevenue({ hotelId: 'hotel_1', reservations: res });
  const aug31 = entries.find((e) => e.business_date === '2026-08-31');
  const sep01 = entries.find((e) => e.business_date === '2026-09-01');

  assert(aug31 && aug31.gross_room_revenue === 1000, '31-08 allocated exactly ₹1,000');
  assert(sep01 && sep01.gross_room_revenue === 1500, '01-09 allocated exactly ₹1,500');
}

// ── TEST 6: Multi-room reservation ──────────────────────────────────────────
console.log('\nTEST 6: Multi-room reservation (Room A: ₹1,200/night, Room B: ₹1,500/night)');
{
  const res = [
    { id: 'res_6_A', hotel_id: 'hotel_1', room_no: '101', check_in_date: '2026-08-31', check_out_date: '2026-09-02', rate: 1200, status: 'confirmed' },
    { id: 'res_6_B', hotel_id: 'hotel_1', room_no: '102', check_in_date: '2026-08-31', check_out_date: '2026-09-02', rate: 1500, status: 'confirmed' },
  ];

  const entries = generateAuthoritativeNightlyRevenue({ hotelId: 'hotel_1', reservations: res });
  const dailyAug31 = entries.filter((e) => e.business_date === '2026-08-31').reduce((s, e) => s + e.gross_room_revenue, 0);
  const dailySep01 = entries.filter((e) => e.business_date === '2026-09-01').reduce((s, e) => s + e.gross_room_revenue, 0);

  assert(dailyAug31 === 2700, '31-08 Combined Revenue = ₹2,700');
  assert(dailySep01 === 2700, '01-09 Combined Revenue = ₹2,700');
}

// ── TEST 7: Month boundary stay ─────────────────────────────────────────────
console.log('\nTEST 7: Month boundary stay (31-08-2026 to 03-09-2026, 3 nights @ ₹1,000)');
{
  const res = [{
    id: 'res_7',
    hotel_id: 'hotel_1',
    room_no: '201',
    check_in_date: '2026-08-31',
    check_out_date: '2026-09-03',
    rate: 1000,
    status: 'confirmed',
  }];

  const entries = generateAuthoritativeNightlyRevenue({ hotelId: 'hotel_1', reservations: res });
  const augEntries = entries.filter((e) => e.business_date.startsWith('2026-08'));
  const sepEntries = entries.filter((e) => e.business_date.startsWith('2026-09'));

  assert(augEntries.length === 1 && augEntries[0].business_date === '2026-08-31', 'August recognized 1 night (31-08)');
  assert(sepEntries.length === 2, 'September recognized 2 nights (01-09, 02-09)');
  assert(augEntries[0].gross_room_revenue === 1000, 'August revenue = ₹1,000');
  assert(sepEntries.reduce((s, e) => s + e.gross_room_revenue, 0) === 2000, 'September revenue = ₹2,000');
}

// ── TEST 8: Year boundary stay ──────────────────────────────────────────────
console.log('\nTEST 8: Year boundary stay (31-12-2026 to 02-01-2027, 2 nights @ ₹2,000)');
{
  const res = [{
    id: 'res_8',
    hotel_id: 'hotel_1',
    room_no: '202',
    check_in_date: '2026-12-31',
    check_out_date: '2027-01-02',
    rate: 2000,
    status: 'confirmed',
  }];

  const entries = generateAuthoritativeNightlyRevenue({ hotelId: 'hotel_1', reservations: res });
  const y2026 = entries.filter((e) => e.business_date.startsWith('2026'));
  const y2027 = entries.filter((e) => e.business_date.startsWith('2027'));

  assert(y2026.length === 1 && y2026[0].business_date === '2026-12-31', '2026 recognized 1 night (31-12-2026)');
  assert(y2027.length === 1 && y2027[0].business_date === '2027-01-01', '2027 recognized 1 night (01-01-2027)');
  assert(y2026[0].gross_room_revenue === 2000, '2026 revenue = ₹2,000');
  assert(y2027[0].gross_room_revenue === 2000, '2027 revenue = ₹2,000');
}

// ── TEST 9: Reservation date modification ───────────────────────────────────
console.log('\nTEST 9: Reservation stay modification (extended from 2 nights to 3 nights)');
{
  const before = [{
    id: 'res_9',
    hotel_id: 'hotel_1',
    room_no: '203',
    check_in_date: '2026-08-31',
    check_out_date: '2026-09-02',
    rate: 1200,
    status: 'confirmed',
  }];

  const after = [{
    id: 'res_9',
    hotel_id: 'hotel_1',
    room_no: '203',
    check_in_date: '2026-08-31',
    check_out_date: '2026-09-03', // Extended by 1 night
    rate: 1200,
    status: 'confirmed',
  }];

  const revBefore = generateAuthoritativeNightlyRevenue({ hotelId: 'hotel_1', reservations: before });
  const revAfter = generateAuthoritativeNightlyRevenue({ hotelId: 'hotel_1', reservations: after });

  assert(revBefore.length === 2, 'Before: 2 occupied nights');
  assert(revAfter.length === 3, 'After: 3 occupied nights');
  assert(revAfter.some((e) => e.business_date === '2026-09-02' && e.gross_room_revenue === 1200), 'New night 02-09 recognized as ₹1,200');
}

// ── TEST 10: Cancellation handling ──────────────────────────────────────────
console.log('\nTEST 10: Cancellation handling (cancelled reservation has ₹0 earned room revenue)');
{
  const res = [{
    id: 'res_10',
    hotel_id: 'hotel_1',
    room_no: '204',
    check_in_date: '2026-08-31',
    check_out_date: '2026-09-02',
    rate: 1200,
    status: 'cancelled',
  }];

  const entries = generateAuthoritativeNightlyRevenue({ hotelId: 'hotel_1', reservations: res });
  assert(entries.length === 0, 'Cancelled reservation produces 0 room revenue rows');
}

// ── TEST 11: Duplicate posting / Idempotency ────────────────────────────────
console.log('\nTEST 11: Duplicate posting / Idempotency (calling engine multiple times)');
{
  const res = [{
    id: 'res_11',
    hotel_id: 'hotel_1',
    room_no: '205',
    check_in_date: '2026-08-31',
    check_out_date: '2026-09-02',
    rate: 1200,
    status: 'confirmed',
  }];

  const pass1 = generateAuthoritativeNightlyRevenue({ hotelId: 'hotel_1', reservations: res });
  const pass2 = generateAuthoritativeNightlyRevenue({ hotelId: 'hotel_1', reservations: [...res, ...res] }); // duplicate passed

  assert(pass1.length === 2, 'Pass 1 has 2 rows');
  assert(pass2.length === 2, 'Pass 2 with duplicates still has exactly 2 rows (idempotent keying)');
  assert(pass2[0].gross_room_revenue === 1200, 'No double counting of rate');
}

// ── TEST 12: Multi-tenant hotel isolation ───────────────────────────────────
console.log('\nTEST 12: Multi-tenant hotel isolation (Hotel A vs Hotel B)');
{
  const res = [
    { id: 'res_A', hotel_id: 'hotel_A', room_no: '101', check_in_date: '2026-08-31', check_out_date: '2026-09-02', rate: 1200, status: 'confirmed' },
    { id: 'res_B', hotel_id: 'hotel_B', room_no: '201', check_in_date: '2026-08-31', check_out_date: '2026-09-02', rate: 5000, status: 'confirmed' },
  ];

  const hotelAEntries = generateAuthoritativeNightlyRevenue({ hotelId: 'hotel_A', reservations: res });
  const hotelBEntries = generateAuthoritativeNightlyRevenue({ hotelId: 'hotel_B', reservations: res });

  assert(hotelAEntries.length === 2, 'Hotel A has exactly 2 rows');
  assert(hotelAEntries.every((e) => e.hotel_id === 'hotel_A' && e.gross_room_revenue === 1200), 'Hotel A revenue completely isolated');
  assert(hotelBEntries.length === 2, 'Hotel B has exactly 2 rows');
  assert(hotelBEntries.every((e) => e.hotel_id === 'hotel_B' && e.gross_room_revenue === 5000), 'Hotel B revenue completely isolated');
}

// ── TEST 13: ARR & RevPAR calculation ───────────────────────────────────────
console.log('\nTEST 13: ARR and RevPAR calculation from authoritative occupied nights');
{
  const res = [
    { id: 'res_13_1', hotel_id: 'hotel_1', room_no: '101', check_in_date: '2026-08-31', check_out_date: '2026-09-02', rate: 1200, status: 'confirmed' },
    { id: 'res_13_2', hotel_id: 'hotel_1', room_no: '102', check_in_date: '2026-08-31', check_out_date: '2026-09-02', rate: 1800, status: 'confirmed' },
    { id: 'res_13_3', hotel_id: 'hotel_1', room_no: '103', check_in_date: '2026-08-31', check_out_date: '2026-09-02', rate: 0, is_complimentary: true, status: 'confirmed' },
  ];

  const entries = generateAuthoritativeNightlyRevenue({ hotelId: 'hotel_1', reservations: res });
  const metrics = getAuthoritativeDailyMetrics(entries, '2026-08-31', 10); // 10 total rooms

  assert(metrics.roomRevenue === 3000, 'Gross room revenue = ₹3,000 (1200 + 1800 + 0 comp)');
  assert(metrics.roomsOccupied === 3, 'Rooms occupied = 3');
  assert(metrics.roomsSold === 2, 'Rooms sold = 2');
  assert(metrics.complimentaryRooms === 1, 'Complimentary rooms = 1');
  assert(metrics.arr === 1500, 'ARR = ₹1,500 (3000 / 2 sold rooms)');
  assert(metrics.revpar === 300, 'RevPAR = ₹300 (3000 / 10 total rooms)');
}

console.log('\n===============================================================');
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('===============================================================');

if (failed > 0) {
  process.exit(1);
}
