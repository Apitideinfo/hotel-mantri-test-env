import { useEffect, useState, useMemo } from 'react';
import {
  BookOpen, Search, Download, Printer, Loader2,
  Wallet, Landmark, Receipt, TrendingUp, FileText, RotateCcw,
} from 'lucide-react';
import type { HotelSettings, RoomChartEntry } from '@/lib/types';
import type { ExpenseEntry, RevenueEntry } from '@/lib/types-finance';
import { getSettings } from '@/lib/api';
import { getRoomChartForDateRange } from '@/lib/api-reservations';
import {
  getExpenseEntriesForDateRange, getRevenueEntriesForDateRange,
} from '@/lib/api-finance';
import { toNum, fmtMoney, splitGst } from '@/lib/calc';
import { generateRoomRevenueLedger, reconcilePaymentLedger } from '@/lib/financialLedger';
import { ScreenHeader, SectionCard, Banner } from '@/components/finance-ui';

type LedgerType = 'cash' | 'bank' | 'expense' | 'revenue' | 'payment' | 'gst' | 'guest';

interface LedgerRow {
  date: string;
  description: string;
  debit: number;
  credit: number;
  reference: string;
  balance: number;
}

const LEDGER_TYPES: { id: LedgerType; label: string; icon: React.ReactNode }[] = [
  { id: 'cash', label: 'Cash Book', icon: <Wallet className="w-4 h-4" /> },
  { id: 'bank', label: 'Bank Book', icon: <Landmark className="w-4 h-4" /> },
  { id: 'expense', label: 'Expense Ledger', icon: <Receipt className="w-4 h-4" /> },
  { id: 'revenue', label: 'Revenue Ledger', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'payment', label: 'Payment Ledger', icon: <BookOpen className="w-4 h-4" /> },
  { id: 'gst', label: 'GST Register', icon: <FileText className="w-4 h-4" /> },
  { id: 'guest', label: 'Guest Ledger', icon: <BookOpen className="w-4 h-4" /> },
];

