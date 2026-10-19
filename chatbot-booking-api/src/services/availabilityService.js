/**
 * HOTEL MANTRI — Chatbot Booking API: Live Room Categories & Availability Service
 * 
 * Provides:
 * 1. Filtered public room-category catalog with capacity and indicative rates
 * 2. Real-time multi-night physical availability checking across half-open stay [checkIn, checkOut)
 * 3. Inventory calculation accounting for:
 *    - Confirmed and checked-in reservations
 *    - Active, unexpired booking holds in `booking_holds`
 *    - Out-of-order and maintenance rooms in `rooms`
 *    - Explicit room blocks in `room_blocks`
 * 4. Zero guest PII leakage
 */

import { supabase } from '../db/supabase.js';
import { getConfiguredHotelId } from './hotelConfigService.js';
import { calculateStayNights, isValidDateString } from './quoteEngine.js';

/**
 * Returns all active, publicly bookable room categories for the configured hotel.
 */
export const getPublicRoomCategories = async () => {
  const hotelId = getConfiguredHotelId();

  // 1. Fetch categories
  const { data: categories, error } = await supabase
    .from('room_categories')
    .select('id, hotel_id, name, sort_order, default_tariff, extra_bed_charge, is_active')
    .eq('hotel_id', hotelId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[AvailabilityService] Categories fetch error:', error);
    throw new Error('Failed to retrieve room categories.');
  }

  // 2. Fetch total active rooms per category for capacity reference
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, category_id, default_tariff, is_active, room_status')
    .eq('hotel_id', hotelId)
    .eq('is_active', true);

  const roomCountMap = new Map();
  for (const r of rooms || []) {
    if (r.category_id && r.room_status !== 'Maintenance') {
      roomCountMap.set(r.category_id, (roomCountMap.get(r.category_id) || 0) + 1);
    }
  }

  // 3. Format safe public catalog
  return (categories || []).map((cat) => {
    const totalPhysicalRooms = roomCountMap.get(cat.id) || 0;
    const defaultTariff = Number(cat.default_tariff) || 0;

    return {
      categoryId: cat.id,
      name: cat.name,
      description: `Spacious and comfortable ${cat.name} accommodation.`,
      capacity: {
        maxAdults: cat.name.toLowerCase().includes('fourbed') || cat.name.toLowerCase().includes('family') ? 4 : 2,
        maxChildren: 1,
        totalInventory: totalPhysicalRooms,
      },
      pricing: {
        currency: 'INR',
        baseRate: defaultTariff,
        extraBedCharge: Number(cat.extra_bed_charge) || 0,
      },
      isAvailableForBooking: totalPhysicalRooms > 0,
    };
  });
};

/**
 * Determines whether two date intervals overlap in half-open stay semantics.
 * Stay interval [checkIn, checkOut) overlaps with [resvIn, resvOut) if and only if:
 * checkIn < resvOut AND checkOut > resvIn
 */
export const isStayOverlapping = (inA, outA, inB, outB) => {
  if (!inA || !outA || !inB || !outB) return false;
  return inA.slice(0, 10) < outB.slice(0, 10) && outA.slice(0, 10) > inB.slice(0, 10);
};

/**
 * Checks live physical availability across all stay dates for the configured hotel.
 */
