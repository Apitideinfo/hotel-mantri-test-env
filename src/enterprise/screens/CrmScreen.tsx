import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Pencil, Trash2, MessageSquare, Calendar, IndianRupee, X } from 'lucide-react';
import { getLeads, getCompanyUsers, saveLead, deleteLead, getLeadNotes, addLeadNote } from '../api';
import type { CrmLead, CompanyUser, CrmLeadNote, LeadStatus } from '../types';
import { LEAD_STATUSES, LEAD_STATUS_COLORS } from '../types';
import { ROLE_LABELS } from '../permissions';
import { PageHeader, Card, Badge, LoadingState, ErrorState, EmptyState, ConfirmDialog, TextInput, SelectInput, NumInput, TextArea, fmtDate, fmtMoney, fmtDateTime } from '../ui';

export const CrmScreen = () => {
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [detailLead, setDetailLead] = useState<CrmLead | null>(null);
  const [notes, setNotes] = useState<CrmLeadNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);

  const emptyLead: Partial<CrmLead> = { hotel_name: '', contact_person: '', mobile: '', email: '', city: '', num_rooms: 0, current_software: '', lead_source: '', interested_plan: '', status: 'New Lead', notes: '', estimated_value: 0 };
  const [form, setForm] = useState<Partial<CrmLead>>(emptyLead);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [l, u] = await Promise.all([getLeads(), getCompanyUsers()]);
      setLeads(l); setUsers(u);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = leads.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return l.hotel_name.toLowerCase().includes(q) || l.contact_person.toLowerCase().includes(q) || l.city.toLowerCase().includes(q) || l.mobile.includes(q);
  });

  const handleSave = async () => {
    setError(null);
    if (!form.hotel_name?.trim() && !form.contact_person?.trim()) { setError('Enter at least a hotel name or contact person.'); return; }
    try {
      setSaving(true);
      await saveLead(form, editingId ?? undefined);
      await load(); setShowForm(false); setEditingId(null); setForm(emptyLead);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try { await deleteLead(confirmDelete); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setConfirmDelete(null); }
  };

  const openDetail = async (lead: CrmLead) => {
    setDetailLead(lead);
    const n = await getLeadNotes(lead.id);
    setNotes(n);
  };

  const handleAddNote = async () => {
    if (!detailLead || !newNote.trim()) return;
    try {
      const n = await addLeadNote(detailLead.id, newNote.trim());
      setNotes((prev) => [n, ...prev]);
      setNewNote('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  };

  if (loading) return <LoadingState label="Loading CRM…" />;

  return (
    <div className="space-y-4">
      <PageHeader title="Sales CRM" subtitle={`${leads.length} leads · ${leads.filter((l) => l.status === 'Converted').length} converted`}
        action={<button onClick={() => { setForm(emptyLead); setEditingId(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-4 py-2.5 rounded-xl transition text-sm"><Plus className="w-4 h-4" /> Add Lead</button>}
      />

      {error && <ErrorState message={error} />}

      {/* Search + view toggle */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search leads…"
            className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          <button onClick={() => setView('list')} className={`px-3 py-1.5 rounded text-sm font-semibold ${view === 'list' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}>List</button>
          <button onClick={() => setView('kanban')} className={`px-3 py-1.5 rounded text-sm font-semibold ${view === 'kanban' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}>Pipeline</button>
        </div>
      </div>

      {showForm && (
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-800">{editingId ? 'Edit Lead' : 'New Lead'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <TextInput label="Hotel Name" value={form.hotel_name ?? ''} onChange={(v) => setForm({ ...form, hotel_name: v })} />
            <TextInput label="Contact Person" value={form.contact_person ?? ''} onChange={(v) => setForm({ ...form, contact_person: v })} />
            <TextInput label="Mobile" value={form.mobile ?? ''} onChange={(v) => setForm({ ...form, mobile: v })} />
            <TextInput label="Email" value={form.email ?? ''} onChange={(v) => setForm({ ...form, email: v })} />
            <TextInput label="City" value={form.city ?? ''} onChange={(v) => setForm({ ...form, city: v })} />
            <NumInput label="Rooms" value={form.num_rooms ?? 0} onChange={(v) => setForm({ ...form, num_rooms: v })} />
            <TextInput label="Current Software" value={form.current_software ?? ''} onChange={(v) => setForm({ ...form, current_software: v })} />
            <TextInput label="Lead Source" value={form.lead_source ?? ''} onChange={(v) => setForm({ ...form, lead_source: v })} />
            <TextInput label="Interested Plan" value={form.interested_plan ?? ''} onChange={(v) => setForm({ ...form, interested_plan: v })} />
            <SelectInput label="Assigned Executive" value={form.assigned_exec ?? ''} onChange={(v) => setForm({ ...form, assigned_exec: v || null })}
              options={[{ value: '', label: '— None —' }, ...users.map((u) => ({ value: u.id, label: `${u.name} (${ROLE_LABELS[u.role]})` }))]} />
            <SelectInput label="Status" value={form.status ?? 'New Lead'} onChange={(v) => setForm({ ...form, status: v as LeadStatus })}
              options={LEAD_STATUSES.map((s) => ({ value: s, label: s }))} />
            <TextInput label="Next Follow-up" value={form.next_follow_up ?? ''} onChange={(v) => setForm({ ...form, next_follow_up: v })} type="date" />
            <NumInput label="Estimated Value" value={form.estimated_value ?? 0} onChange={(v) => setForm({ ...form, estimated_value: v })} />
          </div>
          <TextArea label="Notes" value={form.notes ?? ''} onChange={(v) => setForm({ ...form, notes: v })} />
          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm">{saving ? 'Saving…' : 'Save Lead'}</button>
            <button onClick={() => setShowForm(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl text-sm">Cancel</button>
          </div>
        </Card>
      )}

      {/* List view */}
      {view === 'list' && filtered.length === 0 && !showForm ? (
        <EmptyState title="No leads yet" subtitle="Add your first lead to start tracking." />
      ) : view === 'list' ? (
        <div className="hidden lg:block bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 border-b text-left text-xs font-bold text-slate-500 uppercase">
              <th className="px-4 py-3">Hotel / Contact</th><th className="px-4 py-3">City</th><th className="px-4 py-3">Rooms</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Follow-up</th><th className="px-4 py-3">Value</th><th className="px-4 py-3">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(l)}>
                  <td className="px-4 py-3"><p className="font-semibold text-slate-800">{l.hotel_name || l.contact_person}</p><p className="text-xs text-slate-400">{l.contact_person || '—'} · {l.mobile}</p></td>
                  <td className="px-4 py-3 text-slate-600">{l.city || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 tabular-nums">{l.num_rooms || '—'}</td>
                  <td className="px-4 py-3"><Badge color="slate">{l.status}</Badge></td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(l.next_follow_up)}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums">{fmtMoney(l.estimated_value)}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingId(l.id); setForm(l); setShowForm(true); }} className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setConfirmDelete(l.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Mobile cards */}
      {view === 'list' && (
        <div className="lg:hidden space-y-2">
          {filtered.map((l) => (
            <Card key={l.id} className="p-4" >
              <div className="flex items-start justify-between mb-2" onClick={() => openDetail(l)}>
                <div><p className="font-semibold text-slate-800">{l.hotel_name || l.contact_person}</p><p className="text-xs text-slate-400">{l.city} · {l.num_rooms} rooms</p></div>
                <Badge color="slate">{l.status}</Badge>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setEditingId(l.id); setForm(l); setShowForm(true); }} className="flex-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 rounded-lg">Edit</button>
                <button onClick={() => setConfirmDelete(l.id)} className="text-xs bg-red-50 text-red-600 font-semibold py-2 px-3 rounded-lg">Delete</button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Kanban view */}
      {view === 'kanban' && (
        <div className="overflow-x-auto">
          <div className="flex gap-3 min-w-max pb-2">
            {LEAD_STATUSES.map((status) => {
              const statusLeads = filtered.filter((l) => l.status === status);
              return (
                <div key={status} className="w-64 shrink-0">
                  <div className={`px-3 py-2 rounded-t-xl border-b-2 ${LEAD_STATUS_COLORS[status]}`}>
                    <p className="text-xs font-bold uppercase tracking-wide">{status} ({statusLeads.length})</p>
                  </div>
                  <div className="bg-slate-50 rounded-b-xl p-2 space-y-2 min-h-[100px]">
                    {statusLeads.map((l) => (
                      <button key={l.id} onClick={() => openDetail(l)} className="w-full text-left bg-white rounded-lg border border-slate-200 p-3 hover:shadow-md transition">
                        <p className="text-sm font-semibold text-slate-800 truncate">{l.hotel_name || l.contact_person}</p>
                        <p className="text-xs text-slate-400 truncate">{l.city} · {l.num_rooms} rooms</p>
                        {l.estimated_value > 0 && <p className="text-xs font-semibold text-sky-700 mt-1">{fmtMoney(l.estimated_value)}</p>}
                      </button>
                    ))}
                    {statusLeads.length === 0 && <p className="text-xs text-slate-300 text-center py-4">Empty</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lead detail drawer */}
      {detailLead && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div><h3 className="text-lg font-bold text-slate-900">{detailLead.hotel_name || detailLead.contact_person}</h3><p className="text-sm text-slate-500">{detailLead.contact_person} · {detailLead.mobile}</p></div>
              <button onClick={() => setDetailLead(null)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-slate-400">Email</p><p className="font-medium text-slate-700">{detailLead.email || '—'}</p></div>
              <div><p className="text-xs text-slate-400">City</p><p className="font-medium text-slate-700">{detailLead.city || '—'}</p></div>
              <div><p className="text-xs text-slate-400">Rooms</p><p className="font-medium text-slate-700">{detailLead.num_rooms}</p></div>
              <div><p className="text-xs text-slate-400">Status</p><Badge color="slate">{detailLead.status}</Badge></div>
              <div><p className="text-xs text-slate-400">Source</p><p className="font-medium text-slate-700">{detailLead.lead_source || '—'}</p></div>
              <div><p className="text-xs text-slate-400">Value</p><p className="font-medium text-slate-700">{fmtMoney(detailLead.estimated_value)}</p></div>
              <div><p className="text-xs text-slate-400">Follow-up</p><p className="font-medium text-slate-700">{fmtDate(detailLead.next_follow_up)}</p></div>
            </div>
            {detailLead.notes && <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">{detailLead.notes}</div>}
            <div>
              <p className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1"><MessageSquare className="w-4 h-4" /> Notes Timeline</p>
              <div className="flex gap-2 mb-3">
                <input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note…" onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                <button onClick={handleAddNote} className="bg-sky-600 hover:bg-sky-700 text-white font-semibold px-4 py-2 rounded-lg text-sm">Add</button>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {notes.map((n) => (
                  <div key={n.id} className="bg-slate-50 rounded-lg p-2 text-sm">
                    <p className="text-slate-700">{n.note}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{fmtDateTime(n.created_at)}</p>
                  </div>
                ))}
                {notes.length === 0 && <p className="text-xs text-slate-400 text-center py-2">No notes yet</p>}
              </div>
            </div>
          </Card>
        </div>
      )}

      {confirmDelete && <ConfirmDialog title="Delete Lead" message="This will permanently delete the lead and all its notes." confirmLabel="Delete" danger onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />}
    </div>
  );
};
