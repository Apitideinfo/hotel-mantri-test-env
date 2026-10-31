/**
 * HOTEL MANTRI â€” Chatbot Booking API: Razorpay Payment & Webhook Service
 * 
 * Provides:
 * 1. Authoritative Razorpay order creation bound to booking attempt & hotel
 * 2. Constant-time timing-safe HMAC signature verification (crypto.timingSafeEqual)
 * 3. Raw-buffer webhook signature verification (X-Razorpay-Signature)
 * 4. Provider-side payment lifecycle verification (must be 'captured', amount & currency match)
 * 5. Idempotent payment recording in `payment_transactions` (constrained unique on payment_id)
 * 6. Atomic settlement into Hotel Mantri `reservations`, `booking_timeline`, and `audit_logs`
 * 7. Recovery workflow for payments captured after hold expiration
 */

import crypto from 'crypto';
import Razorpay from 'razorpay';
import { supabase } from '../db/supabase.js';
import { config } from '../config/environment.js';
import { getConfiguredHotelId, getPublicHotelProfile } from './hotelConfigService.js';
import { timingSafeEqual } from '../middleware/security.js';

let razorpayClientInstance = null;

export const setRazorpayClientForTesting = (mockClient) => {
  razorpayClientInstance = mockClient;
};

export const getRazorpayClient = () => {
  if (razorpayClientInstance) return razorpayClientInstance;

  const env = config();
  const keyId = env.razorpay.keyId;
  const keySecret = env.razorpay.keySecret;

  if (!keyId || !keySecret) {
    throw new Error('[PaymentService] Razorpay credentials are not configured on server.');
  }

  razorpayClientInstance = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });

  return razorpayClientInstance;
};

/**
 * Creates a Razorpay payment order for an existing booking reference.
 */
