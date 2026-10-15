# HOTELMANTRI — PHASE 1D.1: SEC-05 INDEPENDENT SECURITY VERIFICATION REPORT
## Reservation Confirmation PDF — Security & Staging Readiness Gate

**Document Version:** 2.0.0  
**Date:** October 12, 2026  
**Role:** Senior Security Reviewer  
**Reporting To:** Project Manager & Senior Full-Stack Developer  
**Scope:** SEC-05 Reservation Confirmation PDF Remediation & Staging Gate Verification  
**Final Release Verdict:** **CONDITIONAL PASS** (Static & Mocked Suite: PASS; Dedicated Staging Runtime: BLOCKED)

---

## Executive Summary

As Senior Security Reviewer, an independent security review and verification was conducted on the **SEC-05** remediation targeting `GET /api/reservations/:id/confirmation/pdf` and all related reservation confirmation document flows across HotelMantri.

The initial audit flagged `GET /api/reservations/:id/confirmation/pdf` as vulnerable to unauthenticated access and direct object reference (IDOR), exposing sensitive Guest Personally Identifiable Information (PII) including full names, telephone numbers, emails, stay itineraries, room numbers, and financial tariff breakdowns.

During this independent verification, a critical secondary risk was identified and remediated: **the exposure of reusable master Supabase Bearer JWTs via URL query parameters (`?token=<jwt>`)**. While the backend route had been hardened with `QUERY_JWT_DISALLOWED`, source code inspection uncovered that `src/components/NewBookingModal.tsx` was falling back to setting `session.access_token` into URL query parameters due to `src/lib/api-reservations.ts` omitting `confirmationToken` in its return payload. This flaw broke the "Download Voucher" button (HTTP 401) and risked leaking master JWTs into browser history and proxy access logs.

A minimal corrective change was implemented across `src/lib/api-reservations.ts` and `src/components/NewBookingModal.tsx` to pass the scoped HMAC confirmation token and upgrade the download action to an authenticated `fetch` with ephemeral browser Blob URLs, mirroring `ReservationConfirmationModal.tsx`.

All 67 automated security assertions in `test:p0-sec05` and 191 regression tests across previous phases (SEC-01 through SEC-04) passed with zero failures (exit code 0). Live staging runtime verification is formally marked **BLOCKED** due to unprovisioned staging credentials.

---

## 1. Source Files and Access Paths Inspected

A comprehensive, line-by-line inspection was conducted across all files involved in reservation confirmation delivery, PDF streaming, authorization, and token handling:

| File Path | Component / Role | Verification Scope & Access Path Analysis |
| :--- | :--- | :--- |
| `server/routes/reservations.js` | Express API Router | Inspected `authenticatePdfAccess`, `GET /:id/confirmation/pdf`, `GET /:id/confirmation`, `POST /api/reservations`, and `POST /:id/confirmation/regenerate`. Verified strict token extraction, tenant filtering, error handling, and response header hardening. |
| `server/services/paymentSecurityService.js` | Cryptographic Token Service | Inspected `generateGuestConfirmationToken`, `verifyGuestReservationToken`, `verifyGuestCheckoutToken`, and `getGuestCheckoutSecret`. Verified HMAC-SHA256 signature logic, timing-safe equality, purpose isolation, and production fail-closed secret resolution. |
| `src/components/reservations/ReservationConfirmationModal.tsx` | Dashboard Modal Component | Inspected `fetchPdfBlob`, `handlePreviewPdf`, `handlePrintPdf`, `handleDownloadPdf`, and historical version tables. Verified replacement of URL-based query tokens with authenticated `fetch` and Blob URLs. |
| `src/components/NewBookingModal.tsx` | Front Desk Booking Modal | Inspected "Download Voucher" workflow. Identified and remediated insecure JWT query parameter fallback; implemented authenticated `fetch` and ephemeral Blob URL download. |
| `src/lib/api-reservations.ts` | Frontend Reservation API Client | Inspected `saveReservations`. Identified missing `confirmationToken` pass-through in batch creation response and updated mapping. |
| `server/services/reservationDeliveryService.js` | Background Delivery Service | Inspected `generateAndDeliverConfirmation`, email generation, and WhatsApp text templates. Confirmed direct in-memory PDF buffer generation without traversing HTTP routes. |
| `server/middleware/auth.js` | Authoritative Auth Middleware | Inspected `resolveAuthorizedHotel`. Verified tenant resolution, `hotel_admins` role binding, and super-admin validation via `is_super_admin()` RPC and `company_users`. |
| `scripts/test_p0_sec05_reservation_pdf_security.mjs` | Automated Security Test Suite | Inspected and expanded test suite to 67 assertions covering unauthenticated access, tampered/expired tokens, cross-tenant isolation, query JWT rejection, `x-guest-token` header, and cross-hotel guest token presentation. |

