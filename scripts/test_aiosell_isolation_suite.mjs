import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import app from '../server/index.js';
import { supabaseServiceRole } from '../server/supabaseClient.js';
import { getChannelProviderConfig } from '../server/services/providerConfig.js';
import { setHotelResolverForTesting } from '../server/middleware/auth.js';

dotenv.config();

const GOPAL_HOTEL_ID = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb';
const GOPAL_AIOSSELL_CODE = 'fa44d51cc0';

const SWAGAT_HOTEL_ID = 'aa5bfd36-de50-4217-8997-d2cd18e4dfe8';
const SWAGAT_PMS_PROPERTY_CODE = 'fe6288c94a';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function makeRequest(baseUrl, path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const contentType = response.headers.get('content-type') || '';
  let data = null;
  let text = '';

  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    text = await response.text();
  }

  return { status: response.status, headers: response.headers, contentType, data, text };
}

async function runSuite() {
  console.log('\n========================================================================');
  console.log('HOTEL MANTRI — AIOSell MULTI-TENANT ISOLATION & REGRESSION TEST SUITE');
  console.log('========================================================================\n');

  // Configure testing hotel resolver to grant super_admin context with target hotel
  setHotelResolverForTesting((req) => {
    const targetHotelId = req.headers['x-hotel-id'] || req.query.hotelId || req.body?.hotel_id || req.body?.hotelId || GOPAL_HOTEL_ID;
    return {
      success: true,
      user: { id: 'test-super-admin-id', email: 'admin@hotelmantri.com' },
      userId: 'test-super-admin-id',
      role: 'super_admin',
      isSuperAdmin: true,
      hotelId: targetHotelId,
      hotel: { id: targetHotelId, hotel_name: 'Test Target Property' },
      scopedSupabase: supabaseServiceRole,
    };
  });

  // Start dedicated local HTTP server
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test API server running on ${baseUrl}\n`);

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Hotel Gopal Configuration Isolation
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Hotel Gopal Configuration Isolation ---');
    const gopalRes = await makeRequest(baseUrl, '/api/channels/settings', {
      headers: { 'x-hotel-id': GOPAL_HOTEL_ID }
    });
    assert(gopalRes.status === 200, 'Hotel Gopal settings returned HTTP 200');
    assert(gopalRes.data?.success === true, 'Hotel Gopal response reports success: true');
    assert(gopalRes.data?.settings?.hotelCode === GOPAL_AIOSSELL_CODE, `Hotel Gopal hotelCode is strictly ${GOPAL_AIOSSELL_CODE}`);
    assert(gopalRes.data?.settings?.partnerId === 'hotel-mantri-pms', 'Hotel Gopal partnerId is hotel-mantri-pms');
    assert(gopalRes.data?.settings?.environment === 'production', 'Hotel Gopal environment is production');

    // -------------------------------------------------------------------------
    // TEST 2: Hotel Swagat Isolation (Zero Code Leakage)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Hotel Swagat Isolation (Zero Code Leakage) ---');
    const swagatRes = await makeRequest(baseUrl, '/api/channels/settings', {
      headers: { 'x-hotel-id': SWAGAT_HOTEL_ID }
    });
    assert(swagatRes.status === 200, 'Hotel Swagat settings returned HTTP 200');
    assert(swagatRes.data?.success === true, 'Hotel Swagat response reports success: true');
    const swagatCode = swagatRes.data?.settings?.hotelCode;
    assert(swagatCode !== GOPAL_AIOSSELL_CODE, `Hotel Swagat MUST NOT receive Hotel Gopal's code (${GOPAL_AIOSSELL_CODE})`);
    assert(swagatCode === '' || swagatCode === null || swagatCode === undefined, 'Hotel Swagat hotelCode is empty/unconfigured');
    assert(swagatRes.data?.settings?.status === 'disconnected', 'Hotel Swagat status is disconnected');

    // Verify DB hotels table has not been corrupted
    const { data: swagatDbHotel } = await supabaseServiceRole
      .from('hotels')
      .select('id, property_code, hotel_name')
      .eq('id', SWAGAT_HOTEL_ID)
      .single();
    assert(swagatDbHotel?.property_code === SWAGAT_PMS_PROPERTY_CODE, `Hotel Swagat internal property_code is ${SWAGAT_PMS_PROPERTY_CODE} (not corrupted)`);
    assert(swagatDbHotel?.property_code !== GOPAL_AIOSSELL_CODE, `Hotel Swagat internal property_code is not Gopal's Aiosell code`);

    // -------------------------------------------------------------------------
    // TEST 3: Backend Provider Config Isolation (getChannelProviderConfig)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Backend Provider Config Isolation ---');
    let swagatThrew = false;
    let swagatErrorCode = null;
    try {
      await getChannelProviderConfig(SWAGAT_HOTEL_ID, 'TEST-SWAGAT-CFG');
    } catch (err) {
      swagatThrew = true;
      swagatErrorCode = err.code || err.message;
    }
    assert(swagatThrew, 'getChannelProviderConfig for unconfigured Swagat throws error');
    assert(swagatErrorCode === 'PROVIDER_PROPERTY_NOT_FOUND', 'Error code is PROVIDER_PROPERTY_NOT_FOUND (does not fall back to property_code)');

    const gopalConfig = await getChannelProviderConfig(GOPAL_HOTEL_ID, 'TEST-GOPAL-CFG');
    assert(gopalConfig?.hotelCode === GOPAL_AIOSSELL_CODE, `getChannelProviderConfig for Gopal returns ${GOPAL_AIOSSELL_CODE}`);
    assert(gopalConfig?.partnerId === 'hotel-mantri-pms', 'getChannelProviderConfig for Gopal returns hotel-mantri-pms');

    // -------------------------------------------------------------------------
    // TEST 4: Duplicate Aiosell Hotel Code Collision Protection
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Duplicate Code Collision Protection ---');
    const duplicateRes = await makeRequest(baseUrl, '/api/channels/settings', {
      method: 'POST',
      headers: { 'x-hotel-id': SWAGAT_HOTEL_ID },
      body: {
        hotelId: SWAGAT_HOTEL_ID,
        hotelCode: GOPAL_AIOSSELL_CODE, // Attempting to assign Gopal's code to Swagat!
        partnerId: 'hotel-mantri-pms',
        environment: 'production'
      }
    });
    assert(duplicateRes.status === 409, 'Attempting to assign Gopal code to Swagat returns HTTP 409 Conflict');
    assert(duplicateRes.data?.code === 'DUPLICATE_HOTEL_CODE', 'Error code is DUPLICATE_HOTEL_CODE');

    // Verify Hotel Gopal was not affected
    const gopalVerify = await makeRequest(baseUrl, '/api/channels/settings', {
      headers: { 'x-hotel-id': GOPAL_HOTEL_ID }
    });
    assert(gopalVerify.data?.settings?.hotelCode === GOPAL_AIOSSELL_CODE, 'Hotel Gopal configuration remains untouched');

    // -------------------------------------------------------------------------
    // TEST 5: Independent Save and Isolation Verification
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Independent Save and Integrity Verification ---');
    const testTempCode = `swagat_tmp_${Date.now().toString(36)}`;
    const saveRes = await makeRequest(baseUrl, '/api/channels/settings', {
      method: 'POST',
      headers: { 'x-hotel-id': SWAGAT_HOTEL_ID },
      body: {
        hotelId: SWAGAT_HOTEL_ID,
        hotelCode: testTempCode,
        partnerId: 'hotel-mantri-pms',
        environment: 'production'
      }
    });
    assert(saveRes.status === 200, 'Saving unique test code for Swagat succeeds with HTTP 200');

    // Check Swagat now has testTempCode
    const swagatUpdated = await makeRequest(baseUrl, '/api/channels/settings', {
      headers: { 'x-hotel-id': SWAGAT_HOTEL_ID }
    });
    assert(swagatUpdated.data?.settings?.hotelCode === testTempCode, `Hotel Swagat reflects updated code ${testTempCode}`);

    // Check Gopal is STILL intact
    const gopalCheck2 = await makeRequest(baseUrl, '/api/channels/settings', {
      headers: { 'x-hotel-id': GOPAL_HOTEL_ID }
    });
    assert(gopalCheck2.data?.settings?.hotelCode === GOPAL_AIOSSELL_CODE, 'Hotel Gopal retains fa44d51cc0 after Swagat save');

    // Check hotels.property_code was NOT overwritten by the save
    const { data: swagatCheckHotel } = await supabaseServiceRole
      .from('hotels')
      .select('property_code')
      .eq('id', SWAGAT_HOTEL_ID)
      .single();
    assert(swagatCheckHotel?.property_code === SWAGAT_PMS_PROPERTY_CODE, `Hotel Swagat hotels.property_code is STILL ${SWAGAT_PMS_PROPERTY_CODE} (never overwritten)`);

    // Clean up Swagat back to unconfigured
    const cleanupRes = await makeRequest(baseUrl, '/api/channels/settings', {
      method: 'POST',
      headers: { 'x-hotel-id': SWAGAT_HOTEL_ID },
      body: {
        hotelId: SWAGAT_HOTEL_ID,
        hotelCode: '',
        partnerId: 'hotel-mantri-pms',
        environment: 'production'
      }
    });
    assert(cleanupRes.status === 200, 'Cleaning up Hotel Swagat back to empty returns HTTP 200');

    const swagatCleaned = await makeRequest(baseUrl, '/api/channels/settings', {
      headers: { 'x-hotel-id': SWAGAT_HOTEL_ID }
    });
    assert(!swagatCleaned.data?.settings?.hotelCode, 'Hotel Swagat code is cleanly cleared');

    // -------------------------------------------------------------------------
    // TEST 6: Test Connection Isolation (Unconfigured Property)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Test Connection Isolation ---');
    const testConnRes = await makeRequest(baseUrl, '/api/channels/test-connection', {
      method: 'POST',
      headers: { 'x-hotel-id': SWAGAT_HOTEL_ID }
    });
    assert(testConnRes.status === 404 || testConnRes.status === 400 || testConnRes.status === 502, `Test connection for unconfigured Swagat rejected with HTTP ${testConnRes.status}`);
    assert(testConnRes.data?.success === false, 'Test connection returns success: false');
    assert(testConnRes.data?.code === 'PROVIDER_PROPERTY_NOT_FOUND' || testConnRes.data?.code === 'PROPERTY_NOT_CONFIGURED', `Rejection code indicates unconfigured property (${testConnRes.data?.code})`);

    // -------------------------------------------------------------------------
    // TEST 7: JSON Response Safety (No HTML Error Pages)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: JSON Response Safety ---');
    const invalidRouteRes = await makeRequest(baseUrl, '/api/channels/non-existent-endpoint-test', {
      headers: { 'x-hotel-id': SWAGAT_HOTEL_ID }
    });
    assert(invalidRouteRes.status === 404, 'Non-existent API route returns HTTP 404');
    assert(invalidRouteRes.contentType.includes('application/json'), 'Content-Type is application/json (never text/html)');
    assert(invalidRouteRes.data?.success === false, 'Response parsed cleanly as JSON');
    assert(!invalidRouteRes.text.includes('<!DOCTYPE') && !invalidRouteRes.text.includes('<html'), 'No HTML tags leaked in API response');

    // -------------------------------------------------------------------------
    // TEST 8: Concurrent Rapid Switching Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Concurrent Rapid Switching Isolation ---');
    const promises = [];
    for (let i = 0; i < 10; i++) {
      const isGopal = i % 2 === 0;
      const targetId = isGopal ? GOPAL_HOTEL_ID : SWAGAT_HOTEL_ID;
      promises.push(
        makeRequest(baseUrl, '/api/channels/settings', { headers: { 'x-hotel-id': targetId } })
          .then(res => ({ isGopal, code: res.data?.settings?.hotelCode }))
      );
    }
    const results = await Promise.all(promises);
    let rapidSwitchPassed = true;
    for (const r of results) {
      if (r.isGopal && r.code !== GOPAL_AIOSSELL_CODE) {
        rapidSwitchPassed = false;
        console.error(`  ✗ Bleed detected: Gopal received ${r.code}`);
      }
      if (!r.isGopal && r.code === GOPAL_AIOSSELL_CODE) {
        rapidSwitchPassed = false;
        console.error(`  ✗ Bleed detected: Swagat received Gopal code!`);
      }
    }
    assert(rapidSwitchPassed, 'All 10 concurrent interleaved requests returned strictly isolated configurations');

  } catch (err) {
    console.error('Unexpected test exception:', err);
    failed++;
  } finally {
    server.close();
    setHotelResolverForTesting(null);
  }

  console.log('\n========================================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite().catch(e => {
  console.error('Fatal runner error:', e);
  process.exit(1);
});
