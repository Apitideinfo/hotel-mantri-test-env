/**
 * HOTEL MANTRI — Verification Test Suite
 * Task 1: Dynamic Top Booking Sources & Multi-Tenant Revenue Isolation
 * Task 2: Confirmed Landing Page Office Locations
 * Task 3: Official Brand Logo & Responsive Zero-CLS Asset Display
 */

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { calculateDayWiseRevenue } from '../server/services/RevenueCalculationService.js';
import { OFFICIAL_BRANCHES, COMPANY_CONTACT } from '../src/config/company.ts';
import fs from 'fs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

let passed = 0;
let failed = 0;

function assert(cond, name, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ PASS: ${name}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${name} ${detail ? `(${detail})` : ''}`);
  }
}

async function run() {
  console.log('========================================================================');
  console.log('HOTEL MANTRI — VERIFICATION SUITE: BOOKING SOURCES & LANDING PAGE');
  console.log('========================================================================\n');

  // ────────────────────────────────────────────────────────────────────────────
  // TEST SECTION 1: Dynamic Top Booking Sources & Revenue Calculation
  // ────────────────────────────────────────────────────────────────────────────
  console.log('--- TEST SECTION 1: Dynamic Top Booking Sources ---');

  const swagatHotelId = 'aa5bfd36-de50-4217-8997-d2cd18e4dfe8';
  const gopalHotelId = 'df9a4949-afb9-404d-ae37-e11457fa624e';

  // 1.1 Calculate revenue for Hotel Swagat for full year 2026
  const fullYearSwagat = await calculateDayWiseRevenue({
    hotelId: swagatHotelId,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  });

  assert(Array.isArray(fullYearSwagat.bookingSources), 'calculateDayWiseRevenue returns bookingSources array');
  assert(fullYearSwagat.bookingSources.length > 0, `Hotel Swagat has booking sources (${fullYearSwagat.bookingSources.length} channels found)`);

  // Verify descending revenue sort order
  let isSorted = true;
  for (let i = 1; i < fullYearSwagat.bookingSources.length; i++) {
    if (fullYearSwagat.bookingSources[i].revenue > fullYearSwagat.bookingSources[i - 1].revenue) {
      isSorted = false;
      break;
    }
  }
  assert(isSorted, 'Top booking sources are sorted by revenue descending');

  // Verify top source is real Supabase channel
  const topSource = fullYearSwagat.bookingSources[0];
  console.log(`    Top channel for Swagat: ${topSource.name} (${topSource.bookings} bookings, ₹${topSource.revenue}, ${topSource.sharePercent}%)`);
  assert(topSource.revenue > 0, 'Top channel has positive revenue');
  assert(topSource.bookings > 0, 'Top channel has positive booking count');
  assert(typeof topSource.name === 'string' && topSource.name.trim().length > 0, 'Channel name is non-empty string');

  // Verify no hardcoded demonstration values
  const hasHardcodedValues = fullYearSwagat.bookingSources.some(
    (s) => (s.name === 'MakeMyTrip' && s.bookings === 42 && s.revenue === 165000) ||
           (s.name === 'Direct Walk-in' && s.bookings === 28 && s.revenue === 115000) ||
           (s.name === 'Booking.com' && s.bookings === 18 && s.revenue === 68000)
  );
  assert(!hasHardcodedValues, 'Zero hardcoded demonstration metrics in calculation result');

  // 1.2 Verify Multi-Tenant Scoping (Switching Hotels)
  console.log('\n--- TEST SECTION 2: Multi-Tenant Hotel Scoping ---');
  const gopalPeriod = await calculateDayWiseRevenue({
    hotelId: gopalHotelId,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  });

  // Verify Swagat's reservation IDs do not appear in Gopal
  const swagatResvIds = new Set(fullYearSwagat.reservationsBreakdown.map((r) => r.reservationId));
  const gopalResvIds = new Set(gopalPeriod.reservationsBreakdown.map((r) => r.reservationId));
  let crossLeaked = false;
  for (const id of gopalResvIds) {
    if (swagatResvIds.has(id)) {
      crossLeaked = true;
      break;
    }
  }
  assert(!crossLeaked, 'Zero cross-tenant leakage between Hotel Swagat and Hotel Gopal');

  // 1.3 Verify Date Filter Scoping
  console.log('\n--- TEST SECTION 3: Date Filtering Scoping ---');
  // Date range with no reservations (past year)
  const emptyPast = await calculateDayWiseRevenue({
    hotelId: swagatHotelId,
    startDate: '2024-01-01',
    endDate: '2024-01-07',
  });
  assert(Array.isArray(emptyPast.bookingSources) && emptyPast.bookingSources.length === 0, 'Empty period returns empty bookingSources array without fallback data');
  assert(emptyPast.summary.roomRevenue === 0, 'Empty period returns ₹0 room revenue');

  // Single date filter
  const singleDate = await calculateDayWiseRevenue({
    hotelId: swagatHotelId,
    date: '2026-10-22',
  });
  assert(Array.isArray(singleDate.bookingSources), 'Single date query returns valid bookingSources');
  console.log(`    Channels active on 2026-10-22: ${singleDate.bookingSources.length}`);

  // ────────────────────────────────────────────────────────────────────────────
  // TEST SECTION 4: Landing Page Office Locations
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST SECTION 4: Confirmed Office Locations ---');
  assert(Array.isArray(OFFICIAL_BRANCHES) && OFFICIAL_BRANCHES.length === 3, 'OFFICIAL_BRANCHES lists exactly 3 locations');

  const branchLabels = OFFICIAL_BRANCHES.map((b) => b.label);
  assert(branchLabels.includes('Ahmedabad, Gujarat'), 'Contains Ahmedabad, Gujarat');
  assert(branchLabels.includes('Rajkot, Gujarat'), 'Contains Rajkot, Gujarat');
  assert(branchLabels.includes('Delhi, India'), 'Contains Delhi, India');

  // Ensure no fabricated street addresses
  const hasStreetAddress = OFFICIAL_BRANCHES.some((b) => b.address || b.street || b.pincode || b.zip);
  assert(!hasStreetAddress, 'No fabricated street addresses or postal codes in branch configuration');

  // Ensure official contact details are preserved
  assert(COMPANY_CONTACT.phoneDisplay === '+91 99259 58831', 'Official phone is preserved (+91 99259 58831)');
  assert(COMPANY_CONTACT.email === 'booking@hotelmantri.com', 'Official email is preserved (booking@hotelmantri.com)');

  // ────────────────────────────────────────────────────────────────────────────
  // TEST SECTION 5: Official Brand Logo & Local Assets
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST SECTION 5: Brand Logo Assets & Zero-CLS ---');
  assert(fs.existsSync('public/hotel-mantri-icon-clean.png'), 'public/hotel-mantri-icon-clean.png exists locally');
  
  const iconBuf = fs.readFileSync('public/hotel-mantri-icon-clean.png');
  const width = iconBuf.readUInt32BE(16);
  const height = iconBuf.readUInt32BE(20);
  assert(width > 0 && height > 0, `Icon dimensions valid: ${width}x${height}`);

  const footerCode = fs.readFileSync('src/components/landing/Footer.tsx', 'utf8');
  assert(footerCode.includes('<BrandLogo variant="landing-footer" onDark={true}'), 'Footer.tsx renders BrandLogo with landing-footer variant on dark');
  assert(footerCode.includes('OFFICIAL_BRANCHES'), 'Footer.tsx maps OFFICIAL_BRANCHES dynamically');

  const headerCode = fs.readFileSync('src/components/landing/Header.tsx', 'utf8');
  assert(headerCode.includes('<BrandLogo variant="landing-header" onDark={false}'), 'Header.tsx renders BrandLogo with landing-header variant on light');

  const ytdCompCode = fs.readFileSync('src/components/dashboard/YtdAndBookingSources.tsx', 'utf8');
  assert(!ytdCompCode.includes("name: 'MakeMyTrip', bookings: 42"), 'YtdAndBookingSources.tsx contains no hardcoded MakeMyTrip fallback');
  assert(!ytdCompCode.includes("roomRevenue: 288000"), 'YtdAndBookingSources.tsx contains no hardcoded 288000 YTD fallback');

  console.log('\n========================================================================');
  console.log(`TEST RUN COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
