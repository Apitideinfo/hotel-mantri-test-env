import type { Room, RoomCategory, SourceCategory, MealPlan, GstType, GstSlab } from './types.ts';
import { isValidEmail, type ReservationInput } from './types-reservations.ts';
import { toNum, calcGstFull } from './calc.ts';

export interface ReservationValidationInput {
  guestName: string;
  email: string;
  roomNos: string[];
  checkIn: string;
  checkOut: string;
}

export interface ValidationResult {
  valid: boolean;
  error: string | null;
  emailError: string | null;
}

/**
 * Validates reservation form fields authoritatively.
 * Enforces mandatory email, guest name, stay dates, and room selection.
 */
export const validateReservationForm = (input: ReservationValidationInput): ValidationResult => {
  if (!input.guestName || !input.guestName.trim()) {
    return { valid: false, error: 'Please enter guest name.', emailError: null };
  }

  const cleanEmail = (input.email || '').trim();
  if (!cleanEmail) {
    const msg = 'Guest email is required.';
    return { valid: false, error: msg, emailError: msg };
  }

  if (!isValidEmail(cleanEmail)) {
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
  rooms: Room[];
  categories: RoomCategory[];
}

/**
 * Builds normalized ReservationInput array for single or multi-room reservations.
 * Deduplicates room numbers, handles group UUID linking, distributes advance payments,
 * and calculates authoritative tariff & GST amounts.
 */
export const buildReservationInputs = (params: BuildReservationInputsParams): ReservationInput[] => {
  // Deduplicate room numbers case-insensitively
  const seen = new Set<string>();
  const cleanRoomNos: string[] = [];
  for (const no of params.roomNos) {
    const trimmed = (no || '').trim();
    const k = trimmed.toLowerCase();
    if (trimmed && !seen.has(k)) {
      seen.add(k);
      cleanRoomNos.push(trimmed);
    }
  }

  const groupId = cleanRoomNos.length > 1 ? crypto.randomUUID() : undefined;
  const fullPhone = params.phone.trim() ? `${params.countryCode} ${params.phone.trim()}` : '';

  // 1. Calculate each room's invoice total first so we can properly allocate payments
  const roomCalculations = cleanRoomNos.map((no) => {
    const room = params.rooms.find(
      (r) => (r.room_no || '').trim().toLowerCase() === no.toLowerCase()
    );
    const roomCat = params.categories.find((c) => c.id === room?.category_id);
    const fallbackTariff =
      toNum(params.rate) > 0
        ? toNum(params.rate)
        : (roomCat?.default_tariff ?? room?.default_tariff ?? 0);
    const individualRate =
      params.roomRates[no] !== undefined && toNum(params.roomRates[no]) > 0
        ? toNum(params.roomRates[no])
        : fallbackTariff;

    const roomSubtotal = individualRate * params.nights;
    const roomDiscount = toNum(params.discount) / (cleanRoomNos.length || 1);
    const roomAfterDiscount = Math.max(0, roomSubtotal - roomDiscount);
    const {
      taxable: rTaxable,
      gst: rGst,
      invoiceTotal: rInvoiceTotal,
    } = calcGstFull(roomAfterDiscount, params.gstType, params.gstSlab);

    return {
      room,
      no,
      individualRate,
      roomDiscount,
      rTaxable,
      rGst,
      rInvoiceTotal,
    };
  });

  const totalGroupInvoice = roomCalculations.reduce((sum, r) => sum + r.rInvoiceTotal, 0);
  const totalReceived = toNum(params.totalReceived);
  const isFullyPaid = totalGroupInvoice > 0 && totalReceived >= (totalGroupInvoice - 0.01);

  // Sequential advance allocation across rooms so each room is marked paid up to its share
  let remainingAdvanceToAllocate = totalReceived;
  let remainingCash = toNum(params.payCash);
  let remainingUpi = toNum(params.payUpi);
  let remainingCard = toNum(params.payCard);
  let remainingBank = toNum(params.payBank);

  return roomCalculations.map((calc, idx) => {
    let advancePaid = 0;
    let rPayCash = 0;
    let rPayUpi = 0;
    let rPayCard = 0;
    let rPayBank = 0;

    if (isFullyPaid) {
      // If the group is fully paid, mark every room's advance equal to its invoice total
      advancePaid = calc.rInvoiceTotal;
      const ratio = totalGroupInvoice > 0 ? calc.rInvoiceTotal / totalGroupInvoice : 1 / cleanRoomNos.length;
      rPayCash = idx === cleanRoomNos.length - 1 ? remainingCash : Math.round(toNum(params.payCash) * ratio * 100) / 100;
      rPayUpi = idx === cleanRoomNos.length - 1 ? remainingUpi : Math.round(toNum(params.payUpi) * ratio * 100) / 100;
      rPayCard = idx === cleanRoomNos.length - 1 ? remainingCard : Math.round(toNum(params.payCard) * ratio * 100) / 100;
      rPayBank = idx === cleanRoomNos.length - 1 ? remainingBank : Math.round(toNum(params.payBank) * ratio * 100) / 100;
      remainingCash -= rPayCash;
      remainingUpi -= rPayUpi;
      remainingCard -= rPayCard;
      remainingBank -= rPayBank;
    } else {
      // Partial payment or single room: allocate to primary room first, or sequentially
      // For primary room (idx === 0), it records totalReceived so group tracking reflects total paid
      advancePaid = idx === 0 ? totalReceived : 0;
      rPayCash = idx === 0 ? toNum(params.payCash) : 0;
      rPayUpi = idx === 0 ? toNum(params.payUpi) : 0;
      rPayCard = idx === 0 ? toNum(params.payCard) : 0;
      rPayBank = idx === 0 ? toNum(params.payBank) : 0;
    }

    return {
      room_id: calc.room?.id ?? null,
      room_no: calc.room?.room_no?.trim() || calc.no,
      guest_name: params.guestName.trim(),
      guest_phone: fullPhone,
      guest_email: params.email.trim(),
      guest_address: params.guestAddress.trim(),
      guest_type: params.guestType.trim(),
      company_gst: params.companyGst.trim(),
      check_in_date: params.checkIn,
      check_out_date: params.checkOut,
      rate: calc.individualRate,
      source_category: params.sourceCat,
      source_name: params.sourceName.trim(),
      payment_mode: params.payMode,
      advance_paid: advancePaid,
      pay_cash: rPayCash,
      pay_upi: rPayUpi,
      pay_card: rPayCard,
      pay_bank: rPayBank,
      payment_ref: params.paymentRef.trim(),
      discount: calc.roomDiscount,
      meal_plan: params.mealPlan,
      gst_type: params.gstType,
      gst_slab: params.gstSlab,
      gst_amount: calc.rGst,
      taxable_amount: calc.rTaxable,
      invoice_total: calc.rInvoiceTotal,
      adults: toNum(params.adults),
      children: toNum(params.children),
      remarks: params.remarks.trim(),
      internal_note: params.internalNote.trim(),
      created_by: params.createdBy.trim(),
      status: 'confirmed',
      group_id: groupId,
    };
  });
};
