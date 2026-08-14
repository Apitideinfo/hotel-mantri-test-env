import type { DailyReport, DailyReportInput, RoomChartEntry, OtherDailyEntriesInput, SourceCategory, DerivedReport, GstMode, GstType, GstSlab, MtdYtdData, CashFlowData } from './types';

export const toNum = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const fmtMoney = (n: number): string => {
  const v = toNum(n);
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const fmtInt = (n: number): string => {
  const v = Math.round(toNum(n));
  return v.toLocaleString('en-IN');
};

export const calcArr = (roomSale: number, roomsOccupied: number): number =>
  roomsOccupied > 0 ? toNum(roomSale) / roomsOccupied : 0;

export const calcOcc = (roomsOccupied: number, totalRooms: number): number =>
  totalRooms > 0 ? (toNum(roomsOccupied) / totalRooms) * 100 : 0;

export const calcTotalRevenue = (r: { room_sale_amount: number; kitchen: number; other_income: number; other_revenue_entries?: number }): number =>
  toNum(r.room_sale_amount) + toNum(r.kitchen) + toNum(r.other_income) + toNum(r.other_revenue_entries);

export const calcTotalExpenses = (r: { housekeeping_supply: number; other_expense: number; maintenance_bill: number; finance_expenses?: number }): number =>
  toNum(r.housekeeping_supply) + toNum(r.other_expense) + toNum(r.maintenance_bill) + toNum(r.finance_expenses);

// Closing rooms = total rooms - rooms occupied (for tomorrow's status)
export const calcClosingRooms = (roomsOccupied: number, totalRooms: number): number =>
  Math.max(0, totalRooms - toNum(roomsOccupied));

export interface SummaryRow {
  label: string;
  value: string;
}

export interface ReportSummary {
  arr: number;
  occ: number;
  totalRevenue: number;
  totalExpenses: number;
  closingRooms: number;
  cashClosing: number;
}

export const summarize = (r: DailyReport | DailyReportInput, totalRooms: number): ReportSummary => ({
  arr: calcArr(r.room_sale_amount, r.rooms_occupied),
  occ: calcOcc(r.rooms_occupied, totalRooms),
  totalRevenue: calcTotalRevenue(r),
  totalExpenses: calcTotalExpenses(r),
  closingRooms: calcClosingRooms(r.rooms_occupied, totalRooms),
  cashClosing: toNum((r as DailyReport).cash_closing),
});

// Cash closing = previous cash closing + cash + other income - total expenses - salary advance
//               - maintenance bill - cash handover - bank cash deposit.
// Room revenue is NOT double counted (room sale is collected via `cash`/`bank` already).
export const calcCashClosing = (
  prevClosing: number,
  r: { cash: number; other_income: number; housekeeping_supply: number; other_expense: number;
       salary_advance: number; maintenance_bill: number; cash_handover_md: number; bank_cash_deposit: number }
): number =>
  toNum(prevClosing)
  + toNum(r.cash)
  + toNum(r.other_income)
  - toNum(r.housekeeping_supply)
  - toNum(r.other_expense)
  - toNum(r.salary_advance)
  - toNum(r.maintenance_bill)
  - toNum(r.cash_handover_md)
  - toNum(r.bank_cash_deposit);

export interface PeriodAggregate {
  totalRooms: number;
  roomsSold: number;
  dayUseRoom: number;
  complimentary: number;
  arr: number;
  occ: number;
  roomRevenue: number;
  fbRevenue: number;
  miscRevenue: number;
  totalRevenue: number;
}

export const aggregatePeriod = (reports: DailyReport[], totalRooms: number, periodDays: number): PeriodAggregate => {
  let roomsSold = 0;
  let complimentary = 0;
  let roomRevenue = 0;
  let fbRevenue = 0;
  let miscRevenue = 0;
  for (const r of reports) {
    roomsSold += toNum(r.rooms_occupied);
    complimentary += toNum(r.complimentary_room);
    roomRevenue += toNum(r.room_sale_amount);
    fbRevenue += toNum(r.kitchen);
    miscRevenue += toNum(r.other_income);
  }
  const totalRevenue = roomRevenue + fbRevenue + miscRevenue;
  const arr = roomsSold > 0 ? roomRevenue / roomsSold : 0;
  const occ = totalRooms > 0 && periodDays > 0 ? (roomsSold / (totalRooms * periodDays)) * 100 : 0;
  return {
    totalRooms,
    roomsSold,
    dayUseRoom: 0,
    complimentary,
    arr,
    occ,
    roomRevenue,
    fbRevenue,
    miscRevenue,
    totalRevenue,
  };
};

export const daysInMonth = (year: number, month: number): number =>
  new Date(year, month, 0).getDate();

// YTD days = Jan 1 through selected date inclusive
export const ytdDays = (date: Date): number => {
  const start = new Date(date.getFullYear(), 0, 1);
  const ms = date.getTime() - start.getTime();
  return Math.floor(ms / 86400000) + 1;
};

// ---- GST helpers ----

// Given an entered amount, GST type, and slab, compute taxable_amount, gst_amount, and invoice_total.
// No Scope:   gst = 0, taxable = entered, invoice_total = entered
// Inclusive:  entered already includes GST. taxable = entered / (1 + slab/100), gst = entered - taxable, invoice_total = entered
// Exclusive:  entered excludes GST. taxable = entered, gst = entered * slab/100, invoice_total = entered + gst
export const calcGstFull = (
  enteredAmount: number, gstType: GstType, slab: GstSlab
): { taxable: number; gst: number; invoiceTotal: number } => {
  const t = toNum(enteredAmount);
  const s = toNum(slab);
  if (gstType === 'No Scope' || s === 0) return { taxable: t, gst: 0, invoiceTotal: t };
  if (gstType === 'Inclusive') {
    const taxable = t / (1 + s / 100);
    return { taxable, gst: t - taxable, invoiceTotal: t };
  }
  // Exclusive
  const gst = t * (s / 100);
  return { taxable: t, gst, invoiceTotal: t + gst };
};

// Backward-compatible calcGst — returns { taxable, gst } using the old GstMode.
export const calcGst = (total: number, mode: GstMode, slab: GstSlab): { taxable: number; gst: number } => {
  const r = calcGstFull(total, mode, slab);
  return { taxable: r.taxable, gst: r.gst };
};

// Map GstType to GstMode for backward compatibility (No Scope -> Exclusive with slab 0)
export const gstTypeToMode = (t: GstType): GstMode => t === 'No Scope' ? 'Exclusive' : t;

// Split GST into CGST+SGST (intra-state) or IGST (inter-state).
// For simplicity, we compute both: CGST = SGST = gst/2, IGST = gst.
// The report screen decides which to display based on hotel state.
export const splitGst = (gst: number): { cgst: number; sgst: number; igst: number } => {
  const g = toNum(gst);
  return { cgst: g / 2, sgst: g / 2, igst: g };
};

// ---- Room Chart aggregation ----

export interface RoomChartAggregate {
  roomsOccupied: number;
  complimentary: number;
  roomRevenue: number;
  ota: number;
  directWalking: number;
  corporateAgent: number;
  phonebook: number;
  cash: number;
  bank: number;
  departures: number;
  expectedArrivals: number;
  // GST
  taxableRevenue: number;
  gstCollected: number;
  // Split payments
  payCash: number;
  payUpi: number;
  payCard: number;
  payBank: number;
  payAdvance: number;
  payBalance: number;
}

const SOURCE_KEYS: Record<SourceCategory, keyof RoomChartAggregate> = {
  'OTA': 'ota',
  'Direct/Walking': 'directWalking',
  'Corporate/Agent': 'corporateAgent',
  'Phonebook': 'phonebook',
};

export const aggregateRoomChart = (entries: RoomChartEntry[]): RoomChartAggregate => {
  const agg: RoomChartAggregate = {
    roomsOccupied: 0, complimentary: 0, roomRevenue: 0,
    ota: 0, directWalking: 0, corporateAgent: 0, phonebook: 0,
    cash: 0, bank: 0, departures: 0, expectedArrivals: 0,
    taxableRevenue: 0, gstCollected: 0,
    payCash: 0, payUpi: 0, payCard: 0, payBank: 0, payAdvance: 0, payBalance: 0,
  };
  for (const e of entries) {
    if (e.is_complimentary) {
      agg.complimentary += 1;
    } else {
      agg.roomsOccupied += 1;
      const amt = toNum(e.total) > 0 ? toNum(e.total) : toNum(e.room_rate);
      agg.roomRevenue += amt;
      const key = SOURCE_KEYS[e.source_category] ?? 'directWalking';
      (agg[key] as number) += amt;
      // GST
      agg.taxableRevenue += toNum(e.taxable_amount);
      agg.gstCollected += toNum(e.gst_amount);
      // Split payments
      agg.payCash += toNum(e.pay_cash);
      agg.payUpi += toNum(e.pay_upi);
      agg.payCard += toNum(e.pay_card);
      agg.payBank += toNum(e.pay_bank);
      agg.payAdvance += toNum(e.pay_advance);
      agg.payBalance += toNum(e.pay_balance);
    }
    if (!e.is_complimentary) {
      agg.cash += toNum(e.pay_cash);
      agg.bank += toNum(e.pay_upi) + toNum(e.pay_card) + toNum(e.pay_bank);
    }
  }
  return agg;
};

// ── Category-wise occupancy (future-ready) ──────────────────────────────────

export interface CategoryOccupancy {
  category: string;
  totalRooms: number;
  occupied: number;
  occPercent: number;
}

export const aggregateByCategory = (
  entries: RoomChartEntry[],
  categories: { name: string; is_active: boolean }[],
  totalRooms: number,
): CategoryOccupancy[] => {
  const catMap = new Map<string, { total: number; occupied: number }>();
  for (const c of categories) {
    if (c.is_active) catMap.set(c.name, { total: 0, occupied: 0 });
  }
  for (const e of entries) {
    const cat = e.room_category || 'Standard';
    if (!catMap.has(cat)) catMap.set(cat, { total: 0, occupied: 0 });
    const entry = catMap.get(cat)!;
    entry.total += 1;
    if (!e.is_complimentary) entry.occupied += 1;
  }
  return Array.from(catMap.entries())
    .map(([category, v]) => ({
      category,
      totalRooms: v.total,
      occupied: v.occupied,
      occPercent: v.total > 0 ? (v.occupied / v.total) * 100 : 0,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
};

// Departures today = entries whose departure == report_date.
// Expected arrivals tomorrow = entries whose arrival == report_date + 1 (not yet checked in).
export const calcTomorrowStatus = (entries: RoomChartEntry[], reportDate: string) => {
  const next = new Date(reportDate + 'T00:00:00');
  next.setDate(next.getDate() + 1);
  const nextStr = next.toISOString().slice(0, 10);
  let departures = 0;
  let expectedArrivals = 0;
  for (const e of entries) {
    if (e.departure && e.departure === reportDate) departures += 1;
  }
  // Expected arrivals: entries dated tomorrow (arrival == nextStr). These represent
  // bookings for the next night that will check in tomorrow.
  for (const e of entries) {
    if (e.arrival && e.arrival === nextStr) expectedArrivals += 1;
  }
  return { departures, expectedArrivals };
};

// Build a DerivedReport from room chart entries + other entries + prev cash closing.
// financeExpenses is an optional list of { category, amount } from the Finance Management
// module (expense_entries table). Overlapping categories already captured in Other Daily
// Entries (Housekeeping, Maintenance, Salary Advance, Salary) are excluded to prevent
// double counting.
const OVERLAP_CATEGORIES = new Set(['Housekeeping', 'Housekeeping Supply', 'Maintenance', 'Maintenance Bill', 'Salary', 'Salary Advance']);

export const buildDerivedReport = (
  date: string,
  entries: RoomChartEntry[],
  other: OtherDailyEntriesInput,
  prevClosing: number,
  totalRooms: number,
  financeExpenses?: { category: string; amount: number }[],
  otherRevenueEntries?: { category: string; amount: number }[],
): DerivedReport => {
  const agg = aggregateRoomChart(entries);
  const { departures, expectedArrivals } = calcTomorrowStatus(entries, date);

  // Aggregate finance expenses, skipping categories already tracked in Other Daily Entries
  const financeCatMap = new Map<string, number>();
  let financeExpensesTotal = 0;
  for (const fe of financeExpenses ?? []) {
    const cat = fe.category ?? 'Other';
    if (OVERLAP_CATEGORIES.has(cat)) continue;
    const amt = toNum(fe.amount);
    financeExpensesTotal += amt;
    financeCatMap.set(cat, (financeCatMap.get(cat) ?? 0) + amt);
  }
  const financeExpenseByCategory = Array.from(financeCatMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  // Aggregate other revenue entries (from daily_revenue_entries table)
  const revenueCatMap = new Map<string, number>();
  let otherRevenueTotal = 0;
  for (const re of otherRevenueEntries ?? []) {
    const cat = re.category ?? 'Other Income';
    const amt = toNum(re.amount);
    otherRevenueTotal += amt;
    revenueCatMap.set(cat, (revenueCatMap.get(cat) ?? 0) + amt);
  }
  const otherRevenueByCategory = Array.from(revenueCatMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const totalExpenses = toNum(other.housekeeping_supply) + toNum(other.other_expense) + toNum(other.maintenance_bill) + financeExpensesTotal;
  const cashClosing =
    prevClosing + agg.cash + toNum(other.other_income) + otherRevenueTotal - totalExpenses
    - toNum(other.salary_advance)
    - toNum(other.cash_handover_md) - toNum(other.bank_cash_deposit);
  const occupiedForOcc = agg.roomsOccupied + agg.complimentary;
  const arr = agg.roomsOccupied > 0 ? agg.roomRevenue / agg.roomsOccupied : 0;
  const occ = totalRooms > 0 ? (occupiedForOcc / totalRooms) * 100 : 0;
  const revpar = totalRooms > 0 ? agg.roomRevenue / totalRooms : 0;
  const gstSplit = splitGst(agg.gstCollected);
  const netRevenue = agg.roomRevenue - agg.gstCollected;
  const invoiceTotal = agg.roomRevenue;
  // Revenue breakup by category
  const roomRevenueCat = entries
    .filter((e) => !e.is_complimentary && (e.revenue_category || 'Room Revenue') === 'Room Revenue')
    .reduce((s, e) => s + (toNum(e.invoice_total) > 0 ? toNum(e.invoice_total) : (toNum(e.total) > 0 ? toNum(e.total) : toNum(e.room_rate))), 0);
  const fbRevenueCat = entries
    .filter((e) => !e.is_complimentary && (e.revenue_category) === 'F&B Revenue')
    .reduce((s, e) => s + (toNum(e.invoice_total) > 0 ? toNum(e.invoice_total) : (toNum(e.total) > 0 ? toNum(e.total) : toNum(e.room_rate))), 0);
  const miscRevenueCat = entries
    .filter((e) => !e.is_complimentary && (e.revenue_category) === 'Misc Revenue')
    .reduce((s, e) => s + (toNum(e.invoice_total) > 0 ? toNum(e.invoice_total) : (toNum(e.total) > 0 ? toNum(e.total) : toNum(e.room_rate))), 0);
  return {
    report_date: date,
    rooms_occupied: agg.roomsOccupied + agg.complimentary,
    complimentary_room: agg.complimentary,
    room_sale_amount: agg.roomRevenue,
    ota: agg.ota,
    direct_walking: agg.directWalking,
    corporate_agent: agg.corporateAgent,
    phonebook: agg.phonebook,
    kitchen: toNum(other.kitchen),
    other_income: toNum(other.other_income),
    housekeeping_supply: toNum(other.housekeeping_supply),
    other_expense: toNum(other.other_expense),
    cash: agg.cash,
    bank: agg.bank,
    salary_advance: toNum(other.salary_advance),
    maintenance_bill: toNum(other.maintenance_bill),
    cash_handover_md: toNum(other.cash_handover_md),
    bank_cash_deposit: toNum(other.bank_cash_deposit),
    departure: departures,
    expected_arrival: expectedArrivals,
    expected_arr: 0,
    cash_closing: cashClosing,
    taxable_revenue: agg.taxableRevenue,
    gst_collected: agg.gstCollected,
    cgst: gstSplit.cgst,
    sgst: gstSplit.sgst,
    igst: gstSplit.igst,
    net_revenue: netRevenue,
    invoice_total: invoiceTotal,
    room_revenue: roomRevenueCat,
    fb_revenue: fbRevenueCat,
    misc_revenue: miscRevenueCat,
    pay_cash: agg.payCash,
    pay_upi: agg.payUpi,
    pay_card: agg.payCard,
    pay_bank: agg.payBank,
    pay_advance: agg.payAdvance,
    pay_balance: agg.payBalance,
    finance_expenses: financeExpensesTotal,
    finance_expense_by_category: financeExpenseByCategory,
    other_revenue_entries: otherRevenueTotal,
    other_revenue_by_category: otherRevenueByCategory,
    day_status: 'open' as const,
    report_version: 0,
  };
};

// ── MTD/YTD Engine ──────────────────────────────────────────────────────────
// MTD = Yesterday MTD + Today's Daily. ARR, Occupancy, RevPAR are RECALCULATED.
// YTD = Yesterday YTD + Today's Daily. Same recalculation rule.

export const buildMtdYtdFromDaily = (
  daily: DerivedReport,
  prevMtd: MtdYtdData | null,
  prevYtd: MtdYtdData | null,
  totalRooms: number,
  mtdDays: number,
  ytdDays: number,
): { mtd: MtdYtdData; ytd: MtdYtdData } => {
  const pMtd = prevMtd ?? {
    total_rooms: totalRooms, rooms_sold: 0, complimentary: 0, day_use: 0,
    room_revenue: 0, fb_revenue: 0, misc_revenue: 0, total_revenue: 0,
    cash_collection: 0, upi: 0, card: 0, bank: 0,
    ota: 0, corporate: 0, phone_booking: 0,
    expenses: 0, gst: 0, electricity_units: 0,
    arr: 0, occupancy: 0, revpar: 0,
  };
  const pYtd = prevYtd ?? {
    total_rooms: totalRooms, rooms_sold: 0, complimentary: 0, day_use: 0,
    room_revenue: 0, fb_revenue: 0, misc_revenue: 0, total_revenue: 0,
    cash_collection: 0, upi: 0, card: 0, bank: 0,
    ota: 0, corporate: 0, phone_booking: 0,
    expenses: 0, gst: 0, electricity_units: 0,
    arr: 0, occupancy: 0, revpar: 0,
  };

  // Today's daily values
  const dRoomsSold = daily.rooms_occupied - daily.complimentary_room;
  const dComplimentary = daily.complimentary_room;
  const dRoomRevenue = daily.room_sale_amount;
  const dFbRevenue = daily.kitchen;
  const dMiscRevenue = daily.other_income;
  const dCashCollection = daily.pay_cash;
  const dUpi = daily.pay_upi;
  const dCard = daily.pay_card;
  const dBank = daily.pay_bank;
  const dOta = daily.ota;
  const dCorporate = daily.corporate_agent;
  const dPhoneBooking = daily.phonebook;
  const dExpenses = toNum(daily.housekeeping_supply) + toNum(daily.other_expense) + toNum(daily.maintenance_bill) + toNum(daily.finance_expenses);
  const dGst = daily.gst_collected;

  // MTD: add daily to prev MTD, then recalculate ratios
  const mtd: MtdYtdData = {
    total_rooms: totalRooms,
    rooms_sold: pMtd.rooms_sold + dRoomsSold,
    complimentary: pMtd.complimentary + dComplimentary,
    day_use: pMtd.day_use,
    room_revenue: pMtd.room_revenue + dRoomRevenue,
    fb_revenue: pMtd.fb_revenue + dFbRevenue,
    misc_revenue: pMtd.misc_revenue + dMiscRevenue,
    total_revenue: pMtd.total_revenue + dRoomRevenue + dFbRevenue + dMiscRevenue + toNum(daily.other_revenue_entries),
    cash_collection: pMtd.cash_collection + dCashCollection,
    upi: pMtd.upi + dUpi,
    card: pMtd.card + dCard,
    bank: pMtd.bank + dBank,
    ota: pMtd.ota + dOta,
    corporate: pMtd.corporate + dCorporate,
    phone_booking: pMtd.phone_booking + dPhoneBooking,
    expenses: pMtd.expenses + dExpenses,
    gst: pMtd.gst + dGst,
    electricity_units: pMtd.electricity_units,
    arr: 0, occupancy: 0, revpar: 0, // recalculated below
  };
  mtd.arr = mtd.rooms_sold > 0 ? mtd.room_revenue / mtd.rooms_sold : 0;
  mtd.occupancy = totalRooms > 0 && mtdDays > 0 ? (mtd.rooms_sold / (totalRooms * mtdDays)) * 100 : 0;
  mtd.revpar = totalRooms > 0 && mtdDays > 0 ? mtd.room_revenue / (totalRooms * mtdDays) : 0;

  // YTD: add daily to prev YTD, then recalculate ratios
  const ytd: MtdYtdData = {
    total_rooms: totalRooms,
    rooms_sold: pYtd.rooms_sold + dRoomsSold,
    complimentary: pYtd.complimentary + dComplimentary,
    day_use: pYtd.day_use,
    room_revenue: pYtd.room_revenue + dRoomRevenue,
    fb_revenue: pYtd.fb_revenue + dFbRevenue,
    misc_revenue: pYtd.misc_revenue + dMiscRevenue,
    total_revenue: pYtd.total_revenue + dRoomRevenue + dFbRevenue + dMiscRevenue + toNum(daily.other_revenue_entries),
    cash_collection: pYtd.cash_collection + dCashCollection,
    upi: pYtd.upi + dUpi,
    card: pYtd.card + dCard,
    bank: pYtd.bank + dBank,
    ota: pYtd.ota + dOta,
    corporate: pYtd.corporate + dCorporate,
    phone_booking: pYtd.phone_booking + dPhoneBooking,
    expenses: pYtd.expenses + dExpenses,
    gst: pYtd.gst + dGst,
    electricity_units: pYtd.electricity_units,
    arr: 0, occupancy: 0, revpar: 0,
  };
  ytd.arr = ytd.rooms_sold > 0 ? ytd.room_revenue / ytd.rooms_sold : 0;
  ytd.occupancy = totalRooms > 0 && ytdDays > 0 ? (ytd.rooms_sold / (totalRooms * ytdDays)) * 100 : 0;
  ytd.revpar = totalRooms > 0 && ytdDays > 0 ? ytd.room_revenue / (totalRooms * ytdDays) : 0;

  return { mtd, ytd };
};

// ── Cash Flow Engine ─────────────────────────────────────────────────────────
// Opening Cash + Cash Collection - Cash Expenses - Salary Advance - Cash Handover - Bank Deposit = Cash Closing
// Next Business Day Opening Cash = Previous Day Cash Closing

export const buildCashFlow = (
  openingCash: number,
  daily: DerivedReport,
): CashFlowData => {
  const cashCollection = toNum(daily.pay_cash);
  const cashExpenses = toNum(daily.housekeeping_supply) + toNum(daily.other_expense) + toNum(daily.maintenance_bill) + toNum(daily.finance_expenses);
  const salaryAdvance = toNum(daily.salary_advance);
  const cashHandover = toNum(daily.cash_handover_md);
  const bankDeposit = toNum(daily.bank_cash_deposit);
  const cashClosing =
    toNum(openingCash) + cashCollection - cashExpenses - salaryAdvance - cashHandover - bankDeposit;
  return {
    opening_cash: toNum(openingCash),
    cash_collection: cashCollection,
    cash_expenses: cashExpenses,
    salary_advance: salaryAdvance,
    cash_handover: cashHandover,
    bank_deposit: bankDeposit,
    cash_closing: cashClosing,
  };
};

import { getCurrentHotelId } from './api';

// Convert a DerivedReport to the legacy DailyReport shape (for existing screens).
export const derivedToDaily = (d: DerivedReport, id: string = ''): DailyReport => ({
  id, hotel_id: getCurrentHotelId(), ...d,
});

// Aggregate a set of derived reports for MTD/YTD.
export const aggregateDerived = (reports: DerivedReport[], totalRooms: number, periodDays: number) => {
  let roomsSold = 0;
  let complimentary = 0;
  let roomRevenue = 0;
  let fbRevenue = 0;
  let miscRevenue = 0;
  let ota = 0, direct = 0, corp = 0, phone = 0;
  let cash = 0, bank = 0;
  let taxableRevenue = 0, gstCollected = 0, netRevenue = 0;
  let payCash = 0, payUpi = 0, payCard = 0, payBank = 0, payAdvance = 0, payBalance = 0;
  let financeExpenses = 0, otherRevenueEntries = 0;
  const financeCatMap = new Map<string, number>();
  const revenueCatMap = new Map<string, number>();
  for (const r of reports) {
    roomsSold += r.rooms_occupied - r.complimentary_room;
    complimentary += r.complimentary_room;
    roomRevenue += r.room_sale_amount;
    fbRevenue += r.kitchen;
    miscRevenue += r.other_income;
    ota += r.ota; direct += r.direct_walking; corp += r.corporate_agent; phone += r.phonebook;
    cash += toNum(r.pay_cash);
    bank += toNum(r.pay_upi) + toNum(r.pay_card) + toNum(r.pay_bank);
    taxableRevenue += toNum(r.taxable_revenue);
    gstCollected += toNum(r.gst_collected);
    netRevenue += toNum(r.net_revenue);
    payCash += toNum(r.pay_cash);
    payUpi += toNum(r.pay_upi);
    payCard += toNum(r.pay_card);
    payBank += toNum(r.pay_bank);
    payAdvance += toNum(r.pay_advance);
    payBalance += toNum(r.pay_balance);
    financeExpenses += toNum(r.finance_expenses);
    otherRevenueEntries += toNum(r.other_revenue_entries);
    for (const c of r.finance_expense_by_category ?? []) {
      financeCatMap.set(c.category, (financeCatMap.get(c.category) ?? 0) + toNum(c.amount));
    }
    for (const c of r.other_revenue_by_category ?? []) {
      revenueCatMap.set(c.category, (revenueCatMap.get(c.category) ?? 0) + toNum(c.amount));
    }
  }
  const totalRevenue = roomRevenue + fbRevenue + miscRevenue + otherRevenueEntries;
  const arr = roomsSold > 0 ? roomRevenue / roomsSold : 0;
  const occ = totalRooms > 0 && periodDays > 0 ? (roomsSold / (totalRooms * periodDays)) * 100 : 0;
  const revpar = totalRooms > 0 && periodDays > 0 ? roomRevenue / (totalRooms * periodDays) : 0;
  const totalExpenses = reports.reduce((s, r) => s + calcTotalExpenses(r), 0);
  const financeExpenseByCategory = Array.from(financeCatMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  const otherRevenueByCategory = Array.from(revenueCatMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  return {
    totalRooms, roomsSold, dayUseRoom: 0, complimentary, arr, occ, revpar,
    roomRevenue, fbRevenue, miscRevenue, totalRevenue,
    ota, direct, corp, phone, cash, bank,
    taxableRevenue, gstCollected, netRevenue,
    payCash, payUpi, payCard, payBank, payAdvance, payBalance,
    financeExpenses, financeExpenseByCategory, totalExpenses,
    otherRevenueEntries, otherRevenueByCategory,
  };
};

// Company ledger aggregate
export interface CompanyLedgerRow {
  date: string;
  guest: string;
  room: string;
  arrival: string | null;
  departure: string | null;
  nights: number;
  roomRate: number;
  total: number;
  payMode: string;
}

export interface CompanyLedgerSummary {
  name: string;
  category: SourceCategory;
  totalBookings: number;
  totalRoomNights: number;
  totalRoomRevenue: number;
  rows: CompanyLedgerRow[];
}

export const buildCompanyLedger = (
  name: string,
  category: SourceCategory,
  entries: RoomChartEntry[]
): CompanyLedgerSummary => {
  const rows: CompanyLedgerRow[] = [];
  let totalBookings = 0;
  let totalRoomNights = 0;
  let totalRoomRevenue = 0;
  for (const e of entries) {
    if (e.is_complimentary) continue;
    totalBookings += 1;
    totalRoomNights += toNum(e.nights);
    totalRoomRevenue += toNum(e.total) > 0 ? toNum(e.total) : toNum(e.room_rate);
    rows.push({
      date: e.report_date,
      guest: e.guest_name,
      room: e.room_no,
      arrival: e.arrival,
      departure: e.departure,
      nights: toNum(e.nights),
      roomRate: toNum(e.room_rate),
      total: toNum(e.total) > 0 ? toNum(e.total) : toNum(e.room_rate),
      payMode: e.pay_mode,
    });
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { name, category, totalBookings, totalRoomNights, totalRoomRevenue, rows };
};