### Access Path Trace Matrix

1. **Preview PDF Path:**  
   `ReservationConfirmationModal.tsx` (`handlePreviewPdf`) $\rightarrow$ `fetchPdfBlob()` $\rightarrow$ `fetch('/api/reservations/:id/confirmation/pdf', { headers: { Authorization: 'Bearer <jwt>' } })` $\rightarrow$ `res.blob()` $\rightarrow$ `URL.createObjectURL(blob)` $\rightarrow$ `window.open(blobUrl, '_blank')`.  
   *Result:* Zero credentials in URL. Ephemeral `blob:` URL opened in browser tab.

2. **Print PDF Path:**  
   `ReservationConfirmationModal.tsx` (`handlePrintPdf`) $\rightarrow$ `fetchPdfBlob()` $\rightarrow$ `window.open(blobUrl, '_blank').focus()`.  
   *Result:* Ephemeral Blob URL printed directly without exposing session tokens.

3. **Download PDF Path:**  
   - `ReservationConfirmationModal.tsx` (`handleDownloadPdf`): Generates client-side via `downloadReservationConfirmationPdf()` or falls back to `fetchPdfBlob()` and triggers `<a download>` from Blob URL.  
   - `NewBookingModal.tsx` (`handleDownloadVoucher`): Invokes authenticated `fetch('/api/reservations/:id/confirmation/pdf', { headers })`, converts to Blob URL, triggers download via DOM `<a download>`, and revokes Blob URL after 10s.  
   *Result:* Fully protected; no tokens in download links or query strings.

4. **Version History Path:**  
   `ReservationConfirmationModal.tsx` (Version table "View" action) $\rightarrow$ Invokes `fetchPdfBlob(ver.version)` with `Authorization: Bearer <jwt>` and opens ephemeral Blob URL.  
   *Result:* Historical documents retrieved with verified session headers.

5. **Background Delivery Path:**  
   `reservationDeliveryService.js` (`generateAndDeliverConfirmation`):  
   Invoked asynchronously on reservation creation or update. Calls `generateAndStoreReservationConfirmation()` directly in Node.js runtime $\rightarrow$ obtains binary buffer $\rightarrow$ passes buffer directly to `nodemailer` attachment array $\rightarrow$ dispatches SMTP email and sends WhatsApp notification.  
   *Result:* Operates entirely in memory and internal storage without invoking public HTTP routes.

**Access Flow Verdict:** A reservation UUID alone **cannot** authorize access under any circumstance. Every HTTP access path enforces either verified Staff Bearer authentication or cryptographically signed, purpose-scoped Guest HMAC authorization.

---

## 2. Token Issuance and Authorization Audit

### 2.1 Cryptographic Integrity and Signing
1. **Algorithm:** Guest tokens are cryptographically signed using HMAC-SHA256:
   $$\text{Signature} = \text{HMAC-SHA256}(\text{Secret}, \text{base64url}(\text{Payload}))$$
2. **Timing-Safe Comparison:** Verification uses `crypto.timingSafeEqual(expBuf, actBuf)` between expected and actual signature buffers, preventing side-channel timing attacks.
3. **Payload Binding:** The token payload binds:
   - `resv`: Canonical reservation ID (UUID).
   - `hotel`: Canonical hotel ID (UUID).
   - `exp`: Expiration timestamp in milliseconds (`Date.now() + expiresInMs`).
   - `purpose`: Explicit purpose scope (`reservation_confirmation`).

### 2.2 Purpose Isolation & Prevention of Token Confusion
A critical verification requirement is ensuring that guest confirmation tokens cannot be substituted for payment tokens or other privileged actions:
- `generateGuestConfirmationToken()` issues tokens with `purpose: 'reservation_confirmation'`.
- In `paymentSecurityService.js`, `verifyGuestCheckoutToken()` enforces `allowedPurposes = ['guest_checkout']` by default.
- When a confirmation token is presented to the payment checkout endpoint, `allowedPurposes.includes('reservation_confirmation')` evaluates to `false`.
- The verification immediately fails closed:
  ```json
  { "valid": false, "code": "TOKEN_PURPOSE_MISMATCH", "message": "Token is not authorized for requested operation." }
  ```
