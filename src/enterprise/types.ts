// Enterprise HQ — shared types

export type CompanyRole =
  | 'founder'
  | 'company_admin'
  | 'sales_manager'
  | 'sales_executive'
  | 'support_manager'
  | 'support_executive'
  | 'finance_manager'
  | 'finance_executive';

export interface CompanyRoleDef {
  id: string;
  name: string;
  description: string;
  permissions: Record<string, unknown>;
  sort_order: number;
}

export interface CompanyUser {
  id: string;
  user_id: string;
  name: string;
  email: string;
  mobile: string;
  role: CompanyRole;
  manager_id: string | null;
  department: string;
  status: 'Active' | 'Inactive' | 'Suspended';
  assigned_hotels: string[];
  assigned_leads: string[];
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CompanyUserInput = Omit<CompanyUser, 'id' | 'user_id' | 'last_login_at' | 'created_at' | 'updated_at'> & {
  password?: string;
};

export interface ChannelManagerHotelStatus {
  hotel_id: string;
  enabled: boolean;
  connected: boolean;
  mapping_complete: boolean;
  last_sync: string | null;
  sync_error: string | null;
}

export interface EnterpriseHotel {
  id: string;
  hotel_name: string;
  owner_name: string;
  admin_email: string;
  mobile: string;
  address: string;
  total_rooms: number;
  plan_id: string | null;
  subscription_start: string | null;
  subscription_expiry: string | null;
  subscription_status: 'Active' | 'Expired' | 'Suspended' | 'Trial' | 'Trial Expiring' | 'Renewal Due' | 'Grace Period' | 'Partially Paid' | 'Overdue' | 'Cancelled' | 'Archived';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  property_code: string | null;
  city: string;
  state: string;
  assigned_sales_exec: string | null;
  archived_at: string | null;
  last_login_at: string | null;
  onboarding_status?: string | null;
  trial_start?: string | null;
  trial_end?: string | null;
  grace_period_end?: string | null;
  base_amount?: number;
  discount_amount?: number;
  tax_amount?: number;
  total_payable?: number;
  auto_renew?: boolean;
  assigned_finance_exec?: string | null;
  subscription_cancelled_at?: string | null;
  subscription_notes?: string;
  billing_cycle?: string;
  amount_paid?: number;
  outstanding_amount?: number;
  renewal_date?: string | null;
}

// ── Subscription Lifecycle Types ──

export type SubscriptionStatus =
  | 'Trial' | 'Trial Expiring' | 'Active' | 'Renewal Due'
  | 'Grace Period' | 'Partially Paid' | 'Overdue'
  | 'Suspended' | 'Cancelled' | 'Archived';

export interface SubscriptionSettings {
  auto_generate_invoice: 'draft_only' | 'auto_issue' | 'disabled';
  generate_days_before_renewal: number;
  default_due_date_offset: number;
  default_grace_period: number;
  reminder_days: number[];
  restrict_modules_in_grace: boolean;
  suspend_entries_after_grace: boolean;
  auto_suspend_after_grace: boolean;
}

export interface SubscriptionReminder {
  id: string;
  hotel_id: string;
  reminder_type: 'email' | 'whatsapp' | 'in_app';
  days_before: number;
  message: string;
  status: 'sent' | 'failed' | 'pending';
  sent_by: string | null;
  sent_by_email: string;
  sent_at: string;
}

export interface SubscriptionPlanHistory {
  id: string;
  hotel_id: string;
  old_plan_id: string | null;
  new_plan_id: string | null;
  change_type: 'initial' | 'upgrade' | 'downgrade' | 'renewal' | 'cancel';
  effective_date: string;
  prorated_amount: number;
  credit_adjustment: number;
  old_base_amount: number | null;
  new_base_amount: number | null;
  changed_by: string | null;
  changed_by_email: string;
  reason: string;
  created_at: string;
}

export interface SubscriptionNote {
  id: string;
  hotel_id: string;
  note: string;
  created_by: string | null;
  created_by_email: string;
  created_at: string;
}

export interface RenewalDashboardData {
  counts: {
    due_today: number;
    due_3_days: number;
    due_7_days: number;
    due_15_days: number;
    overdue: number;
    grace_period: number;
    suspended: number;
    total_outstanding: number;
  };
  hotels: RenewalHotelData[];
}

export interface RenewalHotelData {
  hotel_id: string;
  hotel_name: string;
  property_code: string | null;
  plan_name: string | null;
  billing_cycle: string;
  subscription_start: string | null;
  subscription_expiry: string | null;
  renewal_date: string | null;
  grace_period_end: string | null;
  subscription_status: string;
  base_amount: number;
  total_payable: number;
  amount_paid: number;
  outstanding_amount: number;
  auto_renew: boolean;
  assigned_sales_exec: string | null;
  assigned_finance_exec: string | null;
  days_to_expiry: number | null;
  latest_invoice_number: string | null;
  latest_invoice_id: string | null;
  latest_invoice_status: string | null;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  billing_period: string;
  features: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  yearly_price: number;
  trial_days: number;
  room_limit: number | null;
  user_limit: number | null;
  hotel_limit: number | null;
  enabled_modules: string;
  grace_period: number;
}

export interface SubscriptionPayment {
  id: string;
  hotel_id: string;
  plan_id: string | null;
  amount: number;
  discount: number;
  payment_mode: string;
  invoice_number: string;
  billing_cycle: string;
  payment_date: string | null;
  notes: string;
  recorded_by: string | null;
  created_at: string;
}

export interface HotelFeature {
  id: string;
  hotel_id: string;
  module_key: string;
  is_enabled: boolean;
  updated_at: string;
}

export interface CrmLead {
  id: string;
  hotel_name: string;
  contact_person: string;
  mobile: string;
  email: string;
  city: string;
  num_rooms: number;
  current_software: string;
  lead_source: string;
  interested_plan: string;
  assigned_exec: string | null;
  next_follow_up: string | null;
  status: LeadStatus;
  notes: string;
  estimated_value: number;
  created_at: string;
  updated_at: string;
}

export type LeadStatus =
  | 'New Lead' | 'Contacted' | 'Qualified' | 'Demo Scheduled'
  | 'Demo Completed' | 'Proposal Sent' | 'Negotiation'
  | 'Converted' | 'Lost' | 'Follow-up Later';

export interface CrmLeadNote {
  id: string;
  lead_id: string;
  user_id: string | null;
  note: string;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  ticket_number: string;
  hotel_id: string | null;
  reporter: string;
  category: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  status: 'Open' | 'In Progress' | 'Waiting for Customer' | 'Resolved' | 'Closed';
  assigned_exec: string | null;
  description: string;
  resolution_notes: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  user_id: string | null;
  message: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_email: string;
  role: string;
  action: string;
  module: string;
  hotel_id: string | null;
  hotel_name: string;
  record_id: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  severity: 'info' | 'warning' | 'error' | 'critical';
  impersonation_id: string | null;
  reason: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  hotel_id: string | null;
  target_role: string;
  is_read: boolean;
  created_at: string;
}

export interface SystemSetting {
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
}

export interface ImpersonationSession {
  id: string;
  admin_user_id: string;
  admin_email: string;
  hotel_id: string;
  hotel_name: string;
  reason: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  is_active: boolean;
}

export const MODULE_KEYS = [
  'dashboard', 'daily_entry', 'room_chart', 'finance', 'gst',
  'inventory', 'housekeeping', 'channel_manager',
  'whatsapp_reports', 'pdf_reports', 'mtd', 'ytd', 'profit_loss',
  'multi_hotel', 'company_ledger',
] as const;

export const COMING_SOON_MODULES = [
  'restaurant_pos', 'ai_insights',
] as const;

export const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  daily_entry: 'Daily Entry',
  room_chart: 'Room Chart',
  finance: 'Finance',
  gst: 'GST',
  whatsapp_reports: 'WhatsApp Reports',
  pdf_reports: 'PDF Reports',
  mtd: 'MTD',
  ytd: 'YTD',
  profit_loss: 'Profit & Loss',
  multi_hotel: 'Multi-Hotel',
  company_ledger: 'Company Ledger',
  inventory: 'Inventory',
  housekeeping: 'Housekeeping',
  channel_manager: 'Channel Manager',
  restaurant_pos: 'Restaurant POS',
  ai_insights: 'AI Insights',
};

