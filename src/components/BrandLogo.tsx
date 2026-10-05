/**
 * Shared Hotel Mantri brand logo component.
 * Single source of truth for the official PNG logo path.
 * Use BrandLogo for full logo (sidebar, login, invoice).
 * Use BrandIcon for compact icon-size display (collapsed sidebar, mobile header).
 */

const LOGO_SRC = '/ChatGPT_Image_Aug_4,_2026,_04_24_46_AM.png';

type Variant = 'login' | 'sidebar' | 'mobile' | 'invoice' | 'compact';

const SIZES: Record<Variant, { width: number; maxWidth: number }> = {
  login: { width: 200, maxWidth: 220 },
  sidebar: { width: 160, maxWidth: 180 },
  mobile: { width: 110, maxWidth: 125 },
  invoice: { width: 180, maxWidth: 200 },
  compact: { width: 40, maxWidth: 48 },
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
        className="rounded-2xl bg-white p-1.5 shadow-md flex items-center justify-center aspect-square overflow-hidden shrink-0 ring-2 ring-white/20"
        style={{
          width: `${size.width}px`,
          height: `${size.width}px`,
        }}
      >
        <img
          src={LOGO_SRC}
          alt="Hotel Mantri"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            transform: 'scale(1.15)',
            ...style,
          }}
          className={className}
        />
      </div>
    );
  }

  return img;
};

/**
 * Compact brand icon — renders the original official logo with clean white pill badge.
 */
export const BrandIcon = ({ size = 36, onDark = false, className = '', style }: { size?: number; onDark?: boolean; className?: string; style?: React.CSSProperties }) => {
  return (
    <div
      className={`rounded-2xl bg-white shadow-sm flex items-center justify-center aspect-square overflow-hidden shrink-0 border border-slate-200/80 p-0.5 ${onDark ? 'ring-2 ring-white/30 shadow-md' : ''}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        ...style,
      }}
    >
      <img
        src={LOGO_SRC}
        alt="Hotel Mantri Logo"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          transform: 'scale(1.15)',
        }}
        className={className}
      />
    </div>
  );
};

export const BRAND_LOGO_SRC = LOGO_SRC;
