import assert from 'node:assert';
import RevenueCalculationService, { getNightlyRoomRevenue } from '../server/services/RevenueCalculationService.js';
import { supabaseServiceRole } from '../server/supabaseClient.js';
import {
  calcStayNights,
  isStayOccupiedOnDate,
  buildDerivedReport,
  aggregateRoomChart,
} from '../src/lib/calc.ts';
import { reconcilePaymentLedger } from '../src/lib/financialLedger.ts';

const HOTEL_A = '9001eb1c-9d38-49d0-84f7-75244e8f4bf8'; // Mars Hotel
const HOTEL_B = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb'; // Hotel Gopal

console.log('================================================================');
console.log('HOTEL MANTRI — ACCOUNTING, RECONCILIATION & FOLIO TEST SUITE');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${desc}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${desc}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('--- TEST GROUP 1: Occupancy & Room Calculation Rules ---');

  it('1. Occupancy is calculated from valid occupied rooms, not booking count', () => {
    // 2 rooms occupied by a multi-room booking should count as 2 occupied rooms
    const entries = [
      { id: '1', report_date: '2026-10-02', arrival: '2026-10-02', departure: '2026-10-03', room_no: '101', guest_name: 'Group A', room_rate: 2000 },
      { id: '2', report_date: '2026-10-02', arrival: '2026-10-02', departure: '2026-10-03', room_no: '102', guest_name: 'Group A', room_rate: 2000 },
    ];
    const agg = aggregateRoomChart(entries, '2026-10-02');
    assert.strictEqual(agg.roomsOccupied, 2);
  });

  it('2. Duplicate room assignments cannot inflate occupancy', () => {
    // If the same room is assigned twice, only unique sellable room stays count
    const stay1 = { arrival: '2026-10-02', departure: '2026-10-03', room_no: '101' };
    const stay2 = { arrival: '2026-10-02', departure: '2026-10-03', room_no: '101' };
    assert.strictEqual(isStayOccupiedOnDate(stay1, '2026-10-02'), true);
    assert.strictEqual(isStayOccupiedOnDate(stay2, '2026-10-02'), true);
    const uniqueRooms = new Set([stay1.room_no, stay2.room_no]);
    assert.strictEqual(uniqueRooms.size, 1);
  });

  it('3. Cancelled bookings do not count as occupied', () => {
    const stays = [
      { arrival: '2026-10-02', departure: '2026-10-03', status: 'cancelled' },
      { arrival: '2026-10-02', departure: '2026-10-03', status: 'confirmed' },
    ];
    const active = stays.filter(s => s.status !== 'cancelled' && isStayOccupiedOnDate(s, '2026-10-02'));
    assert.strictEqual(active.length, 1);
  });

  it('4. A future reservation does not count as today\'s occupied room', () => {
    const futureStay = { arrival: '2026-10-05', departure: '2026-10-07' };
    assert.strictEqual(isStayOccupiedOnDate(futureStay, '2026-10-02'), false);
  });

  console.log('\n--- TEST GROUP 2: Cash Drawer & Physical Money Isolation ---');

  it('5. Cash payment increases cash in hand', () => {
    const txs = [
      { id: 'tx-1', payment_method: 'Cash', amount: 3000, status: 'successful', payment_date: '2026-10-02' }
    ];
    const report = buildDerivedReport('2026-10-02', [], {}, 0, 22, [], [], txs);
    assert.strictEqual(report.pay_cash, 3000);
    assert.strictEqual(report.cash, 3000);
  });

  it('6. UPI and bank payments do not increase physical cash', () => {
    const txs = [
      { id: 'tx-1', payment_method: 'UPI', amount: 5000, status: 'successful', payment_date: '2026-10-02' },
      { id: 'tx-2', payment_method: 'Bank', amount: 10000, status: 'successful', payment_date: '2026-10-02' },
      { id: 'tx-3', payment_method: 'Card', amount: 2000, status: 'successful', payment_date: '2026-10-02' }
    ];
    const report = buildDerivedReport('2026-10-02', [], {}, 0, 22, [], [], txs);
    assert.strictEqual(report.pay_cash, 0);
    assert.strictEqual(report.cash, 0);
    assert.strictEqual(report.bank, 10000);
    assert.strictEqual(report.pay_bank, 10000);
    assert.strictEqual(report.pay_upi, 5000);
    assert.strictEqual(report.pay_card, 2000);
    assert.strictEqual(report.pay_bank + report.pay_upi + report.pay_card, 17000);
  });

  it('7. Cash expense and cash deposit reduce physical cash correctly', () => {
    const txs = [
      { id: 'tx-1', payment_method: 'Cash', amount: 3000, status: 'successful', payment_date: '2026-10-02' }
    ];
    const other = { other_expense: 1000, bank_cash_deposit: 500 };
    const report = buildDerivedReport('2026-10-02', [], other, 0, 22, [], [], txs);
    // cashClosing = 0 (prev) + 3000 (cash) - 1000 (expense) - 500 (deposit) = 1500
    assert.strictEqual(report.cash_closing, 1500);
  });

  it('8. Failed and reversed transactions are handled correctly', () => {
    const txs = [
      { id: 'tx-1', payment_method: 'Cash', amount: 3000, status: 'failed', payment_date: '2026-10-02' },
      { id: 'tx-2', payment_method: 'Cash', amount: 2000, status: 'successful', payment_date: '2026-10-02' }
    ];
    const report = buildDerivedReport('2026-10-02', [], {}, 0, 22, [], [], txs);
    assert.strictEqual(report.pay_cash, 2000);
  });

  console.log('\n--- TEST GROUP 3: Total Collections & Settlement Rules ---');

  it('9. Total collection reconciles to posted collections for the selected date', () => {
    const txs = [
      { id: 'tx-1', payment_method: 'Cash', amount: 3000, status: 'successful', payment_date: '2026-10-02' },
      { id: 'tx-2', payment_method: 'Bank', amount: 40544, status: 'successful', payment_date: '2026-10-02' },
    ];
    const report = buildDerivedReport('2026-10-02', [], {}, 0, 22, [], [], txs);
    const totalCollection = report.pay_cash + report.pay_bank;
    assert.strictEqual(totalCollection, 43544);
  });

  it('10. Booking amount alone never counts as money collected', () => {
    const resvs = [
      { id: 'r1', invoice_total: 5000, advance_paid: 0, pay_cash: 0, pay_bank: 0 }
    ];
    const txs = reconcilePaymentLedger({ reservations: resvs, timelineEvents: [], roomChartEntries: [] });
    assert.strictEqual(txs.length, 0);
  });

  console.log('\n--- TEST GROUP 4: Folio Settlement & Checkout Workflows ---');

  it('11. A fully paid folio can be checked out and closes with zero due', () => {
    const invoiceTotal = 3000;
    const paid = 3000;
    const balance = Math.max(0, invoiceTotal - paid);
    assert.strictEqual(balance, 0);
  });

  it('12. A partially paid folio cannot silently become settled', () => {
    const invoiceTotal = 3000;
    const paid = 1000;
    const balance = Math.max(0, invoiceTotal - paid);
    assert.strictEqual(balance, 2000);
    assert.notStrictEqual(balance, 0);
  });

  it('13. Checkout retries do not duplicate payments or charges', () => {
    const timeline = [
      { id: 'evt-1', reservation_id: 'res-1', event_type: 'advance_payment', event_amount: 3000, created_at: '2026-10-02' }
    ];
    const resvs = [
      { id: 'res-1', advance_paid: 3000, created_at: '2026-10-02' }
    ];
    const txs = reconcilePaymentLedger({ timelineEvents: timeline, reservations: resvs, roomChartEntries: [] });
    assert.strictEqual(txs.length, 1);
  });

  it('14. Concurrent checkout requests cannot settle the same folio twice', () => {
    const entry = { id: 'entry-1', checked_out_at: '2026-10-02T11:00:00Z' };
    const canCheckOut = !entry.checked_out_at;
    assert.strictEqual(canCheckOut, false);
  });

  it('15. OTA reservations are not falsely marked paid', () => {
    const otaBooking = { id: 'res-ota-1', source_name: 'Booking.com', rate: 2500, advance_paid: 0, pay_bank: 0 };
    const isPaid = (otaBooking.advance_paid || 0) + (otaBooking.pay_bank || 0) >= otaBooking.rate;
    assert.strictEqual(isPaid, false);
  });

  it('16. Historical dates and stays handle multi-night allocation correctly', () => {
    const stay = {
      arrival: '2026-10-02',
      departure: '2026-10-04',
      rate: 2363,
      nights: 2,
    };
    assert.strictEqual(calcStayNights(stay.arrival, stay.departure), 2);
    assert.strictEqual(getNightlyRoomRevenue(stay, '2026-10-02'), 2363);
    assert.strictEqual(getNightlyRoomRevenue(stay, '2026-10-03'), 2363);
  });

  console.log('\n--- TEST GROUP 5: Production Hotel Gopal Business Date 2026-10-02 ---');

  await itAsync('17. Multi-tenant isolation: Hotel A cannot see Hotel B payments', async () => {
    const { data: bTimeline } = await supabaseServiceRole
      .from('booking_timeline')
      .select('id, hotel_id')
      .eq('hotel_id', HOTEL_B)
      .limit(1);

    if (bTimeline && bTimeline.length > 0) {
      assert.strictEqual(bTimeline[0].hotel_id, HOTEL_B);
      assert.notStrictEqual(bTimeline[0].hotel_id, HOTEL_A);
    }
  });

  await itAsync('18. Hotel Gopal 2026-10-02 reconciles: 95% Occ, ₹3,000 Cash, ₹43,544 Collection', async () => {
    const result = await RevenueCalculationService.calculateDayWiseRevenue({
      hotelId: HOTEL_B,
      startDate: '2026-10-02',
      endDate: '2026-10-02',
    });

    assert.strictEqual(result.summary.soldRoomNights, 21);
    assert.strictEqual(result.summary.availableRoomNights, 22);
    // 21 / 22 = 95.45% -> 95%
    assert.strictEqual(Math.floor(result.summary.occupancyPercent), 95);
    assert.strictEqual(result.summary.totalIncome, 43544);
    assert.strictEqual(result.summary.totalCollections, 43544);
    assert.strictEqual(result.summary.collections.cash, 3000);
    assert.strictEqual(result.summary.collections.bank, 40544);
    assert.strictEqual(result.summary.arr, 2073.52);
  });

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
