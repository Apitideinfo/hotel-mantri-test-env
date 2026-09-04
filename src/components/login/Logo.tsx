import React from 'react';

interface LogoProps {
  light?: boolean;
  size?: 'normal' | 'large';
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 'normal', className = '' }) => {
  const isLarge = size === 'large';
  const circleSize = isLarge
    ? 'w-28 h-28 sm:w-36 sm:h-36 lg:w-40 lg:h-40'
    : 'w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28';

  return (
    <div className={`inline-flex items-center justify-center select-none ${className}`}>
      <div className={`${circleSize} rounded-full bg-white shadow-xl border-2 border-slate-200/80 flex items-center justify-center shrink-0 transition-transform duration-200 hover:scale-105 overflow-hidden p-1`}>
        <img
          src="/ChatGPT_Image_Aug_4,_2026,_04_24_46_AM.png"
          alt="HotelMantri"
          className="w-full h-full object-contain scale-140"
        />
      </div>
    </div>
  );
};
