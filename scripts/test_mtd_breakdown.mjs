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

  console.log('=== MTD (SEPT 1 TO SEPT 15) BREAKDOWN ===');

  let mtdIncome = 0;
  let mtdCash = 0;
  let mtdBank = 0;
  let mtdOtaAdv = 0;
  let mtdUnpaid = 0;

  // September entries
  for (const e of entries) {
    const rep = e.report_date || e.arrival;
    if (rep >= '2026-09-01' && rep <= '2026-09-15') {
      mtdIncome += toNum(e.total);
      mtdCash += toNum(e.pay_cash);
      mtdBank += toNum(e.pay_bank) + toNum(e.pay_upi) + toNum(e.pay_card);
      console.log(`[Entry] ${e.guest_name} (Rm ${e.room_no}) | Date: ${rep} | Total: ₹${e.total} | Cash: ₹${e.pay_cash} | Bank: ₹${e.pay_bank} | Adv: ₹${e.pay_advance}`);
    }
  }

  // Linked reservations
  const linkedResvIds = new Set(entries.map(e => e.reservation_id).filter(Boolean));
  for (const r of resvs) {
    if (linkedResvIds.has(r.id)) continue;
    const ci = r.check_in_date;
    if (ci >= '2026-09-01' && ci <= '2026-09-15') {
      const inv = toNum(r.invoice_total) || (toNum(r.rate) * (r.nights || 1));
      mtdIncome += inv;
      const isOta = r.source_category === 'OTA' || r.payment_mode === 'OTA';
      const adv = toNum(r.advance_paid);
      if (isOta && adv > 0) {
        mtdOtaAdv += adv;
      }
      const paid = toNum(r.pay_cash) + toNum(r.pay_bank) + adv;
      const bal = Math.max(0, inv - paid);
      mtdUnpaid += bal;
      console.log(`[Resv] ${r.guest_name} (Rm ${r.room_no}) | In: ${ci} | Total: ₹${inv} | OTA Adv: ₹${isOta ? adv : 0} | Bal Due: ₹${bal}`);
    }
  }

  console.log('\n--- MTD TOTALS ---');
  console.log(`Total Income: ₹${mtdIncome}`);
  console.log(`Direct Cash Logged: ₹${mtdCash}`);
  console.log(`Direct Bank Logged: ₹${mtdBank}`);
  console.log(`Direct Cash + Bank in DB: ₹${mtdCash + mtdBank}`);
  console.log(`Prepaid OTA Advances (MakeMyTrip, Agoda, etc.): ₹${mtdOtaAdv}`);
  console.log(`Total Collections (Cash + Bank + OTA Advances): ₹${mtdCash + mtdBank + mtdOtaAdv}`);
  console.log(`Unpaid / Pending Balances: ₹${mtdUnpaid}`);
}
main();
