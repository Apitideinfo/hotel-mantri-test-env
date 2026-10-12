# HOTELMANTRI — PHASE 1I: SEC-10 FAST-TRACK REPORT
## Request Body Limits, Rate Limiting & Resource-Exhaustion Protection

- **Role:** Senior Full-Stack Security Implementation Engineer  
- **Date:** October 12, 2026  
- **Status:** Complete & Verified  
- **Classification:** P0 Security Hardening  
- **Final Verdict:** **PASS**  

---

## 1. Executive Summary

As part of the HotelMantri P0 security remediation track, **SEC-10** addresses the resource-exhaustion and Denial of Service (DoS) risks arising from:
1. **Excessive Global Request Body Limits:** Express previously applied an unconstrained `10mb` limit globally across all JSON and URL-encoded requests (`express.json({ limit: '10mb' })` and `express.urlencoded({ extended: true, limit: '10mb' })`). Attackers could flood API routes with 10MB payloads, depleting Node.js buffer memory and garbage collection capacity.
2. **Missing Endpoint Rate Limiting:** Sensitive and computationally intensive endpoints—such as cron execution, PDF confirmation generation, inbound OTA webhook ingestion, and general API routes—had either unstandardized rate limiting or lacked protection against rapid burst abuse and resource exhaustion.

### Key Changes Delivered:
- **Default Global Body Limit Hardened to 1MB:** Replaced the global 10MB body parser with a secure 1MB default (`express.json({ limit: '1mb' })`).
- **Narrowly Scoped 10MB Upload Route:** Scoped the 10MB limit strictly to `/api/hotel-branding/logo` to preserve legitimate base64 image branding uploads without exposing the rest of the application.
- **Structured HTTP 413 Handler:** Intercepted `entity.too.large` / `413` errors in Express error middleware, returning uniform JSON (`PAYLOAD_TOO_LARGE`) with active request tracking IDs and safe client error messages.
- **Centralized Sliding-Window Rate Limiter (`server/middleware/rateLimiter.js`):** Built a high-performance, in-memory sliding-window limiter with automated timestamp cleanup and configurable tiers:
  - **Payment Gateways (`/api/create-order`, `/api/verify-payment`):** 40 req/min (retained and unified from SEC-03B).
  - **Cron Execution (`/api/notifications/whatsapp/cron`, `/cron`):** 10 req/min.
  - **PDF Generation (`/api/reservations/:id/confirmation/pdf`, `/regenerate`):** 30 req/min.
  - **Inbound Channel Webhooks (`/api/aiosell/reservations`):** 120 req/min.
  - **General API Tier:** 300 req/min.