export const LEAD_STATUSES: LeadStatus[] = [
  'New Lead', 'Contacted', 'Qualified', 'Demo Scheduled',
  'Demo Completed', 'Proposal Sent', 'Negotiation',
  'Converted', 'Lost', 'Follow-up Later',
];

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  'New Lead': 'bg-slate-100 text-slate-700 border-slate-200',
  'Contacted': 'bg-sky-100 text-sky-700 border-sky-200',
  'Qualified': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Demo Scheduled': 'bg-amber-100 text-amber-700 border-amber-200',
  'Demo Completed': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Proposal Sent': 'bg-violet-100 text-violet-700 border-violet-200',
  'Negotiation': 'bg-orange-100 text-orange-700 border-orange-200',
  'Converted': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Lost': 'bg-red-100 text-red-700 border-red-200',
  'Follow-up Later': 'bg-purple-100 text-purple-700 border-purple-200',
};

export const TICKET_CATEGORIES = [
  'Login', 'Room Chart', 'Daily Report', 'Finance', 'GST',
  'WhatsApp', 'PDF', 'Subscription', 'Feature Request', 'Bug', 'Other',
];

export const TICKET_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export const TICKET_STATUSES = ['Open', 'In Progress', 'Waiting for Customer', 'Resolved', 'Closed'] as const;

