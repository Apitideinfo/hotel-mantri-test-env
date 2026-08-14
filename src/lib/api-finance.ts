import { supabase } from './supabase';
import { getCurrentHotelId } from './api';
import type {
  ExpenseCategory, ExpenseEntry, ExpenseEntryInput,
  StaffMember, StaffInput,
  SalaryAdvance, SalaryAdvanceInput,
  SalarySettlement, SalarySettlementInput,
  ElectricityReading, ElectricityInput,
  UtilityBill, UtilityBillInput,
  LaundryEntry, LaundryEntryInput,
  MonthlyBill, MonthlyBillInput,
  MonthlyProfitability,
  RevenueEntry, RevenueEntryInput,
} from './types-finance';
import { toNum } from './calc';

// ── helpers ──────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);

// Categories already tracked in Other Daily Entries / Salary modules — excluded from
// expense_entries aggregation to prevent double counting in reports.
const OVERLAP_CATEGORIES = new Set([
  'Housekeeping', 'Housekeeping Supply', 'Maintenance', 'Maintenance Bill',
  'Salary', 'Salary Advance',
]);

// ── EXPENSE CATEGORIES ───────────────────────────────────────────────────────

export const getExpenseCategories = async (includeInactive = false): Promise<ExpenseCategory[]> => {
  let q = supabase
    .from('expense_categories')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('sort_order', { ascending: true });
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data as ExpenseCategory[]) ?? [];
};

