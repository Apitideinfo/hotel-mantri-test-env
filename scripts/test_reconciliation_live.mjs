import dotenv from 'dotenv';
dotenv.config();

import { supabaseServiceRole } from '../server/supabaseClient.js';
import { calculateDayWiseRevenue } from '../server/services/RevenueCalculationService.js';
import { reconcilePaymentLedger } from '../server/services/authoritativeRevenue.js';

const HOTEL_ID = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb';
const DATE = '2026-10-01';

async function testReconciliation() {
  console.log('========================================================================');
  console.log('HOTEL MANTRI — VERIFYING RECONCILIATION FOR 2026-10-01');
  console.log('========================================================================\n');

  // 1. Backend Service
  const beRes = await calculateDayWiseRevenue({
    hotelId: HOTEL_ID,
    date: DATE,
  });

  console.log('1. Server RevenueCalculationService Results:');
  console.log('   Total Revenue:', beRes.summary.totalIncome);
  console.log('   Room Revenue:', beRes.summary.roomRevenue);
  console.log('   Collections:');
  console.log('     Cash: ', beRes.summary.collections.cash);
  console.log('     Bank: ', beRes.summary.collections.bank);
  console.log('     UPI:  ', beRes.summary.collections.upi);
  console.log('     Card: ', beRes.summary.collections.card);
  console.log('     Total:', beRes.summary.collections.total);

  // 2. Authoritative Revenue Service reconcilePaymentLedger
  const [{ data: reservations }, { data: timelineEvents }] = await Promise.all([
    supabaseServiceRole.from('reservations').select('*').eq('hotel_id', HOTEL_ID),
    supabaseServiceRole.from('booking_timeline').select('*').eq('hotel_id', HOTEL_ID),
  ]);

  const txs = reconcilePaymentLedger({
    timelineEvents,
    reservations,
    roomChartEntries: [],
    hotelId: HOTEL_ID,
  });

  const txsToday = txs.filter((t) => t.business_date === DATE);
  let payCash = 0, payBank = 0, payUpi = 0, payCard = 0;
  for (const t of txsToday) {
    if (t.payment_method === 'Cash') payCash += Number(t.amount);
    else if (t.payment_method === 'Bank') payBank += Number(t.amount);
    else if (t.payment_method === 'UPI') payUpi += Number(t.amount);
    else if (t.payment_method === 'Card') payCard += Number(t.amount);
  }
  const totalColl = payCash + payBank + payUpi + payCard;

  console.log('\n2. Authoritative Revenue Service reconcilePaymentLedger:');
  console.log('   Collections for 2026-10-01:');
  console.log('     Cash: ', payCash);
  console.log('     Bank: ', payBank);
  console.log('     UPI:  ', payUpi);
  console.log('     Card: ', payCard);
  console.log('     Total:', totalColl);

  // 3. Day Close Record
  const { data: closeRec } = await supabaseServiceRole
    .from('day_close_records')
    .select('*')
    .eq('hotel_id', HOTEL_ID)
    .eq('business_date', DATE)
    .single();

  console.log('\n3. Day Close Record for 2026-10-01:');
  console.log('   Cash Closing:', closeRec?.cash_closing);
  console.log('   Opening Cash Next Day:', closeRec?.opening_cash_next_day);

  // 4. Assertions
  console.log('\n========================================================================');
  console.log('RECONCILIATION VERIFICATION CHECKLIST:');
  console.log('========================================================================');
  const checks = [
    { name: 'Cash Collection is ₹8,600', pass: beRes.summary.collections.cash === 8600 && payCash === 8600 },
    { name: 'Bank Collection is ₹16,808', pass: beRes.summary.collections.bank === 16808 && payBank === 16808 },
    { name: 'Card POS Collection is ₹0', pass: beRes.summary.collections.card === 0 && payCard === 0 },
    { name: 'UPI Collection is ₹0', pass: beRes.summary.collections.upi === 0 && payUpi === 0 },
    { name: 'Total Collection is ₹25,408', pass: beRes.summary.collections.total === 25408 && totalColl === 25408 },
    { name: 'Total Revenue is ₹25,408', pass: beRes.summary.totalIncome === 25408 },
    { name: 'Cash Closing is -₹380 (Opening 0 + Receipts 8600 - Expenses 8980)', pass: closeRec?.cash_closing === -380 },
  ];

  let allPass = true;
  for (const c of checks) {
    console.log(`${c.pass ? '✓ PASS' : '✗ FAIL'}: ${c.name}`);
    if (!c.pass) allPass = false;
  }

  if (!allPass) {
    process.exit(1);
  } else {
    console.log('\nALL RECONCILIATION CHECKS PASSED PERFECTLY!');
  }
}

testReconciliation().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