export const NOTIFICATION_TYPES = [
  'subscription_expiring', 'payment_due', 'trial_ending', 'new_lead',
  'demo_reminder', 'support_ticket', 'critical_bug', 'hotel_suspended',
  'hotel_created', 'system_announcement',
] as const;

// ── Billing & Invoice Types ──

export interface BillingSettings {
  company_details: {
    brand_name: string;
    legal_name: string;
    tagline: string;
    address: string;
    city: string;
    state: string;
    pin_code: string;
    country: string;
    gstin: string;
    pan: string;
    cin: string;
    support_email: string;
    support_phone: string;
    website: string;
  };
  branding: {
    logo_url: string;
    invoice_logo_url: string;
    watermark_url: string;
    signature_url: string;
    seal_url: string;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    invoice_theme: string;
    logo_size: string;
    watermark_opacity: number;
  };
  invoice_numbering: {
    prefix: string;
    fy_format: string;
    starting_number: number;
    padding_length: number;
    next_preview: string;
  };
  gst: {
    default_gst_rate: number;
    cgst_rate: number;
    sgst_rate: number;
    igst_rate: number;
    hsn_sac: string;
    place_of_supply: string;
    tax_inclusive: boolean;
    reverse_charge: boolean;
    round_off: boolean;
  };
  payment: {
    bank_name: string;
    account_holder: string;
    account_number: string;
    ifsc: string;
    branch: string;
    upi_id: string;
    qr_code_url: string;
    payment_link: string;
    payment_instructions: string;
  };
  terms: {
    invoice_notes: string;
    terms_conditions: string;
    late_payment_terms: string;
    refund_policy: string;
    jurisdiction: string;
    footer_message: string;
    thank_you_message: string;
  };
  updated_at?: string;
}

export type InvoiceStatus =
  | 'Draft' | 'Issued' | 'Sent' | 'Partially Paid'
  | 'Paid' | 'Overdue' | 'Cancelled' | 'Credit Note Issued';

export interface Invoice {
  id: string;
  invoice_number: string | null;
  hotel_id: string;
  plan_id: string | null;
  status: InvoiceStatus;
  invoice_date: string | null;
  due_date: string | null;
  billing_period: string;
  billing_cycle: string;
  number_of_rooms: number;
  number_of_users: number;
  enabled_modules: string[];
  subscription_start: string | null;
  subscription_end: string | null;
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  round_off: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  is_interstate: boolean;
  place_of_supply: string;
  notes: string;
  snapshot: Record<string, unknown> | null;
  issued_at: string | null;
  issued_by: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  sr_no: number;
  description: string;
  hsn_sac: string;
  quantity: number;
  rate: number;
  discount: number;
  taxable_value: number;
  gst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  amount: number;
  item_type: string;
  created_at: string;
}

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  receipt_number: string | null;
  amount: number;
  payment_date: string;
  payment_mode: string;
  transaction_reference: string;
  bank_or_upi: string;
  notes: string;
  entered_by: string | null;
  entered_by_email: string;
  is_refund: boolean;
  created_at: string;
}

export interface InvoiceCreditNote {
  id: string;
  credit_note_number: string;
  invoice_id: string;
  amount: number;
  reason: string;
  status: string;
  created_by: string | null;
  created_at: string;
}

export interface InvoiceWithDetails extends Invoice {
  hotel_name?: string;
  property_code?: string;
  plan_name?: string;
  address?: string;
  city?: string;
  state?: string;
  admin_email?: string;
  mobile?: string;
  owner_name?: string;
  total_rooms?: number;
  items?: InvoiceItem[];
  payments?: InvoicePayment[];
}
