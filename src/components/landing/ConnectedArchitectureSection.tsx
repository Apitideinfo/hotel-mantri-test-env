import React from 'react';
import { ArrowRight, ArrowLeft, ArrowDown, ArrowUp, RefreshCw, Layers } from 'lucide-react';

interface ConnectedArchitectureProps {
  onOpenBookDemo?: () => void;
}

export const ConnectedArchitectureSection: React.FC<ConnectedArchitectureProps> = ({ onOpenBookDemo }) => {
  const handleScrollToModules = () => {
    const el = document.getElementById('modules');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="architecture" className="py-20 sm:py-28 bg-slate-50/60 border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Column: Heading & Value Proposition */}
          <div className="lg:col-span-5 space-y-5 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-bold uppercase tracking-wider">
              <Layers className="w-3.5 h-3.5" /> Connected Architecture
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.15]">
              One Hotel. <br />
              One System. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600">
                No Double Entry.
              </span>
            </h2>

            <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-md font-normal">
              HotelMantri connects your reservation, inventory, guest, operations, finance and reports so your team doesn't have to enter the same information again and again.
            </p>

            <div className="pt-2">
              <button
                onClick={handleScrollToModules}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-bold text-sm shadow-md shadow-amber-500/20 hover:shadow-amber-500/30 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
              >
                See How It Works <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Column: Visual Flow Architecture (6-node Connected Grid) */}
          <div className="lg:col-span-7 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
            {/* Top Row: 1 -> 2 -> 3 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-2 items-center relative">
              {/* Step 1 */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200 text-center hover:border-blue-400 hover:bg-blue-50/30 transition shadow-2xs group">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition">
                  1
                </div>
                <h4 className="text-sm font-bold text-slate-900">Reservation</h4>
                <p className="text-xs text-slate-500 mt-0.5">Create booking</p>
              </div>

              {/* Arrow 1 -> 2 */}
              <div className="hidden sm:flex justify-center text-slate-300">
                <ArrowRight className="w-5 h-5 text-blue-500 animate-pulse" />
              </div>

              {/* Step 2 */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200 text-center hover:border-emerald-400 hover:bg-emerald-50/30 transition shadow-2xs group">
                <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition">
                  2
                </div>
                <h4 className="text-sm font-bold text-slate-900">Inventory</h4>
                <p className="text-xs text-slate-500 mt-0.5">Updates automatically</p>
              </div>

              {/* Arrow 2 -> 3 */}
              <div className="hidden sm:flex justify-center text-slate-300">
                <ArrowRight className="w-5 h-5 text-emerald-500 animate-pulse" />
              </div>

              {/* Step 3 */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200 text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition shadow-2xs group">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition">
                  3
                </div>
                <h4 className="text-sm font-bold text-slate-900">Guest</h4>
                <p className="text-xs text-slate-500 mt-0.5">Profile & History</p>
              </div>
            </div>

            {/* Connecting Row (Down Arrow on Right) */}
            <div className="hidden sm:flex justify-end pr-14 py-2">
              <ArrowDown className="w-5 h-5 text-indigo-400 animate-bounce" />
            </div>

            {/* Bottom Row: 4 <- 5 <- 6 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-2 items-center relative mt-2 sm:mt-0">
              {/* Step 4 */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200 text-center hover:border-amber-400 hover:bg-amber-50/30 transition shadow-2xs group">
                <div className="w-8 h-8 rounded-full bg-amber-500 text-white font-bold text-xs flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition">
                  4
                </div>
                <h4 className="text-sm font-bold text-slate-900">Finance</h4>
                <p className="text-xs text-slate-500 mt-0.5">Collection & Reports</p>
              </div>

              {/* Arrow 5 -> 4 */}
              <div className="hidden sm:flex justify-center text-slate-300">
                <ArrowLeft className="w-5 h-5 text-amber-500 animate-pulse" />
              </div>

              {/* Step 5 */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200 text-center hover:border-teal-400 hover:bg-teal-50/30 transition shadow-2xs group">
                <div className="w-8 h-8 rounded-full bg-teal-600 text-white font-bold text-xs flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition">
                  5
                </div>
                <h4 className="text-sm font-bold text-slate-900">Housekeeping</h4>
                <p className="text-xs text-slate-500 mt-0.5">Room Status Update</p>
              </div>

              {/* Arrow 6 -> 5 */}
              <div className="hidden sm:flex justify-center text-slate-300">
                <ArrowLeft className="w-5 h-5 text-sky-500 animate-pulse" />
              </div>

              {/* Step 6 */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200 text-center hover:border-sky-400 hover:bg-sky-50/30 transition shadow-2xs group">
                <div className="w-8 h-8 rounded-full bg-sky-600 text-white font-bold text-xs flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition">
                  6
                </div>
                <h4 className="text-sm font-bold text-slate-900">Channel Manager</h4>
                <p className="text-xs text-slate-500 mt-0.5">Syncs with OTAs</p>
              </div>
            </div>

            {/* Loopback Note */}
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
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
