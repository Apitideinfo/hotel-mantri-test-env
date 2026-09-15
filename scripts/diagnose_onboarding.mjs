import { supabaseServiceRole } from '../server/supabaseClient.js';

async function main() {
  console.log('=== CHECKING ONBOARDING ATTEMPTS & HOTELS ===');
  
  const { data: attempts, error: aErr } = await supabaseServiceRole
    .from('onboarding_attempts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (aErr) console.error('onboarding_attempts error:', aErr);
  else console.log('Recent onboarding attempts:', JSON.stringify(attempts, null, 2));

  const { data: hotels, error: hErr } = await supabaseServiceRole
    .from('hotels')
    .select('id, hotel_name, admin_email, owner_name, onboarding_status, onboarding_attempt_id, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (hErr) console.error('hotels error:', hErr);
  else console.log('Recent hotels:', JSON.stringify(hotels, null, 2));

  const { data: admins, error: admErr } = await supabaseServiceRole
    .from('hotel_admins')
    .select('*')
    .limit(10);
  
  if (admErr) console.error('hotel_admins error:', admErr);
  else console.log('Hotel admins:', JSON.stringify(admins, null, 2));
}

main().catch(console.error);
