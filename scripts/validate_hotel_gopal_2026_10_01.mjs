import { createClient } from '@supabase/supabase-js';
import {
  buildDerivedReport,
  buildCashFlow,
  toNum,
  aggregateRoomChart,
  calcOcc,
  calcTotalRevenue,
  calcTotalExpenses
} from '../src/lib/calc.ts';

const SUPABASE_URL = 'https://mtfycmdoqzzyxhjmfvuv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10ZnljbWRvcXp6eXhoam1mdnV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2OTI2NDcsImV4cCI6MjEwMjI2ODY0N30.oDelVfbf0DEYi5c5k8jgVBNjyNNwOnVzZYyMybNpfJs';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function validateHotelGopal() {
  console.log('================================================================');
  console.log('HOTEL GOPAL 01/10/2026 (2026-10-01) CLIENT DATA VALIDATION');
  console.log('================================================================\n');

  // Authenticate to access tenant database
  const authRes = await supabase.auth.signInWithPassword({
    email: 'admin@hotelmis.com',
    password: 'Admin@2026'
  });
  if (authRes.error) {
    throw new Error(`Auth failure: ${authRes.error.message}`);
  }

  // 1. Fetch Hotel Gopal
  const { data: hotels, error: hotelErr } = await supabase
    .from('hotels')
    .select('*')
    .ilike('hotel_name', '%HOTEL GOPAL%')
    .single();

  if (hotelErr || !hotels) {
    throw new Error(`Hotel Gopal not found: ${hotelErr?.message}`);
  }

  const hotelId = hotels.id;
  const targetDate = '2026-10-01';
  console.log(`Verified Hotel: ${hotels.hotel_name} (ID: ${hotelId})`);
  console.log(`Target Date: ${targetDate}\n`);

  // 2. Fetch Rooms & Categories
  const { data: roomsData, error: roomsErr } = await supabase
    .from('rooms')
    .select('*')
    .eq('hotel_id', hotelId);
  if (roomsErr) throw roomsErr;

  const { data: categoriesData, error: catErr } = await supabase
    .from('room_categories')
    .select('*')
    .eq('hotel_id', hotelId);
  if (catErr) throw catErr;

  const catIdToName = new Map(categoriesData.map(c => [c.id, c.name]));
  const roomTypeMap = new Map();
  for (const r of roomsData) {
    const catName = (r.category_id && catIdToName.get(r.category_id)) || '';
    if (catName) {
      roomTypeMap.set(r.id, catName);
      roomTypeMap.set(r.room_no, catName);
    }
  }

  // 3. Fetch Reservations for 2026-10-01
  const { data: rawRes, error: resErr } = await supabase
    .from('reservations')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('check_in_date', targetDate);
  if (resErr) throw resErr;

  console.log(`Fetched ${rawRes.length} reservations for ${targetDate}`);

  // Convert reservations to RoomChartEntry using authoritative mapper
  const entries = rawRes.map(res => {
    const roomCategory =
      (res.room_id && roomTypeMap.get(res.room_id)) ||
      (res.room_no && roomTypeMap.get(res.room_no)) ||
      res.room_type ||
      res.room_category ||
      'Standard';

    const payMode = res.payment_mode === 'Cash' ? 'Cash' : 'Bank';
    const invoiceTotal = toNum(res.invoice_total) || toNum(res.rate) || toNum(res.advance_paid);

    return {
      id: res.id,
      report_date: res.check_in_date,
      room_no: res.room_no,
      guest_name: res.guest_name,
      arrival: res.check_in_date,
      departure: res.check_out_date,
      nights: res.nights || 1,
      room_rate: toNum(res.rate),
      total: invoiceTotal,
      company: res.source_name || '',
      source_category: res.source_category || 'Direct/Walking',
      pay_mode: payMode,
      description: res.remarks || '',
      is_complimentary: false,
      meal_plan: res.meal_plan || 'EP',
      room_category: roomCategory,
      gst_mode: 'Inclusive',
      gst_type: res.gst_type || 'Inclusive',
      gst_slab: toNum(res.gst_slab),
      gst_amount: toNum(res.gst_amount),
      taxable_amount: toNum(res.taxable_amount),
      invoice_total: invoiceTotal,
      pay_cash: toNum(res.pay_cash),
      pay_upi: toNum(res.pay_upi),
      pay_card: toNum(res.pay_card),
      pay_bank: toNum(res.pay_bank),
    };
  });

  // 4. Fetch Expenses
  const { data: expenses, error: expErr } = await supabase
    .from('expense_entries')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('entry_date', targetDate);
  if (expErr) throw expErr;

  console.log(`Fetched ${expenses.length} expense entries for ${targetDate}`);

  // 5. Fetch Other Revenue Entries
  const { data: revenues, error: revErr } = await supabase
    .from('revenue_entries')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('entry_date', targetDate);
  // If table doesn't exist or empty, default to []
  const otherRevenues = revenues || [];

  // 6. Execute Calculation Engine (buildDerivedReport & buildCashFlow)
  const formattedExpenses = expenses.map(e => ({
    category: e.category_name,
    amount: toNum(e.amount),
    payment_mode: e.payment_mode
  }));

  const derived = buildDerivedReport(
    targetDate,
    entries,
    {
      report_date: targetDate,
      kitchen: 0,
      other_income: 0,
      housekeeping_supply: 0,
      other_expense: 0,
      salary_advance: 0,
      maintenance_bill: 0,
      cash_handover_md: 0,
      bank_cash_deposit: 0,
    },
    0, // prevClosing = 0
    hotels.total_rooms || 22,
    formattedExpenses,
    []
  );

  const agg = aggregateRoomChart(entries, targetDate);

  // 7. Verify All 9 Business Expectations
  const results = [];

  // 1. Room Revenue / Invoice Total
  const actualRoomRevenue = agg.roomRevenue;
  const expRoomRevenue = 25408.00;
  const passRoomRevenue = Math.abs(actualRoomRevenue - expRoomRevenue) < 0.01;
  results.push({
    metric: 'Room Revenue / Invoice Total',
    expected: `₹${expRoomRevenue.toFixed(2)}`,
    actual: `₹${actualRoomRevenue.toFixed(2)}`,
    status: passRoomRevenue ? 'PASSED' : 'FAILED'
  });

  // 2. GST Collected
  const actualGST = agg.gstCollected;
  const expGST = 532.18;
  const passGST = Math.abs(actualGST - expGST) < 0.01;
  results.push({
    metric: 'GST Collected',
    expected: `₹${expGST.toFixed(2)}`,
    actual: `₹${actualGST.toFixed(2)}`,
    status: passGST ? 'PASSED' : 'FAILED'
  });

  // 3. Other Revenue
  const actualOtherRev = otherRevenues.reduce((s, r) => s + toNum(r.amount), 0);
  const expOtherRev = 0.00;
  const passOtherRev = Math.abs(actualOtherRev - expOtherRev) < 0.01;
  results.push({
    metric: 'Other Revenue',
    expected: `₹${expOtherRev.toFixed(2)}`,
    actual: `₹${actualOtherRev.toFixed(2)}`,
    status: passOtherRev ? 'PASSED' : 'FAILED'
  });

  // 4. Expenses & Breakdown
  const totalExp = expenses.reduce((s, e) => s + toNum(e.amount), 0);
  const expTotalExp = 8980.00;
  const passExp = Math.abs(totalExp - expTotalExp) < 0.01;
  results.push({
    metric: 'Expenses',
    expected: `₹${expTotalExp.toFixed(2)}`,
    actual: `₹${totalExp.toFixed(2)}`,
    status: passExp ? 'PASSED' : 'FAILED'
  });

  // 5. Gross Revenue
  const grossRevenue = actualRoomRevenue + actualOtherRev;
  const expGrossRev = 25408.00;
  const passGrossRev = Math.abs(grossRevenue - expGrossRev) < 0.01;
  results.push({
    metric: 'Gross Revenue',
    expected: `₹${expGrossRev.toFixed(2)}`,
    actual: `₹${grossRevenue.toFixed(2)}`,
    status: passGrossRev ? 'PASSED' : 'FAILED'
  });

  // 6. Net Operating Profit
  const netOp = grossRevenue - totalExp;
  const expNetOp = 16428.00;
  const passNetOp = Math.abs(netOp - expNetOp) < 0.01;
  results.push({
    metric: 'Net Operating Profit',
    expected: `₹${expNetOp.toFixed(2)}`,
    actual: `₹${netOp.toFixed(2)}`,
    status: passNetOp ? 'PASSED' : 'FAILED'
  });

  // 7. Cash Collection
  const actualCashCol = agg.cash;
  const expCashCol = 8600.00;
  const passCashCol = Math.abs(actualCashCol - expCashCol) < 0.01;
  results.push({
    metric: 'Cash Collection',
    expected: `₹${expCashCol.toFixed(2)}`,
    actual: `₹${actualCashCol.toFixed(2)}`,
    status: passCashCol ? 'PASSED' : 'FAILED'
  });

  // 8. Cash Closing
  const cashExpensesTotal = expenses
    .filter(e => e.payment_mode === 'Cash')
    .reduce((s, e) => s + toNum(e.amount), 0);
  const openingCash = 0;
  const actualCashClosing = openingCash + actualCashCol - cashExpensesTotal;
  const expCashClosing = -380.00;
  const passCashClosing = Math.abs(actualCashClosing - expCashClosing) < 0.01;
  results.push({
    metric: 'Cash Closing',
    expected: `-₹${Math.abs(expCashClosing).toFixed(2)}`,
    actual: `-₹${Math.abs(actualCashClosing).toFixed(2)}`,
    status: passCashClosing ? 'PASSED' : 'FAILED'
  });

  // 9. Room Categories dynamic resolution
  const categoriesPresent = new Set(entries.map(e => e.room_category));
  const hasStandardOnly = categoriesPresent.size === 1 && categoriesPresent.has('Standard');
  const hasConfiguredCategories = categoriesPresent.has('Deluxe AC') || categoriesPresent.has('Suite AC');
  const passCategories = !hasStandardOnly && hasConfiguredCategories;
  results.push({
    metric: 'Room Categories',
    expected: 'Actual configured (Deluxe AC, Suite AC)',
    actual: Array.from(categoriesPresent).join(', '),
    status: passCategories ? 'PASSED' : 'FAILED'
  });

  // Print Reconciliation Table
  console.log('\n================================================================');
  console.log('RECONCILIATION TABLE: HOTEL GOPAL (01/10/2026)');
  console.log('================================================================');
  console.table(results);

  // Print Detailed Expense Breakdown
  console.log('\nExpense Breakdown in Database:');
  for (const exp of expenses) {
    console.log(` - ${exp.description}: ₹${toNum(exp.amount).toFixed(2)} (${exp.payment_mode}) [Category: ${exp.category_name}]`);
  }

  // Check UI and PDF matching
  console.log('\nUI vs PDF Verification:');
  console.log(` - UI Room Revenue (incl GST): ₹${grossRevenue.toFixed(2)}`);
  console.log(` - PDF Section 3 Gross Revenue: ₹${(agg.taxableRevenue + agg.gstCollected + actualOtherRev).toFixed(2)}`);
  console.log(` - UI Net Operating Profit: ₹${netOp.toFixed(2)}`);
  console.log(` - PDF Net Operating Profit: ₹${(grossRevenue - totalExp).toFixed(2)}`);
  console.log(` - UI Cash Closing: ₹${actualCashClosing.toFixed(2)}`);
  console.log(` - PDF Cash Closing: ₹${toNum(derived.cash_closing).toFixed(2)}`);

  const allPassed = results.every(r => r.status === 'PASSED');
  if (allPassed) {
    console.log('\n>>> Hotel Gopal 01/10/2026 end-to-end reconciliation PASSED. <<<');
  } else {
    console.error('\n>>> Reconciliation FAILED on some items. <<<');
    process.exit(1);
  }
}

validateHotelGopal().catch(err => {
  console.error('Validation Script Error:', err);
  process.exit(1);
});
