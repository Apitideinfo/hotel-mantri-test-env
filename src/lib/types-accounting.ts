// ── Enterprise Accounting Types (Phase 10) ──

export type AccountGroup = 'ASSETS' | 'LIABILITIES' | 'INCOME' | 'EXPENSES' | 'EQUITY';

export interface ChartOfAccount {
  id: string;
  hotel_id: string;
  account_code: string;
  account_name: string;
  account_group: AccountGroup;
  account_subgroup: string;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  created_at: string;
}

export type ChartOfAccountInput = Omit<ChartOfAccount, 'id' | 'hotel_id' | 'created_at' | 'is_system'>;

// Default account templates seeded for every hotel
export const DEFAULT_ACCOUNT_TEMPLATES: Array<{ code: string; name: string; group: AccountGroup; subgroup: string }> = [
  // ASSETS
  { code: '1001', name: 'Cash in Hand', group: 'ASSETS', subgroup: 'Current Assets' },
  { code: '1002', name: 'Bank Accounts', group: 'ASSETS', subgroup: 'Current Assets' },
  { code: '1003', name: 'UPI / Gateway Clearing', group: 'ASSETS', subgroup: 'Current Assets' },
  { code: '1004', name: 'OTA Receivable', group: 'ASSETS', subgroup: 'Current Assets' },
  { code: '1005', name: 'Corporate Receivable', group: 'ASSETS', subgroup: 'Current Assets' },
  { code: '1006', name: 'Travel Agent Receivable', group: 'ASSETS', subgroup: 'Current Assets' },
  { code: '1007', name: 'Guest Receivable', group: 'ASSETS', subgroup: 'Current Assets' },
  { code: '1008', name: 'Advance to Staff', group: 'ASSETS', subgroup: 'Current Assets' },
  { code: '1009', name: 'Security Deposits', group: 'ASSETS', subgroup: 'Current Assets' },
  { code: '1010', name: 'Other Current Assets', group: 'ASSETS', subgroup: 'Current Assets' },
  { code: '1011', name: 'Fixed Assets', group: 'ASSETS', subgroup: 'Fixed Assets' },
  // LIABILITIES
  { code: '2001', name: 'Vendor Payable', group: 'LIABILITIES', subgroup: 'Current Liabilities' },
  { code: '2002', name: 'Salary Payable', group: 'LIABILITIES', subgroup: 'Current Liabilities' },
  { code: '2003', name: 'GST Payable', group: 'LIABILITIES', subgroup: 'Tax Payables' },
  { code: '2004', name: 'TDS Payable', group: 'LIABILITIES', subgroup: 'Tax Payables' },
  { code: '2005', name: 'Guest Advance', group: 'LIABILITIES', subgroup: 'Current Liabilities' },
  { code: '2006', name: 'OTA / Agent Advance', group: 'LIABILITIES', subgroup: 'Current Liabilities' },
  { code: '2007', name: 'Other Current Liabilities', group: 'LIABILITIES', subgroup: 'Current Liabilities' },
  { code: '2008', name: 'Loans', group: 'LIABILITIES', subgroup: 'Long-term Liabilities' },
  // INCOME
  { code: '3001', name: 'Room Revenue', group: 'INCOME', subgroup: 'Operating Revenue' },
  { code: '3002', name: 'F&B Revenue', group: 'INCOME', subgroup: 'Operating Revenue' },
  { code: '3003', name: 'Kitchen Revenue', group: 'INCOME', subgroup: 'Operating Revenue' },
  { code: '3004', name: 'Laundry Revenue', group: 'INCOME', subgroup: 'Operating Revenue' },
  { code: '3005', name: 'Minibar Revenue', group: 'INCOME', subgroup: 'Operating Revenue' },
  { code: '3006', name: 'Extra Bed Revenue', group: 'INCOME', subgroup: 'Operating Revenue' },
  { code: '3007', name: 'Early Check-in Revenue', group: 'INCOME', subgroup: 'Operating Revenue' },
  { code: '3008', name: 'Late Check-out Revenue', group: 'INCOME', subgroup: 'Operating Revenue' },
  { code: '3009', name: 'Cancellation Revenue', group: 'INCOME', subgroup: 'Operating Revenue' },
  { code: '3010', name: 'Other Revenue', group: 'INCOME', subgroup: 'Operating Revenue' },
  // EXPENSES
  { code: '4001', name: 'Housekeeping Supply', group: 'EXPENSES', subgroup: 'Direct Expenses' },
  { code: '4002', name: 'Kitchen Purchase', group: 'EXPENSES', subgroup: 'Direct Expenses' },
  { code: '4003', name: 'Salary', group: 'EXPENSES', subgroup: 'Operating Expenses' },
  { code: '4004', name: 'Salary Advance', group: 'EXPENSES', subgroup: 'Operating Expenses' },
  { code: '4005', name: 'Electricity', group: 'EXPENSES', subgroup: 'Operating Expenses' },
  { code: '4006', name: 'Water', group: 'EXPENSES', subgroup: 'Operating Expenses' },
  { code: '4007', name: 'Fuel', group: 'EXPENSES', subgroup: 'Operating Expenses' },
  { code: '4008', name: 'Maintenance', group: 'EXPENSES', subgroup: 'Operating Expenses' },
  { code: '4009', name: 'Laundry', group: 'EXPENSES', subgroup: 'Direct Expenses' },
  { code: '4010', name: 'OTA Commission', group: 'EXPENSES', subgroup: 'Direct Expenses' },
  { code: '4011', name: 'Travel Agent Commission', group: 'EXPENSES', subgroup: 'Direct Expenses' },
  { code: '4012', name: 'Marketing', group: 'EXPENSES', subgroup: 'Operating Expenses' },
  { code: '4013', name: 'Staff Welfare', group: 'EXPENSES', subgroup: 'Operating Expenses' },
  { code: '4014', name: 'Office Expense', group: 'EXPENSES', subgroup: 'Operating Expenses' },
  { code: '4015', name: 'Repairs', group: 'EXPENSES', subgroup: 'Operating Expenses' },
  { code: '4016', name: 'Bank Charges', group: 'EXPENSES', subgroup: 'Operating Expenses' },
  { code: '4017', name: 'Other Expense', group: 'EXPENSES', subgroup: 'Operating Expenses' },
  // EQUITY
  { code: '5001', name: 'Owner Capital', group: 'EQUITY', subgroup: 'Equity' },
  { code: '5002', name: 'Drawings', group: 'EQUITY', subgroup: 'Equity' },
  { code: '5003', name: 'Retained Earnings', group: 'EQUITY', subgroup: 'Equity' },
];

