import { supabaseServiceRole } from '../server/supabaseClient.js';

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c';

async function main() {
  console.log('=== DETAILED AUDIT FOR HOTEL GOPAL ===', HOTEL_ID);

  // 1. Hotel info
  const { data: hotel } = await supabaseServiceRole.from('hotels').select('*').eq('id', HOTEL_ID).single();
  console.log('Hotel Name:', hotel?.hotel_name);

  // 2. Day close records
  const { data: closes } = await supabaseServiceRole
    .from('day_close_records')
    .select('*')
    .eq('hotel_id', HOTEL_ID)
    .order('business_date', { ascending: false });
  console.log('Day Close Records count:', closes?.length);
  console.log('Day Close Records:', closes);

  // 3. Reservations
  const { data: resvs, error: rErr } = await supabaseServiceRole
    .from('reservations')
    .select('id, guest_name, room_no, status, check_in_date, check_out_date, invoice_total, rate')
    .eq('hotel_id', HOTEL_ID)
    .order('check_in_date', { ascending: true });
  if (rErr) console.error('Resv query err:', rErr);
  console.log('\nTotal reservations for Hotel Gopal:', resvs?.length);
  for (const r of (resvs || [])) {
    console.log(`Resv: ${r.room_no} | ${r.guest_name} | ${r.status} | in:${r.check_in_date} out:${r.check_out_date} | total:${r.invoice_total}`);
  }

  // 4. Room chart entries
  const { data: entries } = await supabaseServiceRole
    .from('room_chart_entries')
    .select('id, guest_name, room_no, arrival, departure, nights, room_rate, total, pay_mode, checked_in_at, checked_out_at, reservation_id')
    .eq('hotel_id', HOTEL_ID)
    .order('arrival', { ascending: true });
  console.log('\nTotal room chart entries for Hotel Gopal:', entries?.length);
  for (const e of (entries || [])) {
    console.log(`Entry: ${e.room_no} | ${e.guest_name} | in:${e.arrival} out:${e.departure} | rate:${e.room_rate} tot:${e.total} | chkIn:${e.checked_in_at} chkOut:${e.checked_out_at} resvId:${e.reservation_id}`);
  }

  // 5. Rooms
  const { data: rooms } = await supabaseServiceRole
    .from('rooms')
    .select('id, room_no, category_id, is_active, housekeeping_status')
    .eq('hotel_id', HOTEL_ID)
    .order('room_no', { ascending: true });
  console.log('\nRooms for Hotel Gopal:', rooms?.length);
  console.log(rooms?.map(r => `${r.room_no} (${r.is_active ? 'active' : 'inactive'}, ${r.housekeeping_status})`).join(', '));
}

main().catch(console.error);
