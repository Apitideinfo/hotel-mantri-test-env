import React from 'react';

export const PreFooterBanner: React.FC = () => {
  return (
    <section className="relative w-full overflow-hidden bg-black select-none border-t border-white/10">
      <div className="w-full relative group">
        <img
          src="/pre_footer_banner.png"
          alt="HotelMantri Special Banner"
          className="w-full h-auto object-cover object-center max-h-[380px] sm:max-h-[480px] lg:max-h-[550px] shadow-2xl transition-transform duration-700 group-hover:scale-[1.01]"
        />
        {/* Soft edge overlay gradient for seamless transition to dark footer */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30 pointer-events-none" />
      </div>
    </section>
  );
};
