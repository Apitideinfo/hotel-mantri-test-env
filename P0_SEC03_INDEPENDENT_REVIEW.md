# HOTELMANTRI — PHASE 1B INDEPENDENT SECURITY REVIEW
## SEC-03 Payment Hardening Verification Gate

**Date:** October 11, 2026  
**Reviewer:** Implementation Engineer  
**Reporting To:** Senior Full-Stack Developer and Project Manager  
**Scope:** SEC-03 (Razorpay Payment Lifecycle Hardening & Verification)  
**Status:** Verification Complete — Independent Security Review Report  

---

### 1. Verified Findings and Exact Source References

The independent source code review inspected all files modified and touched during Phase 1B:
- [`server/index.js`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/server/index.js) (lines 124–390)
- [`server/razorpayService.ts`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/server/razorpayService.ts) (lines 56–112)
- [`server/services/paymentSecurityService.js`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/server/services/paymentSecurityService.js) (lines 1–647)
- [`src/lib/razorpay.ts`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/src/lib/razorpay.ts) (lines 1–145)
- [`src/components/common/RazorpayPayButton.tsx`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/src/components/common/RazorpayPayButton.tsx) (lines 1–45)
- [`vite.config.ts`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/vite.config.ts) (lines 65–110)
- [`scripts/test_p0_sec03_payment_hardening.mjs`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/scripts/test_p0_sec03_payment_hardening.mjs) (lines 1–518)
- Database schema definitions in [`supabase/migrations/20260814000000_initial_schema.sql`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/supabase/migrations/20260814000000_initial_schema.sql)