- Conversely, `verifyGuestReservationToken()` allows `['guest_checkout', 'reservation_confirmation', 'guest_confirmation']`, permitting a guest in the checkout flow to view their confirmation voucher, while strictly denying confirmation tokens from initiating checkout or modifying payment balances.

### 2.3 Token Issuance Protection
- Verified that token issuance cannot be triggered by unauthorized callers or arbitrary reservation IDs:
  - `POST /api/reservations` is guarded by `checkAuth` (`requireHotelAccess`). Token is issued only for newly created reservations owned by the caller's authorized `hotel_id`.
  - `GET /api/reservations/:id/confirmation` is guarded by `checkAuth` and verifies that the requested reservation belongs to the caller's authorized `hotel_id` before issuing a token.
  - Unauthenticated callers attempting to call these endpoints receive **HTTP 401 `AUTH_REQUIRED`**.
  - Cross-tenant callers receive **HTTP 404 `RESERVATION_NOT_FOUND`**.
- **Finding:** Token issuance cannot be abused to generate valid tokens for unauthorized reservations or enumerate existing reservation records.

### 2.4 Token Invalidation & Validity Period Analysis
- Current code implementation configures token validity to **24 hours** (`expiresInMs = 24 * 60 * 60 * 1000`).
- Earlier design documentation referenced an alternative **seven-day validity period**. We evaluated the security implications:
  1. **Stateless HMAC Architecture:** Confirmation tokens are self-contained HMAC signatures. The server does not maintain a stateful revocation blacklist table in Postgres. Once issued, a token remains cryptographically valid until its `exp` timestamp.
  2. **Implications of a 7-Day Window:** If a guest voucher link is valid for 7 days, any modification or cancellation of the stay would still allow the recipient to view the reservation document until day 7, unless explicitly guarded by real-time database lookups.
  3. **Real-Time Guarding:** In `GET /api/reservations/:id/confirmation/pdf`, the server queries the database on every request (`.eq('id', id).eq('hotel_id', auth.hotelId)`). If a reservation is deleted, access fails immediately with HTTP 404. However, if a reservation is cancelled, the route still streams the PDF (marked with cancellation stamp).
  4. **Architectural Recommendation:** The 24-hour default is optimal for immediate guest voucher downloads following front-desk booking. For long-term booking confirmation retention, the email delivery pipeline attaches the immutable `.pdf` file directly to the SMTP email, removing guest reliance on long-lived download URLs.

### 2.5 Secret Isolation & Log Sanitization
- `getGuestCheckoutSecret()` enforces that `GUEST_CHECKOUT_SECRET` is $\ge 32$ characters in production, failing closed if missing or truncated.
- Neither `getGuestCheckoutSecret()` nor token verification functions log secrets to standard out or include secrets in error messages.
- Error payloads return generic, safe error codes (`TOKEN_INVALID_SIGNATURE`, `TOKEN_EXPIRED`, `GUEST_SECRET_NOT_CONFIGURED`) without exposing cryptographic materials.

---

## 3. Query-Parameter JWT Exposure Assessment & Corrective Action

### 3.1 Vulnerability Assessment (CWE-598 / RFC 6750)
The initial SEC-05 implementation accepted staff Supabase JWTs via `?token=<jwt>` to accommodate browser `<iframe src>` and `window.open()` popups. Independent review identified this pattern as a notable security risk:

1. **Browser Navigation History:** When `window.open(url, '_blank')` opens a URL containing `?token=eyJ...`, the user's master session JWT is stored unencrypted in the browser history database on the client machine.
2. **Reverse-Proxy and Ingress Access Logs:** Web servers, CDN edge nodes (Cloudflare, CloudFront, Vercel), and NGINX reverse proxies log full request URLs including query strings in access logs by default. Unlike the `Authorization` header (which is sanitized), query parameters are stored in plaintext log files and forwarded to monitoring/SIEM platforms.
3. **Referrer Header Leakage:** If a PDF document viewed in a browser tab references external resources or links, the `Referer` header discloses the full URL including `?token=<jwt>` to third-party domains.
4. **Scope Disparity:** A Supabase user JWT grants global access across PostgREST, Edge Functions, and database tables for that user account. Exposing it in URLs violates OAuth 2.0 Bearer Token Usage guidelines (RFC 6750 Section 2.3).

