import React, { useState } from 'react';
import {
  Radio, ArrowRight, CheckCircle2, RefreshCw, Zap, ShieldCheck,
  TrendingUp, AlertCircle, ArrowLeftRight, Check, Sliders, Globe
} from 'lucide-react';

interface ChannelManagerShowcaseProps {
  onOpenBookDemo?: () => void;
}

export const ChannelManagerShowcaseSection: React.FC<ChannelManagerShowcaseProps> = ({ onOpenBookDemo }) => {
  const [simulatedRate, setSimulatedRate] = useState<number>(3800);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncText, setLastSyncText] = useState<string>('Just now');

  const handleTriggerSync = () => {
    setIsSyncing(true);
    setLastSyncText('Syncing 5 channels...');
    setTimeout(() => {
      setIsSyncing(false);
      setLastSyncText('All 5 channels synchronized');
    }, 1200);
  };

  const CHANNELS = [
    {
      name: 'MakeMyTrip',
      type: 'India #1 OTA',
      logoText: 'MMT',
      brandColor: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      status: 'Connected',
      rate: `₹${simulatedRate.toLocaleString('en-IN')}`,
      avail: '4 Rooms',
      latency: '0.8s',
    },
    {
      name: 'Booking.com',
      type: 'Global Distribution',
      logoText: 'BK',
      brandColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      status: 'Connected',
      rate: `₹${simulatedRate.toLocaleString('en-IN')}`,
      avail: '4 Rooms',
      latency: '1.2s',
    },
    {
      name: 'Agoda',
      type: 'Asia-Pacific Leader',
      logoText: 'AG',
      brandColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      status: 'Connected',
      rate: `₹${simulatedRate.toLocaleString('en-IN')}`,
      avail: '4 Rooms',
      latency: '1.4s',
    },
    {
      name: 'Airbnb',
      type: 'Villas & Homestays',
      logoText: 'AB',
      brandColor: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
      status: 'Connected',
      rate: `₹${simulatedRate.toLocaleString('en-IN')}`,
      avail: '4 Rooms',
      latency: '1.8s',
    },
    {
      name: 'Expedia',
      type: 'Corporate & Global',
      logoText: 'EX',
      brandColor: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
      status: 'Connected',
      rate: `₹${simulatedRate.toLocaleString('en-IN')}`,
      avail: '4 Rooms',
      latency: '1.5s',
    },
  ];

  return (
    <section id="channel-manager" className="relative py-24 sm:py-32 bg-gradient-to-b from-[#060B18] via-[#091124] to-[#0D1836] text-white overflow-hidden border-b border-slate-800">
      {/* Ambient Lighting & Glows */}
      <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-10 w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-[160px] pointer-events-none" />

      {/* Grid Pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #38bdf8 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Main Grid: Left Laptop Simulator + Right Value Proposition */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-14 items-center">
          
          {/* ========================================================= */}
          {/* LEFT: REALISTIC INTERACTIVE CHANNEL MANAGER UI SIMULATOR */}
          {/* ========================================================= */}
          <div className="lg:col-span-7 order-2 lg:order-1">
            <div className="relative bg-slate-900/90 backdrop-blur-2xl rounded-3xl border border-slate-700/80 shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden text-slate-100">
              
              {/* Window Title Bar */}
              <div className="bg-slate-950/80 px-4 py-3 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                  <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                </div>
                <div className="px-3 py-1 rounded-full bg-slate-900 text-[11px] font-mono text-slate-300 border border-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>app.hotelmantri.com/channel-manager</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="hidden sm:inline">2-Way Engine Live</span>
                </div>
              </div>

              {/* Inside Dashboard Body */}
              <div className="p-4 sm:p-6 space-y-4">
                
                {/* Header Controls inside App */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-3">
                  <div>
                    <h4 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                      <Radio className="w-4 h-4 text-sky-400" />
                      Multi-Channel Rate & Inventory Hub
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Deluxe Heritage Suite · Status: <span className="text-emerald-400 font-bold">{lastSyncText}</span>
                    </p>
                  </div>

                  <button
                    onClick={handleTriggerSync}
                    disabled={isSyncing}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      isSyncing
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-sky-500/20 text-sky-300 border border-sky-500/30 hover:bg-sky-500/30'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Broadcasting...' : 'Simulate Rate Push'}</span>
                  </button>
                </div>

                {/* Interactive Rate Slider Simulator */}
                <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    <div>
                      <span className="text-xs text-slate-300 font-bold block">Live Master Rate Controller</span>
                      <span className="text-[10px] text-slate-400">Drag to push instant price update across all OTAs</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={2800}
                      max={6500}
                      step={100}
                      value={simulatedRate}
                      onChange={(e) => {
                        setSimulatedRate(Number(e.target.value));
                        setLastSyncText('Broadcasting new rate...');
                      }}
                      className="w-28 sm:w-36 accent-amber-400 cursor-pointer"
                    />
                    <span className="text-sm font-black text-amber-400 font-mono min-w-[70px] text-right">
                      ₹{simulatedRate.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* OTA Sync Table */}
                <div className="space-y-2">
                  {CHANNELS.map((ota) => (
                    <div
                      key={ota.name}
                      className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/80 hover:border-slate-700 transition flex items-center justify-between gap-3"
                    >
                      {/* Brand Info */}
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs border ${ota.brandColor}`}>
                          {ota.logoText}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-white leading-tight">{ota.name}</span>
                            <span className="text-[9px] text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded font-mono">
                              {ota.latency}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">{ota.type}</span>
                        </div>
                      </div>

                      {/* Live Status and Rate */}
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="text-right">
                          <span className="text-xs font-black text-white block">{ota.rate}</span>
                          <span className="text-[10px] text-emerald-400 font-medium">{ota.avail}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="hidden sm:inline">Synced</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom Overbooking Safeguard Strip */}
                <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 flex items-center justify-between text-xs text-emerald-300">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-bold">Overbooking Protection Guarantee:</span>
                    <span className="hidden sm:inline text-slate-300">Inventory locks instantly on every single channel.</span>
                  </div>
                  <span className="font-mono text-[10px] font-bold bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-300">
                    Active 24/7
                  </span>
                </div>

              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* RIGHT: VALUE PROPOSITION, BULLETS & CALL TO ACTION */}
          {/* ========================================================= */}
          <div className="lg:col-span-5 space-y-6 text-left order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-bold uppercase tracking-wider shadow-[0_0_20px_rgba(251,191,36,0.15)]">
              <Radio className="w-3.5 h-3.5" />
              Automated OTA Distribution
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.14]">
              Rates & Inventory. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-400">
                Synced Everywhere.
              </span>
            </h2>

            <p className="text-base sm:text-lg text-slate-300 leading-relaxed font-normal">
              Update your prices and available room inventory once. HotelMantri pushes real-time rate updates and stop-sell orders to MakeMyTrip, Booking.com, Agoda, and Airbnb in under 3 seconds.
            </p>

            {/* Feature Bullets */}
            <div className="space-y-3.5 text-sm text-slate-200">
              <div className="flex items-start gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
                <div className="w-6 h-6 rounded-lg bg-amber-400/20 border border-amber-400/40 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-white text-sm">Instant 2-Way Inventory Decrement</h4>
                  <p className="text-xs text-slate-400 mt-0.5">When a walk-in guest checks in at reception, OTA inventory immediately drops by 1 room.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
                <div className="w-6 h-6 rounded-lg bg-amber-400/20 border border-amber-400/40 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-white text-sm">Zero Overbooking Guarantee</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Never face double-booking penalties or angry guests on busy long weekends again.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
                <div className="w-6 h-6 rounded-lg bg-amber-400/20 border border-amber-400/40 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-white text-sm">Bulk Rate & Restriction Controls</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Set minimum length of stay (MLOS), closed to arrival (CTA), and festival surge rates in 1 click.</p>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <div className="pt-2 flex flex-wrap items-center gap-4">
              <button
                onClick={onOpenBookDemo}
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-gradient-to-r from-amber-400 via-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-sm sm:text-base rounded-full shadow-[0_0_30px_rgba(251,191,36,0.3)] hover:shadow-[0_0_40px_rgba(251,191,36,0.5)] transition cursor-pointer transform hover:-translate-y-0.5"
              >
                Connect Your OTAs Now <ArrowRight className="w-4 h-4 text-slate-950" />
              </button>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
