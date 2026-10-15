import type { Room, RoomCategory, SourceCategory, MealPlan, GstType, GstSlab } from './types.ts';
import { isValidEmail, type ReservationInput } from './types-reservations.ts';
import { toNum, calcGstFull } from './calc.ts';

export interface ReservationValidationInput {
  guestName: string;
  email: string;
  roomNos: string[];
  checkIn: string;
  checkOut: string;
  allowEmptyEmail?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  error: string | null;
  emailError: string | null;
}

/**
 * Validates reservation form fields authoritatively.
 * Enforces guest name, stay dates, and room selection.
 * Email is enforced only when allowEmptyEmail is false.
 */
export const validateReservationForm = (input: ReservationValidationInput): ValidationResult => {
  if (!input.guestName || !input.guestName.trim()) {
    return { valid: false, error: 'Please enter guest name.', emailError: null };
  }

  const cleanEmail = (input.email || '').trim();
  if (!input.allowEmptyEmail) {
    if (!cleanEmail) {
      const msg = 'Guest email is required.';
      return { valid: false, error: msg, emailError: msg };
    }
    if (!isValidEmail(cleanEmail)) {
      const msg = 'Please enter a valid email address.';
      return { valid: false, error: msg, emailError: msg };
    }
  } else if (cleanEmail && !isValidEmail(cleanEmail)) {
    const msg = 'Please enter a valid email address.';
    return { valid: false, error: msg, emailError: msg };
  }

  if (!input.roomNos || input.roomNos.length === 0) {
    return { valid: false, error: 'Please select at least one room.', emailError: null };
  }

  if (!input.checkIn || !input.checkOut) {
    return { valid: false, error: 'Please select check-in and check-out dates.', emailError: null };
  }

  if (new Date(input.checkOut + 'T00:00:00') <= new Date(input.checkIn + 'T00:00:00')) {
    return { valid: false, error: 'Check-out date must be after check-in date.', emailError: null };
  }

  return { valid: true, error: null, emailError: null };
};

export interface RoomDetailConfig {
  roomNo?: string;
  roomId?: string | null;
  categoryId?: string | null;
  categoryName?: string;
  rate?: number;
  mealPlan?: MealPlan;
  adults?: number;
  children?: number;
}

export interface BuildReservationInputsParams {
  roomNos: string[];
  guestName: string;
  phone: string;
  countryCode: string;
  email: string;
  guestAddress: string;
  guestType: string;
  companyGst: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  rate: number | '';
  roomRates: Record<string, number>;
  sourceCat: SourceCategory;
  sourceName: string;
  payMode: string;
  payCash: number | '';
  payUpi: number | '';
  payCard: number | '';
  payBank: number | '';
  totalReceived: number;
  paymentRef: string;
  discount: number | '';
  mealPlan: MealPlan;
  gstType: GstType;
  gstSlab: GstSlab;
  adults: number | '';
  children: number | '';
  remarks: string;
  internalNote: string;
  createdBy: string;
  status?: 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
  allowEmptyEmail?: boolean;
  rooms: Room[];
  categories: RoomCategory[];
  roomDetails?: RoomDetailConfig[];
}

/**
 * Builds normalized ReservationInput array for single or multi-room reservations.
 * Deduplicates physical room numbers, handles category-based unassigned holds, group UUID linking,
 * distributes advance payments, and calculates authoritative tariff & GST amounts.
 */
