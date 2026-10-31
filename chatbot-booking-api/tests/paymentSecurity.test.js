import test from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import {
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
  verifyAndSettlePayment,
  setRazorpayClientForTesting,
} from '../src/services/paymentService.js';
import { setConfiguredHotelForTesting } from '../src/services/hotelConfigService.js';
// Ensure test environment has valid test webhook secret (>= 32 chars)
process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret_min_32_chars_12345';
import { config, resetConfigForTesting } from '../src/config/environment.js';

test('PaymentSecurity: Razorpay Checkout Signature Verification', async (t) => {
  const orderId = 'order_test_12345';
  const paymentId = 'pay_test_67890';
  const keySecret = config().razorpay.keySecret || 'test_secret_key_12345';

  const body = `${orderId}|${paymentId}`;
  const validSignature = crypto.createHmac('sha256', keySecret).update(body).digest('hex');

  await t.test('verifies genuine checkout signature successfully', () => {
    const res = verifyRazorpayCheckoutSignature({
      orderId,
      paymentId,
      signature: validSignature,
    });
    assert.strictEqual(res.valid, true);
  });

  await t.test('rejects forged / altered checkout signature', () => {
    const forgedSignature = '0000000000000000000000000000000000000000000000000000000000000000';
    const res = verifyRazorpayCheckoutSignature({
      orderId,
      paymentId,
      signature: forgedSignature,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'SIGNATURE_MISMATCH');
  });

  await t.test('rejects mismatched orderId with genuine signature for another order', () => {
    const res = verifyRazorpayCheckoutSignature({
      orderId: 'order_DIFFERENT',
      paymentId,
      signature: validSignature,
    });
    assert.strictEqual(res.valid, false);
  });
});

test('PaymentSecurity: Razorpay Webhook Raw-Body HMAC Signature Verification', async (t) => {
  const webhookSecret = config().razorpay.webhookSecret || 'test_webhook_secret_999';
  const payloadObject = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_hook_111',
          amount: 300000,
          currency: 'INR',
          status: 'captured',
          order_id: 'order_hook_222',
        },
      },
    },
  };

  const rawBuffer = Buffer.from(JSON.stringify(payloadObject), 'utf8');
  const validWebhookSig = crypto.createHmac('sha256', webhookSecret).update(rawBuffer).digest('hex');

  await t.test('verifies genuine raw-body webhook signature', () => {
    const isValid = verifyRazorpayWebhookSignature({
      rawBody: rawBuffer,
      signature: validWebhookSig,
    });
    assert.strictEqual(isValid, true);
  });

  await t.test('rejects webhook if body was altered after signing (e.g. modified amount)', () => {
    const tamperedPayload = { ...payloadObject };
    tamperedPayload.payload.payment.entity.amount = 100; // Lower amount
    const tamperedBuffer = Buffer.from(JSON.stringify(tamperedPayload), 'utf8');

    const isValid = verifyRazorpayWebhookSignature({
      rawBody: tamperedBuffer,
      signature: validWebhookSig,
    });
    assert.strictEqual(isValid, false);
  });

  await t.test('rejects webhook with missing raw buffer or signature', () => {
    assert.strictEqual(verifyRazorpayWebhookSignature({ rawBody: null, signature: validWebhookSig }), false);
    assert.strictEqual(verifyRazorpayWebhookSignature({ rawBody: rawBuffer, signature: '' }), false);
  });

  await t.test('rejects webhook with 503 error when webhook secret is not configured', () => {
    const savedSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    try {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
      resetConfigForTesting();
      assert.throws(
        () => verifyRazorpayWebhookSignature({ rawBody: rawBuffer, signature: validWebhookSig }),
        (err) => {
          assert.strictEqual(err.statusCode, 503);
          assert.strictEqual(err.code, 'WEBHOOK_SECRET_NOT_CONFIGURED');
          return true;
        }
      );
    } finally {
      process.env.RAZORPAY_WEBHOOK_SECRET = savedSecret;
      resetConfigForTesting();
    }
  });
});

test('PaymentSecurity: Provider Lifecycle Status Verification', async (t) => {
  const hotelId = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb';
  setConfiguredHotelForTesting({ id: hotelId, hotel_name: 'Hotel Gopal', is_active: true });

  const orderId = 'order_lifecycle_test';
  const paymentId = 'pay_lifecycle_test';
  const keySecret = config().razorpay.keySecret || 'test_secret_key';
  const sig = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');

  await t.test('rejects payment with status "authorized" (not yet captured by bank)', async () => {
    setRazorpayClientForTesting({
      payments: {
        fetch: async () => ({
          id: paymentId,
          order_id: orderId,
          amount: 300000,
          currency: 'INR',
          status: 'authorized', // Not captured
        }),
      },
    });

    await assert.rejects(
      async () => {
        await verifyAndSettlePayment({
          bookingReference: 'HM-BKG-TEST',
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: sig,
        });
      },
      {
        code: 'PAYMENT_NOT_CAPTURED',
      }
    );
  });

  await t.test('rejects payment with status "failed"', async () => {
    setRazorpayClientForTesting({
      payments: {
        fetch: async () => ({
          id: paymentId,
          order_id: orderId,
          amount: 300000,
          currency: 'INR',
          status: 'failed',
        }),
      },
    });

    await assert.rejects(
      async () => {
        await verifyAndSettlePayment({
          bookingReference: 'HM-BKG-TEST',
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: sig,
        });
      },
      {
        code: 'PAYMENT_FAILED',
      }
    );
  });

  await t.test('rejects payment with currency mismatch (e.g. USD)', async () => {
    setRazorpayClientForTesting({
      payments: {
        fetch: async () => ({
          id: paymentId,
          order_id: orderId,
          amount: 300000,
          currency: 'USD',
          status: 'captured',
        }),
      },
    });

    await assert.rejects(
      async () => {
        await verifyAndSettlePayment({
          bookingReference: 'HM-BKG-TEST',
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: sig,
        });
      },
      {
        code: 'CURRENCY_MISMATCH',
      }
    );
  });
});
