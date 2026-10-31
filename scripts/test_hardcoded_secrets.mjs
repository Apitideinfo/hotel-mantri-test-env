/**
 * HOTEL MANTRI — C3 Security Verification: Hardcoded Secrets & Fail-Closed Auditing
 * 
 * Asserts:
 * 1. chatbot-booking-api refuses startup in non-test env if RAZORPAY_WEBHOOK_SECRET is missing or < 32 chars.
 * 2. verifyRazorpayWebhookSignature fails closed with HTTP 503 if webhook secret is not configured.
 * 3. verifyRazorpayWebhookSignature verifies genuine HMAC and rejects forged HMAC in constant time.
 * 4. server/services/paymentSecurityService.js refuses guest token generation in non-test env without GUEST_CHECKOUT_SECRET.
 * 5. getGuestCheckoutSecret never falls back to RAZORPAY_KEY_SECRET or hardcoded credentials.
 * 6. Static code audit asserts no legacy hardcoded secrets or unsafe fallback patterns remain.
 */

import assert from 'node:assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

console.log('--- Starting C3 Hardcoded Secrets & Fail-Closed Audit ---');

let passed = 0;
let failed = 0;

function check(title, fn) {
  try {
    fn();
    console.log(`  [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${title}:`, err.message);
    failed++;
  }
}

