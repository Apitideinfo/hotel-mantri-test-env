import dotenv from 'dotenv';
dotenv.config();

import { supabaseServiceRole } from '../server/supabaseClient.js';

async function find8980() {
  console.log('Searching for 8980 in database...');

  // 1. expense_entries
  const { data: expEntries, error: e1 } = await supabaseServiceRole
    .from('expense_entries')
    .select('*')
    .eq('hotel_id', 'bd8f18de-2f97-48e7-b029-d2e536feb7cb');
  console.log('expense_entries:', expEntries?.length, e1?.message);
  for (const e of expEntries || []) {
    console.log('  expense_entry:', e);
  }

  // 2. expenses
  const { data: exps, error: e2 } = await supabaseServiceRole
    .from('expenses')
    .select('*')
    .eq('hotel_id', 'bd8f18de-2f97-48e7-b029-d2e536feb7cb');
  console.log('expenses:', exps?.length, e2?.message);
  for (const e of exps || []) {
    console.log('  expense:', e);
  }

  // 3. other_daily_entries
  const { data: other, error: e3 } = await supabaseServiceRole
    .from('other_daily_entries')
    .select('*')
    .eq('hotel_id', 'bd8f18de-2f97-48e7-b029-d2e536feb7cb');
  console.log('other_daily_entries:', other?.length, e3?.message);
  for (const o of other || []) {
    console.log('  other_daily_entry:', o);
  }

  // 4. Check journal_entries or vouchers or petty_cash
  const tables = ['journal_entries', 'vouchers', 'payments', 'day_close_records', 'hotel_settings'];
  for (const t of tables) {
    const { data, error } = await supabaseServiceRole
      .from(t)
      .select('*')
      .eq('hotel_id', 'bd8f18de-2f97-48e7-b029-d2e536feb7cb');
    if (!error && data?.length) {
      console.log(`Table ${t} has ${data.length} rows for hotel.`);
      for (const row of data) {
        const str = JSON.stringify(row);
        if (str.includes('8980') || str.includes('2026-10-01') || str.includes('1580')) {
          console.log(`  Match in ${t}:`, row);
        }
      }
    }
  }
}

find8980().catch(console.error);
