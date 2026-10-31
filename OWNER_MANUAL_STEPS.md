# Hotel Mantri — Owner Manual Security Actions & Runbook

**Audience:** Hotel Mantri Infrastructure Owner & Platform Administrators  
**Date:** October 31, 2026  
**Status:** Mandatory Production Go-Live Runbook  
**Branch:** `security/remediation`

---

## 1. Supabase Dashboard: Click-by-Click Hardening

The repository changes provide server-side and database-level protections, but specific platform switches in the **Supabase Dashboard** must be configured manually by the project owner.

### 1.1 Disable Public Self-Registration
- **Click Path:**  
  1. Open [Supabase Dashboard](https://supabase.com/dashboard) and select your project.
  2. In the left navigation, click **Authentication** (padlock icon) -> **Sign In / Sign Up**.
  3. Under **User Signups**, find **"Allow new users to sign up"**.
  4. **Toggle OFF** this switch.
  5. Click **Save** at the bottom of the section.
- **Why It Matters:**  
  With this setting disabled, attackers cannot register arbitrary accounts via the Supabase Auth API to attempt unassigned hotel tenancy. Staff and hotel admin accounts can only be provisioned by authorized administrators via Edge Functions (`setup-super-admin`, `hotel-onboarding`).

### 1.2 Enforce Mandatory Email Confirmation
- **Click Path:**  
  1. In **Authentication** -> **Sign In / Sign Up**.
  2. Under **User Signups**, locate **"Confirm email"**.
  3. **Toggle ON** this switch.
  4. Click **Save**.
- **Why It Matters:**  
  Prevents login using unverified or spoofed email addresses. The backend middleware (`server/middleware/auth.js`) now checks `user.email_confirmed_at` and rejects unconfirmed users with HTTP 403 `EMAIL_NOT_CONFIRMED`.

### 1.3 Enforce 12-Character Minimum Password Policy
- **Click Path:**  
  1. In **Authentication** -> **Sign In / Sign Up**.
  2. Under **Password Requirements**, locate **"Minimum password length"**.
  3. Change the value from `6` to **`12`**.
  4. Ensure **"Prevent password reuse"** or leak check is enabled if supported on your Supabase tier.
  5. Click **Save**.

### 1.4 Review Row Level Security (RLS) Status
- **Click Path:**  
  1. In the left navigation, click **Table Editor** or **Database** -> **Tables**.
  2. Review the list of all 29 public schema tables.
  3. Verify that every table displays a badge showing **"RLS Enabled"** (green shield).
  4. No table in schema `public` should show "RLS Disabled".

### 1.5 Perform a Point-in-Time Recovery (PITR) Backup Drill
- **Click Path:**  
  1. In the left navigation, click **Project Settings** -> **Database**.
  2. Scroll to **Backups**.
  3. Verify that daily automated backups (or PITR continuous backup if on Pro tier) are active.
  4. Conduct a test restore into a separate temporary test project to verify database dump and restore integrity before major production traffic.

---

## 2. Applying Database Migrations to Supabase

The security remediation introduces 3 sequential migrations that must be executed on staging and production databases.

### Migration Order
1. `supabase/migrations/20261101000000_lockdown_rls.sql` (Drops public anon policies, revokes schema privileges, establishes multi-tenant RLS).
2. `supabase/migrations/20261101010000_staff_roles.sql` (Adds `staff_role` and `permissions` columns on `hotel_admins`, backfills roles, establishes staff isolation policies).
3. `supabase/migrations/20261101020000_public_branding_view.sql` (Creates `public_hotel_branding` view, revokes base `hotels` table from `anon`, pins `search_path` on all `SECURITY DEFINER` functions).

### Execution via Supabase SQL Editor
1. In your **Supabase Dashboard**, click **SQL Editor** in the left menu.
2. Click **+ New query**.
3. Copy the full contents of `supabase/migrations/20261101000000_lockdown_rls.sql` into the editor and click **Run**. Confirm output: `Success. No rows returned`.
4. Copy the full contents of `supabase/migrations/20261101010000_staff_roles.sql` into the editor and click **Run**. Confirm output: `Success. No rows returned`.
5. Copy the full contents of `supabase/migrations/20261101020000_public_branding_view.sql` into the editor and click **Run**. Confirm output: `Success. No rows returned`.

### Post-Migration Verification
Run the automated verification audit locally or in CI:
```bash
node scripts/test_rls_lockdown.mjs
```
Expected output:
```
========================================================================
AUDIT SUMMARY:
========================================================================
  TOTAL PUBLIC TABLES AUDITED: 29
  SECURE (ZERO ANON ACCESS):   29
  VULNERABLE (ANON ACCESSIBLE): 0
------------------------------------------------------------------------
✓ PASS: All 29 tables strictly locked down. Zero anonymous access.
```

---

## 3. Vercel Production Environment Variables Checklist

Configure the following environment variables in **Vercel Dashboard -> Project Settings -> Environment Variables**. Apply them to **Production** (and **Preview** with test keys).

| Variable Name | Required | Min Length | Description & Source |
|:---|:---:|:---:|:---|
| `VITE_SUPABASE_URL` | Yes | — | Supabase project URL (`https://<project-ref>.supabase.co`). |
| `VITE_SUPABASE_ANON_KEY` | Yes | JWT | Rotated Supabase public anonymous key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | JWT | Server-only Supabase service-role secret. Never expose to client! |
| `INTERNAL_API_SECRET` | Yes | ≥ 32 chars | Secret for server-to-server and cron calls (`x-internal-secret`). |
| `GUEST_CHECKOUT_SECRET` | Yes | ≥ 32 chars | Secret for signing HMAC guest tokens. |
| `CRON_SECRET` | Yes | ≥ 32 chars | Bearer token for automated cron sync jobs. |
| `RAZORPAY_KEY_ID` | Yes | — | Razorpay public key ID (`rzp_live_...`). |
| `RAZORPAY_KEY_SECRET` | Yes | ≥ 16 chars | Razorpay authoritative server-side API Secret. |
| `RAZORPAY_WEBHOOK_SECRET` | Yes | ≥ 32 chars | Webhook signing secret configured in Razorpay Dashboard. |
| `WHATSAPP_APP_SECRET` | Yes | ≥ 32 chars | Meta App Secret from Meta Developer App Dashboard. |
| `WHATSAPP_VERIFY_TOKEN` | Yes | ≥ 16 chars | Verification token for Meta GET webhook handshake. |
| `META_WHATSAPP_ACCESS_TOKEN` | Yes | — | Permanent System User access token with `whatsapp_business_messaging`. |
| `META_WHATSAPP_PHONE_NUMBER_ID`| Yes | — | Meta WhatsApp Cloud API Phone Number ID. |
| `META_WHATSAPP_BUSINESS_ACCOUNT_ID`| Yes | — | Meta WhatsApp Business Account (WABA) ID. |
| `UPSTASH_REDIS_REST_URL` | Yes | — | Upstash Redis REST URL for distributed rate limiting and distributed locks. |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | — | Upstash Redis REST authorization token. |

> [!CAUTION]
> **Ensure `ALLOW_DESTRUCTIVE_DB_TOOLS` is completely UNSET or explicitly set to `false` in production.** Setting this to `true` allows the `db-tools` Edge Function to execute database drops.

---

## 4. Production Secret Rotation Procedures

### 4.1 Supabase Anon Key & JWT Secret Rotation
- **Why It Is Required:**  
  During the git history security scan (`scripts/scan_git_history_secrets.mjs`), a legacy Supabase `anon` key (`eyJh...pfJs`) was detected in 3 historical commits (`ce005de6a4`, `c4044d3813`, `e535cf3588`). While RLS migrations have completely eliminated anon access to tenant tables, anyone possessing git history still possesses that key. It must be rotated.
- **Click Path:**  
  1. In Supabase Dashboard, go to **Project Settings** -> **API**.
  2. Locate **JWT Settings**.
  3. Click **Generate new secret**.
  4. *Note:* Generating a new JWT secret immediately invalidates all active user sessions and regenerates both `anon` and `service_role` keys.
  5. Copy the newly generated `anon` key and `service_role` key.
  6. Immediately update `VITE_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel.
  7. Trigger a production redeploy in Vercel.

### 4.2 Razorpay Credentials Rotation
- **When to Rotate:** If switching from test mode to live mode, or if key was exposed.
- **Procedure:**
  1. Log in to [Razorpay Dashboard](https://dashboard.razorpay.com/) -> **Settings** -> **API Keys**.
  2. Click **Regenerate Key**. Razorpay allows a 24-hour grace period where both old and new keys remain valid.
  3. Update `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in Vercel.
  4. In **Settings** -> **Webhooks**, edit the active webhook endpoint, generate a new **Secret**, and update `RAZORPAY_WEBHOOK_SECRET` in Vercel.
  5. Redeploy Vercel.

### 4.3 Meta WhatsApp Cloud API Token Rotation
- **Procedure:**
  1. In [Meta Business Suite](https://business.facebook.com/) -> **System Users**.
  2. Select your integration System User.
  3. Click **Generate New Token**.
  4. Select scopes: `whatsapp_business_management`, `whatsapp_business_messaging`. Set token lifetime to **Never expires**.
  5. Update `META_WHATSAPP_ACCESS_TOKEN` in Vercel.
  6. Redeploy Vercel.

---

## 5. Separation of Environments (Test vs Production)

- **Rule:** Never use the same Supabase project for local development, staging, or automated CI tests that you use for production.
- **Setup:**
  1. Create a dedicated **`hotel-mantri-staging`** project in Supabase.
  2. Apply all migrations to the staging project.
  3. Configure GitHub Actions secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) to point to the staging/test instance.
  4. Verify all tests pass against staging before running migrations on production.

---

## 6. Uptime and Error Alerting

- **Health Check Endpoint:**  
  - Public health check: `GET https://hotelmantri.com/api/health` returns `{ "status": "ok" }` (HTTP 200).
  - Detailed telemetry: `GET https://hotelmantri.com/api/health/detailed` (requires super-admin authentication).
- **Recommended Monitoring Setup:**  
  1. Set up an external uptime monitor (e.g., [BetterStack](https://betterstack.com/), [UptimeRobot](https://uptimerobot.com/), or Datadog) pinging `GET https://hotelmantri.com/api/health` every 60 seconds.
  2. Configure alerting via Slack or SMS if 2 consecutive probes fail or latency exceeds 2,500ms.
  3. Monitor Vercel Serverless Function error logs for spikes in HTTP 500 or 503 errors.

---

## 7. Security Policy Publication (`/.well-known/security.txt`)

Per RFC 9116, the security contact policy file has been generated at `public/.well-known/security.txt`. When deployed to Vercel, it is publicly accessible at:
```
https://hotelmantri.com/.well-known/security.txt
```
Contents:
```text
# Hotel Mantri Security Policy (RFC 9116)
Contact: mailto:security@hotelmantri.com
Expires: 2027-10-31T23:59:59.000Z
Preferred-Languages: en
Canonical: https://hotelmantri.com/.well-known/security.txt
Policy: https://hotelmantri.com/privacy-policy
Acknowledgments: https://hotelmantri.com/security-acknowledgments
```

---

## 8. Penetration Testing Recommendation & Residual Risk Analysis

### 8.1 Professional Penetration Testing Recommendation
While all 21 audit findings have been remediated and verified with automated attack simulations, a formal annual external third-party **grey-box penetration test** is recommended before processing high-volume credit card payments or scaling multi-property enterprise tenants. Focus areas should include:
- Razorpay webhook race conditions during webhook replay.
- Channel Manager OTA sync lock contention under network partitions.
- Supabase Edge Function execution timeouts under heavy concurrent loads.

### 8.2 Residual Risk Matrix

| Risk Vector | Inherent Likelihood | Inherent Impact | Mitigation Implemented | Residual Risk | Monitoring & Operator Action |
|:---|:---:|:---:|:---|:---:|:---|
| **Supabase JWT Secret Compromise** | Low | Critical | Secret rotation procedure documented; RLS strictly isolates tenants. | **Low** | Rotate JWT secret immediately if administrative workstation is compromised. |
| **Upstash Redis Outage** | Low | Medium | Rate limiter gracefully falls back to in-memory sliding window; server does not crash. | **Low** | Monitor Upstash status page and alerts. Rate limiting continues per-serverless instance during outage. |
| **DDoS / HTTP Flooding** | Medium | Medium | Express helmet + Redis sliding window rate limiter (120 req/min global, 10/min auth). | **Low** | Vercel Edge Network provides layer 3/4 DDoS mitigation automatically. |
| **OTA Channel Sync Discrepancy** | Low | Medium | Channel inventory matching enforces room capacity validation; sync jobs execute idempotently with distributed Redis lock. | **Low** | Review daily OTA settlement logs in PMS dashboard. |
| **Phishing of Hotel Admin Credentials** | Medium | High | Mandatory email confirmation, 12-char minimum password policy, dictionary deny list. | **Low** | Recommend enabling Multi-Factor Authentication (MFA/TOTP) in Supabase Dashboard for hotel admins. |

