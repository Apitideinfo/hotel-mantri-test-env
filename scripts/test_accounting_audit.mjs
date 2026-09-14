import { supabaseServiceRole } from '../server/supabaseClient.js';
const toNum = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

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

  console.log('--- REVENUE VS COLLECTION SUMMARY ---');

  // Entries
  let cash = 0;
  let bank = 0;
  let roomRev = 0;
  let unpaid = 0;

  for (const e of entries) {
    roomRev += toNum(e.total);
    cash += toNum(e.pay_cash);
    bank += toNum(e.pay_bank) + toNum(e.pay_upi) + toNum(e.pay_card);
    if (e.pay_mode === 'Bank' && toNum(e.pay_advance) > 0 && toNum(e.pay_bank) === 0) {
      bank += toNum(e.pay_advance);
    }
  }

  // Linked vs unlinked
  const linkedResvIds = new Set(entries.map(e => e.reservation_id).filter(Boolean));
  for (const r of resvs) {
    if (linkedResvIds.has(r.id)) continue;
    const inv = toNum(r.invoice_total) || (toNum(r.rate) * (r.nights || 1));
    const isOta = r.source_category === 'OTA' || r.payment_mode === 'OTA';
    const adv = toNum(r.advance_paid);

    roomRev += inv;
    cash += toNum(r.pay_cash);
    if (isOta && adv > 0) {
      bank += adv;
    } else {
      bank += toNum(r.pay_bank) + toNum(r.pay_upi) + toNum(r.pay_card);
    }
    const bal = Math.max(0, inv - (toNum(r.pay_cash) + toNum(r.pay_bank) + adv));
    unpaid += bal;
  }

  console.log(`Total Income (Room Revenue): ₹${roomRev}`);
  console.log(`Cash Collection: ₹${cash}`);
  console.log(`Bank / OTA Collection: ₹${bank}`);
  console.log(`Total Collections: ₹${cash + bank}`);
  console.log(`Remaining Unpaid (Balance Due): ₹${unpaid}`);
}
main();