- **Safe Error Responses & No Downstream Side Effects:** Rate-limited callers receive HTTP 429 (`RATE_LIMIT_EXCEEDED` or route-specific code) accompanied by RFC-compliant `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers. Downstream execution (database RPCs, payment calls, WhatsApp/email notifications) is halted immediately.

---

## 2. Root Cause & Files Modified

### 2.1 Root Cause
1. **Overly Permissive Express Defaults:** In `server/index.js`, `express.json({ limit: '10mb' })` was mounted globally to accommodate base64 hotel logo uploads on `/api/hotel-branding/logo`. Because it was mounted at the top-level app router, all ordinary API routes (checkouts, reservations, ledger entries, settings) inherited a 10MB allowance.
2. **Fragmented Rate Limiting:** While SEC-03B established rate limiting on payment endpoints (`server/services/paymentSecurityService.js`), other critical or heavy endpoints (cron jobs, reservation PDF generation, OTA webhook ingestion) lacked burst protection.

### 2.2 Files Modified

| File | Type | Changes Made |
| :--- | :--- | :--- |
| `server/middleware/rateLimiter.js` | **New** | Centralized in-memory sliding-window rate limiter factory (`createRateLimiter`), client IP normalization (`getClientIp`), memory cleanup timer, standard rate limit headers, testing bypass & reset hooks, and specialized limiters. |
| `server/services/paymentSecurityService.js` | **Modified** | Re-exported centralized `paymentRateLimiter` from `server/middleware/rateLimiter.js` for 100% backward compatibility with existing payment verification and integration suites. |
| `server/index.js` | **Modified** | Moved `requestIdMiddleware` before body parsers. Mounted route-specific 10MB parsers strictly for `['/api/hotel-branding/logo', '/hotel-branding/logo']`. Enforced global 1MB default body limit. Added global HTTP 413 error interceptor returning `{ success: false, code: 'PAYLOAD_TOO_LARGE' }`. |
| `server/routes/notifications.js` | **Modified** | Attached `cronRateLimiter` (10 req/min) to `/whatsapp/cron` and `/cron` endpoints. |
| `server/services/integrations/aiosell/AiosellWebhookController.js` | **Modified** | Attached `webhookRateLimiter` (120 req/min) to `POST /reservations` inbound webhook handler. |
| `server/routes/reservations.js` | **Modified** | Attached `pdfRateLimiter` (30 req/min) to `GET /:id/confirmation/pdf` and `POST /:id/confirmation/regenerate`. |
| `scripts/test_p0_sec10_rate_limiting.mjs` | **New** | 20 comprehensive unit and integration tests verifying body-parser limits, rate limiting thresholds, header correctness, HTTP 413/429 status codes, and zero side-effects. |
| `package.json` | **Modified** | Registered `"test:p0-sec10": "node scripts/test_p0_sec10_rate_limiting.mjs"`. |

---

## 3. Request Body Limits: Before vs After

| Endpoint Pattern | Purpose | Before SEC-10 Limit | After SEC-10 Limit | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **Global (`/*`)** | All standard JSON & form routes | `10mb` | **`1mb`** | Standard JSON requests (bookings, ledger entries, auth) are < 50KB. 1MB provides generous headroom while blocking multi-megabyte flood attacks. |
| `/api/hotel-branding/logo` | Hotel logo base64 upload | `10mb` (global) | **`10mb` (scoped)** | Scoped specifically to logo upload route to permit high-res logo image assets without opening other routes. |
| `/hotel-branding/logo` | Direct rewrite logo route | `10mb` (global) | **`10mb` (scoped)** | Accommodates direct router mounting without `/api` prefix. |

### Error Response for Oversized Payloads (HTTP 413):
```json
{
  "success": false,
  "code": "PAYLOAD_TOO_LARGE",
  "error": "Request payload exceeds allowed limit of 1mb. Please reduce payload size.",
  "requestId": "HM-REQ-MV5A00R1-XXXXXX"
}
```

---

## 4. Rate-Limited Endpoints & Configured Thresholds

All rate limiters enforce sliding windows using client IP (`req.headers['x-forwarded-for']` first IP or `req.ip` / `req.socket.remoteAddress`).

| Limiter | Endpoint(s) | Window | Max Req | Error Code | HTTP Status | Headers Dispatched |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `paymentRateLimiter` | `POST /api/create-order`<br>`POST /api/verify-payment` | 60s | **40** | `PAYMENT_RATE_LIMIT_EXCEEDED` | **429** | `Retry-After`, `X-RateLimit-*` |
| `cronRateLimiter` | `GET /api/notifications/whatsapp/cron`<br>`POST /api/notifications/whatsapp/cron`<br>`/cron` | 60s | **10** | `CRON_RATE_LIMIT_EXCEEDED` | **429** | `Retry-After`, `X-RateLimit-*` |
| `pdfRateLimiter` | `GET /api/reservations/:id/confirmation/pdf`<br>`POST /api/reservations/:id/confirmation/regenerate` | 60s | **30** | `PDF_RATE_LIMIT_EXCEEDED` | **429** | `Retry-After`, `X-RateLimit-*` |
| `webhookRateLimiter` | `POST /api/aiosell/reservations` | 60s | **120** | `WEBHOOK_RATE_LIMIT_EXCEEDED` | **429** | `Retry-After`, `X-RateLimit-*` |
| `generalApiRateLimiter` | Standard API routes (optional / configurable) | 60s | **300** | `RATE_LIMIT_EXCEEDED` | **429** | `Retry-After`, `X-RateLimit-*` |

### Rate Limit Response Headers:
- `X-RateLimit-Limit`: Maximum requests permitted in the window.
- `X-RateLimit-Remaining`: Remaining requests permitted in the current window.
- `X-RateLimit-Reset`: Unix epoch timestamp (seconds) when the window resets.
- `Retry-After`: Seconds until the client may retry (present on HTTP 429).

---

## 5. Architectural Evaluation: In-Memory vs Distributed Limiting

> [!IMPORTANT]
> **Serverless & Multi-Instance Architecture Notice**
> 
> The current rate limiter implementation is an **in-memory sliding window** using Node.js `Map` storage with automatic garbage collection of expired timestamps every 60 seconds.
> 
> **Operational Characteristics:**
> - **Single-Instance Deployment (Node.js Server / Container / VPS):** Completely protects against single-IP volumetric floods, burst DDoS, and CPU/memory resource exhaustion.
> - **Serverless / Multi-Instance Deployment (AWS Lambda, Vercel Serverless Functions):**
>   - In a serverless environment, memory is isolated per lambda/container execution sandbox.
>   - An in-memory rate limiter **does not share state** across concurrent lambdas.
>   - Consequently, while each lambda enforces the limit on connections routed to it, a distributed burst across multiple concurrent warm containers may yield higher aggregate throughput than the per-instance ceiling.
> - **Production Roadmap Recommendation:**
>   - For multi-region serverless deployment, an external shared fast-key store (e.g., Upstash Redis, Redis Cluster, or Cloudflare KV / Workers Rate Limiting) should be connected via standard adapter interface.
>   - The `createRateLimiter` abstraction in `server/middleware/rateLimiter.js` is structured so an async Redis store adapter can be swapped in without modifying any Express route signatures.

---

## 6. Verification & Test Results

### 6.1 SEC-10 Dedicated Test Suite (`scripts/test_p0_sec10_rate_limiting.mjs`)

**Execution Command:** `npm run test:p0-sec10`  
**Result:** **20 Passed, 0 Failed (Exit Code: 0)**

- **Suite 1: Request Body Limits (Global 1MB vs Scoped 10MB)**
  - `✓ PASS: Normal JSON payload (2KB) under 1MB limit succeeds on standard endpoint`
  - `✓ PASS: Oversized payload (1.5MB) on standard endpoint rejected with HTTP 413`
  - `✓ PASS: Error code for oversized payload is PAYLOAD_TOO_LARGE`
  - `✓ PASS: Error response includes active requestId`
  - `✓ PASS: Large payload (2.5MB) allowed on scoped /api/hotel-branding/logo`
  - `✓ PASS: Scoped logo endpoint rejects payload exceeding 10MB limit (>10MB) with HTTP 413`
  - `✓ PASS: Zero downstream side effects triggered when request rejected with HTTP 413`
- **Suite 2: Centralized In-Memory Sliding-Window Rate Limiter Engine**
  - `✓ PASS: Requests under limit succeed and decrements X-RateLimit-Remaining`
  - `✓ PASS: Requests exceeding limit rejected with HTTP 429`
  - `✓ PASS: Returns correct custom error code: TEST_LIMIT_EXCEEDED`
  - `✓ PASS: Includes Retry-After header with numeric retry duration >= 1`
  - `✓ PASS: Different IP addresses maintain independent rate limit buckets`
  - `✓ PASS: Rate limit window resets after time elapses`
- **Suite 3: Specialized Endpoint Rate Limiting (Live Route Integration)**
  - `✓ PASS: Payment rate limiter rejects requests exceeding 40 req/min with HTTP 429`
  - `✓ PASS: Cron rate limiter rejects requests exceeding 10 req/min with HTTP 429`
  - `✓ PASS: PDF rate limiter rejects requests exceeding 30 req/min with HTTP 429`
  - `✓ PASS: Inbound webhook rate limiter allows high throughput (up to 120 req/min)`
  - `✓ PASS: Live Cron endpoint enforces 10 req/min and returns HTTP 429 on burst`
  - `✓ PASS: Live Payment endpoint enforces 40 req/min and returns HTTP 429 on burst`
  - `✓ PASS: Live PDF endpoint enforces 30 req/min and returns HTTP 429 on burst`

### 6.2 Full Security Regression Matrix

| Test Suite | Command | Result | Notes |
| :--- | :--- | :--- | :--- |
| **SEC-10 Rate Limiting** | `npm run test:p0-sec10` | **20 / 20 PASS** | Request body limits & multi-tiered rate limiting |
| **SEC-09 Timing-Safe Checks** | `npm run test:p0-sec09` | **34 / 34 PASS** | Constant-time HMAC & secret comparisons |
| **SEC-08 Supabase Session Isolation**| `npm run test:p0-sec08` | **37 / 37 PASS** | Non-persisted server sessions & user isolation |
| **SEC-07 CORS Security** | `npm run test:p0-sec07` | **85 / 85 PASS** | Strict origin allowlist & credential defense |
| **SEC-06 Cron Authentication** | `npm run test:p0-sec06` | **68 / 68 PASS** | Fail-closed cron secrets & concurrency locks |
| **SEC-05 Reservation PDF Security** | `npm run test:p0-sec05` | **67 / 67 PASS** | Scoped guest token & tenant boundary defense |
| **SEC-03B Payment Integrity** | `npm run test:p0-sec03b`| **All PASS** | Payment serialization & replay guards |
| **SEC-03 Payment Hardening** | `npm run test:p0-sec03` | **51 / 51 PASS** | Plan amounts & webhook verification |
| **Auth Context Suite** | `npm run test:auth` | **14 / 14 PASS** | Tenant resolution & Bearer validation |

### 6.3 TypeScript & Build Verification
- **Node Server TypeScript Check:** `npx tsc -p tsconfig.node.json --noEmit`  
  **Result:** **0 Errors (Exit Code: 0)**
- **Vite Production Build:** `npm run build`  
  **Result:** **Exit Code 0** (`✓ built in 41.79s`, 99 distribution chunks generated clean).

---

## 7. Remaining Staging Requirements

Prior to enabling SEC-10 in staging and production:
1. **Reverse Proxy Header Validation:** Ensure reverse proxies (Cloudflare, AWS ALB, Nginx) configure `X-Forwarded-For` correctly and strip client-forged headers so client IPs cannot be spoofed to evade rate limiting.
2. **Reverse Proxy Body Limits:** Ensure upstream edge proxies (Nginx / Cloudflare `client_max_body_size`) align with or exceed the application's 10MB upload ceiling so legitimate branding logo uploads are not rejected at the network edge.
3. **Distributed Redis Limiter Configuration (Optional for Cloud Multi-Instance):** If moving to multi-container AWS ECS / Vercel Serverless with high concurrency, configure an Upstash Redis connection string in environment variables (`UPSTASH_REDIS_REST_URL` / `REDIS_URL`) to link the rate limiter across instances.

---

## 8. Final Verdict

### **PASS**

All objectives of **PHASE 1I: SEC-10 FAST-TRACK** are completed. Request body limits are strictly constrained, sensitive endpoints enforce multi-tiered sliding-window rate limits, HTTP 413 and 429 error responses fail closed without downstream side effects, all 20 SEC-10 tests passed, and the complete regression test matrix and production build passed with zero defects.
