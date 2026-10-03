import React, { useState } from 'react';
import {
  Calendar,
  User,
  LineChart,
  CreditCard,
  ArrowRight,
  Search,
  Phone,
  MessageSquare,
  Plus,
  LayoutDashboard,
  CalendarDays,
  BedDouble,
  Percent,
  ReceiptText,
  SlidersHorizontal,
  RotateCcw,
  Check,
  ChevronRight,
  ArrowUp,
  Bot,
} from 'lucide-react';

interface OverviewSuiteSectionProps {
  onLogin?: () => void;
  onBookDemo?: () => void;
}

export const OverviewSuiteSection: React.FC<OverviewSuiteSectionProps> = ({
  onLogin,
  onBookDemo,
}) => {
  const [activeTab, setActiveTab] = useState<'reservations' | 'guests' | 'analytics' | 'payments'>('reservations');

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const featureCards = [
    {
      id: 'reservations' as const,
      title: 'Reservations',
      subtitle: 'Seamless booking management',
      icon: Calendar,
    },
    {
      id: 'guests' as const,
      title: 'Guest Management',
      subtitle: 'Personalized experiences',
      icon: User,
    },
    {
      id: 'analytics' as const,
      title: 'Analytics',
      subtitle: 'Real-time insights',
      icon: LineChart,
    },
    {
      id: 'payments' as const,
      title: 'Payments',
      subtitle: 'Secure transactions',
      icon: CreditCard,
    },
  ];

  return (
    <section id="overview" className="relative w-full py-20 lg:py-28 bg-white text-slate-900 select-none overflow-hidden border-b border-gray-100">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10">
        
        {/* ── 3-Column Layout: Left Cards | Center Content | Right Mobile Mockup ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-6 xl:gap-10 items-center">

          {/* ══════════════════════════════════════════════════════════
              LEFT COLUMN: 4 Feature Cards (Subtle light-line boxes)
             ══════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-3 xl:col-span-3 flex flex-col gap-3.5 w-full max-w-sm mx-auto lg:mx-0">
            {featureCards.map((card) => {
              const Icon = card.icon;
              const isActive = activeTab === card.id;

              return (
                <button
                  key={card.id}
                  onClick={() => setActiveTab(card.id)}
                  className={`w-full text-left px-5 py-4 rounded-xl transition-all duration-200 flex items-center gap-4 cursor-pointer bg-white border ${
                    isActive
                      ? 'border-gray-300 shadow-[0_4px_16px_rgba(0,0,0,0.06)] ring-1 ring-black/5 translate-x-1'
                      : 'border-gray-200/80 shadow-[0_1px_4px_rgba(0,0,0,0.02)] hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  {/* Subtle light box for icon */}
                  <div className="w-10 h-10 rounded-lg border border-gray-200 flex items-center justify-center shrink-0 text-gray-800 bg-white">
                    <Icon className="w-5 h-5 stroke-[1.6]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 text-[15px] sm:text-base tracking-tight truncate">
                      {card.title}
                    </h3>
                    <p className="text-gray-500 text-xs sm:text-[13px] font-normal mt-0.5 truncate">
                      {card.subtitle}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ══════════════════════════════════════════════════════════
              CENTER COLUMN: Fully Center-Aligned Title, Copy, Checklist, CTAs
             ══════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-6 xl:col-span-6 text-center flex flex-col items-center justify-center px-2 sm:px-6">
            
            {/* OVERVIEW tag */}
            <span className="text-[12px] font-bold tracking-[0.25em] text-gray-800 uppercase">
              OVERVIEW
            </span>

            {/* Main Headline */}
            <h2 className="text-3xl sm:text-5xl lg:text-[50px] xl:text-[56px] font-bold text-black tracking-tight leading-[1.12] mt-3 mb-4">
              All in one<br />Hospitality Suite
            </h2>

            {/* Subtitle */}
            <p className="text-gray-600 text-sm sm:text-base md:text-[17px] leading-relaxed max-w-lg mx-auto">
              All your hospitality operations in one platform, from bookings and payments to analytics.
            </p>

            {/* Checklist with clean outline checkboxes */}
            <div className="mt-8 space-y-3.5 text-left inline-block max-w-md mx-auto">
              <div className="flex items-center gap-3 text-gray-800 text-sm sm:text-[15px] font-normal">
                <div className="w-5 h-5 rounded border border-gray-700 flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5 stroke-[2.5] text-gray-800" />
                </div>
                <span>Unified dashboard for all operations</span>
              </div>
              <div className="flex items-center gap-3 text-gray-800 text-sm sm:text-[15px] font-normal">
                <div className="w-5 h-5 rounded border border-gray-700 flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5 stroke-[2.5] text-gray-800" />
                </div>
                <span>Real-time synchronization across devices</span>
              </div>
              <div className="flex items-center gap-3 text-gray-800 text-sm sm:text-[15px] font-normal">
                <div className="w-5 h-5 rounded border border-gray-700 flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5 stroke-[2.5] text-gray-800" />
                </div>
                <span>Enterprise-grade security and compliance</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-9 flex flex-row items-center justify-center gap-4 w-full">
              <button
                id="overview-start-trial-btn"
                onClick={onLogin}
                className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-lg bg-black hover:bg-neutral-900 text-white font-medium text-sm sm:text-[15px] transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
              >
                <span>Start Free Trial</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                id="overview-book-demo-btn"
                onClick={onBookDemo || onLogin}
                className="inline-flex items-center justify-center px-7 py-3 rounded-lg bg-white hover:bg-gray-50 text-gray-900 font-medium text-sm sm:text-[15px] border border-gray-700 hover:border-black transition-all duration-200 cursor-pointer shadow-sm hover:-translate-y-0.5"
              >
                Book a Demo
              </button>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════
              RIGHT COLUMN: Smartphone Mockup on Far Right + Store Badges
             ══════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-3 xl:col-span-3 flex flex-col items-center lg:items-end justify-center">
            
            {/* Phone Hardware Mockup */}
            <div className="relative w-[275px] sm:w-[285px] bg-[#1a1a1c] rounded-[38px] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.28)] border-2 border-[#333] ring-1 ring-black/40">
              {/* Speaker / Punch hole */}
              <div className="absolute top-3.5 left-1/2 -translate-x-1/2 w-14 h-3.5 bg-black rounded-full z-30 flex items-center justify-center">
                <div className="w-2 h-2 bg-[#202020] rounded-full mr-2" />
                <div className="w-1 h-1 bg-[#102535] rounded-full" />
              </div>

              {/* Phone Screen Container */}
              <div className="relative bg-[#F4F6F9] rounded-[30px] overflow-hidden text-slate-800 text-[11px] font-sans border border-gray-300/80 select-none">
                
                {/* Status Bar */}
                <div className="pt-2 px-4 pb-1 flex justify-between items-center text-[10px] text-gray-500 font-semibold">
                  <span>1:10 📶</span>
                  <span>95% 🔋</span>
                </div>

                {/* App Header */}
                <div className="px-3 py-2 border-b border-gray-200 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-700 text-sm">☰</span>
                      <div>
                        <h4 className="font-bold text-[13px] text-gray-900 leading-tight">Reservations</h4>
                        <p className="text-[9px] text-gray-400">Manage your bookings</p>
                      </div>
                    </div>
                  </div>

                  {/* Search Bar */}
                  <div className="mt-2 flex items-center gap-1 bg-gray-100/90 rounded-lg px-2.5 py-1.5 text-[10px] text-gray-400">
                    <Search className="w-3 h-3 text-gray-400 shrink-0" />
                    <span className="truncate">Search guest name, booking</span>
                    <SlidersHorizontal className="w-3 h-3 text-gray-400 ml-auto" />
                    <RotateCcw className="w-3 h-3 text-gray-400" />
                  </div>

                  {/* Filter Tabs */}
                  <div className="mt-2.5 flex items-center gap-1.5 overflow-x-hidden text-[10px] font-semibold">
                    <span className="bg-[#0e7490] text-white px-2.5 py-1 rounded-full flex items-center gap-1">
                      Recent <span className="bg-white/20 text-[9px] px-1 rounded-full">18</span>
                    </span>
                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                      Arrivals <span className="text-gray-400">0</span>
                    </span>
                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                      In-House
                    </span>
                  </div>
                </div>

                {/* Dynamic Screen Content based on Active Tab */}
                <div className="p-2 space-y-2 max-h-[320px] overflow-y-auto">
                  {/* Booking Card 1 */}
                  <div className="bg-white rounded-xl p-2.5 border border-gray-200/90 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded-md bg-[#0e7490] text-white font-bold text-[10px] flex items-center justify-center">
                          102
                        </span>
                        <div>
                          <div className="font-bold text-[11px] text-gray-900">Deluxe Room</div>
                          <span className="text-[9px] text-emerald-600 font-semibold bg-emerald-50 px-1 py-0.2 rounded">Confirmed CP</span>
                        </div>
                      </div>
                      <span className="text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">Walk-in</span>
                    </div>

                    {/* Guest Info */}
                    <div className="mt-2 flex items-center gap-1.5 text-gray-600">
                      <div className="w-5 h-5 rounded-full bg-gray-100 text-[10px] font-bold text-gray-700 flex items-center justify-center">
                        R
                      </div>
                      <div>
                        <div className="font-bold text-[11px] text-gray-800">Rashmi Sahoo</div>
                        <div className="text-[9px] text-gray-400">987-0-3490 • 1 guest</div>
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="mt-2 pt-1.5 border-t border-dashed border-gray-200 grid grid-cols-3 text-center text-[9px]">
                      <div>
                        <div className="text-gray-400 font-medium">CHECK-IN</div>
                        <div className="font-bold text-gray-800">Jun 20</div>
                        <div className="text-gray-400 text-[8px]">11:00 AM</div>
                      </div>
                      <div className="flex flex-col items-center justify-center">
                        <span className="text-gray-400">🌙</span>
                        <span className="text-[8px] text-gray-500 font-semibold">1 Night</span>
                      </div>
                      <div>
                        <div className="text-gray-400 font-medium">CHECK-OUT</div>
                        <div className="font-bold text-gray-800">Jun 21</div>
                        <div className="text-gray-400 text-[8px]">10:00 AM</div>
                      </div>
                    </div>

                    {/* Due Amount Bar */}
                    <div className="mt-2 bg-gray-50 p-1 rounded flex justify-between items-center text-[9px]">
                      <span className="text-gray-500">Paid ₹0.00</span>
                      <span className="text-rose-600 font-bold">Due ₹3,885.00</span>
                    </div>

                    {/* Action Bar */}
                    <div className="mt-2 pt-1.5 border-t border-gray-100 flex items-center justify-between text-[9px] text-gray-600 font-semibold">
                      <span className="flex items-center gap-0.5 hover:text-blue-600 cursor-pointer"><Phone className="w-2.5 h-2.5" /> Call</span>
                      <span className="flex items-center gap-0.5 hover:text-blue-600 cursor-pointer"><MessageSquare className="w-2.5 h-2.5" /> Chat</span>
                      <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 cursor-pointer">Collect ₹3,885</span>
                      <ChevronRight className="w-3 h-3 text-gray-400" />
                    </div>
                  </div>

                  {/* Booking Card 2 */}
                  <div className="bg-white rounded-xl p-2.5 border border-gray-200/90 shadow-sm opacity-90">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded-md bg-[#0e7490] text-white font-bold text-[10px] flex items-center justify-center">
                          104
                        </span>
                        <div>
                          <div className="font-bold text-[11px] text-gray-900">Deluxe Room</div>
                          <span className="text-[9px] text-gray-500 font-semibold bg-gray-100 px-1 py-0.2 rounded">Checked Out CP</span>
                        </div>
                      </div>
                      <span className="text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">Walk-in</span>
                    </div>

                    <div className="mt-1.5 flex items-center gap-1.5 text-gray-600">
                      <div className="w-5 h-5 rounded-full bg-gray-100 text-[10px] font-bold text-gray-700 flex items-center justify-center">
                        T
                      </div>
                      <div>
                        <div className="font-bold text-[11px] text-gray-800">Trilochan Nayak</div>
                        <div className="text-[9px] text-gray-400">989-1-0120 • 2 guests</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating Plus Button */}
                <div className="absolute bottom-12 right-3">
                  <div className="w-8 h-8 rounded-full bg-[#0e7490] text-white flex items-center justify-center shadow-lg cursor-pointer hover:scale-105 transition-transform">
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                  </div>
                </div>

                {/* Bottom App Navigation */}
                <div className="bg-white border-t border-gray-200 py-1 px-2 flex justify-around items-center text-[8px] text-gray-400 font-semibold">
                  <div className="flex flex-col items-center">
                    <LayoutDashboard className="w-3.5 h-3.5" />
                    <span>Dashboard</span>
                  </div>
                  <div className="flex flex-col items-center text-blue-600">
                    <CalendarDays className="w-3.5 h-3.5" />
                    <span>Bookings</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <BedDouble className="w-3.5 h-3.5" />
                    <span>Rooms</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <Percent className="w-3.5 h-3.5" />
                    <span>Rates</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <ReceiptText className="w-3.5 h-3.5" />
                    <span>Orders</span>
                  </div>
                </div>

              </div>
            </div>

            {/* App Store & Google Play Badges directly underneath phone */}
            <div className="mt-5 flex flex-row items-center gap-2.5">
              {/* Apple App Store */}
              <button
                onClick={onLogin}
                className="bg-black hover:bg-neutral-900 text-white rounded-lg px-3 py-1.5 flex items-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer border border-white/10"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 170 170">
                  <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.08-7.72-7.89-12.09-14.43-5.91-8.91-10.4-19.14-13.48-30.68-3.08-11.54-4.62-22.38-4.62-32.53 0-14.54 3.73-26.69 11.2-36.46 7.47-9.76 16.89-14.73 28.26-14.89 4.35 0 9.27 1.09 14.75 3.26 5.48 2.18 9.07 3.33 10.77 3.48 2.29-.33 6.09-1.57 11.41-3.73 5.32-2.15 10.15-3.11 14.49-2.88 12.39.87 22.36 5.8 29.9 14.79-10.87 6.64-16.19 15.65-15.98 27.04.22 9.78 4.02 18.06 11.41 24.84 5.22 4.89 11.19 8.26 17.93 10.11-2.17 6.31-4.78 12.83-7.82 19.55zM119.22 33.34c0-7.39 2.66-14.45 7.97-21.18 5.31-6.73 11.96-11.08 19.93-13.06.33 1.09.49 2.23.49 3.42 0 7.39-2.77 14.61-8.31 21.67-5.54 7.06-12.33 11.41-20.37 13.05-.1-.76-.21-2.06-.21-3.9z" />
                </svg>
                <div className="text-left leading-none">
                  <div className="text-[7.5px] text-gray-300 font-normal">Download on the</div>
                  <div className="text-[10.5px] font-bold text-white tracking-tight mt-0.5">App Store</div>
                </div>
              </button>

              {/* Google Play Store */}
              <button
                onClick={onLogin}
                className="bg-black hover:bg-neutral-900 text-white rounded-lg px-3 py-1.5 flex items-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer border border-white/10"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M3.61 1.814L13.793 12 3.61 22.186A1.895 1.895 0 0 1 3 20.735V3.265c0-.58.23-1.11.61-1.451z" />
                  <path fill="#34A853" d="M17.155 8.638l-3.362 3.362 3.362 3.362 3.79-2.155c1.076-.612 1.076-1.807 0-2.414l-3.79-2.155z" />
                  <path fill="#FBBC05" d="M3.61 22.186l10.183-10.186 3.362 3.362-11.68 6.643c-.636.362-1.39.308-1.865-.181z" />
                  <path fill="#EA4335" d="M3.61 1.814c.475-.489 1.229-.543 1.865-.181l11.68 6.643-3.362 3.362L3.61 1.814z" />
                </svg>
                <div className="text-left leading-none">
                  <div className="text-[7.5px] text-gray-300 font-normal">GET IT ON</div>
                  <div className="text-[10.5px] font-bold text-white tracking-tight mt-0.5">Google Play</div>
                </div>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── Floating Action Buttons on Bottom Right (Scroll Top, WhatsApp, AI Bot) ── */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-center gap-3">
        {/* Scroll To Top Button */}
        <button
          onClick={scrollToTop}
          className="w-11 h-11 rounded-full bg-[#111111] hover:bg-black text-white flex items-center justify-center shadow-xl border border-white/15 hover:scale-110 transition-all duration-200 cursor-pointer"
          title="Back to Top"
        >
          <ArrowUp className="w-5 h-5 stroke-[2.2]" />
        </button>

        {/* WhatsApp Icon */}
        <a
          href="https://wa.me/"
          target="_blank"
          rel="noopener noreferrer"
          className="w-11 h-11 rounded-full bg-[#25D366] hover:bg-[#20bd5a] text-white flex items-center justify-center shadow-xl hover:scale-110 transition-all duration-200 cursor-pointer"
          title="Chat on WhatsApp"
        >
          <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z" />
          </svg>
        </a>

        {/* AI Support Bot Icon */}
        <button
          onClick={onLogin}
          className="w-11 h-11 rounded-full bg-[#111111] hover:bg-black text-white flex items-center justify-center shadow-xl border border-white/20 hover:scale-110 transition-all duration-200 cursor-pointer"
          title="AI Assistant"
        >
          <Bot className="w-5 h-5 text-white" />
        </button>
      </div>

    </section>
  );
};
