import React from 'react';
import { RevealOnScroll } from './RevealOnScroll';

export const TrustedPioneersSection: React.FC = () => {
  const brandLogos = [
    {
      id: 'porvorim-regency',
      component: (
        <div className="flex items-center px-3">
          <div className="flex flex-col text-center">
            <span className="text-[11px] font-black tracking-widest text-black leading-tight uppercase font-serif">
              PORVORIM
            </span>
            <span className="text-[9px] font-bold tracking-[0.25em] text-neutral-600 leading-tight uppercase">
              REGENCY
            </span>
            <span className="text-[7px] font-semibold tracking-widest text-neutral-400 uppercase">
              GOA
            </span>
          </div>
        </div>
      ),
    },
    {
      id: 'hotel-orange',
      component: (
        <div className="flex items-center gap-2.5 px-3">
          <svg className="w-8 h-8 shrink-0" viewBox="0 0 36 36" fill="none">
            <circle cx="18" cy="18" r="16" fill="#FFF7ED" />
            <path
              d="M18 6C11.37 6 6 11.37 6 18C6 24.63 11.37 30 18 30C24.63 30 30 24.63 30 18C30 11.37 24.63 6 18 6ZM18 26C13.58 26 10 22.42 10 18C10 13.58 13.58 10 18 10C22.42 10 26 13.58 26 18C26 22.42 22.42 26 18 26Z"
              fill="#F97316"
            />
            <path
              d="M18 10C13.58 10 10 13.58 10 18C10 20.21 10.9 22.21 12.34 23.66L23.66 12.34C22.21 10.9 20.21 10 18 10Z"
              fill="#EA580C"
            />
          </svg>
          <div className="flex flex-col">
            <span className="text-[8px] font-bold tracking-[0.25em] text-gray-500 uppercase">
              HOTEL
            </span>
            <span className="text-[13px] font-black tracking-wider text-orange-600 uppercase font-sans -mt-0.5">
              ORANGE
            </span>
          </div>
        </div>
      ),
    },
    {
      id: 'centaur-hotels',
      component: (
        <div className="flex items-center px-3">
          <div className="flex items-center tracking-wider text-blue-900 font-extrabold text-[15px] font-sans">
            <span>CENT</span>
            <span className="text-red-600 relative">
              A
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-0.5 bg-red-600 rounded-full"></span>
            </span>
            <span>UR</span>
            <span className="ml-1.5 text-xs text-blue-800 font-semibold tracking-normal">HOTELS</span>
          </div>
        </div>
      ),
    },
    {
      id: 'river-and-sky',
      component: (
        <div className="flex items-center gap-1.5 px-3">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1">
              <span className="text-[15px] font-serif font-black italic text-red-600 tracking-tight">
                River
              </span>
              <svg className="w-4 h-4 text-amber-500 animate-spin-slow" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="4" fill="#F59E0B" />
                <path d="M12 2V5M12 19V22M2 12H5M19 12H22M4.93 4.93L7.05 7.05M16.95 16.95L19.07 19.07M4.93 19.07L7.05 16.95M16.95 7.05L19.07 4.93" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="text-[15px] font-serif font-black italic text-red-600 tracking-tight">
                Sky
              </span>
            </div>
            <span className="text-[7px] font-bold tracking-[0.3em] text-emerald-800 uppercase -mt-0.5">
              RESORTS
            </span>
          </div>
        </div>
      ),
    },
    {
      id: 'mayur',
      component: (
        <div className="flex items-center px-3">
          <div className="flex flex-col">
            <span className="text-xl font-serif italic font-black text-amber-700 tracking-wide">
              Mayur®
            </span>
            <span className="text-[7px] font-semibold tracking-widest text-amber-900 uppercase -mt-1">
              HOTEL & BANQUET
            </span>
          </div>
        </div>
      ),
    },
    {
      id: 'bsg-hotels',
      component: (
        <div className="flex items-center px-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black tracking-widest text-black border-r border-neutral-300 pr-2 font-sans">
              BSG
            </span>
            <span className="text-[11px] font-extrabold tracking-wider text-neutral-800 uppercase">
              HOTELS GROUP
            </span>
          </div>
        </div>
      ),
    },
    {
      id: 'flora-inn',
      component: (
        <div className="flex items-center gap-2 px-3">
          <svg className="w-7 h-7 shrink-0" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="8" fill="#FFF1F2" />
            <path d="M18 10C18 10 14 14 14 17C14 19.2 15.8 21 18 21C20.2 21 22 19.2 22 17C22 14 18 10 18 10Z" fill="#E11D48" />
            <circle cx="13" cy="19" r="3" fill="#FB7185" />
            <circle cx="23" cy="19" r="3" fill="#FB7185" />
          </svg>
          <div className="flex flex-col">
            <span className="text-[13px] font-black tracking-wider text-rose-950 uppercase">
              FLORA INN
            </span>
            <span className="text-[8px] font-bold tracking-widest text-rose-600 uppercase -mt-0.5">
              BOUTIQUE SUITES
            </span>
          </div>
        </div>
      ),
    },
    {
      id: 'crimson-hotels',
      component: (
        <div className="flex items-center gap-2 px-3">
          <svg className="w-7 h-7 shrink-0" viewBox="0 0 36 36" fill="none">
            <path d="M18 4L28 9V18C28 24.5 23.7 30.5 18 32C12.3 30.5 8 24.5 8 18V9L18 4Z" fill="#DC2626" />
            <path d="M14 15L18 12L22 15V21L18 24L14 21V15Z" fill="white" />
          </svg>
          <div className="flex flex-col">
            <span className="text-[13px] font-black tracking-wider text-red-950 uppercase font-serif">
              CRIMSON HOTELS
            </span>
            <span className="text-[8px] font-bold tracking-widest text-red-600 uppercase -mt-0.5">
              LUXURY COLLECTION
            </span>
          </div>
        </div>
      ),
    },
    {
      id: 'shree-inn',
      component: (
        <div className="flex items-center gap-2 px-3">
          <svg className="w-7 h-7 shrink-0" viewBox="0 0 36 36" fill="none">
            <circle cx="18" cy="18" r="16" fill="#FFF7ED" stroke="#EA580C" strokeWidth="1.5" />
            <path d="M18 6V30M6 18H30M9.5 9.5L26.5 26.5M9.5 26.5L26.5 9.5" stroke="#EA580C" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="18" cy="18" r="4" fill="#EA580C" />
          </svg>
          <div className="flex flex-col">
            <span className="text-[13px] font-black tracking-wider text-gray-900 uppercase font-serif">
              SHREE INN
            </span>
            <span className="text-[8px] font-bold tracking-[0.2em] text-orange-600 uppercase -mt-0.5">
              HOTELS & RESORTS
            </span>
          </div>
        </div>
      ),
    },
  ];

  // Tripled array for continuous seamless infinite marquee
  const marqueeItems = [...brandLogos, ...brandLogos, ...brandLogos];

  return (
    <section className="relative w-full py-12 lg:py-16 bg-white border-b border-gray-100 select-none overflow-hidden">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* ── Left Title ── */}
          <div className="lg:col-span-4 shrink-0">
            <RevealOnScroll variant="fade-right" duration={700}>
              <h3 className="text-xl sm:text-2xl font-extrabold text-black tracking-tight leading-snug">
                Trusted by hospitality<br className="hidden sm:inline" />
                {' '}pioneers around the world
              </h3>
            </RevealOnScroll>
          </div>

          {/* ── Right Moving Marquee Ticker ── */}
          <div className="lg:col-span-8 overflow-hidden relative">
            <RevealOnScroll variant="fade-left" duration={700} delay={100}>
              {/* Left & Right Gradient Fades for smooth edge look */}
              <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-r from-white via-white/80 to-transparent z-10" />
              <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-l from-white via-white/80 to-transparent z-10" />

              {/* Continuous Marquee Track */}
              <div className="flex animate-marquee items-center gap-10 sm:gap-14 py-2">
                {marqueeItems.map((item, idx) => (
                  <div
                    key={`${item.id}-${idx}`}
                    className="shrink-0 transition-transform duration-200 hover:scale-105 flex items-center justify-center"
                  >
                    {item.component}
                  </div>
                ))}
              </div>
            </RevealOnScroll>
          </div>

        </div>
      </div>
    </section>
  );
};
