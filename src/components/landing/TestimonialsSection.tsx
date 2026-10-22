import React from 'react';
import { Star, Building2, Quote } from 'lucide-react';

export const TestimonialsSection: React.FC = () => {
  const TESTIMONIALS = [
    {
      hotel: 'Hotel Gopal Dwarka',
      role: 'Hotel Owner',
      quote:
        '“HotelMantri has made our daily operations so much easier. Everything from reservations to reports is in one place.”',
    },
    {
      hotel: 'Dev Inn Somnath',
      role: 'Management Team',
      quote:
        '“The operations board and finance reports are very helpful. Our staff picked it up quickly without needing technical training.”',
    },
    {
      hotel: 'Nivedanam Somnath',
      role: 'Hotel Owner',
      quote:
        '“Channel Manager and WhatsApp reports save a lot of time. Very useful for our hotel and keeps inventory synced 24/7.”',
    },
  ];

  return (
    <section className="relative py-24 sm:py-32 bg-slate-950 text-white overflow-hidden">
      {/* Background Image with Dark Vignette */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-25 mix-blend-luminosity scale-105"
        style={{ backgroundImage: `url('/hotel_sunset_cabana.jpg')` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/90" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="text-left mb-12 sm:mb-16 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-amber-400 text-xs font-bold uppercase tracking-wider mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> TRUSTED BY HOTELIERS
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-[1.18]">
            Simpler Operations. <br />
            Happier Guests. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-400">
              Stronger Business.
            </span>
          </h2>
        </div>

        {/* 3 Real Testimonial Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.hotel}
              className="bg-white/95 backdrop-blur-md rounded-2xl p-6 sm:p-7 text-slate-900 border border-white/20 shadow-xl shadow-black/40 flex flex-col justify-between hover:translate-y-[-2px] transition duration-200"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center font-bold text-xs">
                      <Building2 className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900 leading-tight">{t.hotel}</h4>
                      <p className="text-[11px] font-semibold text-slate-500">{t.role}</p>
                    </div>
                  </div>
                  <div className="flex text-amber-400">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />
                    ))}
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-normal">
                  {t.quote}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                <span>Verified Independent Hotel</span>
                <span className="text-emerald-600 font-semibold">Active Property</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
