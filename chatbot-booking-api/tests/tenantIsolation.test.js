import test from 'node:test';
import assert from 'node:assert';
import {
  getConfiguredHotelId,
  assertHotelOwnership,
  setConfiguredHotelForTesting,
} from '../src/services/hotelConfigService.js';
import { resolveAuthoritativeRate } from '../src/services/quoteEngine.js';
import { getBookingByReference, generateGuestAccessToken } from '../src/services/bookingService.js';

test('TenantIsolation: Single-Hotel Enforcement & Cross-Tenant Rejection', async (t) => {
  const HOTEL_A = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb'; // Hotel Gopal (Authorized)
  const HOTEL_B = '9001eb1c-9d38-49d0-84f7-75244e8f4bf8'; // Mars Hotel (Foreign)

  setConfiguredHotelForTesting({ id: HOTEL_A, hotel_name: 'Hotel Gopal', is_active: true });

  await t.test('assertHotelOwnership permits resources belonging to configured hotel', () => {
    assert.doesNotThrow(() => {
      assertHotelOwnership(HOTEL_A);
    });
  });

  await t.test('assertHotelOwnership rejects foreign hotel ID with 403 Forbidden', () => {
    assert.throws(
      () => {
        assertHotelOwnership(HOTEL_B);
      },
      {
        status: 403,
        code: 'CROSS_HOTEL_FORBIDDEN',
      }
    );
  });

  await t.test('quote engine rejects category belonging to another hotel', async () => {
    // Attempting to quote using a random UUID or category from Hotel B under Hotel A context
    const foreignCategoryId = '00000000-0000-0000-0000-000000000000';

    await assert.rejects(
      async () => {
        await resolveAuthoritativeRate({
          hotelId: HOTEL_A,
          categoryId: foreignCategoryId,
        });
      },
      {
        status: 404,
        code: 'CATEGORY_NOT_FOUND',
      }
    );
  });

  await t.test('guest token issued for Hotel B cannot access Hotel A booking', async () => {
    const foreignToken = generateGuestAccessToken({
      bookingReference: 'HM-BKG-TEST1',
      hotelId: HOTEL_B, // Issued for Hotel B
    });

    await assert.rejects(
      async () => {
        await getBookingByReference({
          bookingReference: 'HM-BKG-TEST1',
          guestToken: foreignToken,
        });
      },
      {
        status: 403,
        code: 'GUEST_TOKEN_HOTEL_MISMATCH',
      }
    );
  });

  await t.test('guest token for Booking 1 cannot access Booking 2 (booking scoping)', async () => {
    const tokenBooking1 = generateGuestAccessToken({
      bookingReference: 'HM-BKG-BOOKING1',
      hotelId: HOTEL_A,
    });

    await assert.rejects(
      async () => {
        await getBookingByReference({
          bookingReference: 'HM-BKG-BOOKING2', // Attacker probes Booking 2 with Booking 1's token
          guestToken: tokenBooking1,
        });
      },
      {
        status: 403,
        code: 'GUEST_TOKEN_REF_MISMATCH',
      }
    );
  });
});
