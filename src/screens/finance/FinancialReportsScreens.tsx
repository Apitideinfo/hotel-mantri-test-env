import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, PieChart, BarChart3, X } from 'lucide-react';
import { ScreenHeader, fmtMoney } from '@/components/finance-ui';
import { getProfitLoss, getTrialBalance, getBalanceSheet } from '@/lib/api-accounting';
import type { ProfitLoss, TrialBalanceRow, BalanceSheet } from '@/lib/types-accounting';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => today().slice(0, 8) + '01';

export const AccountingProfitLossScreen = ({ onBack }: { onBack: () => void }) => {
  const [data, setData] = useState<ProfitLoss | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(monthStart());
  const [toDate, setToDate] = useState(today());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pl = await getProfitLoss(fromDate, toDate);
      setData(pl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-slate-50">
      <ScreenHeader title="Profit & Loss" subtitle="Revenue vs Expenses" onBack={onBack} icon={<PieChart className="w-5 h-5 text-sky-300" />} />
      <div className="px-4 py-3 flex items-center gap-3">
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
      </div>
      {error && <div className="mx-4 mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}<button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button></div>}
      {loading ? <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…</div> : data ? (
        <div className="px-4 pb-4 space-y-3">
          <PLSection title="REVENUE" items={data.revenue} total={data.totalRevenue} color="text-emerald-700 bg-emerald-50" />
          <PLSection title="DIRECT / OPERATING EXPENSES" items={data.directExpenses.map((e) => ({ account_name: e.account_name, amount: e.amount }))} total={data.totalDirectExpenses} color="text-amber-700 bg-amber-50" />
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between"><span className="text-sm font-bold text-slate-700">Gross Operating Profit</span><span className={`text-lg font-bold tabular-nums ${data.grossOperatingProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtMoney(data.grossOperatingProfit)}</span></div>
          </div>
          <PLSection title="OPERATING EXPENSES" items={data.operatingExpenses.map((e) => ({ account_name: e.account_name, amount: e.amount }))} total={data.totalOperatingExpenses} color="text-red-700 bg-red-50" />
          <div className={`rounded-2xl border shadow-sm p-4 ${data.netOperatingProfit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center justify-between"><span className="text-base font-bold text-slate-800">Net Operating Profit</span><span className={`text-xl font-bold tabular-nums ${data.netOperatingProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtMoney(data.netOperatingProfit)}</span></div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const PLSection = ({ title, items, total, color }: { title: string; items: { account_name: string; amount: number }[]; total: number; color: string }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
    <div className={`px-4 py-2.5 border-b ${color}`}><h3 className="text-sm font-bold uppercase tracking-wide">{title}</h3></div>
    <table className="w-full text-sm">
      <tbody className="divide-y divide-slate-100">
        {items.length === 0 ? <tr><td className="px-4 py-3 text-slate-400 text-center">No entries</td></tr> : items.map((item, i) => (
          <tr key={i} className="hover:bg-slate-50"><td className="px-4 py-2 text-slate-700">{item.account_name}</td><td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-800">{fmtMoney(item.amount)}</td></tr>
        ))}
      </tbody>
      <tfoot><tr className="bg-slate-50 border-t-2 font-bold"><td className="px-4 py-2 text-slate-700">Total</td><td className="px-4 py-2 text-right tabular-nums text-slate-800">{fmtMoney(total)}</td></tr></tfoot>
    </table>
  </div>
);

export const AccountingTrialBalanceScreen = ({ onBack }: { onBack: () => void }) => {
  const [data, setData] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(monthStart());
  const [toDate, setToDate] = useState(today());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tb = await getTrialBalance(fromDate, toDate);
      setData(tb);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const totalDebit = data.reduce((s, r) => s + r.closing_debit, 0);
  const totalCredit = data.reduce((s, r) => s + r.closing_credit, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 1;

  return (
    <div className="min-h-screen bg-slate-50">
      <ScreenHeader title="Trial Balance" subtitle={isBalanced ? 'Balanced' : 'IMBALANCED'} onBack={onBack} icon={<BarChart3 className="w-5 h-5 text-sky-300" />} />
      <div className="px-4 py-3 flex items-center gap-3">
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
        <span className={`ml-auto text-xs font-bold px-3 py-1 rounded-full ${isBalanced ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{isBalanced ? 'Balanced' : 'Imbalanced'}</span>
      </div>
      {error && <div className="mx-4 mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}<button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button></div>}
      {loading ? <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…</div> : (
        <div className="px-4 pb-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b text-left text-[10px] font-bold text-slate-400 uppercase">
                <th className="px-4 py-2">Code</th><th className="px-4 py-2">Account</th><th className="px-4 py-2">Group</th>
                <th className="px-4 py-2 text-right">Opening Dr</th><th className="px-4 py-2 text-right">Opening Cr</th>
                <th className="px-4 py-2 text-right">Period Dr</th><th className="px-4 py-2 text-right">Period Cr</th>
                <th className="px-4 py-2 text-right">Closing Dr</th><th className="px-4 py-2 text-right">Closing Cr</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((r) => (
                  <tr key={r.account_id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono font-bold text-slate-600">{r.account_code}</td>
                    <td className="px-4 py-2 font-semibold text-slate-700">{r.account_name}</td>
                    <td className="px-4 py-2 text-slate-500 text-xs">{r.account_group}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.opening_debit > 0 ? fmtMoney(r.opening_debit) : '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.opening_credit > 0 ? fmtMoney(r.opening_credit) : '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.period_debit > 0 ? fmtMoney(r.period_debit) : '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.period_credit > 0 ? fmtMoney(r.period_credit) : '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-bold text-slate-700">{r.closing_debit > 0 ? fmtMoney(r.closing_debit) : '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-bold text-slate-700">{r.closing_credit > 0 ? fmtMoney(r.closing_credit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-slate-50 border-t-2 font-bold">
                <td colSpan={7} className="px-4 py-2 text-slate-700">Total</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-800">{fmtMoney(totalDebit)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-800">{fmtMoney(totalCredit)}</td>
              </tr></tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export const AccountingBalanceSheetScreen = ({ onBack }: { onBack: () => void }) => {
  const [data, setData] = useState<BalanceSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asOfDate, setAsOfDate] = useState(today());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const bs = await getBalanceSheet(asOfDate);
      setData(bs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [asOfDate]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-slate-50">
      <ScreenHeader title="Balance Sheet" subtitle="Assets = Liabilities + Equity" onBack={onBack} icon={<BarChart3 className="w-5 h-5 text-sky-300" />} />
      <div className="px-4 py-3 flex items-center gap-3">
        <label className="text-xs font-semibold text-slate-500">As of:</label>
        <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
        {data && <span className={`ml-auto text-xs font-bold px-3 py-1 rounded-full ${data.isBalanced ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{data.isBalanced ? 'Balanced' : 'Check entries'}</span>}
      </div>
      {error && <div className="mx-4 mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}<button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button></div>}
      {loading ? <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…</div> : data ? (
        <div className="px-4 pb-4 space-y-3">
          {!data.openingBalancesConfigured && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg p-3">Opening balances not configured. Set up opening balances for a complete balance sheet.</div>
          )}
          <BSSection title="ASSETS" groups={data.assets} total={data.totalAssets} color="text-emerald-700" />
          <BSSection title="LIABILITIES" groups={data.liabilities} total={data.totalLiabilities} color="text-red-700" />
          <BSSection title="EQUITY" groups={data.equity} total={data.totalEquity} color="text-violet-700" />
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between"><span className="text-sm font-bold text-slate-700">Current Period Profit / (Loss)</span><span className={`text-lg font-bold tabular-nums ${data.currentPeriodProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtMoney(data.currentPeriodProfit)}</span></div>
          </div>
          <div className={`rounded-2xl border shadow-sm p-4 ${data.isBalanced ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center justify-between"><span className="text-base font-bold text-slate-800">Total Liabilities + Equity + P/L</span><span className="text-xl font-bold tabular-nums text-slate-800">{fmtMoney(data.totalLiabilities + data.totalEquity + data.currentPeriodProfit)}</span></div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const BSSection = ({ title, groups, total, color }: { title: string; groups: { subgroup: string; rows: { account_code: string; account_name: string; amount: number }[]; subtotal: number }[]; total: number; color: string }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="px-4 py-2.5 bg-slate-50 border-b"><h3 className={`text-sm font-bold uppercase tracking-wide ${color}`}>{title}</h3></div>
    <div className="p-3 space-y-3">
      {groups.length === 0 ? <p className="text-sm text-slate-400 text-center py-2">No entries</p> : groups.map((g) => (
        <div key={g.subgroup}>
          <p className="text-xs font-bold text-slate-500 uppercase mb-1">{g.subgroup}</p>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-50">
              {g.rows.map((r) => (
                <tr key={r.account_code}><td className="py-1.5 text-slate-700">{r.account_name}</td><td className="py-1.5 text-right tabular-nums font-semibold">{fmtMoney(r.amount)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t"><td className="py-1.5 font-bold text-slate-600 text-xs">Subtotal</td><td className="py-1.5 text-right tabular-nums font-bold text-slate-700 text-xs">{fmtMoney(g.subtotal)}</td></tr></tfoot>
          </table>
        </div>
      ))}
    </div>
    <div className="px-4 py-2.5 bg-slate-50 border-t-2"><div className="flex items-center justify-between"><span className="text-sm font-bold text-slate-700">Total {title}</span><span className="text-lg font-bold tabular-nums text-slate-800">{fmtMoney(total)}</span></div></div>
  </div>
);
