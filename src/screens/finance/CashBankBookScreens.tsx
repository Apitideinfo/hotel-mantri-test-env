import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2, AlertCircle, BookOpen, X, Download, Search,
  Calendar, ArrowDownLeft, ArrowUpRight, Filter, FileSpreadsheet,
  Printer, RefreshCw, Landmark, Banknote
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ScreenHeader, fmtMoney } from '@/components/finance-ui';
import { getCashBook, getBankBook } from '@/lib/api-accounting';
import type { LedgerEntry } from '@/lib/types-accounting';

const today = () => new Date().toISOString().slice(0, 10);

type DatePreset = 'today' | 'yesterday' | 'week' | 'this_month' | 'last_month' | 'fy' | 'custom';

export const CashBookScreen = ({ onBack }: { onBack: () => void }) => (
  <LedgerBookScreen onBack={onBack} title="Cash Book" type="cash" />
);

export const BankBookScreen = ({ onBack }: { onBack: () => void }) => (
  <LedgerBookScreen onBack={onBack} title="Bank Book" type="bank" />
);

const LedgerBookScreen = ({
  onBack,
  title,
  type,
}: {
  onBack: () => void;
  title: string;
  type: 'cash' | 'bank';
}) => {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Preset & Dates
  const [preset, setPreset] = useState<DatePreset>('this_month');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(today());

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | 'in' | 'out'>('all');

  const applyPreset = (p: DatePreset) => {
    setPreset(p);
    const now = new Date();
    if (p === 'today') {
      const t = today();
      setFromDate(t);
      setToDate(t);
    } else if (p === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const ys = y.toISOString().slice(0, 10);
      setFromDate(ys);
      setToDate(ys);
    } else if (p === 'week') {
      const w = new Date();
      w.setDate(w.getDate() - 7);
      setFromDate(w.toISOString().slice(0, 10));
      setToDate(today());
    } else if (p === 'this_month') {
      const start = `${now.toISOString().slice(0, 7)}-01`;
      setFromDate(start);
      setToDate(today());
    } else if (p === 'last_month') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      setFromDate(lm.toISOString().slice(0, 10));
      setToDate(lEnd.toISOString().slice(0, 10));
    } else if (p === 'fy') {
      const curYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      setFromDate(`${curYear}-04-01`);
      setToDate(`${curYear + 1}-03-31`);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data =
        type === 'cash'
          ? await getCashBook(fromDate, toDate)
          : await getBankBook(fromDate, toDate);
      setEntries(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ledger records');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, type]);

  useEffect(() => {
    load();
  }, [load]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (txTypeFilter === 'in' && e.debit <= 0) return false;
      if (txTypeFilter === 'out' && e.credit <= 0) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (e.particulars && e.particulars.toLowerCase().includes(q)) ||
        (e.voucher_number && e.voucher_number.toLowerCase().includes(q)) ||
        e.date.includes(q) ||
        e.debit.toString().includes(q) ||
        e.credit.toString().includes(q)
      );
    });
  }, [entries, searchQuery, txTypeFilter]);

  // Aggregate KPI metrics
  const totalIn = useMemo(() => entries.reduce((s, e) => s + e.debit, 0), [entries]);
  const totalOut = useMemo(() => entries.reduce((s, e) => s + e.credit, 0), [entries]);
  const netFlow = totalIn - totalOut;
  const closing = entries.length > 0 ? entries[entries.length - 1].balance : 0;
  const opening = entries.length > 0 ? entries[0].balance - entries[0].debit + entries[0].credit : 0;

  // Export to Excel
  const handleExportExcel = () => {
    if (entries.length === 0) {
      alert('No ledger entries to export for this period.');
      return;
    }

    const rows = filteredEntries.map((e) => ({
      Date: e.date,
      'Voucher No': e.voucher_number || '—',
      Particulars: e.particulars || '—',
      'Inflow / Debit (₹)': e.debit > 0 ? e.debit : 0,
      'Outflow / Credit (₹)': e.credit > 0 ? e.credit : 0,
      'Balance (₹)': e.balance,
    }));

    // Add totals row
    rows.push({
      Date: 'TOTAL',
      'Voucher No': '',
      Particulars: `Net Movement: ₹${fmtMoney(netFlow)}`,
      'Inflow / Debit (₹)': totalIn,
      'Outflow / Credit (₹)': totalOut,
      'Balance (₹)': closing,
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `${title} Register`);
    XLSX.writeFile(workbook, `${title.replace(/\s+/g, '_')}_${fromDate}_to_${toDate}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-900/[0.02] text-slate-800 pb-20">
      <ScreenHeader
        title={title}
        subtitle={`${type === 'cash' ? 'Cash drawer in/out movements' : 'Bank accounts & online settlements'} · ${fromDate} to ${toDate}`}
        onBack={onBack}
        icon={
          type === 'cash' ? (
            <Banknote className="w-5 h-5 text-emerald-400" />
          ) : (
            <Landmark className="w-5 h-5 text-sky-400" />
          )
        }
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* ── Top Metric Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-slate-400 text-xs font-medium block">Opening Balance</span>
            <p className="text-lg font-bold text-slate-700 mt-1 tabular-nums">
              ₹{fmtMoney(opening)}
            </p>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Start of period</span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-emerald-600 text-xs font-semibold">Total Receipts (In)</span>
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <p className="text-lg font-bold text-emerald-600 mt-1 tabular-nums">
              ₹{fmtMoney(totalIn)}
            </p>
            <span className="text-[10px] text-emerald-600/70 mt-0.5 block">Deposits & sales</span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-rose-600 text-xs font-semibold">Total Payments (Out)</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" />
            </div>
            <p className="text-lg font-bold text-rose-600 mt-1 tabular-nums">
              ₹{fmtMoney(totalOut)}
            </p>
            <span className="text-[10px] text-rose-600/70 mt-0.5 block">Vouchers & payouts</span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-slate-500 text-xs font-medium block">Net Movement</span>
            <p
              className={`text-lg font-bold mt-1 tabular-nums ${
                netFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {netFlow >= 0 ? '+' : ''}₹{fmtMoney(netFlow)}
            </p>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Inflow vs Outflow</span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-sky-200 bg-sky-50/20 shadow-2xs col-span-2 md:col-span-1">
            <span className="text-sky-700 text-xs font-semibold block">Closing Balance</span>
            <p className="text-xl font-extrabold text-sky-700 mt-1 tabular-nums">
              ₹{fmtMoney(closing)}
            </p>
            <span className="text-[10px] text-sky-600/80 mt-0.5 block">Current passbook end</span>
          </div>
        </div>

        {/* ── Filters, Date Bar & Actions ── */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          {/* Preset buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'week', label: 'Last 7 Days' },
                { id: 'this_month', label: 'This Month' },
                { id: 'last_month', label: 'Last Month' },
                { id: 'fy', label: 'Financial Year' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id as DatePreset)}
                  className={`text-xs px-2.5 py-1.5 rounded-xl font-medium transition cursor-pointer ${
                    preset === p.id
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Export & Actions */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 transition cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export Excel (.xlsx)
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>

              <button
                type="button"
                onClick={load}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-600' : ''}`} />
              </button>
            </div>
          </div>

          {/* Search, Transaction Filter & Date Pickers */}
          <div className="pt-2 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2">
              {/* Search */}
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search voucher, particulars, note..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Type filter */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setTxTypeFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    txTypeFilter === 'all'
                      ? 'bg-white text-slate-800 shadow-2xs'
                      : 'text-slate-500'
                  }`}
                >
                  All ({entries.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTxTypeFilter('in')}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    txTypeFilter === 'in'
                      ? 'bg-white text-emerald-700 shadow-2xs'
                      : 'text-slate-500'
                  }`}
                >
                  In / Receipts
                </button>
                <button
                  type="button"
                  onClick={() => setTxTypeFilter('out')}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    txTypeFilter === 'out'
                      ? 'bg-white text-rose-700 shadow-2xs'
                      : 'text-slate-500'
                  }`}
                >
                  Out / Payments
                </button>
              </div>
            </div>

            {/* Custom Dates */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Date:
              </span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPreset('custom');
                }}
                className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPreset('custom');
                }}
                className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-auto text-rose-500 hover:text-rose-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Main Passbook Ledger Table ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-sky-600 mr-2" />
              Loading passbook entries...
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-16 text-slate-400 space-y-2">
              <BookOpen className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">No passbook transactions found.</p>
              <p className="text-xs text-slate-400">
                {searchQuery
                  ? 'No records matching your search query.'
                  : 'No cash or bank movements recorded for this date period.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Voucher #</th>
                    <th className="px-4 py-3">Particulars / Narration</th>
                    <th className="px-4 py-3 text-right">Inflow (₹ Dr)</th>
                    <th className="px-4 py-3 text-right">Outflow (₹ Cr)</th>
                    <th className="px-4 py-3 text-right">Running Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredEntries.map((e, i) => (
                    <tr
                      key={i}
                      className="hover:bg-slate-50/70 transition"
                    >
                      <td className="px-4 py-3 font-medium text-slate-600 whitespace-nowrap">
                        {e.date}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                        {e.voucher_number ? (
                          <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold">
                            {e.voucher_number}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-800 font-medium">
                        {e.particulars}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-600 whitespace-nowrap">
                        {e.debit > 0 ? (
                          <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md">
                            +₹{fmtMoney(e.debit)}
                          </span>
                        ) : (
                          <span className="text-slate-300 font-normal">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-rose-600 whitespace-nowrap">
                        {e.credit > 0 ? (
                          <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md">
                            -₹{fmtMoney(e.credit)}
                          </span>
                        ) : (
                          <span className="text-slate-300 font-normal">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-extrabold text-slate-800 whitespace-nowrap">
                        ₹{fmtMoney(e.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs">
                    <td colSpan={3} className="px-4 py-3 text-slate-700">
                      Summary Period Totals ({filteredEntries.length} entries)
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                      ₹{fmtMoney(totalIn)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-rose-700">
                      ₹{fmtMoney(totalOut)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-900 font-black">
                      ₹{fmtMoney(closing)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
