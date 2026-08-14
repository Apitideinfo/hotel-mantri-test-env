import { useEffect, useState } from 'react';
import { TrendingUp, Download, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import type { HotelSettings } from '@/lib/types';
import { getSettings, getDerivedReportsForMonth, getDerivedReportsForYear } from '@/lib/api';
import { aggregateDerived, toNum, fmtMoney } from '@/lib/calc';
import { getExpenseEntriesForMonth, getSalarySettlements } from '@/lib/api-finance';
import { buildMonthlyProfitabilityPDF } from '@/lib/pdf-finance';
import { ScreenHeader, SectionCard, Banner, fmtMoney as fmtMoneyUI, monthKeyFrom, monthLabel } from '@/components/finance-ui';

export const ProfitLossScreen = ({ onBack }: { onBack: () => void }) => {
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [periodType, setPeriodType] = useState<'monthly' | 'ytd'>('monthly');
  const [monthKey, setMonthKey] = useState(monthKeyFrom(new Date().getFullYear(), new Date().getMonth() + 1));
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    roomRevenue: number; fbRevenue: number; otherRevenue: number; totalRevenue: number;
    expensesByCategory: { category: string; amount: number }[]; totalExpenses: number;
    netResult: number; margin: number;
  cashCollection: number; upi: number; card: number; bank: number;
    gstCollected: number; taxableRevenue: number;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await getSettings();
        setSettings(s);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    load();
  }, [periodType, monthKey, year]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!settings) return;
      let reports;
      let expenseEntries;
      let settlements;
      let periodDays;
      if (periodType === 'monthly') {
        const [y, m] = monthKey.split('-').map(Number);
        reports = await getDerivedReportsForMonth(y, m, settings.total_rooms, settings.opening_cash_balance);
        expenseEntries = await getExpenseEntriesForMonth(y, m);
        settlements = await getSalarySettlements(monthKey);
        periodDays = new Date(y, m, 0).getDate();
      } else {
        reports = await getDerivedReportsForYear(year, settings.total_rooms, settings.opening_cash_balance);
        expenseEntries = [];
        for (let m = 1; m <= 12; m++) {
          const entries = await getExpenseEntriesForMonth(year, m);
          expenseEntries.push(...entries);
        }
        settlements = [];
        for (let m = 1; m <= 12; m++) {
          const s = await getSalarySettlements(`${year}-${String(m).padStart(2, '0')}`);
          settlements.push(...s);
        }
        periodDays = 365;
      }
      const agg = aggregateDerived(reports, settings.total_rooms, periodDays);
      const OVERLAP = new Set(['Housekeeping', 'Housekeeping Supply', 'Maintenance', 'Maintenance Bill', 'Salary', 'Salary Advance']);
      const catMap = new Map<string, number>();
      let totalExpenses = 0;
      for (const e of expenseEntries) {
        if (OVERLAP.has(e.category_name)) continue;
        const amt = toNum(e.amount);
        totalExpenses += amt;
        catMap.set(e.category_name, (catMap.get(e.category_name) ?? 0) + amt);
      }
      const salaryTotal = settlements.reduce((s, ss) => s + toNum(ss.monthly_salary), 0);
      totalExpenses += salaryTotal;
      if (salaryTotal > 0) catMap.set('Salary', salaryTotal);
      const dailyExpenses = reports.reduce((s, r) => s + toNum(r.housekeeping_supply) + toNum(r.other_expense) + toNum(r.maintenance_bill), 0);
      totalExpenses += dailyExpenses;
      if (dailyExpenses > 0) catMap.set('Daily Operating Expenses', (catMap.get('Daily Operating Expenses') ?? 0) + dailyExpenses);
      const expensesByCategory = Array.from(catMap.entries())
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount);
      const totalRevenue = agg.roomRevenue + agg.fbRevenue + agg.miscRevenue + agg.otherRevenueEntries;
      const netResult = totalRevenue - totalExpenses;
      const margin = totalRevenue > 0 ? (netResult / totalRevenue) * 100 : 0;
      setData({
        roomRevenue: agg.roomRevenue,
        fbRevenue: agg.fbRevenue,
        otherRevenue: agg.miscRevenue + agg.otherRevenueEntries,
        totalRevenue,
        expensesByCategory,
        totalExpenses,
        netResult,
        margin,
        cashCollection: agg.payCash,
        upi: agg.payUpi,
        card: agg.payCard,
        bank: agg.payBank,
        gstCollected: agg.gstCollected,
        taxableRevenue: agg.taxableRevenue,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (!data || !settings) return;
    const doc = await buildMonthlyProfitabilityPDF({
      settings,
      data: {
        month_key: periodType === 'monthly' ? monthKey : `${year}`,
        room_revenue: data.roomRevenue,
        fb_revenue: data.fbRevenue,
        laundry_revenue: 0,
        other_revenue: data.otherRevenue,
        total_revenue: data.totalRevenue,
        salary_expense: data.expensesByCategory.find((c) => c.category === 'Salary')?.amount ?? 0,
        expense_by_category: data.expensesByCategory,
        total_expenses: data.totalExpenses,
        cash: 0, bank: 0, salary_advance: 0, maintenance_bill: 0,
        cash_handover_md: 0, bank_cash_deposit: 0, cash_closing: 0,
        daily_housekeeping_supply: 0, daily_other_expense: 0,
        net_operating_profit: data.netResult,
        profit_margin: data.margin,
        taxable_revenue: data.taxableRevenue,
        gst_collected: data.gstCollected,
        net_revenue: data.taxableRevenue,
        pay_cash: data.cashCollection,
        pay_upi: data.upi,
        pay_card: data.card,
        pay_bank: data.bank,
        pay_advance: 0,
        pay_balance: 0,
      },
    });
    doc.save(`P&L-${periodType === 'monthly' ? monthKey : year}.pdf`);
  };

  const isProfit = (data?.netResult ?? 0) >= 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <ScreenHeader title="Profit & Loss" subtitle="Revenue vs Expenses vs Net Result" onBack={onBack}
        icon={<TrendingUp className="w-5 h-5 text-sky-300" />} />

      <main className="px-4 py-4 space-y-4 w-full max-w-3xl mx-auto">
        {error && <Banner kind="error">{error}</Banner>}

        {/* Period selector */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-3">
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            <button onClick={() => setPeriodType('monthly')}
              className={`flex-1 py-2 text-sm rounded-lg font-medium transition ${periodType === 'monthly' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}>
              Monthly
            </button>
            <button onClick={() => setPeriodType('ytd')}
              className={`flex-1 py-2 text-sm rounded-lg font-medium transition ${periodType === 'ytd' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}>
              Year to Date
            </button>
          </div>
          {periodType === 'monthly' ? (
            <input type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
          ) : (
            <input type="number" value={year} min={2020} max={2030}
              onChange={(e) => setYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
          </div>
        ) : data ? (
          <>
            {/* Net result hero */}
            <div className={`rounded-2xl p-5 text-white ${isProfit ? 'bg-gradient-to-br from-emerald-600 to-emerald-800' : 'bg-gradient-to-br from-red-600 to-red-800'}`}>
              <p className="text-white/80 text-xs uppercase tracking-wide">
                {periodType === 'monthly' ? monthLabel(monthKey) : `Year ${year}`} — Gross Operating Result
              </p>
              <p className="text-3xl font-bold tabular-nums mt-1">₹{fmtMoney(data.netResult)}</p>
              <div className="flex items-center gap-2 mt-2">
                {isProfit ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                <p className="text-white/80 text-sm">Margin: {data.margin.toFixed(1)}%</p>
              </div>
            </div>

            {/* Revenue */}
            <SectionCard title="Revenue" icon={<ArrowUp className="w-4 h-4 text-emerald-600" />}>
              <Row label="Room Revenue" value={`₹${fmtMoney(data.roomRevenue)}`} />
              <Row label="F&B Revenue" value={`₹${fmtMoney(data.fbRevenue)}`} />
              <Row label="Other Revenue" value={`₹${fmtMoney(data.otherRevenue)}`} />
              <div className="flex justify-between pt-2 mt-1 border-t border-slate-100">
                <span className="text-sm font-bold text-slate-900">Total Revenue</span>
                <span className="text-base font-bold text-emerald-700 tabular-nums">₹{fmtMoney(data.totalRevenue)}</span>
              </div>
            </SectionCard>

            {/* Expenses */}
            <SectionCard title="Operating Expenses" icon={<ArrowDown className="w-4 h-4 text-red-600" />}>
              {data.expensesByCategory.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">No expenses recorded for this period.</p>
              ) : (
                data.expensesByCategory.map((c) => (
                  <Row key={c.category} label={c.category} value={`₹${fmtMoney(c.amount)}`} />
                ))
              )}
              <div className="flex justify-between pt-2 mt-1 border-t border-slate-100">
                <span className="text-sm font-bold text-slate-900">Total Expenses</span>
                <span className="text-base font-bold text-red-700 tabular-nums">₹${fmtMoney(data.totalExpenses)}</span>
              </div>
            </SectionCard>

            {/* GST Summary */}
            {data.gstCollected > 0 && (
              <SectionCard title="GST Summary" icon={<TrendingUp className="w-4 h-4 text-indigo-600" />}>
                <Row label="Taxable Revenue" value={`₹${fmtMoney(data.taxableRevenue)}`} />
                <Row label="GST Collected" value={`₹${fmtMoney(data.gstCollected)}`} />
              </SectionCard>
            )}

            {/* Payment Summary */}
            <SectionCard title="Payment Collection Summary" icon={<TrendingUp className="w-4 h-4 text-teal-600" />}>
              <Row label="Cash" value={`₹${fmtMoney(data.cashCollection)}`} />
              <Row label="UPI" value={`₹${fmtMoney(data.upi)}`} />
              <Row label="Card" value={`₹${fmtMoney(data.card)}`} />
              <Row label="Bank Transfer" value={`₹${fmtMoney(data.bank)}`} />
            </SectionCard>

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
