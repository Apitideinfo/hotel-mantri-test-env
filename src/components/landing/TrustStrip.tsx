import React from 'react';
import { ShieldCheck, Cloud, FileText, Lock } from 'lucide-react';

export const TrustStrip: React.FC = () => {
  const trustSignals = [
    { label: 'Built for Modern Hotels', icon: ShieldCheck, accent: 'text-cyan-400' },
    { label: 'Cloud-Based Platform', icon: Cloud, accent: 'text-blue-400' },
    { label: 'GST-Ready Workflows', icon: FileText, accent: 'text-emerald-400' },
    { label: 'Secure Infrastructure', icon: Lock, accent: 'text-indigo-400' },
  ];

  return (
    <section className="bg-[#040e21] border-y border-white/10 py-7 select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 text-center">
          {trustSignals.map((item) => {
            const IconComp = item.icon;
            return (
              <div
                key={item.label}
                className="p-3.5 flex items-center justify-center gap-3 bg-slate-900/60 rounded-2xl border border-white/10 backdrop-blur-md shadow-lg hover:border-white/20 transition-all duration-300"
              >
                <IconComp className={`w-4 h-4 sm:w-5 sm:h-5 ${item.accent} shrink-0`} />
                <span className="text-xs sm:text-sm font-bold text-slate-200 tracking-wide">
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

