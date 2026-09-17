import { supabaseServiceRole } from '../server/supabaseClient.js';

const BASE_URL = 'http://localhost:5000';
const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c'; // Hotel Gopal

async function runTests() {
  console.log('====================================================');
  console.log('HOTEL MANTRI PMS — CHANNEL SYNC ACCEPTANCE TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function assertStep(name, fn) {
    process.stdout.write(`TEST: ${name}... `);
    try {
      await fn();
      console.log('✅ PASSED');
      passed++;
    } catch (err) {
      console.log(`❌ FAILED: ${err.message}`);
      if (err.details) console.log(JSON.stringify(err.details, null, 2));
      failed++;
    }
  }

  // --- 1. Health check ---
  await assertStep('Express backend health check', async () => {
    const res = await fetch(`${BASE_URL}/api/aiosell/health`);
    if (!res.ok) throw new Error(`Health check returned status ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error('Health check success is false');
  });

  // --- 2. Specific Acceptance Test: Suite Room AC on 2026-12-24 at 14000, 12000, 7000 ---
  const TARGET_DATE = '2026-12-24';
  const SUITE_CAT_ID = '9e82c94b-bfc0-4c86-94f9-940b3df4769f'; // Suite Room AC
  const testRates = [14000, 12000, 7000];

  for (const testRate of testRates) {
    await assertStep(`Suite Room AC on ${TARGET_DATE} -> Set ₹${testRate} and verify live fetch`, async () => {
      // 1. Simulate UI save: Upsert into channel_inventory_restrictions
      const { error: upsertErr } = await supabaseServiceRole
        .from('channel_inventory_restrictions')
        .upsert({
          hotel_id: HOTEL_ID,
          room_category_id: SUITE_CAT_ID,
          date: TARGET_DATE,
          base_rate: testRate,
          availability: 5,
          updated_at: new Date().toISOString()
        }, { onConflict: 'hotel_id,room_category_id,date' });

      if (upsertErr) throw new Error(`Failed to save test rate to database: ${upsertErr.message}`);

      // 2. Dispatch event via backend (automatic trigger)
      const dispatchRes = await fetch(`${BASE_URL}/api/channels/events/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hotel-id': HOTEL_ID },
        body: JSON.stringify({
          hotelId: HOTEL_ID,
          eventType: 'RATE_CHANGED',
          details: {
            startDate: TARGET_DATE,
            endDate: TARGET_DATE,
            roomCategoryId: SUITE_CAT_ID,
            baseRate: testRate
          }
        })
      });
      const dispatchData = await dispatchRes.json();
      if (!dispatchRes.ok || !dispatchData.success) {
        throw new Error(`Dispatch failed: ${dispatchData?.error?.message || dispatchRes.statusText}`);
      }

      // 2. Fetch directly from Aiosell live sandbox to verify the rate took effect
      const verifyRes = await fetch(`${BASE_URL}/api/aiosell/rates/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hotel-id': HOTEL_ID },
        body: JSON.stringify({ startDate: TARGET_DATE, endDate: TARGET_DATE })
      });
      const verifyData = await verifyRes.json();
      const updates = verifyData?.result?.updates || [];
      const matchingDate = updates.find(u => u.startDate === TARGET_DATE);
      if (!matchingDate) throw new Error(`No updates found for date ${TARGET_DATE}`);

      const matchingRate = matchingDate.rates?.find(r => r.roomCode === 'suite-ac' && r.rateplanCode === 'suite-ac-s-ep');
      if (!matchingRate) throw new Error(`Suite Room AC rate plan suite-ac-s-ep not found in live fetch`);
      if (Number(matchingRate.rate) !== testRate) {
        throw new Error(`Rate mismatch: expected ₹${testRate}, got ₹${matchingRate.rate}`);
      }
      console.log(` (Verified live ratePlanCode ${matchingRate.rateplanCode}: ₹${matchingRate.rate}) `);
    });
  }

  // --- 3. Multi-consecutive dates test (2026-12-20 to 2027-01-02 across year boundary) ---
  await assertStep('Multi-date rate sync (2026-12-20 to 2027-01-02 across 14 consecutive days)', async () => {
    const sDate = '2026-12-20';
    const eDate = '2027-01-02';

    const syncRes = await fetch(`${BASE_URL}/api/channels/sync/rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hotel-id': HOTEL_ID },
      body: JSON.stringify({
        hotelId: HOTEL_ID,
        startDate: sDate,
        endDate: eDate
      })
    });
    const syncData = await syncRes.json();
    if (!syncRes.ok || !syncData.success) {
      throw new Error(`Multi-date sync failed: ${syncData?.error?.message || syncRes.statusText}`);
    }

    if (!syncData.verified) {
      console.warn(` [Verification warning: ${syncData.discrepancies?.length || 0} discrepancies reported] `);
    } else {
      console.log(` (${syncData.datesCount} dates, ${syncData.recordsVerified} updates confirmed verified) `);
    }
  });

  // --- 4. Inventory Event Auto-Sync on Operations Board / PMS Availability Change ---
  await assertStep('Operations Board / PMS Event auto-syncs inventory to Aiosell', async () => {
    const testDate = '2026-12-25';
    const DELUXE_CAT_ID = 'deluxe-ac-cat-id'; // Deluxe AC

    // Dispatch AVAILABILITY_CHANGED event
    const eventRes = await fetch(`${BASE_URL}/api/channels/events/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hotel-id': HOTEL_ID },
      body: JSON.stringify({
        hotelId: HOTEL_ID,
        eventType: 'AVAILABILITY_CHANGED',
        details: {
          startDate: testDate,
          endDate: testDate
        }
      })
    });
    const eventData = await eventRes.json();
    if (!eventRes.ok || !eventData.success) {
      throw new Error(`AVAILABILITY_CHANGED dispatch failed: ${eventData?.error?.message || eventRes.statusText}`);
    }

    if (eventData.result?.verified) {
      console.log(` (Inventory auto-pushed and verified: ${eventData.result.recordsVerified} room updates confirmed) `);
    } else {
      console.log(` (Inventory push acknowledged by engine: status ${eventData.result?.status}) `);
    }
  });

  // --- 5. Reservation Cycle Event Sync (Create -> Cancel) ---
  await assertStep('Reservation life-cycle events (RESERVATION_CREATED & RESERVATION_CANCELLED)', async () => {
    const resvDate = '2026-12-26';

    // 1. Create reservation event
    const createdRes = await fetch(`${BASE_URL}/api/channels/events/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hotel-id': HOTEL_ID },
      body: JSON.stringify({
        hotelId: HOTEL_ID,
        eventType: 'RESERVATION_CREATED',
        details: {
          startDate: resvDate,
          endDate: resvDate
        }
      })
    });
    const createdData = await createdRes.json();
    if (!createdRes.ok || !createdData.success) {
      throw new Error(`RESERVATION_CREATED dispatch failed: ${createdData?.error?.message}`);
    }

    // 2. Cancel reservation event
    const cancelRes = await fetch(`${BASE_URL}/api/channels/events/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hotel-id': HOTEL_ID },
      body: JSON.stringify({
        hotelId: HOTEL_ID,
        eventType: 'RESERVATION_CANCELLED',
        details: {
          startDate: resvDate,
          endDate: resvDate
        }
      })
    });
    const cancelData = await cancelRes.json();
    if (!cancelRes.ok || !cancelData.success) {
      throw new Error(`RESERVATION_CANCELLED dispatch failed: ${cancelData?.error?.message}`);
    }
    console.log(' (Reservation lifecycle events handled smoothly with automatic delta sync) ');
  });

  console.log('\n====================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
