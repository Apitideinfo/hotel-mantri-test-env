import React from 'react';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { Logo } from '../components/login/Logo';

interface PaymentSuccessScreenProps {
  onGoToDashboard: () => void;
}

export const PaymentSuccessScreen: React.FC<PaymentSuccessScreenProps> = ({ onGoToDashboard }) => {
  return (
    <div className="min-h-screen bg-[#06152F] text-white font-sans antialiased flex flex-col items-center justify-center p-6 selection:bg-blue-500 selection:text-white">
      <div className="max-w-md w-full bg-slate-900/90 border border-white/15 rounded-3xl p-8 sm:p-10 text-center backdrop-blur-xl shadow-2xl shadow-black/80">
        <div className="flex justify-center mb-6">
          <Logo light />
        </div>

        <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/30">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <h1 className="text-3xl font-black text-white mb-2 tracking-tight">You're all set!</h1>
        <p className="text-slate-300 text-sm leading-relaxed mb-8">
          Your HotelMantri account is ready. Let's get your hotel operations running smarter.
        </p>

        <div className="space-y-3">
          <button
            onClick={onGoToDashboard}
            className="group w-full bg-[#1a68fb] hover:bg-blue-600 active:bg-blue-700 text-white font-extrabold py-4 rounded-2xl shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 text-base cursor-pointer transform hover:-translate-y-0.5"
          >
            <span>Go to Dashboard</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>

          <button
            onClick={onGoToDashboard}
            className="w-full bg-white/10 hover:bg-white/15 text-slate-300 font-semibold py-3 rounded-2xl transition text-sm cursor-pointer"
          >
            View Account
          </button>
        </div>
      </div>
    </div>
  );
};
