/**
 * HOTEL MANTRI — Server Financial Ledger Service
 *
 * Authoritative Server-side Implementation of:
 * 1. ROOM REVENUE BY OCCUPIED BUSINESS DATE
 * 2. PAYMENT / COLLECTION BY ACTUAL PAYMENT DATE
 *
 * Guaranteed:
 * - Room revenue recognized only for [checkIn, checkOut).
 * - Departure date is NOT an occupied night.
 * - Payments recognized only on actual payment date.
 * - Cash closing restricted to current business date transactions.
 */

export const toNum = (v) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const normalizeDateString = (d) => {
  if (!d) return '';
  return String(d).trim().slice(0, 10);
};

/**
 * Generates array of occupied stay night dates [checkIn, checkOut).
 * Departure date is STRICTLY EXCLUDED.
 * If checkIn === checkOut (day use), returns [checkIn].
 */
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

export const calcStayNights = (arrival, departure) => {
  if (!arrival || !departure) return 1;
  const [y1, m1, d1] = String(arrival).slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = String(departure).slice(0, 10).split('-').map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 1;
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  const diffDays = Math.round((utc2 - utc1) / 86400000);
  return diffDays > 0 ? diffDays : 1;
};

export const isStayOverlapping = (inA, outA, inB, outB) => {
  if (!inA || !outA || !inB || !outB) return false;
  const a1 = String(inA).slice(0, 10);
  const a2 = String(outA).slice(0, 10);
  const b1 = String(inB).slice(0, 10);
  const b2 = String(outB).slice(0, 10);
  return a1 < b2 && a2 > b1;
};

export const isStayOccupiedOnDate = (stay, date) => {
  const arr = (stay.arrival || stay.check_in_date || stay.report_date || '').slice(0, 10);
  const dep = (stay.departure || stay.check_out_date || stay.report_date || '').slice(0, 10);
  if (arr >= dep) {
    return arr === date;
  }
  return arr <= date && dep > date;
};

/**
 * Builds room revenue entries strictly distributed across occupied nights.
 */
export const generateRoomRevenueLedger = (stay) => {
  const entries = [];
  const occupiedNights = generateOccupiedStayNights(stay.check_in_date, stay.check_out_date);
  const nightsCount = Math.max(1, occupiedNights.length);
  const isComplimentary = Boolean(stay.is_complimentary);

  const baseRate = toNum(stay.rate);
  const totalAmount = toNum(stay.invoice_total) || (baseRate * nightsCount);
  const fallbackNightlyRate = nightsCount > 0 ? (baseRate > 0 ? baseRate : totalAmount / nightsCount) : 0;

  const totalTaxable = toNum(stay.taxable_amount) || totalAmount;
  const totalGst = toNum(stay.gst_amount) || 0;
  const nightlyTaxable = totalTaxable / nightsCount;
  const nightlyGst = totalGst / nightsCount;

  for (const nightDate of occupiedNights) {
    let nightlyRate = fallbackNightlyRate;
    if (stay.variable_nightly_rates && stay.variable_nightly_rates[nightDate] !== undefined) {
      nightlyRate = toNum(stay.variable_nightly_rates[nightDate]);
    }

    entries.push({
      reservation_id: stay.reservation_id || stay.id || null,
      reservation_room_id: stay.reservation_room_id || null,
      entry_id: stay.entry_id || null,
      hotel_id: stay.hotel_id,
      business_date: nightDate,
      room_no: stay.room_no || 'TBD',
      room_category: stay.room_category || 'Standard',
      rate_plan: stay.rate_plan || 'Standard',
      guest_name: stay.guest_name || 'Guest',
      amount: isComplimentary ? 0 : nightlyRate,
      tax_amount: isComplimentary ? 0 : nightlyGst,
      taxable_amount: isComplimentary ? 0 : nightlyTaxable,
      source_category: stay.source_category || 'Direct/Walking',
      source_name: stay.source_name || 'Direct',
      is_complimentary: isComplimentary,
      meal_plan: stay.meal_plan || 'EP',
    });
  }

  return entries;
};

export const normalizePaymentMethod = (mode) => {
  if (!mode) return 'Cash';
  const m = String(mode).trim().toLowerCase();
  if (m.includes('cash')) return 'Cash';
  if (m.includes('upi') || m.includes('gpay') || m.includes('phonepe') || m.includes('paytm')) return 'UPI';
  if (m.includes('card') || m.includes('pos')) return 'Card';
  if (m.includes('ota') || m.includes('mmt') || m.includes('booking') || m.includes('agoda') || m.includes('goibibo')) return 'OTA';
  if (m.includes('cheque')) return 'Cheque';
  return 'Bank';
};

