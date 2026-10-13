# HOTEL MANTRI — PHASE 1G (SEC-08) SECURITY VERIFICATION REPORT
## Server-Side Supabase Session Persistence & Client Isolation Audit

**Engineer:** Senior Full-Stack Security Verification Engineer  
**Reporting To:** Project Manager & Senior Full-Stack Developer  
**Status:** Remediated & Verified Locally — Pending Staging Deployment  
**Date:** October 12, 2026  
**Scope:** SEC-08 (Server-Side Supabase Session Persistence & Client Isolation Audit)  

---

## 1. Executive Summary

During the Phase 0 Security Reconnaissance, finding **SEC-08** identified an architectural risk in `server/supabaseClient.js`: the module-level service-role Supabase client singleton had originally been initialized with `persistSession: true` and `autoRefreshToken: true`. In server-side Node.js environments handling concurrent HTTP requests, persisting session state or activating background refresh timers in a shared singleton risks cross-request session leakage, tenant context confusion, and memory leaks.

While Phase 1A initially modified `server/supabaseClient.js`, our independent security audit under Phase 1G (SEC-08) performed a comprehensive inspection across **all** server-side client factories, middleware, and edge functions. 

**Key Findings & Audit Outcomes:**
1. **Authoritative Singleton (`server/supabaseClient.js`):** Confirmed `persistSession: false` and `autoRefreshToken: false`. Replaces static module initialization with a fail-closed lazy proxy that validates the service-role key on every invocation and rejects anonymous key substitution.
2. **Lingering Defect Identified & Remediated (`server/middleware/auth.js:88`):** Identified that the internal service-role branch (`token === serviceKey`) called `createClient(supabaseConfig.url, serviceKey)` without options, which defaulted to `persistSession: true` and `autoRefreshToken: true`. Remediated by explicitly enforcing `{ auth: { persistSession: false, autoRefreshToken: false } }`.
3. **Edge Function Hardening (`supabase/functions/hotel-onboarding/index.ts:57`):** Identified that while `adminClient` had disabled session persistence, `userClient` omitted auth options. Remediated by adding `{ auth: { autoRefreshToken: false, persistSession: false } }`.
4. **Dead Import Cleared (`server/routes/aiosell.js:3`):** Removed unused `createClient` import.
5. **Cross-Request Isolation Confirmed:** Validated across 20 interleaved concurrent requests that User A and User B execute with distinct scoped client instances and zero session state bleed.

---

## 2. Original Finding & Current Source Evidence

### 2.1 Original Reconnaissance Finding
In `P0_SECURITY_RECONNAISSANCE.md:228-236`:
```javascript
// ORIGINAL VULNERABLE CODE (prior to Phase 1A):
export const supabaseServiceRole = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
```
- **Vulnerability:** In Node.js, `supabaseServiceRole` is a module-level singleton shared across all concurrent requests. Enabling `persistSession: true` caches tokens in memory, while `autoRefreshToken: true` registers standing intervals.
- **Remediation Requirement:** Change to `persistSession: false` and `autoRefreshToken: false` across all server-side clients.

### 2.2 Current Source Evidence in `server/supabaseClient.js`
Lines 98-107 of `server/supabaseClient.js`:
```javascript
  if (!clientInstance || lastUsedKey !== currentKey || lastUsedUrl !== currentUrl) {
    clientInstance = createClient(currentUrl, currentKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    lastUsedKey = currentKey;
    lastUsedUrl = currentUrl;
  }
```
In addition, `supabaseServiceRole` is wrapped in a dynamic `Proxy` that calls `getServiceRoleClient()`, which enforces `validateServiceRoleKey(currentKey)`. If `SUPABASE_SERVICE_ROLE_KEY` is empty or an anonymous key, privileged operations fail closed immediately.

---

## 3. All Server-Side Client Initialization Paths Inspected

A repository-wide search for `createClient` was performed across all server code, middleware, and edge functions. The inventory and audit status are documented below:

