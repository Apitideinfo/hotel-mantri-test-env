import { supabaseServiceRole } from '../server/supabaseClient.js';

async function main() {
  const hotelId = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c';
  const { data: entries } = await supabaseServiceRole
    .from('room_chart_entries')
    .select('*')
    .eq('hotel_id', hotelId);

  const { data: resvs } = await supabaseServiceRole
    .from('reservations')
    .select('*')
    .eq('hotel_id', hotelId);

  console.log('=== ROOM CHART ENTRIES ===');
  let rceTotal = 0, rceCash = 0, rceBank = 0, rceUpi = 0, rceCard = 0, rceAdv = 0;
  for (const e of entries) {
    rceTotal += Number(e.total || 0);
    rceCash += Number(e.pay_cash || 0);
    rceBank += Number(e.pay_bank || 0);
    rceUpi += Number(e.pay_upi || 0);
    rceCard += Number(e.pay_card || 0);
    rceAdv += Number(e.pay_advance || 0);
    console.log(`Entry: Room ${e.room_no} | ${e.guest_name} | Rate: ${e.room_rate} | Nights: ${e.nights} | Total: ${e.total} | Cash: ${e.pay_cash} | Bank: ${e.pay_bank} | UPI: ${e.pay_upi} | Adv: ${e.pay_advance} | Bal: ${e.pay_balance} | Mode: ${e.pay_mode} | Source: ${e.source_category}`);
  }
  console.log('RCE Aggregates:', { rceTotal, rceCash, rceBank, rceUpi, rceCard, rceAdv });

  console.log('\n=== RESERVATIONS ===');
  let resvTotal = 0, resvAdv = 0;
  for (const r of resvs) {
    resvTotal += Number(r.total_amount || 0);
    resvAdv += Number(r.advance_paid || 0);
    console.log(`Resv: ${r.guest_name} | Room: ${r.room_no} | Status: ${r.status} | CheckIn: ${r.check_in_date} | CheckOut: ${r.check_out_date} | Rate: ${r.rate} | Total: ${r.total_amount} | Adv: ${r.advance_paid} | Mode: ${r.payment_mode} | Source: ${r.source_name} (${r.source_category}) | LinkedEntry: ${r.room_chart_entry_id}`);
  }
  console.log('Resv Aggregates:', { resvTotal, resvAdv });
}
main();
