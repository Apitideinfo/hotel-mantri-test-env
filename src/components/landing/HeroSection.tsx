import React from 'react';
import { ArrowRight, Check } from 'lucide-react';

interface HeroSectionProps {
  onLogin: () => void;
  onOpenBookDemo: () => void;
  onExploreFeatures: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onLogin,
  onOpenBookDemo,
  onExploreFeatures,
}) => {
  return (
    <section className="relative min-h-[580px] sm:min-h-[640px] lg:min-h-[720px] xl:min-h-[780px] flex items-center pt-28 sm:pt-36 pb-16 sm:pb-24 text-white overflow-hidden bg-slate-950">
      {/* ── Background Image: Realistic Luxury Hotel Reception Desk with Laptop Dashboard ── */}
      <div className="absolute inset-0 z-0">
        <img
          src="/luxury_hotel_reception_bg.png"
          alt="Luxury Hotel Management Reception Dashboard"
          className="w-full h-full object-cover object-right pointer-events-none select-none"
        />

        {/* Layer 1: Left-to-right directional gradient for text legibility on the left while showcasing the reception desk & laptop on the right */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/85 md:via-slate-950/70 lg:via-slate-950/40 to-transparent lg:to-slate-950/10" />

        {/* Layer 2: Subtle top vignette to seamlessly integrate with fixed navigation header */}
        <div className="absolute top-0 inset-x-0 h-28 bg-gradient-to-b from-slate-950/90 to-transparent pointer-events-none" />

        {/* Layer 3: Bottom gradient transition into the marquee ticker strip */}
        <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent pointer-events-none" />
      </div>

      <div className="relative z-10 w-full max-w-[1720px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16">
        <div className="max-w-xl lg:max-w-[560px] xl:max-w-[620px] space-y-6 text-left">
          {/* Small Label Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 backdrop-blur-md border border-amber-500/30 text-amber-300 text-xs font-bold uppercase tracking-wider shadow-lg">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-sm shadow-amber-400/50" />
            HOTEL OPERATING SYSTEM FOR MODERN HOTELS
          </div>

          {/* Main Headline */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[56px] xl:text-[62px] font-black tracking-tight text-white leading-[1.12] drop-shadow-md">
            Run Your Entire Hotel <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-500">
              From One Screen.
            </span>
          </h1>

          {/* Subheading */}
          <p className="text-sm sm:text-base md:text-lg text-slate-200 font-normal leading-relaxed drop-shadow-sm max-w-lg">
            Reservations, rooms, channel manager, housekeeping, finance and reports — connected in one simple system.
          </p>

          {/* CTA Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
            <button
              id="hero-book-demo-btn"
              onClick={onOpenBookDemo}
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-gradient-to-r from-amber-400 via-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-extrabold text-sm sm:text-base rounded-full shadow-xl shadow-amber-500/30 hover:shadow-amber-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer"
            >
              Book Free Demo <ArrowRight className="w-4 h-4 text-slate-950 stroke-[2.5]" />
            </button>

            <button
              id="hero-start-trial-btn"
              onClick={onLogin}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-900/90 hover:bg-slate-800/95 text-white font-semibold text-sm sm:text-base rounded-full border border-slate-600/90 hover:border-slate-400 backdrop-blur-md shadow-lg transition-all duration-200 cursor-pointer"
            >
              Start Free Trial
            </button>
          </div>

          {/* Trust Line */}
          <div className="pt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-slate-300">
            <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" /> Simple Setup</span>
            <span className="text-slate-500">•</span>
            <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" /> Staff Friendly</span>
            <span className="text-slate-500">•</span>
            <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" /> Cloud Based</span>
            <span className="text-slate-500">•</span>
            <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" /> For All Types of Hotels</span>
          </div>
        </div>
      </div>
    </section>
  );
};
