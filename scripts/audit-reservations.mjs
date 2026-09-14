import { supabaseServiceRole } from '../server/supabaseClient.js';

async function main() {
  const { data: resvs } = await supabaseServiceRole
    .from('reservations')
    .select('*')
    .order('created_at', { ascending: false });

  console.log(`Found ${resvs?.length || 0} reservations:`);
  for (const r of (resvs || [])) {
    console.log(`- ID: ${r.id}`);
    console.log(`  Hotel: ${r.hotel_id}`);
    console.log(`  Guest: ${r.guest_name} | Phone: ${r.guest_phone}`);
    console.log(`  Room: ${r.room_no} | Status: ${r.status}`);
    console.log(`  Dates: ${r.check_in_date} -> ${r.check_out_date} | Nights: ${r.nights}`);
    console.log(`  Rate: ${r.rate} | Total: ${r.total_amount} | Advance: ${r.advance_paid}`);
    console.log(`  Source: ${r.source_name} (${r.source_category}) | PayMode: ${r.payment_mode}`);
    console.log(`  RoomChartEntryId: ${r.room_chart_entry_id}`);
    console.log('---');
  }
}

main().catch(console.error);
