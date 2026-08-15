import { useEffect, useState } from 'react';
import { Users, Plus, Pencil, Check, X, Power } from 'lucide-react';
import type { StaffMember, StaffInput, StaffDepartment, SalaryPayMode } from '@/lib/types-finance';
import { STAFF_DEPARTMENTS, SALARY_PAY_MODES } from '@/lib/types-finance';
import { getStaff, saveStaff } from '@/lib/api-finance';
import {
  ScreenHeader, SectionCard, TextInput, NumInput, SelectInput, DateInput,
  Banner, fmtMoney,
} from '@/components/finance-ui';

interface StaffMasterScreenProps {
  onBack: () => void;
}

const emptyStaff: StaffInput = {
  name: '', employee_id: '', department: 'Front Office', designation: '',
  joining_date: null, monthly_salary: 0, payment_mode: 'Cash', is_active: true,
};

export const StaffMasterScreen = ({ onBack }: StaffMasterScreenProps) => {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<StaffInput>(emptyStaff);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getStaff(true);
      setStaff(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const handleSave = async () => {
    setError(null);
    if (!form.name.trim()) { setError('Enter staff name.'); return; }
    try {
      setSaving(true);
      const saved = await saveStaff(form, editingId ?? undefined);
      setStaff((prev) => {
        const idx = prev.findIndex((s) => s.id === saved.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
        return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
      setForm(emptyStaff);
      setShowForm(false);
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (s: StaffMember) => {
    setEditingId(s.id);
    setForm({
      name: s.name, employee_id: s.employee_id, department: s.department,
      designation: s.designation, joining_date: s.joining_date,
      monthly_salary: s.monthly_salary, payment_mode: s.payment_mode, is_active: s.is_active,
    });
    setShowForm(true);
  };

  const handleToggleActive = async (s: StaffMember) => {
    try {
      const updated = await saveStaff({ ...s, is_active: !s.is_active }, s.id);
      setStaff((prev) => prev.map((x) => (x.id === s.id ? updated : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    }
  };

  const handleCancel = () => {
    setForm(emptyStaff);
    setShowForm(false);
    setEditingId(null);
  };

  const visibleStaff = showInactive ? staff : staff.filter((s) => s.is_active);

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <ScreenHeader title="Staff & Salary" subtitle="Manage staff master records" onBack={onBack}
        icon={<Users className="w-5 h-5 text-sky-300" />} />

      <main className="px-4 py-4 space-y-4 w-full">
        {error && <Banner kind="error">{error}</Banner>}

        {/* Toggle inactive */}
        <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 p-3">
          <span className="text-sm text-slate-600">
            {visibleStaff.length} staff member{visibleStaff.length !== 1 ? 's' : ''}
          </span>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
            Show inactive
          </label>
        </div>

        {/* Add button / form */}
        {!showForm ? (
          <button onClick={() => { setForm(emptyStaff); setShowForm(true); setEditingId(null); }}
            className="w-full flex items-center justify-center gap-2 bg-sky-700 hover:bg-sky-800 text-white font-semibold py-3.5 rounded-xl shadow-sm transition">
            <Plus className="w-5 h-5" /> Add Staff Member
          </button>
        ) : (
          <SectionCard title={editingId ? 'Edit Staff' : 'New Staff Member'} icon={<Users className="w-4 h-4" />}>
            <TextInput label="Staff Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Full name" />
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="Employee ID (optional)" value={form.employee_id} onChange={(v) => setForm({ ...form, employee_id: v })} />
              <SelectInput label="Department" value={form.department}
                options={[...STAFF_DEPARTMENTS]}
                onChange={(v) => setForm({ ...form, department: v as StaffDepartment })} />
            </div>
            <TextInput label="Designation" value={form.designation} onChange={(v) => setForm({ ...form, designation: v })} placeholder="e.g. Receptionist" />
            <DateInput label="Joining Date" value={form.joining_date ?? ''} onChange={(v) => setForm({ ...form, joining_date: v || null })} />
            <NumInput label="Monthly Salary" prefix="₹" value={form.monthly_salary} onChange={(v) => setForm({ ...form, monthly_salary: v })} />
            <SelectInput label="Payment Mode" value={form.payment_mode}
              options={[...SALARY_PAY_MODES]}
              onChange={(v) => setForm({ ...form, payment_mode: v as SalaryPayMode })} />
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition">
                <Check className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={handleCancel}
                className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-xl transition">
                <X className="w-4 h-4" /> Cancel
              </button>
            </div>
          </SectionCard>
        )}

        {/* Staff list */}
        <SectionCard title="Staff Directory" icon={<Users className="w-4 h-4" />}>
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
          ) : visibleStaff.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No staff members yet.</p>
          ) : (
            <div className="space-y-2">
              {visibleStaff.map((s) => (
                <div key={s.id} className={`flex items-start justify-between gap-2 border rounded-lg p-3 ${s.is_active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{s.name}</span>
                      {!s.is_active && <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-semibold">INACTIVE</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {s.department}{s.designation ? ` · ${s.designation}` : ''}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5 font-semibold">₹{fmtMoney(s.monthly_salary)}/month</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleEdit(s)} className="p-1.5 text-slate-400 hover:text-sky-600 transition">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleToggleActive(s)} className="p-1.5 text-slate-400 hover:text-amber-600 transition" title={s.is_active ? 'Disable' : 'Enable'}>
                      <Power className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </main>
    </div>
  );
};
