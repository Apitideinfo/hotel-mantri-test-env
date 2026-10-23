import React, { useState, useEffect } from 'react';
import {
  ArrowRight, ArrowLeft, ArrowDown, RefreshCw, Layers,
  Calendar, Bed, Users, Wallet, Sparkles, Radio, CheckCircle2, Zap,
} from 'lucide-react';

interface ConnectedArchitectureProps {
  onOpenBookDemo?: () => void;
}

interface StepItem {
  id: number;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  liveMsg: string;
  metric: string;
}

export const ConnectedArchitectureSection: React.FC<ConnectedArchitectureProps> = ({ onOpenBookDemo }) => {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const SEQUENCE = [1, 2, 3, 6, 5, 4];

  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setActiveStep((prev) => {
        const currentIndex = SEQUENCE.indexOf(prev);
        const nextIndex = (currentIndex + 1) % SEQUENCE.length;
        return SEQUENCE[nextIndex];
      });
    }, 2400);

    return () => clearInterval(interval);
  }, [isPaused]);

  const handleScrollToModules = () => {
    const el = document.getElementById('modules');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const STEPS: Record<number, StepItem> = {
    1: {
      id: 1,
      title: 'Reservation',
      subtitle: 'Create booking',
      icon: Calendar,
      color: 'blue',
      liveMsg: 'New reservation #HM-8840 confirmed via Direct Walk-in / OTA',
      metric: 'Instant Sync',
    },
    2: {
      id: 2,
      title: 'Inventory',
      subtitle: 'Updates automatically',
      icon: Bed,
      color: 'emerald',
      liveMsg: 'Inventory decremented across all 5 OTAs instantly (Zero Overbooking)',
      metric: '100% Synced',
    },
    3: {
      id: 3,
      title: 'Guest',
      subtitle: 'Profile & History',
      icon: Users,
      color: 'indigo',
      liveMsg: 'Guest ID proof, contact & stay history matched and stored securely',
      metric: 'Auto-Matched',
    },
    6: {
      id: 6,
      title: 'Channel Manager',
      subtitle: 'Syncs with OTAs',
      icon: Radio,
      color: 'sky',
      liveMsg: 'Real-time rates & room blocks pushed to Booking.com, MMT & Agoda',
      metric: '< 2 Sec Sync',
    },
    5: {
      id: 5,
      title: 'Housekeeping',
      subtitle: 'Room Status Update',
      icon: Sparkles,
      color: 'teal',
      liveMsg: 'Room automatically flagged "Turnover Required" upon departure',
      metric: 'Live Task Board',
    },
    4: {
      id: 4,
      title: 'Finance',
      subtitle: 'Collection & Reports',
      icon: Wallet,
      color: 'amber',
      liveMsg: 'Invoice generated, advance logged & GST ledger updated in real-time',
      metric: 'Real-Time MIS',
    },
  };

  const currentStepData = STEPS[activeStep] || STEPS[1];

  return (
    <section id="architecture" className="relative py-20 sm:py-28 bg-slate-50/70 border-b border-slate-200/80 overflow-hidden">
      {/* Background Subtle Animated Glow */}
      <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDuration: '5s' }} />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Column: Heading & Value Proposition */}
          <div className="lg:col-span-5 space-y-5 text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-bold uppercase tracking-wider shadow-2xs">
              <Layers className="w-3.5 h-3.5 text-blue-600 animate-spin" style={{ animationDuration: '8s' }} />
              Connected Architecture
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-[1.15]">
              One Hotel. <br />
              One System. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 animate-shimmer">
                No Double Entry.
              </span>
            </h2>

            <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-md font-normal">
              HotelMantri connects your reservation, inventory, guest, operations, finance and reports so your team doesn't have to enter the same information again and again.
            </p>

            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={handleScrollToModules}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-amber-400 via-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-extrabold text-sm shadow-md shadow-amber-500/20 hover:shadow-amber-500/30 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
              >
                See How It Works <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>

              {onOpenBookDemo && (
                <button
                  onClick={onOpenBookDemo}
                  className="inline-flex items-center gap-1.5 px-5 py-3 rounded-full bg-white hover:bg-slate-100 text-slate-800 font-bold text-sm border border-slate-200 shadow-2xs transition cursor-pointer"
                >
                  Book Demo
                </button>
              )}
            </div>

            {/* Live Indicator */}
            <div className="pt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Real-time 2-way data flow active across departments</span>
            </div>
          </div>

          {/* Right Column: Visual Flow Architecture (Animated 6-node Connected Grid) */}
          <div
            className="lg:col-span-7 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-200/60 relative"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            {/* Top Row: 1 (Reservation) -> 2 (Inventory) -> 3 (Guest) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-2 items-center relative">
              {/* Step 1 */}
              <div
                onClick={() => setActiveStep(1)}
                className={`p-4 rounded-2xl border text-center transition-all duration-300 shadow-2xs cursor-pointer select-none ${
                  activeStep === 1
                    ? 'bg-gradient-to-br from-blue-50 to-indigo-50/40 border-blue-500 ring-2 ring-blue-500/30 shadow-lg shadow-blue-500/15 scale-[1.03]'
                    : 'bg-slate-50/80 border-slate-200 hover:border-blue-300 hover:bg-blue-50/20'
                }`}
              >
                <div className="relative w-8 h-8 mx-auto mb-2">
                  {activeStep === 1 && (
                    <span className="absolute -inset-1 rounded-full bg-blue-400 animate-ping opacity-60" />
                  )}
                  <div className={`relative w-8 h-8 rounded-full font-black text-xs flex items-center justify-center transition ${
                    activeStep === 1 ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-200 text-slate-700'
                  }`}>
                    1
                  </div>
                </div>
                <h4 className="text-sm font-black text-slate-900">Reservation</h4>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">Create booking</p>
              </div>

              {/* Arrow 1 -> 2 */}
              <div className="hidden sm:flex justify-center">
                <ArrowRight className={`w-5 h-5 transition-all duration-300 ${
                  activeStep === 1 ? 'text-blue-600 scale-125 animate-pulse' : 'text-slate-300'
                }`} />
              </div>

              {/* Step 2 */}
              <div
                onClick={() => setActiveStep(2)}
                className={`p-4 rounded-2xl border text-center transition-all duration-300 shadow-2xs cursor-pointer select-none ${
                  activeStep === 2
                    ? 'bg-gradient-to-br from-emerald-50 to-teal-50/40 border-emerald-500 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/15 scale-[1.03]'
                    : 'bg-slate-50/80 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/20'
                }`}
              >
                <div className="relative w-8 h-8 mx-auto mb-2">
                  {activeStep === 2 && (
                    <span className="absolute -inset-1 rounded-full bg-emerald-400 animate-ping opacity-60" />
                  )}
                  <div className={`relative w-8 h-8 rounded-full font-black text-xs flex items-center justify-center transition ${
                    activeStep === 2 ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-200 text-slate-700'
                  }`}>
                    2
                  </div>
                </div>
                <h4 className="text-sm font-black text-slate-900">Inventory</h4>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">Updates automatically</p>
              </div>

              {/* Arrow 2 -> 3 */}
              <div className="hidden sm:flex justify-center">
                <ArrowRight className={`w-5 h-5 transition-all duration-300 ${
                  activeStep === 2 ? 'text-emerald-600 scale-125 animate-pulse' : 'text-slate-300'
                }`} />
              </div>

              {/* Step 3 */}
              <div
                onClick={() => setActiveStep(3)}
                className={`p-4 rounded-2xl border text-center transition-all duration-300 shadow-2xs cursor-pointer select-none ${
                  activeStep === 3
                    ? 'bg-gradient-to-br from-indigo-50 to-purple-50/40 border-indigo-500 ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-500/15 scale-[1.03]'
                    : 'bg-slate-50/80 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/20'
                }`}
              >
                <div className="relative w-8 h-8 mx-auto mb-2">
                  {activeStep === 3 && (
                    <span className="absolute -inset-1 rounded-full bg-indigo-400 animate-ping opacity-60" />
                  )}
                  <div className={`relative w-8 h-8 rounded-full font-black text-xs flex items-center justify-center transition ${
                    activeStep === 3 ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-200 text-slate-700'
                  }`}>
                    3
                  </div>
                </div>
                <h4 className="text-sm font-black text-slate-900">Guest</h4>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">Profile & History</p>
              </div>
            </div>

            {/* Connecting Row (Down Arrow on Right) */}
            <div className="hidden sm:flex justify-end pr-14 py-2">
              <ArrowDown className={`w-5 h-5 transition-all duration-300 ${
                activeStep === 3 ? 'text-indigo-600 scale-125 animate-bounce' : 'text-slate-300'
              }`} />
            </div>

            {/* Bottom Row: 4 (Finance) <- 5 (Housekeeping) <- 6 (Channel Manager) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-2 items-center relative mt-2 sm:mt-0">
              {/* Step 4 */}
              <div
                onClick={() => setActiveStep(4)}
                className={`p-4 rounded-2xl border text-center transition-all duration-300 shadow-2xs cursor-pointer select-none ${
                  activeStep === 4
                    ? 'bg-gradient-to-br from-amber-50 to-orange-50/40 border-amber-500 ring-2 ring-amber-500/30 shadow-lg shadow-amber-500/15 scale-[1.03]'
                    : 'bg-slate-50/80 border-slate-200 hover:border-amber-300 hover:bg-amber-50/20'
                }`}
              >
                <div className="relative w-8 h-8 mx-auto mb-2">
                  {activeStep === 4 && (
                    <span className="absolute -inset-1 rounded-full bg-amber-400 animate-ping opacity-60" />
                  )}
                  <div className={`relative w-8 h-8 rounded-full font-black text-xs flex items-center justify-center transition ${
                    activeStep === 4 ? 'bg-amber-500 text-white shadow-md' : 'bg-slate-200 text-slate-700'
                  }`}>
                    4
                  </div>
                </div>
                <h4 className="text-sm font-black text-slate-900">Finance</h4>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">Collection & Reports</p>
              </div>

              {/* Arrow 5 -> 4 */}
              <div className="hidden sm:flex justify-center">
                <ArrowLeft className={`w-5 h-5 transition-all duration-300 ${
                  activeStep === 5 ? 'text-teal-600 scale-125 animate-pulse' : 'text-slate-300'
                }`} />
              </div>

              {/* Step 5 */}
              <div
                onClick={() => setActiveStep(5)}
                className={`p-4 rounded-2xl border text-center transition-all duration-300 shadow-2xs cursor-pointer select-none ${
                  activeStep === 5
                    ? 'bg-gradient-to-br from-teal-50 to-emerald-50/40 border-teal-500 ring-2 ring-teal-500/30 shadow-lg shadow-teal-500/15 scale-[1.03]'
                    : 'bg-slate-50/80 border-slate-200 hover:border-teal-300 hover:bg-teal-50/20'
                }`}
              >
                <div className="relative w-8 h-8 mx-auto mb-2">
                  {activeStep === 5 && (
                    <span className="absolute -inset-1 rounded-full bg-teal-400 animate-ping opacity-60" />
                  )}
                  <div className={`relative w-8 h-8 rounded-full font-black text-xs flex items-center justify-center transition ${
                    activeStep === 5 ? 'bg-teal-600 text-white shadow-md' : 'bg-slate-200 text-slate-700'
                  }`}>
                    5
                  </div>
                </div>
                <h4 className="text-sm font-black text-slate-900">Housekeeping</h4>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">Room Status Update</p>
              </div>

              {/* Arrow 6 -> 5 */}
              <div className="hidden sm:flex justify-center">
                <ArrowLeft className={`w-5 h-5 transition-all duration-300 ${
                  activeStep === 6 ? 'text-sky-600 scale-125 animate-pulse' : 'text-slate-300'
                }`} />
              </div>

              {/* Step 6 */}
              <div
                onClick={() => setActiveStep(6)}
                className={`p-4 rounded-2xl border text-center transition-all duration-300 shadow-2xs cursor-pointer select-none ${
                  activeStep === 6
                    ? 'bg-gradient-to-br from-sky-50 to-blue-50/40 border-sky-500 ring-2 ring-sky-500/30 shadow-lg shadow-sky-500/15 scale-[1.03]'
                    : 'bg-slate-50/80 border-slate-200 hover:border-sky-300 hover:bg-sky-50/20'
                }`}
              >
                <div className="relative w-8 h-8 mx-auto mb-2">
                  {activeStep === 6 && (
                    <span className="absolute -inset-1 rounded-full bg-sky-400 animate-ping opacity-60" />
                  )}
                  <div className={`relative w-8 h-8 rounded-full font-black text-xs flex items-center justify-center transition ${
                    activeStep === 6 ? 'bg-sky-600 text-white shadow-md' : 'bg-slate-200 text-slate-700'
                  }`}>
                    6
                  </div>
                </div>
                <h4 className="text-sm font-black text-slate-900">Channel Manager</h4>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">Syncs with OTAs</p>
              </div>
            </div>

            {/* Dynamic Real-time Event Simulation Banner */}
            <div className="mt-5 p-3.5 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-inner flex items-center justify-between gap-3 transition-all duration-300">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-amber-400/20 text-amber-400 shrink-0">
                  <Zap className="w-4 h-4 animate-bounce" />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    Step {currentStepData.id} • {currentStepData.title}
                  </p>
                  <p className="text-xs text-slate-200 font-medium truncate mt-0.5">
                    {currentStepData.liveMsg}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> {currentStepData.metric}
              </span>
            </div>

            {/* Loopback Note */}
            <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1.5 font-medium text-slate-700">
                <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin" style={{ animationDuration: '6s' }} /> Real-time 2-way sync across all 6 departments
              </span>
              <span className="font-semibold text-blue-600">Zero duplicate entries</span>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
