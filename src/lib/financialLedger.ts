/**
 * HOTEL MANTRI — CANONICAL FINANCIAL LEDGER ENGINE
 *
 * Source of Truth for:
 * 1. ROOM REVENUE BY OCCUPIED BUSINESS DATE
 * 2. PAYMENT / COLLECTION BY ACTUAL PAYMENT DATE
 *
 * Fundamental Architectural Rule:
 *   A reservation represents a stay.
 *   A payment represents a financial transaction.
 *   They are independent and must NEVER be derived from each other.
 *
 * Occupied Room Nights Interval:
 *   [checkIn, checkOut)
 *   checkIn is INCLUDED (first occupied night).
 *   checkOut is EXCLUDED (departure date; NOT an occupied night).
 */

import { toNum, calcStayNights } from './calc';
import type { SourceCategory } from './types';

// ── Types ───────────────────────────────────────────────────────────────────

export type FinancialPaymentMethod = 'Cash' | 'Bank' | 'UPI' | 'Card' | 'OTA' | 'Cheque' | 'Gateway';

export interface RoomRevenueLedgerEntry {
  id?: string;
  reservation_id?: string | null;
  reservation_room_id?: string | null;
  entry_id?: string | null;
  hotel_id: string;
  business_date: string; // YYYY-MM-DD (the occupied night)
  room_no: string;
  room_category: string;
  rate_plan?: string;
  guest_name: string;
  amount: number; // nightly room revenue (excluding tax)
  tax_amount: number;
  taxable_amount: number;
  source_category: SourceCategory;
  source_name: string;
  is_complimentary: boolean;
  meal_plan: string;
}

export interface PaymentTransaction {
  id: string;
  hotel_id: string;
  reservation_id?: string | null;
  entry_id?: string | null;
  payment_date: string; // YYYY-MM-DD (the actual transaction date)
  business_date: string; // YYYY-MM-DD
  amount: number;
  payment_method: FinancialPaymentMethod;
  reference?: string;
  source?: string;
  status: 'successful' | 'refunded' | 'pending' | 'failed';
  notes?: string;
  performed_by?: string;
  created_at: string;
}

// ── Date & Timezone Utilities ────────────────────────────────────────────────

/**
 * Normalizes date string to YYYY-MM-DD format without UTC shifting.
 */
export const normalizeDateString = (d?: string | null): string => {
  if (!d) return '';
  return d.trim().slice(0, 10);
};

/**
 * Generates array of occupied stay night dates [checkIn, checkOut).
 * Departure date is STRICTLY EXCLUDED.
 * If checkIn === checkOut (day use), returns [checkIn].
 */
