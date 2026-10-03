/**
 * HOTEL MANTRI — Authoritative Day-Wise Revenue & Accounting Service
 * 
 * Provides:
 * - Authoritative Day-Wise Earned Revenue calculation across occupied room nights [check_in, check_out)
 * - Strict separation of Earned Revenue (occupied night date) vs Collection (payment date)
 * - Multi-night stay distribution without blind division when variable rates exist
 * - Checkout date exclusion (Hotel Mantri standard: check-in inclusive, check-out exclusive)
 * - Cancelled / No-show reservation exclusion
 * - F&B and Other Income day-wise breakdown
 * - Reservation-level drill down (Booking ID, Guest, Room, Nightly Rate, Source)
 * - Date range and Historical Date revenue aggregation with ARR, RevPAR, and Occupancy metrics
 * - Respect for closed business dates (day_close_records) and open business date labeling
 * - Strict hotel isolation scoped to authenticated hotel
 */

import { supabaseServiceRole } from '../supabaseClient.js';

/**
 * Calculates calendar days between two YYYY-MM-DD dates without timezone skew.
 */
export const calcStayNights = (startStr, endStr) => {
  if (!startStr || !endStr) return 1;
  const [y1, m1, d1] = startStr.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = endStr.slice(0, 10).split('-').map(Number);
  const diffMs = Date.UTC(y2, m2 - 1, d2, 12, 0, 0) - Date.UTC(y1, m1 - 1, d1, 12, 0, 0);
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, days);
};

/**
 * Adds days to a YYYY-MM-DD date string using UTC arithmetic.
 */
export const addDays = (dateStr, days) => {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
};

/**
 * Tests if a stay is occupied on a given business date.
 * Check-in date: INCLUDED
 * Check-out date: EXCLUDED
 */
export const isStayOccupiedOnDate = (stay, dateStr) => {
  const arr = (stay.arrival || stay.check_in_date || stay.report_date || '').slice(0, 10);
  const dep = (stay.departure || stay.check_out_date || stay.report_date || '').slice(0, 10);
  if (!arr) return false;
  if (!dep || arr >= dep) {
    // Same-day stay / day-use: occupied only on arrival day
    return arr === dateStr;
  }
  return arr <= dateStr && dep > dateStr;
};

/**
 * Returns the nightly room revenue for a stay on a specific date.
 */
export const getNightlyRoomRevenue = (stay, dateStr) => {
  if (stay.is_complimentary) return 0;
  if (stay.variable_nightly_rates && stay.variable_nightly_rates[dateStr] !== undefined) {
    const val = Number(stay.variable_nightly_rates[dateStr]);
    if (!isNaN(val) && val >= 0) return val;
  }
  const explicitRate = Number(stay.room_rate ?? stay.rate);
  if (!isNaN(explicitRate) && explicitRate > 0) {
    return explicitRate;
  }
  const total = Number(stay.invoice_total ?? stay.total);
  const arr = (stay.arrival || stay.check_in_date || stay.report_date || '').slice(0, 10);
  const dep = (stay.departure || stay.check_out_date || stay.report_date || '').slice(0, 10);
  const nights = arr && dep && arr < dep ? calcStayNights(arr, dep) : Math.max(1, Number(stay.nights) || 1);
  if (!isNaN(total) && total > 0 && nights > 0) {
    return total / nights;
  }
  return 0;
};

/**
 * Normalizes payment mode strings into standard buckets.
 */
export const normalizePaymentMethod = (mode) => {
  const m = String(mode || '').toLowerCase().trim();
  if (m.includes('cash')) return 'Cash';
  if (m.includes('upi') || m.includes('gpay') || m.includes('phonepe') || m.includes('paytm') || m.includes('qr')) return 'UPI';
  if (m.includes('card') || m.includes('pos') || m.includes('debit') || m.includes('credit')) return 'Card';
  if (m.includes('bank') || m.includes('neft') || m.includes('rtgs') || m.includes('ota') || m.includes('bill to company') || m.includes('transfer')) return 'Bank';
  return 'Cash';
};

/**
 * Calculates day-wise revenue, collections, breakdown, and reservation details for a hotel.
 * 
 * @param {Object} options
 * @param {string} options.hotelId - Hotel UUID
 * @param {string} [options.date] - Single date YYYY-MM-DD
 * @param {string} [options.startDate] - Start date YYYY-MM-DD
 * @param {string} [options.endDate] - End date YYYY-MM-DD
 * @param {number} [options.month] - 1-12
 * @param {number} [options.year] - YYYY
 */
