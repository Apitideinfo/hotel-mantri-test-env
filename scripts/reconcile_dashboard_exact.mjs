import { supabaseServiceRole } from '../server/supabaseClient.js';

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c';

const toNum = (v) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const isStayOccupiedOnDate = (e, date) => {
  const arr = (e.arrival && e.arrival.trim() !== '' ? e.arrival : e.report_date).slice(0, 10);
  const dep = (e.departure && e.departure.trim() !== '' ? e.departure : e.report_date).slice(0, 10);
  if (arr >= dep) {
    return arr === date;
  }
  return arr <= date && dep > date;
};

const calcStayNights = (arrival, departure) => {
  if (!arrival || !departure) return 1;
  const [y1, m1, d1] = arrival.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = departure.slice(0, 10).split('-').map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 1;
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  const diffDays = Math.round((utc2 - utc1) / 86400000);
  return diffDays > 0 ? diffDays : 1;
};

async function main() {
  const now = new Date('2026-09-15T12:00:00Z'); // simulate current time / date
  const year = 2026;
  const month = 9;
  const todayStr = '2026-09-15';
  const monthStart = '2026-09-01';
  const lastDay = 30;
  const monthEnd = '2026-09-30';

  console.log('Fetching data for Hotel Gopal:', HOTEL_ID);

  const [entriesRes, resvsRes, closeRecordsRes, otherEntriesRes] = await Promise.all([
    supabaseServiceRole.from('room_chart_entries')
      .select('*')
      .eq('hotel_id', HOTEL_ID),
    supabaseServiceRole.from('reservations')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .in('status', ['confirmed', 'checked_in'])
      .lte('check_in_date', monthEnd)
      .gte('check_out_date', monthStart),
    supabaseServiceRole.from('day_close_records')
      .select('business_date, status')
      .eq('hotel_id', HOTEL_ID)
      .eq('status', 'closed')
      .gte('business_date', monthStart)
      .lte('business_date', todayStr),
    supabaseServiceRole.from('other_daily_entries')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .gte('report_date', monthStart)
      .lte('report_date', monthEnd),
  ]);

  const entries = entriesRes.data || [];
  const monthReservations = resvsRes.data || [];
  const closedRecords = closeRecordsRes.data || [];
  const otherEntries = otherEntriesRes.data || [];

  console.log(`Loaded: ${entries.length} room_chart_entries, ${monthReservations.length} month reservations, ${closedRecords.length} day_close_records`);

  // Trace unlinked reservations synthesis exactly as in api.ts
  const linkedResvIds = new Set(entries.map(e => e.reservation_id).filter(Boolean));
  const linkedEntryIds = new Set(monthReservations.map(r => r.room_chart_entry_id).filter(Boolean));
  const unlinkedResvs = monthReservations.filter(r => !linkedResvIds.has(r.id) && (!r.room_chart_entry_id || !linkedEntryIds.has(r.room_chart_entry_id)));

  console.log(`Unlinked reservations synthesized: ${unlinkedResvs.length}`);

  const synthesizedEntries = unlinkedResvs.map(r => {
    const ci = (r.check_in_date ?? '').slice(0, 10);
    const co = (r.check_out_date ?? '').slice(0, 10);
    const n = Math.max(1, toNum(r.nights) || calcStayNights(ci, co));
    const rate = toNum(r.rate);
    const invTotal = toNum(r.invoice_total) || (rate * n);
    return {
      id: r.id,
      hotel_id: r.hotel_id,
      report_date: ci,
      room_no: r.room_no || 'TBD',
      guest_name: r.guest_name,
      arrival: ci,
      departure: co,
      nights: n,
      room_rate: rate,
      total: invTotal,
      company: r.source_name || '',
      source_category: r.source_category || 'Direct/Walking',
      pay_mode: r.payment_mode || 'Cash',
      description: '',
      is_complimentary: false,
      meal_plan: r.meal_plan || 'EP',
      gst_mode: 'Exclusive',
      gst_type: r.gst_type || 'No Scope',
      gst_slab: r.gst_slab || 0,
      gst_amount: toNum(r.gst_amount),
      taxable_amount: toNum(r.taxable_amount),
      invoice_total: invTotal,
      revenue_category: 'Room Revenue',
      remarks: r.remarks || '',
      created_by: r.created_by ?? '',
      business_date: ci,
      room_category: 'Standard',
      pay_cash: (() => {
        const adv = toNum(r.advance_paid);
        const pc = toNum(r.pay_cash);
        if (pc > 0) return pc;
        if (adv > 0 && r.payment_mode === 'Cash') return adv;
        return 0;
      })(),
      pay_upi: toNum(r.pay_upi),
      pay_card: toNum(r.pay_card),
      pay_bank: (() => {
        const adv = toNum(r.advance_paid);
        const pb = toNum(r.pay_bank);
        if (pb > 0) return pb;
        const isOtaOrBank = r.source_category === 'OTA' || r.payment_mode === 'OTA' || r.payment_mode === 'Bank';
        if (adv > 0 && isOtaOrBank) return adv;
        return 0;
      })(),
      pay_advance: toNum(r.advance_paid),
      pay_balance: Math.max(0, invTotal - toNum(r.advance_paid)),
      reservation_id: r.id,
      isSynthesized: true,
    };
  });

  const combinedEntries = [...entries, ...synthesizedEntries];

  // Now simulate daily derived reports for day 1 to 30
  const reports = [];
  for (let day = 1; day <= lastDay; day++) {
    const d = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEntries = combinedEntries.filter(e => isStayOccupiedOnDate(e, d) || e.report_date === d);
    if (dayEntries.length === 0) continue;

    // aggregateRoomChart for date d
    let roomsOccupied = 0, complimentary = 0, roomRevenue = 0;
    let payCash = 0, payUpi = 0, payCard = 0, payBank = 0, payAdvance = 0, payBalance = 0;
    let cash = 0, bank = 0;

    for (const e of dayEntries) {
      const isOccupied = isStayOccupiedOnDate(e, d);
      const isPaymentDay = ((e.report_date && e.report_date === d) || (!e.report_date && (e.arrival || '').slice(0, 10) === d));

      if (isOccupied) {
        const nightsCount = Math.max(1, toNum(e.nights) || 1);
        const nightlyRate = nightsCount > 1
          ? (toNum(e.room_rate) > 0 ? toNum(e.room_rate) : (toNum(e.total) / nightsCount))
          : (toNum(e.room_rate) > 0 ? toNum(e.room_rate) : toNum(e.total));
        if (e.is_complimentary) {
          complimentary++;
        } else {
          roomsOccupied++;
          roomRevenue += nightlyRate;
        }
      }

      if (isPaymentDay) {
        let cashAmt = toNum(e.pay_cash);
        let upiAmt = toNum(e.pay_upi);
        let cardAmt = toNum(e.pay_card);
        let bankAmt = toNum(e.pay_bank);
        const advAmt = toNum(e.pay_advance);
        if (advAmt > 0 && cashAmt === 0 && bankAmt === 0 && upiAmt === 0 && cardAmt === 0) {
          const mode = e.pay_mode || '';
          if (mode === 'Cash') cashAmt = advAmt;
          else if (mode === 'UPI') upiAmt = advAmt;
          else if (mode === 'Card') cardAmt = advAmt;
          else bankAmt = advAmt;
        }
        payCash += cashAmt;
        payUpi += upiAmt;
        payCard += cardAmt;
        payBank += bankAmt;
        payAdvance += advAmt;
        payBalance += toNum(e.pay_balance);
        if (!e.is_complimentary) {
          cash += cashAmt;
          bank += upiAmt + cardAmt + bankAmt;
        }
      }
    }

    reports.push({
      report_date: d,
      rooms_occupied: roomsOccupied + complimentary,
      room_sale_amount: roomRevenue,
      pay_cash: payCash,
      pay_upi: payUpi,
      pay_card: payCard,
      pay_bank: payBank,
      pay_advance: payAdvance,
      pay_balance: payBalance,
      cash,
      bank,
      dayEntriesCount: dayEntries.length,
    });
  }

  console.log(`Generated ${reports.length} daily reports.`);

  // Now aggregate MTD reports (where report_date <= todayStr since closedRecords.length === 0)
  const mtdReportsToUse = reports.filter(r => r.report_date <= todayStr);
  console.log(`MTD reports to use (<= ${todayStr}): ${mtdReportsToUse.length}`);

  let totalRoomRevenue = 0;
  let totalPayCash = 0;
  let totalPayBank = 0;
  let totalPayUpi = 0;
  let totalPayCard = 0;
  let totalPayAdvance = 0;
  let totalPayBalance = 0;
  let totalCash = 0;
  let totalBank = 0;

  for (const r of mtdReportsToUse) {
    totalRoomRevenue += r.room_sale_amount;
    totalPayCash += r.pay_cash;
    totalPayBank += r.pay_bank;
    totalPayUpi += r.pay_upi;
    totalPayCard += r.pay_card;
    totalPayAdvance += r.pay_advance;
    totalPayBalance += r.pay_balance;
    totalCash += r.cash;
    totalBank += r.bank;
  }

  console.log('\n=== RECONCILED DASHBOARD METRICS ===');
  console.log('Total Room Revenue (Total Income):', totalRoomRevenue);
  console.log('Total Cash (pay_cash):', totalPayCash);
  console.log('Total Bank (pay_bank):', totalPayBank);
  console.log('Total UPI (pay_upi):', totalPayUpi);
  console.log('Total Card (pay_card):', totalPayCard);
  console.log('Bank / OTA (pay_bank + pay_upi + pay_card):', totalPayBank + totalPayUpi + totalPayCard);
  console.log('Total Collection (Cash + Bank + UPI + Card):', totalPayCash + totalPayBank + totalPayUpi + totalPayCard);
  console.log('Pending / Due at Checkout (pay_balance):', totalPayBalance);
  console.log('Sum of Collection + Pending:', (totalPayCash + totalPayBank + totalPayUpi + totalPayCard) + totalPayBalance);
}

main();
