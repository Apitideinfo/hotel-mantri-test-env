import React, { useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

interface IntegrationsSectionProps {
  onLogin?: () => void;
}

export const IntegrationsSection: React.FC<IntegrationsSectionProps> = ({ onLogin }) => {
  const [activeCategory, setActiveCategory] = useState<string>('ota');

  const categories = [
    { id: 'ota', label: 'ONLINE TRAVEL AGENCIES' },
    { id: 'payment', label: 'PAYMENT GATEWAYS' },
    { id: 'meta', label: 'META SEARCH ENGINES' },
    { id: 'channel', label: 'CHANNEL MANAGERS' },
    { id: 'b2b', label: 'B2B PARTNERS' },
    { id: 'demand', label: 'DEMAND & SUPPLY PLATFORMS' },
  ];

  // Authentic original vector brand logos without surrounding boxes
  const brandLogos: Record<string, Array<{ id: string; logo: React.ReactNode }>> = {
    ota: [
      {
        id: 'booking',
        logo: (
          <div className="flex items-center">
            <span className="text-[#003580] font-black text-2xl sm:text-[28px] tracking-tight font-sans">
              Booking<span className="text-[#00BAFE]">.com</span>
            </span>
          </div>
        ),
      },
      {
        id: 'easemytrip',
        logo: (
          <div className="flex items-center gap-2.5">
            {/* Turquoise paper airplane */}
            <svg className="w-9 h-7 text-[#00AEEF] shrink-0" viewBox="0 0 36 24" fill="currentColor">
              <path d="M2 12L34 2L20 22L16 14L2 12Z" />
              <path d="M16 14L34 2L22 13L16 14Z" fill="#0077B6" />
            </svg>
            <div className="flex flex-col">
              <span className="text-[18px] sm:text-[20px] font-black tracking-tight text-[#0077B6] font-sans leading-none">
                Ease<span className="text-[#00AEEF]">My</span>Trip<span className="text-xs text-gray-500 font-semibold">.com</span>
              </span>
              <span className="text-[9px] font-serif italic text-gray-400 font-normal tracking-wide mt-0.5">
                Take It Easy
              </span>
            </div>
          </div>
        ),
      },
      {
        id: 'goibibo',
        logo: (
          <div className="flex items-center">
            <span className="font-black text-2xl sm:text-[28px] tracking-tighter font-sans">
              <span className="text-[#F1592A]">go</span><span className="text-[#1A73E8]">ibibo</span>
            </span>
          </div>
        ),
      },
      {
        id: 'makemytrip',
        logo: (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-900 font-extrabold text-xl sm:text-2xl font-sans tracking-tight">
              make
            </span>
            <div className="bg-[#EB2026] text-white font-black text-sm sm:text-base px-2 py-0.5 rounded-md leading-none flex items-center justify-center">
              my
            </div>
            <span className="text-gray-900 font-extrabold text-xl sm:text-2xl font-sans tracking-tight">
              trip
            </span>
          </div>
        ),
      },
      {
        id: 'agoda',
        logo: (
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#4CAF50]"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#9C27B0]"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#FFC107]"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#F44336]"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#00BCD4]"></span>
            </div>
            <span className="text-gray-900 font-black text-2xl sm:text-[28px] tracking-tight leading-none font-sans">
              agoda
            </span>
          </div>
        ),
      },
      {
        id: 'expedia',
        logo: (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FFCC00] flex items-center justify-center shrink-0 shadow-xs">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path d="M5 19L19 5M19 5H9M19 5V15" stroke="#00355F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-2xl sm:text-[26px] font-black tracking-tight text-[#00355F] font-sans">
              Expedia
            </span>
          </div>
        ),
      },
      {
        id: 'airbnb',
        logo: (
          <div className="flex items-center gap-2">
            <svg className="w-8 h-8 text-[#FF385C] shrink-0" viewBox="0 0 32 32" fill="currentColor">
              <path d="M16 1C11.5 1 8 4.5 8 9c0 5 6 13 8 16 2-3 8-11 8-16 0-4.5-3.5-8-8-8zm0 11a3 3 0 110-6 3 3 0 010 6z" />
            </svg>
            <span className="text-gray-900 font-black text-2xl sm:text-[28px] tracking-tight font-sans">
              airbnb
            </span>
          </div>
        ),
      },
      {
        id: 'tripadvisor',
        logo: (
          <div className="flex items-center gap-2">
            <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" fill="#34E0A1" />
              <circle cx="11" cy="16" r="3.5" fill="white" stroke="#000" strokeWidth="1.5" />
              <circle cx="21" cy="16" r="3.5" fill="white" stroke="#000" strokeWidth="1.5" />
              <circle cx="11" cy="16" r="1.5" fill="#E02020" />
              <circle cx="21" cy="16" r="1.5" fill="#34E0A1" />
              <path d="M14 12L16 9L18 12" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-gray-900 font-black text-xl sm:text-2xl tracking-tight font-sans">
              Tripadvisor
            </span>
          </div>
        ),
      },
    ],
    payment: [
      {
        id: 'razorpay',
        logo: (
          <div className="flex items-center gap-2">
            <svg className="w-8 h-8 text-[#0284C7] shrink-0" viewBox="0 0 32 32" fill="currentColor">
              <path d="M10 28L18 4H26L18 28H10ZM16 16L24 16L20 28L16 28L16 16Z" />
            </svg>
            <span className="text-2xl sm:text-[26px] font-black tracking-tight text-[#0C2340] font-sans">
              Razorpay
            </span>
          </div>
        ),
      },
      {
        id: 'phonepe',
        logo: (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#5F259F] flex items-center justify-center text-white font-black text-sm shrink-0">
              पे
            </div>
            <span className="text-2xl sm:text-[26px] font-black tracking-tight text-[#5F259F] font-sans">
              PhonePe
            </span>
          </div>
        ),
      },
      {
        id: 'paytm',
        logo: (
          <div className="flex items-center">
            <span className="text-2xl sm:text-[28px] font-black tracking-tight font-sans text-[#002970]">
              Pay<span className="text-[#00BAF2]">tm</span>
            </span>
          </div>
        ),
      },
      {
        id: 'gpay',
        logo: (
          <div className="flex items-center gap-2">
            <svg className="w-8 h-8 shrink-0" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="15" fill="white" stroke="#E2E8F0" />
              <path d="M22.5 16.2c0-.5-.04-1-.12-1.5H16v2.8h3.7a3.2 3.2 0 01-1.4 2.1v1.7h2.2c1.3-1.2 2-3 2-5.1z" fill="#4285F4"/>
              <path d="M16 23c1.9 0 3.5-.6 4.6-1.7l-2.2-1.7c-.6.4-1.4.7-2.4.7-1.8 0-3.4-1.2-4-2.9H9.7v1.8C10.9 21.4 13.3 23 16 23z" fill="#34A853"/>
              <path d="M12 17.4c-.1-.4-.2-.9-.2-1.4 0-.5.1-1 .2-1.4V12.8H9.7A7 7 0 009 16c0 1.1.3 2.2.7 3.2l2.3-1.8z" fill="#FBBC05"/>
              <path d="M16 11.9c1 0 2 .4 2.7 1.1l2-2A7 7 0 0016 9c-2.7 0-5.1 1.6-6.3 3.8l2.3 1.8c.6-1.7 2.2-2.7 4-2.7z" fill="#EA4335"/>
            </svg>
            <span className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 font-sans">
              Google <span className="text-blue-600 font-extrabold">Pay</span>
            </span>
          </div>
        ),
      },
      {
        id: 'stripe',
        logo: (
          <div className="flex items-center">
            <span className="text-2xl sm:text-[28px] font-black tracking-tight text-[#635BFF] font-sans">
              stripe
            </span>
          </div>
        ),
      },
    ],
    meta: [
      {
        id: 'google-hotels',
        logo: (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-white border border-gray-200 flex items-center justify-center font-black text-sm text-red-500 shrink-0 shadow-xs">
              G
            </div>
            <span className="text-xl sm:text-2xl font-bold text-gray-900 font-sans">
              Google Hotels
            </span>
          </div>
        ),
      },
      {
        id: 'trivago',
        logo: (
          <div className="flex items-center">
            <span className="text-2xl sm:text-[28px] font-black tracking-tight font-sans">
              <span className="text-blue-600">tri</span><span className="text-amber-500">va</span><span className="text-rose-600">go</span>
            </span>
          </div>
        ),
      },
      {
        id: 'kayak',
        logo: (
          <div className="flex items-center">
            <span className="text-2xl sm:text-[28px] font-black tracking-widest text-[#FF690F] uppercase font-sans">
              KAYAK
            </span>
          </div>
        ),
      },
      {
        id: 'skyscanner',
        logo: (
          <div className="flex items-center gap-1.5">
            <span className="text-[#0770E3] text-2xl font-black">✈</span>
            <span className="text-2xl sm:text-[28px] font-black tracking-tight text-[#0770E3] font-sans">
              Skyscanner
            </span>
          </div>
        ),
      },
    ],
    channel: [
      {
        id: 'siteminder',
        logo: (
          <div className="flex items-center">
            <span className="text-2xl sm:text-[28px] font-black tracking-tight text-[#00205B] font-sans">
              SiteMinder
            </span>
          </div>
        ),
      },
      {
        id: 'staah',
        logo: (
          <div className="flex items-center">
            <span className="text-2xl sm:text-[28px] font-black tracking-wider text-[#EE3124] uppercase font-sans">
              STAAH
            </span>
          </div>
        ),
      },
      {
        id: 'rategain',
        logo: (
          <div className="flex items-center">
            <span className="text-2xl sm:text-[28px] font-black tracking-tight text-[#1A73E8] font-sans">
              RateGain
            </span>
          </div>
        ),
      },
    ],
    b2b: [
      {
        id: 'tbo',
        logo: (
          <div className="flex items-center">
            <span className="text-2xl sm:text-[28px] font-black tracking-tight text-[#0084FF] font-sans">
              TBO Holidays
            </span>
          </div>
        ),
      },
      {
        id: 'hotelbeds',
        logo: (
          <div className="flex items-center">
            <span className="text-2xl sm:text-[28px] font-black tracking-tight text-[#E60000] font-sans">
              hotelbeds
            </span>
          </div>
        ),
      },
    ],
    demand: [
      {
        id: 'amadeus',
        logo: (
          <div className="flex items-center">
            <span className="text-2xl sm:text-[28px] font-black tracking-wider text-[#005EB8] uppercase font-sans">
              AMADEUS
            </span>
          </div>
        ),
      },
      {
        id: 'sabre',
        logo: (
          <div className="flex items-center">
            <span className="text-2xl sm:text-[28px] font-black tracking-wider text-[#E51937] uppercase font-sans">
              SABRE
            </span>
          </div>
        ),
      },
    ],
  };

  const currentLogos = brandLogos[activeCategory] || brandLogos.ota;
  const marqueeLogos = [...currentLogos, ...currentLogos, ...currentLogos];

  return (
    <section
      id="integrations"
      className="relative w-full py-20 lg:py-28 bg-white text-slate-900 select-none overflow-hidden border-b border-gray-100"
    >
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10">
        
        {/* Top Split: Left Headline/Desc, Right 6 Category Tabs */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start mb-12">
          
          {/* Left Side */}
          <div className="lg:col-span-6 flex flex-col justify-center">
            <span className="text-xs font-bold tracking-[0.25em] text-gray-500 uppercase block mb-3">
              INTEGRATIONS
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-extrabold text-black tracking-tight leading-[1.12] mb-4">
              Connect with your tools
            </h2>
            <p className="text-gray-600 text-sm sm:text-base leading-relaxed font-normal max-w-lg">
              Seamlessly integrate with the platforms and services you already use. Build workflows that work for you.
            </p>
          </div>

          {/* Right Side: Category Pill Tabs */}
          <div className="lg:col-span-6 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {categories.map((cat) => {
              const isSelected = activeCategory === cat.id;

              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3.5 py-3 rounded-xl text-[11px] sm:text-xs font-bold tracking-wider text-center transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-black text-white border-black shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200/90 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

        </div>
      </div>

      {/* Continuous Moving Integrations Marquee Track — Edge to edge full screen width without logo box frames */}
      <div className="w-full overflow-hidden relative py-10 my-4 border-t border-b border-gray-100 bg-gray-50/40">
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-24 sm:w-44 bg-gradient-to-r from-white via-white/80 to-transparent z-10" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-24 sm:w-44 bg-gradient-to-l from-white via-white/80 to-transparent z-10" />

        <div className="flex animate-marquee items-center gap-12 sm:gap-18">
          {marqueeLogos.map((item, idx) => (
            <div
              key={`${item.id}-${idx}`}
              className="px-6 sm:px-10 flex items-center justify-center shrink-0 cursor-pointer hover:scale-110 transition-transform duration-200"
            >
              {item.logo}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10">
        {/* Custom Integration Callout Card */}
        <div className="w-full mt-10 p-7 sm:p-9 lg:p-10 rounded-3xl bg-gray-50/90 border border-gray-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-sm">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <Sparkles className="w-5 h-5 text-cyan-600" />
              <h4 className="font-bold text-gray-950 text-base sm:text-lg lg:text-xl tracking-tight">
                Need a custom integration?
              </h4>
            </div>
            <p className="text-gray-500 text-xs sm:text-sm lg:text-[15px] font-normal max-w-2xl">
              Our API and developer tools make it easy to build exactly what you need.
            </p>
          </div>

          <button
            onClick={onLogin}
            className="animate-pulse-shake inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-black text-white text-xs sm:text-sm font-bold hover:bg-neutral-800 transition-all shadow-md shrink-0 cursor-pointer"
          >
            Integration Hub
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </section>
  );
};
