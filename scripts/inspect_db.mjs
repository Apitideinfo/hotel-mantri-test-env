import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabase = createClient(url, key);

async function inspect() {
  console.log('--- HOTELS ---');
  const { data: hotels, error: hErr } = await supabase.from('hotels').select('id, hotel_name, property_code');
  if (hErr) console.error('Hotels error:', hErr);
  else console.log(JSON.stringify(hotels, null, 2));

  console.log('\n--- CHANNEL_SETTINGS ---');
  const { data: cs, error: csErr } = await supabase.from('channel_settings').select('*');
  if (csErr) console.error('Channel settings error:', csErr);
  else console.log(JSON.stringify(cs, null, 2));

  console.log('\n--- CHANNEL_CONNECTIONS ---');
  const { data: cc, error: ccErr } = await supabase.from('channel_connections').select('id, hotel_id, channel_name, external_hotel_code, status');
  if (ccErr) console.error('Channel connections error:', ccErr);
  else console.log(JSON.stringify(cc, null, 2));
}

inspect();