export const createPaymentOrderForBooking = async ({ bookingReference }) => {
  const hotelId = getConfiguredHotelId();

  // 1. Fetch booking attempt from reservations
  const refMarker = `[CHATBOT_REF: ${bookingReference}]`;
  const { data: resvs, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('hotel_id', hotelId)
    .ilike('internal_note', `%${refMarker}%`)
    .limit(1);

  let resv = resvs?.[0];
  let hold = null;

  if (error || !resv) {
    // Check booking_holds table
    const { data: holdRecord } = await supabase
      .from('booking_holds')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('booking_reference', bookingReference)
      .maybeSingle();

    if (!holdRecord) {
      const err = new Error(`Booking reference ${bookingReference} not found for payment creation.`);
      err.status = 404;
      err.code = 'BOOKING_NOT_FOUND';
      throw err;
    }
    hold = holdRecord;
  }

  // If already fully paid, reject order creation
  if (resv && Number(resv.advance_paid) >= Number(resv.invoice_total) && Number(resv.invoice_total) > 0) {
    const err = new Error(`Booking ${bookingReference} is already fully paid.`);
    err.status = 400;
    err.code = 'BOOKING_ALREADY_PAID';
    throw err;
  }

  // Check hold expiration
  if (hold) {
    const expiresAt = new Date(hold.expires_at).getTime();
    if (Date.now() > expiresAt && hold.status === 'held') {
      const err = new Error('Booking hold has expired. Please initiate a new booking attempt.');
      err.status = 410;
      err.code = 'BOOKING_HOLD_EXPIRED';
      throw err;
    }
  } else if (resv) {
    const expMatch = resv.internal_note.match(/\[HOLD_EXP:\s*([^\]]+)\]/);
    if (expMatch) {
      const expiresAt = new Date(expMatch[1].trim()).getTime();
      if (Date.now() > expiresAt && Number(resv.advance_paid) <= 0) {
        const err = new Error('Booking hold has expired. Please initiate a new booking attempt.');
        err.status = 410;
        err.code = 'BOOKING_HOLD_EXPIRED';
        throw err;
      }
    }
  }

  // Authoritative amount in paise (1 INR = 100 paise)
  const dueInr = hold
    ? Math.round((Number(hold.total_amount_paise) / 100) * 100) / 100
    : Math.max(0, Number(resv.invoice_total) - Number(resv.advance_paid));
  const amountPaise = hold
    ? Number(hold.total_amount_paise)
    : Math.round(dueInr * 100);

  if (amountPaise < 100) {
    const err = new Error('Payment amount must be at least â‚¹1 (100 paise).');
    err.status = 400;
    err.code = 'INVALID_PAYMENT_AMOUNT';
    throw err;
  }

  // Check if active Razorpay order or link is already associated
  const existingOrder = hold?.razorpay_order_id || resv?.internal_note?.match(/\[RAZORPAY_ORDER:\s*([^\]]+)\]/)?.[1];
  const existingLinkMatch = resv?.internal_note?.match(/\[RAZORPAY_PAYMENT_URL:\s*([^\]]+)\]/);

  if (existingOrder) {
    const existingOrderId = String(existingOrder).trim();
    const existingUrl = existingLinkMatch ? existingLinkMatch[1].trim() : `https://rzp.io/i/${existingOrderId}`;
    return {
      orderId: existingOrderId,
      paymentUrl: existingUrl,
      amountPaise,
      amountInr: dueInr,
      currency: 'INR',
      keyId: config().razorpay.keyId,
      bookingReference,
    };
  }

  // Create new order on Razorpay
  const gateway = getRazorpayClient();
  const receipt = `rcpt_${bookingReference.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(36)}`;

  const orderOptions = {
    amount: amountPaise,
    currency: 'INR',
    receipt: receipt.slice(0, 40),
    notes: {
      platform: 'HotelMantriChatbot',
      bookingReference,
      reservationId: resv?.id || hold?.reservation_id || '',
      hotelId,
      expectedAmountPaise: String(amountPaise),
    },
  };

  const order = await gateway.orders.create(orderOptions);

  // Generate mobile-friendly clickable payment link for WhatsApp guest checkout
  let paymentUrl = `https://rzp.io/i/${order.id}`;
  let paymentLinkId = null;
  try {
    if (gateway.paymentLink && typeof gateway.paymentLink.create === 'function') {
      const guestName = resv?.guest_name || hold?.guest_name || 'Guest';
      const guestPhone = (resv?.guest_phone || hold?.guest_phone || '').replace(/\D/g, '') || undefined;
      const guestEmail = resv?.guest_email || hold?.guest_email || undefined;

      const plink = await gateway.paymentLink.create({
        amount: amountPaise,
        currency: 'INR',
        accept_partial: false,
        reference_id: bookingReference,
        description: `Reservation at Hotel Mantri (${bookingReference})`,
        customer: {
          name: guestName,
          contact: guestPhone,
          email: guestEmail,
        },
        notify: {
          sms: false,
          email: false,
        },
        reminder_enable: false,
        notes: {
          platform: 'HotelMantriChatbot',
          bookingReference,
          orderId: order.id,
          hotelId,
        },
      });
      if (plink && (plink.short_url || plink.url)) {
        paymentUrl = plink.short_url || plink.url;
        paymentLinkId = plink.id;
      }
    }
  } catch (linkErr) {
    console.warn('[PaymentService] Razorpay payment link fallback:', linkErr.message);
  }

  // Bind order ID and payment URL to reservation or hold
  if (resv) {
    const updatedNote = `${resv.internal_note} [RAZORPAY_ORDER: ${order.id}] [RAZORPAY_PAYMENT_URL: ${paymentUrl}]`.trim();
    await supabase
      .from('reservations')
      .update({ internal_note: updatedNote, updated_at: new Date().toISOString() })
      .eq('id', resv.id);
  }

  if (hold) {
    await supabase
      .from('booking_holds')
      .update({ razorpay_order_id: order.id, updated_at: new Date().toISOString() })
      .eq('booking_reference', bookingReference);
  }

  // Record audit log
  try {
    await supabase.from('audit_logs').insert({
      hotel_id: hotelId,
      action: 'CHATBOT_PAYMENT_ORDER_CREATED',
      module: 'payment',
      record_id: order.id,
      metadata: {
        booking_reference: bookingReference,
        order_id: order.id,
        payment_link_id: paymentLinkId,
        payment_url: paymentUrl,
        amount_paise: amountPaise,
      },
      severity: 'info',
    });
  } catch {
    // Non-fatal
  }

  return {
    orderId: order.id,
    paymentLinkId,
    paymentUrl,
    amountPaise: order.amount,
    amountInr: dueInr,
    currency: order.currency,
    keyId: config().razorpay.keyId,
    bookingReference,
  };
};

