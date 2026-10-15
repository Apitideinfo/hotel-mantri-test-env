import { useEffect, useState, useCallback } from 'react';
import {
  Lock, Unlock, AlertTriangle, CheckCircle2, Loader2,
  Calendar, ShieldCheck, History, ChevronDown, ChevronUp, AlertCircle, X,
  ArrowRight, ArrowLeft, TrendingUp, DollarSign, Wallet, BedDouble,
  Utensils, ArrowUpRight, ArrowDownRight, Sparkles, Building2,
  FileCheck2, ShieldAlert, Check, RefreshCw
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import type { HotelSettings, DerivedReport, CashFlowData, DayCloseRecord, DayCloseAuditLog } from '@/lib/types';
import {
  getSettings, getDerivedReport, closeDay, reopenDay,
  getDayCloseRecord, validateDayForClose, getDayCloseAuditLog,
  getCashFlow,
} from '@/lib/api';
import { buildCashFlow, toNum, fmtMoney, fmtInt } from '@/lib/calc';

interface CloseBusinessDayScreenProps {
  onBack: () => void;
}

export const CloseBusinessDayScreen = ({ onBack }: CloseBusinessDayScreenProps) => {
  const { user, role } = useAuth();
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [businessDate, setBusinessDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<DerivedReport | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowData | null>(null);
  const [dayRecord, setDayRecord] = useState<DayCloseRecord | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [auditLog, setAuditLog] = useState<DayCloseAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [showReopen, setShowReopen] = useState(false);
  const [overrideRemarks, setOverrideRemarks] = useState('');
  const [showOverride, setShowOverride] = useState(false);

  const canClose = role === 'hotel_admin' || role === 'super_admin';
  const canReopen = role === 'hotel_admin' || role === 'super_admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getSettings().catch(() => null);
      setSettings(s);
      const totalRooms = s?.total_rooms ?? 20;
      const openingBal = s?.opening_cash_balance ?? 10000;

      const [r, dr, w, cf, log] = await Promise.all([
        getDerivedReport(businessDate, totalRooms, openingBal).catch(() => null),
        getDayCloseRecord(businessDate).catch(() => null),
        validateDayForClose(businessDate).catch(() => []),
        getCashFlow(businessDate).catch(() => null),
        getDayCloseAuditLog(businessDate).catch(() => []),
      ]);
      setReport(r);
      setDayRecord(dr);
      setWarnings(w);
      setCashFlow(cf ?? (r ? buildCashFlowFromReport(r) : null));
      setAuditLog(log);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load day closing data');
    } finally {
      setLoading(false);
    }
  }, [businessDate]);

  useEffect(() => { load(); }, [load]);

  const calculatedCashClosing = report
    ? toNum(report.cash_closing)
    : 0;

  const storedCashClosing = dayRecord?.cash_closing ?? null;
  const cashDiff = storedCashClosing !== null
    ? Math.abs(calculatedCashClosing - storedCashClosing)
    : 0;
  const cashMismatch = storedCashClosing !== null && cashDiff > 0.01;

  const hasBlockingWarnings = warnings.length > 0;
  const isClosed = dayRecord?.status === 'closed';
  const isReopened = dayRecord?.status === 'reopened';

  // Date step helper
  const shiftDate = (days: number) => {
    const d = new Date(businessDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setBusinessDate(d.toISOString().slice(0, 10));
  };

  const handleClose = async () => {
    if (hasBlockingWarnings && !showOverride) {
      setShowOverride(true);
      return;
    }
    setActionLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const performedBy = user?.id ?? 'unknown';
      const result = await closeDay(businessDate, performedBy);
      setSuccess(`Business date ${businessDate} closed and frozen successfully. Report version ${result.report_version}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to close day');
    } finally {
      setActionLoading(false);
      setShowOverride(false);
      setOverrideRemarks('');
    }
  };

  const handleReopen = async () => {
    if (!reopenReason.trim()) {
      setError('A reason is required to reopen a closed day.');
      return;
    }
    setActionLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const performedBy = user?.id ?? 'unknown';
      await reopenDay(businessDate, performedBy, reopenReason);
      setSuccess(`Business date ${businessDate} reopened for revision. Ledger unlocked.`);
      setReopenReason('');
      setShowReopen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reopen day');
    } finally {
      setActionLoading(false);
    }
  };

  // Financial values
  const activeReport = report ?? {
    report_date: businessDate,
    rooms_occupied: 0,
    room_sale_amount: 0,
    kitchen: 0,
    other_income: 0,
    other_revenue_entries: 0,
    gst_collected: 0,
    housekeeping_supply: 0,
    other_expense: 0,
    maintenance_bill: 0,
    finance_expenses: 0,
    salary_advance: 0,
    cash_handover_md: 0,
    bank_cash_deposit: 0,
    pay_cash: 0,
    pay_upi: 0,
    pay_card: 0,
    pay_bank: 0,
    cash_closing: 0,
  };

  const roomRev = toNum(activeReport.room_sale_amount);
  const fnbRev = toNum(activeReport.kitchen);
  const otherRev = toNum(activeReport.other_income) + toNum(activeReport.other_revenue_entries);
  const totalRev = roomRev + fnbRev + otherRev;

  const totalExp = toNum(activeReport.housekeeping_supply) + toNum(activeReport.other_expense) + toNum(activeReport.maintenance_bill) + toNum(activeReport.finance_expenses);
  const totalAdvances = toNum(activeReport.salary_advance);
  const totalHandover = toNum(activeReport.cash_handover_md);
  const totalBankDeposit = toNum(activeReport.bank_cash_deposit);
  const netResult = totalRev - totalExp;

  const payCash = toNum(activeReport.pay_cash);
  const payUpi = toNum(activeReport.pay_upi);
  const payCard = toNum(activeReport.pay_card);
  const payBank = toNum(activeReport.pay_bank);
  const totalPayments = payCash + payUpi + payCard + payBank;

  return (
    <div className="min-h-screen bg-slate-900/[0.02] text-slate-800 pb-28">
      {/* ── Top Header ── */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-slate-200/80 shadow-xs px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 -ml-1.5 hover:bg-slate-100 rounded-xl text-slate-600 transition cursor-pointer"
              title="Go Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-md shrink-0 ${
              isClosed ? 'bg-emerald-600 text-white shadow-emerald-500/20' : 'bg-gradient-to-tr from-brand-600 to-indigo-600 text-white shadow-brand-500/20'
            }`}>
              {isClosed ? <Lock className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  Business Day Closing & Cash Audit
                </h1>
                {isClosed ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> LOCKED & FROZEN
                  </span>
                ) : isReopened ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold">
                    <Unlock className="w-3 h-3 text-amber-600" /> REOPENED REVISION
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                    <Sparkles className="w-3 h-3 text-indigo-600" /> OPEN FOR CLOSE
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Physical Cash Drawer Reconciliation · Ledger Freeze · Balance Carry Forward
              </p>
            </div>
          </div>

          {/* Quick Date Stepper Pill */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button
              onClick={() => shiftDate(-1)}
              className="p-1.5 hover:bg-white rounded-xl text-slate-600 transition cursor-pointer"
              title="Previous Day"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 px-2.5 py-1 focus:outline-none cursor-pointer"
            />
            <button
              onClick={() => shiftDate(1)}
              className="p-1.5 hover:bg-white rounded-xl text-slate-600 transition cursor-pointer"
              title="Next Day"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setBusinessDate(new Date().toISOString().slice(0, 10))}
              className="ml-1 px-2.5 py-1 bg-white hover:bg-slate-50 text-[11px] font-bold text-indigo-600 rounded-xl shadow-2xs border border-slate-200/80 transition cursor-pointer"
            >
              Today
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Error / Success Notifications */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium rounded-2xl p-4 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="p-1 hover:bg-rose-100 rounded-lg text-rose-600 transition cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium rounded-2xl p-4 flex items-center gap-3 shadow-xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-bold">{success}</span>
          </div>
        )}

        {/* ── Status Banner (When Locked / Reopened) ── */}
        {isClosed && (
          <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-3xl p-5 sm:p-6 shadow-xl shadow-emerald-700/10 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white shrink-0 border border-white/20">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black tracking-tight">
                  Business Date is Certified & Locked
                </h3>
                <p className="text-xs text-emerald-100 font-medium mt-0.5">
                  Closed by <strong className="text-white">{dayRecord?.closed_by ?? 'Hotel Admin'}</strong> · Report Version #{dayRecord?.report_version ?? 1}
                  {dayRecord?.closed_at && ` · Certified on ${new Date(dayRecord.closed_at).toLocaleString('en-IN')}`}
                </p>
              </div>
            </div>

            {canReopen && !showReopen && (
              <button
                onClick={() => setShowReopen(true)}
                className="px-4 py-2 bg-white text-emerald-900 hover:bg-emerald-50 font-bold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
              >
                <Unlock className="w-4 h-4 text-emerald-700" />
                <span>Reopen Day for Revision</span>
              </button>
            )}
          </div>
        )}

        {isReopened && (
          <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-3xl p-5 sm:p-6 shadow-xl shadow-amber-600/10 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white shrink-0 border border-white/20">
                <Unlock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black tracking-tight">
                  Reopened for Corrections & Adjustments
                </h3>
                <p className="text-xs text-amber-100 font-medium mt-0.5">
                  Reopened by <strong className="text-white">{dayRecord?.reopened_by ?? 'Admin'}</strong> · Reason: "{dayRecord?.reopen_reason ?? 'Correction'}"
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Executive Top Stat Cards (Hero KPI Strip) ── */}
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-card">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-black uppercase tracking-wider">Occupancy</span>
              <BedDouble className="w-4 h-4 text-indigo-500" />
            </div>
            <p className="text-lg sm:text-xl font-black text-slate-900 mt-2">
              {fmtInt(activeReport.rooms_occupied)} <span className="text-xs font-semibold text-slate-400">Rooms</span>
            </p>
            <p className="text-[11px] font-semibold text-indigo-600 mt-0.5">₹{fmtMoney(roomRev)} Room Rev</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-card">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-black uppercase tracking-wider">F&B / Kitchen</span>
              <Utensils className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-lg sm:text-xl font-black text-slate-900 mt-2">
              ₹{fmtMoney(fnbRev)}
            </p>
            <p className="text-[11px] font-semibold text-amber-600 mt-0.5">Restaurant & Room Service</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-card">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-black uppercase tracking-wider">Gross Revenue</span>
              <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-lg sm:text-xl font-black text-emerald-700 mt-2">
              ₹{fmtMoney(totalRev)}
            </p>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">All income streams</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-card">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-black uppercase tracking-wider">Total Expenses</span>
              <ArrowDownRight className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-lg sm:text-xl font-black text-rose-600 mt-2">
              ₹{fmtMoney(totalExp)}
            </p>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Direct bills & supplies</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-card col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-black uppercase tracking-wider">Net Operating Result</span>
              <TrendingUp className="w-4 h-4 text-indigo-500" />
            </div>
            <p className={`text-lg sm:text-xl font-black mt-2 ${netResult >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
              {netResult >= 0 ? '+' : ''}₹{fmtMoney(netResult)}
            </p>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Net cash surplus today</p>
          </div>
        </section>

        {/* ── 2-Column Master Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ══════════════════════════════════════════════════════════
              LEFT COLUMN: Physical Cash Drawer & Reconciliation (7 cols)
             ══════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-7 space-y-6">
            {/* Cash Audit & Drawer Reconciliation Card */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-card overflow-hidden">
              <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-slate-900 uppercase tracking-wider">
                      Physical Cash Drawer Reconciliation
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">
                      Live tally of cash collection vs physical register
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-600 shadow-2xs">
                  Step 1 of 2
                </span>
              </div>

              <div className="p-6 space-y-3.5 text-xs">
                {/* 1. Opening Cash */}
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[10px]">
                      1
                    </span>
                    <span className="font-bold text-slate-700">Opening Cash in Drawer</span>
                  </div>
                  <span className="font-black text-slate-900 text-sm tabular-nums">
                    ₹{fmtMoney(cashFlow?.opening_cash ?? settings?.opening_cash_balance ?? 10000)}
                  </span>
                </div>

                {/* 2. Cash Collections */}
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[10px]">
                      +
                    </span>
                    <div>
                      <span className="font-bold text-slate-700">Cash Collections Received</span>
                      <span className="text-[10px] text-slate-400 block font-normal">Room tariffs & F&B cash bills</span>
                    </div>
                  </div>
                  <span className="font-black text-emerald-600 text-sm tabular-nums">
                    +₹{fmtMoney(payCash)}
                  </span>
                </div>

                {/* 3. Cash Expenses */}
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center font-bold text-[10px]">
                      -
                    </span>
                    <div>
                      <span className="font-bold text-slate-700">Direct Cash Expenses</span>
                      <span className="text-[10px] text-slate-400 block font-normal">Housekeeping, maintenance & petty cash</span>
                    </div>
                  </div>
                  <span className="font-black text-rose-600 text-sm tabular-nums">
                    -₹{fmtMoney(totalExp)}
                  </span>
                </div>

                {/* 4. Salary Advances */}
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center font-bold text-[10px]">
                      -
                    </span>
                    <span className="font-bold text-slate-700">Staff Salary Advances Paid</span>
                  </div>
                  <span className="font-black text-rose-600 text-sm tabular-nums">
                    -₹{fmtMoney(totalAdvances)}
                  </span>
                </div>

                {/* 5. Handover to MD / Owner */}
                {totalHandover > 0 && (
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center font-bold text-[10px]">
                        -
                      </span>
                      <span className="font-bold text-slate-700">Cash Handover to Owner/MD</span>
                    </div>
                    <span className="font-black text-rose-600 text-sm tabular-nums">
                      -₹{fmtMoney(totalHandover)}
                    </span>
                  </div>
                )}

                {/* 6. Bank Cash Deposit */}
                {totalBankDeposit > 0 && (
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center font-bold text-[10px]">
                        -
                      </span>
                      <span className="font-bold text-slate-700">Bank Cash Deposit (Contra)</span>
                    </div>
                    <span className="font-black text-rose-600 text-sm tabular-nums">
                      -₹{fmtMoney(totalBankDeposit)}
                    </span>
                  </div>
                )}

                {/* ── System Calculated Cash Balance ── */}
                <div className="mt-4 pt-4 border-t-2 border-slate-200 bg-slate-50/70 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider text-slate-900 block">
                      Calculated System Cash Closing
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Exact amount that should be physically in the safe
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-indigo-700 tracking-tight block">
                      ₹{fmtMoney(calculatedCashClosing)}
                    </span>
                  </div>
                </div>

                {/* Stored Cash Audit Verification */}
                {storedCashClosing !== null && (
                  <div className={`p-4 rounded-2xl border ${cashMismatch ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'} space-y-2`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {cashMismatch ? (
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        )}
                        <span className={`font-bold text-xs ${cashMismatch ? 'text-rose-900' : 'text-emerald-900'}`}>
                          {cashMismatch ? 'Cash Discrepancy Detected' : 'Physical Drawer Matched Perfectly'}
                        </span>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${cashMismatch ? 'bg-rose-200 text-rose-900' : 'bg-emerald-200 text-emerald-900'}`}>
                        {cashMismatch ? `Diff: ₹${fmtMoney(cashDiff)}` : 'MATCHED 100%'}
                      </span>
                    </div>
                    {cashMismatch && (
                      <p className="text-[11px] text-rose-700 font-medium">
                        Stored closing is ₹{fmtMoney(storedCashClosing)} while live calculation is ₹{fmtMoney(calculatedCashClosing)}. Day close requires Admin review or override remarks.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Validation Warnings & Pre-requisites Checklist */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-card p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-black text-sm text-slate-900 uppercase tracking-wider">
                    Pre-Closing Audit Verification
                  </h3>
                </div>
                {warnings.length === 0 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                    <Check className="w-3.5 h-3.5" /> All Checks Passed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                    <AlertTriangle className="w-3.5 h-3.5" /> {warnings.length} Warnings Pending
                  </span>
                )}
              </div>

              {warnings.length > 0 && !isClosed ? (
                <div className="space-y-2">
                  {warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs font-semibold text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))}
                  {!showOverride && (
                    <p className="text-xs text-slate-400 font-medium pt-1">
                      Resolve these operational items, or authorize an Admin Override with justification remarks to freeze the accounts.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  Zero pending checkout disputes or unrecorded cashier discrepancies. Day close is authorized and ready for audit lock.
                </p>
              )}

              {/* Admin Override Form */}
              {showOverride && hasBlockingWarnings && !isClosed && canClose && (
                <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-4 space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-2 text-amber-900 font-black text-xs uppercase tracking-wider">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    <span>Admin Override Authorization Required</span>
                  </div>
                  <p className="text-xs text-amber-800 font-medium">
                    Please provide an official justification remark for freezing the day with unresolved warnings:
                  </p>
                  <textarea
                    value={overrideRemarks}
                    onChange={(e) => setOverrideRemarks(e.target.value)}
                    placeholder="e.g., Room 102 late guest departure approved by GM; cash verified in drawer manually."
                    rows={2}
                    className="w-full p-3 border border-amber-300 rounded-xl bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 shadow-2xs resize-none"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════
              RIGHT COLUMN: Payment Modes & Audit Trail (5 cols)
             ══════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-5 space-y-6">
            {/* Multi-Channel Payment Breakup */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-card p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-teal-600" />
                  <h3 className="font-black text-sm text-slate-900 uppercase tracking-wider">
                    Payment Mode Breakdown
                  </h3>
                </div>
                <span className="text-xs font-bold text-slate-400">
                  Total ₹{fmtMoney(totalPayments)}
                </span>
              </div>

              <div className="space-y-3.5 text-xs">
                {/* Cash */}
                <div>
                  <div className="flex items-center justify-between font-bold mb-1">
                    <span className="text-slate-700">Cash Payment</span>
                    <span className="text-slate-900 tabular-nums">₹{fmtMoney(payCash)}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all"
                      style={{ width: `${totalPayments > 0 ? (payCash / totalPayments) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* UPI */}
                <div>
                  <div className="flex items-center justify-between font-bold mb-1">
                    <span className="text-slate-700">UPI / QR Code</span>
                    <span className="text-slate-900 tabular-nums">₹{fmtMoney(payUpi)}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-brand-500 h-2 rounded-full transition-all"
                      style={{ width: `${totalPayments > 0 ? (payUpi / totalPayments) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Card */}
                <div>
                  <div className="flex items-center justify-between font-bold mb-1">
                    <span className="text-slate-700">Debit / Credit Card</span>
                    <span className="text-slate-900 tabular-nums">₹{fmtMoney(payCard)}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-purple-500 h-2 rounded-full transition-all"
                      style={{ width: `${totalPayments > 0 ? (payCard / totalPayments) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Bank */}
                <div>
                  <div className="flex items-center justify-between font-bold mb-1">
                    <span className="text-slate-700">Direct Bank Transfer / NEFT</span>
                    <span className="text-slate-900 tabular-nums">₹{fmtMoney(payBank)}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-sky-500 h-2 rounded-full transition-all"
                      style={{ width: `${totalPayments > 0 ? (payBank / totalPayments) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Tax Collection Badge */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs bg-slate-50/60 p-3 rounded-xl font-bold">
                <span className="text-slate-600">GST Collected (CGST + SGST):</span>
                <span className="text-indigo-700 tabular-nums">₹{fmtMoney(toNum(activeReport.gst_collected))}</span>
              </div>
            </div>

            {/* Audit History Log */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-card overflow-hidden">
              <button
                onClick={() => setShowAudit(!showAudit)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition cursor-pointer text-left"
              >
                <div className="flex items-center gap-2.5">
                  <History className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Audit Trail & History ({auditLog.length})
                  </span>
                </div>
                {showAudit ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {showAudit && (
                <div className="px-6 pb-5 space-y-3 border-t border-slate-100 pt-3 text-xs">
                  {auditLog.length === 0 ? (
                    <p className="text-slate-400 text-xs">No closing audit entries for this date.</p>
                  ) : (
                    auditLog.map((log) => (
                      <div key={log.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                            log.action === 'close' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {log.action === 'close' ? 'CLOSED & FROZEN' : 'REOPENED REVISION'}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-400">
                            {new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="font-bold text-slate-800 text-xs">
                          By: {log.performed_by ?? 'Admin'} · Report v{log.report_version}
                        </p>
                        {log.reason && (
                          <p className="text-slate-600 bg-white p-2 rounded-xl border border-slate-200 text-[11px] font-medium">
                            Remarks: {log.reason}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Reopen Modal Popup */}
            {showReopen && isClosed && canReopen && (
              <div className="bg-amber-50 border border-amber-300 rounded-3xl p-5 space-y-3.5 shadow-xl">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                  <Unlock className="w-4 h-4 text-amber-600" />
                  <span>Reopen Business Date</span>
                </div>
                <p className="text-xs text-amber-800 font-medium">
                  Reopening unlocks the day for ledger corrections. A new report version will be recorded in the audit trail.
                </p>
                <textarea
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="Enter reason for reopening (e.g. Correcting invoice #1024 bill amount)..."
                  rows={2}
                  className="w-full p-3 border border-amber-300 rounded-xl bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-none shadow-2xs"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowReopen(false); setReopenReason(''); }}
                    className="flex-1 px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReopen}
                    disabled={actionLoading || !reopenReason.trim()}
                    className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Confirm Reopen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Sticky Bottom Action Bar ── */}
      {!isClosed && canClose && (
        <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-xl border-t border-slate-200/80 p-4 z-40 shadow-2xl">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                ✓
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">
                  Ready to finalize accounts for {new Date(businessDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
                <p className="text-[11px] text-slate-400">
                  Closing freezes all financial transactions and carries cash forward to tomorrow.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <button
                onClick={handleClose}
                disabled={actionLoading}
                className="w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-sm rounded-2xl shadow-lg shadow-emerald-600/25 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                <span>{showOverride ? 'Authorize Override & Close Day' : 'Close & Freeze Business Day'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function buildCashFlowFromReport(r: DerivedReport): CashFlowData {
  return buildCashFlow(
    toNum(r.cash_closing) - toNum(r.pay_cash) + toNum(r.housekeeping_supply) + toNum(r.other_expense) + toNum(r.maintenance_bill) + toNum(r.finance_expenses) + toNum(r.salary_advance) + toNum(r.cash_handover_md) + toNum(r.bank_cash_deposit),
    r,
  );
}
