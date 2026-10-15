import dotenv from 'dotenv';
dotenv.config();

import { supabaseServiceRole } from '../server/supabaseClient.js';
import { reconcilePaymentLedger } from '../src/lib/financialLedger.ts';

const HOTEL_ID = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb';
const DATE = '2026-10-01';

async function testTsLedger() {
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

  console.log('src/lib/financialLedger.ts Results:');
  console.log(`  Cash: ${payCash}`);
  console.log(`  Bank: ${payBank}`);
  console.log(`  UPI:  ${payUpi}`);
  console.log(`  Card: ${payCard}`);
  console.log(`  Total: ${totalColl}`);
}

testTsLedger().catch(console.error);
