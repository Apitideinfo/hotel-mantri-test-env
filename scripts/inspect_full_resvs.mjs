import dotenv from 'dotenv';
dotenv.config();

import { supabaseServiceRole } from '../server/supabaseClient.js';

async function inspectFullReservations() {
  const { data: resvs } = await supabaseServiceRole
    .from('reservations')
    .select('*')
    .eq('hotel_id', 'bd8f18de-2f97-48e7-b029-d2e536feb7cb')
    .lte('check_in_date', '2026-10-01')
    .gte('check_out_date', '2026-10-01');

  console.log(`Found ${resvs?.length || 0} reservations.`);
  for (const r of resvs || []) {
    console.log({
      id: r.id.slice(0, 8),
      room_no: r.room_no,
      guest_name: r.guest_name,
      rate: r.rate,
      invoice_total: r.invoice_total,
      advance_paid: r.advance_paid,
      pay_cash: r.pay_cash,
      pay_bank: r.pay_bank,
      pay_upi: r.pay_upi,
      pay_card: r.pay_card,
      payment_mode: r.payment_mode,
      group_id: r.group_id,
      parent_reservation_id: r.parent_reservation_id,
      room_chart_entry_id: r.room_chart_entry_id,
      status: r.status,
    });
  }
}

inspectFullReservations().catch(console.error);
