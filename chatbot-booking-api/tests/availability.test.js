import test from 'node:test';
import assert from 'node:assert';
import {
  getPublicRoomCategories,
  checkLiveAvailability,
  isStayOverlapping,
} from '../src/services/availabilityService.js';
import { setConfiguredHotelForTesting } from '../src/services/hotelConfigService.js';

test('Availability: Stay Overlap Rules & Half-Open Interval Semantics', async (t) => {
  await t.test('half-open stay interval: adjacent turnover dates do NOT overlap', () => {
    // Stay A: Oct 10 to Oct 12 (departs Oct 12 morning)
    // Stay B: Oct 12 to Oct 15 (arrives Oct 12 afternoon)
    // Turnover date Oct 12 is shared but they do not overlap
    assert.strictEqual(isStayOverlapping('2026-10-10', '2026-10-12', '2026-10-12', '2026-10-15'), false);
    assert.strictEqual(isStayOverlapping('2026-10-12', '2026-10-15', '2026-10-10', '2026-10-12'), false);
  });

  await t.test('overlapping stays are detected correctly', () => {
    // Stay A: Oct 10 to Oct 14
    // Stay B: Oct 12 to Oct 16 (overlaps on Oct 12, Oct 13)
    assert.strictEqual(isStayOverlapping('2026-10-10', '2026-10-14', '2026-10-12', '2026-10-16'), true);
  });

  await t.test('stay entirely enclosed inside another stay is detected as overlap', () => {
    // Stay A: Oct 10 to Oct 20
    // Stay B: Oct 12 to Oct 15
    assert.strictEqual(isStayOverlapping('2026-10-10', '2026-10-20', '2026-10-12', '2026-10-15'), true);
    assert.strictEqual(isStayOverlapping('2026-10-12', '2026-10-15', '2026-10-10', '2026-10-20'), true);
  });
});

test('Availability: Public Room Categories & Live Search', async (t) => {
  const hotelId = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb'; // Hotel Gopal
  setConfiguredHotelForTesting({ id: hotelId, hotel_name: 'Hotel Gopal', is_active: true });

  await t.test('getPublicRoomCategories returns real categories from database', async () => {
    const cats = await getPublicRoomCategories();
    assert.ok(Array.isArray(cats));
    assert.ok(cats.length > 0, 'Configured hotel must have active categories');

    const first = cats[0];
    assert.ok(first.categoryId);
    assert.ok(first.name);
    assert.ok(first.capacity);
    assert.ok(first.pricing);
    // Ensure no internal DB fields or secrets are exposed
    assert.strictEqual(first.internal_notes, undefined);
    assert.strictEqual(first.admin_email, undefined);
  });

  await t.test('checkLiveAvailability rejects invalid date formats', async () => {
    await assert.rejects(
      async () => {
        await checkLiveAvailability({
          checkIn: 'invalid-date',
          checkOut: '2026-11-05',
        });
      },
      {
        code: 'INVALID_DATE_FORMAT',
      }
    );
  });

  await t.test('checkLiveAvailability rejects checkout before checkin', async () => {
    await assert.rejects(
      async () => {
        await checkLiveAvailability({
          checkIn: '2026-11-10',
          checkOut: '2026-11-05',
        });
      },
      {
        code: 'INVALID_STAY_DATES',
      }
    );
  });

  await t.test('checkLiveAvailability returns available room counts for valid dates', async () => {
    const avail = await checkLiveAvailability({
      checkIn: '2029-05-10',
      checkOut: '2029-05-13',
      rooms: 1,
    });

    assert.strictEqual(avail.stay.checkIn, '2029-05-10');
    assert.strictEqual(avail.stay.checkOut, '2029-05-13');
    assert.strictEqual(avail.stay.nights, 3);
    assert.ok(Array.isArray(avail.categories));
    assert.ok(avail.categories.length > 0);

    const cat = avail.categories[0];
    assert.ok(typeof cat.availableRooms === 'number');
    assert.ok(typeof cat.totalRooms === 'number');
    assert.ok(typeof cat.isAvailable === 'boolean');
  });
});
