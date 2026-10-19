# Hotel Mantri — External Chatbot Booking API Architecture & Security Audit

**Document Ref:** `docs/CHATBOT_BOOKING_API_AUDIT.md`  
**Date:** October 17, 2026  
**Auditor:** Senior Backend, PostgreSQL Transaction, Supabase Security, Razorpay Integration & QA Lead  
**Scope:** Complete repository audit of Hotel Mantri PMS before implementing the standalone Chatbot Booking API  
**Status:** Audit Complete — Phase 1 Milestone

---

## 1. Executive Summary

Hotel Mantri is a multi-tenant property management system (PMS) built on Express.js (Node.js), Vite/React (TypeScript), and Supabase (PostgreSQL with Row Level Security).

This audit establishes the exact technical baseline required to build a dedicated, independently deployable **Chatbot Reservation & Payment API** that:
1. Connects to the existing Supabase PostgreSQL database without duplicating schemas or corrupting existing operations.
2. Serves one explicitly configured hotel tenant in a fail-closed, multi-tenant-safe manner.
3. Provides live room categories, real-time availability searches, authoritative server-calculated quotes, atomic database-level bookings, and Razorpay payment order creation/verification/webhook settlement.
4. Replaces fragile process-local locks with true database-level transaction guarantees.

---

## 2. Mandatory Security Audit Finding: `server/supabaseClient.js`

### 2.1 The Vulnerability
Inspection of `server/supabaseClient.js` (lines 96–134) revealed a dangerous fallback pattern:
```javascript
// server/supabaseClient.js (lines 96-128)
const validation = validateServiceRoleKey(currentKey);
let effectiveKey = currentKey;
let isFallback = false;

if (!validation.valid) {
  if (!anonKey) {
    throw new Error(`[SupabaseClient] Privileged operation failed: ${validation.message}`);
  }
  // Graceful fallback: use anonymous key when SUPABASE_SERVICE_ROLE_KEY is not provisioned
  effectiveKey = anonKey;
  isFallback = true;
}
...
if (isFallback) {
  console.warn(`[SupabaseClient] Fallback warning: ${validation.message} Elevating client with admin session.`);
  elevationPromise = clientInstance.auth.signInWithPassword({
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@hotelmis.com',
    password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@2026',
  }).catch((err) => {
    console.warn('[SupabaseClient] Auto-elevation fallback warning:', err?.message || err);
  });
}
```

### 2.2 Security Risk
1. **Hardcoded Fallback Credentials:** If `SUPABASE_SERVICE_ROLE_KEY` is omitted, invalid, or corrupted in production, the server attempts to sign in as a hardcoded administrator account (`admin@hotelmis.com` / `Admin@2026`).
2. **Anonymous Key Substitution:** If `SUPABASE_SERVICE_ROLE_KEY` fails, substituting `anonKey` breaks service-role privileges while masking missing configuration, leading to unpredictable RLS policy denials or privilege escalation.
3. **Session Contamination Risk:** Elevating an anonymous client with an admin session introduces shared session state that can leak across asynchronous execution contexts.

### 2.3 Strict Chatbot API Policy (Fail-Closed)
- The dedicated chatbot booking service **shall never copy or import this pattern**.
- The chatbot booking service must strictly **fail closed**: if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing, blank, or invalid at startup, the service will terminate execution immediately with a clear fatal error.
- **Recommendation for Existing Codebase:** In a separate, dedicated PR/patch, remove the fallback credentials from `server/supabaseClient.js` and fail closed when `SUPABASE_SERVICE_ROLE_KEY` is missing.

---

## 3. Database Schema Baseline

### 3.1 Core Operational Tables and Column Contracts
From inspection of `supabase/migrations/20260814000000_initial_schema.sql`, subsequent migrations, and live database queries:

