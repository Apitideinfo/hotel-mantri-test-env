import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, Ban, X, Loader2, Info } from 'lucide-react';

export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  icon?: 'trash' | 'ban' | 'warning' | 'info';
  badgeText?: string;
  loading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  icon,
  badgeText,
  loading = false,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, loading, onClose]);

  if (!open) return null;

  const resolvedIcon = icon || (variant === 'danger' ? 'trash' : variant === 'warning' ? 'ban' : 'info');

  const renderIcon = () => {
    switch (resolvedIcon) {
      case 'trash':
        return <Trash2 className="w-6 h-6 text-rose-600" />;
      case 'ban':
        return <Ban className="w-6 h-6 text-amber-600" />;
      case 'warning':
        return <AlertTriangle className="w-6 h-6 text-amber-600" />;
      case 'info':
      default:
        return <Info className="w-6 h-6 text-blue-600" />;
    }
  };

  const iconBgClasses = {
    danger: 'bg-rose-50 border-rose-100 ring-rose-50 text-rose-600',
    warning: 'bg-amber-50 border-amber-100 ring-amber-50 text-amber-600',
    primary: 'bg-blue-50 border-blue-100 ring-blue-50 text-blue-600',
  }[variant];

  const confirmBtnClasses = {
    danger: 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-lg shadow-rose-600/25',
    warning: 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-lg shadow-amber-600/25',
    primary: 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-lg shadow-indigo-600/25',
  }[variant];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 transition-opacity animate-in fade-in duration-200"
        onClick={() => {
          if (!loading) onClose();
        }}
      />

      {/* Modal Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-md pointer-events-auto overflow-hidden animate-in zoom-in-95 duration-200"
        >
          {/* Header & Body */}
          <div className="p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div className={`w-12 h-12 rounded-2xl border ring-4 flex items-center justify-center shrink-0 ${iconBgClasses}`}>
                {renderIcon()}
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-xl transition cursor-pointer disabled:opacity-50"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-black text-slate-900 tracking-tight">{title}</h3>
                {badgeText && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                    {badgeText}
                  </span>
                )}
              </div>
              <div className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                {message}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={loading}
                className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-60 active:scale-95 ${confirmBtnClasses}`}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing…</span>
                  </>
                ) : (
                  <span>{confirmText}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
