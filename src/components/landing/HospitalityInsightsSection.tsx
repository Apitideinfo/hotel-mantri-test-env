import React from 'react';
import { ArrowRight } from 'lucide-react';

export const HospitalityInsightsSection: React.FC = () => {
  const insights = [
    {
      image: '/card_booking.jpg',
      date: 'MAY 15, 2025',
      title: 'Maximizing ADR in 2025',
      desc: 'Strategies for increasing Average Daily Rate without sacrificing occupancy.',
    },
    {
      image: '/banner_room.jpg',
      date: 'APRIL 22, 2025',
      title: 'The Contactless Guest Journey',
      desc: 'How technology is reshaping the front desk experience.',
    },
    {
      image: '/card_pms.jpg',
      date: 'APRIL 05, 2025',
      title: 'Direct Booking Strategies',
      desc: 'Reducing OTA reliance and building guest loyalty.',
    },
  ];

  return (
    <section className="relative w-full py-20 lg:py-28 bg-white text-slate-900 select-none overflow-hidden border-b border-gray-100">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10">
        
        {/* Eyebrow & Title */}
        <div className="mb-12">
          <span className="text-xs font-bold tracking-[0.25em] text-gray-500 uppercase block mb-2">
            KNOWLEDGE BASE
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-extrabold text-black tracking-tight leading-[1.12]">
            Hospitality Insights
          </h2>
        </div>

        {/* 3 Insight Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {insights.map((item, idx) => (
            <div
              key={idx}
              className="group flex flex-col bg-white rounded-3xl overflow-hidden border border-gray-200/90 shadow-sm hover:shadow-xl hover:border-gray-300 transition-all duration-300 cursor-pointer hover:-translate-y-1"
            >
              {/* Photo */}
              <div className="relative h-48 sm:h-56 w-full overflow-hidden bg-gray-100">
                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                />
              </div>

              {/* Text content */}
              <div className="p-6 sm:p-7 flex flex-col justify-between flex-1">
                <div>
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-2">
                    {item.date}
                  </span>
                  <h3 className="text-lg sm:text-xl font-bold text-gray-950 tracking-tight leading-snug group-hover:text-blue-600 transition-colors mb-2">
                    {item.title}
                  </h3>
                  <p className="text-gray-500 text-xs sm:text-sm font-normal leading-relaxed">
                    {item.desc}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-gray-100 flex items-center gap-1 text-xs font-bold text-black group-hover:text-blue-600 transition-colors">
                  <span>Read Article</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};
