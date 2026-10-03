import assert from 'assert';
import express from 'express';
import cors from 'cors';
import { supabaseServiceRole } from '../server/supabaseClient.js';
import channelRoutes from '../server/routes/channels.js';
import {
  normalizeToISODate,
  addDays,
  daysBetween,
  getBulkKey,
  parseBulkKey,
  mergeBulkDraft,
  removeDraftItem,
  clearDraft,
  buildPatchListFromDraft,
  summarizeDraft,
} from '../src/lib/bulkUpdateDraft.ts';

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c';
const SUITE_ID = '9e82c94b-bfc0-4c86-94f9-940b3df4769f';
const DELUXE_ID = 'ca773df6-63e4-43ed-963b-05bbc2494499';
const FOURBED_ID = 'b2b5b71b-72e5-494f-a906-824b87dfd88b';

/** All calendar dates used by any backend test suite */
const ALL_TEST_DATES = [
  '2026-12-20', '2026-12-21', '2026-12-22', '2026-12-23',
  '2026-12-24', '2026-12-25', '2026-12-26', '2026-12-27',
  '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31',
  '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04', '2027-01-05',
];

/**
 * Create the three test room categories in the database for HOTEL_ID.
 * Uses upsert with ignoreDuplicates so repeated runs are safe.
 */
async function setupTestFixtures() {
  // Allow the async signInWithPassword elevation in supabaseClient to complete
  // (needs ~5s to resolve in practice when SUPABASE_SERVICE_ROLE_KEY is absent)
  await new Promise(r => setTimeout(r, 5500));
  const cats = [
    { id: SUITE_ID, hotel_id: HOTEL_ID, name: '[TEST] Suite', sort_order: 0, is_active: true },
    { id: DELUXE_ID, hotel_id: HOTEL_ID, name: '[TEST] Deluxe', sort_order: 1, is_active: true },
    { id: FOURBED_ID, hotel_id: HOTEL_ID, name: '[TEST] Fourbed', sort_order: 2, is_active: true },
  ];
  const { error } = await supabaseServiceRole
    .from('room_categories')
    .upsert(cats, { onConflict: 'id', ignoreDuplicates: false });
  if (error) {
    console.error('[setupTestFixtures] Could not create test room categories:', error.message);
    throw error;
  }
  console.log('  [setup] Test room categories created for Hotel Gopal (test fixtures).');
}

/**
 * Remove test room categories and all their inventory rows.
 * Runs in teardown so test data never leaks into production.
 */
async function cleanupTestFixtures() {
  const testIds = [SUITE_ID, DELUXE_ID, FOURBED_ID];
  await supabaseServiceRole
    .from('channel_inventory_restrictions')
    .delete()
    .eq('hotel_id', HOTEL_ID)
    .in('room_category_id', testIds);
  await supabaseServiceRole
    .from('room_categories')
    .delete()
    .in('id', testIds);
  console.log('  [teardown] Test room categories and inventory rows removed.');
}


let testServer;
let testPort = 5000;

async function setupServer() {
  testPort = 5123;
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: 'test-user-id', email: 'test@hotel.com' };
    req.auth = { userId: 'test-user-id', role: 'hotel_admin', hotelId: HOTEL_ID, hotel: { id: HOTEL_ID } };
    req.hotelId = HOTEL_ID;
    req.userRole = 'hotel_admin';
    req.requestId = `TEST-${Date.now()}`;
    next();
  });
  app.use('/api/channels', channelRoutes);

  await new Promise((resolve) => {
    testServer = app.listen(testPort, () => {
      resolve();
    });
  });
}

