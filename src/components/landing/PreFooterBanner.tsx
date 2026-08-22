import React from 'react';

export const PreFooterBanner: React.FC = () => {
  return (
    <section className="relative w-full overflow-hidden bg-[#06152F] select-none border-t border-white/10">
      <div className="w-full relative group">
        <img
          src="/pre_footer_banner.png"
          alt="HotelMantri Special Banner"
          className="w-full h-auto object-cover object-center max-h-[380px] sm:max-h-[480px] lg:max-h-[550px] shadow-2xl transition-transform duration-700 group-hover:scale-[1.01]"
        />
        {/* Soft edge overlay gradient for seamless transition */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#06152F]/80 via-transparent to-[#06152F]/40 pointer-events-none" />
      </div>
    </section>
  );
};
