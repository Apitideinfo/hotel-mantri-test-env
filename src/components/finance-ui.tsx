import React from 'react';

export const inputCls =
  'w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500 transition placeholder:text-slate-400';

export const labelCls =
  'block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1';

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className={labelCls}>{label}</span>
    {children}
  </label>
);

export const TextInput: React.FC<{
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; inputMode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email';
  maxLength?: number;
}> = ({ label, value, onChange, placeholder, type = 'text', inputMode, maxLength }) => (
  <Field label={label}>
    <input type={type} inputMode={inputMode} value={value} maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={inputCls} />
  </Field>
);

export const NumInput: React.FC<{
  label: string; value: number; onChange: (v: number) => void;
  prefix?: string; allowDecimal?: boolean; placeholder?: string;
}> = ({ label, value, onChange, prefix, allowDecimal = true, placeholder }) => {
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') { onChange(0); return; }
    const n = allowDecimal ? parseFloat(raw) : parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return;
    onChange(n);
  };
  return (
    <Field label={label}>
      <div className="relative flex items-stretch">
        {prefix && (
          <span className="inline-flex items-center px-3 bg-slate-100 border border-r-0 border-slate-300 rounded-l-lg text-slate-500 text-sm">
            {prefix}
          </span>
        )}
        <input type="number" inputMode={allowDecimal ? 'decimal' : 'numeric'} min={0}
          step={allowDecimal ? '0.01' : '1'} value={value === 0 ? '' : value}
          onChange={handle} placeholder={placeholder ?? '0'}
          className={`${inputCls} ${prefix ? 'rounded-l-none' : ''}`} />
      </div>
    </Field>
  );
};

export const SelectInput: React.FC<{
  label: string; value: string;
  options: { value: string; label: string }[] | string[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
};

export const DateInput: React.FC<{
  label: string; value: string; onChange: (v: string) => void;
}> = ({ label, value, onChange }) => (
  <Field label={label}>
    <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
  </Field>
);

export const TextArea: React.FC<{
  label: string; value: string; onChange: (v: string) => void;
  rows?: number; placeholder?: string;
}> = ({ label, value, onChange, rows = 2, placeholder }) => (
  <Field label={label}>
    <textarea value={value} rows={rows} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} resize-none`} />
  </Field>
);

export const SectionCard: React.FC<{
  title: string; icon: React.ReactNode; children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm bg-white">
    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
      <span className="text-sky-600">{icon}</span>
      <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{title}</h2>
    </div>
    <div className="p-4 space-y-3">{children}</div>
  </div>
);

export const Banner: React.FC<{ kind: 'error' | 'success'; children: React.ReactNode }> = ({ kind, children }) => {
  const cls = kind === 'error'
    ? 'bg-red-50 border border-red-200 text-red-700'
    : 'bg-emerald-50 border border-emerald-200 text-emerald-800';
  return <div className={`${cls} text-sm rounded-xl p-3`}>{children}</div>;
};

export const StickySaveBar: React.FC<{
  onSave: () => void; saving: boolean; label?: string;
  extra?: React.ReactNode;
}> = ({ onSave, saving, label = 'Save', extra }) => (
  <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white/95 backdrop-blur border-t border-slate-200 p-3 flex gap-2.5">
    {extra}
    <button onClick={onSave} disabled={saving}
      className="flex-1 flex items-center justify-center gap-2 bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white font-bold py-3.5 rounded-2xl shadow transition">
      {saving ? 'Saving…' : label}
    </button>
  </div>
);

export const ScreenHeader: React.FC<{
  title: string; subtitle?: string; onBack: () => void; icon: React.ReactNode;
}> = ({ title, subtitle, onBack, icon }) => (
  <header className="sticky top-0 z-10 bg-white border-b border-slate-200/80 px-4 sm:px-6 py-4 flex items-center gap-4 shadow-sm">
    <button onClick={onBack} className="p-2 -ml-2 hover:bg-slate-100 rounded-xl text-slate-600 transition">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
    <div className="flex-1">
      <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">{title}</h1>
      {subtitle && <p className="text-slate-400 text-xs sm:text-sm font-medium mt-0.5">{subtitle}</p>}
    </div>
    <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
      {icon}
    </div>
  </header>
);

export const fmtMoney = (n: number): string =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtInt = (n: number): string =>
  Math.round(Number(n || 0)).toLocaleString('en-IN');

export const monthKeyFrom = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, '0')}`;

export const monthLabel = (monthKey: string): string => {
  const [y, m] = monthKey.split('-');
  const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};
