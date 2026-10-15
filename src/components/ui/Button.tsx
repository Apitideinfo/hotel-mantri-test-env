import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconRight,
      children,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const variantStyles = {
      primary:
        'bg-sky-600 hover:bg-sky-700 text-white font-semibold shadow-xs hover:shadow-soft-blue border border-sky-500/30 active:scale-[0.98]',
      secondary:
        'bg-slate-900 hover:bg-slate-800 text-white font-semibold shadow-xs active:scale-[0.98]',
      outline:
        'bg-white hover:bg-slate-50 text-slate-700 font-semibold border border-slate-200/90 hover:border-slate-300 shadow-2xs active:scale-[0.98]',
      ghost:
        'bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900 font-semibold active:scale-[0.98]',
      danger:
        'bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-xs active:scale-[0.98]',
      success:
        'bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs active:scale-[0.98]',
    };

    const sizeStyles = {
      xs: 'text-xs px-2.5 py-1 rounded-lg gap-1.5',
      sm: 'text-xs px-3 py-1.5 rounded-xl gap-1.5 font-medium',
      md: 'text-sm px-4 py-2 rounded-xl gap-2 font-semibold',
      lg: 'text-base px-5 py-2.5 rounded-xl gap-2.5 font-bold',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500/20 ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}
        {children && <span>{children}</span>}
        {!loading && iconRight && <span className="shrink-0">{iconRight}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
