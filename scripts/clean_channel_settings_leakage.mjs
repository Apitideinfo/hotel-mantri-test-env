import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabase = createClient(url, key);

async function cleanLeakage() {
  console.log('1. Cleaning Hotel Swagat (aa5bfd36-de50-4217-8997-d2cd18e4dfe8)...');
  
  // Clean channel_settings for Hotel Swagat
  const { error: csErr } = await supabase
    .from('channel_settings')
    .update({
      aiosell_hotel_code: null,
      aiosell_status: 'disconnected',
      last_tested_at: null,
      last_test_result: null,
      channel_manager_enabled: false,
      updated_at: new Date().toISOString()
    })
    .eq('hotel_id', 'aa5bfd36-de50-4217-8997-d2cd18e4dfe8');

  if (csErr) console.error('Error cleaning Swagat channel_settings:', csErr);
  else console.log('Successfully cleared Swagat channel_settings aiosell_hotel_code.');

  // Restore property_code on hotels table for Swagat
  const { error: hErr } = await supabase
    .from('hotels')
    .update({ property_code: 'fe6288c94a' })
    .eq('id', 'aa5bfd36-de50-4217-8997-d2cd18e4dfe8');

  if (hErr) console.error('Error restoring Swagat property_code:', hErr);
  else console.log('Successfully restored Swagat property_code to fe6288c94a in hotels table.');

  // Clean leaked fa44d51cc0 from any other hotel that is NOT Hotel Gopal (bd8f18de-2f97-48e7-b029-d2e536feb7cb)
  console.log('2. Removing leaked fa44d51cc0 from non-Gopal records...');
  const { data: nonGopal, error: ngErr } = await supabase
    .from('channel_settings')
    .update({
      aiosell_hotel_code: null,
      aiosell_status: 'disconnected',
      updated_at: new Date().toISOString()
    })
    .neq('hotel_id', 'bd8f18de-2f97-48e7-b029-d2e536feb7cb')
    .eq('aiosell_hotel_code', 'fa44d51cc0')
    .select('id, hotel_id');

  if (ngErr) console.error('Error cleaning non-Gopal records:', ngErr);
  else console.log(`Cleaned ${nonGopal?.length || 0} non-Gopal records with leaked fa44d51cc0:`, nonGopal);

  // Clean duplicate mars hotel code from 2fb1e4de-de39-4ad3-ac75-a03f196157b4
  const { data: nonMars } = await supabase
    .from('channel_settings')
    .update({ aiosell_hotel_code: null, updated_at: new Date().toISOString() })
    .neq('hotel_id', '9001eb1c-9d38-49d0-84f7-75244e8f4bf8')
    .eq('aiosell_hotel_code', 'be424e4a03')
    .select('id, hotel_id');
  if (nonMars?.length) console.log(`Cleaned non-mars duplicates:`, nonMars);

  // Verify resulting channel_settings
  console.log('\n3. Verification of active hotels channel_settings:');
  const { data: finalSettings } = await supabase
    .from('channel_settings')
    .select('hotel_id, aiosell_hotel_code, aiosell_partner_id, aiosell_status, last_test_result');
  console.log(JSON.stringify(finalSettings, null, 2));

  console.log('\n4. Verification of hotels table property_codes:');
  const { data: finalHotels } = await supabase
    .from('hotels')
    .select('id, hotel_name, property_code');
  console.log(JSON.stringify(finalHotels, null, 2));
}

cleanLeakage();
