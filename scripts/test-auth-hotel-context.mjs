import { resolveAuthorizedHotel, requireHotelAccess } from '../server/middleware/auth.js';
import dotenv from 'dotenv';
dotenv.config();

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

async function runTests() {
  console.log('\n--- Running Hotel Authorization & Context Middleware Tests ---\n');

  // Test 1: Missing Authorization header
  {
    const req = {
      headers: {},
      query: {},
      body: {},
    };
    const res = await resolveAuthorizedHotel(req);
    assert(!res.success, 'Rejects request without Authorization header');
    assert(res.status === 401, 'Status is 401');
    assert(res.code === 'AUTH_REQUIRED', 'Error code is AUTH_REQUIRED');
  }

  // Test 2: Invalid Authorization format
  {
    const req = {
      headers: { authorization: 'Basic 12345' },
      query: {},
      body: {},
    };
    const res = await resolveAuthorizedHotel(req);
    assert(!res.success, 'Rejects request with non-Bearer Authorization');
    assert(res.status === 401, 'Status is 401');
    assert(res.code === 'AUTH_REQUIRED', 'Error code is AUTH_REQUIRED');
  }

  // Test 3: Invalid token
  {
    const req = {
      headers: { authorization: 'Bearer invalid.token.payload' },
      query: {},
      body: {},
    };
    const res = await resolveAuthorizedHotel(req);
    assert(!res.success, 'Rejects request with invalid JWT');
    assert(res.status === 401, 'Status is 401');
    assert(res.code === 'INVALID_TOKEN', 'Error code is INVALID_TOKEN');
  }

  // Test 4: Middleware requireHotelAccess rejection contract
  {
    const req = {
      headers: {},
      query: {},
      body: {},
      url: '/api/channels',
      method: 'GET',
    };
    let capturedStatus = 0;
    let capturedBody = null;
    const res = {
      status(s) {
        capturedStatus = s;
        return this;
      },
      json(b) {
        capturedBody = b;
        return this;
      },
    };
    let nextCalled = false;
    await requireHotelAccess(req, res, () => { nextCalled = true; });

    assert(!nextCalled, 'requireHotelAccess does not call next() on failure');
    assert(capturedStatus === 401, 'Response status is 401');
    assert(capturedBody && capturedBody.success === false, 'Body success is false');
    assert(capturedBody && capturedBody.code === 'AUTH_REQUIRED', 'Body code is AUTH_REQUIRED');
    assert(capturedBody && typeof capturedBody.requestId === 'string', 'Body contains valid requestId');
  }

  console.log(`\nTest Results: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