export const buildReservationInputs = (params: BuildReservationInputsParams): ReservationInput[] => {
  // If structured roomDetails are provided, prioritize them
  const hasDetails = params.roomDetails && params.roomDetails.length > 0;
  
  // Deduplicate only physical rooms
  const seenPhysical = new Set<string>();
  const rawList: RoomDetailConfig[] = hasDetails
    ? (params.roomDetails || [])
    : params.roomNos.map(no => ({ roomNo: no }));

  const validItems: RoomDetailConfig[] = [];
  for (const item of rawList) {
    const rawNo = (item.roomNo || '').trim();
    const k = rawNo.toLowerCase();
    const isPhysical = k && k !== 'unassigned' && k !== 'tbd';
    if (isPhysical) {
      if (seenPhysical.has(k)) continue;
      seenPhysical.add(k);
    }
    validItems.push(item);
  }

  const groupId = validItems.length > 1 ? crypto.randomUUID() : undefined;
  const fullPhone = params.phone.trim() ? `${params.countryCode} ${params.phone.trim()}` : '';

  return validItems.map((item, idx) => {
    const rawNo = (item.roomNo || '').trim();
    const isPhysical = rawNo && rawNo.toLowerCase() !== 'unassigned' && rawNo.toLowerCase() !== 'tbd';
    
    const room = isPhysical
      ? params.rooms.find((r) => (r.room_no || '').trim().toLowerCase() === rawNo.toLowerCase())
      : (item.roomId ? params.rooms.find((r) => r.id === item.roomId) : undefined);

    const advancePaid = idx === 0 ? params.totalReceived : 0;
    const rPayCash = idx === 0 ? toNum(params.payCash) : 0;
    const rPayUpi = idx === 0 ? toNum(params.payUpi) : 0;
    const rPayCard = idx === 0 ? toNum(params.payCard) : 0;
    const rPayBank = idx === 0 ? toNum(params.payBank) : 0;

    const catId = item.categoryId || room?.category_id;
    const roomCat = params.categories.find((c) => c.id === catId);
    
    const fallbackTariff =
      toNum(params.rate) > 0
        ? toNum(params.rate)
        : (roomCat?.default_tariff ?? room?.default_tariff ?? 0);

    const individualRate =
      item.rate !== undefined && toNum(item.rate) > 0
        ? toNum(item.rate)
        : rawNo && params.roomRates[rawNo] !== undefined && toNum(params.roomRates[rawNo]) > 0
        ? toNum(params.roomRates[rawNo])
        : fallbackTariff;

    const roomSubtotal = individualRate * params.nights;
    const roomDiscount = toNum(params.discount) / (validItems.length || 1);
    const roomAfterDiscount = Math.max(0, roomSubtotal - roomDiscount);
    const {
      taxable: rTaxable,
      gst: rGst,
      invoiceTotal: rInvoiceTotal,
    } = calcGstFull(roomAfterDiscount, params.gstType, params.gstSlab);

    return {
      room_id: room?.id ?? null,
      room_no: isPhysical ? (room?.room_no?.trim() || rawNo) : 'Unassigned',
      room_category_id: catId ?? null,
      guest_name: params.guestName.trim(),
      guest_phone: fullPhone,
      guest_email: params.email.trim(),
      guest_address: params.guestAddress.trim(),
      guest_type: params.guestType.trim(),
      company_gst: params.companyGst.trim(),
      check_in_date: params.checkIn,
      check_out_date: params.checkOut,
      rate: individualRate,
      source_category: params.sourceCat,
      source_name: params.sourceName.trim(),
      payment_mode: params.payMode,
      advance_paid: advancePaid,
      pay_cash: rPayCash,
      pay_upi: rPayUpi,
      pay_card: rPayCard,
      pay_bank: rPayBank,
      payment_ref: params.paymentRef.trim(),
      discount: roomDiscount,
      meal_plan: item.mealPlan || params.mealPlan,
      gst_type: params.gstType,
      gst_slab: params.gstSlab,
      gst_amount: rGst,
      taxable_amount: rTaxable,
      invoice_total: rInvoiceTotal,
      adults: item.adults !== undefined ? toNum(item.adults) : toNum(params.adults),
      children: item.children !== undefined ? toNum(item.children) : toNum(params.children),
      remarks: params.remarks.trim(),
      internal_note: params.internalNote.trim(),
      created_by: params.createdBy.trim(),
      status: params.status || 'confirmed',
      group_id: groupId,
      allowEmptyEmail: params.allowEmptyEmail ?? true,
    };
  });
};
