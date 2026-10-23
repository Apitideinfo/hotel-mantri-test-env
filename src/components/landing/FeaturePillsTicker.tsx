import React from 'react';
import {
  Calendar, Radio, Sparkle, Wallet, BarChart3, UtensilsCrossed, Shirt, MessageSquare,
} from 'lucide-react';

interface FeaturePillItem {
  label: string;
  desc: string;
  icon: React.ReactNode;
  accent: string;
}

export const FeaturePillsTicker: React.FC = () => {
  const PILLS: FeaturePillItem[] = [
    { label: 'PMS', desc: 'Front Desk & Rooms', icon: <Calendar className="w-4 h-4 text-amber-400" />, accent: 'border-amber-500/30 text-amber-300' },
    { label: 'Channel Manager', desc: 'OTA Auto-Sync', icon: <Radio className="w-4 h-4 text-sky-400" />, accent: 'border-sky-500/30 text-sky-300' },
    { label: 'Housekeeping', desc: 'Turnover & Status', icon: <Sparkle className="w-4 h-4 text-emerald-400" />, accent: 'border-emerald-500/30 text-emerald-300' },
    { label: 'Finance', desc: 'Ledger & Cash Flow', icon: <Wallet className="w-4 h-4 text-amber-400" />, accent: 'border-amber-500/30 text-amber-300' },
    { label: 'Reports', desc: 'Daily MIS & P&L', icon: <BarChart3 className="w-4 h-4 text-purple-400" />, accent: 'border-purple-500/30 text-purple-300' },
    { label: 'POS', desc: 'Restaurant & Bar', icon: <UtensilsCrossed className="w-4 h-4 text-rose-400" />, accent: 'border-rose-500/30 text-rose-300' },
    { label: 'Laundry', desc: 'Linen Management', icon: <Shirt className="w-4 h-4 text-cyan-400" />, accent: 'border-cyan-500/30 text-cyan-300' },
    { label: 'WhatsApp', desc: 'Automated Bills & Alerts', icon: <MessageSquare className="w-4 h-4 text-emerald-400" />, accent: 'border-emerald-500/30 text-emerald-300' },
  ];

  // Repeat pills 3 times to ensure seamless infinite continuous scroll loop
  const TICKER_ITEMS = [...PILLS, ...PILLS, ...PILLS];

  return (
    <div className="relative w-full bg-[#070D1D] border-y border-slate-800/90 py-3.5 sm:py-4 overflow-hidden z-20 shadow-lg">
      {/* Edge Gradient Masks for Smooth In/Out Fade */}
      <div className="absolute left-0 top-0 bottom-0 w-16 sm:w-28 bg-gradient-to-r from-[#070D1D] via-[#070D1D]/80 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 sm:w-28 bg-gradient-to-l from-[#070D1D] via-[#070D1D]/80 to-transparent z-10 pointer-events-none" />

      {/* Marquee Track Container */}
      <div className="flex items-center">
        <div className="animate-marquee-fast flex items-center gap-3 sm:gap-4 shrink-0">
          {TICKER_ITEMS.map((item, index) => (
            <div
              key={`${item.label}-${index}`}
              className="inline-flex items-center gap-2.5 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full bg-slate-900/90 backdrop-blur-md border border-slate-800 hover:border-amber-400/60 hover:bg-slate-800/90 transition-all duration-200 shadow-md group cursor-default select-none shrink-0"
            >
              <div className="p-1 rounded-lg bg-slate-950/60 border border-slate-700/50 group-hover:scale-110 transition-transform">
                {item.icon}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-[13px] font-extrabold text-white tracking-wide">
                  {item.label}
                </span>
                <span className="text-[10px] sm:text-[11px] font-medium text-slate-400 hidden md:inline">
                  • {item.desc}
                </span>
              </div>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
