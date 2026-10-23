import React from 'react';
import {
  ArrowRight, Sparkles, CheckCircle2, ShieldCheck, Clock,
  Smartphone, Radio, Calendar, Check, Zap, Users
} from 'lucide-react';

interface HowItWorksProps {
  onOpenBookDemo?: () => void;
}

export const HowItWorks: React.FC<HowItWorksProps> = ({ onOpenBookDemo }) => {
  const STEPS = [
    {
      step: '01',
      time: '15 Minutes',
      badge: 'Quick Setup',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
      title: 'Setup Property & Inventory',
      desc: 'Add your room types, seasonal tariffs, and GST rates. Our hospitality onboarding team migrates your existing reservations in minutes.',
      tags: ['Room Types', 'Seasonal Tariffs', 'GST & SAC 9963'],
      visual: (
        <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 space-y-1.5 text-[10.5px]">
          <div className="flex items-center justify-between text-slate-700 font-semibold">
            <span className="flex items-center gap-1 text-emerald-600">
              <Check className="w-3 h-3 text-emerald-600" /> 32 Rooms Configured
            </span>
            <span className="text-slate-400">Deluxe & Suites</span>
          </div>
          <div className="flex items-center justify-between text-slate-700 font-semibold">
            <span className="flex items-center gap-1 text-emerald-600">
              <Check className="w-3 h-3 text-emerald-600" /> Rate Plans Loaded
            </span>
            <span className="text-slate-400">CP & MAP Plans</span>
          </div>
        </div>
      ),
    },
    {
      step: '02',
      time: 'Same Day',
      badge: 'Zero Tech Hassle',
      badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
      title: 'Connect OTA Channels',
      desc: 'Link MakeMyTrip, Booking.com, Agoda, and Airbnb. 2-way real-time synchronization activates immediately with overbooking safeguards.',
      tags: ['MMT & Booking.com', 'Live 2-Way Sync', 'Parity Guard'],
      visual: (
        <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 space-y-1.5 text-[10.5px]">
          <div className="flex items-center justify-between text-slate-700 font-semibold">
            <span className="flex items-center gap-1 text-emerald-600">
              <Check className="w-3 h-3 text-emerald-600" /> 5 OTAs Connected
            </span>
            <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded text-[9.5px]">
              Active
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-700 font-semibold">
            <span className="flex items-center gap-1 text-emerald-600">
              <Check className="w-3 h-3 text-emerald-600" /> Zero Overbooking
            </span>
            <span className="text-slate-400">Auto Stop-Sell</span>
          </div>
        </div>
      ),
    },
    {
      step: '03',
      time: 'Instant',
      badge: 'Direct Profit',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      title: 'Turn on WhatsApp Automation',
      desc: 'Activate your official hotel WhatsApp. Let the AI booking concierge handle enquiries, collect UPI prepayments, and dispatch vouchers.',
      tags: ['AI Booking Bot', 'UPI Payment Link', 'Daily 8 AM Digest'],
      visual: (
        <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 space-y-1.5 text-[10.5px]">
          <div className="flex items-center justify-between text-slate-700 font-semibold">
            <span className="flex items-center gap-1 text-emerald-600">
              <Check className="w-3 h-3 text-emerald-600" /> 24/7 AI Concierge
            </span>
            <span className="text-emerald-600 font-bold">&lt; 3s Reply</span>
          </div>
          <div className="flex items-center justify-between text-slate-700 font-semibold">
            <span className="flex items-center gap-1 text-emerald-600">
              <Check className="w-3 h-3 text-emerald-600" /> Owner Flash Digest
            </span>
            <span className="text-slate-400">8:00 AM Daily</span>
          </div>
        </div>
      ),
    },
    {
      step: '04',
      time: 'Effortless',
      badge: 'Total Control',
      badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
      title: 'Front-Desk & Auto Night Audit',
      desc: 'Front desk checks in guests in 30 seconds with mobile QR keys, restaurant orders route to room folios, and midnight audit runs automatically.',
      tags: ['1-Tap Check-In', 'F&B Folio Billing', 'Auto Reconciled'],
      visual: (
        <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 space-y-1.5 text-[10.5px]">
          <div className="flex items-center justify-between text-slate-700 font-semibold">
            <span className="flex items-center gap-1 text-emerald-600">
              <Check className="w-3 h-3 text-emerald-600" /> QR Contactless Key
            </span>
            <span className="text-purple-700 font-bold bg-purple-50 px-1.5 py-0.2 rounded text-[9.5px]">
              Ready
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-700 font-semibold">
            <span className="flex items-center gap-1 text-emerald-600">
              <Check className="w-3 h-3 text-emerald-600" /> Zero Double Entry
            </span>
            <span className="text-slate-400">Auto Ledger</span>
          </div>
        </div>
      ),
    },
  ];

  return (
    <section id="how-it-works" className="py-24 sm:py-32 bg-slate-50/70 border-b border-slate-200/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200/90 text-blue-700 text-xs font-bold uppercase tracking-wider mb-4 shadow-2xs">
            <Clock className="w-3.5 h-3.5" />
            Simple 4-Step Onboarding Journey
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-[1.15]">
            How HotelMantri Works. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600">
              Live in Under 24 Hours.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-slate-600 mt-4 font-normal leading-relaxed">
            No complex hardware installations or painful training cycles. Switch your hotel to HotelMantri smoothly with our step-by-step assisted setup.
          </p>
        </div>

        {/* 4 Process Milestone Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
          {STEPS.map((s, idx) => (
            <div
              key={s.step}
              className="bg-white rounded-3xl p-6 border border-slate-200/90 hover:border-blue-400 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group relative"
            >
              <div>
                {/* Step Number & Time Pill */}
                <div className="flex items-center justify-between mb-4">
                  <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-sm flex items-center justify-center shadow-md shadow-blue-500/20 group-hover:scale-110 transition-transform">
                    {s.step}
                  </span>
                  <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border ${s.badgeColor}`}>
                    {s.badge}
                  </span>
                </div>

                {/* Title & Description */}
                <h3 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-blue-600 transition leading-snug">
                  {s.title}
                </h3>
                <p className="text-xs sm:text-[13px] text-slate-600 mt-2 leading-relaxed">
                  {s.desc}
                </p>

                {/* Micro tags */}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {s.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Bottom Visual Mockup & Estimated Time */}
              <div className="mt-6 pt-4 border-t border-slate-100 space-y-3">
                {s.visual}
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>Time-to-Value:</span>
                  <span className="font-extrabold text-slate-900">{s.time}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Banner with Onboarding Guarantee */}
        <div className="mt-14 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-md flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-black text-slate-900">
                100% Free Data Migration & Staff Onboarding Included
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                Our hospitality engineers help you import your existing bookings, map room rates, and train your front-desk staff at zero additional cost.
              </p>
            </div>
          </div>

          <button
            onClick={onOpenBookDemo}
            className="px-6 py-3.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-black text-xs sm:text-sm shadow-md hover:shadow-lg whitespace-nowrap cursor-pointer transition transform hover:scale-105"
          >
            Start Your Free Onboarding
          </button>
        </div>

      </div>
    </section>
  );
};
