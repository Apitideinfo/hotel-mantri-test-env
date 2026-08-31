import { supabase, isPlaceholderSupabase } from './supabase';

import type {
  HotelSettings, DailyReport, DailyReportInput, RoomChartEntry, RoomChartEntryInput,
  OtherDailyEntries, OtherDailyEntriesInput, CompanySource, SourceCategory, DerivedReport,
  RoomCategory, Room, RoomInput,
} from './types';
import { calcCashClosing, toNum, buildDerivedReport, aggregateRoomChart, buildMtdYtdFromDaily, buildCashFlow, calcTotalRevenue, aggregateDerived, getTodayLocal } from './calc';

import { getExpenseEntriesForDate, getExpenseEntriesForDateRange, getRevenueEntriesForDate, getRevenueEntriesForDateRange } from './api-finance';
import type { ExpenseEntry, RevenueEntry } from './types-finance';

// The current user's hotel_id, set by the auth provider BEFORE any screen renders.
// Starts as null — no fallback to any hardcoded hotel. Screens are gated on
// profileLoaded so getCurrentHotelId() is never called before this is set.
let _currentHotelId: string | null = null;

export const setCurrentHotelId = (id: string | null) => { _currentHotelId = id; };
export const getCurrentHotelId = (): string => {
  if (import.meta.env.PROD && !_currentHotelId) {
    throw new Error('Hotel ID is not set. User might not be authenticated or profile is not loaded.');
  }
  return _currentHotelId || 'demo-hotel-id-101';
};


