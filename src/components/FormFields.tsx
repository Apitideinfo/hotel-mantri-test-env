import type { ReactNode } from 'react';

interface NumberFieldProps {
  label: string;
  value: number | string;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  allowDecimal?: boolean;
  max?: number;
}

export const NumberField = ({
  label, value, onChange, prefix, suffix, allowDecimal = true, max,
}: NumberFieldProps) => {
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') { onChange(0); return; }
    const n = allowDecimal ? parseFloat(raw) : parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return;
    if (max !== undefined && n > max) return;
    onChange(n);
  };
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <div className="relative flex items-stretch">
        {prefix && (
          <span className="inline-flex items-center px-3 bg-slate-100 border border-r-0 border-slate-300 rounded-l-lg text-slate-500 text-sm">
            {prefix}
          </span>
        )}
        <input
          type="number"
          inputMode={allowDecimal ? 'decimal' : 'numeric'}
          min={0}
          step={allowDecimal ? '0.01' : '1'}
          value={value === 0 ? '' : value}
          onChange={handle}
          placeholder="0"
          className={`flex-1 min-w-0 px-3 py-2.5 text-base border border-slate-300 bg-white text-slate-900
            focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500
            ${prefix ? 'rounded-r-lg' : 'rounded-lg'} ${suffix ? 'border-r-0' : ''}`}
        />
        {suffix && (
          <span className="inline-flex items-center px-3 bg-slate-100 border border-l-0 border-slate-300 rounded-r-lg text-slate-500 text-sm">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
};

export const SectionCard = ({ title, children, accent }: { title: string; children: ReactNode; accent?: string }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    <div className={`px-4 py-2.5 border-b border-slate-100 ${accent ?? 'bg-slate-50'}`}>
      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{title}</h3>
    </div>
    <div className="p-4 space-y-3">{children}</div>
  </div>
);

export const StatRow = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="flex items-baseline justify-between py-1.5 border-b border-slate-100 last:border-0">
    <span className="text-sm text-slate-600">{label}</span>
    <span className={`tabular-nums ${strong ? 'text-base font-bold text-slate-900' : 'text-sm font-semibold text-slate-800'}`}>
      {value}
    </span>
  </div>
);
