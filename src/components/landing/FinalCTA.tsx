import React from 'react';
import { ArrowRight, Phone, Mail, Globe, Sparkles } from 'lucide-react';

interface FinalCTAProps {
  onLogin: () => void;
  onOpenBookDemo: () => void;
}

export const FinalCTA: React.FC<FinalCTAProps> = ({ onLogin, onOpenBookDemo }) => {
  return (
    <section id="cta" className="relative py-24 sm:py-32 bg-gradient-to-b from-[#070D1D] via-[#0A1329] to-[#050914] text-white overflow-hidden">
      {/* Background Ambience with Reception Image Overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-15 mix-blend-luminosity scale-105"
        style={{ backgroundImage: `url('/hotel_hero.jpg')` }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#070D1D] via-[#0A1329]/90 to-[#070D1D]/70 pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          
          {/* Left Column: Heading, Subtitle & Action Buttons */}
          <div className="lg:col-span-8 space-y-6 text-left">
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.12]">
              Your Hotel Deserves <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-500">
                a Smarter Way to Run.
              </span>
            </h2>

            <p className="text-base sm:text-lg text-slate-300 max-w-xl font-normal leading-relaxed">
              Bring your reservations, operations, finance and distribution together with HotelMantri.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 pt-2">
              <button
                onClick={onOpenBookDemo}
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-gradient-to-r from-amber-400 via-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-extrabold text-sm sm:text-base shadow-xl shadow-amber-500/25 hover:shadow-amber-500/35 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
              >
                Book Free Demo <ArrowRight className="w-4 h-4 text-slate-950" />
              </button>

              <button
                onClick={onLogin}
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white font-semibold text-sm sm:text-base border border-slate-700 hover:border-slate-500 transition cursor-pointer"
              >
                Start Free Trial
              </button>
            </div>
          </div>

          {/* Right Column: Direct Contact Details */}
          <div className="lg:col-span-4 bg-slate-900/80 backdrop-blur-md p-6 sm:p-7 rounded-3xl border border-slate-700/80 shadow-2xl text-left space-y-4">
            <h4 className="text-sm font-extrabold text-white uppercase tracking-wider text-slate-300">
              Direct Contact
            </h4>

            <div className="space-y-3 text-sm text-slate-300">
              <a
                href="tel:+919925958831"
                className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 hover:border-amber-400 hover:text-white transition"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 font-medium">Call or WhatsApp</p>
                  <p className="font-bold text-white">+91 99259 58831</p>
                </div>
              </a>

              <a
                href="mailto:booking@hotelmantri.com"
                className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 hover:border-amber-400 hover:text-white transition"
              >
                <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 font-medium">Email Inquiries</p>
                  <p className="font-bold text-white">booking@hotelmantri.com</p>
                </div>
              </a>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 font-medium">Official Portal</p>
                  <p className="font-bold text-white">www.hotelmantri.com</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
