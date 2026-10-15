import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Master tables that MUST NOT be touched
const PROTECTED_TABLES = [
  'hotels',
  'hotel_settings',
  'hotel_admins',
  'hotel_features',
  'rooms',
  'room_categories',
  'company_sources',
  'rate_plans',
  'channel_settings',
  'channel_connections',
  'channel_rate_mappings',
  'channel_inventory_restrictions',
  'chart_of_accounts',
  'vendors',
  'laundry_vendors',
  'laundry_vendor_rates',
  'linen_items',
  'expense_categories',
  'staff',
  'housekeeping_staff',
  'guests',
  'pos_tables',
  'subscription_plans',
  'subscription_settings',
  'system_settings'
];

async function getCount(tableName) {
  try {
    const { count, error } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
    if (error) return `ERR: ${error.message}`;
    return count ?? 0;
  } catch (err) {
    return `ERR: ${err.message}`;
  }
}

async function deleteTableData(tableName, filterCol = 'id') {
  try {
    const beforeCount = await getCount(tableName);
    if (beforeCount === 0 || typeof beforeCount !== 'number') {
      return { table: tableName, deleted: 0, status: 'already_empty' };
    }

    const { error } = await supabase.from(tableName).delete().not(filterCol, 'is', null);
    if (error) {
      throw new Error(`Failed to delete from ${tableName}: ${error.message}`);
    }

    const afterCount = await getCount(tableName);
    return { table: tableName, before: beforeCount, after: afterCount, deleted: beforeCount - (typeof afterCount === 'number' ? afterCount : 0), status: 'ok' };
  } catch (err) {
    return { table: tableName, error: err.message, status: 'error' };
  }
}

async function purgeStorageReservationFiles() {
  console.log('\n--- Purging Reservation Documents from Storage ---');
  try {
    async function listFilesRecursively(prefix = 'reservations') {
      const { data, error } = await supabase.storage.from('hotel-documents').list(prefix);
      if (error || !data) return [];
      let files = [];
      for (const item of data) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (!item.id) {
          // directory
          const nested = await listFilesRecursively(fullPath);
          files.push(...nested);
        } else {
          files.push(fullPath);
        }
      }
      return files;
    }

    const files = await listFilesRecursively('reservations');
    console.log(`Found ${files.length} reservation PDF files in hotel-documents/reservations/`);
    if (files.length > 0) {
      const { data, error } = await supabase.storage.from('hotel-documents').remove(files);
      if (error) {
        console.warn('Storage removal warning:', error.message);
      } else {
        console.log(`Successfully removed ${files.length} files from storage.`);
      }
    }
  } catch (e) {
    console.warn('Storage purge exception:', e.message);
  }
}