| Table Name | Primary Key | Key Foreign Keys & Unique Constraints | Relevant Columns |
| :--- | :--- | :--- | :--- |
| `hotels` | `id (uuid)` | Primary tenant registry | `hotel_name`, `owner_name`, `admin_email`, `mobile`, `address`, `total_rooms`, `plan_id`, `subscription_status`, `is_active` |
| `rooms` | `id (uuid)` | `hotel_id -> hotels(id)` ON DELETE CASCADE,<br>`category_id -> room_categories(id)` ON DELETE SET NULL,<br>`UNIQUE(hotel_id, room_no)` | `room_no`, `floor`, `default_tariff`, `extra_bed_charge`, `is_active`, `sort_order`, `housekeeping_status`, `room_status`, `block_reason` |
| `room_categories` | `id (uuid)` | `hotel_id -> hotels(id)` ON DELETE CASCADE,<br>`UNIQUE(hotel_id, name)` | `name`, `sort_order`, `is_active`, `default_tariff`, `extra_bed_charge`, `created_at` |
| `rate_plans` | `id (uuid)` | `hotel_id -> hotels(id)` | `plan_name`, `plan_type`, `base_rate`, `weekend_rate`, `season_rate`, `start_date`, `end_date`, `is_active` |
| `guests` | `id (uuid)` | `hotel_id -> hotels(id)` | `name`, `mobile`, `email`, `address`, `id_proof_type`, `id_proof_number` |
| `reservations` | `id (uuid)` | `hotel_id -> hotels(id)`,<br>`room_id -> rooms(id)` ON DELETE SET NULL,<br>`guest_id -> guests(id)` ON DELETE SET NULL | `room_no`, `guest_name`, `guest_phone`, `guest_email`, `guest_address`, `check_in_date`, `check_out_date`, `nights`, `rate`, `source_category`, `source_name`, `payment_mode`, `advance_paid`, `pay_cash`, `pay_upi`, `pay_card`, `pay_bank`, `payment_ref`, `discount`, `meal_plan`, `gst_type`, `gst_slab`, `gst_amount`, `taxable_amount`, `invoice_total`, `adults`, `children`, `remarks`, `internal_note`, `status`, `group_id`, `rate_plan`, `created_at`, `updated_at` |
| `room_blocks` | `id (uuid)` | `hotel_id -> hotels(id)` | `room_no`, `block_type`, `start_date`, `end_date`, `reason` |
| `payment_transactions` | `id (uuid)` | `hotel_id -> hotels(id)` ON DELETE CASCADE,<br>`reservation_id -> reservations(id)` ON DELETE SET NULL,<br>`CONSTRAINT uq_payment_transactions_payment_id UNIQUE (payment_id)` | `order_id`, `payment_id`, `amount_paise`, `currency`, `status`, `metadata`, `created_at` |
| `audit_logs` | `id (uuid)` | `hotel_id -> hotels(id)` | `action`, `module`, `record_id`, `details`, `metadata`, `severity`, `created_at` |
| `booking_timeline` | `id (uuid)` | `hotel_id -> hotels(id)`,<br>`reservation_id -> reservations(id)` | `event_type`, `event_description`, `event_amount`, `event_data`, `performed_by` |

### 3.2 Applied Migrations vs. Disk Evidence
| Migration File | Disk Size | Applied to Live Staging DB? | Evidence / Verification Method |
| :--- | :--- | :---: | :--- |
| `20260814000000_initial_schema.sql` | 368 KB | **YES** | All core tables (`hotels`, `rooms`, `reservations`, etc.) exist and are queryable. |
| `20260826000000_aiosell_mapping.sql` | 380 B | **YES** | `channel_rate_mappings` table is populated. |
| `20260902000000_deactivate_hotel.sql` | 2.2 KB | **YES** | Hotel deactivation procedures and triggers present. |
| `20260902190843_cascade_hotel_deletes.sql` | 1.0 KB | **YES** | ON DELETE CASCADE constraints verified on child tables. |
| `20260903000000_native_channels.sql` | 1.2 KB | **YES** | Native channel columns present. |
| `20260903150000_fix_auth_and_super_admin_grants.sql` | 1.4 KB | **YES** | `is_super_admin()` RPC verified functional. |
| `20260915000000_fix_auth_users_schema.sql` | 3.2 KB | **YES** | Auth schema synchronized. |
| `20260928000000_reservation_integrity_and_room_overlap.sql` | 4.6 KB | **YES** | `enforce_reservation_integrity` trigger verified firing (error code `23P02` observed on test overlap). `check_room_availability` RPC verified functional. |
| `20260929_notification_outbox.sql` | 3.1 KB | **YES** | `notification_outbox` table exists. |
| `20260930010000_room_night_revenue.sql` | 2.7 KB | **YES** | `room_night_revenue` table exists. |
| `20260930_reservation_documents.sql` | 2.1 KB | **YES** | `reservation_documents` table exists. |
| `20261002230000_strict_multi_tenant_security.sql` | 12.4 KB | **YES** | `auth_hotel_id()` RPC verified functional; strict tenant RLS policies active across 29 tables. |
| `20261008000000_laundry_linen_production.sql` | 20.6 KB | **YES** | Linen/laundry tables exist. |
| `20261011000000_payment_security_ledger.sql` | 7.4 KB | **PARTIAL** | Table `payment_transactions` exists with unique constraint `uq_payment_transactions_payment_id`. However, stored procedure `process_verified_payment` is **missing from the PostgREST schema cache** (held pending staging deployment per `HOTELMANTRI_FINAL_STAGING_AND_PERFORMANCE_VERIFICATION_REPORT.md`). |
| `20261011000000_whinta_whatsapp_integration.sql` | 5.4 KB | **YES** | Whinta columns and tables verified. |
| `20261015000000_whinta_template_and_cron_tracking.sql` | 3.0 KB | **YES** | Template and cron tracking tables verified. |

