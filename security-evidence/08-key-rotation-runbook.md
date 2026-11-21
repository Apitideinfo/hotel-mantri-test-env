# Hotel Mantri — Operator Runbook: Supabase Key Rotation & Deployment

**Document Reference:** `security-evidence/08-key-rotation-runbook.md`  
**Classification:** Standard Operating Procedure (SOP)  
**Intended Operator:** Supabase Project Owner / Vercel Administrator  
**Estimated Downtime:** 2–5 minutes (session re-authentication required)  

---

## 1. Overview & Preparation

This runbook guides the infrastructure administrator through rotating the Supabase production `anon` and `service_role` keys, updating the single Vercel deployment, and verifying zero-regression production readiness.

### Prerequisites Before Beginning:
- Administrative login credentials to [Supabase Cloud Console](https://supabase.com/dashboard).
- Administrative login credentials to [Vercel Dashboard](https://vercel.com).
- Ensure no active mission-critical operations (such as active night audits or guest check-in queues) are occurring.

---

## 2. Step-by-Step Rotation Execution

### Step 1: Generate New JWT Secret in Supabase
1. Open your browser and navigate to:  
   `https://supabase.com/dashboard/project/mtfycmdoqzzyxhjmfvuv/settings/api`
2. Scroll to the **Project API keys** and **JWT Settings** section.
3. Locate the **JWT Secret** field.
4. Click **Generate a new secret** (or **Roll Keys**).
5. In the confirmation dialog, review the warning stating that all active sessions will be terminated, then click **Generate Secret / Roll**.
6. Immediately copy the following two freshly generated values:
   - **`anon` `public` key** (starts with `eyJhbGciOi...`)
   - **`service_role` `secret` key** (starts with `eyJhbGciOi...`)

---

### Step 2: Update Vercel Production Environment Variables
1. Open your browser and navigate to your Vercel Project Dashboard:  
   `https://vercel.com/` -> Select your **Hotel Mantri** project.
2. Navigate to **Settings** -> **Environment Variables**.
3. Update the following environment variables for the **Production** environment:
   - **`VITE_SUPABASE_ANON_KEY`**: Paste the new `anon` public key.
   - **`SUPABASE_SERVICE_ROLE_KEY`**: Paste the new `service_role` secret key.
4. Confirm that the following internal security secrets (remediated in Finding C3) are already set with >= 32 characters:
   - `INTERNAL_API_SECRET`
   - `GUEST_CHECKOUT_SECRET`
   - `WHATSAPP_APP_SECRET`
   - `WHATSAPP_VERIFY_TOKEN`
   - `RAZORPAY_KEY_SECRET`
   - `CRON_SECRET`
5. Click **Save** on each updated variable.

---

### Step 3: Trigger Production Redeployment on Vercel
Because Vite embeds `VITE_` prefixed environment variables directly into client-side JavaScript bundles at build time, updating environment variables in Vercel requires a new build:
1. Navigate to the **Deployments** tab in your Vercel project.
2. Click the three dots (`...`) on the latest production deployment.
3. Select **Redeploy**.
4. Leave the default build settings and click **Redeploy**.
5. Wait for the deployment status to transition to **Ready** (typically 60–90 seconds).

---

### Step 4: Update Local Development Configuration (If Applicable)
1. Open your local `.env` file in the project root:
   ```env
   VITE_SUPABASE_ANON_KEY=<paste_new_anon_key>
   SUPABASE_SERVICE_ROLE_KEY=<paste_new_service_role_key>
   ```
2. Save the file. Ensure `.env` is never committed to Git (`.gitignore` enforces this).

---

### Step 5: Post-Rotation Smoke Test & Verification
Execute the automated smoke test script to confirm that the new keys are functional and all critical subsystems are healthy:
```bash
node scripts/run_production_smoke_test.mjs
```

### Expected Post-Rotation Behavior:
- Probing with the **old** `anon` or `service_role` key must return `HTTP 401 Unauthorized` (`Invalid API key` or `JWT expired`).
- Probing with the **new** keys must return `HTTP 200 OK` on `/api/health` and PostgREST endpoints.
- Log in to the Hotel Mantri web application and verify dashboard metrics render normally.
