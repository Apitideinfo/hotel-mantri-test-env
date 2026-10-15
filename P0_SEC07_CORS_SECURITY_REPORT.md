# HOTEL MANTRI — PHASE 1F (SEC-07) SECURITY REPORT
## CORS Configuration & Cross-Origin Security Hardening

**Engineer:** Senior Full-Stack Security Implementation Engineer  
**Reporting To:** Project Manager & Senior Full-Stack Developer  
**Status:** Remediated & Verified Locally — Pending Staging Deployment  
**Date:** October 12, 2026  
**Scope:** SEC-07 (CORS Configuration & Cross-Origin Security Hardening)  

---

## 1. Executive Summary

During the initial Phase 0 Security Reconnaissance, finding **SEC-07** identified an unconstrained wildcard CORS vulnerability in `server/index.js:24`. The backend Express server invoked `app.use(cors())` with default arguments, causing every HTTP response to return `Access-Control-Allow-Origin: *`. Any arbitrary website or malicious script executed within a victim's web browser could issue cross-origin requests to HotelMantri endpoints and, in the absence of explicit origin constraints, read responses from open endpoints.

In Phase 1F (SEC-07), we have architected and enforced an **explicit, environment-aware origin policy**:
1. **Purged Permissive Wildcard CORS:** Replaced `app.use(cors())` with a dedicated, hardened middleware module (`server/middleware/corsConfig.js`).
2. **Exact Origin Allowlist Enforcement:** Origins are validated strictly against scheme, hostname, and port. Lookalikes (`evil-hotelmantri.com`), suffix subdomains (`hotelmantri.com.attacker.com`), unauthorized subdomains, HTTP vs HTTPS protocol mismatches, and unexpected port variations are strictly rejected.
3. **No Credentialed Wildcards:** `Access-Control-Allow-Credentials: true` is strictly bound to explicitly validated origins and is NEVER combined with wildcard `*`.
4. **Untrusted Preflight Termination:** Preflight `OPTIONS` requests from untrusted origins are immediately halted with HTTP 403 `CORS_ORIGIN_DENIED` and zero CORS permission headers.
5. **Non-Browser Passthrough:** Requests lacking an `Origin` header (such as Vercel Cron, backend webhook dispatches, curl, Postman, and internal health checks) pass through unhindered without CORS overhead.
6. **Cache Protection via Vary Header:** All CORS-handled responses return `Vary: Origin` to ensure intermediate caching proxies and CDNs isolate responses across distinct origins.

---

## 2. Original Finding & Exact Source Evidence

### 2.1 Vulnerability Description
Prior to remediation, `server/index.js` configured CORS globally at lines 20-27:

```javascript
// BEFORE REMEDIATION (server/index.js lines 20-27):
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors()); // <-- VULNERABILITY: Default npm cors() generates Access-Control-Allow-Origin: *
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
```

### 2.2 Flaw Analysis & Attack Surface
1. **Universal Origin Reflection:** The default `cors()` middleware sets `Access-Control-Allow-Origin: *` across all routes.
2. **Cross-Origin Exposure:** An attacker hosting a malicious site (e.g. `https://evil-pms-tracker.com`) could execute client-side JavaScript in a hotel administrator's or guest's browser to make cross-origin `fetch()` requests against `http://localhost:5000` or production API endpoints.
3. **Preflight Bypass:** Preflight `OPTIONS` requests from any origin were granted automatic approval with status 204.
4. **Unregulated Headers & Methods:** Permitted all standard methods and reflected arbitrary requested headers.

---

## 3. Actual Origin Inventory & Justification

The allowlist is constructed strictly from legitimate project deployment targets and environment configurations:

