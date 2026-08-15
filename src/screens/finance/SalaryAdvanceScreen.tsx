import { useEffect, useState, useMemo } from 'react';
import { HandCoins, Plus, Trash2 } from 'lucide-react';
import type { StaffMember, SalaryAdvance, SalaryAdvanceInput, SalaryPayMode } from '@/lib/types-finance';
import { SALARY_PAY_MODES } from '@/lib/types-finance';
import { getStaff, getSalaryAdvances, saveSalaryAdvance, deleteSalaryAdvance } from '@/lib/api-finance';
import {
  ScreenHeader, SectionCard, SelectInput, NumInput, TextArea, DateInput,
  Banner, StickySaveBar, fmtMoney, monthKeyFrom, monthLabel,
} from '@/components/finance-ui';

interface SalaryAdvanceScreenProps {
  onBack: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export const SalaryAdvanceScreen = ({ onBack }: SalaryAdvanceScreenProps) => {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const [monthKey, setMonthKey] = useState(monthKeyFrom(now.getFullYear(), now.getMonth() + 1));

  // form
  const [staffId, setStaffId] = useState('');
  const [advanceDate, setAdvanceDate] = useState(today());
  const [amount, setAmount] = useState(0);
  const [paymentMode, setPaymentMode] = useState<SalaryPayMode>('Cash');
  const [remark, setRemark] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [s, advs] = await Promise.all([
        getStaff(true),
        getSalaryAdvances(monthKey),
      ]);
      setStaff(s.filter((x) => x.is_active));
      setAdvances(advs);
      if (s.length > 0 && !staffId) setStaffId(s[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [monthKey]);

  // Advance sums per staff
  const advanceSums = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of advances) {
      map.set(a.staff_id, (map.get(a.staff_id) ?? 0) + a.amount);
    }
    return map;
  }, [advances]);

  const handleSave = async () => {
    setError(null);
    if (!staffId) { setError('Select a staff member.'); return; }
    if (amount <= 0) { setError('Enter a valid amount.'); return; }
    try {
      setSaving(true);
      const input: SalaryAdvanceInput = {
        staff_id: staffId, advance_date: advanceDate, amount,
        payment_mode: paymentMode, remark: remark.trim(), month_key: monthKey,
      };
      const saved = await saveSalaryAdvance(input);
      setAdvances((prev) => [...prev, saved]);
      setAmount(0);
      setRemark('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this advance?')) return;
    try {
      await deleteSalaryAdvance(id);
      setAdvances((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const staffName = (id: string) => staff.find((s) => s.id === id)?.name ?? 'Unknown';

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <ScreenHeader title="Salary Advance" subtitle="Record staff advance payments" onBack={onBack}
        icon={<HandCoins className="w-5 h-5 text-sky-300" />} />

      <main className="px-4 py-4 space-y-4 w-full">
        {error && <Banner kind="error">{error}</Banner>}

        {/* Month selector */}
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Month</span>
            <input type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </label>
        </div>

        {/* Quick add form */}
        <SectionCard title="New Salary Advance" icon={<Plus className="w-4 h-4" />}>
          {staff.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-3">
              No active staff found. Add staff in the Staff & Salary module first.
            </p>
          ) : (
          <>
            <SelectInput label="Staff Member" value={staffId}
              options={staff.map((s) => ({ value: s.id, label: `${s.name} (₹${fmtMoney(s.monthly_salary)})` }))}
              onChange={setStaffId} />
            <DateInput label="Advance Date" value={advanceDate} onChange={setAdvanceDate} />
            <NumInput label="Advance Amount" prefix="₹" value={amount} onChange={setAmount} />
            <SelectInput label="Payment Mode" value={paymentMode}
              options={[...SALARY_PAY_MODES]}
              onChange={(v) => setPaymentMode(v as SalaryPayMode)} />
            <TextArea label="Remark" value={remark} onChange={setRemark} placeholder="Optional" />
          </>
          )}
        </SectionCard>

        {/* Advances this month */}
        <SectionCard title={`Advances — ${monthLabel(monthKey)}`} icon={<HandCoins className="w-4 h-4" />}>
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
          ) : advances.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No advances recorded this month.</p>
          ) : (
            <div className="space-y-2">
              {advances.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{staffName(a.staff_id)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {a.advance_date} · {a.payment_mode}
                    </p>
                    {a.remark && <p className="text-xs text-slate-400 mt-0.5 italic truncate">{a.remark}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-sm font-bold text-slate-900 tabular-nums">₹{fmtMoney(a.amount)}</span>
                    <button onClick={() => handleDelete(a.id)}
                      className="p-1 text-slate-300 hover:text-red-500 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Per-staff summary */}
        {advances.length > 0 && (
          <SectionCard title="Advance Summary by Staff" icon={<HandCoins className="w-4 h-4" />}>
            <div className="space-y-1.5">
              {Array.from(advanceSums.entries()).map(([sid, total]) => {
                const s = staff.find((x) => x.id === sid);
                const pending = (s?.monthly_salary ?? 0) - total;
                return (
                  <div key={sid} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{staffName(sid)}</p>
                      <p className="text-xs text-slate-400">Salary ₹{fmtMoney(s?.monthly_salary ?? 0)} · Pending ₹{fmtMoney(pending)}</p>
                    </div>
                    <span className="text-sm font-bold text-amber-700 tabular-nums">₹{fmtMoney(total)}</span>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}
      </main>

      <StickySaveBar onSave={handleSave} saving={saving} label="Save Advance" />
    </div>
  );
};
