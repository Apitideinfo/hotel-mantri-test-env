import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, ShieldCheck, CreditCard, Lock, Loader2 } from 'lucide-react';
import { Logo } from '../components/login/Logo';
import { PRICING_PLANS } from '../data/landingData';
import { RazorpayPayButton } from '../components/common/RazorpayPayButton';


interface CheckoutScreenProps {
  planId?: string;
  onNavigateSuccess: () => void;
  onNavigateBack: () => void;
}

export const CheckoutScreen: React.FC<CheckoutScreenProps> = ({
  planId = 'pro',
  onNavigateSuccess,
  onNavigateBack,
}) => {
  const [loading, setLoading] = useState(false);
  const selectedPlan = PRICING_PLANS.find((p) => p.id === planId) || PRICING_PLANS[1];

  const handlePayMock = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onNavigateSuccess();
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-[#06152F] text-white font-sans antialiased flex flex-col selection:bg-blue-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-white/10 bg-[#06152F]/90 backdrop-blur-md py-4 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Logo light />
          <button
            onClick={onNavigateBack}
            className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" /> Change Plan
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 sm:p-10 my-auto">
        <div className="text-center mb-10">
          <span className="text-xs font-extrabold text-cyan-400 uppercase tracking-widest bg-cyan-400/10 border border-cyan-400/20 px-3.5 py-1.5 rounded-full">
            SECURE CHECKOUT
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mt-4">
            Complete your subscription
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Mock Payment Gateway — test the complete HotelMantri subscription funnel.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Plan Summary */}
          <div className="lg:col-span-5 bg-slate-900/80 border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Selected Plan</span>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                14-Day Money Back Guarantee
              </span>
            </div>

            <h2 className="text-2xl font-black text-white mb-1">{selectedPlan.name} Plan</h2>
            <p className="text-slate-400 text-xs mb-6">{selectedPlan.description}</p>

            <div className="flex items-baseline gap-1 pb-6 mb-6 border-b border-white/10">
              <span className="text-4xl font-black text-white">{selectedPlan.price}</span>
              <span className="text-sm font-semibold text-slate-400">{selectedPlan.period}</span>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p className="font-bold uppercase tracking-wider text-slate-400 mb-2">Features Included:</p>
              {selectedPlan.features.map((f) => (
                <div key={f} className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>

            {/* Right: Payment Method & Razorpay Checkout */}
            <div className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-8 text-slate-900 shadow-2xl border border-slate-100 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2 text-slate-900 font-bold">
                    <CreditCard className="w-5 h-5 text-[#1a68fb]" />
                    <span>Razorpay Official Payment Gateway</span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#1a68fb] bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                    <Lock className="w-3.5 h-3.5" /> 256-bit Encrypted
                  </span>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="bg-[#f4f8ff] border border-[#dce7fa] rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-[#1a68fb] uppercase tracking-wider">Subscription Total</p>
                      <p className="text-2xl font-black text-slate-900 mt-0.5">{selectedPlan.price} <span className="text-xs text-slate-500 font-normal">/ month</span></p>
                    </div>
                    <span className="text-xs font-extrabold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                      Razorpay Verified
                    </span>
                  </div>

                  <p className="text-slate-500 text-xs leading-relaxed">
                    Click the Razorpay Checkout button below to launch the official payment gateway modal (UPI, Cards, NetBanking, Wallets supported).
                  </p>
                </div>

                <div className="space-y-3">
                  <RazorpayPayButton
                    amount={selectedPlan.id === 'basic' ? 999 : selectedPlan.id === 'pro' ? 1999 : 3999}
                    planName={`${selectedPlan.name} Plan`}
                    buttonText={`Pay ${selectedPlan.price} with Razorpay`}
                    className="w-full bg-[#1a68fb] hover:bg-blue-600 active:bg-blue-700 text-white font-extrabold py-4 rounded-2xl shadow-lg shadow-blue-500/25 transition-all text-base flex items-center justify-center gap-2 cursor-pointer transform hover:-translate-y-0.5"
                    onPaymentSuccess={() => onNavigateSuccess()}
                  />

                  {/* Instant Demo Activation Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setLoading(true);
                      setTimeout(() => {
                        setLoading(false);
                        onNavigateSuccess();
                      }, 600);
                    }}
                    disabled={loading}
                    className="w-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold py-3.5 rounded-2xl transition text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Activating Demo Subscription…
                      </>
                    ) : (
                      '🚀 Instant Demo Access (Bypass Payment to Dashboard)'
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-400 pt-6 mt-6 border-t border-slate-100">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Instant Activation • Razorpay Secured • 100% HMAC Verified</span>
              </div>
            </div>

        </div>

      </main>
    </div>
  );
};