| File Path & Line | Client Purpose | Key Used | Session Persistence Settings | Audit Status |
|:---|:---|:---|:---:|:---:|
| `server/supabaseClient.js:99` | Authoritative Server Singleton | `SUPABASE_SERVICE_ROLE_KEY` | `persistSession: false`<br>`autoRefreshToken: false` | **VERIFIED** |
| `server/middleware/auth.js:88` | Internal Server-to-Server Service Role Client | `serviceKey` | **Previously Omitted (Defect)**<br>Now `persistSession: false`<br>`autoRefreshToken: false` | **REMEDIATED** |
| `server/middleware/auth.js:93` | User-Scoped Request Client (`resolveAuthorizedHotel`) | `VITE_SUPABASE_ANON_KEY` + `Authorization: Bearer <userToken>` | `persistSession: false`<br>`autoRefreshToken: false` | **VERIFIED** |
| `server/middleware/auth.js:274` | User-Scoped Request Client (`requireAuth`) | `supabaseAnonKey` + `Authorization: Bearer <userToken>` | `persistSession: false`<br>`autoRefreshToken: false` | **VERIFIED** |
| `supabase/functions/hotel-data-management/index.ts:74` | Edge Function User Verification Client | `SUPABASE_ANON_KEY` + `Bearer <jwt>` | `persistSession: false`<br>`autoRefreshToken: false` | **VERIFIED** |
| `supabase/functions/hotel-data-management/index.ts:80` | Edge Function Admin Execution Client | `SUPABASE_SERVICE_ROLE_KEY` | `persistSession: false`<br>`autoRefreshToken: false` | **VERIFIED** |
| `supabase/functions/setup-super-admin/index.ts:42` | Edge Function Caller Verification Client | `SUPABASE_ANON_KEY` + `Bearer <jwt>` | `persistSession: false`<br>`autoRefreshToken: false` | **VERIFIED** |
| `supabase/functions/setup-super-admin/index.ts:70` | Edge Function Admin Execution Client | `SUPABASE_SERVICE_ROLE_KEY` | `persistSession: false`<br>`autoRefreshToken: false` | **VERIFIED** |
| `supabase/functions/hotel-onboarding/index.ts:57` | Edge Function User Verification Client | `SUPABASE_ANON_KEY` + `Bearer <jwt>` | **Previously Omitted (Defect)**<br>Now `persistSession: false`<br>`autoRefreshToken: false` | **REMEDIATED** |
| `supabase/functions/hotel-onboarding/index.ts:79` | Edge Function Admin Execution Client | `SUPABASE_SERVICE_ROLE_KEY` | `persistSession: false`<br>`autoRefreshToken: false` | **VERIFIED** |
| `supabase/functions/db-tools/index.ts:22` | Edge Function Admin Execution Client | `SUPABASE_SERVICE_ROLE_KEY` | `persistSession: false`<br>`autoRefreshToken: false` | **VERIFIED** |
| `server/routes/aiosell.js:3` | Unused Import | None (unused import) | Removed | **CLEANED** |
| `src/lib/supabase.ts:37` | **Browser Frontend Client** | `VITE_SUPABASE_ANON_KEY` | `persistSession: true`<br>`autoRefreshToken: true`<br>`storage: window.localStorage` | **VERIFIED (Intended)** |

---

## 4. Session Persistence & Refresh Settings

### 4.1 Server-Side Non-Persistence Architecture
Every server-side client is strictly configured with:
```javascript
auth: {
  persistSession: false,
  autoRefreshToken: false,
}
```
1. **Zero Shared Storage:** No storage adapter (`localStorage`, `sessionStorage`, cookies, or file caches) is passed to server-side clients. Tokens exist strictly in memory for the duration of the request.
2. **Zero Auto-Refresh Timers:** Node.js server processes never create background `setInterval` timers attempting to refresh bearer JWTs. Each incoming request must provide an active, unexpired JWT.
3. **No Request Memory Leakage:** User-scoped clients created in `resolveAuthorizedHotel` or `requireAuth` are attached to Express request context (`req.scopedSupabase`) and discarded once the HTTP request lifecycle ends.

### 4.2 Frontend Browser Storage Distinction
The client in `src/lib/supabase.ts` is explicitly intended for browser execution. It utilizes `window.localStorage` to maintain user session persistence across page reloads. It possesses **zero** access to `SUPABASE_SERVICE_ROLE_KEY`.

---

## 5. Request Isolation & Privilege Separation Results

### 5.1 Multi-User Cross-Bleed Test
To verify that session state cannot leak across sequential or concurrent requests:
1. **Sequential Test:** Request A (User A, Hotel Alpha) executed, followed immediately by Request B (User B, Hotel Beta). Asserted that Request B received exclusively Hotel Beta context (`hotelId: testHotelB`, `userId: user-b`) with zero residual state from User A.
2. **Unauthenticated Fallback Test:** An unauthenticated request immediately following Request B returned HTTP 401 `AUTH_REQUIRED` and inherited no user context or tenant ID.
3. **Concurrent Interleaving Test:** Fired 20 concurrent HTTP requests alternating between User A and User B. **100% (20/20)** of requests returned their exact respective user IDs and hotel IDs with zero cross-tenant contamination.

