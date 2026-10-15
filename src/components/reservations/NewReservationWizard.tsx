import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  X, Loader2, Calendar, BedDouble, ChevronDown, Check,
  Users, Wallet, Banknote, Smartphone, CreditCard, AlertCircle,
  User, Phone, Mail, MapPin, FileText, Settings,
  CheckCircle2, MessageCircle, PlusCircle, Lock, RefreshCw,
  Sparkles, ShieldCheck, Tag, ArrowRight, ArrowLeft, IndianRupee,
  Search, Clock, Building2, ChevronRight, Star, Hash,
  Minus, Plus, Eye, Printer, Share2, RotateCcw,
} from 'lucide-react';
import { CelebrationBurst } from '../ui/CelebrationBurst';
import type {
  HotelSettings, CompanySource, RoomCategory, Room, SourceCategory,
  MealPlan, GstType, GstSlab,
} from '@/lib/types';
import { SOURCE_CATEGORIES, MEAL_PLANS, GST_TYPES, GST_SLABS, groupRoomsByCategory, compareRoomNo } from '@/lib/types';
import { isValidEmail, type ReservationInput } from '@/lib/types-reservations';
import { fmtMoney, fmtInt, toNum, calcGstFull, addDays, calcStayNights, isStayOverlapping } from '@/lib/calc';
import { apiFetch } from '@/lib/api-fetch';
import { supabase } from '@/lib/supabase';
import { getCurrentHotelId } from '@/lib/api';
import { getCategoryAvailability } from '@/lib/api-reservations';
import { buildReservationInputs, type RoomDetailConfig } from '@/lib/reservationFormHelpers';
import { searchGuests } from '@/lib/api-crm';
import type { Guest } from '@/lib/types-crm';

/* ─── Wizard Step Enum ─── */
type WizardStep = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<WizardStep, { title: string; subtitle: string; icon: typeof Calendar }> = {
  1: { title: 'Stay Details', subtitle: 'Dates & counts', icon: Calendar },
  2: { title: 'Rooms & Rates', subtitle: 'Category & rates', icon: BedDouble },
  3: { title: 'Guest Info', subtitle: 'Mobile & details', icon: User },
  4: { title: 'Review & Pay', subtitle: 'Confirm booking', icon: ShieldCheck },
};

/* ─── Standard Booking Sources & Source Types ─── */
export const ALL_LISTED_OTAS = [
  'Booking.com',
  'MakeMyTrip',
  'Agoda',
  'Goibibo',
  'Cleartrip',
  'Airbnb',
  'Expedia',
  'Yatra',
  'EaseMyTrip',
  'Trip.com',
  'Travelguru',
  'HappyEasyGo',
  'Ixigo',
  'Hostelworld',
];

const STANDARD_BOOKING_SOURCES = [
  'Direct',
  'Walk-In',
  ...ALL_LISTED_OTAS,
  'Agent',
  'Corporate',
];

const SOURCE_TYPES = [
  'OTA',
  'Walk-In',
  'Phone',
  'Website',
  'WhatsApp',
  'Agent',
  'Corporate',
];

const getSourcesForType = (type: string, hotelSources: CompanySource[]): string[] => {
  const otaDb = hotelSources.filter(s => s.source_category === 'OTA').map(s => s.name);
  const corpDb = hotelSources.filter(s => s.source_category === 'Corporate/Agent').map(s => s.name);
  const directDb = hotelSources.filter(s => s.source_category === 'Direct/Walking').map(s => s.name);

  if (type === 'OTA') {
    return Array.from(new Set([...ALL_LISTED_OTAS, ...otaDb]));
  }
  if (type === 'Corporate') {
    return Array.from(new Set(['Corporate Direct', 'Company Tie-up', 'Business Booking', ...corpDb]));
  }
  if (type === 'Agent') {
    return Array.from(new Set(['Travel Agent', 'Offline Agent', 'Tour Operator', ...corpDb]));
  }
  if (type === 'Phone') {
    return Array.from(new Set(['Phone Reservation', 'Call Inquiry', 'Direct Phone']));
  }
  if (type === 'Website') {
    return Array.from(new Set(['Direct Website', 'HotelMantri Engine', ...directDb]));
  }
  if (type === 'WhatsApp') {
    return Array.from(new Set(['WhatsApp Direct', 'WhatsApp Business', ...directDb]));
  }
  return Array.from(new Set(['Walk-In', 'Front Desk', 'Direct Walking', ...directDb]));
};

/* ─── Room Item in Selection ─── */
export interface SelectedRoomRow {
  uid: string;
  categoryId: string;
  categoryName: string;
  roomNo: string; // 'Unassigned' or physical room number
  roomId?: string | null;
  adults: number;
  children: number;
  mealPlan: MealPlan;
  rate: number;
}

/* ─── Props ─── */
interface NewReservationWizardProps {
  rooms: Room[];
  categories: RoomCategory[];
  sources: CompanySource[];
  settings: HotelSettings | null;
  defaultDate: string;
  preselectRoom?: string;
  preselectCheckIn?: string;
  preselectCheckOut?: string;
  initialBookFullHotel?: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (input: ReservationInput | ReservationInput[]) => Promise<any> | any;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN WIZARD COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export const NewReservationWizard = ({
  rooms, categories, sources, settings, defaultDate,
  preselectRoom, preselectCheckIn, preselectCheckOut, initialBookFullHotel,
  saving, onClose, onSave,
}: NewReservationWizardProps) => {

  // Prevent background body scroll while modal is active
  useEffect(() => {
    const orig = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = orig; };
  }, []);

  const isSubmittingRef = useRef(false);

  /* ── State: Navigation ── */
  const [step, setStep] = useState<WizardStep>(1);

  /* ── State: Step 1 – Stay Details ── */
  const [checkIn, setCheckIn] = useState(preselectCheckIn ?? defaultDate);
  const [checkOut, setCheckOut] = useState(preselectCheckOut ?? addDays(preselectCheckIn ?? defaultDate, 1));
  const [numRooms, setNumRooms] = useState<number>(0);
  const [adults, setAdults] = useState<number>(0);
  const [children, setChildren] = useState<number>(0);

  const nights = useMemo(() => calcStayNights(checkIn, checkOut), [checkIn, checkOut]);

  /* ── State: Step 2 – Category Selection & Room Rows ── */
  // Category room quantities map: { [categoryId]: quantity }
  const [categoryQuantities, setCategoryQuantities] = useState<Record<string, number>>({});
  // Individual editable room rows
  const [roomRows, setRoomRows] = useState<SelectedRoomRow[]>([]);
  // Global default rate & meal plan
  const [defaultRate, setDefaultRate] = useState<number | ''>('');
  const [globalMealPlan, setGlobalMealPlan] = useState<MealPlan>('EP');
  const [discount, setDiscount] = useState<number | ''>('');
  const [gstType, setGstType] = useState<GstType>('No Scope');
  const [gstSlab, setGstSlab] = useState<GstSlab>(0);

  // Booked room numbers during the selected stay dates
  const [bookedRoomNos, setBookedRoomNos] = useState<Set<string>>(new Set());
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  // Initialize preselected room if provided
  useEffect(() => {
    if (preselectRoom && preselectRoom.trim()) {
      const cleanNo = preselectRoom.trim();
      const r = rooms.find(rm => (rm.room_no || '').trim().toLowerCase() === cleanNo.toLowerCase());
      const cat = categories.find(c => c.id === r?.category_id);
      const catId = cat?.id || categories[0]?.id || '';
      const catName = cat?.name || categories[0]?.name || 'Standard';
      const catRate = cat?.default_tariff ?? r?.default_tariff ?? 0;

      setCategoryQuantities({ [catId]: 1 });
      setNumRooms(1);
      setRoomRows([{
        uid: crypto.randomUUID(),
        categoryId: catId,
        categoryName: catName,
        roomNo: cleanNo,
        roomId: r?.id ?? null,
        adults: 0,
        children: 0,
        mealPlan: 'EP',
        rate: catRate,
      }]);
      setDefaultRate(catRate);
    }
  }, [preselectRoom, rooms, categories]);

  /* ── Fetch Real-time Room Availability for Selected Dates ── */
  const fetchAvailability = useCallback(async () => {
    if (!checkIn || !checkOut || checkIn >= checkOut) return;
    setAvailabilityLoading(true);
    try {
      const hotelId = getCurrentHotelId();

      // 1. Authoritative category availability check via API
      const catAvail = await getCategoryAvailability({
        hotelId,
        checkIn,
        checkOut,
      });

      if (catAvail && Array.isArray(catAvail.unavailableRoomNos)) {
        const booked = new Set<string>();
        for (const no of catAvail.unavailableRoomNos) {
          const clean = (no || '').trim().toLowerCase();
          if (clean && clean !== 'unassigned' && clean !== 'tbd') {
            booked.add(clean);
          }
        }
        setBookedRoomNos(booked);
        return;
      }

      // 2. Direct Scoped Fallback: active reservations + in-house chart + blocks
      const booked = new Set<string>();

      // Active reservations
      const { data: resData } = await supabase
        .from('reservations')
        .select('room_no, status')
        .eq('hotel_id', hotelId)
        .in('status', ['confirmed', 'checked_in'])
        .lt('check_in_date', checkOut)
        .gt('check_out_date', checkIn);

      for (const row of (resData || [])) {
        const no = (row.room_no || '').trim().toLowerCase();
        if (no && no !== 'unassigned' && no !== 'tbd') {
          booked.add(no);
        }
      }

      // In-house active room chart entries
      const { data: chartData } = await supabase
        .from('room_chart_entries')
        .select('room_no, arrival, departure, report_date')
        .eq('hotel_id', hotelId)
        .is('checked_out_at', null);

      for (const row of (chartData || [])) {
        const a = (row.arrival || row.report_date || '').slice(0, 10);
        const d = (row.departure || row.report_date || '').slice(0, 10);
        if (a && d && isStayOverlapping(checkIn, checkOut, a, d)) {
          const no = (row.room_no || '').trim().toLowerCase();
          if (no) booked.add(no);
        }
      }

      // Active room blocks
      const { data: blockData } = await supabase
        .from('room_blocks')
        .select('room_no, start_date, end_date')
        .eq('hotel_id', hotelId);

      for (const row of (blockData || [])) {
        const s = (row.start_date || '').slice(0, 10);
        const e = (row.end_date || '').slice(0, 10);
        if (s && e && isStayOverlapping(checkIn, checkOut, s, e)) {
          const no = (row.room_no || '').trim().toLowerCase();
          if (no) booked.add(no);
        }
      }

      setBookedRoomNos(booked);
    } catch (e) {
      console.warn('[NewReservationWizard] Availability fetch warning:', e);
    } finally {
      setAvailabilityLoading(false);
    }
  }, [checkIn, checkOut]);

