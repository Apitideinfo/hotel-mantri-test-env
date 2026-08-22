// ── Finance layer types ──────────────────────────────────────────────────────

export type PaymentMode = 'Cash' | 'Bank' | 'UPI' | 'Credit';
export type BillStatus = 'Pending' | 'Paid' | 'PartiallyPaid';
export type SalaryPayMode = 'Cash' | 'Bank' | 'UPI';
export type LaundryDirection = 'In' | 'Out';
export type LaundryType = 'Revenue' | 'Expense';

export const PAYMENT_MODES: PaymentMode[] = ['Cash', 'Bank', 'UPI', 'Credit'];
export const SALARY_PAY_MODES: SalaryPayMode[] = ['Cash', 'Bank', 'UPI'];
export const BILL_STATUSES: BillStatus[] = ['Pending', 'Paid', 'PartiallyPaid'];
export const STAFF_DEPARTMENTS = [
  'Front Office', 'Housekeeping', 'Kitchen', 'Restaurant',
  'Maintenance', 'Security', 'Management', 'Other',
] as const;
export type StaffDepartment = (typeof STAFF_DEPARTMENTS)[number];

export const LAUNDRY_ITEMS = [
  'Bedsheet', 'Pillow Cover', 'Towel', 'Bath Towel', 'Blanket',
  'Curtain', 'Table Cloth', 'Napkin', 'Uniform', 'Other',
] as const;

export const UTILITY_BILL_TYPES = ['Water', 'Internet', 'Gas', 'Telephone', 'Insurance', 'Other'] as const;
export type UtilityBillType = (typeof UTILITY_BILL_TYPES)[number];