### 5.2 Privilege Separation & Fail-Closed Guard
1. **Empty Service Key:** When `SUPABASE_SERVICE_ROLE_KEY` is missing or empty, `validateServiceRoleKey` returns `{ valid: false, code: 'SERVICE_ROLE_KEY_MISSING' }` and `getServiceRoleClient()` throws an Error, failing closed.
2. **Anonymous Key Substitution:** When an anonymous key is presented as the service key, `validateServiceRoleKey` detects `ANON_KEY_SUBSTITUTION_REJECTED` and aborts.
3. **User Client Scoping:** `req.scopedSupabase` uses `supabaseConfig.anonKey` and the caller's Bearer token via `global.headers.Authorization`. It cannot execute operations prohibited by Row Level Security (RLS).

---

## 6. Files Changed & Justification

| File Path | Changes Made | Justification |
|:---|:---|:---|
| `server/middleware/auth.js` | Added `{ auth: { persistSession: false, autoRefreshToken: false } }` to `scopedSupabase` initialization in the `token === serviceKey` branch (line 88). | Closes lingering unhardened client initialization path where session options were omitted. |
| `supabase/functions/hotel-onboarding/index.ts` | Added `{ auth: { autoRefreshToken: false, persistSession: false } }` to `userClient` initialization (line 57). | Ensures user verification client in onboarding edge function does not attempt session persistence or refresh. |
| `server/routes/aiosell.js` | Removed unused `import { createClient } from '@supabase/supabase-js';`. | Eliminates dead code and potential confusion regarding client initialization. |
| `package.json` | Registered `"test:p0-sec08": "node scripts/test_p0_sec08_supabase_session_isolation.mjs"`. | Enables standardized npm execution of SEC-08 regression suite. |
| `scripts/test_p0_sec08_supabase_session_isolation.mjs` | Created 37-assertion automated test suite for SEC-08. | Validates static source configuration, runtime service-role validation, and multi-user concurrent request isolation. |

---

## 7. Regression Tests & Verification Results

### 7.1 SEC-08 Dedicated Test Suite (`npm run test:p0-sec08`)
The test script `scripts/test_p0_sec08_supabase_session_isolation.mjs` ran 37 assertions with zero failures:

```
======================================================================
HOTEL MANTRI — SEC-08 SUPABASE SESSION PERSISTENCE & CLIENT ISOLATION
======================================================================

[TEST GROUP 1] Static Source Code Configuration Audit
  ✓ PASS: server/supabaseClient.js configures persistSession: false
  ✓ PASS: server/supabaseClient.js configures autoRefreshToken: false
  ✓ PASS: server/supabaseClient.js does NOT contain persistSession: true
  ✓ PASS: server/middleware/auth.js configures persistSession: false
  ✓ PASS: server/middleware/auth.js configures autoRefreshToken: false
  ✓ PASS: server/middleware/auth.js does NOT contain persistSession: true
  ✓ PASS: hotel-data-management edge function configures persistSession: false
  ✓ PASS: hotel-data-management edge function configures autoRefreshToken: false
  ✓ PASS: setup-super-admin edge function configures persistSession: false
  ✓ PASS: hotel-onboarding edge function configures persistSession: false
  ✓ PASS: hotel-onboarding edge function configures autoRefreshToken: false

[TEST GROUP 2] Runtime Service-Role Client Isolation & Validation
  ✓ PASS: getServiceRoleClient() returns valid client object
  ✓ PASS: Service-role client has from() QueryBuilder
  ✓ PASS: Service-role client has auth namespace
  ✓ PASS: Auth client initialized
  ✓ PASS: validateServiceRoleKey rejects empty key
  ✓ PASS: Code is SERVICE_ROLE_KEY_MISSING
  ✓ PASS: validateServiceRoleKey rejects null key
  ✓ PASS: validateServiceRoleKey rejects anonymous key substitution
  ✓ PASS: Code is ANON_KEY_SUBSTITUTION_REJECTED

[TEST GROUP 3] Request-Scoped User Client Isolation
  ✓ PASS: User A request succeeds with HTTP 200
  ✓ PASS: User A receives correct userId: user-a
  ✓ PASS: User A receives correct hotelId: Hotel Alpha
  ✓ PASS: User B request succeeds with HTTP 200
  ✓ PASS: User B receives correct userId: user-b
  ✓ PASS: User B receives correct hotelId: Hotel Beta
  ✓ PASS: User B does NOT inherit User A hotel context
  ✓ PASS: User B does NOT inherit User A user identity
  ✓ PASS: Unauthenticated request rejected with HTTP 401
  ✓ PASS: Error code is AUTH_REQUIRED
  ✓ PASS: No residual user session leaked to unauthenticated request
  ✓ PASS: No residual hotel context leaked to unauthenticated request
  ✓ PASS: Invalid token request rejected with HTTP 401
  ✓ PASS: Error code is INVALID_TOKEN
  ✓ PASS: Invalid token does not inherit previous user identity

[TEST GROUP 4] Interleaved Concurrent Request Isolation
  ✓ PASS: All 20 interleaved concurrent requests strictly preserved tenant and user isolation
  ✓ PASS: All 20 concurrent requests completed without race condition failure

======================================================================
SEC-08 TESTS COMPLETED: 37 Passed, 0 Failed (Exit Code: 0)
======================================================================
```

