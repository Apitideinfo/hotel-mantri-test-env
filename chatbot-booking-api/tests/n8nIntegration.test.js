import test from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import http from 'http';
import { requireN8nAuth, timingSafeEqual } from '../src/middleware/security.js';
import {
  dispatchN8nPaymentConfirmationWebhook,
  createPaymentOrderForBooking,
  setRazorpayClientForTesting,
} from '../src/services/paymentService.js';
import { getBookingByReference } from '../src/services/bookingService.js';
import { setConfiguredHotelForTesting } from '../src/services/hotelConfigService.js';
import { config } from '../src/config/environment.js';
import { supabase } from '../src/db/supabase.js';

test('n8n Integration: Authentication & Webhook Verification', async (t) => {
  const hotelId = 'bd8f18de-2f97-48e7-b029-d2e536feb7cb';
  setConfiguredHotelForTesting({ id: hotelId, hotel_name: 'Hotel Gopal', is_active: true });

  const originalN8nToken = process.env.N8N_API_TOKEN;
  const originalWebhookUrl = process.env.N8N_PAYMENT_WEBHOOK_URL;
  const originalWebhookSecret = process.env.N8N_WEBHOOK_SECRET;

  t.after(() => {
    process.env.N8N_API_TOKEN = originalN8nToken;
    process.env.N8N_PAYMENT_WEBHOOK_URL = originalWebhookUrl;
    process.env.N8N_WEBHOOK_SECRET = originalWebhookSecret;
  });

  await t.test('requireN8nAuth: validates Bearer token and X-API-Key with constant-time equality', () => {
    const testSecret = 'n8n_secret_token_987654321';
    config().n8n.apiToken = testSecret;

    // Helper to simulate express req/res
    const runMiddleware = (headers) => {
      let status = null;
      let json = null;
      let nextCalled = false;
      const req = { headers, requestId: 'test-req-1' };
      const res = {
        status: (s) => {
          status = s;
          return {
            json: (j) => {
              json = j;
            },
          };
        },
      };
      const next = () => {
        nextCalled = true;
      };

      requireN8nAuth(req, res, next);
      return { status, json, nextCalled };
    };

    // 1. Missing auth
    const missingRes = runMiddleware({});
    assert.strictEqual(missingRes.status, 401);
    assert.strictEqual(missingRes.json.error.code, 'BOT_AUTH_REQUIRED');
    assert.strictEqual(missingRes.nextCalled, false);

    // 2. Invalid Bearer token
    const invalidRes = runMiddleware({ authorization: 'Bearer wrong_token' });
    assert.strictEqual(invalidRes.status, 403);
    assert.strictEqual(invalidRes.json.error.code, 'BOT_AUTH_INVALID');
    assert.strictEqual(invalidRes.nextCalled, false);

    // 3. Valid Bearer token
    const validBearerRes = runMiddleware({ authorization: `Bearer ${testSecret}` });
    assert.strictEqual(validBearerRes.nextCalled, true);
    assert.strictEqual(validBearerRes.status, null);

    // 4. Valid X-API-Key header
    const validApiKeyRes = runMiddleware({ 'x-api-key': testSecret });
    assert.strictEqual(validApiKeyRes.nextCalled, true);
    assert.strictEqual(validApiKeyRes.status, null);
  });

  await t.test('createPaymentOrderForBooking: generates mobile payment link for WhatsApp guest delivery', async () => {
    const mockOrderId = 'order_n8n_test_123';
    const mockPaymentUrl = 'https://rzp.io/i/testlink_xyz';

    setRazorpayClientForTesting({
      orders: {
        create: async () => ({
          id: mockOrderId,
          amount: 250000,
          currency: 'INR',
        }),
      },
      paymentLink: {
        create: async () => ({
          id: 'plink_n8n_test_456',
          short_url: mockPaymentUrl,
          url: mockPaymentUrl,
        }),
      },
    });

    // Mock reservation or hold in memory
    const testRef = `HM-TEST-${Date.now().toString(36).toUpperCase()}`;

    // Clean up any test records
    t.after(async () => {
      await supabase.from('booking_holds').delete().eq('booking_reference', testRef);
      await supabase.from('reservations').delete().ilike('internal_note', `%[CHATBOT_REF: ${testRef}]%`);
    });

    // Insert a test reservation in DB
    const { error: insErr } = await supabase.from('reservations').insert({
      hotel_id: hotelId,
      room_no: '201',
      guest_name: 'n8n Test Guest',
      guest_phone: '9876543210',
      guest_email: 'n8n@example.com',
      check_in_date: '2026-12-01',
      check_out_date: '2026-12-03',
      rate: 1250,
      invoice_total: 2500,
      advance_paid: 0,
      internal_note: `[CHATBOT_REF: ${testRef}] [HOLD_EXP: ${new Date(Date.now() + 600000).toISOString()}]`,
      status: 'confirmed',
    });
    assert.strictEqual(insErr, null, 'Test reservation should insert cleanly');

    const paymentOrder = await createPaymentOrderForBooking({
      bookingReference: testRef,
    });

    assert.strictEqual(paymentOrder.orderId, mockOrderId);
    assert.strictEqual(paymentOrder.paymentUrl, mockPaymentUrl);
    assert.strictEqual(paymentOrder.amountPaise, 250000);
    assert.strictEqual(paymentOrder.amountInr, 2500);
  });

  await t.test('dispatchN8nPaymentConfirmationWebhook: sends HMAC-signed payload with Whinta 7-param format', async () => {
    const testSecret = 'n8n_webhook_secret_key_abcdef';
    config().n8n.webhookSecret = testSecret;

    // Create a local test HTTP server to simulate n8n Cloud webhook listener
    let receivedPayload = null;
    let receivedHeaders = null;

    const mockServer = http.createServer((req, res) => {
      receivedHeaders = req.headers;
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        receivedPayload = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, received: true }));
      });
    });

    await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
    const port = mockServer.address().port;
    const testWebhookUrl = `http://127.0.0.1:${port}/webhook/test`;
    config().n8n.paymentWebhookUrl = testWebhookUrl;

    const testRef = 'HM-CONFIRM-TEST-001';
    const testReservation = {
      id: 'resv_test_uuid_123',
      guest_name: 'Ananya Sharma',
      guest_phone: '9876543210',
      guest_email: 'ananya@example.com',
      check_in_date: '2026-12-01',
      check_out_date: '2026-12-03',
      room_category: 'Deluxe Suite',
      room_no: '204',
      invoice_total: 4500,
      advance_paid: 4500,
      nights: 2,
    };

    try {
      const dispatchResult = await dispatchN8nPaymentConfirmationWebhook({
        bookingReference: testRef,
        reservation: testReservation,
        orderId: 'order_n8n_test_123',
        paymentId: 'pay_n8n_test_999',
        amountPaise: 450000,
        metadata: { payment_method: 'upi' },
      });

      assert.strictEqual(dispatchResult.dispatched, true);
      assert.strictEqual(dispatchResult.statusCode, 200);
      assert.ok(dispatchResult.eventId);

      // Verify headers
      assert.ok(receivedHeaders['x-hotelmantri-signature']);
      assert.ok(receivedHeaders['x-event-id']);
      assert.ok(receivedHeaders['x-timestamp']);

      // Verify HMAC signature
      const rawBody = JSON.stringify(receivedPayload);
      const expectedSig = crypto.createHmac('sha256', testSecret).update(rawBody).digest('hex');
      assert.strictEqual(receivedHeaders['x-signature-sha256'], expectedSig);
      assert.strictEqual(receivedHeaders['x-hotelmantri-signature'], `sha256=${expectedSig}`);

      // Verify Whinta 7-parameter mapping
      assert.ok(receivedPayload.whintaTemplate);
      assert.strictEqual(receivedPayload.whintaTemplate.templateName, 'hotel_mantri_reservation_confirmation_');
      assert.strictEqual(receivedPayload.whintaTemplate.recipientPhone, '919876543210');

      const params = receivedPayload.whintaTemplate.bodyParameters;
      assert.strictEqual(params.length, 7);
      assert.strictEqual(params[0], 'Ananya Sharma'); // Guest name
      assert.strictEqual(params[1], testRef); // Booking reference
      assert.strictEqual(params[2], '204'); // Room number
      assert.strictEqual(params[3], '2026-12-01'); // Check-in
      assert.strictEqual(params[4], '2026-12-03'); // Check-out
      assert.strictEqual(params[5], '4,500'); // Formatted INR amount
      assert.strictEqual(params[6], 'https://www.hotelmantri.com'); // Invoice URL

      // Verify Whinta component parameters
      const compParams = receivedPayload.whintaTemplate.components[0].parameters;
      assert.strictEqual(compParams[0].text, 'Ananya Sharma');
      assert.strictEqual(compParams[1].text, testRef);
      assert.strictEqual(compParams[2].text, '204');
      assert.strictEqual(compParams[5].text, '4,500');
    } finally {
      await new Promise((resolve) => mockServer.close(resolve));
    }
  });

  await t.test('dispatchN8nPaymentConfirmationWebhook: handles network errors non-blockingly without throwing', async () => {
    // Point to non-routable address / closed port
    config().n8n.paymentWebhookUrl = 'http://127.0.0.1:1';

    const result = await dispatchN8nPaymentConfirmationWebhook({
      bookingReference: 'HM-FAILSAFE-001',
      reservation: { guest_name: 'Test', invoice_total: 1000 },
      orderId: 'order_1',
      paymentId: 'pay_1',
      amountPaise: 100000,
    });

    assert.strictEqual(result.dispatched, false);
    assert.ok(result.error);
    assert.ok(result.eventId);
  });
});