| Category | Allowed Origin | Protocol | Port | Justification |
|:---|:---|:---:|:---:|:---|
| **Production Primary** | `https://hotelmantri.com` | HTTPS | 443 | Authoritative production domain for HotelMantri web app and booking engine. |
| **Production Canonical** | `https://www.hotelmantri.com` | HTTPS | 443 | Canonical www domain for customer web access. |
| **Staging Deployment** | `https://hotel-mantri-test-env.vercel.app` | HTTPS | 443 | Official Vercel staging deployment host. |
| **Local Development** | `http://localhost:5173` | HTTP | 5173 | Vite frontend development server default port. (Dev/test only). |
| **Local Development** | `http://127.0.0.1:5173` | HTTP | 5173 | IPv4 loopback Vite frontend dev server. (Dev/test only). |
| **Local Preview** | `http://localhost:4173` | HTTP | 4173 | Vite production preview server (`vite preview`). (Dev/test only). |
| **Local Preview** | `http://127.0.0.1:4173` | HTTP | 4173 | IPv4 loopback Vite preview server. (Dev/test only). |
| **Local Alt Port** | `http://localhost:3000` | HTTP | 3000 | Alternative local development port. (Dev/test only). |
| **Local Alt Port** | `http://127.0.0.1:3000` | HTTP | 3000 | Alternative loopback local development port. (Dev/test only). |
| **Local Server Host** | `http://localhost:5000` | HTTP | 5000 | Local backend server host port. (Dev/test only). |
| **Local Server Host** | `http://127.0.0.1:5000` | HTTP | 5000 | Local loopback backend server host port. (Dev/test only). |
| **Dynamic Ingestion** | `ALLOWED_ORIGINS` / `CORS_ALLOWED_ORIGINS` | HTTPS | Variable | Comma-delimited environment variable for operator-provisioned custom domains or preview URLs. |

### Strict Origin Rejections (Security Boundaries):
- **Wildcard Subdomains:** `https://*.vercel.app` is strictly rejected. Allowing `*.vercel.app` would allow any arbitrary third-party Vercel project to access the HotelMantri backend.
- **Lookalike Domains:** `https://evil-hotelmantri.com`, `https://hotelmantri.com.attacker.com`, `https://attacker-hotelmantri.com` fail exact string parsing.
- **Protocol Downgrades:** `http://hotelmantri.com` is rejected (must be HTTPS).
- **Port Deviations:** `https://hotelmantri.com:8443` or `http://localhost:5174` are rejected (port mismatch).
- **Localhost in Production:** `http://localhost:5173` is excluded from the default production allowlist to prevent cross-origin dev leaks in production.

---

## 4. Files Changed & Rationale

| File Path | Action | Rationale |
|:---|:---:|:---|
| `server/middleware/corsConfig.js` | **Created** | Modular CORS security engine implementing exact origin normalization, environment-aware allowlists, OPTIONS preflight enforcement, diagnostic exports, and test overrides. |
| `server/index.js` | **Modified** | Replaced `app.use(cors())` with `app.use(corsMiddleware)`; added CORS allowlist diagnostic logging to `app.listen`. |
| `.env.example` | **Modified** | Documented `ALLOWED_ORIGINS` template variable in Section 3 (Server Runtime & Network). |
| `package.json` | **Modified** | Registered test command `"test:p0-sec07": "node scripts/test_p0_sec07_cors_security.mjs"`. |
| `scripts/test_p0_sec07_cors_security.mjs` | **Created** | Dedicated 85-assertion automated security test suite covering all origin attack vectors, preflights, and route interactions. |

---

## 5. CORS Behavior by Environment & Request Type

```
                                  Incoming Request
                                         │
                                  Has Origin Header?
                                    /          \
                               NO  /            \  YES
                                  ▼              ▼
                     Server-to-Server / Cron   Normalize Origin (Scheme, Host, Port)
                     (Proceed through next())           │
                                                Is in Allowlist?
                                                 /            \
                                            NO  /              \  YES
                                               ▼                ▼
                                      Untrusted Origin    Trusted Origin
                                      Is OPTIONS preflight?    │
                                        /          \           ├─ Set Access-Control-Allow-Origin: <origin>
                                   YES /            \ NO       ├─ Set Access-Control-Allow-Credentials: true
                                      ▼              ▼         ├─ Set Vary: Origin
                                   HTTP 403      Proceed to    ├─ Set Access-Control-Expose-Headers
                              CORS_ORIGIN_DENIED  handler;     │
                              (No CORS headers)   Omit CORS    Is OPTIONS preflight?
                                                  headers      /            \
                                                 (Browser     / YES          \ NO
                                                 blocks read)▼                ▼
                                                       HTTP 204 No Content  next() -> Proceed
                                                       Allow-Methods        to Route Handler
                                                       Allow-Headers
                                                       Max-Age: 86400
```