### 7.2 Full Regression Suite Matrix

| Suite Name | Command | Result | Exit Code | Scope & Status |
|:---|:---|:---:|:---:|:---|
| **SEC-08 Supabase Isolation** | `npm run test:p0-sec08` | **37 / 37 PASS** | `0` | Session persistence, autoRefreshToken, multi-user concurrency |
| **SEC-07 CORS Hardening** | `npm run test:p0-sec07` | **85 / 85 PASS** | `0` | Explicit origin allowlist, preflight OPTIONS, lookalike rejection |
| **SEC-06 Cron Auth** | `npm run test:p0-sec06` | **68 / 68 PASS** | `0` | Fail-closed cron authentication, SHA-256 timing-safe comparison |
| **SEC-05 PDF Security** | `npm run test:p0-sec05` | **67 / 67 PASS** | `0` | HMAC-SHA256 scoped guest tokens, PII masking, cross-tenant isolation |
| **SEC-04 Edge Function** | `npm run test:p0-sec04` | **67 / 67 PASS** | `0` | Edge function auth, role validation, path traversal guards |
| **SEC-03B Payment Integrity**| `npm run test:p0-sec03b` | **All PASS** | `0` | Payment lifecycle, idempotency ledger, durable concurrency locks |
| **SEC-03 Payment Hardening** | `npm run test:p0-sec03` | **51 / 51 PASS** | `0` | Razorpay order creation, HMAC validation, amount protection |
| **Phase 1A Regression** | `npm run test:p0-phase1a` | **23 / 23 PASS** | `0` | Credential purge verification, fail-closed service-role client |
| **Auth Context Suite** | `npm run test:auth` | **14 / 14 PASS** | `0` | Multi-tenant hotel context resolution and RLS boundaries |

---

## 8. Remaining Risks & Staging Verification Requirements

1. **Staging Secret Provisioning:** Ensure `SUPABASE_SERVICE_ROLE_KEY` is properly populated in Vercel staging environment variables so background workers and cron tasks can initialize without throwing `SERVICE_ROLE_KEY_MISSING`.
2. **Edge Function Deployments:** Deploy updated edge function bundles (`hotel-onboarding`, `hotel-data-management`) to the Supabase staging project.
3. **Live Staging Smoke Testing:** Verify in staging that sequential admin requests across different accounts yield isolated hotel contexts in database audit logs.
4. **Independent Staging Verification Pending:** Staging verification remains independently pending for SEC-03B, SEC-04, SEC-05, SEC-06, SEC-07, and SEC-08.

---

## 9. Final Verdict

### **Verdict: PASS (Local Implementation & Regression)**
### **Deployment Gate: CONDITIONAL PASS (Pending Multi-Item Staging Verification)**

- **Local Implementation:** **PASS** (100% of server-side Supabase client paths audited; remaining unhardened client paths remediated; multi-user session isolation verified; 37/37 SEC-08 tests passing; all regression suites passing with exit code 0).
- **Staging / Production Readiness:** **CONDITIONAL PASS** (Ready for staging deployment; production deployment blocked pending staging verification across SEC-03B, SEC-04, SEC-05, SEC-06, SEC-07, and SEC-08).

*In accordance with project instructions: SEC-08 verification is complete. No SEC-09 tasks have been started. Production deployment has not been performed. Stopping for senior review.*
