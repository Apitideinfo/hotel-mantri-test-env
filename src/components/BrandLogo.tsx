/**
 * Shared Hotel Mantri official brand logo and icon components.
 * 100% Exact match to official HotelMantri brand identity & client reference image.
 */

import React from 'react';

export const BRAND_LOGO_SRC = '/hotel-mantri-logo@2x.png';
export const BRAND_ICON_SRC = '/hotel-mantri-icon-clean.png';

export const HotelMantriVectorIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 38,
  className = '',
}) => (
  <img
    src={BRAND_ICON_SRC}
    alt="HotelMantri Icon"
    style={{ width: `${size}px`, height: `${size}px` }}
    className={`shrink-0 object-contain select-none ${className}`}
  />
);

type Variant = 'login' | 'sidebar' | 'mobile' | 'invoice' | 'compact';

interface BrandLogoProps {
  variant?: Variant;
  onDark?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'sidebar',
  className = '',
  style,
}) => {
  const heightClass =
    variant === 'login'
      ? 'h-[52px]'
      : variant === 'sidebar'
      ? 'h-[42px]'
      : variant === 'mobile'
      ? 'h-[36px]'
      : variant === 'invoice'
      ? 'h-[40px]'
      : 'h-[32px]';

  return (
    <div className={`inline-flex items-center select-none ${className}`} style={style}>
      <img
        src={BRAND_LOGO_SRC}
        alt="HotelMantri — YOUR HOTEL'S DIGITAL MANAGER"
        className={`${heightClass} w-auto object-contain shrink-0 drop-shadow-2xs`}
        loading="eager"
      />
    </div>
  );
};

export const BrandIcon: React.FC<{
  size?: number;
  onDark?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ size = 38, onDark = false, className = '', style }) => {
  return (
    <div
      className={`rounded-2xl ${
        onDark ? 'bg-slate-900 border border-slate-700/80' : 'bg-white border border-slate-200/80'
      } shadow-xs flex items-center justify-center aspect-square shrink-0 p-1.5 ${className}`}
      style={{ width: `${size}px`, height: `${size}px`, ...style }}
    >
      <img
        src={BRAND_ICON_SRC}
        alt="HotelMantri"
        className="w-full h-full object-contain select-none"
        loading="eager"
      />
    </div>
  );
};
