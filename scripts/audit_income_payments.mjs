import { supabaseServiceRole } from '../server/supabaseClient.js';

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c';

async function main() {
  console.log('=== BREAKDOWN OF HOTEL GOPAL INCOME VS PAYMENTS ===');

  const { data: entries } = await supabaseServiceRole
    .from('room_chart_entries')
    .select('*')
    .eq('hotel_id', HOTEL_ID);

  const { data: resvs } = await supabaseServiceRole
    .from('reservations')
    .select('*')
    .eq('hotel_id', HOTEL_ID)
    .in('status', ['confirmed', 'checked_in']);

  console.log('--- ROOM CHART ENTRIES ---');
  let entryTotal = 0;
  let entryCash = 0, entryBank = 0, entryUpi = 0, entryCard = 0, entryAdv = 0;
  for (const e of entries) {
    entryTotal += (e.total || 0);
    entryCash += (e.pay_cash || 0);
    entryBank += (e.pay_bank || 0);
    entryUpi += (e.pay_upi || 0);
    entryCard += (e.pay_card || 0);
    entryAdv += (e.pay_advance || 0);
    console.log(`Entry: ${e.guest_name || 'No Name'} (Room ${e.room_no}) | Total: ₹${e.total} | Mode: ${e.pay_mode} | Cash: ${e.pay_cash}, Bank: ${e.pay_bank}, UPI: ${e.pay_upi}, Card: ${e.pay_card}, Adv: ${e.pay_advance}`);
  }
  console.log(`\nEntries Sum Total: ₹${entryTotal}`);
  console.log(`Entries Sum Payments: Cash=₹${entryCash}, Bank=₹${entryBank}, UPI=₹${entryUpi}, Card=₹${entryCard}, Adv=₹${entryAdv}\n`);

  console.log('--- RESERVATIONS (Confirmed / Checked In) ---');
  let resvTotal = 0;
  let resvAdv = 0, resvCash = 0, resvBank = 0, resvUpi = 0, resvCard = 0;
  for (const r of resvs) {
    const inv = r.invoice_total || (r.rate * (r.nights || 1));
    resvTotal += inv;
    resvAdv += (r.advance_paid || 0);
    resvCash += (r.pay_cash || 0);
    resvBank += (r.pay_bank || 0);
    resvUpi += (r.pay_upi || 0);
    resvCard += (r.pay_card || 0);
    console.log(`Resv: ${r.guest_name} (Room ${r.room_no}) | Inv: ₹${inv} | AdvPaid: ₹${r.advance_paid} | Cash: ${r.pay_cash}, Bank: ${r.pay_bank}, UPI: ${r.pay_upi}, Mode: ${r.payment_mode}, Status: ${r.status}`);
  }
  console.log(`\nReservations Sum Total: ₹${resvTotal}`);
  console.log(`Reservations Sum Payments: Adv=₹${resvAdv}, Cash=₹${resvCash}, Bank=₹${resvBank}, UPI=₹${resvUpi}`);
}
main();
