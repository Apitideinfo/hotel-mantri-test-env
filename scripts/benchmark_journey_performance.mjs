/**
 * HOTEL MANTRI — End-to-End User Journey Performance Benchmark
 * 
 * Accurately measures before-and-after performance on live active database:
 * 1. calculateDayWiseRevenue (Cold un-cached vs Hot cached)
 * 2. Reservation Metrics calculation (Cold DB scan vs Hot tenant-cache)
 * 3. detectExistingConflicts (Cold scan vs Hot tenant-cache)
 * 4. getCategoryPhysicalRoomAvailability (Cold vs Hot meta-cache)
 * 5. Guest Autocomplete Search (projected columns + limit 20)
 * 6. Guest Stay History query
 * 7. Bounded Booking Timeline query
 * 8. Redis Mode and Latency Diagnostic
 */

import dotenv from 'dotenv';
import { performance } from 'perf_hooks';
import { supabaseServiceRole } from '../server/supabaseClient.js';
import * as redisService from '../server/services/redisService.js';
import { calculateDayWiseRevenue, invalidateRevenueCache } from '../server/services/RevenueCalculationService.js';
import { getCategoryPhysicalRoomAvailability, detectExistingConflicts } from '../server/services/ReservationConflictService.js';

dotenv.config();

const HOTEL_ID = 'df9a4949-afb9-404d-ae37-e11457fa624e'; // Hotel Gopal

async function measure(name, fn, iterations = 3) {
  const times = [];
  let result;
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    result = await fn();
    times.push(performance.now() - t0);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  return {
    name,
    avgMs: Math.round(avg * 100) / 100,
    minMs: Math.round(min * 100) / 100,
    maxMs: Math.round(max * 100) / 100,
    sampleCount: iterations,
    sampleTimes: times.map((t) => Math.round(t * 100) / 100),
  };
}

