import { 
  getSupabase, 
  createOrUpdateReservation, 
  cancelReservation, 
  findAvailablePhysicalRoom, 
  upsertGuest 
} from './HotelMantriReservationService.js';
import { parseWebhookPayload } from './AiosellPayloadParser.js';
import { syncInventory, getCleanDateList, logSyncSafely } from '../../channelSyncEngine.js';
import { withOtaLock } from '../../ReservationIdempotencyService.js';
import { sendOtaNewReservationEmail, sendOtaNewReservationWhatsApp } from '../../notificationService.js';
import { generateAndDeliverConfirmation } from '../../reservationDeliveryService.js';
import { resolveHotelRoomCategory, autoAssignPhysicalRoom } from '../../RoomAssignmentService.js';

const logSync = async (hotelId, operation, direction, status, message, metadata = null) => {
  try {
    const supabase = getSupabase();
    await supabase.from('channel_sync_logs').insert({
      hotel_id: hotelId,
      channel: 'aiosell',
      operation,
      direction,
      status,
      message,
      metadata: metadata ? (typeof metadata === 'object' ? JSON.stringify(metadata) : String(metadata)) : null
    });
  } catch (e) {
    console.warn('logSync failed:', e.message);
  }
};

/**
 * Normalizes dates to YYYY-MM-DD
 */
const toDateOnly = (dateVal, fallback) => {
  if (!dateVal) return fallback;
  const s = String(dateVal).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(dateVal);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return fallback;
};

