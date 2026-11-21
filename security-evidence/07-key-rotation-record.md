# Hotel Mantri — Production Key Rotation Record & Exposure Analysis

**Document Reference:** `security-evidence/07-key-rotation-record.md`  
**Classification:** Confidential Security Record / Operational Transition  
**Target Environment:** Supabase Cloud Project `mtfycmdoqzzyxhjmfvuv` & Vercel Deployment  
**Current Rotation Status:** **PENDING OPERATOR DASHBOARD ROTATION**  
**Lead Security Auditor:** Akshay Vyas (`akshayvyas505-lang`)  
**Date:** November 21, 2026  

---

## 1. Executive Summary & Status Declaration

In accordance with strict application security auditing standards and the **Zero Fabrication Rule**, this document formally records that **production `anon` and `service_role` key rotation is currently PENDING OWNER DASHBOARD ROTATION**.

### Key Status Ledger
| Key Identifier | Classification | Scope / Environment | Historical Git Exposure | Current Operational Status | Rotation Requirement |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **`VITE_SUPABASE_ANON_KEY`** | Public JWT Client Token | React Frontend / Browser Client | Yes (Pre-C3) | Active / Functional | **Pending Operator Rotation** |
| **`SUPABASE_SERVICE_ROLE_KEY`** | Privileged Admin Secret | Express Backend / Vercel Serverless | Yes (Pre-C3) | Active / Functional | **Pending Operator Rotation** |
| **`INTERNAL_API_SECRET`** | Internal Microservice Secret | Node.js Backend API | No (Post-C3) | Active (>=32 Chars) | Verified / Rotated |
| **`GUEST_CHECKOUT_SECRET`** | Guest Session Signing Secret | Public Booking Flow | No (Post-C3) | Active (>=32 Chars) | Verified / Rotated |
| **`WHATSAPP_APP_SECRET`** | Meta Webhook HMAC Secret | Webhook Verification Middleware | No (Post-C3) | Active (>=32 Chars) | Verified / Rotated |
| **`WHATSAPP_VERIFY_TOKEN`** | Meta Webhook Challenge Token | Meta Verification Challenge | No (Post-C3) | Active (>=32 Chars) | Verified / Rotated |
| **`RAZORPAY_KEY_SECRET`** | Razorpay Payment Webhook Key | Payment Settlement Ledger | No (Post-C3) | Active (>=32 Chars) | Verified / Rotated |
| **`CRON_SECRET`** | Automated Cron Bearer Secret | Night Audit / Sync Queues | No (Post-C3) | Active (>=32 Chars) | Verified / Rotated |

---

## 2. Threat & Exposure Analysis

### 2.1 Why Rotation of Supabase Keys is Critical
During the initial remediation discovery (Finding C3), it was identified that historical commits preceding the security hardening sprint had inadvertently committed repository configuration files containing the Supabase API keys.

While:
1. Dynamic Row Level Security (Finding C1) now completely isolates all 122 public tables against the `anon` key, preventing unauthorized data extraction, and
2. Trigger guards on `hotel_admins` (Finding N1) block privilege escalation attacks,

the **`SUPABASE_SERVICE_ROLE_KEY` completely bypasses PostgreSQL Row Level Security** by design in Supabase. Any actor in possession of the legacy `service_role` key can read, modify, or drop database records directly via the PostgREST API without triggering RLS policies.

Therefore, complete revocation and regeneration of the Supabase JWT secret is a mandatory prerequisite for production go-live sign-off.

### 2.2 Why Key Rotation Cannot Be Automated via CLI
Supabase does not expose a programmatic API to regenerate JWT secrets using standard project API keys. Toggling or regenerating JWT secrets requires **Supabase Cloud Management Studio Dashboard Owner credentials** (or an authorized Supabase Management API Personal Access Token).

Because an external security auditor does not hold owner dashboard credentials, the physical rotation action must be executed by the project owner in the Supabase Cloud Console following the step-by-step instructions in [`security-evidence/08-key-rotation-runbook.md`](file:///c:/Users/india/Downloads/hotel-mantri-test-env/security-evidence/08-key-rotation-runbook.md).

---

## 3. Impact & Dependency Matrix

Rotating the Supabase JWT secret will instantly invalidate all active JWTs, including:
- All active browser user sessions (users will be prompted to log in again).
- The existing `VITE_SUPABASE_ANON_KEY`.
- The existing `SUPABASE_SERVICE_ROLE_KEY`.

### Systems Requiring Synchronized Updates:
1. **Supabase Cloud Console:** Generate new JWT secret.
2. **Vercel Production Dashboard:** Update environment variables `VITE_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
3. **Vercel Production Deployment:** Trigger production build and redeploy so the React frontend bundle compiles the new anon key.
4. **Local Development Environment:** Update local `.env` file for ongoing developer maintenance.

---

## 4. Verification & Audit Sign-Off Protocol

Once the project owner completes the steps in the Runbook:
1. The auditor or operator must execute the production smoke test suite:
   ```bash
   node scripts/run_production_smoke_test.mjs
   ```
2. Verify that the previous keys return HTTP 401 (`Invalid API key` / `JWT expired`).
3. Verify that the new keys return HTTP 200 on health probes and authenticated endpoints.
4. Update this document status from `PENDING OPERATOR DASHBOARD ROTATION` to `COMPLETED & VERIFIED`.