export const saveExpenseCategory = async (
  name: string, id?: string
): Promise<ExpenseCategory> => {
  if (id) {
    const { data, error } = await supabase
      .from('expense_categories')
      .update({ name: name.trim() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as ExpenseCategory;
  }
  const { data: existing } = await supabase
    .from('expense_categories')
    .select('count')
    .eq('hotel_id', getCurrentHotelId());
  const sortOrder = ((existing as unknown as { count: number }[])?.[0]?.count ?? 0) + 1;
  const { data, error } = await supabase
    .from('expense_categories')
    .insert({ hotel_id: getCurrentHotelId(), name: name.trim(), sort_order: sortOrder })
    .select('*')
    .single();
  if (error) throw error;
  return data as ExpenseCategory;
};

export const toggleExpenseCategory = async (id: string, isActive: boolean): Promise<void> => {
  const { error } = await supabase
    .from('expense_categories')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) throw error;
};

// ── EXPENSE ENTRIES ──────────────────────────────────────────────────────────

export const getExpenseEntries = async (
  fromDate: string, toDate: string, categoryName?: string
): Promise<ExpenseEntry[]> => {
  let q = supabase
    .from('expense_entries')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .gte('entry_date', fromDate)
    .lte('entry_date', toDate)
    .order('entry_date', { ascending: false });
  if (categoryName) q = q.eq('category_name', categoryName);
  const { data, error } = await q;
  if (error) throw error;
  return (data as ExpenseEntry[]) ?? [];
};

export const getExpenseEntriesForMonth = async (
  year: number, month: number
): Promise<ExpenseEntry[]> => {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return getExpenseEntries(start, end);
};

export const getExpenseEntriesForDate = async (date: string): Promise<ExpenseEntry[]> => {
  return getExpenseEntries(date, date);
};

export const getExpenseEntriesForDateRange = async (
  fromDate: string, toDate: string
): Promise<ExpenseEntry[]> => {
  return getExpenseEntries(fromDate, toDate);
};

export const saveExpenseEntry = async (input: ExpenseEntryInput, id?: string): Promise<ExpenseEntry> => {
  if (!input.category_name) throw new Error('Expense Head is required');
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  if (id) {
    const { data, error } = await supabase
      .from('expense_entries')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as ExpenseEntry;
  }
  const { data, error } = await supabase
    .from('expense_entries')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as ExpenseEntry;
};

export const deleteExpenseEntry = async (id: string): Promise<void> => {
  const { error } = await supabase.from('expense_entries').delete().eq('id', id);
  if (error) throw error;
};

// ── DAILY REVENUE ENTRIES (Other Revenue from Daily Room Chart) ──────────────

export const getRevenueEntries = async (
  fromDate: string, toDate: string
): Promise<RevenueEntry[]> => {
  const { data, error } = await supabase
    .from('daily_revenue_entries')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .gte('entry_date', fromDate)
    .lte('entry_date', toDate)
    .order('entry_date', { ascending: false });
  if (error) throw error;
  return (data as RevenueEntry[]) ?? [];
};

export const getRevenueEntriesForDate = async (date: string): Promise<RevenueEntry[]> => {
  return getRevenueEntries(date, date);
};

export const getRevenueEntriesForDateRange = async (
  fromDate: string, toDate: string
): Promise<RevenueEntry[]> => {
  return getRevenueEntries(fromDate, toDate);
};

export const saveRevenueEntry = async (input: RevenueEntryInput, id?: string): Promise<RevenueEntry> => {
  if (!input.revenue_head) throw new Error('Revenue Head is required');
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  if (id) {
    const { data, error } = await supabase
      .from('daily_revenue_entries')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as RevenueEntry;
  }
  const { data, error } = await supabase
    .from('daily_revenue_entries')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as RevenueEntry;
};

export const deleteRevenueEntry = async (id: string): Promise<void> => {
  const { error } = await supabase.from('daily_revenue_entries').delete().eq('id', id);
  if (error) throw error;
};

// Aggregate expense totals for a month — excludes Salary (handled separately)
export const getMonthExpenseTotals = async (
  year: number, month: number
): Promise<{ total: number; byCash: number; byBank: number; byUpi: number; byCredit: number; byCategory: { category: string; amount: number }[] }> => {
  const entries = await getExpenseEntriesForMonth(year, month);
  let total = 0, byCash = 0, byBank = 0, byUpi = 0, byCredit = 0;
  const catMap = new Map<string, number>();
  for (const e of entries) {
    const amt = toNum(e.amount);
    total += amt;
    if (e.payment_mode === 'Cash') byCash += amt;
    else if (e.payment_mode === 'Bank') byBank += amt;
    else if (e.payment_mode === 'UPI') byUpi += amt;
    else if (e.payment_mode === 'Credit') byCredit += amt;
    catMap.set(e.category_name, (catMap.get(e.category_name) ?? 0) + amt);
  }
  const byCategory = Array.from(catMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  return { total, byCash, byBank, byUpi, byCredit, byCategory };
};

// ── STAFF ────────────────────────────────────────────────────────────────────

export const getStaff = async (includeInactive = false): Promise<StaffMember[]> => {
  let q = supabase
    .from('staff')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('name', { ascending: true });
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data as StaffMember[]) ?? [];
};

export const saveStaff = async (input: StaffInput, id?: string): Promise<StaffMember> => {
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  if (id) {
    const { data, error } = await supabase
      .from('staff')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as StaffMember;
  }
  const { data, error } = await supabase
    .from('staff')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as StaffMember;
};

// ── SALARY ADVANCES ──────────────────────────────────────────────────────────

export const getSalaryAdvances = async (monthKey: string): Promise<SalaryAdvance[]> => {
  const { data, error } = await supabase
    .from('salary_advances')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .eq('month_key', monthKey)
    .order('advance_date', { ascending: true });
  if (error) throw error;
  return (data as SalaryAdvance[]) ?? [];
};

export const saveSalaryAdvance = async (input: SalaryAdvanceInput): Promise<SalaryAdvance> => {
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  const { data, error } = await supabase
    .from('salary_advances')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as SalaryAdvance;
};

export const deleteSalaryAdvance = async (id: string): Promise<void> => {
  const { error } = await supabase.from('salary_advances').delete().eq('id', id);
  if (error) throw error;
};

// Sum advances per staff member for a given month
export const getStaffAdvanceSums = async (
  monthKey: string
): Promise<Map<string, number>> => {
  const advances = await getSalaryAdvances(monthKey);
  const map = new Map<string, number>();
  for (const a of advances) {
    map.set(a.staff_id, (map.get(a.staff_id) ?? 0) + toNum(a.amount));
  }
  return map;
};

// ── SALARY SETTLEMENTS ───────────────────────────────────────────────────────

export const getSalarySettlements = async (monthKey: string): Promise<SalarySettlement[]> => {
  const { data, error } = await supabase
    .from('salary_settlements')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .eq('month_key', monthKey)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as SalarySettlement[]) ?? [];
};

// Upsert a settlement (unique by hotel_id + staff_id + month_key)
export const saveSalarySettlement = async (input: SalarySettlementInput, id?: string): Promise<SalarySettlement> => {
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  if (id) {
    const { data, error } = await supabase
      .from('salary_settlements')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as SalarySettlement;
  }
  const { data, error } = await supabase
    .from('salary_settlements')
    .upsert(payload, { onConflict: 'hotel_id,staff_id,month_key' })
    .select('*')
    .single();
  if (error) throw error;
  return data as SalarySettlement;
};

// ── ELECTRICITY ──────────────────────────────────────────────────────────────

