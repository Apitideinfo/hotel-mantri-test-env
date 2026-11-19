# SECURITY DECISIONS & CLASSIFICATIONS

This document records the architectural security decisions, access controls, role definitions, table classifications, and risk trade-offs for Hotel Mantri as established during the security remediation program.

---

## 1. Table Classifications & RLS Architecture (C1)

All tables in schema `public` have Row Level Security (RLS) enabled.
No public or anonymous access is permitted to multi-tenant or private data. The `anon` role has `REVOKE ALL` across all tables, sequences, and functions.

### A. Dedicated Public Branding View vs Direct Table Grants
- **Decision:** A dedicated Postgres view `public.public_hotel_branding` was created (`supabase/migrations/20261101020000_public_branding_view.sql`).
- **Rationale:** Base tables `hotels`, `hotel_settings`, and `hotel_admins` contain sensitive operational and administrative data (`admin_email`, `mobile`, `created_at`, subscription tier, webhook configs). Granting direct `anon` `SELECT` on `hotels`—even with column-level restrictions—risks accidental exposure through `SELECT *` or foreign key joins. The dedicated view exposes exclusively safe public columns: `id`, `hotel_name`, `city`, `state`, `address`, `logo_url`, `brand_color`, and `is_active`.
- **Policy:** `GRANT SELECT ON public.public_hotel_branding TO anon, authenticated;`

### B. Pinning `search_path` on `SECURITY DEFINER` Functions
- **Decision:** All `SECURITY DEFINER` functions in schema `public` dynamically enforce `SET search_path = public, pg_temp;`.
- **Rationale:** Without an explicit search path, `SECURITY DEFINER` functions execute with the search path of the calling user. A malicious or low-privileged caller could create objects in schemas earlier in the path (or `public`) to hijack execution flow and escalate privileges.

### C. Tables with `hotel_id` (Tenant-Scoped Tables)
All operational tables containing `hotel_id` are restricted to the caller's active hotel tenant:
- **Policy:**
  - `SELECT`: `is_super_admin() OR hotel_id = auth_hotel_id()`
  - `INSERT`: `WITH CHECK (is_super_admin() OR hotel_id = auth_hotel_id())`
  - `UPDATE`: `USING (is_super_admin() OR hotel_id = auth_hotel_id()) WITH CHECK (is_super_admin() OR hotel_id = auth_hotel_id())`
  - `DELETE`: `is_super_admin() OR hotel_id = auth_hotel_id()`
- **Included Tables:**
  - `reservations`, `rooms`, `room_categories`, `rate_plans`, `room_chart_entries`, `daily_reports`, `company_sources`, `other_daily_entries`, `expense_categories`, `expense_entries`, `staff`, `salary_advances`, `salary_settlements`, `electricity_readings`, `utility_bills`, `laundry_entries`, `monthly_bills`, `daily_revenue_entries`, `folio_charges`, `room_shifts`, `room_night_revenue`, `booking_timeline`, `housekeeping_staff`, `housekeeping_timeline`, `housekeeping_assignments`, `housekeeping_stayover_services`, `housekeeping_inspections`, `maintenance_issues`, `housekeeping_audit_log`, `guests`, `guest_preferences`, `guest_notes`, `guest_documents`, `guest_stays`, `corporate_profiles`, `travel_agents`, `loyalty_transactions`, `reservation_groups`, `waitlist`, `room_blocks`, `chart_of_accounts`, `journal_entries`, `journal_lines`, `vouchers`, `vendors`, `opening_balances`, `budgets`, `bank_reconciliation`, `posting_rules`, `finance_exceptions`, `ota_settlements`, `channel_connections`, `channel_rate_mappings`, `channel_ota_reservations`, `channel_inventory_restrictions`, `channel_sync_logs`, `channel_settings`, `laundry_vendors`, `linen_items`, `laundry_dispatches`, `laundry_dispatch_items`, `laundry_receipts`, `pos_menu_categories`, `pos_menu_items`, `pos_areas`, `pos_tables`, `pos_orders`, `pos_kots`, `pos_order_items`, `pos_kot_items`, `pos_bills`, `pos_payments`, `notification_outbox`, `reservation_documents`, `linen_stock_movements`, `laundry_vendor_rates`, `laundry_receiving_items`, `laundry_bills`, `laundry_bill_items`, `laundry_vendor_payments`, `laundry_statement_log`, `payment_transactions`, `booking_holds`, `hotel_extranet_codes`, `whatsapp_webhook_events`, `channel_sync_jobs`, `whatsapp_templates`, `notifications`, `audit_logs`, `invoices`, `day_close_records`, `day_close_audit_log`, `daily_report_snapshots`, `mtd_ytd_store`, `cash_flow_store`, `gst_report_exports`.

