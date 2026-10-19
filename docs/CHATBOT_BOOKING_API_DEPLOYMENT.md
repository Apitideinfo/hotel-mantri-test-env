# Hotel Mantri — Chatbot Booking API Deployment & Operations Runbook

**Document Version:** 1.0.0  
**Effective Date:** 2026-10-17  
**Scope:** Production and Staging deployment runbook, infrastructure setup, secret management, migration application, and disaster recovery / rollback procedures.

---

## 1. Hosting Architecture & Independence

The Chatbot Booking API (`chatbot-booking-api/`) is architected as an **independent, stateless microservice**.

> [!CRITICAL]
> **Do NOT deploy this service behind the existing Hotel Mantri Vercel `/api/*` rewrite.**  
> Vercel's serverless runtime enforces short execution timeouts, lacks persistent raw request stream handling needed for zero-leak webhook crypto, and does not support true background hold-expiry workers. This service must run on an independent Node.js container or app runtime (e.g. Render, Railway, Fly.io, DigitalOcean App Platform, or AWS App Runner / ECS).

### Production Topology
```
                          ┌─────────────────────────┐
                          │   External Chatbot      │
                          │   (Voiceflow/Botpress)  │
                          └────────────┬────────────┘
                                       │ HTTPS
                                       ▼
                          ┌─────────────────────────┐
                          │ Cloudflare / Edge Proxy │
                          │ (api-chatbot.hotelmantri│
                          └────────────┬────────────┘
                                       │
                                       ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Independent Container / Web Service (Node.js 20+ LTS)           │
  │  Directory: /chatbot-booking-api                                │
  │  Port: 4000                                                     │
  │  - Sliding Window Rate Limiting                                 │
  │  - Raw Buffer Webhook Signature Verifier                        │
  │  - Single-Tenant Isolation Enforcement                         │
  │  - HMAC Cryptographic Quote & Token Engine                      │
  └────────────────┬───────────────────────────────┬────────────────┘
                   │                               │
        PostgreSQL │ Transaction                   │ Official REST SDK
        (Direct &  │ RPCs                          │
        Service    │                               ▼
        Role)      ▼                      ┌──────────────────┐
  ┌─────────────────────────────────┐     │  Razorpay API    │
  │ Supabase / PostgreSQL DB         │     │  (Payment Orders │
  │ - Hotel Gopal (Tenant)          │     │  & Webhooks)     │
  │ - reservations, rooms, payments │     └──────────────────┘
  └─────────────────────────────────┘
```

---

## 2. Environment Variables Specification

The service enforces strict **fail-closed startup validation**. If any mandatory variable is missing or invalid, the process terminates immediately with code `1`.

| Variable Name | Required | Default / Format | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | `production` / `development` | Runtime environment. Controls stack trace sanitization. |
| `PORT` | No | `4000` | Port for the Express HTTP listener. |
| `SUPABASE_URL` | Yes | `https://<ref>.supabase.co` | Authoritative Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | `eyJhbGci...` | Server-only Supabase Service Role secret. Never expose to client! |
| `HOTEL_PUBLIC_SLUG` | Yes | `hotel-gopal` | Public slug identifying the single property served. |
| `HOTEL_ID` | Optional | `bd8f18de-2f97-48e7...` | Explicit UUID override for the configured hotel. |
| `RAZORPAY_KEY_ID` | Yes | `rzp_test_...` / `rzp_live_...` | Razorpay public key ID. |
| `RAZORPAY_KEY_SECRET` | Yes | `<secret>` | Authoritative Razorpay API Secret for order creation & signatures. |
| `RAZORPAY_WEBHOOK_SECRET` | Yes | `<secret>` | Secret configured in Razorpay Dashboard for webhook validation. |
| `BOOKING_TOKEN_SECRET` | Yes | Min 32 chars | Secret key for signing HMAC quote tokens and guest access tokens. |
| `BOOKING_HOLD_TTL_SECONDS` | No | `900` (15 mins) | Duration before an unpaid inventory hold expires. |
| `ALLOWED_CHATBOT_ORIGINS` | No | `*` | Comma-separated list of allowed CORS browser origins if called via web widgets. |
| `PUBLIC_API_BASE_URL` | Yes | `https://api-chatbot.hotelmantri.com` | Canonical base URL used in client links and documentation. |

---

## 3. Local Installation & Development

