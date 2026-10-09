import assert from 'node:assert/strict';
import {
  calcGstFull,
  calcGst,
  splitGst,
  buildDerivedReport,
  buildCashFlow,
  aggregateRoomChart,
  calcTotalRevenue,
  calcTotalExpenses,
  calcArr,
  calcOcc,
  calcRevpar,
  derivedToDaily,
} from '../src/lib/calc.ts';

console.log('================================================================');
console.log('HOTEL MANTRI — REPORTING & CALCULATION ENGINE VALIDATION SUITE');
console.log('================================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: GST Calculation (Inclusive, Exclusive, No Scope)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- TEST 1: GST Inclusive & Exclusive Calculations ---');

// 1A. Inclusive 12% on 2000
const gstInc = calcGstFull(2000, 'Inclusive', 12);
assert(Math.abs(gstInc.taxable - 1785.714) < 0.01, `Inclusive taxable should be ~1785.71, got ${gstInc.taxable}`);
assert(Math.abs(gstInc.gst - 214.285) < 0.01, `Inclusive GST should be ~214.29, got ${gstInc.gst}`);
assert.equal(gstInc.invoiceTotal, 2000, `Inclusive invoice total must remain 2000`);
console.log('  ✅ PASSED: GST Inclusive 12% calculated accurately');

// 1B. Exclusive 12% on 2000
const gstExc = calcGstFull(2000, 'Exclusive', 12);
assert.equal(gstExc.taxable, 2000, `Exclusive taxable should be 2000, got ${gstExc.taxable}`);
assert.equal(gstExc.gst, 240, `Exclusive GST should be 240, got ${gstExc.gst}`);
assert.equal(gstExc.invoiceTotal, 2240, `Exclusive invoice total must be 2240`);
console.log('  ✅ PASSED: GST Exclusive 12% calculated accurately');

// 1C. No Scope / 0%
const gstNone = calcGstFull(2000, 'No Scope', 0);
assert.equal(gstNone.taxable, 2000);
assert.equal(gstNone.gst, 0);
assert.equal(gstNone.invoiceTotal, 2000);
console.log('  ✅ PASSED: GST No Scope / Zero GST calculated accurately');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Daily Operations & Derived Report Calculation (No Double Counting GST)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST 2: GST Not Double-Counted in Gross Revenue / Net Revenue ---');

const sampleEntries = [
  // Room 101: 2000 Inclusive 12%
  {
    id: 'e1',
    hotel_id: 'hotel_123',
    report_date: '2026-10-01',
    room_no: '101',
    guest_name: 'Guest A',
    arrival: '2026-10-01',
    departure: '2026-10-02',
    nights: 1,
    room_rate: 2000,
    total: 2000,
    company: '',
    source_category: 'Direct/Walking',
    pay_mode: 'Cash',
    is_complimentary: false,
    gst_type: 'Inclusive',
    gst_slab: 12,
    taxable_amount: 1785.71,
    gst_amount: 214.29,
    invoice_total: 2000,
    revenue_category: 'Room Revenue',
    pay_cash: 2000,
    pay_upi: 0,
    pay_card: 0,
    pay_bank: 0,
    pay_advance: 2000,
    pay_balance: 0,
  },
  // Room 102: 2000 Exclusive 12%
  {
    id: 'e2',
    hotel_id: 'hotel_123',
    report_date: '2026-10-01',
    room_no: '102',
    guest_name: 'Guest B',
    arrival: '2026-10-01',
    departure: '2026-10-02',
    nights: 1,
    room_rate: 2000,
    total: 2000,
    company: '',
    source_category: 'Direct/Walking',
    pay_mode: 'UPI',
    is_complimentary: false,
    gst_type: 'Exclusive',
    gst_slab: 12,
    taxable_amount: 2000,
    gst_amount: 240,
    invoice_total: 2240,
    revenue_category: 'Room Revenue',
    pay_cash: 0,
    pay_upi: 2240,
    pay_card: 0,
    pay_bank: 0,
    pay_advance: 2240,
    pay_balance: 0,
  },
];

const otherEntriesEmpty = {
  report_date: '2026-10-01',
  kitchen: 500,
  other_income: 300,
  housekeeping_supply: 0,
  other_expense: 0,
  salary_advance: 0,
  maintenance_bill: 0,
  cash_handover_md: 0,
  bank_cash_deposit: 0,
};

const report = buildDerivedReport(
  '2026-10-01',
  sampleEntries,
  otherEntriesEmpty,
  10000, // opening cash
  20,    // total rooms
  [],    // finance expenses
  [],    // other revenues
);

