/**
 * HOTEL MANTRI — Performance Benchmark Suite
 * Measures key backend queries, API endpoints, availability checks,
 * reservation search/filtering, and dashboard KPI query durations.
 */

import dotenv from 'dotenv';
dotenv.config();

import { performance } from 'perf_hooks';
import { supabaseServiceRole } from '../server/supabaseClient.js';
import {
  getCategoryPhysicalRoomAvailability,
  checkRoomAvailability,
} from '../server/services/ReservationConflictService.js';
import {
  createReservationsAtomically,
  updateReservationAtomically,
} from '../server/services/RoomAssignmentService.js';

async function runBenchmark() {
  console.log('========================================================================');
  console.log('HOTEL MANTRI — PERFORMANCE AUDIT & BENCHMARK');
  console.log('========================================================================\n');

  // 1. Identify Test Hotel with categories (Hotel Gopal)
  const hotelId = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb';
  const { data: testHotel, error: hErr } = await supabaseServiceRole
    .from('hotel_settings')
    .select('id, hotel_name')
    .eq('id', hotelId)
    .single();

  if (hErr || !testHotel) {
    console.error('Failed to load test hotel:', hErr);
    process.exit(1);
  }

  console.log(`Auditing Hotel: "${testHotel.hotel_name}" (${testHotel.id})`);

  const { data: categories } = await supabaseServiceRole
    .from('room_categories')
    .select('id, name')
    .eq('hotel_id', testHotel.id)
    .eq('is_active', true);

  const testCategory = categories?.[0];
  console.log(`Primary Category: "${testCategory?.name || 'All'}" (${testCategory?.id})\n`);

  const results = {};

  // ─── 1. Check Availability & Category Availability Latency ─────────────────
  console.log('--- 1. Check Availability & Category Availability ---');
  if (testCategory) {
    const t0 = performance.now();
    const catAvail = await getCategoryPhysicalRoomAvailability({
      hotelId: testHotel.id,
      categoryId: testCategory.id,
      checkIn: '2028-09-01',
      checkOut: '2028-09-05',
    });
    const catDuration = performance.now() - t0;
    results.categoryAvailability = Math.round(catDuration);
    console.log(`  Category Availability Check: ${Math.round(catDuration)} ms (${catAvail.totalRooms} total rooms, ${catAvail.availableRooms} available)`);

    const t1 = performance.now();
    const roomAvail = await checkRoomAvailability({
      hotelId: testHotel.id,
      roomNo: catAvail.availableRoomNos?.[0] || '101',
      checkIn: '2028-09-01',
      checkOut: '2028-09-05',
    });
    const roomDuration = performance.now() - t1;
    results.singleRoomAvailability = Math.round(roomDuration);
    console.log(`  Single Room Availability Check: ${Math.round(roomDuration)} ms (available: ${roomAvail.available})`);
  }

  // ─── 2. Reservation Search & Filtering Query Latency ───────────────────────
  console.log('\n--- 2. Reservation Search & Filtering Query Duration ---');
  // 2a. Simple paginated query (20 items)
  const t2a = performance.now();
  const { data: paginatedRes, error: pErr } = await supabaseServiceRole
    .from('reservations')
    .select('*')
    .eq('hotel_id', testHotel.id)
    .order('check_in_date', { ascending: false })
    .range(0, 19);
  const pDuration = performance.now() - t2a;
  results.reservationPaginatedQuery = Math.round(pDuration);
  console.log(`  Paginated Reservations Query (20 items): ${Math.round(pDuration)} ms`);

  // 2b. Search with ILIKE filters (guest_name, phone, room)
  const t2b = performance.now();
  const { data: searchRes } = await supabaseServiceRole
    .from('reservations')
    .select('*')
    .eq('hotel_id', testHotel.id)
    .or('guest_name.ilike.%Sharma%,guest_phone.ilike.%9909%,room_no.ilike.%101%')
    .order('check_in_date', { ascending: false })
    .limit(20);
  const searchDuration = performance.now() - t2b;
  results.reservationSearchQuery = Math.round(searchDuration);
  console.log(`  Filtered Search Query (ILIKE on 3 fields): ${Math.round(searchDuration)} ms`);

  // 2c. Global Pipeline Tariff full-table scan (current backend implementation)
  const t2c = performance.now();
  const { data: allHotelRes } = await supabaseServiceRole
    .from('reservations')
    .select('id, group_id, status, room_no, invoice_total, rate, nights')
    .eq('hotel_id', testHotel.id);
  const fullScanDuration = performance.now() - t2c;
  results.reservationFullScanMetrics = Math.round(fullScanDuration);
  console.log(`  Uncached Full-Scan Pipeline Metrics Scan: ${Math.round(fullScanDuration)} ms (${allHotelRes?.length || 0} rows)`);

  // ─── 3. Operations Board & Room Chart Query Latency ────────────────────────
  console.log('\n--- 3. Operations Board & Date Range Stays ---');
  const t3 = performance.now();
  const { data: chartEntries } = await supabaseServiceRole
    .from('room_chart_entries')
    .select('*')
    .eq('hotel_id', testHotel.id)
    .gte('report_date', '2026-09-01')
    .lte('report_date', '2026-10-31')
    .order('report_date', { ascending: true });
  const chartDuration = performance.now() - t3;
  results.operationsBoardRoomChart = Math.round(chartDuration);
  console.log(`  Operations Board Room Chart Range (60 days): ${Math.round(chartDuration)} ms`);

  // ─── 4. Dashboard KPI / Day-wise Loading Duration ──────────────────────────
  console.log('\n--- 4. Dashboard KPI & Settings Loading ---');
  const t4a = performance.now();
  const { data: stg } = await supabaseServiceRole
    .from('hotel_settings')
    .select('*')
    .eq('id', testHotel.id)
    .single();
  const stgDuration = performance.now() - t4a;
  results.hotelSettingsFetch = Math.round(stgDuration);
  console.log(`  Hotel Settings Fetch: ${Math.round(stgDuration)} ms`);

  const t4b = performance.now();
  const { data: sources } = await supabaseServiceRole
    .from('company_sources')
    .select('*')
    .eq('hotel_id', testHotel.id)
    .order('name');
  const sourcesDuration = performance.now() - t4b;
  results.companySourcesFetch = Math.round(sourcesDuration);
  console.log(`  Company Sources Fetch: ${Math.round(sourcesDuration)} ms (${sources?.length || 0} configured sources)`);

  // ─── 5. Reservation Save & Edit Response Time ──────────────────────────────
  console.log('\n--- 5. Reservation Save & Edit End-to-End Latency ---');
  const testReservationInput = {
    room_no: 'Unassigned',
    room_category_id: testCategory?.id || null,
    guest_name: 'Benchmark Test Guest',
    guest_phone: '+91 9909999999',
    guest_email: 'benchmark@example.com',
    check_in_date: '2028-11-10',
    check_out_date: '2028-11-12',
    rate: 2500,
    source_category: 'OTA',
    source_name: 'MakeMyTrip',
    payment_mode: 'Cash',
    advance_paid: 1000,
    status: 'confirmed',
    allowEmptyEmail: true,
  };

  const t5a = performance.now();
  const created = await createReservationsAtomically({
    hotelId: testHotel.id,
    inputs: [testReservationInput],
    allowEmptyEmail: true,
  });
  const saveDuration = performance.now() - t5a;
  results.reservationSaveLatency = Math.round(saveDuration);
  console.log(`  Atomic Reservation Create (with validation & timeline): ${Math.round(saveDuration)} ms`);

  const createdId = created[0].id;

  const t5b = performance.now();
  await updateReservationAtomically({
    hotelId: testHotel.id,
    reservationId: createdId,
    updates: {
      guest_name: 'Benchmark Test Guest (Modified)',
      source_name: 'Booking.com',
      source_category: 'OTA',
    },
  });
  const editDuration = performance.now() - t5b;
  results.reservationEditLatency = Math.round(editDuration);
  console.log(`  Atomic Reservation Update (source edit & revalidation): ${Math.round(editDuration)} ms`);

  // Cleanup test record
  await supabaseServiceRole.from('reservations').delete().eq('id', createdId);

  console.log('\n========================================================================');
  console.log('SUMMARY OF MEASURED BASELINE METRICS:');
  console.log(JSON.stringify(results, null, 2));
  console.log('========================================================================');
}

runBenchmark().catch(err => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
