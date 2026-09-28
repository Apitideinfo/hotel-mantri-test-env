/**
 * Hotel Mantri — Revenue Recognition Test Suite
 *
 * Tests the fixed business logic in src/lib/calc.ts to verify:
 *   - Multi-night revenue is allocated night-by-night
 *   - Checkout date is excluded from revenue
 *   - Variable nightly rates work
 *   - Multi-room stays work
 *   - Extensions / shortenings work correctly
 *   - Payment date does NOT move room revenue
 *   - Booking creation date does NOT move room revenue
 *   - Cross-month stays split correctly
 *   - No double-counting
 *   - Timezone-safe (YYYY-MM-DD only, no UTC shift)
 *
 * Run with:
 *   node scripts/test-revenue-recognition.mjs
 */

// ─── Inline the fixed functions (mirrors src/lib/calc.ts) ────────────────────

function calcStayNights(arrival, departure) {
  if (!arrival || !departure) return 1;
  const [y1, m1, d1] = arrival.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = departure.slice(0, 10).split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  const diff = Math.round((utc2 - utc1) / 86400000);
  return diff > 0 ? diff : 1;
}

function generateOccupiedNights(checkIn, checkOut) {
  const nights = [];
  if (!checkIn || !checkOut) return nights;
  const ci = checkIn.slice(0, 10);
  const co = checkOut.slice(0, 10);
  if (ci >= co) { nights.push(ci); return nights; }
  const [sy, sm, sd] = ci.split('-').map(Number);
  let cursor = Date.UTC(sy, sm - 1, sd);
  const [ey, em, ed] = co.split('-').map(Number);
  const end = Date.UTC(ey, em - 1, ed);
  while (cursor < end) {
    const d = new Date(cursor);
    nights.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`);
    cursor += 86400000;
  }
  return nights;
}

function getNightlyRoomRevenue(e) {
  if (e.is_complimentary) return 0;
  if (e.room_rate > 0) return e.room_rate;
  const arr = (e.arrival || e.report_date).slice(0, 10);
  const dep = (e.departure || e.report_date).slice(0, 10);
  const n = arr < dep ? Math.max(1, calcStayNights(arr, dep)) : Math.max(1, e.nights || 1);
  return e.total > 0 ? e.total / n : 0;
}

function isStayOccupiedOnDate(e, date) {
  const arr = (e.arrival || e.report_date).slice(0, 10);
  const dep = (e.departure || e.report_date).slice(0, 10);
  if (arr >= dep) return arr === date;
  return arr <= date && dep > date;
}

function getRoomRevenueOnDate(entry, date) {
  if (entry.is_complimentary) return 0;
  if (!isStayOccupiedOnDate(entry, date)) return 0;
  return getNightlyRoomRevenue(entry);
}

function getCollectionOnDate(entry, date) {
  const payDate = (entry.business_date || entry.report_date || '').slice(0, 10);
  if (payDate !== date) return 0;
  return (entry.pay_cash||0)+(entry.pay_upi||0)+(entry.pay_card||0)+(entry.pay_bank||0);
}

// ─── Test helpers ─────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  PASS: ${name}`); passed++; }
  catch(e) { console.error(`  FAIL: ${name}\n       ${e.message}`); failed++; }
}
function expect(actual, expected, msg) {
  if (Math.abs(actual - expected) > 0.001)
    throw new Error(`${msg}: expected ${expected}, got ${actual}`);
}
function expectArr(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${msg}:\n  expected: ${JSON.stringify(expected)}\n  got:      ${JSON.stringify(actual)}`);
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ─── Test 1: Basic 2-night stay ───────────────────────────────────────────────
console.log('\n[Test 1] Basic 2-night stay (31-Aug to 02-Sep, 1200/night)');
test('generateOccupiedNights: check-in included, checkout excluded', () => {
  expectArr(generateOccupiedNights('2026-08-31','2026-09-02'),['2026-08-31','2026-09-01'],'nights');
});
test('31-Aug revenue = 1200', () => {
  const e = {report_date:'2026-09-01',arrival:'2026-08-31',departure:'2026-09-02',room_rate:1200,total:2400,nights:2,is_complimentary:false};
  expect(getRoomRevenueOnDate(e,'2026-08-31'),1200,'31-Aug');
});
test('01-Sep revenue = 1200', () => {
  const e = {report_date:'2026-09-01',arrival:'2026-08-31',departure:'2026-09-02',room_rate:1200,total:2400,nights:2,is_complimentary:false};
  expect(getRoomRevenueOnDate(e,'2026-09-01'),1200,'01-Sep');
});
test('02-Sep revenue = 0 (checkout excluded)', () => {
  const e = {report_date:'2026-09-01',arrival:'2026-08-31',departure:'2026-09-02',room_rate:1200,total:2400,nights:2,is_complimentary:false};
  expect(getRoomRevenueOnDate(e,'2026-09-02'),0,'02-Sep');
});
test('Sum of nights reconciles with booking total (2400)', () => {
  const e = {report_date:'2026-09-01',arrival:'2026-08-31',departure:'2026-09-02',room_rate:1200,total:2400,nights:2,is_complimentary:false};
  const sum = generateOccupiedNights('2026-08-31','2026-09-02').reduce((s,d)=>s+getRoomRevenueOnDate(e,d),0);
  expect(sum,2400,'Total reconcile');
});

// ─── Test 2: Payment on second night ─────────────────────────────────────────
console.log('\n[Test 2] Payment on 01-Sep; stay 31-Aug to 02-Sep');
test('Revenue on 31-Aug = 1200 regardless of payment date', () => {
  const e={report_date:'2026-09-01',arrival:'2026-08-31',departure:'2026-09-02',room_rate:1200,total:2400,nights:2,is_complimentary:false,business_date:'2026-09-01',pay_cash:2400,pay_upi:0,pay_card:0,pay_bank:0};
  expect(getRoomRevenueOnDate(e,'2026-08-31'),1200,'Revenue 31-Aug');
});
test('Revenue on 01-Sep = 1200 (NOT 2400)', () => {
  const e={report_date:'2026-09-01',arrival:'2026-08-31',departure:'2026-09-02',room_rate:1200,total:2400,nights:2,is_complimentary:false,business_date:'2026-09-01',pay_cash:2400,pay_upi:0,pay_card:0,pay_bank:0};
  expect(getRoomRevenueOnDate(e,'2026-09-01'),1200,'Revenue 01-Sep (must be 1200 not 2400)');
});
test('Collection on 01-Sep = 2400', () => {
  const e={report_date:'2026-09-01',arrival:'2026-08-31',departure:'2026-09-02',room_rate:1200,total:2400,nights:2,is_complimentary:false,business_date:'2026-09-01',pay_cash:2400,pay_upi:0,pay_card:0,pay_bank:0};
  expect(getCollectionOnDate(e,'2026-09-01'),2400,'Collection 01-Sep');
});
test('Collection on 31-Aug = 0 (payment was on 01-Sep)', () => {
  const e={report_date:'2026-09-01',arrival:'2026-08-31',departure:'2026-09-02',room_rate:1200,total:2400,nights:2,is_complimentary:false,business_date:'2026-09-01',pay_cash:2400,pay_upi:0,pay_card:0,pay_bank:0};
  expect(getCollectionOnDate(e,'2026-08-31'),0,'Collection 31-Aug must be 0');
});

// ─── Test 3: Booking created on second night ──────────────────────────────────
console.log('\n[Test 3] Booking entered 01-Sep; stay 31-Aug to 02-Sep');
test('Revenue follows stay dates, not entry/creation date', () => {
  const e={report_date:'2026-09-01',arrival:'2026-08-31',departure:'2026-09-02',room_rate:1200,total:2400,nights:2,is_complimentary:false};
  expect(getRoomRevenueOnDate(e,'2026-08-31'),1200,'31-Aug');
  expect(getRoomRevenueOnDate(e,'2026-09-01'),1200,'01-Sep (not 2400)');
  assert(getRoomRevenueOnDate(e,'2026-09-01')!==2400,'CRITICAL: must not be 2400');
});

// ─── Test 4: Variable rates ───────────────────────────────────────────────────
console.log('\n[Test 4] Variable nightly rates');
test('Each night gets its own rate', () => {
  const n1={report_date:'2026-08-31',arrival:'2026-08-31',departure:'2026-09-01',room_rate:1200,total:1200,nights:1,is_complimentary:false};
  const n2={report_date:'2026-09-01',arrival:'2026-09-01',departure:'2026-09-02',room_rate:1500,total:1500,nights:1,is_complimentary:false};
  expect(getRoomRevenueOnDate(n1,'2026-08-31'),1200,'31-Aug rate');
  expect(getRoomRevenueOnDate(n2,'2026-09-01'),1500,'01-Sep rate');
  expect(getRoomRevenueOnDate(n1,'2026-09-01'),0,'n1 not on 01-Sep');
});

// ─── Test 5: Multi-room ───────────────────────────────────────────────────────
console.log('\n[Test 5] Multi-room (2 rooms x 2 nights x 1200)');
test('Two rooms contribute 2x nightly rate per night', () => {
  const r1={report_date:'2026-08-31',arrival:'2026-08-31',departure:'2026-09-02',room_rate:1200,total:2400,nights:2,is_complimentary:false};
  const r2={report_date:'2026-08-31',arrival:'2026-08-31',departure:'2026-09-02',room_rate:1200,total:2400,nights:2,is_complimentary:false};
  expect(getRoomRevenueOnDate(r1,'2026-08-31')+getRoomRevenueOnDate(r2,'2026-08-31'),2400,'31-Aug 2 rooms');
  expect(getRoomRevenueOnDate(r1,'2026-09-01')+getRoomRevenueOnDate(r2,'2026-09-01'),2400,'01-Sep 2 rooms');
});

// ─── Test 6: Extension ───────────────────────────────────────────────────────
console.log('\n[Test 6] Extension: 31-Aug->02-Sep extended to 31-Aug->03-Sep');
test('Extension adds exactly 02-Sep', () => {
  const orig=generateOccupiedNights('2026-08-31','2026-09-02');
  const ext=generateOccupiedNights('2026-08-31','2026-09-03');
  const newNights=ext.filter(d=>!orig.includes(d));
  expectArr(newNights,['2026-09-02'],'One new night added');
});

// ─── Test 7: Shortening ───────────────────────────────────────────────────────
console.log('\n[Test 7] Shortening: 31-Aug->03-Sep to 31-Aug->02-Sep');
test('Shortening removes 02-Sep from revenue', () => {
  const orig=generateOccupiedNights('2026-08-31','2026-09-03');
  const short=generateOccupiedNights('2026-08-31','2026-09-02');
  const removed=orig.filter(d=>!short.includes(d));
  expectArr(removed,['2026-09-02'],'02-Sep removed');
  assert(short.includes('2026-08-31'),'31-Aug preserved');
  assert(short.includes('2026-09-01'),'01-Sep preserved');
});

// ─── Test 8: Complimentary (cancelled/free) ───────────────────────────────────
console.log('\n[Test 8] Complimentary entry = 0 revenue');
test('Complimentary entry contributes zero revenue on any night', () => {
  const e={report_date:'2026-08-31',arrival:'2026-08-31',departure:'2026-09-02',room_rate:1200,total:2400,nights:2,is_complimentary:true};
  expect(getRoomRevenueOnDate(e,'2026-08-31'),0,'Complimentary 31-Aug');
  expect(getRoomRevenueOnDate(e,'2026-09-01'),0,'Complimentary 01-Sep');
});

// ─── Test 9: Backdated booking ────────────────────────────────────────────────
console.log('\n[Test 9] Backdated booking (entered 05-Sep for stay 31-Aug->02-Sep)');
test('Revenue follows stay dates even if entered weeks later', () => {
  const e={report_date:'2026-09-05',arrival:'2026-08-31',departure:'2026-09-02',room_rate:1200,total:2400,nights:2,is_complimentary:false};
  expect(getRoomRevenueOnDate(e,'2026-08-31'),1200,'31-Aug revenue despite entry 5 days after checkout');
  expect(getRoomRevenueOnDate(e,'2026-09-05'),0,'No revenue on entry date 05-Sep');
});

// ─── Test 10: Cross-month ─────────────────────────────────────────────────────
console.log('\n[Test 10] Cross-month stay (30-Aug to 03-Sep)');
test('Occupied nights: 30-Aug, 31-Aug, 01-Sep, 02-Sep only', () => {
  const nights=generateOccupiedNights('2026-08-30','2026-09-03');
  expectArr(nights,['2026-08-30','2026-08-31','2026-09-01','2026-09-02'],'Cross-month nights');
});
test('August MTD gets 30+31 Aug only', () => {
  const e={report_date:'2026-08-30',arrival:'2026-08-30',departure:'2026-09-03',room_rate:1200,total:4800,nights:4,is_complimentary:false};
  const aug=['2026-08-30','2026-08-31'].reduce((s,d)=>s+getRoomRevenueOnDate(e,d),0);
  expect(aug,2400,'August = 2 nights * 1200');
});
test('September MTD gets 01+02 Sep only', () => {
  const e={report_date:'2026-08-30',arrival:'2026-08-30',departure:'2026-09-03',room_rate:1200,total:4800,nights:4,is_complimentary:false};
  const sep=['2026-09-01','2026-09-02'].reduce((s,d)=>s+getRoomRevenueOnDate(e,d),0);
  expect(sep,2400,'September = 2 nights * 1200');
});
test('Total reconciles: 4 nights * 1200 = 4800', () => {
  const e={report_date:'2026-08-30',arrival:'2026-08-30',departure:'2026-09-03',room_rate:1200,total:4800,nights:4,is_complimentary:false};
  const total=generateOccupiedNights('2026-08-30','2026-09-03').reduce((s,d)=>s+getRoomRevenueOnDate(e,d),0);
  expect(total,4800,'Cross-month total');
});

// ─── Test 11: Timezone ────────────────────────────────────────────────────────
console.log('\n[Test 11] Timezone safety');
test('generateOccupiedNights uses UTC arithmetic, no local date shifting', () => {
  const nights=generateOccupiedNights('2026-08-31','2026-09-02');
  assert(nights[0]==='2026-08-31',`First night shifted: ${nights[0]}`);
  assert(nights[1]==='2026-09-01',`Second night shifted: ${nights[1]}`);
  assert(nights.length===2,`Wrong count: ${nights.length}`);
});

// ─── Test 12: No double counting ──────────────────────────────────────────────
console.log('\n[Test 12] No double counting');
test('Grand total = exactly booking amount, not double', () => {
  const e={report_date:'2026-09-01',arrival:'2026-08-31',departure:'2026-09-02',room_rate:1200,total:2400,nights:2,is_complimentary:false};
  const total=getRoomRevenueOnDate(e,'2026-08-31')+getRoomRevenueOnDate(e,'2026-09-01');
  expect(total,2400,'Must be exactly 2400, not 3600 or 4800');
});

// ─── Test 13: total/nights fallback ───────────────────────────────────────────
console.log('\n[Test 13] Total/nights fallback (room_rate=0)');
test('When room_rate=0, total/nights is used per night (not full total)', () => {
  const e={report_date:'2026-08-31',arrival:'2026-08-31',departure:'2026-09-02',room_rate:0,total:2400,nights:2,is_complimentary:false};
  expect(getNightlyRoomRevenue(e),1200,'Nightly = 2400/2 = 1200');
  expect(getRoomRevenueOnDate(e,'2026-08-31'),1200,'31-Aug');
  expect(getRoomRevenueOnDate(e,'2026-09-01'),1200,'01-Sep');
  expect(getRoomRevenueOnDate(e,'2026-09-02'),0,'02-Sep excluded');
});

// ─── Final ────────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${passed} PASSED  |  ${failed} FAILED`);
console.log('='.repeat(60));
if (failed === 0) {
  console.log('ALL REVENUE RECOGNITION TESTS PASSED');
} else {
  console.error(`${failed} TEST(S) FAILED`);
  process.exit(1);
}
