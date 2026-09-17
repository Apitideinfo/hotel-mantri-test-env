import assert from 'assert';
import { supabaseServiceRole } from '../server/supabaseClient.js';

// Import pure draft logic functions (re-implemented or imported)
function getBulkKey(hotelId, date, roomCategoryId, ratePlanId = 'all') {
  return `${hotelId || 'default'}:${date}:${roomCategoryId}:${ratePlanId}`;
}

function parseBulkKey(key) {
  const parts = key.split(':');
  return {
    hotelId: parts[0],
    date: parts[1],
    roomCategoryId: parts[2],
    ratePlanId: parts[3] || 'all',
  };
}

function mergeBulkDraft(currentDraft, incomingUpdates) {
  const nextDraft = { ...currentDraft };
  for (const [key, patch] of Object.entries(incomingUpdates)) {
    const existing = nextDraft[key];
    if (!existing) {
      nextDraft[key] = { ...patch };
    } else {
      nextDraft[key] = {
        ...existing,
        ...patch,
      };
    }
  }
  return nextDraft;
}

function removeDraftItem(currentDraft, key) {
  const nextDraft = { ...currentDraft };
  delete nextDraft[key];
  return nextDraft;
}

function clearDraft() {
  return {};
}

function buildPatchListFromDraft(drafts, hotelId) {
  const patches = [];
  for (const [key, item] of Object.entries(drafts)) {
    const parsed = parseBulkKey(key);
    const safeHotelId = hotelId || parsed.hotelId;
    const patch = {
      hotelId: safeHotelId,
      date: parsed.date,
      roomCategoryId: parsed.roomCategoryId,
      ratePlanId: parsed.ratePlanId,
    };
    let hasChange = false;
    if (item.baseRate !== undefined) { patch.baseRate = item.baseRate; hasChange = true; }
    if (item.channelRate !== undefined) { patch.channelRate = item.channelRate; hasChange = true; }
    if (item.availability !== undefined) { patch.availability = item.availability; hasChange = true; }
    if (item.stopSell !== undefined) { patch.stopSell = item.stopSell; hasChange = true; }
    if (item.minStay !== undefined) { patch.minStay = item.minStay; hasChange = true; }
    if (item.maxStay !== undefined) { patch.maxStay = item.maxStay; hasChange = true; }
    if (item.closedToArrival !== undefined) { patch.closedToArrival = item.closedToArrival; hasChange = true; }
    if (item.closedToDeparture !== undefined) { patch.closedToDeparture = item.closedToDeparture; hasChange = true; }

    if (hasChange) patches.push(patch);
  }
  return patches.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.roomCategoryId !== b.roomCategoryId) return a.roomCategoryId.localeCompare(b.roomCategoryId);
    return (a.ratePlanId || '').localeCompare(b.ratePlanId || '');
  });
}

function summarizeDraft(drafts) {
  const keys = Object.keys(drafts);
  const dates = new Set();
  const categories = new Set();
  let rateChangesCount = 0;
  let availabilityChangesCount = 0;
  let restrictionChangesCount = 0;

  for (const [key, item] of Object.entries(drafts)) {
    const parsed = parseBulkKey(key);
    if (parsed.date) dates.add(parsed.date);
    if (parsed.roomCategoryId) categories.add(parsed.roomCategoryId);
    if (item.baseRate !== undefined || item.channelRate !== undefined) rateChangesCount++;
    if (item.availability !== undefined) availabilityChangesCount++;
    if (
      item.stopSell !== undefined ||
      item.minStay !== undefined ||
      item.maxStay !== undefined ||
      item.closedToArrival !== undefined ||
      item.closedToDeparture !== undefined
    ) restrictionChangesCount++;
  }

  return {
    totalItems: keys.length,
    uniqueDates: dates.size,
    uniqueCategories: categories.size,
    rateChangesCount,
    availabilityChangesCount,
    restrictionChangesCount,
    hasUnsavedChanges: keys.length > 0,
  };
}

const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c';
const SUITE_ID = '9e82c94b-bfc0-4c86-94f9-940b3df4769f';
const DELUXE_ID = 'ca773df6-63e4-43ed-963b-05bbc2494499';
const FOURBED_ID = 'b2b5b71b-72e5-494f-a906-824b87dfd88b';

async function sendPatch(patches) {
  const res = await fetch('http://localhost:5000/api/channels/inventory-restrictions/patch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hotel-id': HOTEL_ID,
    },
    body: JSON.stringify({ patches }),
  });
  return res.json();
}

