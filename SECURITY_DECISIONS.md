# SECURITY DECISIONS & CLASSIFICATIONS

This document records the security decisions, access controls, role definitions, and table classifications for Hotel Mantri as required by the security remediation plan.

---

## 1. Table Classifications & RLS Architecture (C1)

All tables in schema `public` have Row Level Security (RLS) enabled.
No public or anonymous access is permitted to tenant data. The `anon` role has `REVOKE ALL` across all tables, sequences, and functions.

### A. Intentionally Public Functions for `anon`
- **Decision:** **NONE**. All remote procedure calls and database functions require authentication or service-role privileges. Unauthenticated guest actions (such as chatbot reservations or booking hold checks) are proxied and strictly validated by the backend server via authenticated service-role clients.

### B. Tables with `hotel_id` (Tenant-Scoped Tables)
All operational tables containing `hotel_id` are restricted to the caller's active hotel tenant:
- **Policy:**
  - `SELECT`: `is_super_admin() OR hotel_id = auth_hotel_id()`
  - `INSERT`: `WITH CHECK (is_super_admin() OR hotel_id = auth_hotel_id())`
  - `UPDATE`: `USING (is_super_admin() OR hotel_id = auth_hotel_id()) WITH CHECK (is_super_admin() OR hotel_id = auth_hotel_id())`
  - `DELETE`: `is_super_admin() OR hotel_id = auth_hotel_id()`
- **Included Tables:**
  - `reservations`, `rooms`, `room_categories`, `rate_plans`, `room_chart_entries`, `daily_reports`, `company_sources`, `other_daily_entries`, `expense_categories`, `expense_entries`, `staff`, `salary_advances`, `salary_settlements`, `electricity_readings`, `utility_bills`, `laundry_entries`, `monthly_bills`, `daily_revenue_entries`, `folio_charges`, `room_shifts`, `room_night_revenue`, `booking_timeline`, `housekeeping_staff`, `housekeeping_timeline`, `housekeeping_assignments`, `housekeeping_stayover_services`, `housekeeping_inspections`, `maintenance_issues`, `housekeeping_audit_log`, `guests`, `guest_preferences`, `guest_notes`, `guest_documents`, `guest_stays`, `corporate_profiles`, `travel_agents`, `loyalty_transactions`, `reservation_groups`, `waitlist`, `room_blocks`, `chart_of_accounts`, `journal_entries`, `journal_lines`, `vouchers`, `vendors`, `opening_balances`, `budgets`, `bank_reconciliation`, `posting_rules`, `finance_exceptions`, `ota_settlements`, `channel_connections`, `channel_rate_mappings`, `channel_ota_reservations`, `channel_inventory_restrictions`, `channel_sync_logs`, `channel_settings`, `laundry_vendors`, `linen_items`, `laundry_dispatches`, `laundry_dispatch_items`, `laundry_receipts`, `pos_menu_categories`, `pos_menu_items`, `pos_areas`, `pos_tables`, `pos_orders`, `pos_kots`, `pos_order_items`, `pos_kot_items`, `pos_bills`, `pos_payments`, `notification_outbox`, `reservation_documents`, `linen_stock_movements`, `laundry_vendor_rates`, `laundry_receiving_items`, `laundry_bills`, `laundry_bill_items`, `laundry_vendor_payments`, `laundry_statement_log`, `payment_transactions`, `booking_holds`, `hotel_extranet_codes`, `whatsapp_webhook_events`, `channel_sync_jobs`, `whatsapp_templates`, `notifications`, `audit_logs`, `invoices`, `day_close_records`, `day_close_audit_log`, `daily_report_snapshots`, `mtd_ytd_store`, `cash_flow_store`, `gst_report_exports`.

### C. Tables Without `hotel_id` Column
1. **`hotels`:**
   - `SELECT`: `is_super_admin() OR id = auth_hotel_id()`
   - `INSERT`: `is_super_admin()` (Hotel creation managed through admin onboarding)
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
   - `subscription_plans`: Read-only for `authenticated`; writes restricted to `is_super_admin()`.
   - `company_roles`: Read-only for `authenticated`; writes restricted to `is_super_admin()`.
   - `hotel_features`: Read-only for `authenticated`; writes restricted to `is_super_admin()`.
