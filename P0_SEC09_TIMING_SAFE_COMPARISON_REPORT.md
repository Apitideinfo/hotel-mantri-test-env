# HOTELMANTRI — PHASE 1H: SEC-09 FAST-TRACK AUDIT REPORT
## Timing-Safe Secret & Signature Comparison Security Verification

**Date:** 2026-10-12  
**Role:** Senior Full-Stack Security Engineer  
**Status:** **PASS**  
**Classification:** P0 Security Hardening & Cryptographic Audit  

---

## 1. Executive Summary

Finding SEC-09 from the initial security reconnaissance (`P0_SECURITY_RECONNAISSANCE.md:242-255`) highlighted risks of non-constant-time string comparisons (`===` and `!==`) across cryptographic signatures, authorization keys, and webhook endpoints. Non-constant-time comparisons abort on the first mismatched byte, producing measurable timing side channels that allow iterative byte-by-byte guessing of sensitive secrets.

This fast-track audit performed a comprehensive inspection of all cryptographic and secret comparison paths across the repository:
1. **Razorpay HMAC Signatures:** Verified constant-time validation (`crypto.timingSafeEqual`) in `paymentSecurityService.js` and `razorpayService.ts`.
2. **Guest Tokens:** Verified constant-time validation in `verifyGuestCheckoutToken` and `verifyGuestReservationToken`.
3. **Cron Secrets:** Verified constant-time SHA-256 digest validation in `cronAuth.js`.
4. **Internal Service-Role Key Bypass:** **DEFECT IDENTIFIED & FIXED.** Replaced plain `token === serviceKey` in `server/middleware/auth.js` with `timingSafeSecretEqual()`.
5. **Aiosell Webhook Basic Auth:** **DEFECT IDENTIFIED & FIXED.** Replaced plain `authHeader !== expectedAuth` in `server/services/integrations/aiosell/AiosellWebhookController.js` with `timingSafeWebhookCompare()`.

---

## 2. Files Inspected and Changes Implemented

### 2.1 Files Inspected

