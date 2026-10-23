import React from 'react';
import { Star, Building2, Quote, ShieldCheck, CheckCircle2, TrendingUp, Award } from 'lucide-react';

export const TestimonialsSection: React.FC = () => {
  const METRICS = [
    { label: 'Verified Properties', val: '500+' },
    { label: 'Direct Bookings Processed', val: '₹40Cr+' },
    { label: 'OTA Overbooking Rate', val: '0.0%' },
    { label: 'Hoteliers Satisfaction', val: '4.9 / 5' },
  ];

  const TESTIMONIALS = [
    {
      hotel: 'The Grand Heritage Fort & Palace',
      location: 'Udaipur, Rajasthan',
      owner: 'Vikramaditya Rathore',
      role: 'Managing Director & Owner',
      rooms: '52 Luxury Heritage Rooms',
      initials: 'VR',
      color: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
      metricBadge: '+46% Direct Bookings · 0% Comm.',
      quote:
        '“HotelMantri replaced three clunky, disconnected software tools for us. Front desk staff learned it in 20 minutes, and having the daily financial digest sent to my personal WhatsApp every morning at 8 AM gives me complete operational peace of mind when traveling.”',
    },
    {
      hotel: 'Hotel Gopal & Dev Inn Suites',
      location: 'Dwarka & Somnath, Gujarat',
      owner: 'Sanjaybhai Patel',
      role: 'Managing Trustee & Owner',
      rooms: '44 Rooms · High Footfall Stay',
      initials: 'SP',
      color: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
      metricBadge: '45-Sec Check-in · 0 Overbookings',
      quote:
        '“During Janmashtami festival rush, our reception used to have 40-minute guest queues. With HotelMantri’s mobile QR check-in and 2-way MMT channel sync, we cleared arrivals in seconds. We haven’t had a single double-booking in over 14 months.”',
    },
    {
      hotel: 'Azure Sands Beach Resort & Cabanas',
      location: 'North Goa, Goa',
      owner: 'Capt. Rahul D’Souza',
      role: 'Founder & General Manager',
      rooms: '28 Luxury Beachfront Villas',
      initials: 'RD',
      color: 'bg-sky-500/20 text-sky-300 border-sky-400/40',
      metricBadge: 'Saved ₹2.4 Lakhs/mo in OTA Fees',
      quote:
        '“The WhatsApp Direct AI Booking bot is genuinely a game changer. Guests booking from our Instagram or Google profile receive live room rates, pay via UPI, and get confirmed vouchers right in WhatsApp. It generated 72 commission-free bookings last month alone.”',
    },
  ];

  return (
    <section className="relative py-24 sm:py-32 bg-[#050A18] text-white overflow-hidden border-b border-slate-800">
      {/* Background Ambience with Hotel Sunset Vignette */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-15 mix-blend-luminosity scale-105 pointer-events-none"
        style={{ backgroundImage: `url('/hotel_sunset_cabana.jpg')` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#050A18] via-[#050A18]/90 to-[#050A18]" />

      {/* Warm Ambient Glows */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 z-10">
        
        {/* Section Heading */}
        <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-bold uppercase tracking-wider mb-4 shadow-[0_0_20px_rgba(251,191,36,0.15)]">
            <Award className="w-3.5 h-3.5" />
            TRUSTED BY HOTELIERS ACROSS INDIA
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-[1.15]">
            Simpler Operations. Happier Guests. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-400">
              Stronger Hotel Business.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-slate-300 mt-4 font-normal leading-relaxed">
            Independent property owners, heritage havelis, and luxury resorts trust HotelMantri to run daily front-desk operations and multiply direct profits.
          </p>
        </div>

        {/* 4 Numbers Banner Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-14 max-w-5xl mx-auto">
          {METRICS.map((m) => (
            <div
              key={m.label}
              className="bg-slate-900/80 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-slate-800/90 text-center shadow-lg"
            >
              <p className="text-2xl sm:text-3xl font-black text-white font-mono">{m.val}</p>
              <p className="text-xs text-slate-400 mt-1 font-medium">{m.label}</p>
            </div>
          ))}
        </div>

        {/* 3 Real Testimonial Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.hotel}
              className="relative bg-slate-900/85 backdrop-blur-xl rounded-3xl p-6 sm:p-7 border border-slate-800 hover:border-amber-500/40 shadow-2xl flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 group"
            >
              <div>
                {/* Top Row: Monogram, Name & 5-Star Rating */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm border ${t.color} shadow-sm group-hover:scale-105 transition`}>
                      {t.initials}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white leading-tight">{t.owner}</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">{t.role}</p>
                    </div>
                  </div>

                  <div className="flex text-amber-400">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />
                    ))}
                  </div>
                </div>

                {/* Property & Location Tag */}
                <div className="bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800/80 mb-4 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-200 truncate pr-2">🏨 {t.hotel}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">{t.location}</span>
                </div>

                {/* Key ROI Metric Pill */}
                <div className="mb-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                  <TrendingUp className="w-3 h-3" />
                  {t.metricBadge}
                </div>

                {/* The Quote */}
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
                  {t.quote}
                </p>
              </div>

              {/* Bottom Verification Footer */}
              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span className="text-slate-400">{t.rooms}</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Verified Hoteliers
                </span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};
