import React from 'react';
import { Building2, Palmtree, Landmark, Sparkles, Briefcase, Building } from 'lucide-react';

export const CredibilityStrip: React.FC = () => {
  const CATEGORIES = [
    { label: 'Hotels', icon: Building2 },
    { label: 'Resorts', icon: Palmtree },
    { label: 'Pilgrimage Hotels', icon: Landmark },
    { label: 'Boutique Properties', icon: Sparkles },
    { label: 'Business Hotels', icon: Briefcase },
    { label: 'Hotel Groups', icon: Building },
  ];

  return (
    <section className="bg-white border-b border-slate-200/80 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Section Label */}
        <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-800 mb-6">
          Built for Independent Hotels, Resorts & Boutique Properties
        </p>

        {/* Categories Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <div
                key={cat.label}
                className="flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200/90 text-slate-700 hover:border-slate-300 hover:bg-slate-100/70 hover:text-slate-950 transition-all duration-150 shadow-2xs"
              >
                <Icon className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="text-xs sm:text-[13px] font-semibold tracking-tight whitespace-nowrap">
                  {cat.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
