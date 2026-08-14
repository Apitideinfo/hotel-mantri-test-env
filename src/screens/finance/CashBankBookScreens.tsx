import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, BookOpen, X } from 'lucide-react';
import { ScreenHeader, fmtMoney } from '@/components/finance-ui';
import { getCashBook, getBankBook } from '@/lib/api-accounting';
import type { LedgerEntry } from '@/lib/types-accounting';

const today = () => new Date().toISOString().slice(0, 10);

export const CashBookScreen = ({ onBack }: { onBack: () => void }) => <LedgerBookScreen onBack={onBack} title="Cash Book" type="cash" />;
export const BankBookScreen = ({ onBack }: { onBack: () => void }) => <LedgerBookScreen onBack={onBack} title="Bank Book" type="bank" />;

const LedgerBookScreen = ({ onBack, title, type }: { onBack: () => void; title: string; type: 'cash' | 'bank' }) => {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [toDate, setToDate] = useState(today());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = type === 'cash' ? await getCashBook(fromDate, toDate) : await getBankBook(fromDate, toDate);
      setEntries(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, type]);

  useEffect(() => { load(); }, [load]);

  const totalIn = entries.reduce((s, e) => s + e.debit, 0);
  const totalOut = entries.reduce((s, e) => s + e.credit, 0);
  const closing = entries.length > 0 ? entries[entries.length - 1].balance : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <ScreenHeader title={title} subtitle={`${fmtMoney(totalIn)} in · ${fmtMoney(totalOut)} out · ${fmtMoney(closing)} closing`} onBack={onBack}
        icon={<BookOpen className="w-5 h-5 text-sky-300" />} />

      <div className="px-4 py-3 flex items-center gap-3">
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
      </div>

      {error && (
        <div className="mx-4 mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-slate-400"><BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" /><p className="text-sm">No entries for this period.</p></div>
      ) : (
        <div className="px-4 pb-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-left text-[10px] font-bold text-slate-400 uppercase">
                  <th className="px-4 py-2">Date</th><th className="px-4 py-2">Voucher</th><th className="px-4 py-2">Particulars</th>
                  <th className="px-4 py-2 text-right">In</th><th className="px-4 py-2 text-right">Out</th><th className="px-4 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((e, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-600">{e.date}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{e.voucher_number}</td>
                    <td className="px-4 py-2 text-slate-700">{e.particulars}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-600">{e.debit > 0 ? fmtMoney(e.debit) : '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-red-600">{e.credit > 0 ? fmtMoney(e.credit) : '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-bold text-slate-700">{fmtMoney(e.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 font-bold">
                  <td colSpan={3} className="px-4 py-2 text-slate-700">Total</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{fmtMoney(totalIn)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-700">{fmtMoney(totalOut)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-800">{fmtMoney(closing)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
