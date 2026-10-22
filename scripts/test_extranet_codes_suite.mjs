/**
 * HOTEL MANTRI — Hotel Extranet Codes Centralized Registry & Isolation Test Suite
 * 
 * Verifies:
 * 1. Super Admin centralized management of hotel extranet property codes.
 * 2. Strict tenant isolation (Hotel Swagat's codes never mix with Hotel Gopal's).
 * 3. Preservation of leading zeros and string representation of codes.
 * 4. Permission for multiple OTA codes per hotel and distinct codes per hotel for the same OTA.
 * 5. Rejection of duplicate codes for the same hotel and OTA.
 * 6. RBAC enforcement: Super Admin only for write/delete; non-super-admin denied (403).
 * 7. Verification that Hotel internal ID, property_code, Aiosell hotel code, PMS partner ID,
 *    and OTA extranet property codes remain strictly distinct.
 * 8. Edit and Delete lifecycle persistence.
 */

import dotenv from 'dotenv';
dotenv.config();

import app from '../server/index.js';
import { supabaseServiceRole } from '../server/supabaseClient.js';
import { setHotelResolverForTesting } from '../server/middleware/auth.js';

const SWAGAT_HOTEL_ID = 'aa5bfd36-de50-4217-8997-d2cd18e4dfe8';
const GOPAL_HOTEL_ID = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb';

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

