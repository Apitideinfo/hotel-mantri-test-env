import React from 'react';
import {
  Building2, Sparkles, Palmtree, Landmark, Briefcase, Building,
  CheckCircle2, ArrowRight
} from 'lucide-react';

export const WhoIsItForSection: React.FC = () => {
  const AUDIENCES = [
    {
      title: 'Independent Hotels',
      badge: 'Single Property',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: Building2,
      iconColor: 'bg-blue-600 text-white shadow-blue-500/20',
      tagline: 'Complete front-office and channel management without needing an IT team or local server.',
      benefits: [
        '1-Screen Front Desk & Express Check-In',
        'Direct WhatsApp Vouchers & Invoices',
        'Daily 8 AM Owner Financial Digest',
      ],
      highlight: 'Saves 2+ Hours Daily',
    },
    {
      title: 'Boutique Hotels & Havelis',
      badge: 'Experiential Stays',
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: Sparkles,
      iconColor: 'bg-amber-500 text-white shadow-amber-500/20',
      tagline: 'Craft intimate guest experiences with personalized stays, custom rate packages, and digital keys.',
      benefits: [
        'Guest Preferences & Stay History',
        'Direct WhatsApp AI Booking Bot',
        'Contactless Digital Mobile Passes',
      ],
      highlight: '+38% Direct Bookings',
    },
    {
      title: 'Luxury Resorts & Retreats',
      badge: 'Multi-Outlet Estates',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: Palmtree,
      iconColor: 'bg-emerald-600 text-white shadow-emerald-500/20',
      tagline: 'Coordinate villas, multi-outlet dining POS, poolside amenities, and spa treatments seamlessly.',
      benefits: [
        'F&B Restaurant Bills Routed to Room Folios',
        'Advance Booking Deposits & Splits',
        'Mobile Housekeeping Task Tracking',
      ],
      highlight: 'Zero Bill Leakages',
    },
    {
      title: 'Pilgrimage & Spiritual Stays',
      badge: 'High-Velocity Turnover',
      badgeColor: 'bg-orange-50 text-orange-700 border-orange-200',
      icon: Landmark,
      iconColor: 'bg-orange-500 text-white shadow-orange-500/20',
      tagline: 'Handle heavy holiday footfall, large family suites, and rapid turnover without long reception queues.',
      benefits: [
        'Rapid 30-Second Aadhaar Check-In',
        'Bulk Group Rooming & Dharamshala Setup',
        'Daily Cash, UPI & Counter Audit',
      ],
      highlight: 'Zero Lobby Queues',
    },
    {
      title: 'Business & City Hotels',
      badge: 'Corporate Travel',
      badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
      icon: Briefcase,
      iconColor: 'bg-purple-600 text-white shadow-purple-500/20',
      tagline: 'Fast checkouts, automated SAC 9963 GST invoicing, and continuous 2-way OTA channel synchronization.',
      benefits: [
        'Corporate GSTIN Invoice Generation',
        'Instant Stop-Sell on Full Occupancy',
        'Early Check-In / Late Check-Out Controls',
      ],
      highlight: '100% Tax Compliant',
    },
    {
      title: 'Hotel Chains & Groups',
      badge: 'Multi-Property Operators',
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      icon: Building,
      iconColor: 'bg-indigo-600 text-white shadow-indigo-500/20',
      tagline: 'Single unified dashboard to monitor live occupancy, revPAR, and cash flows across all branches.',
      benefits: [
        'Multi-Property Centralized Overview',
        'Cross-Property Inventory Allocation',
        'Consolidated Group P&L Reporting',
      ],
      highlight: 'Centralized Control',
    },
  ];

  return (
    <section className="py-24 sm:py-32 bg-white border-b border-slate-200/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Heading */}
        <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider mb-4 shadow-2xs">
            <Building className="w-3.5 h-3.5 text-blue-600" />
            Tailored For Modern Hospitality
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-[1.15]">
            Who is HotelMantri For?
          </h2>
          <p className="text-base sm:text-lg text-slate-600 mt-3 font-normal leading-relaxed">
            Purpose-built for independent property owners, experiential resorts, and growing hotel groups across India.
          </p>
        </div>

        {/* 6 Rich Archetype Cards (3 cols on lg, 2 on md, 1 on sm) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {AUDIENCES.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="bg-slate-50/70 hover:bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 hover:border-blue-400 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group"
              >
                <div>
                  {/* Top Bar with Icon & Badge */}
                  <div className="flex items-center justify-between mb-5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold shadow-md ${item.iconColor} group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 group-hover:text-blue-600 transition">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                    {item.tagline}
                  </p>

                  {/* 3 Key Benefits */}
                  <div className="mt-5 space-y-2 pt-4 border-t border-slate-200/70">
                    {item.benefits.map((benefit, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-slate-700 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{benefit}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom Highlight Pill */}
                <div className="mt-6 pt-4 border-t border-slate-200/70 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Core Advantage</span>
                  <span className="font-extrabold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200/60">
                    {item.highlight}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