// Room 101 taxable (1785.71) + Room 102 taxable (2000) = 3785.71
assert(Math.abs(report.taxable_revenue - 3785.71) < 0.02, `Taxable revenue expected 3785.71, got ${report.taxable_revenue}`);
// Room 101 GST (214.29) + Room 102 GST (240) = 454.29
assert(Math.abs(report.gst_collected - 454.29) < 0.02, `GST collected expected 454.29, got ${report.gst_collected}`);
// Net revenue must equal taxable revenue
assert(Math.abs(report.net_revenue - 3785.71) < 0.02, `Net revenue expected 3785.71, got ${report.net_revenue}`);
// Invoice total must equal taxable + gst = 4240
assert(Math.abs(report.invoice_total - 4240) < 0.02, `Invoice total expected 4240, got ${report.invoice_total}`);

console.log('  ✅ PASSED: Taxable revenue, GST collected, Net revenue, and Invoice total are exact');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Expense Aggregation from expense_entries & Categories (Housekeeping, Maintenance, Salary)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST 3: Expense Aggregation & Category Ingestion ---');

const financeExpenses = [
  { category: 'Housekeeping', amount: 450, payment_mode: 'Cash' },
  { category: 'Maintenance', amount: 800, payment_mode: 'UPI' },
  { category: 'Laundry', amount: 350, payment_mode: 'Cash' },
  { category: 'Electricity', amount: 2500, payment_mode: 'Bank' },
  { category: 'Salary Advance', amount: 1000, payment_mode: 'Cash' },
];

const reportWithExpenses = buildDerivedReport(
  '2026-10-01',
  sampleEntries,
  otherEntriesEmpty,
  10000, // opening cash
  20,    // total rooms
  financeExpenses,
  [],    // other revenues
);

// All 5 expenses must be included in finance_expenses
// 450 (Housekeeping) + 800 (Maintenance) + 350 (Laundry) + 2500 (Electricity) + 1000 (Salary Advance) = 5100
assert.equal(reportWithExpenses.finance_expenses, 5100, `Total finance expenses should be 5100, got ${reportWithExpenses.finance_expenses}`);
assert.equal(reportWithExpenses.finance_expense_by_category.length, 5, `Should have 5 categories`);
console.log('  ✅ PASSED: Housekeeping, Maintenance, and other expense categories correctly aggregated from expense_entries');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Cash Closing vs Non-Cash Expenses
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST 4: Cash Closing affected ONLY by Cash Expenses ---');

// Cash collections = 2000 (Room 101 cash) + 300 (other_income) = 2300
// Cash expenses = 450 (Housekeeping Cash) + 350 (Laundry Cash) + 1000 (Salary Advance Cash) = 1800
// Non-cash expenses (Maintenance UPI 800 + Electricity Bank 2500 = 3300) must NOT reduce Cash Closing!
// Expected Cash Closing = Opening 10000 + Cash Col 2300 - Cash Exp 1800 = 10500

assert.equal(reportWithExpenses.cash_expenses, 1800, `Cash expenses should be 1800, got ${reportWithExpenses.cash_expenses}`);
assert.equal(reportWithExpenses.cash_closing, 10500, `Cash closing should be exactly 10500, got ${reportWithExpenses.cash_closing}`);
console.log('  ✅ PASSED: Non-cash expenses (UPI ₹800, Bank ₹2500) did NOT reduce Cash Closing!');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Cash Flow Model Consistency
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST 5: Cash Flow Engine Verification ---');

const cashFlow = buildCashFlow(10000, reportWithExpenses);
assert.equal(cashFlow.opening_cash, 10000);
assert.equal(cashFlow.cash_expenses, 1800);
assert.equal(cashFlow.cash_closing, 10500);
console.log('  ✅ PASSED: buildCashFlow matches buildDerivedReport cash closing');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: Gross Revenue and Net Operating Profit
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST 6: Gross Revenue & Net Operating Profit Verification ---');

const totalRev = calcTotalRevenue(reportWithExpenses);
const totalExp = calcTotalExpenses(reportWithExpenses);
const netProfit = totalRev - totalExp;

// Total Revenue = room_sale_amount (4000) + kitchen (500) + other_income (300) = 4800
assert.equal(totalRev, 4800, `Total Revenue should be 4800, got ${totalRev}`);
// Total Expenses = housekeeping (0) + maintenance (0) + other (0) + finance_expenses (5100) = 5100
assert.equal(totalExp, 5100, `Total Expenses should be 5100, got ${totalExp}`);
assert.equal(netProfit, -300, `Net Operating Profit should be -300, got ${netProfit}`);
console.log('  ✅ PASSED: Gross Revenue & Net Operating Profit computed without double counting');

console.log('\n================================================================');
console.log('ALL REPORTING & CALCULATION TESTS PASSED (6/6 SUITES)');
console.log('================================================================');
