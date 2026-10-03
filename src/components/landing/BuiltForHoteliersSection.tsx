import React from 'react';

export const BuiltForHoteliersSection: React.FC = () => {
  return (
    <section className="relative w-full py-20 lg:py-28 bg-white text-slate-900 select-none overflow-hidden border-b border-gray-100">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10">
        
        {/* 2-Column Grid: Left Title only, Right Content + Image */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
          
          {/* ── Left Column: Heading ── */}
          <div className="lg:col-span-5">
            <h2 className="text-3xl sm:text-4xl lg:text-[50px] font-extrabold text-black tracking-tight leading-[1.08]">
              Built for hoteliers,<br />
              by hoteliers.
            </h2>
          </div>

          {/* ── Right Column: Descriptive Paragraphs & Photo Card ── */}
          <div className="lg:col-span-7 flex flex-col">
            
            {/* Paragraphs */}
            <div className="flex flex-col gap-4 text-gray-700 text-sm sm:text-[15px] leading-relaxed font-normal mb-8 max-w-2xl">
              <p>
                HotelMantri unifies PMS, channel management, and bookings into one platform. No more juggling disconnected systems or scattered workflows.
              </p>
              <p>
                Technology should stay invisible and effortless. So your team can focus on guests while operations run smoothly.
              </p>
            </div>

            {/* Photo Card inside the Right Column */}
            <div className="relative w-full h-[280px] sm:h-[380px] lg:h-[440px] rounded-2xl sm:rounded-3xl overflow-hidden shadow-lg border border-gray-100 group">
              <img
                src="/hotel_sunset_cabana.jpg"
                alt="Built for Hoteliers - Luxury Resort Cabana"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
              />
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
