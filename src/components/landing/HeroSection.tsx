import React, { useState, useEffect } from 'react';

interface HeroSectionProps {
  onLogin?: () => void;
  onExploreFeatures?: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onLogin, onExploreFeatures }) => {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 60);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="relative w-full min-h-[90vh] md:min-h-[92vh] overflow-hidden select-none flex items-center justify-center bg-[#111] pt-16">

      {/* ── Hotel lobby atrium background image — Clean, natural & uniform ── */}
      <div className="absolute inset-0 w-full h-full">
        <img
          src="/hero_bg.jpg"
          alt="Luxury Hotel Atrium"
          className="w-full h-full object-cover object-center brightness-[0.65] contrast-[1.05]"
          draggable={false}
        />
        
        {/* Clean uniform dark overlay — no blotchy radial patches */}
        <div className="absolute inset-0 bg-black/45 pointer-events-none" />
      </div>

      {/* ── Hero Content — Perfectly Centered with crisp white typography ── */}
      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 text-center py-24 md:py-32 flex flex-col items-center justify-center">

        {/* ── Main Headline — Pure clean bold text ── */}
        <h1
          className={`font-bold text-white leading-[1.08] tracking-tight transition-all duration-700 ease-out
            text-4xl sm:text-6xl md:text-7xl lg:text-[80px] xl:text-[86px]
            ${loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}
          `}
        >
          Unified <span className="text-[#38b6ff]">Hospitality</span>
          <br />
          Management.
        </h1>

        {/* ── Subtitle — Crisp white text ── */}
        <p
          className={`mt-6 text-white/95 text-base sm:text-lg md:text-[19px] font-normal leading-relaxed max-w-2xl mx-auto transition-all duration-700 ease-out delay-150
            ${loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
          `}
        >
          One platform to manage reservations, distribution, and guest experiences.
        </p>

        {/* ── Action Buttons ── */}
        <div
          className={`mt-8 flex flex-row items-center justify-center gap-4 transition-all duration-700 ease-out delay-300
            ${loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
          `}
        >
          {/* Left Button — Solid Black */}
          <button
            id="hero-primary-btn"
            onClick={onLogin}
            className="px-7 py-3 rounded-lg bg-black hover:bg-neutral-900 text-white font-medium text-sm sm:text-[15px] transition-all duration-200 cursor-pointer shadow-lg hover:shadow-black/60 hover:-translate-y-0.5 active:translate-y-0"
          >
            Try Hotel Mantri Now
          </button>

          {/* Right Button — Translucent Dark with white border */}
          <button
            id="hero-secondary-btn"
            onClick={onExploreFeatures}
            className="px-7 py-3 rounded-lg bg-[#2a2a2a]/75 hover:bg-[#383838]/85 text-white font-medium text-sm sm:text-[15px] border border-white/30 hover:border-white/50 backdrop-blur-md transition-all duration-200 cursor-pointer shadow-lg hover:-translate-y-0.5 active:translate-y-0"
          >
            Unlock a Free Trial
          </button>
        </div>
      </div>

    </section>
  );
};
