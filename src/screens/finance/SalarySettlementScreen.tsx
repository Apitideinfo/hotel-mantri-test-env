import { useEffect, useState, useMemo } from 'react';
import { CheckCircle2, CalendarCheck } from 'lucide-react';
import type { StaffMember, SalaryAdvance, SalarySettlement, SalarySettlementInput, SalaryPayMode } from '@/lib/types-finance';
import { SALARY_PAY_MODES } from '@/lib/types-finance';
import { getStaff, getSalaryAdvances, getSalarySettlements, saveSalarySettlement } from '@/lib/api-finance';
import {
  ScreenHeader, SectionCard, NumInput, SelectInput, DateInput, TextArea,
  Banner, fmtMoney, monthKeyFrom, monthLabel,
} from '@/components/finance-ui';

interface SalarySettlementScreenProps {
  onBack: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

interface StaffRow {
  staff: StaffMember;
  advance: number;
  settlement: SalarySettlement | null;
  finalPayment: number;
  pending: number;
  status: 'Pending' | 'Paid' | 'PartiallyPaid';
}

export const SalarySettlementScreen = ({ onBack }: SalarySettlementScreenProps) => {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [settlements, setSettlements] = useState<SalarySettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const now = new Date();
  const [monthKey, setMonthKey] = useState(monthKeyFrom(now.getFullYear(), now.getMonth() + 1));

  // editing state — one row at a time
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editFinal, setEditFinal] = useState(0);
  const [editMode, setEditMode] = useState<SalaryPayMode>('Cash');
  const [editDate, setEditDate] = useState(today());
  const [editRemark, setEditRemark] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [s, advs, setts] = await Promise.all([
        getStaff(true),
        getSalaryAdvances(monthKey),
        getSalarySettlements(monthKey),
      ]);
      setStaff(s.filter((x) => x.is_active));
      setAdvances(advs);
      setSettlements(setts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [monthKey]);

  const rows: StaffRow[] = useMemo(() => {
    return staff.map((s) => {
      const advance = advances.filter((a) => a.staff_id === s.id).reduce((sum, a) => sum + a.amount, 0);
      const settlement = settlements.find((x) => x.staff_id === s.id) ?? null;
      const finalPayment = settlement?.final_payment ?? 0;
      const pending = s.monthly_salary - advance - finalPayment;
      const status = settlement?.status ?? 'Pending';
      return { staff: s, advance, settlement, finalPayment, pending, status: status as StaffRow['status'] };
    });
  }, [staff, advances, settlements]);

  const totalSalary = staff.reduce((s, x) => s + x.monthly_salary, 0);
  const totalAdvance = rows.reduce((s, r) => s + r.advance, 0);
  const totalFinal = rows.reduce((s, r) => s + r.finalPayment, 0);
  const totalPending = rows.reduce((s, r) => s + Math.max(0, r.pending), 0);

  const handleStartEdit = (r: StaffRow) => {
    setEditingStaffId(r.staff.id);
    setEditFinal(r.pending > 0 ? r.pending : 0);
    setEditMode(r.settlement?.payment_mode ?? r.staff.payment_mode);
    setEditDate(r.settlement?.payment_date ?? today());
    setEditRemark(r.settlement?.remark ?? '');
  };