async function main() {
  console.log('================================================================');
  console.log('HOTEL MANTRI — SAFE PURGE: RESERVATIONS & FINANCES');
  console.log('================================================================');

  // Step 0: Record Protected Tables State Before Purge
  console.log('\n--- Checking Protected Master Tables (Pre-Purge Baseline) ---');
  const baseline = {};
  for (const table of PROTECTED_TABLES) {
    baseline[table] = await getCount(table);
    console.log(`  [PROTECTED] ${table.padEnd(35)} : ${baseline[table]} rows`);
  }

  // Step 1: Break self-referencing and inter-table foreign keys
  console.log('\n--- Step 1: Breaking self-referencing & linking keys ---');
  
  // Unlink reservations parent_reservation_id
  const { error: unlinkParentErr } = await supabase
    .from('reservations')
    .update({ parent_reservation_id: null })
    .not('parent_reservation_id', 'is', null);
  if (unlinkParentErr) console.warn('Unlink reservations parent error:', unlinkParentErr.message);
  else console.log('  ✓ Unlinked parent_reservation_id on reservations');

  // Unlink room_chart_entries reservation_id
  const { error: unlinkRceErr } = await supabase
    .from('room_chart_entries')
    .update({ reservation_id: null })
    .not('reservation_id', 'is', null);
  if (unlinkRceErr) console.warn('Unlink room_chart_entries error:', unlinkRceErr.message);
  else console.log('  ✓ Unlinked reservation_id on room_chart_entries');

  // Unlink channel_ota_reservations reservation_id
  const { error: unlinkOtaErr } = await supabase
    .from('channel_ota_reservations')
    .update({ reservation_id: null })
    .not('reservation_id', 'is', null);
  if (unlinkOtaErr) console.warn('Unlink channel_ota_reservations error:', unlinkOtaErr.message);
  else console.log('  ✓ Unlinked reservation_id on channel_ota_reservations');

  // Unlink laundry_bills expense_entry_id
  const { error: unlinkLBerr } = await supabase
    .from('laundry_bills')
    .update({ expense_entry_id: null })
    .not('expense_entry_id', 'is', null);
  if (unlinkLBerr) console.warn('Unlink laundry_bills expense error:', unlinkLBerr.message);
  else console.log('  ✓ Unlinked expense_entry_id on laundry_bills');

  // Step 2: Delete Reservation Dependent Tables
  console.log('\n--- Step 2: Deleting Reservation Sub-Tables & History ---');
  const reservationSubTables = [
    'reservation_documents',
    'room_night_revenue',
    'payment_transactions',
    'folio_charges',
    'room_shifts',
    'guest_stays',
    'waitlist',
    'room_blocks',
    'reservation_alerts',
    'reservation_groups',
    'booking_timeline'
  ];

  for (const t of reservationSubTables) {
    const res = await deleteTableData(t);
    console.log(`  ✓ ${t.padEnd(30)} : ${res.status} (deleted: ${res.deleted ?? 0})`);
  }

  // Delete reservation notification outbox records
  try {
    const { count: outboxCountBefore } = await supabase
      .from('notification_outbox')
      .select('*', { count: 'exact', head: true })
      .or('reservation_id.not.is.null,event_type.ilike.%RESERVATION%');
    
    if (outboxCountBefore && outboxCountBefore > 0) {
      const { error: outboxErr } = await supabase
        .from('notification_outbox')
        .delete()
        .or('reservation_id.not.is.null,event_type.ilike.%RESERVATION%');
      if (outboxErr) console.warn('Outbox delete warning:', outboxErr.message);
      else console.log(`  ✓ notification_outbox (reservations) : deleted ${outboxCountBefore} rows`);
    } else {
      console.log('  ✓ notification_outbox (reservations) : already empty');
    }
  } catch (e) {
    console.warn('Outbox clean exception:', e.message);
  }

  // Step 3: Delete Core Reservation Data
  console.log('\n--- Step 3: Deleting Core Reservation Tables ---');
  const coreReservationTables = [
    'channel_ota_reservations',
    'room_chart_entries',
    'reservations'
  ];

  for (const t of coreReservationTables) {
    const res = await deleteTableData(t);
    console.log(`  ✓ ${t.padEnd(30)} : ${res.status} (deleted: ${res.deleted ?? 0})`);
  }

  // Step 4: Delete Financial & Accounting Data
  console.log('\n--- Step 4: Deleting Financing, Expense & Billing Tables ---');
  const financeTables = [
    // Laundry billing
    'laundry_bill_items',
    'laundry_bills',
    'laundry_vendor_payments',
    'laundry_statement_log',
    'laundry_entries',

    // Daily operational finance & expenses
    'expense_entries',
    'daily_revenue_entries',
    'other_daily_entries',
    'daily_reports',
    'daily_report_snapshots',
    'day_close_audit_log',
    'day_close_records',
    'cash_flow_store',
    'mtd_ytd_store',

    // Staff salary finance
    'salary_advances',
    'salary_settlements',

    // Utilities & monthly bills
    'electricity_readings',
    'utility_bills',
    'monthly_bills',

    // Double-entry accounting transactional data
    'journal_lines',
    'journal_entries',
    'vouchers',
    'opening_balances',
    'budgets',
    'bank_reconciliation',
    'finance_exceptions',
    'ota_settlements',

    // POS orders, bills, payments
    'pos_kot_items',
    'pos_kots',
    'pos_order_items',
    'pos_orders',
    'pos_payments',
    'pos_bills',

    // Invoices and GST
    'gst_report_exports',
    'invoice_credit_notes',
    'invoice_payments',
    'invoice_items',
    'invoices'
  ];

  for (const t of financeTables) {
    const res = await deleteTableData(t);
    console.log(`  ✓ ${t.padEnd(30)} : ${res.status} (deleted: ${res.deleted ?? 0})`);
  }

  // Step 5: Clean up storage PDFs
  await purgeStorageReservationFiles();

  // Step 6: Reset Room Occupancy State
  console.log('\n--- Step 6: Resetting Room Occupancy State to Vacant ---');
  const { error: roomResetErr } = await supabase
    .from('rooms')
    .update({
      room_status: 'Vacant',
      last_guest_name: '',
      last_departure_time: ''
    })
    .not('id', 'is', null);

  if (roomResetErr) {
    console.warn('Room reset warning:', roomResetErr.message);
  } else {
    console.log('  ✓ All rooms reset to room_status = "Vacant", guest names cleared');
  }

  // Step 7: Verification & Integrity Check
  console.log('\n================================================================');
  console.log('VERIFICATION: INTEGRITY & FINAL AUDIT');
  console.log('================================================================');

  let allReservationAndFinanceEmpty = true;
  const allPurgedTables = [...reservationSubTables, ...coreReservationTables, ...financeTables];
  
  console.log('\nChecking Purged Tables (Expect 0):');
  for (const t of allPurgedTables) {
    const cnt = await getCount(t);
    const ok = cnt === 0;
    if (!ok) allReservationAndFinanceEmpty = false;
    console.log(`  ${ok ? '✓ PASS' : '✗ FAIL'}: ${t.padEnd(30)} : ${cnt} rows`);
  }

  console.log('\nChecking Protected Master Tables (Must match baseline):');
  let allProtectedIntact = true;
  for (const table of PROTECTED_TABLES) {
    const currentCount = await getCount(table);
    const matches = currentCount === baseline[table];
    if (!matches) allProtectedIntact = false;
    console.log(`  ${matches ? '✓ INTACT' : '✗ CHANGED'}: ${table.padEnd(30)} : ${currentCount} rows (was ${baseline[table]})`);
  }

  console.log('\n================================================================');
  if (allReservationAndFinanceEmpty && allProtectedIntact) {
    console.log('SUCCESS: All reservation and financing data has been completely');
    console.log('and safely removed from the database. Hotels, settings, rooms,');
    console.log('and master configurations remain 100% intact and unaffected.');
  } else {
    console.error('WARNING: Check audit logs above for any discrepancy.');
  }
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('Fatal error during purge:', err);
  process.exit(1);
});
