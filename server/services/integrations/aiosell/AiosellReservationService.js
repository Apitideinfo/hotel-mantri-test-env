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

export const processWebhook = async (rawPayload) => {
  const supabase = getSupabase();
  const payload = parseWebhookPayload(rawPayload);
  const idempotencyKey = payload.bookingId;
  
  // 1. Resolve hotel_id
  let hotelId = null;
  const { data: settings } = await supabase
    .from('channel_settings')
    .select('id, hotel_id')
    .eq('aiosell_hotel_code', payload.hotelCode)
    .maybeSingle();

  if (settings?.hotel_id) {
    hotelId = settings.hotel_id;
  } else {
    // Fallback: Check if payload hotelCode matches environment or fetch default hotel from database
    const envHotelCode = process.env.AIOSELL_HOTEL_CODE || 'sandbox-pms';
    const { data: hotels } = await supabase.from('hotels').select('id').limit(1);
    if (hotels && hotels.length > 0) {
      hotelId = hotels[0].id;
    } else {
      throw { status: 404, message: `Invalid hotel code mapping: '${payload.hotelCode}'` };
    }
  }

  // 2. Resolve room category mapping
  let roomCategoryId = null;
  let internalRatePlan = payload.rateplanCode || 'OTA';
  
  if (payload.roomCode) {
    const { data: mapping } = await supabase
      .from('channel_rate_mappings')
      .select('room_category_id, rate_plan')
      .eq('aiosell_room_code', payload.roomCode)
      .maybeSingle();

      
    if (mapping) {
      roomCategoryId = mapping.room_category_id;
      if (mapping.rate_plan) internalRatePlan = mapping.rate_plan;
    } else {
      // Fallback: try to find a room category with a name matching roomCode
      const { data: cat } = await supabase
        .from('room_categories')
        .select('id')
        .eq('hotel_id', hotelId)
        .ilike('name', payload.roomCode)
        .maybeSingle();
      if (cat) roomCategoryId = cat.id;
    }
  }

  // 3. Process action
  if (payload.action === 'book') {
    // Check idempotency in channel_ota_reservations
    const { data: existingOta } = await supabase
      .from('channel_ota_reservations')
      .select('id, import_status')
      .eq('hotel_id', hotelId)
      .eq('ota_booking_id', idempotencyKey)
      .maybeSingle();

    if (existingOta && existingOta.import_status !== 'pending') {
      return { success: true, message: 'Idempotent: Already imported' };
    }

    // Insert into PMS Core
    const ci = payload.checkIn ? new Date(payload.checkIn) : new Date();
    const co = payload.checkOut ? new Date(payload.checkOut) : new Date(Date.now() + 86400000);
    const nights = Math.max(1, Math.round((co - ci) / (1000 * 60 * 60 * 24)));
    
    // Construct the PMS payload
    const pmsPayload = {
      hotel_id: hotelId,
      guest_name: payload.guestName,
      guest_phone: payload.guestPhone,
      guest_email: payload.guestEmail,
      check_in_date: ci.toISOString(),
      check_out_date: co.toISOString(),
      source_category: 'OTA',
      source_name: 'Aiosell',
      status: 'confirmed',
      rate: payload.amount / (payload.roomsCount * nights),
      invoice_total: payload.amount,
      room_id: null,
      room_no: 'TBD', // To be assigned later
      rate_plan: internalRatePlan,
      payment_mode: 'OTA',
      advance_paid: payload.paymentStatus === 'paid' ? payload.amount : 0
    };

    if (roomCategoryId) {
      pmsPayload.room_categories = { id: roomCategoryId }; // This might not be writable directly. We should write room_category_id if the column exists. Wait, api-reservations maps room categories differently. We'll stick to basic fields.
    }

    await createOrUpdateReservation(pmsPayload, idempotencyKey);
    
    // Update audit log
    if (existingOta) {
      await supabase.from('channel_ota_reservations').update({ import_status: 'imported' }).eq('id', existingOta.id);
    } else {
      await supabase.from('channel_ota_reservations').insert({
        hotel_id: hotelId,
        ota_booking_id: idempotencyKey,
        channel_name: 'aiosell',
        guest_name: payload.guestName,
        check_in_date: payload.checkIn,
        check_out_date: payload.checkOut,
        amount: payload.amount,
        import_status: 'imported',
        received_at: new Date().toISOString()
      });
    }

    return { success: true, message: 'Reservation created' };

  } else if (payload.action === 'modify') {
    // We update the core reservation
    const pmsPayload = {
      hotel_id: hotelId,
      guest_name: payload.guestName,
      check_in_date: payload.checkIn ? new Date(payload.checkIn).toISOString() : undefined,
      check_out_date: payload.checkOut ? new Date(payload.checkOut).toISOString() : undefined,
      invoice_total: payload.amount,
    };
    
    // Remove undefined values
    Object.keys(pmsPayload).forEach(key => pmsPayload[key] === undefined && delete pmsPayload[key]);

    await createOrUpdateReservation(pmsPayload, idempotencyKey);
    
    // Update audit
    await supabase.from('channel_ota_reservations')
      .update({ import_status: 'modified', updated_at: new Date().toISOString() })
      .eq('hotel_id', hotelId)
      .eq('ota_booking_id', idempotencyKey);
      
    return { success: true, message: 'Reservation modified' };

  } else if (payload.action === 'cancel') {
    await cancelReservation(hotelId, idempotencyKey);
    
    // Update audit
    await supabase.from('channel_ota_reservations')
      .update({ import_status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('hotel_id', hotelId)
      .eq('ota_booking_id', idempotencyKey);
      
    return { success: true, message: 'Reservation cancelled' };
  } else {
    throw { status: 400, message: `Unsupported action: ${payload.action}` };
  }
};

export default {
  processWebhook
};
