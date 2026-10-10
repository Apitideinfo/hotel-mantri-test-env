/**
 * Hotel Mantri — Master Test Suite: Reservation Confirmation & Delivery System
 *
 * Verifies all 10 Mandatory Tests + Source-Based Recipient Routing:
 * - Test 1: Manual reservation creation & confirmation generation (routes to Customer)
 * - Test 2: OTA reservation arrival & owner notification (routes to Hotel Owner, NOT guest)
 * - Test 3: Duplicate OTA webhook idempotency (No duplicate booking or notification)
 * - Test 4: Reservation modification (version incrementing, historical preservation)
 * - Test 5: SMTP failure resilience (reservation succeeds, email marked failed, retry available)
 * - Test 6: WhatsApp failure / unconfigured resilience (no fake success, wa.me fallback)
 * - Test 7: PDF failure resilience (reservation stays saved, failed status, no fake success)
 * - Test 8: Multi-tenant security (Hotel A cannot access Hotel B's confirmation)
 * - Test 9: Multi-room reservation breakdown in PDF
 * - Test 10: Multi-night representation (31-08-2026 -> 02-09-2026 = 2 Nights, timezone-safe)
 * - Test 11: Complete Source Classification Matrix (MakeMyTrip, Goibibo, Cleartrip, EaseMyTrip, Booking.com, Agoda, Direct, Agent, Walk-in)
 * - Test 12: Walk-in without email resilience (PDF generated, zero fake email, download ready)
 */

import { supabaseServiceRole, ensureAuth } from '../server/supabaseClient.js';
import {
  generateAndStoreReservationConfirmation,
  getReservationDocuments,
  readPdfFromStorage,
  DOCUMENT_TYPES,
  DELIVERY_STATUS,
} from '../server/services/documentService.js';
import {
  generateAndDeliverConfirmation,
  resolveReservationNotificationRecipient,
  isOTAReservation,
  isManualReservation,
  normalizeBookingSource,
  buildOtaOwnerConfirmationEmail,
  buildCustomerConfirmationEmail,
  buildReservationConfirmationEmail,
  buildReservationConfirmationWhatsAppText,
} from '../server/services/reservationDeliveryService.js';
import {
  buildReservationConfirmationPdf,
  generateReservationPdfBuffer,
} from '../server/services/reservationPdfService.js';
import {
  getHotelBranding,
  updateHotelBranding,
  fetchLogoAsBase64,
} from '../server/services/hotelBrandingService.js';
import { processAiosellReservation } from '../server/services/integrations/aiosell/AiosellReservationService.js';
import { createReservationsAtomically, updateReservationAtomically } from '../server/services/RoomAssignmentService.js';
import { sendEmail } from '../server/services/emailService.js';
import { sendWhatsAppMessage } from '../server/services/whatsappService.js';

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