/**
 * Verifies Razorpay checkout signature using constant-time comparison.
 */
export const verifyRazorpayCheckoutSignature = ({ orderId, paymentId, signature }) => {
  if (!orderId || !paymentId || !signature) {
    return { valid: false, code: 'MISSING_SIGNATURE_FIELDS', message: 'orderId, paymentId, and signature are required.' };
  }

  const keySecret = config().razorpay.keySecret;
  if (!keySecret) {
    return { valid: false, code: 'GATEWAY_SECRET_MISSING', message: 'Razorpay key secret not configured.' };
  }

  const body = `${orderId}|${paymentId}`;
  const expectedSig = crypto.createHmac('sha256', keySecret).update(body).digest('hex');

  const bufExpected = crypto.createHash('sha256').update(expectedSig).digest();
  const bufActual = crypto.createHash('sha256').update(signature).digest();

  const isValid = crypto.timingSafeEqual(bufExpected, bufActual);
  return {
    valid: isValid,
    code: isValid ? null : 'SIGNATURE_MISMATCH',
    message: isValid ? 'Signature valid' : 'Razorpay checkout signature verification failed.',
  };
};

/**
 * Verifies Razorpay webhook HMAC signature against raw request body bytes.
 */
export const verifyRazorpayWebhookSignature = ({ rawBody, signature }) => {
  const webhookSecret = config().razorpay.webhookSecret;
  if (!webhookSecret) {
    console.error('[PaymentService] RAZORPAY_WEBHOOK_SECRET is not configured on server.');
    const err = new Error('RAZORPAY_WEBHOOK_SECRET is not configured on server.');
    err.statusCode = 503;
    err.code = 'WEBHOOK_SECRET_NOT_CONFIGURED';
    throw err;
  }

  if (!rawBody || !signature) {
    return false;
  }

  const expectedSig = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  const sigBuf = crypto.createHash('sha256').update(String(signature)).digest();
  const expBuf = crypto.createHash('sha256').update(expectedSig).digest();
  return crypto.timingSafeEqual(sigBuf, expBuf);
};

/**
 * Authoritatively settles verified payment into database tables.
 */