export const getElectricityReadings = async (): Promise<ElectricityReading[]> => {
  const { data, error } = await supabase
    .from('electricity_readings')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('month_key', { ascending: false });
  if (error) throw error;
  return (data as ElectricityReading[]) ?? [];
};

export const getElectricityForMonth = async (monthKey: string): Promise<ElectricityReading | null> => {
  const { data, error } = await supabase
    .from('electricity_readings')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .eq('month_key', monthKey)
    .maybeSingle();
  if (error) throw error;
  return data as ElectricityReading | null;
};

export const saveElectricityReading = async (input: ElectricityInput, id?: string): Promise<ElectricityReading> => {
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  if (id) {
    const { data, error } = await supabase
      .from('electricity_readings')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as ElectricityReading;
  }
  const { data, error } = await supabase
    .from('electricity_readings')
    .upsert(payload, { onConflict: 'hotel_id,month_key' })
    .select('*')
    .single();
  if (error) throw error;
  return data as ElectricityReading;
};

// ── UTILITY BILLS ────────────────────────────────────────────────────────────

export const getUtilityBills = async (fromDate?: string, toDate?: string): Promise<UtilityBill[]> => {
  let q = supabase
    .from('utility_bills')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('bill_date', { ascending: false });
  if (fromDate) q = q.gte('bill_date', fromDate);
  if (toDate) q = q.lte('bill_date', toDate);
  const { data, error } = await q;
  if (error) throw error;
  return (data as UtilityBill[]) ?? [];
};

export const saveUtilityBill = async (input: UtilityBillInput, id?: string): Promise<UtilityBill> => {
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  if (id) {
    const { data, error } = await supabase
      .from('utility_bills')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as UtilityBill;
  }
  const { data, error } = await supabase
    .from('utility_bills')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as UtilityBill;
};

export const deleteUtilityBill = async (id: string): Promise<void> => {
  const { error } = await supabase.from('utility_bills').delete().eq('id', id);
  if (error) throw error;
};

// ── LAUNDRY ──────────────────────────────────────────────────────────────────

export const getLaundryEntries = async (fromDate: string, toDate: string): Promise<LaundryEntry[]> => {
  const { data, error } = await supabase
    .from('laundry_entries')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .gte('entry_date', fromDate)
    .lte('entry_date', toDate)
    .order('entry_date', { ascending: false });
  if (error) throw error;
  return (data as LaundryEntry[]) ?? [];
};

export const saveLaundryEntry = async (input: LaundryEntryInput, id?: string): Promise<LaundryEntry> => {
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  if (id) {
    const { data, error } = await supabase
      .from('laundry_entries')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as LaundryEntry;
  }
  const { data, error } = await supabase
    .from('laundry_entries')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as LaundryEntry;
};

export const deleteLaundryEntry = async (id: string): Promise<void> => {
  const { error } = await supabase.from('laundry_entries').delete().eq('id', id);
  if (error) throw error;
};

// ── MONTHLY BILLS ────────────────────────────────────────────────────────────

export const getMonthlyBills = async (monthKey: string): Promise<MonthlyBill[]> => {
  const { data, error } = await supabase
    .from('monthly_bills')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .eq('month_key', monthKey)
    .order('due_date', { ascending: true });
  if (error) throw error;
  return (data as MonthlyBill[]) ?? [];
};

export const saveMonthlyBill = async (input: MonthlyBillInput, id?: string): Promise<MonthlyBill> => {
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  if (id) {
    const { data, error } = await supabase
      .from('monthly_bills')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as MonthlyBill;
  }
  const { data, error } = await supabase
    .from('monthly_bills')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as MonthlyBill;
};

export const deleteMonthlyBill = async (id: string): Promise<void> => {
  const { error } = await supabase.from('monthly_bills').delete().eq('id', id);
  if (error) throw error;
};

// ── MONTHLY PROFITABILITY ────────────────────────────────────────────────────

