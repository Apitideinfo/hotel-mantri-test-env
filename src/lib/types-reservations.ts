export type ReservationStatus = 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';

export interface Reservation {
  id: string;
  hotel_id: string;
  room_id: string | null;
  room_no: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string;
  guest_address: string;
  guest_type: string;
  company_gst: string;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  rate: number;
  source_category: string;
  source_name: string;
  payment_mode: string;
  advance_paid: number;
  pay_cash: number;
  pay_upi: number;
  pay_card: number;
  pay_bank: number;
  payment_ref: string;
  discount: number;
  meal_plan: string;
  gst_type: string;
  gst_slab: number;
  gst_amount: number;
  taxable_amount: number;
  invoice_total: number;
  adults: number;
  children: number;
  remarks: string;
  internal_note: string;
  created_by: string;
  status: ReservationStatus;
  room_chart_entry_id: string | null;
  group_id: string | null;
  rate_plan: string;
  parent_reservation_id: string | null;
  guest_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReservationInput {
  room_id: string | null;
  room_no: string;
  guest_name: string;
  guest_phone?: string;
  guest_email?: string;
  guest_address?: string;
  guest_type?: string;
  company_gst?: string;
  check_in_date: string;
  check_out_date: string;
  rate?: number;
  source_category?: string;
  source_name?: string;
  payment_mode?: string;
  advance_paid?: number;
  pay_cash?: number;
  pay_upi?: number;
  pay_card?: number;
  pay_bank?: number;
  payment_ref?: string;
  discount?: number;
  meal_plan?: string;
  gst_type?: string;
  gst_slab?: number;
  gst_amount?: number;
  taxable_amount?: number;
  invoice_total?: number;
  nights?: number;
  adults?: number;
  children?: number;
  remarks?: string;
  internal_note?: string;
  created_by?: string;
  status?: ReservationStatus;
  group_id?: string | null;
  rate_plan?: string;
  parent_reservation_id?: string | null;
  guest_id?: string | null;
}

// ── Phase 9: Group Bookings ──

export interface ReservationGroup {
  id: string;
  hotel_id: string;
  group_name: string;
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  total_rooms: number;
  total_guests: number;
  confirmation_number: string;
  notes: string;
  created_at: string;
}

export interface ReservationGroupInput {
  group_name: string;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  total_rooms?: number;
  total_guests?: number;
  notes?: string;
}

// ── Phase 9: Rate Plans ──

export type RatePlanType = 'Base' | 'Weekend' | 'Season' | 'Corporate' | 'OTA' | 'Walk-in' | 'Special' | 'Package';

export interface RatePlan {
  id: string;
  hotel_id: string;
  plan_name: string;
  plan_type: RatePlanType;
  base_rate: number;
  weekend_rate: number;
  season_rate: number;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

export interface RatePlanInput {
  plan_name: string;
  plan_type?: RatePlanType;
  base_rate?: number;
  weekend_rate?: number;
  season_rate?: number;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean;
}

// ── Phase 9: Waitlist ──

export type WaitlistStatus = 'waiting' | 'notified' | 'converted' | 'cancelled';

export interface WaitlistEntry {
  id: string;
  hotel_id: string;
  guest_name: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  room_category: string;
  rate: number;
  source_category: string;
  status: WaitlistStatus;
  notes: string;
  notified_at: string | null;
  created_at: string;
}

export interface WaitlistInput {
  guest_name: string;
  guest_phone?: string;
  check_in: string;
  check_out: string;
  nights?: number;
  adults?: number;
  room_category?: string;
  rate?: number;
  source_category?: string;
  notes?: string;
}

// ── Phase 9: Room Blocks ──

export type BlockType = 'OutOfOrder' | 'Blocked' | 'HouseUse' | 'Complimentary';

export interface RoomBlock {
  id: string;
  hotel_id: string;
  room_no: string;
  block_type: BlockType;
  start_date: string;
  end_date: string;
  reason: string;
  created_by: string;
  created_at: string;
}

export interface RoomBlockInput {
  room_no: string;
  block_type?: BlockType;
  start_date: string;
  end_date: string;
  reason?: string;
  created_by?: string;
}

export interface ReservationAlert {
  type: 'overbooking' | 'duplicate' | 'guest_overlap' | 'payment_pending' | 'vip_arrival' | 'room_not_ready';
  message: string;
  reservationId?: string;
  roomNo?: string;
  severity: 'warning' | 'error' | 'info';
}

export type RoomInventoryStatus = 'Vacant' | 'Occupied' | 'Reserved' | 'Dirty' | 'OutOfOrder' | 'Blocked' | 'HouseUse' | 'Complimentary';

export const RATE_PLAN_TYPES: RatePlanType[] = ['Base', 'Weekend', 'Season', 'Corporate', 'OTA', 'Walk-in', 'Special', 'Package'];

export const ROOM_STATUS_COLORS: Record<string, string> = {
  'Vacant': 'bg-emerald-100 text-emerald-700 border-emerald-300',
  'Occupied': 'bg-red-100 text-red-700 border-red-300',
  'Reserved': 'bg-blue-100 text-blue-700 border-blue-300',
  'Dirty': 'bg-amber-100 text-amber-700 border-amber-300',
  'OutOfOrder': 'bg-slate-300 text-slate-700 border-slate-400',
  'Blocked': 'bg-orange-100 text-orange-700 border-orange-300',
  'HouseUse': 'bg-violet-100 text-violet-700 border-violet-300',
  'Complimentary': 'bg-teal-100 text-teal-700 border-teal-300',
};

export const RESERVATION_STATUS_COLORS: Record<ReservationStatus, string> = {
  'confirmed': 'bg-blue-100 text-blue-700',
  'checked_in': 'bg-emerald-100 text-emerald-700',
  'checked_out': 'bg-slate-100 text-slate-600',
  'cancelled': 'bg-red-100 text-red-700',
  'no_show': 'bg-orange-100 text-orange-700',
};
