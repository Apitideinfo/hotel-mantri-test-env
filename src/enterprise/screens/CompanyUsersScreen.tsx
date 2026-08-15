import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Users as UsersIcon, Search } from 'lucide-react';
import { getCompanyUsers, getCompanyRoles, saveCompanyUser, deleteCompanyUser } from '../api';
import type { CompanyUser, CompanyRoleDef, CompanyUserInput } from '../types';
import { ALL_ROLES } from '../permissions';
import { ROLE_LABELS, ROLE_BADGE_COLORS } from '../permissions';
import type { CompanyRole } from '../types';
import { PageHeader, Card, Badge, LoadingState, ErrorState, EmptyState, ConfirmDialog, TextInput, SelectInput } from '../ui';

export const CompanyUsersScreen = () => {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [roles, setRoles] = useState<CompanyRoleDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<CompanyUserInput>({
    name: '', email: '', mobile: '', role: 'sales_executive',
    manager_id: null, department: '', status: 'Active',
    assigned_hotels: [], assigned_leads: [], password: '',
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [u, r] = await Promise.all([getCompanyUsers(), getCompanyRoles()]);
      setUsers(u); setRoles(r);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });

  const handleSave = async () => {
    setError(null);
    if (!form.name.trim() || !form.email.trim()) { setError('Name and email are required.'); return; }
    try {
      setSaving(true);
      await saveCompanyUser(form, editingId ?? undefined);
      await load();
      setShowForm(false); setEditingId(null);
      setForm({ name: '', email: '', mobile: '', role: 'sales_executive', manager_id: null, department: '', status: 'Active', assigned_hotels: [], assigned_leads: [], password: '' });
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try { await deleteCompanyUser(confirmDelete); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setConfirmDelete(null); }
  };

  if (loading) return <LoadingState label="Loading company users…" />;

  return (
    <div className="space-y-4">
      <PageHeader title="Company Users & Roles" subtitle={`${users.length} team members`}
        action={<button onClick={() => { setForm({ name: '', email: '', mobile: '', role: 'sales_executive', manager_id: null, department: '', status: 'Active', assigned_hotels: [], assigned_leads: [], password: '' }); setEditingId(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-4 py-2.5 rounded-xl transition text-sm"><Plus className="w-4 h-4" /> Add User</button>}
      />

      {error && <ErrorState message={error} />}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, role…"
          className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500" />
      </div>

      {showForm && (
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-800">{editingId ? 'Edit User' : 'New Company User'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextInput label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <TextInput label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
            <TextInput label="Mobile" value={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} />
            <SelectInput label="Role" value={form.role} onChange={(v) => setForm({ ...form, role: v as CompanyRole })}
              options={ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
            <TextInput label="Department" value={form.department} onChange={(v) => setForm({ ...form, department: v })} />
            <SelectInput label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v as 'Active' | 'Inactive' | 'Suspended' })}
              options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }, { value: 'Suspended', label: 'Suspended' }]} />
            {!editingId && <TextInput label="Password" value={form.password ?? ''} onChange={(v) => setForm({ ...form, password: v })} type="password" placeholder="Min 6 characters" />}
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition text-sm">{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setShowForm(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl transition text-sm">Cancel</button>
          </div>
        </Card>
      )}

      {filtered.length === 0 && !showForm ? (
        <EmptyState title="No company users" subtitle="Add team members to manage your SaaS business." />
      ) : (
        <div className="hidden lg:block bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-bold text-slate-500 uppercase">
              <th className="px-4 py-3">Name</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last Login</th><th className="px-4 py-3">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{u.name}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3"><Badge color="slate">{ROLE_LABELS[u.role]}</Badge></td>
                  <td className="px-4 py-3 text-slate-600">{u.department || '—'}</td>
                  <td className="px-4 py-3"><Badge color={u.status === 'Active' ? 'green' : 'slate'}>{u.status}</Badge></td>
                  <td className="px-4 py-3 text-slate-500">{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-4 py-3"><div className="flex gap-1">
                    <button onClick={() => { setEditingId(u.id); setForm({ ...u, password: '' }); setShowForm(true); }} className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setConfirmDelete(u.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {filtered.map((u) => (
          <Card key={u.id} className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div><p className="font-semibold text-slate-800">{u.name}</p><p className="text-xs text-slate-400">{u.email}</p></div>
              <Badge color={u.status === 'Active' ? 'green' : 'slate'}>{u.status}</Badge>
            </div>
            <p className="text-xs text-slate-500 mb-2">{ROLE_LABELS[u.role]} · {u.department || '—'}</p>
            <div className="flex gap-2">
              <button onClick={() => { setEditingId(u.id); setForm({ ...u, password: '' }); setShowForm(true); }} className="flex-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 rounded-lg">Edit</button>
              <button onClick={() => setConfirmDelete(u.id)} className="text-xs bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-2 px-3 rounded-lg">Delete</button>
            </div>
          </Card>
        ))}
      </div>

      {confirmDelete && <ConfirmDialog title="Delete User" message="This will permanently remove the user. Continue?" confirmLabel="Delete" danger onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />}
    </div>
  );
};
