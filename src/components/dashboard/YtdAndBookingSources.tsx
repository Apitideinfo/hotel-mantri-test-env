import { Trophy, TrendingUp, Layers, IndianRupee, BarChart3, Users, Wallet, Percent, Calendar, AlertTriangle, RefreshCw, Inbox } from 'lucide-react';
import { fmtMoney, fmtInt } from '@/lib/calc';
import type { DashboardSummary } from '@/lib/api';

export interface BookingSourceRankingItem {
  name: string;
  bookings: number;
  revenue: number;
  category?: string;
  sharePercent?: number;
}

interface YtdAndBookingSourcesProps {
  ytd: DashboardSummary['ytd'] | null;
  ranking: BookingSourceRankingItem[];
  loading?: boolean;
  error?: string | null;
  periodLabel?: string;
  onRetry?: () => void;
}

const rs = (n: number | string): string => '\u20B9' + fmtMoney(typeof n === 'number' ? n : 0);

export const YtdAndBookingSources = ({
  ytd,
  ranking,
  loading = false,
  error = null,
  periodLabel,
  onRetry,
}: YtdAndBookingSourcesProps) => {
  const ytdData = ytd ?? {
    roomRevenue: 0,
    totalRevenue: 0,
    occ: 0,
    arr: 0,
    roomNights: 0,
  };

  const bookingSources = ranking ?? [];

  const roomShare = ytdData.totalRevenue > 0
    ? Math.min(100, Math.round((ytdData.roomRevenue / ytdData.totalRevenue) * 100))
    : (ytdData.roomRevenue > 0 ? 100 : 0);

  const revpar = ytd?.revpar ?? (ytdData.occ > 0 ? (ytdData.arr * ytdData.occ) / 100 : 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* YTD Summary Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 sm:p-6 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">YTD Summary</h3>
              <p className="text-xs font-medium text-slate-400">Year to Date Performance</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200/70 text-xs font-semibold text-slate-600">
            <Calendar className="w-3.5 h-3.5 text-slate-500" /> FY Cumulative
          </span>
        </div>

        {/* Hero Revenue Highlight Card */}
        <div className="bg-gradient-to-br from-brand-50/80 via-blue-50/40 to-slate-50/70 border border-brand-100/80 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-brand-700 uppercase tracking-wider flex items-center gap-1.5">
              <IndianRupee className="w-3.5 h-3.5 text-brand-600" /> Total YTD Revenue
            </span>
            <span className="text-xs font-bold text-brand-700 bg-white px-2 py-0.5 rounded-md border border-brand-200/60 shadow-xs">
              {roomShare}% Room Share
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-2xl sm:text-3xl font-extrabold tabular-nums text-slate-900 tracking-tight">
              {rs(ytdData.totalRevenue)}
            </p>
            <p className="text-xs font-medium text-slate-500">
              Room: <span className="font-bold text-brand-700">{rs(ytdData.roomRevenue)}</span>
            </p>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-brand-100/70 rounded-full h-2 overflow-hidden">
            <div
              className="bg-brand-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, roomShare))}%` }}
            />
          </div>
        </div>

        {/* Grid of Key Performance Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-slate-50/70 border border-slate-200/70 p-3.5 rounded-xl space-y-1 hover:border-slate-300 transition-colors">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <IndianRupee className="w-3.5 h-3.5 text-brand-600" /> Room Rev
            </span>
            <p className="text-base sm:text-lg font-bold tabular-nums text-brand-600 truncate">{rs(ytdData.roomRevenue)}</p>
          </div>

          <div className="bg-slate-50/70 border border-slate-200/70 p-3.5 rounded-xl space-y-1 hover:border-slate-300 transition-colors">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-emerald-600" /> Collections
            </span>
            <p className="text-base sm:text-lg font-bold tabular-nums text-emerald-700 truncate">{rs(ytd?.totalCollections ?? ytdData.totalRevenue)}</p>
          </div>

          <div className="bg-slate-50/70 border border-slate-200/70 p-3.5 rounded-xl space-y-1 hover:border-slate-300 transition-colors">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5 text-amber-600" /> Occupancy
            </span>
            <p className="text-base sm:text-lg font-bold tabular-nums text-amber-600">{ytdData.occ.toFixed(0)}%</p>
          </div>

          <div className="bg-slate-50/70 border border-slate-200/70 p-3.5 rounded-xl space-y-1 hover:border-slate-300 transition-colors">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-teal-600" /> ADR / ARR
            </span>
            <p className="text-base sm:text-lg font-bold tabular-nums text-teal-600 truncate">{rs(ytdData.arr)}</p>
          </div>

          <div className="bg-slate-50/70 border border-slate-200/70 p-3.5 rounded-xl space-y-1 hover:border-slate-300 transition-colors">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-indigo-600" /> RevPAR
            </span>
            <p className="text-base sm:text-lg font-bold tabular-nums text-indigo-600 truncate">{rs(revpar)}</p>
          </div>

          <div className="bg-slate-50/70 border border-slate-200/70 p-3.5 rounded-xl space-y-1 hover:border-slate-300 transition-colors">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-600" /> Room Nights
            </span>
            <p className="text-base sm:text-lg font-bold tabular-nums text-slate-900 truncate">{fmtInt(ytdData.roomNights)} Nights</p>
          </div>
        </div>
      </div>

      {/* Top Booking Sources Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-100/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Top Booking Sources</h3>
              <p className="text-xs font-medium text-slate-400 truncate max-w-[200px] sm:max-w-xs">
                {periodLabel ? periodLabel : 'Period Revenue Rank'}
              </p>
            </div>
          </div>
          {loading ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-semibold text-slate-400 animate-pulse">
              Updating...
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200/60 text-xs font-bold text-amber-800">
              {bookingSources.length} {bookingSources.length === 1 ? 'Channel' : 'Channels'}
            </span>
          )}
        </div>

        {error ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center bg-rose-50/50 rounded-xl border border-rose-100 space-y-2">
            <AlertTriangle className="w-6 h-6 text-rose-500" />
            <p className="text-xs font-semibold text-rose-800">Failed to load booking sources</p>
            <p className="text-[11px] text-rose-600 max-w-xs">{error}</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition active:scale-95 cursor-pointer shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            )}
          </div>
        ) : loading && bookingSources.length === 0 ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-slate-100/70 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : bookingSources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/40 space-y-2">
            <Inbox className="w-7 h-7 text-slate-400 stroke-[1.5]" />
            <p className="text-xs font-bold text-slate-700">No booking sources recorded</p>
            <p className="text-[11px] text-slate-400 max-w-xs">
              No active reservations or channel bookings were recorded for the selected period.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
            {bookingSources.map((item, idx) => (
              <div
                key={item.name}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-200/70 bg-slate-50/40 hover:bg-white hover:border-slate-300 hover:shadow-card transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${
                      idx === 0
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : idx === 1
                        ? 'bg-slate-200 text-slate-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate" title={item.name}>
                      {item.name}
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                      <span>{item.bookings ?? 0} {item.bookings === 1 ? 'Booking' : 'Bookings'}</span>
                      {item.sharePercent != null && item.sharePercent > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-brand-600 font-semibold">{item.sharePercent}% Share</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <span className="text-sm font-bold tabular-nums text-slate-900 shrink-0 pl-2">
                  {rs(item.revenue)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
