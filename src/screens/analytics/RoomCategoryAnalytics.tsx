import { useEffect, useState, useMemo } from 'react';
import { BedDouble, Loader2, Trophy, AlertCircle } from 'lucide-react';
import type { HotelSettings, RoomChartEntry } from '@/lib/types';
import { getSettings, getRoomCategories } from '@/lib/api';
import { getRoomChartForDateRange } from '@/lib/api-reservations';
import { toNum, fmtMoney, fmtInt } from '@/lib/calc';
import { BarChart, DonutChart } from '@/components/charts';
import { ScreenHeader, SectionCard, Banner } from '@/components/finance-ui';
import { DateRangeFilter, LoadingSpinner, EmptyState } from './BookingSourceAnalytics';

interface CatStat {
  category: string;
  totalRooms: number;
  occupied: number;
  occPct: number;
  revenue: number;
  arr: number;
  revpar: number;
}

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#0d9488', '#ea580c', '#4f46e5', '#0891b2'];

export const RoomCategoryAnalytics = ({ onBack }: { onBack: () => void }) => {
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [entries, setEntries] = useState<RoomChartEntry[]>([]);
  const [fromDate, setFromDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { (async () => { try { const s = await getSettings(); setSettings(s); } catch { /* */ } })(); }, []);
  useEffect(() => { load(); }, [fromDate, toDate]);

  const load = async () => {
    setLoading(true); setError(null);
    try { const e = await getRoomChartForDateRange(fromDate, toDate); setEntries(e); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  };

  const stats = useMemo<CatStat[]>(() => {
    const map = new Map<string, CatStat>();
    for (const e of entries) {
      const cat = e.room_category || 'Standard';
      const st = map.get(cat) ?? { category: cat, totalRooms: 0, occupied: 0, occPct: 0, revenue: 0, arr: 0, revpar: 0 };
      st.totalRooms += 1;
      if (!e.is_complimentary) {
        st.occupied += 1;
        st.revenue += toNum(e.total) > 0 ? toNum(e.total) : toNum(e.room_rate);
      }
      map.set(cat, st);
    }
    return Array.from(map.values()).map((v) => {
      v.occPct = v.totalRooms > 0 ? (v.occupied / v.totalRooms) * 100 : 0;
      v.arr = v.occupied > 0 ? v.revenue / v.occupied : 0;
      v.revpar = v.totalRooms > 0 ? v.revenue / v.totalRooms : 0;
      return v;
    }).sort((a, b) => b.revenue - a.revenue);
  }, [entries]);

  const bestCategory = stats[0];
  const lowestCategory = stats.length > 1 ? stats[stats.length - 1] : null;

  const revenueDonut = stats.map((s, i) => ({ label: s.category, value: Math.round(s.revenue), color: COLORS[i % COLORS.length] }));
  const occBars = stats.map((s) => ({ label: s.category.slice(0, 8), value: Math.round(s.occPct) }));
  const revBars = stats.map((s) => ({ label: s.category.slice(0, 8), value: Math.round(s.revenue) }));

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <ScreenHeader title="Room Category Analytics" subtitle="Occupancy · Revenue · ARR · RevPAR" onBack={onBack} icon={<BedDouble className="w-5 h-5 text-sky-300" />} />
      <main className="px-4 py-4 space-y-4 max-w-4xl mx-auto">
        {error && <Banner kind="error">{error}</Banner>}
        <DateRangeFilter fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
        {loading ? <LoadingSpinner /> : (
          <>
            {/* Best / Lowest */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {bestCategory && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3">
                  <Trophy className="w-8 h-8 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-xs text-emerald-600 font-semibold uppercase">Best Selling</p>
                    <p className="text-sm font-bold text-emerald-800">{bestCategory.category}</p>
                    <p className="text-xs text-emerald-600">₹{fmtMoney(bestCategory.revenue)} · {bestCategory.occPct.toFixed(0)}% occ</p>
                  </div>
                </div>
              )}
              {lowestCategory && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
                  <AlertCircle className="w-8 h-8 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-xs text-amber-600 font-semibold uppercase">Lowest Performing</p>
                    <p className="text-sm font-bold text-amber-800">{lowestCategory.category}</p>
                    <p className="text-xs text-amber-600">₹{fmtMoney(lowestCategory.revenue)} · {lowestCategory.occPct.toFixed(0)}% occ</p>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard title="Revenue by Category" icon={<BedDouble className="w-4 h-4 text-brand-600" />}>
                {revenueDonut.length > 0 ? <DonutChart slices={revenueDonut} size={170} /> : <EmptyState />}
              </SectionCard>
              <SectionCard title="Occupancy % by Category" icon={<BedDouble className="w-4 h-4 text-emerald-600" />}>
                {occBars.length > 0 ? <BarChart points={occBars} color="#16a34a" yFormat={(v) => `${v}%`} height={200} /> : <EmptyState />}
              </SectionCard>
            </div>
            <SectionCard title="Revenue by Category" icon={<BedDouble className="w-4 h-4 text-blue-600" />}>
              {revBars.length > 0 ? <BarChart points={revBars} color="#2563eb" yFormat={(v) => `₹${fmtInt(v)}`} height={200} /> : <EmptyState />}
            </SectionCard>

            <SectionCard title="Category Performance Table" icon={<BedDouble className="w-4 h-4 text-slate-600" />}>
              {stats.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-200">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Category</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">Rooms</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">Occupied</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">Occ %</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">Revenue</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">ARR</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">RevPAR</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.map((s) => (
                        <tr key={s.category} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-800">{s.category}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtInt(s.totalRooms)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtInt(s.occupied)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{s.occPct.toFixed(0)}%</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">₹{fmtMoney(s.revenue)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">₹{fmtMoney(s.arr)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">₹{fmtMoney(s.revpar)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState />}
            </SectionCard>
          </>
        )}
      </main>
    </div>
  );
};
