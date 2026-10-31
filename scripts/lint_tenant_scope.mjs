/**
 * HOTEL MANTRI — Tenant Scope Query Linter (L5)
 * 
 * Statically analyzes backend code to enforce tenant isolation:
 * Flags any `supabaseServiceRole.from('<tenant table>')` call that does
 * not include a `hotel_id` filter or binding within the query chain.
 * 
 * Reviewed exceptions (e.g. cron processors, cross-tenant aggregators,
 * or ID lookups verified upstream) are tracked in `scripts/tenant_scope_allowlist.json`.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Authoritative list of tenant tables requiring hotel_id scoping (from SECURITY_DECISIONS.md)
const TENANT_TABLES = new Set([
  'reservations', 'rooms', 'room_categories', 'rate_plans', 'room_chart_entries', 'daily_reports',
  'company_sources', 'other_daily_entries', 'expense_categories', 'expense_entries', 'staff',
  'salary_advances', 'salary_settlements', 'electricity_readings', 'utility_bills', 'laundry_entries',
  'monthly_bills', 'daily_revenue_entries', 'folio_charges', 'room_shifts', 'room_night_revenue',
  'booking_timeline', 'housekeeping_staff', 'housekeeping_timeline', 'housekeeping_assignments',
  'housekeeping_stayover_services', 'housekeeping_inspections', 'maintenance_issues', 'housekeeping_audit_log',
  'guests', 'guest_preferences', 'guest_notes', 'guest_documents', 'guest_stays', 'corporate_profiles',
  'travel_agents', 'loyalty_transactions', 'reservation_groups', 'waitlist', 'room_blocks',
  'chart_of_accounts', 'journal_entries', 'journal_lines', 'vouchers', 'vendors', 'opening_balances',
  'budgets', 'bank_reconciliation', 'posting_rules', 'finance_exceptions', 'ota_settlements',
  'channel_connections', 'channel_rate_mappings', 'channel_ota_reservations', 'channel_inventory_restrictions',
  'channel_sync_logs', 'channel_settings', 'laundry_vendors', 'linen_items', 'laundry_dispatches',
  'laundry_dispatch_items', 'laundry_receipts', 'pos_menu_categories', 'pos_menu_items', 'pos_areas',
  'pos_tables', 'pos_orders', 'pos_kots', 'pos_order_items', 'pos_kot_items', 'pos_bills',
  'pos_payments', 'notification_outbox', 'reservation_documents', 'linen_stock_movements',
  'laundry_vendor_rates', 'laundry_receiving_items', 'laundry_bills', 'laundry_bill_items',
  'laundry_vendor_payments', 'laundry_statement_log', 'payment_transactions', 'booking_holds',
  'hotel_extranet_codes', 'whatsapp_webhook_events', 'channel_sync_jobs', 'whatsapp_templates',
  'notifications', 'audit_logs', 'invoices', 'day_close_records', 'day_close_audit_log',
  'daily_report_snapshots', 'mtd_ytd_store', 'cash_flow_store', 'gst_report_exports'
]);

// Load reviewed exceptions allowlist
const allowlistPath = path.resolve(__dirname, 'tenant_scope_allowlist.json');
let allowlist = [];
if (fs.existsSync(allowlistPath)) {
  try {
    allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
  } catch (err) {
    console.error('Failed to parse tenant scope allowlist:', err.message);
    process.exit(1);
  }
}

const isAllowlisted = (relPath, lineNumber, table) => {
  const normRel = relPath.replace(/\\/g, '/');
  return allowlist.some((entry) => {
    const entryFile = entry.file.replace(/\\/g, '/');
    if (entryFile !== normRel) return false;
    if (entry.table && entry.table !== table) return false;
    if (entry.line && Math.abs(entry.line - lineNumber) > 3) return false;
    return true;
  });
};

const scanFiles = (dir, results = []) => {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
        scanFiles(fullPath, results);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
      results.push(fullPath);
    }
  }
  return results;
};

const runLinter = () => {
  console.log('--- Starting Tenant Scope Static Analysis (L5) ---');
  const targetDirs = [path.resolve(ROOT_DIR, 'server'), path.resolve(ROOT_DIR, 'chatbot-booking-api/src')];
  const allFiles = targetDirs.flatMap((d) => scanFiles(d));

  let totalQueries = 0;
  let scopedQueries = 0;
  let allowlistedQueries = 0;
  const violations = [];

  const fromRegex = /(?:supabaseServiceRole|adminClient|scopedSupabase)\.from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;

  for (const file of allFiles) {
    const relPath = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;
      fromRegex.lastIndex = 0;

      while ((match = fromRegex.exec(line)) !== null) {
        const table = match[1];
        if (!TENANT_TABLES.has(table)) continue;

        totalQueries++;

        // Inspect the query chain (up to 20 lines forward or until semicolon / next statement)
        const chainSlice = lines.slice(i, Math.min(lines.length, i + 20)).join(' ');
        const semicolonIdx = chainSlice.indexOf(';');
        const relevantChain = semicolonIdx !== -1 ? chainSlice.slice(0, semicolonIdx) : chainSlice;

        const hasHotelScope =
          relevantChain.includes('hotel_id') ||
          relevantChain.includes('hotelId') ||
          relevantChain.includes('auth_hotel_id');

        if (hasHotelScope) {
          scopedQueries++;
        } else if (isAllowlisted(relPath, i + 1, table)) {
          allowlistedQueries++;
        } else {
          violations.push({
            file: relPath,
            line: i + 1,
            table,
            snippet: line.trim(),
          });
        }
      }
    }
  }

  console.log(`Audited ${allFiles.length} files:`);
  console.log(`  Total tenant table queries: ${totalQueries}`);
  console.log(`  Explicitly scoped with hotel_id: ${scopedQueries}`);
  console.log(`  Reviewed & allowlisted exceptions: ${allowlistedQueries}`);
  console.log(`  Violations found: ${violations.length}`);

  if (violations.length > 0) {
    console.error('\n[ERROR] Tenant Scope Violations Detected:');
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line} -> Table "${v.table}" accessed without hotel_id scope!`);
      console.error(`    Snippet: ${v.snippet}`);
    }
    console.error('\nEvery tenant query must filter by hotel_id, or be documented in scripts/tenant_scope_allowlist.json.\n');
    process.exit(1);
  }

  console.log('\n[PASS] All tenant table queries are properly scoped or allowlisted.');
};

runLinter();
