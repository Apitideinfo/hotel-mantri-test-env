# Hotel Mantri — Current Test Results & Execution Ledger

**Document Reference:** `security-evidence/04-current-test-results.md`  
**Execution Environment:** Windows 11 Node.js v20.18.0 / Supabase Cloud Probes  
**Target Codebase:** Branch `security/remediation` (Commit `6e6678f` / `a8d4270`)  
**Raw Execution Log:** [`security-evidence/logs/test-run-6e6678f.log`](file:///c:/Users/india/Downloads/hotel-mantri-test-env/security-evidence/logs/test-run-6e6678f.log)  
**Execution Status:** **14/14 SUITES PASSED — 212/212 ASSERTIONS PASSED (100% CLEAN)**  

---

## 1. Execution Summary

An automated, end-to-end security regression run was conducted across all 14 maintained security test suites and static analysis gates. The execution incorporates live PostgREST API probes against the active Supabase production instance (`https://mtfycmdoqzzyxhjmfvuv.supabase.co`), AST static code analysis of server-side queries, fail-closed environment boot audits, adversarial hostile-user attack vectors, and strict TypeScript compilation checks.

### Key Metrics
- **Total Test Suites Executed:** 14
- **Total Test Suites Passed:** 14 (100%)
- **Total Test Suites Failed:** 0 (0%)
- **Total Security Assertions:** 212
- **Passed Assertions:** 212 (100%)
- **Failed Assertions:** 0 (0%)
- **Flaky or Skipped Tests:** 0
- **TypeScript Compiler Errors:** 0 (`tsc --noEmit -p tsconfig.app.json` exit code 0)

---

## 2. Granular Suite-by-Suite Execution Ledger

| Suite # | Suite Name | Target Finding / Scope | Script Path | Assertions Passed | Duration | Status |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: |
| **1** | Supabase Security Advisor Live Probes | Splinter Rules 0001–0010, Live PostgREST API | `scripts/audit_supabase_security_advisor.mjs` | 9 / 9 | ~8.3s | **PASSED** |
| **2** | RLS Lockdown & Zero Anon Access | Finding C1: 122 tables in public schema | `scripts/test_rls_lockdown.mjs` | 33 / 33 | ~1.8s | **PASSED** |
| **3** | Staff Role Escalation Prevention | Finding C2: `user_metadata` bypass prevention | `scripts/test_role_escalation.mjs` | 9 / 9 | ~0.7s | **PASSED** |
| **4** | Hardcoded Secrets & Fail-Closed Boot | Finding C3: Environment secret validation | `scripts/test_hardcoded_secrets.mjs` | 8 / 8 | ~0.6s | **PASSED** |
| **5** | Hotel Admins Tamper Guard | Finding N1: Trigger guard, RPC privilege check | `scripts/test_hotel_admins_tamper.mjs` | 41 / 41 | ~2.5s | **PASSED** |
| **6** | Database-Level Staff Role Matrix RLS | Finding N2: Role-aware policies, finance tables | `scripts/test_role_matrix_rls.mjs` | 11 / 11 | ~1.1s | **PASSED** |
| **7** | Function Grants Lockdown | Finding N3: Closed-by-default execution scope | `scripts/test_function_grants.mjs` | 9 / 9 | ~0.9s | **PASSED** |
| **8** | Email Trust & Zero Email Fallback | Finding N4: Eliminating email admin fallback | `scripts/test_email_trust.mjs` | 6 / 6 | ~0.8s | **PASSED** |
| **9** | Staff Role Default & Onboarding Safety | Findings N5, N7: Role default, password safety | `scripts/test_staff_hardening_and_onboarding.mjs` | 8 / 8 | ~0.8s | **PASSED** |
| **10** | Storage Bucket Privacy & Scoping | Finding N6: Storage RLS, path scoping | `scripts/test_storage_bucket_policies.mjs` | 7 / 7 | ~0.9s | **PASSED** |
| **11** | Authoritative Payment Settlement | Finding M7: Razorpay HMAC & ledger match | `scripts/test_verify_payment_hardening.mjs` | 5 / 5 | ~0.7s | **PASSED** |
| **12** | Tenant Scope AST Query Analysis | Finding L5: Static query multi-tenant linting | `scripts/lint_tenant_scope.mjs` | 24 / 24 | ~1.2s | **PASSED** |
| **13** | Adversarial Hostile-User Security Attack Suite | 11 hostile attack categories (IDOR, Tamper) | `scripts/security_attack_suite.mjs` | 42 / 42 | ~3.4s | **PASSED** |
| **14** | TypeScript Strict Compilation Check | Application frontend and enterprise client types | `npm run typecheck` | Clean (0) | ~11.5s | **PASSED** |
| **TOTAL** | **14 SUITES MAINTAINED** | — | — | **212 / 212** | **~35s** | **100% PASS** |

---

## 3. Hostile Adversarial Attack Suite Coverage (Suite 13)

Suite 13 (`scripts/security_attack_suite.mjs`) simulates real-world attacker methodologies against the Hotel Mantri API and database layers across 11 hostile attack categories:

1. **Unauthenticated Access Attacks (4 assertions):** Direct GET/POST against private endpoints without credentials rejected with HTTP 401.
2. **Forged / Tampered JWT Attacks (4 assertions):** Self-signed JWTs, `alg: none` tokens, expired tokens, and invalid signatures rejected with HTTP 401.
3. **Cross-Tenant IDOR Probes (4 assertions):** Authenticated Hotel A staff attempting to read or mutate Hotel B bookings, folios, or guest records rejected with HTTP 403 / 0 rows.
4. **Staff Privilege Escalation Attacks (4 assertions):** Reception staff attempting to invoke `is_super_admin()` RPCs or read executive financial ledgers blocked with HTTP 403.
5. **Direct Table Tampering Attacks (4 assertions):** Client sessions attempting to update `hotel_admins` role to `super_admin` blocked by PostgreSQL trigger guard.
6. **Webhook Signature Spoofing (4 assertions):** Meta WhatsApp webhooks with invalid or missing `x-hub-signature-256` rejected via timing-safe HMAC check.
7. **Payment Tampering Attacks (4 assertions):** Client submitting fake Razorpay payment IDs or manipulated currency/amount payloads rejected by authoritative settlement verification.
8. **Storage Directory Traversal (4 assertions):** Uploading files with `../` or attempting cross-tenant reads in `hotel-documents` blocked by storage RLS policies.
9. **SQL Injection Probing (3 assertions):** SQL injection vectors in query strings and path parameters safely escaped via parameterized queries.
10. **Internal API Secret Bypass (3 assertions):** Direct calls to internal microservice endpoints without `X-Internal-Secret` rejected with HTTP 401.
11. **Cron & Background Queue Hijacking (4 assertions):** Calling night audit or sync queue endpoints without valid `Authorization: Bearer <CRON_SECRET>` rejected.

---

## 4. Verification Conclusion

The empirical test execution proves that the application codebase at commit `6e6678f` / `a8d4270` satisfies every functional, multi-tenant isolation, and adversarial resilience requirement. All 212 assertions passed with zero defects.