---

## 4. Existing Reservation & Room Assignment Flow

### 4.1 Internal Flow Analysis
The existing PMS flow in `server/routes/reservations.js` (`POST /api/reservations`) and `server/services/RoomAssignmentService.js`:
1. **Authentication & RBAC:** Enforces Bearer JWT; strictly rejects `housekeeping` role.
2. **Payload Sanitization:** Whitelists columns via `RESERVATION_DB_COLUMNS` to prevent SQL errors on non-column virtual fields.
3. **Guest Profile Sync:** Upserts into `guests` table by phone or name.
4. **Physical vs. Category Room Assignment:**
   - If physical `room_no` is provided, checks availability via `checkRoomAvailability()` under in-process lock `withRoomLock(hotelId, roomNo)`.
   - If category is requested without physical room or with `auto_assign: true`, checks `getCategoryPhysicalRoomAvailability()` and tries available physical rooms in deterministic order.
5. **Database Insert:** Inserts record into `reservations`.
6. **Compensating Rollback:** If any room fails in a multi-room batch, calls `supabaseServiceRole.from('reservations').delete().in('id', idsToDelete)`.
7. **Post-Commit Hooks:** Creates `booking_timeline` entry, generates confirmation PDF, and enqueues WhatsApp/Email notifications.

---

## 5. Concurrency & Locking Analysis (Critical Findings)

### 5.1 The Database Trigger: `enforce_reservation_integrity`
```sql
CREATE OR REPLACE FUNCTION trg_enforce_reservation_integrity()
RETURNS trigger AS $$
...
  SELECT guest_name INTO v_conflict_guest
  FROM reservations
  WHERE hotel_id = NEW.hotel_id
    AND (id <> NEW.id OR NEW.id IS NULL)
    AND status IN ('confirmed', 'checked_in')
    AND (
      (NEW.room_id IS NOT NULL AND room_id IS NOT NULL AND room_id = NEW.room_id)
      OR LOWER(TRIM(room_no)) = LOWER(TRIM(NEW.room_no))
    )
    AND check_in_date < NEW.check_out_date
    AND check_out_date > NEW.check_in_date
  LIMIT 1;

  IF v_conflict_guest IS NOT NULL THEN
    RAISE EXCEPTION 'ROOM_ALREADY_BOOKED: ...' USING ERRCODE = '23P02';
  END IF;
  RETURN NEW;
$$;
```

#### Vulnerability in Trigger Concurrency
- Under PostgreSQL default **Read Committed** isolation level, a plain `SELECT ... LIMIT 1` inside a `BEFORE INSERT` trigger queries only rows that were already *committed* before the statement began.
- If two concurrent requests attempt to book Room 101 for the same dates simultaneously:
  1. Transaction 1 executes the trigger `SELECT` -> 0 rows found.
  2. Transaction 2 executes the trigger `SELECT` -> 0 rows found (Transaction 1 has not committed).
  3. Transaction 1 inserts its row.
  4. Transaction 2 inserts its row.
  5. Both transactions commit -> **Room 101 is double-booked**.