#### Summary of Confirmed Remediations and Vulnerabilities
| Code Location | Original Vulnerability | Remediation in Phase 1B | Verification Status |
| :--- | :--- | :--- | :---: |
| [`server/index.js#L128`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/server/index.js#L128) | Unauthenticated, arbitrary client amount accepted on `/api/create-order` | Enforced `validateAndDeriveOrderContext` with canonical SaaS plan pricing and reservation balance checking. | **VERIFIED** |
| [`server/index.js#L237`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/server/index.js#L237) | No rate limiting on payment endpoints | Applied sliding window `paymentRateLimiter` (40 req/min/IP). | **VERIFIED** |
| [`server/razorpayService.ts#L68`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/server/razorpayService.ts#L68) | Timing attack vulnerability via `===` equality comparison on HMAC digests | Implemented `crypto.timingSafeEqual` with byte length guards to prevent `RangeError`. | **VERIFIED** |
| [`server/index.js#L281`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/server/index.js#L281) | No concurrency protection or replay checks | Added `withPaymentLock` mutex and `checkPaymentIdempotency` returning `{ idempotent: true }`. | **VERIFIED** |
| [`server/index.js#L307`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/server/index.js#L307) | Cross-tenant payment association possible | Added tenant validation (`orderRecord.hotelId === authContext.hotelId`). | **VERIFIED** |

---

### 2. Amount and Currency Correctness

#### A. SaaS Subscription Pricing
- **Canonical Plan Rates (Paise & INR):**
  - Basic: ₹999 / 99,900 paise
  - Pro / Standard: ₹1,999 / 199,900 paise
  - Premium: ₹3,999 / 399,900 paise
- **Nomenclature Divergence:** The frontend marketing page ([`src/data/landingData.ts`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/src/data/landingData.ts)) specifies `Basic (₹999)`, `Pro (₹1,999)`, and `Premium (₹3,999)`, whereas historical database seed scripts ([`supabase/migrations/20260814000000_initial_schema.sql#L875`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/supabase/migrations/20260814000000_initial_schema.sql#L875)) used `Basic (₹999)`, `Standard (₹1,999)`, and `Pro (₹3,999)`.
- **Resolution:** [`server/services/paymentSecurityService.js`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/server/services/paymentSecurityService.js) harmonizes both models by supporting aliases (`pro` and `standard` both resolve to ₹1,999, `premium` resolves to ₹3,999).
- **Enforcement:** Client-supplied amounts are strictly verified against `plan.amountPaise`. Any discrepancy immediately returns HTTP 400 `AMOUNT_MISMATCH`. Non-INR currencies return HTTP 400 `INVALID_CURRENCY`.

#### B. Reservation Booking Amounts
- **Schema Columns:**
  - `invoice_total`: `numeric(12,2)` (from reservation wizard schema, default 0).
  - `rate`: `numeric(12,2)` (from core schema, default 0).
  - `advance_paid`: `numeric(12,2)` (cumulative advance collections, default 0).
- **Calculation Rule:**
  $$\text{Total Payable} = \begin{cases} \text{invoice\_total} & \text{if } \text{invoice\_total} > 0 \\ \text{rate} & \text{otherwise} \end{cases}$$
  $$\text{Due Balance} = \max(0, \text{Total Payable} - \text{advance\_paid})$$
  $$\text{Authoritative Amount (paise)} = \text{round}(\text{Due Balance} \times 100)$$
- **Safety Boundary:** If `Due Balance <= 0`, request is rejected with HTTP 400 `RESERVATION_ALREADY_PAID`.

---

### 3. Provider Payment-Status Verification

#### Cryptographic Signature vs. Gateway Lifecycle Status
- **Signature Verification:** The HMAC-SHA256 signature calculated over `razorpay_order_id + '|' + razorpay_payment_id` with `RAZORPAY_KEY_SECRET` cryptographically confirms that Razorpay originated the payment transaction for the specified order.
- **Provider Status Semantics (Critical Distinction):**
  - Razorpay payment objects possess lifecycle statuses: `created`, `authorized`, `captured`, `failed`, `refunded`.
  - While signature verification is Razorpay's recommended synchronous client-side callback verification mechanism, if the merchant account operates with *manual capture* (auto-capture disabled), an `authorized` payment produces a valid signature before funds are captured.
  - Furthermore, checking `payment.status === 'captured'` and verifying that `payment.amount === order.amount` via `razorpay.payments.fetch(razorpay_payment_id)` provides defense-in-depth against pre-authorized or refunded payments.
- **Recommendation:** Keep signature verification as primary, but where network latency permits, add optional server-side `client.payments.fetch(payment_id)` verification confirming `status === 'captured'` prior to final reservation state transition.

---

### 4. Reservation Ownership and Guest-Checkout Assessment

#### The Guest Checkout Vector
- For authenticated hotel operators, tenant ownership is verified via JWT context (`authContext.hotelId === resv.hotel_id`).
- For **guest checkout** (unauthenticated public online booking payment):
  - Current implementation checks:
    ```javascript
    const emailMatches = normInputEmail && resvEmail && normInputEmail === resvEmail;
    const phoneMatches = normInputPhone && resvPhone && (resvPhone.endsWith(normInputPhone) || normInputPhone.endsWith(resvPhone));
    ```
- **Security Assessment:**
  - Phone numbers and email addresses are not unguessable secrets.
  - While reservation IDs are random UUIDs (`gen_random_uuid()`), relying solely on contact info allows anyone possessing a guest's phone number and reservation UUID to initiate an order or verify outstanding balance.
- **Recommended Secure Approach (Backward-Compatible):**
  - Implement server-signed checkout tokens when generating guest payment links (e.g., via WhatsApp or SMS):
    $$\text{Token} = \text{HMAC-SHA256}(\text{reservation\_id} + ':' + \text{hotel\_id} + ':' + \text{expires\_at}, \text{HMAC\_SECRET})$$
  - The payment link delivered to the guest includes `?token=...&resv=...`.
  - The backend validates the signature and expiration time, ensuring only recipients of the authorized link can initiate payments without requiring guest user accounts.

---

### 5. Idempotency and Transaction Atomicity Findings

#### Idempotency Architecture
- **In-Memory Cache:** `inMemoryProcessedPayments` Map tracks verified payment IDs during application lifetime.
- **Database Lookup:** Checks `audit_logs` for `action = 'PAYMENT_VERIFIED'` and `record_id = payment_id`.
- **Reservation Lookup:** Checks `reservations` for `payment_ref = payment_id`.
- **Result:** Repeated payment verification calls return HTTP 200 `{ success: true, idempotent: true }` without re-crediting the balance or inserting redundant records.

#### Atomicity & Transaction Analysis (Identified Limitation)
- **Current Flow in [`server/index.js#L335-L372`](file:///c:/Users/kirad/OneDrive/Desktop/Hotel%20Mantri%20-%20Software/server/index.js#L335-L372):**
  1. `supabaseServiceRole.from('reservations').select(...)`
  2. `supabaseServiceRole.from('reservations').update({ advance_paid, payment_ref, ... })`
  3. `recordPaymentAuditLog(...)`
- **Gaps:**
  1. **Non-Atomic Read-Modify-Write:** If two verification events occur simultaneously outside the single-process mutex (e.g. multi-server cluster), a race condition could overwrite `advance_paid`.
  2. **No Database Transaction / Rollback:** If the reservation update succeeds but the audit log insert fails, state is partially written.
  3. **No Database Unique Constraint:** Neither `audit_logs.record_id` nor `reservations.payment_ref` has a unique constraint in the PostgreSQL schema.

---

### 6. Multi-Instance Limitations

When deployed to serverless environments (e.g. Vercel) or horizontally scaled containers:
1. **Mutex Scope:** `withPaymentLock` uses an in-process JavaScript `Map`. Requests routed to different server instances will not share this lock.
2. **In-Memory Order Cache:** `inMemoryOrdersCache` is local to the Node instance. If Instance A creates the order and Instance B verifies it, Instance B falls back to querying `audit_logs` or calling `razorpay.orders.fetch(order_id)`. (Fallback is functional, but adds an external API call).
3. **Rate Limiting:** `paymentRateLimiter` is per-instance. An attacker distributing requests across multiple serverless lambda instances would have higher aggregate rate capacity.
4. **Conclusion:** Production multi-instance deployments require database-backed unique constraints and atomic transactional updates.

---

### 7. Actual Test Results and Coverage Analysis

All test suites were executed on the active repository:

| Test Suite | Command | Executed Tests | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| **SEC-03 Payment Hardening** | `npm run test:p0-sec03` | 51 / 51 | **PASS** | Tests real Express endpoints via HTTP, constant-time checks, tampered amounts, currencies, replay attacks. |
| **Phase 1A Regression** | `npm run test:p0-phase1a` | 23 / 23 | **PASS** | Validates secret purge, fail-closed client proxy, bundle hygiene. |
| **Authentication & Context** | `npm run test:auth` | 14 / 14 | **PASS** | JWT validation, 401/403 status codes, hotel isolation. |
| **Revenue Allocation Engine** | `npm run test:revenue` | 46 / 46 | **PASS** | Nightly accrual, ARR/RevPAR, stay modification, multi-tenant. |
| **Server Import Diagnostics** | `npm run test:diagnostics` | 1 / 1 | **PASS** | Simulated serverless import operational (status 200). |
| **TypeScript Typecheck** | `npm run typecheck` | — | **PASS** | `tsc --noEmit -p tsconfig.app.json` exited with code 0. |
| **Production Vite Build** | `npm run build` | — | **PASS** | Full production build succeeded in 30.60s. Zero secrets in bundles. |
| **Aggregated Test Suite** | `npm test` | All passing | **PASS** | Runs auth + revenue + diagnostics. |

**Coverage Analysis:**
- The automated tests in `test_p0_sec03_payment_hardening.mjs` test actual security properties via real HTTP client calls, real HMAC digests, and real timing buffers.
- Provider SDK calls are safely mocked without external network dependency, ensuring reliable CI execution.

---

### 8. Required Fixes, Ordered by Severity

| Priority | Issue Description | Proposed Remediation |
| :---: | :--- | :--- |
| **P1** | **Lack of Database-Level Unique Constraint on Payment Verification** | Apply a PostgreSQL migration adding a unique constraint or index on payment references to ensure strict idempotency across horizontal server instances. |
| **P2** | **Guest Checkout Authentication via Guessable Contact Information** | Transition guest payment links to use cryptographically signed HMAC checkout tokens (`token = HMAC(resv_id + expires_at)`). |
| **P3** | **Non-Atomic Read-Modify-Write on Reservation Balance** | Implement a database-level atomic stored procedure / RPC (`process_verified_payment`) that locks the reservation row (`FOR UPDATE`) and increments `advance_paid` atomically. |
| **P4** | **Provider Payment Status Verification Defense-in-Depth** | In addition to signature verification, optionally verify `payment.status === 'captured'` via `razorpay.payments.fetch` before marking reservations paid. |

---

### 9. Proposed Database Migration (Awaiting Owner Approval)

> [!IMPORTANT]
> **AWAITING OWNER APPROVAL:** Do not run or apply this migration until reviewed by the Senior Full-Stack Developer and Database Owner.

#### Proposed File: `supabase/migrations/20261011000000_payment_security_ledger.sql`
```sql
-- 1. Create dedicated payment transactions ledger
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid REFERENCES public.hotels(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  payment_id text NOT NULL,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  plan_id text,
  amount_paise integer NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'captured' CHECK (status IN ('authorized', 'captured', 'refunded', 'failed')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_payment_transactions_payment_id UNIQUE (payment_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order ON public.payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_resv ON public.payment_transactions(reservation_id);

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hotel_payment_transactions_isolation" ON public.payment_transactions
  FOR SELECT TO authenticated
  USING (is_super_admin() OR hotel_id = (SELECT hotel_id FROM public.hotel_admins WHERE user_id = auth.uid() LIMIT 1));

-- 2. Atomic Payment Processing RPC
CREATE OR REPLACE FUNCTION public.process_verified_payment(
  p_order_id text,
  p_payment_id text,
  p_reservation_id uuid,
  p_hotel_id uuid,
  p_amount_paise integer,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_resv public.reservations%ROWTYPE;
  v_paid_inr numeric(12,2);
BEGIN
  -- 1. Check uniqueness / idempotency on payment_id
  IF EXISTS (SELECT 1 FROM public.payment_transactions WHERE payment_id = p_payment_id) THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'message', 'Payment already processed');
  END IF;

  -- 2. Insert into payment transactions ledger
  INSERT INTO public.payment_transactions (hotel_id, order_id, payment_id, reservation_id, amount_paise, metadata)
  VALUES (p_hotel_id, p_order_id, p_payment_id, p_reservation_id, p_amount_paise, p_metadata);

  -- 3. Atomically update reservation if specified
  IF p_reservation_id IS NOT NULL THEN
    SELECT * INTO v_resv FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
    IF FOUND THEN
      v_paid_inr := round(p_amount_paise / 100.0, 2);
      UPDATE public.reservations
      SET advance_paid = coalesce(advance_paid, 0) + v_paid_inr,
          payment_ref = p_payment_id,
          payment_mode = 'Razorpay',
          updated_at = now()
      WHERE id = p_reservation_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'idempotent', false, 'message', 'Payment processed successfully');
END;
$$;
```

#### Rollback Guidance for Proposed Migration
```sql
DROP FUNCTION IF EXISTS public.process_verified_payment(text, text, uuid, uuid, integer, jsonb);
DROP TABLE IF EXISTS public.payment_transactions CASCADE;
```

---

### 10. Final Recommendation

**Recommendation: APPROVE WITH CONDITIONS**

- **Approval Rationale:**
  - The core SEC-03 security vulnerabilities (arbitrary amount injection, HMAC timing attacks, unauthenticated order creation, cross-tenant payment association, and in-process replay attacks) have been completely eliminated.
  - 100% backward compatibility is preserved for existing SaaS checkout and reservation flows.
  - All 51 new automated security tests, all 23 Phase 1A regression tests, authentication tests, revenue engine tests, TypeScript typechecks, and production Vite builds pass with zero errors.
- **Conditions for Production Sign-Off:**
  1. **Condition 1 (P1):** Database Owner review and approval of the proposed `payment_transactions` unique constraint migration before horizontal multi-server scaling.
  2. **Condition 2 (P2):** Generation of cryptographically signed tokens for direct guest payment links before exposing guest checkout to unauthenticated public traffic.

---
*End of Phase 1B Independent Review. Awaiting Senior Full-Stack Developer direction before Phase 2.*
