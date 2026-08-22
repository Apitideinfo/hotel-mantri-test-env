import { Trophy, TrendingUp, Layers, DollarSign, BarChart3, Users } from 'lucide-react';
import { fmtMoney, fmtInt } from '@/lib/calc';
import type { DashboardSummary } from '@/lib/api';

interface YtdAndBookingSourcesProps {
  ytd: DashboardSummary['ytd'] | null;
  ranking: DashboardSummary['ranking'];
}

const rs = (n: number | string): string => '\u20B9' + fmtMoney(typeof n === 'number' ? n : 0);

export const YtdAndBookingSources = ({ ytd, ranking }: YtdAndBookingSourcesProps) => {
  const ytdData = ytd ?? {
    roomRevenue: 288000,
    totalRevenue: 348000,
    occ: 65,
    arr: 1800,
    roomNights: 160,
  };

  const bookingSources = (ranking && ranking.length > 0) ? ranking : [
    { name: 'MakeMyTrip', bookings: 42, revenue: 165000, category: 'OTA' },
    { name: 'Direct Walk-in', bookings: 28, revenue: 115000, category: 'Direct' },
    { name: 'Booking.com', bookings: 18, revenue: 68000, category: 'OTA' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* YTD Summary Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 flex flex-col justify-between space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-100/80 pb-4">
          <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">YTD Summary</h3>
            <p className="text-xs font-medium text-slate-400">Year to Date Performance</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-slate-50/60 border border-slate-200/60 p-4 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-brand-600" /> Room Rev
            </span>
            <p className="text-lg sm:text-xl font-bold tabular-nums text-brand-600 truncate">{rs(ytdData.roomRevenue)}</p>
          </div>

          <div className="bg-slate-50/60 border border-slate-200/60 p-4 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Total Rev
            </span>
            <p className="text-lg sm:text-xl font-bold tabular-nums text-slate-900 truncate">{rs(ytdData.totalRevenue)}</p>
          </div>

          <div className="bg-slate-50/60 border border-slate-200/60 p-4 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-amber-600" /> Occupancy
            </span>
            <p className="text-lg sm:text-xl font-bold tabular-nums text-amber-600">{ytdData.occ.toFixed(0)}%</p>
          </div>

          <div className="bg-slate-50/60 border border-slate-200/60 p-4 rounded-xl space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-teal-600" /> ADR / ARR
            </span>
            <p className="text-lg sm:text-xl font-bold tabular-nums text-teal-600 truncate">{rs(ytdData.arr)}</p>
          </div>

          <div className="bg-slate-50/60 border border-slate-200/60 p-4 rounded-xl space-y-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-brand-600" /> Room Nights
            </span>
            <p className="text-lg sm:text-xl font-bold tabular-nums text-slate-900">{fmtInt(ytdData.roomNights)} Nights</p>
          </div>
        </div>
      </div>

      {/* Top Booking Sources Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 flex flex-col justify-between space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Top Booking Sources</h3>
              <p className="text-xs font-medium text-slate-400">YTD Revenue Rank</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {bookingSources.map((item, idx) => (
            <div
              key={item.name}
              className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/70 bg-slate-50/40 hover:bg-white hover:border-slate-300 hover:shadow-card transition-all"
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
                  <p className="text-sm font-bold text-slate-900 truncate">{item.name}</p>
                  <p className="text-[11px] font-medium text-slate-400">{item.bookings ?? 0} Bookings</p>
                </div>
              </div>
              <span className="text-sm font-bold tabular-nums text-slate-900 shrink-0 pl-2">
                {rs(item.revenue)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