export const generateOccupiedStayNights = (checkIn: string, checkOut: string): string[] => {
  const nights: string[] = [];
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

// ── Room Revenue Ledger Engine ──────────────────────────────────────────────

export interface StayInput {
  id?: string;
  reservation_id?: string;
  entry_id?: string;
  hotel_id: string;
  check_in_date: string;
  check_out_date: string;
  room_no?: string;
  room_category?: string;
  rate_plan?: string;
  guest_name?: string;
  rate?: number;
  invoice_total?: number;
  taxable_amount?: number;
  gst_amount?: number;
  source_category?: SourceCategory;
  source_name?: string;
  is_complimentary?: boolean;
  meal_plan?: string;
  variable_nightly_rates?: Record<string, number>;
}

/**
 * Generates authoritative Room Revenue Ledger entries for a stay.
 * Distributes revenue strictly across occupied nights [checkIn, checkOut).
 * Supports variable nightly rates and multi-room splits.
 */
export const generateRoomRevenueLedger = (stay: StayInput): RoomRevenueLedgerEntry[] => {
  const entries: RoomRevenueLedgerEntry[] = [];
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

// ── Payment / Collection Ledger Engine ──────────────────────────────────────

/**
 * Normalizes payment mode to canonical FinancialPaymentMethod.
 */
export const normalizePaymentMethod = (mode?: string | null): FinancialPaymentMethod => {
  if (!mode) return 'Cash';
  const m = mode.trim().toLowerCase();
  if (m.includes('cash')) return 'Cash';
  if (m.includes('upi') || m.includes('gpay') || m.includes('phonepe') || m.includes('paytm')) return 'UPI';
  if (m.includes('card') || m.includes('visa') || m.includes('master') || m.includes('pos')) return 'Card';
  if (m.includes('ota') || m.includes('mmt') || m.includes('booking') || m.includes('agoda') || m.includes('goibibo')) return 'OTA';
  if (m.includes('cheque')) return 'Cheque';
  return 'Bank';
};

/**
 * Reconciles payment transactions from timeline events, reservations, and room chart entries.
 * Strictly prevents future payments or full reservation balances from bleeding into today's collection.
 */
export const reconcilePaymentLedger = ({
  timelineEvents = [],
  reservations = [],
  roomChartEntries = [],
  hotelId,
}: {
  timelineEvents?: any[];
  reservations?: any[];
  roomChartEntries?: any[];
  hotelId?: string;
}): PaymentTransaction[] => {
  const transactions: PaymentTransaction[] = [];
  const processedKeys = new Set<string>();

  // 1. Process explicit timeline events (highest fidelity)
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

  // 2. Process reservation advance payments (attributed to reservation created_at date)
  for (const res of reservations) {
    const adv = toNum(res.advance_paid);
    if (adv <= 0) continue;

    // Check if already captured via timeline
    const timelineHasRes = timelineEvents.some(
      (te) => te.reservation_id === res.id && te.event_amount === adv
    );
    if (timelineHasRes) continue;

    // Advance payment occurred when booking was created, NOT at check-in
    const bookingDate = normalizeDateString(res.created_at || res.check_in_date);
    const method = normalizePaymentMethod(res.payment_mode || 'Cash');

    const key = `res_adv::${res.id}::${adv}`;
    if (!processedKeys.has(key)) {
      processedKeys.add(key);

      // If specific split columns are logged on reservation
      const cash = toNum(res.pay_cash);
      const upi = toNum(res.pay_upi);
      const card = toNum(res.pay_card);
      const bank = toNum(res.pay_bank);

      if (cash > 0 || upi > 0 || card > 0 || bank > 0) {
        if (cash > 0) {
          transactions.push({
            id: `res_cash_${res.id}`,
            hotel_id: res.hotel_id || hotelId || '',
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
            hotel_id: res.hotel_id || hotelId || '',
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
            hotel_id: res.hotel_id || hotelId || '',
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
            hotel_id: res.hotel_id || hotelId || '',
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
          hotel_id: res.hotel_id || hotelId || '',
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
          hotel_id: entry.hotel_id || hotelId || '',
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
          hotel_id: entry.hotel_id || hotelId || '',
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
          hotel_id: entry.hotel_id || hotelId || '',
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
          hotel_id: entry.hotel_id || hotelId || '',
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
          hotel_id: entry.hotel_id || hotelId || '',
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

// ── Daily Financial Aggregators ─────────────────────────────────────────────

export interface DailyRevenueMetrics {
  businessDate: string;
  roomRevenue: number;
  totalRoomRevenue?: number;
  otaRevenue: number;
  directRevenue: number;
  corporateRevenue: number;
  phoneRevenue: number;
  taxableRevenue: number;
  gstCollected: number;
  roomsOccupied: number;
  occupiedRooms?: number;
  complimentaryRooms: number;
}

export const aggregateDailyRoomRevenue = (
  ledgerEntries: RoomRevenueLedgerEntry[],
  businessDate: string
): DailyRevenueMetrics => {
  const targetDate = normalizeDateString(businessDate);
  const metrics: DailyRevenueMetrics = {
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

export interface DailyCollectionMetrics {
  businessDate: string;
  totalCollection: number;
  totalCollections?: number;
  cash: number;
  bank: number;
  upi: number;
  card: number;
  ota: number;
  cheque: number;
  transactions?: PaymentTransaction[];
}

export const aggregateDailyCollections = (
  transactions: PaymentTransaction[],
  businessDate: string
): DailyCollectionMetrics => {
  const targetDate = normalizeDateString(businessDate);
  const matchedTx: PaymentTransaction[] = [];
  const metrics: DailyCollectionMetrics = {
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

// ── Daily Cash Closing Formula Engine ───────────────────────────────────────

export interface CashClosingCalculation {
  businessDate: string;
  openingCash: number;
  cashCollection: number;
  otherCashIncome: number;
  cashExpenses: number;
  salaryAdvance: number;
  maintenanceBill: number;
  cashHandoverMd: number;
  bankCashDeposit: number;
  closingCash: number;
}

/**
 * Authoritative Daily Cash Closing Formula:
 *
 *   Opening Cash
 *   + Cash Collections for THIS business date
 *   + Other Cash Income for THIS business date
 *   - Cash Expenses for THIS business date
 *   - Salary Advance for THIS business date
 *   - Cash Handover MD for THIS business date
 *   - Bank Cash Deposit for THIS business date
 *   = Closing Cash
 *
 * Guaranteed:
 *   - Future payments NEVER enter today's closing.
 *   - Future revenue NEVER enters today's closing.
 *   - Total reservation amount is NEVER treated as today's cash.
 */
export const calculateCashClosing = (params: {
  businessDate?: string;
  openingCash: number;
  cashCollection?: number;
  cashCollections?: number;
  otherCashIncome?: number;
  cashExpenses?: number;
  salaryAdvance?: number;
  maintenanceBill?: number;
  cashHandoverMd?: number;
  cashHandover?: number;
  bankCashDeposit?: number;
  bankDeposit?: number;
}): CashClosingCalculation => {
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
  normalizeDateString,
  generateOccupiedStayNights,
  generateRoomRevenueLedger,
  normalizePaymentMethod,
  reconcilePaymentLedger,
  aggregateDailyRoomRevenue,
  aggregateDailyCollections,
  calculateCashClosing,
};