export const calculateDayWiseRevenue = async ({
  hotelId,
  date,
  startDate,
  endDate,
  month,
  year,
}) => {
  if (!hotelId) {
    throw new Error('HOTEL_CONTEXT_REQUIRED: hotelId is required.');
  }

  const supabase = supabaseServiceRole;

  // 1. Resolve date range
  let fromDate = '';
  let toDate = '';
  let mode = 'date';

  if (date) {
    fromDate = date.slice(0, 10);
    toDate = date.slice(0, 10);
    mode = 'date';
  } else if (startDate && endDate) {
    fromDate = startDate.slice(0, 10);
    toDate = endDate.slice(0, 10);
    mode = 'range';
  } else if (month && year) {
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    fromDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    toDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    mode = 'month';
  } else {
    // Default to today
    const today = new Date().toISOString().slice(0, 10);
    fromDate = today;
    toDate = today;
    mode = 'date';
  }

  if (fromDate > toDate) {
    const temp = fromDate;
    fromDate = toDate;
    toDate = temp;
  }

  // 2. Query hotel settings for total rooms
  const [{ data: settings }, { data: hotelObj }] = await Promise.all([
    supabase.from('hotel_settings').select('total_rooms, opening_cash_balance').eq('id', hotelId).maybeSingle(),
    supabase.from('hotels').select('total_rooms, hotel_name').eq('id', hotelId).maybeSingle(),
  ]);

  const totalRooms = Number(settings?.total_rooms || hotelObj?.total_rooms || 22);

  // 3. Wide lookback for stay entries to catch reservations spanning into this period
  const lookbackDate = addDays(fromDate, -180);
  const lookaheadDate = addDays(toDate, 30);

  // 4. Fetch all necessary data in parallel
  const [
    { data: activeResvs, error: resvErr },
    { data: chartRows, error: chartErr },
    { data: otherEntries, error: otherErr },
    { data: revEntries, error: revErr },
    { data: dayCloseRecords, error: closeErr },
    { data: timelineEvents, error: timelineErr },
    { data: maintenanceBlocks, error: blockErr },
  ] = await Promise.all([
    supabase
      .from('reservations')
      .select('*')
      .eq('hotel_id', hotelId)
      .in('status', ['confirmed', 'checked_in', 'checked_out'])
      .lte('check_in_date', toDate)
      .gte('check_out_date', fromDate),
    supabase
      .from('room_chart_entries')
      .select('*')
      .eq('hotel_id', hotelId)
      .gte('report_date', lookbackDate)
      .lte('report_date', lookaheadDate),
    supabase
      .from('other_daily_entries')
      .select('*')
      .eq('hotel_id', hotelId)
      .gte('report_date', fromDate)
      .lte('report_date', toDate),
    supabase
      .from('daily_revenue_entries')
      .select('*')
      .eq('hotel_id', hotelId)
      .gte('entry_date', fromDate)
      .lte('entry_date', toDate),
    supabase
      .from('day_close_records')
      .select('business_date, status, closed_at')
      .eq('hotel_id', hotelId)
      .eq('status', 'closed')
      .gte('business_date', fromDate)
      .lte('business_date', toDate),
    Promise.resolve(
      supabase
        .from('booking_timeline')
        .select('*')
        .eq('hotel_id', hotelId)
        .gt('event_amount', 0)
    ).then((r) => r).catch(() => ({ data: [] })),
    Promise.resolve(
      supabase
        .from('room_blocks')
        .select('room_no, block_type, start_date, end_date')
        .eq('hotel_id', hotelId)
    ).then((r) => r).catch(() => ({ data: [] })),
  ]);

  if (resvErr) throw resvErr;
  if (chartErr) throw chartErr;

  // 5. Merge room chart entries and reservations to prevent double counting
  const chartList = chartRows || [];
  const resvList = activeResvs || [];
  const linkedResvIds = new Set(chartList.map((e) => e.reservation_id).filter(Boolean));

  // Synthesize unlinked reservations into stay records
  const unlinkedResvs = resvList.filter((r) => {
    const st = (r.status || '').toLowerCase();
    if (st === 'cancelled' || st === 'no_show') return false;
    return !linkedResvIds.has(r.id);
  });

  const allStays = [
    ...chartList.map((e) => ({
      id: e.id,
      reservationId: e.reservation_id || e.id,
      bookingId: e.reservation_id ? `HM-RES-${e.reservation_id.slice(0, 8).toUpperCase()}` : `ENTRY-${e.id.slice(0, 6)}`,
      guestName: e.guest_name || 'Guest',
      roomNo: e.room_no || 'Unassigned',
      categoryName: e.room_category || 'Room',
      arrival: (e.arrival || e.report_date || '').slice(0, 10),
      departure: (e.departure || e.report_date || '').slice(0, 10),
      rate: Number(e.room_rate || 0),
      total: Number(e.total || 0),
      nights: calcStayNights(e.arrival || e.report_date, e.departure || e.report_date),
      sourceName: e.company || e.source_category || 'Direct/Walking',
      revenueCategory: e.revenue_category || 'Room Revenue',
      is_complimentary: Boolean(e.is_complimentary),
      variable_nightly_rates: e.variable_nightly_rates || null,
      paymentMode: e.pay_mode || 'Cash',
    })),
    ...unlinkedResvs.map((r) => ({
      id: r.id,
      reservationId: r.id,
      bookingId: `HM-RES-${r.id.slice(0, 8).toUpperCase()}`,
      guestName: r.guest_name || 'Guest',
      roomNo: r.room_no || 'Unassigned',
      categoryName: r.room_category || 'Room',
      arrival: (r.check_in_date || '').slice(0, 10),
      departure: (r.check_out_date || '').slice(0, 10),
      rate: Number(r.rate || 0),
      total: Number(r.invoice_total || 0),
      nights: calcStayNights(r.check_in_date, r.check_out_date),
      sourceName: r.source_name || r.source_category || 'OTA',
      revenueCategory: 'Room Revenue',
      is_complimentary: false,
      variable_nightly_rates: null,
      paymentMode: r.payment_mode || 'Bank',
    })),
  ];

  // 6. Map other daily entries & daily revenue entries by date
  const otherByDate = new Map();
  for (const o of otherEntries || []) {
    otherByDate.set(o.report_date.slice(0, 10), o);
  }

  const revEntriesByDate = new Map();
  for (const re of revEntries || []) {
    const dStr = re.entry_date.slice(0, 10);
    const existing = revEntriesByDate.get(dStr) || [];
    existing.push(re);
    revEntriesByDate.set(dStr, existing);
  }

  // 7. Closed business dates set
  const closedDates = new Set((dayCloseRecords || []).map((r) => r.business_date.slice(0, 10)));

  // 8. Reconcile Collections (Actual Money Received) strictly by payment_date
  // We attribute payment cash/bank/upi/card to the exact date the money was received.
  const collectionsByDate = new Map();
  const addCollection = (dStr, method, amt) => {
    if (!dStr || amt <= 0) return;
    const normDate = dStr.slice(0, 10);
    const cur = collectionsByDate.get(normDate) || { total: 0, payCash: 0, payBank: 0, payUpi: 0, payCard: 0 };
    const normMethod = normalizePaymentMethod(method);
    cur.total += amt;
    if (normMethod === 'Cash') cur.payCash += amt;
    else if (normMethod === 'UPI') cur.payUpi += amt;
    else if (normMethod === 'Card') cur.payCard += amt;
    else cur.payBank += amt;
    collectionsByDate.set(normDate, cur);
  };

  // 8a. From booking timeline payment events
  const timelineSeen = new Set();
  for (const evt of timelineEvents || []) {
    const isPaymentEvt = [
      'payment_received',
      'advance_payment',
      'check_in_payment',
      'checkout_payment',
      'check_in',
      'checkout',
    ].includes(evt.event_type);
    const amt = Number(evt.event_amount || 0);
    if (!isPaymentEvt || amt <= 0) continue;
    const ed = evt.event_data || {};
    const pDate = ed.payment_date || ed.business_date || (evt.created_at ? evt.created_at.slice(0, 10) : null);
    const pMethod = ed.payment_method || ed.payment_mode || 'Cash';
    timelineSeen.add(evt.reservation_id);
    addCollection(pDate, pMethod, amt);
  }

  // 8b. From reservations advance paid if not captured in timeline
  for (const r of resvList) {
    if (!timelineSeen.has(r.id)) {
      const adv = Number(r.advance_paid || 0);
      if (adv > 0 && r.created_at) {
        addCollection(r.created_at.slice(0, 10), r.payment_mode || 'Bank', adv);
      }
      if (Number(r.pay_cash) > 0) addCollection(r.check_in_date, 'Cash', Number(r.pay_cash));
      if (Number(r.pay_bank) > 0) addCollection(r.check_in_date, 'Bank', Number(r.pay_bank));
      if (Number(r.pay_upi) > 0) addCollection(r.check_in_date, 'UPI', Number(r.pay_upi));
      if (Number(r.pay_card) > 0) addCollection(r.check_in_date, 'Card', Number(r.pay_card));
    }
  }

  // 9. Iterate dates and build daily records
  const dailyBreakdown = [];
  const reservationsBreakdown = [];

  let curDate = fromDate;
  while (curDate <= toDate) {
    const dStr = curDate;

    // Find all occupied stays on dStr [check_in, check_out)
    const activeStays = allStays.filter((s) => isStayOccupiedOnDate(s, dStr));

    let dayRoomRevenue = 0;
    let dayPayingRooms = 0;
    let dayCompRooms = 0;

    for (const stay of activeStays) {
      if (stay.is_complimentary) {
        dayCompRooms++;
      } else {
        const nightlyAmount = getNightlyRoomRevenue(stay, dStr);
        if (stay.revenueCategory === 'Room Revenue') {
          dayRoomRevenue += nightlyAmount;
          dayPayingRooms++;
        }
        // Include in reservation line-item drilldown
        reservationsBreakdown.push({
          date: dStr,
          reservationId: stay.reservationId,
          bookingId: stay.bookingId,
          guestName: stay.guestName,
          roomNo: stay.roomNo,
          categoryName: stay.categoryName,
          checkIn: stay.arrival,
          checkOut: stay.departure,
          nights: stay.nights,
          nightlyRate: nightlyAmount,
          revenueForDate: nightlyAmount,
          sourceName: stay.sourceName,
          revenueCategory: stay.revenueCategory,
          isComplimentary: stay.is_complimentary,
        });
      }
    }

    // F&B Revenue: kitchen from other_daily_entries + any F&B revenue head
    const otherRec = otherByDate.get(dStr);
    let dayFbRevenue = Number(otherRec?.kitchen || 0);

    // Other Income: other_income from other_daily_entries + misc revenue heads
    let dayOtherIncome = Number(otherRec?.other_income || 0);

    const extraRevList = revEntriesByDate.get(dStr) || [];
    for (const er of extraRevList) {
      const head = String(er.revenue_head || '').toLowerCase();
      const erAmt = Number(er.amount || 0);
      if (head.includes('food') || head.includes('kitchen') || head.includes('restaurant') || head.includes('f&b') || head.includes('beverage')) {
        dayFbRevenue += erAmt;
      } else {
        dayOtherIncome += erAmt;
      }
    }

    const dayTotalEarned = dayRoomRevenue + dayFbRevenue + dayOtherIncome;

    // Out of order rooms for this day
    const oooCount = (maintenanceBlocks || []).filter((b) => {
      if (b.block_type !== 'OutOfOrder' && b.block_type !== 'Maintenance') return false;
      const s = (b.start_date || '').slice(0, 10);
      const e = (b.end_date || '').slice(0, 10);
      return s <= dStr && e >= dStr;
    }).length;

    const availableRooms = Math.max(0, totalRooms - oooCount);
    const daySoldRooms = dayPayingRooms + dayCompRooms;
    const dayArr = dayPayingRooms > 0 ? dayRoomRevenue / dayPayingRooms : 0;
    const dayRevpar = availableRooms > 0 ? dayRoomRevenue / availableRooms : 0;
    const dayOcc = availableRooms > 0 ? (daySoldRooms / availableRooms) * 100 : 0;

    const col = collectionsByDate.get(dStr) || { total: 0, payCash: 0, payBank: 0, payUpi: 0, payCard: 0 };
    const isClosed = closedDates.has(dStr);

    dailyBreakdown.push({
      date: dStr,
      roomRevenue: Math.round(dayRoomRevenue * 100) / 100,
      fbRevenue: Math.round(dayFbRevenue * 100) / 100,
      otherIncome: Math.round(dayOtherIncome * 100) / 100,
      totalIncome: Math.round(dayTotalEarned * 100) / 100,
      totalEarned: Math.round(dayTotalEarned * 100) / 100,
      soldRoomNights: dayPayingRooms,
      complimentaryRooms: dayCompRooms,
      availableRoomNights: availableRooms,
      arr: Math.round(dayArr * 100) / 100,
      revpar: Math.round(dayRevpar * 100) / 100,
      occupancyPercent: Math.round(dayOcc * 10) / 10,
      collections: {
        total: Math.round(col.total * 100) / 100,
        cash: Math.round(col.payCash * 100) / 100,
        bank: Math.round(col.payBank * 100) / 100,
        upi: Math.round(col.payUpi * 100) / 100,
        card: Math.round(col.payCard * 100) / 100,
      },
      isClosed,
      businessDateStatus: isClosed ? 'closed' : 'open',
    });

    curDate = addDays(curDate, 1);
  }

  // 10. Compute aggregated summary
  let totalRoomRevenue = 0;
  let totalFbRevenue = 0;
  let totalOtherIncome = 0;
  let totalEarnedRevenue = 0;
  let totalSoldNights = 0;
  let totalAvailableNights = 0;
  let totalCollections = 0;
  let totalCash = 0;
  let totalBank = 0;
  let totalUpi = 0;
  let totalCard = 0;

  let highest = { date: '', amount: -1 };
  let lowest = { date: '', amount: Infinity };

  for (const day of dailyBreakdown) {
    totalRoomRevenue += day.roomRevenue;
    totalFbRevenue += day.fbRevenue;
    totalOtherIncome += day.otherIncome;
    totalEarnedRevenue += day.totalIncome;
    totalSoldNights += day.soldRoomNights;
    totalAvailableNights += day.availableRoomNights;

    totalCollections += day.collections.total;
    totalCash += day.collections.cash;
    totalBank += day.collections.bank;
    totalUpi += day.collections.upi;
    totalCard += day.collections.card;

    if (day.totalIncome > highest.amount) {
      highest = { date: day.date, amount: day.totalIncome };
    }
    if (day.totalIncome < lowest.amount) {
      lowest = { date: day.date, amount: day.totalIncome };
    }
  }

  if (lowest.amount === Infinity) lowest = { date: fromDate, amount: 0 };
  if (highest.amount === -1) highest = { date: fromDate, amount: 0 };

  const daysCount = dailyBreakdown.length || 1;
  const avgDailyRevenue = Math.round((totalEarnedRevenue / daysCount) * 100) / 100;
  const overallArr = totalSoldNights > 0 ? Math.round((totalRoomRevenue / totalSoldNights) * 100) / 100 : 0;
  const overallRevpar = totalAvailableNights > 0 ? Math.round((totalRoomRevenue / totalAvailableNights) * 100) / 100 : 0;
  const overallOcc = totalAvailableNights > 0 ? Math.round((totalSoldNights / totalAvailableNights) * 1000) / 10 : 0;

  return {
    hotelId,
    hotelName: hotelObj?.hotel_name || 'Hotel Property',
    period: {
      mode,
      date: mode === 'date' ? fromDate : null,
      startDate: fromDate,
      endDate: toDate,
      totalDays: daysCount,
    },
    summary: {
      totalIncome: Math.round(totalEarnedRevenue * 100) / 100,
      totalEarned: Math.round(totalEarnedRevenue * 100) / 100,
      roomRevenue: Math.round(totalRoomRevenue * 100) / 100,
      fbRevenue: Math.round(totalFbRevenue * 100) / 100,
      otherIncome: Math.round(totalOtherIncome * 100) / 100,
      totalCollections: Math.round(totalCollections * 100) / 100,
      collections: {
        total: Math.round(totalCollections * 100) / 100,
        cash: Math.round(totalCash * 100) / 100,
        bank: Math.round(totalBank * 100) / 100,
        upi: Math.round(totalUpi * 100) / 100,
        card: Math.round(totalCard * 100) / 100,
      },
      soldRoomNights: totalSoldNights,
      availableRoomNights: totalAvailableNights,
      arr: overallArr,
      revpar: overallRevpar,
      occupancyPercent: overallOcc,
      averageDailyRevenue: avgDailyRevenue,
      highestRevenueDate: highest,
      lowestRevenueDate: lowest,
    },
    dailyBreakdown,
    reservationsBreakdown,
  };
};

export default {
  calculateDayWiseRevenue,
  isStayOccupiedOnDate,
  getNightlyRoomRevenue,
  calcStayNights,
};