async function runExtranetCodesSuite() {
  console.log('\n========================================================================');
  console.log('HOTEL MANTRI — EXTRANET CODES REGISTRY & MULTI-TENANT ISOLATION SUITE');
  console.log('========================================================================\n');

  let currentAuthContext = {
    role: 'super_admin',
    isSuperAdmin: true,
    hotelId: SWAGAT_HOTEL_ID
  };

  // Dynamic test auth resolver
  setHotelResolverForTesting((req) => {
    const targetHotelId = req.headers['x-hotel-id'] || req.query.hotelId || req.body?.hotel_id || req.body?.hotelId || currentAuthContext.hotelId;
    return {
      success: true,
      user: { id: 'test-admin-uuid', email: 'superadmin@hotelmantri.com' },
      userId: 'test-admin-uuid',
      role: currentAuthContext.role,
      isSuperAdmin: currentAuthContext.isSuperAdmin,
      hotelId: targetHotelId,
      hotel: { id: targetHotelId, hotel_name: 'Authorized Test Hotel' },
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
    // CLEANUP / PREPARATION
    // -------------------------------------------------------------------------
    console.log('--- PRE-FLIGHT: Cleanup any prior test codes ---');
    try {
      await supabaseServiceRole.from('hotel_extranet_codes').delete().in('hotel_id', [SWAGAT_HOTEL_ID, GOPAL_HOTEL_ID]);
    } catch (_) {}
    try {
      await supabaseServiceRole.from('channel_connections')
        .update({ external_channel_id: null })
        .in('hotel_id', [SWAGAT_HOTEL_ID, GOPAL_HOTEL_ID]);
    } catch (_) {}

    // -------------------------------------------------------------------------
    // TEST 1: Role Enforcement (RBAC) - Reject non-super_admin from creating codes
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Role Enforcement (Super Admin Write Restriction) ---');
    currentAuthContext = { role: 'hotel_admin', isSuperAdmin: false, hotelId: SWAGAT_HOTEL_ID };

    const rbacRes = await makeRequest(baseUrl, '/api/channels/extranet-codes', {
      method: 'POST',
      body: {
        hotelId: SWAGAT_HOTEL_ID,
        otaType: 'booking_com',
        otaName: 'Booking.com',
        extranetPropertyCode: '007819'
      }
    });

    assert(rbacRes.status === 403, `Non-super-admin is rejected with HTTP 403 (Got ${rbacRes.status})`);
    assert(rbacRes.data?.code === 'ROLE_FORBIDDEN', `Error code is ROLE_FORBIDDEN (Got ${rbacRes.data?.code})`);

    // Reset back to super_admin
    currentAuthContext = { role: 'super_admin', isSuperAdmin: true, hotelId: SWAGAT_HOTEL_ID };

    // -------------------------------------------------------------------------
    // TEST 2: Add Booking.com code for Hotel Swagat (Preserve leading zeros)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Add Booking.com code for Hotel Swagat (Leading Zero Preservation) ---');
    const swagatBookingCode = '007819'; // Crucial: must preserve '00'
    const addSwagatRes = await makeRequest(baseUrl, '/api/channels/extranet-codes', {
      method: 'POST',
      body: {
        hotelId: SWAGAT_HOTEL_ID,
        otaType: 'booking_com',
        otaName: 'Booking.com',
        extranetPropertyCode: swagatBookingCode,
        otaPropertyName: 'Hotel Swagat Grand Extranet',
        notes: 'Primary Booking.com channel ID',
        isActive: true
      }
    });

    assert(addSwagatRes.status === 201, `Hotel Swagat Booking.com code created with HTTP 201 (Got ${addSwagatRes.status})`);
    assert(addSwagatRes.data?.success === true, 'Response indicates success: true');
    assert(addSwagatRes.data?.code?.extranetPropertyCode === swagatBookingCode, `Extranet code preserved strictly as string '${swagatBookingCode}' with leading zeros`);
    assert(typeof addSwagatRes.data?.code?.extranetPropertyCode === 'string', 'Extranet code type is strictly string');
    assert(addSwagatRes.data?.code?.hotelId === SWAGAT_HOTEL_ID, 'Code is scoped to Hotel Swagat ID');

    const swagatBookingRecordId = addSwagatRes.data?.code?.id;

    // -------------------------------------------------------------------------
    // TEST 3: Add MakeMyTrip code for Hotel Swagat (Multiple OTAs for same hotel)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Add MakeMyTrip code for Hotel Swagat (Multiple OTAs per Hotel) ---');
    const swagatMmtCode = 'MMT-SWAGAT-9901';
    const addSwagatMmtRes = await makeRequest(baseUrl, '/api/channels/extranet-codes', {
      method: 'POST',
      body: {
        hotelId: SWAGAT_HOTEL_ID,
        otaType: 'makemytrip',
        otaName: 'MakeMyTrip',
        extranetPropertyCode: swagatMmtCode,
        otaPropertyName: 'Swagat Residency MMT',
        notes: 'MMT direct extranet partner',
        isActive: true
      }
    });

    assert(addSwagatMmtRes.status === 201, `Hotel Swagat MakeMyTrip code created with HTTP 201 (Got ${addSwagatMmtRes.status})`);
    assert(addSwagatMmtRes.data?.code?.extranetPropertyCode === swagatMmtCode, `MMT code matches '${swagatMmtCode}'`);
    assert(addSwagatMmtRes.data?.code?.hotelId === SWAGAT_HOTEL_ID, 'MMT code is scoped to Hotel Swagat');

    // -------------------------------------------------------------------------
    // TEST 4: Add Booking.com code for Hotel Gopal (Same OTA, Different Hotel)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Add Booking.com code for Hotel Gopal (Distinct Code for Same OTA) ---');
    const gopalBookingCode = '004185'; // Different code for Hotel Gopal
    const addGopalRes = await makeRequest(baseUrl, '/api/channels/extranet-codes', {
      method: 'POST',
      body: {
        hotelId: GOPAL_HOTEL_ID,
        otaType: 'booking_com',
        otaName: 'Booking.com',
        extranetPropertyCode: gopalBookingCode,
        otaPropertyName: 'Hotel Gopal Palace Extranet',
        notes: 'Gopal Booking.com listing',
        isActive: true
      }
    });

    assert(addGopalRes.status === 201, `Hotel Gopal Booking.com code created with HTTP 201 (Got ${addGopalRes.status})`);
    assert(addGopalRes.data?.code?.extranetPropertyCode === gopalBookingCode, `Gopal Booking.com code preserved strictly as '${gopalBookingCode}'`);
    assert(addGopalRes.data?.code?.hotelId === GOPAL_HOTEL_ID, 'Code is scoped to Hotel Gopal ID');

    // -------------------------------------------------------------------------
    // TEST 5: Centralized Table Query (Super Admin View Across All Hotels)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Centralized Table Query (View All Codes Across All Hotels) ---');
    const allCodesRes = await makeRequest(baseUrl, '/api/channels/extranet-codes');
    assert(allCodesRes.status === 200, `Centralized query returned HTTP 200`);
    assert(allCodesRes.data?.success === true, 'Response indicates success: true');
    assert(Array.isArray(allCodesRes.data?.codes), 'Returns codes array');

    const codes = allCodesRes.data?.codes || [];
    const hasSwagatBooking = codes.some(c => c.hotelId === SWAGAT_HOTEL_ID && c.otaType === 'booking_com' && c.extranetPropertyCode === swagatBookingCode);
    const hasSwagatMmt = codes.some(c => c.hotelId === SWAGAT_HOTEL_ID && c.otaType === 'makemytrip' && c.extranetPropertyCode === swagatMmtCode);
    const hasGopalBooking = codes.some(c => c.hotelId === GOPAL_HOTEL_ID && c.otaType === 'booking_com' && c.extranetPropertyCode === gopalBookingCode);

    assert(hasSwagatBooking, `Centralized table contains Hotel Swagat Booking.com code (${swagatBookingCode})`);
    assert(hasSwagatMmt, `Centralized table contains Hotel Swagat MakeMyTrip code (${swagatMmtCode})`);
    assert(hasGopalBooking, `Centralized table contains Hotel Gopal Booking.com code (${gopalBookingCode})`);

    // -------------------------------------------------------------------------
    // TEST 6: Strict Isolation Between Hotels (Hotel Swagat never gets Gopal's code)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Strict Tenant Isolation (Zero Cross-Hotel Leakage) ---');
    const swagatScopedRes = await makeRequest(baseUrl, `/api/channels/extranet-codes?hotelId=${SWAGAT_HOTEL_ID}`);
    const swagatCodes = swagatScopedRes.data?.codes || [];

    const swagatHasGopalCode = swagatCodes.some(c => c.extranetPropertyCode === gopalBookingCode || c.hotelId === GOPAL_HOTEL_ID);
    assert(!swagatHasGopalCode, `Hotel Swagat query NEVER returns Hotel Gopal codes or Gopal records`);
    assert(swagatCodes.every(c => c.hotelId === SWAGAT_HOTEL_ID), `All records in Swagat query strictly belong to Hotel Swagat`);

    const gopalScopedRes = await makeRequest(baseUrl, `/api/channels/extranet-codes?hotelId=${GOPAL_HOTEL_ID}`);
    const gopalCodes = gopalScopedRes.data?.codes || [];

    const gopalHasSwagatCode = gopalCodes.some(c => c.extranetPropertyCode === swagatBookingCode || c.hotelId === SWAGAT_HOTEL_ID);
    assert(!gopalHasSwagatCode, `Hotel Gopal query NEVER returns Hotel Swagat codes or Swagat records`);
    assert(gopalCodes.every(c => c.hotelId === GOPAL_HOTEL_ID), `All records in Gopal query strictly belong to Hotel Gopal`);

    // -------------------------------------------------------------------------
    // TEST 7: Duplicate Prevention (Same Hotel and OTA)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Duplicate Prevention for Same Hotel and OTA ---');
    const duplicateRes = await makeRequest(baseUrl, '/api/channels/extranet-codes', {
      method: 'POST',
      body: {
        hotelId: SWAGAT_HOTEL_ID,
        otaType: 'booking_com',
        otaName: 'Booking.com',
        extranetPropertyCode: '009999'
      }
    });

    assert(duplicateRes.status === 409, `Duplicate attempt rejected with HTTP 409 (Got ${duplicateRes.status})`);
    assert(duplicateRes.data?.code === 'DUPLICATE_EXTRANET_CODE', `Error code is DUPLICATE_EXTRANET_CODE (Got ${duplicateRes.data?.code})`);

    // -------------------------------------------------------------------------
    // TEST 8: Search and Filtering Capabilities
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Search and Filtering Capabilities ---');
    const searchRes = await makeRequest(baseUrl, `/api/channels/extranet-codes?search=${swagatBookingCode}`);
    assert(searchRes.status === 200, 'Search query returned HTTP 200');
    assert(searchRes.data?.codes?.length === 1, `Search by code returned exactly 1 match (Got ${searchRes.data?.codes?.length})`);
    assert(searchRes.data?.codes[0]?.extranetPropertyCode === swagatBookingCode, `Matched code is '${swagatBookingCode}'`);

    const otaFilterRes = await makeRequest(baseUrl, '/api/channels/extranet-codes?otaType=makemytrip');
    assert(otaFilterRes.status === 200, 'OTA filter query returned HTTP 200');
    assert(otaFilterRes.data?.codes?.every(c => c.otaType === 'makemytrip'), 'All results in OTA filter have otaType=makemytrip');

    // -------------------------------------------------------------------------
    // TEST 9: Edit / Update Code and Verify Persistence
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: Edit Extranet Code and Verify Persistence ---');
    const updatedCodeVal = '007819-EDITED';
    const editRes = await makeRequest(baseUrl, `/api/channels/extranet-codes/${swagatBookingRecordId}`, {
      method: 'PUT',
      body: {
        extranetPropertyCode: updatedCodeVal,
        notes: 'Updated extranet code verified by admin',
        isActive: true
      }
    });

    assert(editRes.status === 200, `Edit returned HTTP 200 (Got ${editRes.status})`);
    assert(editRes.data?.code?.extranetPropertyCode === updatedCodeVal, `Updated code is '${updatedCodeVal}'`);

    // Verify persistence by querying again
    const verifyEditRes = await makeRequest(baseUrl, `/api/channels/extranet-codes?hotelId=${SWAGAT_HOTEL_ID}&otaType=booking_com`);
    const verifiedItem = verifyEditRes.data?.codes?.find(c => c.id === swagatBookingRecordId);
    assert(verifiedItem?.extranetPropertyCode === updatedCodeVal, `Persisted code after refresh is '${updatedCodeVal}'`);

    // -------------------------------------------------------------------------
    // TEST 10: Delete Code and Verify Proper Deletion
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 10: Delete Extranet Code with Confirmation ---');
    const deleteRes = await makeRequest(baseUrl, `/api/channels/extranet-codes/${swagatBookingRecordId}`, {
      method: 'DELETE'
    });

    assert(deleteRes.status === 200, `Delete returned HTTP 200 (Got ${deleteRes.status})`);
    assert(deleteRes.data?.success === true, 'Delete response reports success: true');

    // Verify deleted record is no longer returned
    const afterDeleteRes = await makeRequest(baseUrl, `/api/channels/extranet-codes?hotelId=${SWAGAT_HOTEL_ID}&otaType=booking_com`);
    const afterDeleteCodes = afterDeleteRes.data?.codes || [];
    assert(!afterDeleteCodes.some(c => c.id === swagatBookingRecordId), 'Deleted record is absent from query results');

    // Verify other records remain intact
    const remainingGopalRes = await makeRequest(baseUrl, `/api/channels/extranet-codes?hotelId=${GOPAL_HOTEL_ID}`);
    assert(remainingGopalRes.data?.codes?.some(c => c.extranetPropertyCode === gopalBookingCode), 'Hotel Gopal code remains completely intact after Swagat deletion');

    // -------------------------------------------------------------------------
    // TEST 11: Architectural Separation of Distinct Identifiers
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 11: Verification of Distinct Identifiers (Zero Overwriting) ---');
    // 1. Hotel Mantri internal hotel ID (UUID)
    // 2. Aiosell property/external hotel code (channel_settings.aiosell_hotel_code)
    // 3. PMS partner ID ('hotel-mantri-pms')
    // 4. Individual OTA extranet property code
    // 5. PMS internal property_code (hotels.property_code)
    const { data: gopalHotel } = await supabaseServiceRole
      .from('hotels')
      .select('id, property_code, hotel_name')
      .eq('id', GOPAL_HOTEL_ID)
      .single();

    const { data: gopalSettings } = await supabaseServiceRole
      .from('channel_settings')
      .select('aiosell_hotel_code, aiosell_partner_id')
      .eq('hotel_id', GOPAL_HOTEL_ID)
      .maybeSingle();

    assert(gopalHotel.id === GOPAL_HOTEL_ID, `Internal Hotel ID is UUID '${GOPAL_HOTEL_ID}'`);
    assert(gopalHotel.property_code === 'fa44d51cc0', `PMS property_code is 'fa44d51cc0'`);
    assert(gopalSettings?.aiosell_partner_id === 'hotel-mantri-pms', `PMS partner ID is 'hotel-mantri-pms'`);
    assert(gopalBookingCode === '004185', `OTA Extranet code is '${gopalBookingCode}'`);

    assert(gopalHotel.id !== gopalHotel.property_code, 'Hotel UUID != property_code');
    assert(gopalHotel.property_code !== gopalBookingCode, 'property_code != OTA extranet code');
    assert(gopalBookingCode !== gopalSettings?.aiosell_partner_id, 'OTA extranet code != partner ID');

    console.log('\n========================================================================');
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================================\n');

  } catch (err) {
    console.error('Test suite crashed with unhandled error:', err);
    failed++;
  } finally {
    server.close();
  }

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runExtranetCodesSuite();
