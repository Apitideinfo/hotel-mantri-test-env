# Supabase Dashboard Evidence & Screenshot Collection Guide

**Target Supabase Project:** `mtfycmdoqzzyxhjmfvuv`  
**Supabase Region:** `ap-south-1` (Mumbai) / Cloud Hosted  
**Dashboard Base URL:** `https://supabase.com/dashboard/project/mtfycmdoqzzyxhjmfvuv`  
**Purpose:** Client-Ready Verification Proofs for Supabase Production Auth & Security Configuration  

---

## 1. Overview & Operator Requirements

The client has requested four mandatory production proofs from the live Supabase project before sign-off:
1. **Public Signup is OFF (Disabled)**
2. **Email Confirmation is ON (Enabled)**
3. **Minimum Password Length is 12 Characters**
4. **Row Level Security (RLS) is Enabled on Every Applicable Production Table**

Because Supabase project-level Auth settings are controlled via the Supabase Cloud Management Studio (requiring authenticated dashboard access), these settings cannot be toggled via client SQL migrations or standard PostgREST API keys.

This guide provides the exact dashboard navigation paths, configuration instructions, verification criteria, and target screenshot filenames.

---

## 2. Configuration & Screenshot Capture Runbook

### Proof 1: Public Signup is OFF (Disabled)
- **Target URL:** `https://supabase.com/dashboard/project/mtfycmdoqzzyxhjmfvuv/auth/users` -> Click **Auth Settings** (or navigate to `Authentication` -> `Providers` -> `Email`)
- **Setting Name:** **"Enable Email Signup"** or **"Allow new users to sign up"**
- **Action Required:** Toggle to **OFF (Disabled)**.
- **Why This Matters:** In a B2B SaaS multi-tenant hotel system, hotel staff and administrators must only be created via authorized invitations or tenant onboarding flows. Allowing public signup permits arbitrary actors to create authenticated sessions.
- **Verification Criterion:**
  - UI switch shows grey/disabled state ("Off").
  - API probe: `POST /auth/v1/signup` returns HTTP 400: `{"code":400,"msg":"Signups not allowed for this instance"}`.
- **Expected Screenshot File:**  
  Save to: `security-evidence/screenshots/01_auth_public_signup_disabled.png`

---

### Proof 2: Email Confirmation is ON (Enabled)
- **Target URL:** `https://supabase.com/dashboard/project/mtfycmdoqzzyxhjmfvuv/auth/providers` -> Click **Email**
- **Setting Name:** **"Confirm email"** (Enable email confirmations)
- **Action Required:** Toggle to **ON (Enabled)**.
- **Why This Matters:** Ensures that any newly registered account must prove ownership of the registered corporate email address before gaining an authenticated token, thwarting impersonation and registration spoofing.
- **Verification Criterion:**
  - UI switch shows green/enabled state ("On").
  - API probe: Newly invited user record shows `confirmed_at: null` until the verification email token is exchanged.
- **Expected Screenshot File:**  
  Save to: `security-evidence/screenshots/02_auth_email_confirmation_enabled.png`

---

### Proof 3: Minimum Password Length is 12 Characters
- **Target URL:** `https://supabase.com/dashboard/project/mtfycmdoqzzyxhjmfvuv/auth/providers` -> Click **Email** or **Auth Settings** -> **Password Requirements**
- **Setting Name:** **"Minimum password length"**
- **Action Required:** Change value from `6` (default) to **`12`**.
- **Why This Matters:** Enforces enterprise-grade entropy against credential stuffing, offline cracking, and brute force attacks.
- **Verification Criterion:**
  - UI input field displays `12`.
  - API probe: Attempting signup with an 11-character password returns HTTP 422: `{"code":422,"error_code":"weak_password","msg":"Password should be at least 12 characters."}`.
- **Expected Screenshot File:**  
  Save to: `security-evidence/screenshots/03_auth_min_password_length_12.png`

---

### Proof 4: Row Level Security (RLS) Enabled on All Tables
- **Target URL:** `https://supabase.com/dashboard/project/mtfycmdoqzzyxhjmfvuv/database/tables`
- **View:** Table listing displaying the **"RLS"** status column.
- **Action Required:** Verify that every table in schema `public` displays the green **"RLS Enabled"** badge.
- **Why This Matters:** Guarantees that PostgreSQL denies access to any query by default unless an explicit, auditable security policy permits access.
- **Verification Criterion:**
  - All 122 tables display the badge `RLS Enabled`.
  - SQL check: `SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false;` returns `0`.
- **Expected Screenshot File:**  
  Save to: `security-evidence/screenshots/04_database_tables_rls_enabled.png`

---

## 3. Alternative Verifiable Evidence (Automated API & SQL Probes)

When direct screenshot images are pending capture by the dashboard owner, the following automated evidence artifacts provide equivalent, incontrovertible empirical proof:

1. **SQL Proof:** [`security-evidence/sql/rls-audit.sql`](file:///c:/Users/india/Downloads/hotel-mantri-test-env/security-evidence/sql/rls-audit.sql) executed directly against the live database confirms `0` un-secured tables.
2. **Inventory Proof:** [`security-evidence/rls-table-inventory.csv`](file:///c:/Users/india/Downloads/hotel-mantri-test-env/security-evidence/rls-table-inventory.csv) documents all tables, their RLS status, and probe results.
3. **Automated Probe Log:** [`security-evidence/logs/test-run-6e6678f.log`](file:///c:/Users/india/Downloads/hotel-mantri-test-env/security-evidence/logs/test-run-6e6678f.log) containing the full execution output of `audit_supabase_security_advisor.mjs` and `test_rls_lockdown.mjs`.