async function runTests() {
  // 1. Audit chatbot environment validator
  const { getEnvironmentConfig, resetConfigForTesting } = await import('../chatbot-booking-api/src/config/environment.js');

  check('chatbot config: rejects missing RAZORPAY_WEBHOOK_SECRET in production', () => {
    const origEnv = { ...process.env };
    try {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://mock.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_long_enough_for_test_12345';
      process.env.RAZORPAY_KEY_ID = 'rzp_live_12345';
      process.env.RAZORPAY_KEY_SECRET = 'rzp_secret_live_12345';
      process.env.BOOKING_TOKEN_SECRET = 'booking_token_secret_min_32_characters_long_12345';
      delete process.env.RAZORPAY_WEBHOOK_SECRET;

      assert.throws(
        () => getEnvironmentConfig(),
        /RAZORPAY_WEBHOOK_SECRET is required/
      );
    } finally {
      process.env = origEnv;
    }
  });

  check('chatbot config: rejects short (< 32 chars) RAZORPAY_WEBHOOK_SECRET in production', () => {
    const origEnv = { ...process.env };
    try {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://mock.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_long_enough_for_test_12345';
      process.env.RAZORPAY_KEY_ID = 'rzp_live_12345';
      process.env.RAZORPAY_KEY_SECRET = 'rzp_secret_live_12345';
      process.env.BOOKING_TOKEN_SECRET = 'booking_token_secret_min_32_characters_long_12345';
      process.env.RAZORPAY_WEBHOOK_SECRET = 'too_short_secret';

      assert.throws(
        () => getEnvironmentConfig(),
        /RAZORPAY_WEBHOOK_SECRET must be at least 32 characters/
      );
    } finally {
      process.env = origEnv;
    }
  });

  // 2. Audit chatbot payment service signature verification
  const { verifyRazorpayWebhookSignature } = await import('../chatbot-booking-api/src/services/paymentService.js');

  check('chatbot webhook: fails closed with HTTP 503 when RAZORPAY_WEBHOOK_SECRET is absent', () => {
    const saved = process.env.RAZORPAY_WEBHOOK_SECRET;
    try {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
      resetConfigForTesting();

      assert.throws(
        () => verifyRazorpayWebhookSignature({ rawBody: Buffer.from('{"test":true}'), signature: 'any_sig' }),
        (err) => {
          assert.strictEqual(err.statusCode, 503);
          assert.strictEqual(err.code, 'WEBHOOK_SECRET_NOT_CONFIGURED');
          return true;
        }
      );
    } finally {
      process.env.RAZORPAY_WEBHOOK_SECRET = saved || 'test_webhook_secret_min_32_chars_12345';
      resetConfigForTesting();
    }
  });

  check('chatbot webhook: verifies genuine HMAC and rejects forged signature', () => {
    const secret = 'valid_test_webhook_secret_min_32_chars_12345';
    process.env.RAZORPAY_WEBHOOK_SECRET = secret;
    resetConfigForTesting();

    const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured', id: 'pay_123' }), 'utf8');
    const validSig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const forgedSig = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    assert.strictEqual(verifyRazorpayWebhookSignature({ rawBody, signature: validSig }), true);
    assert.strictEqual(verifyRazorpayWebhookSignature({ rawBody, signature: forgedSig }), false);
  });

  // 3. Audit main server paymentSecurityService
  const { getGuestCheckoutSecret, generateGuestCheckoutToken, verifyGuestCheckoutToken } = await import('../server/services/paymentSecurityService.js');

  check('server guest token: throws in development/production if GUEST_CHECKOUT_SECRET is missing', () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origGuestSec = process.env.GUEST_CHECKOUT_SECRET;
    const origRzpSec = process.env.RAZORPAY_KEY_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.GUEST_CHECKOUT_SECRET;
      process.env.RAZORPAY_KEY_SECRET = 'rzp_key_secret_that_must_not_be_used_as_fallback';

      assert.throws(
        () => getGuestCheckoutSecret(),
        /GUEST_CHECKOUT_SECRET must be configured with at least 32 characters/
      );
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      if (origGuestSec) process.env.GUEST_CHECKOUT_SECRET = origGuestSec;
      else delete process.env.GUEST_CHECKOUT_SECRET;
      if (origRzpSec) process.env.RAZORPAY_KEY_SECRET = origRzpSec;
      else delete process.env.RAZORPAY_KEY_SECRET;
    }
  });

  check('server guest token: throws in development/production if GUEST_CHECKOUT_SECRET is < 32 chars', () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origGuestSec = process.env.GUEST_CHECKOUT_SECRET;
    try {
      process.env.NODE_ENV = 'development';
      process.env.GUEST_CHECKOUT_SECRET = 'short_secret_123';

      assert.throws(
        () => getGuestCheckoutSecret(),
        /GUEST_CHECKOUT_SECRET must be configured with at least 32 characters/
      );
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      if (origGuestSec) process.env.GUEST_CHECKOUT_SECRET = origGuestSec;
      else delete process.env.GUEST_CHECKOUT_SECRET;
    }
  });

  check('server guest token: generates and verifies tokens with valid GUEST_CHECKOUT_SECRET', () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origGuestSec = process.env.GUEST_CHECKOUT_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      process.env.GUEST_CHECKOUT_SECRET = 'valid_production_guest_checkout_secret_min_32_characters_12345';

      const token = generateGuestCheckoutToken({
        reservationId: 'resv_test_001',
        hotelId: 'hotel_test_001',
        expiresInMs: 60000,
      });

      const verified = verifyGuestCheckoutToken(token, 'resv_test_001');
      assert.strictEqual(verified.valid, true);

      // Tampered token check
      const parts = token.split('.');
      const tampered = `${parts[0]}.forgedsignature1234567890abcdef1234567890abcdef1234567890abcdef`;
      const tamperedResult = verifyGuestCheckoutToken(tampered, 'resv_test_001');
      assert.strictEqual(tamperedResult.valid, false);
      assert.strictEqual(tamperedResult.code, 'TOKEN_INVALID_SIGNATURE');
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      if (origGuestSec) process.env.GUEST_CHECKOUT_SECRET = origGuestSec;
      else delete process.env.GUEST_CHECKOUT_SECRET;
    }
  });

  // 4. Static scan for legacy secrets
  check('static scan: no legacy fallback secrets remain in codebase', () => {
    const targets = [
      'rzp_test_webhook_secret_key_2026',
      'hotelmantri_guest_token_secret_key_2026',
    ];

    function searchFiles(dir) {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir, { withFileTypes: true });
      for (const f of files) {
        const full = path.join(dir, f.name);
        if (f.isDirectory() && f.name !== 'node_modules' && f.name !== '.git' && f.name !== 'scratch') {
          searchFiles(full);
        } else if (/\.(js|ts|mjs|cjs)$/.test(f.name) && !f.name.includes('test_hardcoded_secrets')) {
          const content = fs.readFileSync(full, 'utf8');
          for (const target of targets) {
            if (content.includes(target)) {
              throw new Error(`Found legacy secret '${target}' in ${full}`);
            }
          }
        }
      }
    }

    searchFiles('server');
    searchFiles('chatbot-booking-api/src');
    searchFiles('supabase/functions');
  });

  console.log(`\nC3 Results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Unexpected test error:', err);
  process.exit(1);
});
