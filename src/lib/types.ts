export type SourceCategory = 'OTA' | 'Direct/Walking' | 'Corporate/Agent' | 'Phonebook';
export type PayMode = 'Cash' | 'Bank';
export type MealPlan = 'EP' | 'CP' | 'MAP' | 'AP';
export type GstMode = 'Inclusive' | 'Exclusive';
export type GstType = 'No Scope' | 'Inclusive' | 'Exclusive';
export type GstSlab = 0 | 5 | 12 | 18;

export const GST_SLABS: GstSlab[] = [0, 5, 12, 18];
export const GST_MODES: { value: GstMode; label: string }[] = [
  { value: 'Exclusive', label: 'Exclusive (Tax added on top)' },
  { value: 'Inclusive', label: 'Inclusive (Tax included in rate)' },
];
export const GST_TYPES: { value: GstType; label: string }[] = [
  { value: 'No Scope', label: 'No Scope (No GST applicable)' },
  { value: 'Exclusive', label: 'Exclusive (Tax added on top)' },
  { value: 'Inclusive', label: 'Inclusive (Tax included in rate)' },
];
export const REVENUE_CATEGORIES = ['Room Revenue', 'F&B Revenue', 'Misc Revenue'] as const;
export type RevenueCategory = (typeof REVENUE_CATEGORIES)[number];
export const SPLIT_PAYMENT_KEYS = ['pay_cash', 'pay_upi', 'pay_card', 'pay_bank', 'pay_advance', 'pay_balance'] as const;
export type SplitPaymentKey = (typeof SPLIT_PAYMENT_KEYS)[number];
export const SPLIT_PAY_MODE_KEYS = ['pay_cash', 'pay_upi', 'pay_card', 'pay_bank'] as const;
export type SplitPayModeKey = (typeof SPLIT_PAY_MODE_KEYS)[number];
export const SPLIT_PAYMENT_LABELS: Record<SplitPaymentKey, string> = {
  pay_cash: 'Cash',
  pay_upi: 'UPI',
  pay_card: 'Card',
  pay_bank: 'Bank Transfer',
  pay_advance: 'Advance (auto)',
  pay_balance: 'Balance (auto)',
};

export const SOURCE_CATEGORIES: SourceCategory[] = ['OTA', 'Direct/Walking', 'Corporate/Agent', 'Phonebook'];

export const MEAL_PLANS: { value: MealPlan; label: string }[] = [
  { value: 'EP',  label: 'EP – Room Only' },
  { value: 'CP',  label: 'CP – Room + Breakfast' },
  { value: 'MAP', label: 'MAP – Room + Breakfast + Dinner' },
  { value: 'AP',  label: 'AP – Room + All Meals' },
];

export interface HotelSettings {
  id: string;
  hotel_name: string;
  legal_name: string;
  total_rooms: number;
  opening_cash_balance: number;
  financial_year: number;
  logo_url: string;
  // Contact
  address: string;
  city: string;
  state_name: string;
  pin_code: string;
  phone: string;
  whatsapp_number: string;
  email: string;
  website: string;
  // Tax & business
  gst_number: string;
  pan_number: string;
  hotel_reg_number: string;
  cin_number: string;
  // Manager / admin
  manager_name: string;
  manager_mobile: string;
  admin_name: string;
  // Bank
  bank_name: string;
  account_name: string;
  account_number: string;
  ifsc_code: string;
  // GST
  gst_registered: boolean;
  gst_mode: GstMode;
  default_gst_slab: GstSlab;
  // POS
  restaurant_pos_enabled: boolean;
}

// ── POS Menu Management types ──

