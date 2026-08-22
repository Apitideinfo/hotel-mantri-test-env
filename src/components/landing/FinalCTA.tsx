import React from 'react';
import { ArrowRight } from 'lucide-react';

interface FinalCTAProps {
  onStartNow: () => void;
  onLogin: () => void;
}

export const FinalCTA: React.FC<FinalCTAProps> = ({ onStartNow, onLogin }) => {
  const handleExplore = () => {
    const el = document.getElementById('features');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="py-20 lg:py-28 bg-gradient-to-b from-[#040e21] to-[#06152F] relative overflow-hidden select-none border-t border-white/10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        <div className="bg-gradient-to-r from-[#0c254e] via-[#0f2c5d] to-[#091b3b] rounded-3xl p-10 sm:p-16 border border-white/15 shadow-2xl relative overflow-hidden">
          {/* Ambient Glow Orbs */}
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-cyan-400/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight mb-4">
            Ready to simplify your hotel operations?
          </h2>
          <p className="text-slate-300 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto mb-8 font-normal">
            Manage rooms, bookings, finance, guests and more from one connected platform.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onStartNow}
              className="group bg-[#1a68fb] hover:bg-blue-600 active:bg-blue-700 text-white font-extrabold text-base px-8 py-4 rounded-2xl shadow-xl shadow-blue-500/25 transition-all duration-200 flex items-center gap-3 cursor-pointer transform hover:-translate-y-0.5"
            >
              <span>Get Started</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={handleExplore}
              className="bg-white/10 hover:bg-white/15 text-white font-bold text-base px-8 py-4 rounded-2xl border border-white/15 backdrop-blur-md transition-all duration-200 cursor-pointer"
            >
              Explore Platform
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

