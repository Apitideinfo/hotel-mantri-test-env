import { supabaseServiceRole } from '../server/supabaseClient.js';

async function main() {
  console.log('Searching for Taral or travelguru across tables...');
  
  // 1. reservations
  const { data: r1 } = await supabaseServiceRole.from('reservations').select('*').ilike('guest_name', '%Taral%');
  console.log('reservations by guest_name Taral:', r1);

  const { data: r2 } = await supabaseServiceRole.from('reservations').select('*').ilike('source_name', '%travelguru%');
  console.log('reservations by source_name travelguru:', r2);

  // 2. channel_ota_reservations
  const { data: o1 } = await supabaseServiceRole.from('channel_ota_reservations').select('*').ilike('guest_name', '%Taral%');
  console.log('channel_ota_reservations by guest_name Taral:', o1);

  const { data: o2 } = await supabaseServiceRole.from('channel_ota_reservations').select('*').ilike('channel_name', '%travelguru%');
  console.log('channel_ota_reservations by channel_name travelguru:', o2);

  // 3. room_chart_entries
  const { data: e1 } = await supabaseServiceRole.from('room_chart_entries').select('*').ilike('guest_name', '%Taral%');
  console.log('room_chart_entries by guest_name Taral:', e1);

  // 4. guests
  const { data: g1 } = await supabaseServiceRole.from('guests').select('*').ilike('name', '%Taral%');
  console.log('guests by name Taral:', g1);
}

main().catch(console.error);