// ── Expense Category ─────────────────────────────────────────────────────────
export interface ExpenseCategory {
  id: string;
  hotel_id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

// ── Expense Entry ────────────────────────────────────────────────────────────
export interface ExpenseEntry {
  id: string;
  hotel_id: string;
  entry_date: string;
  category_id: string | null;
  category_name: string;
  amount: number;
  payment_mode: PaymentMode;
  description: string;
  bill_no: string;
  is_paid: boolean;
  paid_date: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ExpenseEntryInput = Omit<ExpenseEntry, 'id' | 'hotel_id' | 'created_at' | 'updated_at' | 'created_by' | 'notes'> & {
  created_by?: string | null;
  notes?: string;
};

// ── Daily Revenue Entry (Other Revenue from Daily Room Chart) ─────────────────
export type RevenuePaymentMode = 'Cash' | 'Bank' | 'UPI' | 'Card';

export const REVENUE_HEADS = [
  'Kitchen', 'Laundry', 'Extra Bed', 'Hall Rental', 'Parking', 'Other Income',
] as const;
export type RevenueHead = (typeof REVENUE_HEADS)[number];

export const EXPENSE_HEADS = [
  'Salary', 'Salary Advance', 'Housekeeping', 'Maintenance', 'Electricity',
  'Water', 'Laundry', 'Kitchen Purchase', 'Generator Diesel', 'Mobile Recharge',
  'Internet', 'Gas Refill', 'Marketing', 'Commission', 'Vehicle', 'Office Expense',
  'Miscellaneous',
] as const;
export type ExpenseHead = (typeof EXPENSE_HEADS)[number];

export interface RevenueEntry {
  id: string;
  hotel_id: string;
  entry_date: string;
  revenue_head: string;
  description: string;
  amount: number;
  payment_mode: RevenuePaymentMode;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type RevenueEntryInput = Omit<RevenueEntry, 'id' | 'hotel_id' | 'created_at' | 'updated_at' | 'created_by'>;

// ── Staff ────────────────────────────────────────────────────────────────────
export interface StaffMember {
  id: string;
  hotel_id: string;
  name: string;
  employee_id: string;
  department: StaffDepartment;
  designation: string;
  joining_date: string | null;
  monthly_salary: number;
  payment_mode: SalaryPayMode;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type StaffInput = Omit<StaffMember, 'id' | 'hotel_id' | 'created_at' | 'updated_at'>;

// ── Salary Advance ───────────────────────────────────────────────────────────
export interface SalaryAdvance {
  id: string;
  hotel_id: string;
  staff_id: string;
  advance_date: string;
  amount: number;
  payment_mode: SalaryPayMode;
  remark: string;
  month_key: string;
  created_at: string;
}

export type SalaryAdvanceInput = Omit<SalaryAdvance, 'id' | 'hotel_id' | 'created_at'>;

// ── Salary Settlement ────────────────────────────────────────────────────────
export interface SalarySettlement {
  id: string;
  hotel_id: string;
  staff_id: string;
  month_key: string;
  monthly_salary: number;
  total_advance: number;
  final_payment: number;
  payment_mode: SalaryPayMode;
  payment_date: string | null;
  status: 'Pending' | 'Paid' | 'PartiallyPaid';
  remark: string;
  created_at: string;
  updated_at: string;
}

export type SalarySettlementInput = Omit<SalarySettlement, 'id' | 'hotel_id' | 'created_at' | 'updated_at'>;

// ── Electricity ──────────────────────────────────────────────────────────────
export interface ElectricityReading {
  id: string;
  hotel_id: string;
  month_key: string;
  prev_reading: number;
  curr_reading: number;
  units_consumed: number;       // computed column
  bill_amount: number;
  bill_date: string | null;
  due_date: string | null;
  payment_date: string | null;
  payment_mode: PaymentMode;
  status: BillStatus;
  remarks: string;
  created_at: string;
  updated_at: string;
}

export type ElectricityInput = Omit<ElectricityReading, 'id' | 'hotel_id' | 'units_consumed' | 'created_at' | 'updated_at'>;

// ── Utility Bills ────────────────────────────────────────────────────────────
export interface UtilityBill {
  id: string;
  hotel_id: string;
  bill_type: string;
  vendor: string;
  bill_date: string | null;
  due_date: string | null;
  amount: number;
  payment_date: string | null;
  payment_mode: PaymentMode;
  status: BillStatus;
  remarks: string;
  created_at: string;
  updated_at: string;
}

export type UtilityBillInput = Omit<UtilityBill, 'id' | 'hotel_id' | 'created_at' | 'updated_at'>;

// ── Laundry Entry ────────────────────────────────────────────────────────────
export interface LaundryEntry {
  id: string;
  hotel_id: string;
  entry_date: string;
  transaction_type: LaundryType;
  direction: LaundryDirection;
  room_dept: string;
  item: string;
  quantity: number;
  rate: number;
  amount: number;
  vendor: string;
  payment_status: 'Pending' | 'Paid';
  remarks: string;
  created_at: string;
}

export type LaundryEntryInput = Omit<LaundryEntry, 'id' | 'hotel_id' | 'created_at'>;

// ── Monthly Bill ─────────────────────────────────────────────────────────────
export interface MonthlyBill {
  id: string;
  hotel_id: string;
  bill_name: string;
  vendor: string;
  bill_date: string | null;
  due_date: string | null;
  amount: number;
  payment_mode: PaymentMode;
  status: BillStatus;
  paid_date: string | null;
  remarks: string;
  month_key: string;
  created_at: string;
  updated_at: string;
}

export type MonthlyBillInput = Omit<MonthlyBill, 'id' | 'hotel_id' | 'created_at' | 'updated_at'>;

// ── Monthly Profitability (computed) ─────────────────────────────────────────
export interface MonthlyProfitability {
  month_key: string;
  // Revenue
  room_revenue: number;
  fb_revenue: number;
  laundry_revenue: number;
  other_revenue: number;
  total_revenue: number;
  // Expenses by category
  salary_expense: number;      // sum of monthly_salary from settlements in that month
  expense_by_category: { category: string; amount: number }[];
  total_expenses: number;
  // Cash movements from daily reports (matches WhatsApp report)
  cash: number;
  bank: number;
  salary_advance: number;
  maintenance_bill: number;
  cash_handover_md: number;
  bank_cash_deposit: number;
  cash_closing: number;
  // Daily-report expenses (housekeeping_supply + other_expense)
  daily_housekeeping_supply: number;
  daily_other_expense: number;
  // Result
  net_operating_profit: number;
  profit_margin: number;
  // GST
  taxable_revenue: number;
  gst_collected: number;
  net_revenue: number;
  // Split payments
  pay_cash: number;
  pay_upi: number;
  pay_card: number;
  pay_bank: number;
  pay_advance: number;
  pay_balance: number;
}