| File Path | Role | Pre-Audit Comparison Mechanism | Timing-Safe Status |
| :--- | :--- | :--- | :--- |
| [`server/services/paymentSecurityService.js`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/server/services/paymentSecurityService.js#L188-L617) | Razorpay HMAC & Guest Token Engine | `crypto.timingSafeEqual` with byte-length pre-check | **ALREADY COMPLIANT** |
| [`server/razorpayService.ts`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/server/razorpayService.ts#L80-L115) | Razorpay TypeScript Service | `crypto.timingSafeEqual` with byte-length pre-check | **HARDENED** (Dynamic env secret fallback) |
| [`server/middleware/cronAuth.js`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/server/middleware/cronAuth.js#L88-L96) | Cron Schedule Endpoint Authentication | SHA-256 pre-hash + `crypto.timingSafeEqual` | **ALREADY COMPLIANT** |
| [`vite.config.ts`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/vite.config.ts#L108) | Dev Server Payment Verification Proxy | Length guard + `crypto.timingSafeEqual` | **ALREADY COMPLIANT** |
| [`server/middleware/auth.js`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/server/middleware/auth.js#L20-L85) | Server-Side Authentication Middleware | `token === serviceKey` (Plain string comparison) | **VULNERABLE -> REMEDIATED** |
| [`server/services/integrations/aiosell/AiosellWebhookController.js`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/server/services/integrations/aiosell/AiosellWebhookController.js#L10-L45) | Aiosell Channel Webhook Controller | `authHeader !== expectedAuth` (Plain string comparison) | **VULNERABLE -> REMEDIATED** |

---

### 2.2 Confirmed Issues Fixed

#### 1. Internal Service-Role Key Bypass (`server/middleware/auth.js:83`)
- **Vulnerability:**
  ```javascript
  // BEFORE (Vulnerable):
  if (serviceKey && token === serviceKey) {
  ```
  Evaluating `SUPABASE_SERVICE_ROLE_KEY` with standard `===` exposed the root administrative database credential to timing side channels.
- **Remediation:**
  Introduced exported `timingSafeSecretEqual()` helper using SHA-256 pre-hashing:
  ```javascript
  // AFTER (Hardened):
  export const timingSafeSecretEqual = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (!a || !b) return false;
    const hashA = crypto.createHash('sha256').update(a).digest();
    const hashB = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(hashA, hashB);
  };

  // Privileged internal server-to-server call with service role key ONLY (SEC-09 timing-safe)
  if (serviceKey && timingSafeSecretEqual(token, serviceKey)) {
  ```
  *Security Benefits:* Pre-hashing with SHA-256 guarantees both input buffers are exactly 32 bytes, completely eliminating `RangeError: Input buffers must have the same length` while enforcing constant-time execution regardless of candidate token length.

#### 2. Aiosell Webhook Basic Authentication (`server/services/integrations/aiosell/AiosellWebhookController.js:42`)
- **Vulnerability:**
  ```javascript
  // BEFORE (Vulnerable):
  const expectedAuth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  if (authHeader !== expectedAuth) {
    return res.status(401).json({ error: 'Unauthorized: Invalid credentials' });
  }
  ```
  Incoming `Authorization` basic auth headers were checked with standard JavaScript `!==` inequality.
- **Remediation:**
  Imported `crypto` and implemented exported `timingSafeWebhookCompare()` helper:
  ```javascript
  // AFTER (Hardened):
  export const timingSafeWebhookCompare = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (!a || !b) return false;
    const hashA = crypto.createHash('sha256').update(a).digest();
    const hashB = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(hashA, hashB);
  };

  export const webhookAuthMiddleware = (req, res, next) => {
    // ...
    const expectedAuth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    if (!timingSafeWebhookCompare(authHeader, expectedAuth)) {
      return res.status(401).json({ error: 'Unauthorized: Invalid credentials' });
    }
    next();
  };
  ```

#### 3. TypeScript Razorpay Service Environment Resolution (`server/razorpayService.ts`)
- **Improvement:**
  Resolved `process.env.RAZORPAY_KEY_SECRET` dynamically inside `verifyRazorpaySignature()` and `getRazorpayInstance()` rather than freezing once at module load time. Preserved constant-time verification logic with `crypto.timingSafeEqual()`.

---

## 3. Cryptographic Verification Matrix

| Area | Implementation Path | Method | Constant-Time Mechanism | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Razorpay Payment HMAC** | `paymentSecurityService.js:617` | HMAC-SHA256 | Length guard + `crypto.timingSafeEqual(expBuf, actBuf)` | **PASS** |
| **Razorpay Gateway TS** | `razorpayService.ts:110` | HMAC-SHA256 | Length guard + `crypto.timingSafeEqual(expectedBuf, actualBuf)` | **PASS** |
| **Dev Gateway Proxy** | `vite.config.ts:108` | HMAC-SHA256 | Length guard + `crypto.timingSafeEqual(expectedBuf, actualBuf)` | **PASS** |
| **Guest Checkout Token** | `paymentSecurityService.js:188` | HMAC-SHA256 | Length guard + `crypto.timingSafeEqual(expBuf, actBuf)` | **PASS** |
| **Guest Confirmation Token**| `paymentSecurityService.js:256` | Delegated to Checkout | Length guard + `crypto.timingSafeEqual(expBuf, actBuf)` | **PASS** |
| **Scheduled Cron Secret** | `cronAuth.js:91` | Secret Token | SHA-256 pre-hash + `crypto.timingSafeEqual(expectedHash, actualHash)` | **PASS** |
| **Service-Role Admin Token**| `auth.js:83` | Secret Token | SHA-256 pre-hash + `crypto.timingSafeEqual(hashA, hashB)` | **PASS** |
| **Aiosell Webhook Auth** | `AiosellWebhookController.js:42`| Basic Auth | SHA-256 pre-hash + `crypto.timingSafeEqual(hashA, hashB)` | **PASS** |

---

## 4. Actual Test Results & Regression Evidence

### 4.1 SEC-09 Dedicated Test Suite (`scripts/test_p0_sec09_timing_safe_comparison.mjs`)

**Execution Command:** `npm run test:p0-sec09`  
**Result:** **34 Passed, 0 Failed (Exit Code: 0)**

- **Suite 1: Razorpay HMAC Signature Verification (paymentSecurityService.js)**
  - `✓ Valid Razorpay HMAC signature is accepted`
  - `✓ Tampered signature (1 byte altered) is rejected in constant time`
  - `✓ Short signature (incorrect length) rejected without RangeError`
  - `✓ Oversized signature (128 bytes) rejected without RangeError`
  - `✓ Malformed/empty signature types rejected safely`
- **Suite 1B: TypeScript Razorpay Service (server/razorpayService.ts)**
  - `✓ TypeScript verifyRazorpaySignature validates authentic signature`
  - `✓ TypeScript verifyRazorpaySignature rejects length mismatch without RangeError`
  - `✓ TypeScript verifyRazorpaySignature rejects altered signature byte`
- **Suite 2: Guest Checkout & Confirmation Tokens**
  - `✓ Authentic checkout token verified via timingSafeEqual`
  - `✓ Tampered checkout token signature (1 byte altered) rejected`
  - `✓ Checkout token signature length mismatch rejected without RangeError`
  - `✓ Authentic confirmation token verified via timingSafeEqual`
  - `✓ Malformed guest token (no parts, null, empty) rejected safely`
- **Suite 3: Cron Secret Authentication (cronAuth.js)**
  - `✓ Valid Bearer CRON_SECRET accepted via constant-time SHA-256 comparison`
  - `✓ Valid x-cron-secret header accepted via constant-time SHA-256 comparison`
  - `✓ Invalid CRON_SECRET (1 byte modified) rejected with 401 (INVALID_CRON_SECRET)`
  - `✓ Different length candidate cron secret rejected without RangeError`
  - `✓ Missing cron credentials rejected with 401`
- **Suite 4: Internal Service-Role Key Verification (auth.js)**
  - `✓ timingSafeSecretEqual returns true for identical secret strings`
  - `✓ timingSafeSecretEqual returns false for 1-character difference`
  - `✓ timingSafeSecretEqual returns false for different lengths without RangeError`
  - `✓ timingSafeSecretEqual rejects empty and non-string inputs safely`
  - `✓ resolveAuthorizedHotel authenticates valid service role key via timingSafeSecretEqual`
  - `✓ resolveAuthorizedHotel rejects tampered service role key (1 byte modified)`
- **Suite 5: Aiosell Webhook Basic Auth (AiosellWebhookController.js)**
  - `✓ timingSafeWebhookCompare returns true for identical credentials`
  - `✓ timingSafeWebhookCompare returns false for 1-character difference`
  - `✓ timingSafeWebhookCompare returns false for different lengths without RangeError`
  - `✓ timingSafeWebhookCompare rejects null, undefined, empty, non-string inputs safely`
  - `✓ webhookAuthMiddleware accepts authentic Basic credentials via timing-safe check`
  - `✓ webhookAuthMiddleware rejects invalid password (1 byte modified) with 401`
  - `✓ webhookAuthMiddleware rejects wrong username with 401`
  - `✓ webhookAuthMiddleware rejects missing authorization header with 401`
  - `✓ webhookAuthMiddleware rejects non-string authorization header with 401`
  - `✓ webhookAuthMiddleware rejects request when webhooks disabled with 403`

---

### 4.2 Full Security & Regression Matrix

| Test Suite | Command | Cases | Result |
| :--- | :--- | :--- | :--- |
| **SEC-09: Timing-Safe Comparisons** | `npm run test:p0-sec09` | 34 | **34 Passed, 0 Failed (Exit Code 0)** |
| **SEC-08: Supabase Client Isolation**| `npm run test:p0-sec08` | 37 | **37 Passed, 0 Failed (Exit Code 0)** |
| **SEC-07: CORS Hardening** | `npm run test:p0-sec07` | 85 | **85 Passed, 0 Failed (Exit Code 0)** |
| **SEC-06: Cron Authentication** | `npm run test:p0-sec06` | 68 | **68 Passed, 0 Failed (Exit Code 0)** |
| **SEC-05: Reservation PDF Security** | `npm run test:p0-sec05` | 67 | **67 Passed, 0 Failed (Exit Code 0)** |
| **SEC-03B: Payment Integrity** | `npm run test:p0-sec03b` | 34 | **34 Passed, 0 Failed (Exit Code 0)** |
| **SEC-03: Payment Hardening** | `npm run test:p0-sec03` | 51 | **51 Passed, 0 Failed (Exit Code 0)** |
| **Auth & Tenant Isolation** | `npm run test:auth` | 14 | **14 Passed, 0 Failed (Exit Code 0)** |
| **Node / Server Typecheck** | `npx tsc --noEmit -p tsconfig.node.json` | N/A | **0 Errors (Exit Code 0)** |
| **Production Bundle Build** | `npm run build` | N/A | **Built in 1m 9s (Exit Code 0)** |

---

## 5. Critical Unresolved Issues

**None.**
- All security-sensitive comparisons in the application tier now enforce constant-time execution using `crypto.timingSafeEqual`.
- Zero plain comparisons (`===`, `!==`) remain in authentication middleware, signature engines, webhook controllers, or scheduled job handlers.
- Both frontend and server code compile cleanly and pass all automated regression suites.

---

## 6. Final Verdict

# **PASS**

All requirements of **SEC-09 Fast-Track Audit** are fully satisfied:
- Plain comparisons in `server/middleware/auth.js` and `server/services/integrations/aiosell/AiosellWebhookController.js` were remediated with minimal, targeted changes.
- Pre-existing constant-time protections in Razorpay payment verification, guest token validation, and cron authentication were verified intact.
- Comprehensive regression coverage (34 tests) confirms valid, invalid, malformed, and variable-length inputs behave securely without throwing `RangeError` or leaking timing signals.
- **Production deployment is withheld** pending final senior review.
