import { supabaseServiceRole } from '../server/supabaseClient.js';

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c';
const toNum = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

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

async function main() {
  const [entriesRes, resvsRes] = await Promise.all([
    supabaseServiceRole.from('room_chart_entries').select('*').eq('hotel_id', HOTEL_ID),
    supabaseServiceRole.from('reservations').select('*').eq('hotel_id', HOTEL_ID).in('status', ['confirmed', 'checked_in']).lte('check_in_date', '2026-09-30').gte('check_out_date', '2026-09-01'),
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
      type: 'resv',
    };
  });

  const combined = [
    ...entries.map(e => ({ ...e, type: 'entry' })),
    ...synthesizedEntries,
  ];

  console.log('=== EXACT MATHEMATICAL RECONCILIATION OF EVERY SINGLE RECORD ===');
  console.log('Target MTD Period: 2026-09-01 to 2026-09-15\n');

  let totalRev = 0;
  let totalColl = 0;
  let totalPend = 0;

  const diffContributors = [];

  for (const e of combined) {
    const arr = (e.arrival && e.arrival.trim() !== '' ? e.arrival : e.report_date).slice(0, 10);
    const dep = (e.departure && e.departure.trim() !== '' ? e.departure : e.report_date).slice(0, 10);
    const repDate = (e.report_date || arr).slice(0, 10);

    let occupiedNightsInMtd = 0;
    for (let d = 1; d <= 15; d++) {
      const curDate = `2026-09-${String(d).padStart(2, '0')}`;
      if (isStayOccupiedOnDate(e, curDate)) occupiedNightsInMtd++;
    }

    const nightsCount = Math.max(1, toNum(e.nights) || 1);
    const nightlyRate = nightsCount > 1
      ? (toNum(e.room_rate) > 0 ? toNum(e.room_rate) : (toNum(e.total) / nightsCount))
      : (toNum(e.room_rate) > 0 ? toNum(e.room_rate) : toNum(e.total));

    const mtdRev = e.is_complimentary ? 0 : (nightlyRate * occupiedNightsInMtd);

    const paymentInMtd = (repDate >= '2026-09-01' && repDate <= '2026-09-15');

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

    const mtdColl = paymentInMtd ? (cashAmt + bankAmt + upiAmt + cardAmt) : 0;
    const mtdPend = paymentInMtd ? toNum(e.pay_balance) : 0;

    totalRev += mtdRev;
    totalColl += mtdColl;
    totalPend += mtdPend;

    const diff = mtdRev - mtdColl;
    if (diff !== 0 || mtdPend > 0) {
      diffContributors.push({
        guest: e.guest_name,
        room: e.room_no,
        stay: `${arr} -> ${dep}`,
        repDate,
        mtdRev,
        mtdColl,
        diff, // Rev - Coll
        mtdPend,
        type: e.type,
      });
    }
  }

  console.log(`Total MTD Revenue: ₹${totalRev}`);
  console.log(`Total MTD Collection: ₹${totalColl}`);
  console.log(`Difference (Rev - Coll): ₹${totalRev - totalColl}`);
  console.log(`Total MTD Pending: ₹${totalPend}\n`);

  console.log('--- DETAILED ITEMIZATION OF REVENUE vs COLLECTION DISCREPANCIES ---');
  console.log('Item'.padEnd(30) + ' | ' + 'Stay'.padEnd(25) + ' | ' + 'RepDate'.padEnd(10) + ' | ' + 'Rev'.padStart(8) + ' | ' + 'Coll'.padStart(8) + ' | ' + 'Rev - Coll'.padStart(10) + ' | ' + 'Pending'.padStart(8));
  console.log('-'.repeat(110));

  let sumDiff = 0;
  for (const c of diffContributors) {
    sumDiff += c.diff;
    console.log(
      `${(c.guest + ' (' + c.room + ')').padEnd(30)} | ${c.stay.padEnd(25)} | ${c.repDate.padEnd(10)} | ${c.mtdRev.toFixed(1).padStart(8)} | ${c.mtdColl.toFixed(1).padStart(8)} | ${c.diff.toFixed(1).padStart(10)} | ${c.mtdPend.toFixed(1).padStart(8)}`
    );
  }
  console.log('-'.repeat(110));
  console.log(`Net Sum of (Rev - Coll): ₹${sumDiff}`);
}

main();
