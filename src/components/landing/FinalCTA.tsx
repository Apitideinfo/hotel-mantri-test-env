import React from 'react';
import { ArrowRight, ShieldCheck, Zap } from 'lucide-react';

interface FinalCTAProps {
  onLogin: () => void;
}

export const FinalCTA: React.FC<FinalCTAProps> = ({ onLogin }) => {
  return (
    <section className="py-20 lg:py-28 bg-white text-slate-900 select-none overflow-hidden border-b border-gray-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        
        <div className="bg-[#0c0c0e] text-white rounded-[32px] p-10 sm:p-16 shadow-2xl relative overflow-hidden">
          
          {/* Eyebrow tag */}
          <span className="inline-block px-4 py-1 rounded-full bg-white/10 text-cyan-400 font-bold text-xs tracking-[0.2em] uppercase border border-white/15 mb-6">
            START TODAY
          </span>

          {/* Title */}
          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-[1.12] mb-4">
            Ready to upgrade your hotel management?
          </h2>

          {/* Subtitle */}
          <p className="text-gray-400 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto mb-8 font-normal">
            Join hundreds of Indian hoteliers who trust HotelMantri to run fast check-ins, automated GST billing, and real-time revenue analytics.
          </p>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onLogin}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-white hover:bg-gray-100 text-black font-bold text-sm sm:text-base transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5 cursor-pointer"
            >
              <span>Get Started Free</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={onLogin}
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 rounded-xl bg-transparent hover:bg-white/10 text-white font-semibold text-sm sm:text-base border border-white/30 hover:border-white/60 transition-all duration-200 cursor-pointer"
            >
              Book a 1-on-1 Demo
            </button>
          </div>

          {/* Trust points */}
          <div className="mt-10 pt-8 border-t border-white/10 flex flex-wrap items-center justify-center gap-6 text-xs text-gray-400 font-medium">
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-400" /> No credit card required</span>
            <span className="flex items-center gap-1.5"><Zap className="w-4 h-4 text-amber-400" /> Setup in 10 minutes</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-cyan-400" /> 100% Indian GST ready</span>
          </div>

        </div>

      </div>
    </section>
  );
};
