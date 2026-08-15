import { useEffect, useState, useCallback } from 'react';
import {
  Lock, Unlock, AlertTriangle, CheckCircle2, Loader2,
  Calendar, ShieldCheck, History, ChevronDown, ChevronUp,
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
      const s = await getSettings();
      setSettings(s);
      const [r, dr, w, cf, log] = await Promise.all([
        getDerivedReport(businessDate, s.total_rooms, s.opening_cash_balance),
        getDayCloseRecord(businessDate),
        validateDayForClose(businessDate),
        getCashFlow(businessDate),
        getDayCloseAuditLog(businessDate),
      ]);
      setReport(r);
      setDayRecord(dr);
      setWarnings(w);
      setCashFlow(cf ?? buildCashFlowFromReport(r));
      setAuditLog(log);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
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
        <ScreenHeader title="Close Business Day" subtitle="Finalize daily figures" onBack={onBack}
          icon={<Lock className="w-5 h-5 text-sky-300" />} />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
        </div>
      </div>
    );
  }

  const isClosed = dayRecord?.status === 'closed';
  const isReopened = dayRecord?.status === 'reopened';

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      <ScreenHeader title="Close Business Day" subtitle="Finalize · Freeze · Carry Forward" onBack={onBack}
        icon={<Lock className="w-5 h-5 text-sky-300" />} />

      <main className="px-4 py-4 space-y-4 w-full max-w-3xl mx-auto">
        {error && <Banner kind="error">{error}</Banner>}
        {success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl p-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> {success}
          </div>
        )}

        {/* Date selector */}
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Business Date</span>
            <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </label>
        </div>

        {/* Status banner */}
        {isClosed && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">This business date is CLOSED</p>
              <p className="text-xs text-emerald-600">
                Closed by {dayRecord?.closed_by ?? '—'} · Report version {dayRecord?.report_version ?? 0}
                {dayRecord?.closed_at && ` · ${new Date(dayRecord.closed_at).toLocaleString('en-IN')}`}
              </p>
            </div>
          </div>
        )}
        {isReopened && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
            <Unlock className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">This business date was REOPENED for correction</p>
              <p className="text-xs text-amber-600">
                Reopened by {dayRecord?.reopened_by ?? '—'} · {dayRecord?.reopen_reason ?? '—'}
              </p>
            </div>
          </div>
        )}

        {/* Validation warnings */}
        {warnings.length > 0 && !isClosed && (
          <SectionCard title="Validation Warnings" icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}>
            <div className="space-y-1.5">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-amber-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
            {!showOverride && (
              <p className="text-xs text-slate-500 mt-2">
                Resolve these warnings before closing, or use override with remarks (Admin only).
              </p>
            )}
          </SectionCard>
        )}

        {/* Override panel */}
        {showOverride && hasBlockingWarnings && !isClosed && canClose && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">Admin Override</p>
            </div>
            <p className="text-xs text-amber-700">
              You are about to close the day with unresolved warnings. This will be recorded in the audit log with your remarks.
            </p>
            <textarea value={overrideRemarks} onChange={(e) => setOverrideRemarks(e.target.value)}
              placeholder="Enter reason for overriding warnings (required)…"
              rows={2}
              className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-white text-slate-900 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
        )}

        {/* Cash Audit Panel */}
        {report && (
          <SectionCard title="Cash Audit Panel" icon={<Calendar className="w-4 h-4 text-sky-600" />}>
            <CashRow label="Opening Cash" value={cashFlow?.opening_cash ?? 0} />
            <CashRow label="+ Cash Collection" value={toNum(report.pay_cash)} positive />
            <CashRow label="- Cash Expenses" value={toNum(report.housekeeping_supply) + toNum(report.other_expense) + toNum(report.maintenance_bill) + toNum(report.finance_expenses)} negative />
            <CashRow label="- Salary Advance" value={toNum(report.salary_advance)} negative />
            <CashRow label="- Cash Handover" value={toNum(report.cash_handover_md)} negative />
            <CashRow label="- Bank Cash Deposit" value={toNum(report.bank_cash_deposit)} negative />
            <div className="flex justify-between pt-2 mt-1 border-t border-slate-200">
              <span className="text-sm font-bold text-slate-900">= Calculated Cash Closing</span>
              <span className="text-base font-bold text-sky-700 tabular-nums">₹{fmtMoney(calculatedCashClosing)}</span>
            </div>
            {storedCashClosing !== null && (
              <>
                <div className="flex justify-between py-1">
                  <span className="text-sm text-slate-500">Stored Cash Closing</span>
                  <span className="text-sm font-semibold text-slate-700 tabular-nums">₹{fmtMoney(storedCashClosing)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-sm text-slate-500">Difference</span>
                  <span className={`text-sm font-semibold tabular-nums ${cashMismatch ? 'text-red-600' : 'text-emerald-600'}`}>
                    ₹{fmtMoney(cashDiff)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {cashMismatch ? (
                    <>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                        <AlertTriangle className="w-3 h-3" /> Mismatch
                      </span>
                      <span className="text-xs text-red-600">Day close blocked until resolved or overridden</span>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                      <CheckCircle2 className="w-3 h-3" /> Matched
                    </span>
                  )}
                </div>
              </>
            )}
          </SectionCard>
        )}

        {/* Daily Summary */}
        {report && (
          <SectionCard title="Daily Summary" icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}>
            <SummaryRow label="Rooms Occupied" value={fmtInt(report.rooms_occupied)} />
            <SummaryRow label="Room Revenue" value={`₹${fmtMoney(report.room_sale_amount)}`} />
            <SummaryRow label="F&B Revenue" value={`₹${fmtMoney(report.kitchen)}`} />
            <SummaryRow label="Other Revenue" value={`₹${fmtMoney(report.other_income + toNum(report.other_revenue_entries))}`} />
            <SummaryRow label="Total Revenue" value={`₹${fmtMoney(report.room_sale_amount + report.kitchen + report.other_income + toNum(report.other_revenue_entries))}`} strong />
            <SummaryRow label="GST Collected" value={`₹${fmtMoney(toNum(report.gst_collected))}`} />
            <SummaryRow label="Total Expenses" value={`₹${fmtMoney(toNum(report.housekeeping_supply) + toNum(report.other_expense) + toNum(report.maintenance_bill) + toNum(report.finance_expenses))}`} />
            <SummaryRow label="Net Operating Result" value={`₹${fmtMoney(report.room_sale_amount + report.kitchen + report.other_income + toNum(report.other_revenue_entries) - toNum(report.housekeeping_supply) - toNum(report.other_expense) - toNum(report.maintenance_bill) - toNum(report.finance_expenses))}`} strong />
          </SectionCard>
        )}

        {/* Payment Mode Breakup */}
        {report && (toNum(report.pay_cash) > 0 || toNum(report.pay_upi) > 0 || toNum(report.pay_card) > 0 || toNum(report.pay_bank) > 0) && (
          <SectionCard title="Payment Mode Breakup" icon={<Calendar className="w-4 h-4 text-teal-600" />}>
            <SummaryRow label="Cash" value={`₹${fmtMoney(toNum(report.pay_cash))}`} />
            <SummaryRow label="UPI" value={`₹${fmtMoney(toNum(report.pay_upi))}`} />
            <SummaryRow label="Card" value={`₹${fmtMoney(toNum(report.pay_card))}`} />
            <SummaryRow label="Bank Transfer" value={`₹${fmtMoney(toNum(report.pay_bank))}`} />
          </SectionCard>
        )}

        {/* Audit log */}
        {auditLog.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button onClick={() => setShowAudit(!showAudit)}
              className="w-full px-4 py-3 flex items-center gap-2 hover:bg-slate-50 transition">
              <History className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-bold text-slate-700 uppercase tracking-wide flex-1 text-left">Audit Log ({auditLog.length})</span>
              {showAudit ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            {showAudit && (
              <div className="px-4 pb-3 space-y-2">
                {auditLog.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-xs border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                    <span className={`px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                      log.action === 'close' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {log.action === 'close' ? 'CLOSED' : 'REOPENED'}
                    </span>
                    <div className="flex-1">
                      <p className="text-slate-700">
                        By {log.performed_by ?? '—'} · v{log.report_version}
                      </p>
                      <p className="text-slate-400">
                        {new Date(log.created_at).toLocaleString('en-IN')}
                      </p>
                      {log.reason && <p className="text-slate-500 mt-0.5">Reason: {log.reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reopen panel */}
        {isClosed && canReopen && !showReopen && (
          <button onClick={() => setShowReopen(true)}
            className="w-full flex items-center justify-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold py-3 rounded-xl border border-amber-200 transition">
            <Unlock className="w-4 h-4" /> Reopen This Day
          </button>
        )}
        {showReopen && isClosed && canReopen && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Unlock className="w-5 h-5 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">Reopen Business Date</p>
            </div>
            <p className="text-xs text-amber-700">
              Reopening will unlock the day for corrections. A new report version will be created and the old snapshot preserved. This action is audit-logged.
            </p>
            <textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)}
              placeholder="Enter reason for reopening (required)…"
              rows={2}
              className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-white text-slate-900 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500" />
            <div className="flex gap-2">
              <button onClick={() => { setShowReopen(false); setReopenReason(''); }}
                className="flex-1 bg-white border border-slate-200 text-slate-600 font-semibold py-2.5 rounded-lg">
                Cancel
              </button>
              <button onClick={handleReopen} disabled={actionLoading || !reopenReason.trim()}
                className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                Confirm Reopen
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Sticky action bar */}
      {!isClosed && canClose && (
        <div className="fixed bottom-0 inset-x-0 max-w-3xl mx-auto bg-white/95 backdrop-blur border-t border-slate-200 p-3 flex gap-2.5">
          <button onClick={handleClose} disabled={actionLoading}
            className="flex-1 flex items-center justify-center gap-2 bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white font-bold py-3.5 rounded-2xl shadow transition">
            {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
            {showOverride ? 'Override & Close Day' : 'Close Business Day'}
          </button>
        </div>
      )}
      {!canClose && !isClosed && (
        <div className="fixed bottom-0 inset-x-0 max-w-3xl mx-auto bg-white/95 backdrop-blur border-t border-slate-200 p-3">
          <p className="text-center text-xs text-slate-400">Only Hotel Admin can close the business day.</p>
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
  const color = negative ? 'text-red-600' : positive ? 'text-emerald-600' : 'text-slate-700';
  return (
    <div className="flex items-baseline justify-between py-1 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${color}`}>{sign}₹{fmtMoney(value)}</span>
    </div>
  );
};

const SummaryRow = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={`flex items-baseline justify-between py-1 ${strong ? 'pt-2 mt-1 border-t border-slate-200' : 'border-b border-slate-100 last:border-0'}`}>
    <span className={`text-sm ${strong ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{label}</span>
    <span className={`text-sm font-semibold tabular-nums ${strong ? 'text-sky-700' : 'text-slate-800'}`}>{value}</span>
  </div>
);
