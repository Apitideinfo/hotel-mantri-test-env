import { useEffect, useState } from 'react';
import { ArrowLeft, MessageCircle, Pencil, BedDouble, Info } from 'lucide-react';
import type { HotelSettings, DerivedReport } from '@/lib/types';
import { getSettings, getDerivedReport, getDerivedReportsForMonth } from '@/lib/api';
import { calcArr, calcOcc, calcTotalRevenue, calcTotalExpenses, calcClosingRooms, aggregateDerived, buildCashFlow, fmtMoney, fmtInt, toNum } from '@/lib/calc';
import { StatRow, SectionCard } from '@/components/FormFields';

interface ReportViewProps {
  date: string;
  onBack: () => void;
  onNavigate: (screen: string, payload?: unknown) => void;
}

export const ReportView = ({ date, onBack, onNavigate }: ReportViewProps) => {
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [report, setReport] = useState<DerivedReport | null>(null);
  const [mtd, setMtd] = useState<{ revenue: number; occupancy: number }>({ revenue: 0, occupancy: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        if (mounted) setMtd({ revenue: mtdAgg.totalRevenue, occupancy: mtdAgg.roomsSold });
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
  const totalRooms = settings?.total_rooms ?? 22;

  if (loading) return <div className="p-6 text-center text-slate-400 text-sm">Loading report…</div>;

  const hasData = report && (report.rooms_occupied > 0 || report.room_sale_amount > 0 || report.kitchen > 0 || report.other_income > 0);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-10 bg-sky-800 text-white px-4 py-3 flex items-center gap-3 shadow">
        <button onClick={onBack} className="p-1.5 -ml-1.5 hover:bg-sky-700 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-semibold leading-tight">Daily Report</h1>
          <p className="text-sky-200 text-xs">{displayDate}</p>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 w-full">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
        {!hasData ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
            <p className="text-slate-500 text-sm mb-4">No room chart data for {displayDate}.</p>
            <button onClick={() => onNavigate('roomchart', { date })}
              className="bg-sky-700 hover:bg-sky-800 text-white font-semibold px-5 py-2.5 rounded-lg inline-flex items-center gap-2">
              <BedDouble className="w-4 h-4" /> Open Room Chart
            </button>
          </div>
        ) : (
          <>
            <div className="bg-sky-50 border border-sky-200 rounded-lg p-2.5 flex items-start gap-2">
              <Info className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
              <p className="text-xs text-sky-700">All figures below are auto-calculated from the Room Chart and Other Entries.</p>
            </div>

            <SectionCard title="Room Occupancy & Revenue Summary" accent="bg-sky-50">
              <StatRow label="Total Rooms" value={fmtInt(totalRooms)} />
              <StatRow label="Rooms Occupied" value={fmtInt(report!.rooms_occupied)} />
              <StatRow label="Complimentary Room" value={fmtInt(report!.complimentary_room)} />
              <StatRow label="ARR (Average Room Rate)" value={`₹${fmtMoney(calcArr(report!.room_sale_amount, report!.rooms_occupied - report!.complimentary_room))}`} />
              <StatRow label="OCC %" value={`${calcOcc(report!.rooms_occupied, totalRooms).toFixed(0)}%`} />
              <StatRow label="RevPAR" value={`₹${fmtMoney(totalRooms > 0 ? report!.room_sale_amount / totalRooms : 0)}`} />
              <StatRow label="Room Sale Amount" value={`₹${fmtMoney(report!.room_sale_amount)}`} strong />
            </SectionCard>

            <SectionCard title="Room Revenue Details" accent="bg-emerald-50">
              <StatRow label="OTA" value={`₹${fmtMoney(report!.ota)}`} />
              <StatRow label="Direct/Walking" value={`₹${fmtMoney(report!.direct_walking)}`} />
              <StatRow label="Corporate/Agent" value={`₹${fmtMoney(report!.corporate_agent)}`} />
              <StatRow label="Phonebook" value={`₹${fmtMoney(report!.phonebook)}`} />
            </SectionCard>

            <SectionCard title="Other Revenue" accent="bg-amber-50">
              <StatRow label="Kitchen" value={`₹${fmtMoney(report!.kitchen)}`} />
              <StatRow label="Other" value={`₹${fmtMoney(report!.other_income)}`} />
              {(report!.other_revenue_by_category ?? []).map((c) => (
                <StatRow key={c.category} label={c.category} value={`₹${fmtMoney(c.amount)}`} />
              ))}
              <StatRow label="Total Revenue" value={`₹${fmtMoney(calcTotalRevenue(report!))}`} strong />
            </SectionCard>

            <SectionCard title="MTD Summary" accent="bg-slate-100">
              <StatRow label="MTD Revenue" value={`₹${fmtMoney(mtd.revenue)}`} strong />
              <StatRow label="MTD Occupancy" value={`${fmtInt(mtd.occupancy)} Rooms`} />
            </SectionCard>

            <SectionCard title="Expenses Summary" accent="bg-rose-50">
              <StatRow label="Housekeeping Supply" value={`₹${fmtMoney(report!.housekeeping_supply)}`} />
              <StatRow label="Other" value={`₹${fmtMoney(report!.other_expense)}`} />
              <StatRow label="Maintenance Bill" value={`₹${fmtMoney(report!.maintenance_bill)}`} />
              {(report!.finance_expense_by_category ?? []).map((c) => (
                <StatRow key={c.category} label={c.category} value={`₹${fmtMoney(c.amount)}`} />
              ))}
              <StatRow label="Total Expenses" value={`₹${fmtMoney(calcTotalExpenses(report!))}`} strong />
            </SectionCard>

            <SectionCard title="Cash Summary" accent="bg-slate-100">
              {(() => {
                const cashExpenses = toNum(report!.housekeeping_supply) + toNum(report!.other_expense) + toNum(report!.maintenance_bill) + toNum(report!.finance_expenses);
                const cashCollection = toNum(report!.pay_cash);
                const openingCash = toNum(report!.cash_closing) - cashCollection + cashExpenses + toNum(report!.salary_advance) + toNum(report!.cash_handover_md) + toNum(report!.bank_cash_deposit);
                return <>
                  <StatRow label="Opening Cash" value={`₹${fmtMoney(openingCash)}`} />
                  <StatRow label="+ Cash Collection" value={`₹${fmtMoney(cashCollection)}`} />
                  <StatRow label="- Cash Expenses" value={`₹${fmtMoney(cashExpenses)}`} />
                  <StatRow label="- Salary Advance" value={`₹${fmtMoney(report!.salary_advance)}`} />
                  <StatRow label="- Cash Handover MD Sir" value={`₹${fmtMoney(report!.cash_handover_md)}`} />
                  <StatRow label="- Bank Cash Deposit" value={`₹${fmtMoney(report!.bank_cash_deposit)}`} />
                  <StatRow label="= Cash Closing" value={`₹${fmtMoney(toNum(report!.cash_closing))}`} strong />
                  <StatRow label="Tomorrow Opening Cash" value={`₹${fmtMoney(toNum(report!.cash_closing))}`} strong />
                  <StatRow label="Bank Collection" value={`₹${fmtMoney(report!.bank)}`} />
                </>;
              })()}
            </SectionCard>

            <SectionCard title="GST Summary" accent="bg-indigo-50">
              <StatRow label="Taxable Revenue" value={`₹${fmtMoney(toNum(report!.taxable_revenue))}`} />
              <StatRow label="GST Collected" value={`₹${fmtMoney(toNum(report!.gst_collected))}`} />
              <StatRow label="CGST" value={`₹${fmtMoney(toNum(report!.cgst))}`} />
              <StatRow label="SGST" value={`₹${fmtMoney(toNum(report!.sgst))}`} />
              <StatRow label="IGST" value={`₹${fmtMoney(toNum(report!.igst))}`} />
              <StatRow label="Invoice Total (incl. GST)" value={`₹${fmtMoney(toNum((report! as DerivedReport).invoice_total))}`} />
              <StatRow label="Net Revenue (excl. GST)" value={`₹${fmtMoney(toNum(report!.net_revenue))}`} strong />
            </SectionCard>

            {/* Revenue breakup by category */}
            <SectionCard title="Revenue Breakup" accent="bg-emerald-50">
              <StatRow label="Room Revenue" value={`₹${fmtMoney(toNum((report! as DerivedReport).room_revenue))}`} />
              <StatRow label="F&B Revenue" value={`₹${fmtMoney(toNum((report! as DerivedReport).fb_revenue))}`} />
              <StatRow label="Misc Revenue" value={`₹${fmtMoney(toNum((report! as DerivedReport).misc_revenue))}`} />
            </SectionCard>

            {(toNum(report!.pay_cash) > 0 || toNum(report!.pay_upi) > 0 || toNum(report!.pay_card) > 0 || toNum(report!.pay_bank) > 0 || toNum(report!.pay_advance) > 0 || toNum(report!.pay_balance) > 0) && (
              <SectionCard title="Split Payment Summary" accent="bg-teal-50">
                <StatRow label="Cash" value={`₹${fmtMoney(toNum(report!.pay_cash))}`} />
                <StatRow label="UPI" value={`₹${fmtMoney(toNum(report!.pay_upi))}`} />
                <StatRow label="Card" value={`₹${fmtMoney(toNum(report!.pay_card))}`} />
                <StatRow label="Bank Transfer" value={`₹${fmtMoney(toNum(report!.pay_bank))}`} />
                <StatRow label="Advance" value={`₹${fmtMoney(toNum(report!.pay_advance))}`} />
                <StatRow label="Balance" value={`₹${fmtMoney(toNum(report!.pay_balance))}`} />
              </SectionCard>
            )}

            <SectionCard title="Tomorrow Status" accent="bg-violet-50">
              <StatRow label="Departure" value={fmtInt(report!.departure)} />
              <StatRow label="Expected Arrival" value={fmtInt(report!.expected_arrival)} />
              <StatRow label="Closing Rooms" value={fmtInt(calcClosingRooms(report!.rooms_occupied, totalRooms))} />
              <StatRow label="Expected ARR" value={`₹${fmtMoney(report!.expected_arr)}`} />
            </SectionCard>
          </>
        )}
      </main>

      {hasData && (
        <div className="fixed bottom-0 inset-x-0 w-full bg-white border-t border-slate-200 p-3 flex gap-2.5">
          <button onClick={() => onNavigate('roomchart', { date })}
            className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 font-semibold py-3 rounded-xl">
            <Pencil className="w-4 h-4" /> Edit Room Chart
          </button>
          <button onClick={() => onNavigate('whatsapp', { date })}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl">
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </button>
        </div>
      )}
    </div>
  );
};
