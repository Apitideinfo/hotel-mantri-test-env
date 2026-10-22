import React from 'react';
import { MessageSquare, ArrowRight, FileText, Bed, ArrowUpDown, IndianRupee, Bell, CheckCheck, ShieldCheck } from 'lucide-react';

interface WhatsAppSectionProps {
  onOpenBookDemo?: () => void;
}

export const WhatsAppSection: React.FC<WhatsAppSectionProps> = ({ onOpenBookDemo }) => {
  const handleOpenWhatsAppChat = () => {
    const text = encodeURIComponent('Hi HotelMantri Team, I would like to see a demo of the WhatsApp daily reporting feature for my hotel.');
    window.open(`https://wa.me/919925958831?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const REPORT_FEATURES = [
    {
      title: 'Daily Hotel Report',
      desc: 'Complete snapshot delivered every evening at your chosen time',
      icon: FileText,
      color: 'text-blue-600 bg-blue-50 border-blue-200',
    },
    {
      title: 'Occupancy Report',
      desc: 'Real-time room occupancy and upcoming week forecast',
      icon: Bed,
      color: 'text-amber-600 bg-amber-50 border-amber-200',
    },
    {
      title: 'Arrivals & Departures',
      desc: 'Know VIP arrivals, pending check-ins and today checkouts',
      icon: ArrowUpDown,
      color: 'text-purple-600 bg-purple-50 border-purple-200',
    },
    {
      title: 'Revenue Report',
      desc: 'Day closing totals, cash, card and UPI collection breakdown',
      icon: IndianRupee,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    },
    {
      title: 'Custom Alerts',
      desc: 'Instant notifications on high-value bookings or cancellations',
      icon: Bell,
      color: 'text-rose-600 bg-rose-50 border-rose-200',
    },
  ];

  return (
    <section id="whatsapp" className="py-20 sm:py-28 bg-gradient-to-b from-slate-50 to-white border-b border-slate-200/80 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Top Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-4 shadow-2xs">
            <MessageSquare className="w-4 h-4 fill-emerald-600 text-emerald-600" /> WhatsApp Automation
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight">
            Your Hotel Updates. <br />
            <span className="text-emerald-600">Delivered on WhatsApp.</span>
          </h2>
          <p className="text-base sm:text-lg text-slate-600 mt-3 font-normal">
            Get daily reports, occupancy, revenue, arrivals and important updates directly on WhatsApp without opening any app.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={handleOpenWhatsAppChat}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-extrabold text-sm shadow-md shadow-amber-500/20 hover:shadow-amber-500/30 transition cursor-pointer"
            >
              See WhatsApp Reports <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2-Column Showcase: Smartphone WhatsApp Chat (Left/Center) + 5 Report Feature Cards (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          
          {/* Smartphone Mockup */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-full max-w-[340px] bg-slate-900 p-3 rounded-[40px] shadow-2xl border-4 border-slate-800 ring-1 ring-slate-700/50">
              
              {/* Phone Speaker & Camera Pill Notch */}
              <div className="absolute top-5 left-1/2 -translate-x-1/2 w-28 h-4 bg-slate-950 rounded-full z-20 flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-800 mr-2" />
                <div className="w-10 h-1.5 rounded-full bg-slate-800" />
              </div>

              {/* Screen Screen Area */}
              <div className="bg-[#EFEAE2] rounded-[32px] overflow-hidden pt-7 pb-4 text-left border border-slate-300 shadow-inner">
                {/* WhatsApp Chat Top Bar */}
                <div className="bg-[#075E54] text-white px-4 py-3 flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-emerald-700 flex items-center justify-center font-bold text-white text-sm border border-emerald-400">
                      HM
                    </div>
                    <div>
                      <div className="flex items-center gap-1 font-bold text-sm leading-tight">
                        HotelMantri Reports <ShieldCheck className="w-3.5 h-3.5 text-sky-300 fill-sky-300" />
                      </div>
                      <span className="text-[10px] text-emerald-200">Online · Official Bot</span>
                    </div>
                  </div>
                  <div className="text-right text-[10px] text-emerald-200">
                    9:00 PM
                  </div>
                </div>

                {/* WhatsApp Chat Bubble Body */}
                <div className="p-3.5 space-y-3">
                  {/* Date Pill */}
                  <div className="text-center">
                    <span className="bg-white/80 text-slate-600 text-[10px] font-semibold px-2.5 py-0.5 rounded-md shadow-2xs">
                      Today
                    </span>
                  </div>

                  {/* Main Report Card Message */}
                  <div className="bg-white rounded-xl p-3.5 rounded-tl-none shadow-sm border border-slate-200/60 max-w-[95%] space-y-2 text-slate-800 font-sans text-xs">
                    <div className="border-b border-slate-100 pb-2">
                      <p className="font-extrabold text-slate-900 text-[13px] flex items-center gap-1.5">
                        📊 <span>Daily Report — 15 Oct 2026</span>
                      </p>
                      <p className="text-[11px] font-bold text-emerald-700 mt-0.5">
                        🏨 Hotel Gopal Dwarka
                      </p>
                    </div>

                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-600">Occupancy:</span>
                        <span className="font-extrabold text-slate-900">78% (17/22 Rooms)</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-600">Total Revenue:</span>
                        <span className="font-extrabold text-amber-700">₹86,500</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-600">Arrivals:</span>
                        <span className="font-bold text-slate-900">12 (10 Checked In)</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-600">Departures:</span>
                        <span className="font-bold text-slate-900">8</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-600">Total Bookings:</span>
                        <span className="font-bold text-slate-900">14</span>
                      </div>
                    </div>

                    {/* Expense Breakdown */}
                    <div className="pt-2 border-t border-slate-100 space-y-1 text-[10.5px]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        Expense Summary
                      </span>
                      <div className="flex justify-between text-slate-600">
                        <span>Staff Food:</span>
                        <span className="font-semibold text-slate-800">₹2,500</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Laundry:</span>
                        <span className="font-semibold text-slate-800">₹1,200</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Maintenance:</span>
                        <span className="font-semibold text-slate-800">₹1,800</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-100 font-extrabold text-rose-600">
                        <span>Total Expense:</span>
                        <span>₹5,500</span>
                      </div>
                    </div>

                    {/* Timestamp & Double Checkmarks */}
                    <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 pt-1">
                      <span>9:00 PM</span>
                      <CheckCheck className="w-3.5 h-3.5 text-sky-500" />
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Right Column: 5 Report Feature Cards */}
          <div className="lg:col-span-7 space-y-3.5">
            {REPORT_FEATURES.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all flex items-start gap-4 text-left group"
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${item.color} group-hover:scale-105 transition`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-blue-600 transition">
                      {item.title}
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
                      {item.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

      </div>
    </section>
  );
};
