import { useEffect, useState, useMemo } from 'react';
import { FileText, Loader2, Download } from 'lucide-react';
import type { HotelSettings, RoomChartEntry } from '@/lib/types';
import { getSettings } from '@/lib/api';
import { getRoomChartForDateRange } from '@/lib/api-reservations';
import { toNum, fmtMoney, fmtInt, splitGst } from '@/lib/calc';
import { BarChart, DonutChart } from '@/components/charts';
import { ScreenHeader, SectionCard, Banner } from '@/components/finance-ui';
import { DateRangeFilter, LoadingSpinner, EmptyState } from './BookingSourceAnalytics';

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#dc2626'];

export const GstAnalytics = ({ onBack }: { onBack: () => void }) => {
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

  const stats = useMemo(() => {
    let totalGst = 0, totalTaxable = 0;
    let noScope = 0, inclusive = 0, exclusive = 0;
    const slabMap = new Map<string, number>();
    for (const e of entries) {
      if (e.is_complimentary) continue;
      const gst = toNum(e.gst_amount);
      const taxable = toNum(e.taxable_amount);
      totalGst += gst;
      totalTaxable += taxable;
      if (e.gst_type === 'No Scope') noScope += gst;
      else if (e.gst_type === 'Inclusive') inclusive += gst;
      else if (e.gst_type === 'Exclusive') exclusive += gst;
      const slab = String(e.gst_slab ?? '0');
      slabMap.set(slab, (slabMap.get(slab) ?? 0) + gst);
    }
    const { cgst, sgst, igst } = splitGst(totalGst);
    const slabBars = Array.from(slabMap.entries()).map(([slab, amt]) => ({ label: `${slab}%`, value: Math.round(amt) }));
    const typeDonut = [
      { label: 'No Scope', value: Math.round(noScope), color: COLORS[2] },
      { label: 'Inclusive', value: Math.round(inclusive), color: COLORS[0] },
      { label: 'Exclusive', value: Math.round(exclusive), color: COLORS[1] },
    ].filter((s) => s.value > 0);
    return { totalGst, totalTaxable, cgst, sgst, igst, noScope, inclusive, exclusive, slabBars, typeDonut };
  }, [entries]);

  const handleExport = () => {
    const rows = [
      ['GST Statement', ''],
      ['From', fromDate], ['To', toDate], ['', ''],
      ['Taxable Revenue', fmtMoney(stats.totalTaxable)],
      ['GST Collected', fmtMoney(stats.totalGst)],
      ['CGST', fmtMoney(stats.cgst)],
      ['SGST', fmtMoney(stats.sgst)],
      ['IGST', fmtMoney(stats.igst)], ['', ''],
      ['GST Type Breakup', ''],
      ['No Scope', fmtMoney(stats.noScope)],
      ['Inclusive', fmtMoney(stats.inclusive)],
      ['Exclusive', fmtMoney(stats.exclusive)],
    ];
    const csv = rows.map(([k, v]) => `"${k}","${v}"`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `GST-Statement-${fromDate}-to-${toDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <ScreenHeader title="GST Analytics" subtitle="Collection · CGST/SGST/IGST · Type Breakup" onBack={onBack} icon={<FileText className="w-5 h-5 text-sky-300" />} />
      <main className="px-4 py-4 space-y-4 max-w-4xl mx-auto">
        {error && <Banner kind="error">{error}</Banner>}
        <div className="flex items-center gap-3">
          <div className="flex-1"><DateRangeFilter fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} /></div>
        </div>
        {loading ? <LoadingSpinner /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Taxable Revenue" value={`₹${fmtMoney(stats.totalTaxable)}`} color="text-brand-600" bg="bg-brand-50" />
              <StatCard label="GST Collected" value={`₹${fmtMoney(stats.totalGst)}`} color="text-indigo-600" bg="bg-indigo-50" />
              <StatCard label="CGST" value={`₹${fmtMoney(stats.cgst)}`} color="text-emerald-600" bg="bg-emerald-50" />
              <StatCard label="SGST" value={`₹${fmtMoney(stats.sgst)}`} color="text-teal-600" bg="bg-teal-50" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard title="GST Type Breakup" icon={<FileText className="w-4 h-4 text-indigo-600" />}>
                {stats.typeDonut.length > 0 ? <DonutChart slices={stats.typeDonut} size={170} centerValue={`₹${fmtInt(stats.totalGst)}`} centerLabel="Total GST" /> : <EmptyState />}
              </SectionCard>
              <SectionCard title="GST by Slab" icon={<FileText className="w-4 h-4 text-blue-600" />}>
                {stats.slabBars.length > 0 ? <BarChart points={stats.slabBars} color="#4f46e5" yFormat={(v) => `₹${fmtInt(v)}`} height={200} /> : <EmptyState />}
              </SectionCard>
            </div>

            {/* GST Register */}
            <SectionCard title="GST Register" icon={<FileText className="w-4 h-4 text-slate-600" />}>
              {entries.filter((e) => !e.is_complimentary && toNum(e.gst_amount) > 0).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-200">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Guest</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Room</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Type</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">Slab</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">Taxable</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">GST</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {entries.filter((e) => !e.is_complimentary && toNum(e.gst_amount) > 0).map((e) => (
                        <tr key={e.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-slate-600">{e.report_date}</td>
                          <td className="px-3 py-2 text-slate-800 font-medium">{e.guest_name}</td>
                          <td className="px-3 py-2 text-slate-600">{e.room_no}</td>
                          <td className="px-3 py-2 text-slate-600">{e.gst_type}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{e.gst_slab}%</td>
                          <td className="px-3 py-2 text-right tabular-nums">₹{fmtMoney(toNum(e.taxable_amount))}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-indigo-600">₹{fmtMoney(toNum(e.gst_amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState />}
            </SectionCard>

            <button onClick={handleExport} className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-3 rounded-xl border border-slate-200 transition">
              <Download className="w-5 h-5 text-sky-600" /> Download GST Statement (Excel)
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
