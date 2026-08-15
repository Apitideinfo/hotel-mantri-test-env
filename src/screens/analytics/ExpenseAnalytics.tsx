import { useEffect, useState, useMemo } from 'react';
import { Receipt, Loader2, Download } from 'lucide-react';
import type { HotelSettings } from '@/lib/types';
import type { ExpenseEntry } from '@/lib/types-finance';
import { getSettings } from '@/lib/api';
import { getExpenseEntriesForDateRange } from '@/lib/api-finance';
import { toNum, fmtMoney, fmtInt } from '@/lib/calc';
import { BarChart, DonutChart, LineChart } from '@/components/charts';
import { ScreenHeader, SectionCard, Banner } from '@/components/finance-ui';
import { DateRangeFilter, LoadingSpinner, EmptyState } from './BookingSourceAnalytics';

const COLORS = ['#dc2626', '#ea580c', '#f59e0b', '#2563eb', '#16a34a', '#7c3aed', '#0d9488', '#64748b'];

export const ExpenseAnalytics = ({ onBack }: { onBack: () => void }) => {
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [fromDate, setFromDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { (async () => { try { const s = await getSettings(); setSettings(s); } catch { /* */ } })(); }, []);
  useEffect(() => { load(); }, [fromDate, toDate]);

  const load = async () => {
    setLoading(true); setError(null);
    try { const e = await getExpenseEntriesForDateRange(fromDate, toDate); setEntries(e); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  };

  const stats = useMemo(() => {
    let total = 0;
    const catMap = new Map<string, number>();
    const vendorMap = new Map<string, number>();
    const modeMap = new Map<string, number>();
    for (const e of entries) {
      const amt = toNum(e.amount);
      total += amt;
      catMap.set(e.category_name, (catMap.get(e.category_name) ?? 0) + amt);
      const vendor = e.description || e.bill_no || 'Unknown';
      vendorMap.set(vendor, (vendorMap.get(vendor) ?? 0) + amt);
      const mode = e.payment_mode || 'Cash';
      modeMap.set(mode, (modeMap.get(mode) ?? 0) + amt);
    }
    const byCategory = Array.from(catMap.entries()).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
    const byVendor = Array.from(vendorMap.entries()).map(([vendor, amount]) => ({ vendor, amount })).sort((a, b) => b.amount - a.amount);
    const byMode = Array.from(modeMap.entries()).map(([mode, amount]) => ({ mode, amount })).sort((a, b) => b.amount - a.amount);
    return { total, byCategory, byVendor, byMode };
  }, [entries]);

  const trend = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const e of entries) {
      byDate.set(e.entry_date, (byDate.get(e.entry_date) ?? 0) + toNum(e.amount));
    }
    return Array.from(byDate.entries()).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([d, v]) => ({ label: d.slice(5), value: Math.round(v) }));
  }, [entries]);

  const catDonut = stats.byCategory.slice(0, 6).map((c, i) => ({ label: c.category, value: Math.round(c.amount), color: COLORS[i % COLORS.length] }));
  const catBars = stats.byCategory.slice(0, 8).map((c) => ({ label: c.category.slice(0, 10), value: Math.round(c.amount) }));
  const vendorBars = stats.byVendor.slice(0, 8).map((v) => ({ label: v.vendor.slice(0, 10), value: Math.round(v.amount) }));
  const modeDonut = stats.byMode.map((m, i) => ({ label: m.mode, value: Math.round(m.amount), color: COLORS[i % COLORS.length] }));

  const handleExport = () => {
    const rows: [string, string][] = [['Expense Analytics', ''], ['From', fromDate], ['To', toDate], ['', ''], ['Category Breakdown', '']];
    stats.byCategory.forEach((c) => rows.push([c.category, fmtMoney(c.amount)]));
    rows.push(['', ''], ['Vendor Breakdown', '']);
    stats.byVendor.forEach((v) => rows.push([v.vendor, fmtMoney(v.amount)]));
    rows.push(['', ''], ['Payment Mode Breakdown', '']);
    stats.byMode.forEach((m) => rows.push([m.mode, fmtMoney(m.amount)]));
    rows.push(['', ''], ['Total', fmtMoney(stats.total)]);
    const csv = rows.map(([k, v]) => `"${k}","${v}"`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Expense-Analytics-${fromDate}-to-${toDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <ScreenHeader title="Expense Analytics" subtitle="Category · Vendor · Payment Mode · Trend" onBack={onBack} icon={<Receipt className="w-5 h-5 text-sky-300" />} />
      <main className="px-4 py-4 space-y-4 max-w-4xl mx-auto">
        {error && <Banner kind="error">{error}</Banner>}
        <DateRangeFilter fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
        {loading ? <LoadingSpinner /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="Total Expenses" value={`₹${fmtMoney(stats.total)}`} color="text-red-600" bg="bg-red-50" />
              <StatCard label="Categories" value={fmtInt(stats.byCategory.length)} color="text-brand-600" bg="bg-brand-50" />
              <StatCard label="Vendors" value={fmtInt(stats.byVendor.length)} color="text-teal-600" bg="bg-teal-50" />
            </div>

            {stats.byCategory.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
                <Receipt className="w-6 h-6 text-amber-600 shrink-0" />
                <div>
                  <p className="text-xs text-amber-600 font-semibold uppercase">Highest Expense Head</p>
                  <p className="text-sm font-bold text-amber-800">{stats.byCategory[0].category} — ₹{fmtMoney(stats.byCategory[0].amount)}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard title="Expense by Category" icon={<Receipt className="w-4 h-4 text-red-600" />}>
                {catDonut.length > 0 ? <DonutChart slices={catDonut} size={170} centerValue={`₹${fmtInt(stats.total)}`} centerLabel="Total" /> : <EmptyState />}
              </SectionCard>
              <SectionCard title="Payment Mode Breakdown" icon={<Receipt className="w-4 h-4 text-blue-600" />}>
                {modeDonut.length > 0 ? <DonutChart slices={modeDonut} size={170} /> : <EmptyState />}
              </SectionCard>
            </div>

            <SectionCard title="Expense Trend" icon={<Receipt className="w-4 h-4 text-orange-600" />}>
              {trend.length > 0 ? <LineChart series={[{ name: 'Expenses', color: '#dc2626', points: trend }]} yFormat={(v) => `₹${fmtInt(v)}`} height={200} /> : <EmptyState />}
            </SectionCard>

            <SectionCard title="Top Expenses by Category" icon={<Receipt className="w-4 h-4 text-red-600" />}>
              {catBars.length > 0 ? <BarChart points={catBars} color="#dc2626" yFormat={(v) => `₹${fmtInt(v)}`} height={200} horizontal /> : <EmptyState />}
            </SectionCard>

            <SectionCard title="Top Vendors" icon={<Receipt className="w-4 h-4 text-teal-600" />}>
              {vendorBars.length > 0 ? <BarChart points={vendorBars} color="#0d9488" yFormat={(v) => `₹${fmtInt(v)}`} height={200} horizontal /> : <EmptyState />}
            </SectionCard>

            <button onClick={handleExport} className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-3 rounded-xl border border-slate-200 transition">
              <Download className="w-5 h-5 text-sky-600" /> Export Excel
            </button>
          </>
        )}
      </main>
    </div>
  );
};

const StatCard = ({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
    <div className={`w-7 h-7 rounded-lg ${bg} mb-2`} />
    <p className="text-[10px] font-bold text-slate-400 uppercase">{label}</p>
    <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
  </div>
);
