import React, { useState } from 'react';
import { 
  X, Download, Calendar, CheckCircle2, AlertCircle, 
  Loader2, RefreshCw, ArrowRight, ShieldCheck 
} from 'lucide-react';
import { pullChannelFutureBookings, type ChannelConnection } from '@/lib/api-channel';

interface FutureBookingsModalProps {
  channel: ChannelConnection;
  onClose: () => void;
  onComplete?: () => void;
}

type DateRangePreset = '30' | '60' | '90' | 'custom';

export const FutureBookingsModal: React.FC<FutureBookingsModalProps> = ({
  channel,
  onClose,
  onComplete
}) => {
  const [preset, setPreset] = useState<DateRangePreset>('30');
  const [customStart, setCustomStart] = useState(() => new Date().toISOString().split('T')[0]);
  const [customEnd, setCustomEnd] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });

  const [step, setStep] = useState<'idle' | 'fetching' | 'processing' | 'mapping' | 'importing' | 'completed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{
    totalFetched: number;
    stats: {
      imported: number;
      updated: number;
      skipped: number;
      failed: number;
      mapping_required: number;
    };
    errors: string[];
  } | null>(null);

  const calculateDates = () => {
    const today = new Date();
    const startDate = today.toISOString().split('T')[0];
    if (preset === 'custom') {
      return { startDate: customStart, endDate: customEnd };
    }
    const days = parseInt(preset, 10);
    const endDateObj = new Date(today.getTime() + days * 86400000);
    return { startDate, endDate: endDateObj.toISOString().split('T')[0] };
  };

  const handlePull = async () => {
    const { startDate, endDate } = calculateDates();
    setError(null);
    setResults(null);

    try {
      // 1. Fetching
      setStep('fetching');
      await new Promise(r => setTimeout(r, 600));

      // 2. Processing
      setStep('processing');
      await new Promise(r => setTimeout(r, 500));

      // 3. Mapping & Importing (Call real API)
      setStep('importing');
      const response = await pullChannelFutureBookings(channel.id, startDate, endDate);

      setResults({
        totalFetched: response.totalFetched ?? response.count ?? 0,
        stats: response.stats || {
          imported: response.count || 0,
          updated: 0,
          skipped: 0,
          failed: 0,
          mapping_required: 0
        },
        errors: response.errors || []
      });

      setStep('completed');
      if (onComplete) onComplete();
    } catch (err: any) {
      console.error('Future bookings error:', err);
      setError(err.message || 'Failed to pull reservations from channel extranet');
      setStep('idle');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div 
        className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col border border-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Pull Future Bookings</h2>
              <p className="text-xs text-slate-400">
                Channel: <span className="font-semibold text-slate-600">{channel.channel_name || channel.channel_type}</span>
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            disabled={step !== 'idle' && step !== 'completed'}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-100 text-red-700 rounded-xl text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Sync Failed</p>
                <p className="mt-0.5 text-red-600">{error}</p>
              </div>
            </div>
          )}

          {step === 'idle' && !results && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Select Booking Window
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['30', '60', '90', 'custom'] as DateRangePreset[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPreset(p)}
                      className={`py-2 px-3 text-xs font-semibold rounded-xl border transition ${
                        preset === p 
                          ? 'bg-brand-600 text-white border-brand-600 shadow-sm' 
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {p === 'custom' ? 'Custom' : `${p} Days`}
                    </button>
                  ))}
                </div>
              </div>

              {preset === 'custom' && (
                <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <div>
                    <label className="block text-slate-500 mb-1 font-medium">Start Date</label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1 font-medium">End Date</label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
                    />
                  </div>
                </div>
              )}

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-500 space-y-1">
                <p className="flex items-center gap-1.5 font-medium text-slate-700">
                  <ShieldCheck className="w-4 h-4 text-brand-600" />
                  Idempotent Import Protection
                </p>
                <p className="text-[11px] leading-relaxed">
                  Existing reservations will be updated rather than duplicated. Unmapped room categories will be flagged for review.
                </p>
              </div>
            </>
          )}

          {/* Stepped Progress Animation */}
          {step !== 'idle' && step !== 'completed' && (
            <div className="py-8 space-y-5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center mx-auto shadow-inner">
                <Loader2 className="w-7 h-7 animate-spin" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-slate-800 capitalize">
                  {step === 'fetching' && 'Connecting to channel extranet...'}
                  {step === 'processing' && 'Normalizing reservation payload...'}
                  {step === 'mapping' && 'Matching room categories & rate plans...'}
                  {step === 'importing' && 'Importing reservations into PMS Core...'}
                </h3>
                <p className="text-xs text-slate-400">
                  Please keep this window open while the sync processes.
                </p>
              </div>

              {/* Progress Steps Indicators */}
              <div className="flex items-center justify-center gap-2 pt-2">
                {['fetching', 'processing', 'importing'].map((s, idx) => {
                  const active = step === s;
                  const done = (step === 'processing' && s === 'fetching') || 
                               (step === 'importing' && (s === 'fetching' || s === 'processing'));
                  return (
                    <div 
                      key={s} 
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        active ? 'w-8 bg-brand-600' : done ? 'w-4 bg-emerald-500' : 'w-4 bg-slate-200'
                      }`} 
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Summary Breakdown */}
          {results && step === 'completed' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-sm text-emerald-900">Sync Completed</h4>
                  <p className="text-emerald-700">
                    Fetched {results.totalFetched} reservation record(s) from {channel.channel_name || channel.channel_type}.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="block text-lg font-bold text-emerald-600">{results.stats.imported}</span>
                  <span className="text-[11px] font-medium text-slate-500">Imported</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="block text-lg font-bold text-blue-600">{results.stats.updated}</span>
                  <span className="text-[11px] font-medium text-slate-500">Updated</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="block text-lg font-bold text-orange-600">{results.stats.mapping_required}</span>
                  <span className="text-[11px] font-medium text-slate-500">Needs Mapping</span>
                </div>
              </div>

              {results.stats.failed > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                  <p className="font-semibold">{results.stats.failed} reservation(s) failed validation.</p>
                  {results.errors.length > 0 && (
                    <ul className="list-disc list-inside mt-1 text-[11px] text-red-600">
                      {results.errors.slice(0, 3).map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3">
          {step === 'completed' ? (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl transition"
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={step !== 'idle'}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePull}
                disabled={step !== 'idle'}
                className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl shadow-soft-blue transition flex items-center gap-2 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                Fetch Bookings
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
