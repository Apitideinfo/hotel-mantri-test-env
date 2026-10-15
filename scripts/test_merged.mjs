import dotenv from 'dotenv';
dotenv.config();

import { supabaseServiceRole } from '../server/supabaseClient.js';
import { reconcilePaymentLedger } from '../src/lib/financialLedger.ts';
import { buildDerivedReport, toNum } from '../src/lib/calc.ts';
import { mergeReservationsWithRoomChart } from '../src/lib/api.ts';

const HOTEL_ID = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb'; // Hotel Gopal
const DATE = '2026-10-01';

async function testMerged() {
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
    supabaseServiceRole.from('expense_entries').select('*').eq('hotel_id', HOTEL_ID).eq('entry_date', DATE),
    supabaseServiceRole.from('daily_revenue_entries').select('*').eq('hotel_id', HOTEL_ID).eq('entry_date', DATE),
  ]);

  const combined = mergeReservationsWithRoomChart(entries || [], reservations || []);
  console.log(`Combined entries count: ${combined.length}`);

  const paymentTransactions = reconcilePaymentLedger({
    timelineEvents: timelineEvents || [],
    reservations: reservations || [],
    roomChartEntries: combined,
    hotelId: HOTEL_ID,
  });

  const otherDefault = other || {
    report_date: DATE, kitchen: 0, other_income: 0, housekeeping_supply: 0,
    other_expense: 0, salary_advance: 0, maintenance_bill: 0,
    cash_handover_md: 0, bank_cash_deposit: 0,
  };

  const dr = buildDerivedReport(
    DATE,
    combined,
    otherDefault,
    toNum(settings?.opening_cash_balance || 0),
    settings?.total_rooms || 22,
    (financeEntries || []).map(e => ({ category: e.category_name, amount: e.amount, payment_mode: e.payment_mode })),
    (revenueEntries || []).map(e => ({ category: e.revenue_head, amount: e.amount })),
    paymentTransactions,
  );

  console.log('\n--- Derived Report with Combined Entries ---');
  console.log('Rooms occupied:', dr.rooms_occupied);
  console.log('Room sale amount:', dr.room_sale_amount);
  console.log('Room revenue:', dr.room_revenue);
  console.log('Pay Cash:', dr.pay_cash);
  console.log('Pay Card:', dr.pay_card);
  console.log('Pay Bank:', dr.pay_bank);
  console.log('Pay UPI:', dr.pay_upi);
  console.log('Cash (agg):', dr.cash);
  console.log('Bank (agg):', dr.bank);
  console.log('Finance expenses:', dr.finance_expenses);
  console.log('Cash closing:', dr.cash_closing);
}

testMerged().catch(console.error);
