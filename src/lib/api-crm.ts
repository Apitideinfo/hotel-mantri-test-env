import { supabase } from './supabase';
import { getCurrentHotelId } from './api';
import type { Guest, GuestPreferences, GuestNote, GuestDocument, GuestStay,
  CorporateProfile, TravelAgent, LoyaltyTransaction, GuestStats, GuestInsights,
  LoyaltyLevel, DuplicateCheckResult } from './types-crm';
import { LOYALTY_THRESHOLDS, LOYALTY_POINTS_PER_RUPEE, LOYALTY_POINTS_PER_NIGHT } from './types-crm';

// ── Guests ──

export const getGuests = async (): Promise<Guest[]> => {
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as Guest[]) ?? [];
};

export const getGuestById = async (id: string): Promise<Guest | null> => {
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as Guest | null;
};

export const searchGuests = async (query: string): Promise<Guest[]> => {
  const hotelId = getCurrentHotelId();
  const q = query.trim();
  if (!q) return getGuests();
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('hotel_id', hotelId)
    .or(`name.ilike.%${q}%,mobile.ilike.%${q}%,email.ilike.%${q}%,company_name.ilike.%${q}%,gst_number.ilike.%${q}%`)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as Guest[]) ?? [];
};

export const saveGuest = async (guest: Partial<Guest>, id?: string): Promise<Guest> => {
  const hotelId = getCurrentHotelId();
  if (id) {
    const { data, error } = await supabase
      .from('guests')
      .update({ ...guest, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as Guest;
  }
  const { data, error } = await supabase
    .from('guests')
    .insert({ ...guest, hotel_id: hotelId })
    .select('*')
    .single();
  if (error) throw error;
  return data as Guest;
};

export const deleteGuest = async (id: string): Promise<void> => {
  const { error } = await supabase.from('guests').delete().eq('id', id);
  if (error) throw error;
};

// ── Duplicate Detection ──

export const checkDuplicateGuest = async (mobile: string, email: string): Promise<DuplicateCheckResult> => {
  const hotelId = getCurrentHotelId();
  const mob = mobile.trim();
  const em = email.trim().toLowerCase();

  if (mob) {
    const { data } = await supabase
      .from('guests')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('mobile', mob)
      .maybeSingle();
    if (data) return { found: true, guest: data as Guest, matchField: 'mobile' };
  }

  if (em) {
    const { data } = await supabase
      .from('guests')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('email', em)
      .maybeSingle();
    if (data) return { found: true, guest: data as Guest, matchField: 'email' };
  }

  return { found: false };
};

// ── Preferences ──

export const getGuestPreferences = async (guestId: string): Promise<GuestPreferences | null> => {
  const { data, error } = await supabase
    .from('guest_preferences')
    .select('*')
    .eq('guest_id', guestId)
    .maybeSingle();
  if (error) throw error;
  return data as GuestPreferences | null;
};

export const saveGuestPreferences = async (guestId: string, prefs: Partial<GuestPreferences>): Promise<void> => {
  const existing = await getGuestPreferences(guestId);
  if (existing) {
    const { error } = await supabase
      .from('guest_preferences')
      .update({ ...prefs, updated_at: new Date().toISOString() })
      .eq('guest_id', guestId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('guest_preferences')
      .insert({ ...prefs, guest_id: guestId });
    if (error) throw error;
  }
};

// ── Notes ──

export const getGuestNotes = async (guestId: string): Promise<GuestNote[]> => {
  const { data, error } = await supabase
    .from('guest_notes')
    .select('*')
    .eq('guest_id', guestId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as GuestNote[]) ?? [];
};

export const addGuestNote = async (guestId: string, note: string, createdBy = ''): Promise<GuestNote> => {
  const { data, error } = await supabase
    .from('guest_notes')
    .insert({ guest_id: guestId, note, created_by: createdBy })
    .select('*')
    .single();
  if (error) throw error;
  return data as GuestNote;
};

export const deleteGuestNote = async (id: string): Promise<void> => {
  const { error } = await supabase.from('guest_notes').delete().eq('id', id);
  if (error) throw error;
};

// ── Documents ──

export const getGuestDocuments = async (guestId: string): Promise<GuestDocument[]> => {
  const { data, error } = await supabase
    .from('guest_documents')
    .select('*')
    .eq('guest_id', guestId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return (data as GuestDocument[]) ?? [];
};

export const addGuestDocument = async (guestId: string, docType: string, docUrl: string): Promise<GuestDocument> => {
  const { data, error } = await supabase
    .from('guest_documents')
    .insert({ guest_id: guestId, doc_type: docType, doc_url: docUrl })
    .select('*')
    .single();
  if (error) throw error;
  return data as GuestDocument;
};

export const deleteGuestDocument = async (id: string): Promise<void> => {
  const { error } = await supabase.from('guest_documents').delete().eq('id', id);
  if (error) throw error;
};

// ── Stay History ──

export const getGuestStays = async (guestId: string): Promise<GuestStay[]> => {
  const { data, error } = await supabase
    .from('guest_stays')
    .select('*')
    .eq('guest_id', guestId)
    .order('check_in', { ascending: false });
  if (error) throw error;
  return (data as GuestStay[]) ?? [];
};

// Auto-link a stay when a booking is created or checked in
export const recordGuestStay = async (params: {
  guestId: string;
  entryId?: string;
  reservationId?: string;
  roomNo: string;
  category: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  revenue: number;
  paymentStatus: string;
  bookingSource: string;
  remarks: string;
}): Promise<void> => {
  const { error } = await supabase.from('guest_stays').insert({
    guest_id: params.guestId,
    hotel_id: getCurrentHotelId(),
    entry_id: params.entryId ?? null,
    reservation_id: params.reservationId ?? null,
    room_no: params.roomNo,
    category: params.category,
    check_in: params.checkIn,
    check_out: params.checkOut,
    nights: params.nights,
    revenue: params.revenue,
    payment_status: params.paymentStatus,
    booking_source: params.bookingSource,
    remarks: params.remarks,
  });
  if (error) throw error;
};

// ── Guest Stats (computed from guest_stays + reservations) ──

export const getGuestStats = async (guestId: string): Promise<GuestStats> => {
  const stays = await getGuestStays(guestId);

  const totalStays = stays.length;
  const totalNights = stays.reduce((s, st) => s + st.nights, 0);
  const totalRevenue = stays.reduce((s, st) => s + Number(st.revenue), 0);
  const avgRoomRate = totalNights > 0 ? totalRevenue / totalNights : 0;
  const lastStay = stays.length > 0 ? stays[0].check_out : null;

  // Check for next booking (confirmed reservations with future check-in)
  const { data: nextRes } = await supabase
    .from('reservations')
    .select('check_in_date')
    .eq('hotel_id', getCurrentHotelId())
    .eq('guest_id', guestId)
    .eq('status', 'confirmed')
    .gte('check_in_date', new Date().toISOString().slice(0, 10))
    .order('check_in_date', { ascending: true })
    .limit(1)
    .maybeSingle();
  const nextBooking = (nextRes as { check_in_date: string } | null)?.check_in_date ?? null;

  // Cancellation + no-show counts from reservations
  const { data: cancelled } = await supabase
    .from('reservations')
    .select('status')
    .eq('hotel_id', getCurrentHotelId())
    .eq('guest_id', guestId)
    .in('status', ['cancelled', 'no_show']);
  const cancelList = (cancelled as { status: string }[]) ?? [];
  const cancellationCount = cancelList.filter((r) => r.status === 'cancelled').length;
  const noShowCount = cancelList.filter((r) => r.status === 'no_show').length;

  return { totalStays, totalNights, totalRevenue, avgRoomRate, lastStay, nextBooking, cancellationCount, noShowCount };
};

// ── Loyalty ──

export const getLoyaltyTransactions = async (guestId: string): Promise<LoyaltyTransaction[]> => {
  const { data, error } = await supabase
    .from('loyalty_transactions')
    .select('*')
    .eq('guest_id', guestId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as LoyaltyTransaction[]) ?? [];
};

export const earnLoyaltyPoints = async (guestId: string, revenue: number, nights: number, entryId?: string): Promise<void> => {
  const points = Math.round(revenue * LOYALTY_POINTS_PER_RUPEE + nights * LOYALTY_POINTS_PER_NIGHT);
  if (points <= 0) return;

  const hotelId = getCurrentHotelId();

  // Insert transaction
  const { error: txErr } = await supabase.from('loyalty_transactions').insert({
    guest_id: guestId,
    hotel_id: hotelId,
    points,
    transaction_type: 'earn',
    description: `Earned ${points} points (${nights} nights, ₹${revenue})`,
    entry_id: entryId ?? null,
  });
  if (txErr) throw txErr;

  // Update guest points + level
  const { data: guest } = await supabase.from('guests').select('loyalty_points').eq('id', guestId).maybeSingle();
  const currentPoints = (guest as { loyalty_points?: number })?.loyalty_points ?? 0;
  const newPoints = currentPoints + points;
  const newLevel = getLoyaltyLevel(newPoints);

  await supabase
    .from('guests')
    .update({ loyalty_points: newPoints, loyalty_level: newLevel })
    .eq('id', guestId);
};

export const redeemLoyaltyPoints = async (guestId: string, points: number, description: string): Promise<void> => {
  if (points <= 0) throw new Error('Points must be positive.');

  const { data: guest } = await supabase.from('guests').select('loyalty_points').eq('id', guestId).maybeSingle();
  const currentPoints = (guest as { loyalty_points?: number })?.loyalty_points ?? 0;
  if (currentPoints < points) throw new Error('Insufficient points.');

  const hotelId = getCurrentHotelId();
  const { error: txErr } = await supabase.from('loyalty_transactions').insert({
    guest_id: guestId,
    hotel_id: hotelId,
    points: -points,
    transaction_type: 'redeem',
    description,
  });
  if (txErr) throw txErr;

  const newPoints = currentPoints - points;
  await supabase
    .from('guests')
    .update({ loyalty_points: newPoints, loyalty_level: getLoyaltyLevel(newPoints) })
    .eq('id', guestId);
};

export const getLoyaltyLevel = (points: number): LoyaltyLevel => {
  if (points >= LOYALTY_THRESHOLDS.Diamond) return 'Diamond';
  if (points >= LOYALTY_THRESHOLDS.Platinum) return 'Platinum';
  if (points >= LOYALTY_THRESHOLDS.Gold) return 'Gold';
  return 'Silver';
};

// ── Corporate Profiles ──

export const getCorporateProfiles = async (): Promise<CorporateProfile[]> => {
  const { data, error } = await supabase
    .from('corporate_profiles')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('company_name', { ascending: true });
  if (error) throw error;
  return (data as CorporateProfile[]) ?? [];
};

export const saveCorporateProfile = async (profile: Partial<CorporateProfile>, id?: string): Promise<CorporateProfile> => {
  const hotelId = getCurrentHotelId();
  if (id) {
    const { data, error } = await supabase.from('corporate_profiles').update(profile).eq('id', id).select('*').single();
    if (error) throw error;
    return data as CorporateProfile;
  }
  const { data, error } = await supabase.from('corporate_profiles').insert({ ...profile, hotel_id: hotelId }).select('*').single();
  if (error) throw error;
  return data as CorporateProfile;
};

export const deleteCorporateProfile = async (id: string): Promise<void> => {
  const { error } = await supabase.from('corporate_profiles').delete().eq('id', id);
  if (error) throw error;
};

// ── Travel Agents ──

export const getTravelAgents = async (): Promise<TravelAgent[]> => {
  const { data, error } = await supabase
    .from('travel_agents')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('agent_name', { ascending: true });
  if (error) throw error;
  return (data as TravelAgent[]) ?? [];
};

export const saveTravelAgent = async (agent: Partial<TravelAgent>, id?: string): Promise<TravelAgent> => {
  const hotelId = getCurrentHotelId();
  if (id) {
    const { data, error } = await supabase.from('travel_agents').update(agent).eq('id', id).select('*').single();
    if (error) throw error;
    return data as TravelAgent;
  }
  const { data, error } = await supabase.from('travel_agents').insert({ ...agent, hotel_id: hotelId }).select('*').single();
  if (error) throw error;
  return data as TravelAgent;
};

export const deleteTravelAgent = async (id: string): Promise<void> => {
  const { error } = await supabase.from('travel_agents').delete().eq('id', id);
  if (error) throw error;
};

// ── VIP Guests ──

export const getVipGuests = async (): Promise<Guest[]> => {
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .neq('vip_type', '')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as Guest[]) ?? [];
};

// ── Insights ──

export const getGuestInsights = async (): Promise<GuestInsights> => {
  const hotelId = getCurrentHotelId();
  const guests = await getGuests();
  const { data: stays } = await supabase
    .from('guest_stays')
    .select('*')
    .eq('hotel_id', hotelId);
  const allStays = (stays as GuestStay[]) ?? [];

  // Highest spending guest
  const revenueByGuest = new Map<string, number>();
  for (const s of allStays) {
    revenueByGuest.set(s.guest_id, (revenueByGuest.get(s.guest_id) ?? 0) + Number(s.revenue));
  }
  let highestSpendingGuest: GuestInsights['highestSpendingGuest'] = null;
  let maxRev = 0;
  for (const [gid, rev] of revenueByGuest) {
    if (rev > maxRev) {
      maxRev = rev;
      const g = guests.find((x) => x.id === gid);
      if (g) highestSpendingGuest = { name: g.name, revenue: rev };
    }
  }

  // Most frequent guest
  const staysByGuest = new Map<string, number>();
  for (const s of allStays) {
    staysByGuest.set(s.guest_id, (staysByGuest.get(s.guest_id) ?? 0) + 1);
  }
  let mostFrequentGuest: GuestInsights['mostFrequentGuest'] = null;
  let maxStays = 0;
  for (const [gid, cnt] of staysByGuest) {
    if (cnt > maxStays) {
      maxStays = cnt;
      const g = guests.find((x) => x.id === gid);
      if (g) mostFrequentGuest = { name: g.name, stays: cnt };
    }
  }

  // Guests not returned since X days
  const now = new Date();
  const guestsNotReturned: GuestInsights['guestsNotReturned'] = [];
  for (const g of guests) {
    const gStays = allStays.filter((s) => s.guest_id === g.id);
    if (gStays.length === 0) continue;
    const lastStayDate = gStays
      .map((s) => s.check_out)
      .filter((d): d is string => Boolean(d))
      .sort()
      .pop();
    if (!lastStayDate) continue;
    const days = Math.floor((now.getTime() - new Date(lastStayDate).getTime()) / 86400000);
    if (days > 90) {
      guestsNotReturned.push({ name: g.name, mobile: g.mobile, daysSince: days });
    }
  }
  guestsNotReturned.sort((a, b) => b.daysSince - a.daysSince);

  // Upcoming birthdays (next 30 days)
  const upcomingBirthdays: GuestInsights['upcomingBirthdays'] = [];
  for (const g of guests) {
    if (!g.date_of_birth) continue;
    const dob = new Date(g.date_of_birth);
    const thisYear = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
    let diff = (thisYear.getTime() - now.getTime()) / 86400000;
    if (diff < 0) thisYear.setFullYear(now.getFullYear() + 1);
    diff = (thisYear.getTime() - now.getTime()) / 86400000;
    if (diff >= 0 && diff <= 30) {
      upcomingBirthdays.push({ name: g.name, mobile: g.mobile, date: thisYear.toISOString().slice(0, 10) });
    }
  }
  upcomingBirthdays.sort((a, b) => a.date.localeCompare(b.date));

  // Upcoming anniversaries
  const upcomingAnniversaries: GuestInsights['upcomingAnniversaries'] = [];
  for (const g of guests) {
    if (!g.anniversary) continue;
    const ann = new Date(g.anniversary);
    const thisYear = new Date(now.getFullYear(), ann.getMonth(), ann.getDate());
    let diff = (thisYear.getTime() - now.getTime()) / 86400000;
    if (diff < 0) thisYear.setFullYear(now.getFullYear() + 1);
    diff = (thisYear.getTime() - now.getTime()) / 86400000;
    if (diff >= 0 && diff <= 30) {
      upcomingAnniversaries.push({ name: g.name, mobile: g.mobile, date: thisYear.toISOString().slice(0, 10) });
    }
  }
  upcomingAnniversaries.sort((a, b) => a.date.localeCompare(b.date));

  // Corporate revenue
  const corporateGuestIds = new Set(guests.filter((g) => g.company_name.trim()).map((g) => g.id));
  const corporateRevenue = allStays
    .filter((s) => corporateGuestIds.has(s.guest_id))
    .reduce((sum, s) => sum + Number(s.revenue), 0);

  // Repeat guest %
  const repeatGuests = new Set<string>();
  for (const [gid, cnt] of staysByGuest) {
    if (cnt >= 2) repeatGuests.add(gid);
  }
  const repeatGuestPercent = guests.length > 0 ? Math.round((repeatGuests.size / guests.length) * 100) : 0;

  // VIP count
  const vipCount = guests.filter((g) => g.vip_type !== '').length;

  return {
    highestSpendingGuest,
    mostFrequentGuest,
    guestsNotReturned: guestsNotReturned.slice(0, 10),
    upcomingBirthdays,
    upcomingAnniversaries,
    corporateRevenue,
    repeatGuestPercent,
    totalGuests: guests.length,
    vipCount,
  };
};