export const getSettings = async (): Promise<HotelSettings> => {
  const hotelId = getCurrentHotelId();
  try {
    const { data, error } = await supabase
      .from('hotel_settings')
      .select('*')
      .eq('id', hotelId)
      .maybeSingle();
    if (data) return data as HotelSettings;

    const { data: hotelData } = await supabase
      .from('hotels')
      .select('hotel_name, total_rooms')
      .eq('id', hotelId)
      .maybeSingle();
    const hotelName = (hotelData as { hotel_name: string } | null)?.hotel_name ?? 'Hotel';
    const totalRooms = (hotelData as { total_rooms: number } | null)?.total_rooms ?? 20;

    const { data: created, error: insErr } = await supabase
      .from('hotel_settings')
      .upsert({
        id: hotelId,
        hotel_name: hotelName,
        total_rooms: totalRooms,
      })
      .select('*')
      .maybeSingle();
    if (created) return created as HotelSettings;
    return {
      id: hotelId,
      hotel_name: hotelName,
      total_rooms: totalRooms,
      opening_cash_balance: 0,
      financial_year: new Date().getFullYear(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as HotelSettings;
  } catch {
    return {
      id: hotelId,
      hotel_name: 'Hotel',
      total_rooms: 20,
      opening_cash_balance: 0,
      financial_year: new Date().getFullYear(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as HotelSettings;
  }
};

export const updateSettings = async (patch: Partial<HotelSettings>): Promise<HotelSettings> => {
  const { data, error } = await supabase
    .from('hotel_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', getCurrentHotelId())
    .select('*')
    .single();
  if (error) throw error;
  return data as HotelSettings;
};

// ---- Company sources ----

export const getCompanySources = async (): Promise<CompanySource[]> => {
  const { data, error } = await supabase
    .from('company_sources')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('name', { ascending: true });
  if (error) throw error;
  return (data as CompanySource[]) ?? [];
};

export const upsertCompanySource = async (
  name: string, sourceCategory: SourceCategory, id?: string
): Promise<CompanySource> => {
  if (id) {
    // Update existing row by id (rename or category change)
    const { data, error } = await supabase
      .from('company_sources')
      .update({ name: name.trim(), source_category: sourceCategory })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as CompanySource;
  }
  const { data, error } = await supabase
    .from('company_sources')
    .upsert({ hotel_id: getCurrentHotelId(), name: name.trim(), source_category: sourceCategory })
    .select('*')
    .single();
  if (error) throw error;
  return data as CompanySource;
};

export const deleteCompanySource = async (id: string): Promise<void> => {
  const { error } = await supabase.from('company_sources').delete().eq('id', id);
  if (error) throw error;
};

// ---- Room categories ----

const DEMO_CATEGORIES: RoomCategory[] = [
  { id: 'cat-deluxe', hotel_id: 'demo-hotel-id-101', name: 'Deluxe Suite', default_tariff: 2500, extra_bed_charge: 500, sort_order: 1, is_active: true, created_at: new Date().toISOString() },
  { id: 'cat-exec', hotel_id: 'demo-hotel-id-101', name: 'Executive Room', default_tariff: 1800, extra_bed_charge: 400, sort_order: 2, is_active: true, created_at: new Date().toISOString() },
];

const DEMO_ROOMS: Room[] = [
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `room-10${i+1}`,
    hotel_id: 'demo-hotel-id-101',
    category_id: 'cat-deluxe',
    room_no: `10${i+1}`,
    floor: 'Floor 1',
    default_tariff: 2500,
    extra_bed_charge: 500,
    is_active: true,
    sort_order: i + 1,
    created_at: new Date().toISOString(),
    housekeeping_status: 'Vacant Clean' as const,
    housekeeping_note: '',
    housekeeping_updated_at: null,
    cleaning_priority: 'Normal' as const,
    assigned_staff_id: null,
    last_cleaned_at: null,
    last_inspected_at: null,
    last_guest_name: '',
    last_departure_time: '',
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `room-20${i+1}`,
    hotel_id: 'demo-hotel-id-101',
    category_id: 'cat-exec',
    room_no: `20${i+1}`,
    floor: 'Floor 2',
    default_tariff: 1800,
    extra_bed_charge: 400,
    is_active: true,
    sort_order: i + 11,
    created_at: new Date().toISOString(),
    housekeeping_status: 'Vacant Clean' as const,
    housekeeping_note: '',
    housekeeping_updated_at: null,
    cleaning_priority: 'Normal' as const,
    assigned_staff_id: null,
    last_cleaned_at: null,
    last_inspected_at: null,
    last_guest_name: '',
    last_departure_time: '',
  })),
];

export const getRoomCategories = async (): Promise<RoomCategory[]> => {
  try {
    const { data, error } = await supabase
      .from('room_categories')
      .select('*')
      .eq('hotel_id', getCurrentHotelId())
      .order('sort_order', { ascending: true });
    if (!error && data && data.length > 0) return data as RoomCategory[];
  } catch {
    // Ignore and fallback
  }
  if (import.meta.env.PROD) return [];
  return DEMO_CATEGORIES;
};

export const upsertRoomCategory = async (
  name: string, id?: string,
  defaults?: { default_tariff?: number; extra_bed_charge?: number }
): Promise<RoomCategory> => {
  if (id) {
    const patch: Record<string, unknown> = { name: name.trim() };
    if (defaults?.default_tariff !== undefined) patch.default_tariff = defaults.default_tariff;
    if (defaults?.extra_bed_charge !== undefined) patch.extra_bed_charge = defaults.extra_bed_charge;
    const { data, error } = await supabase
      .from('room_categories')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as RoomCategory;
  }
  const { data: existing } = await supabase
    .from('room_categories')
    .select('sort_order')
    .eq('hotel_id', getCurrentHotelId())
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = existing ? (existing as { sort_order: number }).sort_order + 1 : 1;
  const { data, error } = await supabase
    .from('room_categories')
    .insert({
      hotel_id: getCurrentHotelId(), name: name.trim(), sort_order: nextOrder,
      default_tariff: defaults?.default_tariff ?? 0,
      extra_bed_charge: defaults?.extra_bed_charge ?? 0,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as RoomCategory;
};

export const deleteRoomCategory = async (id: string): Promise<void> => {
  const { error } = await supabase.from('room_categories').delete().eq('id', id);
  if (error) throw error;
};

export const reorderRoomCategories = async (
  ids: string[]
): Promise<void> => {
  const updates = ids.map((id, idx) =>
    supabase.from('room_categories').update({ sort_order: idx + 1 }).eq('id', id)
  );
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
};

// ---- Rooms (Property Master inventory) ----

export const getRooms = async (): Promise<Room[]> => {
  try {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('hotel_id', getCurrentHotelId())
      .order('sort_order', { ascending: true });
    if (!error && data && data.length > 0) return data as Room[];
  } catch {
    // Ignore and fallback
  }
  if (import.meta.env.PROD) return [];
  return DEMO_ROOMS;
};


export const saveRoom = async (input: RoomInput, id?: string): Promise<Room> => {
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  if (id) {
    const { data, error } = await supabase
      .from('rooms')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as Room;
  }
  const { data, error } = await supabase
    .from('rooms')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as Room;
};

export const deleteRoom = async (id: string): Promise<void> => {
  const { error } = await supabase.from('rooms').delete().eq('id', id);
  if (error) throw error;
};

export const bulkInsertRooms = async (rooms: RoomInput[]): Promise<Room[]> => {
  const payload = rooms.map((r) => ({ ...r, hotel_id: getCurrentHotelId() }));
  const { data, error } = await supabase
    .from('rooms')
    .insert(payload)
    .select('*');
  if (error) throw error;
  return (data as Room[]) ?? [];
};

// Upload hotel logo to Supabase Storage and return the public URL.
export const uploadHotelLogo = async (file: File): Promise<string> => {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${getCurrentHotelId()}/logo.${ext}`;
  const { error } = await supabase.storage
    .from('hotel-assets')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from('hotel-assets').getPublicUrl(path);
  // Bust cache with timestamp
  return `${data.publicUrl}?t=${Date.now()}`;
};

// ---- Room chart ----

export const classifyCompany = (
  name: string, sources: CompanySource[]
): SourceCategory => {
  const found = sources.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
  if (found) return found.source_category;
  const n = name.trim().toLowerCase();
  if (!n) return 'Direct/Walking';
  if (/walk\s*in|direct/.test(n)) return 'Direct/Walking';
  if (/phonebook/.test(n)) return 'Phonebook';
  if (/makemytrip|mmt|booking\.com|goibibo|cleartrip|oyo|agoda|expedia|airbnb|treebo|fabhotels/.test(n)) return 'OTA';
  return 'Corporate/Agent';
};

// ---- Room chart ----

export const getRoomChart = async (date: string): Promise<RoomChartEntry[]> => {
  const { data, error } = await supabase
    .from('room_chart_entries')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .eq('report_date', date)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as RoomChartEntry[]) ?? [];
};

export const saveRoomChartRow = async (
  input: RoomChartEntryInput,
  sources: CompanySource[],
  existingId?: string,
): Promise<RoomChartEntry> => {
  const category = classifyCompany(input.company, sources);
  const payload = { ...input, hotel_id: getCurrentHotelId(), source_category: category };
  if (existingId) {
    const { data, error } = await supabase
      .from('room_chart_entries')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', existingId)
      .select('*')
      .single();
    if (error) throw error;
    return data as RoomChartEntry;
  }
  const { id: _id, ...rest } = payload as RoomChartEntryInput & { id?: string };
  void _id;
  const { data, error } = await supabase
    .from('room_chart_entries')
    .insert(rest)
    .select('*')
    .single();
  if (error) throw error;
  return data as RoomChartEntry;
};

export const deleteRoomChartRow = async (id: string): Promise<void> => {
  const { error } = await supabase.from('room_chart_entries').delete().eq('id', id);
  if (error) throw error;
};

export const getRoomChartForDateRange = async (fromDate: string, toDate: string): Promise<RoomChartEntry[]> => {
  try {
    const hotelId = getCurrentHotelId();
    // Fetch room chart entries created in the past 60 days or for future dates
    const lookbackDate = new Date(new Date(fromDate + 'T00:00:00').getTime() - 60 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('room_chart_entries')
      .select('*')
      .eq('hotel_id', hotelId)
      .gte('report_date', lookbackDate)
      .order('report_date', { ascending: true });
    if (error) return [];

    const entries = (data as RoomChartEntry[]) ?? [];
    return entries.filter((e) => {
      const arr = (e.arrival && e.arrival.trim() !== '' ? e.arrival : e.report_date).slice(0, 10);
      const dep = (e.departure && e.departure.trim() !== '' ? e.departure : e.report_date).slice(0, 10);
      // Entry overlaps if arr < toDate AND dep >= fromDate
      return arr <= toDate && dep >= fromDate;
    });
  } catch {
    return [];
  }
};

export const getRoomChartForMonth = async (year: number, month: number): Promise<RoomChartEntry[]> => {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('room_chart_entries')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .gte('report_date', start)
    .lte('report_date', end)
    .order('report_date', { ascending: true });
  if (error) throw error;
  return (data as RoomChartEntry[]) ?? [];
};

// ---- Other daily entries ----

export const getOtherEntries = async (date: string): Promise<OtherDailyEntriesInput | null> => {
  const { data, error } = await supabase
    .from('other_daily_entries')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .eq('report_date', date)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { id: _id, hotel_id: _h, ...rest } = data as OtherDailyEntries;
  void _id; void _h;
  return rest;
};

export const saveOtherEntries = async (
  input: OtherDailyEntriesInput
): Promise<OtherDailyEntries> => {
  const { data: existing, error: qErr } = await supabase
    .from('other_daily_entries')
    .select('id')
    .eq('hotel_id', getCurrentHotelId())
    .eq('report_date', input.report_date)
    .maybeSingle();
  if (qErr) throw qErr;
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  if (existing) {
    const { data, error } = await supabase
      .from('other_daily_entries')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', (existing as { id: string }).id)
      .select('*')
      .single();
    if (error) throw error;
    return data as OtherDailyEntries;
  }
  const { data, error } = await supabase
    .from('other_daily_entries')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as OtherDailyEntries;
};

// ---- Derived report (the single source of truth for MIS) ----

export const getPrevCashClosingDerived = async (
  date: string, openingBalance: number
): Promise<number> => {
  const d = new Date(date + 'T00:00:00');
  const prev = new Date(d);
  prev.setDate(prev.getDate() - 1);
  const prevStr = prev.toISOString().slice(0, 10);

  // Batch-fetch all data from the start of the month up to the previous day.
  // This replaces the old recursive approach that made 5+ API calls per day
  // walking backward, which caused thousands of sequential requests.
  const monthStart = `${prevStr.slice(0, 8)}01`;
  const settings = await getSettings();
  const totalRooms = settings.total_rooms;

  const [allEntries, allOther, allFinance, allRevenue] = await Promise.all([
    supabase.from('room_chart_entries').select('*')
      .eq('hotel_id', getCurrentHotelId())
      .gte('report_date', monthStart).lte('report_date', prevStr)
      .order('report_date', { ascending: true }).then(({ data, error }) => {
        if (error) throw error;
        return (data as RoomChartEntry[]) ?? [];
      }),
    supabase.from('other_daily_entries').select('*')
      .eq('hotel_id', getCurrentHotelId())
      .gte('report_date', monthStart).lte('report_date', prevStr)
      .then(({ data, error }) => {
        if (error) throw error;
        return data as OtherDailyEntries[] ?? [];
      }),
    getExpenseEntriesForDateRange(monthStart, prevStr),
    getRevenueEntriesForDateRange(monthStart, prevStr),
  ]);

  // Group by date for in-memory lookup
  const entriesByDate = new Map<string, RoomChartEntry[]>();
  for (const e of allEntries) {
    const arr = entriesByDate.get(e.report_date) ?? [];
    arr.push(e);
    entriesByDate.set(e.report_date, arr);
  }
  const otherByDate = new Map<string, OtherDailyEntries>();
  for (const o of allOther) {
    otherByDate.set(o.report_date, o);
  }
  const financeByDate = new Map<string, { category: string; amount: number }[]>();
  for (const fe of allFinance) {
    const arr = financeByDate.get(fe.entry_date) ?? [];
    arr.push({ category: fe.category_name, amount: fe.amount });
    financeByDate.set(fe.entry_date, arr);
  }
  const revenueByDate = new Map<string, { category: string; amount: number }[]>();
  for (const re of allRevenue) {
    const arr = revenueByDate.get(re.entry_date) ?? [];
    arr.push({ category: re.revenue_head, amount: re.amount });
    revenueByDate.set(re.entry_date, arr);
  }

  // Walk backward from the previous day to find the most recent day with data.
  // Then walk forward from the month start, computing cash closing for each day
  // using the same buildDerivedReport formula.
  const datesWithData: string[] = [];
  for (let day = 1; day <= parseInt(prevStr.slice(8, 10), 10); day++) {
    const ds = `${prevStr.slice(0, 8)}${String(day).padStart(2, '0')}`;
    if (entriesByDate.has(ds) || otherByDate.has(ds)) {
      datesWithData.push(ds);
    }
  }
  if (datesWithData.length === 0) return openingBalance;

  let runningClosing = openingBalance;
  for (const ds of datesWithData) {
    const dayEntries = entriesByDate.get(ds) ?? [];
    const other = otherByDate.get(ds) ?? {
      report_date: ds, kitchen: 0, other_income: 0, housekeeping_supply: 0,
      other_expense: 0, salary_advance: 0, maintenance_bill: 0,
      cash_handover_md: 0, bank_cash_deposit: 0,
    };
    const finance = financeByDate.get(ds);
    const revenue = revenueByDate.get(ds);
    const dr = buildDerivedReport(ds, dayEntries, other, runningClosing, totalRooms, finance, revenue);
    runningClosing = dr.cash_closing;
  }
  return runningClosing;
};

export const getDerivedReport = async (
  date: string, totalRooms: number, openingBalance: number
): Promise<DerivedReport> => {
  const entries = await getRoomChart(date);
  const other = (await getOtherEntries(date)) ?? {
    report_date: date, kitchen: 0, other_income: 0, housekeeping_supply: 0,
    other_expense: 0, salary_advance: 0, maintenance_bill: 0,
    cash_handover_md: 0, bank_cash_deposit: 0,
  };
  const prevClosing = await getPrevCashClosingDerived(date, openingBalance);
  const financeEntries = await getExpenseEntriesForDate(date);
  const financeAgg = financeEntries.map((e) => ({ category: e.category_name, amount: e.amount }));
  const revenueEntries = await getRevenueEntriesForDate(date);
  const revenueAgg = revenueEntries.map((e) => ({ category: e.revenue_head, amount: e.amount }));
  return buildDerivedReport(date, entries, other, prevClosing, totalRooms, financeAgg, revenueAgg);
};

export const getDerivedReportsForMonth = async (
  year: number, month: number, totalRooms: number, openingBalance: number
): Promise<DerivedReport[]> => {
  const entries = await getRoomChartForMonth(year, month);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const [financeEntries, revenueEntries, otherEntries] = await Promise.all([
    getExpenseEntriesForDateRange(start, end),
    getRevenueEntriesForDateRange(start, end),
    supabase.from('other_daily_entries').select('*')
      .eq('hotel_id', getCurrentHotelId())
      .gte('report_date', start).lte('report_date', end)
      .then(({ data, error }) => {
        if (error) throw error;
        return (data as OtherDailyEntries[]) ?? [];
      }),
  ]);
  const financeByDate = new Map<string, { category: string; amount: number }[]>();
  for (const fe of financeEntries) {
    const arr = financeByDate.get(fe.entry_date) ?? [];
    arr.push({ category: fe.category_name, amount: fe.amount });
    financeByDate.set(fe.entry_date, arr);
  }
  const revenueByDate = new Map<string, { category: string; amount: number }[]>();
  for (const re of revenueEntries) {
    const arr = revenueByDate.get(re.entry_date) ?? [];
    arr.push({ category: re.revenue_head, amount: re.amount });
    revenueByDate.set(re.entry_date, arr);
  }
  const otherByDate = new Map<string, OtherDailyEntries>();
  for (const o of otherEntries) {
    otherByDate.set(o.report_date, o);
  }

  // Compute cash closing forward in a single pass instead of calling
  // getPrevCashClosingDerived for each day (which re-walked the whole month).
  let runningClosing = openingBalance;
  const reports: DerivedReport[] = [];
  for (let day = 1; day <= lastDay; day++) {
    const d = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEntries = entries.filter((e) => e.report_date === d);
    const hasOther = otherByDate.has(d);
    if (dayEntries.length === 0 && !hasOther) continue;
    const other = otherByDate.get(d) ?? {
      report_date: d, kitchen: 0, other_income: 0, housekeeping_supply: 0,
      other_expense: 0, salary_advance: 0, maintenance_bill: 0,
      cash_handover_md: 0, bank_cash_deposit: 0,
    };
    const finance = financeByDate.get(d);
    const revenue = revenueByDate.get(d);
    const dr = buildDerivedReport(d, dayEntries, other, runningClosing, totalRooms, finance, revenue);
    runningClosing = dr.cash_closing;
    reports.push(dr);
  }
  return reports;
};

export const getDerivedReportsForYear = async (
  year: number, totalRooms: number, openingBalance: number
): Promise<DerivedReport[]> => {
  // Fetch entire year in 4 parallel queries instead of 48 sequential (12 months × 4).
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const [allEntries, allOther, allFinance, allRevenue] = await Promise.all([
    supabase.from('room_chart_entries').select('*')
      .eq('hotel_id', getCurrentHotelId())
      .gte('report_date', start).lte('report_date', end)
      .order('report_date', { ascending: true })
      .then(({ data, error }) => { if (error) throw error; return (data as RoomChartEntry[]) ?? []; }),
    supabase.from('other_daily_entries').select('*')
      .eq('hotel_id', getCurrentHotelId())
      .gte('report_date', start).lte('report_date', end)
      .then(({ data, error }) => { if (error) throw error; return (data as OtherDailyEntries[]) ?? []; }),
    getExpenseEntriesForDateRange(start, end),
    getRevenueEntriesForDateRange(start, end),
  ]);

  // Group by date
  const entriesByDate = new Map<string, RoomChartEntry[]>();
  for (const e of allEntries) {
    const arr = entriesByDate.get(e.report_date) ?? [];
    arr.push(e); entriesByDate.set(e.report_date, arr);
  }
  const otherByDate = new Map<string, OtherDailyEntries>();
  for (const o of allOther) otherByDate.set(o.report_date, o);
  const financeByDate = new Map<string, { category: string; amount: number }[]>();
  for (const fe of allFinance) {
    const arr = financeByDate.get(fe.entry_date) ?? [];
    arr.push({ category: fe.category_name, amount: fe.amount });
    financeByDate.set(fe.entry_date, arr);
  }
  const revenueByDate = new Map<string, { category: string; amount: number }[]>();
  for (const re of allRevenue) {
    const arr = revenueByDate.get(re.entry_date) ?? [];
    arr.push({ category: re.revenue_head, amount: re.amount });
    revenueByDate.set(re.entry_date, arr);
  }

  // Walk forward from Jan 1, computing cash closing in a single pass
  let runningClosing = openingBalance;
  const reports: DerivedReport[] = [];
  for (let month = 1; month <= 12; month++) {
    const lastDay = new Date(year, month, 0).getDate();
    for (let day = 1; day <= lastDay; day++) {
      const d = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEntries = entriesByDate.get(d) ?? [];
      const hasOther = otherByDate.has(d);
      if (dayEntries.length === 0 && !hasOther) continue;
      const other = otherByDate.get(d) ?? {
        report_date: d, kitchen: 0, other_income: 0, housekeeping_supply: 0,
        other_expense: 0, salary_advance: 0, maintenance_bill: 0,
        cash_handover_md: 0, bank_cash_deposit: 0,
      };
      const dr = buildDerivedReport(d, dayEntries, other, runningClosing, totalRooms, financeByDate.get(d), revenueByDate.get(d));
      runningClosing = dr.cash_closing;
      reports.push(dr);
    }
  }
  return reports;
};

// Company ledger: gather all entries for a company across a date range.
export const getCompanyLedger = async (
  name: string, fromDate: string, toDate: string
): Promise<RoomChartEntry[]> => {
  const { data, error } = await supabase
    .from('room_chart_entries')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .eq('company', name)
    .gte('report_date', fromDate)
    .lte('report_date', toDate)
    .order('report_date', { ascending: true });
  if (error) throw error;
  return (data as RoomChartEntry[]) ?? [];
};

// All distinct companies with their revenue for ranking.
export const getCompanyRevenueRanking = async (
  fromDate: string, toDate: string
): Promise<{ name: string; category: SourceCategory; revenue: number; bookings: number }[]> => {
  const { data, error } = await supabase
    .from('room_chart_entries')
    .select('company, source_category, total, room_rate, is_complimentary')
    .eq('hotel_id', getCurrentHotelId())
    .gte('report_date', fromDate)
    .lte('report_date', toDate);
  if (error) throw error;
  const map = new Map<string, { name: string; category: SourceCategory; revenue: number; bookings: number }>();
  for (const r of (data ?? []) as RoomChartEntry[]) {
    if (r.is_complimentary) continue;
    const amt = toNum(r.total) > 0 ? toNum(r.total) : toNum(r.room_rate);
    const key = r.company || 'Unknown';
    const existing = map.get(key) ?? { name: key, category: r.source_category, revenue: 0, bookings: 0 };
    existing.revenue += amt;
    existing.bookings += 1;
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
};

// ---- Legacy daily_reports (kept for backward compat; derived report supersedes) ----

export const getReport = async (date: string): Promise<DailyReport | null> => {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .eq('report_date', date)
    .maybeSingle();
  if (error) throw error;
  return data as DailyReport | null;
};

export const getReportsForMonth = async (year: number, month: number): Promise<DailyReport[]> => {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .gte('report_date', start)
    .lte('report_date', end)
    .order('report_date', { ascending: true });
  if (error) throw error;
  return (data as DailyReport[]) ?? [];
};

export const getReportsForYear = async (year: number): Promise<DailyReport[]> => {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .gte('report_date', start)
    .lte('report_date', end)
    .order('report_date', { ascending: true });
  if (error) throw error;
  return (data as DailyReport[]) ?? [];
};

export const getPrevCashClosing = async (date: string, openingBalance: number): Promise<number> => {
  const d = new Date(date + 'T00:00:00');
  const prev = new Date(d);
  prev.setDate(prev.getDate() - 1);
  const prevStr = prev.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('daily_reports')
    .select('cash_closing')
    .eq('hotel_id', getCurrentHotelId())
    .eq('report_date', prevStr)
    .maybeSingle();
  if (error) throw error;
  if (!data) return openingBalance;
  return toNum((data as { cash_closing: number }).cash_closing);
};

export const saveReport = async (
  input: DailyReportInput, openingBalance: number
): Promise<DailyReport> => {
  const prevClosing = await getPrevCashClosing(input.report_date, openingBalance);
  const cashClosing = calcCashClosing(prevClosing, input);
  const existing = await getReport(input.report_date);
  const payload = { ...input, hotel_id: getCurrentHotelId(), cash_closing: cashClosing };
  if (existing) {
    const { data, error } = await supabase
      .from('daily_reports')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return data as DailyReport;
  }
  const { data, error } = await supabase
    .from('daily_reports')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as DailyReport;
};

export const getMtdForDate = async (date: string): Promise<{ revenue: number; occupancy: number }> => {
  const d = new Date(date + 'T00:00:00');
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const { data, error } = await supabase
    .from('daily_reports')
    .select('room_sale_amount, kitchen, other_income, rooms_occupied')
    .eq('hotel_id', getCurrentHotelId())
    .gte('report_date', start)
    .lte('report_date', date);
  if (error) throw error;
  let revenue = 0;
  let occupancy = 0;
  for (const r of data ?? []) {
    revenue += toNum((r as { room_sale_amount: number }).room_sale_amount)
      + toNum((r as { kitchen: number }).kitchen)
      + toNum((r as { other_income: number }).other_income);
    occupancy += toNum((r as { rooms_occupied: number }).rooms_occupied);
  }
  return { revenue, occupancy };
};

// Re-export aggregateRoomChart for convenience
export { aggregateRoomChart };

// ── Dashboard Summary (fast batch fetch) ─────────────────────────────────────
// Fetches all dashboard data in 5 parallel queries instead of ~145 sequential.
// Returns today's report, MTD aggregate, YTD aggregate, 7-day trend, and ranking.
export interface DashboardSummary {
  settings: HotelSettings;
  today: DerivedReport;
  mtd: {
    roomRevenue: number; totalRevenue: number; occ: number; arr: number; revpar: number; roomNights: number;
    cash: number; bank: number; totalExpenses: number; netIncome: number;
    payCash: number; payUpi: number; payCard: number; payBank: number;
    ota: number; direct: number; corp: number; phone: number;
    fbRevenue: number; miscRevenue: number; otherRevenue: number;
    expenseByCategory: { category: string; amount: number }[];
  };
  ytd: {
    roomRevenue: number; totalRevenue: number; occ: number; arr: number; revpar: number; roomNights: number;
    cash: number; bank: number; totalExpenses: number; netIncome: number;
    payCash: number; payUpi: number; payCard: number; payBank: number;
  };
  weekReports: DerivedReport[];
  lastClosedDate: string | null;
  ranking: { name: string; category: SourceCategory; revenue: number; bookings: number }[];
  roomPreview: { categories: { name: string; total: number; occupied: number; reserved: number; blocked: number; maintenance: number; outOfOrder: number }[] };
  opsToday: { arrivals: number; departures: number; inHouse: number; available: number; occupied: number; dueCheckouts: number; todayCheckins: number };
  cashFlow?: CashFlowData;
}

const getMockDashboardSummary = (s: HotelSettings, todayStr: string): DashboardSummary => {
  const mockReport: DerivedReport = {
    report_date: todayStr,
    day_status: 'open',
    report_version: 1,
    rooms_occupied: 8,
    complimentary_room: 0,
    room_sale_amount: 14400,
    ota: 4000,
    direct_walking: 8000,
    corporate_agent: 3000,
    phonebook: 2400,
    kitchen: 2200,
    other_income: 800,
    housekeeping_supply: 400,
    other_expense: 600,
    salary_advance: 0,
    maintenance_bill: 300,
    cash_handover_md: 0,
    bank_cash_deposit: 0,
    cash_closing: (s.opening_cash_balance || 5000) + 16100,
    cash: 5400,
    bank: 4000,
    pay_cash: 5400,
    pay_bank: 4000,
    pay_upi: 6000,
    pay_card: 2000,
    pay_advance: 0,
    pay_balance: 0,
    taxable_revenue: 17400,
    gst_collected: 2088,
    cgst: 1044,
    sgst: 1044,
    igst: 0,
    net_revenue: 17400,
    invoice_total: 19488,
    room_revenue: 14400,
    fb_revenue: 2200,
    misc_revenue: 800,
    finance_expenses: 0,
    finance_expense_by_category: [],
    other_revenue_entries: 0,
    other_revenue_by_category: [],
    departure: 2,
    expected_arrival: 4,
    expected_arr: 1800,
  };

  return {
    settings: s,
    today: mockReport,
    mtd: {
      roomRevenue: 288000,
      totalRevenue: 348000,
      occ: 65,
      arr: 1800,
      revpar: 1170,
      roomNights: 160,
      cash: 108000,
      bank: 80000,
      totalExpenses: 42000,
      netIncome: 306000,
      payCash: 108000,
      payUpi: 120000,
      payCard: 40000,
      payBank: 80000,
      ota: 80000,
      direct: 160000,
      corp: 60000,
      phone: 48000,
      fbRevenue: 44000,
      miscRevenue: 16000,
      otherRevenue: 0,
      expenseByCategory: [
        { category: 'Utilities & Laundry', amount: 18000 },
        { category: 'Staff Salary & Advances', amount: 15000 },
        { category: 'Maintenance & Repairs', amount: 9000 },
      ],
    },
    ytd: {
      roomRevenue: 1440000,
      totalRevenue: 1740000,
      occ: 62,
      arr: 1800,
      revpar: 1116,
      roomNights: 800,
      cash: 540000,
      bank: 400000,
      totalExpenses: 210000,
      netIncome: 1530000,
      payCash: 540000,
      payUpi: 600000,
      payCard: 200000,
      payBank: 400000,
    },
    cashFlow: buildCashFlow((s.opening_cash_balance || 5000), mockReport),
    weekReports: [mockReport],
    lastClosedDate: null,
    ranking: [],
    roomPreview: {
      categories: [
        { name: 'Deluxe Suite', total: 10, occupied: 4, reserved: 2, blocked: 0, maintenance: 0, outOfOrder: 0 },
        { name: 'Executive Room', total: 10, occupied: 4, reserved: 1, blocked: 0, maintenance: 0, outOfOrder: 0 },
      ],
    },
    opsToday: {
      arrivals: 4,
      departures: 2,
      inHouse: 8,
      available: 12,
      occupied: 8,
      dueCheckouts: 2,
      todayCheckins: 4,
    },
  };
};

export const getOperationsBoardData = async (): Promise<DashboardSummary> => {
  const todayStr = getTodayLocal();
  const s = await getSettings().catch(() => null) ?? {
    id: 'demo-hotel-id-101',
    hotel_name: 'Hotel Mantri Royal',
    legal_name: 'Hotel Mantri Pvt Ltd',
    total_rooms: 20,
    opening_cash_balance: 10000,
    financial_year: 2026,
    logo_url: '',
    address: '', city: '', state_name: '', pin_code: '', phone: '', whatsapp_number: '', email: '', website: '',
    created_at: '', updated_at: '',
    gst_number: '', pan_number: '', hotel_reg_number: '', cin_number: '',
    manager_name: '', manager_mobile: '', admin_name: '',
    bank_name: '', account_name: '', account_number: '', ifsc_code: '',
    gst_registered: true, gst_mode: 'Exclusive' as const, default_gst_slab: 12 as const,
    restaurant_pos_enabled: false,
  };

  if (isPlaceholderSupabase) {
    return getMockDashboardSummary(s as HotelSettings, todayStr);
  }

  const totalRooms = s.total_rooms || 20;
  const openingBalance = s.opening_cash_balance || 5000;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;


  try {
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const yearStart = `${year}-01-01`;

    const [todayEntries, todayOther, todayFinance, todayRevenue, monthReports, yearReports, ranking, closeRecords, allRooms, allCategories, todayReservations, todayBlocks] = await Promise.all([
      getRoomChart(todayStr).catch(() => []),
      getOtherEntries(todayStr).catch(() => null),
      getExpenseEntriesForDate(todayStr).catch(() => []),
      getRevenueEntriesForDate(todayStr).catch(() => []),
      getDerivedReportsForMonth(year, month, totalRooms, openingBalance).catch(() => []),
      getDerivedReportsForYear(year, totalRooms, openingBalance).catch(() => []),
      getCompanyRevenueRanking(yearStart, todayStr).catch(() => []),
      Promise.resolve(
        supabase.from('day_close_records')
          .select('business_date,status')
          .eq('hotel_id', getCurrentHotelId())
          .eq('status', 'closed')
          .gte('business_date', monthStart)
          .lte('business_date', todayStr)
          .order('business_date', { ascending: false })
          .limit(1)
      ).then(({ data }) => (data as { business_date: string; status: string }[]) ?? []).catch(() => []),
      getRooms().catch(() => []),
      getRoomCategories().catch(() => []),
      Promise.resolve(
        supabase.from('reservations')
          .select('id,room_no,check_in_date,check_out_date,status')
          .eq('hotel_id', getCurrentHotelId())
          .in('status', ['confirmed', 'checked_in'])
          .or(`and(check_in_date.lte.${todayStr},check_out_date.gte.${todayStr})`)
      ).then(({ data }) => (data as { id: string; room_no: string; check_in_date: string; check_out_date: string; status: string }[]) ?? []).catch(() => []),
      Promise.resolve(
        supabase.from('room_blocks')
          .select('room_no,block_type,start_date,end_date')
          .eq('hotel_id', getCurrentHotelId())
          .or(`and(start_date.lte.${todayStr},end_date.gte.${todayStr})`)
      ).then(({ data }) => (data as { room_no: string; block_type: string; start_date: string; end_date: string }[]) ?? []).catch(() => []),
    ]);

    const prevDay = new Date(now);
    prevDay.setDate(prevDay.getDate() - 1);
    const prevStr = prevDay.toISOString().slice(0, 10);
    const prevReport = monthReports.find((r: DerivedReport) => r.report_date === prevStr);
    const prevClosing = prevReport ? prevReport.cash_closing : openingBalance;

    const otherDefault = todayOther ?? {
      report_date: todayStr, kitchen: 0, other_income: 0, housekeeping_supply: 0,
      other_expense: 0, salary_advance: 0, maintenance_bill: 0,
      cash_handover_md: 0, bank_cash_deposit: 0,
    };
    const todayReport = buildDerivedReport(
      todayStr, todayEntries, otherDefault, prevClosing, totalRooms,
      todayFinance.map((e: ExpenseEntry) => ({ category: e.category_name, amount: e.amount })),
      todayRevenue.map((e: RevenueEntry) => ({ category: e.revenue_head, amount: e.amount })),
    );

    const closedMtdReports = monthReports.filter((r: DerivedReport) => r.day_status === 'closed');
    const lastClosed = closeRecords.length > 0 ? closeRecords[0].business_date : null;
    const mtdReportsToUse = closedMtdReports.length > 0 ? closedMtdReports : monthReports;
    const mtdAgg = aggregateDerived(mtdReportsToUse, totalRooms, new Date(year, month, 0).getDate());

    const ytdAgg = aggregateDerived(yearReports, totalRooms, 365);

    const weekReports: DerivedReport[] = [];
    for (let i = 6; i >= 0; i--) {
      const wd = new Date();
      wd.setDate(wd.getDate() - i);
      const wStr = wd.toISOString().slice(0, 10);
      const wr = monthReports.find((r: DerivedReport) => r.report_date === wStr)
        ?? yearReports.find((r: DerivedReport) => r.report_date === wStr);
      if (wr && (wr.rooms_occupied > 0 || calcTotalRevenue(wr) > 0)) {
        weekReports.push(wr);
      }
    }

    const activeRooms = allRooms.filter((r: Room) => r.is_active);
    const occupiedRoomNos = new Set(todayEntries.map((e: RoomChartEntry) => e.room_no.trim().toLowerCase()));
    const reservedRoomNos = new Set(todayReservations.filter((r: { status: string; room_no: string }) => r.status === 'confirmed').map((r: { room_no: string }) => r.room_no.trim().toLowerCase()));
    const blockedRoomNos = new Set(todayBlocks.filter((b: { block_type: string; room_no: string }) => b.block_type === 'Blocked').map((b: { room_no: string }) => b.room_no.trim().toLowerCase()));
    const maintenanceRoomNos = new Set(todayBlocks.filter((b: { block_type: string; room_no: string }) => b.block_type === 'HouseUse').map((b: { room_no: string }) => b.room_no.trim().toLowerCase()));
    const oooRoomNos = new Set(todayBlocks.filter((b: { block_type: string; room_no: string }) => b.block_type === 'OutOfOrder').map((b: { room_no: string }) => b.room_no.trim().toLowerCase()));
    const roomPreview = {
      categories: allCategories.map((cat: RoomCategory) => {
        const catRooms = activeRooms.filter((r: Room) => r.category_id === cat.id);
        const catRoomNos = new Set(catRooms.map((r: Room) => r.room_no.trim().toLowerCase()));
        let occupied = 0, reserved = 0, blocked = 0, maintenance = 0, outOfOrder = 0;
        for (const rn of catRoomNos) {
          if (occupiedRoomNos.has(rn)) occupied++;
          else if (reservedRoomNos.has(rn)) reserved++;
          else if (blockedRoomNos.has(rn)) blocked++;
          else if (maintenanceRoomNos.has(rn)) maintenance++;
          else if (oooRoomNos.has(rn)) outOfOrder++;
        }
        return { name: cat.name, total: catRooms.length, occupied, reserved, blocked, maintenance, outOfOrder };
      }),
    };

    const arrivals = todayReservations.filter((r: { check_in_date: string }) => r.check_in_date === todayStr).length;
    const departures = todayReservations.filter((r: { check_out_date: string }) => r.check_out_date === todayStr).length;
    const inHouse = todayEntries.length;
    const available = activeRooms.length - inHouse;
    const opsToday = {
      arrivals,
      departures,
      inHouse,
      available: available < 0 ? 0 : available,
      occupied: inHouse,
      dueCheckouts: departures,
      todayCheckins: arrivals,
    };

    return {
      settings: s,
      today: todayReport,
      mtd: {
        roomRevenue: mtdAgg.roomRevenue,
        totalRevenue: mtdAgg.totalRevenue,
        occ: mtdAgg.occ,
        arr: mtdAgg.arr,
        revpar: mtdAgg.revpar,
        roomNights: mtdAgg.roomsSold,
        cash: mtdAgg.cash,
        bank: mtdAgg.bank,
        totalExpenses: mtdAgg.totalExpenses,
        netIncome: mtdAgg.totalRevenue - mtdAgg.totalExpenses,
        payCash: mtdAgg.payCash,
        payUpi: mtdAgg.payUpi,
        payCard: mtdAgg.payCard,
        payBank: mtdAgg.payBank,
        ota: mtdAgg.ota,
        direct: mtdAgg.direct,
        corp: mtdAgg.corp,
        phone: mtdAgg.phone,
        fbRevenue: mtdAgg.fbRevenue,
        miscRevenue: mtdAgg.miscRevenue,
        otherRevenue: mtdAgg.otherRevenueEntries,
        expenseByCategory: mtdAgg.financeExpenseByCategory,
      },
      ytd: {
        roomRevenue: ytdAgg.roomRevenue,
        totalRevenue: ytdAgg.totalRevenue,
        occ: ytdAgg.occ,
        arr: ytdAgg.arr,
        revpar: ytdAgg.revpar,
        roomNights: ytdAgg.roomsSold,
        cash: ytdAgg.cash,
        bank: ytdAgg.bank,
        totalExpenses: ytdAgg.totalExpenses,
        netIncome: ytdAgg.totalRevenue - ytdAgg.totalExpenses,
        payCash: ytdAgg.payCash,
        payUpi: ytdAgg.payUpi,
        payCard: ytdAgg.payCard,
        payBank: ytdAgg.payBank,
      },
      weekReports,
      lastClosedDate: lastClosed,
      ranking,
      roomPreview,
      opsToday,
    };
  } catch {
    return getMockDashboardSummary(s, todayStr);
  }
};

export const getDashboardSummary = getOperationsBoardData;



// ── Close Day Engine ──────────────────────────────────────────────────────────

import type {
  DayCloseRecord, DayCloseAuditLog, DailyReportSnapshot,
  MtdYtdData, CashFlowData, CloseDayResult,
} from './types';

// Get the day close record for a business date
export const getDayCloseRecord = async (businessDate: string): Promise<DayCloseRecord | null> => {
  const { data, error } = await supabase
    .from('day_close_records')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .eq('business_date', businessDate)
    .maybeSingle();
  if (error) throw error;
  return data as DayCloseRecord | null;
};

// Validate entries before closing the day
export const validateDayForClose = async (businessDate: string): Promise<string[]> => {
  const warnings: string[] = [];
  const entries = await getRoomChart(businessDate);
  for (const e of entries) {
    if (e.is_complimentary) continue;
    if (!e.guest_name?.trim()) warnings.push(`Room ${e.room_no}: Missing guest name`);
    if (toNum(e.room_rate) <= 0 && toNum(e.total) <= 0) warnings.push(`Room ${e.room_no}: No tariff entered`);
    if (!e.company?.trim()) warnings.push(`Room ${e.room_no}: Missing booking source`);
    if (!e.pay_mode?.trim()) warnings.push(`Room ${e.room_no}: Missing payment mode`);
    if (!e.gst_type) warnings.push(`Room ${e.room_no}: Missing GST type`);
  }
  return warnings;
};

// Close Day: freeze, generate report, MTD/YTD, cash flow, snapshot
export const closeDay = async (
  businessDate: string, performedBy: string,
): Promise<CloseDayResult> => {
  const hotelId = getCurrentHotelId();
  const settings = await getSettings();
  const totalRooms = settings.total_rooms;

  // Check if already closed
  const existing = await getDayCloseRecord(businessDate);
  if (existing?.status === 'closed') {
    throw new Error('This business date is already closed. Reopen it first.');
  }

  // Validate
  const warnings = await validateDayForClose(businessDate);

  // Generate the daily report
  const report = await getDerivedReport(businessDate, totalRooms, settings.opening_cash_balance);

  // Get previous day's MTD/YTD
  const prevDate = new Date(businessDate + 'T00:00:00');
  prevDate.setDate(prevDate.getDate() - 1);
  const prevStr = prevDate.toISOString().slice(0, 10);

  const prevMtdYtd = await getMtdYtd(prevStr);
  const prevMtd = prevMtdYtd?.mtd_data ?? null;
  const prevYtd = prevMtdYtd?.ytd_data ?? null;

  // Calculate MTD days (days from start of month to this date)
  const monthStart = `${businessDate.slice(0, 8)}01`;
  const mtdDays = Math.max(1, Math.round(
    (new Date(businessDate).getTime() - new Date(monthStart).getTime()) / 86400000
  ) + 1);

  // Calculate YTD days (days from Jan 1 to this date)
  const yearStart = `${businessDate.slice(0, 4)}-01-01`;
  const ytdDays = Math.max(1, Math.round(
    (new Date(businessDate).getTime() - new Date(yearStart).getTime()) / 86400000
  ) + 1);

  const { mtd, ytd } = buildMtdYtdFromDaily(report, prevMtd, prevYtd, totalRooms, mtdDays, ytdDays);

  // Cash flow
  const openingCash = report.cash_closing - toNum(report.pay_cash) + toNum(report.housekeeping_supply) + toNum(report.other_expense) + toNum(report.maintenance_bill) + toNum(report.finance_expenses) + toNum(report.salary_advance) + toNum(report.cash_handover_md) + toNum(report.bank_cash_deposit);
  const cashFlow = buildCashFlow(openingCash, report);
  cashFlow.cash_closing = report.cash_closing;

  // Report version
  const reportVersion = (existing?.report_version ?? 0) + 1;

  // 1. Upsert day_close_records
  const closePayload = {
    hotel_id: hotelId,
    business_date: businessDate,
    status: 'closed' as const,
    closed_by: performedBy,
    closed_at: new Date().toISOString(),
    report_version: reportVersion,
    cash_closing: report.cash_closing,
    opening_cash_next_day: report.cash_closing,
  };
  if (existing) {
    const { error } = await supabase
      .from('day_close_records')
      .update({ ...closePayload, updated_at: new Date().toISOString(), reopened_by: null, reopened_at: null, reopen_reason: null })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('day_close_records').insert(closePayload);
    if (error) throw error;
  }

  // 2. Insert audit log
  const { error: auditErr } = await supabase.from('day_close_audit_log').insert({
    hotel_id: hotelId,
    business_date: businessDate,
    action: 'close',
    performed_by: performedBy,
    old_values: existing ? { status: existing.status, report_version: existing.report_version } : null,
    new_values: { status: 'closed', report_version: reportVersion },
    report_version: reportVersion,
  });
  if (auditErr) throw auditErr;

  // 3. Upsert daily_report_snapshot
  const snapshotPayload = {
    hotel_id: hotelId,
    business_date: businessDate,
    report_version: reportVersion,
    report_data: report,
    mtd_data: mtd,
    ytd_data: ytd,
    cash_flow_data: cashFlow,
    generated_by: performedBy,
  };
  // Delete old snapshots for this date (keep only latest version)
  await supabase.from('daily_report_snapshots')
    .delete()
    .eq('hotel_id', hotelId)
    .eq('business_date', businessDate)
    .lt('report_version', reportVersion);
  const { error: snapErr } = await supabase.from('daily_report_snapshots').insert(snapshotPayload);
  if (snapErr) throw snapErr;

  // 4. Upsert MTD/YTD store
  const mtdYtdPayload = {
    hotel_id: hotelId,
    business_date: businessDate,
    mtd_data: mtd,
    ytd_data: ytd,
    updated_at: new Date().toISOString(),
  };
  const { data: existingMtd } = await supabase
    .from('mtd_ytd_store')
    .select('id')
    .eq('hotel_id', hotelId)
    .eq('business_date', businessDate)
    .maybeSingle();
  if (existingMtd) {
    await supabase.from('mtd_ytd_store').update(mtdYtdPayload).eq('id', (existingMtd as { id: string }).id);
  } else {
    await supabase.from('mtd_ytd_store').insert(mtdYtdPayload);
  }

  // 5. Upsert cash flow store
  const cashFlowPayload = {
    hotel_id: hotelId,
    business_date: businessDate,
    ...cashFlow,
    updated_at: new Date().toISOString(),
  };
  const { data: existingCash } = await supabase
    .from('cash_flow_store')
    .select('id')
    .eq('hotel_id', hotelId)
    .eq('business_date', businessDate)
    .maybeSingle();
  if (existingCash) {
    await supabase.from('cash_flow_store').update(cashFlowPayload).eq('id', (existingCash as { id: string }).id);
  } else {
    await supabase.from('cash_flow_store').insert(cashFlowPayload);
  }

  return {
    success: true,
    business_date: businessDate,
    report,
    mtd,
    ytd,
    cash_flow: cashFlow,
    report_version: reportVersion,
    warnings,
  };
};

// Reopen Day: unlock, audit, regenerate
export const reopenDay = async (
  businessDate: string, performedBy: string, reason: string,
): Promise<CloseDayResult> => {
  const hotelId = getCurrentHotelId();
  const existing = await getDayCloseRecord(businessDate);
  if (!existing || existing.status !== 'closed') {
    throw new Error('This business date is not closed.');
  }
  if (!reason.trim()) throw new Error('A reason is required to reopen a closed day.');

  // Capture old values for audit
  const oldValues = {
    status: existing.status,
    report_version: existing.report_version,
    cash_closing: existing.cash_closing,
  };

  // Update status to reopened
  const { error: updateErr } = await supabase
    .from('day_close_records')
    .update({
      status: 'reopened',
      reopened_by: performedBy,
      reopened_at: new Date().toISOString(),
      reopen_reason: reason.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id);
  if (updateErr) throw updateErr;

  // Insert audit log
  const { error: auditErr } = await supabase.from('day_close_audit_log').insert({
    hotel_id: hotelId,
    business_date: businessDate,
    action: 'reopen',
    performed_by: performedBy,
    reason: reason.trim(),
    old_values: oldValues,
    new_values: { status: 'reopened' },
    report_version: existing.report_version,
  });
  if (auditErr) throw auditErr;

  // Regenerate report, MTD, YTD
  const result = await closeDay(businessDate, performedBy);
  return result;
};

// Get MTD/YTD from store
export const getMtdYtd = async (businessDate: string): Promise<{ mtd_data: MtdYtdData; ytd_data: MtdYtdData } | null> => {
  const { data, error } = await supabase
    .from('mtd_ytd_store')
    .select('mtd_data, ytd_data')
    .eq('hotel_id', getCurrentHotelId())
    .eq('business_date', businessDate)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data as { mtd_data: MtdYtdData; ytd_data: MtdYtdData };
};

// Get daily report snapshot
export const getDailyReportSnapshot = async (businessDate: string): Promise<DailyReportSnapshot | null> => {
  const { data, error } = await supabase
    .from('daily_report_snapshots')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .eq('business_date', businessDate)
    .order('report_version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as DailyReportSnapshot | null;
};

// Get audit log for a business date
export const getDayCloseAuditLog = async (businessDate: string): Promise<DayCloseAuditLog[]> => {
  const { data, error } = await supabase
    .from('day_close_audit_log')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .eq('business_date', businessDate)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as DayCloseAuditLog[]) ?? [];
};

// ---- GST report export audit ----

export const logGstExport = async (
  selectedMonth: string,
  exportType: 'pdf' | 'excel' | 'print',
  bookingCount: number,
): Promise<void> => {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  const userEmail = userData.user?.email ?? null;
  const { error } = await supabase.from('gst_report_exports').insert({
    hotel_id: getCurrentHotelId(),
    selected_month: selectedMonth,
    export_type: exportType,
    performed_by: userId,
    performed_by_email: userEmail,
    booking_count: bookingCount,
  });
  if (error) throw error;
};

// Get cash flow from store
export const getCashFlow = async (businessDate: string): Promise<CashFlowData | null> => {
  const { data, error } = await supabase
    .from('cash_flow_store')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .eq('business_date', businessDate)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const d = data as Record<string, number | string>;
  return {
    opening_cash: toNum(d.opening_cash),
    cash_collection: toNum(d.cash_collection),
    cash_expenses: toNum(d.cash_expenses),
    salary_advance: toNum(d.salary_advance),
    cash_handover: toNum(d.cash_handover),
    bank_deposit: toNum(d.bank_deposit),
    cash_closing: toNum(d.cash_closing),
  };
};

export const getEnabledHotelFeatures = async (): Promise<Record<string, boolean>> => {
  const hotelId = getCurrentHotelId();
  if (!hotelId) return {};
  try {
    const { data, error } = await supabase
      .from('hotel_features')
      .select('module_key, is_enabled')
      .eq('hotel_id', hotelId);
    if (error) return {};
    const map: Record<string, boolean> = {};
    for (const r of data ?? []) {
      map[r.module_key] = Boolean(r.is_enabled);
    }
    return map;
  } catch {
    return {};
  }
};


