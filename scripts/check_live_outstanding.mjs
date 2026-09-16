import { supabaseServiceRole } from '../server/supabaseClient.js';

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c';
const toNum = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

async function main() {
  const todayStr = '2026-09-15';

  // Find currently in-house reservations (checked_in, or confirmed overlapping today)
  const { data: resvs } = await supabaseServiceRole
    .from('reservations')
    .select('*')
    .eq('hotel_id', HOTEL_ID)
    .in('status', ['confirmed', 'checked_in'])
    .lte('check_in_date', todayStr)
    .gte('check_out_date', todayStr);

  console.log(`Current in-house / active reservations on ${todayStr}:`, resvs.length);
  let liveDue = 0;
  for (const r of resvs) {
    const inv = toNum(r.invoice_total) || (toNum(r.rate) * (r.nights || 1));
    const paid = toNum(r.advance_paid) + toNum(r.pay_cash) + toNum(r.pay_bank) + toNum(r.pay_upi) + toNum(r.pay_card);
    const bal = Math.max(0, inv - paid);
    liveDue += bal;
    console.log(`- ${r.guest_name} (Rm ${r.room_no}) | Status: ${r.status} | Dates: ${r.check_in_date} to ${r.check_out_date} | Total: ${inv} | Paid: ${paid} | Outstanding: ${bal}`);
  }
  console.log(`Total Live In-House Outstanding: ₹${liveDue}`);
}

main();
