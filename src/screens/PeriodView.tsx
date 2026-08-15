import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { HotelSettings, DerivedReport } from '@/lib/types';
import { getSettings, getDerivedReportsForMonth, getDerivedReportsForYear } from '@/lib/api';
import { aggregateDerived, daysInMonth, ytdDays, fmtMoney, fmtInt, toNum } from '@/lib/calc';
import { StatRow, SectionCard } from '@/components/FormFields';

interface PeriodViewProps {
  mode: 'mtd' | 'ytd';
  date: string;
  onBack: () => void;
}

export const PeriodView = ({ mode, date, onBack }: PeriodViewProps) => {
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [reports, setReports] = useState<DerivedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const d = new Date(date + 'T00:00:00');
  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await getSettings();
        if (!mounted) return;
        setSettings(s);
        const rs = mode === 'mtd'
          ? await getDerivedReportsForMonth(year, month, s.total_rooms, s.opening_cash_balance)
          : await getDerivedReportsForYear(year, s.total_rooms, s.opening_cash_balance);
        if (!mounted) return;
        setReports(rs);
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [date, mode, year, month]);

  const totalRooms = settings?.total_rooms ?? 22;
  const periodDays = mode === 'mtd' ? daysInMonth(year, month) : ytdDays(d);
  const agg = aggregateDerived(reports, totalRooms, periodDays);

  const title = mode === 'mtd'
    ? `MTD — ${d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`
    : `YTD — ${year}`;

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      <header className="sticky top-0 z-10 bg-sky-800 text-white px-4 py-3 flex items-center gap-3 shadow">
        <button onClick={onBack} className="p-1.5 -ml-1.5 hover:bg-sky-700 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-semibold leading-tight">{mode === 'mtd' ? 'Month to Date' : 'Year to Date'}</h1>
          <p className="text-sky-200 text-xs">{title}</p>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 w-full">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">Loading…</div>
        ) : (
          <>
            <div className="bg-gradient-to-br from-sky-700 to-sky-900 text-white rounded-xl p-4">
              <p className="text-sky-200 text-xs uppercase tracking-wide">{mode === 'mtd' ? 'Month to Date' : 'Year to Date'}</p>
              <p className="text-2xl font-bold mt-1">₹{fmtMoney(agg.totalRevenue)}</p>
              <p className="text-sky-200 text-xs mt-1">Total Revenue</p>
              <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-sky-700">
                <div><p className="text-xs text-sky-200">ARR</p><p className="font-bold tabular-nums">₹{fmtMoney(agg.arr)}</p></div>
                <div><p className="text-xs text-sky-200">OCC %</p><p className="font-bold tabular-nums">{agg.occ.toFixed(0)}%</p></div>
                <div><p className="text-xs text-sky-200">Room Nights</p><p className="font-bold tabular-nums">{fmtInt(agg.roomsSold)}</p></div>
              </div>
            </div>

            <SectionCard title="Period Summary" accent="bg-slate-50">
              <StatRow label="Total Number of Room" value={fmtInt(agg.totalRooms)} />
              <StatRow label="Rooms Sold" value={fmtInt(agg.roomsSold)} />
              <StatRow label="Day Use Room" value={fmtInt(agg.dayUseRoom)} />
              <StatRow label="Complimentary" value={fmtInt(agg.complimentary)} />
              <StatRow label="ARR" value={`₹${fmtMoney(agg.arr)}`} strong />
              <StatRow label="OCC %" value={`${agg.occ.toFixed(0)}%`} strong />
              <StatRow label="Room Revenue" value={`₹${fmtMoney(agg.roomRevenue)}`} />
              <StatRow label="F&B Revenue (Kitchen)" value={`₹${fmtMoney(agg.fbRevenue)}`} />
              <StatRow label="Misc Revenue (Other)" value={`₹${fmtMoney(agg.miscRevenue)}`} />
              {(agg.otherRevenueByCategory ?? []).map((c) => (
                <StatRow key={c.category} label={c.category} value={`₹${fmtMoney(c.amount)}`} />
              ))}
              <StatRow label="Total Revenue" value={`₹${fmtMoney(agg.totalRevenue)}`} strong />
            </SectionCard>

            <SectionCard title="Source Breakdown" accent="bg-emerald-50">
              <StatRow label="OTA Revenue" value={`₹${fmtMoney(agg.ota)}`} />
              <StatRow label="Direct/Walking Revenue" value={`₹${fmtMoney(agg.direct)}`} />
              <StatRow label="Corporate/Agent Revenue" value={`₹${fmtMoney(agg.corp)}`} />
              <StatRow label="Phonebook Revenue" value={`₹${fmtMoney(agg.phone)}`} />
            </SectionCard>

            <SectionCard title="Expense Breakdown" accent="bg-rose-50">
              <StatRow label="Housekeeping Supply" value={`₹${fmtMoney(reports.reduce((s, r) => s + toNum(r.housekeeping_supply), 0))}`} />
              <StatRow label="Maintenance Bill" value={`₹${fmtMoney(reports.reduce((s, r) => s + toNum(r.maintenance_bill), 0))}`} />
              <StatRow label="Other Expense" value={`₹${fmtMoney(reports.reduce((s, r) => s + toNum(r.other_expense), 0))}`} />
              {(agg.financeExpenseByCategory ?? []).map((c) => (
                <StatRow key={c.category} label={c.category} value={`₹${fmtMoney(c.amount)}`} />
              ))}
              <StatRow label="Total Expenses" value={`₹${fmtMoney(agg.totalExpenses)}`} strong />
            </SectionCard>

            <SectionCard title="GST Summary" accent="bg-indigo-50">
              <StatRow label="Taxable Revenue" value={`₹${fmtMoney(agg.taxableRevenue)}`} />
              <StatRow label="GST Collected" value={`₹${fmtMoney(agg.gstCollected)}`} />
              <StatRow label="Net Revenue (excl. GST)" value={`₹${fmtMoney(agg.netRevenue)}`} strong />
            </SectionCard>

            <SectionCard title="Revenue Breakup" accent="bg-emerald-50">
              <StatRow label="Room Revenue" value={`₹${fmtMoney(agg.roomRevenue)}`} />
              <StatRow label="F&B Revenue" value={`₹${fmtMoney(agg.fbRevenue)}`} />
              <StatRow label="Misc Revenue" value={`₹${fmtMoney(agg.miscRevenue)}`} />
            </SectionCard>

            <SectionCard title="Key Metrics" accent="bg-sky-50">
              <StatRow label="ARR (Avg Room Rate)" value={`₹${fmtMoney(agg.arr)}`} />
              <StatRow label="Occupancy %" value={`${fmtInt(agg.occ)}%`} />
              <StatRow label="RevPAR" value={`₹${fmtMoney(agg.revpar)}`} />
            </SectionCard>

            {(agg.payCash > 0 || agg.payUpi > 0 || agg.payCard > 0 || agg.payBank > 0 || agg.payAdvance > 0 || agg.payBalance > 0) && (
              <SectionCard title="Split Payment Summary" accent="bg-teal-50">
                <StatRow label="Cash" value={`₹${fmtMoney(agg.payCash)}`} />
                <StatRow label="UPI" value={`₹${fmtMoney(agg.payUpi)}`} />
                <StatRow label="Card" value={`₹${fmtMoney(agg.payCard)}`} />
                <StatRow label="Bank Transfer" value={`₹${fmtMoney(agg.payBank)}`} />
                <StatRow label="Advance" value={`₹${fmtMoney(agg.payAdvance)}`} />
                <StatRow label="Balance" value={`₹${fmtMoney(agg.payBalance)}`} />
              </SectionCard>
            )}

            <p className="text-xs text-slate-400 text-center px-4">
              Based on {reports.length} daily report{reports.length !== 1 ? 's' : ''} entered this {mode === 'mtd' ? 'month' : 'year'}.
            </p>
          </>
        )}
      </main>
    </div>
  );
};