async function runTests() {
  console.log('===============================================================');
  console.log('      HOTEL MANTRI BULK UPDATE INTEGRITY VERIFICATION SUITE    ');
  console.log('===============================================================\n');

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

  console.log('--- SUITE 1: Frontend Draft Accumulation & Immutability ---');

  // Test A: Multiple rates across multiple dates accumulate
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

  // Test B: Rate then Availability on same cell
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

  // Test C: Availability then Rate on same cell (reverse order)
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

  // Test D: Multiple room categories independence
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

  // Test E: Date range then sub-range update
  test('Test E: Full range rate update followed by sub-range availability', () => {
    let draft = {};
    const dates = ['2026-12-20', '2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25'];
    
    // Step 1: Set Rate 12000 for 20-25 Dec
    const step1Updates = {};
    for (const d of dates) {
      step1Updates[getBulkKey(HOTEL_ID, d, SUITE_ID)] = { baseRate: 12000 };
    }
    draft = mergeBulkDraft(draft, step1Updates);

    // Step 2: Set Availability 3 for 22-24 Dec
    const step2Updates = {};
    for (const d of ['2026-12-22', '2026-12-23', '2026-12-24']) {
      step2Updates[getBulkKey(HOTEL_ID, d, SUITE_ID)] = { availability: 3 };
    }
    draft = mergeBulkDraft(draft, step2Updates);

    // Assertions
    assert.strictEqual(draft[getBulkKey(HOTEL_ID, '2026-12-20', SUITE_ID)]?.baseRate, 12000);
    assert.strictEqual(draft[getBulkKey(HOTEL_ID, '2026-12-20', SUITE_ID)]?.availability, undefined);

    assert.strictEqual(draft[getBulkKey(HOTEL_ID, '2026-12-22', SUITE_ID)]?.baseRate, 12000, 'Sub-range wiped rate on 22 Dec!');
    assert.strictEqual(draft[getBulkKey(HOTEL_ID, '2026-12-22', SUITE_ID)]?.availability, 3);

    assert.strictEqual(draft[getBulkKey(HOTEL_ID, '2026-12-24', SUITE_ID)]?.baseRate, 12000);
    assert.strictEqual(draft[getBulkKey(HOTEL_ID, '2026-12-24', SUITE_ID)]?.availability, 3);

    assert.strictEqual(draft[getBulkKey(HOTEL_ID, '2026-12-25', SUITE_ID)]?.baseRate, 12000);
    assert.strictEqual(draft[getBulkKey(HOTEL_ID, '2026-12-25', SUITE_ID)]?.availability, undefined);
  });

  // Test F: Restriction independence
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

  // Test G: Rapid successive edits converge
  test('Test G: Rapid edits on same cell converge to final value', () => {
    let draft = {};
    const key = getBulkKey(HOTEL_ID, '2026-12-20', SUITE_ID);
    draft = mergeBulkDraft(draft, { [key]: { baseRate: 10000 } });
    draft = mergeBulkDraft(draft, { [key]: { baseRate: 11000 } });
    draft = mergeBulkDraft(draft, { [key]: { baseRate: 12000 } });
    assert.strictEqual(draft[key]?.baseRate, 12000);
  });

  // Test H: Item removal and draft clear
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

  console.log('\n--- SUITE 2: Backend Non-Destructive PATCH Semantics ---');

  // Clean test date records before starting backend tests
  await supabaseServiceRole
    .from('channel_inventory_restrictions')
    .delete()
    .eq('hotel_id', HOTEL_ID)
    .in('date', ['2026-12-20', '2026-12-21', '2026-12-22', '2026-12-23']);

  // Test J: Rate-only patch creates record with availability = null (never 0!)
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
  });

  // Test K: Subsequent Availability-only patch preserves existing baseRate
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

  // Test L: Subsequent Rate update preserves existing availability
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

  // Test M: Restriction update preserves both Rate and Availability
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

  // Test N: No-op patch
  await testAsync('Test N: Empty patch returns successfully with updatedCount = 0', async () => {
    const res = await sendPatch([]);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.updatedCount, 0);
  });

  console.log('\n--- SUITE 3: Section 34 Hotel Mantri Master Scenario ---');

  // Clean state for Section 34 test
  await supabaseServiceRole
    .from('channel_inventory_restrictions')
    .delete()
    .eq('hotel_id', HOTEL_ID)
    .in('date', ['2026-12-20', '2026-12-21', '2026-12-22', '2026-12-23']);

  await testAsync('Section 34 Scenario: Queue 5 multi-room/multi-date edits, save atomically', async () => {
    // 1. Suite 20 Dec Rate ₹13,500
    // 2. Suite 21 Dec Rate ₹14,000
    // 3. Suite 20 Dec Avail 1
    // 4. Deluxe 22 Dec Rate ₹7,500
    // 5. Fourbed 23 Dec Avail 1

    let draft = {};
    const kSuite20 = getBulkKey(HOTEL_ID, '2026-12-20', SUITE_ID);
    const kSuite21 = getBulkKey(HOTEL_ID, '2026-12-21', SUITE_ID);
    const kDeluxe22 = getBulkKey(HOTEL_ID, '2026-12-22', DELUXE_ID);
    const kFourbed23 = getBulkKey(HOTEL_ID, '2026-12-23', FOURBED_ID);

    // Queue edit 1
    draft = mergeBulkDraft(draft, { [kSuite20]: { baseRate: 13500 } });
    // Queue edit 2
    draft = mergeBulkDraft(draft, { [kSuite21]: { baseRate: 14000 } });
    // Queue edit 3
    draft = mergeBulkDraft(draft, { [kSuite20]: { availability: 1 } });
    // Queue edit 4
    draft = mergeBulkDraft(draft, { [kDeluxe22]: { baseRate: 7500 } });
    // Queue edit 5
    draft = mergeBulkDraft(draft, { [kFourbed23]: { availability: 1 } });

    // Validate Draft summary
    const summary = summarizeDraft(draft);
    assert.strictEqual(summary.totalItems, 4, 'Expected 4 items in draft queue (Suite 20 Dec merged into 1 item)');
    assert.strictEqual(summary.rateChangesCount, 3, 'Expected 3 rate changes in draft (Suite 20, Suite 21, Deluxe 22)');
    assert.strictEqual(summary.availabilityChangesCount, 2, 'Expected 2 availability changes (Suite 20, Fourbed 23)');

    // Build patches
    const patches = buildPatchListFromDraft(draft, HOTEL_ID);
    assert.strictEqual(patches.length, 4);

    // Send save request
    const saveResult = await sendPatch(patches);
    assert.strictEqual(saveResult.success, true);
    assert.strictEqual(saveResult.updatedCount, 4);

    // Direct database validation
    const { data: rows } = await supabaseServiceRole
      .from('channel_inventory_restrictions')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .in('date', ['2026-12-20', '2026-12-21', '2026-12-22', '2026-12-23']);

    assert.strictEqual(rows.length, 4, 'Expected exactly 4 rows in database');

    const rSuite20 = rows.find(r => r.date === '2026-12-20' && r.room_category_id === SUITE_ID);
    const rSuite21 = rows.find(r => r.date === '2026-12-21' && r.room_category_id === SUITE_ID);
    const rDeluxe22 = rows.find(r => r.date === '2026-12-22' && r.room_category_id === DELUXE_ID);
    const rFourbed23 = rows.find(r => r.date === '2026-12-23' && r.room_category_id === FOURBED_ID);

    // 1 & 3: Suite 20 Dec has BOTH Rate 13500 AND Avail 1
    assert.ok(rSuite20, 'Suite 20 Dec missing from DB');
    assert.strictEqual(Number(rSuite20.base_rate), 13500, 'Suite 20 Dec base_rate mismatch');
    assert.strictEqual(Number(rSuite20.availability), 1, 'Suite 20 Dec availability mismatch');

    // 2: Suite 21 Dec has Rate 14000 and availability = null (not 0)
    assert.ok(rSuite21, 'Suite 21 Dec missing from DB');
    assert.strictEqual(Number(rSuite21.base_rate), 14000);
    assert.strictEqual(rSuite21.availability, null, 'Suite 21 Dec availability should be null');

    // 4: Deluxe 22 Dec has Rate 7500 and availability = null (not 0)
    assert.ok(rDeluxe22, 'Deluxe 22 Dec missing from DB');
    assert.strictEqual(Number(rDeluxe22.base_rate), 7500);
    assert.strictEqual(rDeluxe22.availability, null);

    // 5: Fourbed 23 Dec has availability 1 and base_rate = 0 (or default)
    assert.ok(rFourbed23, 'Fourbed 23 Dec missing from DB');
    assert.strictEqual(Number(rFourbed23.availability), 1);
  });

  console.log('\n===============================================================');
  console.log(` RESULTS: ${passed} / ${total} TESTS PASSED`);
  if (passed === total) {
    console.log(' ALL BULK UPDATE INTEGRITY TESTS PASSED PERFECTLY!');
  } else {
    console.error(` ${total - passed} TESTS FAILED!`);
    process.exit(1);
  }
  console.log('===============================================================\n');
}

runTests().then(() => process.exit(0)).catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
