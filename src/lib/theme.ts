/**
 * Hotel Mantri PMS — Centralized Design Tokens & Theme
 * Single source of truth for brand colors, spacing, radii, shadows, and typography.
 */

export const brand = {
  // Primary brand electric blue & deep navy
  primary: '#0284c7',
  primaryHover: '#0369a1',
  primaryLight: '#38bdf8',
  primarySoft: '#f0f9ff',
  primaryGlow: 'rgba(2, 132, 199, 0.15)',

  // Deep Slate / Navy
  navy: '#0f172a',
  navyHover: '#1e293b',
  navyLight: '#334155',
  navyText: '#0f172a',

  // Warm Gold accent
  gold: '#d97706',
  goldHover: '#b45309',
  goldLight: '#fde68a',
  goldSoft: '#fffbeb',

  // Light Sky / Ice Blue accent
  sky: '#0284c7',
  skyLight: '#e0f2fe',
  skySoft: '#f0f9ff',

  // Neutrals & Surfaces
  bg: '#f8fafc',
  surface: '#ffffff',
  surfaceAlt: '#f8fafc',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  borderStrong: '#cbd5e1',

  // Text
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  textSubtle: '#64748b',

  // Status
  success: '#10b981',
  successBg: '#ecfdf5',
  successText: '#047857',
  warning: '#f59e0b',
  warningBg: '#fffbeb',
  warningText: '#b45309',
  error: '#ef4444',
  errorBg: '#fef2f2',
  errorText: '#b91c1c',
  info: '#0284c7',
  infoBg: '#f0f9ff',
  infoText: '#0369a1',
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
  xl: 20,
  '2xl': 24,
  pill: 9999,
} as const;

export const shadow = {
  subtle: '0 1px 2px 0 rgba(15, 23, 42, 0.04)',
  card: '0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.04)',
  cardHover: '0 10px 25px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -2px rgba(15, 23, 42, 0.04)',
  cardElevated: '0 12px 30px -4px rgba(15, 23, 42, 0.10), 0 4px 6px -2px rgba(15, 23, 42, 0.05)',
  softBlue: '0 4px 14px 0 rgba(2, 132, 199, 0.12)',
  glow: '0 0 20px rgba(2, 132, 199, 0.15)',
} as const;

/** Tailwind class helpers for common patterns */
export const btn = {
  primary:
    'bg-brand-600 hover:bg-brand-700 text-white font-semibold shadow-soft-blue hover:shadow-md transition-all active:scale-[0.98]',
  secondary:
    'bg-white hover:bg-slate-50 text-slate-800 font-semibold border border-slate-200 shadow-xs hover:border-slate-300 transition-all active:scale-[0.98]',
  gold: 'bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-xs transition-all active:scale-[0.98]',
  danger: 'bg-red-600 hover:bg-red-700 text-white font-semibold shadow-xs transition-all active:scale-[0.98]',
  ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium transition-all active:scale-[0.98]',
} as const;

export const card = {
  base: 'bg-white rounded-2xl border border-slate-200/80 shadow-card transition-all duration-200',
  hover: 'hover:shadow-card-hover hover:border-slate-300/90 hover:-translate-y-0.5',
  glass: 'bg-white/90 backdrop-blur-xl border border-slate-200/80 shadow-card',
} as const;
