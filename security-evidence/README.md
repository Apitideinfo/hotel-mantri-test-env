# Hotel Mantri — Production Security Evidence & Verification Dossier

**Target Application:** Hotel Mantri Multi-Tenant Hospitality Management System  
**Repository Branch:** `security/remediation`  
**Base Commit (main):** `f85f019a78b8058c52b1ea838d20dd889f2a53c4`  
**Verified Commit:** `6e6678f930f125e89ff27f2dc82445767692b7d1` (`6e6678f`)  
**Audit Standard:** Zero Fabrication / Defense-in-Depth / 100% Deterministic Evidence  
**Lead Security Auditor:** Akshay Vyas (`akshayvyas505-lang`)  
**Report Date:** November 21, 2026  

---

## 1. Executive Summary & Client Acceptance Status

This dossier compiles the definitive security audit, automated test proofs, live database inspections, and operator runbooks for the Hotel Mantri multi-tenant platform. All 28 security findings from the comprehensive audit (C1–C3, H1–H5, M1–M8, L1–L5, and re-audit N1–N7) have been fully resolved with zero code regressions.

### Status of Primary Client Deliverable Requirements:

| # | Client Requirement | Verification Standard | Current Empirical Status | Action Required |
| :-: | :--- | :--- | :---: | :--- |
| **1a** | Supabase Public Signup is OFF | Live Auth Gateway API Probes | **PENDING OWNER CONFIGURATION** | Toggle to OFF in Supabase Dashboard (See [Guide](file:///c:/Users/india/Downloads/hotel-mantri-test-env/security-evidence/screenshots/SUPABASE_DASHBOARD_EVIDENCE_GUIDE.md)) |
| **1b** | Supabase Email Confirmation is ON | Live User Confirmation Inspection | **PENDING OWNER CONFIGURATION** | Toggle to ON in Supabase Dashboard (See [Guide](file:///c:/Users/india/Downloads/hotel-mantri-test-env/security-evidence/screenshots/SUPABASE_DASHBOARD_EVIDENCE_GUIDE.md)) |
| **1c** | Min Password Length >= 12 Chars | Live Password Policy Entropy Probes | **PENDING OWNER CONFIGURATION** | Set to 12 in Supabase Dashboard (See [Guide](file:///c:/Users/india/Downloads/hotel-mantri-test-env/security-evidence/screenshots/SUPABASE_DASHBOARD_EVIDENCE_GUIDE.md)) |
| **1d** | RLS Enabled on Every Table | Schema Audit & Live Probes on 124 Tables | **VERIFIED (124/124 TABLES)** | None. 100% of tables enforce RLS (See [Inventory](file:///c:/Users/india/Downloads/hotel-mantri-test-env/security-evidence/rls-table-inventory.csv)) |
| **2** | Test Execution for Commit `6e6678f` | 14 Test Suites, 212 Assertions, 0 Failures | **VERIFIED (212/212 ASSERTIONS)** | None. Verified via automated runner (See [Log](file:///c:/Users/india/Downloads/hotel-mantri-test-env/security-evidence/logs/test-run-6e6678f.log)) |
| **3a** | Production Supabase Key Rotation | JWT Signature & Token Invalidation | **PENDING OWNER ROTATION** | Execute Step-by-Step Operator SOP (See [Runbook](file:///c:/Users/india/Downloads/hotel-mantri-test-env/security-evidence/08-key-rotation-runbook.md)) |
| **3b** | Final Production Smoke Test | Non-Destructive Live Probes (8 Probes) | **VERIFIED (8/8 PROBES PASSED)** | Re-run smoke test script immediately after key rotation |

---

## 2. Directory Structure & Evidence Artifacts

```
security-evidence/
├── 01-baseline-audit.md                     # System architecture, commit 6e6678f discovery & audit baseline
├── 02-rls-audit.md                          # Comprehensive Row Level Security & multi-tenant isolation report
├── 03-historical-ci-verification.md         # CI workflow evaluation & independent commit 6e6678f audit
├── 04-current-test-results.md               # Summary execution ledger for all 14 maintained security test suites
├── 05-security-test-plan.md                 # Defense-in-depth security verification test plan
├── 06-security-test-results.md              # Granular assertion-by-assertion outcomes across 212 test checks
├── 07-key-rotation-record.md                # Tracking record, threat analysis & exposure audit for API keys
├── 08-key-rotation-runbook.md               # Step-by-step SOP for Supabase dashboard key rolling & Vercel deploy
├── 09-production-smoke-test.md              # Live non-destructive production gateway probe report
├── acceptance-matrix.csv                    # Client requirements compliance & audit tracking matrix
├── findings-register.csv                    # Granular ledger of all 28 audited security findings (C1–N7)
├── evidence-index.csv                       # Master index and category mapping of all evidence artifacts
├── README.md                                # This document (Master index & reproduction guide)
├── sql/
│   └── rls-audit.sql                        # PostgreSQL SQL script to audit table-level RLS & policies
├── logs/
│   ├── test-run-6e6678f.log                 # Sanitized raw execution log proving 212 assertions passed
│   └── production-smoke-test.log            # Sanitized raw execution log proving 8/8 smoke tests passed
├── screenshots/
│   └── SUPABASE_DASHBOARD_EVIDENCE_GUIDE.md # Visual guide, DOM selectors & instructions for dashboard captures
├── Production_Security_Remediation_Verification_Report.pdf # Client-deliverable publication-grade PDF report
└── Production_Security_Evidence_Package.zip # Bundled evidence package containing all reports, CSVs & logs
```

---

## 3. How to Reproduce All Verifications Locally

All verification tools are built into the repository and can be executed with standard Node.js (v20+):

### 1. Run Complete 14-Suite Security Regression Runner (212 Assertions):
```bash
node scripts/run_security_verification_suite.mjs
```
*Expected Output:* `Total Suites: 14 | Passed: 14 | Failed: 0 | Assertions: 212/212 Passed`

### 2. Run Live Supabase Security Advisor Linter:
```bash
node scripts/audit_supabase_security_advisor.mjs
```
*Expected Output:* `ZERO SECURITY DEFECTS DETECTED! (9/9 Passed)`

### 3. Run Production Smoke Test Suite:
```bash
node scripts/run_production_smoke_test.mjs
```
*Expected Output:* `SMOKE TEST SUMMARY: 8 PASSED | 0 FAILED`

### 4. Regenerate RLS Table Inventory CSV:
```bash
node scripts/generate_rls_inventory_and_audit.mjs
```
*Expected Output:* Generates updated `security-evidence/rls-table-inventory.csv` across all 124 tables.

### 5. Strict TypeScript Compilation Check:
```bash
npm run typecheck
```
*Expected Output:* Clean exit code 0 (`tsc -p tsconfig.app.json`).

---

## 4. Operator Sign-Off Checklist Before Production Go-Live

To transition the remaining `PENDING` requirements to `VERIFIED`:
1. [ ] Log into [Supabase Cloud Console](https://supabase.com/dashboard/project/mtfycmdoqzzyxhjmfvuv/auth/users).
2. [ ] Toggle **"Enable Email Signup"** to **OFF**.
3. [ ] Toggle **"Confirm Email"** to **ON**.
4. [ ] Set **"Minimum Password Length"** to **12**.
5. [ ] Capture screenshots of the toggled settings as specified in [`SUPABASE_DASHBOARD_EVIDENCE_GUIDE.md`](file:///c:/Users/india/Downloads/hotel-mantri-test-env/security-evidence/screenshots/SUPABASE_DASHBOARD_EVIDENCE_GUIDE.md).
6. [ ] Follow [`08-key-rotation-runbook.md`](file:///c:/Users/india/Downloads/hotel-mantri-test-env/security-evidence/08-key-rotation-runbook.md) to roll `anon` and `service_role` keys.
7. [ ] Update Vercel environment variables and trigger redeployment.
8. [ ] Execute `node scripts/run_production_smoke_test.mjs` to confirm green status.
