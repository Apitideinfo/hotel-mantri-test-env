import React from 'react';
import { Building2, Sparkles, Palmtree, Landmark, Briefcase, Building } from 'lucide-react';

export const WhoIsItForSection: React.FC = () => {
  const AUDIENCES = [
    {
      title: 'Independent Hotels',
      icon: Building2,
      desc: 'Single-property owners who need full control without IT complexity.',
    },
    {
      title: 'Boutique Hotels',
      icon: Sparkles,
      desc: 'Charming experiential stays focusing on guest delight and custom services.',
    },
    {
      title: 'Resorts',
      icon: Palmtree,
      desc: 'Vacation destinations managing rooms, amenities, dining and packages.',
    },
    {
      title: 'Pilgrimage Hotels',
      icon: Landmark,
      desc: 'High-turnover spiritual properties requiring fast check-in and bulk groups.',
    },
    {
      title: 'Business Hotels',
      icon: Briefcase,
      desc: 'City properties serving corporate guests with GST billing and express checkout.',
    },
    {
      title: 'Hotel Groups',
      icon: Building,
      desc: 'Multi-property operators needing centralized overview and unified reporting.',
    },
  ];

  return (
    <section className="py-20 sm:py-28 bg-white border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        
        {/* Section Heading */}
        <div className="max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Who is HotelMantri For?
          </h2>
          <p className="text-base sm:text-lg text-slate-600 mt-2 font-normal">
            Designed for all types of hotels and hospitality properties.
          </p>
        </div>

        {/* 6 Clean Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-5">
          {AUDIENCES.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/80 hover:border-blue-400 hover:bg-blue-50/30 hover:shadow-md transition-all duration-200 flex flex-col items-center text-center group"
              >
                <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 text-blue-600 flex items-center justify-center mb-3 shadow-2xs group-hover:scale-110 transition">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 leading-tight">
                  {item.title}
                </h3>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