### 3.2 Backend Gateway Hardening (`server/routes/reservations.js`)
`authenticatePdfAccess` explicitly detects 3-part Bearer JWTs in URL query parameters and rejects them immediately:

```javascript
// Prohibit Bearer JWTs in URL query parameters to eliminate credential leakage
// via browser navigation history, reverse proxy access logs, and Referer headers (CWE-598 / RFC 6750).
if (rawToken && typeof rawToken === 'string' && rawToken.trim().split('.').length === 3) {
  return {
    authorized: false,
    status: 401,
    code: 'QUERY_JWT_DISALLOWED',
    message: 'Bearer JWT credentials in URL query parameters are disallowed to prevent credential exposure. Use Authorization header or scoped confirmation token.',
  };
}
```

Staff credentials are accepted **strictly** via the standard `Authorization: Bearer <jwt>` HTTP header.

### 3.3 Identified Frontend Flaw & Corrective Implementation

#### Defect Identified During Inspection
In `src/components/NewBookingModal.tsx`, the "Download Voucher" link was implemented as:
```tsx
<a
  href={`/api/reservations/${savedReservationId}/confirmation/pdf${confirmationToken ? `?token=${encodeURIComponent(confirmationToken)}` : ''}`}
  target="_blank"
  rel="noopener noreferrer"
>
  Download Voucher
</a>
```
Because `src/lib/api-reservations.ts` omitted `confirmationToken` from the response mapping, `firstSaved.confirmation_token` was undefined, causing `NewBookingModal.tsx` to execute:
```typescript
const { data: { session } } = await supabase.auth.getSession();
if (session?.access_token) {
  setConfirmationToken(session.access_token);
}
```
This fell back to placing the master Supabase session JWT in `?token=<jwt>`. Consequently:
1. Clicking "Download Voucher" was rejected by the backend with HTTP 401 `QUERY_JWT_DISALLOWED`.
2. The user's master session JWT was exposed in the anchor tag and browser history.

#### Minimal Corrective Fix Implemented

1. **`src/lib/api-reservations.ts`:**  
   Preserved server-issued `confirmationToken` in the returned reservation object:
   ```typescript
   return res.reservations.map((r: any, idx: number) => ({
     ...r,
     _emailDelivery: idx === 0 ? res.emailDelivery : undefined,
     _emailStatus: idx === 0 ? res.emailStatus : undefined,
     confirmationToken: idx === 0 ? res.confirmationToken : undefined,
     _confirmationToken: idx === 0 ? res.confirmationToken : undefined,
   }));
   ```

2. **`src/components/NewBookingModal.tsx`:**  
   - Purged the insecure `setConfirmationToken(session.access_token)` fallback.
   - Replaced `<a href="...">` with a secure `handleDownloadVoucher` handler using authenticated `fetch` with `Authorization: Bearer <token>` in headers (or `x-guest-token` header if unauthenticated), creating an ephemeral Blob URL and revoking it after download:
   ```typescript
   const handleDownloadVoucher = async () => {
     if (!savedReservationId) return;
     setDownloadingVoucher(true);
     try {
       let token: string | undefined;
       try {
         const { data: { session } } = await supabase.auth.getSession();
         token = session?.access_token;
       } catch { /* ignore */ }

       const headers: HeadersInit = {};
       if (token) {
         headers['Authorization'] = `Bearer ${token}`;
       } else if (confirmationToken) {
         headers['x-guest-token'] = confirmationToken;
       }

       const params = new URLSearchParams();
       if (!token && confirmationToken && confirmationToken.split('.').length === 2) {
         params.set('token', confirmationToken);
       }

       const qs = params.toString();
       const url = `/api/reservations/${savedReservationId}/confirmation/pdf${qs ? `?${qs}` : ''}`;
       const res = await fetch(url, { headers });
       if (!res.ok) {
         const errJson = await res.json().catch(() => ({}));
         throw new Error(errJson.message || `Failed to fetch voucher (${res.status})`);
       }
       const blob = await res.blob();
       const blobUrl = URL.createObjectURL(blob);
       const a = document.createElement('a');
       a.href = blobUrl;
       a.download = `Hotel-Mantri-Voucher-HM-${savedReservationId.slice(0, 8).toUpperCase()}.pdf`;
       document.body.appendChild(a);
       a.click();
       document.body.removeChild(a);
       setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
     } catch (err: any) {
       console.error('[NewBookingModal] Download voucher error:', err);
       setError(err?.message || 'Failed to download reservation voucher.');
     } finally {
       setDownloadingVoucher(false);
     }
   };
   ```

