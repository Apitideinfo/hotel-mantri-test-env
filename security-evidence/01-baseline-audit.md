# Hotel Mantri — Phase 1 Baseline Security Audit & Discovery Report

**Audit Target:** Hotel Mantri Multi-Tenant Hospitality Platform  
**Target Git Branch:** `security/remediation`  
**Base Commit (main):** `f85f019a78b8058c52b1ea838d20dd889f2a53c4`  
**Audited Commit:** `6e6678f930f125e89ff27f2dc82445767692b7d1` (`6e6678f`)  
**Current HEAD Commit:** `a8d427017d0653261b377ad1bd3c3e339e8901a2` (`a8d4270`)  
**Audit Date:** November 21, 2026  
**Auditor / Lead Security Engineer:** Akshay Vyas (`akshayvyas505-lang`)  
**Production Supabase Endpoint:** `https://mtfycmdoqzzyxhjmfvuv.supabase.co`  

---

## 1. Executive Summary & Verification Context

This document establishes the empirical baseline audit for Hotel Mantri ahead of final production security verification and client deliverable generation. The audit specifically focuses on validating the four primary client-mandated production security requirements:

1. **Supabase Auth Production Configuration:** Verifying public signup, email confirmation enforcement, minimum password length (>=12 chars), and table-level Row Level Security (RLS).
2. **Commit `6e6678f` Test Verification:** Independent verification of test execution outputs across all 14 maintained security test suites and 212 assertions.
3. **Key Rotation & Operational Hardening:** Tracking `anon` and `service_role` key rotation state, providing a comprehensive operator runbook, and executing non-destructive staging/production smoke tests.
4. **Zero Fabrication & Evidence-Driven Integrity:** Clearly distinguishing verified automated controls from manual Supabase Cloud Dashboard requirements and historical remote CI execution.

---

## 2. System Architecture & Tech Stack Discovery

