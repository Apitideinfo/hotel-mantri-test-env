import React from 'react';
import { Sparkles, ArrowRight, Gift } from 'lucide-react';

interface JanmashtamiBannerProps {
  onClaimOffer: () => void;
}

export const JanmashtamiBanner: React.FC<JanmashtamiBannerProps> = ({ onClaimOffer }) => {
  return (
    <section className="relative w-full py-8 sm:py-10 lg:py-12 bg-[#051126] overflow-hidden select-none border-y border-amber-500/20">
      {/* 1. Ambient Golden Glows & Bokeh Lights */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Soft Golden Spotlight from Top Right */}
        <div className="absolute -top-20 -right-20 w-[500px] h-[400px] bg-amber-500/15 rounded-full blur-[140px]" />
        <div className="absolute top-1/2 left-1/3 -translate-y-1/2 w-[350px] h-[350px] bg-cyan-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-10 w-[300px] h-[300px] bg-yellow-500/10 rounded-full blur-[100px]" />

        {/* Bokeh Circles */}
        <div className="absolute top-6 right-16 w-16 h-16 rounded-full bg-amber-300/10 blur-md animate-pulse" />
        <div className="absolute top-14 right-32 w-10 h-10 rounded-full bg-yellow-400/15 blur-sm" />
        <div className="absolute bottom-6 right-48 w-12 h-12 rounded-full bg-amber-400/10 blur-md" />
        <div className="absolute top-8 right-[25%] w-6 h-6 rounded-full bg-cyan-300/10 blur-sm" />
      </div>

      {/* 2. Festive Mandala Decorative SVG Art Background */}
      <div className="absolute -left-16 -bottom-16 w-64 h-64 opacity-20 pointer-events-none text-amber-400">
        <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="100" cy="100" r="90" strokeDasharray="4 4" />
          <circle cx="100" cy="100" r="70" />
          <circle cx="100" cy="100" r="50" strokeDasharray="2 2" />
          <path d="M100 10 L100 190 M10 100 L190 100 M36 36 L164 164 M36 164 L164 36" opacity="0.6" />
          <polygon points="100,20 120,80 180,100 120,120 100,180 80,120 20,100 80,80" fill="currentColor" fillOpacity="0.05" />
        </svg>
      </div>

      <div className="absolute left-[40%] -bottom-20 w-72 h-72 opacity-15 pointer-events-none text-amber-300">
        <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="1.2">
          <circle cx="100" cy="100" r="80" />
          <polygon points="100,10 130,70 190,100 130,130 100,190 70,130 10,100 70,70" fill="currentColor" fillOpacity="0.08" />
        </svg>
      </div>

      {/* 3. Main Content Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 lg:gap-12">
          
          {/* Left Column: Branding, Title, Subtitle */}
          <div className="max-w-3xl">
            {/* Brand Title with cyan glow */}
            <div className="inline-flex items-center gap-2 mb-3">
              <span className="text-xl sm:text-2xl font-black tracking-tight text-white drop-shadow-[0_0_12px_rgba(34,211,238,0.5)]">
                Hotel<span className="text-cyan-400">Mantri</span>
              </span>
              <span className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-400/30 rounded-full px-2.5 py-0.5 text-[10px] font-bold text-amber-300">
                <Sparkles className="w-3 h-3 text-amber-400" />
                Festive Edition
              </span>
            </div>

            {/* Main Headline */}
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-none mb-3">
              <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-500 bg-clip-text text-transparent">
                JANMASHTAMI
              </span>{' '}
              <span className="text-white">OFFER</span>
            </h2>

            {/* Subtitle & Copy */}
            <p className="text-slate-200 text-base sm:text-lg font-semibold mb-1">
              Celebrate Janmashtami with smarter hotel management.
            </p>
            <p className="text-slate-400 text-xs sm:text-sm font-normal">
              Special festive pricing for hotels, guest houses & boutique resorts.
            </p>
          </div>

          {/* Right Column: Offer Badges & CTAs */}
          <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {/* Special Festive Offer Badge */}
            <div className="inline-flex items-center justify-center gap-2 border border-amber-400/50 bg-amber-500/10 backdrop-blur-md px-5 py-3 rounded-2xl text-xs sm:text-sm font-black tracking-wider text-amber-300 uppercase shadow-lg shadow-amber-500/10">
              <Gift className="w-4 h-4 text-amber-400" />
              <span>SPECIAL FESTIVE OFFER</span>
            </div>

            {/* Claim Offer Button */}
            <button
              onClick={onClaimOffer}
              className="group bg-gradient-to-r from-cyan-400 via-cyan-300 to-blue-500 hover:from-cyan-300 hover:to-blue-600 text-slate-950 font-black text-sm px-7 py-3.5 rounded-2xl shadow-xl shadow-cyan-500/25 transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <span>CLAIM OFFER</span>
              <ArrowRight className="w-4 h-4 text-slate-950 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

        </div>
      </div>
    </section>
  );
};
