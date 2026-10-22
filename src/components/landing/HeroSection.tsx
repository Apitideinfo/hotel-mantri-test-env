import React from 'react';
import {
  Sparkles, ArrowRight, Check,
  Calendar, Radio, Sparkle, Wallet, BarChart3, UtensilsCrossed, Shirt, MessageSquare,
  TrendingUp, Users, DollarSign, Bed, ShieldCheck, CheckCircle2,
} from 'lucide-react';

interface HeroSectionProps {
  onLogin: () => void;
  onOpenBookDemo: () => void;
  onExploreFeatures: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onLogin,
  onOpenBookDemo,
  onExploreFeatures,
}) => {
  const PILLS = [
    { label: 'PMS', icon: <Calendar className="w-3.5 h-3.5 text-amber-400" /> },
    { label: 'Channel Manager', icon: <Radio className="w-3.5 h-3.5 text-sky-400" /> },
    { label: 'Housekeeping', icon: <Sparkle className="w-3.5 h-3.5 text-emerald-400" /> },
    { label: 'Finance', icon: <Wallet className="w-3.5 h-3.5 text-amber-400" /> },
    { label: 'Reports', icon: <BarChart3 className="w-3.5 h-3.5 text-purple-400" /> },
    { label: 'POS', icon: <UtensilsCrossed className="w-3.5 h-3.5 text-rose-400" /> },
    { label: 'Laundry', icon: <Shirt className="w-3.5 h-3.5 text-cyan-400" /> },
    { label: 'WhatsApp', icon: <MessageSquare className="w-3.5 h-3.5 text-emerald-400" /> },
  ];

  return (
    <section className="relative pt-28 sm:pt-36 pb-16 sm:pb-24 bg-gradient-to-b from-[#070D1D] via-[#0A1329] to-[#0D1936] text-white overflow-hidden">
      {/* Background Radial Glow Accents */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-slate-900/60 to-transparent pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">

          {/* ── LEFT COLUMN: Value Proposition & CTAs ── */}
          <div className="lg:col-span-6 space-y-6 text-left">
            {/* Small Label Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/80 text-amber-400 text-xs font-bold uppercase tracking-wider shadow-inner">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              HOTEL OPERATING SYSTEM FOR MODERN HOTELS
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.12]">
              Run Your Entire Hotel <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-500">
                From One Screen.
              </span>
            </h1>

            {/* Subheading */}
            <p className="text-base sm:text-lg text-slate-300 max-w-xl font-normal leading-relaxed">
              Reservations, rooms, channel manager, housekeeping, finance and reports — connected in one simple system.
            </p>

            {/* Feature Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 max-w-lg">
              {PILLS.map((pill) => (
                <div
                  key={pill.label}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-semibold text-slate-200 hover:border-slate-700 hover:bg-slate-800/60 transition shadow-xs"
                >
                  {pill.icon}
                  <span className="truncate">{pill.label}</span>
                </div>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
              <button
                id="hero-book-demo-btn"
                onClick={onOpenBookDemo}
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-gradient-to-r from-amber-400 via-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-extrabold text-sm sm:text-base rounded-full shadow-xl shadow-amber-500/25 hover:shadow-amber-500/35 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer"
              >
                Book Free Demo <ArrowRight className="w-4 h-4 text-slate-950" />
              </button>

              <button
                id="hero-start-trial-btn"
                onClick={onLogin}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-900/80 hover:bg-slate-800 text-white font-semibold text-sm sm:text-base rounded-full border border-slate-700 hover:border-slate-500 transition-all duration-200 cursor-pointer"
              >
                Start Free Trial
              </button>
            </div>

            {/* Trust Line */}
            <div className="pt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-slate-400">
              <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> Simple Setup</span>
              <span className="text-slate-600">•</span>
              <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> Staff Friendly</span>
              <span className="text-slate-600">•</span>
              <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> Cloud Based</span>
              <span className="text-slate-600">•</span>
              <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> For All Types of Hotels</span>
            </div>
          </div>

          {/* ── RIGHT COLUMN: Realistic HotelMantri Dashboard Showcase ── */}
          <div className="lg:col-span-6 relative">
            {/* Ambient Back Glow */}
            <div className="absolute -inset-4 bg-gradient-to-tr from-sky-600/20 via-amber-500/10 to-indigo-600/20 rounded-3xl blur-2xl opacity-75" />

            {/* Laptop / Browser Container */}
            <div className="relative bg-slate-900 rounded-2xl border border-slate-700/80 shadow-2xl shadow-black/60 overflow-hidden text-slate-800">
              {/* Browser Window Chrome */}
              <div className="bg-slate-800/90 px-4 py-2.5 flex items-center justify-between border-b border-slate-700/70">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
                </div>
                <div className="px-4 py-0.5 rounded-md bg-slate-900/60 text-[11px] font-mono text-slate-400 border border-slate-700/50 flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" /> app.hotelmantri.com/dashboard
                </div>
                <div className="w-10" />
              </div>

              {/* Inside Dashboard Product Mockup */}
              <div className="p-4 sm:p-5 bg-slate-50 space-y-3.5 text-left">
                {/* Dashboard Header Bar */}
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                  <div>
                    <h4 className="text-base font-extrabold text-slate-900">Good Morning!</h4>
                    <p className="text-xs text-slate-500">Live property snapshot for today</p>
                  </div>
                  <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-bold text-slate-800">Hotel Gopal Dwarka</span>
                  </div>
                </div>

                {/* 4 Core KPIs Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Occupancy</span>
                    <div className="text-lg font-extrabold text-slate-900">78%</div>
                    <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-0.5">
                      <TrendingUp className="w-3 h-3" /> +4% vs yday
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Today Arrivals</span>
                    <div className="text-lg font-extrabold text-slate-900">12</div>
                    <span className="text-[10px] font-medium text-slate-500">10 check-in ready</span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Today Revenue</span>
                    <div className="text-lg font-extrabold text-amber-700">₹86,500</div>
                    <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-0.5">
                      <TrendingUp className="w-3 h-3" /> +12% online
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Rooms Avail.</span>
                    <div className="text-lg font-extrabold text-slate-900">9</div>
                    <span className="text-[10px] font-medium text-sky-600 font-semibold">Ready for pickup</span>
                  </div>
                </div>

                {/* Room Status Pill Strip */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800">Room Status Overview</span>
                    <span className="text-[11px] text-slate-400">Total: 22 Rooms</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 text-center text-xs">
                    <div className="bg-blue-50 text-blue-700 p-1.5 rounded-lg border border-blue-100 font-semibold">
                      <span className="block text-[10px] text-blue-500">Occupied</span>
                      <span className="font-extrabold text-sm">14</span>
                    </div>
                    <div className="bg-amber-50 text-amber-700 p-1.5 rounded-lg border border-amber-100 font-semibold">
                      <span className="block text-[10px] text-amber-500">Dirty</span>
                      <span className="font-extrabold text-sm">3</span>
                    </div>
                    <div className="bg-yellow-50 text-yellow-800 p-1.5 rounded-lg border border-yellow-200 font-semibold">
                      <span className="block text-[10px] text-yellow-600">Cleaning</span>
                      <span className="font-extrabold text-sm">2</span>
                    </div>
                    <div className="bg-emerald-50 text-emerald-700 p-1.5 rounded-lg border border-emerald-100 font-semibold">
                      <span className="block text-[10px] text-emerald-500">Ready</span>
                      <span className="font-extrabold text-sm">1</span>
                    </div>
                    <div className="bg-slate-100 text-slate-700 p-1.5 rounded-lg border border-slate-200 font-semibold">
                      <span className="block text-[10px] text-slate-500">Blocked</span>
                      <span className="font-extrabold text-sm">2</span>
                    </div>
                  </div>
                </div>

                {/* Split Row: Channel Sync Widget & Recent Arrivals */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  {/* Channel Manager Mini Status */}
                  <div className="sm:col-span-5 bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Channel Manager</span>
                      <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">Synced</span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      {['Booking.com', 'MakeMyTrip', 'Agoda', 'Expedia'].map((ota) => (
                        <div key={ota} className="flex items-center justify-between p-1 rounded bg-slate-50 border border-slate-100 text-[11px]">
                          <span className="font-semibold text-slate-700">{ota}</span>
                          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent Arrivals */}
                  <div className="sm:col-span-7 bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Recent Arrivals</span>
                      <span className="text-[10px] text-sky-600 font-semibold">View All</span>
                    </div>
                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                        <div>
                          <p className="font-bold text-slate-900 leading-tight">Ramesh Patel</p>
                          <p className="text-[10px] text-slate-500">Room 102 · Deluxe AC</p>
                        </div>
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md">
                          Confirmed
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                        <div>
                          <p className="font-bold text-slate-900 leading-tight">Sunil Sharma</p>
                          <p className="text-[10px] text-slate-500">Room 204 · Executive</p>
                        </div>
                        <span className="px-2 py-0.5 bg-sky-100 text-sky-800 text-[10px] font-bold rounded-md">
                          Paid Online
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                        <div>
                          <p className="font-bold text-slate-900 leading-tight">Amit Verma</p>
                          <p className="text-[10px] text-slate-500">Room 105 · Standard</p>
                        </div>
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-md">
                          Pay at Desk
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
