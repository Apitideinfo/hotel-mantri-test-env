import dotenv from 'dotenv';
dotenv.config();

import { supabaseServiceRole } from '../server/supabaseClient.js';
import RevenueCalculationService from '../server/services/RevenueCalculationService.js';

const HOTEL_ID = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb'; // Hotel Gopal
const DATE = '2026-10-01';

async function inspect() {
  console.log(`=== INSPECTING HOTEL GOPAL FOR DATE: ${DATE} ===\n`);

  // 1. RevenueCalculationService
  console.log('--- 1. RevenueCalculationService.calculateDayWiseRevenue ---');
  try {
    const rev = await RevenueCalculationService.calculateDayWiseRevenue({
      hotelId: HOTEL_ID,
      startDate: DATE,
      endDate: DATE,
    });
    console.log('Summary:', JSON.stringify(rev.summary, null, 2));
    if (rev.days?.[0]) {
      console.log('Day 0 Collections Breakup:', JSON.stringify(rev.days[0].collections, null, 2));
      console.log('Day 0 Metrics:', {
        roomRevenue: rev.days[0].roomRevenue,
        totalIncome: rev.days[0].totalIncome,
        totalCollections: rev.days[0].totalCollections,
      });
    }
  } catch (err) {
    console.error('RevenueCalculationService error:', err);
  }

  // 2. Room Chart Entries on 2026-10-01
  console.log('\n--- 2. room_chart_entries on 2026-10-01 ---');
  const { data: chartEntries, error: cErr } = await supabaseServiceRole
    .from('room_chart_entries')
    .select('*')
    .eq('hotel_id', HOTEL_ID)
    .eq('report_date', DATE);

  console.log(`Found ${chartEntries?.length || 0} room chart entries.`);
  let totalChartRev = 0;
  let chartCash = 0;
  let chartBank = 0;
  let chartCard = 0;
  let chartUpi = 0;
  for (const e of chartEntries || []) {
    totalChartRev += Number(e.room_rate || 0);
    chartCash += Number(e.pay_cash || 0);
    chartBank += Number(e.pay_bank || 0);
    chartCard += Number(e.pay_card || 0);
    chartUpi += Number(e.pay_upi || 0);
    console.log(`  Room ${e.room_no}: Guest "${e.guest_name}", Rate: ${e.room_rate}, pay_cash: ${e.pay_cash}, pay_bank: ${e.pay_bank}, pay_card: ${e.pay_card}, pay_upi: ${e.pay_upi}, source: "${e.source_name || e.booking_source}"`);
  }
  console.log(`Chart Totals -> Revenue: ${totalChartRev}, Cash: ${chartCash}, Bank: ${chartBank}, Card: ${chartCard}, UPI: ${chartUpi}`);

  // 3. Reservations active on 2026-10-01 (check_in <= 2026-10-01 and check_out > 2026-10-01, or created on 2026-10-01)
  console.log('\n--- 3. reservations on/touching 2026-10-01 ---');
  const { data: resvs } = await supabaseServiceRole
    .from('reservations')
    .select('*')
    .eq('hotel_id', HOTEL_ID)
    .lte('check_in_date', DATE)
    .gte('check_out_date', DATE);

  console.log(`Found ${resvs?.length || 0} reservations touching 2026-10-01.`);
  for (const r of resvs || []) {
    console.log(`  Res ${r.id.slice(0, 8)}: Room: ${r.room_no}, Guest: "${r.guest_name}", Dates: ${r.check_in_date} -> ${r.check_out_date}, Rate: ${r.rate}, Total: ${r.invoice_total}, Advance: ${r.advance_paid}, PayMode: "${r.payment_mode}", Status: ${r.status}, Source: "${r.source_name}"`);
  }

  // 4. Booking Timeline events on 2026-10-01
  console.log('\n--- 4. booking_timeline events on 2026-10-01 ---');
  const { data: timeline } = await supabaseServiceRole
    .from('booking_timeline')
    .select('*')
    .eq('hotel_id', HOTEL_ID)
    .gte('created_at', `${DATE}T00:00:00`)
    .lte('created_at', `${DATE}T23:59:59.999Z`);

  console.log(`Found ${timeline?.length || 0} timeline events on 2026-10-01.`);
  for (const t of timeline || []) {
    console.log(`  Timeline ${t.id.slice(0, 8)}: Event: ${t.event_type}, Amount: ${t.event_amount}, Mode: "${t.payment_mode}", Desc: "${t.event_description}", Time: ${t.created_at}`);
  }

  // 5. Check all booking_timeline events with date or created_at matching DATE
  const { data: allTimelineForHotel } = await supabaseServiceRole
    .from('booking_timeline')
    .select('*')
    .eq('hotel_id', HOTEL_ID);

  console.log(`\nTotal timeline events for hotel: ${allTimelineForHotel?.length || 0}`);
  const matchingDateEvents = (allTimelineForHotel || []).filter(e => {
    return (e.created_at && e.created_at.startsWith(DATE)) ||
           (e.event_description && e.event_description.includes(DATE)) ||
           (e.metadata && JSON.stringify(e.metadata).includes(DATE));
  });
  console.log(`Matching timeline events: ${matchingDateEvents.length}`);

  // 6. other_entries / day_closing on 2026-10-01
  console.log('\n--- 6. other_entries / day_closing on 2026-10-01 ---');
  const { data: otherEntries } = await supabaseServiceRole
    .from('other_entries')
    .select('*')
    .eq('hotel_id', HOTEL_ID)
    .eq('report_date', DATE);

  console.log('other_entries:', JSON.stringify(otherEntries, null, 2));

  // Check day closing table if exists
  const { data: dayClosing, error: dcErr } = await supabaseServiceRole
    .from('day_closings')
    .select('*')
    .eq('hotel_id', HOTEL_ID)
    .eq('closing_date', DATE);
  if (!dcErr) {
    console.log('day_closings:', JSON.stringify(dayClosing, null, 2));
  } else {
    console.log('day_closings query error / table not found:', dcErr.message);
  }

  // 7. Check expenses on 2026-10-01
  const { data: expenses } = await supabaseServiceRole
    .from('expenses')
    .select('*')
    .eq('hotel_id', HOTEL_ID)
    .eq('expense_date', DATE);
  console.log(`\nFound ${expenses?.length || 0} expenses on 2026-10-01:`, JSON.stringify(expenses, null, 2));
}

inspect().catch(console.error);
