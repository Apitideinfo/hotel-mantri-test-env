import { getSupabase, createOrUpdateReservation, cancelReservation } from './HotelMantriReservationService.js';
import { parseWebhookPayload } from './AiosellPayloadParser.js';

const logSync = async (hotelId, operation, direction, status, message, metadata = null) => {
  const supabase = getSupabase();
  await supabase.from('channel_sync_logs').insert({
    hotel_id: hotelId,
    channel: 'aiosell',
    operation,
    direction,
    status,
    message,
    metadata
  });
};

export const processAiosellReservation = async (payload, hotelId) => {
  const supabase = getSupabase();
  const idempotencyKey = payload.bookingId;
  
  // 1. Resolve room category mapping
  let roomCategoryId = null;
  let roomCategoryName = null;
  let internalRatePlan = payload.rateplanCode || 'OTA';
  let importStatus = 'imported';
  
  if (payload.roomCode) {
    const { data: mapping } = await supabase
      .from('channel_rate_mappings')
      .select('room_category_id, rate_plan_id, channex_rate_plan_id')
      .eq('channex_room_type_id', payload.roomCode)
      .maybeSingle();

    if (mapping) {
      roomCategoryId = mapping.room_category_id;
      if (mapping.channex_rate_plan_id) internalRatePlan = mapping.channex_rate_plan_id;
      
      const { data: cat } = await supabase.from('room_categories').select('name').eq('id', roomCategoryId).maybeSingle();
      if (cat) roomCategoryName = cat.name;
    } else {
      // Fallback: try to find a room category with a name matching roomCode
      const { data: cat } = await supabase
        .from('room_categories')
        .select('id, name')
        .eq('hotel_id', hotelId)
        .ilike('name', payload.roomCode)
        .maybeSingle();
      if (cat) {
        roomCategoryId = cat.id;
        roomCategoryName = cat.name;
      } else {
        importStatus = 'mapping_required';
      }
    }
  } else {
    importStatus = 'mapping_required';
  }

  // Check idempotency in channel_ota_reservations
  const { data: existingOta } = await supabase
    .from('channel_ota_reservations')
    .select('id, import_status')
    .eq('hotel_id', hotelId)
    .eq('ota_booking_id', idempotencyKey)
    .maybeSingle();

  if (existingOta && existingOta.import_status !== 'pending' && payload.action === 'book') {
    // If it's a fetch/book and already exists, we skip it
    return { success: true, message: 'Idempotent: Already imported', status: 'skipped' };
  }

  const ci = payload.checkIn ? new Date(payload.checkIn) : new Date();
  const co = payload.checkOut ? new Date(payload.checkOut) : new Date(Date.now() + 86400000);
  const nights = Math.max(1, Math.round((co - ci) / (1000 * 60 * 60 * 24)));
  const rate = payload.amount / (payload.roomsCount * nights);

  // 2. Process action
  if (payload.action === 'book') {
    // Insert into PMS Core
    const pmsPayload = {
      hotel_id: hotelId,
      guest_name: payload.guestName,
      guest_phone: payload.guestPhone,
      guest_email: payload.guestEmail,
      check_in_date: ci.toISOString(),
      check_out_date: co.toISOString(),
      source_category: 'OTA',
      source_name: payload.channelName,
      status: 'confirmed',
      rate: rate || 0,
      invoice_total: payload.amount,
      room_id: null,
      room_no: 'TBD',
      rate_plan: internalRatePlan,
      payment_mode: 'OTA',
      advance_paid: payload.paymentStatus === 'paid' ? payload.amount : 0
    };

    if (roomCategoryId) {
      pmsPayload.room_categories = { id: roomCategoryId };
    }

    try {
      await createOrUpdateReservation(pmsPayload, idempotencyKey);
    } catch (err) {
      console.error('Failed to create reservation in PMS:', err);
      importStatus = 'failed';
    }
    
    // Update audit log
    if (existingOta) {
      await supabase.from('channel_ota_reservations').update({ 
        import_status: importStatus,
        channel_name: payload.channelName,
        guest_name: payload.guestName,
        guest_mobile: payload.guestPhone,
        room_category: roomCategoryName || payload.roomCode,
        check_in_date: payload.checkIn,
        check_out_date: payload.checkOut,
        amount: payload.amount,
        rate_plan: internalRatePlan,
        payment_status: payload.paymentStatus,
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
        check_in_date: payload.checkIn,
        check_out_date: payload.checkOut,
        amount: payload.amount,
        rate_plan: internalRatePlan,
        payment_status: payload.paymentStatus,
        import_status: importStatus,
        booking_status: 'confirmed',
        raw_payload: payload.raw,
        received_at: new Date().toISOString()
      });
    }

    return { success: true, message: 'Reservation created', status: importStatus };

  } else if (payload.action === 'modify') {
    // We update the core reservation
    const pmsPayload = {
      hotel_id: hotelId,
      guest_name: payload.guestName,
      check_in_date: payload.checkIn ? ci.toISOString() : undefined,
      check_out_date: payload.checkOut ? co.toISOString() : undefined,
      invoice_total: payload.amount,
      rate: rate || undefined,
    };
    
    Object.keys(pmsPayload).forEach(key => pmsPayload[key] === undefined && delete pmsPayload[key]);

    try {
      await createOrUpdateReservation(pmsPayload, idempotencyKey);
    } catch (err) {
      console.error('Failed to modify reservation in PMS:', err);
      importStatus = 'failed';
    }
    
    // Update audit
    await supabase.from('channel_ota_reservations')
      .update({ 
        import_status: importStatus === 'mapping_required' ? importStatus : 'updated',
        channel_name: payload.channelName,
        guest_name: payload.guestName,
        guest_mobile: payload.guestPhone,
        room_category: roomCategoryName || payload.roomCode,
        check_in_date: payload.checkIn,
        check_out_date: payload.checkOut,
        amount: payload.amount,
        rate_plan: internalRatePlan,
        payment_status: payload.paymentStatus,
        raw_payload: payload.raw,
        updated_at: new Date().toISOString()
      })
      .eq('hotel_id', hotelId)
      .eq('ota_booking_id', idempotencyKey);
      
    return { success: true, message: 'Reservation modified', status: 'updated' };

  } else if (payload.action === 'cancel') {
    try {
      await cancelReservation(hotelId, idempotencyKey);
    } catch (err) {
      console.error('Failed to cancel reservation in PMS:', err);
    }
    
    // Update audit
    await supabase.from('channel_ota_reservations')
      .update({ 
        import_status: 'cancelled', 
        booking_status: 'cancelled',
        raw_payload: payload.raw,
        updated_at: new Date().toISOString() 
      })
      .eq('hotel_id', hotelId)
      .eq('ota_booking_id', idempotencyKey);
      
    return { success: true, message: 'Reservation cancelled', status: 'cancelled' };
  } else {
    throw { status: 400, message: `Unsupported action: ${payload.action}` };
  }
};

import { executeInventoryPush } from '../../../routes/aiosell.js';

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
    console.error(`[AIOSSELL] AIOSSELL_HOTEL_NOT_MAPPED: Unknown hotelCode '${payload.hotelCode}'`);
    throw { status: 404, message: `Invalid hotel code mapping: '${payload.hotelCode}'` };
  }

  const result = await processAiosellReservation(payload, hotelId);
  await logSync(hotelId, `AIOSELL_WEBHOOK_${payload.action.toUpperCase()}`, 'inbound', result.success ? 'success' : 'failure', result.message, payload.raw);
  
  // Trigger background inventory sync unawaited
  if (result.success) {
    const today = new Date().toISOString().split('T')[0];
    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    executeInventoryPush(hotelId, today, nextMonth).catch(err => {
      console.error(`[AIOSSELL] Background inventory push failed for hotel ${hotelId}:`, err.message);
    });
  }

  return result;
};

export default {
  processWebhook,
  processAiosellReservation
};