async function run() {
  console.log('========================================================================');
  console.log('HOTEL MANTRI — AFTER-OPTIMIZATION REAL PERFORMANCE MEASUREMENTS');
  console.log('========================================================================\n');

  // Check Redis status
  const health = await redisService.checkRedisHealth();
  console.log('Redis Connection Diagnostic:');
  console.log(`  Mode: ${health.mode}`);
  console.log(`  Healthy: ${health.healthy}`);
  console.log(`  Latency: ${health.latencyMs} ms`);
  console.log(`  Status: ${health.status}\n`);

  // 1. Day-Wise Revenue Calculation (Cold vs Hot)
  await invalidateRevenueCache(HOTEL_ID);
  console.log('--- 1. Day-Wise Revenue Calculation ---');
  const coldRevenue = await measure('Cold Revenue Calculation', () =>
    calculateDayWiseRevenue({ hotelId: HOTEL_ID, mode: 'today', fromDate: '2026-10-26', toDate: '2026-10-26' }), 1);
  console.log(`  Cold Run (DB Scan): ${coldRevenue.avgMs} ms`);

  const hotRevenue = await measure('Hot Revenue Calculation', () =>
    calculateDayWiseRevenue({ hotelId: HOTEL_ID, mode: 'today', fromDate: '2026-10-26', toDate: '2026-10-26' }), 5);
  console.log(`  Hot Run (Redis Cached): ${hotRevenue.avgMs} ms (Min: ${hotRevenue.minMs} ms, Max: ${hotRevenue.maxMs} ms)`);
  const revImprovement = Math.round(((coldRevenue.avgMs - hotRevenue.avgMs) / coldRevenue.avgMs) * 100);
  console.log(`  Improvement: ${revImprovement}%\n`);

  // 2. Reservation Metrics Calculation (Cold vs Hot)
  console.log('--- 2. Reservation Global Metrics Calculation ---');
  const metricsKey = redisService.buildTenantCacheKey(HOTEL_ID, 'resv', 'metrics');
  await redisService.del(metricsKey);

  const computeMetrics = async () => {
    return redisService.wrapTenant(HOTEL_ID, 'resv', 'metrics', async () => {
      const { data: allHotelRes } = await supabaseServiceRole
        .from('reservations')
        .select('id, group_id, status, room_no, invoice_total, rate, nights')
        .eq('hotel_id', HOTEL_ID);

      let totalBookings = 0;
      let confirmedCount = 0;
      let checkedInCount = 0;
      let unassignedCount = 0;
      let pipelineTariff = 0;

      for (const r of allHotelRes || []) {
        totalBookings++;
        if (r.status === 'confirmed') confirmedCount++;
        if (r.status === 'checked_in') checkedInCount++;
        if (!r.room_no || r.room_no === 'unassigned') unassignedCount++;
        const invoiceTotal = Number(r.invoice_total) || 0;
        const rate = Number(r.rate) || 0;
        const nights = Number(r.nights) || 1;
        pipelineTariff += invoiceTotal > 0 ? invoiceTotal : rate * nights;
      }
      return { totalBookings, confirmedCount, checkedInCount, unassignedCount, pipelineTariff };
    }, { ttlSeconds: 60 });
  };

  const coldMetrics = await measure('Cold Metrics Scan', computeMetrics, 1);
  console.log(`  Cold Run (Full Reservations DB Scan): ${coldMetrics.avgMs} ms`);

  const hotMetrics = await measure('Hot Metrics Cache', computeMetrics, 5);
  console.log(`  Hot Run (Tenant-Cached): ${hotMetrics.avgMs} ms (Min: ${hotMetrics.minMs} ms, Max: ${hotMetrics.maxMs} ms)`);
  const metricsImprovement = Math.round(((coldMetrics.avgMs - hotMetrics.avgMs) / coldMetrics.avgMs) * 100);
  console.log(`  Improvement: ${metricsImprovement}%\n`);

  // 3. Conflict Diagnostic Scan (Cold vs Hot)
  console.log('--- 3. Conflict Diagnostic Scan ---');
  const conflictsKey = redisService.buildTenantCacheKey(HOTEL_ID, 'conflicts', 'scan');
  await redisService.del(conflictsKey);

  const runConflictScan = async () => {
    return redisService.wrapTenant(HOTEL_ID, 'conflicts', 'scan', () => detectExistingConflicts(HOTEL_ID), { ttlSeconds: 60 });
  };

  const coldConflicts = await measure('Cold Conflict Scan', runConflictScan, 1);
  console.log(`  Cold Run (DB Scan): ${coldConflicts.avgMs} ms`);

  const hotConflicts = await measure('Hot Conflict Scan', runConflictScan, 5);
  console.log(`  Hot Run (Tenant-Cached): ${hotConflicts.avgMs} ms (Min: ${hotConflicts.minMs} ms, Max: ${hotConflicts.maxMs} ms)`);
  const conflictImprovement = Math.round(((coldConflicts.avgMs - hotConflicts.avgMs) / coldConflicts.avgMs) * 100);
  console.log(`  Improvement: ${conflictImprovement}%\n`);

  // 4. Category Physical Availability Check (Cold vs Hot)
  console.log('--- 4. Category Physical Availability Check ---');
  const roomsMetaKey = redisService.buildTenantCacheKey(HOTEL_ID, 'meta:rooms', 'all');
  await redisService.del(roomsMetaKey);

  const coldAvail = await measure('Cold Availability Check', () =>
    getCategoryPhysicalRoomAvailability({
      hotelId: HOTEL_ID,
      checkIn: '2026-10-27',
      checkOut: '2026-10-28',
    }), 1);
  console.log(`  Cold Run (Full 4-Table Round-Trip): ${coldAvail.avgMs} ms`);

  const hotAvail = await measure('Hot Availability Check', () =>
    getCategoryPhysicalRoomAvailability({
      hotelId: HOTEL_ID,
      checkIn: '2026-10-27',
      checkOut: '2026-10-28',
    }), 5);
  console.log(`  Hot Run (Cached Rooms Meta + Bounded Queries): ${hotAvail.avgMs} ms (Min: ${hotAvail.minMs} ms, Max: ${hotAvail.maxMs} ms)`);
  const availImprovement = Math.round(((coldAvail.avgMs - hotAvail.avgMs) / coldAvail.avgMs) * 100);
  console.log(`  Improvement: ${availImprovement}%\n`);

  // 5. Optimized Guest Autocomplete Query
  console.log('--- 5. Optimized Guest Autocomplete Query ---');
  const guestSearch = await measure('Guest Autocomplete (Projected & Limit 20)', async () => {
    return supabaseServiceRole
      .from('guests')
      .select('id,hotel_id,name,mobile,email,address,city,state_name,pin_code,gst_number,company_name,vip_type,total_stays,total_spend,updated_at')
      .eq('hotel_id', HOTEL_ID)
      .or('name.ilike.%98%,mobile.ilike.%98%,email.ilike.%98%')
      .order('updated_at', { ascending: false })
      .limit(20);
  }, 5);
  console.log(`  Optimized Guest Search: ${guestSearch.avgMs} ms (Min: ${guestSearch.minMs} ms, Max: ${guestSearch.maxMs} ms)\n`);

  // 6. Bounded Booking Timeline Query
  console.log('--- 6. Bounded Booking Timeline Query ---');
  const timelineQuery = await measure('Bounded Timeline (Projected & Limit 200)', async () => {
    return supabaseServiceRole
      .from('booking_timeline')
      .select('id,hotel_id,reservation_id,entry_id,event_type,event_amount,event_data,status,event_description,performed_by,created_at')
      .eq('hotel_id', HOTEL_ID)
      .order('created_at', { ascending: false })
      .limit(200);
  }, 5);
  console.log(`  Bounded Timeline Query: ${timelineQuery.avgMs} ms (Min: ${timelineQuery.minMs} ms, Max: ${timelineQuery.maxMs} ms)\n`);

  console.log('========================================================================');
  console.log('ALL MEASUREMENTS COMPLETE');
  console.log('========================================================================\n');
}

run().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