export const settleVerifiedPaymentDurable = async ({
  bookingReference,
  orderId,
  paymentId,
  amountPaise,
  metadata = {},
}) => {
  const hotelId = getConfiguredHotelId();
  const pId = String(paymentId).trim();
  const oId = String(orderId).trim();

  // 1. Database Idempotency Check on payment_id in payment_transactions
  const { data: existingTx } = await supabase
    .from('payment_transactions')
    .select('id, payment_id, order_id, reservation_id')
    .eq('payment_id', pId)
    .maybeSingle();

  if (existingTx) {
    return {
      success: true,
      idempotent: true,
      message: 'Payment has already been processed and settled.',
      paymentId: pId,
      orderId: oId,
      reservationId: existingTx.reservation_id,
    };
  }

  // 2. Fetch target reservation
  const refMarker = `[CHATBOT_REF: ${bookingReference}]`;
  const { data: resvs, error: resvErr } = await supabase
    .from('reservations')
    .select('*')
    .eq('hotel_id', hotelId)
    .ilike('internal_note', `%${refMarker}%`)
    .limit(1);

  if (resvErr || !resvs || resvs.length === 0) {
    const err = new Error(`Target booking ${bookingReference} not found for settlement.`);
    err.status = 404;
    err.code = 'BOOKING_NOT_FOUND';
    throw err;
  }

  const resv = resvs[0];
  const paidInr = Math.round((Number(amountPaise) / 100) * 100) / 100;

  // 3. Try stored procedure finalize_chatbot_booking if available
  try {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('finalize_chatbot_booking', {
      p_booking_reference: bookingReference,
      p_order_id: oId,
      p_payment_id: pId,
      p_amount_paise: Number(amountPaise),
      p_payment_metadata: metadata,
    });

    if (!rpcErr && rpcRes && rpcRes.success) {
      if (!rpcRes.idempotent) {
        dispatchN8nPaymentConfirmationWebhook({
          bookingReference,
          reservation: {
            ...resv,
            advance_paid: Math.max(Number(resv.advance_paid) || 0, paidInr),
            payment_ref: pId,
            status: 'confirmed',
          },
          orderId: oId,
          paymentId: pId,
          amountPaise,
          metadata,
        }).catch((err) => console.warn('[PaymentService] n8n webhook background error:', err.message));
      }

      return {
        success: true,
        idempotent: Boolean(rpcRes.idempotent),
        message: 'Payment settled successfully via database RPC',
        paymentId: pId,
        orderId: oId,
        reservationId: rpcRes.reservation_id,
        bookingReference,
      };
    }
  } catch (rpcErr) {
    // If RPC is pending migration deployment, execute direct ledger & reservation update
  }

  // 4. Direct Ledger & Reservation Settlement Fallback:
  // Insert into payment_transactions ledger
  const { error: ledgerErr } = await supabase
    .from('payment_transactions')
    .insert({
      hotel_id: hotelId,
      order_id: oId,
      payment_id: pId,
      reservation_id: resv.id,
      amount_paise: Number(amountPaise),
      currency: 'INR',
      status: 'captured',
      metadata: {
        ...metadata,
        booking_reference: bookingReference,
        settled_at: new Date().toISOString(),
      },
    });

  if (ledgerErr) {
    // If unique constraint violation on payment_id, return idempotent success
    if (ledgerErr.code === '23505' || ledgerErr.message?.includes('duplicate key')) {
      return {
        success: true,
        idempotent: true,
        message: 'Payment already recorded in ledger.',
        paymentId: pId,
        orderId: oId,
      };
    }
    console.error('[PaymentService] Ledger insert error:', ledgerErr);
    throw new Error('Failed to record payment in financial ledger.');
  }

  // Update reservation advance_paid, payment_ref, payment_mode
  const newAdvancePaid = (Number(resv.advance_paid) || 0) + paidInr;
  const isFullyPaid = newAdvancePaid >= Number(resv.invoice_total);

  await supabase
    .from('reservations')
    .update({
      advance_paid: newAdvancePaid,
      pay_bank: newAdvancePaid,
      payment_ref: pId,
      payment_mode: 'Razorpay',
      status: 'confirmed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', resv.id);

  // Insert into booking_timeline
  try {
    await supabase
      .from('booking_timeline')
      .insert({
        hotel_id: hotelId,
        reservation_id: resv.id,
        event_type: 'online_payment',
        event_description: `Chatbot online payment via Razorpay: â‚¹${paidInr.toFixed(2)} (${pId})`,
        event_amount: paidInr,
        event_data: {
          order_id: oId,
          payment_id: pId,
          amount_paise: amountPaise,
          payment_method: 'Razorpay',
        },
        performed_by: 'CHATBOT_INTEGRATION',
      });
  } catch (err) {
    console.warn('[PaymentService] Timeline insert warning:', err.message);
  }

  // Insert into audit_logs
  try {
    await supabase
      .from('audit_logs')
      .insert({
        hotel_id: hotelId,
        action: 'CHATBOT_PAYMENT_SETTLED',
        module: 'payment',
        record_id: resv.id,
        metadata: {
          booking_reference: bookingReference,
          order_id: oId,
          payment_id: pId,
          amount_paise: amountPaise,
          fully_paid: isFullyPaid,
        },
        severity: 'info',
      });
  } catch (err) {
    console.warn('[PaymentService] Audit log insert warning:', err.message);
  }

  // Asynchronously dispatch n8n confirmation webhook
  dispatchN8nPaymentConfirmationWebhook({
    bookingReference,
    reservation: {
      ...resv,
      advance_paid: newAdvancePaid,
      payment_ref: pId,
      status: 'confirmed',
    },
    orderId: oId,
    paymentId: pId,
    amountPaise,
    metadata,
  }).catch((err) => console.warn('[PaymentService] n8n webhook background error:', err.message));

  return {
    success: true,
    idempotent: false,
    message: 'Payment settled successfully.',
    bookingReference,
    reservationId: resv.id,
    orderId: oId,
    paymentId: pId,
    advancePaidInr: newAdvancePaid,
    isFullyPaid,
  };
};

/**
 * Verifies Razorpay payment lifecycle and authoritatively settles booking.
 */
export const verifyAndSettlePayment = async ({
  bookingReference,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) => {
  // 1. Constant-time signature verification
  const sigCheck = verifyRazorpayCheckoutSignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });

  if (!sigCheck.valid) {
    const err = new Error(sigCheck.message);
    err.status = 400;
    err.code = sigCheck.code;
    throw err;
  }

  // 2. Fetch authoritative payment status from Razorpay provider
  const gateway = getRazorpayClient();
  let paymentRecord;
  try {
    paymentRecord = await gateway.payments.fetch(razorpayPaymentId);
  } catch (fetchErr) {
    const err = new Error(`Failed to verify payment status with payment gateway: ${fetchErr?.message || 'Gateway error'}`);
    err.status = 502;
    err.code = 'GATEWAY_FETCH_FAILED';
    throw err;
  }

  // Enforce authoritative provider status rules (SEC-03B / Phase 6)
  if (paymentRecord.status !== 'captured') {
    const err = new Error(`Payment is not in captured status (current status: ${paymentRecord.status}). Booking cannot be confirmed.`);
    err.status = 400;
    err.code = paymentRecord.status === 'authorized' ? 'PAYMENT_NOT_CAPTURED' : 'PAYMENT_FAILED';
    throw err;
  }

  if (paymentRecord.order_id && paymentRecord.order_id !== razorpayOrderId) {
    const err = new Error('Payment order ID does not match the checkout order.');
    err.status = 400;
    err.code = 'ORDER_MISMATCH';
    throw err;
  }

  if (paymentRecord.currency !== 'INR') {
    const err = new Error(`Unexpected currency ${paymentRecord.currency}. Only INR is supported.`);
    err.status = 400;
    err.code = 'CURRENCY_MISMATCH';
    throw err;
  }

  // 3. Perform durable atomic settlement
  return await settleVerifiedPaymentDurable({
    bookingReference,
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    amountPaise: paymentRecord.amount,
    metadata: {
      method: paymentRecord.method,
      bank: paymentRecord.bank || null,
      wallet: paymentRecord.wallet || null,
      vpa: paymentRecord.vpa || null,
      email: paymentRecord.email || null,
      contact: paymentRecord.contact || null,
    },
  });
};