### 5.1 Preflight `OPTIONS` Requests
- **Allowed Origin:** Returns **HTTP 204 No Content** with:
  - `Access-Control-Allow-Origin: <exact_origin>` (never `*`)
  - `Access-Control-Allow-Credentials: true`
  - `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD`
  - `Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Request-Id, X-Guest-Token, x-cron-secret`
  - `Access-Control-Expose-Headers: X-Request-Id, Content-Disposition, Content-Type, Content-Length`
  - `Access-Control-Max-Age: 86400` (caching preflight decisions for 24h)
  - `Vary: Origin`
- **Untrusted Origin:** Returns **HTTP 403 Forbidden** with JSON payload:
  ```json
  {
    "success": false,
    "code": "CORS_ORIGIN_DENIED",
    "message": "Cross-origin preflight request forbidden: origin not allowed."
  }
  ```
  Zero `Access-Control-Allow-*` headers are returned. The browser immediately halts the request.

### 5.2 Simple / Actual Requests (GET, POST, PUT, DELETE, PATCH)
- **Allowed Origin:** Sets `Access-Control-Allow-Origin: <exact_origin>`, `Access-Control-Allow-Credentials: true`, `Vary: Origin`, and `Access-Control-Expose-Headers`. Request proceeds to route handler.
- **Untrusted Origin:** Omission policy: The request proceeds, but NO `Access-Control-Allow-Origin` or `Access-Control-Allow-Credentials` headers are set. The browser blocks JavaScript from accessing the response.

### 5.3 Requests Without Origin Header (Server-to-Server, Cron, Webhooks)
- External schedulers (Vercel Cron), server-to-server webhook deliveries (Aiosell, Razorpay), health check monitors, and CLI tools (`curl`, Postman) do not send `Origin` headers.
- The middleware detects `!origin` and immediately invokes `next()`.
- Legitimate backend integrations function normally without interference.

### 5.4 Cross-Site Request Forgery (CSRF) Architectural Context
HotelMantri’s API endpoints authenticate requests via custom authorization headers (`Authorization: Bearer <jwt>`, `Authorization: Bearer <cron_secret>`, `x-guest-token: <token>`) rather than ambient browser session cookies. Browsers do not automatically attach custom headers on cross-site requests, mitigating standard cookie-based CSRF attacks. Enforcing an explicit CORS allowlist provides defense-in-depth by ensuring untrusted origins cannot issue preflighted requests or read API response data.

---

## 6. Regression Tests & Actual Results

### 6.1 Dedicated Test Suite (`npm run test:p0-sec07`)
The dedicated suite `scripts/test_p0_sec07_cors_security.mjs` executes 85 assertions across 6 test groups:

