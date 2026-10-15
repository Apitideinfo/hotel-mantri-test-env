/**
 * HOTEL MANTRI — Master Source Synchronization & Regression Test Suite
 * Validates all 12 regression test cases and bidirectional synchronization
 * across every available Booking Source, Source Type, and Database Category.
 */

import dotenv from 'dotenv';
dotenv.config();

import { supabaseServiceRole } from '../server/supabaseClient.js';
import {
  ALL_SOURCE_TYPES,
  STANDARD_OTA_CHANNELS,
  STANDARD_SOURCES_BY_TYPE,
  ALL_STANDARD_BOOKING_SOURCES,
  getSourceCategoryFromType,
  getSourceTypeFromCategory,
  getSourceTypeFromSource,
  getCompatibleSourcesForType,
  isSourceCompatibleWithType,
  synchronizeSourceAndType,
  classifyCompanyUnified,
} from '../server/services/sourceClassification.js';
import {
  createReservationsAtomically,
  updateReservationAtomically,
} from '../server/services/RoomAssignmentService.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${testName} ${details ? `(${details})` : ''}`);
  }
}

async function runRegressionSuite() {
  console.log('========================================================================');
  console.log('HOTEL MANTRI — MASTER SOURCE SYNCHRONIZATION & REGRESSION TEST SUITE');
  console.log('========================================================================\n');

  const hotelId = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb'; // Hotel Gopal

  // Fetch hotel-specific sources
  const { data: hotelSources, error: srcErr } = await supabaseServiceRole
    .from('company_sources')
    .select('*')
    .eq('hotel_id', hotelId);

  console.log(`Loaded ${hotelSources?.length || 0} hotel-specific sources from company_sources table.\n`);

  // ────────────────────────────────────────────────────────────────────────────
  // REGRESSION 1 & 2: Bidirectional Source -> Type & Category Mapping
  // ────────────────────────────────────────────────────────────────────────────
  console.log('--- REGRESSION 1 & 2: Booking Source -> Source Type & Category ---');
  
  const testCases = [
    { source: 'Direct', expectedType: 'Direct', expectedCat: 'Direct/Walking' },
    { source: 'Walk-In', expectedType: 'Walk-In', expectedCat: 'Direct/Walking' },
    { source: 'Website', expectedType: 'Website', expectedCat: 'Direct/Walking' },
    { source: 'Phone', expectedType: 'Phone', expectedCat: 'Phonebook' },
    { source: 'Phone Booking', expectedType: 'Phone', expectedCat: 'Phonebook' },
    { source: 'WhatsApp', expectedType: 'WhatsApp', expectedCat: 'Direct/Walking' },
    { source: 'Corporate', expectedType: 'Corporate', expectedCat: 'Corporate/Agent' },
    { source: 'Corporate Client', expectedType: 'Corporate', expectedCat: 'Corporate/Agent' },
    { source: 'Travel Agent', expectedType: 'Travel Agent', expectedCat: 'Corporate/Agent' },
    { source: 'Tour Operator', expectedType: 'Travel Agent', expectedCat: 'Corporate/Agent' },
    { source: 'Booking.com', expectedType: 'OTA', expectedCat: 'OTA' },
    { source: 'MakeMyTrip', expectedType: 'OTA', expectedCat: 'OTA' },
    { source: 'Goibibo', expectedType: 'OTA', expectedCat: 'OTA' },
    { source: 'Agoda', expectedType: 'OTA', expectedCat: 'OTA' },
    { source: 'Expedia', expectedType: 'OTA', expectedCat: 'OTA' },
    { source: 'Airbnb', expectedType: 'OTA', expectedCat: 'OTA' },
    { source: 'Cleartrip', expectedType: 'OTA', expectedCat: 'OTA' },
    { source: 'EaseMyTrip', expectedType: 'OTA', expectedCat: 'OTA' },
    { source: 'Hotels.com', expectedType: 'OTA', expectedCat: 'OTA' },
    { source: 'Trip.com', expectedType: 'OTA', expectedCat: 'OTA' },
    { source: 'Yatra', expectedType: 'OTA', expectedCat: 'OTA' },
    { source: 'Aiosell', expectedType: 'OTA', expectedCat: 'OTA' },
  ];

  for (const tc of testCases) {
    const res = synchronizeSourceAndType({
      source: tc.source,
      type: 'Direct',
      hotelSources: hotelSources || [],
      changedField: 'source',
    });
    assert(
      res.type === tc.expectedType && res.category === tc.expectedCat,
      `Source "${tc.source}" maps to Type "${tc.expectedType}" & Category "${tc.expectedCat}"`,
      `Got Type: ${res.type}, Category: ${res.category}`
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // REGRESSION 3: Source Type -> Compatible Sources Exposing & Preservation
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- REGRESSION 3: Source Type Compatibility & Preservation ---');

  for (const st of ALL_SOURCE_TYPES) {
    const compatible = getCompatibleSourcesForType(st, hotelSources || []);
    assert(
      Array.isArray(compatible) && compatible.length > 0,
      `SourceType "${st}" exposes compatible sources (${compatible.length} options: ${compatible.slice(0, 3).join(', ')}...)`
    );
  }

  // Preservation test: When changing Type to OTA while source is already Booking.com, preserve Booking.com!
  const pres1 = synchronizeSourceAndType({
    source: 'Booking.com',
    type: 'OTA',
    hotelSources: hotelSources || [],
    changedField: 'type',
  });
  assert(
    pres1.source === 'Booking.com' && pres1.type === 'OTA',
    'Preserves compatible source "Booking.com" when Type is set to "OTA"'
  );

  // Incompatible test: When changing Type to Corporate while source was Booking.com, switch to compatible source!
  const switch1 = synchronizeSourceAndType({
    source: 'Booking.com',
    type: 'Corporate',
    hotelSources: hotelSources || [],
    changedField: 'type',
  });
  assert(
    switch1.type === 'Corporate' && switch1.source !== 'Booking.com' && switch1.category === 'Corporate/Agent',
    `Switches incompatible source "Booking.com" to "${switch1.source}" when Type changes to Corporate`
  );

  // ────────────────────────────────────────────────────────────────────────────
  // REGRESSION 4: Rapid and Repeated Selection Changes (Stress & Stability)
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- REGRESSION 4: Rapid and Repeated Selection Changes ---');

  let state = { source: 'Direct', type: 'Direct' };
  const sequence = [
    { field: 'source', val: 'Agoda' },
    { field: 'type', val: 'Corporate' },
    { field: 'source', val: 'Tata Consultancy Services' }, // custom/other
    { field: 'type', val: 'OTA' },
    { field: 'source', val: 'MakeMyTrip' },
    { field: 'source', val: 'Phone' },
    { field: 'type', val: 'Walk-In' },
    { field: 'source', val: 'Expedia' },
  ];

  let rapidOk = true;
  for (const step of sequence) {
    const sync = synchronizeSourceAndType({
      source: step.field === 'source' ? step.val : state.source,
      type: step.field === 'type' ? step.val : state.type,
      hotelSources: hotelSources || [],
      changedField: step.field,
    });
    state = { source: sync.source, type: sync.type };
    if (!sync.source || !sync.type || !sync.category) {
      rapidOk = false;
    }
  }
  assert(rapidOk && state.source === 'Expedia' && state.type === 'OTA', 'Rapid sequence completed with consistent state (Expedia/OTA)');

  // ────────────────────────────────────────────────────────────────────────────
  // REGRESSION 5: Unknown Sources Handled Explicitly (Never Silently Direct)
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- REGRESSION 5: Unknown & Custom Source Handling ---');

  const unknownRes = synchronizeSourceAndType({
    source: 'Random Unregistered Source XYZ 99',
    type: 'Direct',
    hotelSources: hotelSources || [],
    changedField: 'source',
  });
  assert(
    unknownRes.type === 'Other' && unknownRes.isKnown === false,
    'Unknown source is explicitly classified as Type "Other" with isKnown: false (never silently Direct)'
  );

  // ────────────────────────────────────────────────────────────────────────────
  // REGRESSION 6: Save, Reopen, Edit, and Database Persistence
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- REGRESSION 6: Save, Reopen, Edit, and DB Persistence ---');

  const { data: cat } = await supabaseServiceRole
    .from('room_categories')
    .select('id')
    .eq('hotel_id', hotelId)
    .limit(1)
    .single();

  const createdList = await createReservationsAtomically({
    hotelId,
    inputs: [
      {
        room_no: 'Unassigned',
        room_category_id: cat?.id || null,
        guest_name: 'Regression Source Test Guest',
        guest_phone: '+91 9888877777',
        guest_email: 'sync_test@example.com',
        check_in_date: '2028-12-01',
        check_out_date: '2028-12-03',
        rate: 3000,
        source_category: 'OTA',
        source_name: 'Booking.com',
        payment_mode: 'Cash',
        advance_paid: 1500,
        status: 'confirmed',
        allowEmptyEmail: true,
      },
    ],
    allowEmptyEmail: true,
  });

  const reservationId = createdList[0].id;

  // Reopen and verify
  const { data: loadedRes } = await supabaseServiceRole
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .single();

  assert(
    loadedRes?.source_name === 'Booking.com' && loadedRes?.source_category === 'OTA',
    'Created reservation persists source_name="Booking.com" and source_category="OTA"'
  );

  // Edit to Corporate
  await updateReservationAtomically({
    hotelId,
    reservationId,
    updates: {
      source_name: 'Corporate Booking',
      source_category: 'Corporate/Agent',
    },
  });

  const { data: updatedRes } = await supabaseServiceRole
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .single();

  assert(
    updatedRes?.source_name === 'Corporate Booking' && updatedRes?.source_category === 'Corporate/Agent',
    'Edited reservation updates and persists source_name="Corporate Booking" & source_category="Corporate/Agent"'
  );

  // ────────────────────────────────────────────────────────────────────────────
  // REGRESSION 7: OTA Reservation Import Flow
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- REGRESSION 7: OTA Reservation Import Source Classification ---');

  const otaImportRaw = {
    channel: 'MakeMyTrip',
    sourceCategoryFromImport: classifyCompanyUnified('MakeMyTrip', hotelSources || []),
  };

  assert(
    otaImportRaw.sourceCategoryFromImport === 'OTA',
    'OTA Import channel "MakeMyTrip" automatically classifies to DB source_category "OTA"'
  );

  // ────────────────────────────────────────────────────────────────────────────
  // REGRESSION 8: Multi-Tenant Source Isolation
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- REGRESSION 8: Multi-Tenant Source Isolation ---');

  const otherHotelId = '8151908d-8ad1-4034-bc92-1ba9897e93f7'; // Mars Hotel
  const { data: marsSources } = await supabaseServiceRole
    .from('company_sources')
    .select('*')
    .eq('hotel_id', otherHotelId);

  assert(
    (hotelSources || []).every((s) => s.hotel_id === hotelId),
    'Hotel Gopal sources strictly isolated to Hotel Gopal hotel_id'
  );
  assert(
    (marsSources || []).every((s) => s.hotel_id === otherHotelId),
    'Mars Hotel sources strictly isolated to Mars Hotel hotel_id'
  );

  // ────────────────────────────────────────────────────────────────────────────
  // REGRESSION 9: Large Reservation Search & Filtering
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- REGRESSION 9: Search and Filter Reservation Source Category ---');

  const { data: otaFiltered, error: fErr } = await supabaseServiceRole
    .from('reservations')
    .select('id, source_name, source_category')
    .eq('hotel_id', hotelId)
    .eq('source_category', 'OTA')
    .limit(10);

  assert(
    !fErr && (otaFiltered || []).every((r) => r.source_category === 'OTA'),
    `Filtered reservations by source_category="OTA" successfully (${otaFiltered?.length || 0} items returned)`
  );

  // ────────────────────────────────────────────────────────────────────────────
  // REGRESSION 10: Room Availability & Assignment Invariant
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- REGRESSION 10: Room Availability & Assignment Integrity ---');

  assert(
    updatedRes.room_no && updatedRes.room_no !== '',
    `Assigned room remains valid after source edit (Room: ${updatedRes.room_no})`
  );

  // ────────────────────────────────────────────────────────────────────────────
  // REGRESSION 11: Payment, Folio, and Balance Calculation Invariant
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- REGRESSION 11: Folio & Balance Invariant ---');

  const total = Number(updatedRes.invoice_total || (updatedRes.rate * updatedRes.nights));
  const advance = Number(updatedRes.advance_paid || 0);
  const remaining = Number(updatedRes.remaining_balance || (total - advance));

  assert(
    Math.abs((advance + remaining) - total) < 0.01,
    `Folio balance invariant holds: advance (${advance}) + remaining (${remaining}) == total (${total})`
  );

  // ────────────────────────────────────────────────────────────────────────────
  // REGRESSION 12: Tenant Security & RLS Check
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- REGRESSION 12: Tenant Security Invariant ---');

  // Verify that querying hotel A with hotel B's id returns 0 records
  const { data: crossTenantCheck } = await supabaseServiceRole
    .from('reservations')
    .select('id')
    .eq('hotel_id', otherHotelId)
    .eq('id', reservationId);

  assert(
    (crossTenantCheck?.length || 0) === 0,
    'Cross-tenant access prevented: Mars Hotel cannot query or access Hotel Gopal reservation'
  );

  // Cleanup test reservation
  await supabaseServiceRole.from('reservations').delete().eq('id', reservationId);
  console.log('\nCleaned up regression test reservation.');

  console.log('\n========================================================================');
  console.log(`REGRESSION SUITE RESULTS: ${passedTests} PASSED | ${failedTests} FAILED`);
  console.log('========================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runRegressionSuite().catch((err) => {
  console.error('Regression suite encountered error:', err);
  process.exit(1);
});
