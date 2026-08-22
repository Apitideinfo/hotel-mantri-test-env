import React from 'react';
import { Bed, BarChart3, MessageSquare } from 'lucide-react';

interface FeatureItem {
  icon: React.ReactNode;
  title: string;
}

const FEATURES: FeatureItem[] = [
  {
    icon: <Bed className="w-4 h-4 text-cyan-400" />,
    title: 'Room Management',
  },
  {
    icon: <span className="text-cyan-400 font-extrabold text-sm leading-none">₹</span>,
    title: 'Finance & GST',
  },
  {
    icon: <BarChart3 className="w-4 h-4 text-cyan-400" />,
    title: 'Reports',
  },
  {
    icon: <MessageSquare className="w-4 h-4 text-cyan-400" />,
    title: 'WhatsApp Billing',
  },
];

export const FeatureHighlights: React.FC = () => {
  return (
    <div className="flex flex-wrap items-center gap-3 sm:gap-4 my-6 select-none">
      {FEATURES.map((feat) => (
        <div
          key={feat.title}
          className="flex items-center gap-2 bg-slate-900/60 hover:bg-slate-800/70 backdrop-blur-xl border border-white/10 hover:border-cyan-400/30 rounded-xl px-3.5 py-2.5 text-white text-xs font-semibold shadow-lg shadow-black/20 transition-all duration-200 cursor-default"
        >
          <div className="w-5 h-5 rounded-md bg-cyan-400/10 flex items-center justify-center shrink-0">
            {feat.icon}
          </div>
          <span className="tracking-wide text-slate-200">{feat.title}</span>
        </div>
      ))}
    </div>
  );
};