```
======================================================================
HOTEL MANTRI — SEC-07 CORS CONFIGURATION & SECURITY REGRESSION SUITE
======================================================================

[TEST GROUP 1] Origin Parsing, Normalization & Security Rules
  ✓ PASS: Normalizes standard HTTPS origin
  ✓ PASS: Strips trailing slash
  ✓ PASS: Normalizes localhost with port
  ✓ PASS: Lowercases scheme and host
  ✓ PASS: Rejects wildcard *
  ✓ PASS: Rejects string "null"
  ✓ PASS: Rejects empty string
  ✓ PASS: Rejects null
  ✓ PASS: Rejects undefined
  ✓ PASS: Rejects javascript: scheme
  ✓ PASS: Rejects file: scheme
  ✓ PASS: Rejects data: scheme
  ✓ PASS: Rejects non-URL string

[TEST GROUP 2] Environment-Aware Allowlist Resolution
  ✓ PASS: Production allowlist contains https://hotelmantri.com
  ✓ PASS: Production allowlist contains https://www.hotelmantri.com
  ✓ PASS: Production allowlist contains staging Vercel app
  ✓ PASS: Production allowlist DOES NOT contain localhost:5173 by default
  ✓ PASS: Production allowlist DOES NOT contain 127.0.0.1:5173 by default
  ✓ PASS: Development allowlist contains http://localhost:5173
  ✓ PASS: Development allowlist contains http://127.0.0.1:5173
  ✓ PASS: Development allowlist contains Vite preview port 4173
  ✓ PASS: Development allowlist contains port 3000
  ✓ PASS: Development allowlist retains production domains
  ✓ PASS: Includes dynamic env origin
  ✓ PASS: Includes dynamic env origin and strips trailing slash

[TEST GROUP 3] Exact Origin Matching & Attack Vector Resistance
  ✓ PASS: Passes legitimate https://hotelmantri.com
  ✓ PASS: Passes legitimate https://www.hotelmantri.com
  ✓ PASS: Passes legitimate Vercel app
  ✓ PASS: Passes legitimate http://localhost:5173
  ✓ PASS: Blocks lookalike prefix: evil-hotelmantri.com
  ✓ PASS: Blocks subdomain lookalike suffix: hotelmantri.com.attacker.com
  ✓ PASS: Blocks lookalike prefix domain
  ✓ PASS: Blocks fake vercel lookalike
  ✓ PASS: Blocks arbitrary vercel subdomain: attacker.vercel.app
  ✓ PASS: Blocks unauthorized subdomain: admin.hotelmantri.com
  ✓ PASS: Blocks unauthorized subdomain: api.hotelmantri.com
  ✓ PASS: Blocks HTTP protocol mismatch for https://hotelmantri.com
  ✓ PASS: Blocks HTTPS protocol mismatch for http://localhost:5173
  ✓ PASS: Blocks port mismatch: hotelmantri.com:8443
  ✓ PASS: Blocks unexpected port: localhost:5174
  ✓ PASS: Blocks unexpected port: localhost:8080

[TEST GROUP 4] Preflight OPTIONS Request Behavior
  ✓ PASS: Allowed preflight returns HTTP 204 No Content
  ✓ PASS: Sets exact Access-Control-Allow-Origin
  ✓ PASS: Access-Control-Allow-Origin is NEVER wildcard *
  ✓ PASS: Sets Access-Control-Allow-Credentials: true
  ✓ PASS: Sets Vary: Origin header
  ✓ PASS: Methods header includes POST
  ✓ PASS: Methods header includes GET
  ✓ PASS: Headers include Authorization
  ✓ PASS: Headers include X-Guest-Token
  ✓ PASS: Sets Access-Control-Max-Age to 86400 (24h)
  ✓ PASS: Untrusted preflight rejected with HTTP 403
  ✓ PASS: Error code is CORS_ORIGIN_DENIED
  ✓ PASS: Omits Access-Control-Allow-Origin for untrusted preflight
  ✓ PASS: Omits Access-Control-Allow-Credentials for untrusted preflight
  ✓ PASS: Lookalike preflight rejected with HTTP 403
  ✓ PASS: Omits allow-origin for lookalike domain

[TEST GROUP 5] Actual Request (GET / POST) Cross-Origin Behavior
  ✓ PASS: GET from allowed origin returns HTTP 200
  ✓ PASS: Returns Access-Control-Allow-Origin: https://hotelmantri.com
  ✓ PASS: Returns Access-Control-Allow-Credentials: true
  ✓ PASS: Returns Vary: Origin
  ✓ PASS: Exposes X-Request-Id
  ✓ PASS: Response body received
  ✓ PASS: Server returns response code
  ✓ PASS: OMITS Access-Control-Allow-Origin header (browser blocks reading)
  ✓ PASS: OMITS Access-Control-Allow-Credentials header
  ✓ PASS: POST from allowed origin returns HTTP 200
  ✓ PASS: Returns exact localhost:5173 allow origin
  ✓ PASS: Never returns wildcard * for localhost
  ✓ PASS: Request without Origin header returns HTTP 200
  ✓ PASS: No Access-Control-Allow-Origin header added when Origin header absent
  ✓ PASS: Server-to-server call succeeds without interference

[TEST GROUP 6] Live Application Integration with server/index.js
  ✓ PASS: GET /api/health with allowed origin returns HTTP 200
  ✓ PASS: CORS allow header matches origin on health route
  ✓ PASS: Health route does NOT return wildcard CORS
  ✓ PASS: Health endpoint responds
  ✓ PASS: Health route OMITS CORS headers for attacker.com
  ✓ PASS: OPTIONS /api/create-order allowed preflight returns 204
  ✓ PASS: Sets exact allow-origin on create-order
  ✓ PASS: OPTIONS /api/create-order from attacker returns HTTP 403
  ✓ PASS: Omits allow-origin header on create-order preflight
  ✓ PASS: OPTIONS reservation PDF from attacker returns HTTP 403
  ✓ PASS: Omits allow-origin header on reservation PDF preflight
  ✓ PASS: Cron endpoint enforces auth regardless of CORS
  ✓ PASS: Cron endpoint does not return CORS headers for server callers

======================================================================
SEC-07 TESTS COMPLETED: 85 Passed, 0 Failed (Exit Code: 0)
======================================================================
```