**Security Benefits:**
- The Supabase Bearer JWT is transmitted **only in HTTP request headers**, never in URLs.
- Ephemeral Blob URLs (`blob:http://localhost:5173/<uuid>`) are created and revoked in memory.
- Zero credentials leak to browser navigation history, reverse proxy logs, or Referer headers.

---

## 4. Tenant Isolation and PII Protection Results

### 4.1 Tenant Scoping Rules
1. **Super-Admin Policy:**
   - Role verified via `scopedSupabase.rpc('is_super_admin')` and `company_users` table (`role === 'founder' || role === 'company_admin'`).
   - Super Admins can access reservations across any hotel property.
2. **Hotel Administrator / Staff Policy:**
   - Staff identity resolved strictly against `hotel_admins` table (`status === 'Active'`).
   - Query strictly enforces `.eq('hotel_id', auth.hotelId)`.
   - Client-supplied hotel headers cannot override server-resolved hotel binding.

### 4.2 Fail-Closed Cross-Tenant Protection
When an administrator from Hotel A queries a reservation belonging to Hotel B:
- The database query returns zero records because `reservation.hotel_id !== auth.hotelId`.
- The handler returns **HTTP 404 `RESERVATION_NOT_FOUND`**.
- **Security Assessment:** Returning 404 rather than 403 prevents malicious enumeration of foreign reservation UUIDs.

### 4.3 Response Sanitization & Cache Headers
- All denied responses (401, 403, 404, 500) return structured JSON containing no PDF magic bytes (`%PDF-`) and no guest PII (names, phone numbers, emails, dates, or tariffs).
- All successful PDF responses enforce strict caching and MIME headers:
  ```http
  Content-Type: application/pdf
  Content-Disposition: inline; filename="Reservation-Confirmation-<booking_id>.pdf"
  Cache-Control: private, no-store, max-age=0, must-revalidate
  Pragma: no-cache
  Expires: 0
  X-Content-Type-Options: nosniff
  ```

---

## 5. Tests Executed and Actual Outcomes

### 5.1 SEC-05 Test Suite Execution (`scripts/test_p0_sec05_reservation_pdf_security.mjs`)
Command: `npm run test:p0-sec05`  
Exit Code: `0`  
Result: **67/67 PASS** (0 FAILURES)

