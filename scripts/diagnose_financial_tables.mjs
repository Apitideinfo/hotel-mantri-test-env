import { supabaseServiceRole } from '../server/supabaseClient.js';

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c';

async function checkTable(tableName) {
  try {
    const { data, error, count } = await supabaseServiceRole
      .from(tableName)
      .select('*', { count: 'exact', head: true })
      .eq('hotel_id', HOTEL_ID);
    if (error) {
      console.log(`Table ${tableName}: error ->`, error.message);
    } else {
      console.log(`Table ${tableName}: count = ${count}`);
    }
  } catch (err) {
    console.log(`Table ${tableName}: exception ->`, err.message);
  }
}

async function main() {
  const tables = [
    'room_chart_entries',
    'reservations',
    'payments',
    'reservation_payments',
    'folios',
    'folio_items',
    'room_revenue',
    'revenue_entries',
    'daily_revenue_entries',
    'expense_entries',
    'expenses',
    'business_dates',
    'day_close_records',
    'other_daily_entries',
    'hotel_settings'
  ];

  for (const t of tables) {
    await checkTable(t);
  }
}

main();
