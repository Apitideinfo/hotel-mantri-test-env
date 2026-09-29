/**
 * HOTEL MANTRI — AUTHORITATIVE NIGHT-BY-NIGHT ROOM REVENUE ENGINE (BACKEND)
 *
 * Core Financial & Accounting Rule:
 *   ROOM REVENUE IS RECOGNIZED BY OCCUPIED ROOM-NIGHT / BUSINESS DATE.
 *
 * Authoritative stay date interval:
 *   [check_in, check_out)
 *   check_in is INCLUDED (first occupied night).
 *   check_out is EXCLUDED (departure date; NOT an occupied night).
 */

export const toNum = (v) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const normalizeDateString = (d) => {
  if (!d) return '';
  return String(d).trim().slice(0, 10);
};

export const generateOccupiedStayNights = (checkIn, checkOut) => {
  const nights = [];
  const ci = normalizeDateString(checkIn);
  const co = normalizeDateString(checkOut);
  if (!ci) return nights;

  if (!co || ci >= co) {
    nights.push(ci);
    return nights;
  }

  const [sy, sm, sd] = ci.split('-').map(Number);
  const [ey, em, ed] = co.split('-').map(Number);
  let cur = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);

  while (cur < end) {
    const dt = new Date(cur);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dt.getUTCDate()).padStart(2, '0');
    nights.push(`${y}-${m}-${d}`);
    cur += 86400000;
  }

  return nights;
};

export const isStayOccupiedOnBusinessDate = (arrival, departure, targetDate) => {
  const arr = normalizeDateString(arrival);
  const dep = normalizeDateString(departure);
  const target = normalizeDateString(targetDate);
  if (!arr || !target) return false;

  if (arr >= dep) {
    return arr === target;
  }
  return arr <= target && dep > target;
};

export const generateAuthoritativeNightlyRevenue = ({
  hotelId,
  reservations = [],
  roomChartEntries = [],
  fromDate,
  toDate,
}) => {
  if (!hotelId) return [];

  const fromFilter = fromDate ? normalizeDateString(fromDate) : null;
  const toFilter = toDate ? normalizeDateString(toDate) : null;

  const entriesMap = new Map();

  // 1. Authoritative Reservations
  for (const res of reservations) {
    if (res.hotel_id && res.hotel_id !== hotelId) continue;

    const status = (res.status || '').toLowerCase();
    if (status === 'cancelled' || status === 'no_show') continue;

    const ci = normalizeDateString(res.check_in_date);
    const co = normalizeDateString(res.check_out_date);
    if (!ci) continue;

    if (fromFilter && co && co <= fromFilter) continue;
    if (toFilter && ci > toFilter) continue;

    const occupiedNights = generateOccupiedStayNights(ci, co);
    const nightsCount = Math.max(1, occupiedNights.length);
    const isComplimentary = Boolean(
      res.is_complimentary ||
      res.payment_mode === 'Complimentary' ||
      (res.remarks && res.remarks.toLowerCase().includes('complimentary'))
    );

    const baseRate = toNum(res.rate);
    const totalAmount = toNum(res.invoice_total) || (baseRate * nightsCount);
    const fallbackNightlyRate = isComplimentary ? 0 : (baseRate > 0 ? baseRate : totalAmount / nightsCount);

    const totalTaxable = toNum(res.taxable_amount) || totalAmount;
    const totalGst = toNum(res.gst_amount) || 0;
    const nightlyTaxable = isComplimentary ? 0 : totalTaxable / nightsCount;
    const nightlyGst = isComplimentary ? 0 : totalGst / nightsCount;

    const variableRates = res.variable_nightly_rates || {};
    const roomNo = res.room_no || 'Unassigned';
    const sourceCategory = res.source_category || 'Direct/Walking';
    const sourceName = res.source_name || res.source_category || 'Direct';

    for (const nightDate of occupiedNights) {
      if (fromFilter && nightDate < fromFilter) continue;
      if (toFilter && nightDate > toFilter) continue;

      let nightlyRate = fallbackNightlyRate;
      if (!isComplimentary && variableRates[nightDate] !== undefined) {
        nightlyRate = toNum(variableRates[nightDate]);
      }

      const key = `${hotelId}::${res.id}::${roomNo}::${nightDate}`;
      entriesMap.set(key, {
        id: key,
        reservation_id: res.id,
        hotel_id: hotelId,
        room_id: res.room_id || null,
        room_no: roomNo,
        room_category_id: res.room_category_id || null,
        room_category: res.room_category || 'Standard',
        business_date: nightDate,
        rate_plan_id: res.rate_plan_id || null,
        meal_plan_id: res.meal_plan_id || null,
        night_rate: nightlyRate,
        tax_amount: nightlyGst,
        gross_room_revenue: nightlyRate,
        net_room_revenue: Math.max(0, nightlyRate - nightlyGst),
        currency: 'INR',
        source: sourceName,
        source_category: sourceCategory,
        is_complimentary: isComplimentary,
        guest_name: res.guest_name || 'Guest',
        created_at: res.created_at || new Date().toISOString(),
        updated_at: res.updated_at || new Date().toISOString(),
      });
    }
  }

  // 2. Standalone Room Chart Entries (not linked to an existing reservation)
  const linkedReservationIds = new Set(
    Array.from(entriesMap.values()).map((e) => e.reservation_id)
  );

  for (const entry of roomChartEntries) {
    if (entry.hotel_id && entry.hotel_id !== hotelId) continue;
    if (entry.reservation_id && linkedReservationIds.has(entry.reservation_id)) continue;

    if (entry.revenue_category && entry.revenue_category !== 'Room Revenue') continue;

    const arr = normalizeDateString(entry.arrival || entry.report_date);
    const dep = normalizeDateString(entry.departure || entry.report_date);
    if (!arr) continue;

    if (fromFilter && dep && dep <= fromFilter) continue;
    if (toFilter && arr > toFilter) continue;

    const occupiedNights = generateOccupiedStayNights(arr, dep);
    const nightsCount = Math.max(1, occupiedNights.length);
    const isComplimentary = Boolean(entry.is_complimentary);

    const baseRate = toNum(entry.room_rate);
    const totalAmount = toNum(entry.total) || toNum(entry.invoice_total) || (baseRate * nightsCount);
    const fallbackNightlyRate = isComplimentary ? 0 : (baseRate > 0 ? baseRate : totalAmount / nightsCount);

    const totalTaxable = toNum(entry.taxable_amount) || totalAmount;
    const totalGst = toNum(entry.gst_amount) || 0;
    const nightlyTaxable = isComplimentary ? 0 : totalTaxable / nightsCount;
    const nightlyGst = isComplimentary ? 0 : totalGst / nightsCount;

    const roomNo = entry.room_no || 'TBD';
    const sourceCategory = entry.source_category || 'Direct/Walking';
    const sourceName = entry.company || entry.source_category || 'Direct';

    for (const nightDate of occupiedNights) {
      if (fromFilter && nightDate < fromFilter) continue;
      if (toFilter && nightDate > toFilter) continue;

      const key = `${hotelId}::chart_${entry.id}::${roomNo}::${nightDate}`;
      if (!entriesMap.has(key)) {
        entriesMap.set(key, {
          id: key,
          reservation_id: entry.reservation_id || `chart_${entry.id}`,
          hotel_id: hotelId,
          room_id: null,
          room_no: roomNo,
          room_category_id: null,
          room_category: entry.room_category || 'Standard',
          business_date: nightDate,
          rate_plan_id: null,
          meal_plan_id: null,
          night_rate: fallbackNightlyRate,
          tax_amount: nightlyGst,
          gross_room_revenue: fallbackNightlyRate,
          net_room_revenue: Math.max(0, fallbackNightlyRate - nightlyGst),
          currency: 'INR',
          source: sourceName,
          source_category: sourceCategory,
          is_complimentary: isComplimentary,
          guest_name: entry.guest_name || 'Guest',
          created_at: entry.created_at || new Date().toISOString(),
          updated_at: entry.updated_at || new Date().toISOString(),
        });
      }
    }
  }

  return Array.from(entriesMap.values()).sort((a, b) =>
    a.business_date.localeCompare(b.business_date) || a.room_no.localeCompare(b.room_no)
  );
};

