import dotenv from 'dotenv';
dotenv.config();

import { supabaseServiceRole } from '../server/supabaseClient.js';
import { reconcilePaymentLedger } from '../server/services/authoritativeRevenue.js';

const HOTEL_ID = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb';
const DATE = '2026-10-01';

async function debugTxs() {
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

  console.log(`Total transactions generated: ${txs.length}`);
  const txsToday = txs.filter((t) => t.business_date === DATE);
  console.log(`Transactions on ${DATE}: ${txsToday.length}`);
  for (const t of txsToday) {
    console.log(`ID: ${t.id}, Res: ${t.reservation_id}, Date: ${t.business_date}, Amount: ${t.amount}, Method: ${t.payment_method}`);
  }

  console.log('\nAll transactions for hotel (dates):');
  const dateCounts = {};
  for (const t of txs) {
    dateCounts[t.business_date] = (dateCounts[t.business_date] || 0) + 1;
  }
  console.log(dateCounts);
}

debugTxs().catch(console.error);
