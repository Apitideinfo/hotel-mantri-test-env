import dotenv from 'dotenv';
dotenv.config();

import { supabaseServiceRole } from '../server/supabaseClient.js';

async function checkAllResvsOct1() {
  const { data: resvs } = await supabaseServiceRole
    .from('reservations')
    .select('*')
    .eq('hotel_id', 'bd8f18de-2f97-48e7-b029-d2e536feb7cb');

  console.log(`Total reservations for Hotel Gopal: ${resvs?.length || 0}`);
  for (const r of resvs || []) {
    if (r.check_in_date === '2026-10-01' || r.check_out_date === '2026-10-01' || (r.created_at && r.created_at.includes('2026-10-01'))) {
      console.log(`Res ${r.id.slice(0, 8)}: Room ${r.room_no}, Guest: "${r.guest_name}", Dates: ${r.check_in_date}->${r.check_out_date}, Adv: ${r.advance_paid}, PayBank: ${r.pay_bank}, PayCash: ${r.pay_cash}, Status: ${r.status}`);
    }
  }
}

checkAllResvsOct1().catch(console.error);