export const calcMonthlyProfitability = async (
  year: number,
  month: number,
  roomRevenue: number,
  fbRevenue: number,
  otherRevenue: number,
  cashMovements?: {
    cash: number;
    bank: number;
    salary_advance: number;
    maintenance_bill: number;
    cash_handover_md: number;
    bank_cash_deposit: number;
    cash_closing: number;
    housekeeping_supply: number;
    other_expense: number;
  },
  gstData?: {
    taxableRevenue: number;
    gstCollected: number;
    netRevenue: number;
  },
  splitData?: {
    payCash: number;
    payUpi: number;
    payCard: number;
    payBank: number;
    payAdvance: number;
    payBalance: number;
  },
): Promise<MonthlyProfitability> => {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  // Laundry revenue
  const start = `${monthKey}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${monthKey}-${String(lastDay).padStart(2, '0')}`;
  const laundry = await getLaundryEntries(start, end);
  const laundryRevenue = laundry
    .filter((l) => l.transaction_type === 'Revenue')
    .reduce((s, l) => s + toNum(l.amount), 0);

  const totalRevenue = roomRevenue + fbRevenue + laundryRevenue + otherRevenue;

  // Expense totals (from expense_entries — excludes categories already captured in
  // Other Daily Entries to prevent double counting)
  const expenses = await getExpenseEntriesForMonth(year, month);
  const catMap = new Map<string, number>();
  let totalExpenses = 0;
  for (const e of expenses) {
    const amt = toNum(e.amount);
    if (OVERLAP_CATEGORIES.has(e.category_name)) continue;
    totalExpenses += amt;
    catMap.set(e.category_name, (catMap.get(e.category_name) ?? 0) + amt);
  }

  // Salary expense = sum of monthly_salary from settlements for this month
  const settlements = await getSalarySettlements(monthKey);
  const salaryExpense = settlements.reduce((s, ss) => s + toNum(ss.monthly_salary), 0);
  totalExpenses += salaryExpense;

  // Include daily-report expenses (housekeeping_supply + maintenance_bill + other_expense) as
  // their own categories so they appear in the expense breakdown.
  const cm = cashMovements;
  if (cm) {
    if (toNum(cm.housekeeping_supply) > 0) {
      catMap.set('Housekeeping Supply', (catMap.get('Housekeeping Supply') ?? 0) + toNum(cm.housekeeping_supply));
      totalExpenses += toNum(cm.housekeeping_supply);
    }
    if (toNum(cm.maintenance_bill) > 0) {
      catMap.set('Maintenance Bill', (catMap.get('Maintenance Bill') ?? 0) + toNum(cm.maintenance_bill));
      totalExpenses += toNum(cm.maintenance_bill);
    }
    if (toNum(cm.other_expense) > 0) {
      catMap.set('Other Expense', (catMap.get('Other Expense') ?? 0) + toNum(cm.other_expense));
      totalExpenses += toNum(cm.other_expense);
    }
  }

  const byCategory = Array.from(catMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const netOperatingProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (netOperatingProfit / totalRevenue) * 100 : 0;

  return {
    month_key: monthKey,
    room_revenue: roomRevenue,
    fb_revenue: fbRevenue,
    laundry_revenue: laundryRevenue,
    other_revenue: otherRevenue,
    total_revenue: totalRevenue,
    salary_expense: salaryExpense,
    expense_by_category: byCategory,
    total_expenses: totalExpenses,
    cash: cm?.cash ?? 0,
    bank: cm?.bank ?? 0,
    salary_advance: cm?.salary_advance ?? 0,
    maintenance_bill: cm?.maintenance_bill ?? 0,
    cash_handover_md: cm?.cash_handover_md ?? 0,
    bank_cash_deposit: cm?.bank_cash_deposit ?? 0,
    cash_closing: cm?.cash_closing ?? 0,
    daily_housekeeping_supply: cm?.housekeeping_supply ?? 0,
    daily_other_expense: cm?.other_expense ?? 0,
    net_operating_profit: netOperatingProfit,
    profit_margin: profitMargin,
    taxable_revenue: gstData?.taxableRevenue ?? 0,
    gst_collected: gstData?.gstCollected ?? 0,
    net_revenue: gstData?.netRevenue ?? 0,
    pay_cash: splitData?.payCash ?? 0,
    pay_upi: splitData?.payUpi ?? 0,
    pay_card: splitData?.payCard ?? 0,
    pay_bank: splitData?.payBank ?? 0,
    pay_advance: splitData?.payAdvance ?? 0,
    pay_balance: splitData?.payBalance ?? 0,
  };
};

// Convenience: get quick monthly financial summary (for dashboard)
export const getMonthFinancialSummary = async (
  year: number, month: number
): Promise<{ totalExpenses: number; salaryExpense: number; netProfit: number }> => {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const [expenses, settlements] = await Promise.all([
    getExpenseEntriesForMonth(year, month),
    getSalarySettlements(monthKey),
  ]);
  const expTotal = expenses
    .filter((e) => !OVERLAP_CATEGORIES.has(e.category_name))
    .reduce((s, e) => s + toNum(e.amount), 0);
  const salaryTotal = settlements.reduce((s, ss) => s + toNum(ss.monthly_salary), 0);
  return {
    totalExpenses: expTotal + salaryTotal,
    salaryExpense: salaryTotal,
    netProfit: 0, // caller adds revenue
  };
};

void today;
