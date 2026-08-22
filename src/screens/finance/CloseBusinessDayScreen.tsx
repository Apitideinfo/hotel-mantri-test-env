import { useEffect, useState, useCallback } from 'react';
import {
  Lock, Unlock, AlertTriangle, CheckCircle2, Loader2,
  Calendar, ShieldCheck, History, ChevronDown, ChevronUp, AlertCircle, X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import type { HotelSettings, DerivedReport, CashFlowData, DayCloseRecord, DayCloseAuditLog } from '@/lib/types';
import {
  getSettings, getDerivedReport, closeDay, reopenDay,
  getDayCloseRecord, validateDayForClose, getDayCloseAuditLog,
  getCashFlow,
} from '@/lib/api';
import { buildCashFlow, toNum, fmtMoney, fmtInt } from '@/lib/calc';
import { ScreenHeader, SectionCard, Banner } from '@/components/finance-ui';

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
      setSuccess(`Business date ${businessDate} closed successfully. Report version ${result.report_version}.`);
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
      setSuccess(`Business date ${businessDate} reopened. Corrections can now be made.`);
      setReopenReason('');
      setShowReopen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reopen day');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <ScreenHeader title="Close Business Day" subtitle="Finalize · Freeze · Carry Forward" onBack={onBack}
          icon={<Lock className="w-5 h-5 text-brand-600" />} />
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm font-semibold text-slate-600">Loading business day parameters…</p>
        </div>
      </div>
    );
  }

  const isClosed = dayRecord?.status === 'closed';
  const isReopened = dayRecord?.status === 'reopened';

  return (
    <div className="min-h-screen bg-slate-50 pb-36">
      <ScreenHeader title="Close Business Day" subtitle="Finalize · Freeze · Carry Forward" onBack={onBack}
        icon={<Lock className="w-5 h-5 text-brand-600" />} />

      <main className="px-4 sm:px-6 py-6 space-y-5 w-full max-w-2xl mx-auto">
        {error && (
          <div className="bg-rose-50 border border-rose-200/80 text-rose-800 text-sm rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
            <div className="flex-1">
              <p className="font-semibold text-rose-900">Unable to load day-closing data</p>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="p-1 hover:bg-rose-100 rounded-lg text-rose-600 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-sm rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
            <span className="font-semibold">{success}</span>
          </div>
        )}

        {/* Business Date Form Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-card space-y-3">
          <label className="block space-y-2">
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Business Date</span>
            <div className="relative flex items-center">
              <input
                type="date"
                value={businessDate}
                onChange={(e) => setBusinessDate(e.target.value)}
                className="w-full h-[52px] px-4 border border-slate-200/80 rounded-xl bg-white text-slate-900 font-bold text-base focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition shadow-xs"
              />
            </div>
          </label>
        </div>

        {/* Status banner */}
        {isClosed && (
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-base font-bold text-emerald-900">This business date is CLOSED</p>
              <p className="text-xs font-medium text-emerald-700 mt-0.5">
                Closed by {dayRecord?.closed_by ?? '—'} · Report version {dayRecord?.report_version ?? 0}
                {dayRecord?.closed_at && ` · ${new Date(dayRecord.closed_at).toLocaleString('en-IN')}`}
              </p>
            </div>
          </div>
        )}

        {isReopened && (
          <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
              <Unlock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-base font-bold text-amber-900">This business date was REOPENED for correction</p>
              <p className="text-xs font-medium text-amber-700 mt-0.5">
                Reopened by {dayRecord?.reopened_by ?? '—'} · {dayRecord?.reopen_reason ?? '—'}
              </p>
            </div>
          </div>
        )}

        {/* Validation warnings */}
        {warnings.length > 0 && !isClosed && (
          <SectionCard title="Validation Warnings" icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}>
            <div className="space-y-2">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2.5 text-xs font-medium text-amber-800 bg-amber-50/80 p-2.5 rounded-xl border border-amber-200/60">
                  <span className="w-2 h-2 rounded-full bg-amber-500 mt-1 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
            {!showOverride && (
              <p className="text-xs text-slate-400 font-medium mt-3">
                Resolve these warnings before closing, or use override with remarks (Admin only).
              </p>
            )}
          </SectionCard>
        )}

        {/* Override panel */}
        {showOverride && hasBlockingWarnings && !isClosed && canClose && (
          <div className="bg-amber-50 border border-amber-300/80 rounded-2xl p-5 space-y-3 shadow-card">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-amber-600" />
              <p className="text-base font-bold text-amber-900">Admin Override</p>
            </div>
            <p className="text-xs font-medium text-amber-700">
              You are about to close the day with unresolved warnings. This will be recorded in the audit log with your remarks.
            </p>
            <textarea
              value={overrideRemarks}
              onChange={(e) => setOverrideRemarks(e.target.value)}
              placeholder="Enter reason for overriding warnings (required)…"
              rows={2}
              className="w-full p-3 border border-amber-300 rounded-xl bg-white text-slate-900 text-xs font-medium resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
        )}

        {/* Cash Audit Panel */}
        {(() => {
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
          return (
            <>
              <SectionCard title="Cash Audit Panel" icon={<Calendar className="w-4 h-4 text-brand-600" />}>
                <CashRow label="Opening Cash" value={cashFlow?.opening_cash ?? 0} />
                <CashRow label="+ Cash Collection" value={toNum(activeReport.pay_cash)} positive />
                <CashRow label="- Cash Expenses" value={toNum(activeReport.housekeeping_supply) + toNum(activeReport.other_expense) + toNum(activeReport.maintenance_bill) + toNum(activeReport.finance_expenses)} negative />
                <CashRow label="- Salary Advance" value={toNum(activeReport.salary_advance)} negative />
                <CashRow label="- Cash Handover" value={toNum(activeReport.cash_handover_md)} negative />
                <CashRow label="- Bank Cash Deposit" value={toNum(activeReport.bank_cash_deposit)} negative />
                <div className="flex justify-between pt-3 mt-2 border-t border-slate-200">
                  <span className="text-sm font-bold text-slate-900">= Calculated Cash Closing</span>
                  <span className="text-base font-bold text-brand-700 tabular-nums">₹{fmtMoney(calculatedCashClosing)}</span>
                </div>
                {storedCashClosing !== null && (
                  <>
                    <div className="flex justify-between py-1">
                      <span className="text-xs text-slate-500 font-medium">Stored Cash Closing</span>
                      <span className="text-xs font-bold text-slate-800 tabular-nums">₹{fmtMoney(storedCashClosing)}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-xs text-slate-500 font-medium">Difference</span>
                      <span className={`text-xs font-bold tabular-nums ${cashMismatch ? 'text-rose-600' : 'text-emerald-600'}`}>
                        ₹{fmtMoney(cashDiff)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {cashMismatch ? (
                        <>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-xs font-bold">
                            <AlertTriangle className="w-3.5 h-3.5" /> Mismatch
                          </span>
                          <span className="text-xs font-medium text-rose-600">Day close blocked until resolved or overridden</span>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Matched
                        </span>
                      )}
                    </div>
                  </>
                )}
              </SectionCard>

              {/* Daily Summary */}
              <SectionCard title="Daily Summary" icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}>
                <SummaryRow label="Rooms Occupied" value={fmtInt(activeReport.rooms_occupied)} />
                <SummaryRow label="Room Revenue" value={`₹${fmtMoney(activeReport.room_sale_amount)}`} />
                <SummaryRow label="F&B Revenue" value={`₹${fmtMoney(activeReport.kitchen)}`} />
                <SummaryRow label="Other Revenue" value={`₹${fmtMoney(activeReport.other_income + toNum(activeReport.other_revenue_entries))}`} />
                <SummaryRow label="Total Revenue" value={`₹${fmtMoney(activeReport.room_sale_amount + activeReport.kitchen + activeReport.other_income + toNum(activeReport.other_revenue_entries))}`} strong />
                <SummaryRow label="GST Collected" value={`₹${fmtMoney(toNum(activeReport.gst_collected))}`} />
                <SummaryRow label="Total Expenses" value={`₹${fmtMoney(toNum(activeReport.housekeeping_supply) + toNum(activeReport.other_expense) + toNum(activeReport.maintenance_bill) + toNum(activeReport.finance_expenses))}`} />
                <SummaryRow label="Net Operating Result" value={`₹${fmtMoney(activeReport.room_sale_amount + activeReport.kitchen + activeReport.other_income + toNum(activeReport.other_revenue_entries) - toNum(activeReport.housekeeping_supply) - toNum(activeReport.other_expense) - toNum(activeReport.maintenance_bill) - toNum(activeReport.finance_expenses))}`} strong />
              </SectionCard>

              {/* Payment Mode Breakup */}
              <SectionCard title="Payment Mode Breakup" icon={<Calendar className="w-4 h-4 text-teal-600" />}>
                <SummaryRow label="Cash" value={`₹${fmtMoney(toNum(activeReport.pay_cash))}`} />
                <SummaryRow label="UPI" value={`₹${fmtMoney(toNum(activeReport.pay_upi))}`} />
                <SummaryRow label="Card" value={`₹${fmtMoney(toNum(activeReport.pay_card))}`} />
                <SummaryRow label="Bank Transfer" value={`₹${fmtMoney(toNum(activeReport.pay_bank))}`} />
              </SectionCard>
            </>
          );
        })()}

        {/* Audit log */}
        {auditLog.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-card">
            <button
              onClick={() => setShowAudit(!showAudit)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition"
            >
              <div className="flex items-center gap-2.5">
                <History className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Audit Log ({auditLog.length})</span>
              </div>
              {showAudit ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            {showAudit && (
              <div className="px-5 pb-4 space-y-3 border-t border-slate-100 pt-3">
                {auditLog.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 text-xs border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                    <span className={`px-2 py-0.5 rounded-md font-bold shrink-0 ${
                      log.action === 'close' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {log.action === 'close' ? 'CLOSED' : 'REOPENED'}
                    </span>
                    <div className="flex-1">
                      <p className="font-bold text-slate-800">
                        By {log.performed_by ?? '—'} · v{log.report_version}
                      </p>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        {new Date(log.created_at).toLocaleString('en-IN')}
                      </p>
                      {log.reason && <p className="text-slate-600 mt-1 font-medium bg-slate-50 p-2 rounded-lg border border-slate-200/60">Reason: {log.reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reopen panel */}
        {isClosed && canReopen && !showReopen && (
          <button
            onClick={() => setShowReopen(true)}
            className="w-full flex items-center justify-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold py-3.5 rounded-2xl border border-amber-200/80 shadow-xs transition active:scale-[0.99]"
          >
            <Unlock className="w-4 h-4" /> Reopen This Day
          </button>
        )}

        {showReopen && isClosed && canReopen && (
          <div className="bg-amber-50 border border-amber-300/80 rounded-2xl p-5 space-y-4 shadow-card">
            <div className="flex items-center gap-2.5">
              <Unlock className="w-5 h-5 text-amber-600" />
              <p className="text-base font-bold text-amber-900">Reopen Business Date</p>
            </div>
            <p className="text-xs font-medium text-amber-700">
              Reopening will unlock the day for corrections. A new report version will be created and the old snapshot preserved. This action is audit-logged.
            </p>
            <textarea
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="Enter reason for reopening (required)…"
              rows={2}
              className="w-full p-3 border border-amber-300 rounded-xl bg-white text-slate-900 text-xs font-medium resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowReopen(false); setReopenReason(''); }}
                className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleReopen}
                disabled={actionLoading || !reopenReason.trim()}
                className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                Confirm Reopen
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Sticky action bar */}
      {!isClosed && canClose && (
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 p-4 sm:p-5 z-20 shadow-lg mt-6 -mx-4 sm:-mx-6 px-4 sm:px-6">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={handleClose}
              disabled={actionLoading}
              className="w-full flex items-center justify-center gap-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold text-base h-[54px] sm:h-[58px] rounded-2xl shadow-soft-blue hover:shadow-md transition active:scale-[0.99]"
            >
              {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
              {showOverride ? 'Override & Close Day' : 'Close Business Day'}
            </button>
          </div>
        </div>
      )}

      {!canClose && !isClosed && (
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 p-4 sm:p-5 z-20 shadow-lg mt-6 -mx-4 sm:-mx-6 px-4 sm:px-6">
          <div className="max-w-2xl mx-auto">
            <p className="text-center text-xs font-semibold text-slate-400">Only Hotel Admin can close the business day.</p>
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

const CashRow = ({ label, value, positive, negative }: { label: string; value: number; positive?: boolean; negative?: boolean }) => {
  const sign = negative ? '-' : positive ? '+' : '';
  const color = negative ? 'text-rose-600' : positive ? 'text-emerald-600' : 'text-slate-700';
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <span className={`text-xs font-bold tabular-nums ${color}`}>{sign}₹{fmtMoney(value)}</span>
    </div>
  );
};

const SummaryRow = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={`flex items-baseline justify-between py-1.5 ${strong ? 'pt-2.5 mt-1 border-t border-slate-200' : 'border-b border-slate-100 last:border-0'}`}>
    <span className={`text-xs ${strong ? 'font-bold text-slate-900' : 'font-medium text-slate-600'}`}>{label}</span>
    <span className={`text-xs font-bold tabular-nums ${strong ? 'text-brand-700 text-sm' : 'text-slate-800'}`}>{value}</span>
  </div>
);
