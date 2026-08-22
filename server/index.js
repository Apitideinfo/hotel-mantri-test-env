import express from 'express';
import cors from 'cors';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const KEY_ID = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_TRihoeKVwQzktg';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'o8NGFcph9x0SBD03Jirx5bai';

const razorpay = new Razorpay({
  key_id: KEY_ID,
  key_secret: KEY_SECRET,
});

/**
 * STEP 1: Backend Endpoint to Create Order
 * POST /api/create-order
 */
app.post('/api/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;

    if (!amount || typeof amount !== 'number' || amount < 100) {
      return res.status(400).json({ error: 'Amount must be at least 100 paise (₹1).' });
    }

    const options = {
      amount: Math.round(amount),
      currency,
      receipt: receipt || `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      notes: notes || { platform: 'HotelMantri' },
    };

    const order = await razorpay.orders.create(options);

    return res.status(200).json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: KEY_ID,
    });
  } catch (err) {
    console.error('Razorpay Create Order Error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to create Razorpay order' });
  }
});

/**
 * STEP 3: Backend Endpoint to Verify Signature
 * POST /api/verify-payment
 */
app.post('/api/verify-payment', (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters (razorpay_order_id, razorpay_payment_id, razorpay_signature)',
      });
    }

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    const isMatch = expectedSignature === razorpay_signature;

    if (isMatch) {
      return res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment signature. Verification failed.',
      });
    }
  } catch (err) {
    console.error('Razorpay Verify Payment Error:', err);
    return res.status(500).json({ error: err?.message || 'Server error during signature verification' });
  }
});

app.listen(PORT, () => {
  console.log(`Razorpay Backend Server running on http://localhost:${PORT}`);
});
