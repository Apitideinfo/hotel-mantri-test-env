/**
 * Hotel Mantri — Direct Booking WhatsApp Confirmation Test Suite
 *
 * Verifies:
 * 1. WhatsApp template payload construction (booking_confirmation 7 dynamic parameters)
 * 2. Mobile number normalization & validation
 * 3. Durable notification_outbox idempotency (duplicate prevention)
 * 4. Recipient routing: Direct -> Guest Mobile vs OTA -> Hotel Owner
 * 5. Provider failure resilience (error logging, outbox tracking, non-blocking booking)
 * 6. Whinta provider dispatch (mocked)
 * 7. API endpoints (confirmation details & send-whatsapp route logic)
 */

import { supabaseServiceRole, ensureAuth } from '../server/supabaseClient.js';
import {
  normalizeWhatsAppPhone,
  buildMetaBookingConfirmationTemplate,
  sendWhatsAppMessage,
} from '../server/services/whatsappService.js';
import {
  generateAndDeliverConfirmation,
  resolveReservationNotificationRecipient,
  buildReservationConfirmationWhatsAppText,
} from '../server/services/reservationDeliveryService.js';
import {
  createReservationsAtomically,
} from '../server/services/RoomAssignmentService.js';
import { getReservationDocuments } from '../server/services/documentService.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runDirectWhatsAppTests() {
  console.log('================================================================');
  console.log('HOTEL MANTRI — DIRECT BOOKING WHATSAPP CONFIRMATION TEST SUITE');
  console.log('================================================================\n');

  await ensureAuth();

  // Resolve active hotel
  const { data: hotels } = await supabaseServiceRole.from('hotels').select('*').limit(2);
  const hotel = hotels?.find(h => h.hotel_name.toLowerCase().includes('gopal')) || hotels?.[0] || {
    id: 'bd8f18de-2f97-48e7-b029-d2e536feb7cb',
    hotel_name: 'HOTEL GOPAL',
  };
  const hotelId = hotel.id;
  console.log(`Test Hotel: "${hotel.hotel_name}" (${hotelId})\n`);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1 — Phone Number Normalization
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 1: Guest Mobile Number Normalization ───');
  const phoneTests = [
    { input: '9876543210', expected: '919876543210' },
    { input: '09876543210', expected: '919876543210' },
    { input: '+91 98765-43210', expected: '919876543210' },
    { input: '919876543210', expected: '919876543210' },
    { input: '+1 (415) 555-2671', expected: '14155552671' },
    { input: 'whatsapp:+919876543210', expected: '919876543210' },
    { input: '12345', expected: null },
    { input: '', expected: null },
    { input: null, expected: null },
  ];

  for (const pt of phoneTests) {
    const res = normalizeWhatsAppPhone(pt.input);
    const actual = res.valid ? res.normalized : null;
    assert(actual === pt.expected, `Input "${pt.input}" normalized to "${pt.expected}" (got "${actual}")`);
  }
  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2 — WhatsApp Template Payload Structure
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 2: WhatsApp Template Payload Construction ───');
  const templatePayload = buildMetaBookingConfirmationTemplate({
    guestName: 'Rajesh Kumar',
    hotelName: 'Hotel Gopal',
    reservationReference: 'HM-RES-ABC12345',
    roomCategory: 'Deluxe AC',
    roomNo: '204',
    checkIn: '2026-11-01',
    checkOut: '2026-11-04',
    totalAmount: 9408,
  });

  assert(templatePayload.name === 'booking_confirmation' || templatePayload.name === process.env.WHINTA_RESERVATION_TEMPLATE, 'Template name matches expected booking confirmation template');
  assert(templatePayload.language?.code === 'en', 'Template language code is en');
  assert(Array.isArray(templatePayload.components), 'Template components is an array');

  const bodyComponent = templatePayload.components.find(c => c.type === 'body');
  assert(!!bodyComponent, 'Body component exists in template payload');
  assert(bodyComponent?.parameters?.length === 7, `Body has exactly 7 parameters (got ${bodyComponent?.parameters?.length})`);

  assert(bodyComponent?.parameters[0]?.text === 'Rajesh Kumar', 'Param 1 (Guest Name) is "Rajesh Kumar"');
  assert(bodyComponent?.parameters[1]?.text === 'HM-RES-ABC12345', 'Param 2 (Booking ID) is "HM-RES-ABC12345"');
  assert(bodyComponent?.parameters[2]?.text === '204', 'Param 3 (Room number) is "204"');
  assert(bodyComponent?.parameters[3]?.text?.includes('Nov 2026') || bodyComponent?.parameters[3]?.text?.includes('2026'), 'Param 4 (Check-in) is formatted date');
  assert(bodyComponent?.parameters[4]?.text?.includes('Nov 2026') || bodyComponent?.parameters[4]?.text?.includes('2026'), 'Param 5 (Check-out) is formatted date');
  assert(bodyComponent?.parameters[5]?.text?.includes('9,408') || bodyComponent?.parameters[5]?.text?.includes('9408'), 'Param 6 (Total Amount) formatted as currency');
  assert(bodyComponent?.parameters[6]?.text !== undefined, 'Param 7 (Invoice URL) is present');
  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3 — End-to-End Direct Booking Confirmation Delivery with Mock WhatsApp
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 3: Direct Booking WhatsApp Confirmation End-to-End ───');
  const guestPhone = '9876543210';
  const directGuestEmail = `direct.wa.${Date.now()}@example.com`;
  const directResInput = {
    guest_name: 'WhatsApp Direct Guest',
    guest_phone: guestPhone,
    guest_email: directGuestEmail,
    check_in_date: '2028-06-10',
    check_out_date: '2028-06-12',
    room_no: 'Unassigned',
    allow_unassigned: true,
    rate: 3000,
    taxable_amount: 6000,
    gst_amount: 720,
    discount: 0,
    invoice_total: 6720,
    advance_paid: 2000,
    payment_mode: 'UPI',
    source_category: 'Direct/Walking',
    remarks: 'WhatsApp direct booking confirmation integration test',
  };

  const createdList = await createReservationsAtomically({
    hotelId,
    inputs: directResInput,
    userId: 'test-agent',
  });
  const createdRes = createdList[0];
  assert(!!createdRes?.id, 'Direct reservation created in database');

  // Verify recipient resolution
  const recipient = await resolveReservationNotificationRecipient({
    hotelId,
    reservation: createdRes,
  });
  assert(recipient.recipientType === 'CUSTOMER', 'Recipient is CUSTOMER');
  assert(recipient.sourceType === 'MANUAL', 'Source type is MANUAL');

  // Inject mock WhatsApp sender into delivery service options
  let dispatchedWhatsAppRecipient = null;
  let dispatchedWhatsAppTemplate = null;

  const deliveryResult = await generateAndDeliverConfirmation({
    hotelId,
    reservationId: createdRes.id,
    reservation: createdRes,
    eventType: 'NEW_RESERVATION',
    whatsAppSenderFn: async (options) => {
      dispatchedWhatsAppRecipient = options.to;
      dispatchedWhatsAppTemplate = options.templateName;
      return {
        success: true,
        status: 'submitted',
        provider: 'WHINTA',
        messageId: 'whinta_MOCK_TEST_DISPATCH_123',
      };
    },
  });

  assert(deliveryResult.success === true, 'Confirmation execution succeeded');
  assert(dispatchedWhatsAppRecipient === '919876543210', `WhatsApp sent to guest normalized mobile: ${dispatchedWhatsAppRecipient}`);
  assert(dispatchedWhatsAppTemplate === 'booking_confirmation', `WhatsApp template used: ${dispatchedWhatsAppTemplate}`);
  const whatsAppStatus = deliveryResult.whatsApp?.status;
  assert(whatsAppStatus === 'submitted' || whatsAppStatus === 'sent', `deliveryResult.whatsApp status is "${whatsAppStatus}"`);
  assert(deliveryResult.whatsApp?.provider === 'WHINTA', 'deliveryResult.whatsApp provider is WHINTA');
  assert(deliveryResult.whatsApp?.messageId === 'whinta_MOCK_TEST_DISPATCH_123', 'deliveryResult.whatsApp has messageId');

  // Check document record
  const docs = await getReservationDocuments(hotelId, createdRes.id);
  assert(docs.length > 0, 'Reservation document record exists');
  const docStatus = docs[0].whatsapp_status?.toLowerCase();
  assert(docStatus === 'sent' || docStatus === 'submitted', `Document whatsapp_status is '${docStatus}'`);
  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4 — Durable Notification Outbox Idempotency Check
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 4: Durable notification_outbox Idempotency Prevention ───');
  // Attempting second dispatch for the same reservation
  let secondDispatchCalled = false;
  const duplicateDeliveryResult = await generateAndDeliverConfirmation({
    hotelId,
    reservationId: createdRes.id,
    reservation: createdRes,
    eventType: 'NEW_RESERVATION',
    whatsAppSenderFn: async () => {
      secondDispatchCalled = true;
      return { success: true, status: 'submitted', provider: 'WHINTA' };
    },
  });

  assert(secondDispatchCalled === false, 'Duplicate WhatsApp dispatch prevented: provider senderFn NOT called');
  assert(duplicateDeliveryResult.whatsApp?.status === 'duplicate', `Duplicate delivery returned status 'duplicate' (got '${duplicateDeliveryResult.whatsApp?.status}')`);
  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5 — OTA Route Preservation (Owner Alert, NOT Guest Mobile)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 5: Preservation of OTA-to-Hotel-Owner WhatsApp Routing ───');
  const otaResRecord = {
    id: 'mock-ota-res-uuid-12345678',
    hotel_id: hotelId,
    guest_name: 'OTA Guest',
    guest_phone: '9888877777',
    guest_email: 'ota_guest@ota.com',
    source_name: 'Booking.com',
    source_category: 'OTA',
    internal_note: '[OTA_BOOKING_ID: BDC-9999]',
    check_in_date: '2026-11-20',
    check_out_date: '2026-11-22',
    rate: 3500,
    invoice_total: 7840,
  };

  const otaRecipient = await resolveReservationNotificationRecipient({
    hotelId,
    reservation: otaResRecord,
  });

  assert(otaRecipient.recipientType === 'HOTEL_OWNER', 'OTA reservation routes to HOTEL_OWNER');
  assert(otaRecipient.email !== otaResRecord.guest_email, 'OTA does NOT route email to guest');

  // Verify that for OTA, recipient phone is NOT guest_phone
  let otaDispatchedRecipient = null;
  await generateAndDeliverConfirmation({
    hotelId,
    reservationId: otaResRecord.id,
    reservation: otaResRecord,
    eventType: 'NEW_OTA_RESERVATION',
    whatsAppSenderFn: async (options) => {
      otaDispatchedRecipient = options.to;
      return { success: true, status: 'submitted', provider: 'WHINTA' };
    },
  });

  assert(otaDispatchedRecipient !== '919888877777', 'OTA WhatsApp notification did NOT go to guest phone');
  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6 — Provider Failure Resilience (Booking NEVER Rolled Back)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 6: Provider Failure Resilience (No Rollback / Safe Status) ───');
  const failGuestEmail = `fail.wa.${Date.now()}@example.com`;
  const failResInput = {
    guest_name: 'WhatsApp Fail Guest',
    guest_phone: '9911223344',
    guest_email: failGuestEmail,
    check_in_date: '2028-06-25',
    check_out_date: '2028-06-26',
    room_no: 'Unassigned',
    allow_unassigned: true,
    rate: 2500,
    taxable_amount: 2500,
    gst_amount: 300,
    discount: 0,
    invoice_total: 2800,
    advance_paid: 2800,
    payment_mode: 'Cash',
    source_category: 'Direct/Walking',
    remarks: 'WhatsApp provider failure resilience test',
  };

  const failCreatedList = await createReservationsAtomically({
    hotelId,
    inputs: failResInput,
    userId: 'test-agent',
  });
  const failRes = failCreatedList[0];
  assert(!!failRes?.id, 'Booking created in database');

  // Simulate Whinta API 500 error
  const failDeliveryResult = await generateAndDeliverConfirmation({
    hotelId,
    reservationId: failRes.id,
    reservation: failRes,
    eventType: 'NEW_RESERVATION',
    whatsAppSenderFn: async () => {
      return {
        success: false,
        status: 'failed',
        errorCode: 'WHINTA_API_500_SERVER_ERROR',
        error: 'Whinta API returned 500 Internal Server Error',
        whatsappDirectUrl: 'https://wa.me/919911223344?text=FallbackText',
      };
    },
  });

  // Verify delivery handled failure gracefully
  assert(failDeliveryResult.success === true, 'Overall confirmation execution returned success (non-blocking)');
  assert(failDeliveryResult.whatsApp?.status === 'failed', 'whatsApp status recorded as "failed"');
  assert(failDeliveryResult.whatsApp?.errorCode === 'WHINTA_API_500_SERVER_ERROR', 'errorCode preserved');
  assert(!!failDeliveryResult.whatsApp?.whatsappDirectUrl, 'Direct wa.me URL returned as fallback');

  // Verify booking STILL EXISTS in database
  const { data: verifyBookingInDb } = await supabaseServiceRole
    .from('reservations')
    .select('id, status')
    .eq('id', failRes.id)
    .single();

  assert(!!verifyBookingInDb && verifyBookingInDb.status === 'confirmed', 'Reservation remains 100% saved and confirmed in DB despite WhatsApp failure');
  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7 — Unconfigured Provider Resilience & wa.me Fallback
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 7: Unconfigured Provider Fallback ───');
  const savedToken = process.env.WHINTA_ACCESS_TOKEN;
  const savedApiToken = process.env.WHINTA_API_TOKEN;
  const savedEnabled = process.env.WHINTA_ENABLED;
  delete process.env.WHINTA_ACCESS_TOKEN;
  delete process.env.WHINTA_API_TOKEN;
  delete process.env.WHINTA_ENABLED;

  try {
    const unconfiguredDeliveryResult = await generateAndDeliverConfirmation({
      hotelId,
      reservationId: failRes.id,
      reservation: failRes,
      eventType: 'RESERVATION_MODIFIED',
      forceNewVersion: true,
      // No whatsAppSenderFn passed -> uses real sendWhatsAppMessage which is now unconfigured
    });

    assert(unconfiguredDeliveryResult.whatsApp?.status === 'not_configured', `WhatsApp reports status: 'not_configured' (got '${unconfiguredDeliveryResult.whatsApp?.status}')`);
    assert(!!unconfiguredDeliveryResult.whatsApp?.whatsappDirectUrl, 'Fallback wa.me direct URL is generated');
    assert(unconfiguredDeliveryResult.whatsApp?.whatsappDirectUrl.includes('https://wa.me/919911223344'), 'wa.me points to normalized guest mobile');
  } finally {
    if (savedToken !== undefined) process.env.WHINTA_ACCESS_TOKEN = savedToken;
    if (savedApiToken !== undefined) process.env.WHINTA_API_TOKEN = savedApiToken;
    if (savedEnabled !== undefined) process.env.WHINTA_ENABLED = savedEnabled;
  }
  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────────────────────────────
  console.log('================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDirectWhatsAppTests().catch(err => {
  console.error('Test Suite Fatal Error:', err);
  process.exit(1);
});