async function sendPatch(patches, skipSync = true) {
  const res = await fetch(`http://localhost:${testPort}/api/channels/inventory-restrictions/patch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hotel-id': HOTEL_ID,
    },
    body: JSON.stringify({ patches, skipSync }),
  });
  return res.json();
}

async function runTests() {
  console.log('===============================================================');
  console.log('      HOTEL MANTRI MASTER FORENSIC VERIFICATION SUITE         ');
  console.log('===============================================================\n');

  await setupServer();

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(e);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(e);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SUITE 1: Frontend Draft Accumulation & Immutability
  // ─────────────────────────────────────────────────────────────
  console.log('--- SUITE 1: Frontend Draft Accumulation & Immutability ---');

  test('Test A: Multiple dates accumulate without erasing previous entries', () => {
    let draft = {};
    const key1 = getBulkKey(HOTEL_ID, '2026-12-20', SUITE_ID);
    const key2 = getBulkKey(HOTEL_ID, '2026-12-21', SUITE_ID);
    const key3 = getBulkKey(HOTEL_ID, '2026-12-22', SUITE_ID);

    draft = mergeBulkDraft(draft, { [key1]: { baseRate: 13500 } });
    assert.strictEqual(draft[key1]?.baseRate, 13500);

    draft = mergeBulkDraft(draft, { [key2]: { baseRate: 14000 } });
    assert.strictEqual(draft[key1]?.baseRate, 13500, 'Previous date 20 Dec was wiped out!');
    assert.strictEqual(draft[key2]?.baseRate, 14000);

    draft = mergeBulkDraft(draft, { [key3]: { baseRate: 14500 } });
    assert.strictEqual(draft[key1]?.baseRate, 13500);
    assert.strictEqual(draft[key2]?.baseRate, 14000);
    assert.strictEqual(draft[key3]?.baseRate, 14500);
    assert.strictEqual(Object.keys(draft).length, 3);
  });

  test('Test B: Setting Base Rate then Availability preserves BOTH values', () => {
    let draft = {};
    const key = getBulkKey(HOTEL_ID, '2026-12-20', SUITE_ID);

    draft = mergeBulkDraft(draft, { [key]: { baseRate: 15000 } });
    assert.strictEqual(draft[key]?.baseRate, 15000);
    assert.strictEqual(draft[key]?.availability, undefined);

    draft = mergeBulkDraft(draft, { [key]: { availability: 1 } });
    assert.strictEqual(draft[key]?.baseRate, 15000, 'Base rate was wiped when availability was set!');
    assert.strictEqual(draft[key]?.availability, 1, 'Availability was not stored!');
  });

  test('Test C: Setting Availability then Base Rate preserves BOTH values', () => {
    let draft = {};
    const key = getBulkKey(HOTEL_ID, '2026-12-20', DELUXE_ID);

    draft = mergeBulkDraft(draft, { [key]: { availability: 2 } });
    assert.strictEqual(draft[key]?.availability, 2);
    assert.strictEqual(draft[key]?.baseRate, undefined);

    draft = mergeBulkDraft(draft, { [key]: { baseRate: 8000 } });
    assert.strictEqual(draft[key]?.availability, 2, 'Availability was wiped when rate was set!');
    assert.strictEqual(draft[key]?.baseRate, 8000);
  });

  test('Test D: Multiple room category updates do not collide', () => {
    let draft = {};
    const kSuite = getBulkKey(HOTEL_ID, '2026-12-20', SUITE_ID);
    const kDeluxe = getBulkKey(HOTEL_ID, '2026-12-20', DELUXE_ID);
    const kFourbed = getBulkKey(HOTEL_ID, '2026-12-20', FOURBED_ID);

    draft = mergeBulkDraft(draft, { [kSuite]: { baseRate: 15000 } });
    draft = mergeBulkDraft(draft, { [kDeluxe]: { baseRate: 8000 } });
    draft = mergeBulkDraft(draft, { [kFourbed]: { baseRate: 9500 } });

    assert.strictEqual(Object.keys(draft).length, 3);
    assert.strictEqual(draft[kSuite]?.baseRate, 15000);
    assert.strictEqual(draft[kDeluxe]?.baseRate, 8000);
    assert.strictEqual(draft[kFourbed]?.baseRate, 9500);
  });

  test('Test E: Full range rate update followed by sub-range availability', () => {
    let draft = {};
    const dates = ['2026-12-20', '2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25'];

    const step1Updates = {};
    for (const d of dates) {
      step1Updates[getBulkKey(HOTEL_ID, d, SUITE_ID)] = { baseRate: 12000 };
    }
    draft = mergeBulkDraft(draft, step1Updates);

    const step2Updates = {};
    for (const d of ['2026-12-22', '2026-12-23', '2026-12-24']) {
      step2Updates[getBulkKey(HOTEL_ID, d, SUITE_ID)] = { availability: 3 };
    }
    draft = mergeBulkDraft(draft, step2Updates);

    assert.strictEqual(draft[getBulkKey(HOTEL_ID, '2026-12-20', SUITE_ID)]?.baseRate, 12000);
    assert.strictEqual(draft[getBulkKey(HOTEL_ID, '2026-12-20', SUITE_ID)]?.availability, undefined);
    assert.strictEqual(draft[getBulkKey(HOTEL_ID, '2026-12-22', SUITE_ID)]?.baseRate, 12000, 'Sub-range wiped rate on 22 Dec!');
    assert.strictEqual(draft[getBulkKey(HOTEL_ID, '2026-12-22', SUITE_ID)]?.availability, 3);
    assert.strictEqual(draft[getBulkKey(HOTEL_ID, '2026-12-24', SUITE_ID)]?.baseRate, 12000);
    assert.strictEqual(draft[getBulkKey(HOTEL_ID, '2026-12-24', SUITE_ID)]?.availability, 3);
    assert.strictEqual(draft[getBulkKey(HOTEL_ID, '2026-12-25', SUITE_ID)]?.baseRate, 12000);
    assert.strictEqual(draft[getBulkKey(HOTEL_ID, '2026-12-25', SUITE_ID)]?.availability, undefined);
  });

  test('Test F: Restriction updates leave rates and availability untouched', () => {
    let draft = {};
    const key = getBulkKey(HOTEL_ID, '2026-12-20', SUITE_ID);
    draft = mergeBulkDraft(draft, { [key]: { baseRate: 15000, availability: 2 } });
    draft = mergeBulkDraft(draft, { [key]: { stopSell: true, minStay: 2 } });

    assert.strictEqual(draft[key]?.baseRate, 15000);
    assert.strictEqual(draft[key]?.availability, 2);
    assert.strictEqual(draft[key]?.stopSell, true);
    assert.strictEqual(draft[key]?.minStay, 2);
  });

  test('Test G: Rapid edits on same cell converge to final value', () => {
    let draft = {};
    const key = getBulkKey(HOTEL_ID, '2026-12-20', SUITE_ID);
    draft = mergeBulkDraft(draft, { [key]: { baseRate: 10000 } });
    draft = mergeBulkDraft(draft, { [key]: { baseRate: 11000 } });
    draft = mergeBulkDraft(draft, { [key]: { baseRate: 12000 } });
    assert.strictEqual(draft[key]?.baseRate, 12000);
  });

  test('Test H: Item removal removes only target item and clearDraft resets all', () => {
    let draft = {};
    const k1 = getBulkKey(HOTEL_ID, '2026-12-20', SUITE_ID);
    const k2 = getBulkKey(HOTEL_ID, '2026-12-21', SUITE_ID);
    draft = mergeBulkDraft(draft, { [k1]: { baseRate: 10000 }, [k2]: { baseRate: 11000 } });

    draft = removeDraftItem(draft, k1);
    assert.strictEqual(draft[k1], undefined);
    assert.strictEqual(draft[k2]?.baseRate, 11000);

    draft = clearDraft();
    assert.deepStrictEqual(draft, {});
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 2: Date Range Generation & Timezone Isolation
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 2: Date Range Generation & Timezone Isolation ---');

  test('Date Test 1: December 20 to 31 generates exactly 12 dates (no 19 Dec, no 01 Jan)', () => {
    const days = daysBetween('2026-12-20', '2026-12-31');
    assert.strictEqual(days.length, 12, `Expected 12 dates, got ${days.length}`);
    assert.strictEqual(days[0], '2026-12-20');
    assert.strictEqual(days[11], '2026-12-31');
    assert.ok(!days.includes('2026-12-19'), 'Contained 19 Dec!');
    assert.ok(!days.includes('2027-01-01'), 'Contained 01 Jan!');
  });

  test('Date Test 2: DD-MM-YYYY format input (20-12-2026 to 31-12-2026) generates exact 12 dates', () => {
    const days = daysBetween('20-12-2026', '31-12-2026');
    assert.strictEqual(days.length, 12);
    assert.strictEqual(days[0], '2026-12-20');
    assert.strictEqual(days[11], '2026-12-31');
  });

  test('Date Test 3: Cross-Year Boundary (28-12-2026 to 05-01-2027) generates exactly 9 dates', () => {
    const days = daysBetween('2026-12-28', '2027-01-05');
    assert.strictEqual(days.length, 9);
    assert.deepStrictEqual(days, [
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31',
      '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04', '2027-01-05'
    ]);
  });

  test('Date Test 4: Single day range returns exactly 1 date', () => {
    const days = daysBetween('2026-12-20', '2026-12-20');
    assert.strictEqual(days.length, 1);
    assert.strictEqual(days[0], '2026-12-20');
  });

  test('Date Test 5: Inverted date range (fromDate > toDate) returns empty array', () => {
    const days = daysBetween('2026-12-31', '2026-12-20');
    assert.strictEqual(days.length, 0);
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 3: Backend Non-Destructive PATCH Semantics
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 3: Backend Non-Destructive PATCH Semantics ---');

  // Create test fixtures (room categories must exist in DB for backend to accept them)
  await setupTestFixtures();

  // Wipe ALL inventory rows for the test dates / test categories to guarantee clean state
  await supabaseServiceRole
    .from('channel_inventory_restrictions')
    .delete()
    .eq('hotel_id', HOTEL_ID)
    .in('room_category_id', [SUITE_ID, DELUXE_ID, FOURBED_ID])
    .in('date', ALL_TEST_DATES);

  await testAsync('Test J: Rate-only patch persists baseRate and leaves availability NULL', async () => {
    const res = await sendPatch([{
      hotelId: HOTEL_ID,
      roomCategoryId: SUITE_ID,
      date: '2026-12-20',
      baseRate: 13500,
    }]);
    assert.strictEqual(res.success, true);

    const { data } = await supabaseServiceRole
      .from('channel_inventory_restrictions')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .eq('room_category_id', SUITE_ID)
      .eq('date', '2026-12-20')
      .single();

    assert.strictEqual(Number(data.base_rate), 13500);
    assert.strictEqual(data.availability, null, 'Availability defaulted to 0 instead of NULL on brand new rate!');
    assert.ok(data.id, 'Record missing database-generated UUID');
  });

  await testAsync('Test K: Subsequent Availability patch preserves existing baseRate', async () => {
    const res = await sendPatch([{
      hotelId: HOTEL_ID,
      roomCategoryId: SUITE_ID,
      date: '2026-12-20',
      availability: 1,
    }]);
    assert.strictEqual(res.success, true);

    const { data } = await supabaseServiceRole
      .from('channel_inventory_restrictions')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .eq('room_category_id', SUITE_ID)
      .eq('date', '2026-12-20')
      .single();

    assert.strictEqual(Number(data.base_rate), 13500, 'Base rate was wiped when setting availability!');
    assert.strictEqual(Number(data.availability), 1);
  });

  await testAsync('Test L: Subsequent Rate update preserves existing availability', async () => {
    const res = await sendPatch([{
      hotelId: HOTEL_ID,
      roomCategoryId: SUITE_ID,
      date: '2026-12-20',
      baseRate: 15000,
    }]);
    assert.strictEqual(res.success, true);

    const { data } = await supabaseServiceRole
      .from('channel_inventory_restrictions')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .eq('room_category_id', SUITE_ID)
      .eq('date', '2026-12-20')
      .single();

    assert.strictEqual(Number(data.base_rate), 15000);
    assert.strictEqual(Number(data.availability), 1, 'Availability was destroyed when updating rate!');
  });

  await testAsync('Test M: Restriction update preserves both Rate and Availability', async () => {
    const res = await sendPatch([{
      hotelId: HOTEL_ID,
      roomCategoryId: SUITE_ID,
      date: '2026-12-20',
      minStay: 3,
      stopSell: false,
    }]);
    assert.strictEqual(res.success, true);

    const { data } = await supabaseServiceRole
      .from('channel_inventory_restrictions')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .eq('room_category_id', SUITE_ID)
      .eq('date', '2026-12-20')
      .single();

    assert.strictEqual(Number(data.base_rate), 15000, 'Base rate was wiped by restriction update!');
    assert.strictEqual(Number(data.availability), 1, 'Availability was wiped by restriction update!');
    assert.strictEqual(Number(data.min_stay), 3);
    assert.strictEqual(data.stop_sell, false);
  });

  await testAsync('Test N: Empty patch returns successfully with updatedCount = 0', async () => {
    const res = await sendPatch([]);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.updatedCount, 0);
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 4: December 20-31 Mixed Existing + Missing Records & ID Integrity
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 4: December 20-31 Mixed Existing + Missing Records & ID Integrity ---');

  const decDates = daysBetween('2026-12-20', '2026-12-31');

  // Clean all 12 dates first
  await supabaseServiceRole
    .from('channel_inventory_restrictions')
    .delete()
    .eq('hotel_id', HOTEL_ID)
    .in('date', decDates);

  // Pre-seed 2 dates (24 and 25 Dec) to simulate existing records
  const { data: seed24 } = await supabaseServiceRole
    .from('channel_inventory_restrictions')
    .insert({
      hotel_id: HOTEL_ID,
      room_category_id: SUITE_ID,
      date: '2026-12-24',
      base_rate: 11000,
      availability: 5,
    })
    .select()
    .single();

  const { data: seed25 } = await supabaseServiceRole
    .from('channel_inventory_restrictions')
    .insert({
      hotel_id: HOTEL_ID,
      room_category_id: SUITE_ID,
      date: '2026-12-25',
      base_rate: 11500,
      availability: 4,
    })
    .select()
    .single();

  const originalId24 = seed24.id;
  const originalId25 = seed25.id;
  assert.ok(originalId24 && originalId25, 'Seed rows failed to generate IDs');

  await testAsync('December 20–31 (12 days) Bulk Update with mixed missing + existing rows', async () => {
    // Construct 12 patches: updates 20 Dec to 31 Dec
    const patches = decDates.map((date) => ({
      hotelId: HOTEL_ID,
      roomCategoryId: SUITE_ID,
      date,
      baseRate: 14000,
      availability: 2,
    }));

    const result = await sendPatch(patches);
    assert.strictEqual(result.success, true, `Backend failed: ${JSON.stringify(result.error)}`);
    assert.strictEqual(result.updatedCount, 12, 'Expected 12 records updated');

    // Query database for all 12 dates
    const { data: rows, error: qErr } = await supabaseServiceRole
      .from('channel_inventory_restrictions')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .eq('room_category_id', SUITE_ID)
      .in('date', decDates);

    assert.strictEqual(qErr, null);
    assert.strictEqual(rows.length, 12, 'Expected exactly 12 records in database');

    // Verify 0 null IDs
    const nullIdRows = rows.filter((r) => !r.id);
    assert.strictEqual(nullIdRows.length, 0, 'Found rows with NULL id in database!');

    // Verify existing rows kept their exact primary key UUIDs
    const row24 = rows.find((r) => r.date === '2026-12-24');
    const row25 = rows.find((r) => r.date === '2026-12-25');
    assert.strictEqual(row24.id, originalId24, 'Row 2026-12-24 primary key changed on update!');
    assert.strictEqual(row25.id, originalId25, 'Row 2026-12-25 primary key changed on update!');

    // Verify newly inserted rows have valid UUIDs
    const row20 = rows.find((r) => r.date === '2026-12-20');
    assert.ok(row20.id && row20.id.length > 20, 'Newly inserted row 2026-12-20 has invalid ID');
    assert.strictEqual(Number(row20.base_rate), 14000);
    assert.strictEqual(Number(row20.availability), 2);
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 5: Cross-Month and Cross-Year Boundary Test
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 5: Cross-Month and Cross-Year Boundary Test ---');

  const crossYearDates = ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'];
  await supabaseServiceRole
    .from('channel_inventory_restrictions')
    .delete()
    .eq('hotel_id', HOTEL_ID)
    .in('date', crossYearDates);

  await testAsync('Cross-Year (30 Dec 2026 -> 02 Jan 2027): Saves across year boundary without year shift', async () => {
    const patches = crossYearDates.map((date) => ({
      hotelId: HOTEL_ID,
      roomCategoryId: DELUXE_ID,
      date,
      baseRate: 9000,
      availability: 3,
    }));

    const result = await sendPatch(patches);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.updatedCount, 4);

    const { data: rows } = await supabaseServiceRole
      .from('channel_inventory_restrictions')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .eq('room_category_id', DELUXE_ID)
      .in('date', crossYearDates);

    assert.strictEqual(rows.length, 4);
    assert.ok(rows.every((r) => Boolean(r.id)), 'Some cross-year rows had null IDs');
    assert.ok(rows.some((r) => r.date === '2026-12-31'), 'Missing 2026-12-31');
    assert.ok(rows.some((r) => r.date === '2027-01-01'), 'Missing 2027-01-01');
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 6: Multiple Room Categories Coexistence
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 6: Multiple Room Categories Coexistence ---');

  const threeDates = ['2026-12-20', '2026-12-21', '2026-12-22'];
  await supabaseServiceRole
    .from('channel_inventory_restrictions')
    .delete()
    .eq('hotel_id', HOTEL_ID)
    .in('date', threeDates);

  await testAsync('Multiple Rooms (Suite, Deluxe, Fourbed across 3 dates = 9 records)', async () => {
    const patches = [];
    for (const catId of [SUITE_ID, DELUXE_ID, FOURBED_ID]) {
      for (const d of threeDates) {
        patches.push({
          hotelId: HOTEL_ID,
          roomCategoryId: catId,
          date: d,
          baseRate: catId === SUITE_ID ? 15000 : catId === DELUXE_ID ? 8000 : 9500,
          availability: 2,
        });
      }
    }

    assert.strictEqual(patches.length, 9);
    const result = await sendPatch(patches);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.updatedCount, 9);

    const { data: rows } = await supabaseServiceRole
      .from('channel_inventory_restrictions')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .in('date', threeDates);

    assert.strictEqual(rows.length, 9, 'Expected exactly 9 rows (3 rooms x 3 dates)');
    const suiteRows = rows.filter((r) => r.room_category_id === SUITE_ID);
    const deluxeRows = rows.filter((r) => r.room_category_id === DELUXE_ID);
    const fourbedRows = rows.filter((r) => r.room_category_id === FOURBED_ID);

    assert.strictEqual(suiteRows.length, 3);
    assert.strictEqual(deluxeRows.length, 3);
    assert.strictEqual(fourbedRows.length, 3);
    assert.strictEqual(Number(suiteRows[0].base_rate), 15000);
    assert.strictEqual(Number(deluxeRows[0].base_rate), 8000);
    assert.strictEqual(Number(fourbedRows[0].base_rate), 9500);
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 7: Idempotent Duplicate Save Test
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 7: Idempotent Duplicate Save Test ---');

  await testAsync('Duplicate Save: Submitting identical patch twice causes 0 duplicate rows', async () => {
    const patches = threeDates.map((d) => ({
      hotelId: HOTEL_ID,
      roomCategoryId: SUITE_ID,
      date: d,
      baseRate: 16000,
      availability: 1,
    }));

    // Save 1
    const res1 = await sendPatch(patches);
    assert.strictEqual(res1.success, true);

    // Save 2 (identical payload)
    const res2 = await sendPatch(patches);
    assert.strictEqual(res2.success, true);

    // Verify row count has NOT grown
    const { data: rows } = await supabaseServiceRole
      .from('channel_inventory_restrictions')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .eq('room_category_id', SUITE_ID)
      .in('date', threeDates);

    assert.strictEqual(rows.length, 3, 'Duplicate rows detected! Count should be exactly 3');
    assert.strictEqual(Number(rows[0].base_rate), 16000);
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 8: All Three Dimensions Coexistence
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 8: All Three Dimensions Coexistence ---');

  await testAsync('Three Dimensions: Rate, Availability, Restrictions updated in one workflow', async () => {
    const targetDate = '2026-12-20';
    const patch = [{
      hotelId: HOTEL_ID,
      roomCategoryId: SUITE_ID,
      date: targetDate,
      baseRate: 17500,
      availability: 4,
      stopSell: true,
      minStay: 2,
      maxStay: 7,
      closedToArrival: true,
      closedToDeparture: false,
    }];

    const res = await sendPatch(patch);
    assert.strictEqual(res.success, true);

    const { data: row } = await supabaseServiceRole
      .from('channel_inventory_restrictions')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .eq('room_category_id', SUITE_ID)
      .eq('date', targetDate)
      .single();

    assert.strictEqual(Number(row.base_rate), 17500);
    assert.strictEqual(Number(row.availability), 4);
    assert.strictEqual(row.stop_sell, true);
    assert.strictEqual(Number(row.min_stay), 2);
    assert.strictEqual(Number(row.max_stay), 7);
    assert.strictEqual(row.closed_to_arrival, true);
    assert.strictEqual(row.closed_to_departure, false);
  });

  console.log('\n===============================================================');
  console.log(` RESULTS: ${passed} / ${total} TESTS PASSED`);

  // Always clean up test fixtures so they never pollute production data
  await cleanupTestFixtures();

  if (passed === total) {
    console.log(' ALL BULK UPDATE INTEGRITY TESTS PASSED PERFECTLY!');
  } else {
    console.error(` ${total - passed} TESTS FAILED!`);
    if (testServer) testServer.close();
    process.exit(1);
  }
  console.log('===============================================================\n');

  if (testServer) {
    testServer.close();
  }
}


runTests().then(() => process.exit(0)).catch((err) => {
  console.error('Fatal test error:', err);
  if (testServer) testServer.close();
  // Best-effort cleanup on fatal error
  cleanupTestFixtures().catch(() => {}).finally(() => process.exit(1));
});
