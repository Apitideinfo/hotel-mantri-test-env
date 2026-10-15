import dotenv from 'dotenv';
dotenv.config();

import { supabaseServiceRole } from '../server/supabaseClient.js';
import { reconcilePaymentLedger } from '../src/lib/financialLedger.ts';
import { buildDerivedReport, toNum } from '../src/lib/calc.ts';

const HOTEL_ID = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb'; // Hotel Gopal
const DATE = '2026-10-01';

async function testDerived() {
  console.log(`=== RUNNING DERIVED REPORT CALCULATION FOR ${DATE} ===\n`);

  const [
    { data: settings },
    { data: entries },
    { data: other },
    { data: reservations },
    { data: timelineEvents },
    { data: financeEntries },
    { data: revenueEntries },
  ] = await Promise.all([
    supabaseServiceRole.from('hotel_settings').select('*').eq('id', HOTEL_ID).single(),
    supabaseServiceRole.from('room_chart_entries').select('*').eq('hotel_id', HOTEL_ID).eq('report_date', DATE),
    supabaseServiceRole.from('other_daily_entries').select('*').eq('hotel_id', HOTEL_ID).eq('report_date', DATE).maybeSingle(),
    supabaseServiceRole.from('reservations').select('*').eq('hotel_id', HOTEL_ID),
    supabaseServiceRole.from('booking_timeline').select('*').eq('hotel_id', HOTEL_ID),
    supabaseServiceRole.from('expense_entries').select('*').eq('hotel_id', HOTEL_ID).eq('expense_date', DATE),
    supabaseServiceRole.from('daily_revenue_entries').select('*').eq('hotel_id', HOTEL_ID).eq('entry_date', DATE),
  ]);

  console.log('Total rooms:', settings?.total_rooms);
  console.log('Room chart entries:', entries?.length);
  console.log('Reservations:', reservations?.length);
  console.log('Timeline events:', timelineEvents?.length);
  console.log('Other daily entries:', other);
  console.log('Finance entries (expenses):', financeEntries?.length);
  console.log('Daily revenue entries:', revenueEntries?.length);

  const paymentTransactions = reconcilePaymentLedger({
    timelineEvents: timelineEvents || [],
    reservations: reservations || [],
    roomChartEntries: entries || [],
    hotelId: HOTEL_ID,
  });

  console.log(`\nReconciled ${paymentTransactions.length} total payment transactions across all dates.`);
  const dateTxs = paymentTransactions.filter(tx => (tx.payment_date || '').slice(0, 10) === DATE);
  console.log(`Transactions on ${DATE} (${dateTxs.length}):`);
  let sumCash = 0;
  let sumBank = 0;
  let sumCard = 0;
  let sumUpi = 0;
  for (const tx of dateTxs) {
    console.log(`  Tx: id=${tx.id}, res=${tx.reservation_id?.slice(0, 8)}, amount=${tx.amount}, method=${tx.payment_method}, date=${tx.payment_date}`);
    if (tx.payment_method === 'Cash') sumCash += tx.amount;
    else if (tx.payment_method === 'Bank') sumBank += tx.amount;
    else if (tx.payment_method === 'Card') sumCard += tx.amount;
    else if (tx.payment_method === 'UPI') sumUpi += tx.amount;
  }
  console.log(`\nDate ${DATE} Tx Totals -> Cash: ${sumCash}, Bank: ${sumBank}, Card: ${sumCard}, UPI: ${sumUpi}, Total: ${sumCash + sumBank + sumCard + sumUpi}`);

  const otherDefault = other || {
    report_date: DATE, kitchen: 0, other_income: 0, housekeeping_supply: 0,
    other_expense: 0, salary_advance: 0, maintenance_bill: 0,
    cash_handover_md: 0, bank_cash_deposit: 0,
  };

  const dr = buildDerivedReport(
    DATE,
    entries || [],
    otherDefault,
    toNum(settings?.opening_cash_balance || 0),
    settings?.total_rooms || 22,
    (financeEntries || []).map(e => ({ category: e.category_name, amount: e.amount, payment_mode: e.payment_mode })),
    (revenueEntries || []).map(e => ({ category: e.revenue_head, amount: e.amount })),
    paymentTransactions,
  );

  console.log('\n--- Derived Report Output ---');
  console.log('Room sale amount:', dr.room_sale_amount);
  console.log('Room revenue:', dr.room_revenue);
  console.log('Total revenue (net):', dr.net_revenue);
  console.log('Pay Cash:', dr.pay_cash);
  console.log('Pay Bank:', dr.pay_bank);
  console.log('Pay Card:', dr.pay_card);
  console.log('Pay UPI:', dr.pay_upi);
  console.log('Cash (agg):', dr.cash);
  console.log('Bank (agg):', dr.bank);
  console.log('Cash closing:', dr.cash_closing);
}

testDerived().catch(console.error);