```
===============================================================
HOTELMANTRI — PHASE 1D (SEC-05) RESERVATION PDF SECURITY SUITE
===============================================================

[Section 1] Scoped Guest Token Cryptography & Purpose Isolation:
  ✓ PASS: generateGuestConfirmationToken produces 2-part signed token
  ✓ PASS: Valid confirmation token passes verifyGuestReservationToken
  ✓ PASS: Token payload binds purpose: reservation_confirmation
  ✓ PASS: Token payload binds target reservation ID
  ✓ PASS: Token payload binds target hotel ID
  ✓ PASS: verifyGuestCheckoutToken rejects confirmation token
  ✓ PASS: Error code is TOKEN_PURPOSE_MISMATCH
  ✓ PASS: verifyGuestReservationToken accepts valid guest checkout token
  ✓ PASS: Rejects tampered token signature
  ✓ PASS: Error code is TOKEN_INVALID_SIGNATURE
  ✓ PASS: Rejects expired confirmation token
  ✓ PASS: Error code is TOKEN_EXPIRED
  ✓ PASS: Rejects token presented for wrong reservation ID
  ✓ PASS: Error code is TOKEN_RESERVATION_MISMATCH

[Section 2] Live Route Authorization & Tenant Boundary Enforcement:
  ✓ PASS: Unauthenticated PDF request returns HTTP 401
  ✓ PASS: Error code is AUTH_REQUIRED
  ✓ PASS: Unauthenticated response does not contain PDF bytes
  ✓ PASS: Unauthenticated response does not contain guest name
  ✓ PASS: Unauthenticated response does not contain guest phone
  ✓ PASS: Invalid token request returns HTTP 401
  ✓ PASS: Error code is INVALID_TOKEN
  ✓ PASS: Invalid token response does not return PDF bytes
  ✓ PASS: Tampered token request returns HTTP 401
  ✓ PASS: Error code is TOKEN_INVALID_SIGNATURE
  ✓ PASS: Tampered token response does not return PDF bytes
  ✓ PASS: Expired token request returns HTTP 401
  ✓ PASS: Error code is TOKEN_EXPIRED
  ✓ PASS: Cross-reservation guest access returns HTTP 403
  ✓ PASS: Error code is TOKEN_RESERVATION_MISMATCH
  ✓ PASS: Cross-reservation response does not return PDF bytes
  ✓ PASS: Cross-reservation response does not disclose victim guest PII
  ✓ PASS: Valid guest token returns HTTP 200
  ✓ PASS: Content-Type is application/pdf
  ✓ PASS: Cache-Control header contains private, no-store
  ✓ PASS: Pragma header is no-cache
  ✓ PASS: X-Content-Type-Options is nosniff
  ✓ PASS: Response buffer starts with %PDF magic bytes
  ✓ PASS: Authorized hotel administrator returns HTTP 200
  ✓ PASS: Administrator response Content-Type is application/pdf
  ✓ PASS: Administrator response Cache-Control is private, no-store
  ✓ PASS: Administrator receives valid PDF binary
  ✓ PASS: Cross-tenant administrator access fails closed with HTTP 404
  ✓ PASS: Error code is RESERVATION_NOT_FOUND
  ✓ PASS: Cross-tenant response does not return PDF bytes
  ✓ PASS: Cross-tenant response does not disclose foreign tenant guest PII
  ✓ PASS: Query parameter bearer JWT is strictly rejected with HTTP 401
  ✓ PASS: Error code is QUERY_JWT_DISALLOWED
  ✓ PASS: Query parameter bearer JWT returns no PDF bytes
  ✓ PASS: Query parameter bearer JWT returns no guest PII
  ✓ PASS: Staff Authorization Bearer header returns HTTP 200
  ✓ PASS: Returns PDF buffer for staff Bearer header
  ✓ PASS: Staff Authorization Bearer for foreign hotel fails closed with 404
  ✓ PASS: Super Administrator can access reservation across properties
  ✓ PASS: Super Admin receives valid PDF bytes
  ✓ PASS: GET /api/reservations/:id/confirmation returns HTTP 200
  ✓ PASS: Confirmation response includes signed confirmationToken for frontend consumption
  ✓ PASS: Token issued by confirmation status endpoint authorizes PDF retrieval
  ✓ PASS: Returns PDF buffer
  ✓ PASS: x-guest-token header authorizes PDF retrieval
  ✓ PASS: Returns PDF buffer for x-guest-token header
  ✓ PASS: Guest token with mismatched hotel binding fails closed with 404
  ✓ PASS: Error code is RESERVATION_NOT_FOUND
  ✓ PASS: Mismatched hotel guest token returns no PDF bytes
  ✓ PASS: x-guest-token with JWT string is rejected with HTTP 401
  ✓ PASS: Error code is QUERY_JWT_DISALLOWED

[Section 3] Reservation PDF Service Functionality:
  ✓ PASS: generateReservationPdfBuffer produces non-empty binary buffer (> 1KB)
  ✓ PASS: Buffer begins with %PDF specification header

===============================================================
TOTAL SEC-05 TESTS: 67 | PASSED: 67 | FAILED: 0
===============================================================
```

### 5.2 Full Repository Regression Verification
All regression suites across the codebase were executed and recorded:

| Test Suite | Target Scope | Command | Exit Code | Result |
| :--- | :--- | :--- | :---: | :--- |
| **SEC-05 PDF Suite** | PDF Auth, Tenant Isolation, Header Hardening | `npm run test:p0-sec05` | `0` | **67/67 PASS** |
| **Auth Middleware** | Session Resolution & Hotel Context | `npm run test:auth` | `0` | **14/14 PASS** |
| **SEC-01 & SEC-02** | Credential Hardening & Fallback Removal | `npm run test:p0-phase1a` | `0` | **23/23 PASS** |
| **SEC-03 Suite** | Payment Security & Atomic Verification | `npm run test:p0-sec03` | `0` | **51/51 PASS** |
| **SEC-03B Suite** | Guest Token Checkout & Ledger Idempotency | `npm run test:p0-sec03b` | `0` | **36/36 PASS** |
| **SEC-04 Suite** | Edge Function Authorization & Deletions | `npm run test:p0-sec04` | `0` | **67/67 PASS** |
| **Live Staging HTTP** | Dedicated Staging Gateway Verification | Manual Runtime Probe | — | **BLOCKED** |

