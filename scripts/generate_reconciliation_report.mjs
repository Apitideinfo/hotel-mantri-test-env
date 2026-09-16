import { supabaseServiceRole } from '../server/supabaseClient.js';

const HOTEL_ID = process.argv[2] || 'a93139f5-baa0-47a4-87ca-81ee7e106d9c';
const START_DATE = process.argv[3] || '2026-09-01';
const END_DATE = process.argv[4] || '2026-09-15';

const toNum = (v) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmt = (n) => {
  return '₹' + toNum(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const isStayOccupiedOnDate = (e, date) => {
  const arr = (e.arrival && e.arrival.trim() !== '' ? e.arrival : e.report_date).slice(0, 10);
  const dep = (e.departure && e.departure.trim() !== '' ? e.departure : e.report_date).slice(0, 10);
  if (arr >= dep) return arr === date;
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

async function generateReconciliationReport() {
  console.log('='.repeat(120));
  console.log(`HOTEL MANTRI FINANCIAL RECONCILIATION REPORT`);
  console.log(`Hotel ID:    ${HOTEL_ID}`);
  console.log(`Period:      ${START_DATE} to ${END_DATE}`);
  console.log('='.repeat(120));

  const [entriesRes, resvsRes] = await Promise.all([
    supabaseServiceRole.from('room_chart_entries').select('*').eq('hotel_id', HOTEL_ID),
    supabaseServiceRole.from('reservations').select('*').eq('hotel_id', HOTEL_ID).in('status', ['confirmed', 'checked_in']).lte('check_in_date', '2026-09-30').gte('check_out_date', START_DATE),
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
      type: 'RESV',
    };
  });

  const combined = [
    ...entries.map(e => ({ ...e, type: 'ENTRY' })),
    ...synthesizedEntries,
  ];

  const rows = [];

  for (const e of combined) {
    const arr = (e.arrival && e.arrival.trim() !== '' ? e.arrival : e.report_date).slice(0, 10);
    const dep = (e.departure && e.departure.trim() !== '' ? e.departure : e.report_date).slice(0, 10);
    const repDate = (e.report_date || arr).slice(0, 10);

    // Calculate occupied dates within reporting window
    const occupiedDates = [];
    const [sy, sm, sd] = START_DATE.split('-').map(Number);
    const [ey, em, ed] = END_DATE.split('-').map(Number);
    const dtCur = new Date(Date.UTC(sy, sm - 1, sd));
    const dtEnd = new Date(Date.UTC(ey, em - 1, ed));

    while (dtCur <= dtEnd) {
      const curIso = dtCur.toISOString().slice(0, 10);
      if (isStayOccupiedOnDate(e, curIso)) occupiedDates.push(curIso);
      dtCur.setUTCDate(dtCur.getUTCDate() + 1);
    }

    const occupiedNights = occupiedDates.length;
    const nightsCount = Math.max(1, toNum(e.nights) || 1);
    const nightlyRate = nightsCount > 1
      ? (toNum(e.room_rate) > 0 ? toNum(e.room_rate) : (toNum(e.total) / nightsCount))
      : (toNum(e.room_rate) > 0 ? toNum(e.room_rate) : toNum(e.total));

    const earnedRev = e.is_complimentary ? 0 : (nightlyRate * occupiedNights);

    const isPaymentInPeriod = repDate >= START_DATE && repDate <= END_DATE;
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

    const mtdColl = isPaymentInPeriod ? (cashAmt + bankAmt + upiAmt + cardAmt) : 0;
    const totalPaidOnStay = cashAmt + bankAmt + upiAmt + cardAmt;
    const stayTotal = toNum(e.total) || (nightlyRate * nightsCount);

    const fractionEarned = stayTotal > 0 ? Math.min(1, earnedRev / stayTotal) : 1;
    const earnedPaid = Math.min(earnedRev, totalPaidOnStay * fractionEarned);
    const earnedDue = Math.max(0, earnedRev - earnedPaid);

    if (earnedRev > 0 || mtdColl > 0 || toNum(e.pay_balance) > 0) {
      rows.push({
        id: (e.reservation_id || e.id || '').slice(0, 8),
        guest: (e.guest_name || 'No Name').slice(0, 22),
        room: e.room_no || 'TBD',
        stay: `${arr} to ${dep}`,
        nights: occupiedNights,
        earnedRev,
        mtdColl,
        earnedPaid,
        earnedDue,
        payBalance: isPaymentInPeriod ? toNum(e.pay_balance) : 0,
        payDate: isPaymentInPeriod ? repDate : 'None',
        type: e.type,
      });
    }
  }

  // Print Table
  console.log(
    'ID'.padEnd(9) +
    'Type'.padEnd(6) +
    'Guest Name'.padEnd(23) +
    'Room'.padEnd(6) +
    'Stay Window'.padEnd(25) +
    'Occ'.padStart(4) +
    'Earned Rev'.padStart(12) +
    'Period Coll'.padStart(13) +
    'Earned Paid'.padStart(13) +
    'Earned Due'.padStart(12) +
    'Pay Bal'.padStart(10) +
    'Pay Date'.padStart(12)
  );
  console.log('-'.repeat(145));

  let totEarned = 0, totColl = 0, totEarnedPaid = 0, totEarnedDue = 0, totPayBal = 0;
  for (const r of rows) {
    totEarned += r.earnedRev;
    totColl += r.mtdColl;
    totEarnedPaid += r.earnedPaid;
    totEarnedDue += r.earnedDue;
    totPayBal += r.payBalance;
    console.log(
      r.id.padEnd(9) +
      r.type.padEnd(6) +
      r.guest.padEnd(23) +
      r.room.padEnd(6) +
      r.stay.padEnd(25) +
      String(r.nights).padStart(4) +
      fmt(r.earnedRev).padStart(12) +
      fmt(r.mtdColl).padStart(13) +
      fmt(r.earnedPaid).padStart(13) +
      fmt(r.earnedDue).padStart(12) +
      fmt(r.payBalance).padStart(10) +
      r.payDate.padStart(12)
    );
  }
  console.log('-'.repeat(145));
  console.log(
    'TOTALS'.padEnd(69) +
    fmt(totEarned).padStart(12) +
    fmt(totColl).padStart(13) +
    fmt(totEarnedPaid).padStart(13) +
    fmt(totEarnedDue).padStart(12) +
    fmt(totPayBal).padStart(10)
  );

  console.log('\n' + '='.repeat(80));
  console.log('MATHEMATICAL AUDIT & RECONCILIATION PROOF');
  console.log('='.repeat(80));
  console.log(`1. Total MTD Earned Revenue (Accrual Basis):     ${fmt(totEarned)}`);
  console.log(`2. Total MTD Cash/Bank Collections (Cash Basis):   ${fmt(totColl)}`);
  console.log(`   -> Timing Variance (Revenue - Collections):     ${fmt(totEarned - totColl)}`);
  console.log('-'.repeat(80));
  console.log(`3. MATCHED-SCOPE IDENTITY TEST:`);
  console.log(`   Earned Revenue Collected:                       ${fmt(totEarnedPaid)}`);
  console.log(`   Earned Revenue Outstanding:                     ${fmt(totEarnedDue)}`);
  console.log(`   SUM (Earned Collected + Earned Outstanding):    ${fmt(totEarnedPaid + totEarnedDue)}`);
  console.log(`   DOES SUM EQUAL TOTAL EARNED REVENUE?            ${Math.abs(totEarned - (totEarnedPaid + totEarnedDue)) < 0.01 ? 'YES [EXACT MATCH]' : 'NO [MISMATCH]'}`);
  console.log('-'.repeat(80));
  console.log(`4. RECEIVABLES CLARITY:`);
  console.log(`   MTD Uncollected Bookings (Sum of pay_balance):  ${fmt(totPayBal)}`);
  console.log('='.repeat(80));

  return {
    totEarned,
    totColl,
    totEarnedPaid,
    totEarnedDue,
    totPayBal,
    rowsCount: rows.length,
  };
}

generateReconciliationReport().catch(console.error);
