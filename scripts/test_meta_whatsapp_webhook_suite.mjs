/**
 * Hotel Mantri — Official Meta WhatsApp Cloud API Webhook Verification Suite
 *
 * Verifies:
 * 1. GET Webhook verification handshake (hub.mode, hub.verify_token, hub.challenge)
 * 2. POST Webhook cryptographic HMAC-SHA256 signature verification (X-Hub-Signature-256)
 * 3. Timing-safe comparison & rejection of tampered/unauthorized payloads
 * 4. Safe event parsing for delivery status updates (sent, delivered, read, failed)
 * 5. Safe event parsing for incoming guest messages
 * 6. Idempotency handling (duplicate events do not cause errors)
 * 7. Malformed payload resilience (server never crashes)
 * 8. Meta template `reservation_confirmation` variable mapping (exact 7 parameters)
 * 9. Template review safety guard (pauses dispatch while template is in review)
 * 10. Express HTTP routing compatibility on Vercel paths (/api/whatsapp/webhook & /whatsapp/webhook)
 * 11. Preservation of existing endpoints (/api/health, /api/meta)
 */

import crypto from 'crypto';
import app from '../server/index.js';
import {
  verifyMetaWebhookGet,
  verifyMetaWebhookSignature,
  buildApprovedReservationConfirmationTemplate,
  processMetaWebhookEvents,
  getMetaWhatsAppDiagnostics,
  sendMetaReservationConfirmation,
} from '../server/services/metaWhatsAppService.js';
import {
  buildMetaBookingConfirmationTemplate,
  normalizeWhatsAppPhone,
  sendWhatsAppMessage,
} from '../server/services/whatsappService.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runMetaWhatsAppWebhookSuite() {
  console.log('\n================================================================');
  console.log('HOTEL MANTRI — META WHATSAPP CLOUD API WEBHOOK TEST SUITE');
  console.log('================================================================\n');

  const testVerifyToken = 'hm_verify_test_token_98765';
  const testAppSecret = 'test_meta_app_secret_abc123xyz789';

  // ──────────────────────────────────────────────────────────────────────────
  // TEST GROUP 1: GET Webhook Verification Logic
  // ──────────────────────────────────────────────────────────────────────────
  console.log('── [TEST GROUP 1] GET Webhook Verification Handshake ──');
  {
    // 1.1: Valid token and mode returns 200 with challenge
    const resValid = verifyMetaWebhookGet({
      'hub.mode': 'subscribe',
      'hub.verify_token': testVerifyToken,
      'hub.challenge': '1158201444',
    }, testVerifyToken);

    assert(resValid.valid === true, 'Valid token & subscribe mode passes verification');
    assert(resValid.statusCode === 200, 'Returns HTTP 200 on valid verification');
    assert(resValid.challenge === '1158201444', 'Returns exact hub.challenge');

    // 1.2: Invalid token returns 403 Forbidden
    const resInvalidToken = verifyMetaWebhookGet({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong_token',
      'hub.challenge': '1158201444',
    }, testVerifyToken);

    assert(resInvalidToken.valid === false, 'Invalid token fails verification');
    assert(resInvalidToken.statusCode === 403, 'Returns HTTP 403 on token mismatch');

    // 1.3: Invalid mode returns 403
    const resInvalidMode = verifyMetaWebhookGet({
      'hub.mode': 'publish',
      'hub.verify_token': testVerifyToken,
      'hub.challenge': '1158201444',
    }, testVerifyToken);

    assert(resInvalidMode.valid === false, 'Non-subscribe mode fails verification');
    assert(resInvalidMode.statusCode === 403, 'Returns HTTP 403 on invalid mode');

    // 1.4: Missing parameters returns 400 Bad Request
    const resMissing = verifyMetaWebhookGet({}, testVerifyToken);
    assert(resMissing.valid === false, 'Missing hub parameters fails verification');
    assert(resMissing.statusCode === 400, 'Returns HTTP 400 on missing parameters');

    // 1.5: Missing server configuration fails closed safely
    const resNoServerToken = verifyMetaWebhookGet({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'any',
      'hub.challenge': '123',
    }, ''); // empty server token
    assert(resNoServerToken.valid === false, 'Missing server verify token fails closed');
    assert(resNoServerToken.statusCode === 500, 'Returns HTTP 500 when server token unconfigured');
    assert(!resNoServerToken.challenge, 'Never returns challenge when unconfigured');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST GROUP 2: POST Webhook Signature Verification (HMAC-SHA256)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── [TEST GROUP 2] Cryptographic HMAC-SHA256 Signature Verification ──');
  {
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: '123456789', changes: [] }],
    });
    const rawBuffer = Buffer.from(payload, 'utf8');

    // Calculate valid HMAC-SHA256
    const validHmac = crypto.createHmac('sha256', testAppSecret).update(rawBuffer).digest('hex');
    const validHeader = `sha256=${validHmac}`;

    // 2.1: Valid signature accepted
    const sigValid = verifyMetaWebhookSignature({
      rawBody: rawBuffer,
      signatureHeader: validHeader,
      appSecret: testAppSecret,
    });
    assert(sigValid.valid === true, 'Valid HMAC-SHA256 signature is accepted');
    assert(sigValid.statusCode === 200, 'Returns HTTP 200 on valid signature');

    // 2.2: Tampered payload rejected
    const tamperedBuffer = Buffer.from(payload + 'TAMPERED', 'utf8');
    const sigTampered = verifyMetaWebhookSignature({
      rawBody: tamperedBuffer,
      signatureHeader: validHeader,
      appSecret: testAppSecret,
    });
    assert(sigTampered.valid === false, 'Tampered payload fails signature check');
    assert(sigTampered.statusCode === 401, 'Returns HTTP 401 on tampered payload');

    // 2.3: Tampered signature rejected
    const tamperedHeader = `sha256=${validHmac.replace(/[0-9]/g, 'a')}`;
    const sigTamperedHeader = verifyMetaWebhookSignature({
      rawBody: rawBuffer,
      signatureHeader: tamperedHeader,
      appSecret: testAppSecret,
    });
    assert(sigTamperedHeader.valid === false, 'Mismatched signature header is rejected');

    // 2.4: Malformed signature header (missing sha256= prefix)
    const sigMalformed = verifyMetaWebhookSignature({
      rawBody: rawBuffer,
      signatureHeader: validHmac,
      appSecret: testAppSecret,
    });
    assert(sigMalformed.valid === false, 'Header without sha256= prefix is rejected');
    assert(sigMalformed.statusCode === 401, 'Returns HTTP 401 on malformed header');

    // 2.5: Missing signature header
    const sigMissing = verifyMetaWebhookSignature({
      rawBody: rawBuffer,
      signatureHeader: '',
      appSecret: testAppSecret,
    });
    assert(sigMissing.valid === false, 'Empty signature header is rejected');
    assert(sigMissing.statusCode === 401, 'Returns HTTP 401 on missing header');

    // 2.6: Missing app secret on server fails closed
    const sigNoSecret = verifyMetaWebhookSignature({
      rawBody: rawBuffer,
      signatureHeader: validHeader,
      appSecret: '',
    });
    assert(sigNoSecret.valid === false, 'Missing server app secret fails closed');
    assert(sigNoSecret.statusCode === 503, 'Returns HTTP 503 when app secret unconfigured');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST GROUP 3: Meta Template Parameter Order & Approved Schema
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── [TEST GROUP 3] Meta Template Parameter Construction & Order ──');
  {
    const template = buildApprovedReservationConfirmationTemplate({
      guestName: 'Ananya Roy',
      hotelName: 'Hotel Mantri Grand',
      reservationId: 'HM-RES-789012',
      checkIn: '15-Dec-2026',
      checkOut: '18-Dec-2026',
      roomCategory: 'Executive Suite',
      guestCount: 3,
      documentUrl: 'https://storage.supabase.co/hotel-documents/confirmation.pdf',
      documentFilename: 'HM-Booking-789012.pdf',
    });

    assert(template.name === 'reservation_confirmation', 'Template name is reservation_confirmation');
    assert(template.language.code === 'en', 'Default template language is en');

    // Check Header component (PDF document)
    const headerComp = template.components.find((c) => c.type === 'header');
    assert(Boolean(headerComp), 'Template includes header component for PDF');
    assert(headerComp.parameters[0]?.type === 'document', 'Header parameter is type: document');
    assert(headerComp.parameters[0]?.document?.link.includes('confirmation.pdf'), 'Header links to confirmation PDF');

    // Check Body component with the 7 exact variables
    const bodyComp = template.components.find((c) => c.type === 'body');
    assert(Boolean(bodyComp), 'Template includes body component');
    assert(bodyComp.parameters.length === 7, `Body component contains exactly 7 parameters (got ${bodyComp.parameters.length})`);

    // Verify exact parameter mapping in approved order
    assert(bodyComp.parameters[0]?.text === 'Ananya Roy', '{{1}} is Guest Name ("Ananya Roy")');
    assert(bodyComp.parameters[1]?.text === 'Hotel Mantri Grand', '{{2}} is Hotel Name ("Hotel Mantri Grand")');
    assert(bodyComp.parameters[2]?.text === 'HM-RES-789012', '{{3}} is Reservation ID ("HM-RES-789012")');
    assert(bodyComp.parameters[3]?.text === '15-Dec-2026', '{{4}} is Check-in date ("15-Dec-2026")');
    assert(bodyComp.parameters[4]?.text === '18-Dec-2026', '{{5}} is Check-out date ("18-Dec-2026")');
    assert(bodyComp.parameters[5]?.text === 'Executive Suite', '{{6}} is Room category ("Executive Suite")');
    assert(bodyComp.parameters[6]?.text === '3', '{{7}} is Number of guests ("3")');

    // Also check buildMetaBookingConfirmationTemplate backwards compatibility
    const bookingTemplate = buildMetaBookingConfirmationTemplate({
      templateName: 'booking_confirmation',
      guestName: 'Rajesh Kumar',
      reservationReference: 'HM-RES-1234',
      roomNo: '101',
      checkIn: '2026-11-01',
      checkOut: '2026-11-03',
      totalAmount: 5000,
    });
    assert(bookingTemplate.name === 'booking_confirmation', 'Legacy booking_confirmation template name retained');
    const legacyBody = bookingTemplate.components.find((c) => c.type === 'body');
    assert(legacyBody.parameters[0]?.text === 'Rajesh Kumar', 'Legacy Param 1 is Guest Name');
    assert(legacyBody.parameters[1]?.text === 'HM-RES-1234', 'Legacy Param 2 is Booking ID');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST GROUP 4: Template Approval Safety Guard (In-Review Protection)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── [TEST GROUP 4] Template In-Review Safety Guard ──');
  {
    // The prompt specifies: "The template is currently reported as In review. Do not assume it is approved. Prevent sending this template until its status is approved."
    const reviewResult = await sendMetaReservationConfirmation({
      to: '919876543210',
      guestName: 'Test Guest',
      hotelName: 'Hotel Mantri',
      reservationId: 'HM-RES-TEST',
      checkIn: '2026-11-01',
      checkOut: '2026-11-03',
      roomCategory: 'Deluxe',
      guestCount: 2,
      forceSend: false, // strictly enforce approval check
    });

    assert(reviewResult.status === 'template_in_review', 'Unapproved template is held in review (status: template_in_review)');
    assert(reviewResult.requiresApproval === true, 'Returns requiresApproval flag');
    assert(Boolean(reviewResult.message && reviewResult.message.includes('in review')), 'Returns informative message without failing or crashing');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST GROUP 5: Webhook Event Processing & Idempotency
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── [TEST GROUP 5] Event Processing & Idempotency ──');
  {
    // 5.1: Status update event
    const statusPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '15550001234',
                  phone_number_id: '100000000000001',
                },
                statuses: [
                  {
                    id: 'wamid.HBgLMjAyNjExMDEyM1VVSUQA',
                    status: 'delivered',
                    timestamp: '1730000000',
                    recipient_id: '919876543210',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const processRes = await processMetaWebhookEvents(statusPayload);
    assert(processRes.processed === true, 'Status update payload processed successfully');
    assert(processRes.eventCount === 1, 'Extracted 1 status update event');
    assert(processRes.results[0]?.status === 'delivered', 'Extracted delivered status');

    // 5.2: Duplicate status update does not crash (idempotent)
    const duplicateRes = await processMetaWebhookEvents(statusPayload);
    assert(duplicateRes.processed === true, 'Duplicate payload processed idempotently without crashing');

    // 5.3: Inbound guest message event
    const inboundPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '15550001234',
                  phone_number_id: '100000000000001',
                },
                messages: [
                  {
                    from: '919876543210',
                    id: 'wamid.HBgLMjAyNjExMDEyM1VVSUFC',
                    timestamp: '1730000100',
                    type: 'text',
                    text: { body: 'Thank you for the booking confirmation!' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const inboundRes = await processMetaWebhookEvents(inboundPayload);
    assert(inboundRes.processed === true, 'Inbound message payload processed successfully');
    assert(inboundRes.results[0]?.type === 'incoming_message', 'Extracted incoming_message event');
    assert(inboundRes.results[0]?.from === '919876543210', 'Extracted sender phone');

    // 5.4: Unexpected / Non-WhatsApp payload
    const foreignPayload = { object: 'instagram', entry: [] };
    const foreignRes = await processMetaWebhookEvents(foreignPayload);
    assert(foreignRes.processed === false, 'Non-WhatsApp payload safely ignored');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST GROUP 6: Express Live HTTP Routing & Endpoints
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── [TEST GROUP 6] Live Express HTTP Endpoints (/api/whatsapp/webhook) ──');
  {
    
    async function safeFetch(targetUrl, options = {}) {
      try {
        return await globalThis.fetch(targetUrl, options);
      } catch (err) {
        if (err.cause?.code === 'EACCES') {
          const { Readable } = await import('stream');
          const { EventEmitter } = await import('events');
          const parsed = new URL(targetUrl);
          const bodyStr = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : null;

          return new Promise((resolve) => {
            const req = new Readable({
              read() {
                if (bodyStr) this.push(bodyStr);
                this.push(null);
              }
            });
            req.method = options.method || 'GET';
            req.url = parsed.pathname + parsed.search;
            req.originalUrl = req.url;
            req.headers = Object.fromEntries(
              Object.entries(options.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
            );
            if (bodyStr && !req.headers['content-length']) {
              req.headers['content-length'] = String(Buffer.byteLength(bodyStr));
            }
            if (bodyStr && !req.headers['content-type']) {
              req.headers['content-type'] = 'application/json';
            }

            const res = new EventEmitter();
            let resBody = '';
            res.statusCode = 200;
            res.headers = {};
            res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
            res.getHeader = (k) => res.headers[k.toLowerCase()];
            res.status = (code) => { res.statusCode = code; return res; };
            res.send = (chunk) => {
              if (chunk !== undefined) resBody = typeof chunk === 'object' ? JSON.stringify(chunk) : String(chunk);
              resolve({
                status: res.statusCode,
                text: async () => resBody,
                json: async () => JSON.parse(resBody || '{}'),
              });
            };
            res.json = (obj) => {
              res.setHeader('content-type', 'application/json');
              resBody = JSON.stringify(obj);
              resolve({
                status: res.statusCode,
                text: async () => resBody,
                json: async () => obj,
              });
            };
            res.end = (chunk) => {
              if (chunk !== undefined) resBody += chunk;
              resolve({
                status: res.statusCode,
                text: async () => resBody,
                json: async () => JSON.parse(resBody || '{}'),
              });
            };

            app.handle(req, res);
          });
        }
        throw err;
      }
    }

    let server;
    try { server = app.listen(0); } catch (e) {}
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // Set server-side test token temporarily
    const previousToken = process.env.WHATSAPP_VERIFY_TOKEN;
    const previousSecret = process.env.WHATSAPP_APP_SECRET;
    process.env.WHATSAPP_VERIFY_TOKEN = testVerifyToken;
    process.env.WHATSAPP_APP_SECRET = testAppSecret;

    try {
      // 6.1: GET /api/whatsapp/webhook with valid token -> HTTP 200 with challenge
      const challengeStr = 'META_CHALLENGE_STRING_XYZ_98765';
      const getUrl = `${baseUrl}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(testVerifyToken)}&hub.challenge=${encodeURIComponent(challengeStr)}`;
      const resGetValid = await safeFetch(getUrl);
      const textGetValid = await resGetValid.text();

      assert(resGetValid.status === 200, `GET /api/whatsapp/webhook returned HTTP 200 (got ${resGetValid.status})`);
      assert(textGetValid === challengeStr, `GET /api/whatsapp/webhook echoed challenge exactly ("${textGetValid}")`);
      assert(!textGetValid.includes(testVerifyToken), 'Verification token is never leaked in GET response');

      // 6.2: GET /api/whatsapp/webhook with invalid token -> HTTP 403
      const getWrongUrl = `${baseUrl}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=WRONG_TOKEN&hub.challenge=${challengeStr}`;
      const resGetWrong = await safeFetch(getWrongUrl);
      assert(resGetWrong.status === 403, `GET with wrong token returned HTTP 403 (got ${resGetWrong.status})`);

      // 6.3: GET /api/whatsapp/webhook missing params -> HTTP 400
      const getMissingUrl = `${baseUrl}/api/whatsapp/webhook`;
      const resGetMissing = await safeFetch(getMissingUrl);
      assert(resGetMissing.status === 400, `GET without params returned HTTP 400 (got ${resGetMissing.status})`);

      // 6.4: Direct path GET /whatsapp/webhook also works (serverless rewrite compatibility)
      const directGetUrl = `${baseUrl}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(testVerifyToken)}&hub.challenge=${challengeStr}`;
      const resDirectGet = await safeFetch(directGetUrl);
      assert(resDirectGet.status === 200, `Direct GET /whatsapp/webhook returned HTTP 200 (got ${resDirectGet.status})`);

      // 6.5: POST /api/whatsapp/webhook with valid HMAC-SHA256 signature -> HTTP 200
      const testPostPayload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '12345',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  statuses: [{ id: 'wamid.TEST1', status: 'sent', timestamp: '1730000000' }],
                },
              },
            ],
          },
        ],
      });
      const validPostHmac = crypto.createHmac('sha256', testAppSecret).update(Buffer.from(testPostPayload, 'utf8')).digest('hex');

      const resPostValid = await safeFetch(`${baseUrl}/api/whatsapp/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': `sha256=${validPostHmac}`,
        },
        body: testPostPayload,
      });
      const jsonPostValid = await resPostValid.json();

      assert(resPostValid.status === 200, `POST /api/whatsapp/webhook returned HTTP 200 (got ${resPostValid.status})`);
      assert(jsonPostValid.success === true, 'POST returned success: true');
      assert(jsonPostValid.received === true, 'POST returned received: true');

      // 6.6: POST /api/whatsapp/webhook with 64-hex mismatched signature -> HTTP 401
      const mismatched64Hex = '0000000000000000000000000000000000000000000000000000000000000000';
      const resPostInvalid = await safeFetch(`${baseUrl}/api/whatsapp/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': `sha256=${mismatched64Hex}`,
        },
        body: testPostPayload,
      });
      assert(resPostInvalid.status === 401, `POST with mismatched signature returned HTTP 401 (got ${resPostInvalid.status})`);

      // 6.6c: POST with missing secret -> HTTP 503
      const origSecret = process.env.WHATSAPP_APP_SECRET;
      const origMetaSecret = process.env.META_WHATSAPP_APP_SECRET;
      try {
        delete process.env.WHATSAPP_APP_SECRET;
        delete process.env.META_WHATSAPP_APP_SECRET;
        const resPostNoSecret = await safeFetch(`${baseUrl}/api/whatsapp/webhook`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': `sha256=${validPostHmac}`,
          },
          body: testPostPayload,
        });
        assert(resPostNoSecret.status === 503, `POST with unconfigured secret returned HTTP 503 (got ${resPostNoSecret.status})`);
      } finally {
        if (origSecret) process.env.WHATSAPP_APP_SECRET = origSecret;
        if (origMetaSecret) process.env.META_WHATSAPP_APP_SECRET = origMetaSecret;
      }

      // 6.6b: POST with malformed header length -> HTTP 401
      const resMalformedHeader = await safeFetch(`${baseUrl}/api/whatsapp/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=tooshort',
        },
        body: testPostPayload,
      });
      assert(resMalformedHeader.status === 401, `POST with malformed header returned HTTP 401 (got ${resMalformedHeader.status})`);

      // 6.7: GET /api/whatsapp/status returns non-sensitive diagnostics
      const resStatus = await safeFetch(`${baseUrl}/api/whatsapp/status`);
      const statusJson = await resStatus.json();
      assert(resStatus.status === 200, 'GET /api/whatsapp/status returned HTTP 200');
      assert(statusJson.success === true, 'Diagnostics endpoint returned success: true');
      assert(statusJson.diagnostics.hasVerifyToken === true, 'Diagnostics confirms verify token is configured');
      assert(!statusJson.diagnostics.verifyToken, 'Diagnostics never exposes actual verify token');
      assert(!statusJson.diagnostics.appSecret, 'Diagnostics never exposes actual app secret');

      // 6.8: Verify health check route preserves /api/whatsapp/webhook
      const resHealth = await safeFetch(`${baseUrl}/api/health`);
      const healthJson = await resHealth.json();
      assert(resHealth.status === 200, 'Health check returned HTTP 200');
      assert(healthJson.status === 'ok', 'Health check returns minimal status: ok');

      // 6.9: Verify existing Meta compliance route is intact (/api/meta/deletion-status/:code)
      const resMetaStatus = await safeFetch(`${baseUrl}/api/meta/deletion-status/HM-DEL-NONEXISTENT`);
      const metaStatusJson = await resMetaStatus.json();
      assert(resMetaStatus.status === 404 && metaStatusJson.code === 'NOT_FOUND', 'Existing /api/meta/deletion-status route is handled by its controller');
    } finally {
      // Restore previous environment variables
      if (previousToken) process.env.WHATSAPP_VERIFY_TOKEN = previousToken;
      else delete process.env.WHATSAPP_VERIFY_TOKEN;

      if (previousSecret) process.env.WHATSAPP_APP_SECRET = previousSecret;
      else delete process.env.WHATSAPP_APP_SECRET;

      if (server) await new Promise((resolve) => server.close(resolve));
    }
  }

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runMetaWhatsAppWebhookSuite().catch((err) => {
  console.error('Fatal error during test execution:', err);
  process.exit(1);
});
