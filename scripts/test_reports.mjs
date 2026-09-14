import { supabaseServiceRole } from '../server/supabaseClient.js';

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c';

async function main() {
  const { data: entries } = await supabaseServiceRole
    .from('room_chart_entries')
    .select('*')
    .eq('hotel_id', HOTEL_ID);

  console.log('Room chart entries in DB:', entries.length);
  for (const e of entries) {
    console.log(`- ${e.guest_name} | arr:${e.arrival} dep:${e.departure} | rep:${e.report_date} | rate:${e.room_rate} tot:${e.total}`);
  }

  const { data: closes } = await supabaseServiceRole
    .from('day_close_records')
    .select('*')
    .eq('hotel_id', HOTEL_ID);
  console.log('Closes:', closes);
}
main();
