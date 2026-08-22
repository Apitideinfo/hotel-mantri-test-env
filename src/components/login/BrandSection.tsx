import React from 'react';
import { Logo } from './Logo';
import { FeatureHighlights } from './FeatureHighlights';
import { HotelVisualization } from './HotelVisualization';

export const BrandSection: React.FC = () => {
  return (
    <div className="relative flex-1 lg:w-7/12 bg-[#06152F] flex flex-col justify-between p-8 sm:p-12 lg:p-14 overflow-hidden select-none">
      {/* Background Radial Glows & Grid */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-500/15 rounded-full blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
      </div>

      {/* Top Header Branding */}
      <div className="relative z-20">
        <Logo light />
      </div>

      {/* Main Headline & Value Proposition Content */}
      <div className="relative z-20 my-auto py-6">
        <div className="max-w-xl mb-6">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.1] mb-4">
            Hospitality,<br />
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-300 bg-clip-text text-transparent">
              reimagined.
            </span>
          </h1>
          <p className="text-slate-300 text-base sm:text-lg leading-relaxed font-normal">
            Manage rooms, revenue, staff, and guest experiences — all from one elegant dashboard built for modern Indian hotels.
          </p>
        </div>

        {/* 4 Feature Capability Pills */}
        <FeatureHighlights />

        {/* 3D Hotel Video Render & Floating Operational Cards */}
        <HotelVisualization />
      </div>

      {/* Bottom Tagline */}
      <div className="relative z-20 flex items-center gap-3 text-slate-400 text-xs font-extrabold tracking-[0.2em] uppercase pt-4">
        <div className="w-8 h-[2px] bg-cyan-400" />
        <span>SMARTER OPERATIONS. HAPPIER GUESTS.</span>
      </div>
    </div>
  );
};