- Furthermore, lines 96–100 of the trigger explicitly state:
  ```sql
  IF NEW.status NOT IN ('confirmed', 'checked_in') OR 
     NEW.room_no IS NULL OR 
     LOWER(TRIM(NEW.room_no)) IN ('', 'unassigned', 'tbd') THEN
    RETURN NEW;
  END IF;
  ```
  Unassigned / category-level bookings completely bypass the trigger.

### 5.2 Application-Level Locks are Process-Local
- `server/services/ReservationConflictService.js` defines:
  ```javascript
  const roomLocks = new Map(); // In-memory Promise chain per (hotelId, roomNo)
  ```
- `server/services/ReservationIdempotencyService.js` defines:
  ```javascript
  const bookingLocks = new Map(); // In-memory Promise chain per booking key
  ```
- **Finding:** In a multi-instance architecture (e.g. separate chatbot service, multiple Node.js server replicas, or serverless functions), in-memory maps **do not coordinate across process boundaries**. Process A and Process B will execute concurrently without locking each other.
- **Compensating Deletion Flaw:** If instance A crashes or suffers network failure after inserting 1 of 2 rooms, the partial booking remains committed and cannot be cleaned up.

### 5.3 Required Database-Level Solution (Phase 5 Release Blocker)
To achieve true ACID guarantees across multiple service instances:
1. Implement a PostgreSQL stored function / RPC (`create_chatbot_booking_atomic` or transaction-scoped advisory locks via `pg_advisory_xact_lock(hashtext(...))`).
2. Lock the physical room and/or category inventory allocation for the hotel within the transaction.
3. Validate availability and insert within the exact same database transaction. If any condition fails, the database automatically rolls back all writes with zero orphan rows and zero reliance on application compensating deletes.

---

## 6. Reservation Status & Inventory Rules

### 6.1 Status Values in Database
The `reservations` table CHECK constraint enforces:
`CHECK (status IN ('confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'))`  
The code also supports `'waitlist'` for queueing unallocated demand.

### 6.2 Inventory Consumption
- **Consumes Inventory:** `confirmed` and `checked_in`.
- **Does NOT Consume Inventory:** `checked_out`, `cancelled`, `no_show`, `waitlist`.

---

## 7. Date Semantics, Timezone & Pricing Rules

### 7.1 Stay Interval
- **Half-Open Interval:** `[check_in_date, check_out_date)`.
- `check_in_date` is **INCLUDED** (first night of stay).
- `check_out_date` is **EXCLUDED** (departure day morning; room is available for next check-in).
- Adjacent stays (Guest A check-out on Oct 12, Guest B check-in on Oct 12) **do not overlap**.

### 7.2 Timezone
- Indian Standard Time (IST, UTC+5:30).
- All date calculations use strict calendar date strings (`YYYY-MM-DD`) and UTC millisecond arithmetic (`Date.UTC(y, m-1, d)`) to eliminate daylight-savings and local time-drift bugs.

### 7.3 Pricing and GST Calculations
From `src/lib/calc.ts` and `src/lib/reservationFormHelpers.ts`:
- **Nights:** `Math.max(1, (check_out_date - check_in_date))`.
- **Subtotal:** `base_rate * nights * rooms`.
- **Discount:** Subtracted from subtotal (`taxable = Math.max(0, subtotal - discount)`).
- **GST Modes:**
  - `No Scope` (or 0%): GST = 0, invoice total = taxable.
  - `Exclusive`: GST = `taxable * (slab / 100)`, invoice total = `taxable + GST`.
  - `Inclusive`: invoice total = taxable, pre-tax base = `taxable / (1 + slab / 100)`, GST = `taxable - pre-tax base`.
- **Currency:** Indian Rupee (INR). Integer paise (1 INR = 100 paise) used for all Razorpay transactions.

---

## 8. Razorpay Payment Architecture & Idempotency

