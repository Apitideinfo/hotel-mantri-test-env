import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string | number;
    positive?: boolean | null; // true: green, false: red, null: neutral
    label?: string;
  };
  accent?: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'slate';
  onClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  accent = 'blue',
  onClick,
  className = '',
}) => {
  const accentStyles = {
    blue: 'bg-sky-50 text-sky-600 border-sky-100 group-hover:bg-sky-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100 group-hover:bg-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100 group-hover:bg-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100 group-hover:bg-rose-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100 group-hover:bg-purple-100',
    slate: 'bg-slate-100 text-slate-600 border-slate-200 group-hover:bg-slate-200',
  };

  return (
    <div
      onClick={onClick}
      className={`group relative bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs hover:border-slate-300 hover:shadow-card-hover transition-all duration-200 ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 truncate">{title}</p>
          <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1 truncate">{value}</p>
        </div>
        {icon && (
          <div
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${accentStyles[accent]}`}
          >
            {icon}
          </div>
        )}
      </div>

      {(subtitle || trend) && (
        <div className="flex items-center gap-2 mt-3 text-xs">
          {trend && (
            <span
              className={`inline-flex items-center gap-1 font-bold ${
                trend.positive === true
                  ? 'text-emerald-600'
                  : trend.positive === false
                  ? 'text-rose-600'
                  : 'text-slate-500'
              }`}
            >
              {trend.positive === true ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : trend.positive === false ? (
                <TrendingDown className="w-3.5 h-3.5" />
              ) : (
                <Minus className="w-3.5 h-3.5" />
              )}
              {trend.value}
            </span>
          )}
          {subtitle && (
            <span className="text-slate-400 font-medium truncate">{subtitle}</span>
          )}
          {trend?.label && (
            <span className="text-slate-400 font-medium truncate">{trend.label}</span>
          )}
        </div>
      )}
    </div>
  );
};
