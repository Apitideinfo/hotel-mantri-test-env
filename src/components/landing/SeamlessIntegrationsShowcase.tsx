import React from 'react';
import { RevealOnScroll } from './RevealOnScroll';

export const SeamlessIntegrationsShowcase: React.FC = () => {
  return (
    <section className="relative w-full bg-black text-white select-none overflow-hidden border-b border-neutral-900">
      <div className="grid grid-cols-1 lg:grid-cols-2 w-full min-h-[460px] lg:min-h-[580px]">
        
        {/* Left Column: Dark Ecosystem Copy */}
        <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-20 py-16 lg:py-24 bg-black">
          <RevealOnScroll variant="fade-right" duration={700}>
            <span className="text-xs font-bold tracking-[0.25em] text-[#06b6d4] uppercase mb-3 block">
              ECOSYSTEM
            </span>

            <h2 className="text-3xl sm:text-4xl lg:text-[46px] font-extrabold text-white tracking-tight leading-[1.12] mb-4">
              Seamless Integrations.
            </h2>

            <p className="text-gray-400 text-sm sm:text-base lg:text-[17px] font-normal leading-relaxed max-w-lg">
              Open API. Seamless integrations. Everything works together.
            </p>
          </RevealOnScroll>
        </div>

        {/* Right Column: Full-bleed Reception / POS Image */}
        <RevealOnScroll variant="fade-left" duration={700} delay={100} className="w-full h-full">
          <div className="relative w-full h-[360px] sm:h-[460px] lg:h-full min-h-[360px] lg:min-h-[540px] overflow-hidden group">
            <img
              src="/hotel_seamless_integration.jpg"
              alt="Seamless Integrations and POS Connectivity"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
            />
          </div>
        </RevealOnScroll>

      </div>
    </section>
  );
};
