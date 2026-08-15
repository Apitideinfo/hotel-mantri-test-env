import { useEffect, useState } from 'react';
import { TrendingUp, Download, ArrowDown, ArrowUp, FileText, Wallet } from 'lucide-react';
import type { MonthlyProfitability } from '@/lib/types-finance';
import { calcMonthlyProfitability } from '@/lib/api-finance';
import { getDerivedReportsForMonth } from '@/lib/api';
import { aggregateDerived, toNum } from '@/lib/calc';
import type { HotelSettings } from '@/lib/types';
import { getSettings } from '@/lib/api';
import { buildMonthlyProfitabilityPDF } from '@/lib/pdf-finance';
import {
  ScreenHeader, SectionCard, Banner, fmtMoney, monthKeyFrom, monthLabel,
} from '@/components/finance-ui';

interface MonthlyProfitabilityScreenProps {
  onBack: () => void;
}

const now = new Date();

export const MonthlyProfitabilityScreen = ({ onBack }: MonthlyProfitabilityScreenProps) => {
  const [monthKey, setMonthKey] = useState(monthKeyFrom(now.getFullYear(), now.getMonth() + 1));
  const [data, setData] = useState<MonthlyProfitability | null>(null);
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const s = await getSettings();
      setSettings(s);
      const [y, m] = monthKey.split('-').map(Number);
      const reports = await getDerivedReportsForMonth(y, m, s.total_rooms, s.opening_cash_balance);
      const agg = aggregateDerived(reports, s.total_rooms, new Date(y, m, 0).getDate());

      // Sum all cash movements from daily reports — matches WhatsApp report
      const cashMovements = reports.reduce(
        (acc, r) => ({
          cash: acc.cash + toNum(r.cash),
          bank: acc.bank + toNum(r.bank),
          salary_advance: acc.salary_advance + toNum(r.salary_advance),
          maintenance_bill: acc.maintenance_bill + toNum(r.maintenance_bill),
          cash_handover_md: acc.cash_handover_md + toNum(r.cash_handover_md),
          bank_cash_deposit: acc.bank_cash_deposit + toNum(r.bank_cash_deposit),
          cash_closing: toNum(r.cash_closing),
          housekeeping_supply: acc.housekeeping_supply + toNum(r.housekeeping_supply),
          other_expense: acc.other_expense + toNum(r.other_expense),
        }),
        { cash: 0, bank: 0, salary_advance: 0, maintenance_bill: 0, cash_handover_md: 0, bank_cash_deposit: 0, cash_closing: 0, housekeeping_supply: 0, other_expense: 0 },
      );

      const profit = await calcMonthlyProfitability(y, m, agg.roomRevenue, agg.fbRevenue, agg.miscRevenue, cashMovements,
        { taxableRevenue: agg.taxableRevenue, gstCollected: agg.gstCollected, netRevenue: agg.netRevenue },
        { payCash: agg.payCash, payUpi: agg.payUpi, payCard: agg.payCard, payBank: agg.payBank, payAdvance: agg.payAdvance, payBalance: agg.payBalance });
      setData(profit);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [monthKey]);

  const handleExportPDF = async () => {
    if (!settings || !data) return;
    const doc = await buildMonthlyProfitabilityPDF({ settings, data });
    doc.save(`Monthly-Profitability-${data.month_key}.pdf`);
  };

  const isProfit = (data?.net_operating_profit ?? 0) >= 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <ScreenHeader title="Monthly Profitability" subtitle="Revenue vs Expenses vs Net Profit" onBack={onBack}
        icon={<TrendingUp className="w-5 h-5 text-sky-300" />} />

      <main className="px-4 py-4 space-y-4 w-full">
        {error && <Banner kind="error">{error}</Banner>}

        {/* Month selector */}
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <Field label="Month">
            <input type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </Field>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
        ) : data ? (
          <>
            {/* Net result hero */}
            <div className={`rounded-2xl p-5 text-white ${isProfit ? 'bg-gradient-to-br from-emerald-600 to-emerald-800' : 'bg-gradient-to-br from-red-600 to-red-800'}`}>
              <p className="text-white/80 text-xs uppercase tracking-wide">{monthLabel(data.month_key)} Net Operating Profit</p>
              <p className="text-3xl font-bold tabular-nums mt-1">₹{fmtMoney(data.net_operating_profit)}</p>
              <div className="flex items-center gap-2 mt-2">
                {isProfit ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                <p className="text-white/80 text-sm">Profit Margin: {data.profit_margin.toFixed(1)}%</p>
              </div>
            </div>

            {/* Revenue breakdown */}
            <SectionCard title="Revenue" icon={<ArrowUp className="w-4 h-4 text-emerald-600" />}>
              <Row label="Room Revenue" value={`₹${fmtMoney(data.room_revenue)}`} />
              <Row label="F&B Revenue" value={`₹${fmtMoney(data.fb_revenue)}`} />
              <Row label="Laundry Revenue" value={`₹${fmtMoney(data.laundry_revenue)}`} />
              <Row label="Other Revenue" value={`₹${fmtMoney(data.other_revenue)}`} />
              <div className="flex justify-between pt-2 mt-1 border-t border-slate-100">
                <span className="text-sm font-bold text-slate-900">Total Revenue</span>
                <span className="text-base font-bold text-emerald-700 tabular-nums">₹{fmtMoney(data.total_revenue)}</span>
              </div>
            </SectionCard>

            {/* Expense breakdown */}
            <SectionCard title="Expenses" icon={<ArrowDown className="w-4 h-4 text-red-600" />}>
              <Row label="Salary" value={`₹${fmtMoney(data.salary_expense)}`} />
              {data.expense_by_category.map((c) => (
                <Row key={c.category} label={c.category} value={`₹${fmtMoney(c.amount)}`} />
              ))}
              <div className="flex justify-between pt-2 mt-1 border-t border-slate-100">
                <span className="text-sm font-bold text-slate-900">Total Expenses</span>
                <span className="text-base font-bold text-red-700 tabular-nums">₹{fmtMoney(data.total_expenses)}</span>
              </div>
            </SectionCard>

            {/* GST Summary */}
            {data.gst_collected > 0 && (
              <SectionCard title="GST Summary" icon={<FileText className="w-4 h-4 text-indigo-600" />}>
                <Row label="Taxable Revenue" value={`₹${fmtMoney(data.taxable_revenue)}`} />
                <Row label="GST Collected" value={`₹${fmtMoney(data.gst_collected)}`} />
                <Row label="Net Revenue (excl. GST)" value={`₹${fmtMoney(data.net_revenue)}`} />
              </SectionCard>
            )}

            {/* Split Payment Summary */}
            {(data.pay_cash > 0 || data.pay_upi > 0 || data.pay_card > 0 || data.pay_bank > 0 || data.pay_advance > 0 || data.pay_balance > 0) && (
              <SectionCard title="Split Payment Summary" icon={<Wallet className="w-4 h-4 text-teal-600" />}>
                <Row label="Cash" value={`₹${fmtMoney(data.pay_cash)}`} />
                <Row label="UPI" value={`₹${fmtMoney(data.pay_upi)}`} />
                <Row label="Card" value={`₹${fmtMoney(data.pay_card)}`} />
                <Row label="Bank Transfer" value={`₹${fmtMoney(data.pay_bank)}`} />
                <Row label="Advance" value={`₹${fmtMoney(data.pay_advance)}`} />
                <Row label="Balance" value={`₹${fmtMoney(data.pay_balance)}`} />
              </SectionCard>
            )}

            {/* Export */}
            <button onClick={handleExportPDF}
              className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-3 rounded-xl border border-slate-200 shadow-sm transition">
              <Download className="w-5 h-5 text-sky-600" /> Export PDF
            </button>
          </>
        ) : null}
      </main>
    </div>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between py-1.5 border-b border-slate-100 last:border-0">
    <span className="text-sm text-slate-600">{label}</span>
    <span className="text-sm font-semibold text-slate-800 tabular-nums">{value}</span>
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{label}</span>
    {children}
  </label>
);