export const reconcilePaymentLedger = ({
  timelineEvents = [],
  reservations = [],
  roomChartEntries = [],
  hotelId = '',
}) => {
  const transactions = [];
  const processedKeys = new Set();

  // 1. Process explicit timeline events
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
        hotel_id: evt.hotel_id || hotelId,
        reservation_id: evt.reservation_id || null,
        entry_id: evt.entry_id || null,
        payment_date: paymentDate,
        business_date: paymentDate,
        amount: amt,
        payment_method: method,
        reference: data.reference || data.payment_ref || '',
        source: data.source || '',
        status: 'successful',
        notes: evt.event_description || '',
        performed_by: evt.performed_by || '',
        created_at: evt.created_at || new Date().toISOString(),
      });
    }
  }

  // 2. Process reservation advance payments
  for (const res of reservations) {
    const adv = toNum(res.advance_paid);
    if (adv <= 0) continue;

    const timelineHasRes = timelineEvents.some(
      (te) => te.reservation_id === res.id && te.event_amount === adv
    );
    if (timelineHasRes) continue;

    const bookingDate = normalizeDateString(res.created_at || res.check_in_date);
    const method = normalizePaymentMethod(res.payment_mode || 'Cash');

    const key = `res_adv::${res.id}::${adv}`;
    if (!processedKeys.has(key)) {
      processedKeys.add(key);

      const cash = toNum(res.pay_cash);
      const upi = toNum(res.pay_upi);
      const card = toNum(res.pay_card);
      const bank = toNum(res.pay_bank);

      if (cash > 0 || upi > 0 || card > 0 || bank > 0) {
        if (cash > 0) {
          transactions.push({
            id: `res_cash_${res.id}`,
            hotel_id: res.hotel_id || hotelId,
            reservation_id: res.id,
            payment_date: bookingDate,
            business_date: bookingDate,
            amount: cash,
            payment_method: 'Cash',
            status: 'successful',
            notes: 'Reservation advance (Cash)',
            created_at: res.created_at || new Date().toISOString(),
          });
        }
        if (upi > 0) {
          transactions.push({
            id: `res_upi_${res.id}`,
            hotel_id: res.hotel_id || hotelId,
            reservation_id: res.id,
            payment_date: bookingDate,
            business_date: bookingDate,
            amount: upi,
            payment_method: 'UPI',
            status: 'successful',
            notes: 'Reservation advance (UPI)',
            created_at: res.created_at || new Date().toISOString(),
          });
        }
        if (card > 0) {
          transactions.push({
            id: `res_card_${res.id}`,
            hotel_id: res.hotel_id || hotelId,
            reservation_id: res.id,
            payment_date: bookingDate,
            business_date: bookingDate,
            amount: card,
            payment_method: 'Card',
            status: 'successful',
            notes: 'Reservation advance (Card)',
            created_at: res.created_at || new Date().toISOString(),
          });
        }
        if (bank > 0) {
          transactions.push({
            id: `res_bank_${res.id}`,
            hotel_id: res.hotel_id || hotelId,
            reservation_id: res.id,
            payment_date: bookingDate,
            business_date: bookingDate,
            amount: bank,
            payment_method: 'Bank',
            status: 'successful',
            notes: 'Reservation advance (Bank)',
            created_at: res.created_at || new Date().toISOString(),
          });
        }
      } else {
        transactions.push({
          id: `res_adv_${res.id}`,
          hotel_id: res.hotel_id || hotelId,
          reservation_id: res.id,
          payment_date: bookingDate,
          business_date: bookingDate,
          amount: adv,
          payment_method: method,
          status: 'successful',
          notes: 'Reservation advance',
          created_at: res.created_at || new Date().toISOString(),
        });
      }
    }
  }

  // 3. Process room chart entry payments
  for (const entry of roomChartEntries) {
    const entryDate = normalizeDateString(entry.business_date || entry.report_date || entry.arrival);
    const hasTimeline = timelineEvents.some((te) => te.entry_id === entry.id);
    if (hasTimeline) continue;

    const cash = toNum(entry.pay_cash);
    const upi = toNum(entry.pay_upi);
    const card = toNum(entry.pay_card);
    const bank = toNum(entry.pay_bank);
    const adv = toNum(entry.pay_advance);

    const key = `entry_pay::${entry.id}`;
    if (!processedKeys.has(key)) {
      processedKeys.add(key);

      if (cash > 0) {
        transactions.push({
          id: `entry_cash_${entry.id}`,
          hotel_id: entry.hotel_id || hotelId,
          entry_id: entry.id,
          payment_date: entryDate,
          business_date: entryDate,
          amount: cash,
          payment_method: 'Cash',
          status: 'successful',
          created_at: entry.created_at || new Date().toISOString(),
        });
      }
      if (upi > 0) {
        transactions.push({
          id: `entry_upi_${entry.id}`,
          hotel_id: entry.hotel_id || hotelId,
          entry_id: entry.id,
          payment_date: entryDate,
          business_date: entryDate,
          amount: upi,
          payment_method: 'UPI',
          status: 'successful',
          created_at: entry.created_at || new Date().toISOString(),
        });
      }
      if (card > 0) {
        transactions.push({
          id: `entry_card_${entry.id}`,
          hotel_id: entry.hotel_id || hotelId,
          entry_id: entry.id,
          payment_date: entryDate,
          business_date: entryDate,
          amount: card,
          payment_method: 'Card',
          status: 'successful',
          created_at: entry.created_at || new Date().toISOString(),
        });
      }
      if (bank > 0) {
        transactions.push({
          id: `entry_bank_${entry.id}`,
          hotel_id: entry.hotel_id || hotelId,
          entry_id: entry.id,
          payment_date: entryDate,
          business_date: entryDate,
          amount: bank,
          payment_method: 'Bank',
          status: 'successful',
          created_at: entry.created_at || new Date().toISOString(),
        });
      }
      if (cash === 0 && upi === 0 && card === 0 && bank === 0 && adv > 0) {
        const mode = normalizePaymentMethod(entry.pay_mode);
        transactions.push({
          id: `entry_adv_${entry.id}`,
          hotel_id: entry.hotel_id || hotelId,
          entry_id: entry.id,
          payment_date: entryDate,
          business_date: entryDate,
          amount: adv,
          payment_method: mode,
          status: 'successful',
          created_at: entry.created_at || new Date().toISOString(),
        });
      }
    }
  }

  return transactions;
};

