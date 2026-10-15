import dotenv from 'dotenv';
dotenv.config();

import { supabaseServiceRole } from '../server/supabaseClient.js';

async function checkEvent() {
  const { data: event, error } = await supabaseServiceRole
    .from('booking_timeline')
    .select('*')
    .eq('id', 'a39a23d2-ca24-42ad-ab3b-a67c78b753e0')
    .single();

  console.log('Event details:', JSON.stringify(event, null, 2));

  // Also query all events in booking_timeline for Hotel Gopal
  const { data: allEvents } = await supabaseServiceRole
    .from('booking_timeline')
    .select('*')
    .eq('hotel_id', 'bd8f18de-2f97-48e7-b029-d2e536feb7cb');

  console.log(`\nAll ${allEvents?.length || 0} booking_timeline events for Hotel Gopal:`);
  for (const e of allEvents || []) {
    console.log(`  ID: ${e.id}, Type: ${e.event_type}, Amount: ${e.event_amount}, Mode: ${e.payment_mode}, ResId: ${e.reservation_id}, EntryId: ${e.entry_id}, Created: ${e.created_at}, Data: ${JSON.stringify(e.event_data)}`);
  }
}

checkEvent().catch(console.error);
