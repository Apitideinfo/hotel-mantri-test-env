import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = m[2]?.replace(/^['"]|['"]$/g, '').trim();
});

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
const client = createClient(url, key);

async function runAudit() {
  const { data: hotels, error: hErr } = await client.from('hotels').select('id, hotel_name, total_rooms');
  if (hErr) {
    console.error('Failed to query hotels:', hErr);
    process.exit(1);
  }
  console.log(`Total hotels found: ${hotels.length}`);

  for (const h of hotels) {
    const { data: rooms } = await client.from('rooms').select('id, room_no, category_id, is_active').eq('hotel_id', h.id);
    const { data: cats } = await client.from('room_categories').select('id, name, is_active').eq('hotel_id', h.id);
    const activeRooms = (rooms || []).filter(r => r.is_active !== false);
    const catMap = {};
    const catActive = {};
    (cats || []).forEach(c => {
      catMap[c.id] = c.name;
      catActive[c.id] = c.is_active;
    });

    const categoryRoomCounts = {};
    (cats || []).forEach(c => {
      categoryRoomCounts[c.name] = 0;
    });

    const unassigned = [];
    const inactiveCatRooms = [];

    activeRooms.forEach(r => {
      if (!r.category_id) {
        unassigned.push(r.room_no);
      } else if (!catMap[r.category_id]) {
        unassigned.push(`${r.room_no} (orphaned cat: ${r.category_id})`);
      } else if (catActive[r.category_id] === false) {
        inactiveCatRooms.push(`${r.room_no} (inactive cat: ${catMap[r.category_id]})`);
      } else {
        const catName = catMap[r.category_id];
        categoryRoomCounts[catName] = (categoryRoomCounts[catName] || 0) + 1;
      }
    });

    console.log(`\n========================================`);
    console.log(`Hotel: ${h.hotel_name} (${h.id})`);
    console.log(`  Metadata total_rooms: ${h.total_rooms}`);
    console.log(`  Active physical rooms in DB: ${activeRooms.length}`);
    console.log(`  Registered categories count: ${cats?.length || 0}`);
    console.log(`  Category Breakdown:`, categoryRoomCounts);
    if (unassigned.length > 0) {
      console.log(`  ⚠️ Unassigned/Orphaned rooms (${unassigned.length}):`, unassigned);
    }
    if (inactiveCatRooms.length > 0) {
      console.log(`  ⚠️ Rooms in inactive categories (${inactiveCatRooms.length}):`, inactiveCatRooms);
    }
    const sumCategories = Object.values(categoryRoomCounts).reduce((a, b) => a + b, 0);
    console.log(`  Sum of active category rooms: ${sumCategories}`);
    if (sumCategories + unassigned.length + inactiveCatRooms.length === activeRooms.length) {
      console.log(`  ✅ Invariant holds: category rooms (${sumCategories}) + unassigned (${unassigned.length}) + inactive (${inactiveCatRooms.length}) = total physical (${activeRooms.length})`);
    } else {
      console.log(`  ❌ MISMATCH DETECTED!`);
    }
  }
}

runAudit().catch(console.error);
