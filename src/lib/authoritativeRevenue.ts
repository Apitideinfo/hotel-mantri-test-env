/**
 * HOTEL MANTRI — AUTHORITATIVE NIGHT-BY-NIGHT ROOM REVENUE ENGINE
 *
 * Core Financial & Accounting Rule:
 *   ROOM REVENUE IS RECOGNIZED BY OCCUPIED ROOM-NIGHT / BUSINESS DATE.
 *
 * Authoritative stay date interval:
 *   [check_in, check_out)
 *   check_in is INCLUDED (first occupied night).
 *   check_out is EXCLUDED (departure date; NOT an occupied night).
 *
 * Revenue Date != Processing Date != Booking Date != Payment Date:
 *   - Room revenue date is strictly the occupied business/stay date.
 *   - Payment/collection date is strictly the actual payment transaction date.
 *   - Reservation creation/processing date never dictates room revenue date.
 */

import { toNum, calcStayNights } from './calc.ts';
import type { SourceCategory, RoomChartEntry } from './types';
import type { Reservation } from './types-reservations';

export interface AuthoritativeNightlyRevenueEntry {
  id: string; // Unique idempotency key: `${hotel_id}::${reservation_id}::${room_no}::${business_date}`
  reservation_id: string;
  hotel_id: string;
  room_id: string | null;
  room_no: string;
  room_category_id: string | null;
  room_category: string;
  business_date: string; // YYYY-MM-DD (the occupied night)
  rate_plan_id: string | null;
  meal_plan_id: string | null;
  night_rate: number;
  tax_amount: number;
  gross_room_revenue: number;
  net_room_revenue: number;
  currency: string;
  source: string;
  source_category: SourceCategory;
  is_complimentary: boolean;
  guest_name: string;
  created_at: string;
  updated_at: string;
}

export interface AuthoritativeDailyMetrics {
  businessDate: string;
  roomRevenue: number;
  roomsOccupied: number;
  roomsSold: number;
  complimentaryRooms: number;
  arr: number;
  revpar: number;
  otaRevenue: number;
  directRevenue: number;
  corporateRevenue: number;
  phoneRevenue: number;
}

/**
 * Normalizes date string to YYYY-MM-DD format without UTC shift.
 */
export const normalizeDateString = (d?: string | null): string => {
  if (!d) return '';
  return d.trim().slice(0, 10);
};

/**
 * Authoritative stay date night generator:
 * For stay interval [checkIn, checkOut):
 * checkIn is INCLUDED.
 * checkOut is STRICTLY EXCLUDED.
 *
 * If checkIn >= checkOut (day use / same day):
 * returns [checkIn] (single business date).
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

/**
 * Checks if a stay was occupied on a given business date.
 * Business rule: arrival <= date && departure > date.
 * If arrival >= departure (day use): arrival === date.
 */
export const isStayOccupiedOnBusinessDate = (arrival: string, departure: string, targetDate: string): boolean => {
  const arr = normalizeDateString(arrival);
  const dep = normalizeDateString(departure);
  const target = normalizeDateString(targetDate);
  if (!arr || !target) return false;

  if (arr >= dep) {
    return arr === target;
  }
  return arr <= target && dep > target;
};

export interface GenerateNightlyRevenueParams {
  hotelId: string;
  reservations?: Reservation[];
  roomChartEntries?: RoomChartEntry[];
  fromDate?: string;
  toDate?: string;
}

/**
 * Generates the authoritative list of occupied room-night revenue entries.
 *
 * Guarantees:
 * 1. Exactly 1 entry per occupied room per business date.
 * 2. Checkout date is NEVER included.
 * 3. Cancelled and No-Show reservations generate ZERO room revenue.
 * 4. Multi-room bookings generate individual room entries for each room.
 * 5. Standalone room chart entries (not linked to reservations) are incorporated without double-counting.
 * 6. Idempotent: repeated calls produce identical deduplicated entries.
 * 7. Scoped strictly by hotelId (multi-tenant isolation).
 */