export const getAuthoritativeDailyMetrics = (entries, businessDate, totalRooms) => {
  const target = normalizeDateString(businessDate);
  const metrics = {
    businessDate: target,
    roomRevenue: 0,
    roomsOccupied: 0,
    roomsSold: 0,
    complimentaryRooms: 0,
    arr: 0,
    revpar: 0,
    otaRevenue: 0,
    directRevenue: 0,
    corporateRevenue: 0,
    phoneRevenue: 0,
  };

  for (const entry of entries) {
    if (entry.business_date !== target) continue;

    metrics.roomsOccupied += 1;

    if (entry.is_complimentary) {
      metrics.complimentaryRooms += 1;
    } else {
      metrics.roomsSold += 1;
      metrics.roomRevenue += entry.gross_room_revenue;

      switch (entry.source_category) {
        case 'OTA':
          metrics.otaRevenue += entry.gross_room_revenue;
          break;
        case 'Direct/Walking':
          metrics.directRevenue += entry.gross_room_revenue;
          break;
        case 'Corporate/Agent':
          metrics.corporateRevenue += entry.gross_room_revenue;
          break;
        case 'Phonebook':
          metrics.phoneRevenue += entry.gross_room_revenue;
          break;
        default:
          metrics.directRevenue += entry.gross_room_revenue;
      }
    }
  }

  metrics.arr = metrics.roomsSold > 0 ? metrics.roomRevenue / metrics.roomsSold : 0;
  metrics.revpar = totalRooms > 0 ? metrics.roomRevenue / totalRooms : 0;

  return metrics;
};

