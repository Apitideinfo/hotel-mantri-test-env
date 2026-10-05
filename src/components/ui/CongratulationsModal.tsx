import React from 'react';
import { Sparkles, CheckCircle2, X, Download, FileText, ArrowRight, ExternalLink } from 'lucide-react';
import { CelebrationBurst } from './CelebrationBurst';

export interface CongratulationsModalProps {
  open: boolean;
  title?: string;
  subtitle?: string;
  badgeText?: string;
  details?: { label: string; value: string; highlight?: boolean; color?: 'emerald' | 'indigo' | 'amber' | 'slate' }[];
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  pdfUrl?: string;
  onClose: () => void;
}

export const CongratulationsModal: React.FC<CongratulationsModalProps> = ({
  open,
  title = 'Congratulations!',
  subtitle = 'Action completed successfully',
  badgeText = 'Booking Confirmed',
  details = [],
  primaryAction,
  secondaryAction,
  pdfUrl,
  onClose,
}) => {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-md z-50 transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Modal Box */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 pointer-events-none overflow-y-auto">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-lg pointer-events-auto overflow-hidden animate-scale-in my-auto relative">
          {/* Animated side sparkler fireworks (phuljhadiyan) */}
          <CelebrationBurst active={open} durationMs={4500} />

          {/* Top Navy Blue / Indigo Celebration Banner */}
          <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-6 pt-8 pb-7 text-white text-center relative overflow-hidden border-b border-indigo-900/50">
            {/* Background Glow Orbs */}
            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-indigo-500/20 blur-2xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-32 h-32 rounded-full bg-amber-400/15 blur-2xl pointer-events-none" />

            {/* Glowing Icon */}
            <div className="relative inline-block mb-3.5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-amber-400 p-0.5 shadow-lg shadow-indigo-500/30 mx-auto animate-bounce duration-1000">
                <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center text-amber-400">
                  <Sparkles className="w-8 h-8 text-amber-300 animate-pulse" />
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>

            {badgeText && (
              <div className="mb-2">
                <span className="px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-white/10 text-indigo-200 border border-white/20 shadow-xs">
                  {badgeText}
                </span>
              </div>
            )}

            <h2 className="text-2xl font-black text-white tracking-tight">
              🎉 {title}
            </h2>
            <p className="text-xs text-slate-300 font-medium mt-1 max-w-sm mx-auto">
              {subtitle}
            </p>

            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content Details */}
          <div className="p-6 space-y-4 bg-white">
            {details.length > 0 && (
              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 text-xs space-y-2.5 shadow-inner">
                {details.map((d, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 font-medium">{d.label}:</span>
                    <span
                      className={`font-bold ${
                        d.color === 'emerald'
                          ? 'text-emerald-700 font-black'
                          : d.color === 'indigo'
                          ? 'text-indigo-700 font-black'
                          : d.color === 'amber'
                          ? 'text-amber-700 font-black'
                          : 'text-slate-900'
                      } ${d.highlight ? 'text-sm' : ''}`}
                    >
                      {d.value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Actions Grid */}
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition shadow-2xs cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>Download Voucher</span>
                </a>
              )}

              {secondaryAction && (
                <button
                  type="button"
                  onClick={secondaryAction.onClick}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition shadow-2xs cursor-pointer"
                >
                  {secondaryAction.icon}
                  <span>{secondaryAction.label}</span>
                </button>
              )}

              <button
                type="button"
                onClick={primaryAction ? primaryAction.onClick : onClose}
                className={`${
                  pdfUrl || secondaryAction ? '' : 'sm:col-span-2'
                } flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-black text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl shadow-md shadow-indigo-500/25 transition active:scale-95 cursor-pointer`}
              >
                {primaryAction?.icon || <ArrowRight className="w-4 h-4" />}
                <span>{primaryAction ? primaryAction.label : 'Continue'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
