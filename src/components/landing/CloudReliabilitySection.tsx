import React from 'react';

export const CloudReliabilitySection: React.FC = () => {
  return (
    <section className="relative w-full bg-[#f8fafc] text-slate-900 select-none overflow-hidden border-b border-gray-100">
      <div className="grid grid-cols-1 lg:grid-cols-2 w-full min-h-[460px] lg:min-h-[580px]">
        
        {/* Left Column: Full-bleed Hero Photo */}
        <div className="relative w-full h-[360px] sm:h-[460px] lg:h-full min-h-[360px] lg:min-h-[540px] overflow-hidden group">
          <img
            src="/hotel_manager_mobile.jpg"
            alt="Cloud-Native Reliability for Hotel Management"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
          />
        </div>

        {/* Right Column: Innovation Headline & Text */}
        <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-20 py-16 lg:py-24 bg-[#f8fafc]">
          <span className="text-xs font-bold tracking-[0.25em] text-black uppercase mb-3 block">
            INNOVATION
          </span>

          <h2 className="text-3xl sm:text-4xl lg:text-[46px] font-extrabold text-black tracking-tight leading-[1.12] mb-4">
            Cloud-Native Reliability.
          </h2>

          <p className="text-gray-600 text-sm sm:text-base lg:text-[17px] font-normal leading-relaxed max-w-lg">
            Secure cloud PMS with 99.9% uptime. Access anytime, anywhere.
          </p>
        </div>

      </div>
    </section>
  );
};
