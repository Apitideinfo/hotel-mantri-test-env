/**
 * Hotel Mantri PMS — Centralized Design Tokens
 * Single source of truth for brand colors, spacing, radii, shadows, and typography.
 * Extracted from the official Hotel Mantri logo: royal blue "H", deep navy "M", gold star.
 */

export const brand = {
  // Primary electric / royal blue
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  primaryLight: '#3b82f6',
  primarySoft: '#eff6ff',

  // Deep navy
  navy: '#0f1c30',
  navyHover: '#162842',
  navyLight: '#1f3559',
  navyText: '#0a1628',

  // Gold accent
  gold: '#f59e0b',
  goldHover: '#d97706',
  goldLight: '#fde68a',
  goldSoft: '#fffbeb',

  // Neutrals
  bg: '#f1f5f9',
  surface: '#ffffff',
  surfaceAlt: '#f8fafc',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',

  // Text
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  textOnNavy: '#e2e8f0',
  textOnNavyMuted: '#94a3b8',

  // Status
  success: '#16a34a',
  successBg: '#f0fdf4',
  warning: '#d97706',
  warningBg: '#fffbeb',
  error: '#dc2626',
  errorBg: '#fef2f2',
  info: '#2563eb',
  infoBg: '#eff6ff',
  disabled: '#94a3b8',
} as const;

export const layout = {
  sidebarWidth: 260,
  sidebarCollapsedWidth: 72,
  headerHeight: 64,
  contentMaxWidth: 1600,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  card: 16,
  lg: 20,
  pill: 9999,
} as const;

export const shadow = {
  card: '0 1px 3px 0 rgba(15, 28, 48, 0.06), 0 1px 2px -1px rgba(15, 28, 48, 0.05)',
  cardHover: '0 4px 12px -2px rgba(15, 28, 48, 0.10), 0 2px 6px -2px rgba(15, 28, 48, 0.06)',
  softBlue: '0 4px 14px 0 rgba(37, 99, 235, 0.10)',
  navy: '0 4px 14px 0 rgba(15, 28, 48, 0.20)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
} as const;

export const controls = {
  buttonHeight: 40,
  buttonHeightLg: 48,
  inputHeight: 40,
  inputHeightLg: 48,
} as const;

export const typography = {
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  heading: {
    h1: { size: '1.875rem', weight: 700, lineHeight: 1.2 },
    h2: { size: '1.25rem', weight: 700, lineHeight: 1.25 },
    h3: { size: '1rem', weight: 600, lineHeight: 1.3 },
  },
  body: { size: '0.875rem', weight: 400, lineHeight: 1.5 },
  small: { size: '0.75rem', weight: 500, lineHeight: 1.4 },
  caption: { size: '0.6875rem', weight: 600, lineHeight: 1.3, tracking: '0.05em' },
} as const;

/** Tailwind class helpers for common patterns */
export const btn = {
  primary:
    'bg-brand-600 hover:bg-brand-700 text-white font-semibold shadow-soft-blue hover:shadow-md transition-all',
  secondary:
    'bg-white hover:bg-slate-50 text-brand-navy-700 font-semibold border border-slate-200 shadow-card transition-all',
  gold: 'bg-brand-gold-500 hover:bg-brand-gold-600 text-white font-semibold shadow-sm transition-all',
  danger: 'bg-red-600 hover:bg-red-700 text-white font-semibold shadow-sm transition-all',
  ghost: 'text-slate-600 hover:text-brand-navy-700 hover:bg-slate-100 font-medium transition-all',
} as const;

export const card = {
  base: 'bg-white rounded-card border border-slate-200 shadow-card',
  hover: 'hover:shadow-card-hover hover:border-slate-300 transition-all',
} as const;
