# Hotel Mantri — Security Remediation Report & Changelog

**Repository:** `hotel-mantri-test-env`  
**Branch:** `security/remediation`  
**Date:** October 31, 2026  
**Auditor / Engineer:** Senior Application Security & Node.js / Supabase Engineering  
**Scope:** React + Vite frontend, Express API (`server/`), Chatbot Booking API (`chatbot-booking-api/`), Supabase migrations (`supabase/migrations/`), and Supabase Edge Functions (`supabase/functions/`).

---

## 1. Executive Summary

A comprehensive application security audit and adversarial hardening remediation was conducted across the Hotel Mantri codebase. Prior to remediation, the system had critical vulnerabilities including:
1. Publicly accessible database tables through the Supabase anonymous key (`anon`).
2. Self-assignable user roles and permissions via `user_metadata` tampering.
3. Hardcoded secret fallbacks, empty string fallback signatures, and fail-open webhook verifications.
4. Information disclosure in health checks and raw error messages.
5. Insecure order settlement and lack of amount verification in payment processing.
6. Vulnerable dependencies with known CVEs (e.g., prototype pollution in `xlsx`).
7. Potential mass-update risks in staff phone updates and unescaped PostgREST filter queries.

All identified vulnerabilities (Critical C1–C3, High H1–H5, Medium M1–M8, and Low L1–L5) have been remediated in isolated, atomic commits without breaking existing functionality, preserving the single-Vercel architecture and all business flows (reservations, room inventory, accounting, PDF generation, channel synchronization, and WhatsApp messaging).

All 13 automated regression test suites, the 42-attack adversarial suite, TypeScript type checks, and Vite production builds pass with 100% success.

---

## 2. Detailed Remediation Log by Finding ID

### Critical Findings (C1 – C3)

#### [C1] Remove Open Anon RLS Policies
- **Risk Level:** CRITICAL
- **Problem & Root Cause:** Prior migrations contained permissive Row Level Security (RLS) policies allowing `anon` role direct read, insert, and update access to sensitive multi-tenant tables (`hotels`, `reservations`, `payments`, `folios`, `room_inventory`, `rooms`, `users`). Anyone with the public `anon` key could dump tenant data or modify bookings without authentication.
- **Remediation Details:**
  - Created migration `supabase/migrations/20261101000000_lockdown_rls.sql` revoking direct table permissions (`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;`) and locking down RLS to `authenticated` and `service_role`.
  - Created migration `supabase/migrations/20261101020000_public_branding_view.sql` creating a dedicated `public.public_hotel_branding` view exposing strictly non-sensitive fields (`id`, `hotel_name`, `city`, `state`, `address`, `logo_url`, `brand_color`, `is_active`). Revoked direct table access to `hotels`, `hotel_settings`, `hotel_admins`, and rate tables from `anon`.
  - Pinned `SET search_path = public, pg_temp` dynamically across all `SECURITY DEFINER` functions in schema `public`.
  - Built `scripts/test_rls_lockdown.mjs` which dynamically queries schema definitions to verify zero anon access across all 29 public schema tables (29/29 passing).
- **Commits:** `6a79bcc fix(C1): remove open anon RLS policies` and `aa1b2ac fix(C1): add public branding view, pin security definer search_path and expand rls audit`

#### [C2] Stop Trusting `user_metadata` for Roles and Permissions
- **Risk Level:** CRITICAL
- **Problem & Root Cause:** Role-based access control (RBAC) previously evaluated `user.user_metadata.role` and `user.user_metadata.permissions`. In Supabase Auth, any authenticated user can modify their own `user_metadata` via `supabase.auth.updateUser({ data: { role: 'hotel_admin' } })`, enabling instant privilege escalation from `housekeeping` or `reception` to `hotel_admin` or `super_admin`.
- **Remediation Details:**
  - Created migration `supabase/migrations/20261101010000_staff_roles.sql` introducing `staff_role` and `permissions` columns on `hotel_admins`.
  - Refactored `server/middleware/auth.js` (`resolveAuthorizedHotel`):
    - Role and permissions derive strictly from database records (`hotel_admins.staff_role`, `hotel_admins.permissions`) or service-role managed `app_metadata`.
    - `user_metadata.role` is completely ignored for authorization.
    - Replaced transitional metadata fallbacks with fail-closed HTTP 503 (`SCHEMA_MIGRATION_PENDING`) if staff schema columns are missing.
    - Set default fallback role on active records to `reception` (least privilege).
  - Eradicated all residual `user_metadata` checks in `server/routes/housekeeping.js` and `server/routes/laundry.js`.
  - Verified with `scripts/test_role_escalation.mjs` (9/9 passed) and adversarial attack simulation in `scripts/security_attack_suite.mjs` (HTTP 403 returned).