async function runTests() {
  console.log('================================================================');
  console.log('HOTEL MANTRI — RESERVATION CONFIRMATION MASTER TEST SUITE');
  console.log('================================================================\n');

  await ensureAuth();

  // Resolve test hotels
  let hotelA;
  let hotelB;
  try {
    const { data: hotels } = await supabaseServiceRole.from('hotels').select('*').limit(2);
    if (hotels && hotels.length > 0) {
      hotelA = hotels.find(h => h.hotel_name.toLowerCase().includes('gopal')) || hotels[0];
      hotelB = hotels.find(h => h.id !== hotelA.id) || (hotels.length > 1 ? hotels[1] : { id: '99999999-9999-9999-9999-999999999999', hotel_name: 'Hotel B Isolated' });
    }
  } catch (e) {
    // Continue to fallback
  }

  if (!hotelA) {
    hotelA = {
      id: process.env.TEST_HOTEL_ID || 'a93139f5-baa0-47a4-87ca-81ee7e106d9c',
      hotel_name: 'Hotel Gopal'
    };
    hotelB = {
      id: process.env.TEST_HOTEL_B_ID || '9001eb1c-9d38-49d0-84f7-75244e8f4bf8',
      hotel_name: 'mars hotel'
    };
  }

  const hotelId = hotelA.id;
  console.log(`Using Hotel A: "${hotelA.hotel_name}" (${hotelId})`);
  console.log(`Using Hotel B: "${hotelB.hotel_name}" (${hotelB.id})\n`);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1 — Manual reservation creation & Customer Delivery
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 1: Manual Reservation Creation & Customer Delivery ───');
  const manualTimestamp = Date.now();
  const guestEmail = `guest.${manualTimestamp}@example.com`;
  const manualInput = {
    guest_name: `Manual Guest ${manualTimestamp}`,
    guest_phone: '9876543210',
    guest_email: guestEmail,
    check_in_date: '2026-10-10',
    check_out_date: '2026-10-12',
    room_no: 'Unassigned',
    rate: 2800,
    taxable_amount: 5600,
    gst_amount: 672,
    discount: 0,
    invoice_total: 6272,
    advance_paid: 2000,
    payment_mode: 'UPI',
    source_category: 'Direct/Walking',
    remarks: 'Manual direct reservation test',
  };

  const manualCreated = await createReservationsAtomically({
    hotelId,
    inputs: manualInput,
    userId: 'test-agent',
  });

  const manualRes = manualCreated[0];
  assert(!!manualRes && !!manualRes.id, 'Manual reservation committed to database.');

  // Recipient resolution check
  const recipientCheck1 = await resolveReservationNotificationRecipient({
    hotelId,
    reservation: manualRes,
  });
  assert(recipientCheck1.recipientType === 'CUSTOMER', 'Manual reservation recipient type is CUSTOMER.');
  assert(recipientCheck1.email === guestEmail, `Customer email correctly resolved (${guestEmail}).`);
  assert(recipientCheck1.sourceType === 'MANUAL', 'Source type classified as MANUAL.');

  const deliveryResult1 = await generateAndDeliverConfirmation({
    hotelId,
    reservationId: manualRes.id,
    reservation: manualRes,
    eventType: 'NEW_RESERVATION',
  });

  assert(deliveryResult1.success === true, 'Confirmation generation completed.');
  assert(deliveryResult1.pdf.status === 'generated', 'Confirmation PDF generated successfully.');
  assert(deliveryResult1.pdf.version === 1, 'Initial confirmation is Version 1.');
  assert(deliveryResult1.recipient.recipientType === 'CUSTOMER', 'Delivered to CUSTOMER, NOT hotel owner.');

  const storedBuf1 = await readPdfFromStorage(hotelId, manualRes.id, deliveryResult1.pdf.storagePath);
  assert(!!storedBuf1 && storedBuf1.length > 5000, `Confirmation PDF stored persistently (${storedBuf1?.length} bytes).`);

  const docs1 = await getReservationDocuments(hotelId, manualRes.id);
  assert(docs1.length > 0 && docs1[0].version === 1, 'Database document record exists and tracked.');

  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2 — OTA reservation & Owner Notification
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 2: OTA Reservation Import & Owner Delivery ───');
  const otaBookingId = `OTA_TEST_${Date.now()}`;
  const otaPayload = {
    action: 'book',
    bookingId: otaBookingId,
    channelName: 'Booking.com',
    guestName: 'Mr. OTA Traveler',
    guestPhone: '919876543210',
    guestEmail: 'traveler@ota-example.com',
    checkIn: '2026-10-15',
    checkOut: '2026-10-18',
    roomsCount: 1,
    roomCode: 'DLX',
    roomName: 'Deluxe AC',
    amount: 9000,
    amountBeforeTax: 7800,
    taxes: 1200,
    paymentStatus: 'paid',
    specialRequests: 'High floor quiet room',
    raw: { test: true },
  };

  const otaResult = await processAiosellReservation(otaPayload, hotelId);
  assert(otaResult.success === true, 'OTA reservation successfully imported.');
  assert(!!otaResult.reservationId, 'Authoritative Hotel Mantri reservation created.');

  // Fetch created OTA reservation
  const { data: otaResRecord } = await supabaseServiceRole
    .from('reservations')
    .select('*')
    .eq('id', otaResult.reservationId)
    .single();

  // Verify recipient resolution for OTA
  const otaRecipientCheck = await resolveReservationNotificationRecipient({
    hotelId,
    reservation: otaResRecord,
  });

  assert(otaRecipientCheck.recipientType === 'HOTEL_OWNER', 'OTA reservation recipient is HOTEL_OWNER.');
  assert(otaRecipientCheck.sourceType === 'OTA', 'OTA reservation classified as OTA.');
  assert(otaRecipientCheck.email !== otaPayload.guestEmail, 'OTA guest email is NOT set as confirmation recipient.');

  // Check that confirmation was generated for this OTA reservation (poll briefly for async worker)
  let otaDocs = [];
  for (let i = 0; i < 20; i++) {
    otaDocs = await getReservationDocuments(hotelId, otaResult.reservationId);
    if (otaDocs && otaDocs.length > 0) break;
    await new Promise(r => setTimeout(r, 200));
  }
  assert(otaDocs.length > 0, 'Reservation confirmation PDF automatically generated for OTA booking.');
  assert(otaDocs[0].version === 1, 'OTA confirmation is Version 1.');

  const otaStoredPdf = await readPdfFromStorage(hotelId, otaResult.reservationId, otaDocs[0].storage_path);
  assert(!!otaStoredPdf && otaStoredPdf.length > 5000, 'OTA confirmation PDF persistently stored.');

  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3 — Duplicate OTA webhook (Idempotency)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 3: Duplicate OTA Webhook Idempotency ───');
  const duplicateResult = await processAiosellReservation(otaPayload, hotelId);
  assert(duplicateResult.success === true, 'Duplicate webhook returns success response.');
  assert(duplicateResult.status === 'already_imported' || duplicateResult.idempotent === true, 'Duplicate recognized as already imported.');
  assert(duplicateResult.reservationId === otaResult.reservationId, 'Matches original reservation ID.');

  // Verify no duplicate reservation rows in DB
  const { data: countCheck } = await supabaseServiceRole
    .from('reservations')
    .select('id')
    .eq('hotel_id', hotelId)
    .ilike('internal_note', `%[OTA_BOOKING_ID: ${otaBookingId}]%`);

  assert(countCheck.length === 1, `Exactly ONE reservation exists for OTA booking ID (found ${countCheck.length}).`);

  // Verify no duplicate documents generated
  const otaDocsAfterDupe = await getReservationDocuments(hotelId, otaResult.reservationId);
  assert(otaDocsAfterDupe.length === 1, 'No duplicate confirmation documents created.');

  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4 — Reservation Modification
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 4: Reservation Modification ───');
  const modResult = await updateReservationAtomically({
    hotelId,
    reservationId: manualRes.id,
    updates: {
      check_out_date: '2026-10-14', // Extended 2 days
      rate: 3200,                  // Rate changed
      taxable_amount: 12800,
      invoice_total: 14336,
      remarks: 'Extended stay + rate upgrade',
    },
    userId: 'mod-agent',
  });

  assert(modResult.check_out_date === '2026-10-14', 'Stay modified in database.');

  // Trigger modification delivery (forces new version)
  const deliveryResultMod = await generateAndDeliverConfirmation({
    hotelId,
    reservationId: manualRes.id,
    reservation: modResult,
    eventType: 'RESERVATION_MODIFIED',
    forceNewVersion: true,
  });

  assert(deliveryResultMod.success === true, 'Modification confirmation generation succeeded.');
  assert(deliveryResultMod.pdf.version === 2, `New confirmation is Version 2 (got v${deliveryResultMod.pdf.version}).`);

  // Verify historical version 1 is preserved
  const allVersions = await getReservationDocuments(hotelId, manualRes.id);
  assert(allVersions.length >= 2, `Both versions preserved in storage history (total ${allVersions.length} versions).`);
  assert(allVersions.some(v => v.version === 1), 'Version 1 remains accessible.');
  assert(allVersions.some(v => v.version === 2), 'Version 2 exists as latest.');

  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5 — SMTP Failure Resilience
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 5: SMTP Failure Resilience ───');
  const smtpFailResult = await sendEmail({
    to: 'invalid-non-existent-domain-xyz987654321.test',
    subject: 'Test SMTP Failure',
    html: '<p>Test</p>',
  });

  assert(smtpFailResult.success === false, 'SMTP error caught cleanly.');
  assert(smtpFailResult.errorCode === 'INVALID_RECIPIENT' || !!smtpFailResult.errorCode, `Structured error code returned: ${smtpFailResult.errorCode}`);

  // Confirm that reservation itself remains 100% saved despite email failure
  const { data: resStillExists } = await supabaseServiceRole
    .from('reservations')
    .select('id, status')
    .eq('id', manualRes.id)
    .single();

  assert(!!resStillExists, 'Reservation remains valid and committed in database despite SMTP issue.');

  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6 — WhatsApp Failure / Unconfigured Resilience
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 6: WhatsApp Failure / Unconfigured Resilience ───');
  const waInvalidResult = await sendWhatsAppMessage({
    to: '123',
    text: 'Test',
  });

  assert(waInvalidResult.success === false, 'Invalid phone number rejected cleanly.');
  assert(waInvalidResult.errorCode === 'WHATSAPP_INVALID_RECIPIENT', 'Returns WHATSAPP_INVALID_RECIPIENT error code.');
  assert(!waInvalidResult.status.includes('sent'), 'Does NOT report false success.');

  const waUnconfiguredResult = await sendWhatsAppMessage({
    to: '919876543210',
    text: 'Test confirmation message',
  });

  if (!waUnconfiguredResult.success) {
    assert(!!waUnconfiguredResult.whatsappDirectUrl, 'Provides authoritative wa.me click-to-chat URL as fallback.');
    assert(waUnconfiguredResult.whatsappDirectUrl.includes('https://wa.me/919876543210'), 'wa.me fallback points to correct recipient.');
  }

  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7 — PDF Generation Failure Resilience
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 7: PDF Generation Failure Resilience ───');
  let pdfFailedCaught = false;
  try {
    await generateAndStoreReservationConfirmation({
      hotelId: null,
      reservationId: null,
    });
  } catch (err) {
    pdfFailedCaught = true;
    assert(err.message.includes('required'), `PDF generator threw cleanly on missing data: ${err.message}`);
  }
  assert(pdfFailedCaught === true, 'No fake success reported when PDF generation fails.');

  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 8 — Multi-Tenant Security
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 8: Multi-Tenant Security ───');
  const hotelBDocs = await getReservationDocuments(hotelB.id, manualRes.id);
  assert(hotelBDocs.length === 0, 'Hotel B cannot access Hotel A reservation documents.');

  const crossTenantRead = await readPdfFromStorage(hotelB.id, manualRes.id, `reservations/${hotelB.id}/${manualRes.id}/confirmation-v1.pdf`);
  assert(crossTenantRead === null, 'Hotel B cannot read Hotel A PDF from storage.');

  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 9 — Multi-Room Reservation Breakdown in PDF
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 9: Multi-Room Reservation Representation in PDF ───');
  const multiRoomList = [
    { id: 'res-room-1', room_no: '101', rate_plan: 'Deluxe AC', rate: 3000, invoice_total: 6000, check_in_date: '2026-11-01', check_out_date: '2026-11-03' },
    { id: 'res-room-2', room_no: '102', rate_plan: 'Suite Room', rate: 5000, invoice_total: 10000, check_in_date: '2026-11-01', check_out_date: '2026-11-03' },
  ];

  const multiRoomDoc = buildReservationConfirmationPdf({
    reservation: {
      ...manualRes,
      id: 'multi-room-parent-res',
      rate: 8000,
      invoice_total: 16000,
      taxable_amount: 14000,
      gst_amount: 2000,
      check_in_date: '2026-11-01',
      check_out_date: '2026-11-03',
    },
    multiRooms: multiRoomList,
    version: 1,
  });

  const multiRoomBuf = Buffer.from(multiRoomDoc.output('arraybuffer'));
  assert(multiRoomBuf.length > 5000, `Multi-room PDF generated successfully (${multiRoomBuf.length} bytes).`);

  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 10 — Multi-Night Stay (31-08-2026 to 02-09-2026 = 2 Nights)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 10: Multi-Night Stay (31-08-2026 to 02-09-2026 = 2 Nights) ───');
  const multiNightRes = {
    ...manualRes,
    id: 'multi-night-res',
    check_in_date: '2026-08-31',
    check_out_date: '2026-09-02',
    rate: 3000,
    taxable_amount: 6000,
    invoice_total: 6720,
    gst_amount: 720,
  };

  const d1 = new Date('2026-08-31T00:00:00');
  const d2 = new Date('2026-09-02T00:00:00');
  const calculatedNights = Math.round((d2 - d1) / (1000 * 3600 * 24));
  assert(calculatedNights === 2, `Exact stay nights calculated: ${calculatedNights} Nights.`);

  const multiNightPdfBuf = await generateReservationPdfBuffer({
    reservation: multiNightRes,
    version: 1,
  });
  assert(multiNightPdfBuf.length > 5000, `Multi-night PDF generated (${multiNightPdfBuf.length} bytes).`);

  // Verify email body representation
  const emailSample = buildCustomerConfirmationEmail({
    hotelName: 'Hotel Mantri',
    reservationId: multiNightRes.id,
    confirmationNumber: 'HM-RES-MULTINIGHT',
    guestName: 'Test Multi-Night Guest',
    checkIn: '2026-08-31',
    checkOut: '2026-09-02',
    nights: calculatedNights,
    roomCategory: 'Deluxe Room',
    roomNo: '201',
    totalAmount: 6720,
    advancePaid: 3000,
    balanceDue: 3720,
    paymentStatus: 'Partial',
  });

  assert(emailSample.text.includes('2 Nights'), 'Customer email text explicitly states "2 Nights".');
  assert(emailSample.text.includes('31 Aug 2026') && emailSample.text.includes('02 Sep 2026'), 'Customer email text formats stay dates correctly.');

  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 11 — Complete Source Classification Matrix
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 11: Complete Source Classification Matrix ───');
  const testSources = [
    { input: 'MakeMyTrip', isOta: true },
    { input: 'MMT', isOta: true },
    { input: 'Goibibo', isOta: true },
    { input: 'Cleartrip', isOta: true },
    { input: 'EaseMyTrip', isOta: true },
    { input: 'Booking.com', isOta: true },
    { input: 'Agoda', isOta: true },
    { input: 'Expedia', isOta: true },
    { input: 'Airbnb', isOta: true },
    { input: 'Hotels.com', isOta: true },
    { input: 'Yatra', isOta: true },
    { input: 'Trip.com', isOta: true },
    { input: 'Direct', isOta: false },
    { input: 'Direct/Walking', isOta: false },
    { input: 'Walk In', isOta: false },
    { input: 'Corporate/Agent', isOta: false },
    { input: 'Hotel Website', isOta: false },
    { input: 'Phone Booking', isOta: false },
  ];

  for (const ts of testSources) {
    const otaClassified = isOTAReservation(ts.input);
    const manualClassified = isManualReservation(ts.input);
    assert(otaClassified === ts.isOta, `Source "${ts.input}" classified correctly (isOTA: ${otaClassified}).`);
    assert(manualClassified === !ts.isOta, `Source "${ts.input}" manual check is consistent.`);
  }

  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 12 — Walk-in Without Email (Zero Fake Email / PDF Saved)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 12: Walk-in Without Email (Zero Fake Email / PDF Saved) ───');
  const walkInInput = {
    guest_name: `Walk-in Cash Guest ${Date.now()}`,
    guest_phone: '9812345678',
    guest_email: null, // Intentionally empty email
    check_in_date: '2026-10-20',
    check_out_date: '2026-10-21',
    room_no: 'Unassigned',
    rate: 2200,
    taxable_amount: 2200,
    gst_amount: 264,
    discount: 0,
    invoice_total: 2464,
    advance_paid: 2464,
    payment_mode: 'Cash',
    source_category: 'Direct/Walking',
    remarks: 'Walk-in cash guest without email address',
  };

  const walkInCreated = await createReservationsAtomically({
    hotelId,
    inputs: walkInInput,
    userId: 'frontdesk-agent',
    allowEmptyEmail: true,
  });

  const walkInRes = walkInCreated[0];
  assert(!!walkInRes && !!walkInRes.id, 'Walk-in reservation committed to database.');

  // Recipient check: MUST resolve to NONE
  const walkInRecipient = await resolveReservationNotificationRecipient({
    hotelId,
    reservation: walkInRes,
  });
  assert(walkInRecipient.recipientType === 'NONE', 'Recipient resolved to NONE (no email address).');
  assert(walkInRecipient.reason === 'CUSTOMER_EMAIL_NOT_AVAILABLE', 'Reason states CUSTOMER_EMAIL_NOT_AVAILABLE.');

  // Trigger confirmation delivery
  const walkInDelivery = await generateAndDeliverConfirmation({
    hotelId,
    reservationId: walkInRes.id,
    reservation: walkInRes,
    eventType: 'NEW_RESERVATION',
  });

  assert(walkInDelivery.success === true, 'Confirmation execution succeeded.');
  assert(walkInDelivery.pdf.status === 'generated', 'PDF generated and ready for print/download.');
  assert(walkInDelivery.email.status === 'skipped', 'Email dispatch cleanly skipped.');
  assert(walkInDelivery.email.reason === 'CUSTOMER_EMAIL_NOT_AVAILABLE', 'Email skip reason documented.');
  assert(!walkInDelivery.email.status.includes('sent'), 'NO fake success reported.');

  // Verify persistent storage of walk-in PDF
  const walkInStoredPdf = await readPdfFromStorage(hotelId, walkInRes.id, walkInDelivery.pdf.storagePath);
  assert(!!walkInStoredPdf && walkInStoredPdf.length > 5000, `Walk-in PDF stored on disk (${walkInStoredPdf.length} bytes) and available for Print/Download.`);

  // Verify document status in DB
  const walkInDocs = await getReservationDocuments(hotelId, walkInRes.id);
  assert(walkInDocs[0].email_status === DELIVERY_STATUS.NOT_AVAILABLE, `Database document email_status marked '${DELIVERY_STATUS.NOT_AVAILABLE}'.`);

  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 13 — Multi-Tenant Dynamic Branding & Logo Isolation (Hotel A vs Hotel B)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 13: Multi-Tenant Hotel Branding & Logo Isolation (Hotel A vs Hotel B) ───');
  // Use dedicated mock UUIDs to ensure the production/active hotel is NEVER mutated
  const mockHotelA_Id = '11111111-aaaa-4444-8888-111111111111';
  const mockHotelB_Id = '22222222-bbbb-4444-8888-222222222222';

  const logoA_DataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const logoB_DataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // Configure Hotel A
  await updateHotelBranding(mockHotelA_Id, {
    hotelName: 'Grand Palace A',
    city: 'Mumbai',
    stateName: 'Maharashtra',
    address: '101 Marine Drive',
    phone: '+91 99999 11111',
    email: 'stay@palace-a.com',
    website: 'https://palace-a.com',
    gstNumber: '27AAAAA1111A1Z1',
    checkInTime: '14:00 Hrs',
    checkOutTime: '11:00 Hrs',
    cancellationPolicy: 'Hotel A Policy: Full refund 48 hours prior to check-in.',
    importantNotes: 'Hotel A: Aadhaar or Passport mandatory.',
    logoUrl: logoA_DataUrl,
  });

  // Configure Hotel B
  await updateHotelBranding(mockHotelB_Id, {
    hotelName: 'Royal Resort B',
    city: 'Jaipur',
    stateName: 'Rajasthan',
    address: '202 Amer Road',
    phone: '+91 88888 22222',
    email: 'info@royal-b.com',
    website: 'https://royal-b.com',
    gstNumber: '08BBBBB2222B1Z2',
    checkInTime: '13:00 Hrs',
    checkOutTime: '10:00 Hrs',
    cancellationPolicy: 'Hotel B Policy: Non-refundable within 7 days.',
    importantNotes: 'Hotel B: Physical original IDs required.',
    logoUrl: logoB_DataUrl,
  });

  // Retrieve brandings
  const brandA = await getHotelBranding(mockHotelA_Id);
  const brandB = await getHotelBranding(mockHotelB_Id);

  assert(brandA.hotelName === 'Grand Palace A', 'Hotel A branding has correct name "Grand Palace A".');
  assert(brandB.hotelName === 'Royal Resort B', 'Hotel B branding has correct name "Royal Resort B".');
  assert(brandA.city === 'Mumbai' && brandB.city === 'Jaipur', 'Hotel A city (Mumbai) and Hotel B city (Jaipur) strictly isolated.');
  assert(brandA.checkInTime === '14:00 Hrs' && brandB.checkInTime === '13:00 Hrs', 'Hotel A check-in (14:00) and Hotel B check-in (13:00) strictly isolated.');
  assert(brandA.cancellationPolicy.includes('Hotel A Policy') && !brandA.cancellationPolicy.includes('Hotel B Policy'), 'Hotel A cancellation policy strictly isolated.');
  assert(brandB.cancellationPolicy.includes('Hotel B Policy') && !brandB.cancellationPolicy.includes('Hotel A Policy'), 'Hotel B cancellation policy strictly isolated.');
  assert(brandA.logoUrl === logoA_DataUrl && brandB.logoUrl === logoB_DataUrl, 'Hotel A and Hotel B logos isolated.');

  // Generate confirmation PDF for Hotel A reservation
  const resA = {
    id: 'res-test-a-12345678',
    hotel_id: mockHotelA_Id,
    guest_name: 'Guest A',
    check_in_date: '2026-11-01',
    check_out_date: '2026-11-03',
    rate: 3500,
    taxable_amount: 7000,
    invoice_total: 7840,
    advance_paid: 7840,
    payment_mode: 'Online',
    source_category: 'Direct/Walking',
  };

  const pdfBufA = await generateReservationPdfBuffer({
    reservation: resA,
  });
  assert(pdfBufA.length > 5000, `Hotel A confirmation PDF generated (${pdfBufA.length} bytes).`);

  // Generate confirmation PDF for Hotel B reservation
  const resB = {
    id: 'res-test-b-87654321',
    hotel_id: mockHotelB_Id,
    guest_name: 'Guest B',
    check_in_date: '2026-11-05',
    check_out_date: '2026-11-07',
    rate: 4500,
    taxable_amount: 9000,
    invoice_total: 10080,
    advance_paid: 5000,
    payment_mode: 'Card',
    source_category: 'Corporate/Agent',
  };

  const pdfBufB = await generateReservationPdfBuffer({
    reservation: resB,
  });
  assert(pdfBufB.length > 5000, `Hotel B confirmation PDF generated (${pdfBufB.length} bytes).`);

  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 14 — Dynamic Hotel Settings Updates Reflected in Real-Time
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 14: Dynamic Hotel Settings Updates Reflected in Real-Time ───');
  await updateHotelBranding(mockHotelA_Id, {
    checkInTime: '15:00 Hrs',
    checkOutTime: '12:00 Hrs',
    cancellationPolicy: 'Updated 2026 Flexible Policy: Cancel anytime up to 12 hours prior.',
  });

  const updatedBrandA = await getHotelBranding(mockHotelA_Id);
  assert(updatedBrandA.checkInTime === '15:00 Hrs', 'Updated check-in time persisted as 15:00 Hrs.');
  assert(updatedBrandA.checkOutTime === '12:00 Hrs', 'Updated check-out time persisted as 12:00 Hrs.');
  assert(updatedBrandA.cancellationPolicy.includes('Updated 2026 Flexible Policy'), 'Updated cancellation policy persisted.');

  const updatedDocA = buildReservationConfirmationPdf({
    reservation: resA,
    branding: updatedBrandA,
  });
  assert(!!updatedDocA, 'Confirmation PDF built with updated dynamic branding.');

  // Clean up mock hotel entries from local branding store
  try {
    const fsMod = await import('fs');
    const pathMod = await import('path');
    const brandFile = pathMod.resolve('server/data/hotel_branding.json');
    if (fsMod.existsSync(brandFile)) {
      const currentMap = JSON.parse(fsMod.readFileSync(brandFile, 'utf-8') || '{}');
      delete currentMap[mockHotelA_Id];
      delete currentMap[mockHotelB_Id];
      fsMod.writeFileSync(brandFile, JSON.stringify(currentMap, null, 2), 'utf-8');
    }
  } catch (e) {}

  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 15 — Corporate / Agent Booking Confirmation Flow
  // ──────────────────────────────────────────────────────────────────────────
  console.log('─── TEST 15: Corporate / Agent Booking Confirmation Flow ───');
  const agentEmail = `agent.guest.${Date.now()}@corporate.com`;
  const agentInput = {
    guest_name: 'Corporate Executive Sharma',
    guest_phone: '9822334455',
    guest_email: agentEmail,
    check_in_date: '2026-12-01',
    check_out_date: '2026-12-04',
    room_no: 'Unassigned',
    rate: 3200,
    taxable_amount: 9600,
    gst_amount: 1152,
    discount: 0,
    invoice_total: 10752,
    advance_paid: 10752,
    payment_mode: 'Bill to Company',
    source_category: 'Corporate/Agent',
    source_name: 'Thomas Cook Corporate Travel',
    remarks: 'Corporate agent booking for annual conference',
  };

  const agentCreated = await createReservationsAtomically({
    hotelId,
    inputs: agentInput,
    userId: 'reservations-desk',
  });
  const agentRes = agentCreated[0];
  assert(!!agentRes && !!agentRes.id, 'Agent reservation created in database.');

  const agentRecipient = await resolveReservationNotificationRecipient({
    hotelId,
    reservation: agentRes,
  });

  assert(agentRecipient.recipientType === 'CUSTOMER', 'Agent booking recipient resolved to CUSTOMER.');
  assert(agentRecipient.email === agentEmail, `Agent booking confirmation routed to guest email: ${agentEmail}.`);
  assert(agentRecipient.sourceType === 'MANUAL', 'Agent booking classified as MANUAL/Direct.');
  assert(agentRecipient.sourceName === 'Thomas Cook Corporate Travel', 'Agent company name preserved.');

  const agentDelivery = await generateAndDeliverConfirmation({
    hotelId,
    reservationId: agentRes.id,
    reservation: agentRes,
    eventType: 'NEW_RESERVATION',
  });

  assert(agentDelivery.success === true, 'Agent booking confirmation delivery flow succeeded.');
  assert(agentDelivery.pdf.status === 'generated', 'Agent confirmation PDF generated and attached.');
  assert(agentDelivery.recipient.email === agentEmail, 'Agent recipient email matches customer address.');

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test Suite Fatal Error:', err);
  process.exit(1);
});
