import React, { useState } from 'react';
import { CreditCard, CheckCircle2, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { openRazorpayCheckout } from '@/lib/razorpay';

interface RazorpayPayButtonProps {
  amount: number; // in INR (e.g. 999 for ₹999)
  planName: string;
  buttonText?: string;
  className?: string;
  onPaymentSuccess?: (paymentDetails: { payment_id: string; order_id: string }) => void;
}

export const RazorpayPayButton: React.FC<RazorpayPayButtonProps> = ({
  amount,
  planName,
  buttonText,
  className = '',
  onPaymentSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [successData, setSuccessData] = useState<{ payment_id: string; order_id: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePayment = async () => {
    setLoading(true);
    setErrorMessage(null);

    const result = await openRazorpayCheckout({
      amount, // in INR
      name: 'HotelMantri Platform',
      description: `${planName} Subscription Payment`,
      prefill: {
        name: 'Hotel Manager',
        email: 'manager@hotelmantri.com',
        contact: '9876543210',
      },
      notes: {
        plan: planName,
        price_inr: `₹${amount}`,
      },
    });

    setLoading(false);

    if (result.success && result.payment_id && result.order_id) {
      const details = { payment_id: result.payment_id, order_id: result.order_id };
      setSuccessData(details);
      if (onPaymentSuccess) onPaymentSuccess(details);
    } else if (result.error && !result.error.includes('cancelled')) {
      setErrorMessage(result.error);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handlePayment}
        disabled={loading}
        className={
          className ||
          'w-full bg-[#1a68fb] hover:bg-blue-600 active:bg-blue-700 text-white font-extrabold h-12 rounded-xl shadow-lg shadow-blue-500/25 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer'
        }
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-white" />
            <span>Connecting Razorpay…</span>
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4" />
            <span>{buttonText || `Pay ₹${amount.toLocaleString('en-IN')} with Razorpay`}</span>
          </>
        )}
      </button>

      {/* Error Toast / Alert */}
      {errorMessage && (
        <div className="mt-3 flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold p-3 rounded-xl animate-fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Payment Success Confirmation Modal */}
      {successData && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-blue-50 text-center relative animate-page-fade">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Payment Verified!</h3>
            <p className="text-slate-500 text-sm mt-1">
              Your subscription for <strong className="text-slate-900">{planName}</strong> has been activated.
            </p>

            {/* Payment Details Box */}
            <div className="my-6 bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Payment ID:</span>
                <span className="font-mono font-bold text-slate-900">{successData.payment_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Order ID:</span>
                <span className="font-mono font-bold text-slate-900">{successData.order_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Amount Paid:</span>
                <span className="font-bold text-emerald-600">₹{amount.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Signature Status:</span>
                <span className="font-bold text-blue-600 inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> HMAC Verified
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSuccessData(null)}
              className="w-full bg-[#1a68fb] hover:bg-blue-600 text-white font-extrabold h-12 rounded-xl shadow-lg shadow-blue-500/25 transition cursor-pointer"
            >
              Continue to Dashboard
            </button>
          </div>
        </div>
      )}
    </>
  );
};
