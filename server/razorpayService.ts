import Razorpay from 'razorpay';
import crypto from 'crypto';

const KEY_ID = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

const getRazorpayInstance = () => {
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET || KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials (KEY_ID and KEY_SECRET) are not configured on server.');
  }
  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
};

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

  const razorpay = getRazorpayInstance();
  const order = await razorpay.orders.create(options);

  return {
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    key_id: KEY_ID,
  };
}

/**
 * Verifies Razorpay payment HMAC-SHA256 signature securely on the backend using constant-time comparison.
 */
export function verifyRazorpaySignature(params: VerifyPaymentParams) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = params;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return {
      isValid: false,
      message: 'Missing required signature verification fields.',
    };
  }

  if (
    typeof razorpay_order_id !== 'string' ||
    typeof razorpay_payment_id !== 'string' ||
    typeof razorpay_signature !== 'string'
  ) {
    return {
      isValid: false,
      message: 'Verification parameters must be strings.',
    };
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET || KEY_SECRET;
  if (!keySecret) {
    return {
      isValid: false,
      message: 'Razorpay secret key is not configured on server.',
    };
  }

  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(body.toString())
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const actualBuf = Buffer.from(razorpay_signature, 'utf8');

  // Verify byte length matches before calling timingSafeEqual to avoid RangeError
  if (expectedBuf.length !== actualBuf.length) {
    return {
      isValid: false,
      message: 'Invalid payment signature. Verification failed.',
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
    };
  }

  const isValid = crypto.timingSafeEqual(expectedBuf, actualBuf);

  return {
    isValid,
    message: isValid ? 'Payment verified successfully.' : 'Invalid payment signature.',
    order_id: razorpay_order_id,
    payment_id: razorpay_payment_id,
  };
}
