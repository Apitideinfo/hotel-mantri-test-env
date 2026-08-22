import React from 'react';

interface LogoProps {
  light?: boolean;
  size?: 'normal' | 'large';
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ light = false, size = 'normal', className = '' }) => {
  const isLarge = size === 'large';

  return (
    <div className={`flex items-center gap-3.5 select-none ${className}`}>
      {/* Glowing Brand Icon Badge */}
      <div className={`rounded-2xl bg-gradient-to-br from-[#00d2ff] via-[#1a68fb] to-[#0048c4] flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0 relative overflow-hidden transition-transform duration-300 hover:scale-105 ${
        isLarge ? 'w-12 h-12' : 'w-10 h-10'
      }`}>
        <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px]" />
        <svg
          width={isLarge ? 28 : 24}
          height={isLarge ? 28 : 24}
          viewBox="0 0 32 32"
          fill="none"
          className="relative z-10"
        >
          <path
            d="M6 7V25M26 7V25M6 16H26M18 11L22 7V25"
            stroke="white"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M23 8.5L25 5.5L27 8.5L30 10.5L27 12.5L25 15.5L23 12.5L20 10.5L23 8.5Z"
            fill="#FACC15"
          />
        </svg>
      </div>

      {/* Typography */}
      <div>
        <div className={`flex items-center font-black tracking-tight leading-none ${
          isLarge ? 'text-2xl' : 'text-xl'
        }`}>
          <span className={light ? 'text-white' : 'text-[#0f172a]'}>Hotel</span>
          <span className="text-[#1a68fb]">Mantri</span>
        </div>
        <p className={`font-bold tracking-[0.12em] uppercase mt-1 ${
          isLarge ? 'text-[11px]' : 'text-[10px]'
        } ${light ? 'text-blue-200/70' : 'text-slate-400'}`}>
          Hospitality Management Platform
        </p>
      </div>
    </div>
  );
};
