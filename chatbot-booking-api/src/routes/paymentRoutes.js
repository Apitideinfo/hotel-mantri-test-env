/**
 * HOTEL MANTRI — Chatbot Booking API: Payment Webhooks Router
 * 
 * Provides:
 * - POST /v1/payments/razorpay/webhook
 * 
 * Strict Webhook Requirements:
 * 1. Preserves raw request body bytes for HMAC-SHA256 signature verification.
 * 2. Uses dedicated RAZORPAY_WEBHOOK_SECRET.
 * 3. Deduplicates events and payment IDs.
 * 4. Authoritatively verifies payment status ('captured') and settles the booking.
 * 5. Returns 200 OK only after event is safely and durably accepted.
 */

import express from 'express';
import { verifyRazorpayWebhookSignature, settleVerifiedPaymentDurable } from '../services/paymentService.js';
import { supabase } from '../db/supabase.js';
import { getConfiguredHotelId } from '../services/hotelConfigService.js';

const router = express.Router();

/**
 * POST /v1/payments/razorpay/webhook
 */
router.post('/razorpay/webhook', async (req, res, next) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.rawBody; // Captured before JSON parsing

  if (!signature) {
    console.warn('[RazorpayWebhook] Missing X-Razorpay-Signature header.');
    return res.status(400).json({
      success: false,
      error: { code: 'SIGNATURE_MISSING', message: 'X-Razorpay-Signature header is missing.' },
      requestId: req.requestId,
    });
  }

  // 1. Verify HMAC-SHA256 signature
  let isValid = false;
  try {
    isValid = verifyRazorpayWebhookSignature({ rawBody, signature });
  } catch (err) {
    if (err.statusCode === 503 || err.code === 'WEBHOOK_SECRET_NOT_CONFIGURED') {
      return res.status(503).json({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Webhook secret is not configured.' },
        requestId: req.requestId,
      });
    }
    throw err;
  }

  if (!isValid) {
    console.warn('[RazorpayWebhook] Signature mismatch. Webhook rejected.');
    return res.status(401).json({
      success: false,
      error: { code: 'SIGNATURE_INVALID', message: 'Webhook signature verification failed.' },
      requestId: req.requestId,
    });
  }

  try {
    const event = typeof req.body === 'object' ? req.body : JSON.parse(rawBody.toString('utf8'));
    const eventType = event.event;
    const eventId = event.id || req.headers['x-razorpay-event-id'];

    console.log(`[RazorpayWebhook] Received valid event: ${eventType} (Event ID: ${eventId})`);

    // Only process payment captured / order paid events
    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      const paymentEntity = event.payload?.payment?.entity;
      const orderEntity = event.payload?.order?.entity;

      const paymentId = paymentEntity?.id;
      const orderId = paymentEntity?.order_id || orderEntity?.id;
      const amountPaise = paymentEntity?.amount || orderEntity?.amount;

      // Extract booking reference from payment notes
      const notes = paymentEntity?.notes || orderEntity?.notes || {};
      const bookingReference = notes.bookingReference;

      if (!bookingReference || !paymentId) {
        console.warn(`[RazorpayWebhook] Event ${eventType} missing bookingReference or paymentId. Skipping settlement.`);
        return res.status(200).json({ success: true, message: 'Event ignored: non-chatbot booking' });
      }

      // Assert hotel isolation
      const configuredHotelId = getConfiguredHotelId();
      if (notes.hotelId && String(notes.hotelId).toLowerCase() !== String(configuredHotelId).toLowerCase()) {
        console.warn(`[RazorpayWebhook] Event hotelId ${notes.hotelId} does not match configured hotel ${configuredHotelId}.`);
        return res.status(200).json({ success: true, message: 'Event ignored: cross-hotel notification' });
      }

      // Settle payment durably into database
      const settlement = await settleVerifiedPaymentDurable({
        bookingReference,
        orderId: orderId || `ord_${bookingReference}`,
        paymentId,
        amountPaise,
        metadata: {
          webhook_event_id: eventId,
          webhook_event_type: eventType,
          captured_at: new Date().toISOString(),
          payment_method: paymentEntity?.method,
        },
      });

      console.log(`[RazorpayWebhook] Successfully processed ${eventType} for ${bookingReference} (Settled: ${!settlement.idempotent})`);
    }

    // Acknowledge receipt
    res.status(200).json({
      success: true,
      received: true,
      requestId: req.requestId,
    });
  } catch (err) {
    console.error('[RazorpayWebhook] Processing error:', err);
    res.status(500).json({
      success: false,
      error: { code: 'WEBHOOK_PROCESSING_FAILED', message: 'Failed to process webhook event.' },
      requestId: req.requestId,
    });
  }
});

export default router;