### 3.1 Prerequisites
- Node.js 20+ LTS
- Access to Supabase PostgreSQL instance

### 3.2 Setup Steps
```bash
# 1. Navigate to service directory
cd chatbot-booking-api

# 2. Install production and dev dependencies
npm install

# 3. Create environment file from template
cp .env.example .env

# 4. Fill in secrets in .env (ensure SUPABASE_SERVICE_ROLE_KEY and BOOKING_TOKEN_SECRET are set)

# 5. Run automated test suite
npm test

# 6. Start service in development mode
npm run dev
```

The health check will be immediately available at:  
`http://127.0.0.1:4000/v1/public/health`

---

## 4. Applying Database Migrations

The database migration introduces transaction-safe reservation holding and payment recording RPCs without affecting existing Hotel Mantri tables.

### 4.1 Migration File
`supabase/migrations/20261017000000_chatbot_booking_concurrency.sql`

### 4.2 Review Checklist Before Execution
1. Confirm connection to the correct Supabase target environment.
2. Confirm no table renames or column deletions exist in the script.
3. Confirm grants are restricted to `authenticated` and `service_role`.

### 4.3 Applying via Supabase CLI
```bash
# Link project (requires SUPABASE_ACCESS_TOKEN and db password)
supabase link --project-ref yzkmeyfmsmpxbaxbdtoc

# Push pending migration safely
supabase db push
```

### 4.4 Applying via Supabase SQL Editor (Dashboard)
1. Open Supabase Dashboard -> SQL Editor.
2. Open `supabase/migrations/20261017000000_chatbot_booking_concurrency.sql`.
3. Review and execute the script.
4. Verify created functions:
   - `create_chatbot_booking_hold`
   - `finalize_chatbot_booking_payment`
   - `release_expired_chatbot_holds`

> [!NOTE]
> The service features **Dual-Mode Durability**. If the RPC migration has not yet been executed in a newly provisioned staging database, the service automatically falls back to direct database table persistence into `reservations` and `payment_transactions`.

---

## 5. Deployment Options

### Option A: Render.com (Recommended for Simplicity)
1. Create a **New Web Service** linked to the GitHub repository.
2. Configure settings:
   - **Root Directory:** `chatbot-booking-api`
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. In **Environment Variables**, add all keys from Section 2.
4. Set Health Check Path to `/v1/public/health`.

### Option B: Railway.app
1. Deploy from GitHub repository.
2. Set **Root Directory** to `/chatbot-booking-api`.
3. Add environment variables.
4. Railway automatically detects Node.js and binds `$PORT`.

### Option C: Docker Container (Fly.io / AWS ECS / Self-Hosted)
A standard production Dockerfile:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 4000
USER node
CMD ["node", "src/server.js"]
```

---

## 6. Razorpay Production Webhook Configuration

1. Log in to [Razorpay Dashboard](https://dashboard.razorpay.com).
2. Navigate to **Settings -> Webhooks**.
3. Click **Add New Webhook**.
4. **Webhook URL:** `https://api-chatbot.hotelmantri.com/v1/payments/razorpay/webhook`
5. **Secret:** Set a secure random 32+ character string (must match `RAZORPAY_WEBHOOK_SECRET`).
6. **Active Events:**
   - `payment.captured`
   - `payment.failed`
   - `order.paid`
7. Save the webhook.

---

## 7. Zero-Downtime Rollback Plan

### 7.1 Service Rollback
Because the service is stateless and decoupled from the main Hotel Mantri frontend:
- In Render/Railway: Click **Rollback** to redeploy the previous green build commit in < 60 seconds.
- No frontend redeploy is needed.

### 7.2 Database Rollback
If the SQL migration needs to be reverted:
```sql
DROP FUNCTION IF EXISTS public.finalize_chatbot_booking_payment(UUID, TEXT, TEXT, NUMERIC, JSONB);
DROP FUNCTION IF EXISTS public.release_expired_chatbot_holds(UUID);
DROP FUNCTION IF EXISTS public.create_chatbot_booking_hold(UUID, UUID, DATE, DATE, INTEGER, NUMERIC, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER);
DROP TABLE IF EXISTS public.chatbot_idempotency_records;
DROP TABLE IF EXISTS public.chatbot_booking_holds;
```
*Note: Dropping these helper tables and functions will NOT delete any bookings already committed into the primary `reservations` table.*