  const handleSaveSettlement = async (r: StaffRow) => {
    setError(null);
    setSuccess(null);
    // Validate: final + advance must not exceed monthly salary (unless bonus explicitly allowed later)
    if (editFinal + r.advance > r.staff.monthly_salary) {
      setError(`Final payment (₹${fmtMoney(editFinal)}) + advance (₹${fmtMoney(r.advance)}) exceeds monthly salary (₹${fmtMoney(r.staff.monthly_salary)}).`);
      return;
    }
    try {
      setSaving(true);
      const status = editFinal + r.advance >= r.staff.monthly_salary ? 'Paid' : 'PartiallyPaid';
      const input: SalarySettlementInput = {
        staff_id: r.staff.id,
        month_key: monthKey,
        monthly_salary: r.staff.monthly_salary,
        total_advance: r.advance,
        final_payment: editFinal,
        payment_mode: editMode,
        payment_date: editDate || null,
        status,
        remark: editRemark.trim(),
      };
      const saved = await saveSalarySettlement(input, r.settlement?.id);
      setSettlements((prev) => {
        const idx = prev.findIndex((x) => x.id === saved.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
        return [...prev, saved];
      });
      setEditingStaffId(null);
      setSuccess(`${r.staff.name} marked as ${status}.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <ScreenHeader title="Monthly Salary Settlement" subtitle="Settle staff salaries for the month" onBack={onBack}
        icon={<CalendarCheck className="w-5 h-5 text-sky-300" />} />

      <main className="px-4 py-4 space-y-4 w-full">
        {error && <Banner kind="error">{error}</Banner>}
        {success && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl p-3">
            <CheckCircle2 className="w-4 h-4" /> {success}
          </div>
        )}

        {/* Month selector */}
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Month</span>
            <input type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </label>
        </div>

        {/* Totals summary */}
        <div className="bg-gradient-to-br from-sky-700 to-sky-900 text-white rounded-xl p-4">
          <p className="text-sky-200 text-xs uppercase tracking-wide">{monthLabel(monthKey)} Salary Summary</p>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div><p className="text-xs text-sky-200">Total Salary</p><p className="text-lg font-bold tabular-nums">₹{fmtMoney(totalSalary)}</p></div>
            <div><p className="text-xs text-sky-200">Total Advance</p><p className="text-lg font-bold tabular-nums">₹{fmtMoney(totalAdvance)}</p></div>
            <div><p className="text-xs text-sky-200">Final Paid</p><p className="text-lg font-bold tabular-nums">₹{fmtMoney(totalFinal)}</p></div>
            <div><p className="text-xs text-sky-200">Pending</p><p className="text-lg font-bold tabular-nums">₹{fmtMoney(totalPending)}</p></div>
          </div>
        </div>

        {/* Per-staff rows */}
        <SectionCard title="Staff Salary Settlement" icon={<CalendarCheck className="w-4 h-4" />}>
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No active staff. Add staff first.</p>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => (
                <div key={r.staff.id} className="border border-slate-200 rounded-lg p-3">
                  {/* display row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900">{r.staff.name}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          r.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                          r.status === 'PartiallyPaid' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>{r.status}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{r.staff.department}</p>
                    </div>
                    {editingStaffId !== r.staff.id && (
                      <button onClick={() => handleStartEdit(r)}
                        className="text-xs font-semibold text-sky-700 border border-sky-300 bg-sky-50 px-3 py-1.5 rounded-lg hover:bg-sky-100 transition">
                        {r.status === 'Pending' ? 'Settle' : 'Edit'}
                      </button>
                    )}
                  </div>

                  {/* salary breakdown */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-xs">
                    <div className="flex justify-between"><span className="text-slate-400">Salary</span><span className="font-semibold text-slate-700 tabular-nums">₹{fmtMoney(r.staff.monthly_salary)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Advance</span><span className="font-semibold text-amber-700 tabular-nums">₹{fmtMoney(r.advance)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Final Paid</span><span className="font-semibold text-emerald-700 tabular-nums">₹{fmtMoney(r.finalPayment)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Pending</span><span className="font-bold text-slate-900 tabular-nums">₹{fmtMoney(Math.max(0, r.pending))}</span></div>
                  </div>

                  {/* inline edit form */}
                  {editingStaffId === r.staff.id && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                      <NumInput label="Final Payment Amount" prefix="₹" value={editFinal} onChange={setEditFinal} />
                      <SelectInput label="Payment Mode" value={editMode}
                        options={[...SALARY_PAY_MODES]}
                        onChange={(v) => setEditMode(v as SalaryPayMode)} />
                      <DateInput label="Payment Date" value={editDate} onChange={setEditDate} />
                      <TextArea label="Remark" value={editRemark} onChange={setEditRemark} />
                      <div className="flex gap-2">
                        <button onClick={() => handleSaveSettlement(r)} disabled={saving}
                          className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition">
                          <CheckCircle2 className="w-4 h-4" /> {saving ? 'Saving…' : 'Mark Paid'}
                        </button>
                        <button onClick={() => setEditingStaffId(null)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-xl transition">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </main>
    </div>
  );
};