export const aggregateDailyRoomRevenue = (ledgerEntries, businessDate) => {
  const targetDate = normalizeDateString(businessDate);
  const metrics = {
    businessDate: targetDate,
    roomRevenue: 0,
    otaRevenue: 0,
    directRevenue: 0,
    corporateRevenue: 0,
    phoneRevenue: 0,
    taxableRevenue: 0,
    gstCollected: 0,
    roomsOccupied: 0,
    complimentaryRooms: 0,
  };

  for (const entry of ledgerEntries) {
    if (normalizeDateString(entry.business_date) !== targetDate) continue;

    if (entry.is_complimentary) {
      metrics.complimentaryRooms += 1;
    } else {
      metrics.roomsOccupied += 1;
      metrics.roomRevenue += entry.amount;
      metrics.taxableRevenue += entry.taxable_amount;
      metrics.gstCollected += entry.tax_amount;

      switch (entry.source_category) {
        case 'OTA':
          metrics.otaRevenue += entry.amount;
          break;
        case 'Direct/Walking':
          metrics.directRevenue += entry.amount;
          break;
        case 'Corporate/Agent':
          metrics.corporateRevenue += entry.amount;
          break;
        case 'Phonebook':
          metrics.phoneRevenue += entry.amount;
          break;
        default:
          metrics.directRevenue += entry.amount;
      }
    }
  }

  metrics.totalRoomRevenue = metrics.roomRevenue;
  metrics.occupiedRooms = metrics.roomsOccupied;
  return metrics;
};

export const aggregateDailyCollections = (transactions, businessDate) => {
  const targetDate = normalizeDateString(businessDate);
  const matchedTx = [];
  const metrics = {
    businessDate: targetDate,
    totalCollection: 0,
    totalCollections: 0,
    cash: 0,
    bank: 0,
    upi: 0,
    card: 0,
    ota: 0,
    cheque: 0,
    transactions: matchedTx,
  };

  for (const tx of transactions) {
    if (normalizeDateString(tx.payment_date) !== targetDate) continue;
    if (tx.status !== 'successful') continue;

    matchedTx.push(tx);
    metrics.totalCollection += tx.amount;

    switch (tx.payment_method) {
      case 'Cash':
        metrics.cash += tx.amount;
        break;
      case 'Bank':
      case 'Gateway':
        metrics.bank += tx.amount;
        break;
      case 'UPI':
        metrics.upi += tx.amount;
        break;
      case 'Card':
        metrics.card += tx.amount;
        break;
      case 'OTA':
        metrics.ota += tx.amount;
        break;
      case 'Cheque':
        metrics.cheque += tx.amount;
        break;
      default:
        metrics.cash += tx.amount;
    }
  }

  metrics.totalCollections = metrics.totalCollection;
  return metrics;
};

export const calculateCashClosing = (params) => {
  const opening = toNum(params.openingCash);
  const collection = toNum(params.cashCollection ?? params.cashCollections);
  const otherInc = toNum(params.otherCashIncome);
  const exp = toNum(params.cashExpenses);
  const salAdv = toNum(params.salaryAdvance);
  const maint = toNum(params.maintenanceBill);
  const handover = toNum(params.cashHandoverMd ?? params.cashHandover);
  const bankDep = toNum(params.bankCashDeposit ?? params.bankDeposit);

  const closing = opening + collection + otherInc - exp - salAdv - maint - handover - bankDep;

  return {
    businessDate: normalizeDateString(params.businessDate),
    openingCash: opening,
    cashCollection: collection,
    otherCashIncome: otherInc,
    cashExpenses: exp,
    salaryAdvance: salAdv,
    maintenanceBill: maint,
    cashHandoverMd: handover,
    bankCashDeposit: bankDep,
    closingCash: closing,
  };
};

export default {
  toNum,
  normalizeDateString,
  generateOccupiedStayNights,
  generateRoomRevenueLedger,
  normalizePaymentMethod,
  reconcilePaymentLedger,
  aggregateDailyRoomRevenue,
  aggregateDailyCollections,
  calculateCashClosing,
  calcStayNights,
  isStayOverlapping,
  isStayOccupiedOnDate,
};