### 6.2 Full Regression Suite Matrix

| Suite Name | Command | Result | Exit Code | Scope & Status |
|:---|:---|:---:|:---:|:---|
| **SEC-07 CORS Hardening** | `npm run test:p0-sec07` | **85 / 85 PASS** | `0` | Explicit origin allowlist, preflight OPTIONS, lookalike rejection, non-wildcard credentials. |
| **SEC-06 Cron Auth** | `npm run test:p0-sec06` | **68 / 68 PASS** | `0` | Fail-closed cron authentication, SHA-256 timing-safe comparison, concurrency lock. |
| **SEC-05 PDF Security** | `npm run test:p0-sec05` | **67 / 67 PASS** | `0` | HMAC-SHA256 scoped guest tokens, PII masking, cross-tenant isolation. |
| **SEC-04 Edge Function** | `npm run test:p0-sec04` | **67 / 67 PASS** | `0` | Supabase edge function auth, role validation, path traversal guards. |
| **SEC-03B Payment Integrity**| `npm run test:p0-sec03b` | **All PASS** | `0` | Payment lifecycle, idempotency ledger, durable concurrency locks. |
| **SEC-03 Payment Hardening** | `npm run test:p0-sec03` | **51 / 51 PASS** | `0` | Razorpay order creation, HMAC validation, amount manipulation prevention. |
| **Phase 1A Regression** | `npm run test:p0-phase1a` | **23 / 23 PASS** | `0` | Credential purge verification, fail-closed service-role client. |
| **Auth Context Suite** | `npm run test:auth` | **14 / 14 PASS** | `0` | Multi-tenant hotel context resolution and RLS boundaries. |

---

## 7. Remaining Staging Verification Requirements

Prior to production deployment, staging verification must confirm:

1. **Staging Frontend Cross-Origin Communication:**
   - Verify that requests from `https://hotel-mantri-test-env.vercel.app` to `/api/*` succeed with `Access-Control-Allow-Origin: https://hotel-mantri-test-env.vercel.app`.
   - Verify that preflight `OPTIONS` requests from staging return HTTP 204 with required headers.
2. **Environment Variable Provisioning:**
   - If additional staging preview URLs or custom domain aliases are deployed, ensure they are specified in `ALLOWED_ORIGINS` in Vercel project environment settings.
3. **External Browser Verification:**
   - Execute a browser console test from an external origin (e.g. `https://example.com`) attempting `fetch('https://hotel-mantri-test-env.vercel.app/api/health')`; verify that the browser console logs a CORS policy failure and suppresses response access.
4. **Independent Staging Verification Pending:**
   - Staging verification gates for SEC-03B, SEC-04, SEC-05, and SEC-06 remain independently pending and must be verified in tandem with SEC-07.

---

## 8. Final Verdict

### **Verdict: PASS (Local Implementation & Regression)**
### **Deployment Gate: CONDITIONAL PASS (Pending Multi-Item Staging Verification)**

- **Local Implementation:** **PASS** (Wildcard CORS completely eradicated; explicit allowlist operational; 85/85 SEC-07 tests passing; all existing test suites passing with exit code 0).
- **Staging / Production Readiness:** **CONDITIONAL PASS** (Ready for deployment to staging environment; production deployment blocked pending staging verification across SEC-03B, SEC-04, SEC-05, SEC-06, and SEC-07).

*In accordance with instructions: SEC-07 is complete. No SEC-08 tasks have been started. Production deployment has not been performed. Stopping for senior review.*