### D. Tables Without `hotel_id` Column
1. **`hotels`:**
   - `SELECT`: `is_super_admin() OR id = auth_hotel_id()`
   - `INSERT`: `is_super_admin()`
   - `UPDATE`: `is_super_admin() OR id = auth_hotel_id()`
   - `DELETE`: `is_super_admin()`
2. **`hotel_settings`:**
   - `SELECT`: `is_super_admin() OR id = auth_hotel_id()`
   - `INSERT`: `is_super_admin() OR id = auth_hotel_id()`
   - `UPDATE`: `is_super_admin() OR id = auth_hotel_id()`
   - `DELETE`: `is_super_admin()`
3. **`hotel_admins`:**
   - `SELECT`: `is_super_admin() OR user_id = auth.uid()`
   - `INSERT`: `is_super_admin()`
   - `UPDATE`: `is_super_admin() OR (user_id = auth.uid() AND hotel_id = auth_hotel_id())`
   - `DELETE`: `is_super_admin()`
4. **Reference & Lookup Tables (Read-Only for Authenticated Users):**
   - `subscription_plans`, `company_roles`, `hotel_features`: Read-only for `authenticated`; writes restricted to `is_super_admin()`.
5. **Child Tables Linked via Parent ID:**
   - `invoice_items`, `invoice_payments`, `invoice_credit_notes`: Scoped via parent `invoices.hotel_id = auth_hotel_id() OR is_super_admin()`.
   - `support_ticket_messages`: Scoped via parent `support_tickets.hotel_id = auth_hotel_id() OR is_super_admin()`.
6. **Enterprise Platform & Super Admin Management Tables:**
   - `company_users`, `crm_leads`, `crm_lead_notes`, `support_tickets`, `system_settings`, `billing_settings`, `subscription_settings`, `subscription_reminders`, `subscription_plan_history`, `subscription_notes`, `subscription_payments`, `impersonation_sessions`, `onboarding_attempts`, `invoice_number_seq`, `receipt_number_seq`, `hotel_invitations`: Restricted strictly to `is_super_admin()`.

### E. Storage Bucket Policies (`hotel-assets`)
- **Bucket:** `hotel-assets`
- **SELECT:** Public (`anon`, `authenticated`) to allow delivery of hotel branding logos and receipts.
- **INSERT / UPDATE / DELETE:** Restricted to `authenticated` users where the top-level path matches the caller's active hotel ID (`split_part(name, '/', 1) = auth_hotel_id()::text`), or `is_super_admin()`.

---

## 2. Staff Roles & Authorization Hierarchy (C2)

### A. Complete Rejection of `user_metadata`
- **Decision:** Client-supplied `user.user_metadata` is completely untrusted for backend authorization across all endpoints.
- **Rationale:** Supabase Auth allows any authenticated user to modify their own `user_metadata` directly via client SDK (`supabase.auth.updateUser({ data: { role: 'super_admin' } })`). Relying on this metadata enables instant privilege escalation.
- **Enforcement:** Role and permissions derive strictly from `hotel_admins.staff_role` and `hotel_admins.permissions` in the database, or authoritative `app_metadata` managed by service-role admin calls.

### B. Fail-Closed Schema Migration Policy
- **Decision:** If the required `staff_role` or `permissions` columns are missing from the remote database, the authentication middleware fails closed with HTTP 503 (`SCHEMA_MIGRATION_PENDING`) rather than falling back to `user_metadata`.
- **Rationale:** Failing open or degrading to unverified client metadata re-opens privilege escalation. Failing closed forces operators to apply migration `20261101010000_staff_roles.sql` before traffic is accepted.
- **Default Role:** If an active record has no assigned role, the default fallback is least-privilege `reception` (not `hotel_admin`).

---

## 3. Secret Requirements & Fail-Closed Enforcement (C3, H2)

