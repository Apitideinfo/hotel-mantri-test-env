import { supabaseServiceRole } from '../server/supabaseClient.js';

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c';

async function main() {
  const { data: cats } = await supabaseServiceRole
    .from('room_categories')
    .select('*')
    .eq('hotel_id', HOTEL_ID);
  console.log('Categories:', cats);

  const { data: rooms } = await supabaseServiceRole
    .from('rooms')
    .select('*')
    .eq('hotel_id', HOTEL_ID)
    .order('room_no', { ascending: true });
  console.log('Rooms count:', rooms.length);
  for (const r of rooms) {
    const c = cats.find(c => c.id === r.category_id);
    console.log(`Room ${r.room_no}: Category ${c ? c.name : 'NONE (' + r.category_id + ')'}, floor ${r.floor}, active ${r.is_active}`);
  }
}
main();
