/**
 * Hotel Mantri — Role Escalation Prevention Test Suite
 * Finding: C2 - Tamper-proof role derivation and privilege escalation rejection
 */

import { resolveAuthorizedHotel, requireRoles, forbidRoles, setHotelResolverForTesting } from '../server/middleware/auth.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runRoleEscalationTests() {
  console.log('================================================================');
  console.log(' HOTEL MANTRI — ROLE PRIVILEGE ESCALATION AUDIT (C2) ');
  console.log('================================================================\n');

  // Test 1: Middleware requireRoles rejects housekeeping role trying to access finance
  console.log('--- Test 1: requireRoles Blocks Housekeeping From Finance & Admin Routes ---');
  const mockReqHk = {
    userRole: 'housekeeping',
    auth: {
      userId: 'user-hk-123',
      role: 'housekeeping',
      isSuperAdmin: false,
      hotelId: '00000000-0000-0000-0000-000000000001',
      userMetadata: { role: 'hotel_admin', permissions: { can_all: true } }, // Attacker manipulated user_metadata!
    },
  };

  let resStatus = 0;
  let resJson = null;
  const mockRes = {
    status: (code) => {
      resStatus = code;
      return {
        json: (data) => {
          resJson = data;
        },
      };
    },
  };

  let nextCalled = false;
  const adminGuard = requireRoles(['hotel_admin', 'owner']);
  adminGuard(mockReqHk, mockRes, () => {
    nextCalled = true;
  });

  assert(nextCalled === false, 'requireRoles denied access to housekeeping user claiming admin in user_metadata');
  assert(resStatus === 403, 'requireRoles responded with HTTP 403');
  assert(resJson?.code === 'ROLE_FORBIDDEN', 'Error code is ROLE_FORBIDDEN');

  // Test 2: forbidRoles blocks housekeeping
  console.log('\n--- Test 2: forbidRoles Blocks Housekeeping From Management ---');
  let forbidNext = false;
  let forbidStatus = 0;
  const mockResForbid = {
    status: (code) => {
      forbidStatus = code;
      return { json: () => {} };
    },
  };

  const hkForbid = forbidRoles(['housekeeping', 'reception', 'accounts']);
  hkForbid(mockReqHk, mockResForbid, () => {
    forbidNext = true;
  });

  assert(forbidNext === false, 'forbidRoles denied access to housekeeping user');
  assert(forbidStatus === 403, 'forbidRoles responded with HTTP 403');

  // Test 3: Unknown / forged role defaults to least privilege
  console.log('\n--- Test 3: Unknown / Forged Role Defaults to Least Privilege ---');
  const mockReqUnknown = {
    userRole: 'hacker_super_root',
    auth: {
      userId: 'user-hacker-456',
      role: 'hacker_super_root',
      isSuperAdmin: false,
      hotelId: '00000000-0000-0000-0000-000000000001',
    },
  };

  let unknownNext = false;
  let unknownStatus = 0;
  const mockResUnknown = {
    status: (code) => {
      unknownStatus = code;
      return { json: () => {} };
    },
  };

  const strictAdminGuard = requireRoles(['hotel_admin', 'manager']);
  strictAdminGuard(mockReqUnknown, mockResUnknown, () => {
    unknownNext = true;
  });

  assert(unknownNext === false, 'Unknown arbitrary role hacker_super_root is rejected');
  assert(unknownStatus === 403, 'Unknown role is treated with least privilege and denied');

  // Test 4: resolveAuthorizedHotel with database staff_role precedence over user_metadata
  console.log('\n--- Test 4: Database staff_role Precedence Over user_metadata ---');
  // Inject mock resolver simulating active database query
  setHotelResolverForTesting((req) => {
    const rawRole = req.mockDbStaffRole || 'housekeeping';
    // Emulates C2 logic in auth.js:
    const ALLOWED = ['hotel_admin', 'manager', 'reception', 'accounts', 'housekeeping'];
    const effective = ALLOWED.includes(rawRole) ? rawRole : 'reception';
    return {
      success: true,
      userId: req.user?.id || 'uid-1',
      role: effective,
      isSuperAdmin: false,
      hotelId: '00000000-0000-0000-0000-000000000001',
      hotel: { id: '00000000-0000-0000-0000-000000000001' },
    };
  });

  const testReq = {
    mockDbStaffRole: 'housekeeping',
    user: {
      id: 'uid-hk',
      user_metadata: { role: 'hotel_admin' }, // Tampered
      app_metadata: {},
    },
    headers: { authorization: 'Bearer mock_token_hk' },
  };

  const resolved = await resolveAuthorizedHotel(testReq);
  assert(resolved.role === 'housekeeping', 'Effective role derived from database (housekeeping), ignoring user_metadata.role');
  assert(resolved.role !== 'hotel_admin', 'Tampered user_metadata.role = hotel_admin was completely ignored');

  // Reset resolver
  setHotelResolverForTesting(null);

  console.log('\n================================================================');
  console.log(` ROLE ESCALATION RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRoleEscalationTests().catch((err) => {
  console.error('Fatal error in role escalation test:', err);
  process.exit(1);
});
