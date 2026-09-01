const fs = require('fs');
const path = require('path');

// Simulate the steps for E2E testing
const runTests = async () => {
  console.log("==========================================");
  console.log("   AIOSELL END-TO-END SYNC TEST SUITE     ");
  console.log("==========================================\n");

  const baseUrl = process.env.API_URL || 'http://localhost:5000';
  const hotelId = process.env.TEST_HOTEL_ID || '00000000-0000-0000-0000-000000000000'; // Replace with real test hotel

  const headers = {
    'Content-Type': 'application/json',
    'x-hotel-id': hotelId,
  };

  const tests = [
    { name: "TEST 1: Aiosell authentication (health check)", path: "/api/aiosell/health", method: "GET" },
    { name: "TEST 2: Aiosell property mapping fetch", path: "/api/aiosell/mapping", method: "GET" },
    { 
      name: "TEST 3: Inventory push", 
      path: "/api/aiosell/inventory/push", 
      method: "POST", 
      body: { startDate: new Date().toISOString().split('T')[0], endDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0] } 
    },
    { 
      name: "TEST 4: Rate push", 
      path: "/api/aiosell/rates/push", 
      method: "POST", 
      body: { startDate: new Date().toISOString().split('T')[0], endDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0] } 
    },
    { 
      name: "TEST 5: Reservation fetch", 
      path: "/api/aiosell/reservations/fetch", 
      method: "POST", 
      body: { startDate: new Date().toISOString().split('T')[0], endDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0] } 
    }
  ];

  let passed = 0;
  for (const test of tests) {
    console.log(`Running ${test.name}...`);
    try {
      const options = { method: test.method, headers };
      if (test.body) options.body = JSON.stringify(test.body);
      
      const res = await fetch(`${baseUrl}${test.path}`, options);
      const text = await res.text();
      
      try {
        const json = JSON.parse(text);
        if (res.ok && (!json.error)) {
          console.log(`✅ Passed. HTTP ${res.status}`);
          passed++;
        } else {
          console.log(`❌ Failed. HTTP ${res.status}`);
          console.error(json);
        }
      } catch (e) {
        console.log(`❌ Failed. Expected JSON, got HTML (HTTP ${res.status})`);
      }
    } catch (e) {
      console.log(`❌ Failed. Network Error: ${e.message}`);
    }
    console.log("------------------------------------------");
  }

  console.log(`\nTests Completed: ${passed}/${tests.length} Passed`);
  
  if (passed === tests.length) {
    console.log("All core sync tests passed successfully. Ready for Vercel deployment test.");
  } else {
    console.log("Some tests failed. Please review the logs above before deploying to Vercel.");
  }
};

runTests();
