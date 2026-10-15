import dotenv from 'dotenv';
dotenv.config();

import { supabaseServiceRole } from '../server/supabaseClient.js';
import { reconcilePaymentLedger, normalizePaymentMethod } from '../src/lib/financialLedger.ts';
import { buildDerivedReport, toNum } from '../src/lib/calc.ts';

const HOTEL_ID = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb';
const DATE = '2026-10-01';

async function simulate() {
  console.log('=== SIMULATING RECONCILIATION FOR 2026-10-01 ===\n');

  const [
    { data: reservations },
    { data: timelineEvents },
    { data: expenseEntries },
  ] = await Promise.all([
    supabaseServiceRole.from('reservations').select('*').eq('hotel_id', HOTEL_ID),
    supabaseServiceRole.from('booking_timeline').select('*').eq('hotel_id', HOTEL_ID),
    supabaseServiceRole.from('expense_entries').select('*').eq('hotel_id', HOTEL_ID).eq('entry_date', DATE),
  ]);

  // Apply the 2 corrections in-memory to test the outcome:
  // 1. Goswami Jenishgiri (7a37991f) payment corrected from Card to Cash
  const correctedResvs = reservations.map(r => {
    if (r.id === '7a37991f-7666-4be8-9dc0-d91c0f7fb902') {
      return { ...r, payment_mode: 'Cash', pay_cash: 1200, pay_card: 0 };
    }
    return r;
  });

  // 2. Void/exclude the orphan duplicate timeline event a39a23d2
  const correctedTimeline = timelineEvents.filter(e => e.id !== 'a39a23d2-ca24-42ad-ab3b-a67c78b753e0').map(e => {
    if (e.id === 'c965c3ac-78e4-419b-b1a5-d2f9905b82be') {
      return {
        ...e,
        payment_mode: 'Cash',
        event_data: { ...e.event_data, payment_method: 'Cash', pay_cash: 1200, pay_card: 0 },
      };
    }
    return e;
  });

  const txs = reconcilePaymentLedger({
    timelineEvents: correctedTimeline,
    reservations: correctedResvs,
    roomChartEntries: [],
    hotelId: HOTEL_ID,
  });

  const dateTxs = txs.filter(t => (t.payment_date || '').slice(0, 10) === DATE);
  let totalCash = 0, totalBank = 0, totalCard = 0, totalUpi = 0;
  for (const t of dateTxs) {
    if (t.payment_method === 'Cash') totalCash += t.amount;
    else if (t.payment_method === 'Bank') totalBank += t.amount;
    else if (t.payment_method === 'Card') totalCard += t.amount;
    else if (t.payment_method === 'UPI') totalUpi += t.amount;
  }

  console.log('--- Reconciled Payment Totals for 2026-10-01 ---');
  console.log(`Cash: ₹${totalCash} (Expected: ₹8,600) -> ${totalCash === 8600 ? 'MATCH!' : 'MISMATCH'}`);
  console.log(`Bank: ₹${totalBank} (Expected: ₹16,808) -> ${totalBank === 16808 ? 'MATCH!' : 'MISMATCH'}`);
  console.log(`Card: ₹${totalCard} (Expected: ₹0) -> ${totalCard === 0 ? 'MATCH!' : 'MISMATCH'}`);
  console.log(`UPI: ₹${totalUpi} (Expected: ₹0) -> ${totalUpi === 0 ? 'MATCH!' : 'MISMATCH'}`);
  console.log(`Total Collection: ₹${totalCash + totalBank + totalCard + totalUpi} (Expected: ₹25,408) -> ${totalCash + totalBank + totalCard + totalUpi === 25408 ? 'MATCH!' : 'MISMATCH'}`);

  const totalExp = (expenseEntries || []).reduce((s, e) => s + toNum(e.amount), 0);
  console.log(`Total Cash Expenses: ₹${totalExp}`);
  console.log(`Closing Cash: 0 + ${totalCash} - ${totalExp} = ₹${totalCash - totalExp}`);
}

simulate().catch(console.error);
