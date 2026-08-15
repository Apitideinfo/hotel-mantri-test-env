export type VipType = '' | 'VIP' | 'Corporate VIP' | 'Celebrity' | 'Government' | 'Owner Reference';
export type LoyaltyLevel = 'Silver' | 'Gold' | 'Platinum' | 'Diamond';
export type LoyaltyTxType = 'earn' | 'redeem' | 'adjust';

export interface Guest {
  id: string;
  hotel_id: string;
  name: string;
  mobile: string;
  email: string;
  address: string;
  nationality: string;
  id_proof_type: string;
  id_proof_number: string;
  gst_number: string;
  company_name: string;
  photo_url: string;
  vip_type: VipType;
  loyalty_level: LoyaltyLevel;
  loyalty_points: number;
  date_of_birth: string | null;
  anniversary: string | null;
  notes: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface GuestPreferences {
  id: string;
  guest_id: string;
  smoking: 'Smoking' | 'Non Smoking';
  high_floor: boolean;
  near_lift: boolean;
  extra_pillow: boolean;
  extra_bed: boolean;
  room_temperature: 'Cool' | 'Normal' | 'Warm';
  meal_preference: string;
  favourite_room: string;
  favourite_category: string;
  updated_at: string;
}

export interface GuestNote {
  id: string;
  guest_id: string;
  note: string;
  created_by: string;
  created_at: string;
}

export interface GuestDocument {
  id: string;
  guest_id: string;
  doc_type: string;
  doc_url: string;
  uploaded_at: string;
}

export interface GuestStay {
  id: string;
  guest_id: string;
  hotel_id: string;
  entry_id: string | null;
  reservation_id: string | null;
  room_no: string;
  category: string;
  check_in: string | null;
  check_out: string | null;
  nights: number;
  revenue: number;
  payment_status: string;
  booking_source: string;
  remarks: string;
  created_at: string;
}

export interface CorporateProfile {
  id: string;
  hotel_id: string;
  company_name: string;
  gst: string;
  billing_address: string;
  credit_limit: number;
  corporate_rate: number;
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  created_at: string;
}

export interface TravelAgent {
  id: string;
  hotel_id: string;
  agent_name: string;
  contact_person: string;
  phone: string;
  email: string;
  commission_rate: number;
  created_at: string;
}

export interface LoyaltyTransaction {
  id: string;
  guest_id: string;
  hotel_id: string;
  points: number;
  transaction_type: LoyaltyTxType;
  description: string;
  entry_id: string | null;
  created_at: string;
}

export interface GuestStats {
  totalStays: number;
  totalNights: number;
  totalRevenue: number;
  avgRoomRate: number;
  lastStay: string | null;
  nextBooking: string | null;
  cancellationCount: number;
  noShowCount: number;
}

export interface GuestInsights {
  highestSpendingGuest: { name: string; revenue: number } | null;
  mostFrequentGuest: { name: string; stays: number } | null;
  guestsNotReturned: { name: string; mobile: string; daysSince: number }[];
  upcomingBirthdays: { name: string; mobile: string; date: string }[];
  upcomingAnniversaries: { name: string; mobile: string; date: string }[];
  corporateRevenue: number;
  repeatGuestPercent: number;
  totalGuests: number;
  vipCount: number;
}

export interface DuplicateCheckResult {
  found: boolean;
  guest?: Guest;
  matchField?: 'mobile' | 'email';
}

export const VIP_TYPES: VipType[] = ['', 'VIP', 'Corporate VIP', 'Celebrity', 'Government', 'Owner Reference'];
export const LOYALTY_LEVELS: LoyaltyLevel[] = ['Silver', 'Gold', 'Platinum', 'Diamond'];
export const LOYALTY_THRESHOLDS: Record<LoyaltyLevel, number> = {
  Silver: 0, Gold: 1000, Platinum: 5000, Diamond: 15000,
};
export const LOYALTY_POINTS_PER_RUPEE = 0.1;
export const LOYALTY_POINTS_PER_NIGHT = 50;

export const GUEST_TAGS = [
  'Repeat Guest', 'VIP', 'Corporate', 'OTA', 'Direct', 'High Value',
  'Family', 'Foreigner', 'Long Stay',
];

export const DOC_TYPES = [
  'Aadhar', 'Passport', 'Driving Licence', 'Visa', 'Company Letter', 'GST Certificate',
];

export const VIP_BADGE_COLORS: Record<string, string> = {
  'VIP': 'bg-brand-gold-100 text-brand-gold-700 border-brand-gold-300',
  'Corporate VIP': 'bg-blue-100 text-blue-700 border-blue-300',
  'Celebrity': 'bg-purple-100 text-purple-700 border-purple-300',
  'Government': 'bg-emerald-100 text-emerald-700 border-emerald-300',
  'Owner Reference': 'bg-rose-100 text-rose-700 border-rose-300',
};

export const LOYALTY_COLORS: Record<LoyaltyLevel, string> = {
  Silver: 'bg-slate-100 text-slate-600',
  Gold: 'bg-amber-100 text-amber-700',
  Platinum: 'bg-violet-100 text-violet-700',
  Diamond: 'bg-cyan-100 text-cyan-700',
};
