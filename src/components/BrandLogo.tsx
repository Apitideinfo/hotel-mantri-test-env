/**
 * Shared Hotel Mantri brand logo component.
 * Single source of truth for the official PNG logo path.
 * Use BrandLogo for full logo (sidebar, login, invoice).
 * Use BrandIcon for compact icon-size display (collapsed sidebar, mobile header).
 * The same PNG is used at different sizes — no cropping.
 */

const LOGO_SRC = '/ChatGPT_Image_Aug_4,_2026,_04_24_46_AM.png';

type Variant = 'login' | 'sidebar' | 'mobile' | 'invoice' | 'compact';

const SIZES: Record<Variant, { width: number; maxWidth: number }> = {
  login: { width: 200, maxWidth: 220 },
  sidebar: { width: 160, maxWidth: 180 },
  mobile: { width: 110, maxWidth: 125 },
  invoice: { width: 180, maxWidth: 200 },
  compact: { width: 36, maxWidth: 48 },
};

interface BrandLogoProps {
  variant?: Variant;
  /** When true, wraps logo in a white rounded container for dark backgrounds */
  onDark?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const BrandLogo = ({ variant = 'sidebar', onDark = false, className = '', style }: BrandLogoProps) => {
  const size = SIZES[variant];
  const img = (
    <img
      src={LOGO_SRC}
      alt="Hotel Mantri"
      style={{
        width: '100%',
        maxWidth: `${size.maxWidth}px`,
        height: 'auto',
        objectFit: 'contain',
        display: 'block',
        ...style,
      }}
      className={className}
    />
  );

  if (onDark) {
    return (
      <div
        style={{
          background: '#fff',
          borderRadius: '10px',
          padding: '6px 10px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 'auto',
        }}
      >
        {img}
      </div>
    );
  }

  return img;
};

/**
 * Compact brand icon — uses the same full PNG at a small size.
 * No cropping; preserves aspect ratio.
 */
export const BrandIcon = ({ size = 32, onDark = false, className = '', style }: { size?: number; onDark?: boolean; className?: string; style?: React.CSSProperties }) => {
  const img = (
    <img
      src={LOGO_SRC}
      alt="Hotel Mantri"
      style={{ width: `${size}px`, height: 'auto', objectFit: 'contain', display: 'block', ...style }}
      className={className}
    />
  );

  if (onDark) {
    return (
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          padding: '3px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {img}
      </div>
    );
  }

  return img;
};

export const BRAND_LOGO_SRC = LOGO_SRC;
