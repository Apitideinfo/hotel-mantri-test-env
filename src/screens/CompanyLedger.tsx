import { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Search, Building2 } from 'lucide-react';
import type { CompanySource, SourceCategory, RoomChartEntry } from '@/lib/types';
import { getCompanySources, getCompanyLedger } from '@/lib/api';
import { buildCompanyLedger, fmtMoney, fmtInt, toNum } from '@/lib/calc';

interface CompanyLedgerProps {
  onBack: () => void;
  initialDate: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const CompanyLedger = ({ onBack, initialDate }: CompanyLedgerProps) => {
  const d = new Date(initialDate + 'T00:00:00');
  const [sources, setSources] = useState<CompanySource[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [filterCategory, setFilterCategory] = useState<'All' | SourceCategory>('All');
  const [year, setYear] = useState(d.getFullYear());
  const [month, setMonth] = useState<'All' | number>('All');
  const [entries, setEntries] = useState<RoomChartEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await getCompanySources();
        if (mounted) setSources(s);
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    return () => { mounted = false; };
  }, []);

  const fromDate = month === 'All' ? `${year}-01-01` : `${year}-${String(month).padStart(2, '0')}-01`;
  const toDate = month === 'All' ? `${year}-12-31` : `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

  const loadLedger = async () => {
    if (!selectedCompany) return;
    try {
      setLoading(true);
      setError(null);
      const e = await getCompanyLedger(selectedCompany, fromDate, toDate);
      setEntries(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (selectedCompany) loadLedger(); /* eslint-disable-next-line */ }, [selectedCompany, year, month]);

  const selectedSource = sources.find((s) => s.name === selectedCompany);
  const ledger = useMemo(
    () => selectedCompany
      ? buildCompanyLedger(selectedCompany, (selectedSource?.source_category ?? 'Direct/Walking') as SourceCategory, entries)
      : null,
    [selectedCompany, selectedSource, entries]
  );

  const filteredSources = filterCategory === 'All'
    ? sources
    : sources.filter((s) => s.source_category === filterCategory);

  const years = [2024, 2025, 2026, 2027, 2028];

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      <header className="sticky top-0 z-10 bg-sky-800 text-white px-4 py-3 flex items-center gap-3 shadow">
        <button onClick={onBack} className="p-1.5 -ml-1.5 hover:bg-sky-700 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-semibold leading-tight">Company Ledger</h1>
          <p className="text-sky-200 text-xs">Booking source history</p>
        </div>
        <Building2 className="w-5 h-5 text-sky-300 ml-auto" />
      </header>

      <main className="px-4 py-4 space-y-4 w-full">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Source Category Filter</label>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as 'All' | SourceCategory)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-sky-500">
              <option value="All">All Categories</option>
              <option value="OTA">OTA</option>
              <option value="Direct/Walking">Direct/Walking</option>
              <option value="Corporate/Agent">Corporate/Agent</option>
              <option value="Phonebook">Phonebook</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Company / Booking Source</label>
            <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-sky-500">
              <option value="">Select a company…</option>
              {filteredSources.map((s) => <option key={s.id} value={s.name}>{s.name} ({s.source_category})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Year</label>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-sky-500">
                {years.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Month</label>
              <select value={month} onChange={(e) => setMonth(e.target.value === 'All' ? 'All' : Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-sky-500">
                <option value="All">All Months</option>
                {MONTHS.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {!selectedCompany && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
            <Search className="w-6 h-6 text-slate-300" />
            Select a company above to view its ledger.
          </div>
        )}

        {selectedCompany && loading && (
          <div className="bg-white rounded-xl border p-6 text-center text-slate-400 text-sm">Loading ledger…</div>
        )}

        {selectedCompany && !loading && ledger && (
          <>
            {/* Summary */}
            <div className="bg-gradient-to-br from-sky-700 to-sky-900 text-white rounded-xl p-4">
              <p className="text-sky-200 text-xs uppercase tracking-wide">{ledger.category}</p>
              <h2 className="text-xl font-bold mt-0.5">{ledger.name}</h2>
              <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-sky-700">
                <div><p className="text-xs text-sky-200">Bookings</p><p className="text-lg font-bold tabular-nums">{fmtInt(ledger.totalBookings)}</p></div>
                <div><p className="text-xs text-sky-200">Room Nights</p><p className="text-lg font-bold tabular-nums">{fmtInt(ledger.totalRoomNights)}</p></div>
                <div><p className="text-xs text-sky-200">Revenue</p><p className="text-lg font-bold tabular-nums">₹{fmtMoney(ledger.totalRoomRevenue)}</p></div>
              </div>
            </div>

            {/* History */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Date-wise Bookings</h3>
              </div>
              {ledger.rows.length === 0 ? (
                <p className="p-4 text-sm text-slate-500 text-center">No bookings found for this period.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {ledger.rows.map((r, i) => (
                    <div key={i} className="p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-900">{r.guest || '—'}</span>
                        <span className="text-sm font-bold text-slate-900 tabular-nums">₹{fmtMoney(r.total)}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                        <span>{r.date.split('-').reverse().join('/')}</span>
                        <span>Room {r.room || '—'}</span>
                        <span>{r.nights} night{r.nights !== 1 ? 's' : ''}</span>
                        <span>₹{fmtMoney(r.roomRate)}/night</span>
                        <span className="text-slate-400">{r.payMode}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Arr {r.arrival ? r.arrival.split('-').reverse().join('/') : '—'} → Dep {r.departure ? r.departure.split('-').reverse().join('/') : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};