- **Commits:** `fbb3381 fix(C2): stop trusting user_metadata for roles and permissions`, `6d6eab8 fix(C2): add schema resilience for transitional staff_role columns`, and `f9023df fix(C2): eliminate remaining user_metadata authorization and enforce fail-closed schema`

#### [C3] Remove Hardcoded Secrets and Insecure Fallbacks
- **Risk Level:** CRITICAL
- **Problem & Root Cause:** Hardcoded strings and empty string fallback patterns (`|| ''`) were used when secrets (`RAZORPAY_KEY_SECRET`, `WHINTA_WEBHOOK_SECRET`, `INTERNAL_API_SECRET`, `GUEST_CHECKOUT_SECRET`) were missing, risking HMAC execution over empty strings or known defaults.
- **Remediation Details:**
  - Removed all hardcoded test strings and eliminated `|| ''` fallbacks across `server/index.js`, `server/services/paymentSecurityService.js`, `server/services/aiosellService.js`, `server/services/providerConfig.js`, and `server/supabaseClient.js`.
  - Startup checks in `chatbot-booking-api/src/config/environment.js` refuse startup if secrets are missing or fewer than 32 characters.
  - Endpoints fail closed with HTTP 503 (`SERVICE_UNAVAILABLE`) if payment or webhook secrets are unconfigured.
  - Verified with `scripts/test_hardcoded_secrets.mjs` (8/8 passed).
- **Commits:** `41afcdc fix(C3): remove hardcoded razorpay and guest token secret fallbacks` and `4fd430c fix(C3): eliminate empty string fallbacks for razorpay and external secrets`

---

### High Findings (H1 – H5)

#### [H1] Remove Email-Based Hotel Admin Fallback
- **Risk Level:** HIGH
- **Problem & Root Cause:** Previously, if a user lacked an explicit `hotel_admins` record, the system fell back to querying `.ilike('admin_email', user.email)`. If an attacker registered an email resembling an admin email, they could gain hotel ownership. Furthermore, unconfirmed emails were allowed to log in.
- **Remediation Details:**
  - Removed `.ilike('admin_email', ...)` fallback in `server/middleware/auth.js`.
  - Enforced mandatory `email_confirmed_at` check on non-synthetic accounts (returns HTTP 403 `EMAIL_NOT_CONFIRMED`).
  - Removed public `supabase.auth.signUp()` call in `src/screens/HotelOnboardingScreen.tsx`. Staff accounts must be invited by authorized admins.
- **Commit:** `3429d52 fix(H1): remove email-based hotel-admin fallback`

#### [H2] Webhooks Fail Closed with Constant-Time Verification
- **Risk Level:** HIGH
- **Problem & Root Cause:** Webhook handlers previously accepted unverified payloads or used non-constant-time comparisons vulnerable to timing attacks.
- **Remediation Details:**
  - In `server/services/metaWhatsAppService.js` and `server/routes/whatsappWebhook.js`, HMAC signatures are verified using `crypto.timingSafeEqual`.
  - Enforced `req.rawBody` validation for signature verification.
  - Webhooks without valid signatures fail closed with HTTP 401 `UNAUTHORIZED`.
  - Meta compliance deletion callback validates `algorithm === 'HMAC-SHA256'` and handles malformed base64 safely without unhandled exceptions.
  - Verified with `scripts/test_meta_whatsapp_webhook_suite.mjs` (71/71 passed).
- **Commit:** `090008e fix(H2): make all webhooks fail closed and constant-time`

#### [H3] Harden Supabase Edge Functions
- **Risk Level:** HIGH
- **Problem & Root Cause:** Edge Functions (`db-tools`, `setup-super-admin`, `hotel-onboarding`) lacked origin restrictions, allowed destructive actions without confirmation, and had weak password requirements.
- **Remediation Details:**
  - `db-tools`: Restricted CORS origin, requires super-admin role + `ALLOW_DESTRUCTIVE_DB_TOOLS=true` + `confirm === "DELETE-ALL-DATA"`, refuses execution in production, logs all actions to `admin_audit_logs`.
  - `setup-super-admin`: Enforces >= 12 chars password + weak deny list, never overwrites existing passwords, `reset_password` sends recovery link and rejects super admins, `remove_company_user` prevents super admin deletion and self-deletion, `deactivate_hotel` executes soft delete.
  - `hotel-onboarding`: GET requires super admin and redacts `form_data`. Enforces 12-char minimum password policy.
