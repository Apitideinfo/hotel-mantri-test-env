import { supabaseServiceRole } from '../server/supabaseClient.js';

async function main() {
  console.log('=== AUDITING DATABASE ===');
  
  // 1. Hotels
  const { data: hotels } = await supabaseServiceRole.from('hotels').select('id, hotel_name');
  console.log('Hotels in hotels table:', hotels);

  const { data: settings } = await supabaseServiceRole.from('hotel_settings').select('id, hotel_name');
  console.log('Hotels in hotel_settings table:', settings);

  // 2. Reservations
  const { data: resvs, error: rErr } = await supabaseServiceRole
    .from('reservations')
    .select('id, hotel_id, guest_name, room_no, status, check_in_date, check_out_date, rate, total_amount, advance_paid, source_name, source_category, room_chart_entry_id')
    .order('created_at', { ascending: false });

  if (rErr) console.error('Reservation query error:', rErr);
  else {
    console.log(`\nFound ${resvs?.length || 0} reservations:`);
    for (const r of (resvs || [])) {
      console.log(JSON.stringify(r));
    }
  }

  // 3. Room chart entries
  const { data: entries, error: eErr } = await supabaseServiceRole
    .from('room_chart_entries')
    .select('id, hotel_id, room_no, guest_name, report_date, arrival, departure, nights, room_rate, total, pay_mode, checked_in_at, checked_out_at, reservation_id')
    .order('created_at', { ascending: false });

  if (eErr) console.error('Entries query error:', eErr);
  else {
    console.log(`\nFound ${entries?.length || 0} room_chart_entries:`);
    for (const e of (entries || [])) {
      console.log(JSON.stringify(e));
    }
  }

  // 4. Rooms
  const { data: rooms } = await supabaseServiceRole.from('rooms').select('id, hotel_id, room_no, is_active, housekeeping_status');
  console.log(`\nTotal rooms in rooms table: ${rooms?.length || 0}`);
}

main().catch(console.error);
