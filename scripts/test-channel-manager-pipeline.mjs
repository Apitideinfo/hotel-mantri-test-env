import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import aiosellRoutes from '../server/routes/aiosell.js';
import channelRoutes from '../server/routes/channels.js';
import { supabaseServiceRole } from '../server/supabaseClient.js';

const app = express();
app.use(express.json());

// Mock auth middleware for automated test suite
const HOTEL_ID = 'a93139f5-baa0-47a4-87ca-81ee7e106d9c'; // Hotel Gopal
const CHANNEL_ID = '2e09f0c3-3f84-4660-8aad-1e7f586d4e3c'; // Agoda for Hotel Gopal

app.use((req, res, next) => {
  req.user = {
    id: '17db5803-ff3c-42cb-b169-c290130cfd69',
    email: 'hotel.mantri74@gmail.com'
  };
  req.auth = {
    userId: '17db5803-ff3c-42cb-b169-c290130cfd69',
    role: 'super_admin',
    hotelId: HOTEL_ID,
    hotel: { id: HOTEL_ID, hotel_name: 'Hotel Gopal' }
  };
  req.hotelId = HOTEL_ID;
  req.userRole = 'super_admin';
  req.requestId = `TEST-${Date.now()}`;
  next();
});

app.use('/api/aiosell', aiosellRoutes);
app.use('/api/channels', channelRoutes);

const PORT = 5098;

async function runTests() {
  const server = app.listen(PORT, async () => {
    console.log(`Test server running on port ${PORT}...`);
    let passed = 0;
    let failed = 0;

    function assert(name, condition, extra = '') {
      if (condition) {
        console.log(`  ✓ ${name} ${extra}`);
        passed++;
      } else {
        console.error(`  ✗ ${name} ${extra}`);
        failed++;
      }
    }

    try {
      console.log('\n--- 1. Health & Status Tests ---');
      const healthRes = await fetch(`http://localhost:${PORT}/api/aiosell/health`);
      const healthData = await healthRes.json();
      assert('GET /api/aiosell/health returns 200 OK', healthRes.status === 200);
      assert('Health service reports ok', healthData.status === 'ok');

      console.log('\n--- 2. Server-side Connection Test ---');
      const testConnRes = await fetch(`http://localhost:${PORT}/api/channels/test-connection`, {
        method: 'POST'
      });
      const testConnData = await testConnRes.json();
      assert('POST /api/channels/test-connection returns 200', testConnRes.status === 200);
      assert('Connection test status is connected', testConnData.status === 'connected');
      assert('Connection verified hotelCode', testConnData.hotelCode === 'fa44d51cc0');
      assert('Connection verified partnerId', testConnData.partnerId === 'hotel-mantri-pms');

      console.log('\n--- 3. Add Channel & Conflict Handling ---');
      const addDupRes = await fetch(`http://localhost:${PORT}/api/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelType: 'agoda',
          displayName: 'Agoda'
        })
      });
      const addDupData = await addDupRes.json();
      assert('POST /api/channels duplicate returns 409 Conflict', addDupRes.status === 409);
      assert('Duplicate returns code CHANNEL_ALREADY_EXISTS', addDupData.code === 'CHANNEL_ALREADY_EXISTS');
      assert('Duplicate response contains existing channelId', addDupData.channelId === CHANNEL_ID, `(got ${addDupData.channelId})`);

      console.log('\n--- 4. Inventory Sync & Rate Sync (Mapping Guardrails) ---');
      const invSyncRes = await fetch(`http://localhost:${PORT}/api/channels/${CHANNEL_ID}/sync/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: '2026-09-01',
          endDate: '2026-09-30'
        })
      });
      const invSyncData = await invSyncRes.json();
      // If unmapped, should return 422 with MAPPING_REQUIRED, not 500!
      // If mapped, returns 200 with result.
      const invValid = (invSyncRes.status === 422 && invSyncData.code === 'MAPPING_REQUIRED') || (invSyncRes.status === 200 && invSyncData.success);
      assert('POST /api/channels/:channelId/sync/inventory does NOT return 500', invSyncRes.status !== 500, `(status: ${invSyncRes.status}, code: ${invSyncData.code})`);
      assert('Inventory sync properly guarded by mapping check', invValid, `(status: ${invSyncRes.status}, code: ${invSyncData.code})`);

      const rateSyncRes = await fetch(`http://localhost:${PORT}/api/channels/${CHANNEL_ID}/sync/rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: '2026-09-01',
          endDate: '2026-09-30'
        })
      });
      const rateSyncData = await rateSyncRes.json();
      const rateValid = (rateSyncRes.status === 422 && rateSyncData.code === 'RATE_MAPPING_REQUIRED') || (rateSyncRes.status === 200 && rateSyncData.success);
      assert('POST /api/channels/:channelId/sync/rates does NOT return 500', rateSyncRes.status !== 500, `(status: ${rateSyncRes.status}, code: ${rateSyncData.code})`);
      assert('Rate sync properly guarded by mapping check', rateValid, `(status: ${rateSyncRes.status}, code: ${rateSyncData.code})`);

      console.log('\n--- 5. Future Bookings End-to-End Test ---');
      const futureBookingsRes = await fetch(`http://localhost:${PORT}/api/channels/${CHANNEL_ID}/future-bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: '2026-09-01',
          endDate: '2026-09-30'
        })
      });
      const futureBookingsData = await futureBookingsRes.json();
      assert('POST /api/channels/:channelId/future-bookings returns 200 OK', futureBookingsRes.status === 200, `(status: ${futureBookingsRes.status})`);
      assert('Future bookings response does not fail with "Partner is disabled"', futureBookingsData.success === true, `(success: ${futureBookingsData.success})`);
      assert('Future bookings contains stats object', !!futureBookingsData.stats, `(stats: ${JSON.stringify(futureBookingsData.stats)})`);

      console.log('\n--- 6. Discovery Honest 501 Test ---');
      const discoverRes = await fetch(`http://localhost:${PORT}/api/channels/discover`, {
        method: 'POST'
      });
      const discoverData = await discoverRes.json();
      assert('POST /api/channels/discover returns 501 Not Implemented', discoverRes.status === 501);
      assert('Discovery returns DISCOVERY_NOT_SUPPORTED', discoverData.code === 'DISCOVERY_NOT_SUPPORTED');

      console.log(`\nTest Suite Complete: ${passed} passed, ${failed} failed.\n`);
    } catch (e) {
      console.error('Test execution failed:', e);
    } finally {
      server.close();
      process.exit(failed > 0 ? 1 : 0);
    }
  });
}

runTests();