  // Trigger availability fetch when dates change
  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  /* ── Category Availability Info ── */
  const categoryAvailability = useMemo(() => {
    return categories.map((cat) => {
      const catRooms = rooms.filter((r) => r.category_id === cat.id && r.is_active);
      const totalRooms = catRooms.length;
      const bookedCount = catRooms.filter((r) =>
        bookedRoomNos.has((r.room_no || '').trim().toLowerCase())
      ).length;
      const availableRooms = Math.max(0, totalRooms - bookedCount);
      return {
        category: cat,
        totalRooms,
        availableRooms,
        catRooms,
      };
    });
  }, [categories, rooms, bookedRoomNos]);

  const totalAvailableInHotel = useMemo(() => {
    return categoryAvailability.reduce((sum, c) => sum + c.availableRooms, 0);
  }, [categoryAvailability]);

  const totalHotelRoomsCount = useMemo(() => {
    return rooms.filter((r) => r.is_active).length;
  }, [rooms]);

  const isFullHotelSelected = useMemo(() => {
    return (
      (totalAvailableInHotel > 0 && roomRows.length >= totalAvailableInHotel) ||
      (totalHotelRoomsCount > 0 && roomRows.length >= totalHotelRoomsCount)
    );
  }, [totalAvailableInHotel, totalHotelRoomsCount, roomRows.length]);

  /* ── Action: Book Full Hotel (Select all available rooms across all categories) ── */
  const handleBookFullHotel = useCallback(() => {
    const newQuantities: Record<string, number> = {};
    const allRows: SelectedRoomRow[] = [];
    const assignedRoomIds = new Set<string>();

    categoryAvailability.forEach(({ category, availableRooms, catRooms }) => {
      // Determine how many rooms to book for this category
      const count = availableRooms > 0 ? availableRooms : catRooms.length;
      newQuantities[category.id] = count;

      // Filter available rooms in this category
      const availablePhysicalRooms = catRooms.filter(
        (r) => !bookedRoomNos.has((r.room_no || '').trim().toLowerCase())
      );

      for (let i = 0; i < count; i++) {
        // Pick physical room if available and not yet assigned in this batch
        const physRoom = availablePhysicalRooms.find((r) => !assignedRoomIds.has(r.id));
        if (physRoom) {
          assignedRoomIds.add(physRoom.id);
        }

        allRows.push({
          uid: crypto.randomUUID(),
          categoryId: category.id,
          categoryName: category.name,
          roomNo: physRoom ? physRoom.room_no : 'Unassigned',
          roomId: physRoom ? physRoom.id : null,
          adults: 2,
          children: 0,
          mealPlan: globalMealPlan,
          rate: toNum(defaultRate) > 0 ? toNum(defaultRate) : (category.default_tariff || 0),
        });
      }
    });

    setCategoryQuantities(newQuantities);
    setRoomRows(allRows);
    setNumRooms(allRows.length);
  }, [categoryAvailability, bookedRoomNos, globalMealPlan, defaultRate]);

  const handleClearAllRooms = useCallback(() => {
    setCategoryQuantities({});
    setRoomRows([]);
    setNumRooms(0);
  }, []);

  const handleBookFullHotelAndProceed = useCallback(() => {
    handleBookFullHotel();
    setStep(2);
  }, [handleBookFullHotel]);

  // Initial Book Full Hotel on mount if requested
  useEffect(() => {
    if (initialBookFullHotel && categoryAvailability.length > 0) {
      handleBookFullHotel();
      setStep(2);
    }
  }, [initialBookFullHotel, categoryAvailability, handleBookFullHotel]);

