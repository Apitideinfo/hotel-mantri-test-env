import { supabaseServiceRole } from '../server/supabaseClient.js';

async function main() {
  const { data: r1 } = await supabaseServiceRole.from('reservations').select('*').ilike('guest_name', '%Taral%');
  console.log('reservations by guest_name Taral (count = ' + (r1?.length || 0) + '):', JSON.stringify(r1, null, 2));

  const { data: o1 } = await supabaseServiceRole.from('channel_ota_reservations').select('*').ilike('guest_name', '%Taral%');
  console.log('channel_ota_reservations by guest_name Taral (count = ' + (o1?.length || 0) + '):', JSON.stringify(o1, null, 2));

  const { data: o2 } = await supabaseServiceRole.from('channel_ota_reservations').select('*');
  console.log('ALL channel_ota_reservations (count = ' + (o2?.length || 0) + '):', JSON.stringify(o2, null, 2));
}

main().catch(console.error);
