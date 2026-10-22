import React from 'react';
import { Radio, ArrowRight, CheckCircle2, RefreshCw, Zap, ShieldCheck } from 'lucide-react';

interface ChannelManagerShowcaseProps {
  onOpenBookDemo?: () => void;
}

export const ChannelManagerShowcaseSection: React.FC<ChannelManagerShowcaseProps> = ({ onOpenBookDemo }) => {
  const OTAS = [
    { name: 'Booking.com', type: 'Global OTA', status: 'Connected', synced: '2 mins ago', color: 'text-blue-600 bg-blue-50' },
    { name: 'MakeMyTrip', type: 'India OTA', status: 'Connected', synced: '5 mins ago', color: 'text-rose-600 bg-rose-50' },
    { name: 'Agoda', type: 'Global OTA', status: 'Connected', synced: '1 min ago', color: 'text-amber-700 bg-amber-50' },
    { name: 'Goibibo', type: 'India OTA', status: 'Connected', synced: '4 mins ago', color: 'text-orange-600 bg-orange-50' },
    { name: 'Expedia', type: 'Global OTA', status: 'Connected', synced: '3 mins ago', color: 'text-yellow-600 bg-yellow-50' },
  ];

  return (
    <section id="channel-manager" className="py-20 sm:py-28 bg-gradient-to-b from-[#070D1D] via-[#0A1329] to-[#0D1936] text-white overflow-hidden relative">
      {/* Background Ambience */}
      <div className="absolute top-1/2 left-10 -translate-y-1/2 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Column: Realistic Laptop Channel Manager UI */}
          <div className="lg:col-span-7 order-2 lg:order-1">
            <div className="relative bg-slate-900 rounded-2xl border border-slate-700/80 shadow-2xl shadow-black/80 overflow-hidden text-slate-800">
              {/* Window Bar */}
              <div className="bg-slate-800/90 px-4 py-2.5 flex items-center justify-between border-b border-slate-700/70">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                  <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                </div>
                <div className="px-3 py-0.5 rounded-md bg-slate-900/60 text-[11px] font-mono text-slate-400 border border-slate-700/50 flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" /> app.hotelmantri.com/channels
                </div>
                <div className="w-8" />
              </div>

              {/* Inside Channel Manager Table */}
              <div className="p-4 sm:p-6 bg-slate-50 space-y-4 text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-2">
                  <div>
                    <h4 className="text-base font-extrabold text-slate-900">Channel Manager & OTA Distribution</h4>
                    <p className="text-xs text-slate-500">Live 2-way rate & inventory synchronization</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-extrabold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> 5 Channels Live
                    </span>
                  </div>
                </div>

                {/* OTA Connection Rows */}
                <div className="space-y-2">
                  {OTAS.map((ota) => (
                    <div
                      key={ota.name}
                      className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-3 hover:border-slate-300 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${ota.color}`}>
                          {ota.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">{ota.name}</p>
                          <p className="text-[10px] text-slate-500">{ota.type} · Synced {ota.synced}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Connected
                        </span>
                        <button className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 transition cursor-pointer">
                          Sync Now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Live Rates & Inventory Row */}
                <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 flex flex-wrap items-center justify-between text-xs text-slate-700 gap-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span className="font-bold text-slate-900">Instant Rate Push:</span>
                    <span>Deluxe AC @ ₹2,800 · Executive @ ₹3,600</span>
                  </div>
                  <span className="text-[11px] text-blue-700 font-bold">Overbooking Protection Active</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Copy & Actions */}
          <div className="lg:col-span-5 space-y-6 text-left order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-amber-400 text-xs font-bold uppercase tracking-wider">
              <Radio className="w-3.5 h-3.5" /> Channel Manager
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-[1.15]">
              Rates & Inventory. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-500">
                Synced Everywhere.
              </span>
            </h2>

            <p className="text-base sm:text-lg text-slate-300 leading-relaxed font-normal">
              Update your room inventory and rates from one place and keep your connected channels in sync through HotelMantri.
            </p>

            <ul className="space-y-2.5 text-sm text-slate-300 font-medium">
              <li className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Instant 2-way inventory & rate synchronization</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Zero double-bookings with auto room block</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Bulk rate updates & restriction controls in 1 click</span>
              </li>
            </ul>

            <div className="pt-2">
              <button
                onClick={onOpenBookDemo}
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-gradient-to-r from-amber-400 via-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-extrabold text-sm sm:text-base rounded-full shadow-xl shadow-amber-500/20 hover:shadow-amber-500/30 transition cursor-pointer"
              >
                Connect Your Channels <ArrowRight className="w-4 h-4 text-slate-950" />
              </button>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
