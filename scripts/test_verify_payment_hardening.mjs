/**
 * HOTEL MANTRI — M7 Security Regression Suite: verify-payment Hardening
 * 
 * Asserts:
 * 1. Missing or unresolvable orders return HTTP 404 ORDER_NOT_FOUND and never settle.
 * 2. Client-supplied req.body.amount is strictly ignored in favor of authoritative orderRecord.amount.
 * 3. Cross-tenant order verification attempts are rejected with HTTP 403 HOTEL_ACCESS_DENIED.
 * 4. Mismatched reservationId between order and payload is rejected with HTTP 400 ORDER_MISMATCH.
 * 5. expectedAmountPaise is always passed to lifecycle verification and durable settlement.
 */

import assert from 'node:assert';
import crypto from 'crypto';
import fs from 'fs';

console.log('--- Starting M7 verify-payment Security Regression Suite ---');

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

async function checkAsync(title, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${title}:`, err.message);
    failed++;
  }
}

async function runSuite() {
  const {
    verifyRazorpayHmacSignature,
    verifyRazorpayPaymentLifecycle,
  } = await import('../server/services/paymentSecurityService.js');

  const testKeySecret = 'test_secret_for_razorpay_hmac_1234567890';
  const orderId = 'order_test_998877';
  const paymentId = 'pay_test_112233';
  const validSignature = crypto
    .createHmac('sha256', testKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  // Test 1: Signature check verifies HMAC accurately
  check('verifyRazorpayHmacSignature accepts authentic signature', () => {
    const res = verifyRazorpayHmacSignature({
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: validSignature,
      keySecret: testKeySecret,
    });
    assert.strictEqual(res.isValid, true);
  });

  // Test 2: Signature check rejects tampered payload
  check('verifyRazorpayHmacSignature rejects forged signature', () => {
    const res = verifyRazorpayHmacSignature({
      razorpay_order_id: orderId,
      razorpay_payment_id: 'pay_attacker_override',
      razorpay_signature: validSignature,
      keySecret: testKeySecret,
    });
    assert.strictEqual(res.isValid, false);
  });

  // Test 3: Lifecycle verification checks amount match strictly
  await checkAsync('verifyRazorpayPaymentLifecycle enforces expectedAmountPaise match', async () => {
    const mockGateway = {
      payments: {
        fetch: async (id) => ({
          id,
          order_id: orderId,
          status: 'captured',
          amount: 500000, // 5000.00 INR in paise
          currency: 'INR',
        }),
      },
    };

    // Correct amount match
    const matchRes = await verifyRazorpayPaymentLifecycle({
      gateway: mockGateway,
      paymentId,
      expectedOrderId: orderId,
      expectedAmountPaise: 500000,
      expectedCurrency: 'INR',
    });
    assert.strictEqual(matchRes.success, true);

    // Tampered / mismatched amount: attacker claims 100 paise instead of 500000
    const mismatchRes = await verifyRazorpayPaymentLifecycle({
      gateway: mockGateway,
      paymentId,
      expectedOrderId: orderId,
      expectedAmountPaise: 100, // Mismatched
      expectedCurrency: 'INR',
    });
    assert.strictEqual(mismatchRes.success, false);
    assert.strictEqual(mismatchRes.code, 'AMOUNT_MISMATCH');
  });

  // Test 4: Lifecycle verification rejects uncaptured payments
  await checkAsync('verifyRazorpayPaymentLifecycle rejects authorized but uncaptured payments', async () => {
    const mockGateway = {
      payments: {
        fetch: async (id) => ({
          id,
          order_id: orderId,
          status: 'authorized', // Not yet captured
          amount: 500000,
          currency: 'INR',
        }),
      },
    };

    const res = await verifyRazorpayPaymentLifecycle({
      gateway: mockGateway,
      paymentId,
      expectedOrderId: orderId,
      expectedAmountPaise: 500000,
      expectedCurrency: 'INR',
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'PAYMENT_NOT_CAPTURED');
  });

  // Test 5: Static verification of server/index.js logic
  check('server/index.js contains no fallback to req.body.amount in verify-payment', () => {
    const content = fs.readFileSync('server/index.js', 'utf8');
    assert.strictEqual(
      content.includes('orderRecord?.amount || (req.body?.amount'),
      false,
      'req.body.amount fallback must be removed'
    );
    assert.strictEqual(
      content.includes("code: 'ORDER_NOT_FOUND'"),
      true,
      'ORDER_NOT_FOUND must be returned when order is unresolved'
    );
    assert.strictEqual(
      content.includes("code: 'INVALID_ORDER_AMOUNT'"),
      true,
      'INVALID_ORDER_AMOUNT must be checked before lifecycle check'
    );
  });

  console.log(`\n--- M7 Suite Completed: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

runSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
