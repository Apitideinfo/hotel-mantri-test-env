import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Pencil, Trash2, Ticket as TicketIcon, X, MessageSquare } from 'lucide-react';
import { getTickets, getEnterpriseHotels, getCompanyUsers, saveTicket, deleteTicket, getTicketMessages, addTicketMessage } from '../api';
import type { SupportTicket, EnterpriseHotel, CompanyUser, SupportTicketMessage } from '../types';
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '../types';
import { ROLE_LABELS } from '../permissions';
import { PageHeader, Card, Badge, LoadingState, ErrorState, EmptyState, ConfirmDialog, TextInput, SelectInput, TextArea, fmtDate, fmtDateTime, priorityColor } from '../ui';

export const SupportScreen = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [hotels, setHotels] = useState<EnterpriseHotel[]>([]);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [detailTicket, setDetailTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const emptyTicket: Partial<SupportTicket> = { hotel_id: null, reporter: '', category: 'Other', priority: 'Low', status: 'Open', description: '' };
  const [form, setForm] = useState<Partial<SupportTicket>>(emptyTicket);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [t, h, u] = await Promise.all([getTickets(), getEnterpriseHotels(), getCompanyUsers()]);
      setTickets(t); setHotels(h.filter((x) => !x.archived_at)); setUsers(u);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = tickets.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.ticket_number.toLowerCase().includes(q) || t.reporter.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    }
    return true;
  });

  const handleSave = async () => {
    setError(null);
    try {
      setSaving(true);
      await saveTicket(form, editingId ?? undefined);
      await load(); setShowForm(false); setEditingId(null); setForm(emptyTicket);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try { await deleteTicket(confirmDelete); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setConfirmDelete(null); }
  };

  const openDetail = async (t: SupportTicket) => {
    setDetailTicket(t);
    const m = await getTicketMessages(t.id);
    setMessages(m);
  };

  const handleAddMsg = async () => {
    if (!detailTicket || !newMsg.trim()) return;
    try {
      const m = await addTicketMessage(detailTicket.id, newMsg.trim());
      setMessages((prev) => [...prev, m]);
      setNewMsg('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  };

  if (loading) return <LoadingState label="Loading support tickets…" />;

  return (
    <div className="space-y-4">
      <PageHeader title="Support Tickets" subtitle={`${tickets.length} tickets · ${tickets.filter((t) => t.status === 'Open').length} open`}
        action={<button onClick={() => { setForm(emptyTicket); setEditingId(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-4 py-2.5 rounded-xl transition text-sm"><Plus className="w-4 h-4" /> New Ticket</button>}
      />

      {error && <ErrorState message={error} />}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tickets…"
            className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
          <option value="all">All Statuses</option>
          {TICKET_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {showForm && (
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-800">{editingId ? 'Edit Ticket' : 'New Support Ticket'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SelectInput label="Hotel" value={form.hotel_id ?? ''} onChange={(v) => setForm({ ...form, hotel_id: v || null })}
              options={[{ value: '', label: '— None —' }, ...hotels.map((h) => ({ value: h.id, label: h.hotel_name }))]} />
            <TextInput label="Reporter" value={form.reporter ?? ''} onChange={(v) => setForm({ ...form, reporter: v })} />
            <SelectInput label="Category" value={form.category ?? 'Other'} onChange={(v) => setForm({ ...form, category: v })}
              options={TICKET_CATEGORIES.map((c) => ({ value: c, label: c }))} />
            <SelectInput label="Priority" value={form.priority ?? 'Low'} onChange={(v) => setForm({ ...form, priority: v as 'Low' | 'Medium' | 'High' | 'Critical' })}
              options={TICKET_PRIORITIES.map((p) => ({ value: p, label: p }))} />
            <SelectInput label="Status" value={form.status ?? 'Open'} onChange={(v) => setForm({ ...form, status: v as 'Open' | 'In Progress' | 'Waiting for Customer' | 'Resolved' | 'Closed' })}
              options={TICKET_STATUSES.map((s) => ({ value: s, label: s }))} />
            <SelectInput label="Assigned To" value={form.assigned_exec ?? ''} onChange={(v) => setForm({ ...form, assigned_exec: v || null })}
              options={[{ value: '', label: '— Unassigned —' }, ...users.filter((u) => u.role.startsWith('support')).map((u) => ({ value: u.id, label: u.name }))]} />
          </div>
          <TextArea label="Description" value={form.description ?? ''} onChange={(v) => setForm({ ...form, description: v })} />
          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm">{saving ? 'Saving…' : 'Save Ticket'}</button>
            <button onClick={() => setShowForm(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl text-sm">Cancel</button>
          </div>
        </Card>
      )}

      {filtered.length === 0 && !showForm ? (
        <EmptyState title="No tickets found" />
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const hotel = hotels.find((h) => h.id === t.hotel_id);
            return (
              <Card key={t.id} className="p-4 cursor-pointer hover:shadow-md transition" >
                <div className="flex items-start justify-between" onClick={() => openDetail(t)}>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${t.priority === 'Critical' ? 'bg-red-50' : t.priority === 'High' ? 'bg-orange-50' : 'bg-slate-100'}`}>
                      <TicketIcon className={`w-4 h-4 ${t.priority === 'Critical' ? 'text-red-600' : t.priority === 'High' ? 'text-orange-600' : 'text-slate-500'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{t.ticket_number}</p>
                      <p className="text-xs text-slate-500">{t.category} · {hotel?.hotel_name ?? '—'} · {t.reporter || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color={priorityColor(t.priority)}>{t.priority}</Badge>
                    <Badge color="sky">{t.status}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openDetail(t)} className="text-xs text-sky-600 font-medium hover:underline">View Details</button>
                  <button onClick={() => { setEditingId(t.id); setForm(t); setShowForm(true); }} className="p-1 text-slate-400 hover:text-sky-600"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setConfirmDelete(t.id)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail drawer */}
      {detailTicket && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div><h3 className="text-lg font-bold text-slate-900">{detailTicket.ticket_number}</h3><p className="text-sm text-slate-500">{detailTicket.category} · {fmtDate(detailTicket.created_at)}</p></div>
              <button onClick={() => setDetailTicket(null)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-slate-400">Priority</p><Badge color={priorityColor(detailTicket.priority)}>{detailTicket.priority}</Badge></div>
              <div><p className="text-xs text-slate-400">Status</p><Badge color="sky">{detailTicket.status}</Badge></div>
              <div><p className="text-xs text-slate-400">Reporter</p><p className="font-medium text-slate-700">{detailTicket.reporter || '—'}</p></div>
              <div><p className="text-xs text-slate-400">Assigned</p><p className="font-medium text-slate-700">{users.find((u) => u.id === detailTicket.assigned_exec)?.name ?? '—'}</p></div>
            </div>
            {detailTicket.description && <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">{detailTicket.description}</div>}
            {detailTicket.resolution_notes && <div className="bg-emerald-50 rounded-lg p-3 text-sm text-emerald-700"><p className="font-semibold mb-1">Resolution</p>{detailTicket.resolution_notes}</div>}
            <div>
              <p className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1"><MessageSquare className="w-4 h-4" /> Messages</p>
              <div className="flex gap-2 mb-3">
                <input value={newMsg} onChange={(e) => setNewMsg(e.target.value)} placeholder="Type a message…" onKeyDown={(e) => e.key === 'Enter' && handleAddMsg()}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                <button onClick={handleAddMsg} className="bg-sky-600 hover:bg-sky-700 text-white font-semibold px-4 py-2 rounded-lg text-sm">Send</button>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {messages.map((m) => (
                  <div key={m.id} className="bg-slate-50 rounded-lg p-2 text-sm"><p className="text-slate-700">{m.message}</p><p className="text-xs text-slate-400 mt-0.5">{fmtDateTime(m.created_at)}</p></div>
                ))}
                {messages.length === 0 && <p className="text-xs text-slate-400 text-center py-2">No messages yet</p>}
              </div>
            </div>
          </Card>
        </div>
      )}

      {confirmDelete && <ConfirmDialog title="Delete Ticket" message="This will permanently delete the ticket and all messages." confirmLabel="Delete" danger onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />}
    </div>
  );
};
