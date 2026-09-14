import { supabaseServiceRole } from '../server/supabaseClient.js';

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c';

async function main() {
  const { data: entries } = await supabaseServiceRole
    .from('room_chart_entries')
    .select('*')
    .eq('hotel_id', HOTEL_ID);

  const { data: resvs } = await supabaseServiceRole
    .from('reservations')
    .select('*')
    .eq('hotel_id', HOTEL_ID)
    .in('status', ['confirmed', 'checked_in']);

  console.log('=== EXACT REVENUE & PAYMENT ACCOUNTING ===');

  let otaAdvTotal = 0;
  for (const r of resvs) {
    if (r.source_category === 'OTA' || r.payment_mode === 'OTA') {
      otaAdvTotal += (r.advance_paid || 0);
      console.log(`OTA Booking: ${r.guest_name} | Total: ₹${r.invoice_total} | AdvPaid: ₹${r.advance_paid}`);
    }
  }
  console.log(`\nTotal OTA Advance Paid: ₹${otaAdvTotal}`);
}
main();
