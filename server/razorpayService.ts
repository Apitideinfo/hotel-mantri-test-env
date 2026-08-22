import Razorpay from 'razorpay';
import crypto from 'crypto';

const KEY_ID = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_TRihoeKVwQzktg';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'o8NGFcph9x0SBD03Jirx5bai';

const razorpayInstance = new Razorpay({
  key_id: KEY_ID,
  key_secret: KEY_SECRET,
});

export interface CreateOrderParams {
  amount: number; // in paise (min 100 = ₹1)
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
}

export interface VerifyPaymentParams {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/**
 * Creates a Razorpay order securely on the backend server.
 */
export async function createRazorpayOrder(params: CreateOrderParams) {
  const { amount, currency = 'INR', receipt, notes } = params;

  if (!amount || typeof amount !== 'number' || amount < 100) {
    throw new Error('Amount must be at least 100 paise (₹1).');
  }

  const options = {
    amount: Math.round(amount),
    currency,
    receipt: receipt || `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    notes: notes || { platform: 'HotelMantri' },
  };

  const order = await razorpayInstance.orders.create(options);

  return {
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    key_id: KEY_ID,
  };
}

/**
 * Verifies Razorpay payment HMAC-SHA256 signature securely on the backend.
 */
export function verifyRazorpaySignature(params: VerifyPaymentParams) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = params;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return {
      isValid: false,
      message: 'Missing required signature verification fields.',
    };
  }

  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(body.toString())
    .digest('hex');

  const isValid = expectedSignature === razorpay_signature;

  return {
    isValid,
    message: isValid ? 'Payment verified successfully.' : 'Invalid payment signature.',
    order_id: razorpay_order_id,
    payment_id: razorpay_payment_id,
  };
}
