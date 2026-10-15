import dotenv from 'dotenv';
dotenv.config();

import { supabaseServiceRole } from '../server/supabaseClient.js';

async function checkRoomChart() {
  const { data: allChart, error } = await supabaseServiceRole
    .from('room_chart_entries')
    .select('id, report_date, room_no, guest_name, pay_cash, pay_bank, pay_card, pay_upi, total, room_rate')
    .eq('hotel_id', 'bd8f18de-2f97-48e7-b029-d2e536feb7cb')
    .order('report_date', { ascending: true });

  console.log(`Total room_chart_entries for Hotel Gopal: ${allChart?.length || 0}`);
  const dateCounts = {};
  for (const c of allChart || []) {
    dateCounts[c.report_date] = (dateCounts[c.report_date] || 0) + 1;
  }
  console.log('Date distribution in room_chart_entries:', dateCounts);

  // Check 2026-10-02 chart entries if any
  const oct2 = (allChart || []).filter(c => c.report_date === '2026-10-02');
  console.log(`2026-10-02 entries: ${oct2.length}`);
  let oct2Cash = 0, oct2Bank = 0, oct2Card = 0;
  for (const c of oct2) {
    oct2Cash += Number(c.pay_cash || 0);
    oct2Bank += Number(c.pay_bank || 0);
    oct2Card += Number(c.pay_card || 0);
  }
  console.log(`2026-10-02 totals: Cash: ${oct2Cash}, Bank: ${oct2Bank}, Card: ${oct2Card}`);
}

checkRoomChart().catch(console.error);
