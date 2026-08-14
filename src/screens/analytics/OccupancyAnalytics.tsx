import { useEffect, useState, useMemo } from 'react';
import { BedDouble, Loader2 } from 'lucide-react';
import type { HotelSettings, RoomChartEntry } from '@/lib/types';
import { getSettings } from '@/lib/api';
import { getRoomChartForDateRange } from '@/lib/api-reservations';
import { toNum, fmtMoney, fmtInt, calcOcc } from '@/lib/calc';
import { BarChart, DonutChart, LineChart } from '@/components/charts';
import { ScreenHeader, SectionCard, Banner } from '@/components/finance-ui';
import { DateRangeFilter, LoadingSpinner, EmptyState } from './BookingSourceAnalytics';

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#64748b'];

export const OccupancyAnalytics = ({ onBack }: { onBack: () => void }) => {
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

  const totalRooms = settings?.total_rooms ?? 0;

  const stats = useMemo(() => {
    let occupied = 0, complimentary = 0, totalEntries = 0;
    const byDate = new Map<string, { occ: number; comp: number; total: number }>();
    for (const e of entries) {
      totalEntries += 1;
      if (e.is_complimentary) complimentary += 1;
      else occupied += 1;
      const d = e.report_date;
      const day = byDate.get(d) ?? { occ: 0, comp: 0, total: 0 };
      if (e.is_complimentary) day.comp += 1;
      else day.occ += 1;
      day.total += 1;
      byDate.set(d, day);
    }
    const uniqueDays = new Set(entries.map((e) => e.report_date)).size;
    const avgOcc = uniqueDays > 0 && totalRooms > 0 ? (occupied / (totalRooms * uniqueDays)) * 100 : 0;
    return { occupied, complimentary, totalEntries, uniqueDays, avgOcc };
  }, [entries, totalRooms]);

  const dailyTrend = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const e of entries) {
      if (e.is_complimentary) continue;
      byDate.set(e.report_date, (byDate.get(e.report_date) ?? 0) + 1);
    }
    return Array.from(byDate.entries()).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([d, v]) => ({
      label: d.slice(5),
      value: totalRooms > 0 ? Math.round((v / totalRooms) * 100) : 0,
    }));
  }, [entries, totalRooms]);

  const statusDonut = [
    { label: 'Occupied', value: stats.occupied, color: COLORS[0] },
    { label: 'Complimentary', value: stats.complimentary, color: COLORS[2] },
    { label: 'Vacant', value: Math.max(0, (stats.uniqueDays * totalRooms) - stats.occupied - stats.complimentary), color: COLORS[1] },
  ].filter((s) => s.value > 0);

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <ScreenHeader title="Occupancy Analytics" subtitle="Daily · Weekly · Monthly · Room Utilization" onBack={onBack} icon={<BedDouble className="w-5 h-5 text-sky-300" />} />
      <main className="px-4 py-4 space-y-4 max-w-4xl mx-auto">
        {error && <Banner kind="error">{error}</Banner>}
        <DateRangeFilter fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
        {loading ? <LoadingSpinner /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Avg Occupancy" value={`${stats.avgOcc.toFixed(0)}%`} color="text-brand-600" bg="bg-brand-50" />
              <StatCard label="Rooms Occupied" value={fmtInt(stats.occupied)} color="text-emerald-600" bg="bg-emerald-50" />
              <StatCard label="Complimentary" value={fmtInt(stats.complimentary)} color="text-amber-600" bg="bg-amber-50" />
              <StatCard label="Days Active" value={fmtInt(stats.uniqueDays)} color="text-teal-600" bg="bg-teal-50" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard title="Room Status Breakdown" icon={<BedDouble className="w-4 h-4 text-brand-600" />}>
                {statusDonut.length > 0 ? <DonutChart slices={statusDonut} size={170} centerValue={`${stats.avgOcc.toFixed(0)}%`} centerLabel="Avg Occ" /> : <EmptyState />}
              </SectionCard>
              <SectionCard title="Daily Occupancy Trend" icon={<BedDouble className="w-4 h-4 text-emerald-600" />}>
                {dailyTrend.length > 0 ? <LineChart series={[{ name: 'Occupancy', color: COLORS[0], points: dailyTrend }]} yFormat={(v) => `${v.toFixed(0)}%`} height={200} /> : <EmptyState />}
              </SectionCard>
            </div>

            <SectionCard title="Daily Occupancy %" icon={<BedDouble className="w-4 h-4 text-blue-600" />}>
              {dailyTrend.length > 0 ? <BarChart points={dailyTrend} color="#2563eb" yFormat={(v) => `${v}%`} height={200} /> : <EmptyState />}
            </SectionCard>
          </>
        )}
      </main>
    </div>
  );
};

const StatCard = ({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
    <div className={`w-7 h-7 rounded-lg ${bg} mb-2`} />
    <p className="text-[10px] font-bold text-slate-400 uppercase">{label}</p>
    <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
  </div>
);
