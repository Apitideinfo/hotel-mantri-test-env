import { supabaseServiceRole } from '../server/supabaseClient.js';

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c';

async function main() {
  const [entriesRes, resvsRes] = await Promise.all([
    supabaseServiceRole.from('room_chart_entries').select('*').eq('hotel_id', HOTEL_ID),
    supabaseServiceRole.from('reservations').select('*').eq('hotel_id', HOTEL_ID),
  ]);

  const entries = entriesRes.data || [];
  const resvs = resvsRes.data || [];

  console.log('=== INVESTIGATING THE 10 RECORDS MAKING UP ₹29,547 PENDING ===\n');

  // The 3 entries:
  // 1. Mr Ritik Gohil (Room 206)
  // 2. Room 103 (2026-08-31 -> 2026-09-02)
  // 3. Room 201 (2026-08-31 -> 2026-09-02)
  console.log('--- 3 ROOM CHART ENTRIES ---');
  for (const e of entries) {
    if (e.room_no === '206' || (['103', '201'].includes(e.room_no) && e.report_date === '2026-09-01')) {
      console.log('Entry:', {
        id: e.id,
        guest_name: e.guest_name,
        room_no: e.room_no,
        arrival: e.arrival,
        departure: e.departure,
        report_date: e.report_date,
        total: e.total,
        pay_cash: e.pay_cash,
        pay_bank: e.pay_bank,
        pay_advance: e.pay_advance,
        pay_balance: e.pay_balance,
        reservation_id: e.reservation_id,
      });
    }
  }

  // The 7 reservations:
  // Santosh Kumar (2551.5), Santosh Kumar (4252.5), Lalansingh Yadav (5103),
  // Rajyasreepriya Narayanan (2551.5), Chavda Niruba (2551.5), kumud Kumar Sahu (4158), Durga Prasad (2079)
  console.log('\n--- 7 SYNTHESIZED RESERVATIONS ---');
  const targetGuests = ['Santosh Kumar', 'Lalansingh Yadav', 'Rajyasreepriya Narayanan', 'Chavda Niruba', 'kumud Kumar Sahu', 'Durga Prasad'];
  for (const r of resvs) {
    if (targetGuests.some(g => r.guest_name?.includes(g))) {
      console.log('Resv:', {
        id: r.id,
        guest_name: r.guest_name,
        room_no: r.room_no,
        check_in_date: r.check_in_date,
        check_out_date: r.check_out_date,
        status: r.status,
        rate: r.rate,
        nights: r.nights,
        invoice_total: r.invoice_total,
        advance_paid: r.advance_paid,
        source_category: r.source_category,
        payment_mode: r.payment_mode,
        pay_cash: r.pay_cash,
        pay_bank: r.pay_bank,
        room_chart_entry_id: r.room_chart_entry_id,
      });
    }
  }
}

main();
