import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { RevealOnScroll } from './RevealOnScroll';

interface CoreModulesSectionProps {
  onSelectCategory?: (category: string) => void;
  onExploreModule?: (moduleId: string) => void;
}

export const CoreModulesSection: React.FC<CoreModulesSectionProps> = ({
  onSelectCategory,
  onExploreModule,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const categories = [
    { id: 'all', label: 'ALL', hasArrow: true },
    { id: 'operations', label: 'OPERATIONS', hasArrow: false },
    { id: 'distribution', label: 'DISTRIBUTION', hasArrow: false },
    { id: 'guest_experience', label: 'GUEST EXPERIENCE', hasArrow: false },
    { id: 'finance', label: 'FINANCE', hasArrow: false },
  ];

  const modules = [
    {
      id: 'core-pms',
      category: 'operations',
      categoryTag: 'OPERATIONS',
      categoryColor: 'text-[#1D63ED]',
      title: 'HotelMantri Core PMS',
      description: 'A cloud-based Front Desk system designed for speed and reliability.',
      image: '/card_pms.jpg',
    },
    {
      id: 'channel-manager',
      category: 'distribution',
      categoryTag: 'DISTRIBUTION',
      categoryColor: 'text-[#0E7490]',
      title: 'Channel Manager',
      description: 'Real-time sync with 100+ OTAs, including Booking.com, Expedia, and Airbnb.',
      image: '/card_channel.jpg',
    },
    {
      id: 'booking-engine',
      category: 'distribution',
      categoryTag: 'DISTRIBUTION',
      categoryColor: 'text-[#0E7490]',
      title: 'Direct Booking Engine',
      description: 'A stunning, mobile-responsive booking engine for your website.',
      image: '/card_booking.jpg',
    },
    {
      id: 'guest-experience',
      category: 'guest_experience',
      categoryTag: 'GUEST EXPERIENCE',
      categoryColor: 'text-[#B45309]',
      title: 'Guest Experience & CRM',
      description: 'Allow guests to check in, order room service, and communicate with staff.',
      image: '/card_guest.jpg',
    },
    {
      id: 'pos-system',
      category: 'finance',
      categoryTag: 'FINANCE',
      categoryColor: 'text-[#047857]',
      title: 'Smart Point of Sale (POS)',
      description: 'Integrated POS for your restaurant, bar, spa, and room service.',
      image: '/card_pos.jpg',
    },
    {
      id: 'revenue-intelligence',
      category: 'finance',
      categoryTag: 'FINANCE',
      categoryColor: 'text-[#1D63ED]',
      title: 'Revenue & Reports Intelligence',
      description: 'Advanced reporting and analytics to track ADR, RevPAR, and occupancy trends in real-time.',
      image: '/card_revenue.jpg',
    },
  ];

  const handleCategoryClick = (catId: string) => {
    setActiveCategory(catId);
    if (onSelectCategory) onSelectCategory(catId);
  };

  const filteredModules =
    activeCategory === 'all'
      ? modules
      : modules.filter((m) => m.category === activeCategory);

  return (
    <section
      id="features"
      className="relative w-full py-20 lg:py-28 bg-white text-slate-900 select-none overflow-hidden border-b border-gray-100"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* ── Section Header ── */}
        <RevealOnScroll variant="fade-up" duration={700}>
          <div className="text-center max-w-3xl mx-auto">
            {/* Eyebrow */}
            <span className="text-xs font-bold tracking-[0.25em] text-gray-800 uppercase">
              THE PLATFORM
            </span>

            {/* Title */}
            <h2 className="text-3xl sm:text-5xl lg:text-[52px] font-bold text-black tracking-tight leading-[1.12] mt-3 mb-4">
              Core Modules
            </h2>

            {/* Subtitle */}
            <p className="text-gray-600 text-base sm:text-lg font-normal leading-relaxed">
              Everything you need to run your property, all in one place.
            </p>
          </div>
        </RevealOnScroll>

        {/* ── Category Filter Tabs (Pill Buttons) ── */}
        <RevealOnScroll variant="fade-up" duration={600} delay={100}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 max-w-4xl mx-auto">
            {categories.map((cat) => {
              const isActive = activeCategory === cat.id;

              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(cat.id)}
                  className={`px-6 py-2.5 rounded-lg text-xs sm:text-[13px] font-bold tracking-wider uppercase transition-all duration-200 flex items-center gap-1.5 cursor-pointer select-none ${
                    isActive
                      ? 'bg-black text-white shadow-md scale-105'
                      : 'bg-white text-gray-700 hover:text-black border border-gray-200/90 hover:border-gray-400 shadow-sm'
                  }`}
                >
                  <span>{cat.label}</span>
                  {cat.hasArrow && <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />}
                </button>
              );
            })}
          </div>
        </RevealOnScroll>

        {/* ── Core Modules Card Grid with Staggered Entrance ── */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredModules.map((card, idx) => (
            <RevealOnScroll
              key={card.id}
              variant="fade-up"
              duration={650}
              delay={idx * 90}
            >
              <div
                onClick={() => onExploreModule && onExploreModule(card.id)}
                className="group bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-[0_2px_14px_rgba(0,0,0,0.04)] hover:shadow-[0_16px_36px_rgba(0,0,0,0.12)] transition-all duration-300 flex flex-col cursor-pointer hover:-translate-y-1.5 h-full"
              >
                {/* Card Image Area with "View Features" overlay on hover */}
                <div className="relative h-56 sm:h-60 w-full overflow-hidden bg-gray-100">
                  <img
                    src={card.image}
                    alt={card.title}
                    className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700 ease-out"
                    loading="lazy"
                  />
                  
                  {/* Center Hover Pill: "View Features" */}
                  <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <span className="px-5 py-2 rounded-full bg-black/85 backdrop-blur-md text-white font-medium text-xs tracking-wide shadow-xl transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                      View Features
                    </span>
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-6 sm:p-7 flex flex-col flex-1">
                  {/* Category Tag */}
                  <span className={`text-[11px] font-bold tracking-wider uppercase ${card.categoryColor}`}>
                    {card.categoryTag}
                  </span>

                  {/* Card Title */}
                  <h3 className="text-xl font-bold text-gray-950 mt-2 mb-2 tracking-tight group-hover:text-blue-600 transition-colors">
                    {card.title}
                  </h3>

                  {/* Card Description */}
                  <p className="text-gray-500 text-sm leading-relaxed mb-6 flex-1">
                    {card.description}
                  </p>

                  {/* Learn more link */}
                  <div className="pt-2 flex items-center gap-1 text-xs font-bold text-gray-700 group-hover:text-blue-600 transition-colors">
                    <span>Learn more</span>
                    <span className="text-sm font-normal">›</span>
                  </div>
                </div>
              </div>
            </RevealOnScroll>
          ))}
        </div>

      </div>
    </section>
  );
};
