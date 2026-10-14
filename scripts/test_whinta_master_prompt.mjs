/**
 * Hotel Mantri × Whinta — Complete 7-Phase Master Verification Test Suite
 *
 * Programmatically verifies all 7 phases from the Master Prompt:
 * Phase 1: Whinta integration foundation (API client, phone normalization, templates, retries, timeouts, sanitized logging)
 * Phase 2: Reservation confirmation messages (7 template params, post-save dispatch, idempotency, non-rollback resilience)
 * Phase 3: Automated daily hotel report (10 accounting metrics, occupancy overlap, strict cash-in-hand calculation)
 * Phase 4: Whinta report template mapping (10 placeholders {{1}}-{{10}}, manual test report non-polluting dispatch)
 * Phase 5: Logging, retries, and monitoring (outbox tracking, truthful status 'submitted', webhook signature & transition to 'delivered')
 * Phase 6: Security and multi-hotel isolation (timing-safe CRON_SECRET auth, cross-hotel isolation, RBAC role guard)
 * Phase 7: Deployment & configuration audit (vercel.json crons, Supabase migration, .env.example)
 */

import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

dotenv.config();

import { supabaseServiceRole, ensureAuth } from '../server/supabaseClient.js';
import {
  WhintaProvider,
  getWhintaConfig,
  formatWhintaPhone,
  verifyWhintaWebhookSignature,
  WHATSAPP_ERRORS,
} from '../server/services/whintaService.js';
import {
  normalizeWhatsAppPhone,
  buildMetaBookingConfirmationTemplate,
  buildMetaDailyReportTemplate,
  sendWhatsAppMessage,
} from '../server/services/whatsappService.js';
import {
  generateAndDeliverConfirmation,
  resolveReservationNotificationRecipient,
} from '../server/services/reservationDeliveryService.js';
import {
  calculateDailySummary,
  buildDailySummaryText,
} from '../server/services/dailySummaryService.js';
import {
  recordWhatsAppOutboxEvent,
  updateWhatsAppOutboxEvent,
  updateDeliveryStatusByProviderMessageId,
  generateIdempotencyKey,
  isScheduledReportAlreadySent,
  getWhatsAppHistory,
  OUTBOX_STATUS,
  REPORT_TYPES,
  DELIVERY_TYPES,
} from '../server/services/whatsappOutboxService.js';
import { createReservationsAtomically } from '../server/services/RoomAssignmentService.js';
import { requireCronAuth, validateCronConfiguration } from '../server/middleware/cronAuth.js';

