import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

let supabaseInstance = null;
export const getSupabase = () => {
  if (!supabaseInstance) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://mtfycmdoqzzyxhjmfvuv.supabase.co';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseKey) {
      throw new Error("VITE_SUPABASE_ANON_KEY is not set in environment variables");
    }
    // Using service role or anon key. In a real backend, we'd use SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
    // Given the constraints of the project, we'll use what's available.
    supabaseInstance = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseInstance;
};

/**
 * Creates or updates a reservation in the core PMS `reservations` table.
 * It strictly uses the core logic equivalent to `api-reservations.ts` but for the backend.
 */
export const createOrUpdateReservation = async (reservationData, externalId) => {
  const supabase = getSupabase();
  
  // 1. Check if it exists by internal_note/external_id or via a mapping
  // Since `reservations` lacks an `external_id`, we store it in `internal_note` formatted as `[AIOSELL_BOOKING_ID: {id}]`
  const idempotencyMarker = `[AIOSELL_BOOKING_ID: ${externalId}]`;
  
  const { data: existingReservations, error: searchError } = await supabase
    .from('reservations')
    .select('id, internal_note')
    .eq('hotel_id', reservationData.hotel_id)
    .like('internal_note', `%${idempotencyMarker}%`);
    
  if (searchError) {
    throw new Error(`Failed to query existing reservations: ${searchError.message}`);
  }

  const existing = existingReservations && existingReservations.length > 0 ? existingReservations[0] : null;

  if (existing) {
    // Modify existing
    const payload = { ...reservationData, internal_note: existing.internal_note }; // preserve note
    const { data, error } = await supabase
      .from('reservations')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
      
    if (error) throw new Error(`Failed to update reservation: ${error.message}`);
    return data;
  } else {
    // Create new
    const internalNote = reservationData.internal_note ? 
      `${reservationData.internal_note}\n${idempotencyMarker}` : idempotencyMarker;
      
    const payload = { ...reservationData, internal_note: internalNote };
    const { data, error } = await supabase
      .from('reservations')
      .insert(payload)
      .select('*')
      .single();
      
    if (error) throw new Error(`Failed to create reservation: ${error.message}`);
    return data;
  }
};

export const cancelReservation = async (hotelId, externalId) => {
  const supabase = getSupabase();
  const idempotencyMarker = `[AIOSELL_BOOKING_ID: ${externalId}]`;
  
  const { data: existingReservations } = await supabase
    .from('reservations')
    .select('id')
    .eq('hotel_id', hotelId)
    .like('internal_note', `%${idempotencyMarker}%`);
    
  const existing = existingReservations && existingReservations.length > 0 ? existingReservations[0] : null;
  if (!existing) {
    // Not found, maybe throw or return silently?
    return null;
  }
  
  const { data, error } = await supabase
    .from('reservations')
    .update({ status: 'cancelled' })
    .eq('id', existing.id)
    .select('*')
    .single();
    
  if (error) throw new Error(`Failed to cancel reservation: ${error.message}`);
  return data;
};

export default {
  getSupabase,
  createOrUpdateReservation,
  cancelReservation
};
