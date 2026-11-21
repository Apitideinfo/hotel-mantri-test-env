# Hotel Mantri — Enterprise Security Test Plan & Verification Strategy

**Document Reference:** `security-evidence/05-security-test-plan.md`  
**Classification:** Production Verification Strategy / Compliance Audit  
**Author:** Akshay Vyas (`akshayvyas505-lang`)  
**Target Systems:** Express REST API, PostgreSQL Supabase Database, React 18 Web Client  

---

## 1. Test Strategy Overview

The Hotel Mantri security test strategy employs a layered, defense-in-depth model combining static code analysis, AST query linting, database schema constraint verification, live PostgREST API probing, and adversarial black-box attack simulations.

```
       ┌────────────────────────────────────────────────────────┐
       │                   LAYER 1: CLIENT                      │
       │  React 18 / TypeScript / DOMPurify / No Secrets / CSP  │
       └──────────────────────────┬─────────────────────────────┘
                                  │
       ┌──────────────────────────▼─────────────────────────────┐
       │                   LAYER 2: API GATEWAY                 │
       │  Express / Helmet / CORS / Rate Limiter / Body Limits  │
       └──────────────────────────┬─────────────────────────────┘
                                  │
       ┌──────────────────────────▼─────────────────────────────┐
       │             LAYER 3: AUTH & PERMISSIONS                │
       │  JWT Claims / DB-backed Roles / Webhook HMAC Signatures│
       └──────────────────────────┬─────────────────────────────┘
                                  │
       ┌──────────────────────────▼─────────────────────────────┐
       │                LAYER 4: POSTGRES DATABASE              │
       │  100% RLS / Role-Aware Policies / Trigger Guard / RPC  │
       └────────────────────────────────────────────────────────┘
```

---

## 2. Test Suite Architecture & Verification Matrix

The test framework evaluates 14 dedicated security vectors across the full software lifecycle:

### Phase A: Database & Row Level Security (RLS)
- **Suite 1: Supabase Security Advisor Live Probes (`scripts/audit_supabase_security_advisor.mjs`)**
  - Evaluates official Supabase Security Linter rules (0001–0010).
  - Validates that extensions are outside `public` schema (`pgcrypto` in `extensions`).
  - Verifies views enforce `security_invoker = true`.
  - Verifies search paths on `SECURITY DEFINER` functions are explicitly pinned (`SET search_path = public, pg_temp`).
- **Suite 2: RLS Lockdown & Zero Anon Access (`scripts/test_rls_lockdown.mjs`)**
  - Confirms dynamic RLS enablement on all tables.
  - Probes every discovered table with anonymous credentials (`SELECT`, `INSERT`, `UPDATE`).
  - Verifies 0 rows or permission denied (`42501`) on all sensitive tables.
- **Suite 5: Hotel Admins Tamper Guard (`scripts/test_hotel_admins_tamper.mjs`)**
  - Attacks `public.hotel_admins` with direct browser `UPDATE`, `INSERT`, `DELETE`.
  - Probes trigger guard `trg_hotel_admins_mutation_guard`.
  - Validates super admin RPC restrictions (`delete_hotel_permanently`, `change_plan`).
- **Suite 6: Database-Level Staff Role Matrix RLS (`scripts/test_role_matrix_rls.mjs`)**
  - Validates role segregation between `admin`, `manager`, `reception`, and `housekeeping`.
  - Asserts financial tables (`invoices`, `bank_reconciliation`, `ota_settlements`) reject reception access.
  - Verifies non-admin staff cannot modify hotel core configuration.
- **Suite 7: Function Grants Lockdown (`scripts/test_function_grants.mjs`)**
  - Verifies revocation of `EXECUTE ON ALL FUNCTIONS IN SCHEMA public` from `anon` and `authenticated`.
  - Audits tenant isolation in `get_hotel_record_counts`.
- **Suite 8: Email Trust Elimination (`scripts/test_email_trust.mjs`)**
  - Verifies elimination of email fallbacks in `auth_hotel_id()`.
  - Verifies absence of auto-confirm triggers.
- **Suite 9: Staff Role Default & Onboarding Hardening (`scripts/test_staff_hardening_and_onboarding.mjs`)**
  - Asserts `hotel_admins.staff_role` defaults to `'reception'`.
  - Verifies onboarding flow refuses to overwrite existing user credentials.
- **Suite 10: Storage Bucket Privacy & Scoping (`scripts/test_storage_bucket_policies.mjs`)**
  - Validates private bucket creation (`hotel-documents`).
  - Asserts path-based tenant prefix scoping.

### Phase B: Server-Side API, Secrets & Static Analysis
- **Suite 3: Staff Role Escalation Prevention (`scripts/test_role_escalation.mjs`)**
  - Injects forged `user_metadata` claims into JWTs.
  - Asserts auth middleware relies strictly on database `hotel_admins` records.
- **Suite 4: Hardcoded Secrets & Fail-Closed Boot (`scripts/test_hardcoded_secrets.mjs`)**
  - Asserts environment fails closed when secrets are missing.
  - Enforces minimum length >= 32 characters.
- **Suite 11: Authoritative Payment Settlement (`scripts/test_verify_payment_hardening.mjs`)**
  - Asserts Razorpay payment verification uses HMAC validation.
  - Verifies currency and ledger amount matching.
- **Suite 12: Tenant Scope AST Query Analysis (`scripts/lint_tenant_scope.mjs`)**
  - Parses AST of all server queries using service role keys.
  - Asserts `hotel_id` filtering is present in all queries.
- **Suite 13: Adversarial Hostile-User Security Attack Suite (`scripts/security_attack_suite.mjs`)**
  - Simulates 11 attack vectors: IDOR, JWT tampering, webhook spoofing, SQL injection, cron hijacking.
- **Suite 14: TypeScript Strict Typecheck (`npm run typecheck`)**
  - Validates strict static types across React client and enterprise APIs.

---

## 3. Pass / Fail Acceptance Criteria

1. **Zero Flakiness:** All tests must pass consistently with 100% deterministic outputs.
2. **Fail-Closed Default:** Any missing configuration or unauthenticated query must resolve to refusal (HTTP 401/403 or SQL `42501`), never silent fallbacks or permissive defaults.
3. **No Secret Commits:** Git history and test logs must be strictly scrubbed of API keys, tokens, or plaintext passwords.
4. **Zero Regressions:** All existing booking, channel manager, and front-desk workflows must remain fully functional.