- **Decision:** Eliminate all fallback default secrets and empty string fallback patterns (`|| ''`).
- **Rationale:** When an empty string is used as an HMAC key or webhook secret, signatures generated over empty strings or known defaults succeed, allowing forged webhooks or guest tokens.
- **Enforcement:**
  - `RAZORPAY_KEY_SECRET`: Missing secret returns HTTP 503 `SERVICE_UNAVAILABLE`.
  - `RAZORPAY_WEBHOOK_SECRET`: Startup refuses boot if length < 32 characters.
  - `GUEST_CHECKOUT_SECRET`: HMAC token generation throws an explicit error if unconfigured.
  - `INTERNAL_API_SECRET`: Required for server-to-server operations; missing secret rejects all internal requests.
  - `WHATSAPP_APP_SECRET`: Webhook verification strictly requires the secret; missing secret fails closed with HTTP 503.

---

## 4. Rate Limiting & Client IP Derivation (H5)

- **Decision:** Atomic sliding-window rate limiting in Redis with Express `trust proxy = 1`.
- **Rationale:** In distributed serverless environments (Vercel), in-memory rate limiting allows attackers to distribute requests across instances to bypass limits. Atomic Upstash Redis pipelines (`INCR` + `EXPIRE`) provide synchronized limits across instances.
- **IP Spoofing Protection:** Under `trust proxy = 1`, Express parses the rightmost trusted proxy IP from the frontend load balancer. `getClientIp()` strictly consumes `req.ip` and rejects raw `X-Forwarded-For` injection attempts.

---

## 5. Payment Settlement Architecture (M7)

- **Decision:** Authoritative database settlement verification in `/api/verify-payment`.
- **Rationale:** Attackers can tamper with the payment amount or order reference on the client side. The backend must never trust client-supplied payment amounts.

---

## 6. Role-Aware Database RLS & Table Classifications (N2)

Migration `20261102010000_role_aware_policies.sql` establishes database-level role isolation using `auth_staff_role()` and `auth_has_role(VARIADIC text[])`.

### A. Role Hierarchy
- `super_admin`: Full platform access via `is_super_admin()`.
- `hotel_admin`: Full management of own hotel profile, rooms, rates, reservations, folios, finance, staff.
- `manager`: Full operational and financial management of own hotel; cannot edit subscription tier or platform configs.
- `accounts`: Read and write access to financial ledgers, vouchers, journals, folios, invoices; read-only to reservations.
- `reception`: Create/edit reservations, check-in, check-out, room inventory, folios; zero access to financial ledgers or hotel configuration.
- `housekeeping`: Zero access to finance or reservations; write access strictly restricted to own assigned housekeeping tasks (`assigned_to = auth.uid()`).

### B. Table Classification Matrix
| Classification | Tables | Allowed Operations |
| :--- | :--- | :--- |
| **Server-Only (No Client Writes)** | `audit_logs`, `channel_sync_jobs`, `notification_outbox`, `channel_ota_reservations`, `channel_connections`, `channel_rate_mappings`, `channel_inventory_restrictions`, `ota_settlements`, `hotel_extranet_codes`, `billing_settings`, `subscription_*`, `company_users`, `impersonation_sessions`, `hotel_invitations` | **No client mutations.** Mutations executed strictly by backend server via `service_role`. `audit_logs` permits client INSERT for own hotel only; UPDATE/DELETE strictly revoked. |
| **Finance & Accounting (Strict Roles)** | `chart_of_accounts`, `journal_entries`, `journal_lines`, `vouchers`, `vendors`, `expense_entries`, `salary_entries`, `budgets`, `bank_reconciliation` | `hotel_admin`, `manager`, `accounts` only. Prohibited for `reception` and `housekeeping`. |
| **Operational & PMS (Desk Roles)** | `reservations`, `folios`, `folio_charges`, `payments` | Read for all staff. Writes restricted to `hotel_admin`, `manager`, `reception`, `accounts`. Prohibited for `housekeeping`. |
| **Configuration (Admin Roles)** | `rooms`, `room_categories`, `rate_plans`, `public.hotels` | Writes restricted to `hotel_admin`, `manager`. Normal staff cannot change room rates or hotel profile. |
| **Housekeeping** | `housekeeping_tasks` | Reads for all staff. Housekeeping staff can update only their own assigned tasks (`assigned_to = auth.uid()`). |
| **Tenant-Open (Collaborative)** | `room_chart_entries`, `other_daily_entries`, `room_shifts`, `laundry_entries`, `booking_timeline` | All authenticated hotel staff for collaborative daily desk operations. |

