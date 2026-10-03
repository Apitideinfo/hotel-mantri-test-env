import React from 'react';
import { ArrowRight, MessageSquareCode } from 'lucide-react';

interface TalkToCeoBannerProps {
  onLogin?: () => void;
}

export const TalkToCeoBanner: React.FC<TalkToCeoBannerProps> = ({ onLogin }) => {
  return (
    <section className="relative w-full bg-black text-white py-16 sm:py-20 select-none overflow-hidden border-y border-neutral-800">
      {/* Subtle Ambient Glow */}
      <div className="absolute right-0 top-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute left-0 bottom-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8 relative z-10">
        
        {/* Left Text */}
        <div>
          <h3 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight mb-2">
            Talk directly with our CEO
          </h3>
          <p className="text-gray-400 text-sm sm:text-base font-normal max-w-xl">
            Share feedback, ideas, or concerns — no middle layers.
          </p>
        </div>

        {/* Right Button */}
        <button
          onClick={onLogin}
          className="relative z-10 inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-white text-black text-sm font-bold hover:bg-gray-100 active:scale-95 transition-all shadow-md shrink-0 cursor-pointer"
        >
          Talk to the CEO
          <ArrowRight className="w-4 h-4" />
        </button>

      </div>
    </section>
  );
};
