// Enterprise HQ — shared UI components

import { AlertCircle, Inbox } from 'lucide-react';

export const LoadingState = ({ label = 'Loading…' }: { label?: string }) => (
  <div className="flex items-center justify-center py-16">
    <div className="text-slate-400 text-sm animate-pulse">{label}</div>
  </div>
);

export const ErrorState = ({ message }: { message: string }) => (
  <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">
    <AlertCircle className="w-4 h-4 shrink-0" /> {message}
  </div>
);

export const EmptyState = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
    <Inbox className="w-12 h-12 text-slate-300 mx-auto mb-3" />
    <p className="text-slate-600 text-sm font-semibold">{title}</p>
    {subtitle && <p className="text-slate-400 text-xs mt-1">{subtitle}</p>}
  </div>
);

export const PageHeader = ({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) => (
  <div className="flex items-start justify-between mb-5">
    <div>
      <h1 className="text-xl lg:text-2xl font-bold text-slate-900">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>{children}</div>
);

export const Badge = ({ children, color = 'slate' }: { children: React.ReactNode; color?: string }) => {
  const colors: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    red: 'bg-red-100 text-red-700 border-red-200',
    sky: 'bg-sky-100 text-sky-700 border-sky-200',
    violet: 'bg-violet-100 text-violet-700 border-violet-200',
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    teal: 'bg-teal-100 text-teal-700 border-teal-200',
    indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${colors[color] ?? colors.slate}`}>
      {children}
    </span>
  );
};

export const KpiCard = ({ label, value, sub, icon, color = 'sky' }: {
  label: string; value: string | number; sub?: string; icon?: React.ReactNode; color?: string;
}) => {
  const colors: Record<string, string> = {
    sky: 'bg-sky-50 text-sky-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    violet: 'bg-violet-50 text-violet-600',
    slate: 'bg-slate-100 text-slate-600',
    teal: 'bg-teal-50 text-teal-600',
    orange: 'bg-orange-50 text-orange-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        {icon && <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color] ?? colors.sky}`}>{icon}</div>}
      </div>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
};

export const TextInput = ({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) => (
  <label className="block">
    <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
  </label>
);

export const SelectInput = ({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) => (
  <label className="block">
    <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </label>
);

export const NumInput = ({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) => (
  <label className="block">
    <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
    <input type="number" value={value === 0 ? '' : value} onChange={(e) => onChange(e.target.value === '' ? 0 : parseFloat(e.target.value))}
      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
  </label>
);

export const TextArea = ({ label, value, onChange, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number;
}) => (
  <label className="block">
    <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
    <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows}
      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
  </label>
);

export const ConfirmDialog = ({ title, message, onConfirm, onCancel, confirmLabel = 'Confirm', danger }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void; confirmLabel?: string; danger?: boolean;
}) => (
  <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600">{message}</p>
      <div className="flex gap-2 pt-2">
        <button onClick={onConfirm}
          className={`flex-1 font-semibold py-2.5 rounded-xl text-white transition ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-sky-600 hover:bg-sky-700'}`}>
          {confirmLabel}
        </button>
        <button onClick={onCancel}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl transition">
          Cancel
        </button>
      </div>
    </div>
  </div>
);

export const statusColor = (status: string): string => {
  switch (status) {
    case 'Active': return 'green';
    case 'Trial': return 'sky';
    case 'Expired': return 'amber';
    case 'Suspended': return 'red';
    default: return 'slate';
  }
};

export const priorityColor = (priority: string): string => {
  switch (priority) {
    case 'Critical': return 'red';
    case 'High': return 'orange';
    case 'Medium': return 'amber';
    case 'Low': return 'slate';
    default: return 'slate';
  }
};

export const fmtMoney = (n: number): string => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
};

export const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const fmtDateTime = (d: string | null | undefined): string => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