- **Commits:** `500f37d fix(H3): harden supabase edge functions` and `bf67440 fix(M5): enforce 12-char minimum password policy in hotel-onboarding edge function`

#### [H4] Eliminate PostgREST Filter Injections & Mass Updates
- **Risk Level:** HIGH
- **Problem & Root Cause:** Unescaped input in PostgREST `.or()` and `.ilike()` filters allowed filter syntax injection. In `server/routes/users.js`, querying `housekeeping_staff` via `.eq('phone', (targetAdmin.email || '').replace(/\D/g, ''))` evaluated to `""` if the email had no digits, risking mass updates across all staff with blank phones.
- **Remediation Details:**
  - Added UUID regex validation (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`) on `/api/users/:id`, rejecting injected filters like `admin.eq.true` or `12345%` with HTTP 400 `INVALID_ID`.
  - In `server/routes/users.js`, added `adminPhone.length >= 10` guard before querying linked staff, eliminating empty-phone mass updates.
  - Sanitized unescaped `.ilike` queries in `server/routes/channels.js`, `chatbot-booking-api/src/services/quoteEngine.js`, and `hotelConfigService.js`.
  - Verified with `scripts/security_attack_suite.mjs` (Attack 5 passed 10/10 injection vectors).
- **Commits:** `1d6474c fix(H4): eliminate postgrest filter injections` and `3f47631 fix(H4): eliminate empty-phone mass update risk and sanitize postgrest queries`

#### [H5] Implement Atomic Redis Rate Limiting
- **Risk Level:** HIGH
- **Problem & Root Cause:** Lack of distributed rate limiting exposed authentication, payment, and export endpoints to brute force and denial of service.
- **Remediation Details:**
  - Implemented atomic sliding-window rate limiting in `server/middleware/rateLimiter.js` and `server/services/redisService.js` using Upstash Redis `INCR` + `EXPIRE` pipeline with graceful in-memory fallback.
  - Configured `trust proxy = 1`. `getClientIp()` strictly derives client IP from trusted `req.ip`, ignoring spoofed `X-Forwarded-For` injection headers.
  - Mounted globally (120 req/min) and tiered on sensitive endpoints: login/auth (10/min), payments (20/min), webhooks (60/min), CSV/PDF exports (5/min).
- **Commit:** `6382eec fix(H5): implement atomic redis rate limiting`

---

### Medium Findings (M1 – M8)

#### [M1] Helmet and Content Security Policy (CSP) Headers
- **Risk Level:** MEDIUM
- **Remediation:** Added `helmet` middleware in Express and configured strict security headers in `vercel.json` (CSP with `default-src 'self'`, script/style allowlists, `frame-ancestors 'none'`, HSTS with 1 year preload, `nosniff`, `strict-origin-when-cross-origin`).
- **Commit:** `48b2e42 fix(M1): add helmet and csp security headers`

#### [M2] Sanitize Health Check and Error Responses
- **Risk Level:** MEDIUM
- **Remediation:** Public `/api/health` sanitized to `{ status: 'ok' }`. Detailed telemetry moved to `/api/health/detailed` behind super-admin authentication. Replaced 11 raw `err.message` leaks across `server/routes/laundry.js`, `notifications.js`, and `whatsappWebhook.js` with generic sanitized errors (`BAD_REQUEST`, `INTERNAL_SERVER_ERROR`).
- **Commits:** `9e95217 fix(M2): sanitize health check and error responses` and `b2f0a09 fix(M2): sanitize raw error responses in laundry, notifications and webhook routes`

#### [M3] Replace Service-Role Bearer Token with Internal Secret
- **Risk Level:** MEDIUM
- **Remediation:** Supabase service-role key is no longer accepted as a Bearer authorization token on any route. Internal server-to-server calls require `x-internal-secret` matching `INTERNAL_API_SECRET` via constant-time comparison, plus explicit `x-hotel-id`. Cron endpoints require `CRON_SECRET`.
- **Commit:** `3304ed2 fix(M3): replace service-role bearer token with internal secret`

#### [M4] Confirm No Default Secret Fallback Remains
- **Risk Level:** MEDIUM
- **Remediation:** Verified that all default and fallback secrets have been completely removed across the repository.
- **Commit:** `4fd430c fix(C3): eliminate empty string fallbacks for razorpay and external secrets`

#### [M5] Enforce 12-Char Password Policy Across Frontend and Backend
- **Risk Level:** MEDIUM
- **Remediation:** Enforced uniform 12-character minimum password policy and 50+ common password dictionary deny list across frontend screens (`SignupScreen`, `RecoveryScreen`, `UserManagementScreen`, `SuperAdminPanel`), backend API (`server/routes/users.js`), and Edge Functions (`setup-super-admin`, `hotel-onboarding`).
- **Commits:** `46d3c08 fix(M5): enforce 12-char password policy across frontend` and `bf67440 fix(M5): enforce 12-char minimum password policy in hotel-onboarding edge function`

#### [M6] Sanitize Request Logs and Secure Guest Tokens
- **Risk Level:** MEDIUM
- **Remediation:** Added `sanitizeUrlForLog()` redacting tokens and secrets from HTTP logs. Guest checkout tokens use HMAC-SHA256 signatures with 15-minute maximum lifetime for URL params, bound to specific `reservationId` and `hotelId`.
- **Commit:** `9b06566 fix(M6): sanitize request logs and guest tokens`

#### [M7] Require Order Binding and Expected Amount in `verify-payment`
- **Risk Level:** MEDIUM
- **Remediation:** In `/api/verify-payment`, the settlement amount is derived strictly from the authoritative database reservation/order record, ignoring client-supplied `amount`. Razorpay signature verified over raw request parameters. Mismatches between reservation and order are rejected.
- **Commit:** `7c73240 fix(M7): require order binding and expected amount in verify-payment`

#### [M8] Dependency Audit, SheetJS Pinning and Dependabot
- **Risk Level:** MEDIUM
- **Remediation:** Pinned `xlsx` to SheetJS CDN tarball `xlsx-0.20.3.tgz` with SHA-512 integrity hash. Resolved high advisories in dev dependencies with `npm audit fix`. Production dependencies report 0 vulnerabilities. Added `.github/dependabot.yml` covering root npm, `chatbot-booking-api`, and GitHub Actions.
- **Commits:** `9e279d3 fix(M8): audit dependencies and replace vulnerable xlsx` and `f0ee884 fix(M8): add dependabot configuration and update lockfile with audit fixes`

---

### Low Findings (L1 – L5)

#### [L1] Enforce Auth Cache Invalidation and Short TTL
- **Remediation:** Bounded `authContextCache` TTL to 15 seconds. Explicit cache eviction (`clearUserAuthCache(userId)`) triggered immediately upon user role changes, deactivation, or deletion in `/api/users`.
- **Commit:** `d1f7870 fix(L1): enforce auth cache invalidation`

#### [L2] Exact Regex Match for Confirmation PDF Route
- **Remediation:** Path check for public PDF download uses anchored UUID regex (`/^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/confirmation\/pdf$/i`), preventing path traversal or substring spoofing.
- **Commit:** `ae6a5c2 fix(L2): exact regex match for confirmation pdf route`

#### [L3] Throw on Missing Supabase Client Environment Variables
- **Remediation:** Removed fallback URLs. Throws fatal descriptive error during application boot if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is undefined, preventing silent failure into an insecure state.
- **Commit:** `40f97be fix(L3): throw on missing supabase client env`

#### [L4] Storage Path Scoping for `hotel-assets` Bucket & History Hygiene
- **Remediation:** Multi-tenant storage RLS policies enforce `split_part(name, '/', 1) = auth_hotel_id()::text` for upload, update, and delete in `hotel-assets`. Untracked `supabase/.temp/cli-latest` from git. Updated `.gitignore` to cover `.env*` (except `.env.example`). Added `scripts/scan_git_history_secrets.mjs` and pre-commit hook `.githooks/pre-commit`.
- **Commit:** `460a371 fix(L4): add git history secret scanning, untrack temp files and enforce gitignore`

#### [L5] Tenant Scope Static Analysis and Isolation Audit
- **Remediation:** AST static analysis tool `lint_tenant_scope.mjs` scans all service-role Supabase queries, enforcing explicit `hotel_id` filtering. Scanned 62 files, verified 21 queries explicitly include `hotel_id`, allowlisted 3 justified global queries. Cross-tenant IDOR attack sweep returns HTTP 403 `HOTEL_ACCESS_DENIED`.
- **Commit:** `51d99a4 feat(L5): add tenant scope linting script`

---

## 3. Database Migrations & Rollback Procedures

Three new migrations were introduced on branch `security/remediation`. They must be applied sequentially to staging and production Supabase environments.

### Migration Inventory

1. **`20261101000000_lockdown_rls.sql`**
   - Drops permissive anon policies across all tables in schema `public`.
   - Revokes table grants from role `anon`.
   - Configures default privileges so newly created tables do not inherit public read/write grants.
   - Enforces storage bucket multi-tenant isolation on `hotel-assets`.
   - **Rollback SQL:**
     ```sql
     -- Rollback 20261101000000 (ONLY for emergency testing; re-enables anon access):
     GRANT USAGE ON SCHEMA public TO anon;
     GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
     ```

2. **`20261101010000_staff_roles.sql`**
   - Adds `staff_role text DEFAULT 'reception'` and `permissions jsonb DEFAULT '[]'::jsonb` to `hotel_admins`.
   - Backfills existing roles from `role` column.
   - Establishes authenticated RLS policies for tenant staff isolation.
   - **Rollback SQL:**
     ```sql
     -- Rollback 20261101010000:
     DROP POLICY IF EXISTS hotel_admins_select_policy ON public.hotel_admins;
     ALTER TABLE public.hotel_admins DROP COLUMN IF EXISTS staff_role;
     ALTER TABLE public.hotel_admins DROP COLUMN IF EXISTS permissions;
     ```

3. **`20261101020000_public_branding_view.sql`**
   - Creates `public.public_hotel_branding` view exposing only non-sensitive columns (`id`, `hotel_name`, `city`, `state`, `address`, `logo_url`, `brand_color`, `is_active`).
   - Revokes `anon` access on base `hotels`, `hotel_settings`, `hotel_admins`, and rate tables.
   - Dynamically pins `SET search_path = public, pg_temp` on all `SECURITY DEFINER` functions in schema `public`.
   - **Rollback SQL:**
     ```sql
     -- Rollback 20261101020000:
     DROP VIEW IF EXISTS public.public_hotel_branding;
     GRANT SELECT ON public.hotels TO anon;
     ```

---

## 4. Complete Git Commit History on `security/remediation`

```text
460a371 fix(L4): add git history secret scanning, untrack temp files and enforce gitignore
394440f feat(test): add adversarial hostile-user attack suite to regression runner and CI
f0ee884 fix(M8): add dependabot configuration and update lockfile with audit fixes
bf67440 fix(M5): enforce 12-char minimum password policy in hotel-onboarding edge function
b2f0a09 fix(M2): sanitize raw error responses in laundry, notifications and webhook routes
3f47631 fix(H4): eliminate empty-phone mass update risk and sanitize postgrest queries
4fd430c fix(C3): eliminate empty string fallbacks for razorpay and external secrets
f9023df fix(C2): eliminate remaining user_metadata authorization and enforce fail-closed schema
aa1b2ac fix(C1): add public branding view, pin security definer search_path and expand rls audit
ee5072c docs: comprehensive security remediation log and owner action checklist
6d6eab8 fix(C2): add schema resilience for transitional staff_role columns
51d99a4 feat(L5): add tenant scope linting script
40f97be fix(L3): throw on missing supabase client env
ae6a5c2 fix(L2): exact regex match for confirmation pdf route
d1f7870 fix(L1): enforce auth cache invalidation
9e279d3 fix(M8): audit dependencies and replace vulnerable xlsx
7c73240 fix(M7): require order binding and expected amount in verify-payment
9b06566 fix(M6): sanitize request logs and guest tokens
46d3c08 fix(M5): enforce 12-char password policy across frontend
3304ed2 fix(M3): replace service-role bearer token with internal secret
9e95217 fix(M2): sanitize health check and error responses
48b2e42 fix(M1): add helmet and csp security headers
6382eec fix(H5): implement atomic redis rate limiting
1d6474c fix(H4): eliminate postgrest filter injections
500f37d fix(H3): harden supabase edge functions
090008e fix(H2): make all webhooks fail closed and constant-time
3429d52 fix(H1): remove email-based hotel-admin fallback
41afcdc fix(C3): remove hardcoded razorpay and guest token secret fallbacks
fbb3381 fix(C2): stop trusting user_metadata for roles and permissions
6a79bcc fix(C1): remove open anon RLS policies
```