### 8.1 Existing Implementation
- `server/services/paymentSecurityService.js` provides:
  - `validateAndDeriveOrderContext`: Enforces server-authoritative amount calculation.
  - `verifyRazorpayHmacSignature`: Uses `crypto.timingSafeEqual` to prevent timing attacks.
  - `verifyRazorpayPaymentLifecycle`: Calls `gateway.payments.fetch(paymentId)` and verifies `status === 'captured'`, currency is `INR`, and amount matches.
  - `generateGuestCheckoutToken`: Generates HMAC-SHA256 signed, expiring token bound to `reservationId` and `hotelId`.
  - `payment_transactions` table with `CONSTRAINT uq_payment_transactions_payment_id UNIQUE (payment_id)`.

### 8.2 Gaps in Current Implementation
1. `server/index.js` has no dedicated Razorpay webhook endpoint (`POST /v1/payments/razorpay/webhook`), relying only on client callbacks.
2. Webhook raw body buffering was not preserved prior to `express.json()` parsing, which prevents cryptographically valid HMAC webhook signature verification.
3. Chatbot bookings require an inventory hold state: when a guest creates a booking attempt, inventory must be held for a limited duration (e.g. 15 minutes) while payment is pending. If payment succeeds, hold converts to confirmed booking. If hold expires, room is released.

---

## 9. Architectural Design for Standalone Chatbot Booking Service

### 9.1 Service Boundary
```
┌────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL CHATBOT                              │
│              (Voice Bot / WhatsApp Bot / Web Widget)                  │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │ HTTPS
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   chatbot-booking-api/ (Port 5050)                     │
│               Standalone Express Service (Node.js/TS)                  │
├────────────────────────────────────────────────────────────────────────┤
│ • Security Middleware: Helmet, CORS allowlist, Rate Limiters           │
│ • Config Resolver: Resolves single hotel by HOTEL_PUBLIC_SLUG / ID     │
│ • Fail-Closed Supabase Client (No fallback credentials)                │
│ • Cryptographic Quote Engine (HMAC-SHA256 signed quote tokens)         │
│ • Database-Level Booking Transaction RPC                               │
│ • Razorpay Order & Webhook Engine (Raw-body HMAC verification)         │
└───────────────────┬───────────────────────────────┬────────────────────┘
                    │                               │
                    ▼                               ▼
       ┌────────────────────────┐      ┌─────────────────────────┐
       │   Razorpay Gateway     │      │   Shared Supabase DB    │
       │  (Orders / Payments /  │      │  (PostgreSQL + RLS +    │
       │       Webhooks)        │      │    Payment Ledger)      │
       └────────────────────────┘      └─────────────────────────┘
```

### 9.2 Zero Interference with Existing PMS
- Chatbot bookings write directly to the authoritative `reservations`, `guests`, `payment_transactions`, `booking_timeline`, and `audit_logs` tables.
- Source is explicitly recorded as `source_category = 'Direct/Chatbot'` and `source_name = 'Chatbot Booking Engine'`.
- The existing PMS dashboard, reservation lists, room charts, and daily revenue reports automatically reflect chatbot reservations in real time.
- No existing server files, PMS routes, or front-office screens need to be modified.

---

## 10. Audit Conclusion & Phase Transition

| Audit Check | Status | Finding | Action for Implementation |
| :--- | :---: | :--- | :--- |
| **Database Schema** | **VERIFIED** | Tables, columns, and relations confirmed against live database. | Follow authoritative schema without inventing fields. |
| **Multi-Tenant Security** | **VERIFIED** | Strict tenant isolation via `hotel_id` required for all operations. | Enforce server-side hotel resolution; fail closed on mismatch. |
| **Concurrency Locks** | **DEFICIENT** | In-process Maps cannot protect multi-instance deployments. | Create PostgreSQL stored transaction / advisory locking RPC. |
| **Payment Ledger** | **PARTIAL** | Table exists; RPC missing in schema cache. | Provide reviewable migration with robust idempotent settlement RPC. |
| **Razorpay Webhooks** | **MISSING** | Existing server lacks Razorpay webhook handler. | Implement raw-body verified, replay-safe webhook processor. |
| **Supabase Fallback** | **UNSAFE** | Existing server falls back to hardcoded admin credentials. | Chatbot service must fail closed with zero fallback credentials. |

**The audit is complete. Proceed to Phase 2 (Architecture Documentation & Service Setup).**
