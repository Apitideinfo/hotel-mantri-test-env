import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { HotelSettings, RoomChartEntry } from '@/lib/types';
import { getSettings, getRoomChartForMonth } from '@/lib/api';
import { aggregateRoomChart, calcArr, calcOcc, fmtMoney, fmtInt } from '@/lib/calc';

interface HistoryProps {
  initialDate: string;
  onBack: () => void;
  onNavigate: (screen: string, payload?: unknown) => void;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const History = ({ initialDate, onBack, onNavigate }: HistoryProps) => {
  const d = new Date(initialDate + 'T00:00:00');
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [year, setYear] = useState(d.getFullYear());
  const [month, setMonth] = useState(d.getMonth() + 1);
  const [entries, setEntries] = useState<RoomChartEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (y: number, m: number) => {
    try {
      setLoading(true);
      setError(null);
      const s = await getSettings();
      setSettings(s);
      const rs = await getRoomChartForMonth(y, m);
      setEntries(rs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(year, month); /* eslint-disable-next-line */ }, [year, month]);

  const totalRooms = settings?.total_rooms ?? 22;
  const years = [2024, 2025, 2026, 2027, 2028];

  // Group entries by date
  const byDate = new Map<string, RoomChartEntry[]>();
  for (const e of entries) {
    const arr = byDate.get(e.report_date) ?? [];
    arr.push(e);
    byDate.set(e.report_date, arr);
  }
  const dates = Array.from(byDate.keys()).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      <header className="sticky top-0 z-10 bg-sky-800 text-white px-4 py-3 flex items-center gap-3 shadow">
        <button onClick={onBack} className="p-1.5 -ml-1.5 hover:bg-sky-700 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-semibold leading-tight">Monthly History</h1>
          <p className="text-sky-200 text-xs">View previous daily reports</p>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 w-full">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Year</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-sky-500">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Month</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-sky-500">
              {MONTHS.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border p-6 text-center text-slate-400 text-sm">Loading…</div>
        ) : dates.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500 text-sm">
            No room chart data for {MONTHS[month - 1]} {year}.
          </div>
        ) : (
          <div className="space-y-2.5">
            {dates.map((dateStr) => {
              const dayEntries = byDate.get(dateStr)!;
              const agg = aggregateRoomChart(dayEntries);
              const occupied = agg.roomsOccupied + agg.complimentary;
              const occ = calcOcc(occupied, totalRooms);
              const arr = agg.roomsOccupied > 0 ? agg.roomRevenue / agg.roomsOccupied : 0;
              const [yy, mm, dd] = dateStr.split('-');
              const disp = `${dd}/${mm}/${yy}`;
              return (
                <button key={dateStr} onClick={() => onNavigate('report', { date: dateStr })}
                  className="w-full bg-white rounded-xl border border-slate-200 p-4 text-left hover:border-sky-400 active:scale-[0.99] transition shadow-sm flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-sky-50 flex flex-col items-center justify-center shrink-0">
                    <span className="text-lg font-bold text-sky-700 leading-none">{dd}</span>
                    <span className="text-[10px] text-sky-600 uppercase">{MONTHS[Number(mm) - 1].slice(0, 3)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm">{disp}</p>
                    <div className="flex gap-3 text-xs text-slate-500 mt-0.5">
                      <span>{fmtInt(occupied)}/{totalRooms} rooms</span>
                      <span>{occ.toFixed(0)}% OCC</span>
                      <span>₹{fmtMoney(arr)} ARR</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-700 mt-0.5">₹{fmtMoney(agg.roomRevenue)}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
                </button>
              );
            })}
          </div>
        )}

        {!loading && dates.length > 0 && (
          <p className="text-xs text-slate-400 text-center">Tap any date to view or copy its WhatsApp report.</p>
        )}
      </main>
    </div>
  );
};
