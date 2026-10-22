import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

export const HowItWorks: React.FC = () => {
  const STEPS = [
    {
      num: '1',
      title: 'Setup Your Property',
      desc: 'Add basic details',
    },
    {
      num: '2',
      title: 'Add Rooms & Rates',
      desc: 'Configure your inventory',
    },
    {
      num: '3',
      title: 'Connect Your Channels',
      desc: 'Link your OTAs',
    },
    {
      num: '4',
      title: 'Train Your Team',
      desc: 'Quick and easy training',
    },
    {
      num: '5',
      title: 'Start Managing',
      desc: 'Run your hotel smoothly',
    },
  ];

  return (
    <section id="how-it-works" className="py-20 sm:py-24 bg-slate-50 border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        
        {/* Section Header */}
        <div className="max-w-xl mx-auto mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            How HotelMantri Works
          </h2>
          <p className="text-base text-slate-600 mt-2 font-normal">
            Get started in simple steps.
          </p>
        </div>

        {/* 5 Steps Connected Flow */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-stretch relative">
          {STEPS.map((s, idx) => (
            <div key={s.num} className="relative flex flex-col items-center">
              {/* Step Card */}
              <div className="w-full bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-blue-400 transition-all flex flex-col items-center text-center h-full">
                <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center mb-3 shadow-xs">
                  {s.num}
                </div>
                <h3 className="text-sm font-bold text-slate-900 leading-tight">
                  {s.title}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {s.desc}
                </p>
              </div>

              {/* Connecting Arrow for Desktop (between items) */}
              {idx < STEPS.length - 1 && (
                <div className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-slate-300">
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </div>
              )}
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};
