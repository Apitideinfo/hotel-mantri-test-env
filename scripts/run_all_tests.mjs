/**
 * HOTEL MANTRI — Master Automated Regression Test Runner
 *
 * Sequentially executes core maintained test suites:
 * 1. Redis Caching, Distributed Locks & Sync Queue Suite
 * 2. Channel Manager RBAC & Tenant Isolation Suite
 * 3. Channel Inventory Exact Matching & Capacity Suite
 * 4. Housekeeping Board RBAC & Access Guard Suite
 * 5. Meta WhatsApp Cloud API Webhook & Signature Suite
 * 6. Whinta WhatsApp Outbox & Delivery State Machine Suite
 * 7. Accounting & Financial Reconciliation Suite
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SUITES = [
  {
    name: 'Redis Integration & Durable Sync Queue',
    file: 'scripts/test_redis_and_sync_queue_suite.mjs',
  },
  {
    name: 'Channel Manager RBAC & Super Admin Security',
    file: 'scripts/test_channel_manager_rbac_suite.mjs',
  },
  {
    name: 'Channel Inventory Exact Matching & Capacity',
    file: 'scripts/test_channel_inventory_exact_matching.mjs',
  },
  {
    name: 'Housekeeping Security & Access Guards',
    file: 'scripts/test-housekeeping-security-suite.mjs',
  },
  {
    name: 'Meta WhatsApp Webhook & Signature Verification',
    file: 'scripts/test_meta_whatsapp_webhook_suite.mjs',
  },
  {
    name: 'Whinta Integration & Outbox State Machine',
    file: 'scripts/test_whinta_integration.mjs',
  },
  {
    name: 'Accounting & Financial Reconciliation',
    file: 'scripts/test_accounting_reconciliation.mjs',
  },
];

async function runCommand(scriptPath) {
  return new Promise((resolve) => {
    const fullPath = path.resolve(ROOT_DIR, scriptPath);
    const child = spawn(process.execPath, [fullPath], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: { ...process.env },
    });

    child.on('close', (code) => {
      resolve(code === 0);
    });

    child.on('error', (err) => {
      console.error(`Failed to launch ${scriptPath}:`, err.message);
      resolve(false);
    });
  });
}

async function main() {
  console.log('\n========================================================================');
  console.log('HOTEL MANTRI — COMPREHENSIVE AUTOMATED REGRESSION RUNNER');
  console.log(`Executing ${SUITES.length} core test suites sequentially`);
  console.log('========================================================================\n');

  const results = [];
  const start = Date.now();

  for (let i = 0; i < SUITES.length; i++) {
    const suite = SUITES[i];
    console.log(`\n>>> [${i + 1}/${SUITES.length}] RUNNING: ${suite.name} (${suite.file})`);
    const suiteStart = Date.now();
    const passed = await runCommand(suite.file);
    const duration = Math.round((Date.now() - suiteStart) / 1000);
    results.push({ name: suite.name, file: suite.file, passed, duration });
    if (!passed) {
      console.error(`>>> ✗ FAILED: ${suite.name} (${duration}s)\n`);
    } else {
      console.log(`>>> ✓ PASSED: ${suite.name} (${duration}s)\n`);
    }
  }

  const totalDuration = Math.round((Date.now() - start) / 1000);
  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;

  console.log('\n========================================================================');
  console.log('TEST RUNNER SUMMARY:');
  console.log('========================================================================');
  for (const r of results) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status} [${r.duration}s] ${r.name}`);
  }
  console.log('------------------------------------------------------------------------');
  console.log(`TOTAL SUITES: ${SUITES.length} | PASSED: ${totalPassed} | FAILED: ${totalFailed} | TOTAL TIME: ${totalDuration}s`);
  console.log('========================================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
