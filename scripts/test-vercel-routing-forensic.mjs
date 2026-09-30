import http from 'http';
import app from '../server/index.js';

const server = http.createServer(app);

server.listen(0, async () => {
  const port = server.address().port;
  console.log(`Test server running on port ${port}\n`);

  let allPassed = true;

  const testEndpoint = async (description, path, method = 'GET', body = null, headers = {}) => {
    try {
      const fetchHeaders = {
        'Content-Type': 'application/json',
        ...headers
      };
      const res = await fetch(`http://localhost:${port}${path}`, {
        method,
        headers: fetchHeaders,
        body: body ? JSON.stringify(body) : undefined
      });

      const contentType = res.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const text = await res.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        // not json
      }

      const isHtml = text.trim().toLowerCase().startsWith('<!doctype html') || text.includes('<html');

      const pass = isJson && !isHtml;
      if (!pass) allPassed = false;

      console.log(`${pass ? '✅ PASS' : '❌ FAIL'}: ${description}`);
      console.log(`   Method: ${method} | Path: ${path} | HTTP Status: ${res.status}`);
      console.log(`   Content-Type: ${contentType} | Is JSON: ${isJson} | Is HTML: ${isHtml}`);
      if (parsed) {
        console.log(`   JSON Response (summary):`, JSON.stringify(parsed).substring(0, 160) + '...');
      } else {
        console.log(`   Non-JSON Response preview:`, text.substring(0, 100));
      }
      console.log('');
      return { pass, status: res.status, parsed };
    } catch (err) {
      allPassed = false;
      console.log(`❌ FAIL: ${description} (Error: ${err.message})\n`);
      return { pass: false, error: err };
    }
  };

  console.log('=== 1. STATUS & HEALTH ROUTING TESTS ===');
  await testEndpoint('Direct GET /api/aiosell/status (no hotelId)', '/api/aiosell/status', 'GET');
  await testEndpoint('Direct POST /api/aiosell/status', '/api/aiosell/status', 'POST');
  await testEndpoint('GET /Test/api/aiosell/status (Rewritten from /Test/api)', '/Test/api/aiosell/status', 'GET');
  await testEndpoint('GET /test/api/aiosell/status (Rewritten from /test/api)', '/test/api/aiosell/status', 'GET');
  await testEndpoint('GET /aiosell/status (Direct Vercel stripped prefix)', '/aiosell/status', 'GET');
  await testEndpoint('GET /api/aiosell/health', '/api/aiosell/health', 'GET');

  console.log('=== 2. INVENTORY MATRIX ROUTING TESTS ===');
  await testEndpoint('POST /api/aiosell/inventory/matrix (Validation test)', '/api/aiosell/inventory/matrix', 'POST', {
    startDate: '2026-10-01',
    endDate: '2026-10-07'
  });
  await testEndpoint('GET /api/aiosell/inventory/matrix (Validation test)', '/api/aiosell/inventory/matrix?startDate=2026-10-01&endDate=2026-10-07', 'GET');
  await testEndpoint('POST /Test/api/aiosell/inventory/matrix (Rewritten from /Test/api)', '/Test/api/aiosell/inventory/matrix', 'POST', {
    startDate: '2026-10-01',
    endDate: '2026-10-07'
  });

  console.log('=== 3. INVENTORY RESTRICTIONS PATCH TESTS ===');
  await testEndpoint('GET /api/channels/inventory-restrictions/patch (Controlled JSON 405)', '/api/channels/inventory-restrictions/patch', 'GET');
  await testEndpoint('POST /api/channels/inventory-restrictions/patch (Validation test)', '/api/channels/inventory-restrictions/patch', 'POST', {
    updates: []
  });
  await testEndpoint('POST /Test/api/channels/inventory-restrictions/patch (Rewritten from /Test/api)', '/Test/api/channels/inventory-restrictions/patch', 'POST', {
    updates: []
  });

  console.log('=== 4. LIVE SYNC ROUTING TESTS ===');
  await testEndpoint('GET /api/channels/live-sync (Controlled JSON status)', '/api/channels/live-sync', 'GET');
  await testEndpoint('POST /api/channels/live-sync (Validation test)', '/api/channels/live-sync', 'POST');
  await testEndpoint('POST /Test/api/channels/live-sync (Rewritten from /Test/api)', '/Test/api/channels/live-sync', 'POST');

  console.log('=== 5. 404 JSON ERROR PROTECTION (NEVER HTML) ===');
  await testEndpoint('GET /api/unknown-route (Structured JSON 404)', '/api/unknown-route', 'GET');
  await testEndpoint('POST /Test/api/unknown-route (Structured JSON 404)', '/Test/api/unknown-route', 'POST');

  server.close(() => {
    console.log(`\n=============================================`);
    console.log(allPassed ? '🎉 ALL ROUTING TESTS PASSED! ZERO HTML RESPONSES!' : '❌ SOME TESTS FAILED');
    console.log(`=============================================\n`);
    setTimeout(() => {
      process.exit(allPassed ? 0 : 1);
    }, 100);
  });
});