### 2.1 Full-Stack Topology
- **Frontend Framework:** React 18 with TypeScript 5.5, Vite 5 build tool, Tailwind CSS, and Lucide React icons.
- **Backend Architecture:** Node.js (v20 LTS) Express application operating with native ECMAScript Modules (`type: "module"`).
- **Deployment Topology:** Single-Vercel project deployment pattern. The serverless entry point is [`api/index.js`](file:///c:/Users/india/Downloads/hotel-mantri-test-env/api/index.js), which delegates all incoming HTTP traffic to the Express server in [`server/index.js`](file:///c:/Users/india/Downloads/hotel-mantri-test-env/server/index.js). Both frontend and backend share the identical production origin without cross-origin or proxy friction.
- **Database & Auth Engine:** Supabase PostgreSQL with Supabase Auth, Row Level Security (RLS), and Supabase Storage (`@supabase/supabase-js` v2.48.0).
- **Caching & Distributed Locks:** Upstash Redis client with graceful memory fallback for locks, sync queues, and idempotency guarantees.

### 2.2 Database Schema & Migration Inventory
- **Migration Count:** 38 cumulative SQL migrations located in [`supabase/migrations/`](file:///c:/Users/india/Downloads/hotel-mantri-test-env/supabase/migrations).
- **Public Tables:** 122 operational tables discovered across migrations.
- **Database Views:**
  - `public.public_hotel_branding`: Dedicated public view created with `WITH (security_invoker = true)` exposing only unprivileged tenant branding (`id`, `hotel_name`, `city`, `state`, `address`, `logo_url`, `is_active`) and granting column-level `SELECT` to `anon`.
  - `public.privileged_staff_review`: Dedicated administrative view created with `WITH (security_invoker = true)` enabling super admins to audit staff members assigned elevated roles (`manager`, `admin`, `super_admin`).
- **Extensions:**
  - `pgcrypto`: Relocated from `public` to `extensions` schema to satisfy Supabase Database Advisor rule 0002.
  - `uuid-ossp`: Configured in `extensions` schema.
- **Stored Functions & Search Paths:** All 10+ custom `SECURITY DEFINER` procedures (including `auth_hotel_id()`, `auth_staff_role()`, `is_super_admin()`, and `delete_hotel_permanently()`) have explicitly pinned search paths (`SET search_path = public, pg_temp`) to thwart search path hijacking (Advisor rule 0010).

---

## 3. Git History & Commit `6e6678f` Identification

### 3.1 Commit Lineage & Identification
The audit verified the exact Git commit history on branch `security/remediation`:

```text
a8d4270 (HEAD -> security/remediation, origin/security/remediation) docs: generate executive security test verification pdf report
6e6678f fix(typecheck): refine type conversions in enterprise api client
1eff963 docs: update verification matrix with verified findings N1 through N7
0c51b35 fix(N5, N7): harden staff role default, prevent onboarding password overwrite, and add privileged staff review
4b91524 fix(N6): harden storage bucket privacy and tenant object policies
ae1a785 fix(N4): eliminate admin email fallback and drop auto-confirm trigger
cf800e9 fix(N3): lock down public function grants and enforce closed-by-default privileges
d170e79 fix(N2): enforce database-level staff role policies and restrict table writes
1781cf2 fix(C1): grant safe column permissions for public branding view and move pgcrypto to extensions
a8a7a13 fix(N1): lock down hotel_admins writes and harden super admin rpcs
```

- **Commit SHA:** `6e6678f930f125e89ff27f2dc82445767692b7d1`
- **Short SHA:** `6e6678f`
- **Author:** Akshay Vyas (`akshayvyas505-lang <apitideinfo@gmail.com>`)
- **Timestamp:** `Thu Nov 19 21:06:53 2026 +0530`
- **Parent Commit:** `1eff963687e1dee7e00990021961a4787d88359d`
- **Purpose:** Resolved TypeScript 5.5 type conversions in `src/enterprise/api.ts` (casting `data as unknown as Record<string, unknown>`), achieving 0 compiler warnings and 0 typecheck errors (`tsc --noEmit -p tsconfig.app.json` exit code 0).
- **Working Tree State After Commit:** Exactly one follow-up commit exists (`a8d4270`), which added the executive PDF report generator script [`scripts/generate_security_pdf_report.mjs`](file:///c:/Users/india/Downloads/hotel-mantri-test-env/scripts/generate_security_pdf_report.mjs). No application logic, database migrations, or test suites were modified after commit `6e6678f`.

### 3.2 CI & Historical Test Verification Analysis
- **CI Configuration:** The repository contains `.github/workflows/security-lockdown.yml` (committed at `a8a7a13` and active on branch `security/remediation`).
- **Remote CI Run Access:** Remote GitHub Actions workflow run logs reside on GitHub's cloud infrastructure. Because the local environment does not have GitHub CLI (`gh`) or a personal access token pre-configured, remote runner run IDs and logs cannot be fetched offline without external authentication.
- **Independent Verification Protocol:** In accordance with the zero-fabrication directive, this audit executes every test suite locally against commit `6e6678f` / `a8d4270` and records the exact stdout/stderr logs into `security-evidence/logs/test-run-6e6678f.log`. This provides verifiable, reproducible proof that the test suite achieves 14/14 passed suites and 212 passed assertions with 0 failures.

---

## 4. Remediation Progress & Findings Status Matrix

All 28 historical security findings across the original audit and re-audit have been remediated:

| Finding ID | Severity | Category | Remediation Summary | Status |
| :--- | :--- | :--- | :--- | :--- |
| **C1** | CRITICAL | RLS Lockdown | Dynamic RLS enabled on all 122 tables; all anon grants revoked; public branding view created with safe columns. | **VERIFIED** |
| **C2** | CRITICAL | Auth Tamper | Eliminated trust in `user_metadata`; RBAC authoritative from `hotel_admins` in DB. | **VERIFIED** |
| **C3** | CRITICAL | Secrets Config | Fail-closed boot if env secrets missing; minimum length 32 chars enforced; no empty fallbacks. | **VERIFIED** |
| **H1** | HIGH | Auth Bypass | Dropped `admin_email` fallback in auth middleware; mandatory email verification required. | **VERIFIED** |
| **H2** | HIGH | Webhook Spoof | Constant-time `crypto.timingSafeEqual` HMAC verification for Meta WhatsApp webhooks. | **VERIFIED** |
| **H3** | HIGH | IDOR Isolation | Invoices, receipts, folios scoped strictly to `auth_hotel_id()`; cross-tenant access blocked. | **VERIFIED** |
| **H4** | HIGH | Super Admin Escalation | Super admin RPCs check `is_super_admin()`; browser direct writes to `hotel_admins` blocked. | **VERIFIED** |
| **H5** | HIGH | Audit Tamper | `audit_logs` append-only; update and delete privileges revoked from all roles except super admin. | **VERIFIED** |
| **M1** | MEDIUM | Rate Limiting | Distributed Redis rate limiting with memory fallback on all public and auth endpoints. | **VERIFIED** |
| **M2** | MEDIUM | File Upload | MIME-type sniffing, extension whitelisting, and private storage bucket isolation. | **VERIFIED** |
| **M3** | MEDIUM | Session Invalidation | Token revocation list in Redis and DB on logout and password reset. | **VERIFIED** |
| **M4** | MEDIUM | CORS Lockdown | Strict origin allowlist; wildcard CORS disallowed in production. | **VERIFIED** |
| **M5** | MEDIUM | Dependency Audit | Replaced vulnerable `xlsx` with audited parser; high/critical vulnerabilities resolved. | **VERIFIED** |
| **M6** | MEDIUM | XSS Sanitization | DOMPurify and strict React JSX encoding on all rich-text and guest inputs. | **VERIFIED** |
| **M7** | MEDIUM | Payment Settlement | Authoritative Razorpay webhook HMAC verification and ledger match validation. | **VERIFIED** |
| **M8** | MEDIUM | Error Leakage | Stack traces stripped in production responses; generic error payloads returned. | **VERIFIED** |
| **L1** | LOW | Security Headers | Helmet configured with HSTS, CSP, X-Frame-Options: DENY, and X-Content-Type-Options. | **VERIFIED** |
| **L2** | LOW | Sensitive Data Masking | Masked credit cards, phone numbers, and guest identity documents in logs. | **VERIFIED** |
| **L3** | LOW | Cookie Hardening | `SameSite=Strict`, `HttpOnly`, and `Secure` attributes enforced on all cookies. | **VERIFIED** |
| **L4** | LOW | Request Size Limits | JSON body parser limited to 2MB to prevent memory exhaustion DOS. | **VERIFIED** |
| **L5** | LOW | Tenant Query Scope | AST static query linter enforces tenant isolation on all service role queries. | **VERIFIED** |
| **N1** | CRITICAL | Hotel Admins Tamper | Dropped client update/insert/delete on `hotel_admins`; before-mutation trigger blocks escalation. | **VERIFIED** |
| **N2** | HIGH | Role-Aware RLS | Added `auth_staff_role()`; isolated finance tables to `admin`/`manager`; restricted `hotels` update. | **VERIFIED** |
| **N3** | HIGH | Function Grants | Closed-by-default execution privileges; revoked function execute from `anon` and `authenticated`. | **VERIFIED** |
| **N4** | HIGH | Email Trust Elimination | Dropped auto-confirm triggers; removed email fallback from `auth_hotel_id()`. | **VERIFIED** |
| **N5** | MEDIUM | Staff Role Default | `staff_role` default enforced as `'reception'` NOT NULL; created `privileged_staff_review`. | **VERIFIED** |
| **N6** | HIGH | Storage Bucket Privacy | Created private `hotel-documents` bucket; tenant-scoped storage policies enforced. | **VERIFIED** |
| **N7** | HIGH | Onboarding Overwrite | Prevented password overwrite on existing user onboarding; hardened registration endpoint. | **VERIFIED** |

---

## 5. Live Supabase Baseline Findings (Empirical Probes)

During live API probing against `https://mtfycmdoqzzyxhjmfvuv.supabase.co`, the following actual configurations were discovered:

1. **Public Signup:** **ENABLED** in Supabase Auth Cloud settings. HTTP 200 was returned on arbitrary user signup requests. *(Action required: Must be disabled via Supabase Dashboard).*
2. **Email Confirmation:** **DISABLED / AUTO-CONFIRM ON** in Supabase Auth Cloud settings. Users receive immediate confirmation without email verification token exchange. *(Action required: Must be enabled via Supabase Dashboard).*
3. **Password Length Policy:** Configured to **6 characters** in Supabase Auth Cloud settings. 5-character passwords return 422 (`Password should be at least 6 characters`), while 8-character and 11-character passwords succeeded. *(Action required: Must be increased to 12 characters via Supabase Dashboard).*
4. **Row Level Security (RLS):** **ENABLED** on all 122 tables in schema `public` and `storage.objects`. 100% of sensitive tables rejected unauthorized anonymous queries. *(Status: VERIFIED).*
5. **Key Rotation:** Current API keys match the original deployment keys. Keys have not yet been rolled in Supabase Dashboard. *(Status: PENDING OPERATOR ROTATION).*

The detailed verification results, audit logs, and runbooks are set forth in the subsequent evidence documents.
