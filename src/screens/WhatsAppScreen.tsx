import { useEffect, useState } from 'react';
import { ArrowLeft, Copy, Check, MessageCircle } from 'lucide-react';
import type { HotelSettings, DerivedReport } from '@/lib/types';
import { getSettings, getDerivedReport, getDerivedReportsForMonth } from '@/lib/api';
import { generateWhatsAppReport } from '@/lib/whatsapp';
import { aggregateDerived, derivedToDaily } from '@/lib/calc';
import { useClipboard } from '@/lib/useClipboard';

interface WhatsAppScreenProps {
  date: string;
  onBack: () => void;
}

export const WhatsAppScreen = ({ date, onBack }: WhatsAppScreenProps) => {
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [report, setReport] = useState<DerivedReport | null>(null);
  const [text, setText] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, copy] = useClipboard();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await getSettings();
        if (!mounted) return;
        setSettings(s);
        const r = await getDerivedReport(date, s.total_rooms, s.opening_cash_balance);
        if (!mounted) return;
        setReport(r);
        const d = new Date(date + 'T00:00:00');
        const mtdReports = await getDerivedReportsForMonth(d.getFullYear(), d.getMonth() + 1, s.total_rooms, s.opening_cash_balance);
        const mtdAgg = aggregateDerived(mtdReports, s.total_rooms, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
        if (mounted) {
          const daily = derivedToDaily(r);
          setText(generateWhatsAppReport(daily, s.total_rooms, { revenue: mtdAgg.totalRevenue, occupancy: mtdAgg.roomsSold }, s.hotel_name));
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [date]);

  const [y, m, d] = date.split('-');
  const displayDate = `${d}/${m}/${y}`;

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <header className="sticky top-0 z-10 bg-emerald-700 text-white px-4 py-3 flex items-center gap-3 shadow">
        <button onClick={onBack} className="p-1.5 -ml-1.5 hover:bg-emerald-600 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-semibold leading-tight">WhatsApp Report</h1>
          <p className="text-emerald-200 text-xs">{displayDate}</p>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 w-full">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
        {loading ? (
          <div className="bg-white rounded-xl border p-6 text-center text-slate-400 text-sm">Loading…</div>
        ) : !report || (report.rooms_occupied === 0 && report.room_sale_amount === 0 && report.kitchen === 0 && report.other_income === 0) ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
            <p className="text-slate-500 text-sm">No room chart data for {displayDate}.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <MessageCircle className="w-4 h-4 text-amber-600" />
              Tap copy, then open WhatsApp and paste. The bold (*) marks stay in the copied text.
            </div>
            <pre className="whitespace-pre-wrap break-words bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-800 font-mono leading-relaxed shadow-sm">
{text}
            </pre>
          </>
        )}
      </main>

      {report && (report.rooms_occupied > 0 || report.room_sale_amount > 0 || report.kitchen > 0 || report.other_income > 0) && (
        <div className="fixed bottom-0 inset-x-0 w-full bg-white border-t border-slate-200 p-3">
          <button
            onClick={() => copy(text)}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 rounded-xl shadow-sm transition"
          >
            {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            {copied ? 'Copied! Paste in WhatsApp' : 'Copy WhatsApp Report'}
          </button>
        </div>
      )}
    </div>
  );
};
