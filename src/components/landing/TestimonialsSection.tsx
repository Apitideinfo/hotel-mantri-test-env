import React from 'react';
import { User } from 'lucide-react';

export const TestimonialsSection: React.FC = () => {
  const testimonials = [
    {
      id: 1,
      quote:
        '“Excellent product with seamless OTA integration and intuitive UI. The support team is very responsive and knowledgeable.”',
      author: 'Amit Sharma',
      role: 'Hotel Owner',
    },
    {
      id: 2,
      quote:
        '“Our room and bill order queries were looked after and successfully solved, with continuous efforts from the team and the Owner.”',
      author: 'Sachin Patil',
      role: 'Hotel Owner',
    },
    {
      id: 3,
      quote:
        '“User-friendly interface, comprehensive features for managing reservations, pricing, strong channel management with seamless integration to various OTA platforms, reporting tools, and excellent support.”',
      author: 'Sanjoy Das',
      role: 'Hotel Owner',
    },
    {
      id: 4,
      quote:
        '“HotelMantri has revolutionized the way we manage our hotel. Their software is intuitive, reliable, and customizable to our specific needs. 5 stars isn’t enough - we’d give them 10 stars if we could!”',
      author: 'Sujit Dash',
      role: 'Hotel Owner',
    },
    {
      id: 5,
      quote:
        '“The automated GST invoices, instant WhatsApp room billing, and daily revenue reports save our front desk team over 3 hours every day.”',
      author: 'Priya Nair',
      role: 'General Manager',
    },
    {
      id: 6,
      quote:
        '“Instant two-way sync with MakeMyTrip and Booking.com solved our overbooking problem permanently. Highly recommended for Indian hotels.”',
      author: 'Vikram Mehta',
      role: 'Hotel Director',
    },
  ];

  // Duplicated list for continuous seamless looping marquee
  const marqueeItems = [...testimonials, ...testimonials];

  return (
    <section
      id="testimonials"
      className="relative w-full py-24 lg:py-32 bg-black text-white select-none overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ── Section Header — EXACT matching screenshot ── */}
        <div className="text-center max-w-3xl mx-auto">
          {/* Eyebrow */}
          <span className="text-xs font-bold tracking-[0.25em] text-[#38b6ff] uppercase">
            TESTIMONIALS
          </span>

          {/* Heading */}
          <h2 className="text-3xl sm:text-5xl lg:text-[56px] font-bold text-white tracking-tight leading-[1.12] mt-3 mb-4">
            Beyond expectations
          </h2>

          {/* Subtitle */}
          <p className="text-gray-400 text-base sm:text-lg font-normal leading-relaxed">
            HotelMantri is helping hotels across India streamline operations and grow direct bookings.
          </p>
        </div>
      </div>

      {/* ── Infinite Smooth Right-to-Left Marquee Carousel Track ── */}
      <div className="relative mt-16 w-full overflow-hidden">
        
        {/* Left Edge Dark Gradient Fade */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-24 sm:w-48 bg-gradient-to-r from-black via-black/80 to-transparent z-20" />
        
        {/* Right Edge Dark Gradient Fade */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-24 sm:w-48 bg-gradient-to-l from-black via-black/80 to-transparent z-20" />

        {/* Marquee Animated Flex Container */}
        <div className="animate-marquee flex gap-6 py-4 px-6">
          {marqueeItems.map((item, index) => (
            <div
              key={`${item.id}-${index}`}
              className="w-[320px] sm:w-[370px] shrink-0 bg-[#131315] hover:bg-[#18181b] border border-white/10 hover:border-white/20 rounded-2xl p-7 sm:p-8 flex flex-col justify-between transition-all duration-300 shadow-2xl hover:scale-[1.02]"
            >
              {/* Quote Text */}
              <p className="font-normal italic text-white/90 text-sm sm:text-[15px] leading-relaxed mb-8">
                {item.quote}
              </p>

              {/* Author & Avatar */}
              <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                {/* White Circle Avatar with User Icon */}
                <div className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shrink-0 shadow-md">
                  <User className="w-5 h-5 fill-current text-black stroke-[1.5]" />
                </div>
                <div>
                  <div className="font-bold text-white text-sm tracking-tight">
                    {item.author}
                  </div>
                  <div className="text-xs text-gray-400 font-normal">
                    {item.role}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};