export const processAiosellReservation = async (arg1, arg2, options = {}) => {
  let payload = (typeof arg1 === 'object' && arg1 !== null) ? arg1 : arg2;
  let hotelId = typeof arg1 === 'string' ? arg1 : arg2;

  // Normalize if raw webhook payload was passed directly
  if (payload && (Array.isArray(payload.rooms) || payload.guest || !payload.guestName)) {
    try {
      const parsed = parseWebhookPayload(payload);
      payload = { ...payload, ...parsed };
    } catch {
      // already normalized
    }
  }

  const idempotencyKey = String(payload.bookingId);
  const channelName = payload.channelName || 'aiosell';

  return withOtaLock(hotelId, channelName, idempotencyKey, async () => {
    const supabase = getSupabase();

    // 1. Resolve room category mapping (strictly scoped to hotel_id)
    let roomCategoryId = null;
    let roomCategoryName = null;
    let internalRatePlan = payload.rateplanCode || payload.rateplanName || 'OTA';
    let mappingStatus = 'mapped';

    const resolvedCat = await resolveHotelRoomCategory(hotelId, {
      roomCode: payload.roomCode,
      roomName: payload.roomName,
      ratePlan: payload.rateplanCode,
    });

    if (resolvedCat) {
      roomCategoryId = resolvedCat.categoryId;
      roomCategoryName = resolvedCat.categoryName;
    } else {
      mappingStatus = 'mapping_required';
    }

    // Direct check in reservations table for channel + external_booking_id or idempotency marker
    const idempotencyMarker = `[OTA_BOOKING_ID: ${idempotencyKey}]`;
    const legacyMarker = `[AIOSELL_BOOKING_ID: ${idempotencyKey}]`;

    // Query all existing reservations for this OTA booking
    const { data: existingReservations } = await supabase
      .from('reservations')
      .select('*')
      .eq('hotel_id', hotelId)
      .or(`internal_note.ilike.%${idempotencyMarker}%,internal_note.ilike.%${legacyMarker}%,remarks.ilike.%${idempotencyMarker}%,remarks.ilike.%${legacyMarker}%`)
      .order('created_at', { ascending: true });

    const existingResList = existingReservations || [];

    // 2. Check existing OTA reservation in channel_ota_reservations
    const { data: existingOta } = await supabase
      .from('channel_ota_reservations')
      .select('id, reservation_id, import_status, booking_status')
      .eq('hotel_id', hotelId)
      .eq('ota_booking_id', idempotencyKey)
      .maybeSingle();

    const existingResId = existingOta?.reservation_id || existingResList[0]?.id || null;

    const roomsCount = Math.max(1, Number(payload.roomsCount || (Array.isArray(payload.rooms) ? payload.rooms.length : 1)) || 1);

    // If already imported / reservation exists and action is book, return idempotent response
    if (existingResList.length >= roomsCount && existingResList.every(r => r.status === 'confirmed') && payload.action === 'book') {
      return {
        success: true,
        status: 'already_imported',
        idempotent: true,
        message: 'This booking has already been imported. No duplicate reservation was created.',
        bookingId: idempotencyKey,
        reservationId: existingResList[0].id,
        roomsCount: existingResList.length
      };
    }

    // If action is book but already exists, convert to modify to prevent duplicate creation
    if ((existingOta || existingResList.length > 0) && payload.action === 'book') {
      payload.action = 'modify';
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const ciStr = toDateOnly(payload.checkIn || payload.checkin, todayStr);
    const coStr = toDateOnly(payload.checkOut || payload.checkout, tomorrowStr);

    const ciDate = new Date(ciStr + 'T00:00:00');
    const coDate = new Date(coStr + 'T00:00:00');
    const nights = Math.max(1, Math.round((coDate - ciDate) / (1000 * 60 * 60 * 24)));
    const totalAmount = Number(payload.amount) || 0;
    const rate = Math.round(totalAmount / (roomsCount * nights));

    // 3. Handle Missing Room Mapping
    if (mappingStatus === 'mapping_required' && payload.action !== 'cancel') {
      const logMsg = `OTA reservation ${idempotencyKey} received but room mapping is missing for room code: ${payload.roomCode || 'UNKNOWN'}. Preserved in channel_ota_reservations for mapping.`;
      await logSync(hotelId, 'RESERVATION_MAPPING_REQUIRED', 'inbound', 'warning', logMsg, payload.raw);

      if (existingOta) {
        await supabase.from('channel_ota_reservations').update({
          channel_name: payload.channelName,
          guest_name: payload.guestName,
          guest_mobile: payload.guestPhone,
          room_category: payload.roomCode || 'Unmapped',
          check_in_date: ciStr,
          check_out_date: coStr,
          amount: totalAmount,
          rate_plan: internalRatePlan,
          payment_status: payload.paymentStatus,
          import_status: 'mapping_required',
          booking_status: 'mapping_required',
          raw_payload: payload.raw,
          updated_at: new Date().toISOString()
        }).eq('id', existingOta.id);
      } else {
        await supabase.from('channel_ota_reservations').insert({
          hotel_id: hotelId,
          ota_booking_id: idempotencyKey,
          channel_name: payload.channelName,
          guest_name: payload.guestName,
          guest_mobile: payload.guestPhone,
          room_category: payload.roomCode || 'Unmapped',
          check_in_date: ciStr,
          check_out_date: coStr,
          amount: totalAmount,
          rate_plan: internalRatePlan,
          payment_status: payload.paymentStatus,
          import_status: 'mapping_required',
          booking_status: 'mapping_required',
          raw_payload: payload.raw,
          received_at: new Date().toISOString()
        });
      }

      return { 
        success: true, 
        status: 'mapping_required', 
        message: `Reservation preserved. Room mapping required for code: ${payload.roomCode}`,
        bookingId: idempotencyKey
      };
    }

    // 4. Handle Cancellation
    if (payload.action === 'cancel') {
      let cancelledRes = null;
      try {
        cancelledRes = await cancelReservation(hotelId, idempotencyKey, existingOta?.reservation_id);
      } catch (err) {
        console.error('Failed to cancel reservation in PMS:', err);
      }

      if (existingOta) {
        await supabase.from('channel_ota_reservations').update({
          import_status: 'cancelled',
          booking_status: 'cancelled',
          raw_payload: payload.raw,
          updated_at: new Date().toISOString()
        }).eq('id', existingOta.id);
      } else {
        await supabase.from('channel_ota_reservations').insert({
          hotel_id: hotelId,
          ota_booking_id: idempotencyKey,
          channel_name: payload.channelName,
          guest_name: payload.guestName,
          guest_mobile: payload.guestPhone,
          room_category: roomCategoryName || payload.roomCode,
          check_in_date: ciStr,
          check_out_date: coStr,
          amount: totalAmount,
          rate_plan: internalRatePlan,
          payment_status: payload.paymentStatus,
          import_status: 'cancelled',
          booking_status: 'cancelled',
          raw_payload: payload.raw,
          received_at: new Date().toISOString()
        });
      }

      // Collect all affected dates to restore inventory
      const affectedDates = new Set();
      getCleanDateList(ciStr, coStr).forEach(d => affectedDates.add(d));
      existingResList.forEach(r => {
        if (r.check_in_date && r.check_out_date) {
          getCleanDateList(r.check_in_date, r.check_out_date).forEach(d => affectedDates.add(d));
        }
      });
      const sortedDates = Array.from(affectedDates).sort();
      const sDate = sortedDates[0] || ciStr;
      const eDate = sortedDates[sortedDates.length - 1] || coStr;

      // Recalculate PMS inventory and push to external channel manager synchronously
      let syncResult = null;
      try {
        syncResult = await syncInventory({
          hotelId,
          startDate: sDate,
          endDate: eDate,
          roomCategoryIds: roomCategoryId ? [roomCategoryId] : null,
          skipVerification: false,
          triggeredBy: 'ota_cancel'
        });
      } catch (syncErr) {
        console.warn(`[AiosellReservationService] Upstream sync warning on cancel for ${idempotencyKey}:`, syncErr.message);
        syncResult = { success: false, verified: false, status: 'RETRY_PENDING', error: syncErr.message };
      }

      if (cancelledRes?.id && !options?.isLiveSync) {
        setImmediate(() => {
          generateAndDeliverConfirmation({
            hotelId,
            reservationId: cancelledRes.id,
            reservation: cancelledRes,
            eventType: 'RESERVATION_CANCELLED',
          }).catch(err => {
            console.error('[AiosellReservationService] OTA cancellation delivery error (non-blocking):', err.message);
          });
        });
      }

      return { 
        success: true, 
        status: 'cancelled', 
        message: 'Reservation cancelled successfully',
        bookingId: idempotencyKey,
        reservationId: cancelledRes?.id || existingOta?.reservation_id || null,
        syncResult
      };
    }

    // 5. Book or Modify: Upsert guest and resolve physical rooms
    const guestId = await upsertGuest(hotelId, {
      name: payload.guestName,
      mobile: payload.guestPhone,
      email: payload.guestEmail,
      address: payload.guestAddress,
      nationality: payload.nationality
    });

    const createdReservations = [];
    const assignedPhysicalRoomIds = new Set();
    // Exclude any physical rooms already assigned to other reservations for these dates
    const totalTaxable = payload.amountBeforeTax !== null ? payload.amountBeforeTax : Math.max(0, totalAmount - (payload.taxes || 0));
    const totalTaxes = payload.taxes || 0;

    for (let i = 0; i < roomsCount; i++) {
      const existingRow = existingResList[i] || null;
      const roomSubMarker = roomsCount > 1 ? ` [ROOM: ${i + 1}/${roomsCount}]` : '';
      const fullMarker = `${idempotencyMarker}${roomSubMarker}`;

      // Check if existing reservation row already has a valid physical room
      let existingRoomId = null;
      let existingRoomNo = 'Unassigned';
      if (existingRow?.room_id && existingRow?.room_no && existingRow.room_no !== 'Unassigned') {
        existingRoomId = existingRow.room_id;
        existingRoomNo = existingRow.room_no;
      }

      const perRoomTotal = Math.round(totalAmount / roomsCount);
      const perRoomTaxable = Math.round(totalTaxable / roomsCount);
      const perRoomTax = Math.round(totalTaxes / roomsCount);
      const perRoomAdvance = payload.paymentStatus === 'paid' ? perRoomTotal : 0;

      const pmsPayload = {
        hotel_id: hotelId,
        guest_name: payload.guestName,
        guest_phone: payload.guestPhone || '',
        guest_email: payload.guestEmail || '',
        guest_address: payload.guestAddress || '',
        guest_type: 'OTA',
        check_in_date: ciStr,
        check_out_date: coStr,
        source_category: 'OTA',
        source_name: payload.channelName || 'OTA',
        status: 'confirmed',
        rate: rate || 0,
        discount: Math.round((payload.discounts || 0) / roomsCount),
        taxable_amount: perRoomTaxable,
        gst_amount: perRoomTax,
        invoice_total: perRoomTotal,
        room_id: existingRoomId,
        room_no: existingRoomNo,
        rate_plan: internalRatePlan,
        payment_mode: 'OTA',
        advance_paid: perRoomAdvance,
        adults: Math.max(1, Math.round((payload.adults || 1) / roomsCount)),
        children: Math.round((payload.children || 0) / roomsCount),
        remarks: payload.specialRequests || payload.remarks || '',
        internal_note: fullMarker,
        guest_id: guestId || null,
        parent_reservation_id: createdReservations[0]?.id || null,
        group_id: createdReservations[0]?.id || null
      };

      try {
        const saved = await createOrUpdateReservation(
          pmsPayload,
          idempotencyKey,
          existingRow?.id || null,
          Array.from(assignedPhysicalRoomIds)
        );
        if (saved?.room_id) {
          assignedPhysicalRoomIds.add(saved.room_id);
        }
        createdReservations.push(saved);
      } catch (err) {
        console.error(`Failed to create/update room ${i + 1}/${roomsCount} in PMS:`, err);
      }
    }

    // If modifying and previous room count was greater, cancel excess rooms
    if (existingResList.length > roomsCount) {
      const excessRows = existingResList.slice(roomsCount);
      for (const excess of excessRows) {
        await supabase
          .from('reservations')
          .update({ status: 'cancelled', room_id: null, room_no: 'Unassigned', updated_at: new Date().toISOString() })
          .eq('id', excess.id);
      }
    }

    const primaryReservation = createdReservations[0] || null;
    const importStatus = primaryReservation ? 'imported' : 'failed';

    // 6. Update channel_ota_reservations audit record
    const otaFields = {
      channel_name: payload.channelName,
      guest_name: payload.guestName,
      guest_mobile: payload.guestPhone,
      room_category: roomCategoryName || payload.roomCode,
      check_in_date: ciStr,
      check_out_date: coStr,
      amount: totalAmount,
      rate_plan: internalRatePlan,
      payment_status: payload.paymentStatus,
      import_status: importStatus,
      booking_status: 'confirmed',
      reservation_id: primaryReservation?.id || existingResId || null,
      raw_payload: payload.raw,
      updated_at: new Date().toISOString()
    };

    if (existingOta) {
      await supabase.from('channel_ota_reservations')
        .update(otaFields)
        .eq('id', existingOta.id);
    } else {
      await supabase.from('channel_ota_reservations')
        .insert({
          hotel_id: hotelId,
          ota_booking_id: idempotencyKey,
          received_at: new Date().toISOString(),
          ...otaFields
        });
    }

    const finalStatus = payload.action === 'modify' ? 'updated' : 'imported';

    // 7. Authoritative PMS Inventory Recalculation & Outbound Channel Push (AWAITED)
    const affectedDates = new Set();
    getCleanDateList(ciStr, coStr).forEach(d => affectedDates.add(d));
    existingResList.forEach(r => {
      if (r.check_in_date && r.check_out_date) {
        getCleanDateList(r.check_in_date, r.check_out_date).forEach(d => affectedDates.add(d));
      }
    });
    const sortedDates = Array.from(affectedDates).sort();
    const sDate = sortedDates[0] || ciStr;
    const eDate = sortedDates[sortedDates.length - 1] || coStr;

    let syncResult = null;
    try {
      syncResult = await syncInventory({
        hotelId,
        startDate: sDate,
        endDate: eDate,
        roomCategoryIds: roomCategoryId ? [roomCategoryId] : null,
        skipVerification: false,
        triggeredBy: `ota_${payload.action || 'book'}`
      });
    } catch (syncErr) {
      console.warn(`[AiosellReservationService] Upstream inventory sync warning for ${idempotencyKey}:`, syncErr.message);
      syncResult = { success: false, verified: false, status: 'RETRY_PENDING', error: syncErr.message };
    }

    // 8. Trigger Authoritative Reservation Confirmation PDF + Delivery
    if (
      importStatus !== 'failed' &&
      primaryReservation?.id &&
      !options?.skipDelivery &&
      !options?.isLiveSync
    ) {
      if ((payload.action === 'book' || !payload.action) && finalStatus === 'imported') {
        setImmediate(() => {
          generateAndDeliverConfirmation({
            hotelId,
            reservationId: primaryReservation.id,
            reservation: primaryReservation,
            eventType: 'NEW_OTA_RESERVATION',
          }).catch(err => {
            console.error('[AiosellReservationService] OTA confirmation delivery error (non-blocking):', err.message);
          });
        });
      } else if (payload.action === 'modify' && !options?.isLiveSync) {
        setImmediate(() => {
          generateAndDeliverConfirmation({
            hotelId,
            reservationId: primaryReservation.id,
            reservation: primaryReservation,
            eventType: 'RESERVATION_MODIFIED',
            forceNewVersion: true,
          }).catch(err => {
            console.error('[AiosellReservationService] OTA modification confirmation delivery error (non-blocking):', err.message);
          });
        });
      }
    }

    return {
      success: importStatus !== 'failed',
      status: importStatus === 'failed' ? 'failed' : finalStatus,
      message: payload.action === 'modify' ? 'Reservation modified successfully' : 'Reservation created successfully',
      bookingId: idempotencyKey,
      reservationId: primaryReservation?.id || null,
      roomsCount: createdReservations.length,
      rooms: createdReservations.map(r => ({ id: r.id, roomNo: r.room_no })),
      syncResult
    };
  });
};

export const processWebhook = async (rawPayload) => {
  const supabase = getSupabase();
  const payload = parseWebhookPayload(rawPayload);

  // Resolve hotel_id securely from DB using hotelCode
  let hotelId = null;
  const { data: settings } = await supabase
    .from('channel_settings')
    .select('id, hotel_id')
    .eq('aiosell_hotel_code', payload.hotelCode)
    .maybeSingle();

  if (settings?.hotel_id) {
    hotelId = settings.hotel_id;
  } else {
    console.error(`[ChannelWebhook] HOTEL_NOT_MAPPED: Unknown hotelCode '${payload.hotelCode}'`);
    throw { status: 404, message: `Invalid hotel code mapping: '${payload.hotelCode}'` };
  }

  const result = await processAiosellReservation(payload, hotelId);
  await logSync(
    hotelId, 
    `WEBHOOK_${payload.action.toUpperCase()}`, 
    'inbound', 
    result.success ? 'success' : 'failure', 
    `Webhook ${payload.action}: booking ${payload.bookingId} (${result.status})`, 
    payload.raw
  );

  return result;
};

export const AiosellReservationService = {
  processWebhook,
  processAiosellReservation,
  processReservation: processAiosellReservation,
};

export default {
  processWebhook,
  processAiosellReservation,
  processReservation: processAiosellReservation,
};

