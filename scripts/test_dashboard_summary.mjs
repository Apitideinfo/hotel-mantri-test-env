import { supabaseServiceRole } from '../server/supabaseClient.js';

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c';

async function main() {
  const todayStr = '2026-09-15';
  console.log('Today:', todayStr);

  const { data: entries } = await supabaseServiceRole
    .from('room_chart_entries')
    .select('*')
    .eq('hotel_id', HOTEL_ID);

  const { data: resvs } = await supabaseServiceRole
    .from('reservations')
    .select('*')
    .eq('hotel_id', HOTEL_ID);

  console.log('Entries total:', entries?.length);
  console.log('Resvs total:', resvs?.length);

  // Check September entries
  const septEntries = (entries || []).filter(e => (e.arrival || e.report_date).startsWith('2026-09') || (e.departure && e.departure >= '2026-09-01'));
  console.log('Sept entries:', septEntries.length);

  // Check September reservations
  const septResvs = (resvs || []).filter(r => (r.check_in_date || '').startsWith('2026-09') || (r.check_out_date && r.check_out_date >= '2026-09-01'));
  console.log('Sept resvs:', septResvs.length);
  for (const r of septResvs) {
    console.log(`- Resv: ${r.room_no} | ${r.guest_name} | status: ${r.status} | ${r.check_in_date} -> ${r.check_out_date} | rate: ${r.rate} | inv: ${r.invoice_total}`);
  }
}
main().catch(console.error);
