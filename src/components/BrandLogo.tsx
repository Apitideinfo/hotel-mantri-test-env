/**
 * Shared Hotel Mantri official brand logo and icon components.
 * 100% Exact match to official HotelMantri brand identity & client reference image.
 * Hybrid crisp vector typography + ultra-high-resolution brand icon mark.
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
    loading="eager"
  />
);

type Variant = 'login' | 'sidebar' | 'mobile' | 'invoice' | 'compact' | 'landing-header' | 'landing-footer';

interface BrandLogoProps {
  variant?: Variant;
  onDark?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'sidebar',
  onDark = false,
  className = '',
  style,
}) => {
  // Balanced proportions per variant
  const config = {
    login: {
      iconSize: 44,
      titleClass: 'text-[24px]',
      taglineClass: 'text-[8.5px] tracking-[0.2em] mt-1',
      gap: 'gap-3',
    },
    sidebar: {
      iconSize: 36,
      titleClass: 'text-[20px]',
      taglineClass: 'text-[7.5px] tracking-[0.16em] mt-0.5',
      gap: 'gap-2.5',
    },
    mobile: {
      iconSize: 30,
      titleClass: 'text-[17px]',
      taglineClass: 'text-[6.5px] tracking-[0.15em] mt-0.5',
      gap: 'gap-2',
    },
    invoice: {
      iconSize: 34,
      titleClass: 'text-[19px]',
      taglineClass: 'text-[7px] tracking-[0.16em] mt-0.5',
      gap: 'gap-2',
    },
    compact: {
      iconSize: 26,
      titleClass: 'text-[15px]',
      taglineClass: 'hidden',
      gap: 'gap-1.5',
    },
    'landing-header': {
      iconSize: 34,
      titleClass: 'text-[20px] sm:text-[22px]',
      taglineClass: 'text-[7px] sm:text-[7.5px] tracking-[0.16em] mt-0.5',
      gap: 'gap-2.5',
    },
    'landing-footer': {
      iconSize: 38,
      titleClass: 'text-[22px] sm:text-[24px]',
      taglineClass: 'text-[7.5px] sm:text-[8px] tracking-[0.18em] mt-1',
      gap: 'gap-3',
    },
  }[variant];

  return (
    <div
      className={`inline-flex items-center ${config.gap} select-none ${className}`}
      style={style}
    >
      <img
        src={BRAND_ICON_SRC}
        alt="HotelMantri — Your Hotel's Digital Manager"
        width={config.iconSize}
        height={config.iconSize}
        style={{ width: `${config.iconSize}px`, height: `${config.iconSize}px` }}
        className="shrink-0 object-contain drop-shadow-sm select-none"
        loading="eager"
      />
      <div className="flex flex-col justify-center leading-none">
        <div className={`font-black tracking-tight leading-none ${config.titleClass}`}>
          <span className={onDark ? 'text-white' : 'text-[#0a1628]'}>Hotel</span>
          <span className="text-[#2563eb]">Mantri</span>
        </div>
        {config.taglineClass !== 'hidden' && (
          <span
            className={`font-bold uppercase leading-none ${config.taglineClass} ${
              onDark ? 'text-slate-300' : 'text-slate-500'
            }`}
          >
            YOUR HOTEL'S DIGITAL MANAGER
          </span>
        )}
      </div>
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
