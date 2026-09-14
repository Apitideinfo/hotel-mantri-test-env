import { supabaseServiceRole } from '../server/supabaseClient.js';

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c';

async function main() {
  const { data: resvs } = await supabaseServiceRole
    .from('reservations')
    .select('id, guest_name, room_no, status, check_in_date, check_out_date, rate, invoice_total, source_category, source_name')
    .eq('hotel_id', HOTEL_ID)
    .order('check_in_date', { ascending: true });

  console.log('Total reservations:', resvs.length);
  const byRoom = {};
  for (const r of resvs) {
    const k = r.room_no || 'EMPTY';
    byRoom[k] = (byRoom[k] || 0) + 1;
  }
  console.log('By room_no:', byRoom);
}
main();
