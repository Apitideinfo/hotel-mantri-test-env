import React, { useState } from 'react';
import {
  Key,
  UtensilsCrossed,
  BellRing,
  BarChart3,
  Lock,
  Sparkles,
  Coffee,
  MapPin,
  MessageSquare,
  TrendingUp,
  FileSpreadsheet,
  ArrowRight,
  Home,
  LayoutGrid,
} from 'lucide-react';
import { RevealOnScroll } from './RevealOnScroll';

interface ManagementShowcaseSectionProps {
  onLogin?: () => void;
}

export const ManagementShowcaseSection: React.FC<ManagementShowcaseSectionProps> = ({
  onLogin,
}) => {
  const [activeTab, setActiveTab] = useState<'checkin' | 'room' | 'concierge' | 'analytics'>('analytics');
  const [activeCard, setActiveCard] = useState<number>(1); // Default active card

  const tabs = [
    { id: 'checkin' as const, label: 'Digital Check-in', icon: Key },
    { id: 'room' as const, label: 'Room Service', icon: UtensilsCrossed },
    { id: 'concierge' as const, label: 'Concierge', icon: BellRing },
    { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
  ];

  const tabData = {
    checkin: {
      cards: [
        {
          title: 'Express Check-in',
          desc: 'Quick guest onboarding automation.',
          icon: Key,
        },
        {
          title: 'Mobile Key',
          desc: 'Issue secure mobile keys.',
          icon: Lock,
        },
      ],
      image: '/banner_checkin.jpg',
    },
    room: {
      cards: [
        {
          title: 'Housekeeping Scheduler',
          desc: 'Guests request cleaning easily.',
          icon: Sparkles,
        },
        {
          title: 'In-room Dining',
          desc: 'Order food directly via app.',
          icon: Coffee,
        },
      ],
      image: '/banner_room.jpg',
    },
    concierge: {
      cards: [
        {
          title: 'Local Experiences',
          desc: 'Curated tours and transport bookings.',
          icon: MapPin,
        },
        {
          title: 'Guest Concierge Chat',
          desc: 'Instant 24/7 guest requests and fulfillment.',
          icon: MessageSquare,
        },
      ],
      image: '/banner_checkin.jpg',
    },
    analytics: {
      cards: [
        {
          title: 'Live Dashboard',
          desc: 'Real-time KPIs & revenue insights.',
          icon: TrendingUp,
        },
        {
          title: 'Revenue Reports',
          desc: 'Deep analytics with exports.',
          icon: FileSpreadsheet,
        },
      ],
      image: '/banner_analytics.jpg',
    },
  };

  const current = tabData[activeTab];

  const stats = [
    { value: '400+', label: 'HOTELS WORLDWIDE' },
    { value: '98%', label: 'GUEST SATISFACTION' },
    { value: '24/7', label: 'SUPPORT AVAILABLE' },
    { value: '1M+', label: 'BOOKINGS PROCESSED' },
  ];

  const metricCards = [
    {
      category: 'CITIES',
      value: '100+',
      description: 'Cities where HotelMantri is active',
      icon: MapPin,
    },
    {
      category: 'HOTELS',
      value: '400+',
      description: 'Hotels worldwide and growing',
      icon: Home,
    },
    {
      category: 'SCALE',
      value: '1M+',
      description: 'Bookings Managed',
      icon: TrendingUp,
    },
    {
      category: 'FEATURES',
      value: '80+',
      description: 'Exciting features in HotelMantri',
      icon: LayoutGrid,
    },
  ];

  return (
    <section className="relative w-full py-20 lg:py-28 bg-white text-slate-900 select-none overflow-hidden border-b border-gray-100">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10">

        {/* ══════════════════════════════════════════════════════════
            PART 1: INTERACTIVE MANAGEMENT SHOWCASE
           ══════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">

          {/* ── Left Column: Title, Subtitle, 4 Tabs & 2 Detail Cards ── */}
          <div className="lg:col-span-7 flex flex-col justify-center">
            <RevealOnScroll variant="fade-right" duration={700}>
              {/* Eyebrow */}
              <span className="text-xs font-bold tracking-[0.25em] text-gray-500 uppercase">
                MANAGEMENT
              </span>

              {/* Title */}
              <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-extrabold text-black tracking-tight leading-[1.12] mt-2 mb-2">
                Premium Hotel Management
              </h2>

              {/* Subtitle */}
              <p className="text-gray-500 text-sm sm:text-base font-normal mb-8">
                Elevate your guest experience with intelligent automation
              </p>

              {/* 4 Feature Selector Icons */}
              <div className="flex items-center gap-5 sm:gap-7 mb-8 overflow-x-auto pb-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isSelected = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setActiveCard(0);
                      }}
                      className="flex flex-col items-center gap-2 group cursor-pointer text-center shrink-0"
                    >
                      <div
                        className={`w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all duration-300 border ${
                          isSelected
                            ? 'bg-[#e0f7fa] border-2 border-[#06b6d4] text-[#0891b2] shadow-md ring-2 ring-cyan-400/20 scale-105'
                            : 'bg-black text-white border-black hover:bg-neutral-800 shadow-sm hover:scale-105'
                        }`}
                      >
                        <Icon className="w-5 h-5 sm:w-6 sm:h-6 stroke-[1.8]" />
                      </div>
                      <span
                        className={`text-xs font-bold transition-colors ${
                          isSelected ? 'text-black' : 'text-gray-600 group-hover:text-black'
                        }`}
                      >
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 2 Interactive Detail Cards (Side by Side) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {current.cards.map((card, idx) => {
                  const IconComp = card.icon;
                  const isSelected = activeCard === idx;

                  return (
                    <button
                      key={card.title}
                      onClick={() => setActiveCard(idx)}
                      className={`w-full text-left p-4 sm:p-5 rounded-2xl transition-all duration-200 flex items-center gap-4 cursor-pointer border ${
                        isSelected
                          ? 'bg-[#e0f7fa] border-[#06b6d4] shadow-md ring-1 ring-cyan-400/30 translate-y-[-2px]'
                          : 'bg-white border-gray-200/90 hover:border-gray-300 shadow-sm'
                      }`}
                    >
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
                          isSelected
                            ? 'bg-[#0891b2] text-white border-[#0891b2] shadow-sm'
                            : 'bg-black text-white border-black'
                        }`}
                      >
                        <IconComp className="w-5 h-5 stroke-[1.8]" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-950 text-sm sm:text-[15px] tracking-tight">
                          {card.title}
                        </h4>
                        <p className="text-gray-500 text-xs mt-0.5 leading-snug">
                          {card.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </RevealOnScroll>
          </div>

          {/* ── Right Column: Visual Photo Banner with Text Overlay ── */}
          <div className="lg:col-span-5">
            <RevealOnScroll variant="fade-left" duration={700} delay={100}>
              <div className="relative h-[320px] sm:h-[380px] lg:h-[400px] w-full rounded-3xl overflow-hidden shadow-xl border border-gray-100 group">
                <img
                  src={current.image}
                  alt="Hotel Excellence Showcase"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                />

                {/* Dark Gradient Overlay for Bottom Banner Text */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent flex flex-col justify-end p-6 sm:p-8">
                  <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    Experience Excellence
                  </h3>
                  <p className="text-gray-300 text-xs sm:text-sm font-normal mt-1">
                    Redefining hospitality through technology
                  </p>
                </div>
              </div>
            </RevealOnScroll>
          </div>

        </div>

        {/* ══════════════════════════════════════════════════════════
            PART 2: STATS COUNTER ROW (400+, 98%, 24/7, 1M+)
           ══════════════════════════════════════════════════════════ */}
        <RevealOnScroll variant="fade-up" duration={700}>
          <div className="mt-20 pt-12 border-t border-gray-100">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 lg:gap-12 text-left">
              {stats.map((stat, i) => (
                <div key={i} className="flex flex-col group">
                  <div className="text-2xl sm:text-3xl lg:text-[32px] font-black text-black tracking-tight leading-none group-hover:text-blue-600 transition-colors">
                    {stat.value}
                  </div>
                  <div className="text-[10px] sm:text-[11px] font-bold text-gray-500 tracking-wider uppercase mt-2">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </RevealOnScroll>

        {/* ══════════════════════════════════════════════════════════
            PART 3: PERFORMANCE METRICS SECTION
           ══════════════════════════════════════════════════════════ */}
        <div className="mt-16 pt-14 border-t border-gray-100 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          
          {/* Left Side: 2x2 Grid of 4 Cards */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {metricCards.map((card, idx) => {
              const IconComp = card.icon;
              return (
                <RevealOnScroll
                  key={idx}
                  variant="fade-up"
                  duration={600}
                  delay={idx * 80}
                >
                  <div className="p-6 sm:p-7 rounded-2xl bg-white border border-gray-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-col justify-between hover:border-gray-300 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 h-full">
                    <div className="flex items-center justify-between text-gray-400 mb-4">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                        {card.category}
                      </span>
                      <IconComp className="w-4 h-4 text-gray-400 stroke-[1.75]" />
                    </div>
                    <div>
                      <div className="text-3xl sm:text-4xl font-black text-black tracking-tight mb-3">
                        {card.value}
                      </div>
                      <p className="text-xs text-gray-500 font-normal leading-relaxed">
                        {card.description}
                      </p>
                    </div>
                  </div>
                </RevealOnScroll>
              );
            })}
          </div>

          {/* Right Side: Performance Metrics Copy & Action Buttons */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            <RevealOnScroll variant="fade-left" duration={700} delay={150}>
              <span className="text-xs font-bold tracking-[0.2em] text-black uppercase mb-3 block">
                PERFORMANCE METRICS
              </span>

              <h2 className="text-3xl sm:text-4xl lg:text-[40px] font-extrabold text-black tracking-tight leading-[1.15] mb-4">
                HotelMantri grows.<br />
                Your hotels grow faster.
              </h2>

              <p className="text-gray-600 text-sm sm:text-[15px] font-normal leading-relaxed mb-8 max-w-lg">
                Our infrastructure is designed to scale effortlessly with your business. With a focus on speed, uptime, and reliability, we keep your operations running smoothly while your hotels grow.
              </p>

              <div className="flex flex-wrap items-center gap-3.5">
                <button
                  onClick={onLogin}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-black text-white text-sm font-bold hover:bg-neutral-800 active:scale-[0.99] transition-all shadow-sm cursor-pointer"
                >
                  Try HotelMantri Now
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={onLogin}
                  className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-white text-black border border-black text-sm font-bold hover:bg-gray-50 active:scale-[0.99] transition-all cursor-pointer"
                >
                  Unlock a Free Trial
                </button>
              </div>
            </RevealOnScroll>
          </div>

        </div>

      </div>
    </section>
  );
};
