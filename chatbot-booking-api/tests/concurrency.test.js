import test from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { createBookingAttempt } from '../src/services/bookingService.js';
import { generateServerQuote } from '../src/services/quoteEngine.js';
import { setConfiguredHotelForTesting } from '../src/services/hotelConfigService.js';
import { supabase } from '../src/db/supabase.js';

test('Concurrency: Simultaneous Competing Booking Attempts', async (t) => {
  const hotelId = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb'; // Hotel Gopal
  setConfiguredHotelForTesting({ id: hotelId, hotel_name: 'Hotel Gopal', is_active: true });

  const testIdsToCleanup = [];

  // Pre-cleanup in case a previous run was interrupted
  await supabase
    .from('reservations')
    .delete()
    .eq('hotel_id', hotelId)
    .eq('check_in_date', '2029-11-20');

  t.after(async () => {
    if (testIdsToCleanup.length > 0) {
      await supabase.from('reservations').delete().in('id', testIdsToCleanup);
    }
  });

  // Find a category with limited rooms (e.g. Suite AC has 2 rooms)
  const { data: cats } = await supabase
    .from('room_categories')
    .select('id, name')
    .eq('hotel_id', hotelId)
    .ilike('name', '%Suite%')
    .limit(1);

  const suiteCat = cats && cats.length > 0 ? cats[0] : null;
  assert.ok(suiteCat, 'Hotel Gopal Suite category must exist');

  // Query physical rooms for Suite
  const { data: suiteRooms } = await supabase
    .from('rooms')
    .select('id, room_no')
    .eq('hotel_id', hotelId)
    .eq('category_id', suiteCat.id)
    .eq('is_active', true);

  const roomCount = suiteRooms ? suiteRooms.length : 0;
  assert.ok(roomCount > 0, 'Suite category must have physical rooms');

  const checkIn = '2029-11-20';
  const checkOut = '2029-11-22';

  // 1. First, book (roomCount - 1) rooms so exactly 1 room remains available
  const quotePreFill = await generateServerQuote({
    categoryId: suiteCat.id,
    checkIn,
    checkOut,
    rooms: Math.max(1, roomCount - 1),
    adults: 2,
  });

  const preFillRes = await createBookingAttempt({
    quoteToken: quotePreFill.quoteToken,
    guestName: 'PreFill Guest',
    guestPhone: '+919999900001',
    guestEmail: 'prefill@example.com',
    idempotencyKey: `IDEMP-PREFILL-${Date.now()}`,
  });

  // Track for cleanup
  const { data: prefillDb } = await supabase
    .from('reservations')
    .select('id')
    .eq('hotel_id', hotelId)
    .ilike('internal_note', `%${preFillRes.bookingReference}%`);
  if (prefillDb) {
    for (const r of prefillDb) testIdsToCleanup.push(r.id);
  }

  // 2. Now exactly 1 room remains. Generate two identical quotes for competing callers.
  const quoteRace1 = await generateServerQuote({
    categoryId: suiteCat.id,
    checkIn,
    checkOut,
    rooms: 1,
    adults: 2,
  });

  const quoteRace2 = await generateServerQuote({
    categoryId: suiteCat.id,
    checkIn,
    checkOut,
    rooms: 1,
    adults: 2,
  });

  // 3. Fire both booking requests concurrently at the exact same millisecond
  const idemp1 = `RACE-KEY-1-${crypto.randomBytes(3).toString('hex')}`;
  const idemp2 = `RACE-KEY-2-${crypto.randomBytes(3).toString('hex')}`;

  const [res1, res2] = await Promise.allSettled([
    createBookingAttempt({
      quoteToken: quoteRace1.quoteToken,
      guestName: 'Concurrent Racer A',
      guestPhone: '+919888800001',
      guestEmail: 'racerA@example.com',
      idempotencyKey: idemp1,
    }),
    createBookingAttempt({
      quoteToken: quoteRace2.quoteToken,
      guestName: 'Concurrent Racer B',
      guestPhone: '+919888800002',
      guestEmail: 'racerB@example.com',
      idempotencyKey: idemp2,
    }),
  ]);

  const successes = [res1, res2].filter((r) => r.status === 'fulfilled');
  const rejections = [res1, res2].filter((r) => r.status === 'rejected');

  // Verify that only 1 succeeded and 1 was rejected with conflict
  assert.strictEqual(successes.length, 1, 'Exactly one concurrent booking attempt must succeed');
  assert.strictEqual(rejections.length, 1, 'The competing concurrent booking attempt must be rejected');

  const winner = successes[0].value;
  const loserErr = rejections[0].reason;

  assert.ok(winner.bookingReference);
  assert.ok(
    loserErr.code === 'CATEGORY_CAPACITY_EXCEEDED' ||
    loserErr.code === 'ROOM_ALREADY_BOOKED' ||
    loserErr.code === 'CAPACITY_EXCEEDED',
    `Expected conflict error code, got: ${loserErr.code}`
  );

  // Track winner for cleanup
  const { data: winnerDb } = await supabase
    .from('reservations')
    .select('id')
    .eq('hotel_id', hotelId)
    .ilike('internal_note', `%${winner.bookingReference}%`);
  if (winnerDb) {
    for (const r of winnerDb) testIdsToCleanup.push(r.id);
  }
});
