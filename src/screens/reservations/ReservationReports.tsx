import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Loader2, AlertCircle, Calendar, TrendingUp, LogIn, LogOut,
  BedDouble, Users, IndianRupee, BarChart3,
} from 'lucide-react';
import type { Reservation } from '@/lib/types-reservations';
import { getReservationsForDateRange, getRoomAvailabilityForDate, type RoomAvailability } from '@/lib/api-reservations';

const fmtDate = (d: string): string => {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtMoney = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

const addDays = (date: string, n: number): string => {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

type ReportType = 'forecast' | 'arrivals' | 'departures' | 'availability' | 'occupancy';

export const ReservationReports = ({ onBack }: { onBack: () => void }) => {
  const [reportType, setReportType] = useState<ReportType>('forecast');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [days, setDays] = useState(14);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [availability, setAvailability] = useState<RoomAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const endDate = useMemo(() => addDays(startDate, days - 1), [startDate, days]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, avail] = await Promise.all([
        getReservationsForDateRange(startDate, endDate),
        getRoomAvailabilityForDate(startDate),
      ]);
      setReservations(res);
      setAvailability(avail);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const dateColumns = useMemo(() => {
    const cols: string[] = [];
    for (let i = 0; i < days; i++) cols.push(addDays(startDate, i));
    return cols;
  }, [startDate, days]);

  // Forecast data: for each day, count arrivals, departures, in-house, revenue
  const forecastData = useMemo(() => {
    return dateColumns.map((d) => {
      const arrivals = reservations.filter((r) => r.check_in_date === d && (r.status === 'confirmed' || r.status === 'checked_in'));
      const departures = reservations.filter((r) => r.check_out_date === d && (r.status === 'checked_in' || r.status === 'checked_out'));
      const inHouse = reservations.filter((r) => r.check_in_date <= d && r.check_out_date > d && (r.status === 'confirmed' || r.status === 'checked_in'));
      const revenue = inHouse.reduce((s, r) => s + Number(r.rate), 0);
      return { date: d, arrivals: arrivals.length, departures: departures.length, inHouse: inHouse.length, revenue };
    });
  }, [dateColumns, reservations]);

  // Occupancy forecast
  const totalRooms = availability.length || 1;
  const occupancyData = forecastData.map((f) => ({
    ...f,
    occupancyPct: Math.round((f.inHouse / totalRooms) * 100),
  }));

  // Availability summary
  const availSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of availability) {
      counts[a.status] = (counts[a.status] ?? 0) + 1;
    }
    return counts;
  }, [availability]);

  // Upcoming arrivals
  const arrivals = useMemo(() =>
    reservations
      .filter((r) => r.check_in_date >= startDate && r.check_in_date <= endDate && r.status === 'confirmed')
      .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date)),
    [reservations, startDate, endDate],
  );

  // Upcoming departures
  const departures = useMemo(() =>
    reservations
      .filter((r) => r.check_out_date >= startDate && r.check_out_date <= endDate && r.status === 'checked_in')
      .sort((a, b) => a.check_out_date.localeCompare(b.check_out_date)),
    [reservations, startDate, endDate],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-brand-navy-800">Reservation Reports</h1>
          <p className="text-xs text-slate-400">Forecast · Arrivals · Departures · Availability</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Report type tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
        {([
          { key: 'forecast', label: 'Forecast', icon: TrendingUp },
          { key: 'occupancy', label: 'Occupancy Forecast', icon: BarChart3 },
          { key: 'arrivals', label: 'Upcoming Arrivals', icon: LogIn },
          { key: 'departures', label: 'Upcoming Departures', icon: LogOut },
          { key: 'availability', label: 'Availability', icon: BedDouble },
        ] as { key: ReportType; label: string; icon: typeof TrendingUp }[]).map((t) => (
          <button key={t.key} onClick={() => setReportType(t.key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${reportType === t.key ? 'bg-white text-brand-navy-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <t.icon className="w-3 h-3 inline mr-1" />{t.label}
          </button>
        ))}
      </div>

      {/* Date controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <label className="text-xs font-semibold text-slate-500 mr-2">From:</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mr-2">Days:</label>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
            <option value={7}>7</option>
            <option value={14}>14</option>
            <option value={30}>30</option>
            <option value={90}>90</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          {/* Forecast Report */}
          {reportType === 'forecast' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b text-left text-xs font-bold text-slate-500 uppercase">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-center">Arrivals</th>
                    <th className="px-4 py-3 text-center">Departures</th>
                    <th className="px-4 py-3 text-center">In-house</th>
                    <th className="px-4 py-3 text-right">Expected Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {forecastData.map((f) => (
                    <tr key={f.date} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-brand-navy-700">{fmtDate(f.date)}</td>
                      <td className="px-4 py-3 text-center"><span className="text-blue-600 font-bold tabular-nums">{f.arrivals}</span></td>
                      <td className="px-4 py-3 text-center"><span className="text-sky-600 font-bold tabular-nums">{f.departures}</span></td>
                      <td className="px-4 py-3 text-center"><span className="text-emerald-600 font-bold tabular-nums">{f.inHouse}</span></td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmtMoney(f.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                    <td className="px-4 py-3 text-slate-700">Total</td>
                    <td className="px-4 py-3 text-center text-blue-700 tabular-nums">{forecastData.reduce((s, f) => s + f.arrivals, 0)}</td>
                    <td className="px-4 py-3 text-center text-sky-700 tabular-nums">{forecastData.reduce((s, f) => s + f.departures, 0)}</td>
                    <td className="px-4 py-3 text-center text-emerald-700 tabular-nums">{Math.round(forecastData.reduce((s, f) => s + f.inHouse, 0) / forecastData.length)}</td>
                    <td className="px-4 py-3 text-right text-brand-navy-800 tabular-nums">{fmtMoney(forecastData.reduce((s, f) => s + f.revenue, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Occupancy Forecast */}
          {reportType === 'occupancy' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Avg Occupancy" value={`${Math.round(occupancyData.reduce((s, f) => s + f.occupancyPct, 0) / occupancyData.length)}%`} icon={BarChart3} color="text-brand-600 bg-brand-50" />
                <StatCard label="Peak Occupancy" value={`${Math.max(...occupancyData.map((f) => f.occupancyPct))}%`} icon={TrendingUp} color="text-emerald-600 bg-emerald-50" />
                <StatCard label="Total Rooms" value={totalRooms.toString()} icon={BedDouble} color="text-sky-600 bg-sky-50" />
                <StatCard label="Period" value={`${days} days`} icon={Calendar} color="text-violet-600 bg-violet-50" />
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <h3 className="text-sm font-bold text-brand-navy-800 mb-3">Daily Occupancy Forecast</h3>
                <div className="space-y-2">
                  {occupancyData.map((f) => (
                    <div key={f.date} className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 w-24 shrink-0">{fmtDate(f.date)}</span>
                      <div className="flex-1 h-6 bg-slate-100 rounded-lg overflow-hidden relative">
                        <div className={`h-full rounded-lg transition-all flex items-center justify-end pr-2 ${
                          f.occupancyPct >= 90 ? 'bg-red-400' :
                          f.occupancyPct >= 70 ? 'bg-amber-400' :
                          'bg-brand-400'
                        }`} style={{ width: `${Math.max(2, f.occupancyPct)}%` }}>
                          <span className="text-[10px] font-bold text-white">{f.occupancyPct}%</span>
                        </div>
                      </div>
                      <span className="text-xs text-slate-600 w-16 text-right tabular-nums">{f.inHouse}/{totalRooms}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Upcoming Arrivals */}
          {reportType === 'arrivals' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              {arrivals.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">No upcoming arrivals.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b text-left text-xs font-bold text-slate-500 uppercase">
                      <th className="px-4 py-3">Guest</th><th className="px-4 py-3">Room</th><th className="px-4 py-3">Arrival</th><th className="px-4 py-3">Departure</th><th className="px-4 py-3">Nights</th><th className="px-4 py-3">Rate</th><th className="px-4 py-3">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {arrivals.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-brand-navy-700">{r.guest_name}</td>
                        <td className="px-4 py-3">{r.room_no}</td>
                        <td className="px-4 py-3 text-slate-600">{fmtDate(r.check_in_date)}</td>
                        <td className="px-4 py-3 text-slate-600">{fmtDate(r.check_out_date)}</td>
                        <td className="px-4 py-3 tabular-nums">{r.nights}</td>
                        <td className="px-4 py-3 tabular-nums">{fmtMoney(r.rate)}</td>
                        <td className="px-4 py-3 text-slate-600">{r.source_category}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Upcoming Departures */}
          {reportType === 'departures' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              {departures.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">No upcoming departures.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b text-left text-xs font-bold text-slate-500 uppercase">
                      <th className="px-4 py-3">Guest</th><th className="px-4 py-3">Room</th><th className="px-4 py-3">Departure</th><th className="px-4 py-3">Nights</th><th className="px-4 py-3">Rate</th><th className="px-4 py-3">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {departures.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-brand-navy-700">{r.guest_name}</td>
                        <td className="px-4 py-3">{r.room_no}</td>
                        <td className="px-4 py-3 text-slate-600">{fmtDate(r.check_out_date)}</td>
                        <td className="px-4 py-3 tabular-nums">{r.nights}</td>
                        <td className="px-4 py-3 tabular-nums">{fmtMoney(r.rate)}</td>
                        <td className="px-4 py-3 tabular-nums">{fmtMoney(Number(r.invoice_total) - Number(r.advance_paid))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Availability Report */}
          {reportType === 'availability' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(availSummary).map(([status, count]) => (
                  <StatCard key={status} label={status} value={count.toString()} icon={BedDouble} color={
                    status === 'Vacant' ? 'text-emerald-600 bg-emerald-50' :
                    status === 'Occupied' ? 'text-red-600 bg-red-50' :
                    status === 'Reserved' ? 'text-blue-600 bg-blue-50' :
                    status === 'Dirty' ? 'text-amber-600 bg-amber-50' :
                    'text-slate-600 bg-slate-100'
                  } />
                ))}
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b text-left text-xs font-bold text-slate-500 uppercase">
                      <th className="px-4 py-3">Room</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Floor</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Guest</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {availability.map((a) => (
                      <tr key={a.room_no} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-brand-navy-700">{a.room_no}</td>
                        <td className="px-4 py-3 text-slate-600">{a.category}</td>
                        <td className="px-4 py-3 text-slate-600">{a.floor || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            a.status === 'Vacant' ? 'bg-emerald-100 text-emerald-700' :
                            a.status === 'Occupied' ? 'bg-red-100 text-red-700' :
                            a.status === 'Reserved' ? 'bg-blue-100 text-blue-700' :
                            a.status === 'Dirty' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>{a.status}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{a.guestName || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const StatCard = ({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof BedDouble; color: string }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}>
      <Icon className="w-4 h-4" />
    </div>
    <p className="text-lg font-bold text-brand-navy-800 tabular-nums">{value}</p>
    <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
  </div>
);