export const ACCOUNT_GROUP_COLORS: Record<AccountGroup, string> = {
  'ASSETS': 'bg-emerald-100 text-emerald-700',
  'LIABILITIES': 'bg-red-100 text-red-700',
  'INCOME': 'bg-blue-100 text-blue-700',
  'EXPENSES': 'bg-amber-100 text-amber-700',
  'EQUITY': 'bg-violet-100 text-violet-700',
};

// ── Journal Entries ──

export type JournalStatus = 'draft' | 'posted' | 'reversed' | 'cancelled';

export interface JournalEntry {
  id: string;
  hotel_id: string;
  journal_number: string;
  business_date: string;
  posting_date: string;
  reference_type: string;
  reference_id: string;
  narration: string;
  status: JournalStatus;
  source_record_id: string | null;
  created_by: string;
  approved_by: string | null;
  reversal_of: string | null;
  created_at: string;
  updated_at: string;
  lines?: JournalLine[];
}

export interface JournalLine {
  id: string;
  journal_id: string;
  hotel_id: string;
  account_id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  narration: string;
  created_at: string;
}

export interface JournalInput {
  business_date: string;
  narration: string;
  reference_type?: string;
  reference_id?: string;
  source_record_id?: string;
  created_by?: string;
  lines: Array<{
    account_id: string;
    account_code: string;
    account_name: string;
    debit: number;
    credit: number;
    narration?: string;
  }>;
}

// ── Vouchers ──

