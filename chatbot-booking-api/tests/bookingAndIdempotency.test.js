import test from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import {
  createBookingAttempt,
  getBookingByReference,
  generateGuestAccessToken,
  verifyGuestAccessToken,
} from '../src/services/bookingService.js';
import { generateServerQuote } from '../src/services/quoteEngine.js';
import { setConfiguredHotelForTesting } from '../src/services/hotelConfigService.js';
import { supabase } from '../src/db/supabase.js';

test('Booking & Idempotency: Lifecycle, Validation & Replay Protection', async (t) => {
  const hotelId = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb'; // Hotel Gopal
  setConfiguredHotelForTesting({ id: hotelId, hotel_name: 'Hotel Gopal', is_active: true });

  const testIdsToCleanup = [];

  t.after(async () => {
    if (testIdsToCleanup.length > 0) {
      await supabase.from('reservations').delete().in('id', testIdsToCleanup);
    }
  });

  // 1. Fetch real category for Hotel Gopal
  const { data: cats } = await supabase
    .from('room_categories')
    .select('id, name')
    .eq('hotel_id', hotelId)
    .eq('is_active', true)
    .limit(1);

  const testCategory = cats && cats.length > 0 ? cats[0] : null;
  assert.ok(testCategory, 'Hotel Gopal must have at least one active room category');

  // Generate valid server quote
  const quote = await generateServerQuote({
    categoryId: testCategory.id,
    checkIn: '2029-07-10',
    checkOut: '2029-07-12',
    rooms: 1,
    adults: 2,
  });

  const testIdempKey = `IDEMP-TEST-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  let createdReference = null;
  let createdGuestToken = null;

  await t.test('rejects booking attempt with missing or invalid guest details', async () => {
    // Missing guest name
    await assert.rejects(
      async () => {
        await createBookingAttempt({
          quoteToken: quote.quoteToken,
          guestName: '',
          guestPhone: '+919999999999',
          guestEmail: 'test@example.com',
          idempotencyKey: 'IDEMP-FAIL-1',
        });
      },
      {
        code: 'GUEST_NAME_REQUIRED',
      }
    );

    // Invalid email
    await assert.rejects(
      async () => {
        await createBookingAttempt({
          quoteToken: quote.quoteToken,
          guestName: 'John Doe',
          guestPhone: '+919999999999',
          guestEmail: 'not-an-email',
          idempotencyKey: 'IDEMP-FAIL-2',
        });
      },
      {
        code: 'GUEST_EMAIL_REQUIRED',
      }
    );
  });

  await t.test('successfully creates a durable booking attempt and inventory hold', async () => {
    const res = await createBookingAttempt({
      quoteToken: quote.quoteToken,
      guestName: 'Chatbot Automated Test Guest',
      guestPhone: '+919876543210',
      guestEmail: 'chatbot-test@example.com',
      guestAddress: '123 Test Street, Dwarka',
      specialRequests: 'Quiet room on upper floor',
      idempotencyKey: testIdempKey,
    });

    assert.ok(res.bookingReference.startsWith('HM-BKG-'));
    assert.strictEqual(res.status, 'pending_payment');
    assert.ok(res.holdExpiresAt);
    assert.ok(res.guestToken);
    assert.strictEqual(res.idempotent, false);
    assert.strictEqual(res.stay.nights, 2);

    createdReference = res.bookingReference;
    createdGuestToken = res.guestToken;

    // Track for cleanup
    const { data: dbResv } = await supabase
      .from('reservations')
      .select('id')
      .eq('hotel_id', hotelId)
      .ilike('internal_note', `%${createdReference}%`)
      .limit(1);

    if (dbResv && dbResv[0]) {
      testIdsToCleanup.push(dbResv[0].id);
    }
  });

  await t.test('idempotency: retrying with the same key and same payload returns original booking', async () => {
    const res = await createBookingAttempt({
      quoteToken: quote.quoteToken,
      guestName: 'Chatbot Automated Test Guest',
      guestPhone: '+919876543210',
      guestEmail: 'chatbot-test@example.com',
      guestAddress: '123 Test Street, Dwarka',
      specialRequests: 'Quiet room on upper floor',
      idempotencyKey: testIdempKey, // Same key
    });

    assert.strictEqual(res.bookingReference, createdReference);
    assert.strictEqual(res.idempotent, true);
  });

  await t.test('guest lookup: GET /v1/public/bookings/:reference retrieves safe details with guestToken', async () => {
    const details = await getBookingByReference({
      bookingReference: createdReference,
      guestToken: createdGuestToken,
    });

    assert.strictEqual(details.bookingReference, createdReference);
    assert.strictEqual(details.stay.checkIn, '2029-07-10');
    assert.strictEqual(details.stay.checkOut, '2029-07-12');
    assert.strictEqual(details.stay.nights, 2);
    assert.strictEqual(details.paymentStatus, 'PENDING');
    assert.strictEqual(details.nextAction, 'COMPLETE_PAYMENT');

    // Ensure no internal DB columns, staff notes, or secrets are returned
    assert.strictEqual(details.id, undefined);
    assert.strictEqual(details.internal_note, undefined);
    assert.strictEqual(details.hotel_id, undefined);
  });

  await t.test('guest lookup: rejects unauthenticated or forged token', async () => {
    // Missing token
    await assert.rejects(
      async () => {
        await getBookingByReference({
          bookingReference: createdReference,
          guestToken: null,
        });
      },
      {
        code: 'GUEST_TOKEN_MISSING',
      }
    );

    // Forged token
    await assert.rejects(
      async () => {
        await getBookingByReference({
          bookingReference: createdReference,
          guestToken: 'forged.token.here',
        });
      },
      {
        code: 'GUEST_TOKEN_MALFORMED',
      }
    );
  });
});