export const LedgersScreen = ({ onBack }: { onBack: () => void }) => {
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [ledgerType, setLedgerType] = useState<LedgerType>('cash');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await getSettings();
        setSettings(s);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    loadLedger();
  }, [ledgerType, fromDate, toDate]);

  const loadLedger = async () => {
    setLoading(true);
    setError(null);
    try {
      const [entries, expenses, revenues] = await Promise.all([
        getRoomChartForDateRange(fromDate, toDate),
        getExpenseEntriesForDateRange(fromDate, toDate),
        getRevenueEntriesForDateRange(fromDate, toDate),
      ]);
      const r = buildLedger(ledgerType, entries, expenses, revenues, fromDate, toDate);
      setRows(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      r.description.toLowerCase().includes(q) ||
      r.reference.toLowerCase().includes(q) ||
      r.date.includes(q)
    );
  }, [rows, search]);

  const totalDebit = filteredRows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = filteredRows.reduce((s, r) => s + r.credit, 0);

  const handlePrint = () => window.print();

  const handleExportExcel = () => {
    const header = 'Date,Description,Reference,Debit,Credit,Balance\n';
    const body = filteredRows.map((r) =>
      `${r.date},"${r.description}","${r.reference}",${r.debit},${r.credit},${r.balance}`
    ).join('\n');
    const csv = header + body;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ledgerType}-ledger-${fromDate}-to-${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <ScreenHeader title="Ledgers" subtitle="Cash · Bank · Expense · Revenue · GST" onBack={onBack}
        icon={<BookOpen className="w-5 h-5 text-sky-300" />} />

      <main className="px-4 py-4 space-y-4 w-full max-w-4xl mx-auto">
        {error && <Banner kind="error">{error}</Banner>}

        {/* Ledger type tabs */}
        <div className="flex flex-wrap gap-2">
          {LEDGER_TYPES.map((t) => (
            <button key={t.id} onClick={() => setLedgerType(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                ledgerType === t.id
                  ? 'bg-sky-700 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">From Date</span>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">To Date</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Search</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search description, reference, date…"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
          </label>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Total Debit</p>
            <p className="text-lg font-bold text-red-600 tabular-nums">₹{fmtMoney(totalDebit)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Total Credit</p>
            <p className="text-lg font-bold text-emerald-600 tabular-nums">₹{fmtMoney(totalCredit)}</p>
          </div>
        </div>

        {/* Export buttons */}
        <div className="flex gap-2">
          <button onClick={handleExportExcel}
            className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 rounded-lg border border-slate-200 text-sm transition">
            <Download className="w-4 h-4 text-sky-600" /> Excel
          </button>
          <button onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 rounded-lg border border-slate-200 text-sm transition">
            <Printer className="w-4 h-4 text-sky-600" /> Print
          </button>
        </div>

        {/* Ledger table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
            <p className="text-sm text-slate-400">No entries found for the selected period.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Description</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Reference</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Debit</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Credit</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-2 text-slate-800">{r.description}</td>
                      <td className="px-3 py-2 text-slate-400 text-xs">{r.reference || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-600">{r.debit > 0 ? `₹${fmtMoney(r.debit)}` : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{r.credit > 0 ? `₹${fmtMoney(r.credit)}` : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-700">₹{fmtMoney(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

function buildLedger(
  type: LedgerType,
  entries: RoomChartEntry[],
  expenses: ExpenseEntry[],
  revenues: RevenueEntry[],
  fromDate: string,
  toDate: string,
): LedgerRow[] {
  const rows: LedgerRow[] = [];
  let balance = 0;

  const paymentTransactions = reconcilePaymentLedger({ roomChartEntries: entries });

  if (type === 'cash') {
    paymentTransactions
      .filter((tx) => tx.payment_method === 'Cash' && tx.payment_date >= fromDate && tx.payment_date <= toDate)
      .forEach((tx) => {
        balance += tx.amount;
        rows.push({
          date: tx.payment_date,
          description: `Room Collection — ${tx.notes || tx.reference || 'Cash Payment'}`,
          reference: tx.reference || 'Cash',
          debit: 0, credit: tx.amount, balance,
        });
      });
    revenues.forEach((r) => {
      if (r.payment_mode === 'Cash') {
        balance += toNum(r.amount);
        rows.push({
          date: r.entry_date,
          description: `${r.revenue_head} — ${r.description || '—'}`,
          reference: 'Revenue Entry',
          debit: 0, credit: toNum(r.amount), balance,
        });
      }
    });
    expenses.forEach((e) => {
      if (e.payment_mode === 'Cash') {
        balance -= toNum(e.amount);
        rows.push({
          date: e.entry_date,
          description: `${e.category_name} — ${e.description || '—'}`,
          reference: e.bill_no || '—',
          debit: toNum(e.amount), credit: 0, balance,
        });
      }
    });
  } else if (type === 'bank') {
    paymentTransactions
      .filter((tx) => tx.payment_method !== 'Cash' && tx.payment_date >= fromDate && tx.payment_date <= toDate)
      .forEach((tx) => {
        balance += tx.amount;
        rows.push({
          date: tx.payment_date,
          description: `Collection (${tx.payment_method}) — ${tx.notes || tx.reference || 'Bank/UPI'}`,
          reference: tx.reference || tx.payment_method,
          debit: 0, credit: tx.amount, balance,
        });
      });
    revenues.forEach((r) => {
      if (r.payment_mode === 'Bank') {
        balance += toNum(r.amount);
        rows.push({
          date: r.entry_date,
          description: `${r.revenue_head} — ${r.description || '—'}`,
          reference: 'Revenue Entry',
          debit: 0, credit: toNum(r.amount), balance,
        });
      }
    });
    expenses.forEach((e) => {
      if (e.payment_mode === 'Bank') {
        balance -= toNum(e.amount);
        rows.push({
          date: e.entry_date,
          description: `${e.category_name} — ${e.description || '—'}`,
          reference: e.bill_no || '—',
          debit: toNum(e.amount), credit: 0, balance,
        });
      }
    });
  } else if (type === 'expense') {
    expenses.forEach((e) => {
      rows.push({
        date: e.entry_date,
        description: `${e.category_name} — ${e.description || '—'}`,
        reference: e.bill_no || '—',
        debit: toNum(e.amount), credit: 0, balance: 0,
      });
    });
  } else if (type === 'revenue') {
    // Room Revenue: Each occupied night gets its exact nightly room revenue
    entries.filter((e) => !e.is_complimentary).forEach((e) => {
      const stayLedger = generateRoomRevenueLedger({
        hotel_id: e.hotel_id,
        check_in_date: (e.arrival && e.arrival.trim() !== '' ? e.arrival : e.report_date).slice(0, 10),
        check_out_date: (e.departure && e.departure.trim() !== '' ? e.departure : e.report_date).slice(0, 10),
        rate: toNum(e.room_rate),
        invoice_total: toNum(e.total) || toNum(e.invoice_total),
        room_no: e.room_no,
        guest_name: e.guest_name,
        source_category: e.source_category,
        is_complimentary: e.is_complimentary,
      });

      for (const revItem of stayLedger) {
        if (revItem.business_date >= fromDate && revItem.business_date <= toDate) {
          rows.push({
            date: revItem.business_date,
            description: `Room Revenue — Room ${revItem.room_no} — ${revItem.guest_name}`,
            reference: revItem.source_category || '—',
            debit: 0, credit: revItem.amount, balance: 0,
          });
        }
      }
    });
    revenues.forEach((r) => {
      rows.push({
        date: r.entry_date,
        description: `${r.revenue_head} — ${r.description || '—'}`,
        reference: 'Revenue Entry',
        debit: 0, credit: toNum(r.amount), balance: 0,
      });
    });
  } else if (type === 'payment') {
    paymentTransactions
      .filter((tx) => tx.payment_date >= fromDate && tx.payment_date <= toDate)
      .forEach((tx) => {
        rows.push({
          date: tx.payment_date,
          description: `Payment (${tx.payment_method}) — ${tx.notes || tx.reference || 'Guest Payment'}`,
          reference: tx.reference || tx.payment_method,
          debit: 0, credit: tx.amount, balance: 0,
        });
      });
  } else if (type === 'gst') {
    entries.filter((e) => !e.is_complimentary && toNum(e.gst_amount) > 0).forEach((e) => {
      const gst = toNum(e.gst_amount);
      const { cgst, sgst, igst } = splitGst(gst);
      rows.push({
        date: e.report_date,
        description: `Room ${e.room_no} — ${e.guest_name} — GST ${e.gst_type} @ ${e.gst_slab}%`,
        reference: `CGST ₹${fmtMoney(cgst)} · SGST ₹${fmtMoney(sgst)} · IGST ₹${fmtMoney(igst)}`,
        debit: 0, credit: gst, balance: 0,
      });
    });
  } else if (type === 'guest') {
    entries.forEach((e) => {
      const amt = toNum(e.total) > 0 ? toNum(e.total) : toNum(e.room_rate);
      const received = toNum(e.pay_cash) + toNum(e.pay_upi) + toNum(e.pay_card) + toNum(e.pay_bank) + toNum(e.pay_advance);
      rows.push({
        date: (e.arrival || e.report_date).slice(0, 10),
        description: `${e.guest_name} — Room ${e.room_no}`,
        reference: e.company || 'Direct',
        debit: amt, credit: received, balance: amt - received,
      });
    });
  }

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows;
}
