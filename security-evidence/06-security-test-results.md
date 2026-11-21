# Hotel Mantri — Detailed Security Test Results Ledger

**Document Reference:** `security-evidence/06-security-test-results.md`  
**Evaluation Scope:** 14 Security Test Suites / 212 Assertions  
**Audit Standard:** Zero Defect / Zero Regression  
**Verification Date:** November 21, 2026  

---

## 1. Executive Summary

This document presents the detailed assertion-by-assertion outcomes across all 14 security test suites executed against Hotel Mantri commit `6e6678f` / `a8d4270`. Every test executed successfully with 100% pass rates and zero failures.

---

## 2. Granular Results Ledger

### Suite 1: Supabase Security Advisor Live Probes (9 Assertions)
- `audit_supabase_security_advisor.mjs`
- **Result:** **9 / 9 PASSED** (Duration: 8.32s)
- **Verified Controls:**
  1. Relocation of `pgcrypto` to `extensions` schema verified (splinter 0002).
  2. View `public_hotel_branding` enforces `security_invoker = true` (splinter 0009).
  3. View `privileged_staff_review` enforces `security_invoker = true` (splinter 0009).
  4. Search path pinning (`SET search_path = public, pg_temp`) verified across all stored procedures (splinter 0010).
  5. Dynamic RLS iteration confirmed across all tables in schema `public` (splinter 0003).
  6. Live view `public_hotel_branding` returns HTTP 200 with active records.
  7. Public view projection safety verified (zero exposure of owner email, phone, or billing details).
  8. Zero-leakage anonymous access verified across all sensitive production tables.
  9. Unauthorized administrative RPC invocation (`delete_hotel_permanently`) fails closed.

### Suite 2: RLS Lockdown & Zero Anon Access (33 Assertions)
- `test_rls_lockdown.mjs`
- **Result:** **33 / 33 PASSED**
- **Verified Controls:**
  - Dynamic RLS enabled on all 122 public tables without `FORCE ROW LEVEL SECURITY`.
  - Dynamic policy cleanup verified across `pg_policies`.
  - Schema privilege revocations (`ALL ON ALL TABLES`, `SEQUENCES`, `FUNCTIONS`) from `anon`.
  - Direct anonymous `SELECT`, `INSERT`, and `UPDATE` rejected across sensitive tables.
  - Ten critical legacy tables (`daily_reports`, `room_chart_entries`, `other_daily_entries`, `booking_timeline`, `folio_charges`, `room_shifts`, `laundry_entries`, `daily_revenue_entries`, `electricity_readings`, `room_night_revenue`) verified 100% isolated.

### Suite 3: Staff Role Escalation Prevention (9 Assertions)
- `test_role_escalation.mjs`
- **Result:** **9 / 9 PASSED**
- **Verified Controls:**
  - Token claims containing forged `user_metadata.role = 'super_admin'` rejected by auth middleware.
  - Server-side RBAC queries `hotel_admins` directly via service role.
  - Fails closed when user has no active `hotel_admins` record.
  - Rejects inactive or suspended staff members.

### Suite 4: Hardcoded Secrets & Fail-Closed Boot (8 Assertions)
- `test_hardcoded_secrets.mjs`
- **Result:** **8 / 8 PASSED**
- **Verified Controls:**
  - Missing `SUPABASE_SERVICE_ROLE_KEY` halts server startup.
  - Missing `INTERNAL_API_SECRET` halts server startup.
  - Minimum entropy requirement (>= 32 characters) enforced on all security secrets.
  - Zero hardcoded fallback strings in auth and webhook middleware.

### Suite 5: Hotel Admins Tamper Guard (41 Assertions)
- `test_hotel_admins_tamper.mjs`
- **Result:** **41 / 41 PASSED**
- **Verified Controls:**
  - `hotel_admins` writes revoked from `authenticated` and `anon`.
  - Mutation trigger `trg_hotel_admins_mutation_guard` blocks browser role modification.
  - Super admin RPCs (`delete_hotel_permanently`, `change_plan`, `suspend_subscription`) check `is_super_admin()`.
  - Direct SQL injection vectors in RPC parameters safely rejected.

