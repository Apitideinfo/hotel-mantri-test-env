import { useEffect, useState, useMemo } from 'react';
import { Wallet, Loader2 } from 'lucide-react';
import type { HotelSettings, RoomChartEntry } from '@/lib/types';
import { getSettings } from '@/lib/api';
import { getRoomChartForDateRange } from '@/lib/api-reservations';
import { toNum, fmtMoney, fmtInt } from '@/lib/calc';
import { BarChart, DonutChart, LineChart } from '@/components/charts';
import { ScreenHeader, SectionCard, Banner } from '@/components/finance-ui';
import { DateRangeFilter, LoadingSpinner, EmptyState } from './BookingSourceAnalytics';

const COLORS = ['#16a34a', '#2563eb', '#7c3aed', '#1f3559', '#ea580c', '#dc2626', '#64748b'];

export const PaymentAnalytics = ({ onBack }: { onBack: () => void }) => {
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

  const totals = useMemo(() => {
    let cash = 0, upi = 0, card = 0, bank = 0, advance = 0, pending = 0;
    for (const e of entries) {
      if (e.is_complimentary) continue;
      cash += toNum(e.pay_cash);
      upi += toNum(e.pay_upi);
      card += toNum(e.pay_card);
      bank += toNum(e.pay_bank);
      advance += toNum(e.pay_advance);
      pending += toNum(e.pay_balance);
    }
    return { cash, upi, card, bank, advance, pending, total: cash + upi + card + bank };
  }, [entries]);

  const donutData = [
    { label: 'Cash', value: Math.round(totals.cash), color: COLORS[0] },
    { label: 'UPI', value: Math.round(totals.upi), color: COLORS[1] },
    { label: 'Card', value: Math.round(totals.card), color: COLORS[2] },
    { label: 'Bank', value: Math.round(totals.bank), color: COLORS[3] },
  ].filter((s) => s.value > 0);

  const trendByDay = useMemo(() => {
    const byDate = new Map<string, { cash: number; bank: number; upi: number }>();
    for (const e of entries) {
      if (e.is_complimentary) continue;
      const d = e.report_date;
      const day = byDate.get(d) ?? { cash: 0, bank: 0, upi: 0 };
      day.cash += toNum(e.pay_cash);
      day.bank += toNum(e.pay_bank);
      day.upi += toNum(e.pay_upi);
      byDate.set(d, day);
    }
    const sorted = Array.from(byDate.entries()).sort((a, b) => a[0] < b[0] ? -1 : 1);
    return [
      { name: 'Cash', color: COLORS[0], points: sorted.map(([d, v]) => ({ label: d.slice(5), value: Math.round(v.cash) })) },
      { name: 'Bank/UPI', color: COLORS[1], points: sorted.map(([d, v]) => ({ label: d.slice(5), value: Math.round(v.bank + v.upi) })) },
    ];
  }, [entries]);

  const splitPayments = entries.filter((e) => !e.is_complimentary && (
    (toNum(e.pay_cash) > 0 && toNum(e.pay_upi) > 0) ||
    (toNum(e.pay_cash) > 0 && toNum(e.pay_card) > 0) ||
    (toNum(e.pay_upi) > 0 && toNum(e.pay_card) > 0) ||
    (toNum(e.pay_bank) > 0 && toNum(e.pay_cash) > 0)
  ));

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <ScreenHeader title="Payment Analytics" subtitle="Cash · UPI · Card · Bank · Pending · Split" onBack={onBack} icon={<Wallet className="w-5 h-5 text-sky-300" />} />
      <main className="px-4 py-4 space-y-4 max-w-4xl mx-auto">
        {error && <Banner kind="error">{error}</Banner>}
        <DateRangeFilter fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
        {loading ? <LoadingSpinner /> : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <PayCard label="Cash" value={totals.cash} color="text-emerald-600" bg="bg-emerald-50" />
              <PayCard label="UPI" value={totals.upi} color="text-blue-600" bg="bg-blue-50" />
              <PayCard label="Card" value={totals.card} color="text-purple-600" bg="bg-purple-50" />
              <PayCard label="Bank" value={totals.bank} color="text-navy-600" bg="bg-slate-100" />
              <PayCard label="Advance" value={totals.advance} color="text-teal-600" bg="bg-teal-50" />
              <PayCard label="Pending" value={totals.pending} color="text-orange-600" bg="bg-orange-50" />
              <PayCard label="Total Collected" value={totals.total} color="text-brand-600" bg="bg-brand-50" />
              <PayCard label="Split Payments" value={splitPayments.length} color="text-slate-600" bg="bg-slate-100" isCount />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard title="Payment Mix" icon={<Wallet className="w-4 h-4 text-brand-600" />}>
                {donutData.length > 0 ? <DonutChart slices={donutData} size={170} centerValue={`₹${fmtInt(totals.total)}`} centerLabel="Total" /> : <EmptyState />}
              </SectionCard>
              <SectionCard title="Collection Trend" icon={<Wallet className="w-4 h-4 text-emerald-600" />}>
                {trendByDay[0].points.length > 0 ? <LineChart series={trendByDay} yFormat={(v) => `₹${fmtInt(v)}`} height={200} /> : <EmptyState />}
              </SectionCard>
            </div>

            <SectionCard title="Split Payment Details" icon={<Wallet className="w-4 h-4 text-blue-600" />}>
              {splitPayments.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-200">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Guest</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">Cash</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">UPI</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">Card</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">Bank</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {splitPayments.map((e) => (
                        <tr key={e.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-slate-600">{e.report_date}</td>
                          <td className="px-3 py-2 text-slate-800 font-medium">{e.guest_name}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-600">₹{fmtMoney(toNum(e.pay_cash))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-blue-600">₹{fmtMoney(toNum(e.pay_upi))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-purple-600">₹{fmtMoney(toNum(e.pay_card))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">₹{fmtMoney(toNum(e.pay_bank))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState />}
            </SectionCard>
          </>
        )}
      </main>
    </div>
  );
};

const PayCard = ({ label, value, color, bg, isCount }: { label: string; value: number; color: string; bg: string; isCount?: boolean }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${bg} mb-2`}>
      <Wallet className={`w-3.5 h-3.5 ${color}`} />
    </div>
    <p className="text-[10px] font-bold text-slate-400 uppercase">{label}</p>
    <p className={`text-lg font-bold tabular-nums ${color}`}>{isCount ? fmtInt(value) : `₹${fmtMoney(value)}`}</p>
  </div>
);
