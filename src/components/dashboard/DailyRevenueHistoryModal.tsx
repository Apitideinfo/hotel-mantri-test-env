import { useState, useEffect, useMemo } from 'react';
import {
  Calendar, X, TrendingUp, DollarSign, BedDouble, AlertCircle,
  ChevronDown, ChevronUp, Download, Eye, Clock, ShieldCheck, CheckCircle2,
  CalendarDays, ArrowUpDown, RefreshCw,
} from 'lucide-react';
import { getDayWiseRevenue, type DayWiseRevenueData, type DayBreakdownItem, type ReservationBreakdownItem } from '@/lib/api-revenue';
import { fmtMoney, fmtInt } from '@/lib/calc';

interface DailyRevenueHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: string;
  initialStartDate?: string;
  initialEndDate?: string;
}

const rs = (n: number): string => '\u20B9' + fmtMoney(n);

export const DailyRevenueHistoryModal = ({
  isOpen,
  onClose,
  initialDate,
  initialStartDate,
  initialEndDate,
}: DailyRevenueHistoryModalProps) => {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [dateMode, setDateMode] = useState<'month' | 'range' | 'single'>(
    initialStartDate && initialEndDate ? 'range' : initialDate ? 'single' : 'month'
  );
  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
    if (initialDate) return parseInt(initialDate.slice(5, 7), 10);
    return new Date().getMonth() + 1;
  });
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    if (initialDate) return parseInt(initialDate.slice(0, 4), 10);
    return new Date().getFullYear();
  });
  const [singleDate, setSingleDate] = useState<string>(initialDate || today);
  const [rangeStart, setRangeStart] = useState<string>(initialStartDate || today.slice(0, 7) + '-01');
  const [rangeEnd, setRangeEnd] = useState<string>(initialEndDate || today);

  const [data, setData] = useState<DayWiseRevenueData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drilldown state: expanded date
  const [expandedDate, setExpandedDate] = useState<string | null>(initialDate || null);
  const [sortAsc, setSortAsc] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      let res: DayWiseRevenueData;
      if (dateMode === 'single') {
        res = await getDayWiseRevenue({ date: singleDate });
      } else if (dateMode === 'range') {
        res = await getDayWiseRevenue({ startDate: rangeStart, endDate: rangeEnd });
      } else {
        res = await getDayWiseRevenue({ month: selectedMonth, year: selectedYear });
      }
      setData(res);
      // Auto-expand single date or first date with revenue
      if (dateMode === 'single') {
        setExpandedDate(singleDate);
      } else if (!expandedDate && res.dailyBreakdown.length > 0) {
        const withRev = res.dailyBreakdown.find((d) => d.totalIncome > 0);
        if (withRev) setExpandedDate(withRev.date);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load daily revenue history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, dateMode, selectedMonth, selectedYear, singleDate, rangeStart, rangeEnd]);

  if (!isOpen) return null;

  const sortedBreakdown = [...(data?.dailyBreakdown || [])].sort((a, b) => {
    if (sortAsc) return a.date.localeCompare(b.date);
    return b.date.localeCompare(a.date);
  });

  const activeReservations = (data?.reservationsBreakdown || []).filter(
    (r) => !expandedDate || r.date === expandedDate
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fade-in">
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden my-auto animate-modal-pop">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-200/60 text-brand-600 flex items-center justify-center shadow-xs">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                Day-Wise Earned Revenue & History
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Authoritative accrual revenue across occupied room nights [check-in, check-out)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="p-4 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Mode Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setDateMode('month')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                dateMode === 'month' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Month View
            </button>
            <button
              onClick={() => setDateMode('range')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                dateMode === 'range' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Date Range
            </button>
            <button
              onClick={() => setDateMode('single')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                dateMode === 'single' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Specific Date
            </button>
          </div>

          {/* Controls depending on mode */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {dateMode === 'month' && (
              <>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 font-semibold text-slate-700 cursor-pointer"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(2026, i, 1).toLocaleDateString('en-IN', { month: 'long' })}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 font-semibold text-slate-700 cursor-pointer"
                >
                  {[2024, 2025, 2026, 2027, 2028].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </>
            )}

            {dateMode === 'range' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 font-medium text-slate-700"
                />
                <span className="text-slate-400 font-bold">→</span>
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 font-medium text-slate-700"
                />
              </div>
            )}

            {dateMode === 'single' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={singleDate}
                  onChange={(e) => setSingleDate(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2.5 py-1 bg-slate-50 font-semibold text-slate-700"
                />
                <button
                  onClick={() => setSingleDate(today)}
                  className="px-2 py-1 bg-brand-50 border border-brand-200 text-brand-700 font-bold rounded-lg hover:bg-brand-100 cursor-pointer"
                >
                  Today
                </button>
              </div>
            )}

            <button
              onClick={fetchData}
              disabled={loading}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition disabled:opacity-50 cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Period Summary KPI Cards */}
          {data && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-slate-50/80 border border-slate-200/70 rounded-xl p-3">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Earned</p>
                <p className="text-base sm:text-lg font-bold text-brand-600 mt-0.5">{rs(data.summary.totalIncome)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Room + F&B + Other</p>
              </div>

              <div className="bg-slate-50/80 border border-slate-200/70 rounded-xl p-3">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Room Revenue</p>
                <p className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">{rs(data.summary.roomRevenue)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{data.summary.soldRoomNights} room nights sold</p>
              </div>

              <div className="bg-slate-50/80 border border-slate-200/70 rounded-xl p-3">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Avg Daily Revenue</p>
                <p className="text-base sm:text-lg font-bold text-slate-800 mt-0.5">{rs(data.summary.averageDailyRevenue)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Across {data.period.totalDays} day{data.period.totalDays !== 1 ? 's' : ''}</p>
              </div>

              <div className="bg-slate-50/80 border border-slate-200/70 rounded-xl p-3">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">ARR</p>
                <p className="text-base sm:text-lg font-bold text-indigo-600 mt-0.5">{rs(data.summary.arr)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Avg Room Rate</p>
              </div>

              <div className="bg-slate-50/80 border border-slate-200/70 rounded-xl p-3">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">RevPAR</p>
                <p className="text-base sm:text-lg font-bold text-emerald-600 mt-0.5">{rs(data.summary.revpar)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">OCC: {data.summary.occupancyPercent}%</p>
              </div>

              <div className="bg-slate-50/80 border border-slate-200/70 rounded-xl p-3">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Collection</p>
                <p className="text-base sm:text-lg font-bold text-teal-700 mt-0.5">{rs(data.summary.totalCollections)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5" title="Cash/Bank/UPI/Card actual payment date">
                  Actual money received
                </p>
              </div>
            </div>
          )}

          {/* Section: Daily Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Daily Revenue Table</h3>
                <span className="text-xs text-slate-500">({sortedBreakdown.length} dates)</span>
              </div>
              <button
                onClick={() => setSortAsc(!sortAsc)}
                className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 font-semibold px-2 py-1 rounded-lg border border-slate-200 bg-white cursor-pointer"
              >
                <ArrowUpDown className="w-3 h-3" />
                <span>{sortAsc ? 'Oldest First' : 'Newest First'}</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200/80">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-right">Room Revenue</th>
                    <th className="py-2.5 px-3 text-right">F&B</th>
                    <th className="py-2.5 px-3 text-right">Other</th>
                    <th className="py-2.5 px-3 text-right">Total Earned</th>
                    <th className="py-2.5 px-3 text-right">Collection</th>
                    <th className="py-2.5 px-3 text-center">Nights</th>
                    <th className="py-2.5 px-3 text-center">ARR</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-center">Drilldown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {sortedBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400 text-xs">
                        No revenue recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    sortedBreakdown.map((row) => {
                      const isExpanded = expandedDate === row.date;
                      const isTodayDate = row.date === today;
                      return (
                        <tr
                          key={row.date}
                          className={`transition cursor-pointer ${
                            isExpanded ? 'bg-brand-50/40' : isTodayDate ? 'bg-amber-50/30 hover:bg-amber-50/60' : 'hover:bg-slate-50/80'
                          }`}
                          onClick={() => setExpandedDate(isExpanded ? null : row.date)}
                        >
                          <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                            <span className="flex items-center gap-1.5">
                              {row.date}
                              {isTodayDate && (
                                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.2 rounded">
                                  Today
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-slate-800 tabular-nums">
                            {rs(row.roomRevenue)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-600 tabular-nums">
                            {rs(row.fbRevenue)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-600 tabular-nums">
                            {rs(row.otherIncome)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-brand-600 tabular-nums">
                            {rs(row.totalIncome)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-teal-700 tabular-nums" title={`Cash: ${row.collections.cash}, Bank: ${row.collections.bank}, UPI: ${row.collections.upi}, Card: ${row.collections.card}`}>
                            {rs(row.collections.total)}
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-600">
                            {row.soldRoomNights}
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-700 tabular-nums">
                            {rs(row.arr)}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            {row.businessDateStatus === 'closed' ? (
                              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                <ShieldCheck className="w-3 h-3" /> Closed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                Open Date
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="inline-flex items-center gap-0.5 text-xs text-brand-600 hover:text-brand-800 font-bold">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {/* Total Row */}
                {data && sortedBreakdown.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
                      <td className="py-3 px-3">TOTAL</td>
                      <td className="py-3 px-3 text-right tabular-nums">{rs(data.summary.roomRevenue)}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{rs(data.summary.fbRevenue)}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{rs(data.summary.otherIncome)}</td>
                      <td className="py-3 px-3 text-right text-brand-600 tabular-nums">{rs(data.summary.totalIncome)}</td>
                      <td className="py-3 px-3 text-right text-teal-800 tabular-nums">{rs(data.summary.totalCollections)}</td>
                      <td className="py-3 px-3 text-center">{data.summary.soldRoomNights}</td>
                      <td className="py-3 px-3 text-center tabular-nums">{rs(data.summary.arr)}</td>
                      <td colSpan={2} className="py-3 px-3 text-center text-xs text-slate-500">
                        {data.period.totalDays} Days
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Section: Reservation-Level Drill Down */}
          {expandedDate && (
            <div className="bg-white border border-brand-200 rounded-xl overflow-hidden shadow-sm animate-fade-in">
              <div className="px-4 py-3 bg-brand-50/70 border-b border-brand-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BedDouble className="w-4 h-4 text-brand-600" />
                  <h4 className="text-sm font-bold text-slate-900">
                    Reservation Breakdown for {expandedDate}
                  </h4>
                  <span className="text-xs text-slate-500 font-medium">
                    ({activeReservations.length} occupied room night{activeReservations.length !== 1 ? 's' : ''})
                  </span>
                </div>
                <div className="text-xs font-bold text-brand-700">
                  Room Revenue: {rs(activeReservations.reduce((sum, r) => sum + r.revenueForDate, 0))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      <th className="py-2 px-3">Booking ID</th>
                      <th className="py-2 px-3">Guest Name</th>
                      <th className="py-2 px-3">Room</th>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3">Stay Dates</th>
                      <th className="py-2 px-3">Source</th>
                      <th className="py-2 px-3 text-right">Nightly Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {activeReservations.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-400 text-xs">
                          No occupied rooms on {expandedDate}.
                        </td>
                      </tr>
                    ) : (
                      activeReservations.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3 font-mono font-bold text-brand-700">
                            {r.bookingId}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-900">
                            {r.guestName}
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-800">
                            Room {r.roomNo}
                          </td>
                          <td className="py-2 px-3 text-slate-500">
                            {r.categoryName}
                          </td>
                          <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                            {r.checkIn} → {r.checkOut} ({r.nights}n)
                          </td>
                          <td className="py-2 px-3">
                            <span className="bg-slate-100 text-slate-700 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                              {r.sourceName}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900 tabular-nums">
                            {rs(r.revenueForDate)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {activeReservations.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-50/90 font-bold text-slate-900 border-t border-slate-200">
                        <td colSpan={6} className="py-2.5 px-3">
                          Total Room Revenue ({expandedDate})
                        </td>
                        <td className="py-2.5 px-3 text-right text-brand-600 font-bold tabular-nums">
                          {rs(activeReservations.reduce((sum, r) => sum + r.revenueForDate, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
            <span>Earned Revenue is recognized on occupied room nights [check-in, check-out); Collections reflect actual payment dates.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