5. **Child Tables Linked via Parent ID:**
   - `invoice_items`, `invoice_payments`, `invoice_credit_notes`:
     Scoped via parent `invoices.hotel_id = auth_hotel_id() OR is_super_admin()`.
   - `support_ticket_messages`:
     Scoped via parent `support_tickets.hotel_id = auth_hotel_id() OR is_super_admin()`.
6. **Enterprise Platform & Super Admin Management Tables:**
   - `company_users`, `crm_leads`, `crm_lead_notes`, `support_tickets`, `system_settings`, `billing_settings`, `subscription_settings`, `subscription_reminders`, `subscription_plan_history`, `subscription_notes`, `subscription_payments`, `impersonation_sessions`, `onboarding_attempts`, `invoice_number_seq`, `receipt_number_seq`, `hotel_invitations`:
   - Restricted strictly to `is_super_admin()`.

### D. Storage Bucket Policies (`hotel-assets`)
- **Bucket:** `hotel-assets`
- **SELECT:** Public (`anon`, `authenticated`) to allow public delivery of hotel branding logos and receipts.
- **INSERT / UPDATE / DELETE:** Restricted to `authenticated` users where the top-level path matches the caller's active hotel ID (`split_part(name, '/', 1) = auth_hotel_id()::text`), or `is_super_admin()`.

---

## 2. Staff Roles & Authorization Hierarchy (C2)

Staff roles are managed strictly in the database (`hotel_admins.staff_role` and `hotel_admins.permissions`). Client-supplied `user_metadata` is completely untrusted for backend authorization.

- **Allowed Staff Roles (`staff_role`):**
  1. `hotel_admin` — Full hotel control.
  2. `manager` — Operations and front desk management. Cannot create or modify `hotel_admin` roles.
  3. `reception` — Front desk check-ins, folios, room chart.
  4. `accounts` — Accounting, day close, vouchers, ledgers.
  5. `housekeeping` — Housekeeping inspection, linen, laundry dispatches.
- **Role Authority:** Server derives active roles only from `hotel_admins` in Supabase (or `app_metadata` set via service role). Any role claimed in `user_metadata` is ignored.

---

## 3. Secret Requirements & Fail-Closed Enforcement (C3, H2)

All webhook and token secrets must be configured in environment variables and fail closed (HTTP 503) if absent in production:
- `RAZORPAY_WEBHOOK_SECRET`: Required (≥ 32 chars in non-test env).
- `GUEST_CHECKOUT_SECRET`: Required (≥ 32 chars in non-test env).
- `WHINTA_WEBHOOK_SECRET`: Required for Whinta webhook verification (constant-time comparison).
- `META_WHATSAPP_APP_SECRET`: Required for Meta webhook HMAC-SHA256 signature verification.
- `INTERNAL_API_SECRET`: Required for server-to-server inter-service calls.

---

## 4. Hotel Admin & Auth Policy (H1)

- **Removal of Email-Based Admin Fallback:** Matching `hotels.admin_email` directly to grant admin privileges is completely removed. Authorization strictly requires an active record in `hotel_admins`. Existing owners were migrated via `20261101010000_staff_roles.sql`.
- **Mandatory Email Confirmation:** Non-synthetic accounts require `user.email_confirmed_at` to access hotel endpoints.
- **Client-Side Sign-Up Removal:** Client-side `supabase.auth.signUp` is completely removed from the frontend. Owner accounts are created exclusively through server-side admin APIs (`hotel-onboarding` Edge Function).
- **Supabase Dashboard Actions Required:**
  1. Disable public signups: Supabase Dashboard -> Authentication -> Sign In / Sign Up -> disable "Allow new users to sign up".
  2. Enable email confirmation: Supabase Dashboard -> Authentication -> Sign In / Sign Up -> enable "Confirm email".
