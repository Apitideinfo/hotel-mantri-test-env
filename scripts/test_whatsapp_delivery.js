const BASE_URL = 'http://localhost:5000';
const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c'; // Hotel Gopal

async function runTests() {
  console.log('─── STARTING WHATSAPP END-TO-END AUDIT & VERIFICATION ───\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}: ${details}`);
      failed++;
    }
  }

  // ─── Test 1: GET /api/reports/whatsapp/summary ─────────────────────────────
  try {
    const res = await fetch(`${BASE_URL}/api/reports/whatsapp/summary?date=2026-09-29&hotelId=${HOTEL_ID}`);
    const data = await res.json();

    assert(res.status === 200, 'Test 1.1: GET /api/reports/whatsapp/summary returns 200');
    assert(data.success === true, 'Test 1.2: Summary response has success=true');
    assert(data.hotelName === 'Hotel Gopal', 'Test 1.3: Resolved Hotel Gopal property name', `Got ${data.hotelName}`);
    assert(data.ownerWhatsApp?.valid === true, 'Test 1.4: Owner WhatsApp resolved and valid');
    assert(data.ownerWhatsApp?.phone === '919909442195', 'Test 1.5: Owner WhatsApp normalized to 919909442195', `Got ${data.ownerWhatsApp?.phone}`);
    assert(data.providerConfig?.configured === false, 'Test 1.6: Provider configured flag is explicitly false');
    assert(data.providerConfig?.provider === 'NONE', 'Test 1.7: Provider name is NONE');
    assert(data.summary?.occupancy?.totalRooms === 22, 'Test 1.8: Authoritative inventory is 22 rooms');
    assert(data.text?.daily && data.text.daily.includes('Hotel Gopal'), 'Test 1.9: Daily summary text generated with Hotel Gopal header');
    assert(data.whatsappDirectUrls?.daily && data.whatsappDirectUrls.daily.startsWith('https://wa.me/919909442195?text='), 'Test 1.10: Direct wa.me URL correctly formed with normalized recipient');
  } catch (err) {
    assert(false, 'Test 1: GET /api/reports/whatsapp/summary exception', err.message);
  }

  // ─── Test 2: Dual route GET /api/notifications/whatsapp/summary ────────────
  try {
    const res = await fetch(`${BASE_URL}/api/notifications/whatsapp/summary?date=2026-09-29&hotelId=${HOTEL_ID}`);
    const data = await res.json();
    assert(res.status === 200 && data.success === true, 'Test 2.1: Dual route /api/notifications/whatsapp/summary works identically');
  } catch (err) {
    assert(false, 'Test 2: Dual route summary exception', err.message);
  }

  // ─── Test 3: POST /api/reports/whatsapp/send (Provider Unconfigured) ───────
  try {
    const res = await fetch(`${BASE_URL}/api/reports/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hotelId: HOTEL_ID,
        businessDate: '2026-09-29',
        summaryType: 'daily',
        deliveryType: 'MANUAL',
      }),
    });
    const data = await res.json();

    assert(res.status === 422, 'Test 3.1: POST /api/reports/whatsapp/send returns 422 Unprocessable Entity when provider unconfigured', `Got ${res.status}`);
    assert(data.success === false, 'Test 3.2: success is strictly false (NO FAKE SUCCESS)');
    assert(data.status === 'provider_not_configured', 'Test 3.3: status is provider_not_configured');
    assert(data.error === 'WHATSAPP_PROVIDER_NOT_CONFIGURED', 'Test 3.4: error code is WHATSAPP_PROVIDER_NOT_CONFIGURED');
    assert(typeof data.message === 'string' && data.message.includes('not configured'), 'Test 3.5: Returns human readable safe error message');
    assert(data.whatsappDirectUrl && data.whatsappDirectUrl.startsWith('https://wa.me/919909442195?text='), 'Test 3.6: Fallback wa.me direct URL returned in 422 response');
    assert(!JSON.stringify(data).includes('token') && !JSON.stringify(data).includes('secret'), 'Test 3.7: Response contains NO secrets or private tokens');
  } catch (err) {
    assert(false, 'Test 3: POST send exception', err.message);
  }

  // ─── Test 4: POST /api/reports/whatsapp/test ────────────────────────────────
  try {
    const res = await fetch(`${BASE_URL}/api/reports/whatsapp/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hotelId: HOTEL_ID,
      }),
    });
    const data = await res.json();

    assert(res.status === 422, 'Test 4.1: POST /api/reports/whatsapp/test returns 422 when provider unconfigured', `Got ${res.status}`);
    assert(data.success === false, 'Test 4.2: Test message success is strictly false');
    assert(data.error === 'WHATSAPP_PROVIDER_NOT_CONFIGURED', 'Test 4.3: Error code is WHATSAPP_PROVIDER_NOT_CONFIGURED');
  } catch (err) {
    assert(false, 'Test 4: POST test exception', err.message);
  }

  // ─── Test 5: Invalid Recipient Validation ───────────────────────────────────
  try {
    const res = await fetch(`${BASE_URL}/api/reports/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hotelId: HOTEL_ID,
        businessDate: '2026-09-29',
        summaryType: 'daily',
        recipientPhone: '123', // Malformed phone
      }),
    });
    const data = await res.json();

    assert(res.status === 400, 'Test 5.1: Invalid recipient phone returns 400 Bad Request', `Got ${res.status}`);
    assert(data.error === 'WHATSAPP_RECIPIENT_INVALID', 'Test 5.2: Error code is WHATSAPP_RECIPIENT_INVALID');
  } catch (err) {
    assert(false, 'Test 5: Invalid recipient exception', err.message);
  }

  // ─── Test 6: Report Tabs (Morning, Evening, OTA) ───────────────────────────
  try {
    const morningRes = await fetch(`${BASE_URL}/api/reports/whatsapp/summary?date=2026-09-29&hotelId=${HOTEL_ID}&type=morning`);
    const morningData = await morningRes.json();
    assert(morningData.text?.morning?.includes('GOOD MORNING'), 'Test 6.1: Morning briefing text generated properly');

    const eveningRes = await fetch(`${BASE_URL}/api/reports/whatsapp/summary?date=2026-09-29&hotelId=${HOTEL_ID}&type=evening`);
    const eveningData = await eveningRes.json();
    assert(eveningData.text?.evening?.includes('DAILY CLOSING SUMMARY'), 'Test 6.2: Night closing summary generated properly');

    const otaRes = await fetch(`${BASE_URL}/api/reports/whatsapp/summary?date=2026-09-29&hotelId=${HOTEL_ID}&type=ota`);
    const otaData = await otaRes.json();
    assert(otaData.text?.ota?.includes('OTA CHANNELS SUMMARY'), 'Test 6.3: OTA channel performance summary generated properly');
  } catch (err) {
    assert(false, 'Test 6: Summary tabs exception', err.message);
  }

  console.log(`\n─── SUMMARY: ${passed} PASSED, ${failed} FAILED ───\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
