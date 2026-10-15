import dotenv from 'dotenv';
dotenv.config();

import { supabaseServiceRole } from '../server/supabaseClient.js';
import { calculateDayWiseRevenue } from '../server/services/RevenueCalculationService.js';

const HOTEL_ID = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb';
const DATE = '2026-10-01';

async function testCurrentBackend() {
  console.log('Testing calculateDayWiseRevenue for 2026-10-01...');
  const res = await calculateDayWiseRevenue({
    hotelId: HOTEL_ID,
    date: DATE,
  });

  console.log('\n--- Day Wise Revenue Output for 2026-10-01 ---');
  console.log('Summary:');
  console.log('  Total Income / Revenue:', res.summary.totalIncome);
  console.log('  Room Revenue:', res.summary.roomRevenue);
  console.log('  Collections:');
  console.log('    Cash:', res.summary.collections.cash);
  console.log('    Bank:', res.summary.collections.bank);
  console.log('    UPI:', res.summary.collections.upi);
  console.log('    Card:', res.summary.collections.card);
  console.log('    Total:', res.summary.collections.total);
}

testCurrentBackend().catch(console.error);
