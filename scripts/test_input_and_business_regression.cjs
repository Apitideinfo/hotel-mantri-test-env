const assert = require('assert');

// 1. Test Date Logic and Nights Calculation
function addDays(dateStr, n) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calcStayNights(arrival, departure) {
  if (!arrival || !departure) return 1;
  const [y1, m1, d1] = arrival.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = departure.slice(0, 10).split('-').map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 1;
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  const diffDays = Math.round((utc2 - utc1) / 86400000);
  return diffDays > 0 ? diffDays : 1;
}

console.log('=== TEST 1: Date & Nights Calculation ===');
const ci = '2026-09-13';
const co = '2026-09-15';
const nights = calcStayNights(ci, co);
console.log(`Check-in: ${ci}, Check-out: ${co} => Nights: ${nights}`);
assert.strictEqual(nights, 2, 'Nights between 13-09-2026 and 15-09-2026 must be 2');

const nextCo = addDays(ci, 2);
console.log(`addDays('${ci}', 2) => ${nextCo}`);
assert.strictEqual(nextCo, '2026-09-15', 'addDays must not drift across timezones');

// 2. Test Multi-Room Rates and "Apply to All"
console.log('\n=== TEST 2: Multi-Room Rates & Apply to All ===');
const roomNos = ['102', '103', '202'];
let defaultRate = 1200;
let roomRates = {};

// Apply to all
for (const no of roomNos) {
  roomRates[no] = defaultRate;
}
assert.deepStrictEqual(roomRates, { '102': 1200, '103': 1200, '202': 1200 }, 'Apply to all must populate default rate to all rooms');

// Independently edit individual rooms
roomRates['102'] = 1200;
roomRates['103'] = 1500;
roomRates['202'] = 1800;

const stayNights = 2;
const subtotal = roomNos.reduce((sum, no) => sum + (roomRates[no] * stayNights), 0);
console.log(`Subtotal for rooms (102@1200, 103@1500, 202@1800) x ${stayNights} nights = ₹${subtotal}`);
assert.strictEqual(subtotal, 9000, 'Total for 2 nights across 1200, 1500, 1800 must be ₹9000');

// 3. Test Night-by-Night Revenue Recognition
console.log('\n=== TEST 3: Night-by-Night Revenue Recognition ===');
function isStayOccupiedOnDate(e, date) {
  const arr = (e.arrival && e.arrival.trim() !== '' ? e.arrival : e.report_date).slice(0, 10);
  const dep = (e.departure && e.departure.trim() !== '' ? e.departure : e.report_date).slice(0, 10);
  if (arr >= dep) {
    return arr === date;
  }
  return arr <= date && dep > date;
}

const multiNightStay = {
  room_no: '102',
  arrival: '2026-08-31',
  departure: '2026-09-02',
  nights: 2,
  room_rate: 1200,
  total: 2400,
  report_date: '2026-09-01',
  is_complimentary: false,
};

assert.strictEqual(isStayOccupiedOnDate(multiNightStay, '2026-08-31'), true, 'Occupied on 31 Aug');
assert.strictEqual(isStayOccupiedOnDate(multiNightStay, '2026-09-01'), true, 'Occupied on 01 Sep');
assert.strictEqual(isStayOccupiedOnDate(multiNightStay, '2026-09-02'), false, 'Departure day is NOT occupied on 02 Sep');

const nightsCount = multiNightStay.nights;
const nightlyRate = multiNightStay.room_rate || (multiNightStay.total / nightsCount);
assert.strictEqual(nightlyRate, 1200, 'Nightly rate must be 1200, not 2400 on 01-09-2026');

console.log('All tests passed successfully!');