export const generateAuthoritativeNightlyRevenue = (
  params: GenerateNightlyRevenueParams
): AuthoritativeNightlyRevenueEntry[] => {
  const { hotelId, reservations = [], roomChartEntries = [], fromDate, toDate } = params;
  if (!hotelId) return [];

  const fromFilter = fromDate ? normalizeDateString(fromDate) : null;
  const toFilter = toDate ? normalizeDateString(toDate) : null;

  const entriesMap = new Map<string, AuthoritativeNightlyRevenueEntry>();

  // 1. Process Authoritative Reservations
  for (const res of reservations) {
    // Multi-tenant check
    if (res.hotel_id && res.hotel_id !== hotelId) continue;

    // Filter out cancelled and no-show bookings
    const status = (res.status || '').toLowerCase();
    if (status === 'cancelled' || status === 'no_show') continue;

    const ci = normalizeDateString(res.check_in_date);
    const co = normalizeDateString(res.check_out_date);
    if (!ci) continue;

    // Quick range bounding
    if (fromFilter && co && co <= fromFilter) continue;
    if (toFilter && ci > toFilter) continue;

    const occupiedNights = generateOccupiedStayNights(ci, co);
    const nightsCount = Math.max(1, occupiedNights.length);
    const isComplimentary = Boolean(
      (res as any).is_complimentary ||
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

    const variableRates: Record<string, number> = (res as any).variable_nightly_rates || {};

    const roomNo = res.room_no || 'Unassigned';
    const sourceCategory = (res.source_category as SourceCategory) || 'Direct/Walking';
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
        room_category_id: (res as any).room_category_id || null,
        room_category: (res as any).room_category || 'Standard',
        business_date: nightDate,
        rate_plan_id: (res as any).rate_plan_id || null,
        meal_plan_id: (res as any).meal_plan_id || null,
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

  // 2. Process Standalone Room Chart Entries (not linked to an existing reservation)
  const linkedReservationIds = new Set(
    Array.from(entriesMap.values()).map((e) => e.reservation_id)
  );

  for (const entry of roomChartEntries) {
    if (entry.hotel_id && entry.hotel_id !== hotelId) continue;
    if (entry.reservation_id && linkedReservationIds.has(entry.reservation_id)) continue;

    // Skip non-room revenue entries (e.g. F&B or misc entries)
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
    const sourceCategory = (entry.source_category as SourceCategory) || 'Direct/Walking';
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
          created_at: (entry as any).created_at || new Date().toISOString(),
          updated_at: (entry as any).updated_at || new Date().toISOString(),
        });
      }
    }
  }

  return Array.from(entriesMap.values()).sort((a, b) =>
    a.business_date.localeCompare(b.business_date) || a.room_no.localeCompare(b.room_no)
  );
};

/**
 * Authoritative daily revenue and occupancy metrics for a given business date.
 */
export const getAuthoritativeDailyMetrics = (
  entries: AuthoritativeNightlyRevenueEntry[],
  businessDate: string,
  totalRooms: number
): AuthoritativeDailyMetrics => {
  const target = normalizeDateString(businessDate);
  const metrics: AuthoritativeDailyMetrics = {
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

  // ARR = applicable room revenue / applicable occupied/sold room nights
  metrics.arr = metrics.roomsSold > 0 ? metrics.roomRevenue / metrics.roomsSold : 0;

  // RevPAR = room revenue recognized on D / available rooms on D
  metrics.revpar = totalRooms > 0 ? metrics.roomRevenue / totalRooms : 0;

  return metrics;
};

export default {
  normalizeDateString,
  generateOccupiedStayNights,
  isStayOccupiedOnBusinessDate,
  generateAuthoritativeNightlyRevenue,
  getAuthoritativeDailyMetrics,
};