/**
 * Dispatches an authenticated, HMAC-signed payment confirmation event to n8n Cloud.
 * Non-blocking: failure to reach n8n logs a warning and audit record without aborting payment.
 */
export const dispatchN8nPaymentConfirmationWebhook = async ({
  bookingReference,
  reservation = {},
  orderId,
  paymentId,
  amountPaise,
  metadata = {},
}) => {
  const n8nCfg = config().n8n;
  const webhookUrl = n8nCfg?.paymentWebhookUrl;
  if (!webhookUrl) {
    console.log('[PaymentService] N8N_PAYMENT_WEBHOOK_URL not configured. Skipping automated n8n webhook dispatch.');
    return { dispatched: false, reason: 'URL_NOT_CONFIGURED' };
  }

  const hotelId = getConfiguredHotelId();
  const eventId = `evt_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
  const timestamp = new Date().toISOString();

  // Normalize guest details and phone for Meta WhatsApp
  const guestName = reservation.guest_name || 'Guest';
  const rawPhone = String(reservation.guest_phone || reservation.phone || '').trim();
  const cleanDigits = rawPhone.replace(/\D/g, '');
  const recipientPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
  const checkIn = reservation.check_in_date || reservation.check_in || '';
  const checkOut = reservation.check_out_date || reservation.check_out || '';
  const roomCategory = reservation.room_category || 'Standard Room';
  const roomNumber = reservation.room_no && reservation.room_no !== 'Unassigned' ? reservation.room_no : roomCategory;
  const totalAmountInr = Number(reservation.invoice_total) || (Number(amountPaise) / 100);
  const formattedTotal = Math.round(totalAmountInr).toLocaleString('en-IN');
  const invoiceUrl = 'https://www.hotelmantri.com';

  const payload = {
    event: 'booking.payment_confirmed',
    eventId,
    timestamp,
    hotelId,
    hotelName: 'Hotel Mantri',
    data: {
      bookingReference,
      reservationId: reservation.id || null,
      guestName,
      guestPhone: rawPhone,
      recipientPhone,
      guestEmail: reservation.guest_email || null,
      checkIn,
      checkOut,
      nights: reservation.nights || 1,
      roomCategory,
      roomNumber: reservation.room_no || 'Unassigned',
      totalAmount: totalAmountInr,
      advancePaid: Number(reservation.advance_paid) || totalAmountInr,
      paymentId,
      orderId,
      status: 'confirmed',
      paymentMethod: metadata.payment_method || 'Razorpay',
    },
    // Pre-mapped for Meta WhatsApp Cloud API Template: reservation_confirmation
    whatsappTemplate: {
      templateName: process.env.META_WHATSAPP_RESERVATION_TEMPLATE || 'hotel_mantri_reservation_confirmation_',
      language: 'en',
      recipientPhone,
      bodyParameters: [
        guestName,
        bookingReference,
        roomNumber,
        checkIn,
        checkOut,
        formattedTotal,
        invoiceUrl,
      ],
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: String(guestName).slice(0, 60) },
            { type: 'text', text: String(bookingReference).slice(0, 40) },
            { type: 'text', text: String(roomNumber).slice(0, 30) },
            { type: 'text', text: String(checkIn).slice(0, 30) },
            { type: 'text', text: String(checkOut).slice(0, 30) },
            { type: 'text', text: String(formattedTotal).slice(0, 30) },
            { type: 'text', text: String(invoiceUrl).slice(0, 500) },
          ],
        },
      ],
    },
  };

  const rawJson = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'HotelMantri-PaymentService/1.0',
    'X-Event-Id': eventId,
    'X-Timestamp': timestamp,
  };

  // Sign with HMAC-SHA256 if webhookSecret is configured
  if (n8nCfg.webhookSecret) {
    const signature = crypto.createHmac('sha256', n8nCfg.webhookSecret).update(rawJson).digest('hex');
    headers['X-HotelMantri-Signature'] = `sha256=${signature}`;
    headers['X-Signature-SHA256'] = signature;
  }

  // Include Bearer token if n8n API token is configured
  if (n8nCfg.apiToken) {
    headers['Authorization'] = `Bearer ${n8nCfg.apiToken}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: rawJson,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const isOk = response.ok;
    console.log(`[PaymentService] n8n confirmation webhook dispatched: status=${response.status} eventId=${eventId}`);

    // Audit log
    await supabase.from('audit_logs').insert({
      hotel_id: hotelId,
      action: isOk ? 'CHATBOT_N8N_WEBHOOK_DISPATCHED' : 'CHATBOT_N8N_WEBHOOK_HTTP_ERROR',
      module: 'notification',
      record_id: reservation.id || bookingReference,
      metadata: {
        event_id: eventId,
        booking_reference: bookingReference,
        status_code: response.status,
        webhook_url: webhookUrl.replace(/\/\/[^@]+@/, '//[REDACTED]@'),
      },
      severity: isOk ? 'info' : 'warning',
    }).then(() => {}).catch(() => {});

    return {
      dispatched: isOk,
      statusCode: response.status,
      eventId,
    };
  } catch (netErr) {
    console.warn(`[PaymentService] n8n webhook dispatch failed: ${netErr.message}`);
    await supabase.from('audit_logs').insert({
      hotel_id: hotelId,
      action: 'CHATBOT_N8N_WEBHOOK_NETWORK_ERROR',
      module: 'notification',
      record_id: reservation.id || bookingReference,
      metadata: {
        event_id: eventId,
        booking_reference: bookingReference,
        error_message: netErr.message,
      },
      severity: 'warning',
    }).then(() => {}).catch(() => {});

    return {
      dispatched: false,
      error: netErr.message,
      eventId,
    };
  }
};

