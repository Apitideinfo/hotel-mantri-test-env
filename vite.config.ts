import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import Razorpay from 'razorpay';
import crypto from 'crypto';

function razorpayApiPlugin(env: Record<string, string>): Plugin {
  const KEY_ID = env.RAZORPAY_KEY_ID || env.VITE_RAZORPAY_KEY_ID || 'rzp_test_TRihoeKVwQzktg';
  const KEY_SECRET = env.RAZORPAY_KEY_SECRET || 'o8NGFcph9x0SBD03Jirx5bai';

  const razorpay = new Razorpay({
    key_id: KEY_ID,
    key_secret: KEY_SECRET,
  });

  return {
    name: 'razorpay-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next();

        // 1. Create Order Endpoint
        if (req.url === '/api/create-order' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const { amount, currency = 'INR', receipt, notes } = JSON.parse(body || '{}');

              if (!amount || typeof amount !== 'number' || amount < 100) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: 'Amount must be at least 100 paise (₹1).' }));
              }

              const options = {
                amount: Math.round(amount),
                currency,
                receipt: receipt || `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                notes: notes || { platform: 'HotelMantri' },
              };

              const order = await razorpay.orders.create(options);

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(
                JSON.stringify({
                  success: true,
                  order_id: order.id,
                  amount: order.amount,
                  currency: order.currency,
                  key_id: KEY_ID,
                }),
              );
            } catch (err: any) {
              console.error('Vite Server Razorpay Order Error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: err?.message || 'Failed to create order' }));
            }
          });
          return;
        }

        // 2. Verify Payment Signature Endpoint
        if (req.url === '/api/verify-payment' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = JSON.parse(body || '{}');

              if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(
                  JSON.stringify({
                    success: false,
                    error: 'Missing required signature verification fields',
                  }),
                );
              }

              const data = razorpay_order_id + '|' + razorpay_payment_id;
              const expectedSignature = crypto
                .createHmac('sha256', KEY_SECRET)
                .update(data.toString())
                .digest('hex');

              const isMatch = expectedSignature === razorpay_signature;

              if (isMatch) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                return res.end(
                  JSON.stringify({
                    success: true,
                    message: 'Payment verified successfully',
                    order_id: razorpay_order_id,
                    payment_id: razorpay_payment_id,
                  }),
                );
              } else {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(
                  JSON.stringify({
                    success: false,
                    error: 'Invalid payment signature. Signature mismatch.',
                  }),
                );
              }
            } catch (err: any) {
              console.error('Vite Server Signature Verification Error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: err?.message || 'Server error during verification' }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), razorpayApiPlugin(env)],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'lucide-react', 'jspdf', 'jspdf-autotable', 'xlsx'],
    },
    build: {
      target: 'esnext',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('jspdf') || id.includes('xlsx')) {
                return 'vendor-exports';
              }
              if (id.includes('three')) {
                return 'vendor-three';
              }
              if (id.includes('react') || id.includes('react-dom')) {
                return 'vendor-core';
              }
              return 'vendor-others';
            }
          },
        },
      },
    },
  };
});