export type VoucherType = 'receipt' | 'payment' | 'contra' | 'journal' | 'credit_note' | 'debit_note';
export type VoucherStatus = 'draft' | 'posted' | 'cancelled';

export interface Voucher {
  id: string;
  hotel_id: string;
  voucher_number: string;
  voucher_type: VoucherType;
  voucher_date: string;
  party_name: string;
  party_type: string;
  party_id: string | null;
  account_id: string | null;
  debit_account_id: string | null;
  credit_account_id: string | null;
  amount: number;
  narration: string;
  reference_type: string;
  reference_id: string;
  status: VoucherStatus;
  created_by: string;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoucherInput {
  voucher_type: VoucherType;
  voucher_date: string;
  party_name?: string;
  party_type?: string;
  party_id?: string;
  account_id?: string;
  debit_account_id?: string;
  credit_account_id?: string;
  amount: number;
  narration?: string;
  reference_type?: string;
  reference_id?: string;
  created_by?: string;
}

export const VOUCHER_TYPE_LABELS: Record<VoucherType, string> = {
  'receipt': 'Receipt Voucher',
  'payment': 'Payment Voucher',
  'contra': 'Contra Voucher',
  'journal': 'Journal Voucher',
  'credit_note': 'Credit Note',
  'debit_note': 'Debit Note',
};

export const VOUCHER_TYPE_PREFIXES: Record<VoucherType, string> = {
  'receipt': 'RCPT',
  'payment': 'PAY',
  'contra': 'CNTR',
  'journal': 'JV',
  'credit_note': 'CN',
  'debit_note': 'DN',
};

// ── Vendors ──

export interface Vendor {
  id: string;
  hotel_id: string;
  vendor_name: string;
  contact_person: string;
  mobile: string;
  email: string;
  address: string;
  gstin: string;
  pan: string;
  payment_terms: string;
  opening_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type VendorInput = Omit<Vendor, 'id' | 'hotel_id' | 'created_at' | 'updated_at'>;

// ── Opening Balances ──

export interface OpeningBalance {
  id: string;
  hotel_id: string;
  account_id: string;
  effective_date: string;
  debit: number;
  credit: number;
  narration: string;
  entered_by: string;
  approved_by: string | null;
  status: 'draft' | 'posted';
  created_at: string;
}

// ── Budgets ──

export interface Budget {
  id: string;
  hotel_id: string;
  month_key: string;
  category: string;
  amount: number;
  created_at: string;
}

// ── Bank Reconciliation ──

export interface BankReconciliation {
  id: string;
  hotel_id: string;
  account_id: string | null;
  reconciliation_date: string;
  book_balance: number;
  statement_balance: number;
  unmatched_deposits: number;
  unmatched_withdrawals: number;
  bank_charges: number;
  reconciled_balance: number;
  notes: string;
  status: 'pending' | 'reconciled';
  created_by: string;
  created_at: string;
}

// ── Posting Rules ──

export type MappingType = 'revenue_head' | 'expense_head' | 'payment_mode' | 'booking_source' | 'gst_type' | 'refund' | 'discount' | 'commission';

export interface PostingRule {
  id: string;
  hotel_id: string;
  mapping_type: MappingType;
  source_value: string;
  debit_account_id: string | null;
  credit_account_id: string | null;
  is_active: boolean;
  created_at: string;
}

// ── Finance Exceptions ──

export type ExceptionType =
  | 'unmapped_revenue' | 'unmapped_expense' | 'unbalanced_journal'
  | 'missing_party' | 'missing_payment_account' | 'duplicate_posting'
  | 'settlement_difference' | 'cash_mismatch' | 'missing_opening_balance' | 'posting_failed';

export type ExceptionStatus = 'open' | 'resolved' | 'ignored';

export interface FinanceException {
  id: string;
  hotel_id: string;
  exception_type: ExceptionType;
  description: string;
  source_type: string;
  source_id: string;
  amount: number | null;
  status: ExceptionStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string;
  created_at: string;
}

export const EXCEPTION_TYPE_LABELS: Record<ExceptionType, string> = {
  'unmapped_revenue': 'Unmapped Revenue',
  'unmapped_expense': 'Unmapped Expense',
  'unbalanced_journal': 'Unbalanced Journal',
  'missing_party': 'Missing Party',
  'missing_payment_account': 'Missing Payment Account',
  'duplicate_posting': 'Duplicate Posting Attempt',
  'settlement_difference': 'Settlement Difference',
  'cash_mismatch': 'Cash Mismatch',
  'missing_opening_balance': 'Missing Opening Balance',
  'posting_failed': 'Posting Failed',
};

// ── OTA Settlements ──

export type OTAMatchStatus = 'matched' | 'partial' | 'unmatched' | 'short' | 'excess';

export interface OTASettlement {
  id: string;
  hotel_id: string;
  ota_name: string;
  ota_booking_id: string;
  guest_name: string;
  booking_date: string | null;
  gross_amount: number;
  tax_amount: number;
  commission_amount: number;
  tcs_tds_amount: number;
  gateway_charges: number;
  net_expected: number;
  actual_settled: number;
  settlement_date: string | null;
  settlement_reference: string;
  difference: number;
  match_status: OTAMatchStatus;
  reservation_id: string;
  created_at: string;
}

export type OTASettlementInput = Omit<OTASettlement, 'id' | 'hotel_id' | 'created_at' | 'difference' | 'match_status'>;

export const OTA_NAMES = [
  'MakeMyTrip', 'Goibibo', 'Booking.com', 'Agoda', 'Expedia', 'Cleartrip', 'EaseMyTrip', 'Other OTA',
] as const;

// ── Trial Balance ──

export interface TrialBalanceRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_group: AccountGroup;
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  closing_debit: number;
  closing_credit: number;
}

// ── P&L ──

export interface PLSection {
  account_name: string;
  amount: number;
}

export interface ProfitLoss {
  revenue: PLSection[];
  totalRevenue: number;
  directExpenses: PLSection[];
  totalDirectExpenses: number;
  grossOperatingProfit: number;
  operatingExpenses: PLSection[];
  totalOperatingExpenses: number;
  netOperatingProfit: number;
}

// ── Balance Sheet ──

export interface BalanceSheetRow {
  account_code: string;
  account_name: string;
  amount: number;
}

export interface BalanceSheet {
  assets: { subgroup: string; rows: BalanceSheetRow[]; subtotal: number }[];
  totalAssets: number;
  liabilities: { subgroup: string; rows: BalanceSheetRow[]; subtotal: number }[];
  totalLiabilities: number;
  equity: { subgroup: string; rows: BalanceSheetRow[]; subtotal: number }[];
  totalEquity: number;
  currentPeriodProfit: number;
  isBalanced: boolean;
  openingBalancesConfigured: boolean;
}

// ── Ledger Entry (generic) ──

export interface LedgerEntry {
  date: string;
  voucher_number: string;
  particulars: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
}

// ── Ageing Bucket ──

export type AgeingBucket = 'Current' | '1-7 Days' | '8-15 Days' | '16-30 Days' | '31-60 Days' | '61-90 Days' | 'Above 90 Days';

export const AGEING_BUCKETS: AgeingBucket[] = ['Current', '1-7 Days', '8-15 Days', '16-30 Days', '31-60 Days', '61-90 Days', 'Above 90 Days'];

export const getAgeingBucket = (daysOverdue: number): AgeingBucket => {
  if (daysOverdue <= 0) return 'Current';
  if (daysOverdue <= 7) return '1-7 Days';
  if (daysOverdue <= 15) return '8-15 Days';
  if (daysOverdue <= 30) return '16-30 Days';
  if (daysOverdue <= 60) return '31-60 Days';
  if (daysOverdue <= 90) return '61-90 Days';
  return 'Above 90 Days';
};

// ── Financial Year ──

export const getFinancialYear = (date: string): string => {
  const d = new Date(date + 'T00:00:00');
  const year = d.getFullYear();
  const month = d.getMonth();
  if (month >= 3) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
};

export const getFinancialYearLabel = (fy: string): string => {
  const [start, end] = fy.split('-');
  return `FY ${start.slice(2)}-${end.slice(2)}`;
};