  /* ── Sync Room Rows when Category Quantities Change ── */
  const updateCategoryQuantity = (categoryId: string, qty: number) => {
    const cleanQty = Math.max(0, qty);
    setCategoryQuantities((prev) => {
      const next = { ...prev, [categoryId]: cleanQty };
      return next;
    });

    setRoomRows((prevRows) => {
      const cat = categories.find((c) => c.id === categoryId);
      const catName = cat?.name || 'Standard';
      const catTariff = cat?.default_tariff ?? 0;
      const currentRowsForCat = prevRows.filter((r) => r.categoryId === categoryId);
      const otherRows = prevRows.filter((r) => r.categoryId !== categoryId);

      if (cleanQty > currentRowsForCat.length) {
        // Collect already allocated physical room numbers/ids in all rows
        const alreadyAllocated = new Set<string>();
        for (const row of prevRows) {
          const k = (row.roomNo || '').trim().toLowerCase();
          if (k && k !== 'unassigned' && k !== 'tbd') {
            alreadyAllocated.add(k);
          }
          if (row.roomId) {
            alreadyAllocated.add(String(row.roomId).toLowerCase());
          }
        }

        // Available candidate physical rooms in this category (deterministic sort: vacant clean first, room_no ascending)
        const catRooms = rooms.filter((r) => r.category_id === categoryId && r.is_active);
        const nonAssignable = new Set(['blocked', 'maintenance', 'out of service', 'out of order']);
        const eligibleRooms = catRooms
          .filter((r) => {
            const st = String(r.room_status || '').toLowerCase();
            if (nonAssignable.has(st)) return false;
            const k = (r.room_no || '').trim().toLowerCase();
            if (bookedRoomNos.has(k)) return false;
            return true;
          })
          .sort((a, b) => {
            const aVacant = String(a.room_status || '').toLowerCase() === 'vacant' || String(a.housekeeping_status || '').toLowerCase() === 'vacant clean';
            const bVacant = String(b.room_status || '').toLowerCase() === 'vacant' || String(b.housekeeping_status || '').toLowerCase() === 'vacant clean';
            if (aVacant && !bVacant) return -1;
            if (!aVacant && bVacant) return 1;
            const numA = parseInt(a.room_no, 10);
            const numB = parseInt(b.room_no, 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return (a.room_no || '').localeCompare(b.room_no || '');
          });

        // Add additional rows with automatically assigned physical rooms
        const needed = cleanQty - currentRowsForCat.length;
        const newRows: SelectedRoomRow[] = [];
        for (let i = 0; i < needed; i++) {
          const candidate = eligibleRooms.find((r) => {
            const k = (r.room_no || '').trim().toLowerCase();
            return !alreadyAllocated.has(k) && !alreadyAllocated.has(String(r.id).toLowerCase());
          });

          if (candidate) {
            alreadyAllocated.add((candidate.room_no || '').trim().toLowerCase());
            alreadyAllocated.add(String(candidate.id).toLowerCase());
          }

          const candidateTariff = toNum(candidate?.default_tariff) > 0
            ? toNum(candidate?.default_tariff)
            : toNum(cat?.default_tariff) > 0
            ? toNum(cat?.default_tariff)
            : toNum(catRooms.find((r) => toNum(r.default_tariff) > 0)?.default_tariff) > 0
            ? toNum(catRooms.find((r) => toNum(r.default_tariff) > 0)?.default_tariff)
            : (toNum((settings as any)?.default_room_tariff) || 0);

          newRows.push({
            uid: crypto.randomUUID(),
            categoryId,
            categoryName: catName,
            roomNo: candidate ? candidate.room_no : 'Unassigned',
            roomId: candidate ? candidate.id : null,
            adults: Math.max(0, adults),
            children: Math.max(0, children),
            mealPlan: globalMealPlan,
            rate: toNum(defaultRate) > 0 ? toNum(defaultRate) : candidateTariff,
          });
        }
        return [...otherRows, ...currentRowsForCat, ...newRows];
      } else if (cleanQty < currentRowsForCat.length) {
        // Trim excess rows
        const kept = currentRowsForCat.slice(0, cleanQty);
        return [...otherRows, ...kept];
      }
      return prevRows;
    });
  };

  /* ── Apply Default Rate to All Selected Rooms ── */
  const handleApplyRateToAll = () => {
    if (defaultRate === '') return;
    const rateNum = toNum(defaultRate);
    setRoomRows((rows) => rows.map((r) => ({ ...r, rate: rateNum })));
  };

  /* ── Update Specific Room Row ── */
  const updateRoomRow = (uid: string, updates: Partial<SelectedRoomRow>) => {
    setRoomRows((rows) =>
      rows.map((r) => (r.uid === uid ? { ...r, ...updates } : r))
    );
  };

  /* ── Remove Single Room Row ── */
  const removeRoomRow = (uid: string) => {
    const rowToRemove = roomRows.find((r) => r.uid === uid);
    if (!rowToRemove) return;
    const catId = rowToRemove.categoryId;
    setRoomRows((rows) => rows.filter((r) => r.uid !== uid));
    setCategoryQuantities((prev) => ({
      ...prev,
      [catId]: Math.max(0, (prev[catId] || 1) - 1),
    }));
  };

  /* ── State: Step 3 – Guest Details ── */
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [guestName, setGuestName] = useState('');
  const [email, setEmail] = useState('');
  const [guestCity, setGuestCity] = useState('');
  const [guestAddress, setGuestAddress] = useState('');
  const [bookingSource, setBookingSource] = useState('Direct');
  const [sourceType, setSourceType] = useState('Walk-In');
  const [sourceCat, setSourceCat] = useState<SourceCategory>('Direct/Walking');
  const [isCustomSource, setIsCustomSource] = useState(false);
  const [customSourceName, setCustomSourceName] = useState('');

  const activeSourcesList = useMemo(() => {
    return getSourcesForType(sourceType, sources);
  }, [sourceType, sources]);

  const handleSourceTypeChange = (newType: string) => {
    setSourceType(newType);
    let newCat: SourceCategory = 'Direct/Walking';
    if (newType === 'OTA') newCat = 'OTA';
    else if (newType === 'Corporate' || newType === 'Agent') newCat = 'Corporate/Agent';
    else newCat = 'Direct/Walking';
    setSourceCat(newCat);

    const available = getSourcesForType(newType, sources);
    setIsCustomSource(false);
    setCustomSourceName('');
    if (newType === 'OTA') {
      setBookingSource('Booking.com');
    } else if (available.length > 0) {
      setBookingSource(available[0]);
    } else {
      setBookingSource(newType === 'Corporate' ? 'Corporate Direct' : newType === 'Agent' ? 'Travel Agent' : 'Direct');
    }
  };

  const [guestType, setGuestType] = useState('');
  const [companyGst, setCompanyGst] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [idProofType, setIdProofType] = useState('');
  const [idProofNumber, setIdProofNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [showAdvancedGuest, setShowAdvancedGuest] = useState(false);

  // Existing Guest Search State
  const [guestSearchResults, setGuestSearchResults] = useState<Guest[]>([]);
  const [guestSearching, setGuestSearching] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [guestStayStats, setGuestStayStats] = useState<{ stayCount: number; lastStay: string | null } | null>(null);

  /* ── State: Step 4 – Review & Payment ── */
  const [bookingStatus, setBookingStatus] = useState<'confirmed' | 'hold'>('confirmed');
  const [paymentStatusType, setPaymentStatusType] = useState<'pay_later' | 'partial' | 'full'>('pay_later');
  const [payMode, setPayMode] = useState('Cash');
  const [partialAmount, setPartialAmount] = useState<number | ''>('');
  const [paymentRef, setPaymentRef] = useState('');
  const [createdBy, setCreatedBy] = useState('Front Desk');

  /* ── State: Submission & Confirmation ── */
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<ReservationInput[] | null>(null);
  const [savedReservationId, setSavedReservationId] = useState<string | null>(null);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<'EMAIL_SENT' | 'EMAIL_FAILED' | 'EMAIL_NOT_CONFIGURED' | null>(null);
  const [emailDelivery, setEmailDelivery] = useState<{ recipientEmail?: string; error?: string } | null>(null);
  const [retryingEmail, setRetryingEmail] = useState(false);
  const [downloadingVoucher, setDownloadingVoucher] = useState(false);

  /* ── Live Computed Pricing ── */
  const totalRoomAmount = useMemo(() => {
    return roomRows.reduce((sum, r) => sum + r.rate * nights, 0);
  }, [roomRows, nights]);

  const discountAmount = useMemo(() => toNum(discount), [discount]);
  const netAmount = Math.max(0, totalRoomAmount - discountAmount);
  const { taxable: _taxable, gst: totalTax, invoiceTotal: grandTotal } = useMemo(() => {
    return calcGstFull(netAmount, gstType, gstSlab);
  }, [netAmount, gstType, gstSlab]);

  // Effective advance payment based on paymentStatusType
  const effectiveAdvancePaid = useMemo(() => {
    if (bookingStatus === 'hold') return 0;
    if (paymentStatusType === 'pay_later') return 0;
    if (paymentStatusType === 'full') return grandTotal;
    return toNum(partialAmount);
  }, [bookingStatus, paymentStatusType, grandTotal, partialAmount]);

  const balanceDue = Math.max(0, grandTotal - effectiveAdvancePaid);

  /* ── Guest Search by Phone ── */
  const guestSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePhoneChange = useCallback((val: string) => {
    setPhone(val);
    setSelectedGuest(null);
    setGuestStayStats(null);
    if (guestSearchTimeout.current) clearTimeout(guestSearchTimeout.current);
    const cleaned = val.replace(/\D/g, '');
    if (cleaned.length >= 4) {
      setGuestSearching(true);
      guestSearchTimeout.current = setTimeout(async () => {
        try {
          const results = await searchGuests(cleaned);
          setGuestSearchResults(results.slice(0, 5));
          if (results.length > 0) {
            // Fetch stay history for first match
            const first = results[0];
            const { data: resData } = await supabase
              .from('reservations')
              .select('id, check_in_date')
              .or(`guest_id.eq.${first.id},guest_phone.ilike.%${cleaned}%`)
              .order('check_in_date', { ascending: false });
            if (resData) {
              setGuestStayStats({
                stayCount: resData.length,
                lastStay: resData[0]?.check_in_date || null,
              });
            }
          }
        } catch {
          setGuestSearchResults([]);
        } finally {
          setGuestSearching(false);
        }
      }, 350);
    } else {
      setGuestSearchResults([]);
      setGuestSearching(false);
    }
  }, []);

  const handleSelectExistingGuest = async (guest: Guest) => {
    setGuestName(guest.name || '');
    setEmail(guest.email || '');
    setGuestAddress(guest.address || '');
    setCompanyGst(guest.gst_number || '');
    setCompanyName(guest.company_name || '');
    setGuestType(guest.vip_type || '');
    setSelectedGuest(guest);
    setGuestSearchResults([]);

    // Extract phone without prefix
    const mob = (guest.mobile || '').trim();
    if (mob.startsWith('+91')) {
      setCountryCode('+91');
      setPhone(mob.replace('+91', '').trim());
    } else if (mob.startsWith('+')) {
      const sp = mob.indexOf(' ');
      if (sp > 0) {
        setCountryCode(mob.substring(0, sp));
        setPhone(mob.substring(sp + 1).trim());
      } else {
        setPhone(mob);
      }
    } else {
      setPhone(mob);
    }

    // Query stay count & last stay date
    try {
      const { data: resData } = await supabase
        .from('reservations')
        .select('id, check_in_date')
        .or(`guest_id.eq.${guest.id},guest_phone.ilike.%${mob.replace(/\D/g, '')}%`)
        .order('check_in_date', { ascending: false });
      if (resData) {
        setGuestStayStats({
          stayCount: resData.length,
          lastStay: resData[0]?.check_in_date || null,
        });
      }
    } catch {
      // non-critical
    }
  };

  /* ── Step Transition & Validation ── */
  const validateStep = (s: WizardStep): boolean => {
    setError(null);
    setEmailError(null);

    if (s === 1) {
      if (!checkIn || !checkOut) {
        setError('Please select check-in and check-out dates.');
        return false;
      }
      if (new Date(checkOut + 'T00:00:00') <= new Date(checkIn + 'T00:00:00')) {
        setError('Check-out date must be strictly after check-in date.');
        return false;
      }
      // If no rooms have been selected yet and numRooms > 0, prepare default rows according to numRooms with auto-assigned physical rooms
      if (numRooms > 0 && roomRows.length === 0 && categories.length > 0) {
        const firstCat = categories[0];
        const catId = firstCat.id;
        setCategoryQuantities({ [catId]: numRooms });

        const catRooms = rooms.filter((r) => r.category_id === catId && r.is_active);
        const nonAssignable = new Set(['blocked', 'maintenance', 'out of service', 'out of order']);
        const eligibleRooms = catRooms
          .filter((r) => {
            const st = String(r.room_status || '').toLowerCase();
            if (nonAssignable.has(st)) return false;
            const k = (r.room_no || '').trim().toLowerCase();
            if (bookedRoomNos.has(k)) return false;
            return true;
          })
          .sort((a, b) => {
            const aVacant = String(a.room_status || '').toLowerCase() === 'vacant' || String(a.housekeeping_status || '').toLowerCase() === 'vacant clean';
            const bVacant = String(b.room_status || '').toLowerCase() === 'vacant' || String(b.housekeeping_status || '').toLowerCase() === 'vacant clean';
            if (aVacant && !bVacant) return -1;
            if (!aVacant && bVacant) return 1;
            const numA = parseInt(a.room_no, 10);
            const numB = parseInt(b.room_no, 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return (a.room_no || '').localeCompare(b.room_no || '');
          });

        const rows: SelectedRoomRow[] = [];
        const assignedIds = new Set<string>();
        for (let i = 0; i < numRooms; i++) {
          const candidate = eligibleRooms.find((r) => !assignedIds.has(r.id));
          if (candidate) assignedIds.add(candidate.id);

          const tariff = toNum(candidate?.default_tariff) > 0
            ? toNum(candidate?.default_tariff)
            : toNum(firstCat.default_tariff) > 0
            ? toNum(firstCat.default_tariff)
            : toNum(rooms.find((r) => r.category_id === catId && toNum(r.default_tariff) > 0)?.default_tariff) > 0
            ? toNum(rooms.find((r) => r.category_id === catId && toNum(r.default_tariff) > 0)?.default_tariff)
            : (toNum((settings as any)?.default_room_tariff) || 0);

          rows.push({
            uid: crypto.randomUUID(),
            categoryId: catId,
            categoryName: firstCat.name,
            roomNo: candidate ? candidate.room_no : 'Unassigned',
            roomId: candidate ? candidate.id : null,
            adults: Math.max(0, adults),
            children: Math.max(0, children),
            mealPlan: 'EP',
            rate: tariff,
          });
        }
        setRoomRows(rows);
        if (rows[0]?.rate) setDefaultRate(rows[0].rate);
      }
      return true;
    }

    if (s === 2) {
      if (roomRows.length === 0) {
        setError('Please select at least 1 room from available categories.');
        return false;
      }
      const hasZeroRate = roomRows.some((r) => toNum(r.rate) <= 0);
      if (hasZeroRate) {
        setError('Please enter a valid room rate greater than ₹0 for all selected rooms before proceeding.');
        return false;
      }
      return true;
    }

    if (s === 3) {
      if (!guestName.trim()) {
        setError('Please enter guest name.');
        return false;
      }
      const cleanMob = phone.replace(/\D/g, '');
      if (!cleanMob || cleanMob.length < 5) {
        setError('Please enter a valid guest mobile number.');
        return false;
      }
      const cleanEmail = email.trim();
      if (cleanEmail && !isValidEmail(cleanEmail)) {
        const msg = 'Please enter a valid email address.';
        setError(msg);
        setEmailError(msg);
        return false;
      }
      return true;
    }

    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    if (step < 4) setStep((step + 1) as WizardStep);
  };

  const goBack = () => {
    setError(null);
    if (step > 1) setStep((step - 1) as WizardStep);
  };

  /* ── Build Reservation Inputs for Backend ── */
  const buildInputs = (): ReservationInput[] => {
    const fullAddress = [guestAddress.trim(), guestCity.trim()].filter(Boolean).join(', ');
    const noteText = [
      bookingStatus === 'hold' ? '[HOLD BOOKING]' : '',
      `Source: ${bookingSource} (${sourceType})`,
      internalNote.trim(),
    ].filter(Boolean).join(' | ');

    // Convert room rows into RoomDetailConfig
    const roomDetails: RoomDetailConfig[] = roomRows.map((r) => ({
      roomNo: r.roomNo?.trim() || 'Unassigned',
      roomId: r.roomId || null,
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      rate: r.rate,
      mealPlan: r.mealPlan,
      adults: r.adults,
      children: r.children,
    }));

    // Distribute advance payment to specific mode
    const adv = effectiveAdvancePaid;
    const isCash = payMode === 'Cash';
    const isUpi = payMode === 'UPI';
    const isCard = payMode === 'Card';
    const isBank = payMode === 'Bank Transfer' || payMode === 'Bank';

    const inputs = buildReservationInputs({
      roomNos: roomRows.map((r) => r.roomNo || 'Unassigned'),
      guestName,
      phone,
      countryCode,
      email,
      guestAddress: fullAddress,
      guestType: guestType.trim(),
      companyGst: companyGst.trim(),
      checkIn,
      checkOut,
      nights,
      rate: toNum(defaultRate) > 0 ? toNum(defaultRate) : (roomRows[0]?.rate || ''),
      roomRates: roomRows.reduce((acc, r) => {
        if (r.roomNo && r.roomNo !== 'Unassigned') {
          acc[r.roomNo] = toNum(r.rate);
        }
        return acc;
      }, {} as Record<string, number>),
      sourceCat,
      sourceName: (bookingSource || 'Direct').trim(),
      payMode,
      payCash: isCash ? adv : 0,
      payUpi: isUpi ? adv : 0,
      payCard: isCard ? adv : 0,
      payBank: isBank ? adv : 0,
      totalReceived: adv,
      paymentRef: paymentRef.trim(),
      discount,
      mealPlan: globalMealPlan,
      gstType,
      gstSlab,
      adults,
      children,
      remarks: remarks.trim(),
      internalNote: noteText,
      createdBy: createdBy.trim(),
      status: 'confirmed',
      allowEmptyEmail: true,
      rooms,
      categories,
      roomDetails: roomRows.map((r) => ({
        roomNo: r.roomNo || 'Unassigned',
        roomId: r.roomId || null,
        categoryId: r.categoryId,
        rate: toNum(r.rate),
        adults: r.adults,
        children: r.children,
        mealPlan: r.mealPlan,
      })),
    });

    if (selectedGuest?.id) {
      inputs.forEach((inp) => {
        inp.guest_id = selectedGuest.id;
      });
    }

    return inputs;
  };

  /* ── Confirm & Create Reservation ── */
  const handleConfirmReservation = async () => {
    if (isSubmittingRef.current || submitting || saving) return;
    if (!validateStep(3)) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const inputs = buildInputs();
      const result = await onSave(inputs);
      const savedList = Array.isArray(result) ? result : [];
      if (savedList.length > 0) {
        setRoomRows((prev) =>
          prev.map((r, idx) => {
            const saved = savedList[idx];
            if (saved?.room_no && saved.room_no !== 'Unassigned') {
              return {
                ...r,
                roomNo: saved.room_no,
                roomId: saved.room_id || r.roomId,
              };
            }
            return r;
          })
        );
      }
      const firstSaved = savedList[0];
      if (firstSaved?.id) setSavedReservationId(firstSaved.id);
      if (firstSaved?.confirmation_token || firstSaved?.confirmationToken) {
        setConfirmationToken(firstSaved.confirmation_token || firstSaved.confirmationToken);
      }
      if (firstSaved?._emailStatus) {
        setEmailStatus(firstSaved._emailStatus as any);
        setEmailDelivery(firstSaved._emailDelivery || { recipientEmail: email.trim() });
      }

      // Dispatch real-time availability and reservation updates
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('hotel_mantri_reservations_updated'));
        window.dispatchEvent(new CustomEvent('hotel_mantri_availability_updated'));
      }

      setSuccess(inputs);
    } catch (err: any) {
      console.error('[NewReservationWizard] Save error:', err);
      setError(err?.message || 'Failed to create reservation. Please verify room availability.');
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  /* ── Action: Download Voucher PDF ── */
  const handleDownloadVoucher = async () => {
    if (!savedReservationId) return;
    setDownloadingVoucher(true);
    try {
      let token: string | undefined;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token;
      } catch { /* ignore */ }
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      else if (confirmationToken) headers['x-guest-token'] = confirmationToken;
      const params = new URLSearchParams();
      if (!token && confirmationToken && confirmationToken.split('.').length === 2) {
        params.set('token', confirmationToken);
      }
      const qs = params.toString();
      const url = `/api/reservations/${savedReservationId}/confirmation/pdf${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to fetch voucher (${res.status})`);
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `Hotel-Mantri-Voucher-${savedReservationId.slice(0, 8).toUpperCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (err: any) {
      setError(err?.message || 'Failed to download reservation voucher.');
    } finally {
      setDownloadingVoucher(false);
    }
  };

  /* ── Action: Print Voucher ── */
  const handlePrintVoucher = () => {
    if (!savedReservationId) {
      window.print();
      return;
    }
    const printWindow = window.open(`/api/reservations/${savedReservationId}/confirmation/pdf`, '_blank');
    if (printWindow) {
      printWindow.focus();
    } else {
      window.print();
    }
  };

  /* ── Action: WhatsApp Guest ── */
  const handleWhatsAppGuest = () => {
    const cleanMob = phone.replace(/\D/g, '');
    const fullWaPhone = cleanMob.startsWith('91') ? cleanMob : `91${cleanMob}`;
    const bookingCode = savedReservationId ? `HM-${savedReservationId.slice(0, 8).toUpperCase()}` : 'CONFIRMED';
    const roomSummaryText = roomRows.map((r, i) => `Room ${i + 1}: ${r.categoryName} (${r.roomNo !== 'Unassigned' ? r.roomNo : 'Allocated at Check-in'})`).join('\n• ');

    const waMsg = encodeURIComponent(
      `🏨 *Hotel Mantri - Reservation Confirmed*\n\n` +
      `Dear *${guestName || 'Guest'}*,\n` +
      `Thank you for choosing Hotel Mantri! Your booking is confirmed.\n\n` +
      `📋 *Booking ID:* ${bookingCode}\n` +
      `📅 *Check-In:* ${checkIn}\n` +
      `📅 *Check-Out:* ${checkOut} (${nights} Night${nights > 1 ? 's' : ''})\n` +
      `🛏 *Rooms Booked:*\n• ${roomSummaryText}\n\n` +
      `💰 *Total Amount:* ₹${fmtInt(grandTotal)}\n` +
      `💵 *Advance Paid:* ₹${fmtInt(effectiveAdvancePaid)}\n` +
      `💳 *Balance Due:* ₹${fmtInt(balanceDue)}\n\n` +
      `We look forward to welcoming you!\n` +
      `For any assistance or questions, please feel free to message us.`
    );
    window.open(`https://wa.me/${fullWaPhone}?text=${waMsg}`, '_blank');
  };

  /* ── Action: Retry Confirmation Email ── */
  const handleRetryEmail = async () => {
    if (!savedReservationId) return;
    setRetryingEmail(true);
    try {
      const res = await apiFetch(`/api/reservations/${savedReservationId}/confirmation/send-email`, {
        method: 'POST', body: JSON.stringify({}),
      });
      if (res.success) {
        setEmailStatus('EMAIL_SENT');
        setEmailDelivery({ recipientEmail: email.trim() });
      } else {
        setEmailStatus('EMAIL_FAILED');
        setEmailDelivery({ recipientEmail: email.trim(), error: res.message });
      }
    } catch (err: any) {
      setEmailStatus('EMAIL_FAILED');
      setEmailDelivery({ recipientEmail: email.trim(), error: err?.message });
    } finally {
      setRetryingEmail(false);
    }
  };

  /* ── Action: Reset Wizard for New Booking ── */
  const handleStartNewReservation = () => {
    setSuccess(null);
    setSavedReservationId(null);
    setConfirmationToken(null);
    setStep(1);
    setCategoryQuantities({});
    setRoomRows([]);
    setDefaultRate('');
    setGuestName('');
    setPhone('');
    setEmail('');
    setGuestAddress('');
    setGuestCity('');
    setSelectedGuest(null);
    setPartialAmount('');
    setPaymentStatusType('pay_later');
    setBookingStatus('confirmed');
    setError(null);
  };

  /* ═════════════════════════════════════════════════
     SUCCESS VIEW (AFTER CONFIRMATION)
     ═════════════════════════════════════════════════ */
  if (success) {
    const bookingIdentifier = savedReservationId || success[0].group_id || '';
    const shortId = bookingIdentifier ? bookingIdentifier.slice(0, 8).toUpperCase() : '';
    const confirmNo = shortId ? `HM-${shortId}` : 'CONFIRMED';
    const recipientEmail = emailDelivery?.recipientEmail || email.trim();
    const isMultiRoom = success.length > 1;

    // Authoritative totals from success / created reservation objects
    const successTotalAmount = success.reduce((sum, s) => {
      const inv = toNum((s as any).invoice_total);
      if (inv > 0) return sum + inv;
      const r = toNum((s as any).rate);
      return sum + (r > 0 ? r * nights : 0);
    }, 0) || grandTotal;

    const successAdvancePaid = success.reduce((sum, s) => {
      return sum + toNum((s as any).advance_paid);
    }, 0) || effectiveAdvancePaid;

    const successBalanceDue = Math.max(0, successTotalAmount - successAdvancePaid);

    return (
      <>
        <CelebrationBurst active={true} durationMs={5000} />
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-50 transition-opacity animate-in fade-in duration-200" onClick={onClose} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pointer-events-none">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl pointer-events-auto overflow-hidden border border-slate-200/90 animate-in zoom-in-95 duration-200 my-auto">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-6 pt-7 pb-6 text-white text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 -mr-6 -mt-6 w-36 h-36 rounded-full bg-indigo-500/20 blur-2xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 -ml-6 -mb-6 w-36 h-36 rounded-full bg-blue-500/20 blur-2xl pointer-events-none" />
              
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 border border-white/20 text-white flex items-center justify-center mx-auto mb-3 shadow-xl ring-4 ring-white/10 animate-bounce">
                <Sparkles className="w-8 h-8 text-white drop-shadow-md" />
              </div>
              <span className="px-3.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-widest bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 inline-block mb-1.5 shadow-xs">
                {bookingStatus === 'hold' ? 'Reservation On Hold' : 'Reservation Confirmed'}
              </span>
              <h2 className="text-2xl font-black text-white tracking-tight">🎉 Reservation Successful!</h2>
              <p className="text-xs text-slate-300 font-medium mt-0.5">Booking successfully created and linked to hotel inventory</p>
            </div>

            <div className="px-6 py-5 text-center">
              {/* Booking ID Badge */}
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="text-xs font-mono text-indigo-700 font-extrabold bg-indigo-50 border border-indigo-200 px-3.5 py-1 rounded-xl shadow-2xs">
                  Booking ID: {confirmNo}
                </span>
                {isMultiRoom && (
                  <span className="text-[11px] font-extrabold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-xl">
                    {success.length} Rooms Booked
                  </span>
                )}
              </div>

              {/* Email Delivery Feedback */}
              {emailStatus && (
                <div className={`mb-4 mx-auto max-w-sm rounded-xl px-3.5 py-2 text-xs font-bold flex items-center gap-2 text-left ${
                  emailStatus === 'EMAIL_SENT' ? 'bg-emerald-50 border border-emerald-300 text-emerald-800'
                  : emailStatus === 'EMAIL_NOT_CONFIGURED' ? 'bg-amber-50 border border-amber-300 text-amber-800'
                  : 'bg-rose-50 border border-rose-300 text-rose-800'
                }`}>
                  {emailStatus === 'EMAIL_SENT' ? (
                    <><CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /><span>Voucher sent to {recipientEmail}</span></>
                  ) : emailStatus === 'EMAIL_NOT_CONFIGURED' ? (
                    <><AlertCircle className="w-4 h-4 shrink-0 text-amber-600" /><span>Email not configured — PDF voucher ready below</span></>
                  ) : (
                    <><AlertCircle className="w-4 h-4 shrink-0 text-rose-600" /><span>Could not deliver email to {recipientEmail}</span></>
                  )}
                </div>
              )}

              {/* Summary Breakdown */}
              <div className="bg-slate-50/80 rounded-2xl p-4 text-left space-y-2 border border-slate-200 text-xs shadow-inner">
                <SRow label="Guest Name" value={guestName} bold />
                <SRow label="Mobile" value={phone ? `${countryCode} ${phone}` : '—'} />
                <SRow label="Dates" value={`${checkIn} → ${checkOut} (${nights} Night${nights > 1 ? 's' : ''})`} />
                <SRow label="Allocated Rooms" value={roomRows.map((r, i) => `${r.categoryName}${r.roomNo !== 'Unassigned' ? ` (#${r.roomNo})` : ''}`).join(', ')} bold color="blue" />
                <SRow label="Total Amount" value={`₹${fmtInt(successTotalAmount)}`} bold />
                <SRow label="Advance Paid" value={`₹${fmtInt(successAdvancePaid)}`} color="emerald" bold />
                <SRow label="Balance Due" value={`₹${fmtInt(successBalanceDue)}`} color={successBalanceDue > 0 ? 'amber' : 'slate'} bold />
              </div>

              {/* Required 6 Action Buttons */}
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button type="button" onClick={handlePrintVoucher}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-2xs active:scale-95 cursor-pointer">
                  <Printer className="w-4 h-4 text-slate-600" />
                  <span>Print Voucher</span>
                </button>

                <button type="button" onClick={handleDownloadVoucher} disabled={downloadingVoucher}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-2xs active:scale-95 cursor-pointer disabled:opacity-60">
                  {downloadingVoucher ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : <FileText className="w-4 h-4 text-indigo-600" />}
                  <span>Download Voucher</span>
                </button>

                <button type="button" onClick={handleWhatsAppGuest}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition shadow-2xs active:scale-95 cursor-pointer">
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  <span>WhatsApp Guest</span>
                </button>

                <button type="button" onClick={handleRetryEmail} disabled={retryingEmail}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition shadow-2xs active:scale-95 cursor-pointer disabled:opacity-60">
                  {retryingEmail ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <Mail className="w-4 h-4 text-blue-600" />}
                  <span>Email Voucher</span>
                </button>

                <button type="button" onClick={handleStartNewReservation}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition shadow-2xs active:scale-95 cursor-pointer">
                  <RotateCcw className="w-4 h-4 text-indigo-600" />
                  <span>New Reservation</span>
                </button>

                <button type="button" onClick={onClose}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition active:scale-95 cursor-pointer">
                  <Check className="w-4 h-4" />
                  <span>View Reservation</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ═════════════════════════════════════════════════
     WIZARD FORM VIEW
     ═════════════════════════════════════════════════ */
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs z-50 transition-opacity" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 pointer-events-none overflow-y-auto">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col pointer-events-auto border border-slate-200/90 overflow-hidden animate-scale-in my-auto">

          {/* ── Header ── */}
          <div className="shrink-0">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 text-indigo-300 border border-indigo-400/30 flex items-center justify-center shrink-0 shadow-inner">
                  <PlusCircle className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-base font-black text-white leading-tight">Create Reservation</h2>
                  <p className="text-xs text-slate-300 font-medium">HotelMantri Fast Booking · Step {step} of 4: {STEP_LABELS[step].title}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleBookFullHotel();
                    setStep(2);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer shadow-xs ${
                    isFullHotelSelected
                      ? 'bg-amber-400 text-slate-950 font-black ring-2 ring-amber-300/40'
                      : 'bg-amber-500/20 text-amber-200 border border-amber-400/40 hover:bg-amber-500/30 hover:text-white'
                  }`}
                  title="Book all available rooms in the entire hotel"
                >
                  <Building2 className="w-3.5 h-3.5 text-amber-300" />
                  <span>{isFullHotelSelected ? `Full Hotel (${roomRows.length} Rooms)` : 'Book Full Hotel'}</span>
                </button>
                <button type="button" onClick={onClose}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0" title="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* ── Step Progress Bar (Stay, Rooms, Guest, Confirm) ── */}
            <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200/90 flex items-center gap-1.5">
              {([1, 2, 3, 4] as WizardStep[]).map((s) => {
                const StepIcon = STEP_LABELS[s].icon;
                const isActive = s === step;
                const isDone = s < step;
                return (
                  <div key={s} className="flex items-center flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => { if (isDone) setStep(s); }}
                      disabled={!isDone}
                      className={`flex items-center justify-center sm:justify-start gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all w-full min-w-0 ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                          : isDone
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-pointer hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-400 border border-slate-200'
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                      ) : (
                        <StepIcon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      )}
                      <span className="truncate hidden sm:inline">{s}. {STEP_LABELS[s].title}</span>
                      <span className="sm:hidden">{s}</span>
                    </button>
                    {s < 4 && <ChevronRight className="w-3 h-3 text-slate-300 mx-1 shrink-0" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Main Layout: 2 Columns on Desktop with Sticky Summary ── */}
          <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-6 modal-scroll">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

              {/* ── Left Column: Active Step Fields ── */}
              <div className="lg:col-span-8 space-y-4">
                {error && (
                  <div className="bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold rounded-2xl p-3.5 flex items-center gap-2 shadow-2xs">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{error}</span>
                  </div>
                )}

                {/* ═════════════════════════════════════════════════
                   STEP 1: STAY DETAILS
                   ═════════════════════════════════════════════════ */}
                {step === 1 && (
                  <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-5 animate-page-fade">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <Calendar className="w-4 h-4 text-indigo-600" />
                      <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                        Step 1 – Stay Details
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Check-In Date */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Check-In Date <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={checkIn}
                          onChange={(e) => {
                            const newCi = e.target.value;
                            setCheckIn(newCi);
                            if (newCi && checkOut && newCi >= checkOut) {
                              setCheckOut(addDays(newCi, 1));
                            }
                          }}
                          className="w-full px-3.5 py-3 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 font-semibold transition"
                        />
                      </div>

                      {/* Check-Out Date */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Check-Out Date <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={checkOut}
                          min={addDays(checkIn, 1)}
                          onChange={(e) => {
                            const newCo = e.target.value;
                            if (newCo && newCo <= checkIn) setCheckOut(addDays(checkIn, 1));
                            else setCheckOut(newCo);
                          }}
                          className="w-full px-3.5 py-3 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 font-semibold transition"
                        />
                      </div>

                      {/* Auto Calculated Nights */}
                      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200/80 rounded-xl p-3 flex flex-col items-center justify-center">
                        <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-0.5">Number of Nights</span>
                        <span className="text-2xl font-black text-indigo-700">{nights}</span>
                        <span className="text-[10px] font-bold text-indigo-500">Auto calculated</span>
                      </div>
                    </div>

                    {/* Room & Guest Steppers */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                      {/* Number of Rooms */}
                      <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3">
                        <label className="block text-xs font-bold text-slate-700 mb-2">Number of Rooms</label>
                        <div className="flex items-center justify-between">
                          <button type="button" onClick={() => setNumRooms(Math.max(0, numRooms - 1))}
                            disabled={numRooms <= 0}
                            className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 transition cursor-pointer active:scale-95">
                            <Minus className="w-4 h-4 text-slate-600" />
                          </button>
                          <span className="text-lg font-black text-slate-900">{numRooms}</span>
                          <button type="button" onClick={() => setNumRooms(numRooms + 1)}
                            className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center hover:bg-indigo-100 transition cursor-pointer active:scale-95">
                            <Plus className="w-4 h-4 text-indigo-600" />
                          </button>
                        </div>
                      </div>

                      {/* Adults */}
                      <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3">
                        <label className="block text-xs font-bold text-slate-700 mb-2">Adults</label>
                        <div className="flex items-center justify-between">
                          <button type="button" onClick={() => setAdults(Math.max(0, adults - 1))}
                            disabled={adults <= 0}
                            className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 transition cursor-pointer active:scale-95">
                            <Minus className="w-4 h-4 text-slate-600" />
                          </button>
                          <span className="text-lg font-black text-slate-900">{adults}</span>
                          <button type="button" onClick={() => setAdults(adults + 1)}
                            className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center hover:bg-indigo-100 transition cursor-pointer active:scale-95">
                            <Plus className="w-4 h-4 text-indigo-600" />
                          </button>
                        </div>
                      </div>

                      {/* Children */}
                      <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3">
                        <label className="block text-xs font-bold text-slate-700 mb-2">Children</label>
                        <div className="flex items-center justify-between">
                          <button type="button" onClick={() => setChildren(Math.max(0, children - 1))}
                            disabled={children <= 0}
                            className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 transition cursor-pointer active:scale-95">
                            <Minus className="w-4 h-4 text-slate-600" />
                          </button>
                          <span className="text-lg font-black text-slate-900">{children}</span>
                          <button type="button" onClick={() => setChildren(children + 1)}
                            className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center hover:bg-indigo-100 transition cursor-pointer active:scale-95">
                            <Plus className="w-4 h-4 text-indigo-600" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Quick Action: Book Full Hotel Banner */}
                    <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-200/90 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-700 border border-amber-300/60 flex items-center justify-center shrink-0 shadow-inner">
                          <Building2 className="w-5 h-5 text-amber-700" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-black text-amber-950 uppercase tracking-wider">Book Full Hotel</h4>
                            <span className="text-[10px] font-extrabold text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded-md">
                              {totalAvailableInHotel || totalHotelRoomsCount} Rooms Available
                            </span>
                          </div>
                          <p className="text-[11px] text-amber-800 font-medium mt-0.5">
                            Select and allocate all available rooms in the entire hotel with a single click.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleBookFullHotelAndProceed}
                        className="flex items-center gap-2 px-4 py-2.5 text-xs font-black text-slate-950 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-300 hover:from-amber-400 hover:to-amber-500 rounded-xl shadow-md shadow-amber-500/20 transition active:scale-95 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                        <span>Book Full Hotel Now</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-400 font-medium italic">
                      Quick stay check: Guest information and payment details will be entered in later steps.
                    </p>
                  </div>
                )}

                {/* ═════════════════════════════════════════════════
                   STEP 2: SELECT ROOMS & RATES
                   ═════════════════════════════════════════════════ */}
                {step === 2 && (
                  <div className="space-y-4 animate-page-fade">
                    {/* Category Selection Cards */}
                    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <BedDouble className="w-4 h-4 text-indigo-600" />
                          <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                            Step 2 – Available Room Categories
                          </h3>
                        </div>

                        <div className="flex items-center gap-2">
                          {!isFullHotelSelected ? (
                            <button
                              type="button"
                              onClick={handleBookFullHotel}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black text-amber-950 bg-gradient-to-r from-amber-100 to-amber-200 hover:from-amber-200 hover:to-amber-300 border border-amber-300 rounded-xl shadow-2xs transition active:scale-95 cursor-pointer"
                              title="Select all available rooms in the hotel"
                            >
                              <Building2 className="w-3.5 h-3.5 text-amber-700" />
                              <span>Book Full Hotel ({totalAvailableInHotel} Rooms)</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="flex items-center gap-1 px-3 py-1 text-xs font-black text-emerald-800 bg-emerald-100 border border-emerald-300 rounded-xl">
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                Full Hotel Booked ({roomRows.length} Rooms)
                              </span>
                              <button
                                type="button"
                                onClick={handleClearAllRooms}
                                className="px-2.5 py-1 text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-xl transition cursor-pointer"
                              >
                                Clear All
                              </button>
                            </div>
                          )}

                          {availabilityLoading && (
                            <span className="text-[11px] font-bold text-indigo-600 flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Checking availability…
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Room Categories Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {categoryAvailability.map(({ category, availableRooms, catRooms }) => {
                          const selectedCount = categoryQuantities[category.id] || 0;
                          const displayTariff = toNum(category.default_tariff) > 0
                            ? toNum(category.default_tariff)
                            : toNum(catRooms.find((r) => toNum(r.default_tariff) > 0)?.default_tariff) > 0
                            ? toNum(catRooms.find((r) => toNum(r.default_tariff) > 0)?.default_tariff)
                            : (toNum((settings as any)?.default_room_tariff) || 0);

                          return (
                            <div key={category.id}
                              className={`p-4 rounded-2xl border transition-all ${
                                selectedCount > 0
                                  ? 'bg-indigo-50/50 border-indigo-400 shadow-sm ring-2 ring-indigo-500/10'
                                  : 'bg-white border-slate-200 hover:border-slate-300'
                              }`}>
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div>
                                  <h4 className="text-sm font-black text-slate-900">{category.name}</h4>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-md ${
                                      availableRooms > 0
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                    }`}>
                                      Available: {availableRooms} Rooms
                                    </span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="text-xs font-black text-indigo-700">₹{fmtInt(displayTariff)}</span>
                                  <span className="block text-[10px] text-slate-400 font-medium">/ night</span>
                                </div>
                              </div>

                              {/* Stepper for Quantity */}
                              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                <span className="text-xs font-bold text-slate-600">Select Rooms:</span>
                                <div className="flex items-center gap-2">
                                  <button type="button"
                                    onClick={() => updateCategoryQuantity(category.id, selectedCount - 1)}
                                    disabled={selectedCount <= 0}
                                    className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center hover:bg-slate-200 disabled:opacity-40 transition cursor-pointer">
                                    <Minus className="w-3.5 h-3.5 text-slate-700" />
                                  </button>
                                  <span className="w-6 text-center text-xs font-black text-slate-900">{selectedCount}</span>
                                  <button type="button"
                                    onClick={() => updateCategoryQuantity(category.id, selectedCount + 1)}
                                    disabled={availableRooms > 0 && selectedCount >= availableRooms}
                                    className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center hover:bg-indigo-100 disabled:opacity-40 transition cursor-pointer">
                                    <Plus className="w-3.5 h-3.5 text-indigo-700" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Default Rate & Apply to All Bar */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-bold text-slate-700">Default Room Rate:</label>
                          <div className="relative w-32">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                            <input
                              type="number" min={0} step="any"
                              value={defaultRate}
                              onChange={(e) => setDefaultRate(e.target.value === '' ? '' : Number(e.target.value))}
                              placeholder="Tariff"
                              className="w-full pl-6 pr-2 py-1.5 text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                            />
                          </div>
                          <button type="button" onClick={handleApplyRateToAll}
                            className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition cursor-pointer active:scale-95">
                            Apply to All
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-xs font-bold text-slate-700">Default Meal Plan:</label>
                          <select
                            value={globalMealPlan}
                            onChange={(e) => {
                              const plan = e.target.value as MealPlan;
                              setGlobalMealPlan(plan);
                              setRoomRows((rows) => rows.map((r) => ({ ...r, mealPlan: plan })));
                            }}
                            className="px-2.5 py-1.5 text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                            {MEAL_PLANS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Individual Editable Rows for Selected Rooms */}
                    {roomRows.length > 0 && (
                      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                            Individual Room Configuration ({roomRows.length} Rooms Selected)
                          </h4>
                          <span className="text-[11px] text-slate-400 font-medium">
                            Category-wise hold — Room numbers can also be assigned now or at check-in
                          </span>
                        </div>

                        <div className="space-y-2.5">
                          {roomRows.map((row, idx) => {
                            const catRooms = rooms.filter((r) => r.category_id === row.categoryId && r.is_active);
                            const rowSubtotal = row.rate * nights;
                            return (
                              <div key={row.uid}
                                className="bg-slate-50/80 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                                {/* Room Title & Category */}
                                <div className="flex items-center gap-2 min-w-[150px]">
                                  <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-black flex items-center justify-center text-[11px]">
                                    {idx + 1}
                                  </span>
                                  <div>
                                    <p className="font-black text-slate-900">Room {idx + 1} – {row.categoryName}</p>
                                    <p className="text-[10px] text-slate-400">{nights} Night{nights > 1 ? 's' : ''}</p>
                                  </div>
                                </div>

                                {/* Physical Room */}
                                <div className="min-w-[155px]">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <label className="text-[10px] font-bold text-slate-500">Assigned Room</label>
                                    {row.roomNo && row.roomNo !== 'Unassigned' && (
                                      <span className="text-[9px] font-extrabold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">
                                        Auto-Assigned
                                      </span>
                                    )}
                                  </div>
                                  <select
                                    value={row.roomNo}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const matchingRoom = rooms.find(rm => (rm.room_no || '').trim() === val);
                                      updateRoomRow(row.uid, {
                                        roomNo: val,
                                        roomId: matchingRoom?.id ?? null,
                                      });
                                    }}
                                    className="w-full px-2 py-1 text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg">
                                    {row.roomNo && row.roomNo !== 'Unassigned' ? (
                                      <option value={row.roomNo}>Room {row.roomNo} (Auto-Assigned)</option>
                                    ) : (
                                      <option value="Unassigned">Auto-Assign on Save</option>
                                    )}
                                    {catRooms.filter(r => r.room_no !== row.roomNo).map((r) => {
                                      const isBooked = bookedRoomNos.has((r.room_no || '').trim().toLowerCase());
                                      return (
                                        <option key={r.id} value={r.room_no} disabled={isBooked}>
                                          Room {r.room_no} {isBooked ? '(Occupied)' : '(Available)'}
                                        </option>
                                      );
                                    })}
                                    <option value="Unassigned">Unassigned (Hold/Waitlist)</option>
                                  </select>
                                </div>

                                {/* Adults & Child */}
                                <div className="flex items-center gap-2">
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Adults</label>
                                    <input
                                      type="number" min={0} max={10} value={row.adults}
                                      onChange={(e) => updateRoomRow(row.uid, { adults: Math.max(0, Number(e.target.value)) })}
                                      className="w-12 px-2 py-1 text-xs font-bold text-center bg-white border border-slate-200 rounded-lg"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Child</label>
                                    <input
                                      type="number" min={0} max={10} value={row.children}
                                      onChange={(e) => updateRoomRow(row.uid, { children: Math.max(0, Number(e.target.value)) })}
                                      className="w-12 px-2 py-1 text-xs font-bold text-center bg-white border border-slate-200 rounded-lg"
                                    />
                                  </div>
                                </div>

                                {/* Meal Plan */}
                                <div className="min-w-[110px]">
                                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Meal Plan</label>
                                  <select
                                    value={row.mealPlan}
                                    onChange={(e) => updateRoomRow(row.uid, { mealPlan: e.target.value as MealPlan })}
                                    className="w-full px-2 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-lg">
                                    {MEAL_PLANS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                                  </select>
                                </div>

                                {/* Editable Rate / Night */}
                                <div className="w-24">
                                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Rate / Night</label>
                                  <div className="relative">
                                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">₹</span>
                                    <input
                                      type="number" min={0} step="any" value={row.rate}
                                      onChange={(e) => updateRoomRow(row.uid, { rate: Math.max(0, Number(e.target.value)) })}
                                      className="w-full pl-4 pr-1.5 py-1 text-xs font-bold bg-white border border-slate-200 rounded-lg"
                                    />
                                  </div>
                                </div>

                                {/* Row Total & Delete */}
                                <div className="flex items-center gap-3">
                                  <div className="text-right">
                                    <span className="block text-[10px] text-slate-400">Total</span>
                                    <span className="text-xs font-black text-indigo-700">₹{fmtInt(rowSubtotal)}</span>
                                  </div>
                                  <button type="button" onClick={() => removeRoomRow(row.uid)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer" title="Remove Room">
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ═════════════════════════════════════════════════
                   STEP 3: GUEST DETAILS
                   ═════════════════════════════════════════════════ */}
                {step === 3 && (
                  <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4 animate-page-fade">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <User className="w-4 h-4 text-indigo-600" />
                      <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                        Step 3 – Guest Details
                      </h3>
                    </div>

                    {/* First Field: Mobile Number (with live guest search) */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Guest Mobile Number <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)}
                          className="px-2.5 py-3 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 shrink-0">
                          <option value="+91">+91 (India)</option>
                          <option value="+1">+1 (US/CA)</option>
                          <option value="+44">+44 (UK)</option>
                          <option value="+971">+971 (UAE)</option>
                        </select>
                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={phone}
                            onChange={(e) => handlePhoneChange(e.target.value)}
                            placeholder="Enter 10-digit mobile number"
                            className="w-full px-3.5 py-3 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition font-semibold pr-10"
                          />
                          {guestSearching && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500 animate-spin" />
                          )}
                        </div>
                      </div>

                      {/* Existing Guest Search Results Card */}
                      {guestSearchResults.length > 0 && !selectedGuest && (
                        <div className="mt-2.5 bg-indigo-50/70 border border-indigo-200 rounded-xl p-3 shadow-xs">
                          <div className="flex items-center gap-1.5 text-xs font-black text-indigo-800 mb-2">
                            <Search className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Existing Guest Found in Database:</span>
                          </div>
                          {guestSearchResults.map((g) => (
                            <div key={g.id} className="bg-white rounded-lg p-3 border border-indigo-100 flex flex-wrap items-center justify-between gap-3 mb-1.5 last:mb-0">
                              <div>
                                <p className="text-xs font-black text-slate-900">{g.name}</p>
                                <p className="text-[11px] text-slate-500">
                                  Mobile: {g.mobile || '—'} · Email: {g.email || '—'}
                                </p>
                                {guestStayStats && (
                                  <p className="text-[10px] font-bold text-indigo-600 mt-0.5">
                                    Previous Stay Count: {guestStayStats.stayCount} Stays · Last Stay: {guestStayStats.lastStay || 'N/A'}
                                  </p>
                                )}
                              </div>
                              <button type="button" onClick={() => handleSelectExistingGuest(g)}
                                className="px-3 py-1.5 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition cursor-pointer active:scale-95">
                                Use Existing Guest
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Selected Guest Active Badge */}
                      {selectedGuest && (
                        <div className="mt-2.5 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between gap-2 shadow-2xs">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <div>
                              <p className="text-xs font-black text-emerald-900">
                                Existing Guest Linked: {selectedGuest.name}
                              </p>
                              <p className="text-[10px] text-emerald-700">
                                Previous Stay Count: {guestStayStats?.stayCount ?? '1+'} Stays · Last Stay: {guestStayStats?.lastStay || 'Recent'}
                              </p>
                            </div>
                          </div>
                          <button type="button" onClick={() => { setSelectedGuest(null); setGuestSearchResults([]); }}
                            className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 cursor-pointer hover:bg-rose-100">
                            Clear
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Guest Name */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Guest Full Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text" value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="Enter guest full name"
                        className="w-full px-3.5 py-3 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition font-semibold"
                      />
                    </div>

                    {/* Optional Fields: Email & City */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Guest Email <span className="text-slate-400 text-[10px] font-medium">(optional)</span>
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="email" value={email}
                            onChange={(e) => {
                              setEmail(e.target.value);
                              if (emailError) {
                                const v = e.target.value.trim();
                                if (!v || isValidEmail(v)) setEmailError(null);
                              }
                            }}
                            placeholder="guest@example.com"
                            className={`w-full pl-9 pr-3.5 py-3 text-sm text-slate-900 bg-white border ${
                              emailError ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-200 focus:ring-indigo-500/30 focus:border-indigo-500'
                            } rounded-xl focus:outline-none focus:ring-2 transition font-semibold`}
                          />
                        </div>
                        {emailError && (
                          <p className="text-xs text-rose-600 mt-1 flex items-center gap-1 font-bold">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />{emailError}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          City <span className="text-slate-400 text-[10px] font-medium">(optional)</span>
                        </label>
                        <input
                          type="text" value={guestCity}
                          onChange={(e) => setGuestCity(e.target.value)}
                          placeholder="e.g. Mumbai, Delhi, Ahmedabad"
                          className="w-full px-3.5 py-3 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition font-semibold"
                        />
                      </div>
                    </div>

                    {/* Booking Source & Source Type */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-bold text-slate-700">Booking Source</label>
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Category: {sourceCat}
                          </span>
                        </div>
                        <select
                          value={isCustomSource ? '__CUSTOM__' : bookingSource}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '__CUSTOM__') {
                              setIsCustomSource(true);
                            } else {
                              setIsCustomSource(false);
                              setBookingSource(val);
                              if (ALL_LISTED_OTAS.includes(val) || val.toLowerCase().includes('ota')) {
                                setSourceCat('OTA');
                                setSourceType('OTA');
                              } else if (val.toLowerCase().includes('corporate') || val.toLowerCase().includes('agent')) {
                                setSourceCat('Corporate/Agent');
                              }
                            }
                          }}
                          className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
                        >
                          {activeSourcesList.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                          <option value="__CUSTOM__">+ Other / Custom Source...</option>
                        </select>

                        {isCustomSource && (
                          <input
                            type="text"
                            autoFocus
                            value={customSourceName}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomSourceName(val);
                              setBookingSource(val);
                            }}
                            placeholder="Type custom booking source..."
                            className="mt-2 w-full px-3.5 py-2 text-xs text-slate-900 bg-white border border-indigo-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
                          />
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Source Type</label>
                        <select
                          value={sourceType}
                          onChange={(e) => handleSourceTypeChange(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
                        >
                          {SOURCE_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Special Request / Note */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Special Request / Note</label>
                      <textarea
                        rows={2} value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        placeholder="e.g. High floor requested, early arrival, airport pickup note..."
                        className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none font-medium"
                      />
                    </div>

                    {/* Collapsible: Additional Guest Information & Company GST */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <button type="button" onClick={() => setShowAdvancedGuest(!showAdvancedGuest)}
                        className="w-full p-3.5 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition text-left cursor-pointer">
                        <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <Settings className="w-3.5 h-3.5 text-slate-500" />
                          + Additional Guest Information & Company GST
                        </span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showAdvancedGuest ? 'rotate-180' : ''}`} />
                      </button>

                      {showAdvancedGuest && (
                        <div className="p-4 bg-white border-t border-slate-200 space-y-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Full Street Address</label>
                            <input type="text" value={guestAddress}
                              onChange={(e) => setGuestAddress(e.target.value)}
                              placeholder="House / Street details"
                              className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-lg"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Company Name</label>
                              <input type="text" value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                                placeholder="Corporate entity name"
                                className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Company GSTIN</label>
                              <input type="text" value={companyGst}
                                onChange={(e) => setCompanyGst(e.target.value)}
                                placeholder="GSTIN number for invoice"
                                className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-lg"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">ID Proof Type</label>
                              <select value={idProofType} onChange={(e) => setIdProofType(e.target.value)}
                                className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-lg">
                                <option value="">Select ID Type</option>
                                <option value="Aadhaar">Aadhaar Card</option>
                                <option value="Passport">Passport</option>
                                <option value="Driving License">Driving License</option>
                                <option value="Voter ID">Voter ID</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">ID Proof Number</label>
                              <input type="text" value={idProofNumber}
                                onChange={(e) => setIdProofNumber(e.target.value)}
                                placeholder="ID document number"
                                className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-lg"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ═════════════════════════════════════════════════
                   STEP 4: REVIEW, PAYMENT & CONFIRM
                   ═════════════════════════════════════════════════ */}
                {step === 4 && (
                  <div className="space-y-4 animate-page-fade">
                    {/* Final Booking Review Card */}
                    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                        <Eye className="w-4 h-4 text-indigo-600" />
                        <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                          Final Booking Review
                        </h3>
                      </div>

                      {/* Summary Blocks */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Stay Summary */}
                        <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100 space-y-1">
                          <p className="text-[10px] font-black uppercase text-indigo-600 tracking-wider flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Stay Summary
                          </p>
                          <p className="text-xs font-black text-slate-900">{checkIn} → {checkOut}</p>
                          <p className="text-[11px] text-slate-500">{nights} Night{nights > 1 ? 's' : ''} · {roomRows.length} Room{roomRows.length > 1 ? 's' : ''} · {adults} Adult{adults > 1 ? 's' : ''}</p>
                        </div>

                        {/* Guest Summary */}
                        <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100 space-y-1">
                          <p className="text-[10px] font-black uppercase text-indigo-600 tracking-wider flex items-center gap-1">
                            <User className="w-3 h-3" /> Guest Summary
                          </p>
                          <p className="text-xs font-black text-slate-900">{guestName}</p>
                          <p className="text-[11px] text-slate-500">{phone ? `${countryCode} ${phone}` : 'No phone'} · {bookingSource} ({sourceType})</p>
                        </div>
                      </div>

                      {/* Room Summary */}
                      <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] font-black uppercase text-indigo-600 tracking-wider mb-1.5 flex items-center gap-1">
                          <BedDouble className="w-3 h-3" /> Room Summary
                        </p>
                        <div className="space-y-1 text-xs">
                          {roomRows.map((r, i) => (
                            <div key={r.uid} className="flex items-center justify-between">
                              <span className="font-semibold text-slate-700">
                                Room {i + 1}: {r.categoryName} {r.roomNo !== 'Unassigned' ? `(#${r.roomNo})` : '(Auto Assign)'} · {r.mealPlan}
                              </span>
                              <span className="font-black text-slate-900">₹{fmtInt(r.rate)}/night</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Booking Status & Payment Setting */}
                    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
                      {/* Booking Status Toggle */}
                      <div>
                        <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-2">
                          Booking Status
                        </label>
                        <div className="grid grid-cols-2 gap-2.5">
                          <button type="button" onClick={() => setBookingStatus('confirmed')}
                            className={`p-3 rounded-xl border text-xs font-black transition cursor-pointer flex items-center justify-center gap-2 ${
                              bookingStatus === 'confirmed'
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}>
                            <ShieldCheck className="w-4 h-4" /> Confirm Booking
                          </button>
                          <button type="button" onClick={() => { setBookingStatus('hold'); setPaymentStatusType('pay_later'); }}
                            className={`p-3 rounded-xl border text-xs font-black transition cursor-pointer flex items-center justify-center gap-2 ${
                              bookingStatus === 'hold'
                                ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}>
                            <Clock className="w-4 h-4" /> Hold Booking
                          </button>
                        </div>
                      </div>

                      {/* Payment Status Selector (Only if confirmed) */}
                      {bookingStatus === 'confirmed' && (
                        <div>
                          <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-2">
                            Payment Status
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            <button type="button" onClick={() => setPaymentStatusType('pay_later')}
                              className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                                paymentStatusType === 'pay_later'
                                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}>
                              No Advance / Pay Later
                            </button>
                            <button type="button" onClick={() => setPaymentStatusType('partial')}
                              className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                                paymentStatusType === 'partial'
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}>
                              Partial Payment
                            </button>
                            <button type="button" onClick={() => setPaymentStatusType('full')}
                              className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                                paymentStatusType === 'full'
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}>
                              Full Payment
                            </button>
                          </div>
                        </div>
                      )}

                      {/* If Partial Payment: Show Collected Amount */}
                      {paymentStatusType === 'partial' && bookingStatus === 'confirmed' && (
                        <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 space-y-1.5 animate-page-fade">
                          <label className="block text-xs font-black text-indigo-900">Collected Advance Amount (₹)</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-indigo-400">₹</span>
                            <input
                              type="number" min={0} max={grandTotal} step="any"
                              value={partialAmount}
                              onChange={(e) => setPartialAmount(e.target.value === '' ? '' : Number(e.target.value))}
                              placeholder="Enter advance amount collected"
                              className="w-full pl-8 pr-3 py-2 text-sm font-black text-slate-900 bg-white border border-indigo-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                            />
                          </div>
                        </div>
                      )}

                      {/* Payment Mode Easy Buttons */}
                      {paymentStatusType !== 'pay_later' && bookingStatus === 'confirmed' && (
                        <div>
                          <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-2">
                            Payment Mode
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                              { label: 'Cash', icon: Wallet },
                              { label: 'UPI', icon: Smartphone },
                              { label: 'Card', icon: CreditCard },
                              { label: 'Bank Transfer', icon: Banknote },
                              { label: 'OTA', icon: Tag },
                              { label: 'Agent', icon: User },
                              { label: 'Corporate', icon: Building2 },
                            ].map(({ label, icon: MIcon }) => (
                              <button key={label} type="button" onClick={() => setPayMode(label)}
                                className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                                  payMode === label
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}>
                                <MIcon className="w-3.5 h-3.5" />
                                <span>{label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Optional Payment Ref & Internal Note */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Payment Reference <span className="text-slate-400 text-[10px] font-medium">(optional)</span>
                          </label>
                          <input type="text" value={paymentRef}
                            onChange={(e) => setPaymentRef(e.target.value)}
                            placeholder="UTR / Check / Card Ref"
                            className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Internal Note <span className="text-slate-400 text-[10px] font-medium">(optional)</span>
                          </label>
                          <input type="text" value={internalNote}
                            onChange={(e) => setInternalNote(e.target.value)}
                            placeholder="Staff internal booking notes"
                            className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Right Column: Sticky Booking Summary Panel ── */}
              <div className="lg:col-span-4 lg:sticky lg:top-0 space-y-4">
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-600" />
                      Booking Summary
                    </h3>
                    <span className="text-[10px] font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                      Live
                    </span>
                  </div>

                  {/* Stay & Room Quick Stats */}
                  <div className="space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Dates</span>
                      <span className="font-bold text-slate-900">{checkIn} → {checkOut}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Stay Duration</span>
                      <span className="font-bold text-slate-900">{nights} Night{nights > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Total Rooms</span>
                      <span className="font-bold text-slate-900">{roomRows.length} Room{roomRows.length > 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  {/* Rooms breakdown */}
                  {roomRows.length > 0 && (
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 space-y-1">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Rooms Configured:</span>
                      {roomRows.map((r, i) => (
                        <div key={r.uid} className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-700 truncate max-w-[130px]">R{i + 1}: {r.categoryName}</span>
                          <span className="font-black text-slate-900">₹{fmtInt(r.rate * nights)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Financial Breakdown */}
                  <div className="border-t border-slate-200/80 pt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Room Amount</span>
                      <span className="font-bold text-slate-900">₹{fmtInt(totalRoomAmount)}</span>
                    </div>

                    {discountAmount > 0 && (
                      <div className="flex items-center justify-between text-emerald-700">
                        <span>Discount</span>
                        <span className="font-bold">-₹{fmtInt(discountAmount)}</span>
                      </div>
                    )}

                    {totalTax > 0 && (
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Tax / GST ({gstSlab}%)</span>
                        <span className="font-bold">₹{fmtInt(totalTax)}</span>
                      </div>
                    )}

                    <div className="border-t border-slate-200 pt-2 flex items-center justify-between">
                      <span className="text-sm font-black text-slate-900">Grand Total</span>
                      <span className="text-xl font-black text-indigo-700">₹{fmtInt(grandTotal)}</span>
                    </div>

                    {step === 4 && (
                      <>
                        <div className="flex items-center justify-between text-emerald-700 pt-1">
                          <span>Advance Paid</span>
                          <span className="font-black">₹{fmtInt(effectiveAdvancePaid)}</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-700 font-bold">
                          <span>Balance Due</span>
                          <span className={`font-black ${balanceDue > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                            ₹{fmtInt(balanceDue)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Footer Navigation Bar ── */}
          <div className="px-6 py-4 border-t border-slate-200/90 bg-white shrink-0 flex items-center justify-between gap-3 shadow-2xs">
            {step > 1 ? (
              <button type="button" onClick={goBack}
                className="px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl border border-slate-200 transition cursor-pointer flex items-center gap-1.5 active:scale-95">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            ) : (
              <button type="button" onClick={onClose}
                className="px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl border border-slate-200 transition cursor-pointer">
                Cancel
              </button>
            )}

            <div className="flex items-center gap-2">
              {step === 4 && bookingStatus === 'hold' && (
                <button type="button" onClick={handleConfirmReservation}
                  disabled={saving || submitting}
                  className="px-5 py-2.5 text-xs font-black text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl shadow-xs transition flex items-center gap-1.5 disabled:opacity-60 cursor-pointer active:scale-95">
                  <Clock className="w-4 h-4" /> Save as Hold
                </button>
              )}

              {step < 4 ? (
                <button type="button" onClick={goNext}
                  className="px-6 py-2.5 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition flex items-center gap-2 active:scale-95 cursor-pointer">
                  {step === 1 ? 'Check Availability' : 'Continue'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button type="button" onClick={handleConfirmReservation}
                  disabled={saving || submitting}
                  className="px-6 py-2.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition flex items-center gap-2 disabled:opacity-60 active:scale-95 cursor-pointer">
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Confirming…</>
                  ) : (
                    <><ShieldCheck className="w-4 h-4" /> Confirm Reservation</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

/* ── Helper Components ── */
const SRow = ({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: 'emerald' | 'amber' | 'slate' | 'blue' | 'indigo' }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-slate-500 font-medium">{label}</span>
    <span className={`font-semibold ${
      bold ? 'font-black text-slate-900' : ''
    } ${
      color === 'emerald' ? 'text-emerald-700 font-black' : color === 'amber' ? 'text-amber-700 font-black' : color === 'blue' || color === 'indigo' ? 'text-indigo-700 font-black' : 'text-slate-800'
    }`}>
      {value}
    </span>
  </div>
);