### Suite 6: Database-Level Staff Role Matrix RLS (11 Assertions)
- `test_role_matrix_rls.mjs`
- **Result:** **11 / 11 PASSED**
- **Verified Controls:**
  - Helper `auth_staff_role()` returns authenticated user's assigned staff role.
  - Reception staff permitted to update room status and bookings.
  - Financial tables (`invoices`, `bank_reconciliation`, `ota_settlements`) reject reception access.
  - Hotel core settings updates restricted to `admin` role.

### Suite 7: Function Grants Lockdown (9 Assertions)
- `test_function_grants.mjs`
- **Result:** **9 / 9 PASSED**
- **Verified Controls:**
  - `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated` verified.
  - Explicit execution granted only to whitelisted tenant helpers.
  - `get_hotel_record_counts` validates caller tenant scope before execution.

### Suite 8: Email Trust Elimination (6 Assertions)
- `test_email_trust.mjs`
- **Result:** **6 / 6 PASSED**
- **Verified Controls:**
  - Removal of `admin_email` fallback in `auth_hotel_id()`.
  - Dropping of `auto_confirm_user` trigger verified.
  - Authentication requires confirmed database relation.

### Suite 9: Staff Role Default & Onboarding Safety (8 Assertions)
- `test_staff_hardening_and_onboarding.mjs`
- **Result:** **8 / 8 PASSED**
- **Verified Controls:**
  - `staff_role` column default set to `'reception'` NOT NULL.
  - Onboarding endpoint refuses to overwrite passwords for existing accounts.
  - Administrative view `privileged_staff_review` enforces `security_invoker = true`.

### Suite 10: Storage Bucket Privacy & Scoping (7 Assertions)
- `test_storage_bucket_policies.mjs`
- **Result:** **7 / 7 PASSED**
- **Verified Controls:**
  - Private bucket `hotel-documents` configured (`public = false`).
  - Storage policy enforces path prefix `split_part(name, '/', 1) = auth_hotel_id()::text`.
  - Unauthenticated file uploads rejected.

### Suite 11: Authoritative Payment Settlement (5 Assertions)
- `test_verify_payment_hardening.mjs`
- **Result:** **5 / 5 PASSED**
- **Verified Controls:**
  - Razorpay payment settlement verifies HMAC signature.
  - Currency and payment amount verified against internal booking ledger before status update.

### Suite 12: Tenant Scope AST Query Analysis (24 Assertions)
- `lint_tenant_scope.mjs`
- **Result:** **24 / 24 PASSED**
- **Verified Controls:**
  - 24 server-side database query operations audited.
  - Every query utilizing `supabaseAdmin` verified to contain explicit `hotel_id` tenant scoping.

### Suite 13: Adversarial Hostile-User Security Attack Suite (42 Assertions)
- `security_attack_suite.mjs`
- **Result:** **42 / 42 PASSED**
- **Verified Controls:**
  - 11 attack vectors (Unauthenticated, Forged JWT, IDOR, Privilege Escalation, Table Tampering, Webhook Spoofing, Payment Tampering, Path Traversal, SQL Injection, Internal Secret Bypass, Cron Hijacking) 100% repelled.

### Suite 14: TypeScript Strict Compilation Check (Clean 0 Errors)
- `npm run typecheck`
- **Result:** **PASSED (0 Errors)**
- **Verified Controls:**
  - TypeScript 5.5 compilation passes across all client components and enterprise APIs.

---

## 3. Conclusion

Total Suites: **14 / 14 Passed**  
Total Assertions: **212 / 212 Passed**  
Total Failures: **0**  
Defect Rate: **0.00%**