---

## 7. Function Grants & Closed-by-Default Architecture (N3)

Migration `20261102020000_function_grants.sql` revokes broad `EXECUTE` privileges on functions in schema `public` from `PUBLIC`, `anon`, and `authenticated`. Default privileges are altered so all future tables and functions remain closed by default.

### A. Allowed Functions for `authenticated` Role
| Function Signature | Purpose / Justification |
| :--- | :--- |
| `auth_hotel_id()` | Evaluates tenant context for RLS policy enforcement. |
| `is_super_admin()` | Evaluates platform administrator privileges for RLS policies. |
| `auth_staff_role()` | Resolves caller's database staff role (`hotel_admin`, `manager`, etc.). |
| `auth_has_role(VARIADIC text[])` | Evaluates role membership for table-level write policies. |
| `is_company_user()` | Checks company-level role membership for internal staff. |
| `company_user_role()` | Resolves company-level role identifier. |
| `get_hotel_record_counts(uuid)` | Itemized record count helper for data management UI; enforces tenant ownership check. |

### B. Revoked Functions (Accessible strictly via `service_role` on backend)
- `get_auth_user_by_email`: Prevents email and UUID enumeration.
- `delete_hotel_permanently`: Prevents unverified tenant deletion.
- `reset_hotel_operational_data`: Prevents accidental or hostile tenant wipes.
- `export_hotel_data`: Enforces backend audit logging prior to data export.
- `change_plan`, `suspend_subscription`, `reactivate_subscription`, `extend_grace_period`, `convert_trial_to_paid`: Subscription mutations restricted strictly to backend service role.
- `update_billing_settings`, `update_subscription_settings`: Financial and platform configuration restricted to backend.
- `register_new_hotel`: Multi-step onboarding managed by backend / Edge Function.
- Trigger functions (`sanitize_auth_user_tokens`, `auto_confirm_user`): Database triggers; direct caller execution revoked.

---

## 8. Storage Bucket Policies & Private Documents (N6)

Migration `20261102040000_storage_bucket_policies.sql` establishes explicit bucket isolation and RLS policies on `storage.objects`:

### A. Bucket Configuration
1. **`hotel-assets` (Public Read):**
   - **Purpose:** Public delivery of hotel branding logos, invoice header graphics, and theme assets.
   - **Privacy:** `public = true`.
   - **Writes:** Restricted strictly to caller's active hotel context (`split_part(name, '/', 1) = auth_hotel_id()::text`) or `is_super_admin()`. Max size 5 MB, allowed MIME types: PNG, JPEG, WEBP.
2. **`hotel-documents` (Private & Confidential):**
   - **Purpose:** Storage of guest registration cards, guest identity documents, reservation confirmation PDFs, daily operational report snapshots, and GST invoice exports.
   - **Privacy:** `public = false`.
   - **Access Control:** Direct public (`anon`) access is strictly forbidden (zero anon policies). Authenticated access requires `is_super_admin()` or the caller's active hotel ID matching the root folder segment (`split_part(name, '/', 1) = auth_hotel_id()::text`).
   - **Delivery:** Delivered to guests strictly via time-limited HMAC signed URLs generated by the backend server.



- **Enforcement:**
  - The settlement amount is fetched directly from the authoritative database reservation record.
  - Razorpay order ID is strictly verified against the reservation record.
  - Webhooks and verify-payment operate idempotently, preventing duplicate ledger credits for the same `razorpay_payment_id`.

---

## 6. Password Policy & Edge Function Security (H3, M5)

- **Decision:** Uniform 12-character minimum password policy with dictionary deny list.
- **Rationale:** NIST SP 800-63B guidelines recommend length over complexity requirements. Common dictionary passwords (e.g. `password123456`, `hotelmantri2026`) are rejected outright.
- **Enforcement:** Enforced in React forms, backend `/api/users` route, and Edge Functions (`setup-super-admin`, `hotel-onboarding`).
- **Edge Function Destructive Guards:** `db-tools` requires `ALLOW_DESTRUCTIVE_DB_TOOLS=true`, super-admin role, and `confirm === "DELETE-ALL-DATA"`, and is blocked unconditionally in production environments.