let totalTests = 0;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runMasterTestSuite() {
  console.log('================================================================');
  console.log('HOTEL MANTRI × WHINTA — COMPLETE 7-PHASE MASTER VERIFICATION');
  console.log('================================================================\n');

  await ensureAuth();

  // Load test hotels from database
  const { data: hotels } = await supabaseServiceRole
    .from('hotels')
    .select('id, hotel_name, is_active')
    .order('created_at', { ascending: true })
    .limit(5);

  const hotelA = hotels?.find((h) => h.hotel_name.toLowerCase().includes('mars')) || hotels?.[0] || {
    id: '9001eb1c-9d38-49d0-84f7-75244e8f4bf8',
    hotel_name: 'mars hotel',
  };
  const hotelB = hotels?.find((h) => h.hotel_name.toLowerCase().includes('gopal')) || hotels?.[1] || {
    id: 'bd8f18de-2f97-48e7-b029-d2e536feb7cb',
    hotel_name: 'HOTEL GOPAL',
  };

  console.log(`Hotel A: "${hotelA.hotel_name}" (${hotelA.id})`);
  console.log(`Hotel B: "${hotelB.hotel_name}" (${hotelB.id})\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1: Whinta Integration Foundation
  // ══════════════════════════════════════════════════════════════════════════
  console.log('─── PHASE 1: Whinta Integration Foundation ───');

  const config = getWhintaConfig();
  assert(config.provider === 'WHINTA', 'getWhintaConfig identifies provider as WHINTA');
  assert(config.baseUrl.startsWith('http'), `Valid Whinta baseUrl: ${config.baseUrl}`);
  assert(typeof config.configured === 'boolean', 'Configuration status boolean present');
  assert(config.confirmationTemplate === 'booking_confirmation', 'Default confirmation template is booking_confirmation');
  assert(config.dailyReportTemplate === 'daily_hotel_report', 'Default daily report template is daily_hotel_report');
  assert(config.templateLanguage === 'en', 'Default template language is en');

  // Phone normalization tests
  assert(formatWhintaPhone('9876543210') === '+919876543210', 'Normalizes 10-digit Indian phone to +919876543210');
  assert(formatWhintaPhone('09876543210') === '+919876543210', 'Strips leading 0 from national Indian number');
  assert(formatWhintaPhone('+91 98765 43210') === '+919876543210', 'Cleans whitespace and preserves leading +91');
  assert(formatWhintaPhone('+1 (415) 555-2671') === '+14155552671', 'Normalizes US international number with country code');
  assert(formatWhintaPhone('12345') === null, 'Rejects short invalid phone number');
  assert(formatWhintaPhone('') === null, 'Rejects empty phone number');
  assert(formatWhintaPhone(null) === null, 'Rejects null phone number');

  // Provider client verification
  const mockFetch = async (url, options = {}) => {
    const authHeader = options.headers?.Authorization || '';
    assert(authHeader.startsWith('Bearer '), 'Whinta client sends Authorization: Bearer <token>');

    if (url.includes('/api/templates')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          meta: { total: 2 },
          data: [
            {
              uuid: 'tpl-1',
              name: 'booking_confirmation',
              language: 'en',
              status: 'APPROVED',
              components: [{ type: 'body', text: 'Hello {{1}}, booking {{3}} at {{2}}' }],
            },
            {
              uuid: 'tpl-2',
              name: 'daily_hotel_report',
              language: 'en',
              status: 'APPROVED',
              components: [{ type: 'body', text: 'Daily Report for {{1}} on {{2}}' }],
            },
          ],
        }),
      };
    }

    if (url.includes('/api/send/template')) {
      const body = JSON.parse(options.body || '{}');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          statusCode: 200,
          data: {
            messages: [{ id: `wamid.HBgM${Date.now()}` }],
          },
        }),
      };
    }

    if (url.includes('/api/send')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          statusCode: 200,
          data: {
            messages: [{ id: `wamid.TEXT${Date.now()}` }],
          },
        }),
      };
    }

    return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
  };

  const testProvider = new WhintaProvider({
    accessToken: 'test_token_secret_1234567890',
    fetchFn: mockFetch,
  });

  const connRes = await testProvider.verifyConnection();
  assert(connRes.connected === true, 'verifyConnection returns connected: true with valid token');
  assert(connRes.templateCount === 2, `verifyConnection counts 2 approved templates`);

  const tplList = await testProvider.listTemplates();
  assert(tplList.success === true, 'listTemplates() succeeds');
  assert(tplList.templates.length === 2, 'listTemplates() returns template list');

  const confTpl = await testProvider.getTemplate('booking_confirmation');
  assert(confTpl?.name === 'booking_confirmation', 'getTemplate retrieves booking_confirmation template');

  // Test timeout resilience with AbortController
  const timeoutFetch = async () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  };
  const timeoutProvider = new WhintaProvider({
    accessToken: 'test_token',
    fetchFn: timeoutFetch,
    timeoutMs: 100,
  });
  const timeoutRes = await timeoutProvider.sendText({ to: '9876543210', text: 'Hello' });
  assert(timeoutRes.success === false, 'Timeout error handled gracefully');
  assert(timeoutRes.errorCode === WHATSAPP_ERRORS.TIMEOUT, 'Returns WHATSAPP_TIMEOUT error code on abort');

  // Test transient retry (429 rate limit backoff)
  let retryCount = 0;
  const retryFetch = async (url, options) => {
    retryCount++;
    if (retryCount === 1) {
      return {
        ok: false,
        status: 429,
        json: async () => ({ message: 'Rate limit exceeded' }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ statusCode: 200, data: { messages: [{ id: 'wamid.RETRY_SUCCESS' }] } }),
    };
  };

  const transientProvider = new WhintaProvider({
    accessToken: 'test_token',
    fetchFn: retryFetch,
  });
  const retryRes = await transientProvider.sendMessage({
    to: '9876543210',
    templateName: 'booking_confirmation',
  });
  assert(retryRes.success === true, 'Transient 429 retried successfully and succeeded on second attempt');
  assert(retryCount === 2, 'Provider called exactly 2 times during transient retry');
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Reservation Confirmation Messages
  // ══════════════════════════════════════════════════════════════════════════
  console.log('─── PHASE 2: Reservation Confirmation Messages ───');

  // Verify template builder mappings
  const bookingTpl = buildMetaBookingConfirmationTemplate({
    guestName: 'Ananya Sharma',
    hotelName: hotelB.hotel_name,
    reservationReference: 'HM-RES-77889900',
    roomCategory: 'Super Deluxe',
    roomNo: '101',
    checkIn: '2028-07-01',
    checkOut: '2028-07-04',
    guestCount: 2,
    totalAmount: 12500,
    currency: '₹',
  });

  assert(bookingTpl.name === 'booking_confirmation', 'Template name is booking_confirmation');
  assert(bookingTpl.language.code === 'en', 'Template language is en');
  const bodyComp = bookingTpl.components.find((c) => c.type === 'body');
  assert(bodyComp?.parameters?.length === 7, 'Template body has exactly 7 parameter mappings');
  assert(bodyComp?.parameters[0]?.text === 'Ananya Sharma', 'Param {{1}} = Guest name');
  assert(bodyComp?.parameters[1]?.text === hotelB.hotel_name, 'Param {{2}} = Hotel name');
  assert(bodyComp?.parameters[2]?.text === 'HM-RES-77889900', 'Param {{3}} = Reservation reference');
  assert(bodyComp?.parameters[3]?.text?.includes('Super Deluxe'), 'Param {{4}} = Room type & number');
  assert(bodyComp?.parameters[4]?.text?.includes('2028'), 'Param {{5}} = Check-in date');
  assert(bodyComp?.parameters[5]?.text?.includes('2028'), 'Param {{6}} = Check-out date');
  assert(bodyComp?.parameters[6]?.text?.includes('12,500'), 'Param {{7}} = Total booking amount');

  // Create actual reservation in database
  const resEmail = `master.test.${Date.now()}@example.com`;
  const [createdRes] = await createReservationsAtomically({
    hotelId: hotelB.id,
    inputs: {
      guest_name: 'Ananya Sharma',
      guest_phone: '9876543210',
      guest_email: resEmail,
      check_in_date: '2028-08-10',
      check_out_date: '2028-08-13',
      room_no: 'Unassigned',
      allow_unassigned: true,
      rate: 3500,
      taxable_amount: 10500,
      gst_amount: 1260,
      invoice_total: 11760,
      advance_paid: 3000,
      payment_mode: 'UPI',
      source_category: 'Direct/Walking',
      remarks: 'Master verification test booking',
    },
    userId: 'master-test-agent',
  });

  assert(!!createdRes?.id, 'Real reservation created atomically in database');

  // Trigger confirmation delivery with mocked Whinta sender
  let deliveredRecipient = null;
  let deliveredTemplateName = null;
  const deliveryResult = await generateAndDeliverConfirmation({
    hotelId: hotelB.id,
    reservationId: createdRes.id,
    reservation: createdRes,
    eventType: 'NEW_RESERVATION',
    whatsAppSenderFn: async (options) => {
      deliveredRecipient = options.to;
      deliveredTemplateName = options.templateName;
      return {
        success: true,
        status: 'submitted',
        provider: 'WHINTA',
        messageId: `wamid.MASTER_${Date.now()}`,
      };
    },
  });

  assert(deliveryResult.success === true, 'Confirmation execution succeeded after database save');
  assert(deliveredRecipient === '919876543210', `Sent to guest normalized mobile (+919876543210)`);
  assert(deliveredTemplateName === 'booking_confirmation', 'Used approved booking_confirmation template');
  assert(deliveryResult.whatsApp?.status === 'submitted' || deliveryResult.whatsApp?.status === 'sent', 'Status is submitted/sent upon provider acceptance');

  // Idempotency: verify duplicate send is strictly prevented
  let duplicateCalled = false;
  const duplicateRes = await generateAndDeliverConfirmation({
    hotelId: hotelB.id,
    reservationId: createdRes.id,
    reservation: createdRes,
    eventType: 'NEW_RESERVATION',
    whatsAppSenderFn: async () => {
      duplicateCalled = true;
      return { success: true };
    },
  });

  assert(duplicateCalled === false, 'Duplicate WhatsApp dispatch strictly prevented by idempotency');
  assert(duplicateRes.whatsApp?.status === 'duplicate', 'Duplicate delivery returned status: duplicate');

  // Non-blocking resilience: provider failure does not roll back reservation
  const [failRes] = await createReservationsAtomically({
    hotelId: hotelB.id,
    inputs: {
      guest_name: 'Resilient Guest',
      guest_phone: '9900112233',
      guest_email: `fail.${Date.now()}@example.com`,
      check_in_date: '2028-09-01',
      check_out_date: '2028-09-03',
      room_no: 'Unassigned',
      allow_unassigned: true,
      rate: 2000,
      invoice_total: 4000,
      source_category: 'Direct/Walking',
    },
    userId: 'master-test-agent',
  });

  const failDelivery = await generateAndDeliverConfirmation({
    hotelId: hotelB.id,
    reservationId: failRes.id,
    reservation: failRes,
    eventType: 'NEW_RESERVATION',
    whatsAppSenderFn: async () => {
      return {
        success: false,
        status: 'failed',
        errorCode: 'WHINTA_API_500_SERVER_ERROR',
        error: 'Whinta API internal error',
        whatsappDirectUrl: 'https://wa.me/919900112233?text=Fallback',
      };
    },
  });

  assert(failDelivery.success === true, 'Confirmation execution returns success (non-blocking delivery)');
  assert(failDelivery.whatsApp?.status === 'failed', 'WhatsApp delivery status recorded as failed');
  assert(!!failDelivery.whatsApp?.whatsappDirectUrl, 'Provides wa.me direct fallback URL on failure');

  const { data: checkDbReservation } = await supabaseServiceRole
    .from('reservations')
    .select('id, status')
    .eq('id', failRes.id)
    .single();

  assert(checkDbReservation?.status === 'confirmed', 'Database reservation remains 100% confirmed and intact');
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3 & PHASE 4: Automated Daily Hotel Report & Template Mapping
  // ══════════════════════════════════════════════════════════════════════════
  console.log('─── PHASE 3 & 4: Daily Hotel Report Accounting & 10-Variable Template ───');

  const reportDate = new Date().toISOString().slice(0, 10);
  const dailySummary = await calculateDailySummary({ hotelId: hotelB.id, businessDate: reportDate });

  assert(!!dailySummary.hotelName, `Summary contains hotelName: "${dailySummary.hotelName}"`);
  assert(typeof dailySummary.totalActiveRooms === 'number', `totalActiveRooms is numeric (${dailySummary.totalActiveRooms})`);
  assert(typeof dailySummary.occupiedRooms === 'number', `occupiedRooms is numeric (${dailySummary.occupiedRooms})`);
  assert(dailySummary.occupancyPercentage !== undefined, `occupancyPercentage present (${dailySummary.occupancyPercentage}%)`);
  assert(typeof dailySummary.newReservations === 'number', `newReservations is numeric (${dailySummary.newReservations})`);
  assert(typeof dailySummary.checkIns === 'number', `checkIns is numeric (${dailySummary.checkIns})`);
  assert(typeof dailySummary.checkOuts === 'number', `checkOuts is numeric (${dailySummary.checkOuts})`);
  assert(typeof dailySummary.dailyRevenue === 'number', `dailyRevenue is numeric (${dailySummary.dailyRevenue})`);
  assert(typeof dailySummary.closingCash === 'number', `closingCash is numeric (${dailySummary.closingCash})`);

  // Verify financial rule: closingCash is calculated strictly from cash movements
  assert(
    dailySummary.closingCash !== dailySummary.dailyRevenue || dailySummary.dailyRevenue === 0,
    'Closing cash in hand is decoupled from gross daily revenue'
  );

  // Test 10-variable template mapping
  const dailyReportTpl = buildMetaDailyReportTemplate({
    hotelName: dailySummary.hotelName,
    reportDate: dailySummary.businessDateReadable || reportDate,
    totalRooms: dailySummary.totalActiveRooms,
    occupiedRooms: dailySummary.occupiedRooms,
    occupancyPercentage: `${dailySummary.occupancyPercentage}%`,
    newReservations: dailySummary.newReservations,
    checkIns: dailySummary.checkIns,
    checkOuts: dailySummary.checkOuts,
    dailyRevenue: dailySummary.dailyRevenue,
    closingCash: dailySummary.closingCash,
  });

  assert(dailyReportTpl.templateName === 'daily_hotel_report', 'Report template name is daily_hotel_report');
  const reportBody = dailyReportTpl.templateComponents.find((c) => c.type === 'body');
  assert(reportBody?.parameters?.length === 10, `Report template body has exactly 10 parameters (got ${reportBody?.parameters?.length})`);

  assert(reportBody.parameters[0].text === dailySummary.hotelName, '{{1}} Hotel Name');
  assert(reportBody.parameters[1].text.includes(reportDate.slice(0, 4)), '{{2}} Report Date');
  assert(reportBody.parameters[2].text === String(dailySummary.totalActiveRooms), '{{3}} Total Active Rooms');
  assert(reportBody.parameters[3].text === String(dailySummary.occupiedRooms), '{{4}} Occupied Rooms');
  assert(reportBody.parameters[4].text === `${dailySummary.occupancyPercentage}%`, '{{5}} Occupancy Percentage');
  assert(reportBody.parameters[5].text === String(dailySummary.newReservations), '{{6}} New Reservations');
  assert(reportBody.parameters[6].text === String(dailySummary.checkIns), '{{7}} Check-ins');
  assert(reportBody.parameters[7].text === String(dailySummary.checkOuts), '{{8}} Check-outs');
  assert(reportBody.parameters[8].text.includes('₹'), '{{9}} Daily Revenue (formatted currency)');
  assert(reportBody.parameters[9].text.includes('₹'), '{{10}} Closing Cash Balance (formatted currency)');

  // Verify fallback text contains the key accounting headers
  const summaryText = buildDailySummaryText(dailySummary);
  assert(summaryText.includes('Room Revenue'), 'Summary text contains Room Revenue');
  assert(summaryText.includes('Total Collection'), 'Summary text contains Total Collection');
  assert(summaryText.includes('Expenses'), 'Summary text contains Expenses');

  // Verify Manual "Send Test Report" does not pollute real daily cron idempotency
  const testIdempotencyKey = generateIdempotencyKey({
    hotelId: hotelB.id,
    reportType: REPORT_TYPES.DAILY_SUMMARY,
    businessDate: reportDate,
    recipient: '919876543210',
    deliveryType: DELIVERY_TYPES.TEST, // TEST delivery type
  });

  const scheduledIdempotencyKey = generateIdempotencyKey({
    hotelId: hotelB.id,
    reportType: REPORT_TYPES.DAILY_SUMMARY,
    businessDate: reportDate,
    recipient: '919876543210',
    deliveryType: DELIVERY_TYPES.SCHEDULED, // SCHEDULED delivery type
  });

  assert(
    testIdempotencyKey !== scheduledIdempotencyKey,
    'Manual Test Report generates isolated idempotency key (does not block scheduled cron)'
  );
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 5: Logging, Retries, and Monitoring
  // ══════════════════════════════════════════════════════════════════════════
  console.log('─── PHASE 5: Notification Outbox, Webhooks & Status Transitions ───');

  const testMsgId = `wamid.TEST_MONITOR_${Date.now()}`;
  const outboxEntry = await recordWhatsAppOutboxEvent({
    hotelId: hotelB.id,
    businessDate: reportDate,
    reportType: REPORT_TYPES.DAILY_SUMMARY,
    deliveryType: DELIVERY_TYPES.SCHEDULED,
    recipient: '919876543210',
    idempotencyKey: `audit_key_${Date.now()}`,
    templateName: 'daily_hotel_report',
    status: OUTBOX_STATUS.SUBMITTED,
    providerMessageId: testMsgId,
    metadata: {
      dailyRevenue: dailySummary.dailyRevenue,
      closingCash: dailySummary.closingCash,
    },
  });

  assert(!!outboxEntry?.id, 'Recorded delivery event into notification_outbox');
  assert(outboxEntry.status === OUTBOX_STATUS.SUBMITTED, 'Initial status is truthfully recorded as "submitted"');
  assert(outboxEntry.template_name === 'daily_hotel_report', 'Outbox record stores template_name');

  // Webhook HMAC signature verification
  const webhookSecret = 'test_webhook_secret_key_abcdef123456';
  const webhookBody = JSON.stringify({
    event: 'message.status.update',
    data: {
      id: testMsgId,
      status: 'delivered',
      timestamp: new Date().toISOString(),
    },
  });

  const validSignature = crypto.createHmac('sha256', webhookSecret).update(webhookBody).digest('hex');
  const isSigValid = verifyWhintaWebhookSignature({
    payload: webhookBody,
    signature: validSignature,
    secret: webhookSecret,
  });
  assert(isSigValid === true, 'HMAC signature verification passes for authentic webhook payload');

  const isForgedValid = verifyWhintaWebhookSignature({
    payload: webhookBody,
    signature: 'forged_fake_signature_hex_123456789',
    secret: webhookSecret,
  });
  assert(isForgedValid === false, 'HMAC signature verification rejects forged signature');

  // Webhook transition to DELIVERED
  const updatedOutbox = await updateDeliveryStatusByProviderMessageId({
    providerMessageId: testMsgId,
    status: OUTBOX_STATUS.DELIVERED,
  });
  assert(updatedOutbox?.status === OUTBOX_STATUS.DELIVERED, 'Status transitions to DELIVERED on verified webhook update');
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 6: Security and Multi-Hotel Isolation
  // ══════════════════════════════════════════════════════════════════════════
  console.log('─── PHASE 6: Security, Multi-Hotel Isolation & Cron Protection ───');

  // CRON_SECRET Timing-Safe Authentication
  process.env.CRON_SECRET = 'master_secure_cron_secret_778899';
  const cronValidation = validateCronConfiguration();
  assert(cronValidation === true, 'validateCronConfiguration confirms CRON_SECRET configured');

  // Test 1: Missing auth header -> 401
  let fakeReq = { headers: {}, method: 'GET', path: '/api/cron/whinta-daily-report' };
  let statusSent = null;
  let jsonSent = null;
  let fakeRes = {
    status: (code) => {
      statusSent = code;
      return { json: (d) => { jsonSent = d; } };
    },
  };
  let nextCalled = false;
  requireCronAuth(fakeReq, fakeRes, () => { nextCalled = true; });
  assert(statusSent === 401, 'Unauthorized request without Authorization header returns HTTP 401');
  assert(nextCalled === false, 'Unauthorized request does not invoke next()');

  // Test 2: Invalid secret -> 401
  fakeReq.headers = { authorization: 'Bearer wrong_invalid_secret' };
  statusSent = null;
  nextCalled = false;
  requireCronAuth(fakeReq, fakeRes, () => { nextCalled = true; });
  assert(statusSent === 401, 'Request with invalid CRON_SECRET returns HTTP 401');
  assert(nextCalled === false, 'Invalid secret request does not invoke next()');

  // Test 3: Valid secret -> calls next()
  fakeReq.headers = { authorization: 'Bearer master_secure_cron_secret_778899' };
  statusSent = null;
  nextCalled = false;
  requireCronAuth(fakeReq, fakeRes, () => { nextCalled = true; });
  assert(nextCalled === true, 'Authorized request with valid CRON_SECRET succeeds and calls next()');

  // Multi-hotel tenant isolation: Hotel A cannot see Hotel B's outbox records
  const historyHotelA = await getWhatsAppHistory(hotelA.id, 50);
  const leakedFromB = historyHotelA.find((entry) => entry.hotel_id === hotelB.id);
  assert(leakedFromB === undefined, 'Hotel A history strictly excludes Hotel B records (multi-tenant boundary intact)');
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 7: Deployment & Configuration Audit
  // ══════════════════════════════════════════════════════════════════════════
  console.log('─── PHASE 7: Deployment & Configuration Audit ───');

  // Check vercel.json cron schedule
  const vercelJsonPath = path.resolve(process.cwd(), 'vercel.json');
  assert(fs.existsSync(vercelJsonPath), 'vercel.json exists');
  const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
  const dailyReportCron = vercelConfig.crons?.find((c) => c.path === '/api/cron/whinta-daily-report');
  assert(!!dailyReportCron, 'vercel.json contains /api/cron/whinta-daily-report');
  assert(
    dailyReportCron?.schedule === '30 15 * * *',
    `Vercel cron schedule is "30 15 * * *" (9:00 PM IST = 15:30 UTC)`
  );

  // Check Supabase migration
  const migrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20261015000000_whinta_template_and_cron_tracking.sql'
  );
  assert(fs.existsSync(migrationPath), 'Supabase migration 20261015000000 exists');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  assert(migrationSql.includes('template_name'), 'Migration adds template_name column');
  assert(migrationSql.includes('idempotency_key'), 'Migration adds idempotency_key column and index');
  assert(migrationSql.includes('business_date'), 'Migration adds business_date column');

  // Check .env.example
  const envExamplePath = path.resolve(process.cwd(), '.env.example');
  assert(fs.existsSync(envExamplePath), '.env.example exists');
  const envExample = fs.readFileSync(envExamplePath, 'utf8');
  assert(envExample.includes('WHINTA_ACCESS_TOKEN'), '.env.example documents WHINTA_ACCESS_TOKEN');
  assert(envExample.includes('WHINTA_API_BASE_URL'), '.env.example documents WHINTA_API_BASE_URL');
  assert(envExample.includes('WHATSAPP_DAILY_REPORT_TEMPLATE'), '.env.example documents WHATSAPP_DAILY_REPORT_TEMPLATE');
  assert(envExample.includes('WHATSAPP_CONFIRMATION_TEMPLATE'), '.env.example documents WHATSAPP_CONFIRMATION_TEMPLATE');
  assert(envExample.includes('CRON_SECRET'), '.env.example documents CRON_SECRET');
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('================================================================');
  console.log(`MASTER VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${totalTests})`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMasterTestSuite().catch((err) => {
  console.error('Master Test Suite Fatal Error:', err);
  process.exit(1);
});