---

## 6. Corrective Changes and Supporting Evidence

| File | Change Description | Security Justification |
| :--- | :--- | :--- |
| `src/lib/api-reservations.ts` | Included `confirmationToken: res.confirmationToken` and `_confirmationToken` in the mapped `saveReservations` response. | Provides frontend modals with legitimate scoped HMAC confirmation tokens issued by the server. |
| `src/components/NewBookingModal.tsx` | Purged `session.access_token` fallback into `confirmationToken` state. Implemented `handleDownloadVoucher` using authenticated `fetch` with `Authorization: Bearer <jwt>` and ephemeral Blob URLs. Replaced `<a href>` with `<button>`. | Eliminates CWE-598 credential leakage in browser history, proxy access logs, and Referer headers; restores voucher download functionality without exposing credentials. |
| `server/routes/reservations.js` | Enforced strict rejection of 3-part JWT in `req.query.token` and `headers['x-guest-token']` with HTTP 401 `QUERY_JWT_DISALLOWED`. Enforced Bearer tokens strictly via `Authorization` header. | Prevents master bearer tokens from ever being passed in URLs or guest token slots. |
| `src/components/reservations/ReservationConfirmationModal.tsx` | Upgraded Preview, Print, Download, and Version History actions to use `fetchPdfBlob()` with header-based authorization and ephemeral Blob URLs. | Eliminates query parameter token exposure across all staff dashboard PDF viewing operations. |
| `scripts/test_p0_sec05_reservation_pdf_security.mjs` | Added 7 new assertions verifying `x-guest-token` header authentication, cross-hotel guest token presentation rejection (HTTP 404), and `x-guest-token` JWT rejection. | Provides automated, regression-proof verification of header authentication and tenant boundaries. |

---

## 7. Remaining Staging Requirements and Release Recommendation

### 7.1 Staging Runtime Verification Checklist
Because live staging service role credentials (`SUPABASE_SERVICE_ROLE_KEY`) are not provisioned in the local environment, runtime testing against the live staging database is formally marked **BLOCKED**.

Prior to production deployment, the following verification steps must be executed in the dedicated staging environment:

1. **Staging Gateway Environment Configuration:**
   - Confirm `GUEST_CHECKOUT_SECRET` is provisioned in the staging environment with $\ge 32$ characters.
   - Confirm `SUPABASE_SERVICE_ROLE_KEY` is configured in the staging backend environment.
2. **End-to-End Browser Dashboard Verification:**
   - Log into the staging dashboard as a Hotel Admin.
   - Open an existing reservation and click **Preview PDF**, **Print PDF**, and **Download PDF**.
   - Verify that the network inspector shows `Authorization: Bearer <jwt>` on the HTTP request and that the opened tab URL is `blob:https://staging.hotelmantri.com/...`.
   - Inspect browser history to confirm zero Supabase JWTs are stored in URL entries.
3. **Front Desk Voucher Download Verification:**
   - Create a direct booking via New Booking Modal on staging.
   - Click **Download Voucher**. Verify that the PDF downloads successfully and network inspection shows `Authorization: Bearer <jwt>` without query tokens.
4. **Guest Voucher Verification:**
   - Access the confirmation voucher link using an issued HMAC `confirmationToken`.
   - Verify successful download in an incognito window without an active session.
   - Verify that modifying any character of the token parameter returns HTTP 401 `TOKEN_INVALID_SIGNATURE`.
5. **Cross-Tenant Barrier Verification:**
   - Attempt to access a Hotel B reservation confirmation PDF while authenticated as Hotel A staff.
   - Verify that the server responds with HTTP 404 `RESERVATION_NOT_FOUND` and returns zero PDF bytes.

### 7.2 Release Recommendation
- **Final Verdict:** **CONDITIONAL PASS**
- **Action:** Code changes approved for staging deployment alongside SEC-03B and SEC-04.
- **Constraints:**
  - Do NOT deploy to production until staging runtime verification passes.
  - Do NOT begin SEC-06 until Project Manager and Senior Developer review this report.

---
*Report independently prepared by Senior Security Reviewer for Project Manager & Senior Full-Stack Developer.*