export const checkLiveAvailability = async ({
  checkIn,
  checkOut,
  adults = 1,
  children = 0,
  rooms = 1,
  categoryId = null,
}) => {
  const hotelId = getConfiguredHotelId();

  // Validate dates
  if (!isValidDateString(checkIn) || !isValidDateString(checkOut)) {
    const err = new Error('Check-in and check-out must be valid ISO dates (YYYY-MM-DD).');
    err.status = 400;
    err.code = 'INVALID_DATE_FORMAT';
    throw err;
  }

  const nights = calculateStayNights(checkIn, checkOut);
  if (nights <= 0) {
    const err = new Error(`Check-out date (${checkOut}) must be strictly after check-in date (${checkIn}).`);
    err.status = 400;
    err.code = 'INVALID_STAY_DATES';
    throw err;
  }

  const requestedRooms = Math.max(1, parseInt(rooms, 10) || 1);

  // 1. Fetch active categories
  let catQuery = supabase
    .from('room_categories')
    .select('id, name, default_tariff, is_active')
    .eq('hotel_id', hotelId)
    .eq('is_active', true);

  if (categoryId) {
    catQuery = catQuery.eq('id', categoryId);
  }

  const { data: categories, error: catErr } = await catQuery;
  if (catErr || !categories || categories.length === 0) {
    if (categoryId) {
      const err = new Error(`Category ${categoryId} is not available for this hotel.`);
      err.status = 404;
      err.code = 'CATEGORY_NOT_FOUND';
      throw err;
    }
    return {
      available: false,
      checkIn,
      checkOut,
      nights,
      categories: [],
    };
  }

  // 2. Fetch all physical rooms for the hotel
  const { data: allRooms } = await supabase
    .from('rooms')
    .select('id, room_no, category_id, is_active, room_status')
    .eq('hotel_id', hotelId)
    .eq('is_active', true);

  // 3. Fetch overlapping reservations with status in ('confirmed', 'checked_in')
  // We query all reservations whose interval overlaps [checkIn, checkOut)
  const { data: overlappingReservations } = await supabase
    .from('reservations')
    .select('id, room_id, room_no, check_in_date, check_out_date, status')
    .eq('hotel_id', hotelId)
    .in('status', ['confirmed', 'checked_in'])
    .lt('check_in_date', checkOut)
    .gt('check_out_date', checkIn);

  // 4. Fetch overlapping room blocks (maintenance, out of service)
  const { data: roomBlocks } = await supabase
    .from('room_blocks')
    .select('id, room_no, start_date, end_date')
    .eq('hotel_id', hotelId)
    .lt('start_date', checkOut)
    .gt('end_date', checkIn);

  // 5. Fetch overlapping unexpired holds from booking_holds (if table exists)
  let overlappingHolds = [];
  try {
    const { data: holds } = await supabase
      .from('booking_holds')
      .select('id, category_id, rooms_count, check_in_date, check_out_date, status, expires_at')
      .eq('hotel_id', hotelId)
      .eq('status', 'held')
      .gt('expires_at', new Date().toISOString())
      .lt('check_in_date', checkOut)
      .gt('check_out_date', checkIn);

    if (holds) {
      overlappingHolds = holds;
    }
  } catch {
    // If booking_holds table has not been created yet in DB, proceed safely
  }

  // Construct blocked physical room sets
  const blockedPhysicalRoomIds = new Set();
  const blockedPhysicalRoomNos = new Set();

  for (const resv of overlappingReservations || []) {
    if (resv.room_id) blockedPhysicalRoomIds.add(resv.room_id);
    if (resv.room_no && resv.room_no.toLowerCase() !== 'unassigned') {
      blockedPhysicalRoomNos.add(resv.room_no.trim().toLowerCase());
    }
  }

  for (const block of roomBlocks || []) {
    if (block.room_no) {
      blockedPhysicalRoomNos.add(block.room_no.trim().toLowerCase());
    }
  }

  // Calculate day-by-day availability for each category
  const results = [];

  for (const cat of categories) {
    // Total valid operational rooms in category
    const catPhysicalRooms = (allRooms || []).filter((r) => {
      if (r.category_id !== cat.id) return false;
      if (r.room_status === 'Maintenance') return false;
      return true;
    });

    const totalRoomsCount = catPhysicalRooms.length;

    // Filter out physically blocked rooms
    const freePhysicalRooms = catPhysicalRooms.filter((r) => {
      if (blockedPhysicalRoomIds.has(r.id)) return false;
      if (blockedPhysicalRoomNos.has(r.room_no.trim().toLowerCase())) return false;
      return true;
    });

    // Subtract held units in booking_holds
    const heldUnits = overlappingHolds
      .filter((h) => h.category_id === cat.id)
      .reduce((sum, h) => sum + (h.rooms_count || 1), 0);

    const availableRoomsCount = Math.max(0, freePhysicalRooms.length - heldUnits);
    const isBookable = availableRoomsCount >= requestedRooms;

    results.push({
      categoryId: cat.id,
      categoryName: cat.name,
      totalRooms: totalRoomsCount,
      availableRooms: availableRoomsCount,
      requestedRooms,
      isAvailable: isBookable,
      indicativeRate: Number(cat.default_tariff) || 0,
      currency: 'INR',
    });
  }

  const anyAvailable = results.some((r) => r.isAvailable);

  return {
    available: anyAvailable,
    stay: {
      checkIn,
      checkOut,
      nights,
      requestedRooms,
      adults: Math.max(1, parseInt(adults, 10) || 1),
      children: Math.max(0, parseInt(children, 10) || 0),
    },
    categories: results,
  };
};
