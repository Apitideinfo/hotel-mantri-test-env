export interface RazorpayOptions {
  amount: number; // in Rupees or paise
  isAmountInPaise?: boolean;
  name?: string;
  description?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  onSuccess?: (data: { payment_id: string; order_id: string; signature: string }) => void;
  onFailure?: (error: any) => void;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

/**
 * Dynamically loads the Razorpay Standard Checkout JS script if not already present.
 */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Executes full Razorpay Standard Web Checkout:
 * 1. Calls /api/create-order to create order on backend
 * 2. Opens Razorpay Modal
 * 3. Verifies signature on /api/verify-payment
 */
export async function openRazorpayCheckout(options: RazorpayOptions): Promise<{
  success: boolean;
  payment_id?: string;
  order_id?: string;
  error?: string;
}> {
  try {
    // 1. Ensure Checkout script is loaded
    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      throw new Error('Failed to load Razorpay SDK. Please check your internet connection.');
    }

    // Convert amount to paise (min 100 paise = ₹1)
    const amountInPaise = options.isAmountInPaise
      ? options.amount
      : Math.round(options.amount * 100);

    if (amountInPaise < 100) {
      throw new Error('Minimum payment amount is ₹1 (100 paise).');
    }

    // 2. Step 1: Call Backend to Create Order
    const orderResponse = await fetch('/api/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `rcpt_${Date.now()}`,
        notes: options.notes || { app: 'HotelMantri' },
      }),
    });

    if (!orderResponse.ok) {
      const errData = await orderResponse.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to create payment order on backend.');
    }

    const orderData = await orderResponse.json();
    const { order_id, amount, currency, key_id } = orderData;

    const razorpayKeyId = key_id || import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_TRihoeKVwQzktg';

    // 3. Step 2: Open Razorpay Standard Checkout Modal
    return new Promise((resolve) => {
      const rzpOptions = {
        key: razorpayKeyId,
        amount,
        currency: currency || 'INR',
        name: options.name || 'HotelMantri Platform',
        description: options.description || 'Hospitality SaaS Plan',
        image: 'https://cdn-icons-png.flaticon.com/512/2983/2983780.png',
        order_id,
        prefill: {
          name: options.prefill?.name || 'Hotel Admin',
          email: options.prefill?.email || 'admin@gmail.com',
          contact: options.prefill?.contact || '9876543210',
        },
        theme: {
          color: '#1a68fb',
        },
        handler: async function (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) {
          try {
            // Step 3: Call Backend to Verify Payment Signature
            const verifyResponse = await fetch('/api/verify-payment', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyResponse.json();

            if (verifyResponse.ok && verifyData.success) {
              if (options.onSuccess) {
                options.onSuccess({
                  payment_id: response.razorpay_payment_id,
                  order_id: response.razorpay_order_id,
                  signature: response.razorpay_signature,
                });
              }
              resolve({
                success: true,
                payment_id: response.razorpay_payment_id,
                order_id: response.razorpay_order_id,
              });
            } else {
              const errMsg = verifyData.error || 'Payment signature verification failed.';
              if (options.onFailure) options.onFailure(errMsg);
              resolve({ success: false, error: errMsg });
            }
          } catch (err: any) {
            const errMsg = err?.message || 'Payment verification failed.';
            if (options.onFailure) options.onFailure(errMsg);
            resolve({ success: false, error: errMsg });
          }
        },
        modal: {
          ondismiss: function () {
            const cancelMsg = 'Payment checkout cancelled by user.';
            if (options.onFailure) options.onFailure(cancelMsg);
            resolve({ success: false, error: cancelMsg });
          },
        },
      };

      const rzp = new window.Razorpay(rzpOptions);
      rzp.on('payment.failed', function (response: any) {
        const failedReason = response?.error?.description || 'Payment transaction failed.';
        if (options.onFailure) options.onFailure(failedReason);
        resolve({ success: false, error: failedReason });
      });

      rzp.open();
    });
  } catch (err: any) {
    const errMsg = err?.message || 'Unable to process checkout.';
    if (options.onFailure) options.onFailure(errMsg);
    return { success: false, error: errMsg };
  }
}
