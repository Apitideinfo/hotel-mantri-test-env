import React from 'react';
import { ArrowRight, Mail } from 'lucide-react';
import { RevealOnScroll } from './RevealOnScroll';

interface TalkToCeoBannerProps {
  onLogin?: () => void;
}

export const TalkToCeoBanner: React.FC<TalkToCeoBannerProps> = ({ onLogin }) => {
  return (
    <section className="relative w-full bg-black text-white py-16 sm:py-24 select-none overflow-hidden border-y border-neutral-800">
      {/* Ambient Gradient Glows */}
      <div className="absolute right-0 top-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute left-0 bottom-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center justify-between">
          
          {/* ── Left Column: Title & Information ── */}
          <div className="lg:col-span-7 flex flex-col justify-center">
            <RevealOnScroll variant="fade-right" duration={700}>
              <span className="text-xs font-bold tracking-[0.25em] text-[#06b6d4] uppercase mb-3 block">
                DIRECT COMMUNICATION
              </span>

              <h3 className="text-2xl sm:text-3xl lg:text-4xl xl:text-[42px] font-extrabold text-white tracking-tight leading-tight mb-3">
                Talk directly with our CEO
              </h3>

              <p className="text-gray-400 text-sm sm:text-base lg:text-[17px] font-normal max-w-xl leading-relaxed mb-8">
                Share feedback, ideas, or concerns — no middle layers. Get dedicated 24/7 onboarding and technical support for your property.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={onLogin}
                  className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-white text-black text-sm font-bold hover:bg-gray-100 active:scale-95 transition-all shadow-lg shrink-0 cursor-pointer"
                >
                  Talk to the CEO
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </RevealOnScroll>
          </div>

          {/* ── Right Column: Exact Contact Information Card (Matching Screenshot 1) ── */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <RevealOnScroll variant="fade-left" duration={700} delay={150} className="w-full max-w-md">
              <div className="bg-white rounded-[22px] p-6 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.35)] border border-white/20 text-slate-900 transition-all duration-300 hover:shadow-[0_25px_60px_rgba(6,182,212,0.2)]">
                
                {/* 1. Email Support Row */}
                <a
                  href="mailto:booking@hotelmantri.com"
                  className="group flex items-center gap-4 p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  {/* Blue circular icon with white mail symbol */}
                  <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-[#0070F3] text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
                    <Mail className="w-6 h-6 stroke-[2.2]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs sm:text-[13px] font-bold text-[#0070F3] tracking-wide">
                      Email Support
                    </div>
                    <div className="text-base sm:text-lg lg:text-[19px] font-extrabold text-[#0B1527] tracking-tight truncate mt-0.5 group-hover:text-[#0070F3] transition-colors">
                      booking@hotelmantri.com
                    </div>
                  </div>
                </a>

                {/* Subtle Divider Line */}
                <div className="my-3 border-t border-gray-100" />

                {/* 2. Call / WhatsApp Support Row */}
                <a
                  href="https://wa.me/919925958831"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-4 p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  {/* Green circular icon with white WhatsApp symbol */}
                  <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-[#16A34A] text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
                    <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs sm:text-[13px] font-bold text-[#15803D] tracking-wide">
                      Call / WhatsApp Support
                    </div>
                    <div className="text-base sm:text-lg lg:text-[21px] font-extrabold text-[#0B1527] tracking-tight truncate mt-0.5 group-hover:text-[#15803D] transition-colors">
                      +91 99259 58831
                    </div>
                  </div>
                </a>

              </div>
            </RevealOnScroll>
          </div>

        </div>
      </div>
    </section>
  );
};