export const normalizePaymentMethod = (mode) => {
  if (!mode) return 'Cash';
  const m = mode.trim().toLowerCase();
  if (m.includes('cash')) return 'Cash';
  if (m.includes('upi') || m.includes('gpay') || m.includes('phonepe') || m.includes('paytm')) return 'UPI';
  if (m.includes('card') || m.includes('visa') || m.includes('master') || m.includes('pos')) return 'Card';
  if (m.includes('ota') || m.includes('mmt') || m.includes('booking') || m.includes('agoda') || m.includes('goibibo')) return 'OTA';
  if (m.includes('cheque')) return 'Cheque';
  return 'Bank';
};

export const reconcilePaymentLedger = ({
  timelineEvents = [],
  reservations = [],
  roomChartEntries = [],
  hotelId,
}) => {
  const transactions = [];
  const processedKeys = new Set();

  for (const evt of timelineEvents) {
    const isPaymentEvt = [
      'payment_received',
      'advance_payment',
      'check_in_payment',
      'checkout_payment',
      'checkout',
      'check_in',
    ].includes(evt.event_type);

    const amt = toNum(evt.event_amount);
    if (!isPaymentEvt || amt <= 0) continue;

    const data = evt.event_data || {};
    const paymentDate = normalizeDateString(
      data.payment_date || data.business_date || evt.created_at
    );
    const method = normalizePaymentMethod(data.payment_method || data.payment_mode || 'Cash');

    const key = `timeline::${evt.id}`;
    if (!processedKeys.has(key)) {
      processedKeys.add(key);
      transactions.push({
        id: evt.id,
        hotel_id: evt.hotel_id || hotelId || '',
        reservation_id: evt.reservation_id || null,
        payment_date: paymentDate,
        business_date: paymentDate,
        amount: amt,
        payment_method: method,
        status: 'successful',
      });
    }
  }

  for (const res of reservations) {
    const adv = toNum(res.advance_paid);
    if (adv <= 0) continue;
    const timelineHasRes = timelineEvents.some(
      (te) => te.reservation_id === res.id && toNum(te.event_amount) === adv
    );
    if (timelineHasRes) continue;

    const bookingDate = normalizeDateString(res.created_at || res.check_in_date);
    const method = normalizePaymentMethod(res.payment_mode || 'Cash');
    const key = `res_adv::${res.id}::${adv}`;
    if (!processedKeys.has(key)) {
      processedKeys.add(key);
      transactions.push({
        id: `res_adv_${res.id}`,
        hotel_id: res.hotel_id || hotelId || '',
        reservation_id: res.id,
        payment_date: bookingDate,
        business_date: bookingDate,
        amount: adv,
        payment_method: method,
        status: 'successful',
      });
    }
  }

  for (const entry of roomChartEntries) {
    const repDate = normalizeDateString(entry.report_date);
    if (!repDate) continue;

    const cash = toNum(entry.pay_cash);
    const upi = toNum(entry.pay_upi);
    const card = toNum(entry.pay_card);
    const bank = toNum(entry.pay_bank);

    if (cash > 0) {
      const key = `chart_cash::${entry.id}::${repDate}`;
      if (!processedKeys.has(key)) {
        processedKeys.add(key);
        transactions.push({
          id: `chart_cash_${entry.id}`,
          hotel_id: entry.hotel_id || hotelId || '',
          entry_id: entry.id,
          payment_date: repDate,
          business_date: repDate,
          amount: cash,
          payment_method: 'Cash',
          status: 'successful',
        });
      }
    }
    if (upi > 0) {
      const key = `chart_upi::${entry.id}::${repDate}`;
      if (!processedKeys.has(key)) {
        processedKeys.add(key);
        transactions.push({
          id: `chart_upi_${entry.id}`,
          hotel_id: entry.hotel_id || hotelId || '',
          entry_id: entry.id,
          payment_date: repDate,
          business_date: repDate,
          amount: upi,
          payment_method: 'UPI',
          status: 'successful',
        });
      }
    }
    if (card > 0) {
      const key = `chart_card::${entry.id}::${repDate}`;
      if (!processedKeys.has(key)) {
        processedKeys.add(key);
        transactions.push({
          id: `chart_card_${entry.id}`,
          hotel_id: entry.hotel_id || hotelId || '',
          entry_id: entry.id,
          payment_date: repDate,
          business_date: repDate,
          amount: card,
          payment_method: 'Card',
          status: 'successful',
        });
      }
    }
    if (bank > 0) {
      const key = `chart_bank::${entry.id}::${repDate}`;
      if (!processedKeys.has(key)) {
        processedKeys.add(key);
        transactions.push({
          id: `chart_bank_${entry.id}`,
          hotel_id: entry.hotel_id || hotelId || '',
          entry_id: entry.id,
          payment_date: repDate,
          business_date: repDate,
          amount: bank,
          payment_method: 'Bank',
          status: 'successful',
        });
      }
    }
  }

  return transactions;
};

export default {
  toNum,
  normalizeDateString,
  generateOccupiedStayNights,
  isStayOccupiedOnBusinessDate,
  generateAuthoritativeNightlyRevenue,
  getAuthoritativeDailyMetrics,
  normalizePaymentMethod,
  reconcilePaymentLedger,
};
