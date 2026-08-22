import { useEffect, useState, useMemo } from 'react';
import { Users, Loader2, Download } from 'lucide-react';
import type { HotelSettings, RoomChartEntry, SourceCategory } from '@/lib/types';
import { getSettings, getRoomChartForMonth } from '@/lib/api';
import { getRoomChartForDateRange } from '@/lib/api-reservations';
import { toNum, fmtMoney, fmtInt, calcArr } from '@/lib/calc';
import { BarChart, DonutChart, LineChart } from '@/components/charts';
import { ScreenHeader, SectionCard, Banner } from '@/components/finance-ui';

const SOURCE_COLORS: Record<string, string> = {
  'OTA': '#2563eb', 'Direct/Walking': '#16a34a', 'Corporate/Agent': '#f59e0b', 'Phonebook': '#7c3aed',
};

interface SourceStat {
  source: SourceCategory;
  bookings: number;
  revenue: number;
  avgRate: number;
  occContribution: number;
}

export const BookingSourceAnalytics = ({ onBack }: { onBack: () => void }) => {
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

  const stats = useMemo<SourceStat[]>(() => {
    const map = new Map<SourceCategory, SourceStat>();
    const sources: SourceCategory[] = ['OTA', 'Direct/Walking', 'Corporate/Agent', 'Phonebook'];
    for (const s of sources) map.set(s, { source: s, bookings: 0, revenue: 0, avgRate: 0, occContribution: 0 });
    for (const e of entries) {
      if (e.is_complimentary) continue;
      const amt = toNum(e.total) > 0 ? toNum(e.total) : toNum(e.room_rate);
      const src = e.source_category ?? 'Direct/Walking';
      const st = map.get(src) ?? { source: src, bookings: 0, revenue: 0, avgRate: 0, occContribution: 0 };
      st.bookings += 1; st.revenue += amt;
      map.set(src, st);
    }
    const totalBookings = Array.from(map.values()).reduce((s, v) => s + v.bookings, 0);
    return Array.from(map.values()).map((v) => {
      v.avgRate = v.bookings > 0 ? v.revenue / v.bookings : 0;
      v.occContribution = totalBookings > 0 ? (v.bookings / totalBookings) * 100 : 0;
      return v;
    }).filter((v) => v.bookings > 0).sort((a, b) => b.revenue - a.revenue);
  }, [entries]);

  const donutData = stats.map((s) => ({ label: s.source, value: Math.round(s.revenue), color: SOURCE_COLORS[s.source] ?? '#64748b' }));
  const barData = stats.map((s) => ({ label: s.source.split('/')[0], value: s.bookings }));

  const trendByDay = useMemo(() => {
    const byDate = new Map<string, Record<string, number>>();
    for (const e of entries) {
      if (e.is_complimentary) continue;
      const d = e.report_date;
      const day = byDate.get(d) ?? { 'OTA': 0, 'Direct/Walking': 0, 'Corporate/Agent': 0, 'Phonebook': 0 };
      const amt = toNum(e.total) > 0 ? toNum(e.total) : toNum(e.room_rate);
      const src = e.source_category ?? 'Direct/Walking';
      day[src] = (day[src] ?? 0) + amt;
      byDate.set(d, day);
    }
    const sorted = Array.from(byDate.entries()).sort((a, b) => a[0] < b[0] ? -1 : 1);
    return [
      { name: 'OTA', color: SOURCE_COLORS['OTA'], points: sorted.map(([d, v]) => ({ label: d.slice(5), value: Math.round(v['OTA'] ?? 0) })) },
      { name: 'Direct', color: SOURCE_COLORS['Direct/Walking'], points: sorted.map(([d, v]) => ({ label: d.slice(5), value: Math.round(v['Direct/Walking'] ?? 0) })) },
      { name: 'Corporate', color: SOURCE_COLORS['Corporate/Agent'], points: sorted.map(([d, v]) => ({ label: d.slice(5), value: Math.round(v['Corporate/Agent'] ?? 0) })) },
    ];
  }, [entries]);

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <ScreenHeader title="Booking Source Analytics" subtitle="Count · Revenue · Avg Rate · Contribution" onBack={onBack} icon={<Users className="w-5 h-5 text-sky-300" />} />
      <main className="px-4 py-4 space-y-4 max-w-4xl mx-auto">
        {error && <Banner kind="error">{error}</Banner>}
        <DateRangeFilter fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
        {loading ? <LoadingSpinner /> : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard title="Revenue by Source" icon={<Users className="w-4 h-4 text-brand-600" />}>
                {donutData.length > 0 ? <DonutChart slices={donutData} size={170} centerValue={`₹${fmtInt(stats.reduce((s, v) => s + v.revenue, 0))}`} centerLabel="Total" /> : <EmptyState />}
              </SectionCard>
              <SectionCard title="Booking Count by Source" icon={<Users className="w-4 h-4 text-emerald-600" />}>
                {barData.length > 0 ? <BarChart points={barData} color="#2563eb" yFormat={(v: number) => fmtInt(v)} height={200} /> : <EmptyState />}
              </SectionCard>
            </div>
            <SectionCard title="Source Trend" icon={<Users className="w-4 h-4 text-blue-600" />}>
              {trendByDay[0].points.length > 0 ? <LineChart series={trendByDay} yFormat={(v: number) => `₹${fmtInt(v)}`} height={220} /> : <EmptyState />}

            </SectionCard>
            <SectionCard title="Source Performance Table" icon={<Users className="w-4 h-4 text-slate-600" />}>
              {stats.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-200">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Source</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">Bookings</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">Revenue</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">Avg Rate</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">Occ %</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.map((s) => (
                        <tr key={s.source} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-800">{s.source}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtInt(s.bookings)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">₹{fmtMoney(s.revenue)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">₹{fmtMoney(s.avgRate)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{s.occContribution.toFixed(0)}%</td>
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

export const DateRangeFilter = ({ fromDate, toDate, setFromDate, setToDate }: { fromDate: string; toDate: string; setFromDate: (d: string) => void; setToDate: (d: string) => void }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-3 grid grid-cols-2 gap-3">
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">From</span>
      <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
    </label>
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">To</span>
      <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
    </label>
  </div>
);

export const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-sky-600" /></div>
);

export const EmptyState = () => (
  <p className="text-sm text-slate-400 text-center py-8">No data available for selected period.</p>
);