export interface PosMenuCategory {
  id: string;
  hotel_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PosMenuCategoryInput = Omit<PosMenuCategory, 'id' | 'hotel_id' | 'created_at' | 'updated_at'>;

export interface PosMenuItem {
  id: string;
  hotel_id: string;
  category_id: string | null;
  name: string;
  is_veg: boolean;
  price: number;
  gst_percent: number;
  description: string;
  is_active: boolean;
  is_available: boolean;
  image_url: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export type PosMenuItemInput = Omit<PosMenuItem, 'id' | 'hotel_id' | 'created_at' | 'updated_at'>;

// ── POS Table Management types ──

export type PosTableStatus = 'available' | 'occupied' | 'reserved' | 'billing' | 'cleaning';

export const POS_TABLE_STATUSES: { value: PosTableStatus; label: string; color: string; dot: string }[] = [
  { value: 'available', label: 'Available', color: 'bg-emerald-50 text-emerald-600 border-emerald-200', dot: 'bg-emerald-500' },
  { value: 'occupied', label: 'Occupied', color: 'bg-amber-50 text-amber-600 border-amber-200', dot: 'bg-amber-500' },
  { value: 'reserved', label: 'Reserved', color: 'bg-blue-50 text-blue-600 border-blue-200', dot: 'bg-blue-500' },
  { value: 'billing', label: 'Billing', color: 'bg-violet-50 text-violet-600 border-violet-200', dot: 'bg-violet-500' },
  { value: 'cleaning', label: 'Cleaning', color: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-400' },
];

export interface PosArea {
  id: string;
  hotel_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PosAreaInput = Omit<PosArea, 'id' | 'hotel_id' | 'created_at' | 'updated_at'>;

export interface PosTable {
  id: string;
  hotel_id: string;
  area_id: string | null;
  name: string;
  seating_capacity: number;
  display_order: number;
  is_active: boolean;
  current_status: PosTableStatus;
  created_at: string;
  updated_at: string;
}

export type PosTableInput = Omit<PosTable, 'id' | 'hotel_id' | 'created_at' | 'updated_at'>;

// ── POS Order & KOT types ──

export type PosOrderType = 'dine_in' | 'room_service' | 'takeaway';
export type PosOrderStatus = 'draft' | 'open' | 'kot_sent' | 'completed' | 'cancelled';
export type KotStatus = 'sent' | 'preparing' | 'ready' | 'served' | 'cancelled';

export const KOT_COLUMNS: { status: KotStatus; label: string; color: string; dot: string }[] = [
  { status: 'sent', label: 'New', color: 'border-blue-300 bg-blue-50', dot: 'bg-blue-500' },
  { status: 'preparing', label: 'Preparing', color: 'border-amber-300 bg-amber-50', dot: 'bg-amber-500' },
  { status: 'ready', label: 'Ready', color: 'border-emerald-300 bg-emerald-50', dot: 'bg-emerald-500' },
  { status: 'served', label: 'Served', color: 'border-slate-300 bg-slate-50', dot: 'bg-slate-400' },
];

export interface PosOrder {
  id: string;
  hotel_id: string;
  order_number: string;
  order_type: PosOrderType;
  status: PosOrderStatus;
  table_id: string | null;
  room_chart_entry_id: string | null;
  room_no: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  guest_count: number | null;
  waiter_name: string | null;
  subtotal: number;
  discount_amount: number;
  discount_type: string | null;
  discount_value: number | null;
  gst_amount: number;
  grand_total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PosOrderItem {
  id: string;
  hotel_id: string;
  order_id: string;
  menu_item_id: string | null;
  name: string;
  is_veg: boolean;
  rate: number;
  gst_percent: number;
  quantity: number;
  line_total: number;
  note: string | null;
  kot_id: string | null;
  created_at: string;
}

export interface PosKot {
  id: string;
  hotel_id: string;
  kot_number: string;
  order_id: string;
  kot_status: KotStatus;
  cancelled_reason: string | null;
  kitchen_status_updated_at: string | null;
  priority: 'normal' | 'urgent';
  created_at: string;
}

export interface PosKotItem {
  id: string;
  hotel_id: string;
  kot_id: string;
  order_item_id: string | null;
  name: string;
  quantity: number;
  note: string | null;
  is_veg: boolean;
  created_at: string;
}

// Cart line used in the New Order UI (before persistence)
export interface CartLine {
  key: string;
  menu_item_id: string;
  name: string;
  is_veg: boolean;
  rate: number;
  gst_percent: number;
  quantity: number;
  note: string;
}

// ── POS Bill & Payment types ──

export type BillStatus = 'open' | 'billed' | 'paid' | 'posted_to_room' | 'void';
export type PaymentMode = 'cash' | 'upi' | 'card' | 'bank' | 'post_to_room';

export interface PosBill {
  id: string;
  hotel_id: string;
  bill_number: string;
  order_id: string;
  status: BillStatus;
  subtotal: number;
  discount_amount: number;
  discount_type: string | null;
  discount_value: number | null;
  discount_reason: string | null;
  gst_amount: number;
  grand_total: number;
  void_reason: string | null;
  voided_by: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PosPayment {
  id: string;
  hotel_id: string;
  bill_id: string;
  order_id: string;
  payment_mode: PaymentMode;
  amount: number;
  reference_no: string | null;
  room_chart_entry_id: string | null;
  folio_charge_id: string | null;
  created_at: string;
}

export interface CompanySource {
  id: string;
  hotel_id: string;
  name: string;
  source_category: SourceCategory;
}

export interface RoomCategory {
  id: string;
  hotel_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  default_tariff: number;
  extra_bed_charge: number;
  created_at: string;
}

export const CATEGORY_DISPLAY_ORDER = ['SUPER DELUXE', 'FOURBED', 'SUITE'] as const;

export const categorySortIndex = (name: string): number => {
  const upper = name.trim().toUpperCase();
  const idx = CATEGORY_DISPLAY_ORDER.findIndex((c) => upper === c || upper.includes(c));
  return idx === -1 ? 999 : idx;
};

export const compareRoomNo = (a: string, b: string): number => {
  const an = parseInt(a.replace(/\D/g, ''), 10);
  const bn = parseInt(b.replace(/\D/g, ''), 10);
  if (isNaN(an) || isNaN(bn)) return a.localeCompare(b, undefined, { numeric: true });
  if (an !== bn) return an - bn;
  return a.localeCompare(b, undefined, { numeric: true });
};

export const groupRoomsByCategory = <T extends { category_id: string | null }>(
  rooms: T[],
  categories: RoomCategory[],
): { cat: RoomCategory | null; rooms: T[] }[] => {
  const grouped: { cat: RoomCategory | null; rooms: T[] }[] = [];
  const seen = new Set<string>();
  for (const room of rooms) {
    const cat = categories.find((c) => c.id === room.category_id) ?? null;
    const key = cat?.id ?? '__uncategorized';
    if (!seen.has(key)) {
      seen.add(key);
      grouped.push({ cat, rooms: [] });
    }
    grouped.find((g) => (g.cat?.id ?? '__uncategorized') === key)!.rooms.push(room);
  }
  grouped.sort((a, b) => {
    const ai = a.cat ? categorySortIndex(a.cat.name) : 998;
    const bi = b.cat ? categorySortIndex(b.cat.name) : 998;
    if (ai !== bi) return ai - bi;
    return (a.cat?.sort_order ?? 0) - (b.cat?.sort_order ?? 0);
  });
  return grouped;
};

export type HousekeepingStatus =
  | 'Vacant Clean' | 'Vacant Dirty' | 'Occupied'
  | 'Occupied Clean' | 'Occupied Service Due'
  | 'Cleaning In Progress' | 'Ready for Inspection'
  | 'Inspected / Ready' | 'Out Of Order' | 'Blocked';

export type CleaningPriority =
  | 'Urgent Arrival' | 'Departure Room' | 'Stayover Service'
  | 'Normal' | 'VIP' | 'Do Not Disturb' | 'No Service Requested';

export interface Room {
  id: string;
  hotel_id: string;
  room_no: string;
  category_id: string | null;
  floor: string | null;
  default_tariff: number;
  extra_bed_charge: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  housekeeping_status: HousekeepingStatus;
  housekeeping_note: string;
  housekeeping_updated_at: string | null;
  cleaning_priority: CleaningPriority;
  assigned_staff_id: string | null;
  last_cleaned_at: string | null;
  last_inspected_at: string | null;
  last_guest_name: string;
  last_departure_time: string;
}

export type RoomInput = Omit<Room, 'id' | 'hotel_id' | 'created_at'>;

export interface RoomChartEntry {
  id: string;
  hotel_id: string;
  report_date: string;
  room_no: string;
  guest_name: string;
  arrival: string | null;
  departure: string | null;
  nights: number;
  room_rate: number;
  total: number;
  company: string;
  source_category: SourceCategory;
  pay_mode: PayMode;
  description: string;
  is_complimentary: boolean;
  meal_plan: MealPlan;
  // GST
  gst_mode: GstMode;
  gst_type: GstType;
  gst_slab: GstSlab;
  gst_amount: number;
  taxable_amount: number;
  invoice_total: number;
  // Revenue category
  revenue_category: string;
  remarks: string;
  created_by: string;
  business_date: string | null;
  // Room category
  room_category: string;
  // Split payments
  pay_cash: number;
  pay_upi: number;
  pay_card: number;
  pay_bank: number;
  pay_advance: number;
  pay_balance: number;
  // Front office fields
  id_proof_type: string;
  id_proof_number: string;
  id_proof_verified: boolean;
  arrival_time: string;
  checkout_time: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  reservation_id: string | null;
}

export type RoomChartEntryInput = Omit<RoomChartEntry, 'id' | 'hotel_id'>;

export interface OtherDailyEntries {
  id: string;
  hotel_id: string;
  report_date: string;
  kitchen: number;
  other_income: number;
  housekeeping_supply: number;
  other_expense: number;
  salary_advance: number;
  maintenance_bill: number;
  cash_handover_md: number;
  bank_cash_deposit: number;
}

export type OtherDailyEntriesInput = Omit<OtherDailyEntries, 'id' | 'hotel_id'>;

export const emptyOtherEntries = (date: string): OtherDailyEntriesInput => ({
  report_date: date,
  kitchen: 0,
  other_income: 0,
  housekeeping_supply: 0,
  other_expense: 0,
  salary_advance: 0,
  maintenance_bill: 0,
  cash_handover_md: 0,
  bank_cash_deposit: 0,
});

// Derived daily MIS report — computed from room chart + other entries.
export interface DerivedReport {
  report_date: string;
  rooms_occupied: number;
  complimentary_room: number;
  room_sale_amount: number;
  ota: number;
  direct_walking: number;
  corporate_agent: number;
  phonebook: number;
  kitchen: number;
  other_income: number;
  housekeeping_supply: number;
  other_expense: number;
  cash: number;
  bank: number;
  salary_advance: number;
  maintenance_bill: number;
  cash_handover_md: number;
  bank_cash_deposit: number;
  departure: number;
  expected_arrival: number;
  expected_arr: number;
  cash_closing: number;
  // GST
  taxable_revenue: number;
  gst_collected: number;
  cgst: number;
  sgst: number;
  igst: number;
  net_revenue: number;
  invoice_total: number;
  // Revenue breakup by category
  room_revenue: number;
  fb_revenue: number;
  misc_revenue: number;
  // Split payments
  pay_cash: number;
  pay_upi: number;
  pay_card: number;
  pay_bank: number;
  pay_advance: number;
  pay_balance: number;
  // Finance Management expenses (from expense_entries table)
  finance_expenses: number;
  finance_expense_by_category: { category: string; amount: number }[];
  // Other Revenue entries (from daily_revenue_entries table)
  other_revenue_entries: number;
  other_revenue_by_category: { category: string; amount: number }[];
  // Day status
  day_status: 'open' | 'closed' | 'reopened';
  report_version: number;
}

// Legacy DailyReport kept for backward compatibility with existing screens.
export interface DailyReport {
  id: string;
  hotel_id: string;
  report_date: string;
  rooms_occupied: number;
  complimentary_room: number;
  room_sale_amount: number;
  ota: number;
  direct_walking: number;
  corporate_agent: number;
  phonebook: number;
  kitchen: number;
  other_income: number;
  housekeeping_supply: number;
  other_expense: number;
  cash: number;
  bank: number;
  salary_advance: number;
  maintenance_bill: number;
  cash_handover_md: number;
  bank_cash_deposit: number;
  departure: number;
  expected_arrival: number;
  expected_arr: number;
  cash_closing: number;
}

export type DailyReportInput = Omit<DailyReport, 'id' | 'hotel_id' | 'cash_closing'>;

// ── Close Day / Audit types ──
export interface DayCloseRecord {
  id: string;
  hotel_id: string;
  business_date: string;
  status: 'open' | 'closed' | 'reopened';
  closed_by: string;
  closed_at: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
  report_version: number;
  cash_closing: number;
  opening_cash_next_day: number;
  created_at: string;
  updated_at: string;
}

export interface DayCloseAuditLog {
  id: string;
  hotel_id: string;
  business_date: string;
  action: 'close' | 'reopen';
  performed_by: string;
  reason: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  report_version: number;
  created_at: string;
}

export interface DailyReportSnapshot {
  id: string;
  hotel_id: string;
  business_date: string;
  report_version: number;
  report_data: DerivedReport;
  mtd_data: MtdYtdData | null;
  ytd_data: MtdYtdData | null;
  cash_flow_data: CashFlowData | null;
  generated_at: string;
  generated_by: string;
}

export interface MtdYtdData {
  total_rooms: number;
  rooms_sold: number;
  complimentary: number;
  day_use: number;
  room_revenue: number;
  fb_revenue: number;
  misc_revenue: number;
  total_revenue: number;
  cash_collection: number;
  upi: number;
  card: number;
  bank: number;
  ota: number;
  corporate: number;
  phone_booking: number;
  expenses: number;
  gst: number;
  electricity_units: number;
  arr: number;
  occupancy: number;
  revpar: number;
}

export interface CashFlowData {
  opening_cash: number;
  cash_collection: number;
  cash_expenses: number;
  salary_advance: number;
  cash_handover: number;
  bank_deposit: number;
  cash_closing: number;
}

export interface CloseDayResult {
  success: boolean;
  business_date: string;
  report: DerivedReport;
  mtd: MtdYtdData;
  ytd: MtdYtdData;
  cash_flow: CashFlowData;
  report_version: number;
  warnings: string[];
}

export const emptyMtdYtd = (): MtdYtdData => ({
  total_rooms: 0, rooms_sold: 0, complimentary: 0, day_use: 0,
  room_revenue: 0, fb_revenue: 0, misc_revenue: 0, total_revenue: 0,
  cash_collection: 0, upi: 0, card: 0, bank: 0,
  ota: 0, corporate: 0, phone_booking: 0,
  expenses: 0, gst: 0, electricity_units: 0,
  arr: 0, occupancy: 0, revpar: 0,
});

export const emptyCashFlow = (): CashFlowData => ({
  opening_cash: 0, cash_collection: 0, cash_expenses: 0,
  salary_advance: 0, cash_handover: 0, bank_deposit: 0, cash_closing: 0,
});

export const emptyReport = (date: string): DailyReportInput => ({
  report_date: date,
  rooms_occupied: 0,
  complimentary_room: 0,
  room_sale_amount: 0,
  ota: 0,
  direct_walking: 0,
  corporate_agent: 0,
  phonebook: 0,
  kitchen: 0,
  other_income: 0,
  housekeeping_supply: 0,
  other_expense: 0,
  cash: 0,
  bank: 0,
  salary_advance: 0,
  maintenance_bill: 0,
  cash_handover_md: 0,
  bank_cash_deposit: 0,
  departure: 0,
  expected_arrival: 0,
  expected_arr: 0,
});

// ── Front Office types ──

export type TimelineEventType =
  | 'booking_created' | 'confirmation_sent' | 'check_in'
  | 'payment_received' | 'room_shift' | 'stay_extended'
  | 'extra_charge' | 'checkout' | 'invoice_generated';

export interface BookingTimelineEvent {
  id: string;
  hotel_id: string;
  entry_id: string | null;
  reservation_id: string | null;
  event_type: TimelineEventType;
  event_description: string;
  event_amount: number;
  event_data: Record<string, unknown> | null;
  performed_by: string;
  created_at: string;
}

export type FolioChargeType = 'Laundry' | 'Minibar' | 'Extra Bed' | 'Room Service' | 'Other';

export interface FolioCharge {
  id: string;
  hotel_id: string;
  entry_id: string;
  charge_type: FolioChargeType;
  description: string;
  amount: number;
  quantity: number;
  created_at: string;
}

export interface FolioChargeInput {
  entry_id: string;
  charge_type: FolioChargeType;
  description: string;
  amount: number;
  quantity?: number;
}

export interface RoomShift {
  id: string;
  hotel_id: string;
  entry_id: string;
  from_room: string;
  to_room: string;
  reason: string;
  shifted_by: string;
  created_at: string;
}

// ── Permissions ──

export type FrontOfficeRole = 'reception' | 'manager' | 'admin' | 'super_admin';

export const ROLE_LABELS: Record<FrontOfficeRole, string> = {
  reception: 'Reception',
  manager: 'Manager',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

export const ROLE_HIERARCHY: FrontOfficeRole[] = ['reception', 'manager', 'admin', 'super_admin'];

export const canCheckoutAnyway = (role: FrontOfficeRole | null): boolean =>
  role === 'admin' || role === 'super_admin';

export const canRoomShift = (role: FrontOfficeRole | null): boolean =>
  role === 'manager' || role === 'admin' || role === 'super_admin';

export const canDeleteBooking = (role: FrontOfficeRole | null): boolean =>
  role === 'admin' || role === 'super_admin';

export const canManageHousekeeping = (role: FrontOfficeRole | null): boolean =>
  role !== null;

export const mapAuthRoleToFrontOffice = (
  authRole: string | null,
): FrontOfficeRole => {
  if (authRole === 'super_admin') return 'super_admin';
  if (authRole === 'hotel_admin') return 'admin';
  return 'reception';
};
