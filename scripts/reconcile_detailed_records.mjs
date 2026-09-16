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
  const todayStr = '2026-09-15';
  const monthStart = '2026-09-01';
  const monthEnd = '2026-09-30';

  const [entriesRes, resvsRes] = await Promise.all([
    supabaseServiceRole.from('room_chart_entries').select('*').eq('hotel_id', HOTEL_ID),
    supabaseServiceRole.from('reservations').select('*').eq('hotel_id', HOTEL_ID).in('status', ['confirmed', 'checked_in']).lte('check_in_date', monthEnd).gte('check_out_date', monthStart),
  ]);

  const entries = entriesRes.data || [];
  const monthReservations = resvsRes.data || [];

  const linkedResvIds = new Set(entries.map(e => e.reservation_id).filter(Boolean));
  const linkedEntryIds = new Set(monthReservations.map(r => r.room_chart_entry_id).filter(Boolean));
  const unlinkedResvs = monthReservations.filter(r => !linkedResvIds.has(r.id) && (!r.room_chart_entry_id || !linkedEntryIds.has(r.room_chart_entry_id)));

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
      is_complimentary: false,
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
      type: 'synthesized_reservation',
    };
  });

  const combined = [
    ...entries.map(e => ({ ...e, type: 'room_chart_entry' })),
    ...synthesizedEntries,
  ];

  console.log('\n--- ALL COMBINED RECORDS (SEPTEMBER MTD ELIGIBLE) ---');
  // For each record, let's trace:
  // 1. How much revenue it recognized between Sept 1 and Sept 15
  // 2. What date payment was posted (report_date) and how much
  // 3. What pay_balance is and when it posted

  const items = [];

  for (const e of combined) {
    const arr = (e.arrival && e.arrival.trim() !== '' ? e.arrival : e.report_date).slice(0, 10);
    const dep = (e.departure && e.departure.trim() !== '' ? e.departure : e.report_date).slice(0, 10);
    const repDate = (e.report_date || arr).slice(0, 10);

    // Calculate nights occupied in Sept 1..15
    let occupiedNightsInMtd = 0;
    const occupiedDates = [];
    for (let d = 1; d <= 15; d++) {
      const curDate = `2026-09-${String(d).padStart(2, '0')}`;
      if (isStayOccupiedOnDate(e, curDate)) {
        occupiedNightsInMtd++;
        occupiedDates.push(curDate);
      }
    }

    const nightsCount = Math.max(1, toNum(e.nights) || 1);
    const nightlyRate = nightsCount > 1
      ? (toNum(e.room_rate) > 0 ? toNum(e.room_rate) : (toNum(e.total) / nightsCount))
      : (toNum(e.room_rate) > 0 ? toNum(e.room_rate) : toNum(e.total));

    const mtdRevenueRecognized = e.is_complimentary ? 0 : (nightlyRate * occupiedNightsInMtd);

    // Payment posted in MTD?
    // In getDerivedReportsForMonth:
    // for day in 1..lastDay: if dayEntries.filter(... isStayOccupiedOnDate || report_date === d)
    // and isPaymentDay: if repDate === d (where repDate <= 2026-09-15)
    let paymentPostedInMtd = false;
    if (repDate >= '2026-09-01' && repDate <= '2026-09-15') {
      paymentPostedInMtd = true;
    }

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

    const mtdCash = paymentPostedInMtd ? cashAmt : 0;
    const mtdBank = paymentPostedInMtd ? (bankAmt + upiAmt + cardAmt) : 0;
    const mtdCollection = mtdCash + mtdBank;
    const mtdPending = paymentPostedInMtd ? toNum(e.pay_balance) : 0;

    items.push({
      id: e.id,
      guest_name: e.guest_name,
      room_no: e.room_no,
      arrival: arr,
      departure: dep,
      report_date: repDate,
      total: toNum(e.total),
      nightlyRate,
      nights: nightsCount,
      occupiedDates,
      mtdRevenueRecognized,
      paymentPostedInMtd,
      mtdCash,
      mtdBank,
      mtdCollection,
      mtdPending,
      type: e.type,
      pay_mode: e.pay_mode,
      source_category: e.source_category,
    });
  }

  // Print table
  console.log('Record details:');
  for (const it of items) {
    if (it.mtdRevenueRecognized > 0 || it.mtdCollection > 0 || it.mtdPending > 0) {
      console.log(
        `[${it.type === 'room_chart_entry' ? 'ENTRY' : 'RESV'}] ${it.guest_name.padEnd(25)} | Room: ${it.room_no.padEnd(4)} | ` +
        `Stay: ${it.arrival} -> ${it.departure} | RepDate: ${it.report_date} | Total: ${it.total} | ` +
        `Rev: ${it.mtdRevenueRecognized} | Cash: ${it.mtdCash} | Bank: ${it.mtdBank} | Coll: ${it.mtdCollection} | Pend: ${it.mtdPending}`
      );
    }
  }

  const aggRev = items.reduce((s, it) => s + it.mtdRevenueRecognized, 0);
  const aggCash = items.reduce((s, it) => s + it.mtdCash, 0);
  const aggBank = items.reduce((s, it) => s + it.mtdBank, 0);
  const aggColl = items.reduce((s, it) => s + it.mtdCollection, 0);
  const aggPend = items.reduce((s, it) => s + it.mtdPending, 0);

  console.log('\n--- AGGREGATE SUMMARY ---');
  console.log('Agg Revenue:', aggRev);
  console.log('Agg Cash:', aggCash);
  console.log('Agg Bank:', aggBank);
  console.log('Agg Collection:', aggColl);
  console.log('Agg Pending:', aggPend);
  console.log('Agg Coll + Pend:', aggColl + aggPend);
  console.log('Difference (Revenue - Collection):', aggRev - aggColl);
}

main();
